import {
	PDFDict,
	PDFDocument,
	PDFHexString,
	PDFName,
	PDFRef,
	PDFString,
	type PDFPage
} from 'pdf-lib';
import { expect, it } from 'vitest';
import { viewsOf } from '../test/views.js';
import { stripAcroForm } from './strip.js';
import type { View } from './types.js';

const LINK = { Type: 'Annot', Subtype: 'Link', Rect: [10, 700, 110, 720] };
const HOSTILE = ['JavaScript', 'Launch', 'calc.exe', 'javascript:', 'PRIVATE'];
const SCRIPT = { S: 'JavaScript', JS: PDFString.of('app.alert(1)') };
const HTTPS = { S: 'URI', URI: PDFString.of('https://example.com/') };
const KEPT_LINK =
	'<< /Type /Annot /Subtype /Link /Rect [ 10 700 110 720 ] /A << /S /URI /URI (https://example.com/) >> >>';
const KEPT_PAGE = ['Contents', 'MediaBox', 'Parent', 'Resources', 'Type'];
const SHEET: View['box'] = [0, 0, 612, 792];
const CROPPED: View['box'] = [50, 40, 562, 752];
const SMALL: View['box'] = [0, 0, 300, 400];

/** A page that paints a line and holds one field, so it has a /Contents to keep and a widget to lose. */
function sheet(doc: PDFDocument, field: string): PDFPage {
	const page = doc.addPage([612, 792]);
	page.drawLine({ start: { x: 0, y: 0 }, end: { x: 612, y: 792 } });
	doc.getForm().createTextField(field).addToPage(page, { x: 10, y: 500, width: 200, height: 20 });
	return page;
}

/** The background of what `plant` makes of one sheet, each page framed by its box of `boxes`: one sheet as it is made, unless a case says otherwise. */
async function background(plant: (page: PDFPage) => void, boxes: View['box'][] = [SHEET]) {
	const source = await PDFDocument.create();
	plant(sheet(source, 'plain'));
	const saved = await source.save({ useObjectStreams: false });
	const bytes = await stripAcroForm(saved, await viewsOf(saved, boxes));
	const doc = await PDFDocument.load(bytes);
	return { doc, page: doc.getPage(0), text: new TextDecoder('latin1').decode(bytes) };
}

const keys = (dict: PDFDict) =>
	dict
		.keys()
		.map((key) => key.decodeText())
		.sort();

/** Each annotation the page lists, in PDF syntax on one line. */
const annotations = (page: PDFPage) =>
	(page.node.Annots()?.asArray() ?? []).map((entry) =>
		String(page.doc.context.lookup(entry)).replace(/\s+/g, ' ')
	);

/** A /URI action whose address is these bytes, one a character. */
const uri = (address: string) => ({
	S: 'URI',
	URI: PDFHexString.of(
		[...address].map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('')
	)
});

const linked = (carried: object) => (page: PDFPage) =>
	page.node.addAnnot(page.doc.context.register(page.doc.context.obj({ ...LINK, ...carried })));

it('keeps of a page what paints and tags it, and nothing that acts or rides along', async () => {
	const { page, text } = await background(({ node, doc: { context } }) => {
		const carried = context.obj({
			AA: { O: SCRIPT },
			PresSteps: { Type: 'NavNode', NA: SCRIPT },
			AF: [{ Type: 'Filespec', F: PDFString.of('PRIVATE.txt') }],
			Thumb: context.register(context.stream('PRIVATE-THUMBNAIL')),
			Metadata: context.register(context.stream('PRIVATE-METADATA')),
			PieceInfo: { Editor: { Private: PDFString.of('PRIVATE-DATA') } },
			LastModified: PDFString.of('D:20260101000000Z'),
			B: [{ Type: 'Bead' }],
			Marked: true,
			ArtBox: [0, 0, 612, 792],
			BleedBox: [0, 0, 612, 792],
			TrimBox: [0, 0, 612, 792],
			Rotate: 0,
			UserUnit: 1000,
			Group: { Type: 'Group', S: 'Transparency' },
			StructParents: 0,
			Tabs: 'S'
		});
		for (const [key, value] of carried.entries()) node.set(key, value);
	});
	expect(keys(page.node)).toEqual([
		'Contents',
		'Group',
		'MediaBox',
		'Parent',
		'Resources',
		'Rotate',
		'StructParents',
		'Tabs',
		'Type'
	]);
	for (const marker of HOSTILE) expect(text).not.toContain(marker);
});

