/**
 * `SNAKE_CASE` accepts `true`, `false` and `null` as names, and YAML reads
 * each of them, unquoted, as a boolean or a null.
 */

import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';
import { fromTree, render } from '../test/engine.js';
import { viewsOf } from '../test/views.js';
import { assembleQuill } from './assemble.js';
import { stripAcroForm } from './strip.js';
import type { FieldInventory, QualifiedForm } from './types.js';

const FORM: QualifiedForm = {
	quill: { name: 'null', title: 'Null', description: 'Three text fields.' },
	fields: [
		['true', 'first'],
		['false', 'second'],
		['null', 'third']
	].map(([name, example]) => ({
		widget: name,
		name,
		label: name,
		description: '',
		type: 'string',
		multiline: false,
		example,
		keep: true,
		required: false
	}))
};

const INVENTORY: FieldInventory = {
	pages: [{ width: 612, height: 792 }],
	widgets: FORM.fields.map(({ widget }, row) => ({
		id: widget,
		name: widget,
		kind: 'Tx',
		places: [{ page: 0, rect: { x: 72, y: 72 + 36 * row, w: 300, h: 22 } }],
		multiLine: false,
		checkBox: false,
		radioButton: false,
		combo: false,
		options: [],
		readOnly: false,
		required: false,
		maxLen: 0
	}))
};

it('a quill named null with fields named true, false and null loads, fills and renders', async () => {
	const blank = await PDFDocument.create();
	blank.addPage([612, 792]);
	const source = await blank.save();
	const background = await stripAcroForm(source, await viewsOf(source, [[0, 0, 612, 792]]));
	const { quill } = await fromTree(assembleQuill(FORM, INVENTORY, background));

	const example = quill.exampleDocument()!;
	const { payloadItems } = example.main;
	const markdown = example.toMarkdown();
	example.free();
	// A text value is content, its plain text beside its blocks.
	const plain = (text: string) => expect.objectContaining({ codec: 'plain', text });
	expect(payloadItems).toEqual([
		{ type: 'field', key: 'true', value: plain('first') },
		{ type: 'field', key: 'false', value: plain('second') },
		{ type: 'field', key: 'null', value: plain('third') }
	]);

	const stamped = (await PDFDocument.load(await render(quill, markdown))).getForm();
	expect(stamped.getTextField('true').getText()).toBe('first');
	expect(stamped.getTextField('false').getText()).toBe('second');
	expect(stamped.getTextField('null').getText()).toBe('third');
}, 60_000);
