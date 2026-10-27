# Limits

## Measured

| Set                        | Converts | The rest                                                                                                            |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| 61 published federal forms | 59       | no field (1), a portfolio (1)                                                                                       |
| 1,354 Air Force forms      | 1,147    | no field (161), over 1,000 fields (16), read-only (14), a field off its page (7), not drawable (5), a portfolio (4) |

Each converted form was rendered by the engine and every kept field read back at its place. `npm run corpus` reruns the first set. No page has been compared with Acrobat by eye ([#17](https://github.com/tonguetoquill/quillify/issues/17)).

## Bounds

8 MiB a file, 64 MiB decoded, 25 pages, 1,000 fields, 14,400 pt a side of a page, 60 s, and in a dynamic form 8,000,000 pixels of pictures. Past one, the file is refused.

## A dynamic form is redrawn

It is drawn as pdf.js lays it out, in Helvetica, Times or Courier, and a mark those lack in Symbol or ZapfDingbats. No script of the form runs.

- A hairline under half a point, or a rule half a point from a fill, can come out a pixel off its layout.
- pdf.js's layout is not always Acrobat's ([#120](https://github.com/tonguetoquill/quillify/issues/120)).
- Calibri is laid out in the shipped Carlito, Times New Roman and Courier New in the shipped Liberation Serif and Mono, and Arial, Helvetica, Myriad Pro and faces the form's font list lacks in the shipped Liberation Sans. Another face listed and not embedded uses the machine's, and the text of a form with no font list the browser's default ([#197](https://github.com/tonguetoquill/quillify/issues/197)).
- Refused: a field that is turned, off its page, a barcode or a password; a turned picture or line, a caption turned in a cell that flows, and a turn not by quarters; a picture that does not load; a gradient or pattern fill; a dotted border; an SVG shape other than a line, a rectangle or an ellipse; and a character no standard font holds. [#42](https://github.com/tonguetoquill/quillify/issues/42) has the turned field, the border and the shape.

## Every form

- A signature field becomes an unsigned widget. What signing locks is not carried (decided in [#124](https://github.com/tonguetoquill/quillify/issues/124)).
- A radio group's options that share a name reach the quill as one enum of their on-states, which a document stores as its value. An option named apart, and the options of a group with one that turns on as no value, a blank, or one with `;`, `>` or `|`, reach it as a boolean a button.
- `suggest` gives a field no title: a caller's naming gives one.
- A dropdown with `>`, `;` or `|` in an option becomes a text field.
- A text field's limit becomes its `max:`, and its example is cut to it. A field of `lines` gets none: `max:` on a list counts its lines.
- The background keeps links to `http`, `https` or a place in the file, a `www.` address as the `http://` one pdf.js opens, and one `mailto:` mailbox without its query, and no other annotation. It keeps a layer that is off, and its stamped fields are untagged ([#192](https://github.com/tonguetoquill/quillify/issues/192)).
- A `zoom` on the host page that the layout frame cannot undo exactly makes `sanitize` reject with an error that names it.
