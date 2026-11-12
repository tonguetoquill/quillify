import {
	PDFAcroCheckBox,
	PDFAcroComboBox,
	PDFAcroRadioButton,
	PDFAcroText,
	PDFCheckBox,
	PDFDocument,
	PDFDropdown,
	PDFFont,
	PDFField,
	PDFHexString,
	PDFName,
	PDFOperator,
	PDFOperatorNames,
	PDFPage,
	PDFRadioGroup,
	PDFTextField,
	StandardFonts,
	degrees,
	rgb
} from 'pdf-lib';
import type { PDFAcroField, PDFRef } from 'pdf-lib';
import {
	displayList,
	type Box,
	type Colour,
	type DisplayList,
	type Drawn,
	type Edge,
	type Run
} from './display-list.js';
import { openPdf } from './pdfjs.js';
import { Refused } from './refusal.js';
import { MAX_PAGES, MAX_PICTURE_PIXELS } from './types.js';
import { XfaStage } from './xfa-layer.js';
import { harvestWidgets, type XfaWidget } from './xfa-widgets.js';

/**
 * A dynamic Adobe LiveCycle form as an ordinary static AcroForm, or the input
 * unchanged when it is not one.
 *
 * In a dynamic form the fields exist only as XML inside `/AcroForm /XFA`:
 * `/Fields` is empty, and the one page in the file is a placeholder, most often
 * a "Please wait" notice. Converting one takes an XFA layout engine, and pdf.js
 * has one. This runs it, reads the geometry the browser solved off the DOM, and
 * writes both the printed page and the fields back out as a PDF the later
 * stages already take.
 *
 * It is a normalization: bytes in, bytes out, and every later stage reads the
 * result as it reads a static form.
 */
export async function xfaToAcroForm(bytes: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
	const stage = new XfaStage();
	let opened: Awaited<ReturnType<typeof openPdf>> | undefined;
	try {
		// pdf.js adds the faces a form embeds to this document's font set.
		opened = await openPdf(bytes, { enableXfa: true, ownerDocument: await stage.ready }, signal);
		const { pdf, within } = opened;
		if (!pdf.isPureXfa) return bytes;
		// pdf.js counts a dynamic form's pages as it opens the file.
		if (pdf.numPages > MAX_PAGES)
			throw new Refused({ code: 'too_many_pages', pages: pdf.numPages, limit: MAX_PAGES });
		const out = await PDFDocument.create();
		const fonts = new Map<StandardFonts, PDFFont>();
		const widgets: XfaWidget[] = [];
		let pixels = 0;

		for (let number = 1; number <= pdf.numPages; number++) {
			const laid = await within(pdf.getPage(number).then((page) => stage.lay(page)));
			// The shipped worker writes a span of one of these classes where the page's
			// text embeds a page number or a page count that a layout script fills.
			for (const span of laid.layer.querySelectorAll('.xfaPageNumber'))
				span.textContent = String(number);
			for (const span of laid.layer.querySelectorAll('.xfaPageCount'))
				span.textContent = String(pdf.numPages);
			const list = displayList(laid, number);
			for (const item of list.drawn)
				if ('image' in item) pixels += item.image.naturalWidth * item.image.naturalHeight;
			if (pixels > MAX_PICTURE_PIXELS)
				throw new Refused({
					code: 'unpaintable',
					page: number - 1,
					construct: 'image',
					detail: 'pixels'
				});
			const harvested = harvestWidgets(laid, number);
			for (const widget of harvested) widgets.push(widget);
			const shown = whiten(list, harvested);
			await paint(out.addPage([list.width, list.height]), number, shown, async (name) => {
				let font = fonts.get(name);
				if (!font) fonts.set(name, (font = await out.embedFont(name)));
				return font;
			});
		}

		stamp(out, widgets);
		// Saving would write the size pdf-lib fits to a box into a `/DA` that asks for auto size,
		// and the inventory would read it as the form's.
		return await out.save({ updateFieldAppearances: false });
	} finally {
		stage.close();
		await opened?.close();
	}
}

/**
 * The engine fills every field in black, whatever colour the form gives its
 * text. A field whose middle lies on a fill that black reads on at under 4.5:1,
 * WCAG's floor for text, gets a white box drawn just over that fill.
 */
function whiten(list: DisplayList, widgets: XfaWidget[]): DisplayList {
	const drawn = [...list.drawn];
	const filled = (item: Drawn): item is Box & { fill: Colour } =>
		'edges' in item && item.fill !== null;
	for (const { x, y, w, h } of widgets) {
		const [u, v] = [x + w / 2, y + h / 2];
		const at = drawn.findLastIndex(
			(item) =>
				filled(item) && item.x <= u && u <= item.x + item.w && item.y <= v && v <= item.y + item.h
		);
		const under = drawn[at];
		if (at >= 0 && filled(under) && (luminance(under.fill) + 0.05) / 0.05 < 4.5)
			drawn.splice(at + 1, 0, { x, y, w, h, fill: [1, 1, 1], edges: [null, null, null, null] });
	}
	return { ...list, drawn };
}