it('keeps of the catalog its pages, and nothing a reader acts on or resolves a name by', async () => {
	const { doc, text } = await background(({ doc: { catalog, context } }) => {
		const carried = context.obj({
			Perms: { UR3: { Type: 'Sig', Contents: PDFString.of('PRIVATE-SIGNATURE') } },
			Collection: { View: 'D' },
			Names: { Dests: { Names: [PDFString.of('chapter'), [0, 'Fit']] } },
			Dests: { chapter: [0, 'Fit'] },
			OpenAction: SCRIPT,
			AA: { WC: SCRIPT },
			URI: { Base: PDFString.of('file:///PRIVATE/') },
			PieceInfo: { Editor: { Private: PDFString.of('PRIVATE-DATA') } }
		});
		for (const [key, value] of carried.entries()) catalog.set(key, value);
	});
	expect(keys(doc.catalog)).toEqual(['Pages', 'Type']);
	for (const marker of HOSTILE) expect(text).not.toContain(marker);
});

it('keeps of a page tree node its place and what its pages inherit, and gives the page the box it showed', async () => {
	const { doc, page, text } = await background(
		({ doc: { catalog, context } }) => {
			const carried = context.obj({
				CropBox: [0, 0, 300, 400],
				Resources: { Font: {} },
				Rotate: 0,
				AA: { O: SCRIPT }
			});
			for (const [key, value] of carried.entries()) catalog.Pages().set(key, value);
		},
		[SMALL]
	);
	expect(keys(doc.catalog.Pages())).toEqual(['Count', 'Kids', 'Resources', 'Rotate', 'Type']);
	expect(page.getMediaBox()).toEqual({ x: 0, y: 0, width: 300, height: 400 });
	expect(page.getCropBox()).toEqual(page.getMediaBox());
	for (const marker of HOSTILE) expect(text).not.toContain(marker);
});

it("keeps a page's own box when its tree declares another", async () => {
	const { page } = await background(
		(sheet) => {
			sheet.setCropBox(50, 40, 512, 712);
			sheet.doc.catalog.Pages().set(PDFName.of('CropBox'), sheet.doc.context.obj([0, 0, 100, 100]));
		},
		[CROPPED]
	);
	expect(page.getMediaBox()).toEqual({ x: 50, y: 40, width: 512, height: 712 });
	expect(page.getCropBox()).toEqual(page.getMediaBox());
});

it('cuts a page tree node below the root as it cuts the root', async () => {
	const { doc, text } = await background(
		(first) => {
			const { context, catalog } = first.doc;
			const second = sheet(first.doc, 'second');
			const inner = context.register(
				context.obj({
					Type: 'Pages',
					Parent: catalog.get(PDFName.of('Pages')),
					Kids: [second.ref],
					Count: 1,
					CropBox: [0, 0, 300, 400],
					AA: { O: SCRIPT }
				})
			);
			second.node.set(PDFName.of('Parent'), inner);
			catalog.Pages().Kids().set(1, inner);
		},
		[SHEET, SMALL]
	);
	const [, inner] = doc.catalog.Pages().Kids().asArray();
	expect(keys(doc.context.lookup(inner) as PDFDict)).toEqual(['Count', 'Kids', 'Parent', 'Type']);
	expect(doc.getPage(1).getMediaBox()).toEqual({ x: 0, y: 0, width: 300, height: 400 });
	for (const marker of HOSTILE) expect(text).not.toContain(marker);
});

