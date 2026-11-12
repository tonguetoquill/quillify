import {
	PDFArray,
	PDFBool,
	PDFDict,
	PDFDocument,
	PDFHexString,
	PDFName,
	PDFNull,
	PDFNumber,
	PDFRef,
	PDFStream,
	PDFString,
	type PDFObject,
	type PDFPage
} from 'pdf-lib';
import { Refused } from './refusal.js';
import type { View } from './types.js';

/**
 * What a background's dictionaries keep. A kind of dictionary lists its keys,
 * and after a colon what a key leads to:
 *
 *     Key         a number, a name, a string, a boolean, null, or an array of those
 *     Key:kind    a dictionary or a stream of that kind
 *     Key:[kind]  one of them or an array of them
 *     Key:{kind}  a dictionary of them by name
 *     Key:^kind   a reference to one the walk reaches as that kind by another key
 *     Key:[^kind] such a reference, or an array of them and of arrays of them
 *     Key:*       a value no row reads yet, kept whole
 *
 * A reference back can be to one of two kinds, `Key:^kind|kind`. A dictionary
 * by name can hold one of a kind or an array of them, `Key:{[kind]}`, or values
 * of the first sort and nothing else, `Key:{}`.
 *
 * A value of the first sort also stays where a kind is expected: a mask can be
 * an array of numbers and a color space a name. A kind `STREAMS` names is a
 * stream, which keeps the keys of `STREAM` beside its own, and no other kind is
 * a stream. A kind whose keys are numbers is an array read by position, as a
 * color space is: it loses every part past the last its row lists, and a part
 * before that which is not what its position leads to becomes null. A kind
 * `PICK` names is one of several, told apart by a key of the dictionary or a
 * position of the array, which holds a name where `PICK` writes one and a
 * number where it writes a number. Where `PICK` names a last kind, one that is
 * told as none of the others is of that kind.
 */
