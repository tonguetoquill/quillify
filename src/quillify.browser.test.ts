import { PDFCheckBox, PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { fromTree, render } from '../test/engine.js';
import { sharedNameCheckboxes } from '../test/shared-name-checkboxes.js';
import { quillify, sanitize, suggest } from './index.js';
import type { Field, FieldNaming, Form, Naming } from './index.js';

const fixtures = import.meta.glob<string>('../test/fixtures/*.pdf', {
	query: '?url',
	import: 'default',
	eager: true
});

const text = (tree: Map<string, Uint8Array>, file: string) =>
	new TextDecoder().decode(tree.get(file));

/** The tree a naming builds, when it builds one. A problem fails the case that asks. */
async function built(form: Form, fields: FieldNaming[]): Promise<Map<string, Uint8Array>> {
	const quillified = await quillify(form, { name: 'x', description: 'A form.', fields });
	if (!quillified.ok) throw new Error(JSON.stringify(quillified.problems));
	return quillified.tree;
}

// DD 1610 has a read-only field, SF 1152 paints each of its 30 fields twice, and DAF 1288 is dynamic.
it.each(['DD1610', 'SF1152', 'DAF1288'])(
	'%s builds into a quill from suggest alone, with an entry for every place',
	async (name) => {
		const [, url] = Object.entries(fixtures).find(([path]) => path.includes(`/${name}_`))!;
		const sanitized = await sanitize(new Uint8Array(await (await fetch(url)).arrayBuffer()));
		if (!sanitized.ok) throw new Error(`${name} was refused as ${sanitized.refusal.code}`);
		const { form } = sanitized;

		const tree = await built(form, suggest(form.fields));
		expect([...tree.keys()]).toEqual(expect.arrayContaining(['Quill.yaml', 'Form.yaml']));
		expect(tree.get('form.pdf')).toBe(form.pdf);
		const { fields, widgets } = JSON.parse(text(tree, 'Form.yaml'));
		const places = form.fields
			.filter((field) => !field.readOnly)
			.reduce((count, field) => count + field.places.length, 0);
		expect(fields.length + widgets.length).toBe(places);
	},
	120_000
);

// SF 1152's Shares Total sets /MaxLen 3, and DAF 988's template sets maxChars 35 on its Name fields.
it.each([
	['SF1152', 3],
	['DAF988', 35]
])(
	'%s writes the limit its form sets on a text field as max: %i',
	async (name, cap) => {
		const [, url] = Object.entries(fixtures).find(([path]) => path.includes(`/${name}_`))!;
		const sanitized = await sanitize(new Uint8Array(await (await fetch(url)).arrayBuffer()));
		if (!sanitized.ok) throw new Error(`${name} was refused as ${sanitized.refusal.code}`);
		const tree = await built(sanitized.form, suggest(sanitized.form.fields));
		expect(text(tree, 'Quill.yaml')).toContain(`      max: ${cap}\n`);
	},
	120_000
);

it("ticks DAF 988's Ordinary leave box alone when its example is true", async () => {
	const [, url] = Object.entries(fixtures).find(([path]) => path.includes('/DAF988_'))!;
	const sanitized = await sanitize(new Uint8Array(await (await fetch(url)).arrayBuffer()));
	if (!sanitized.ok) throw new Error(`refused as ${sanitized.refusal.code}`);
	const ordinary = 'p1.PageArea1.AF988_Unlocked.Page1.Ordinary_mutexcl_grp.Conval_1';
	const naming = suggest(sanitized.form.fields).map((entry) =>
		entry.id === ordinary ? { ...entry, example: 'true' } : entry
	);
	const tree = await built(sanitized.form, naming);
	const { name } = naming.find((entry) => entry.id === ordinary)!;
	expect(text(tree, 'example.md')).toContain(`\n"${name}": true\n`);

	const { quill } = await fromTree(tree);
	const example = quill.exampleDocument()!;
	const markdown = example.toMarkdown();
	example.free();
	const filled = (await PDFDocument.load(await render(quill, markdown))).getForm();
	const ticked = filled
		.getFields()
		.filter((field) => field instanceof PDFCheckBox && field.isChecked())
		.map((field) => field.getName());
	expect(ticked).toEqual([ordinary]);
}, 120_000);

it('ticks the boxes of a shared name that turn on as the value it holds, and no other', async () => {
	const sanitized = await sanitize(await sharedNameCheckboxes());
	if (!sanitized.ok) throw new Error(`refused as ${sanitized.refusal.code}`);
	const naming = suggest(sanitized.form.fields);
	const { ref, quill } = await fromTree(await built(sanitized.form, naming));

	const copies = ['copy', 'copy#2'];
	const options = ['attached', 'attached#2', 'twice', 'twice#2', 'twice#3'];
	for (const [id, on, ticks] of [
		['attached', 'is', ['attached']],
		['attached', 'is_not', ['attached#2']],
		['twice', 'one', ['twice', 'twice#3']],
		['twice', 'two', ['twice#2']]
	] as const) {
		const { name } = naming.find((entry) => entry.id === id)!;
		const filled = await render(quill, `~~~\n$quill: ${ref}\n$kind: main\n${name}: ${on}\n~~~\n`);
		const stamped = (await PDFDocument.load(filled)).getForm();
		const ticked = [...options, ...copies].filter((box) => stamped.getCheckBox(box).isChecked());
		expect(ticked).toEqual(ticks);
	}
}, 60_000);

describe('a form built by hand', () => {
	const rect = (y: number) => ({ x: 72, y, w: 200, h: 20 });
	const at = (y: number): Field['places'] => [{ page: 0, rect: rect(y) }];
	const plain = { required: false, readOnly: false };
	const line = { ...plain, kind: 'text', multiline: false } as const;
	const fields: Field[] = [
		{ ...line, id: 'roster', places: at(100), maxLength: 20 },
		{ ...line, id: 'remarks', places: at(130) },
		{ ...line, id: 'narrative', places: at(160), multiline: true },
		{ ...line, id: 'heading', places: at(190), multiline: true },
		{
			...line,
			id: 'unit',
			places: [...at(220), { page: 0, rect: rect(520) }],
			tooltip: 'Unit of assignment',
			required: true
		},
		{ ...plain, id: 'grade', places: at(250), kind: 'choice', options: ['E-1', 'E-2'] },
		{ ...plain, id: 'component', places: at(280), kind: 'choice', options: ['RegAF', 'ANG'] },
		{ ...line, id: 'last4', places: at(310), maxLength: 4 },
		{ ...line, id: 'initial', places: at(340), maxLength: 1 },
		{ ...plain, id: 'agree', places: at(370), kind: 'checkbox' },
		{ ...plain, id: 'annual', places: at(400), kind: 'radio', group: 'Leave Type', on: 'A' },
		{ ...plain, id: 'sick', places: at(430), kind: 'radio', group: 'Leave Type', on: 'S' },
		{ ...line, id: 'spare', places: at(460) },
		{ ...line, id: 'total', places: at(490), readOnly: true },
		{ ...plain, id: 'signed', places: at(550), kind: 'signature' }
	];
	const named = (id: string, more: Partial<FieldNaming> = {}): FieldNaming => ({
		id,
		keep: true,
		name: id,
		description: '',
		...more
	});
	// Not the order of the fields above.
	const naming: FieldNaming[] = [
		named('signed'),
		named('last4', { example: ' 123456789 ', title: 'SSN (last 4)' }),
		// Two characters outside the Basic Multilingual Plane: four UTF-16 units.
		named('initial', { example: '\u{1D4D0}\u{1D4D1}' }),
		named('grade', { example: 'O-1' }),
		named('component', { example: 'ANG' }),
		named('agree'),
		named('sick'),
		named('annual'),
		named('remarks', { text: 'paragraph' }),
		named('narrative'),
		named('heading', { text: 'line', example: '   ' }),
		named('unit', { name: 'assigned_unit', description: 'Where the member is assigned.' }),
		named('roster', { text: 'lines', example: 'A1C Doe' }),
		named('spare', { keep: false }),
		named('total')
	];

	async function form(): Promise<Form> {
		const doc = await PDFDocument.create();
		doc.addPage([612, 792]);
		// A classic cross-reference table, as sanitize writes and the engine requires.
		const pdf = await doc.save({ useObjectStreams: false });
		return { pdf, pages: [{ width: 612, height: 792 }], fields };
	}

	it("writes each kept field by its kind and by what the naming asks, in the naming's order", async () => {
		expect(text(await built(await form(), naming), 'Quill.yaml')).toBe(
			[
				'quill:',
				'  name: "x"',
				'  version: 0.1.0',
				'  backend: acroform',
				'  requires: ">=0.127"',
				'  description: "A form."',
				'',
				'main:',
				'  body:',
				'    enabled: false',
				'  fields:',
				'    "last4":',
				'      title: "SSN (last 4)"',
				'      type: text',
				'      default: ""',
				'      max: 4',
				'      description: ""',
				'    "initial":',
				'      type: text',
				'      default: ""',
				'      max: 1',
				'      description: ""',
				'    "grade":',
				'      type: enum',
				'      values:',
				'        - "E-1"',
				'        - "E-2"',
				'      default: ""',
				'      description: ""',
				'    "component":',
				'      type: enum',
				'      values:',
				'        - "RegAF"',
				'        - "ANG"',
				'      default: ""',
				'      description: ""',
				'    "agree":',
				'      type: boolean',
				'      default: false',
				'      description: ""',
				'    "sick":',
				'      type: boolean',
				'      default: false',
				'      description: ""',
				'    "annual":',
				'      type: boolean',
				'      default: false',
				'      description: ""',
				// The naming asks for a paragraph of a single-line field.
				'    "remarks":',
				'      type: text',
				'      default: ""',
				'      multiline: true',
				'      description: ""',
				// The naming asks for nothing, and the field is multiline itself.
				'    "narrative":',
				'      type: text',
				'      default: ""',
				'      multiline: true',
				'      description: ""',
				// The naming asks for a line of a multiline field.
				'    "heading":',
				'      type: text',
				'      default: ""',
				'      description: ""',
				// A required field declares no default.
				'    "assigned_unit":',
				'      type: text',
				'      description: "Where the member is assigned."',
				'    "roster":',
				'      type: array',
				'      items:',
				'        type: text',
				'      default: []',
				'      description: ""',
				''
			].join('\n')
		);
	});

	it('shows a choice example only when it is an option, cuts a text example to the field, and shows no example of spaces', async () => {
		expect(text(await built(await form(), naming), 'example.md')).toBe(
			[
				'~~~',
				'$quill: "x"',
				'"last4": "1234"',
				'"initial": "\u{1D4D0}"',
				'"grade": "E-1"',
				'"component": "ANG"',
				'"roster":',
				'  - "A1C Doe"',
				'~~~',
				''
			].join('\n')
		);
	});

	it('places every kept field once per place, a signature as a widget, and no field that is dropped or read-only', async () => {
		const bound = (name: string, schema_field: string, y: number) => ({
			name,
			schema_field,
			page: 0,
			rect: rect(y)
		});
		expect(JSON.parse(text(await built(await form(), naming), 'Form.yaml'))).toEqual({
			schema: 'quillmark/form@0.2.0',
			fields: [
				bound('last4', 'last4', 310),
				bound('initial', 'initial', 340),
				bound('grade', 'grade', 250),
				bound('component', 'component', 280),
				bound('agree', 'agree', 370),
				bound('sick', 'sick', 430),
				bound('annual', 'annual', 400),
				bound('remarks', 'remarks', 130),
				bound('narrative', 'narrative', 160),
				bound('heading', 'heading', 190),
				{ ...bound('unit', 'assigned_unit', 220), tooltip: 'Unit of assignment' },
				{ ...bound('unit#2', 'assigned_unit', 520), tooltip: 'Unit of assignment' },
				bound('roster', 'roster', 100)
			],
			widgets: [{ name: 'signed', type: 'signature', page: 0, rect: rect(550) }]
		});
	});

	it('builds nothing from a naming check finds a problem in', async () => {
		const twice = naming.map((entry) =>
			entry.id === 'roster' || entry.id === 'remarks' ? { ...entry, name: 'same' } : entry
		);
		await expect(
			quillify(await form(), { name: 'x', description: 'A form.', fields: twice })
		).resolves.toEqual({ ok: false, problems: [{ code: 'duplicate_name', name: 'same' }] });
	});

	it('ticks a box and a radio option whose example is true, in example.md and in the engine', async () => {
		const examples: Record<string, string> = { agree: 'true', sick: ' true ', annual: 'yes' };
		const ticked = naming.map((entry) =>
			entry.id in examples ? { ...entry, example: examples[entry.id] } : entry
		);
		const tree = await built(await form(), ticked);
		const markdown = text(tree, 'example.md');
		expect(markdown).toContain('\n"agree": true\n"sick": true\n"roster":');
		expect(markdown).not.toContain('"annual"');

		const { quill } = await fromTree(tree);
		const example = quill.exampleDocument()!;
		const rendered = example.toMarkdown();
		example.free();
		const filled = (await PDFDocument.load(await render(quill, rendered))).getForm();
		expect(['agree', 'sick', 'annual'].map((id) => filled.getCheckBox(id).isChecked())).toEqual([
			true,
			true,
			false
		]);
	}, 60_000);

	it('writes radio options of one group that share a name as one enum, each box checked by its own value', async () => {
		const leave = naming.map((entry) =>
			entry.id === 'sick' || entry.id === 'annual'
				? { ...entry, name: 'leave', example: entry.id === 'annual' ? 'true' : undefined }
				: entry
		);
		const tree = await built(await form(), leave);
		expect(text(tree, 'Quill.yaml')).toContain(
			[
				'    "leave":',
				'      type: enum',
				'      values:',
				'        - "S"',
				'        - "A"',
				'      default: ""',
				'      description: ""',
				''
			].join('\n')
		);
		const { fields: entries } = JSON.parse(text(tree, 'Form.yaml'));
		expect(
			entries
				.filter((entry: { schema_field: string }) => entry.schema_field === 'leave')
				.map(({ name, option }: { name: string; option: string }) => [name, option])
		).toEqual([
			['sick', 'S'],
			['annual', 'A']
		]);
		expect(text(tree, 'example.md')).toContain('\n"leave": "A"\n');

		const { quill } = await fromTree(tree);
		const example = quill.exampleDocument()!;
		const rendered = example.toMarkdown();
		example.free();
		const filled = (await PDFDocument.load(await render(quill, rendered))).getForm();
		expect(['annual', 'sick'].map((id) => filled.getCheckBox(id).isChecked())).toEqual([
			true,
			false
		]);
	}, 60_000);

	it('ticks every box of a shared name when one of them has an example of true', async () => {
		const twin = { ...plain, id: 'agree_again', places: at(580), kind: 'checkbox' } as const;
		const shared = [
			...naming.map((entry) => (entry.id === 'agree' ? { ...entry, example: 'true' } : entry)),
			named('agree_again', { name: 'agree' })
		];
		const tree = await built({ ...(await form()), fields: [...fields, twin] }, shared);
		expect(text(tree, 'example.md')).toContain('\n"agree": true\n');

		const { quill } = await fromTree(tree);
		const example = quill.exampleDocument()!;
		const rendered = example.toMarkdown();
		example.free();
		const filled = (await PDFDocument.load(await render(quill, rendered))).getForm();
		expect(['agree', 'agree_again'].map((id) => filled.getCheckBox(id).isChecked())).toEqual([
			true,
			true
		]);
	}, 60_000);

	it('writes one schema field for fields that share a name, and fills every box from it', async () => {
		const shared = naming.map((entry) =>
			entry.id === 'last4'
				? { ...entry, name: 'remarks', title: undefined, example: undefined }
				: entry.id === 'remarks'
					? {
							...entry,
							text: undefined,
							title: 'Remarks',
							description: 'What the member adds.',
							example: '12345678'
						}
					: entry
		);
		const tree = await built(await form(), shared);
		const yaml = text(tree, 'Quill.yaml');
		expect(yaml.split('\n    "remarks":\n')).toHaveLength(2);
		expect(yaml).toContain(
			[
				'    "remarks":',
				'      title: "Remarks"',
				'      type: text',
				'      default: ""',
				'      max: 4',
				'      description: "What the member adds."'
			].join('\n')
		);
		expect(yaml).not.toContain('"last4"');
		expect(text(tree, 'example.md')).toContain('"remarks": "1234"\n');
		const { fields } = JSON.parse(text(tree, 'Form.yaml'));
		expect(
			fields.filter((f: { schema_field: string }) => f.schema_field === 'remarks')
		).toHaveLength(2);

		const { ref, quill } = await fromTree(tree);
		const markdown = `~~~\n$quill: ${ref}\n$kind: main\nremarks: "4321"\n~~~\n`;
		const filled = (await PDFDocument.load(await render(quill, markdown))).getForm();
		expect(filled.getTextField('last4').getText()).toBe('4321');
		expect(filled.getTextField('remarks').getText()).toBe('4321');
	}, 60_000);

	it('fills a field of lines in the engine from a one-line example', async () => {
		const { quill } = await fromTree(await built(await form(), naming));
		const example = quill.exampleDocument()!;
		const markdown = example.toMarkdown();
		example.free();
		expect(markdown).toContain('roster:\n  - A1C Doe');
		const filled = (await PDFDocument.load(await render(quill, markdown))).getForm();
		expect(filled.getTextField('roster').getText()).toBe('A1C Doe');
	}, 60_000);

	it("stamps a text field's limit on its widget in the engine", async () => {
		const { quill } = await fromTree(await built(await form(), naming));
		const example = quill.exampleDocument()!;
		const markdown = example.toMarkdown();
		example.free();
		const filled = (await PDFDocument.load(await render(quill, markdown))).getForm();
		expect(filled.getTextField('last4').getMaxLength()).toBe(4);
	}, 60_000);

	it('writes no max: for a limit of 0, or of more than the engine reads', async () => {
		const read = await form();
		const fields = read.fields.map((field) =>
			field.id === 'last4'
				? { ...field, maxLength: 2 ** 32 }
				: field.id === 'initial'
					? { ...field, maxLength: 0 }
					: field
		);
		expect(text(await built({ ...read, fields }, naming), 'Quill.yaml')).not.toContain('max:');
	}, 60_000);

	it("returns what the engine refuses as a problem that carries the engine's code", async () => {
		// check takes any description. The engine takes one of a single line.
		const described: Naming = {
			name: 'x',
			description: 'A form.',
			fields: naming.map((entry) =>
				entry.id === 'remarks' ? { ...entry, description: 'One line\nand another' } : entry
			)
		};
		await expect(quillify(await form(), described)).resolves.toEqual({
			ok: false,
			problems: [
				{
					code: 'engine',
					diagnostic: 'quill::description_multiline',
					message: expect.stringContaining('single line')
				}
			]
		});
	});

	it("lets an error that is not the engine's through", async () => {
		const unreadable = new Proxy(new Uint8Array(4), {
			get: (bytes, key) => {
				if (key === 'length') throw new RangeError('no refusal');
				return Reflect.get(bytes, key);
			}
		});
		await expect(
			quillify(
				{ ...(await form()), pdf: unreadable },
				{ name: 'x', description: 'A form.', fields: naming }
			)
		).rejects.toThrow(RangeError);
	});
});
