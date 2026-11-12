/**
 * A background is what the strip's table says and nothing else (#25).
 * `test/background.ts` has qpdf write the saved bytes as JSON and walks that
 * from the trailer with a walker of its own, which shares the table with the
 * strip as data and none of its code. For the thirteen fixtures, for a form of
 * each builder in `test/` and for the files of `HOSTILE`, built here from
 * bytes:
 *
 * - every key of every dictionary is in the row of its kind, and every value is
 *   what its key leads to;
 * - every object the file holds is reached, and none as two kinds;
 * - every reference resolves. qpdf's JSON leaves out a key that references an
 *   object the file does not hold, so pdf-lib reads the same bytes for this
 *   one. It is the strip's own parser.
 *
 * Three things here do not come from the table, so that a row which lets a
 * wrong key through is not what clears it:
 *
 * - `NEVER`, a list written by hand, of keys and names that no dictionary of
 *   any object may hold, at any depth, reached or not. A dictionary by name is
 *   left out, since its keys are the file's own names for its fonts, its
 *   classes and its roles. `/Names` is also the key of an `/IDTree` leaf, and
 *   is held to that one kind.
 * - `test/goldens/background.keys.json`: the keys the thirteen fixtures hold,
 *   by kind. A row that lets a new key through on a fixture is a change to that
 *   file, which a reviewer reads.
 * - no row of the table says `*`.
 */

import { PDFDocument, PDFName, PDFString, type PDFRef } from 'pdf-lib';
import { expect, it } from 'vitest';
import { walked } from '../test/background.js';
import { dd2977Shape } from '../test/dd2977-shape.js';
import { dynamicFlow, dynamicForm, templateForm } from '../test/dynamic-form.js';
import golden from '../test/goldens/background.keys.json' with { type: 'json' };
import { sharedNameCheckboxes } from '../test/shared-name-checkboxes.js';
import { viewsOf } from '../test/views.js';
import { sanitize } from './sanitize.js';
import { KINDS, stripAcroForm } from './strip.js';

const NEVER =
	'Metadata Thumb AA OpenAction EmbeddedFile EF Filespec JS JavaScript Launch RichMedia 3D AF Ref ' +
	'Measure OPI AcroForm XFA Dests Outlines Info AP FT Perms Encrypt Collection NeedsRendering ' +
	'PieceInfo LastModified FFilter FDecodeParms Next';

const fixtures = import.meta.glob<string>('../test/fixtures/*.pdf', {
	query: '?url',
	import: 'default',
	eager: true
});

const FIELD = '<field name="a" x="20pt" y="20pt" w="200pt" h="20pt"><ui><textEdit/></ui></field>';
const SHEET = `<subform layout="position" w="612pt" h="792pt">${FIELD}</subform>`;
const BUILT: Record<string, () => Promise<Uint8Array>> = {
	'a plain form of three pages': dd2977Shape,
	'a form of checkboxes that share a name': sharedNameCheckboxes,
	'a dynamic form of one page': () => dynamicForm(FIELD),
	'a dynamic form that flows onto two pages': () => dynamicFlow(SHEET + SHEET),
	'a dynamic form whose one page area occurs once': () =>
		templateForm(
			`<template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"><subform name="form1" layout="tb"><pageSet><pageArea name="Page1"><contentArea w="612pt" h="792pt"/><medium short="612pt" long="792pt"/><occur max="1"/></pageArea></pageSet>${SHEET}${SHEET}</subform></template>`
		)
};

/** The background of a file, walked. */
async function background(pdf: Uint8Array) {
	const read = await sanitize(pdf);
	if (!read.ok) throw new Error(`refused as ${read.refusal.code}`);
	return walked(read.form.pdf);
}

/** What a walk found that the table does not say, and each name of `NEVER` it met. */
const wrong = ({ problems, held, names }: Awaited<ReturnType<typeof walked>>) => ({
	problems,
	never: NEVER.split(' ').filter((name) => names.has(name)),
	names: [...held].flatMap(([kind, keys]) => (kind !== 'ids' && keys.has('Names') ? [kind] : []))
});
const RIGHT = { problems: [], never: [], names: [] };

const ofFixtures = Object.entries(fixtures).map(([path, url]) => ({
	name: path.slice(path.lastIndexOf('/') + 1).replace(/(_.*)?\.pdf$/, ''),
	graph: fetch(url)
		.then((response) => response.arrayBuffer())
		.then((buffer) => background(new Uint8Array(buffer)))
}));
// A walk that fails rejects in the test that awaits it, and nowhere before.
for (const { graph } of ofFixtures) graph.catch(() => {});

