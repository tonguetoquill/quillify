import { expect, it } from 'vitest';
import { quillYaml } from './assemble.js';

it('writes a choice of 200,000 options', () => {
	const options = Array.from({ length: 200_000 }, (_, i) => `o${i}`);
	const yaml = quillYaml({ quill: { name: 'sample', description: 'Sample' }, fields: [] }, [
		{
			widget: 'x',
			name: 'x',
			description: '',
			type: 'enum',
			multiline: false,
			options,
			keep: true,
			required: false
		}
	]);
	expect(yaml.split('\n').filter((line) => line.startsWith('          - '))).toHaveLength(200_000);
});
