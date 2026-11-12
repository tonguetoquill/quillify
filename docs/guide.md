# Guide

## What the package loads

Nothing until the first `sanitize`. Then, from `assets/` beside the build:

| File                                | Size               | When                             |
| ----------------------------------- | ------------------ | -------------------------------- |
| `pdf.worker.js`                     | 2.2 MB             | every file                       |
| `qpdf.worker.js`, `qpdf.wasm`       | 1.4 MB             | every file                       |
| four `LiberationSans-*.ttf`         | 1.65 MB            | a dynamic form                   |
| a `Carlito-*.ttf` per style         | 0.6 to 0.8 MB each | a dynamic form's Calibri         |
| a `LiberationSerif-*.ttf` per style | 0.4 MB each        | a dynamic form's Times New Roman |
| a `LiberationMono-*.ttf` per style  | 0.3 MB each        | a dynamic form's Courier New     |

A bundler has to follow `new URL('../assets/…', import.meta.url)` to copy them.

| Bundler   | Needs                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| Vite      | nothing                                                                                                             |
| webpack 5 | nothing. It minifies the two workers unless its minimizer excludes `/\.worker\./`                                   |
| Parcel 2  | `packageExports`, and a `.parcelrc` that copies the workers raw                                                     |
| Rollup    | node-resolve, commonjs and json, then `@web/rollup-plugin-import-meta-assets` or the files copied beside the output |
| esbuild   | `--format=esm`, and the files copied beside the output                                                              |

[#101](https://github.com/tonguetoquill/quillify/issues/101) has each bundler's lines.

## Content security policy

| Where                                 | Needs                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| the page                              | `script-src 'wasm-unsafe-eval'` for the engine, `worker-src 'self'`, `connect-src 'self'`, `img-src blob:` |
| the response serving `qpdf.worker.js` | `script-src 'wasm-unsafe-eval'`, `connect-src 'self'`                                                      |

## The engine

`@quillmark/wasm` 0.133.0 or later is a peer. `quillify` calls its `init()` itself. A host that hands `init` a source of its own calls it before the first `quillify`.

## Naming

`suggest` gives a first naming. A person, or a model, edits it, `check` says what is wrong as they go, and `quillify` builds the quill.

## From a quill to a filled PDF

`Engine` is imported from `@quillmark/wasm`, `Quill` and `Document` come from its `init()`, and `values` is keyed by the naming's names.

```ts
const quill = Quill.fromTree(built.tree);
const doc = new Document(`${quill.metadata.name}@${quill.metadata.version}`);
quill.writer(doc).setAll(values);
const out = await new Engine().render(quill, doc, { format: 'pdf' });
const filled = out.artifacts[0].bytes;
```

## Time

Every measured form reads in under 3 s on a laptop. A read cannot be stopped ([#188](https://github.com/tonguetoquill/quillify/issues/188)). One with a worker still busy after 60 s is refused as `too_slow`.

## Versions

Before 1.0 a minor release may change what your code must do, and the changelog says how to move. A patch release does not, and adds no refusal code.