export const KINDS: Record<string, string> = {
	catalog: 'Type Pages:tree OCProperties:layers StructTreeRoot:tags MarkInfo:marks Lang',
	tree: 'Type Parent:^tree Kids:[node] Count Resources:resources Rotate',
	page:
		'Type Parent:^tree Resources:resources MediaBox Contents:[content] Rotate Group:group ' +
		'StructParents Tabs Annots:[link]',
	link:
		'Type Subtype Rect Border BS:border C H QuadPoints F OC:oc Contents StructParent A:action ' +
		'Dest:dest',
	border: 'Type W S D',
	uri: 'S URI',
	goto: 'S D:dest',
	dest: '0:^page 1 2 3 4 5',
	resources:
		'Font:{font} XObject:{xobject} ExtGState:{gstate} ColorSpace:{space} Pattern:{pattern} ' +
		'Shading:{shading} Properties:{oc} ProcSet',
	content: '',
	image:
		'Type Subtype Width Height BitsPerComponent ColorSpace:space Decode ImageMask Mask:image ' +
		'SMask:image SMaskInData Matte Interpolate Intent OC:oc StructParent',
	form: 'Type Subtype FormType BBox Matrix Resources:resources Group:group OC:oc StructParent StructParents',
	parms:
		'Predictor Colors BitsPerComponent Columns EarlyChange K EndOfLine EncodedByteAlign Rows ' +
		'EndOfBlock BlackIs1 DamagedRowsBeforeError ColorTransform JBIG2Globals:data',
	data: '',
	group: 'Type S CS:space I K',
	gstate:
		'Type LW LC LJ ML D RI OP op OPM Font:fontsize BG:function BG2:function UCR:function ' +
		'UCR2:function TR:[function] TR2:[function] HT HTO FL SM SA BM SMask:mask CA ca AIS TK ' +
		'UseBlackPtComp',
	fontsize: '0:font 1',
	mask: 'Type S G:form BC TR:function',
	ICCBased: '0 1:icc',
	Indexed: '0 1:space 2 3:data',
	Separation: '0 1 2:space 3:function',
	DeviceN: '0 1 2:space 3:function',
	CalRGB: '0 1:cie',
	CalGray: '0 1:cie',
	Lab: '0 1:cie',
	Pattern: '0 1:space',
	icc: 'N Alternate:space Range',
	cie: 'WhitePoint BlackPoint Gamma Matrix Range',
	function0: 'FunctionType Domain Range Size BitsPerSample Order Encode Decode',
	function2: 'FunctionType Domain Range C0 C1 N',
	function3: 'FunctionType Domain Range Functions:[function] Bounds Encode',
	function4: 'FunctionType Domain Range',
	shaded:
		'ShadingType ColorSpace:space Background BBox AntiAlias Domain Matrix Coords Extend ' +
		'Function:[function]',
	mesh:
		'ShadingType ColorSpace:space Background BBox AntiAlias BitsPerCoordinate BitsPerComponent ' +
		'BitsPerFlag Decode VerticesPerRow Function:[function]',
	tiling: 'Type PatternType PaintType TilingType BBox XStep YStep Resources:resources Matrix',
	shadingpattern: 'Type PatternType Shading:shading Matrix ExtGState:gstate',
	simple:
		'Type Subtype Name BaseFont FirstChar LastChar Widths FontDescriptor:descriptor ' +
		'Encoding:encoding ToUnicode:cmap',
	type3:
		'Type Subtype Name FontBBox FontMatrix CharProcs:{content} Encoding:encoding FirstChar ' +
		'LastChar Widths FontDescriptor:descriptor Resources:resources ToUnicode:cmap',
	type0: 'Type Subtype BaseFont Encoding:cmap DescendantFonts:[font] ToUnicode:cmap',
	cidfont:
		'Type Subtype BaseFont CIDSystemInfo:cidsystem FontDescriptor:descriptor DW W DW2 W2 ' +
		'CIDToGIDMap:data',
	cidsystem: 'Registry Ordering Supplement',
	encoding: 'Type BaseEncoding Differences',
	cmap: 'Type CMapName CIDSystemInfo:cidsystem WMode UseCMap:cmap',
	descriptor:
		'Type FontName FontFamily FontStretch FontWeight Flags FontBBox ItalicAngle Ascent Descent ' +
		'Leading CapHeight XHeight StemV StemH AvgWidth MaxWidth MissingWidth CharSet Lang ' +
		'FontFile:fontfile FontFile2:fontfile FontFile3:fontfile CIDSet:data',
	fontfile: 'Subtype Length1 Length2 Length3',
	layers: 'OCGs:[ocg] D:config',
	config:
		'Name BaseState ON:[^ocg] OFF:[^ocg] Intent AS:[auto] Order:[^ocg] ListMode RBGroups:[^ocg] ' +
		'Locked:[^ocg]',
	auto: 'Event Category OCGs:[^ocg]',
	ocg: 'Type Name Intent Usage:usage',
	usage: 'Print:state View:state Export:state PageElement:state',
	state: 'Subtype PrintState ViewState ExportState',
	ocmd: 'Type OCGs:[ocg] P VE:[^ocg]',
	marked: '',
	marks: 'Marked Suspects',
	tags: 'Type K:[kid] IDTree:ids ParentTree:parents ParentTreeNextKey RoleMap:{} ClassMap:{[attributes]}',
	elem: 'Type S P:^elem|tags ID Pg:^page K:[kid] A:[attributes] C T Lang Alt E ActualText',
	mcr: 'Type Pg:^page MCID',
	objr: 'Type Pg:^page Obj:^link',
	attributes:
		'O Headers Scope ColSpan RowSpan Summary BBox Width Height Placement BackgroundColor ' +
		'BorderColor BorderStyle BorderThickness SpaceBefore SpaceAfter StartIndent EndIndent ' +
		'TextIndent TextAlign BlockAlign InlineAlign BaselineShift LineHeight TextDecorationColor ' +
		'TextDecorationThickness TextDecorationType ColumnCount ColumnGap ColumnWidths ' +
		'ListNumbering Role checked ADBE_MinWidth',
	parents: 'Kids:[parents] Nums:[^elem] Limits',
	ids: 'Kids:[ids] Names:[^elem] Limits'
};
export const STREAMS = [
	'content',
	'image',
	'form',
	'data',
	'icc',
	'function0',
	'function4',
	'mesh',
	'tiling',
	'cmap',
	'fontfile'
];
export const STREAM = 'Length Filter DecodeParms:[parms]';
export const PICK: Record<string, [key: string, kinds: Record<string, string>, other?: string]> = {
	node: ['Type', { Pages: 'tree', Page: 'page' }],
	action: ['S', { URI: 'uri', GoTo: 'goto' }],
	xobject: ['Subtype', { Image: 'image', Form: 'form' }],
	font: [
		'Subtype',
		{
			Type1: 'simple',
			MMType1: 'simple',
			TrueType: 'simple',
			Type3: 'type3',
			Type0: 'type0',
			CIDFontType0: 'cidfont',
			CIDFontType2: 'cidfont'
		}
	],
	space: [
		'0',
		{
			ICCBased: 'ICCBased',
			Indexed: 'Indexed',
			Separation: 'Separation',
			DeviceN: 'DeviceN',
			CalRGB: 'CalRGB',
			CalGray: 'CalGray',
			Lab: 'Lab',
			Pattern: 'Pattern'
		}
	],
	function: ['FunctionType', { 0: 'function0', 2: 'function2', 3: 'function3', 4: 'function4' }],
	shading: [
		'ShadingType',
		{ 1: 'shaded', 2: 'shaded', 3: 'shaded', 4: 'mesh', 5: 'mesh', 6: 'mesh', 7: 'mesh' }
	],
	pattern: ['PatternType', { 1: 'tiling', 2: 'shadingpattern' }],
	oc: ['Type', { OCG: 'ocg', OCMD: 'ocmd' }, 'marked'],
	kid: ['Type', { MCR: 'mcr', OBJR: 'objr' }, 'elem']
};

