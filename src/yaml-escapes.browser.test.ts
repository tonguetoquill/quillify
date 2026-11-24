/**
 * The engine's YAML reader refuses U+007F to U+0084, U+0086 to U+009F, U+FFFE,
 * U+FFFF and a lone surrogate, and JSON writes the first four groups raw. A
 * string from the file with one of them in a tooltip, an option or an example
 * still builds a quill, the engine reads the string back, and the example
 * renders.
 */

import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';
import { fromTree, render } from '../test/engine.js';
import { quillify, suggest } from './index.js';
import type { Field, Form } from './index.js';

const at = (y: number): Field['places'] => [{ page: 0, rect: { x: 72, y, w: 200, h: 20 } }];
const plain = { required: false, readOnly: false };

const CHARACTERS = [
	['U+007F', '\u007f', '\u007f'],
	['U+0080', '\u0080', '\u0080'],
	['U+0085', '\u0085', '\u0085'],
	['U+009F', '\u009f', '\u009f'],
	['U+FFFE', '\ufffe', '\ufffe'],
	['U+FFFF', '\uffff', '\uffff'],
	['a lone high surrogate', '\ud800', '\ufffd'],
	['a lone low surrogate', '\udc00', '\ufffd'],
	['U+1F600, which is two units', '\u{1F600}', '\u{1F600}']
] as const;
const SLOTS = ['the quill description', 'a tooltip', 'an option', 'an example'] as const;

it.each(CHARACTERS.flatMap((character) => SLOTS.map((slot) => [slot, ...character] as const)))(
	'%s holds %s, and the engine reads it back',
	async (slot, _, c, back) => {
		const put = (where: (typeof SLOTS)[number]) => (where === slot ? c : '');
		const fields: Field[] = [
			{
				...plain,
				id: 'note',
				kind: 'text',
				multiline: false,
				places: at(100),
				tooltip: `Unit${put('a tooltip')}code`
			},
			{
				...plain,
				id: 'pick',
				kind: 'choice',
				places: at(130),
				options: [`A${put('an option')}`, 'B']
			},
			{ ...plain, id: 'sample', kind: 'text', multiline: false, places: at(160) },
			{
				...plain,
				id: 'signed',
				kind: 'signature',
				places: at(190),
				tooltip: `Sign${put('a tooltip')}here`
			}
		];
		const doc = await PDFDocument.create();
		doc.addPage([612, 792]);
		const pdf = await doc.save({ useObjectStreams: false });
		const form: Form = { pdf, pages: [{ width: 612, height: 792 }], fields };
		const naming = {
			name: 'x',
			description: `Form${put('the quill description')}`,
			fields: suggest(fields).map((entry) =>
				entry.id === 'sample' ? { ...entry, example: `Sample${put('an example')}` } : entry
			)
		};
		const [note, pick, sample] = naming.fields;

		const quillified = await quillify(form, naming);
		if (!quillified.ok) throw new Error(JSON.stringify(quillified.problems));
		const { quill } = await fromTree(quillified.tree);

		const here = (where: (typeof SLOTS)[number]) => (where === slot ? back : '');
		expect(quill.metadata.description).toBe(`Form${here('the quill description')}`);
		const { fields: schema } = quill.schema.main;
		expect(schema[note.name].description).toBe(`Unit${here('a tooltip')}code`);
		expect(schema[pick.name].values).toEqual([`A${here('an option')}`, 'B']);

		const example = quill.exampleDocument()!;
		const { payloadItems } = example.main;
		const markdown = example.toMarkdown();
		example.free();
		// A one-line text value drops its trailing whitespace, and U+0085 is whitespace.
		const line = `Sample${here('an example')}`.replace(/\u0085$/, '');
		expect(payloadItems).toEqual([
			{ type: 'field', key: pick.name, value: `A${here('an option')}` },
			// A text value is content, its plain text beside its blocks.
			{
				type: 'field',
				key: sample.name,
				value: expect.objectContaining({ codec: 'plain', text: line })
			}
		]);
		expect((await render(quill, markdown)).length).toBeGreaterThan(0);
	},
	60_000
);
