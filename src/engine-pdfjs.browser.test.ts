import { expect, it } from 'vitest';
import { fromTree, render } from '../test/engine.js';
import { quillify, sanitize, suggest } from './index.js';
import { openPdf } from './pdfjs.js';

const fixtures = import.meta.glob<string>('../test/fixtures/*.pdf', {
	query: '?url',
	import: 'default',
	eager: true
});

/** What pdf.js tells its scripting sandbox about one widget. */
interface FieldObject {
	type: string;
	value: unknown;
	editable?: boolean;
	hidden?: boolean;
	actions?: unknown;
}

for (const [path, url] of Object.entries(fixtures)) {
	const form = path.slice(path.lastIndexOf('/') + 1).split(/[_.]/)[0];
	it(`${form}, filled, is a form pdf.js can fill, with no XFA, lock or document script`, async () => {
		const sanitized = await sanitize(new Uint8Array(await (await fetch(url)).arrayBuffer()));
		if (!sanitized.ok) throw new Error(`refused as ${sanitized.refusal.code}`);
		const { pages, fields: read } = sanitized.form;
		const naming = suggest(read).map((entry, index) => ({
			...entry,
			...(read[index].kind === 'text' ? { example: 'x' } : {})
		}));
		const quillified = await quillify(sanitized.form, {
			name: 'reader',
			description: 'Every field of a fixture that a person can fill.',
			fields: naming
		});
		if (!quillified.ok) throw new Error(JSON.stringify(quillified.problems));
		const { quill } = await fromTree(quillified.tree);
		const example = quill.exampleDocument()!;
		const markdown = example.toMarkdown();
		example.free();

		const { pdf, close } = await openPdf(await render(quill, markdown));
		try {
			expect(pdf.numPages).toBe(pages.length);

			const { info } = await pdf.getMetadata();
			expect(info).toMatchObject({
				IsAcroFormPresent: true,
				IsXFAPresent: false,
				EncryptFilterName: null
			});
			expect(await pdf.getPermissions()).toBeNull();
			expect(await pdf.getJSActions()).toBeNull();
			expect(await pdf.getOpenAction()).toBeNull();
			const first = await (await pdf.getPage(1)).getTextContent();
			expect(first.items.map((item) => ('str' in item ? item.str : '')).join(' ')).not.toContain(
				'Please wait'
			);

			const stamped = (await pdf.getFieldObjects()) as unknown as Map<string, FieldObject[]>;
			const objects = [...stamped.values()].flat();
			const kept = read.filter((field) => !field.readOnly);
			expect(objects).toHaveLength(kept.reduce((count, field) => count + field.places.length, 0));
			expect(objects.filter((object) => object.hidden || object.actions)).toEqual([]);
			// pdf.js reports no `editable` for a signature field.
			expect(objects.filter((object) => object.type !== 'signature' && !object.editable)).toEqual(
				[]
			);
			// A field painted in two places is two widgets, and `Form.yaml` names each.
			const typed = new Set(naming.filter((entry) => entry.example).map((entry) => entry.name));
			const placed: { name: string; schema_field: string }[] = JSON.parse(
				new TextDecoder().decode(quillified.tree.get('Form.yaml'))
			).fields;
			for (const { name, schema_field } of placed)
				if (typed.has(schema_field))
					expect(stamped.get(name), name).toMatchObject([{ type: 'text', value: 'x' }]);
		} finally {
			await close();
			quill.free();
		}
	}, 120_000);
}