/** The relative luminance WCAG gives a colour in sRGB. */
function luminance(colour: Colour): number {
	const [r, g, b] = colour.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** PDF's origin is bottom-left; every primitive arrives top-left. */
async function paint(
	page: PDFPage,
	pageNumber: number,
	list: DisplayList,
	font: (name: StandardFonts) => Promise<PDFFont>
): Promise<void> {
	const H = list.height;
	for (const item of list.drawn) {
		if ('text' in item) {
			await drawRun(page, pageNumber, item, H, font);
			continue;
		}
		if ('image' in item) {
			const { x, y, w, h, image } = item;
			// The pixels are read off a canvas of the host page's. The frame's policy
			// governs what its document loads, and the picture is of the page's origin.
			const canvas = document.createElement('canvas');
			canvas.width = image.naturalWidth;
			canvas.height = image.naturalHeight;
			canvas.getContext('2d')!.drawImage(image, 0, 0);
			const png = canvas.toDataURL('image/png');
			// What a canvas with a side the browser will not make gives.
			if (png === 'data:,')
				throw new Refused({ code: 'unpaintable', page: pageNumber - 1, construct: 'image' });
			page.drawImage(await page.doc.embedPng(png), { x, y: H - y - h, width: w, height: h });
			continue;
		}
		if ('x1' in item) {
			page.drawLine({
				start: { x: item.x1, y: H - item.y1 },
				end: { x: item.x2, y: H - item.y2 },
				thickness: item.width,
				color: rgb(...item.colour)
			});
			continue;
		}
		let box = item;
		if (box.radius) {
			// An SVG rect's outline runs along the middle of its stroke, and each
			// radius stops at half the side it lies along.
			const [edge] = box.edges;
			const inset = (edge?.width ?? 0) / 2;
			const w = box.w - 2 * inset;
			const h = box.h - 2 * inset;
			const rx = Math.min(box.radius, w / 2);
			const ry = Math.min(box.radius, h / 2);
			const turn = `a ${rx},${ry} 0 0 1`;
			page.drawSvgPath(
				`M ${rx},0 h ${w - 2 * rx} ${turn} ${rx},${ry} v ${h - 2 * ry} ${turn} ${-rx},${ry} h ${2 * rx - w} ${turn} ${-rx},${-ry} v ${2 * ry - h} ${turn} ${rx},${-ry} z`,
				{
					x: box.x + inset,
					y: H - box.y - inset,
					color: box.fill ? rgb(...box.fill) : undefined,
					borderColor: edge ? rgb(...edge.colour) : undefined,
					borderWidth: edge?.width
				}
			);
			continue;
		}
		// The browser paints a box from a whole pixel to a whole pixel, and fits
		// the gap of a dashed edge to the length that leaves it.
		if (box.edges.some((edge) => edge?.dashed)) {
			const [x, y] = [Math.round(box.x), Math.round(box.y)];
			box = { ...box, x, y, w: Math.round(box.x + box.w) - x, h: Math.round(box.y + box.h) - y };
		}
		if (box.fill)
			page.drawRectangle({
				x: box.x,
				y: H - box.y - box.h,
				width: box.w,
				height: box.h,
				color: rgb(...box.fill),
				borderWidth: 0
			});
		const [top, right, bottom, left] = box.edges;
		const seg = (x1: number, y1: number, x2: number, y2: number, edge: Edge) =>
			page.drawLine({
				start: { x: x1, y: H - y1 },
				end: { x: x2, y: H - y2 },
				thickness: edge.width,
				color: rgb(...edge.colour),
				dashArray: edge.dashed ? dashes(edge.width, x2 - x1 + y2 - y1) : undefined
			});
		if (top) seg(box.x, box.y + top.width / 2, box.x + box.w, box.y + top.width / 2, top);
		if (bottom)
			seg(
				box.x,
				box.y + box.h - bottom.width / 2,
				box.x + box.w,
				box.y + box.h - bottom.width / 2,
				bottom
			);
		if (left) seg(box.x + left.width / 2, box.y, box.x + left.width / 2, box.y + box.h, left);
		if (right)
			seg(
				box.x + box.w - right.width / 2,
				box.y,
				box.x + box.w - right.width / 2,
				box.y + box.h,
				right
			);
	}
}

/**
 * The dash and the gap the browser paints along a dashed edge, or nothing for
 * an edge it paints whole. A dash is three widths and a gap two for an edge
 * under 3 px wide, and two and one from there. An edge too short for two
 * dashes is whole, and one too short for two dashes and a whole gap has both
 * shortened alike. On any other the gap is fitted so that the edge starts and
 * ends on a whole dash: of the two counts of dashes its length lies between,
 * it has the one whose gap is nearer.
 */
function dashes(width: number, length: number): [number, number] | undefined {
	const [dash, gap] = width < 3 ? [3 * width, 2 * width] : [2 * width, width];
	if (length <= 2 * dash) return undefined;
	const short = length / (2 * dash + gap);
	if (short <= 1) return [dash * short, gap * short];
	const count = Math.floor((length + gap) / (dash + gap));
	const fit = (dashes: number) => (length - dashes * dash) / (dashes - 1);
	const [wide, narrow] = [fit(count), fit(count + 1)];
	return [dash, narrow <= 0 || Math.abs(wide - gap) < Math.abs(narrow - gap) ? wide : narrow];
}

/** The standard fonts that hold what the text fonts lack, in the order a character is looked for. */
const SYMBOLS = [StandardFonts.Symbol, StandardFonts.ZapfDingbats];

async function drawRun(
	page: PDFPage,
	pageNumber: number,
	run: Run,
	H: number,
	get: (name: StandardFonts) => Promise<PDFFont>
): Promise<void> {
	const font = await get(standard14(run));
	// The standard-14 text fonts encode WinAnsi alone. U+2010 and U+2011 are
	// drawn as its hyphen, and any other character outside it in the first of
	// SYMBOLS that holds it. A soft hyphen is left out: WinAnsi has it as a
	// hyphen, and the browser lays it out at no width and shows nothing. The
	// one it breaks a line at is a hyphen in the run already.
	// Dropping the run would lose a line of the form without anything
	// reporting it.
	// pdf-lib kerns the width it measures and writes no kerning, so the width
	// it draws a run at is the sum of the widths of its characters.
	const parts: { font: PDFFont; text: string; at: number }[] = [];
	let natural = 0;
	for (const char of run.text.replaceAll('\u00ad', '').replace(/[\u2010\u2011]/g, '-')) {
		const code = char.codePointAt(0)!;
		let face = font;
		for (const name of SYMBOLS) if (!face.getCharacterSet().includes(code)) face = await get(name);
		if (!face.getCharacterSet().includes(code))
			throw new Refused({
				code: 'unpaintable',
				page: pageNumber - 1,
				construct: 'glyph',
				detail: run.text.slice(0, 40)
			});
		const last = parts.at(-1);
		if (last?.font === face) last.text += char;
		else parts.push({ font: face, text: char, at: natural });
		natural += face.widthOfTextAtSize(char, run.size) + run.letterSpacing;
	}
	// The standard-14 substitute's advances differ from the embedded face's.
	// Letter spacing goes in first, since it is a real property of the run;
	// horizontal scaling then pins the whole run to the width the browser
	// measured, so the error stays inside the run instead of drifting across
	// the line.
	const spaced = natural - run.letterSpacing;
	const scale =
		spaced > 0 && run.width > 0 ? Math.max(50, Math.min(200, (100 * run.width) / spaced)) : 100;
	const scaled = Math.abs(scale - 100) > 3;
	// Both are text-state parameters, so they persist across drawText's own
	// BT/ET and have to be put back.
	if (run.letterSpacing)
		page.pushOperators(
			PDFOperator.of(PDFOperatorNames.SetCharacterSpacing, [String(+run.letterSpacing.toFixed(4))])
		);
	if (scaled)
		page.pushOperators(
			PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, [String(+scale.toFixed(3))])
		);
	const angle = (Math.PI / 2) * (run.turn ?? 0);
	for (const part of parts) {
		const along = scaled ? (part.at * scale) / 100 : part.at;
		page.drawText(part.text, {
			x: run.x + along * Math.cos(angle),
			y: H - run.baseline + along * Math.sin(angle),
			size: run.size,
			font: part.font,
			color: rgb(...run.colour),
			rotate: degrees(90 * (run.turn ?? 0))
		});
	}
	if (scaled)
		page.pushOperators(PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, ['100']));
	if (run.letterSpacing)
		page.pushOperators(PDFOperator.of(PDFOperatorNames.SetCharacterSpacing, ['0']));
}

