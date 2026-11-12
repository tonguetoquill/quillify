import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';
import { expect } from 'vitest';
import { toTopLeftRect } from '../src/coords.js';
import type { Rect, Size } from '../src/index.js';

type Box = [x0: number, y0: number, x1: number, y1: number];

/** The part of `qpdf --json=2` this reads. */
interface QpdfJson {
	acroform: {
		fields: { fullname: string; pageposfrom1: number; annotation: { object: string } }[];
	};
	pages: { object: string }[];
	qpdf: [unknown, Record<string, { value: { '/Rect': Box; '/MediaBox': Box } }>];
}

interface Qpdf {
	callMain(args: string[]): number;
	FS: {
		writeFile(path: string, data: Uint8Array): void;
		readFile(path: string, options: { encoding: 'utf8' }): string;
	};
}

const qpdf = import('@neslinesli93/qpdf-wasm').then((mod) =>
	(mod.default as unknown as (options: { locateFile: () => string }) => Promise<Qpdf>)({
		locateFile: () => wasmUrl
	})
);

/** Each form field of a PDF with its page, its rect and that page's media box, in PDF space. */
async function stamped(pdf: Uint8Array) {
	const { callMain, FS } = await qpdf;
	FS.writeFile('/stamped.pdf', pdf);
	callMain([
		'--json=2',
		'--json-key=acroform',
		'--json-key=pages',
		'--json-key=qpdf',
		'/stamped.pdf',
		'/stamped.json'
	]);
	const out: QpdfJson = JSON.parse(FS.readFile('/stamped.json', { encoding: 'utf8' }));
	const dict = (ref: string) => out.qpdf[1][`obj:${ref}`].value;
	return out.acroform.fields.map((field) => ({
		name: field.fullname,
		page: field.pageposfrom1 - 1,
		rect: dict(field.annotation.object)['/Rect'],
		mediaBox: dict(out.pages[field.pageposfrom1 - 1].object)['/MediaBox']
	}));
}

/**
 * What `quillify` writes in `Form.yaml` is what the engine stamps: every entry
 * is in the rendered PDF under the same name, on the same page and at the same
 * rect, on a page the size `sanitize` measured, and the PDF has no field
 * `Form.yaml` does not name. qpdf reads the stamped fields back. The number of
 * entries is returned, for a caller that knows how many there should be.
 */
export async function expectClosure(
	pages: readonly Size[],
	tree: ReadonlyMap<string, Uint8Array>,
	rendered: Uint8Array
): Promise<number> {
	const { fields, widgets }: Record<string, { name: string; page: number; rect: Rect }[]> =
		JSON.parse(new TextDecoder().decode(tree.get('Form.yaml')));
	const placed = [...fields, ...widgets];
	const found = await stamped(rendered);

	expect(found.map((field) => field.name).sort()).toEqual(placed.map((entry) => entry.name).sort());
	for (const { name, page, rect } of placed) {
		const got = found.find((field) => field.name === name)!;
		expect(got.page, name).toBe(page);
		// The engine's page is the one sanitize measured, or a rect means nothing.
		const [x0, y0, x1, y1] = got.mediaBox;
		expect(x1 - x0, `${name} page width`).toBeCloseTo(pages[page].width, 3);
		expect(y1 - y0, `${name} page height`).toBeCloseTo(pages[page].height, 3);
		const read = toTopLeftRect(got.rect, got.mediaBox, 0);
		for (const side of ['x', 'y', 'w', 'h'] as const)
			expect(Math.abs(read[side] - rect[side]), `${name} ${side}`).toBeLessThanOrEqual(0.01);
	}
	return placed.length;
}
