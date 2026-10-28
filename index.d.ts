import type { Plugin } from 'vite';

export type XrayReactMode = 'full' | 'simple';

export interface XrayReactOptions {
  /** Run the Socket.IO server that opens clicked components in your editor. Default: `true`. */
  server?: boolean;
  /** Project root used for source scanning. Default: auto-detected via `package.json`. */
  sourcePath?: string;
  /** Socket.IO server port. Default: `XRAY_REACT_PORT` env var or `8124`. */
  port?: number;
  /** Overlay display mode. Default: `'full'`. */
  mode?: XrayReactMode;
}

export interface XrayReactWebpackOptions extends XrayReactOptions {
  /** Output asset to inject the overlay into. Default: `output.filename` or `'bundle.js'`. */
  output?: string;
}

export declare function xrayReactVitePlugin(params?: XrayReactOptions): Plugin;

export declare class XrayReactWebpackPlugin {
  constructor(params?: XrayReactWebpackOptions);
  apply(compiler: any): void;
}

export { XrayReactWebpackPlugin as XrayReactPlugin };