function standard14(run: Run): StandardFonts {
	const family = run.family.toLowerCase();
	if (family.includes('courier') || family.includes('mono'))
		return run.bold && run.italic
			? StandardFonts.CourierBoldOblique
			: run.bold
				? StandardFonts.CourierBold
				: run.italic
					? StandardFonts.CourierOblique
					: StandardFonts.Courier;
	if (family.includes('times') || (family.includes('serif') && !family.includes('sans')))
		return run.bold && run.italic
			? StandardFonts.TimesRomanBoldItalic
			: run.bold
				? StandardFonts.TimesRomanBold
				: run.italic
					? StandardFonts.TimesRomanItalic
					: StandardFonts.TimesRoman;
	return run.bold && run.italic
		? StandardFonts.HelveticaBoldOblique
		: run.bold
			? StandardFonts.HelveticaBold
			: run.italic
				? StandardFonts.HelveticaOblique
				: StandardFonts.Helvetica;
}

/**
 * The fields, as the shapes the inventory already understands. Radios become a
 * real AcroForm radio group, so the inventory reads each option's group and
 * on-state as it reads a static form's.
 *
 * For a text field, a checkbox and a dropdown pdf-lib asks whether
 * `backgroundColor` and `borderColor` are `in` the options, and defaults a
 * missing background to white and a missing border to black, so both are
 * passed as undefined. Left out, each paints a white box with a black border
 * over the page. A radio option takes those defaults whatever is passed, with
 * a border of no width.
 *
 * The fields are flat, each made from pdf-lib's own field class with its whole
 * name as its `/T`. pdf-lib's form would read a period in the name as a level
 * of its field tree, and holds no name as both a field and the parent of one,
 * which a field named as the subform beside it asks for. pdf.js joins the `/T`
 * of a field's ancestors with periods, so the inventory reads the whole name.
 *
 * A signature field is a dictionary of the keys the inventory reads, since
 * pdf-lib has no class that creates one.
 */
