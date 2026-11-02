import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import formUrl from '../test/fixtures/DD577_Appointment_Termination_Record.pdf?url';
import { fromTree, render } from '../test/engine.js';
import { quillify, sanitize, suggest } from './index.js';

describe('a radio group', () => {
	it('is one enum of its on-states, and its value ticks its own options alone', async () => {
		const sanitized = await sanitize(new Uint8Array(await (await fetch(formUrl)).arrayBuffer()));
		if (!sanitized.ok) throw new Error(`refused as ${sanitized.refusal.code}`);
		const { form } = sanitized;
		const naming = suggest(form.fields);
		const built = await quillify(form, { name: 'dd577', description: 'A form.', fields: naming });
		if (!built.ok) throw new Error(JSON.stringify(built.problems));

		const radios = form.fields.flatMap((field, at) =>
			field.kind === 'radio' ? [{ ...field, name: naming[at].name }] : []
		);
		const groups = Map.groupBy(radios, (radio) => radio.group);
		expect([...groups.values()].some((options) => options.length > 1)).toBe(true);

		const { ref, quill } = await fromTree(built.tree);
		for (const options of groups.values()) {
			const names = new Set(options.map((option) => option.name));
			expect(names.size).toBe(1);
			const [name] = names;
			for (const on of new Set(options.map((option) => option.on!))) {
				const md = `~~~\n$quill: ${ref}\n$kind: main\n${name}: ${JSON.stringify(on)}\n~~~\n`;
				const stamped = (await PDFDocument.load(await render(quill, md))).getForm();
				const ticked = radios
					.filter((radio) => stamped.getCheckBox(radio.id).isChecked())
					.map((radio) => radio.id);
				expect(ticked).toEqual(options.filter((option) => option.on === on).map(({ id }) => id));
			}
		}
	}, 120_000);
});