it('deletes a page outside the page tree that the tags still name', async () => {
	const { text } = await background(({ doc: { catalog, context } }) => {
		const orphan = context.register(context.obj({ Type: 'Page', AA: { O: SCRIPT } }));
		catalog.set(
			PDFName.of('StructTreeRoot'),
			context.obj({ Type: 'StructTreeRoot', K: [{ Type: 'StructElem', S: 'P', Pg: orphan }] })
		);
	});
	for (const marker of HOSTILE) expect(text).not.toContain(marker);
});

it('reads a page whose /Annots is no array as a page with no annotation', async () => {
	const { page } = await background(({ node, doc: { context } }) =>
		node.set(PDFName.of('Annots'), context.obj(7))
	);
	expect(page.node.has(PDFName.of('Annots'))).toBe(false);
});

it.each([
	[
		'a link to a javascript: address, with a /Next to a /Launch',
		{
			A: {
				S: 'URI',
				URI: PDFString.of('javascript:alert(1)'),
				Next: { S: 'Launch', F: PDFString.of('calc.exe') }
			}
		}
	],
	[
		'a link to a javascript: address that quotes an https one',
		{ A: { S: 'URI', URI: PDFString.of('javascript:open("https://example.com/")') } }
	],
	[
		'a link to an https address, with a /Next to another',
		{ A: { ...HTTPS, Next: { S: 'URI', URI: PDFString.of('https://example.com/next') } } }
	],
	[
		'a link to an https address, with an explicit destination beside it',
		{ A: HTTPS, Dest: [0, 'Fit'] }
	],
	['a link to an address written as a name', { A: { S: 'URI', URI: 'https://example.com/' } }],
	[
		'a link to an address with a space before its scheme',
		{ A: { S: 'URI', URI: PDFString.of(' http://example.com/') } }
	],
	[
		'a link to a file: address',
		{ A: { S: 'URI', URI: PDFString.of('file:///C:/PRIVATE/form.pdf') } }
	],
	...[
		'example.com/PRIVATE',
		'www.example/PRIVATE',
		'WWW.EXAMPLE.COM/PRIVATE',
		'www.example.com/../../PRIVATE',
		'www.example.com/a/%2E%2e/PRIVATE',
		'www.example.com/./PRIVATE',
		'www.example.com/..',
		'www.example.com\\..\\PRIVATE',
		'www.example.com /PRIVATE',
		'www.example.com/\tPRIVATE',
		'www.example.com/\x00PRIVATE',
		'www.example.com/\x7fPRIVATE',
		'www.example.com/\xe9PRIVATE',
		' www.example.com/PRIVATE',
		'www.example.com@PRIVATE.example.com',
		'www.example.com:8080/PRIVATE',
		'www..example.com/PRIVATE',
		'www.ex_ample.com/PRIVATE',
		'www.%65xample.com/PRIVATE',
		'www.PRIVATE.example.com./a',
		'mailto:',
		'mailto:?to=PRIVATE@example.com',
		'mailto:PRIVATE@example.com,other@example.com',
		'mailto:PRIVATE@example.com;other@example.com',
		'mailto:PRIVATE @example.com',
		'mailto:PRIVATE@example.com\r\nBcc: other@example.com',
		'mailto:PRIVATE\x00@example.com',
		'mailto:<PRIVATE@example.com>',
		'mailto:"PRIVATE"@example.com',
		"mailto:PRIVATE'@example.com",
		'mailto:PRIVATE%40example.com@example.com',
		'mailto:PRIVATE@example.com#top',
		'mailto:PRIVATE',
		'mailto:PRIVATE@@example.com',
		'mailto:PRIVATE@example',
		'mailto:PRIVATE@[192.0.2.1]',
		'mailto:.PRIVATE@example.com',
		'mailto:PRIVATE\\@example.com',
		'mailto:PRIVATE@\xe9xample.com',
		'mailto: PRIVATE@example.com',
		' mailto:PRIVATE@example.com',
		'ftp://example.com/PRIVATE',
		'FILE:///C:/PRIVATE/form.pdf',
		'tel:PRIVATE'
	].map((address) => [`a link to ${JSON.stringify(address)}`, { A: uri(address) }]),
	[
		'a link to an address spelled in UTF-16, which a URI never is',
		{ A: { S: 'URI', URI: PDFHexString.fromText('https://example.com/') } }
	],
	[
		'a link that launches a file, though it holds an https address and a destination too',
		{ A: { ...HTTPS, S: 'Launch', F: PDFString.of('calc.exe'), D: [0, 'Fit'] } }
	],
	['a link that runs a script', { A: SCRIPT }],
	['a link to a named destination', { Dest: PDFString.of('chapter') }],
	['a link to a named destination, through a /GoTo', { A: { S: 'GoTo', D: 'chapter' } }],
	[
		'a link to an explicit destination through a /GoTo, with a /Next',
		{ A: { S: 'GoTo', D: [0, 'Fit'], Next: SCRIPT } }
	],
	[
		'a link to an explicit destination through a /GoTo, with another beside it',
		{ A: { S: 'GoTo', D: [0, 'Fit'] }, Dest: [0, 'Fit'] }
	],
	[
		'a link whose action is a reference to nothing, with an explicit destination beside it',
		{ A: PDFRef.of(999), Dest: [0, 'Fit'] }
	],
	['a link that leads nowhere', {}],
	['a screen annotation that leads to an https address', { Subtype: 'Screen', A: HTTPS }]
] as [string, { Subtype?: string }][])('removes %s', async (_, carried) => {
	const { page, text } = await background(linked(carried));
	expect(annotations(page)).toEqual([]);
	// Off the page is not out of the file: the object itself has to be gone.
	expect(text).not.toContain(`/Subtype /${carried.Subtype ?? 'Link'}`);
	for (const marker of HOSTILE) expect(text).not.toContain(marker);
});

