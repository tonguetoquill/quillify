/**
 * Each form of the manifest goes through the public functions and the engine,
 * and its outcome is held to the one the manifest records. `README.md` beside
 * this file says what the forms are and how to run it.
 */

import { expect, inject, it } from 'vitest';
import { quillify, sanitize, suggest } from '../src/index.js';
import { walked } from '../test/background.js';
import { expectClosure } from '../test/closure.js';
import { fromTree, render } from '../test/engine.js';
import manifest from './manifest.json' with { type: 'json' };

const found = inject('found');

it('the directory holds every form of the manifest and no other PDF', () => {
	const named = new Set(manifest.map((form) => form.sha256));
	const unnamed = Object.keys(found).filter((sha256) => !named.has(sha256));
	expect({
		unnamed: unnamed.map((sha256) => found[sha256]),
		missing: manifest.filter((form) => !(form.sha256 in found)).map((form) => form.form)
	}).toEqual({ unnamed: [], missing: [] });
});

/**
 * A refusal's code, or `converted` once the engine has stamped a field at every
 * place `Form.yaml` gives, with what was read. `why` is the refusal or the
 * problems, for the failure to print. The background of a form that converts
 * is walked against the strip's table on the way.
 */
async function outcome(pdf: Uint8Array) {
	const read = await sanitize(pdf);
	if (!read.ok) return { outcome: read.refusal.code, why: read.refusal };
	const { form } = read;
	expect((await walked(form.pdf)).problems, 'the background against the table').toEqual([]);
	const built = await quillify(form, {
		name: 'corpus',
		description: 'A form of the corpus.',
		fields: suggest(form.fields)
	});
	if (!built.ok) return { outcome: 'problems', why: built.problems };
	const { ref, quill } = await fromTree(built.tree);
	const rendered = await render(quill, `~~~\n$quill: ${ref}\n$kind: main\n~~~\n`);
	quill.free();
	return {
		outcome: 'converted',
		pages: form.pages.length,
		fields: form.fields.length,
		places: await expectClosure(form.pages, built.tree, rendered)
	};
}

for (const { form, sha256, outcome: expected, pages, fields, places } of manifest)
	it(`${form}: ${expected}`, async () => {
		const response = await fetch(found[sha256]);
		expect(response.ok, `${found[sha256]} answered ${response.status}`).toBe(true);
		const { why, ...measured } = await outcome(new Uint8Array(await response.arrayBuffer()));
		expect(measured, JSON.stringify(why)).toEqual({ outcome: expected, pages, fields, places });
	});