for (const { name, graph } of ofFixtures)
	it(`${name}: the background holds what the table lists, and every object of it is reached as one kind`, async () => {
		expect(wrong(await graph)).toEqual(RIGHT);
	}, 120_000);

for (const [name, build] of Object.entries(BUILT))
	it(`${name}: the background holds what the table lists, and every object of it is reached as one kind`, async () => {
		expect(wrong(await background(await build()))).toEqual(RIGHT);
	}, 120_000);

/** What a file of one page puts on its catalog, and as `Resources` on its page. The page lists as an annotation every object `made` registers. */
type Hostile = (made: (keys: object) => PDFRef, here: PDFRef) => Record<string, object>;
const WIDGET = { Subtype: 'Widget', FT: 'Tx', V: PDFString.of('x'), Rect: [0, 0, 1, 1] };
const HOSTILE: Record<string, Hostile> = {
	'a widget the tags name in the parent tree and in the ID tree': (made) => {
		const widget = made(WIDGET);
		const IDTree = { Names: [PDFString.of('a'), widget] };
		return { StructTreeRoot: { ParentTree: { Nums: [0, [widget, [widget]]] }, IDTree } };
	},
	'an object reference to a kept link that two elements and the parent tree share': (
		made,
		here
	) => {
		const link = made({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 1, 1], Dest: ['Fit'] });
		const shared = made({ Type: 'OBJR', Obj: link, Pg: here });
		const K = [
			{ S: 'Link', K: shared },
			{ S: 'Link', K: [shared, shared] }
		];
		return { StructTreeRoot: { K, ParentTree: { Nums: [0, shared] } } };
	},
	'layers, tags and mark information in one file': (made, here) => {
		const group = made({ Type: 'OCG', Name: PDFString.of('x') });
		return {
			OCProperties: { OCGs: [group], D: { OFF: [group], Order: [group, [group]] } },
			MarkInfo: { Marked: true },
			Resources: { Properties: { MC0: group, MC1: { Type: 'OCMD', OCGs: group } } },
			StructTreeRoot: { K: { S: 'P', Pg: here, K: [0, { Type: 'MCR', Pg: here, MCID: 1 }] } }
		};
	}
};

/** A file the strip refuses: a key reaches a widget as a kind. */
const REFUSED: Record<string, Hostile> = {
	'a widget the tags name as an element': (made) => ({ StructTreeRoot: { K: [made(WIDGET)] } }),
	'a widget that is a /RoleMap, a /ClassMap and a /Font': (made) => {
		const widget = made(WIDGET);
		return { StructTreeRoot: { RoleMap: widget, ClassMap: widget }, Resources: { Font: widget } };
	}
};

/** What the strip makes of the file of a case. */
async function stripped(plant: Hostile) {
	const doc = await PDFDocument.create();
	const { context, catalog } = doc;
	const { node, ref } = doc.addPage([612, 792]);
	const annots: PDFRef[] = [];
	const made = (keys: object) =>
		annots[annots.push(context.register(context.obj(keys as never))) - 1];
	for (const [key, keys] of Object.entries(plant(made, ref)))
		(key === 'Resources' ? node : catalog).set(PDFName.of(key), context.obj(keys as never));
	node.set(PDFName.of('Annots'), context.obj(annots));
	const saved = await doc.save({ useObjectStreams: false });
	return stripAcroForm(saved, await viewsOf(saved, [[0, 0, 612, 792]]));
}

for (const [name, plant] of Object.entries(HOSTILE))
	it(`${name}: the background holds what the table lists, and every object of it is reached as one kind`, async () => {
		expect(wrong(await walked(await stripped(plant)))).toEqual(RIGHT);
	}, 120_000);

for (const [name, plant] of Object.entries(REFUSED))
	it(`${name}: the file is refused as damaged`, async () => {
		await expect(stripped(plant)).rejects.toMatchObject({ refusal: { code: 'damaged' } });
	});

it('the thirteen fixtures hold, kind by kind, the keys the golden records', async () => {
	const held = new Map<string, Set<string>>();
	for (const { graph } of ofFixtures)
		for (const [kind, keys] of (await graph).held)
			held.set(kind, new Set([...(held.get(kind) ?? []), ...keys]));
	const sorted = Object.fromEntries(
		[...held].sort(([a], [b]) => (a < b ? -1 : 1)).map(([kind, keys]) => [kind, [...keys].sort()])
	);
	expect(sorted).toEqual(golden);
}, 120_000);

it('no row of the table keeps a value whole', () => {
	expect(Object.entries(KINDS).filter(([, keys]) => /(^|[: ])\*/.test(keys))).toEqual([]);
});
