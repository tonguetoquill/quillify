import { SNAKE_CASE } from './types.js';
import { answer, shape } from './shape.js';
import type { Field, FieldNaming, Naming, Problem } from './api.js';

const MAX_LENGTH = 40;

const snake = (text: string) =>
	text
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/[^A-Za-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.toLowerCase();

/** The last segment of the LiveCycle id `form1[0].page1[0].Header[0].dateReq[0]` is `dateReq`. */
const lastSegment = (path: string) => path.slice(path.lastIndexOf('.') + 1).replace(/\[\d+\]$/, '');

const squeeze = (text: string) => text.trim().replace(/\s+/g, ' ');

const lead = (words: string) => (/^[a-z]/.test(words) ? words : words ? `field_${words}` : 'field');

/** The whole words of `words` that fit in `limit`, or nothing when no whole word does. */
function whole(words: string, limit: number) {
	if (words.length <= limit) return words;
	const head = words.slice(0, Math.max(0, words.lastIndexOf('_', limit)));
	return head === 'field' ? '' : head;
}

/** `words` cut to `limit`: the whole words that fit, or its first `limit` characters when no whole word does. */
const fit = (words: string, limit: number) => whole(words, limit) || words.slice(0, limit);

export function suggest(fields: readonly Field[]): FieldNaming[] {
	// Options of one group whose tooltips read alike are told apart by their on-states.
	const tooltips = fields.map((field) => snake(field.tooltip ?? ''));
	const keys = fields.map((field, at) =>
		field.kind === 'radio' && tooltips[at] ? `${tooltips[at]}\0${field.group}` : ''
	);
	const once = new Set<string>();
	const alike = new Set<string>();
	for (const key of keys) if (key) (once.has(key) ? alike : once).add(key);

	// The options of a group that each turn on as a value are one answer, under one name.
	const groups = Map.groupBy(
		fields.filter((field) => field.kind === 'radio'),
		(field) => field.group
	);
	const answered = new Set(
		[...groups]
			.map(([group, options]) => [group, options.filter((o) => !o.readOnly)] as const)
			.filter(([, options]) => options.length > 1 && options.every((o) => answer(o) !== undefined))
			.map(([group]) => group)
	);
	const byGroup = new Map<string, Pick<FieldNaming, 'name' | 'description'>>();

	const taken = new Set<string>();
	const unique = (base: string) => {
		let name = base;
		for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
		taken.add(name);
		return name;
	};
	return fields.map((field, at) => {
		const radio = field.kind === 'radio' ? field : undefined;
		if (radio && answered.has(radio.group)) {
			let named = byGroup.get(radio.group);
			if (!named) {
				const options = groups.get(radio.group)!;
				const said = [...new Set(options.map((o) => squeeze(o.tooltip ?? '')).filter(Boolean))];
				const words = (said.length === 1 && snake(said[0])) || snake(lastSegment(radio.group));
				named = { name: unique(fit(lead(words), MAX_LENGTH)), description: said.join(' / ') };
				byGroup.set(radio.group, named);
			}
			return { id: field.id, keep: !field.readOnly, ...named };
		}
		const said = radio && alike.has(keys[at]) ? squeeze(radio.on ?? '') : '';
		const on = snake(said);
		const head = on && whole(lead(tooltips[at]), MAX_LENGTH - 1 - on.length);
		const words =
			on ||
			tooltips[at] ||
			snake(radio ? `${lastSegment(radio.group)} ${radio.on ?? ''}` : lastSegment(field.id));
		const name = unique(head ? `${head}_${on}` : fit(lead(words), MAX_LENGTH));
		const tooltip = squeeze(field.tooltip ?? '');
		const description = said ? `${tooltip} (${said})` : tooltip;
		return { id: field.id, keep: !field.readOnly, name, description };
	});
}

const TEXT: ReadonlySet<unknown> = new Set(['line', 'paragraph', 'lines']);

/**
 * A naming can be a model's JSON, which TypeScript never saw. A slot of the
 * wrong type is a mistake in the call and no fault of a name, so it throws: a
 * pattern reads `null` as the word, and the word is a name.
 */
function shaped({ name, description, fields }: Naming): void {
	const not = (slot: string, kind: string): never => {
		throw new TypeError(`naming.${slot} is not ${kind}.`);
	};
	if (typeof name !== 'string') not('name', 'a string');
	if (typeof description !== 'string') not('description', 'a string');
	if (!Array.isArray(fields)) not('fields', 'an array');
	fields.forEach((entry: FieldNaming | null, at) => {
		const slot = `fields[${at}]`;
		if (typeof entry !== 'object' || entry === null) return not(slot, 'an object');
		if (typeof entry.id !== 'string') not(`${slot}.id`, 'a string');
		if (typeof entry.keep !== 'boolean') not(`${slot}.keep`, 'a boolean');
		if (typeof entry.name !== 'string') not(`${slot}.name`, 'a string');
		if (typeof entry.description !== 'string') not(`${slot}.description`, 'a string');
		if (entry.title !== undefined && typeof entry.title !== 'string')
			not(`${slot}.title`, 'a string');
		if (entry.example !== undefined && typeof entry.example !== 'string')
			not(`${slot}.example`, 'a string');
		if (entry.text !== undefined && !TEXT.has(entry.text))
			not(`${slot}.text`, "'line', 'paragraph' or 'lines'");
	});
}

export function check(fields: readonly Field[], naming: Naming): Problem[] {
	shaped(naming);
	const problems: Problem[] = [];
	if (!SNAKE_CASE.test(naming.name)) problems.push({ code: 'quill_name' });
	if (/^\p{White_Space}*$/u.test(naming.description)) problems.push({ code: 'quill_description' });

	const ids = new Set(fields.map((field) => field.id));
	const entries = Map.groupBy(naming.fields, (entry) => entry.id);
	for (const id of entries.keys()) if (!ids.has(id)) problems.push({ code: 'unknown_field', id });
	for (const [id, sharing] of entries)
		if (sharing.length > 1) problems.push({ code: 'repeated_field', id });
	for (const id of ids) if (!entries.has(id)) problems.push({ code: 'unnamed_field', id });

	// A read-only field is left out whatever its entry says, so it counts as dropped.
	const fillable = new Set(fields.filter((field) => !field.readOnly).map((field) => field.id));
	const kept = naming.fields.filter((entry) => entry.keep && fillable.has(entry.id));
	if (kept.length === 0) problems.push({ code: 'nothing_kept' });
	for (const { id, name } of kept)
		if (!SNAKE_CASE.test(name)) problems.push({ code: 'field_name', id });
	const byId = new Map(fields.map((field) => [field.id, field]));
	for (const [name, sharing] of Map.groupBy(kept, (entry) => entry.name)) {
		const shapes = new Set(sharing.map(({ id, text }) => shape(byId.get(id)!, text)));
		if (sharing.length > 1 && (shapes.size > 1 || shapes.has(null)))
			problems.push({ code: 'duplicate_name', name });
	}
	for (const { id, kind } of fields)
		if (kind !== 'text' && entries.get(id)?.some((entry) => entry.text))
			problems.push({ code: 'text_on_non_text', id });
	return problems;
}
