import { PDFDocument, PDFName } from 'pdf-lib';
import { stampedNames } from './closure.js';

/**
 * The `Form.yaml` entries whose box is on in a filled PDF. An entry is the
 * widget its place holds among the widgets of the field `stampedNames` gives
 * it, in the order the entries come.
 */
export async function ticked(formYaml: Uint8Array, filled: Uint8Array): Promise<string[]> {
	const form = (await PDFDocument.load(filled)).getForm();
	const names = stampedNames(formYaml);
	const seen = new Map<string, number>();
	const on: string[] = [];
	for (const [entry, field] of names) {
		const at = seen.get(field) ?? 0;
		seen.set(field, at + 1);
		const state = form.getField(field).acroField.getWidgets()[at].getAppearanceState();
		if (state && state !== PDFName.of('Off')) on.push(entry);
	}
	return on;
}