it.each(['https://example.com/', 'http://example.com/', 'HTTPS://EXAMPLE.COM/'])(
	'keeps a link to %s as the only annotation, with the keys a link needs and no others',
	async (address) => {
		const { page, text } = await background(({ node, ref, doc: { context } }) =>
			node.addAnnot(
				context.register(
					context.obj({
						...LINK,
						Border: [0, 0, 1],
						BS: { W: 1 },
						C: [0, 0, 1],
						H: 'I',
						QuadPoints: [10, 720, 110, 720, 10, 700, 110, 700],
						F: 4,
						Contents: PDFString.of('Instructions'),
						StructParent: 0,
						OC: { Type: 'OCG', Name: PDFString.of('Layer') },
						T: PDFString.of('PRIVATE-AUTHOR'),
						NM: PDFString.of('PRIVATE-NAME'),
						P: ref,
						[`PRIVATE${'x'.repeat(200_000)}`]: 1,
						AA: { U: SCRIPT },
						PA: SCRIPT,
						AP: { N: context.register(context.stream('PRIVATE-APPEARANCE')) },
						A: { Type: 'Action', S: 'URI', URI: PDFString.of(address), IsMap: true }
					})
				)
			)
		);
		expect(annotations(page)).toEqual([
			`<< /Type /Annot /Subtype /Link /Rect [ 10 700 110 720 ] /Border [ 0 0 1 ] /BS << /W 1 >> /C [ 0 0 1 ] /H /I /QuadPoints [ 10 720 110 720 10 700 110 700 ] /F 4 /Contents (Instructions) /StructParent 0 /OC << /Type /OCG /Name (Layer) >> /A << /S /URI /URI (${address}) >> >>`
		]);
		for (const marker of HOSTILE) expect(text).not.toContain(marker);
	}
);

it('keeps a link to an https address 200,000 characters long', async () => {
	const { page } = await background(
		linked({ A: { S: 'URI', URI: PDFString.of(`https://${'a'.repeat(200_000)}`) } })
	);
	expect(annotations(page)).toHaveLength(1);
});