/**
 * What a key leads to: one of a kind, a list or a map of them, or a back
 * reference to one, which may be an array of them where `many` is set. A bare
 * key leads to one of the kind `''` and `*` to one of the kind `'*'`, and
 * neither kind has a row.
 */
interface Slot {
	shape: 'one' | 'list' | 'map' | 'back';
	kind: string;
	many: boolean;
}
const SHAPES: Record<string, Slot['shape']> = { '[': 'list', '{': 'map', '^': 'back' };
const SLOTS = new Map<string, Slot>();
/** The slot a spelling of the table names. One spelling is one object, so the walk compares slots as they are. */
function slot(text: string): Slot {
	let read = SLOTS.get(text);
	if (!read) {
		const many = text.startsWith('[^');
		const shape = many ? 'back' : (SHAPES[text.charAt(0)] ?? 'one');
		const inner = many ? text.slice(2, -1) : shape === 'back' ? text.slice(1) : text.slice(1, -1);
		read = { shape, kind: shape === 'one' ? text : inner, many };
		SLOTS.set(text, read);
	}
	return read;
}
const WHOLE = slot('*');

/** A key of a row: a name in a dictionary, or a position in an array. */
const keyed = (text: string) => (/^\d+$/.test(text) ? Number(text) : PDFName.of(text));
/** What a dictionary holds at a name or an array at a position, read through a reference. */
const under = (held: PDFDict | PDFArray, key: PDFName | number) => {
	if (held instanceof PDFArray) return typeof key === 'number' ? held.lookup(key) : undefined;
	return typeof key === 'number' ? undefined : held.lookup(key);
};

/** Each kind's keys with the slot of each, and what the kind is: a dictionary, a stream or an array. */
const ROWS = new Map(
	Object.entries(KINDS).map(([kind, keys]) => {
		const stream = STREAMS.includes(kind);
		const entries = (stream ? `${keys} ${STREAM}` : keys).split(' ').filter(Boolean);
		const row = new Map(
			entries.map((entry) => {
				const [key, leads = ''] = entry.split(':');
				return [keyed(key), slot(leads)] as const;
			})
		);
		return [kind, { body: stream ? 'stream' : row.has(0) ? 'array' : 'dict', keys: row }];
	})
);
const PICKS = new Map(
	Object.entries(PICK).map(([kind, [key, kinds, other]]) => [
		kind,
		{
			key: keyed(key),
			kinds: new Map<unknown, string>(
				Object.entries(kinds).map(([told, kind]) => [keyed(told), kind])
			),
			other
		}
	])
);

