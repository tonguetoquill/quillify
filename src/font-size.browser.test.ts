import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { expect, it } from 'vitest';
import { dynamicForm } from '../test/dynamic-form.js';
import { sanitize } from './index.js';

it('reads the font size a dynamic form gives a text or choice value, and none where it asks for auto size', async () => {
	const field = (name: string, y: number, ui: string, font: string, items = '') =>
		`<field name="${name}" x="72pt" y="${y}pt" w="200pt" h="40pt"><ui>${ui}</ui>${font}${items}</field>`;
	const read = await sanitize(
		await dynamicForm(
			field('big', 72, '<textEdit/>', '<font typeface="Arial" size="14pt"/>') +
				field('odd', 132, '<textEdit multiLine="1"/>', '<font typeface="Arial" size="9.2pt"/>') +
				field(
					'pick',
					192,
					'<choiceList/>',
					'<font typeface="Arial" size="12pt"/>',
					'<items><text>A</text><text>B</text></items>'
				) +
				field('plain', 252, '<textEdit/>', '<font typeface="Arial"/>') +
				field('bare', 312, '<textEdit/>', '') +
				field('auto', 372, '<textEdit/>', '<font typeface="Arial" size="0pt"/>')
		)
	);
	if (!read.ok) throw new Error(JSON.stringify(read.refusal));
	expect(read.form.fields.map(({ id, places }) => [id, places[0].fontSize])).toEqual([
		['p1.Page1.form1.big', 14],
		['p1.Page1.form1.odd', 9.2],
		['p1.Page1.form1.pick', 12],
		['p1.Page1.form1.plain', 10],
		['p1.Page1.form1.bare', 10],
		['p1.Page1.form1.auto', undefined]
	]);
}, 120_000);

it("reads the size each widget's /DA gives a static field, and none from a size no number holds", async () => {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	const form = doc.getForm();
	const shared = form.createTextField('shared');
	shared.addToPage(page, { x: 72, y: 700, width: 200, height: 20 });
	shared.addToPage(page, { x: 72, y: 600, width: 200, height: 20 });
	shared.setFontSize(8);
	shared.acroField.getWidgets()[1].dict.set(PDFName.of('DA'), PDFString.of('/Helv 14 Tf 0 g'));
	const huge = form.createTextField('huge');
	huge.addToPage(page, { x: 72, y: 500, width: 200, height: 20 });
	huge.acroField.setDefaultAppearance(`/Helv ${'9'.repeat(400)} Tf 0 g`);
	const read = await sanitize(await doc.save({ updateFieldAppearances: false }));
	if (!read.ok) throw new Error(JSON.stringify(read.refusal));
	expect(
		read.form.fields.map(({ id, places }) => [id, places.map((place) => place.fontSize)])
	).toEqual([
		['shared', [8, 14]],
		['huge', [undefined]]
	]);
}, 120_000);
