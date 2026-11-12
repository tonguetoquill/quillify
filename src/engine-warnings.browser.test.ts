import { expect, it } from 'vitest';
import { fromTree } from '../test/engine.js';
import { quillify, sanitize, suggest } from './index.js';

const fixtures = import.meta.glob<string>('../test/fixtures/*.pdf', {
	query: '?url',
	import: 'default',
	eager: true
});

for (const [path, url] of Object.entries(fixtures)) {
	const form = path.slice(path.lastIndexOf('/') + 1).split(/[_.]/)[0];
	it(`${form} loads with no engine warning, its fields in the naming's order`, async () => {
		const sanitized = await sanitize(new Uint8Array(await (await fetch(url)).arrayBuffer()));
		if (!sanitized.ok) throw new Error(`refused as ${sanitized.refusal.code}`);
		const naming = suggest(sanitized.form.fields);
		const quillified = await quillify(sanitized.form, {
			name: 'warnings',
			description: 'Every field of a fixture that a person can fill.',
			fields: naming
		});
		if (!quillified.ok) throw new Error(JSON.stringify(quillified.problems));

		const { quill } = await fromTree(quillified.tree);
		expect(quill.warnings).toEqual([]);
		// A signature is a widget of Form.yaml, not a field of the schema.
		const byId = new Map(sanitized.form.fields.map((field) => [field.id, field]));
		const filled = naming.filter(
			({ id, keep }) => keep && !byId.get(id)!.readOnly && byId.get(id)!.kind !== 'signature'
		);
		// Fields that share a name are one field of the schema, where the first of them is.
		expect(Object.keys(quill.schema.main.fields)).toEqual([
			...new Set(filled.map(({ name }) => name))
		]);
	}, 120_000);
}
