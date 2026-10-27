import { init, isQuillmarkError } from '@quillmark/wasm';
import { assembleQuill } from './assemble.js';
import { check } from './naming.js';
import { answer, typed } from './shape.js';
import type { Field, Form, Naming, Problem } from './api.js';

export type Quillified =
	{ ok: true; tree: Map<string, Uint8Array> } | { ok: false; problems: readonly Problem[] };

/** The inventory's code for each kind, which is how the assembly tells a signature from a field. */
const WIDGET = {
	text: 'Tx',
	checkbox: 'Btn',
	radio: 'Btn',
	choice: 'Ch',
	signature: 'Sig'
} as const;

/**
 * A choice shows one of its options even when the naming gives none, so its
 * list is seen in the example. A box is ticked by an example of `true` alone.
 */
function shown(field: Field, suggested: string | undefined): string | undefined {
	const value = suggested?.trim() || undefined;
	if (field.kind === 'choice')
		return value !== undefined && field.options.includes(value) ? value : field.options[0];
	if (field.kind === 'checkbox' || field.kind === 'radio')
		return value === 'true' ? value : undefined;
	if (field.kind !== 'text') return undefined;
	return value && field.maxLength ? [...value].slice(0, field.maxLength).join('') : value;
}

/**
 * A quill's files from a sanitized form and a naming of its fields, or the
 * problems that stop one being built: `check`'s, and then the engine's.
 */
export async function quillify(form: Form, naming: Naming): Promise<Quillified> {
	const problems = check(form.fields, naming);
	if (problems.length > 0) return { ok: false, problems };

	const byId = new Map(form.fields.map((field) => [field.id, field]));
	// The kept options of one radio group that share a name are one enum of their on-states.
	const kept = naming.fields.filter((entry) => entry.keep && !byId.get(entry.id)!.readOnly);
	const answers = new Map<string, string[]>();
	for (const [name, sharing] of Map.groupBy(kept, (entry) => entry.name)) {
		const ons = sharing.map((entry) => answer(byId.get(entry.id)!));
		if (sharing.length > 1 && ons.every((on) => on !== undefined))
			answers.set(name, [...new Set(ons)]);
	}

	const tree = assembleQuill(
		{
			quill: { name: naming.name, description: naming.description },
			fields: naming.fields.map((entry) => {
				const field = byId.get(entry.id)!;
				const options = field.kind === 'radio' ? answers.get(entry.name) : undefined;
				const on = options && answer(field);
				const example = shown(field, entry.example);
				return {
					widget: entry.id,
					name: entry.name,
					...(entry.title === undefined ? {} : { title: entry.title }),
					description: entry.description,
					...(on
						? { type: 'enum' as const, multiline: false, options, option: on }
						: typed(field, entry.text)),
					...(example === undefined ? {} : { example: on || example }),
					keep: entry.keep && !field.readOnly,
					required: field.required
				};
			})
		},
		{
			widgets: form.fields.map(({ id, kind, places, tooltip }) => ({
				id,
				kind: WIDGET[kind],
				places: [...places],
				tooltip
			}))
		},
		form.pdf
	);

	const { Quill } = await init();
	try {
		Quill.fromTree(tree).free();
	} catch (err) {
		if (!isQuillmarkError(err)) throw err;
		return {
			ok: false,
			problems: err.diagnostics.map(({ code, message }) => ({
				code: 'engine',
				diagnostic: code,
				message
			}))
		};
	}
	return { ok: true, tree };
}
