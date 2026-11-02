import { describe, expect, it } from 'vitest';
import { check, suggest } from './naming.js';
import type { Field, FieldNaming, Naming } from './api.js';

const places: Field['places'] = [{ page: 0, rect: { x: 72, y: 72, w: 216, h: 18 } }];
const plain = { places, required: false, readOnly: false };

const text = (id: string, tooltip?: string): Field => ({
	...plain,
	id,
	tooltip,
	kind: 'text',
	multiline: false
});
const kept = (id: string, name: string): FieldNaming => ({ id, keep: true, name, description: '' });
const dropped = (id: string, name: string): FieldNaming => ({ ...kept(id, name), keep: false });
const naming = (...fields: FieldNaming[]): Naming => ({
	name: 'x',
	description: 'A form.',
	fields
});

describe('check', () => {
	const a = text('a');
	const box: Field = { ...plain, id: 'b', kind: 'checkbox' };
	const NOT_SNAKE_CASE = ['', 'A', 'a-b', 'a b', '1a', 'a.b', '_a', 'é'];

	it.each(NOT_SNAKE_CASE)('reports %j as the quill name', (name) => {
		expect(check([a], { ...naming(kept('a', 'first')), name })).toEqual([{ code: 'quill_name' }]);
	});

	it.each(['', ' \t\n', '\u0085'])('reports %j as the quill description', (description) => {
		expect(check([a], { ...naming(kept('a', 'first')), description })).toEqual([
			{ code: 'quill_description' }
		]);
	});

	describe('a naming that is not shaped as its type says', () => {
		// A naming can be a model's JSON, which TypeScript never saw.
		const entry = kept('a', 'first');
		const each = (...values: unknown[]) => values.map((value) => ({ value }));
		const slots: [string, string, { value: unknown }[], (value: unknown) => unknown][] = [
			[
				'name',
				'a string',
				each(undefined, null, true, 7, ['a']),
				(name) => ({ ...naming(entry), name })
			],
			[
				'description',
				'a string',
				each(undefined, null, true, 7, ['a']),
				(description) => ({ ...naming(entry), description })
			],
			[
				'fields',
				'an array',
				each(undefined, null, 'a', { 0: entry }),
				(fields) => ({ ...naming(), fields })
			],
			['fields[0]', 'an object', each(undefined, null, 'a', 7), (one) => naming(one as never)],
			[
				'fields[0].id',
				'a string',
				each(undefined, null, 7),
				(id) => naming({ ...entry, id } as never)
			],
			[
				'fields[0].keep',
				'a boolean',
				each(undefined, null, 'false', 0, 1),
				(keep) => naming({ ...entry, keep } as never)
			],
			[
				'fields[0].name',
				'a string',
				each(undefined, null, true, 7, ['a']),
				(name) => naming({ ...entry, name } as never)
			],
			[
				'fields[0].description',
				'a string',
				each(undefined, null, true, 7, ['a']),
				(description) => naming({ ...entry, description } as never)
			],
			[
				'fields[0].example',
				'a string',
				each(null, true, 7, ['a']),
				(example) => naming({ ...entry, example } as never)
			],
			[
				'fields[0].title',
				'a string',
				each(null, true, 7, ['a']),
				(title) => naming({ ...entry, title } as never)
			],
			[
				'fields[0].text',
				"'line', 'paragraph' or 'lines'",
				each(null, true, 7, 'banana'),
				(text) => naming({ ...entry, text } as never)
			]
		];
		describe.each(slots)('in %s, which is to be %s', (slot, kind, values, wrong) => {
			it.each(values)('throws for $value', ({ value }) => {
				const call = () => check([a], wrong(value) as never);
				expect(call).toThrow(TypeError);
				expect(call).toThrow(`naming.${slot} is not ${kind}.`);
			});
		});

		it('names the entry by its place in the list', () => {
			expect(() => check([a], naming(entry, { ...entry, name: null } as never))).toThrow(
				'naming.fields[1].name is not a string.'
			);
		});
	});

	it('takes a byte-order mark as a description, as the engine does', () => {
		expect(check([a], { ...naming(kept('a', 'first')), description: '\ufeff' })).toEqual([]);
	});

	it('reports an entry for no field once, whatever its name, and it keeps nothing', () => {
		expect(
			check([a], naming(dropped('a', 'first'), kept('z', 'Not A Name'), kept('z', 'first')))
		).toEqual([
			{ code: 'unknown_field', id: 'z' },
			{ code: 'repeated_field', id: 'z' },
			{ code: 'nothing_kept' }
		]);
	});

	it('reports an id that two entries name', () => {
		expect(check([a], naming(kept('a', 'first'), kept('a', 'second')))).toEqual([
			{ code: 'repeated_field', id: 'a' }
		]);
	});

	it('reports a field that no entry names, which leaves nothing kept', () => {
		expect(check([a], naming())).toEqual([
			{ code: 'unnamed_field', id: 'a' },
			{ code: 'nothing_kept' }
		]);
	});

	it('reports a naming that drops every field', () => {
		expect(check([a], naming(dropped('a', 'first')))).toEqual([{ code: 'nothing_kept' }]);
	});

	it('counts a read-only field as dropped, whatever its entry says', () => {
		const total: Field = { ...text('total'), readOnly: true };
		expect(check([total], naming(kept('total', 'Not A Name')))).toEqual([{ code: 'nothing_kept' }]);
	});

	it('reports a kept entry whose name is not snake_case', () => {
		expect(check([a], naming(kept('a', 'First')))).toEqual([{ code: 'field_name', id: 'a' }]);
	});

	it('reports a name that kept entries share once, however many share it', () => {
		const fields = [a, box, text('c')];
		const entries = [kept('a', 'same'), kept('b', 'same'), kept('c', 'same')];
		expect(check(fields, naming(...entries))).toEqual([{ code: 'duplicate_name', name: 'same' }]);
	});

	it('takes a name that kept fields share when they take the same value', () => {
		const capped: Field = { ...plain, id: 'b', kind: 'text', multiline: false, maxLength: 9 };
		const tall: Field = { ...plain, id: 'c', kind: 'text', multiline: true };
		const entries: FieldNaming[] = [
			kept('a', 'same'),
			kept('b', 'same'),
			{ ...kept('c', 'same'), text: 'line' }
		];
		expect(check([a, capped, tall], naming(...entries))).toEqual([]);
	});

	it.each<[string, Field, Partial<FieldNaming>]>([
		['a paragraph and a line', text('b'), { text: 'paragraph' }],
		['lines and a line', text('b'), { text: 'lines' }],
		['a box and a line', box, {}],
		['dropdowns of other options', { ...plain, id: 'b', kind: 'choice', options: ['x'] }, {}]
	])('reports a name shared by %s', (_, other, more) => {
		const first: Field =
			other.kind === 'choice' ? { ...plain, id: 'a', kind: 'choice', options: ['y'] } : a;
		const entries = [kept('a', 'same'), { ...kept('b', 'same'), ...more }];
		expect(check([first, other], naming(...entries))).toEqual([
			{ code: 'duplicate_name', name: 'same' }
		]);
	});

	describe('radio options that share a name', () => {
		const radio = (id: string, on?: string, group = 'g'): Field => ({
			...plain,
			id,
			kind: 'radio',
			group,
			on
		});
		const entries = [kept('a', 'same'), kept('b', 'same')];

		it('are one answer when they are of one group and each turns on as a value', () => {
			expect(check([radio('a', 'yes'), radio('b', 'no')], naming(...entries))).toEqual([]);
			expect(check([radio('a', 'yes'), radio('b', 'yes')], naming(...entries))).toEqual([]);
		});

		it.each<[string, Field]>([
			['an option of another group', radio('b', 'no', 'h')],
			['an option that turns on as no value', radio('b')],
			['an option that turns on as a blank', radio('b', ' ')],
			['an option whose on-state holds a character an enum value cannot', radio('b', 'yes|no')],
			['an option whose on-state is not well formed', radio('b', 'n\ud800')],
			['a box', { ...plain, id: 'b', kind: 'checkbox' }]
		])('are reported when one shares it with %s', (_, other) => {
			expect(check([radio('a', 'yes'), other], naming(...entries))).toEqual([
				{ code: 'duplicate_name', name: 'same' }
			]);
		});
	});

	it('reports a name that signatures share', () => {
		const signature = (id: string): Field => ({ ...plain, id, kind: 'signature' });
		const entries = [kept('a', 'same'), kept('b', 'same')];
		expect(check([signature('a'), signature('b')], naming(...entries))).toEqual([
			{ code: 'duplicate_name', name: 'same' }
		]);
	});

	it('reports text set on a field that is not text, even a dropped one', () => {
		const radio: Field = { ...plain, id: 'c', kind: 'radio', group: 'c' };
		const entries: FieldNaming[] = [
			{ ...kept('a', 'first'), text: 'lines' },
			{ ...dropped('b', 'second'), text: 'lines' },
			{ ...kept('c', 'third'), text: 'line' }
		];
		expect(check([a, box, radio], naming(...entries))).toEqual([
			{ code: 'text_on_non_text', id: 'b' },
			{ code: 'text_on_non_text', id: 'c' }
		]);
	});

	it.each(['a__b', 'a_'])('takes %j as the quill name and as the name of a kept entry', (name) => {
		expect(check([a], { ...naming(kept('a', name)), name })).toEqual([]);
	});

	it('holds a dropped entry to no rule about names', () => {
		const fields = [a, text('b'), text('c')];
		const entries = [kept('a', 'first'), dropped('b', 'first'), dropped('c', 'Not A Name')];
		expect(check(fields, naming(...entries))).toEqual([]);
	});

	it('returns every problem at once, in the order of the rules', () => {
		const problems = check([a, box, text('c'), text('e')], {
			name: '',
			description: '',
			fields: [
				kept('a', 'first'),
				kept('a', 'first'),
				{ ...kept('b', 'Second'), text: 'line' },
				kept('d', 'fourth'),
				{ ...kept('e', 'first'), text: 'lines' }
			]
		});
		expect(problems).toEqual([
			{ code: 'quill_name' },
			{ code: 'quill_description' },
			{ code: 'unknown_field', id: 'd' },
			{ code: 'repeated_field', id: 'a' },
			{ code: 'unnamed_field', id: 'c' },
			{ code: 'field_name', id: 'b' },
			{ code: 'duplicate_name', name: 'first' },
			{ code: 'text_on_non_text', id: 'b' }
		]);
	});
});

