import { describe, expect, it } from 'vitest';
import { assembleQuill, quillYaml } from './assemble.js';
import type { FieldInventory, QualifiedForm } from './types.js';

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

export const INVENTORY: FieldInventory = {
	pages: [{ width: 612, height: 792 }],
	widgets: [
		{
			id: 'FullName',
			name: 'FullName',
			kind: 'Tx',
			places: [{ page: 0, rect: rect(200, 94, 300, 22) }],
			multiLine: false,
			checkBox: false,
			radioButton: false,
			combo: false,
			options: [],
			readOnly: false,
			required: false,
			maxLen: 0
		},
		{
			id: 'Comments',
			name: 'Comments',
			kind: 'Tx',
			places: [{ page: 0, rect: rect(200, 192, 300, 80) }],
			multiLine: true,
			checkBox: false,
			radioButton: false,
			combo: false,
			options: [],
			readOnly: false,
			required: false,
			maxLen: 0
		},
		{
			id: 'Agree',
			name: 'Agree',
			kind: 'Btn',
			places: [{ page: 0, rect: rect(200, 298, 16, 16) }],
			multiLine: false,
			checkBox: true,
			radioButton: false,
			combo: false,
			options: [],
			readOnly: false,
			required: false,
			maxLen: 0
		},
		{
			id: 'FavoriteColor',
			name: 'FavoriteColor',
			kind: 'Ch',
			places: [{ page: 0, rect: rect(200, 334, 200, 22) }],
			multiLine: false,
			checkBox: false,
			radioButton: false,
			combo: true,
			options: ['red', 'green', 'blue'],
			readOnly: false,
			required: false,
			maxLen: 0
		},
		{
			id: 'Signature',
			name: 'Signature',
			kind: 'Sig',
			places: [{ page: 0, rect: rect(200, 400, 300, 40) }],
			multiLine: false,
			checkBox: false,
			radioButton: false,
			combo: false,
			options: [],
			readOnly: false,
			required: false,
			maxLen: 0
		}
	]
};

export const FORM: QualifiedForm = {
	quill: { name: 'sample_form', title: 'Sample form', description: 'A sample application.' },
	fields: [
		{
			widget: 'FullName',
			name: 'full_name',
			label: 'Full name',
			description: 'Full legal name of the applicant.',
			type: 'string',
			multiline: false,
			example: 'Ada Lovelace',
			keep: true,
			required: false
		},
		{
			widget: 'Comments',
			name: 'comments',
			label: 'Comments',
			description: 'Free-form comments, one line per element.',
			type: 'array',
			multiline: true,
			example: 'Arrived early.',
			keep: true,
			required: false
		},
		{
			widget: 'Agree',
			name: 'agree',
			label: 'Agree to terms',
			description: 'Whether the applicant agrees to the terms.',
			type: 'boolean',
			multiline: false,
			keep: true,
			required: false
		},
		{
			widget: 'FavoriteColor',
			name: 'favorite_color',
			label: 'Favorite color',
			description: 'Favorite color.',
			type: 'enum',
			multiline: false,
			options: ['red', 'green', 'blue'],
			example: 'green',
			keep: false,
			required: false
		},
		{
			widget: 'Signature',
			name: 'signature',
			label: 'Signature',
			description: 'Signed by hand.',
			type: 'string',
			multiline: false,
			keep: true,
			required: false
		}
	]
};

