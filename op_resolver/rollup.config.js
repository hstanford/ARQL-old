import resolve from '@rollup/plugin-node-resolve';
export default {
  input: './dist/op_resolver.js',
  output: { file: './dist/index.js', format: 'esm' },
  plugins: [resolve()],
};
