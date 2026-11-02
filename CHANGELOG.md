# Changelog

What a consumer can observe, in the latest release and since. Earlier releases are on the [releases page](https://github.com/tonguetoquill/quillify/releases).

## Unreleased

## v0.9.0 - 2026-11-02

- A quill's example is its fields' `example:` in `Quill.yaml`, and the tree holds no `example.md`, as `@quillmark/wasm` 0.133 reads it: that release ignores a root `example.md`. `Quill.yaml` declares `requires: ">=0.133"`, and the peer is `@quillmark/wasm` 0.133.0 or later. A dropdown whose options hold `;`, `>` or `|` is an enum, where it was a text field, and a radio group whose on-states hold them is one enum, where its options were booleans. A field description of more than one line builds, where the engine refused it. A host moves both together, and rebuilds a quill it stored from an earlier release, or moves each value of its `example.md` onto its field as `example:` and raises the `requires` line.
- The options of a radio group that share a name are one enum field of their on-states, where each was a boolean, so a document picks one option. `suggest` gives the options of a group one name when each turns on as a value, and `check` takes a name that options of one group share. A naming that names them apart, as `suggest` did, still builds a boolean an option. Each option's `Form.yaml` entry carries `option:`, its own value, which `@quillmark/wasm` 0.127 reads. A host that stored a document of a quill from an earlier release keeps it on that quill, or moves each group's `true` to the group's field as the option's on-state.
- A dynamic form's text whose font narrows or widens it is laid out and drawn at that width, so DAF 988's labels stay in their boxes and a widened paragraph starts at its box's left edge.