describe('assembleQuill', () => {
	it('writes Quill.yaml, form.pdf, form.yaml and example.md', () => {
		const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
		const tree = assembleQuill(FORM, INVENTORY, pdf);
		const text = (name: string) => new TextDecoder().decode(tree.get(name));
		expect([...tree.keys()]).toEqual(['Quill.yaml', 'form.pdf', 'form.yaml', 'example.md']);
		expect(tree.get('form.pdf')).toBe(pdf);
		expect(text('Quill.yaml')).toMatchInlineSnapshot(`
			"quill:
			  name: "sample_form"
			  version: 0.1.0
			  backend: acroform
			  description: "A sample application."

			main:
			  body:
			    enabled: false
			  fields:
			    "full_name":
			      type: text
			      default: ""
			      description: "Full legal name of the applicant."
			    "comments":
			      type: array
			      items:
			        type: text
			      default: []
			      description: "Free-form comments, one line per element."
			    "agree":
			      type: boolean
			      default: false
			      description: "Whether the applicant agrees to the terms."
			"
		`);
		expect(JSON.parse(text('form.yaml'))).toEqual({
			schema: 'quillmark/form@0.2.0',
			fields: [
				{ name: 'FullName', schema_field: 'full_name', page: 0, rect: rect(200, 94, 300, 22) },
				{ name: 'Comments', schema_field: 'comments', page: 0, rect: rect(200, 192, 300, 80) },
				{ name: 'Agree', schema_field: 'agree', page: 0, rect: rect(200, 298, 16, 16) }
			],
			widgets: [{ name: 'Signature', type: 'signature', page: 0, rect: rect(200, 400, 300, 40) }]
		});
		expect(text('example.md')).toMatchInlineSnapshot(`
			"~~~
			$quill: "sample_form"
			"full_name": "Ada Lovelace"
			"comments":
			  - "Arrived early."
			~~~
			"
		`);
	});

	it('refuses a field naming a widget outside the inventory', () => {
		const form = { ...FORM, fields: [{ ...FORM.fields[0], widget: 'Nope' }] };
		expect(() => assembleQuill(form, INVENTORY, new Uint8Array())).toThrow('Nope');
	});

	it('omits the default on a required field, which is what marks the obligation', () => {
		const optional = quillYaml(FORM, [{ ...FORM.fields[0], required: false }]);
		const obliged = quillYaml(FORM, [{ ...FORM.fields[0], required: true }]);

		expect(optional).toContain('default: ""');
		expect(obliged).not.toContain('default:');
	});

	it("writes a field's title first where it has one, and none where it has not", () => {
		const yaml = quillYaml(FORM, [
			{ ...FORM.fields[0], title: 'DAFSC/Duty Title' },
			{ ...FORM.fields[0], name: 'untitled' }
		]);
		expect(yaml).toContain('    "full_name":\n      title: "DAFSC/Duty Title"\n      type: text\n');
		expect(yaml.match(/title:/g)).toHaveLength(1);
	});

	it("writes a text field's limit as max, and none where it has none", () => {
		const yaml = quillYaml(FORM, [
			{ ...FORM.fields[0], max: 35 },
			{ ...FORM.fields[0], name: 'open' }
		]);
		expect(yaml).toContain(
			'    "full_name":\n      type: text\n      default: ""\n      max: 35\n'
		);
		expect(yaml.match(/max:/g)).toHaveLength(1);
	});

	it("writes a place's font size as font_size, and none where the form asks for auto size", () => {
		const inventory = {
			...INVENTORY,
			widgets: INVENTORY.widgets.map((w) =>
				w.id === 'FullName' ? { ...w, places: [{ ...w.places[0], fontSize: 9.5 }] } : w
			)
		};
		const tree = assembleQuill(FORM, inventory, new Uint8Array());
		const { fields } = JSON.parse(new TextDecoder().decode(tree.get('form.yaml')));
		expect(fields[0]).toEqual({
			name: 'FullName',
			schema_field: 'full_name',
			page: 0,
			rect: rect(200, 94, 300, 22),
			font_size: 9.5
		});
		expect(fields.slice(1).filter((field: object) => 'font_size' in field)).toEqual([]);
	});

	it('writes no example.md when no kept field carries a sample', () => {
		const form = { ...FORM, fields: FORM.fields.map((f) => ({ ...f, example: undefined })) };
		const tree = assembleQuill(form, INVENTORY, new Uint8Array());
		expect([...tree.keys()]).toEqual(['Quill.yaml', 'form.pdf', 'form.yaml']);
	});
});
