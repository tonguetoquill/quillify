import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

interface Entry {
	form: string;
	sha256: string;
	bytes: number;
	kind: string;
	encryption: string;
	outcome: string;
	url?: string;
	pages?: number;
	fields?: number;
	places?: number;
}

const manifest: Entry[] = JSON.parse(readFileSync('corpus/manifest.json', 'utf8'));
const converted = manifest.filter((form) => form.outcome === 'converted');

function count(key: 'kind' | 'encryption' | 'outcome', forms = manifest) {
	const counted: Record<string, number> = {};
	for (const form of forms) counted[form[key]] = (counted[form[key]] ?? 0) + 1;
	return counted;
}

const sum = (key: 'bytes' | 'pages' | 'fields' | 'places') =>
	manifest.reduce((total, form) => total + (form[key] ?? 0), 0);

it('names 61 forms, each by a SHA-256 of its own', () => {
	const hashes = manifest.map((form) => form.sha256);
	expect(hashes).toHaveLength(61);
	expect(new Set(hashes).size).toBe(61);
	for (const hash of hashes) expect(hash).toMatch(/^[0-9a-f]{64}$/);
});

it('describes the twelve published fixtures as their own manifest does', () => {
	type Described = Pick<Entry, 'form' | 'sha256' | 'kind' | 'encryption'>;
	const described = ({ form, sha256, kind, encryption }: Described) => ({
		form,
		sha256,
		kind,
		encryption
	});
	const fixtures: (Described & { publisher?: string; published_sha256?: string })[] = Object.values(
		JSON.parse(readFileSync('test/fixtures/MANIFEST.json', 'utf8'))
	);
	// A fixture with a name blanked is its published file's entry here.
	const published = fixtures
		.filter((fixture) => fixture.publisher)
		.map((fixture) =>
			described({ ...fixture, sha256: fixture.published_sha256 ?? fixture.sha256 })
		);
	const named = new Map(manifest.map((form) => [form.sha256, described(form)]));
	expect(published).toHaveLength(12);
	expect(published.map((fixture) => named.get(fixture.sha256))).toEqual(published);
});

it('expects 59 forms to convert and 2 to be refused', () => {
	expect(count('outcome')).toEqual({
		converted: 59,
		no_fields: 1,
		portfolio: 1
	});
});

it('holds the other totals the two READMEs quote', () => {
	expect(count('kind')).toEqual({ plain: 14, hybrid: 27, dynamic: 18, none: 2 });
	expect(count('kind', converted)).toEqual({ plain: 14, hybrid: 27, dynamic: 18 });
	expect(count('encryption')).toEqual({
		none: 21,
		'AESv2, R4, empty user password': 37,
		'AESv3, R6, empty user password': 1,
		'RC4, R2, empty user password': 2
	});
	expect({
		megabytes: Math.round(sum('bytes') / 1e6),
		pages: sum('pages'),
		fields: sum('fields'),
		places: sum('places'),
		withUrl: manifest.filter((form) => form.url).length
	}).toEqual({ megabytes: 24, pages: 202, fields: 6790, places: 6692, withUrl: 19 });
});
