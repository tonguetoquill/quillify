import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFHexString,
	PDFName,
	PDFString,
	pdfDocEncodingDecode
} from 'pdf-lib';
import { toTopLeftRect } from './coords.js';
import { openPdf } from './pdfjs.js';
import { Refused } from './refusal.js';
import { MAX_PAGES, MAX_SIDE, MAX_WIDGETS, WIDGET_KINDS } from './types.js';
import type { FieldInventory, InventoryWidget, View, WidgetKind } from './types.js';

interface Annotation {
	subtype: string;
	hidden?: boolean;
	fieldName?: string;
	fieldType?: string | null;
	rect: [number, number, number, number];
	multiLine?: boolean;
	radioButton?: boolean;
	checkBox?: boolean;
	pushButton?: boolean;
	combo?: boolean;
	options?: { exportValue: string | string[] | null }[];
	readOnly?: boolean;
	required?: boolean;
	alternativeText?: string;
	maxLen?: number;
	defaultAppearanceData?: { fontSize: number };
	buttonValue?: string | null;
	exportValue?: string;
}

/** pdf.js passes on whatever name a file gives `/FT`. */
const isWidgetKind = (type: unknown): type is WidgetKind =>
	WIDGET_KINDS.includes(type as WidgetKind);

export async function inventoryPdf(
	bytes: Uint8Array,
	signal?: AbortSignal
): Promise<FieldInventory & { views: View[] }> {
	const { pdf, close, within } = await openPdf(bytes, {}, signal);
	try {
		// XFA alone is not a refusal. A hybrid form carries its XFA template beside a
		// complete AcroForm field tree, and pdf.js never XFA-renders one of those, so
		// the widgets below are the real ones. A dynamic form has no field tree, and
		// `xfaToAcroForm` has given it one by the time anything reaches here. What is
		// left is a file that is neither, which has no field to read.
		const { info } = (await within(pdf.getMetadata())) as {
			info: { IsXFAPresent?: boolean; IsCollectionPresent?: boolean };
		};
		const xfa = pdf.isPureXfa || !!info.IsXFAPresent;
		// A catalog that declares a collection is a portfolio: its pages are a cover
		// sheet, and the form is an attachment. AF 3070A is one, around a file named
		// `MicrosoftIRMServices Protected PDF.pdf`. Counting the cover sheet's
		// widgets would answer the wrong question.
		if (info.IsCollectionPresent) {
			const [attachment] = (await within(pdf.getAttachments()))?.keys() ?? [];
			throw new Refused({ code: 'portfolio', attachment });
		}
		if (pdf.numPages > MAX_PAGES)
			throw new Refused({ code: 'too_many_pages', pages: pdf.numPages, limit: MAX_PAGES });
		const inherited = await tooltipsByField(bytes);

		// The value of a checkbox field is the on-state of its ticked box, so boxes
		// of one name that turn on as different values exclude each other. WH-380-E
		// asks whether a job description `is` or `is not attached` that way. Each
		// name's on-states are read ahead of the entries, since the first box of a
		// name does not show what the next turns on as.
		const states = new Map<string, Set<string | undefined>>();
		for (let index = 0; index < pdf.numPages; index++) {
			const page = await within(pdf.getPage(index + 1));
			for (const a of (await within(page.getAnnotations())) as Annotation[])
				if (a.checkBox && a.fieldName && !a.hidden)
					states.set(a.fieldName, (states.get(a.fieldName) ?? new Set()).add(a.exportValue));
		}

		const widgets: InventoryWidget[] = [];
		const dims: FieldInventory['pages'] = [];
		const views: View[] = [];
		const seen = new Map<string, number>();
		const byName = new Map<string, InventoryWidget>();
		for (let index = 0; index < pdf.numPages; index++) {
			const page = await within(pdf.getPage(index + 1));
			if (page.rotate % 360 !== 0) throw new Refused({ code: 'rotated', page: index });
			const view = page.view as View['box'];
			views.push({ ref: page.ref, box: view });
			const size = { width: view[2] - view[0], height: view[3] - view[1] };
			if (
				page.userUnit !== 1 ||
				Math.max(size.width, size.height, ...view.map(Math.abs)) > MAX_SIDE
			)
				throw new Refused({ code: 'damaged' });
			dims.push(size);

			const annotations = (await within(page.getAnnotations())) as Annotation[];
			for (const a of annotations) {
				// A push button runs an action; it holds no value, so it is no field.
				if (a.subtype !== 'Widget' || a.hidden || !isWidgetKind(a.fieldType) || a.pushButton)
					continue;
				const name = a.fieldName ?? '';
				// pdf.js reads a `/DA`'s size as written: 0 asks for auto size, and a hostile one is Infinity.
				const size = a.defaultAppearanceData?.fontSize ?? 0;
				const place = {
					page: index,
					rect: toTopLeftRect(a.rect, view, page.rotate),
					...((a.fieldType === 'Tx' || a.fieldType === 'Ch') && size > 0 && Number.isFinite(size)
						? { fontSize: size }
						: {})
				};
				// One name is one value in the file: typing into any widget that
				// carries it fills every other. SF 1152 ships an original and a file
				// copy sharing one field tree, so half its 60 field widgets are the
				// other half painted again. A radio option is the exception, since
				// its on-state is the whole point of being separate, and so is a
				// checkbox whose name turns on as more than one value.
				const option = !!a.checkBox && (states.get(name)?.size ?? 0) > 1;
				const shared = a.radioButton || option || !name ? undefined : byName.get(name);
				if (shared) {
					shared.places.push(place);
					continue;
				}
				const count = (seen.get(name) ?? 0) + 1;
				seen.set(name, count);
				const widget: InventoryWidget = {
					id: count === 1 ? name : `${name}#${count}`,
					name,
					kind: a.fieldType,
					places: [place],
					multiLine: a.multiLine ?? false,
					checkBox: !option && (a.checkBox ?? false),
					radioButton: option || (a.radioButton ?? false),
					combo: a.combo ?? false,
					options: (a.options ?? [])
						.map((o) => o.exportValue)
						.filter((value) => typeof value === 'string'),
					readOnly: a.readOnly ?? false,
					required: a.required ?? false,
					tooltip: a.alternativeText || inherited.get(name) || undefined,
					maxLen: a.maxLen ?? 0,
					buttonValue: (option ? a.exportValue : a.buttonValue) ?? undefined
				};
				widgets.push(widget);
				if (!a.radioButton && !option && name) byName.set(name, widget);
			}
		}

		// The cap reads a complete count. Inside the page loop it would name a
		// running partial.
		if (widgets.length > MAX_WIDGETS)
			throw new Refused({ code: 'too_many_fields', fields: widgets.length, limit: MAX_WIDGETS });
		if (widgets.length === 0) throw new Refused({ code: 'no_fields', xfa });
		return { pages: dims, widgets, views };
	} finally {
		await close();
	}
}