describe('suggest', () => {
	const leave = 'form1[0].page1[0].leaveType[0]';
	const fields: Field[] = [
		text('form1[0].page1[0].Header[0].dateReq[0]'),
		text('sponsor', "Sponsor's name (Last, First, Middle Initial)"),
		text('signed', 'Enter the date on which the member signs this form.'),
		text('waived', 'Enter the date on which the member signs the waiver.'),
		text('member', 'Date signed'),
		text('witness', 'Date signed'),
		text('3aRemarks'),
		text('form1[0].page1[0].'),
		{ ...text('total', 'Total cost'), readOnly: true },
		{ ...plain, id: leave, kind: 'radio', group: leave, on: 'annual' },
		{ ...plain, id: `${leave}#2`, kind: 'radio', group: leave },
		{ ...plain, id: `${leave}#3`, tooltip: 'Other (explain)', kind: 'radio', group: leave },
		text('statementofunderstandingandacknowledgementofterms'),
		text('q2Name'),
		text('grade', '(optional) Pay grade'),
		text('unitName', ' - '),
		text(`1${'a'.repeat(49)}`)
	];

	it('gives an entry per field, described by its tooltip and kept unless read-only', () => {
		expect(suggest([text('a'), { ...text('b', 'Total cost.'), readOnly: true }])).toEqual([
			{ id: 'a', keep: true, name: 'a', description: '' },
			{ id: 'b', keep: false, name: 'total_cost', description: 'Total cost.' }
		]);
	});

	it.each([
		['a line feed', 'Organizational element\n(Indicate division)'],
		['a carriage return', 'Organizational element\r(Indicate division)'],
		['both, a tab, and a space at each end', ' Organizational element \r\n\t(Indicate division) ']
	])('describes a field whose tooltip holds %s in one line', (_, tooltip) => {
		expect(suggest([text('a', tooltip)])[0].description).toBe(
			'Organizational element (Indicate division)'
		);
	});

	it('names a field from its tooltip, or from the end of its id when the tooltip has no word', () => {
		expect(suggest(fields).map((entry) => entry.name)).toEqual([
			'date_req',
			'sponsor_s_name_last_first_middle_initial',
			'enter_the_date_on_which_the_member_signs',
			'enter_the_date_on_which_the_member_signs_2',
			'date_signed',
			'date_signed_2',
			'field_3a_remarks',
			'field',
			'total_cost',
			'leave_type_annual',
			'leave_type',
			'other_explain',
			'statementofunderstandingandacknowledgeme',
			'q2_name',
			'optional_pay_grade',
			'unit_name',
			`field_1${'a'.repeat(33)}`
		]);
	});

	it('suggests a naming in which check finds no problem', () => {
		expect(check(fields, naming(...suggest(fields)))).toEqual([]);
	});

	it('does so for ids and tooltips of any shape, with every name its own', () => {
		// A fixed sequence, so a failure reproduces.
		let seed = 1;
		const below = (n: number) =>
			Math.floor(((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * n);
		const SCRAPS = [
			...['', ' ', '-', '1', 'A', 'dateReq', 'Date Signed', '(optional)', 'é', '😀', '_', '[0]'],
			...['form1[0].', 'x'.repeat(60), '9'.repeat(45), 'date_2', 'field', 'true']
		];
		const scrap = () =>
			Array.from({ length: below(4) }, () => SCRAPS[below(SCRAPS.length)]).join(' ');

		for (let round = 0; round < 500; round++) {
			const generated = Array.from({ length: 1 + below(12) }, (_, index): Field => {
				const base = {
					...plain,
					id: `${scrap()}.${index}`,
					tooltip: below(2) ? scrap() : undefined
				};
				return below(3)
					? { ...base, kind: 'text', multiline: false }
					: { ...base, kind: 'radio', group: scrap(), on: below(2) ? scrap() : undefined };
			});
			const suggested = suggest(generated);
			// A name is one field's, or the options' of one radio group.
			const owners = Map.groupBy(generated, (_, at) => suggested[at].name);
			for (const [name, sharing] of owners) {
				const groups = new Set(sharing.map((field) => field.kind === 'radio' && field.group));
				expect(sharing.length === 1 || (groups.size === 1 && !groups.has(false)), name).toBe(true);
			}
			expect(check(generated, naming(...suggested))).toEqual([]);
		}
	});

	describe('the options of a group', () => {
		const option = (
			id: string,
			group: string,
			on: string | undefined,
			tooltip?: string
		): Field => ({
			...plain,
			id,
			tooltip,
			kind: 'radio',
			group,
			on
		});
		const named = (fields: Field[]) => suggest(fields).map(({ name }) => name);

		describe('that each turn on as a value', () => {
			it('share one name, from the tooltip they share, and are described by it', () => {
				const pair = [
					option('attached', 'attached', 'is', 'Job description'),
					option('attached#2', 'attached', 'is_not', 'Job description')
				];
				expect(suggest(pair)).toEqual([
					{ id: 'attached', keep: true, name: 'job_description', description: 'Job description' },
					{ id: 'attached#2', keep: true, name: 'job_description', description: 'Job description' }
				]);
			});

			it('are numbered by group when two groups share the tooltip', () => {
				const patient = (group: string) => [
					option(group, group, 'yes', 'The patient'),
					option(`${group}#2`, group, 'no', 'The patient')
				];
				expect(named([...patient('a'), ...patient('b')])).toEqual([
					'the_patient',
					'the_patient',
					'the_patient_2',
					'the_patient_2'
				]);
			});

			it('are named by the end of the group when their tooltips differ, and described by each', () => {
				const fields = [
					option('a', 'form1[0].smoker[0]', 'yes', 'Smoker'),
					option('a#2', 'form1[0].smoker[0]', 'no', 'Non-smoker'),
					option('b', 'h', 'yes'),
					option('b#2', 'h', 'no')
				];
				expect(suggest(fields).map(({ name, description }) => [name, description])).toEqual([
					['smoker', 'Smoker / Non-smoker'],
					['smoker', 'Smoker / Non-smoker'],
					['h', ''],
					['h', '']
				]);
			});

			it('share one name when the options a person can fill do, whatever a read-only one turns on as', () => {
				const fields = [
					option('a', 'g', 'yes', 'Smoker'),
					option('a#2', 'g', 'no', 'Smoker'),
					{ ...option('a#3', 'g', undefined, 'Smoker'), readOnly: true },
					option('b', 'h', 'yes', 'Pet'),
					{ ...option('b#2', 'h', 'no', 'Pet'), readOnly: true }
				];
				expect(suggest(fields).map(({ name, keep }) => [name, keep])).toEqual([
					['smoker', true],
					['smoker', true],
					['smoker', false],
					['pet_yes', true],
					['pet_no', false]
				]);
			});

			it('share one name when two of them turn on as one value', () => {
				expect(
					named([
						option('a', 'g', 'one', 'Pick'),
						option('a#2', 'g', 'two'),
						option('a#3', 'g', 'one')
					])
				).toEqual(['pick', 'pick', 'pick']);
			});
		});

		describe('that share a tooltip, and not each turn on as a value', () => {
			it('are named by their on-states, and described by them', () => {
				const fields = [
					option('attached', 'attached', 'is', 'Job description'),
					option('attached#2', 'attached', 'is_not', 'Job description'),
					option('attached#3', 'attached', undefined, 'Job description')
				];
				expect(suggest(fields)).toEqual([
					{
						id: 'attached',
						keep: true,
						name: 'job_description_is',
						description: 'Job description (is)'
					},
					{
						id: 'attached#2',
						keep: true,
						name: 'job_description_is_not',
						description: 'Job description (is_not)'
					},
					{
						id: 'attached#3',
						keep: true,
						name: 'job_description',
						description: 'Job description'
					}
				]);
			});

			it('cut the words of a long tooltip and not the on-state', () => {
				const tooltip = 'Enter the date on which the member signs this form';
				const long = 'attached to this application';
				const names = named([
					option('a', 'g', 'yes', tooltip),
					option('a#2', 'g', 'no', tooltip),
					option('a#3', 'g', undefined),
					option('b', 'h', long, tooltip),
					option('b#2', 'h', 'no', tooltip),
					option('b#3', 'h', undefined)
				]);
				expect(names).toEqual([
					'enter_the_date_on_which_the_member_yes',
					'enter_the_date_on_which_the_member_no',
					'g',
					'enter_the_attached_to_this_application',
					'enter_the_date_on_which_the_member_no_2',
					'h'
				]);
				for (const name of names) expect(name.length).toBeLessThanOrEqual(40);
			});

			it('start with field_ when the tooltip starts with a digit', () => {
				expect(
					named([option('a', 'g', 'yes', '3rd party'), option('a#2', 'g', undefined, '3rd party')])
				).toEqual(['field_3rd_party_yes', 'field_3rd_party']);
			});

			it('are named by the on-state alone when no whole word of the tooltip fits beside it', () => {
				const long = 'accredited foreign government official';
				const wide = 'x'.repeat(33);
				expect(
					named([
						option('a', 'g', long, 'Appearance'),
						option('a#2', 'g', undefined, 'Appearance'),
						option('b', 'h', wide, '3rd party'),
						option('b#2', 'h', undefined, '3rd party')
					])
				).toEqual([
					'accredited_foreign_government_official',
					'appearance',
					wide,
					'field_3rd_party'
				]);
			});

			it('are named from the tooltip alone when the on-state has no words', () => {
				const fields = [
					option('a', 'g', 'dog', 'Pet'),
					option('a#2', 'g', undefined, 'Pet'),
					option('a#3', 'g', '-', 'Pet'),
					option('a#4', 'g', '', 'Pet')
				];
				expect(suggest(fields).map(({ name, description }) => [name, description])).toEqual([
					['pet_dog', 'Pet (dog)'],
					['pet', 'Pet'],
					['pet_2', 'Pet (-)'],
					['pet_3', 'Pet']
				]);
			});

			it('are named as before when each option has a tooltip of its own, or none', () => {
				const fields = [
					option('a', 'g', 'yes', 'Smoker'),
					option('a#2', 'g', undefined, 'Non-smoker'),
					option('b', 'h', 'yes'),
					option('b#2', 'h', undefined)
				];
				expect(named(fields)).toEqual(['smoker', 'non_smoker', 'h_yes', 'h']);
			});

			it('are named as before when the tooltip is shared with fields that are no option of the group', () => {
				const box: Field = { ...plain, id: 'c', tooltip: 'Sex', kind: 'checkbox' };
				const fields = [
					option('a', 'g', 'm', 'Sex'),
					option('b', 'h', 'f', 'Sex'),
					box,
					{ ...box, id: 'd' },
					text('e', 'Sex')
				];
				expect(suggest(fields)[0].description).toBe('Sex');
				expect(named(fields)).toEqual(['sex', 'sex_2', 'sex_3', 'sex_4', 'sex_5']);
			});
		});
	});
});
