import resolve from '@rollup/plugin-node-resolve';
export default {input: './dist/parser.js', output: { file: './dist/index.js', format: 'esm' }, plugins: [resolve()]};