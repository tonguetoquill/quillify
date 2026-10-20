import type { InventoryWidget, QualifiedField, QualifiedForm, QuillTree } from './types.js';

/** What the assembly reads of a field, of the form and of a widget. Its tests hand it a quill title, which it does not read. */
type Named = Omit<QualifiedField, 'label'>;
type Qualified = {
	quill: Pick<QualifiedForm['quill'], 'name' | 'description'> & { title?: string };
	fields: Named[];
};
type Placed = Pick<InventoryWidget, 'id' | 'kind' | 'places' | 'tooltip'>;

/** Every quill the library builds is a first version. */
export const QUILL_VERSION = '0.1.0';

/**
 * JSON as YAML the engine reads: the characters its reader refuses and JSON
 * leaves raw (U+007F to U+009F, U+FFFE and U+FFFF) are written as `\u` escapes.
 */
const escaped = (json: string) =>
	json.replace(
		/[\u007f-\u009f\ufffe\uffff]/g,
		(c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
	);

/** A string as a YAML double-quoted scalar, which JSON writes from a well formed string. */
const q = (s: string) => escaped(JSON.stringify(s.toWellFormed()));

/**
 * A `default:` says nobody need answer the field. A required field declares
 * none, a boolean apart: it defaults to false either way.
 */
function fieldYaml(field: Named): string[] {
	const lines = [`    ${q(field.name)}:`];
	if (field.title !== undefined) lines.push(`      title: ${q(field.title)}`);
	switch (field.type) {
		case 'string':
			lines.push('      type: text');
			if (!field.required) lines.push('      default: ""');
			if (field.multiline) lines.push('      multiline: true');
			if (field.max !== undefined) lines.push(`      max: ${field.max}`);
			break;
		case 'boolean':
			lines.push('      type: boolean', '      default: false');
			break;
		case 'enum': {
			// The engine supplies the blank row and refuses it as a declared value. A
			// dropdown with no other row offers nothing to choose, which is a text box.
			// It refuses ";", ">" and "|" in a value too, so a dropdown with one is a text box.
			const values = (field.options ?? []).filter((option) => option !== '');
			if (values.length === 0 || values.some((value) => /[;>|]/.test(value)))
				lines.push('      type: text');
			else {
				lines.push('      type: enum', '      values:');
				for (const value of values) lines.push(`        - ${q(value)}`);
			}
			if (!field.required) lines.push('      default: ""');
			break;
		}
		case 'array':
			lines.push('      type: array', '      items:', '        type: text');
			if (!field.required) lines.push('      default: []');
			break;
	}
	lines.push(`      description: ${q(field.description)}`);
	return lines;
}

export function quillYaml(form: Qualified, fields: Named[]): string {
	const lines = [
		'quill:',
		`  name: ${q(form.quill.name)}`,
		`  version: ${QUILL_VERSION}`,
		'  backend: acroform',
		`  description: ${q(form.quill.description)}`,
		'',
		'main:',
		'  body:',
		'    enabled: false'
	];
	if (fields.length > 0) {
		lines.push('  fields:');
		for (const field of fields) for (const line of fieldYaml(field)) lines.push(line);
	}
	return lines.join('\n') + '\n';
}

/** The sample values as the quill's example document, or null when no kept field carries one. */
function exampleMarkdown(form: Qualified, fields: Named[]): string | null {
	const lines = fields.flatMap((f) => {
		if (f.example === undefined || f.type === 'boolean') return [];
		return f.type === 'array'
			? [`${q(f.name)}:`, `  - ${q(f.example)}`]
			: [`${q(f.name)}: ${q(f.example)}`];
	});
	if (lines.length === 0) return null;
	return ['~~~', `$quill: ${q(form.quill.name)}`, ...lines, '~~~', ''].join('\n');
}

/**
 * An `acroform` quill tree from the qualified fields and the stripped background.
 * Signatures are always unbound widgets; a dropped field leaves no widget.
 */
export function assembleQuill(
	form: Qualified,
	inventory: { widgets: Placed[] },
	formPdf: Uint8Array
): QuillTree {
	const byId = new Map(inventory.widgets.map((w) => [w.id, w]));
	const widgetOf = (field: Named): Placed => {
		const widget = byId.get(field.widget);
		if (!widget) throw new Error(`Field ${field.name} names no widget ${field.widget}.`);
		return widget;
	};
	const kept = form.fields.filter((f) => f.keep);
	const bound = kept.filter((f) => widgetOf(f).kind !== 'Sig');
	const signatures = kept.filter((f) => widgetOf(f).kind === 'Sig');

	const formJson = {
		schema: 'quillmark/form@0.2.0',
		// One binding per place, all of them naming the same schema field, so a
		// form that paints a value twice gets it in both boxes from one answer.
		fields: bound.flatMap((f) => {
			const w = widgetOf(f);
			return w.places.map((place, n) => ({
				name: placeName(w.id, n),
				schema_field: f.name,
				page: place.page,
				rect: place.rect,
				...(w.tooltip ? { tooltip: w.tooltip.toWellFormed() } : {}),
				...(place.fontSize ? { font_size: place.fontSize } : {})
			}));
		}),
		widgets: signatures.flatMap((f) => {
			const w = widgetOf(f);
			return w.places.map((place, n) => ({
				name: placeName(w.id, n),
				type: 'signature',
				page: place.page,
				rect: place.rect,
				...(w.tooltip ? { tooltip: w.tooltip.toWellFormed() } : {})
			}));
		})
	};

	const encoder = new TextEncoder();
	const tree = new Map<string, Uint8Array>([
		['Quill.yaml', encoder.encode(quillYaml(form, bound))],
		['form.pdf', formPdf],
		['form.yaml', encoder.encode(escaped(JSON.stringify(formJson, null, 2)) + '\n')]
	]);
	const example = exampleMarkdown(form, bound);
	if (example) tree.set('example.md', encoder.encode(example));
	return tree;
}

/** Each place gets its own widget name, and all of a field's places name one schema field. */
function placeName(id: string, index: number): string {
	return index === 0 ? id : `${id}#${index + 1}`;
}
