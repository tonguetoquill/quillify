/**
 * The whole import against a three-page form with 50 widgets, built in the
 * shape of DD Form 2977: text, button and choice, three of them push buttons,
 * which are no fields. Inventory, strip, assemble and render all run, and the
 * assertions are what those stages promise about the form's kinds, pages,
 * rects and render.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { dd2977Shape } from '../test/dd2977-shape.js';
import { fromTree, render } from '../test/engine.js';
import { assembleQuill } from './assemble.js';
import { inventoryPdf } from './inventory.js';
import { stripAcroForm } from './strip.js';
import type { FieldInventory, QualifiedField, QualifiedForm } from './types.js';

let bytes: Uint8Array;

/** A name for every widget, with the type its kind gives it. */
function qualify(inventory: FieldInventory): QualifiedForm {
	const fields: QualifiedField[] = inventory.widgets.map((w, i) => ({
		widget: w.id,
		name: `field_${i}`,
		label: w.name,
		description: `Widget ${w.name}.`,
		type: w.kind === 'Btn' ? 'boolean' : w.kind === 'Ch' ? 'enum' : 'string',
		multiline: w.multiLine,
		options: w.kind === 'Ch' ? (w.options.length ? w.options : ['a', 'b']) : undefined,
		example: w.kind === 'Tx' ? 'MMMMMMMM' : undefined,
		keep: true,
		required: false
	}));
	return {
		quill: { name: 'dd2977_probe', title: 'DD 2977', description: 'Risk assessment worksheet.' },
		fields
	};
}

beforeAll(async () => {
	bytes = await dd2977Shape();
});

describe('a form in the shape of DD Form 2977', () => {
	it('inventories every widget with a page, a rect and a kind', async () => {
		const inventory = await inventoryPdf(bytes);

		expect(inventory.widgets.length).toBeGreaterThanOrEqual(40);
		expect(new Set(inventory.widgets.map((w) => w.kind))).toEqual(new Set(['Tx', 'Btn', 'Ch']));
		expect(new Set(inventory.widgets.map((w) => w.id)).size).toBe(inventory.widgets.length);
		for (const w of inventory.widgets) {
			for (const { page: index, rect } of w.places) {
				const page = inventory.pages[index];
				expect(page).toBeDefined();
				expect(rect.w).toBeGreaterThan(0);
				expect(rect.h).toBeGreaterThan(0);
				expect(rect.x).toBeGreaterThanOrEqual(-1);
				expect(rect.y).toBeGreaterThanOrEqual(-1);
				expect(rect.x + rect.w).toBeLessThanOrEqual(page.width + 1);
				expect(rect.y + rect.h).toBeLessThanOrEqual(page.height + 1);
			}
		}
	}, 90_000);

	it('strips the form layer and renders the rebuilt one', async () => {
		const inventory = await inventoryPdf(bytes);
		const background = await stripAcroForm(bytes, inventory.views);
		const text = new TextDecoder('latin1').decode(background);
		expect(text).not.toContain('/AcroForm');
		expect(text).not.toContain('/Widget');

		const tree = assembleQuill(qualify(inventory), inventory, background);
		const yaml = new TextDecoder().decode(tree.get('Quill.yaml')!);
		expect(yaml).toContain('backend: acroform');
		const formJson = JSON.parse(new TextDecoder().decode(tree.get('Form.yaml')!)) as {
			schema: string;
			fields: { schema_field: string; page: number }[];
		};
		expect(formJson.schema).toBe('quillmark/form@0.2.0');
		expect(formJson.fields.length).toBe(inventory.widgets.length);

		const { quill } = await fromTree(tree);
		const seed = quill.seedDocument();
		const markdown = seed.toMarkdown();
		seed.free();
		const pdf = await render(quill, markdown);
		expect(pdf.byteLength).toBeGreaterThan(1000);
	}, 120_000);
});
