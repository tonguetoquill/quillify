import { expect, it } from 'vitest';
import { dynamicForm } from '../test/dynamic-form.js';
import { sanitize } from './index.js';

const fixtures = import.meta.glob<string>('../test/fixtures/*.pdf', {
	query: '?url',
	import: 'default',
	eager: true
});

async function fixture(name: string): Promise<Uint8Array> {
	const [, url] = Object.entries(fixtures).find(([path]) => path.includes(`/${name}_`))!;
	return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

async function limits(pdf: Uint8Array) {
	const read = await sanitize(pdf);
	if (!read.ok) throw new Error(JSON.stringify(read.refusal));
	return read.form.fields.map((field) =>
		field.kind === 'text'
			? { id: field.id, multiline: field.multiline, maxLength: field.maxLength }
			: { id: field.id, kind: field.kind }
	);
}

it('reads the maxChars of a dynamic form text field as its maxLength', async () => {
	expect(
		await limits(
			await dynamicForm(
				'<field name="last4" x="72pt" y="120pt" w="200pt" h="20pt"><ui><textEdit/></ui><value><text maxChars="4"/></value></field>' +
					'<field name="duties" x="72pt" y="160pt" w="400pt" h="120pt"><ui><textEdit multiLine="1"/></ui><value><text maxChars="500"/></value></field>' +
					'<field name="open" x="72pt" y="300pt" w="200pt" h="20pt"><ui><textEdit/></ui><value><text/></value></field>'
			)
		)
	).toEqual([
		{ id: 'p1.Page1.form1.last4', multiline: false, maxLength: 4 },
		{ id: 'p1.Page1.form1.duties', multiline: true, maxLength: 500 },
		{ id: 'p1.Page1.form1.open', multiline: false, maxLength: undefined }
	]);
}, 120_000);

it('reads the cells of a comb with no maxChars or a larger one, and a numeric field its maxChars, as its maxLength', async () => {
	expect(
		await limits(
			await dynamicForm(
				'<field name="dodid" x="72pt" y="120pt" w="200pt" h="20pt"><ui><numericEdit><comb numberOfCells="10"/></numericEdit></ui><value><integer/></value></field>' +
					'<field name="code" x="72pt" y="160pt" w="200pt" h="20pt"><ui><textEdit><comb numberOfCells="6"/></textEdit></ui><value><text/></value></field>' +
					'<field name="both" x="72pt" y="200pt" w="200pt" h="20pt"><ui><textEdit><comb numberOfCells="6"/></textEdit></ui><value><text maxChars="4"/></value></field>' +
					'<field name="wide" x="72pt" y="220pt" w="200pt" h="20pt"><ui><textEdit><comb numberOfCells="6"/></textEdit></ui><value><text maxChars="10"/></value></field>' +
					'<field name="count" x="72pt" y="240pt" w="200pt" h="20pt"><ui><numericEdit/></ui><value><text maxChars="3"/></value></field>' +
					'<field name="amount" x="72pt" y="280pt" w="200pt" h="20pt"><ui><numericEdit/></ui><value><float/></value></field>' +
					'<field name="blank" x="72pt" y="320pt" w="200pt" h="20pt"><ui><textEdit><comb/></textEdit></ui><value><text/></value></field>'
			)
		)
	).toEqual([
		{ id: 'p1.Page1.form1.dodid', multiline: false, maxLength: 10 },
		{ id: 'p1.Page1.form1.code', multiline: false, maxLength: 6 },
		{ id: 'p1.Page1.form1.both', multiline: false, maxLength: 4 },
		{ id: 'p1.Page1.form1.wide', multiline: false, maxLength: 6 },
		{ id: 'p1.Page1.form1.count', multiline: false, maxLength: 3 },
		{ id: 'p1.Page1.form1.amount', multiline: false, maxLength: undefined },
		{ id: 'p1.Page1.form1.blank', multiline: false, maxLength: undefined }
	]);
}, 120_000);

it("reads DAF 988's DODID_1 on each page and DAF 1288's DoDID, 10-cell combs, as a maxLength of 10", async () => {
	const dodids = async (name: string, leaf: string) =>
		(await limits(await fixture(name))).filter(({ id }) => id.endsWith(`.${leaf}`));
	expect(await dodids('DAF988', 'DODID_1')).toEqual(
		[1, 2, 3].map((page) => ({
			id: `p${page}.PageArea1.AF988_Unlocked.Page${page}.DODID_1`,
			multiline: false,
			maxLength: 10
		}))
	);
	expect(await dodids('DAF1288', 'DoDID')).toEqual(
		[1, 2].map((page) => ({ id: `p${page}.Page1.form1.DoDID`, multiline: false, maxLength: 10 }))
	);
}, 120_000);
