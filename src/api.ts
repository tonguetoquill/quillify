import type { Rect } from './types.js';

/** In points. */
export interface Size {
	width: number;
	height: number;
}

export interface Place {
	/** Zero-based. */
	page: number;
	rect: Rect;
	/** The size in points the form gives a text or choice value here, absent where it asks for auto size. */
	fontSize?: number;
}

export type Field = {
	id: string;
	places: readonly [Place, ...Place[]];
	tooltip?: string;
	required: boolean;
	readOnly: boolean;
} & (
	| { kind: 'text'; multiline: boolean; maxLength?: number }
	| { kind: 'checkbox' }
	| { kind: 'radio'; group: string; on?: string }
	| { kind: 'choice'; options: readonly string[] }
	| { kind: 'signature' }
);

export interface Form {
	readonly pdf: Uint8Array;
	readonly pages: readonly Size[];
	readonly fields: readonly Field[];
}

export interface FieldNaming {
	id: string;
	/** A read-only field is left out whatever this says. */
	keep: boolean;
	name: string;
	title?: string;
	description: string;
	example?: string;
	text?: 'line' | 'paragraph' | 'lines';
}

export interface Naming {
	name: string;
	description: string;
	fields: readonly FieldNaming[];
}

export type Problem =
	| { code: 'quill_name' }
	| { code: 'quill_description' }
	| { code: 'nothing_kept' }
	| { code: 'unknown_field'; id: string }
	| { code: 'unnamed_field'; id: string }
	| { code: 'repeated_field'; id: string }
	| { code: 'field_name'; id: string }
	| { code: 'duplicate_name'; name: string }
	| { code: 'text_on_non_text'; id: string }
	/** `diagnostic` is the engine's code, such as `quill::yaml_parse_error`, and `message` its text. */
	| { code: 'engine'; diagnostic?: string; message: string };