function stamp(doc: PDFDocument, widgets: XfaWidget[]): void {
	const { acroForm } = doc.getForm();
	const pages = doc.getPages();
	const chrome = { borderWidth: 0, backgroundColor: undefined, borderColor: undefined };
	const groups = new Map<string, PDFRadioGroup>();
	const states = new Map<string, Set<string>>();
	const rooted = <Acro extends PDFAcroField, Made>(
		acro: Acro,
		name: string,
		of: (acro: Acro, ref: PDFRef, doc: PDFDocument) => Made
	): Made => {
		acro.setPartialName(name);
		acroForm.addField(acro.ref);
		return of(acro, acro.ref, doc);
	};

	for (const widget of widgets) {
		const page = pages[widget.page];
		const box = {
			x: widget.x,
			y: page.getHeight() - widget.y - widget.h,
			width: widget.w,
			height: widget.h,
			...chrome
		};
		if (widget.kind === 'radio' && widget.group) {
			let group = groups.get(widget.group);
			if (!group) {
				group = rooted(PDFAcroRadioButton.create(doc.context), widget.group, PDFRadioGroup.of);
				groups.set(widget.group, group);
				states.set(widget.group, new Set());
			}
			// Two members of one group cannot share an on-state, or picking either
			// picks both.
			const used = states.get(widget.group)!;
			let on = widget.on || 'option';
			for (let n = 2; used.has(on); n++) on = `${widget.on || 'option'}${n}`;
			used.add(on);
			group.addOptionToPage(on, page, box);
			tooltip(group, widget.tooltip);
			continue;
		}
		if (widget.kind === 'checkbox') {
			const tick = rooted(PDFAcroCheckBox.create(doc.context), widget.name, PDFCheckBox.of);
			tick.addToPage(page, box);
			tooltip(tick, widget.tooltip);
			continue;
		}
		if (widget.kind === 'choice') {
			const dropdown = rooted(PDFAcroComboBox.create(doc.context), widget.name, PDFDropdown.of);
			dropdown.addOptions(widget.options.length ? widget.options : ['']);
			dropdown.addToPage(page, box);
			dropdown.setFontSize(widget.fontSize);
			tooltip(dropdown, widget.tooltip);
			continue;
		}
		if (widget.kind === 'signature') {
			const ref = doc.context.register(
				doc.context.obj({
					FT: 'Sig',
					Subtype: 'Widget',
					T: PDFHexString.fromText(widget.name),
					Rect: [box.x, box.y, box.x + box.width, box.y + box.height],
					...(widget.tooltip ? { TU: PDFHexString.fromText(widget.tooltip) } : {})
				})
			);
			page.node.addAnnot(ref);
			acroForm.addField(ref);
			continue;
		}
		const field = rooted(PDFAcroText.create(doc.context), widget.name, PDFTextField.of);
		if (widget.kind === 'multiline') field.enableMultiline();
		if (widget.maxLength) field.setMaxLength(widget.maxLength);
		field.addToPage(page, box);
		field.setFontSize(widget.fontSize);
		tooltip(field, widget.tooltip);
	}
}

/** `/TU`, which the inventory reads as the widget's tooltip. */
function tooltip(field: PDFField, text?: string): void {
	if (!text) return;
	// Written on the widget just added. `addToPage` and `addOptionToPage` push
	// into `/Kids`, so writing to every kid would give each option of a radio
	// group the last option's caption.
	const widget = field.acroField.getWidgets().at(-1);
	widget?.dict.set(PDFName.of('TU'), PDFHexString.fromText(text));
}
