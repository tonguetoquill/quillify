/** Geometry in PDF points, top-left origin, page-relative: the `acroform` backend's `rect`. */
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** AcroForm field type codes as pdf.js reports them. */
export const WIDGET_KINDS = ['Tx', 'Btn', 'Ch', 'Sig'] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

/** One place a field is painted. */
export interface WidgetPlace {
	page: number;
	rect: Rect;
}

export interface InventoryWidget {
	/** Unique within the inventory: the field name, suffixed when a name repeats. */
	id: string;
	name: string;
	kind: WidgetKind;
	/**
	 * Everywhere this field is painted. More than one when a form repeats a box:
	 * one name is one value in the file, so typing into any of them fills them
	 * all, and treating them as separate fields asks for the same answer twice.
	 */
	places: WidgetPlace[];
	multiLine: boolean;
	checkBox: boolean;
	radioButton: boolean;
	combo: boolean;
	options: string[];
	readOnly: boolean;
	required: boolean;
	/** `/TU`, the hover text the form's author wrote. */
	tooltip?: string;
	/** `/MaxLen`, 0 when the field sets none. */
	maxLen: number;
	/** This widget's on-state name, which is how a radio group tells its options apart. */
	buttonValue?: string;
}

export interface FieldInventory {
	pages: { width: number; height: number }[];
	widgets: InventoryWidget[];
}

/** A page as pdf.js read it. */
export interface View {
	/** The object that is the page, by number and generation: null when pdf.js gives none. */
	ref: { num: number; gen: number } | null;
	/** The page's frame in PDF space, pdf.js's `view` of it, which every rect of the page is measured in. */
	box: [x0: number, y0: number, x1: number, y1: number];
}

export type FieldType = 'string' | 'boolean' | 'enum' | 'array';

export interface QualifiedField {
	/** `InventoryWidget.id` */
	widget: string;
	/** snake_case schema field name */
	name: string;
	label: string;
	title?: string;
	description: string;
	type: FieldType;
	multiline: boolean;
	options?: string[];
	/** The value of its enum that checks this one's box, where it is one option's box. */
	option?: string;
	max?: number;
	example?: string;
	keep: boolean;
	/** `/Ff` bit 2: the form says this one has to be filled. */
	required: boolean;
}

export interface QualifiedForm {
	quill: { name: string; title: string; description: string };
	fields: QualifiedField[];
}

export const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

/** A quill as files, the shape `Quill.fromTree` takes. */
export type QuillTree = Map<string, Uint8Array>;

/** The largest file `sanitize` opens. It bounds the compressed input. */
export const MAX_BYTES = 8 * 1024 * 1024;
/**
 * The most a file may come to once qpdf has it: the file qpdf writes together
 * with what its Flate streams decode to and what its images declare, and
 * qpdf's own memory. Of 1,423 published files the largest comes to
 * 48,477,587 bytes (AF 4101), and qpdf's memory is 17,235,968 bytes after
 * each. Their largest image is 6,026 by 4,523 pixels at a bit each, 3,410,342
 * bytes (AF 1520), and the one that declares the most bytes is 2,322 by 2,916
 * at three bytes each, 20,312,856 (AF 4101).
 */
export const MAX_INFLATED_BYTES = 64 * 1024 * 1024;
/** The most pages and fields a form has and is taken. The engine takes at most 1,000 fields in a block. */
export const MAX_PAGES = 25;
export const MAX_WIDGETS = 1000;
/** The limits a consumer prints before a read. A refusal's own `limit` is the one to print after it: `too_large` carries `MAX_INFLATED_BYTES` for the decoded bound. */
export const limits: Readonly<{ bytes: number; pages: number; fields: number }> = Object.freeze({
	bytes: MAX_BYTES,
	pages: MAX_PAGES,
	fields: MAX_WIDGETS
});
/**
 * The longest side a page has and is taken, in points, and the farthest its
 * box reaches from the origin: the PDF specification's limit for a side (ISO
 * 32000-1, Annex C). Of 2,127 published pages the longest is 3,456 (AFMC 1656).
 */
export const MAX_SIDE = 14_400;
/**
 * The most pixels the pictures of a dynamic form come to, each use counted.
 * At four bytes a pixel that is 32 MB on a canvas, and as much in the
 * background when the pictures are noise with an alpha channel. Of the 65 Air
 * Force forms with a picture the largest comes to 6,958,512 (AF 4035).
 */
export const MAX_PICTURE_PIXELS = 8_000_000;
/**
 * How long `sanitize` works on a file before it refuses it. Of 59 published
 * forms the slowest takes 2.7 s (SF 2809).
 */
export const MAX_SECONDS = 60;
