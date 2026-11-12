# quillify

Turn a published PDF form into a [Quillmark](https://github.com/borb-sh/quillmark) quill, in the browser.

Published forms rarely come as a clean fillable PDF. Most are encrypted with an empty password, and many are dynamic XFA, which only Acrobat lays out. quillify reads either kind and returns the page as a background with its form layer stripped, and every field with its place.

59 of 61 federal forms and 1,147 of 1,354 Air Force forms convert, with every field read back at its place.

## Install

```
npm install @quillmark/quillify @quillmark/wasm
```

## Use

```ts
import { init } from '@quillmark/wasm';
import { quillify, sanitize, suggest } from '@quillmark/quillify';

const read = await sanitize(pdf);
if (!read.ok) throw new Error(read.refusal.code);

const built = await quillify(read.form, {
	name: 'tdy_request',
	description: 'Request and authorization for TDY travel.',
	fields: suggest(read.form.fields)
});
if (!built.ok) throw new Error(built.problems.map(({ code }) => code).join(', '));

const { Quill } = await init();
const quill = Quill.fromTree(built.tree);
```

`pdf` is the file's bytes: `new Uint8Array(await file.arrayBuffer())`.

- `sanitize` parses the file and returns a `Form`, or the reason it does not take the file.
- `suggest` names each field from the form's own tooltips.
- `check` lists what is wrong with a naming.
- `quillify` builds the quill's files.

It runs in a browser and has no interface: the review screen, any model and storage are yours.

The file is treated as hostile. The background comes back without its form layer, scripts, attachments and metadata, and [`SECURITY.md`](SECURITY.md) says what holds and what does not.

## Documentation

- [Example](examples/): a page that takes a PDF, lists its fields under the names `suggest` gives and renders a filled copy. In a clone: `npm ci`, `npm run build`, `npx vite examples`.
- [API](docs/api.md): what goes in, what comes back, every refusal and problem.
- [Guide](docs/guide.md): bundlers, content security policy, the engine, from a quill to a filled PDF.
- [Limits](docs/limits.md): what converts, what is refused, how a redrawn form can differ.
- [Architecture](docs/architecture.md): how the code is laid out.
- [Security](SECURITY.md), [contributing](CONTRIBUTING.md), [changelog](CHANGELOG.md).

## License

Apache-2.0. [`NOTICE`](NOTICE) lists the third-party files the package ships.
