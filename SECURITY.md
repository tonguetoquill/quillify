# Security

## Reporting

Report a vulnerability privately: the repository's Security tab, "Report a vulnerability". No public issue, and no filled-in form attached.

Fixes go into the latest release.

## The boundary

Untrusted PDF bytes go in, and a quill comes out that other people load and fill. Every string in a `Form`, a refusal or a `Problem` is the file author's text: show it as text.

## What `sanitize` holds

A way past any of these is a vulnerability.

- Each file gets workers of its own.
- It requests only the package's own files.
- The background keeps only allowlisted keys per kind of dictionary (`KINDS`, `src/strip.ts`) and objects the catalog reaches.
- The form layer, scripts, attachments, metadata and bookmarks are gone.
- A link stays only if it leads to `http://`, `https://` or a destination in the file, or is one of two kinds written back as an address the file did not hold: one that begins `www.` and has two dots, as the `http://` URL pdf.js opens for it, and one to a single `mailto:` mailbox, without its query. The `www.` address is printable ASCII with no backslash, a host name before its path, and no `.` or `..` path segment, escaped or not.
- A dynamic (XFA) form is laid out in a sandboxed `<iframe>` that runs no script.
- A file that reads two ways is refused as `damaged`. One known way is not: see Not handled (#265).
- `quillify` writes every string into the quill's files as an escaped JSON string literal.

Reasons: [the decision log and research notes written before v0.3.0](https://github.com/tonguetoquill/quillify/tree/84619f7/prose).

## Bounds

- `MAX_BYTES`: 8 MiB, `too_large`
- `MAX_INFLATED_BYTES` (qpdf's output, decoded streams and what each image declares): 64 MiB, `too_large`
- `MAX_PAGES`: 25, `too_many_pages`
- `MAX_WIDGETS` (fields): 1,000, `too_many_fields`
- `MAX_SIDE` (a page's side, and its box's reach from the origin): 14,400 pt, `damaged`
- `MAX_PICTURE_PIXELS` (a dynamic form's pictures): 8,000,000, `unpaintable`
- `MAX_SECONDS` (a worker wait): 60 s, `too_slow`

## Not handled

Known limits, and no vulnerability to report.

- Entries flattened into page content read as print: check the pages before sharing a quill.
- Tag strings no page shows (`/Alt`, `/ActualText`, `/E`, `/T`, `/ID`, `/Lang`) stay, and filled fields are untagged (#192).
- Content in a layer that is off stays (decided in #32).
- A dictionary by name (`/Resources` maps, `/RoleMap`, `/ClassMap`) keeps values under names the file chose.
- pdf.js can read a file qpdf wrote as another document than qpdf and pdf-lib read. Measured: with a forged trailer that holds `/Encrypt`, a file that is not encrypted is refused as `password` or `encryption`. Not tried, so not ruled out: a forged trailer with no `/Encrypt`, whose objects pdf.js would read in place of the file's own, and whether objects spelled in a stream's data can make pdf.js inflate what the 64 MiB bound never counted (#265).
- qpdf's memory before a refusal is unbounded.
- An image counts for the most its dictionary, its JPEG or JPEG 2000 header, or a CCITT image's `/DecodeParms` says. Not read: a JBIG2 stream's own size, which lies behind segments of varying length, and an image inside a content stream, whose end only a content-stream parser finds.
- The bound counts bytes, not pixels: an image of 22,000 by 22,000 at a bit a pixel counts 60 MB, and the engine at 0.126.0 takes 10 s to paint its page to a canvas (#259).
- `qpdf.wasm` is one publisher's prebuilt binary. A 1 kB file traps or hangs it, and a trap ends chrome-headless-shell on Linux (#46).
- A link with no scheme that pdf.js does not read as `http://`, and any `www.` or `mailto:` link the rules above do not keep (a port, user info, a dot segment, a host that is not plain letters, digits and hyphens, two mailboxes, a query), is removed.
- The deadline ends only a wait on a worker: a call can settle after 60 s.
- A dynamic form's background is not capped by file size: up to 32 MB.

## Supply chain

- `pdf-lib` and `pdfjs-dist` are pinned exactly. The engine, `@quillmark/wasm`, is a peer.
- `NOTICE` names the redistributed files. The build holds `qpdf.wasm` and the fonts to SHA-256 hashes.
- Installs run no lifecycle script. CI publishes with provenance, an SBOM and `SHA256SUMS`.
