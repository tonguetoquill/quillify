# Corpus

61 published federal forms the library is measured on. `manifest.json` lists each by SHA-256 with its kind, encryption and expected outcome: 59 convert and two are refused. Twelve are the fixtures in `test/fixtures`. The other forty-nine are kept outside git (decided in [#16](https://github.com/tonguetoquill/quillify/issues/16)), and only 19 lines record a URL, so a copy fetched today may be a later revision.

```
QUILLIFY_CORPUS=<directory that holds the PDFs> npm run corpus
```

- The directory must hold every form of the manifest and no other `.pdf`. The run checks this first.
- Keep `#`, `?` and `%` out of the directory's path: the test server answers 404 under them.
- Each form goes through `sanitize`, `suggest` and `quillify`, and each field is read back from the engine's render. The run stops at the first outcome that is not the manifest's.
- It is no part of the gate or of CI. The gate holds the manifest's totals (`manifest.test.ts`).

## The Air Force files

`af-epubs.manifest.json` is a second list: 1,354 PDFs pulled from the Air Force's form lists on 10 October 2026 ([how](https://github.com/tonguetoquill/quillify/tree/84619f7/prose/research)), with what the library at `4706c2b` did with each. `npm run corpus` does not read it. The gate holds its totals (`af-epubs.test.ts`).
