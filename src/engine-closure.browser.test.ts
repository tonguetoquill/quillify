import { expect, it } from 'vitest';
import { expectClosure } from '../test/closure.js';
import { fromTree, render } from '../test/engine.js';
import { quillify, sanitize, suggest } from './index.js';

const fixtures = import.meta.glob<string>('../test/fixtures/*.pdf', {
	query: '?url',
	import: 'default',
	eager: true
});

for (const [path, url] of Object.entries(fixtures)) {
	const form = path.slice(path.lastIndexOf('/') + 1).split(/[_.]/)[0];
	it(`${form} renders with every Form.yaml entry where it was placed, and no other field`, async () => {
		const sanitized = await sanitize(new Uint8Array(await (await fetch(url)).arrayBuffer()));
		if (!sanitized.ok) throw new Error(`refused as ${sanitized.refusal.code}`);
		const { pages, fields: read } = sanitized.form;
		// suggest keeps every field a person can fill. Each text field gets a value to stamp.
		const naming = suggest(read).map((entry, index) => ({
			...entry,
			...(read[index].kind === 'text' ? { example: 'x' } : {})
		}));
		const quillified = await quillify(sanitized.form, {
			name: 'closure',
			description: 'Every field of a fixture that a person can fill.',
			fields: naming
		});
		if (!quillified.ok) throw new Error(JSON.stringify(quillified.problems));

		const { quill } = await fromTree(quillified.tree);
		const example = quill.exampleDocument()!;
		const markdown = example.toMarkdown();
		example.free();
		const placed = await expectClosure(pages, quillified.tree, await render(quill, markdown));
		expect(placed).toBe(
			read
				.filter((field) => !field.readOnly)
				.reduce((count, field) => count + field.places.length, 0)
		);
	}, 120_000);
}
