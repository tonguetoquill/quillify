/**
 * Six published forms through the stages `sanitize` runs, in its order. Four
 * arrive locked, and DD 1610, DD 577 and DD 689 are hybrid LiveCycle forms:
 * qpdf unlocks them, and an XFA template beside a field tree is no refusal.
 */

import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import tdyUrl from '../test/fixtures/DD1610_Request_and_Authorization_for_TDY_Travel.pdf?url';
import appointmentUrl from '../test/fixtures/DD577_Appointment_Termination_Record.pdf?url';
import sickSlipUrl from '../test/fixtures/DD689_Individual_Sick_Slip.pdf?url';
import priorServiceUrl from '../test/fixtures/SF144_Statement_of_Prior_Federal_Service.pdf?url';
import beneficiaryUrl from '../test/fixtures/SF1152_Designation_of_Beneficiary_Unpaid_Compensation.pdf?url';
import trainingUrl from '../test/fixtures/SF182_Authorization_Agreement_and_Certification_of_Training.pdf?url';
import { assembleQuill } from './assemble.js';
import { inventoryPdf } from './inventory.js';
import { normalizePdf } from './normalize.js';
import { stripAcroForm } from './strip.js';
import { xfaToAcroForm } from './xfa.js';

/**
 * `pages` is how many pages each published file holds. The rest count what
 * `inventoryPdf` reads from it: its entries as `widgets`, the signature fields
 * among them, and those it finds hover text for.
 */
const CORPUS = [
	{ name: 'DD 1610 TDY', url: tdyUrl, pages: 3, widgets: 46, signatures: 2, tooltips: 46 },
	{
		name: 'DD 577 appointment',
		url: appointmentUrl,
		pages: 1,
		widgets: 35,
		signatures: 4,
		tooltips: 35
	},
	{
		name: 'DD 689 sick slip',
		url: sickSlipUrl,
		pages: 1,
		widgets: 21,
		signatures: 2,
		tooltips: 21
	},
	{
		name: 'SF 144 prior service',
		url: priorServiceUrl,
		pages: 2,
		widgets: 44,
		signatures: 0,
		tooltips: 41
	},
	{ name: 'SF 182 training', url: trainingUrl, pages: 9, widgets: 84, signatures: 5, tooltips: 84 },
	// 60 field widgets, 30 fields: the form ships an original and a file
	// copy over one field tree, so every box is painted twice.
	{
		name: 'SF 1152 beneficiary',
		url: beneficiaryUrl,
		pages: 4,
		widgets: 30,
		signatures: 0,
		tooltips: 30
	}
];

/**
 * Every stream pdf-lib can inflate, as text. An XFA packet is Flate, so it is
 * among them; an image codec pdf-lib has no decoder for is not.
 */
async function inflated(bytes: Uint8Array): Promise<string> {
	const latin1 = new TextDecoder('latin1');
	const doc = await PDFDocument.load(bytes);
	return doc.context
		.enumerateIndirectObjects()
		.flatMap(([, object]) => {
			if (!(object instanceof PDFRawStream)) return [];
			try {
				return [latin1.decode(decodePDFRawStream(object).decode())];
			} catch {
				return [];
			}
		})
		.join('\n');
}

describe('the published forms', () => {
	for (const form of CORPUS) {
		it(`${form.name} inventories, and its background survives`, async () => {
			// `xfaToAcroForm` returns these unchanged, since each is hybrid or plain.
			// xfa.browser.test.ts has the dynamic forms.
			const original = new Uint8Array(await (await fetch(form.url)).arrayBuffer());
			const bytes = await xfaToAcroForm(await normalizePdf(original));

			const inventory = await inventoryPdf(bytes);
			expect(inventory.pages).toHaveLength(form.pages);
			expect(inventory.widgets).toHaveLength(form.widgets);
			for (const widget of inventory.widgets)
				for (const place of widget.places) {
					expect(place.rect.w, widget.id).toBeGreaterThan(0);
					expect(place.rect.h, widget.id).toBeGreaterThan(0);
					expect(place.page).toBeLessThan(form.pages);
				}
			// qpdf's --remove-restrictions takes these with it.
			expect(inventory.widgets.filter((w) => w.kind === 'Sig')).toHaveLength(form.signatures);
			// Acrobat writes `/TU` on the field and leaves the widgets in `/Kids`
			// bare, so a count here that drops is a tooltip inheritance regression.
			expect(inventory.widgets.filter((w) => w.tooltip)).toHaveLength(form.tooltips);

			// The page the values get stamped over keeps its printed content and
			// loses its form layer, including the Reader Extensions signature that
			// decrypting already invalidated.
			const background = await stripAcroForm(bytes, inventory.views);
			expect(background.byteLength).toBeGreaterThan(1000);
			const text = new TextDecoder('latin1').decode(background);
			expect(text).not.toContain('/AcroForm');
			expect(text).not.toContain('/Perms');
			expect(text).not.toContain('/UR3');
			expect(text).not.toContain('/ByteRange');
			// A hybrid form's XFA packet names its authors' accounts, machine paths
			// and tools, inside compressed streams a search of the raw bytes misses.
			const streams = await inflated(background);
			expect(streams).not.toContain('<xdp:xdp');
			expect(streams).not.toContain('<template xmlns="http://www.xfa.org/schema/xfa-template');
			expect(streams).not.toContain('xfa:datasets');
			// So do its metadata and its document scripts, and neither is the page.
			expect(streams).not.toContain('xmpmeta');
			expect(text).not.toContain('/JavaScript');
			const kept = await PDFDocument.load(background, { updateMetadata: false });
			expect(kept.context.trailerInfo.Info).toBeUndefined();
		}, 120_000);
	}
});

describe('a form that paints one value in two places', () => {
	it('SF 1152 asks for it once and stamps it twice', async () => {
		const bytes = await xfaToAcroForm(
			await normalizePdf(new Uint8Array(await (await fetch(beneficiaryUrl)).arrayBuffer()))
		);
		const inventory = await inventoryPdf(bytes);
		// One name is one value in the file. Treating the copies as separate
		// fields asks the person to type every answer on this form twice.
		expect(inventory.widgets.every((w) => w.places.length === 2)).toBe(true);
		expect(new Set(inventory.widgets.map((w) => w.name)).size).toBe(inventory.widgets.length);

		const quill = assembleQuill(
			{
				quill: { name: 'sf1152', title: 'Beneficiary', description: 'd' },
				fields: inventory.widgets.map((w, index) => ({
					widget: w.id,
					name: `field_${index}`,
					label: w.tooltip ?? w.id,
					description: 'd',
					type: 'string' as const,
					multiline: false,
					keep: true,
					required: false
				}))
			},
			inventory,
			await stripAcroForm(bytes, inventory.views)
		);
		const formJson = JSON.parse(new TextDecoder().decode(quill.get('Form.yaml')!)) as {
			fields: { name: string; schema_field: string }[];
		};
		expect(formJson.fields).toHaveLength(60);
		expect(new Set(formJson.fields.map((f) => f.schema_field)).size).toBe(30);
		expect(new Set(formJson.fields.map((f) => f.name)).size).toBe(60);
	}, 120_000);
});