it('keeps a link whose address is a hex string of ASCII', async () => {
	const { page } = await background(
		linked({
			A: { S: 'URI', URI: PDFHexString.of('68747470733a2f2f6578616d706c652e636f6d2f') }
		})
	);
	expect(annotations(page)).toEqual([
		'<< /Type /Annot /Subtype /Link /Rect [ 10 700 110 720 ] /A << /S /URI /URI <68747470733a2f2f6578616d706c652e636f6d2f> >> >>'
	]);
});

it.each([
	['www.example.com', 'http://www.example.com/'],
	['www.example.gov/forms', 'http://www.example.gov/forms'],
	['www.Example.gov/a_(1).pdf?b=c&d=..#e', 'http://www.example.gov/a_(1).pdf?b=c&d=..#e'],
	['www.example/forms.pdf', 'http://www.example/forms.pdf'],
	['www.xn--bcher-kva.example/forms', 'http://www.xn--bcher-kva.example/forms'],
	['www.example.com/a..b/.c/', 'http://www.example.com/a..b/.c/'],
	['www.example.com/a"b<c>{d}`', 'http://www.example.com/a%22b%3Cc%3E%7Bd%7D%60'],
	['mailto:office@example.com', 'mailto:office@example.com'],
	['MAILTO:Office.Desk+forms@Example.com', 'mailto:Office.Desk+forms@Example.com'],
	[
		'mailto:office@example.com?subject=PRIVATE&body=PRIVATE&attach=C:\\PRIVATE',
		'mailto:office@example.com'
	],
	['mailto:office@example.com?', 'mailto:office@example.com']
])('keeps a link to %s as a link to %s, and nothing else of the address', async (from, to) => {
	const { page, text } = await background(linked({ A: { ...uri(from), Type: 'Action' } }));
	expect(annotations(page)).toHaveLength(1);
	const action = page.doc.context
		.lookup(page.node.Annots()!.get(0), PDFDict)
		.lookup(PDFName.of('A'), PDFDict);
	expect(keys(action)).toEqual(['S', 'URI']);
	const address = action.lookup(PDFName.of('URI'));
	expect(address).toBeInstanceOf(PDFHexString);
	expect(String.fromCharCode(...(address as PDFHexString).asBytes())).toBe(to);
	expect(text).not.toContain('PRIVATE');
});

it('keeps a link to a www. address 200,000 characters long', async () => {
	const { page } = await background(linked({ A: uri(`www.example.com/${'a'.repeat(200_000)}`) }));
	expect(annotations(page)).toHaveLength(1);
});

it('drops a link to a www. address no URL reads, and keeps one beside it, where URL has no parse', async () => {
	const parse = URL.parse;
	delete (URL as { parse?: unknown }).parse;
	try {
		const { page, text } = await background((sheet) => {
			linked({ A: uri('www.PRIVATE.1') })(sheet);
			linked({ A: uri('www.example.com') })(sheet);
		});
		expect(annotations(page)).toHaveLength(1);
		expect(text).not.toContain('PRIVATE');
	} finally {
		URL.parse = parse;
	}
});

it('keeps a link to an http address as the file wrote it, though www. ones beside it are rewritten', async () => {
	const { page } = await background((sheet) => {
		linked({ A: uri('www.example.com') })(sheet);
		linked({ A: { S: 'URI', URI: PDFString.of('http://www.Example.com/../a') } })(sheet);
	});
	expect(annotations(page)[1]).toBe(
		'<< /Type /Annot /Subtype /Link /Rect [ 10 700 110 720 ] /A << /S /URI /URI (http://www.Example.com/../a) >> >>'
	);
});

it('keeps a link that a page, the link and its action reach through references', async () => {
	const { page } = await background(({ node, doc: { context } }) => {
		const link = context.register(
			context.obj({
				...LINK,
				Subtype: context.register(PDFName.of('Link')),
				A: context.register(
					context.obj({
						S: context.register(PDFName.of('URI')),
						URI: context.register(PDFString.of('https://example.com/'))
					})
				)
			})
		);
		const listed = node.Annots()!.asArray();
		node.set(PDFName.of('Annots'), context.register(context.obj([...listed, link])));
	});
	expect(annotations(page)).toHaveLength(1);
});

