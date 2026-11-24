# Changelog

What a consumer can observe, in the latest release and since. Earlier releases are on the [releases page](https://github.com/tonguetoquill/quillify/releases).

## Unreleased

## v0.10.0 - 2026-11-24

- A quill's `Quill.yaml` declares `main` under one `schema:` block, as `@quillmark/wasm` 0.140 reads it: that release refuses a top-level `main:` as `quill::unknown_section`. A text field that takes lines declares `shape: lines`, where it declared `multiline: true`, which 0.141 refuses. `Quill.yaml` declares `requires: ">=0.140"`, and the peer is `@quillmark/wasm` 0.140.0 or later. A host moves both together, and rebuilds a quill it stored from an earlier release, or moves its `main:` under `schema:` and each `multiline: true` to `shape: lines`.
