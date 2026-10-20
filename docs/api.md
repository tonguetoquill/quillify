# API

```ts
sanitize(pdf: Uint8Array): Promise<Sanitized>
suggest(fields: readonly Field[]): FieldNaming[]
check(fields: readonly Field[], naming: Naming): Problem[]
quillify(form: Form, naming: Naming): Promise<Quillified>
limits: { bytes: number; pages: number; fields: number }
```

Every type named here is exported. `sanitize` needs a browser, and the other three functions need no DOM.

## sanitize

Reads a file and resolves to `{ ok: true, form }` or `{ ok: false, refusal }`. A file it does not take is a refusal, never an exception.

A `Form` is `{ pdf, pages, fields }`: the background PDF, each page's size in points, and the fields. A `Field` has an `id`, its `places` (a zero-based `page`, a `rect` of `x`, `y`, `w`, `h` in points from the page's top left and, on a text or choice field, the `fontSize` in points the form gives the value there, absent where it asks for auto size), `required`, `readOnly`, a `tooltip` when the form has one, and a `kind`:

| `kind`      | Also carries             |
| ----------- | ------------------------ |
| `text`      | `multiline`, `maxLength` |
| `checkbox`  |                          |
| `radio`     | `group`, `on`            |
| `choice`    | `options`                |
| `signature` |                          |

The quill's `form.yaml` carries a place's `fontSize` as its `font_size`.

### Refusals

| `code`            | Carries                       | The file                                                                                                                         | A person can           |
| ----------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `too_large`       | `bytes`, `limit`              | is over 8 MiB, or 64 MiB decoded                                                                                                 | nothing                |
| `too_slow`        | `limit`                       | has a worker busy after 60 s                                                                                                     | try again              |
| `not_pdf`         |                               | is not a PDF                                                                                                                     | choose the right file  |
| `password`        |                               | needs a password                                                                                                                 | save a copy without it |
| `encryption`      |                               | is encrypted in a way qpdf does not read                                                                                         | nothing                |
| `damaged`         |                               | cannot be rewritten, reads two ways, has an image of no stated size, or has a page past 14,400 pt or in a user unit other than 1 | download it again      |
| `portfolio`       | `attachment`                  | is a portfolio                                                                                                                   | save the attachment    |
| `too_many_pages`  | `pages`, `limit`              | has over 25 pages                                                                                                                | nothing                |
| `too_many_fields` | `fields`, `limit`             | has over 1,000 fields                                                                                                            | nothing                |
| `layout`          | `detail`                      | is a dynamic form pdf.js cannot lay out                                                                                          | nothing                |
| `no_fields`       | `xfa`                         | has no field                                                                                                                     | nothing                |
| `rotated`         | `page`                        | has a page still rotated                                                                                                         | nothing                |
| `unpaintable`     | `page`, `construct`, `detail` | holds something the redraw does not draw                                                                                         | nothing                |

`construct` is `image`, `background_image`, `svg`, `border`, `transform`, `glyph`, `barcode` or `password`.

## suggest

Returns an entry for each field, named from the form's own tooltips: `{ id, keep, name, description }`. A caller may add a `title`, the label an editor shows for the field, an `example` and, on a text field, `text` (`line`, `paragraph` or `lines`). Names are snake_case.

A naming is `{ name, description, fields }`, and those entries are its `fields`. A read-only field is left out whatever `keep` says.

## check

Returns what is wrong with a naming, and an empty list when nothing is. A naming of the wrong shape throws a `TypeError` that names the slot.

### Problems

| `code`              | Carries                 | What is wrong                             |
| ------------------- | ----------------------- | ----------------------------------------- |
| `quill_name`        |                         | the quill's name is not snake_case        |
| `quill_description` |                         | the quill's description is empty          |
| `nothing_kept`      |                         | no field a person can fill is kept        |
| `unknown_field`     | `id`                    | an entry names a field the form lacks     |
| `unnamed_field`     | `id`                    | a field has no entry                      |
| `repeated_field`    | `id`                    | a field has two entries                   |
| `field_name`        | `id`                    | a kept field's name is not snake_case     |
| `duplicate_name`    | `name`                  | two kept fields share a name              |
| `text_on_non_text`  | `id`                    | `text` is set on a field that is not text |
| `engine`            | `message`, `diagnostic` | the engine refused the files              |

## quillify

Builds the quill and resolves to `{ ok: true, tree }` or `{ ok: false, problems }`. The problems are `check`'s, and `engine` when the engine refuses the files.

`tree` maps a file name to its bytes (`Quill.yaml`, `form.yaml`, `form.pdf`, and `example.md` when a kept field has an example or is a dropdown with an option), and `Quill.fromTree` takes it.

## limits

Frozen. The largest file in bytes (8,388,608), the most pages and the most fields `sanitize` takes. Print a refusal's own `limit`: `too_large` carries 67,108,864 for the decoded bound.

## Trust

Every string that is not a `code`, a `kind` or a `construct` is the file's text: an id, a tooltip, an option, an engine message. Show it as text. [`SECURITY.md`](../SECURITY.md) has the boundary.
