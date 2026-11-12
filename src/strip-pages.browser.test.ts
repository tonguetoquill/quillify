/**
 * The inventory measures each field in pdf.js's view of its page, and the
 * background's page is that view. A file whose pages pdf.js and pdf-lib read
 * differently has no background the inventory fits, and is refused.
 */

import { PDFDocument, PDFName, PDFNumber, type PDFPage } from 'pdf-lib';
import { expect, it } from 'vitest';
import { expectClosure } from '../test/closure.js';
import { fromTree, render } from '../test/engine.js';
import { quillify, sanitize, suggest } from './index.js';

const BOX = { x: 72, y: 700, width: 200, height: 20 };
type Plant = (page: PDFPage) => void;

/** A 612 by 792 page with one text field, 72 from its left edge and 72 from its top, then whatever `plant` does to it. */
async function sheet(plant: Plant): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	doc
		.getForm()
		.createTextField('unit')
		.addToPage(page, { ...BOX, borderWidth: 0 });
	plant(page);
	return doc.save({ useObjectStreams: false });
}

async function taken(source: Uint8Array) {
	const sanitized = await sanitize(source);
	if (!sanitized.ok) throw new Error(`refused as ${sanitized.refusal.code}`);
	return sanitized.form;
}

/** Each page's boxes in a background, as the numbers the file holds. */
async function boxes(background: Uint8Array) {
	const doc = await PDFDocument.load(background);
	const numbers = (page: PDFPage, key: string) =>
		page.node
			.lookup(PDFName.of(key))
			?.toString()
			.match(/-?[\d.]+/g)
			?.map(Number);
	return doc
		.getPages()
		.map((page) => ({ media: numbers(page, 'MediaBox'), crop: numbers(page, 'CropBox') }));
}

const crop =
	(box: number[]): Plant =>
	({ node, doc }) =>
		node.set(PDFName.of('CropBox'), doc.context.obj(box));
const cropOfTree =
	(box: number[]): Plant =>
	({ doc }) =>
		doc.catalog.Pages().set(PDFName.of('CropBox'), doc.context.obj(box));
const media =
	(box: number[]): Plant =>
	({ node, doc }) =>
		node.set(PDFName.of('MediaBox'), doc.context.obj(box));

it('stamps a field on its box when the crop box reaches past the media box on the left and the top', async () => {
	const form = await taken(await sheet(crop([-50, 0, 612, 842])));
	expect(form.fields[0].places).toEqual([
		{ page: 0, rect: { x: 72, y: 72, w: 200, h: 20 }, fontSize: 16 }
	]);

	const quillified = await quillify(form, {
		name: 'overhang',
		description: 'One text field.',
		fields: suggest(form.fields).map((entry) => ({ ...entry, example: 'x' }))
	});
	if (!quillified.ok) throw new Error(JSON.stringify(quillified.problems));
	const { quill } = await fromTree(quillified.tree);
	const example = quill.exampleDocument()!;
	const markdown = example.toMarkdown();
	example.free();
	expect(await expectClosure(form.pages, quillified.tree, await render(quill, markdown))).toBe(1);
}, 60_000);

it.each([
	['crop box reaches past its media box', crop([-50, 0, 612, 842]), [0, 0, 612, 792]],
	['crop box lies inside its media box', crop([50, 40, 562, 752]), [50, 40, 562, 752]],
	['crop box lies wholly outside its media box', crop([700, 800, 900, 1000]), [0, 0, 612, 792]],
	['crop box is written from its far corner', crop([562, 752, 50, 40]), [50, 40, 562, 752]],
	[
		'crop box is a number',
		({ node }: PDFPage) => node.set(PDFName.of('CropBox'), PDFNumber.of(5)),
		[0, 0, 612, 792]
	],
	['crop box has three entries', crop([0, 0, 612]), [0, 0, 612, 792]],
	["crop box is its page tree's", cropOfTree([0, 0, 300, 400]), [0, 0, 300, 400]],
	['media box is empty', media([0, 0, 0, 0]), [0, 0, 612, 792]],
	[
		'page tree has a crop box beside its own',
		(page: PDFPage) => {
			crop([50, 40, 562, 752])(page);
			cropOfTree([0, 0, 100, 100])(page);
		},
		[50, 40, 562, 752]
	]
])(
	'frames the background as pdf.js views a page whose %s',
	async (_, plant, view) => {
		const form = await taken(await sheet(plant));
		expect(await boxes(form.pdf)).toEqual([{ media: view, crop: undefined }]);
		expect(form.pages).toEqual([{ width: view[2] - view[0], height: view[3] - view[1] }]);
		expect(form.fields[0].places).toEqual([
			{ page: 0, rect: { x: 72 - view[0], y: view[3] - 720, w: 200, h: 20 }, fontSize: 16 }
		]);
	},
	60_000
);

const byReference: Plant = ({ node, doc }) =>
	node.set(PDFName.of('Type'), doc.context.register(PDFName.of('Page')));
const countOf =
	(pages: number): Plant =>
	({ doc }) =>
		doc.catalog.Pages().set(PDFName.of('Count'), PDFNumber.of(pages));

it.each<[string, number, Plant]>([
	['two pages whose second names its /Type by reference', 2, byReference],
	[
		'three pages whose second names its /Type by reference, under a /Count of 2',
		3,
		(second) => {
			byReference(second);
			countOf(2)(second);
		}
	],
	['three pages under a /Count of 2', 3, countOf(2)]
])(
	'refuses as damaged a file of %s',
	async (_, pages, plant) => {
		const doc = await PDFDocument.create();
		const [, second] = Array.from({ length: pages }, () => doc.addPage([612, 792]));
		doc.getForm().createTextField('unit').addToPage(second, BOX);
		plant(second);

		expect(await sanitize(await doc.save({ useObjectStreams: false }))).toEqual({
			ok: false,
			refusal: { code: 'damaged' }
		});
	},
	60_000
);
