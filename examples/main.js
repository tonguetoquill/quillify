import { Engine, init } from '@quillmark/wasm';
import { quillify, sanitize, suggest } from '@quillmark/quillify';

const picker = document.querySelector('input');
const status = document.querySelector('output');
const form = document.querySelector('form');
const list = document.querySelector('ol');
const link = document.querySelector('a');
const row = document.querySelector('template').content;
const engine = new Engine();

picker.addEventListener('change', async () => {
	const [file] = picker.files;
	form.hidden = link.hidden = true;
	status.textContent = file ? `Reading ${file.name}` : '';
	if (!file) return;
	// What rejects is a fault of the page or of its host, and no refusal.
	const failed = (error) => {
		if (picker.files[0] === file)
			status.textContent = `The page failed on ${file.name}: ${error.message}`;
		throw error;
	};

	const read = await sanitize(new Uint8Array(await file.arrayBuffer())).catch(failed);
	if (picker.files[0] !== file) return;
	if (!read.ok) {
		status.textContent = `quillify does not take ${file.name}. Refusal: ${read.refusal.code}.`;
		return;
	}
	const naming = { name: 'form', description: file.name, fields: suggest(read.form.fields) };
	const built = await quillify(read.form, naming).catch(failed);
	const { Quill, Document } = await init().catch(failed);
	if (picker.files[0] !== file) return;
	if (!built.ok) {
		const codes = built.problems.map(({ code }) => code).join(', ');
		status.textContent = `quillify builds no quill from ${file.name}. Problems: ${codes}.`;
		return;
	}
	const quill = Quill.fromTree(built.tree);

	const values = [];
	list.replaceChildren(
		...read.form.fields.map((field, at) => {
			const { name, keep } = naming.fields[at];
			const item = row.cloneNode(true);
			item.querySelector('code').textContent = name;
			item.querySelector('small').textContent = field.kind;
			// A signature is a place to sign, and takes no value.
			if (field.kind === 'signature') return item;

			// Options of one group that share a name are one enum, which the checked one answers.
			const answer =
				keep &&
				field.kind === 'radio' &&
				naming.fields.filter((entry) => entry.keep && entry.name === name).length > 1;
			const boolean = field.kind === 'checkbox' || field.kind === 'radio';
			const control = document.createElement(
				field.kind === 'choice' ? 'select' : field.multiline ? 'textarea' : 'input'
			);
			if (field.kind === 'choice')
				control.append(new Option(), ...field.options.map((option) => new Option(option, option)));
			if (boolean) control.type = field.kind;
			if (field.kind === 'radio') control.name = field.group;
			if (field.maxLength) control.maxLength = field.maxLength;
			// suggest keeps every field but a read-only one, and the quill has only the kept.
			if (answer) values.push([name, () => (control.checked ? field.on : undefined)]);
			else if (keep) values.push([name, () => (boolean ? control.checked : control.value)]);
			else control.disabled = true;
			item.querySelector('label').append(control);
			return item;
		})
	);
	status.textContent = '';
	form.hidden = false;

	form.onsubmit = async (event) => {
		event.preventDefault();
		status.textContent = '';
		const doc = new Document(`${quill.metadata.name}@${quill.metadata.version}`);
		const answered = values.map(([name, value]) => [name, value()]);
		quill
			.writer(doc)
			.setAll(Object.fromEntries(answered.filter(([, value]) => value !== undefined)));
		const out = await engine.render(quill, doc, { format: 'pdf' }).catch(failed);
		URL.revokeObjectURL(link.href);
		link.href = URL.createObjectURL(
			new Blob([out.artifacts[0].bytes], { type: 'application/pdf' })
		);
		link.download = `filled-${file.name}`;
		link.hidden = false;
		link.focus();
	};
});
