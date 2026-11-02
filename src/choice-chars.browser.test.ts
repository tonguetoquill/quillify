/**
 * The engine takes `;`, `>` and `|` in an enum value, so a dropdown whose rows
 * hold them is an enum like any other.
 */

import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';
import { expectClosure } from '../test/closure.js';
import { fromTree, render } from '../test/engine.js';
import { quillify, sanitize, suggest } from './index.js';

async function dropdownForm(rows: Record<string, string[]>): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	const form = doc.getForm();
	for (const [n, [name, options]] of Object.entries(rows).entries()) {
		const dropdown = form.createDropdown(name);
		dropdown.addOptions(options);
		dropdown.addToPage(page, { x: 72, y: 700 - 40 * n, width: 200, height: 20 });
	}
	return doc.save({ updateFieldAppearances: false });
}

it('builds a dropdown with ;, > or | in a row as an enum, and renders the row chosen', async () => {
	const rows = {
		Duration: ['Training >20 weeks', 'Other'],
		Plan: ['Plan; act', 'Other'],
		Side: ['Left|right', 'Other'],
		Marks: ['A<B', 'C, D', 'E: F', 'G/H']
	};
	const sanitized = await sanitize(await dropdownForm(rows));
	if (!sanitized.ok) throw new Error(`refused as ${sanitized.refusal.code}`);
	const { form } = sanitized;
	const naming = { name: 'x', description: 'A form.', fields: suggest(form.fields) };

	const quillified = await quillify(form, naming);
	if (!quillified.ok) throw new Error(JSON.stringify(quillified.problems));
	const { ref, quill } = await fromTree(quillified.tree);

	const named = Object.keys(rows).map((pdfName, at) => [pdfName, naming.fields[at].name] as const);
	const { fields } = quill.schema.main;
	for (const [pdfName, name] of named) {
		expect(fields[name].type).toBe('enum');
		expect(fields[name].values).toEqual(rows[pdfName as keyof typeof rows]);
	}

	const example = quill.exampleDocument()!;
	const { payloadItems } = example.main;
	example.free();
	for (const [pdfName, name] of named)
		expect(payloadItems).toContainEqual({
			type: 'field',
			key: name,
			value: rows[pdfName as keyof typeof rows][0]
		});

	const values = named
		.map(([pdfName, name]) => `${name}: ${JSON.stringify(rows[pdfName as keyof typeof rows][0])}\n`)
		.join('');
	const markdown = `~~~\n$quill: ${ref}\n$kind: main\n${values}~~~\n`;
	const rendered = await render(quill, markdown);
	expect(await expectClosure(form.pages, quillified.tree, rendered)).toBe(4);
	const stamped = (await PDFDocument.load(rendered)).getForm();
	for (const [pdfName] of named)
		expect(stamped.getDropdown(pdfName).getSelected()).toEqual([
			rows[pdfName as keyof typeof rows][0]
		]);
}, 60_000);