/**
 * Every field's `/TU` by its fully qualified name.
 *
 * Acrobat writes `/T` and `/TU` on the field and puts bare widget annotations in
 * `/Kids`. pdf.js walks `/Parent` for `/T` and inherits `/FT`, but reads `/TU`
 * straight off the annotation, so every kid of a split field arrives unlabeled:
 * 16 of EOIR-28's 53 widgets, 32 of VA 26-1880's 81, 60 of SF 1152's 63. A
 * widget's tooltip is its field's tooltip, which is the same parent walk pdf.js
 * already does for the name.
 *
 * The walk goes down `/Fields` through `/Kids` and joins the `/T` of each node
 * that has one with a period, as pdf.js builds a field's name. A `/T` the two
 * libraries decode apart finds no widget. It reads the objects themselves,
 * since pdf-lib's form API throws on a tree it cannot type. Whatever is not
 * the type the walk wants is passed over, and a node is read once, so a tree
 * that loops ends.
 *
 * pdf-lib carries no decryption, so this only reads what `normalizePdf` has
 * already decrypted.
 */
async function tooltipsByField(bytes: Uint8Array): Promise<Map<string, string>> {
	const found = new Map<string, string>();
	const doc = await PDFDocument.load(bytes, { updateMetadata: false });
	const acroForm = doc.catalog.lookup(PDFName.of('AcroForm'));
	const seen = new Set<PDFDict>();
	// Each list of nodes with the name of the field that holds it. An entry of
	// `/Fields` is a field. A kid with no `/T` is a widget of the field above it.
	const lists: [nodes: unknown, above: string | undefined][] = [
		[acroForm instanceof PDFDict ? acroForm.lookup(PDFName.of('Fields')) : undefined, undefined]
	];
	for (let next = 0; next < lists.length; next++) {
		const [nodes, above] = lists[next]!;
		if (!(nodes instanceof PDFArray)) continue;
		for (let index = 0; index < nodes.size(); index++) {
			const node = nodes.lookup(index);
			if (!(node instanceof PDFDict) || seen.has(node)) continue;
			seen.add(node);
			const part = text(node.lookup(PDFName.of('T')));
			const name = part === undefined ? above : above === undefined ? part : `${above}.${part}`;
			const tip = text(node.lookup(PDFName.of('TU')));
			if (tip !== undefined && (part !== undefined || next === 0)) found.set(name ?? '', tip);
			lists.push([node.lookup(PDFName.of('Kids')), name]);
		}
	}
	return found;
}

/**
 * A text string as pdf-lib's `decodeText` reads it: UTF-16 after a byte order
 * mark, PDFDocEncoding without one. `decodeText` hands every character to one
 * call, which overflows the stack near 130,000 of them.
 */
function text(value: unknown): string | undefined {
	if (!(value instanceof PDFString || value instanceof PDFHexString)) return undefined;
	const bytes = value.asBytes();
	if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
	if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
	let decoded = '';
	for (let at = 0; at < bytes.length; at += 8192)
		decoded += pdfDocEncodingDecode(bytes.subarray(at, at + 8192));
	return decoded;
}