const MAILBOX = /^[\w!$*+~-]+(?:\.[\w!$*+~-]+)*@[a-z\d-]+(?:\.[a-z\d-]+)+$/i;
const HOST = /^www(?:\.[a-z\d-]+)+$/i;

/**
 * The absolute address a link that holds one of two relative ones is kept as,
 * or undefined where it goes. pdf.js opens an address that begins `www.` and
 * holds two dots as `http://` and the address, read as a URL, and that URL is
 * the one kept, where the address is printable ASCII with no backslash, the
 * part before its path is a host name, and its path has no `.` or `..` segment,
 * escaped or not. A `mailto:` address is kept as one mailbox, without its query:
 * letters, digits and `_!$*+~-` in dot-separated runs, then `@` and a host name
 * of two labels or more.
 */
function opened(bytes: Uint8Array): string | undefined {
	// 'latin1' decodes as windows-1252; both tests below take only ASCII.
	const text = new TextDecoder('latin1').decode(bytes);
	if (/^mailto:/i.test(text)) {
		const [mailbox] = text.slice('mailto:'.length).split('?', 1);
		return MAILBOX.test(mailbox) ? `mailto:${mailbox}` : undefined;
	}
	if (bytes.some((byte) => byte < 0x21 || byte > 0x7e || byte === 0x5c)) return undefined;
	if (!text.startsWith('www.') || text.split('.').length < 3) return undefined;
	const [, host, path] = /^([^/?#]*)([^?#]*)/.exec(text)!;
	if (!HOST.test(host) || path.split('/').some((part) => /^(?:\.|%2e){1,2}$/i.test(part)))
		return undefined;
	try {
		return new URL(`http://${text}`).href;
	} catch {
		return undefined;
	}
}

/**
 * The `acroform` background: the source file's pages, and of each dictionary
 * they hold the keys `KINDS` lists for its kind. With the rest of the catalog
 * go the form (`/AcroForm` with its XFA packet, `/NeedsRendering`), the XMP
 * metadata, the scripts, attachments, portfolio and bookmarks, and the
 * usage-rights signature under `/Perms`. The signature goes here because qpdf's
 * `--remove-restrictions`, which takes it too, also strips `/FT /Sig` from
 * every signature field. The trailer's `/Info` and `/ID` go too.
 *
 * Of a page's annotations a Link stays, when it leads to an http or https
 * address or to an explicit destination in the file, and leads there one way.
 * One to a `www.` or `mailto:` address that `opened` reads stays too, its
 * address written back as the one `opened` gives.
 * A named destination resolves through the catalog's `/Dests` or `/Names`,
 * which go, so a link to one goes too, and so does a link with an action
 * chained after its own. The action a link keeps is a copy, so nothing the file
 * hangs on the same object is cut with it.
 *
 * Each page's MediaBox is set to the box of its entry of `views`, the frame the
 * inventory measured that page's widgets in. No box of the file is read here. A
 * file whose pages are not the objects `views` names, in that order, is one
 * pdf.js and pdf-lib read differently, and is refused as `damaged`.
 *
 * A walk from the catalog, level by level, then gives each object one kind, by
 * the key that reaches it. A dictionary loses every key its kind does not list
 * and every value that is not what its key leads to, and an object the walk
 * does not reach is deleted: a saved file carries every object the context
 * holds, reachable or not. A file in which a key reaches an object as another
 * kind than it has is refused as `damaged`. A reference back to an object the
 * walk did not reach as its kind is deleted, or made null in an array: a
 * destination's page that the page tree does not hold, and a layer the default
 * configuration names that no other key reaches.
 *
 * The structure tree has rows as the rest has. Of what lies outside it, it
 * names a page of the page tree and a link that stays, each by a reference
 * back, and nothing else: an element's `/Pg` to any other object is deleted,
 * and an object reference whose `/Obj` is not such a link is taken out of its
 * element's `/K`.
 *
 * An object that says `/Type /Annot`, `/Subtype /Widget` or `/Type /Page`, and
 * is neither a page of `views` nor a link that stays, has no kind. A file in
 * which a key reaches one as a kind is refused as `damaged`, the catalog itself
 * included, and so is a file whose catalog or page tree pdf-lib cannot read. A
 * marked-content property list may say `/Type /Page`, and a `/Rect` says
 * nothing: a kept object loses the keys its row does not list. So no object of
 * a background is a widget or a page outside the page tree, and the fields and
 * appearance streams that hung off one are out of the walk's reach: a
 * background that still carries a form layer is one the renderer would stamp a
 * second one over. A dictionary written in place is not an object: one by name
 * keeps the plain values a file writes in it, a widget's among them.
 */
export async function stripAcroForm(bytes: Uint8Array, views: View[]): Promise<Uint8Array> {
	const doc = await PDFDocument.load(bytes, { updateMetadata: false });
	const { context } = doc;
	const at = (object: unknown, key: string) =>
		object instanceof PDFDict ? object.lookup(PDFName.of(key)) : undefined;
	const is = (object: unknown, key: string, name: string): object is PDFDict =>
		at(object, key) === PDFName.of(name);

	/** The action a link that stays keeps, `null` when it holds its destination itself, `false` when it goes. */
	const leads = (link: PDFDict) => {
		if (!link.has(PDFName.of('A'))) return at(link, 'Dest') instanceof PDFArray ? null : false;
		const action = at(link, 'A');
		if (link.has(PDFName.of('Dest')) || at(action, 'Next') !== undefined) return false;
		if (is(action, 'S', 'GoTo')) return at(action, 'D') instanceof PDFArray && action.clone();
		if (!is(action, 'S', 'URI')) return false;
		const uri = at(action, 'URI');
		if (!(uri instanceof PDFString || uri instanceof PDFHexString)) return false;
		// A URI is ASCII, so its start is read off the bytes. Decoded as text, an
		// address spelled in UTF-16 would pass here and be another one to a reader.
		const bytes = uri.asBytes();
		if (/^https?:\/\//i.test(String.fromCharCode(...bytes.subarray(0, 8)))) return action.clone();
		const address = opened(bytes);
		if (address === undefined) return false;
		const kept = action.clone();
		const hex = [...address].map((char) => char.charCodeAt(0).toString(16).padStart(2, '0'));
		kept.set(PDFName.of('URI'), PDFHexString.of(hex.join('')));
		return kept;
	};

	// pdf-lib throws at a catalog or a page tree it does not read as one.
	let pages: PDFPage[];
	try {
		pages = doc.getPages();
	} catch {
		throw new Refused({ code: 'damaged' });
	}
	const differs = pages.some(({ ref }, index) => {
		const viewed = views[index]?.ref;
		return viewed?.num !== ref.objectNumber || viewed.gen !== ref.generationNumber;
	});
	if (differs || pages.length !== views.length) throw new Refused({ code: 'damaged' });
	const kept = new Set<unknown>(pages.map((page) => page.ref));
	const linked = new Set<unknown>();
	for (const [index, page] of pages.entries()) {
		const listed = at(page.node, 'Annots');
		const links = (listed instanceof PDFArray ? listed.asArray() : []).filter((entry) => {
			const link = context.lookup(entry);
			// An annotation that names its type names /Annot, so a page that lists
			// itself is no link, whatever else it says.
			const typed = at(link, 'Type') ?? PDFName.of('Annot');
			if (!is(link, 'Subtype', 'Link') || typed !== PDFName.of('Annot')) return false;
			const action = leads(link);
			if (action === false) return false;
			if (action) link.set(PDFName.of('A'), action);
			linked.add(entry);
			return true;
		});
		page.node.set(PDFName.of('MediaBox'), context.obj(views[index].box));
		page.node.delete(PDFName.of('Annots'));
		if (links.length > 0) page.node.set(PDFName.of('Annots'), context.obj(links));
	}
	context.trailerInfo.Info = undefined;
	context.trailerInfo.ID = undefined;

	const claimed = new Map<PDFRef, Slot>();
	const pending: [value: PDFArray | PDFDict | PDFStream, as: Slot][] = [];
	const whole: (PDFObject | undefined)[] = [];
	const backs: [holder: PDFDict | PDFArray, key: PDFName | number, to: Slot][] = [];

	/** Whether what a reference names or an array holds leads nowhere: `false` while it is being read, so an array that holds itself leads somewhere. */
	const plains = new Map<PDFRef | PDFArray, boolean>();
	/** Whether a value leads nowhere. A reference and an array are each read once, whatever reaches them, and a `[reference]` or an `[array]` among the parts marks where its own parts end. */
	const plain = (value: PDFObject) => {
		const parts: (PDFObject | [read: PDFRef | PDFArray] | undefined)[] = [value];
		while (parts.length > 0) {
			let part = parts.pop();
			if (Array.isArray(part)) {
				plains.set(part[0], true);
				continue;
			}
			if (part instanceof PDFRef || part instanceof PDFArray) {
				const known = plains.get(part);
				if (known) continue;
				if (known === false) return false;
				plains.set(part, false);
				parts.push([part]);
				if (part instanceof PDFRef) part = context.lookup(part);
			}
			if (part instanceof PDFArray) for (let i = 0; i < part.size(); i++) parts.push(part.get(i));
			else if (!(
				part instanceof PDFNumber ||
				part instanceof PDFName ||
				part instanceof PDFString ||
				part instanceof PDFHexString ||
				part instanceof PDFBool ||
				part === PDFNull
			))
				return false;
		}
		return true;
	};

	/**
	 * Gives an object its kind and queues it, where this reach of it is as a kind.
	 * An object that has one is reached as that kind and no other, or the file is
	 * refused as `damaged`: the walk cuts it to the keys of the first, and a second
	 * would read what is left. So is a file that reaches as a kind an object that
	 * says it is an annotation or a page, and is neither a page of `views` nor a
	 * link that stays. Whether this reach of it stays.
	 */
	const claim = (raw: PDFObject | undefined, value: PDFArray | PDFDict | PDFStream, as?: Slot) => {
		const had = claimed.get(raw as PDFRef);
		const posed =
			raw instanceof PDFRef &&
			!kept.has(raw) &&
			!linked.has(raw) &&
			(is(value, 'Type', 'Annot') ||
				is(value, 'Subtype', 'Widget') ||
				(as !== slot('marked') && is(value, 'Type', 'Page')));
		if ((had && had !== as) || (as && posed)) throw new Refused({ code: 'damaged' });
		if (had || !as) return as !== undefined;
		if (raw instanceof PDFRef) claimed.set(raw, as);
		pending.push([value, as]);
		return true;
	};

	/** Whether a value stays where a key leads to `to`. */
	const reach = (raw: PDFObject, to: Slot): boolean => {
		if (to === WHOLE || plain(raw)) {
			whole.push(raw);
			return true;
		}
		if (!to.kind && to.shape === 'one') return false;
		const value = raw instanceof PDFRef ? context.lookup(raw) : raw;
		if (!(value instanceof PDFDict || value instanceof PDFStream || value instanceof PDFArray))
			return false;
		if (to.shape === 'map') return claim(raw, value, value instanceof PDFDict ? to : undefined);
		if (to.shape === 'list' && value instanceof PDFArray) return claim(raw, value, to);
		const pick = PICKS.get(to.kind);
		const told = pick && under(value instanceof PDFStream ? value.dict : value, pick.key);
		const kind = pick
			? (pick.kinds.get(told instanceof PDFNumber ? told.asNumber() : told) ?? pick.other)
			: to.kind;
		const body =
			value instanceof PDFStream ? 'stream' : value instanceof PDFArray ? 'array' : 'dict';
		// A page is one the loop above framed. pdf-lib reads none in a dictionary
		// written inside /Kids that names its /Type by reference. An object reference
		// is one to a link that loop kept.
		const fits =
			kind &&
			ROWS.get(kind)!.body === body &&
			(kind !== 'page' || kept.has(raw)) &&
			(kind !== 'objr' || linked.has((value as PDFDict).get(PDFName.of('Obj'))));
		return claim(raw, value, fits ? slot(kind) : undefined);
	};

	claim(context.trailerInfo.Root, doc.catalog, slot('catalog'));
	for (let next = 0; next < pending.length; next++) {
		const [value, as] = pending[next];
		if (as.shape === 'list' && value instanceof PDFArray) {
			let stay = 0;
			for (let i = 0; i < value.size(); i++) {
				const part = value.get(i);
				if (reach(part, slot(as.kind))) value.set(stay++, part);
			}
			while (value.size() > stay) value.remove(value.size() - 1);
		} else if (as.shape === 'map' && value instanceof PDFDict) {
			for (const [key, part] of value.entries()) if (!reach(part, slot(as.kind))) value.delete(key);
		} else if (value instanceof PDFArray) {
			const { keys } = ROWS.get(as.kind)!;
			while (value.size() > keys.size) value.remove(value.size() - 1);
			for (let i = 0; i < value.size(); i++) {
				const to = keys.get(i)!;
				if (to.shape === 'back') backs.push([value, i, to]);
				else if (!reach(value.get(i), to)) value.set(i, PDFNull);
			}
		} else {
			const dict = value instanceof PDFStream ? value.dict : value;
			const { keys } = ROWS.get(as.kind)!;
			for (const [key, part] of dict.entries()) {
				const to = keys.get(key);
				if (to?.shape === 'back') backs.push([dict, key, to]);
				else if (!to || !reach(part, to)) dict.delete(key);
			}
		}
	}
	// A back reference stays when the walk reached what it names as its kind.
	// Where the slot takes many, a value that leads nowhere stays too, and an
	// array is read part by part, and so is each array in it. An array is read
	// once. One the walk cut to a list of the kind stays wherever it is named.
	// One that two such keys name by a reference stays under both, and inside an
	// array a second reference to it does not, so no array is left holding itself.
	// One that has any other kind gets the file refused.
	// An array written in place is read here and never by `plain`, which would
	// hold a note of each.
	for (const [holder, key, to] of backs) {
		const ones = to.kind.split('|').map(slot);
		const list = slot(`[${to.kind}]`);
		const arrays: PDFArray[] = [];
		const stays = (within: PDFDict | PDFArray, part: PDFObject) => {
			const had = claimed.get(part as PDFRef);
			if (had && ones.includes(had)) return true;
			if (!to.many) return false;
			if (had === list) return true;
			if (had === to) return within instanceof PDFDict;
			if (!(part instanceof PDFArray) && plain(part)) {
				whole.push(part);
				return true;
			}
			const value = part instanceof PDFRef ? context.lookup(part) : part;
			if (!(value instanceof PDFArray)) return false;
			if (had) throw new Refused({ code: 'damaged' });
			if (part instanceof PDFRef) claimed.set(part, to);
			arrays.push(value);
			return true;
		};
		if (holder instanceof PDFArray) {
			if (!stays(holder, holder.get(key as number))) holder.set(key as number, PDFNull);
		} else if (!stays(holder, holder.get(key as PDFName)!)) holder.delete(key as PDFName);
		for (let array = arrays.pop(); array; array = arrays.pop())
			for (let i = 0; i < array.size(); i++) if (!stays(array, array.get(i))) array.set(i, PDFNull);
	}
	// What no row reads and what leads nowhere are kept as they are and walked
	// last, so an object a row reaches has its row whatever else names it.
	while (whole.length > 0) {
		let value = whole.pop();
		if (value instanceof PDFRef) {
			if (claimed.has(value)) continue;
			claimed.set(value, WHOLE);
			value = context.lookup(value);
		}
		if (value instanceof PDFArray) for (let i = 0; i < value.size(); i++) whole.push(value.get(i));
		else if (value instanceof PDFDict) for (const part of value.values()) whole.push(part);
		else if (value instanceof PDFStream) for (const part of value.dict.values()) whole.push(part);
	}

	// The trailer's /Size is the largest object number plus one, and deleting does
	// not lower it.
	let largest = 0;
	for (const [ref] of context.enumerateIndirectObjects()) {
		if (!claimed.has(ref)) context.delete(ref);
		else if (ref.objectNumber > largest) largest = ref.objectNumber;
	}
	context.largestObjectNumber = largest;
	return doc.save({ useObjectStreams: false });
}
