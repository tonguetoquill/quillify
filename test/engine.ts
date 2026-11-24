import { Engine, init } from '@quillmark/wasm';
import type { Document, LiveSession, Quill } from '@quillmark/wasm';
import type { QuillTree } from '../src/types.js';

const engine = new Engine();

/** The quill the engine builds from a tree, and the `name@version` a document names it by. */
export async function fromTree(tree: QuillTree): Promise<{ ref: string; quill: Quill }> {
	const { Quill } = await init();
	const quill = Quill.fromTree(tree);
	const { name, version } = quill.metadata;
	return { ref: `${name}@${version}`, quill };
}

export const open = (quill: Quill, doc: Document): Promise<LiveSession> => engine.open(quill, doc);

export async function render(quill: Quill, markdown: string): Promise<Uint8Array> {
	const { Document } = await init();
	const doc = Document.parse(markdown);
	try {
		return (await engine.render(quill, doc, { format: 'pdf' })).artifacts[0].bytes;
	} finally {
		doc.free();
	}
}
