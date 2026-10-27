# Changelog

What a consumer can observe, in the latest release and since. Earlier releases are on the [releases page](https://github.com/tonguetoquill/quillify/releases).

## Unreleased

- The options of a radio group that share a name are one enum field of their on-states, where each was a boolean, so a document picks one option. `suggest` gives the options of a group one name when each turns on as a value, and `check` takes a name that options of one group share. A naming that names them apart, as `suggest` did, still builds a boolean an option. Each option's `Form.yaml` entry carries `option:`, its own value, which `@quillmark/wasm` 0.127 reads. A host that stored a document of a quill from an earlier release keeps it on that quill, or moves each group's `true` to the group's field as the option's on-state.

## v0.8.0 - 2026-10-21

- A quill's field spec is `Form.yaml`, and its `Quill.yaml` declares `requires: ">=0.127"`, as `@quillmark/wasm` 0.127 reads it: that release refuses a `form.yaml`, and no acroform quill opens on both 0.126 and 0.127. The peer is `@quillmark/wasm` 0.127.0 or later. A host moves both together, and rebuilds a quill it stored from an earlier release, or renames its `form.yaml` to `Form.yaml` and adds the `requires` line.
- Kept fields that take the same value may share a name, and the quill asks for it once and fills each of them. `check` reports `duplicate_name` only for fields of different values, or for signatures or radio buttons.
- A naming may tick a checkbox or a radio option in the example: an `example` of `true` reaches `example.md` as a YAML `true`, and the engine's render of the example shows the box ticked. A box with no example, or with any other, stays out of `example.md` as before.
- A dynamic form's comb field keeps its count of cells as its `maxLength` where its template sets no `maxChars` or a larger one, and a numeric field keeps its `maxChars` as a text field already did. DAF 988's and DAF 1288's DoD ID fields carry a `maxLength` of 10.
- A background keeps a link to an address that begins `www.` and has two dots, written as the `http://` address pdf.js opens for it, and a link to one `mailto:` mailbox, written without its subject, body or other query. Either is removed where the address is not plainly one host or one mailbox, and a link to `file:` or any other scheme is still removed.
