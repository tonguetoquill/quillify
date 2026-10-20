import { expect, it } from 'vitest';
import { expectClosure } from '../test/closure.js';
import { dynamicForm } from '../test/dynamic-form.js';
import { fromTree, render } from '../test/engine.js';
import { quillify, sanitize, suggest } from './index.js';
import { openPdf } from './pdfjs.js';
import type { Form } from './index.js';
import type { FieldInventory } from './types.js';

const fixtures = import.meta.glob<string>('../test/fixtures/D*.pdf', {
	query: '?url',
	import: 'default',
	eager: true
});
const goldens = import.meta.glob<FieldInventory>('../test/goldens/D*.inventory.json', {
	import: 'default',
	eager: true
});

/** The signature fields a dynamic fixture's template shows, and the captions printed in them. */
const FORMS = [
	{
		form: 'DD2875',
		signatures: 7,
		captions: [
			'11. USER SIGNATURE',
			'17d. SUPERVISOR SIGNATURE',
			'18a. INFORMATION OWNER/OPR SIGNATURE',
			'19b. ISSO OR APPOINTEE SIGNATURE',
			'25. SECURITY MANAGER SIGNATURE'
		]
	},
	{ form: 'DAF988', signatures: 7, captions: [] },
	{
		form: 'DAF1288',
		signatures: 6,
		captions: [
			"20. MEMBER'S SIGNATURE",
			'28. HARM SIGNATURE (if applicable)',
			'31. SIGNATURE',
			'34. SIGNATURE (if applicable)'
		]
	}
];

const found = <T>(files: Record<string, T>, form: string): T =>
	Object.entries(files).find(([path]) => path.includes(`/${form}`))![1];

async function read(bytes: Uint8Array): Promise<Form> {
	const sanitized = await sanitize(bytes);
	if (!sanitized.ok) throw new Error(JSON.stringify(sanitized.refusal));
	return sanitized.form;
}

const published = async (form: string): Promise<Form> =>
	read(new Uint8Array(await (await fetch(found(fixtures, form))).arrayBuffer()));

/** The text of a form's redrawn pages, with no white space. */
async function printed(form: Form): Promise<string> {
	const { pdf, close } = await openPdf(form.pdf);
	try {
		let text = '';
		for (let number = 1; number <= pdf.numPages; number++)
			for (const item of (await (await pdf.getPage(number)).getTextContent()).items)
				if ('str' in item) text += item.str;
		return text.replace(/\s/g, '');
	} finally {
		await close();
	}
}

for (const { form, signatures, captions } of FORMS) {
	it(`${form} keeps its ${signatures} signature fields, each at its rect`, async () => {
		const signed = (await published(form)).fields.filter((field) => field.kind === 'signature');
		expect(signed).toHaveLength(signatures);
		expect(signed.map(({ id, places }) => ({ id, places }))).toEqual(
			found(goldens, form)
				.widgets.filter((widget) => widget.kind === 'Sig')
				.map(({ id, places }) => ({ id, places }))
		);
	}, 120_000);

	it(`${form} becomes a quill with ${signatures} unbound signature widgets the engine stamps in place`, async () => {
		const sanitized = await published(form);
		const quillified = await quillify(sanitized, {
			name: 'signed',
			description: 'A dynamic form with its signature fields.',
			// Each text field gets a value, so the quill has a document to render.
			fields: suggest(sanitized.fields).map((entry, index) => ({
				...entry,
				...(sanitized.fields[index].kind === 'text' ? { example: 'x' } : {})
			}))
		});
		if (!quillified.ok) throw new Error(JSON.stringify(quillified.problems));

		const { widgets }: { widgets: { name: string; type: string }[] } = JSON.parse(
			new TextDecoder().decode(quillified.tree.get('form.yaml'))
		);
		expect(widgets.map(({ name, type }) => ({ name, type }))).toEqual(
			sanitized.fields
				.filter((field) => field.kind === 'signature')
				.map((field) => ({ name: field.id, type: 'signature' }))
		);
		expect(widgets).toHaveLength(signatures);

		const { quill } = await fromTree(quillified.tree);
		const example = quill.exampleDocument()!;
		const markdown = example.toMarkdown();
		example.free();
		await expectClosure(sanitized.pages, quillified.tree, await render(quill, markdown));
	}, 120_000);

	if (captions.length)
		it(`${form} is redrawn with the ${captions.length} captions printed in its signature fields`, async () => {
			const text = await printed(await published(form));
			expect(captions.filter((caption) => !text.includes(caption.replace(/\s/g, '')))).toEqual([]);
		}, 120_000);
}

it('reads a signature field after every control, so a control of its name keeps its id', async () => {
	const form = await read(
		await dynamicForm(
			'<field name="a" x="20pt" y="20pt" w="200pt" h="20pt"><ui><signature/></ui><caption placement="left" reserve="60pt"><value><text>Sign here</text></value></caption></field>' +
				'<field name="a" x="20pt" y="60pt" w="200pt" h="20pt"><ui><textEdit/></ui></field>'
		)
	);
	expect(
		form.fields.map(({ id, kind, places, tooltip }) => ({ id, kind, places, tooltip }))
	).toEqual([
		{
			id: 'p1.Page1.form1.a',
			kind: 'text',
			places: [{ page: 0, rect: { x: 20, y: 60, w: 200, h: 20 }, fontSize: 10 }],
			tooltip: undefined
		},
		{
			id: 'p1.Page1.form1.a#2',
			kind: 'signature',
			places: [{ page: 0, rect: { x: 80, y: 20, w: 140, h: 20 } }],
			tooltip: 'Sign here'
		}
	]);
	expect(await printed(form)).toContain('Signhere');
}, 120_000);
