/**
 * The assembled tree through the engine: `Quill.fromTree` accepts it, the
 * acroform backend renders the example document, and the example value lands
 * inside the widget's rect, which is what decides the rect origin
 * `assembleQuill` writes.
 */

import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { fromTree, open } from '../test/engine.js';
import { viewsOf } from '../test/views.js';
import { assembleQuill } from './assemble.js';
import { stripAcroForm } from './strip.js';
import type { FieldInventory, QualifiedForm } from './types.js';

const PAGE_H = 792;
/** Bottom-left PDF space, as pdf-lib places it. */
const NAME_BOX = { x: 200, y: 676, width: 300, height: 22 };
const AGREE_BOX = { x: 200, y: 478, width: 16, height: 16 };

async function sourcePdf(): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, PAGE_H]);
	const font = await doc.embedFont(StandardFonts.Helvetica);
	page.drawText('Full name', { x: 72, y: 681, size: 11, font });
	page.drawText('Agree', { x: 72, y: 483, size: 11, font });
	const form = doc.getForm();
	form.createTextField('FullName').addToPage(page, NAME_BOX);
	form.createCheckBox('Agree').addToPage(page, AGREE_BOX);
	return doc.save({ useObjectStreams: false });
}

const topLeft = (b: typeof NAME_BOX) => ({
	x: b.x,
	y: PAGE_H - b.y - b.height,
	w: b.width,
	h: b.height
});

const INVENTORY: FieldInventory = {
	pages: [{ width: 612, height: PAGE_H }],
	widgets: [
		{
			id: 'FullName',
			name: 'FullName',
			kind: 'Tx',
			places: [{ page: 0, rect: topLeft(NAME_BOX) }],
			multiLine: false,
			checkBox: false,
			radioButton: false,
			combo: false,
			options: [],
			readOnly: false,
			required: false,
			maxLen: 0
		},
		{
			id: 'Agree',
			name: 'Agree',
			kind: 'Btn',
			places: [{ page: 0, rect: topLeft(AGREE_BOX) }],
			multiLine: false,
			checkBox: true,
			radioButton: false,
			combo: false,
			options: [],
			readOnly: false,
			required: false,
			maxLen: 0
		}
	]
};

const FORM: QualifiedForm = {
	quill: { name: 'probe_form', title: 'Probe form', description: 'Engine probe.' },
	fields: [
		{
			widget: 'FullName',
			name: 'full_name',
			label: 'Full name',
			description: 'Full legal name.',
			type: 'string',
			multiline: false,
			example: 'MMMMMMMMMMMMMMMMMMMM',
			keep: true,
			required: false
		},
		{
			widget: 'Agree',
			name: 'agree',
			label: 'Agree',
			description: 'Agrees to the terms.',
			type: 'boolean',
			multiline: false,
			keep: true,
			required: false
		}
	]
};

/** Fraction of pixels darker than mid-gray inside a top-left rect of a 72 ppi raster. */
function inkFraction(
	ctx: CanvasRenderingContext2D,
	rect: { x: number; y: number; w: number; h: number }
) {
	const { data } = ctx.getImageData(
		Math.round(rect.x),
		Math.round(rect.y),
		Math.round(rect.w),
		Math.round(rect.h)
	);
	let dark = 0;
	for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 384) dark++;
	return dark / (data.length / 4);
}

describe('assembled acroform quill', () => {
	it('loads, seeds with $quill, and paints the example inside its widget rect', async () => {
		const source = await sourcePdf();
		const background = await stripAcroForm(source, await viewsOf(source, [[0, 0, 612, PAGE_H]]));
		const tree = assembleQuill(FORM, INVENTORY, background);
		const { ref, quill } = await fromTree(tree);
		expect(ref).toBe('probe_form@0.1.0');
		expect(quill.backendId).toBe('acroform');

		const example = quill.exampleDocument()!;
		const markdown = example.toMarkdown();
		expect(markdown).toContain('$quill: probe_form@0.1\n');
		expect(markdown).toContain('full_name: MMMMMMMMMMMMMMMMMMMM');

		const session = await open(quill, example);
		const ctx = document.createElement('canvas').getContext('2d')!;
		session.paint(ctx, 0, 1);
		session.free();
		example.free();
		const inName = inkFraction(ctx, topLeft(NAME_BOX));
		const below = inkFraction(ctx, { ...topLeft(NAME_BOX), y: topLeft(NAME_BOX).y + 40 });
		expect(inName).toBeGreaterThan(0.05);
		expect(below).toBe(0);
	}, 60_000);

	it('builds a dropdown without its blank row, and one with no other row as a text box', async () => {
		const choice = (id: string, options: string[]) => ({
			...INVENTORY.widgets[0],
			id,
			name: id,
			kind: 'Ch' as const,
			combo: true,
			options
		});
		const field = (widget: string, name: string, options: string[]) => ({
			widget,
			name,
			label: widget,
			description: `${widget}.`,
			type: 'enum' as const,
			multiline: false,
			options,
			keep: true,
			required: false
		});
		const form: QualifiedForm = {
			quill: { ...FORM.quill, name: 'blank_row_form' },
			fields: [field('Grade', 'grade', ['', 'O-1', 'O-2']), field('Unit', 'unit', [''])]
		};
		const source = await sourcePdf();
		const tree = assembleQuill(
			form,
			{ ...INVENTORY, widgets: [choice('Grade', ['', 'O-1', 'O-2']), choice('Unit', [''])] },
			await stripAcroForm(source, await viewsOf(source, [[0, 0, 612, PAGE_H]]))
		);

		const { quill } = await fromTree(tree);

		const yaml = new TextDecoder().decode(tree.get('Quill.yaml'));
		expect(yaml).toContain(
			'      "grade":\n        type: enum\n        values:\n          - "O-1"\n          - "O-2"\n'
		);
		expect(yaml).toContain('      "unit":\n        type: text\n');
		expect(quill.backendId).toBe('acroform');
	}, 60_000);
});
