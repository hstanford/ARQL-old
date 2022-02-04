import resolve from '@rollup/plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
export default {input: './dist/index.js', output: { file: './dist/main.js', format: 'esm' }, plugins: [resolve(), commonjs()]};