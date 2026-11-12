import { readFileSync, readdirSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
/** The rows of a table whose first cell is a code span. A row the case's pattern misses then fails it. */
const rows = (text: string) => text.split('\n').filter((line) => line.startsWith('| `'));

it('lists every module under src/ in the architecture page, and no other', () => {
	const page = read('docs/architecture.md');
	const table = rows(page.slice(page.indexOf('## Modules'), page.indexOf('## Shapes')));
	expect(table.map((row) => /^\| `([\w/-]+\.ts)`\s*\|/.exec(row)?.[1]).sort()).toEqual(
		readdirSync('src', { recursive: true, encoding: 'utf8' })
			.filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
			.sort()
	);
});

it('holds each row of the fixtures README to the manifest and to a count of the form', async () => {
	const manifest: Record<
		string,
		{ form: string; kind: string; encryption: string; generator?: string }
	> = JSON.parse(read('test/fixtures/MANIFEST.json'));
	// A golden is named as its fixture is up to the first underscore, so two editions of a form each have one.
	const golden = (file: string) => {
		const { pages, widgets } = JSON.parse(
			read(`test/goldens/${file.split('_')[0]}.inventory.json`)
		);
		return { pages: pages.length, fields: widgets.length };
	};
	// The generated sample has no golden, so pdf-lib counts it.
	const built = async (file: string) => {
		const doc = await PDFDocument.load(readFileSync(`test/fixtures/${file}`));
		return { pages: doc.getPageCount(), fields: doc.getForm().getFields().length };
	};

	const cells = /^\| `([^`]+)`\s*\| ([^|]+?)\s*\| (\w+)\s*\| (\w+)\s*\| (\d+)\s*\| (\d+)\s*\|$/;
	const table = rows(read('test/fixtures/README.md')).map((row) => {
		const [, file, form, kind, locked, pages, fields] = cells.exec(row) ?? [];
		return { file, form, kind, locked, pages: +pages, fields: +fields };
	});
	expect(table).toEqual(
		await Promise.all(
			Object.entries(manifest).map(async ([file, { form, kind, encryption, generator }]) => ({
				file,
				form,
				kind,
				locked: encryption === 'none' ? 'no' : 'yes',
				...(generator ? await built(file) : golden(file))
			}))
		)
	);
});
