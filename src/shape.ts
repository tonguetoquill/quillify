import type { Field, FieldNaming } from './api.js';
import type { QualifiedField } from './types.js';

/** The engine reads `max:` as a u32, and a cap of 0 takes nothing. */
const capped = (max: number | undefined): max is number =>
	max !== undefined && Number.isInteger(max) && max > 0 && max <= 0xffffffff;

export function typed(
	field: Field,
	text: FieldNaming['text']
): Pick<QualifiedField, 'type' | 'multiline' | 'options' | 'max'> {
	switch (field.kind) {
		case 'text':
			if (text === 'lines') return { type: 'array', multiline: true };
			return {
				type: 'string',
				multiline: text ? text === 'paragraph' : field.multiline,
				...(capped(field.maxLength) ? { max: field.maxLength } : {})
			};
		case 'choice':
			return { type: 'enum', multiline: false, options: [...field.options] };
		case 'checkbox':
		case 'radio':
			return { type: 'boolean', multiline: false };
		case 'signature':
			return { type: 'string', multiline: false };
	}
}

/**
 * A radio option's on-state as a value of its group's enum, or undefined when
 * the engine refuses it as one: blank, holding ";", ">" or "|", or not well formed.
 */
export const answer = (field: Field): string | undefined =>
	field.kind === 'radio' && field.on?.trim() && !/[;>|]/.test(field.on) && field.on.isWellFormed()
		? field.on
		: undefined;

/**
 * The value a field takes, which fields that share a name agree on. A signature
 * takes none. The options of one radio group take one answer, of an enum of
 * their on-states, when each turns on as a value.
 */
export function shape(field: Field, text: FieldNaming['text']): string | null {
	if (field.kind === 'signature') return null;
	if (field.kind === 'radio')
		return answer(field) === undefined ? null : JSON.stringify(['radio', field.group]);
	const { type, multiline, options } = typed(field, text);
	return JSON.stringify([type, multiline, options ?? []]);
}
