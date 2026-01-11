import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const plugins = [
  nodeResolve(),
  commonjs()
];

export default [
  {
    input: 'lib/xray-react-ui.js',
    output: {
      file: 'build/xray-react-ui.min.js',
      format: 'iife',
      name: 'xrayReactUiMin',
      sourcemap: 'inline'
    },
    plugins: plugins
  },
  {
    input: 'lib/xray-react-client.js',
    output: {
      file: 'build/xray-react-client.min.js',
      format: 'iife',
      name: 'xrayReactClientMin',
      sourcemap: 'inline'
    },
    plugins: plugins
  }
];
