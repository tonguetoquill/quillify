/**
 * Why the library refuses a page that still carries /Rotate after qpdf. The
 * engine rejects such a page when it renders, and the refusal in `inventory.ts`
 * states that limit early, where it can name the page. This pins the engine
 * behavior it stands on, so a renderer that later handles rotation shows up as
 * a failure here.
 */

import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { fromTree, render } from '../test/engine.js';
import { viewsOf } from '../test/views.js';
import { assembleQuill } from './assemble.js';
import { toTopLeftRect } from './coords.js';
import { stripAcroForm } from './strip.js';
import type { FieldInventory, QualifiedForm, Rect } from './types.js';

const W = 612;
const H = 792;
/** Bottom-left PDF space, as pdf-lib places it. */
const BOX = { x: 120, y: 400, width: 300, height: 24 };
const VIEW: [number, number, number, number] = [0, 0, W, H];

async function rotatedSource(): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const page = doc.addPage([W, H]);
	page.setRotation(degrees(90));
	const font = await doc.embedFont(StandardFonts.Helvetica);
	page.drawText('Unit', { x: 120, y: 432, size: 11, font });
	doc.getForm().createTextField('Unit').addToPage(page, BOX);
	return doc.save({ useObjectStreams: false });
}

/** Where a reader sees the widget once the viewer applies /Rotate 90. */
const EXPECTED: Rect = toTopLeftRect(
	[BOX.x, BOX.y, BOX.x + BOX.width, BOX.y + BOX.height],
	VIEW,
	90
);

const INVENTORY: FieldInventory = {
	// A rotated page presents its axes swapped.
	pages: [{ width: H, height: W }],
	widgets: [
		{
			id: 'Unit',
			name: 'Unit',
			kind: 'Tx',
			places: [{ page: 0, rect: EXPECTED }],
			multiLine: false,
			checkBox: false,
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
	quill: { name: 'rotated_form', title: 'Rotated', description: 'A landscape form.' },
	fields: [
		{
			widget: 'Unit',
			name: 'unit',
			label: 'Unit',
			description: 'Issuing unit.',
			type: 'string',
			multiline: false,
			example: 'MMMMMMMMMMMMMMMMMMMM',
			keep: true,
			required: false
		}
	]
};

describe('a rotated page', () => {
	it('is refused by the renderer, which is what the importer refuses early', async () => {
		const source = await rotatedSource();
		const background = await stripAcroForm(source, await viewsOf(source, [VIEW]));
		const tree = assembleQuill(FORM, INVENTORY, background);
		const { quill } = await fromTree(tree);
		const seed = quill.seedDocument();
		const markdown = seed.toMarkdown();
		seed.free();

		await expect(render(quill, markdown)).rejects.toThrow(/Rotate/);
	}, 60_000);

	it('reports the widget in the frame a reader sees, so the rects are ready if that changes', () => {
		// A landscape reading of a 612x792 page: the widget's x comes from its y.
		expect(EXPECTED.w).toBeCloseTo(BOX.height, 5);
		expect(EXPECTED.h).toBeCloseTo(BOX.width, 5);
		expect(EXPECTED.x).toBeCloseTo(BOX.y, 5);
		expect(EXPECTED.y).toBeCloseTo(BOX.x, 5);
	});
});