it('keeps a link to an explicit destination in the file', async () => {
	const { page } = await background((sheet) =>
		linked({ Dest: [sheet.ref, 'XYZ', 0, 792, null] })(sheet)
	);
	expect(annotations(page)).toEqual([
		`<< /Type /Annot /Subtype /Link /Rect [ 10 700 110 720 ] /Dest [ ${page.ref} /XYZ 0 792 null ] >>`
	]);
});

it('keeps a link that reaches its destination through a reference, on the link or in a /GoTo', async () => {
	const { page } = await background(({ node, ref, doc: { context } }) => {
		const fit = () => context.register(context.obj([ref, 'Fit']));
		const goTo = context.register(PDFName.of('GoTo'));
		node.addAnnot(context.register(context.obj({ ...LINK, Dest: fit() })));
		node.addAnnot(context.register(context.obj({ ...LINK, A: { S: goTo, D: fit() } })));
	});
	expect(annotations(page)).toHaveLength(2);
});

it('keeps a link to an explicit destination through a /GoTo, with the keys its action needs and no others', async () => {
	const { page, text } = await background((sheet) =>
		linked({
			A: {
				Type: 'Action',
				S: 'GoTo',
				D: [sheet.ref, 'Fit'],
				URI: PDFString.of('javascript:alert(1)')
			}
		})(sheet)
	);
	expect(annotations(page)).toEqual([
		`<< /Type /Annot /Subtype /Link /Rect [ 10 700 110 720 ] /A << /S /GoTo /D [ ${page.ref} /Fit ] >> >>`
	]);
	for (const marker of HOSTILE) expect(text).not.toContain(marker);
});

it('gives a link that names itself as its action an action of its own', async () => {
	const { page } = await background(({ node, doc: { context } }) => {
		const link = context.nextRef();
		context.assign(link, context.obj({ ...LINK, ...HTTPS, A: link }));
		node.addAnnot(link);
	});
	expect(annotations(page)).toEqual([KEPT_LINK]);
});

it('leaves a page whole when a link names the page as its action', async () => {
	const { page } = await background(({ node, ref, doc: { context } }) => {
		for (const [key, value] of context.obj(HTTPS).entries()) node.set(key, value);
		node.addAnnot(context.register(context.obj({ ...LINK, A: ref })));
	});
	expect(keys(page.node)).toEqual(['Annots', ...KEPT_PAGE]);
	expect(annotations(page)).toEqual([KEPT_LINK]);
});

it('does not take a page for a link, though the page lists itself as one', async () => {
	const { page } = await background(({ node, ref, doc: { context } }) => {
		for (const [key, value] of context.obj({ ...LINK, Type: 'Page', A: HTTPS }).entries())
			node.set(key, value);
		node.addAnnot(ref);
	});
	expect(keys(page.node)).toEqual(KEPT_PAGE);
});

it('treats a second page as it treats the first', async () => {
	const { doc, text } = await background(
		(first) => {
			const second = sheet(first.doc, 'second');
			second.setCropBox(50, 40, 512, 712);
			second.node.set(PDFName.of('AA'), first.doc.context.obj({ O: SCRIPT }));
			linked({
				T: PDFString.of('PRIVATE-AUTHOR'),
				AA: { U: SCRIPT },
				A: { ...HTTPS, IsMap: true, Next: null, JS: PDFString.of('PRIVATE-SCRIPT') }
			})(second);
			linked({ A: SCRIPT })(second);
		},
		[SHEET, CROPPED]
	);
	expect(doc.getPageCount()).toBe(2);
	const second = doc.getPage(1);
	expect(keys(second.node)).toEqual(['Annots', ...KEPT_PAGE]);
	expect(annotations(second)).toEqual([KEPT_LINK]);
	expect(second.getMediaBox()).toEqual({ x: 50, y: 40, width: 512, height: 712 });
	for (const marker of HOSTILE) expect(text).not.toContain(marker);
});
