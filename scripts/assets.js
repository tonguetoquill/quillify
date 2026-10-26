// The diagnosis behind the null guard is in the history: prose/research/pdfjs-som-null-guard.diff at 84619f7.

import { hash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const GUARDS = [
	{
		sites: 2,
		line: 'children = children.isXFAObjectArray ? children.children : [children];',
		guarded:
			'children = children == null ? [] : children.isXFAObjectArray ? children.children : [children];'
	},
	{
		sites: 1,
		line: 'const savedMethod = extraNode[$getSubformParent];',
		guarded:
			'const savedMethod = extraNode[$getSubformParent]; const savedFirst = root[$extra].firstUnsplittable;'
	},
	{
		sites: 1,
		line: 'extraNode[$getSubformParent] = savedMethod;',
		guarded:
			'extraNode[$getSubformParent] = savedMethod; root[$extra].firstUnsplittable = savedFirst;'
	},
	{
		sites: 1,
		line: 'if (!this.ui) {',
		guarded: 'if (!this.ui || this.ui.defaultUi || !this.ui[$getExtra]()) {'
	},
	{
		sites: 1,
		line: 'const ui = this.ui[$toHTML]().html;',
		guarded:
			'const ui = this.ui[$toHTML]().html ?? { name: "label", attributes: { class: ["xfaLabel"] }, children: [{ name: "div", attributes: { class: [this.ui.signature ? "xfaSignature" : this.ui.barcode ? "xfaBarcode" : this.ui.passwordEdit ? "xfaPasswordEdit" : "xfaImageEdit"], style: { width: "100%" } }, children: [] }] };'
	},
	{
		sites: 1,
		line: 'this[$extra].pageSetIndex = -1;',
		guarded: 'this[$extra].pageSetIndex = -1; this[$cleanPage]();'
	},
	{
		sites: 1,
		line: 'for (const item of formNode.items.children) {',
		guarded:
			'if (!formNode.bindItems.children.some(({ ref, connection }) => !connection && ref && searchNode(this.root, dataNode, ref, false, false))) return; for (const item of formNode.items.children) {'
	},
	{
		sites: 1,
		line: 'if (children.length === 0 && !this[$content]) {',
		guarded:
			'if (this.embed) { const counter = this[$globalData].ids.get(this.embed)?.event?.children.find(event => event.activity === "ready" && event.ref === "$layout")?.script?.[$content].match(/^this\\.rawValue\\s*=\\s*xfa\\.layout\\.(page\\(this\\)|pageCount\\(\\));?$/); return counter ? HTMLResult.success({ name: "span", attributes: { class: [counter[1] === "page(this)" ? "xfaPageNumber" : "xfaPageCount"], style: mapStyle(this.style, this, this[$richText]) }, value: this[$content] }) : HTMLResult.EMPTY; } if (children.length === 0 && !this[$content]) {'
	},
	{
		sites: 1,
		line: 'super(attributes, "span");',
		guarded:
			'super(attributes, "span"); const embed = attributes[$nsAttributes]?.xfa.embed; if (embed?.startsWith("#")) { this.embed = embed.slice(1); this[$content] = "00"; }'
	},
	{
		sites: 1,
		line: 'this._ids = new Map();',
		guarded: 'this._ids = new Map(); this._globalData.ids = this._ids;'
	},
	{
		sites: 1,
		line: 'warn(`XFA - an error occurred during layout: ${e}`);',
		guarded:
			'warn(`XFA - an error occurred during layout: ${e}`); throw new Error(`XFA layout: ${e.message}`);'
	},
	{
		sites: 2,
		line: 'if (currentLineWidth + glyphWidth > maxWidth) {',
		guarded: 'if (0.99 * (currentLineWidth + glyphWidth) > maxWidth) {'
	},
	{
		sites: 1,
		line: 'if (this.contentType === "text/html" && child[$namespaceId] === NamespaceIds.xhtml.id) {',
		guarded:
			'if (this.contentType === "text/html" && child[$namespaceId] === NamespaceIds.xhtml.id) { child[_parent] = this;'
	},
	{
		sites: 1,
		line: 'this.typeface = attributes.typeface || "Courier";',
		guarded:
			'this.typeface = attributes.typeface || "Courier"; this.size *= this.fontHorizontalScale / 100;'
	},
	{
		sites: 1,
		line: 'if (key.endsWith("scale")) {',
		guarded:
			'if (key === "xfa-font-horizontal-scale") { original.horizontalScale = Math.max(0, parseFloat(value) / 100); } else if (key.endsWith("scale")) {'
	},
	{
		sites: 1,
		line: 'style.fontSize = `calc(${style.fontSize} * var(--total-scale-factor))`;',
		guarded:
			'style.fontSize = `calc(${style.fontSize} * var(--total-scale-factor))`; } if (original.horizontalScale === undefined && style.fontSize) { let host = node; while (host && !host.font) host = host[_parent]; if (host?.font?.fontHorizontalScale !== undefined && host.font.fontHorizontalScale !== 100) original.horizontalScale = host.font.fontHorizontalScale / 100; } if (original.horizontalScale !== undefined) { style.fontSize = style.fontSize ? `calc(${style.fontSize} * ${original.horizontalScale})` : `${original.horizontalScale}em`;'
	},
	{
		sites: 1,
		line: 'case "font-size":',
		guarded:
			'case "xfa-font-horizontal-scale": xfaFont.horizontalScale = Math.max(0, parseFloat(value) / 100); break; case "font-size":'
	},
	{
		sites: 1,
		line: 'measure.pushData(xfaFont, margin, lineHeight);',
		guarded:
			'if (xfaFont.horizontalScale !== undefined) { xfaFont.size = (xfaFont.size || measure.fontSelector.topFont().xfaFont.size) * xfaFont.horizontalScale; } measure.pushData(xfaFont, margin, lineHeight);'
	},
	{
		sites: 1,
		line: 'if (this.ui.textEdit && this.value.text?.maxChars) {',
		guarded:
			'const cells = (this.ui.textEdit || this.ui.numericEdit)?.comb?.numberOfCells; if (cells) { ui.children[0].attributes.maxLength = cells; } if ((this.ui.textEdit || this.ui.numericEdit) && this.value.text?.maxChars && !(cells < this.value.text.maxChars)) {'
	}
];
const SOURCE_MAP = '//# sourceMappingURL=pdf.worker.mjs.map';
const QPDF_WASM = 'abd933f4ccace4f732999381b21aec8b7e3726f18a5b167fafd57f88dd440876';

const { version } = JSON.parse(readFileSync('node_modules/pdfjs-dist/package.json', 'utf8'));
let worker = readFileSync('node_modules/pdfjs-dist/build/pdf.worker.mjs', 'utf8');
if (!worker.endsWith(SOURCE_MAP)) throw new Error(`pdf.worker.mjs does not end in ${SOURCE_MAP}`);
worker = worker.slice(0, -SOURCE_MAP.length);
for (const { sites, line, guarded } of GUARDS) {
	const found = worker.split(line).length - 1;
	if (found !== sites)
		throw new Error(
			`pdf.worker.mjs has \`${line}\` at ${found} sites, and its guard is written for ${sites}. ` +
				'If node_modules was patched in place by an older checkout, reinstall it with `npm ci`.'
		);
	worker = worker.replaceAll(line, guarded);
}

const wasm = readFileSync('node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const sha256 = hash('sha256', wasm);
if (sha256 !== QPDF_WASM) throw new Error(`qpdf.wasm hashes to ${sha256}, expected ${QPDF_WASM}`);

const qpdfWasm = JSON.parse(
	readFileSync('node_modules/@neslinesli93/qpdf-wasm/package.json', 'utf8')
);
const qpdf = readFileSync('node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.js', 'utf8');
const handler = readFileSync('src/qpdf-handler.js', 'utf8');

const stylesheet = readFileSync('src/xfa-layer.css', 'utf8');

// Liberation Sans, Serif and Mono 2.1.5, and Carlito at googlefonts/carlito
// 3a810ca, under the SIL Open Font License 1.1. pdfjs-dist has Liberation Sans
// 1.07.4 in standard_fonts/, under GPL v2 with a font exception.
const FACES = 'src/faces';
const FACE_HASHES = {
	'LiberationSans-Regular.ttf': '76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8',
	'LiberationSans-Bold.ttf': '788abee4c806d660e8aee46689dd8540cd4bb98da03dcc9d171ce3efd99a9173',
	'LiberationSans-Italic.ttf': 'e5bae5c4cde31f22142753855f4f8fb86da6ff39955ed3c0a11248b0d16948b0',
	'LiberationSans-BoldItalic.ttf':
		'698da70fc191cc5f33ad4d6d3fe830fe4624b898ea2e3169955928b7c491f1ee',
	'LiberationSerif-Regular.ttf': '058ea80864aef09a23f45cbec2bb5400bc3dfbdea01c3f10538a21fcb497fb74',
	'LiberationSerif-Bold.ttf': 'd754ba427cfe0bca54ae052384baa8f842da5bd6550ad4da024ac441e7a7d5ce',
	'LiberationSerif-Italic.ttf': '0e3dea9f8d613e006ccfa62201f33e265d19167bd0907725c3e145368b04fc2e',
	'LiberationSerif-BoldItalic.ttf':
		'f17db8af71e24d2066b587546021d4f0b296be389512b658dec3c09affeb11a7',
	'LiberationMono-Regular.ttf': 'f2b83c763e8afd21709333370bed4774337fae82267937e2b5aea7e2fbd922c1',
	'LiberationMono-Bold.ttf': 'bd62a0672d0b9b6710b01df434c80ad54fa5f0835207eb7b17b7a761463067bb',
	'LiberationMono-Italic.ttf': '605c01c711b44480a7508d349dfbf3264e81fa43d69e61cfa7d10b86e764c4d1',
	'LiberationMono-BoldItalic.ttf':
		'79451f3c09fe25116098853b7a2ca6e2436220ccc11af022979adbcf195be130',
	'Carlito-Regular.ttf': 'f6418f708baede9789daef5d458c0f53d2a888af9820e8062934e504fedc6595',
	'Carlito-Bold.ttf': 'bb5d20f79b82599ec72983597437373a80f2d2085fa91fc144fd74e876a594db',
	'Carlito-Italic.ttf': '0b019225e58d702bfedcbd35c21696769f8ee115cb6343f84c2f240312450d1c',
	'Carlito-BoldItalic.ttf': 'b32928186c119599e03ca6a1ffc680fdcb7fac95772f4b95d989cf6cd3861517'
};
const faces = Object.entries(FACE_HASHES).map(([name, expected]) => {
	const face = readFileSync(`${FACES}/${name}`);
	const found = hash('sha256', face);
	if (found !== expected) throw new Error(`${name} hashes to ${found}, expected ${expected}`);
	return [name, face];
});

rmSync('assets', { recursive: true, force: true });
mkdirSync('assets');
for (const [name, content] of [
	[
		'pdf.worker.js',
		`/* The worker of pdfjs-dist ${version} (build/pdf.worker.mjs), changed: a null guard added at two sites, a page's first unsplittable node no longer taken from an overflow leader or trailer, a page set made to clear its page areas' counts when it starts another pass, a field with no control or a default one given a text control, a field whose control has no HTML given a box for it so that its caption is laid out, a list bound to data the file does not hold left with the items its template lists, a span marked where a page's text embeds a page number or a page count that a layout script fills, an exception of the XFA layout thrown on after it is logged, a line of text broken only where it is wider than its box at the size the browser draws it, a field's limit on what is typed taken from its comb's cells where its text sets no maxChars or a larger one and passed on for a numeric field as for a text one, a font's horizontal scale folded into its size where the browser would draw it stretched or not at all, and the last line, which named a source map, removed. */\n` +
			worker
	],
	[
		'qpdf.worker.js',
		`/* dist/qpdf.js of @neslinesli93/qpdf-wasm ${qpdfWasm.version}, unchanged, and after it quillify's message handler. */\n` +
			qpdf +
			handler
	],
	['qpdf.wasm', wasm],
	...faces,
	['xfa-layer.js', `export default ${JSON.stringify(stylesheet)};\n`],
	['xfa-layer.d.ts', 'declare const stylesheet: string;\nexport default stylesheet;\n']
]) {
	writeFileSync(`assets/${name}`, content);
	console.log(`assets/${name}: ${Buffer.byteLength(content)} bytes`);
}
