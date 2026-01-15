import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { openFile } from '../editor-utils.js';
import {
  detectSourcePaths,
  buildUsageMap,
  buildImportMap,
  scanSourceFiles,
  extractComponentNames,
  extractComponentContext,
  findComponentFile,
  getFilePriority,
  resolveProjectRoot,
  resolvePort
} from '../source-utils.js';
import { REACT_FILE_EXTS } from '../constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Webpack plugin for xray-react
 * Supports Webpack 5+ using hooks API
 */
export class XrayReactWebpackPlugin {
  constructor(params = {}) {
    this.params = params;
    this.runServer = typeof params.server !== 'undefined' ? params.server : true;
    this.sources = {};
    this.usageMap = {};
    this.importMap = {};
    this.serverIO = null;
    this.httpServer = null;
  }

  /**
   * Gets the output filename from options or params
   * @param {Object} options - Webpack compilation options
   * @returns {string} Output filename
   */
  getOutputFileName(options = {}) {
    return this.params.output ||
      (options?.output?.filename || null) ||
      'bundle.js';
  }

  /**
   * Checks if a module resource should be tracked
   * @param {string} resource - Module resource path
   * @param {string} sourcePath - Source path to match
   * @returns {boolean} True if resource should be tracked
   */
  checkModuleResource(resource, sourcePath) {
    if (!resource) return false;
    
    const isNeededSource = resource.includes(sourcePath) && 
                          !resource.includes('/node_modules/') &&
                          !resource.includes('\\node_modules\\');
    const isNeededFileExt = REACT_FILE_EXTS.includes(path.extname(resource));
    
    return isNeededSource && isNeededFileExt;
  }

  /**
   * Applies the plugin to webpack compiler
   * @param {Object} compiler - Webpack compiler instance
   */
  apply(compiler) {
    const pluginName = 'XrayReactWebpackPlugin';

    compiler.hooks.compilation.tap(pluginName, (compilation) => {
      compilation.hooks.processAssets.tapAsync(
        {
          name: pluginName,
          stage: compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_INLINE,
        },
        (assets, callback) => {
          try {
            const isServerBuild = 
              compilation.options.target === 'node' ||
              compilation.compiler.name === 'server' ||
              (compilation.options.output && compilation.options.output.path && 
               compilation.options.output.path.includes('server'));
            
            if (isServerBuild) {
              callback();
              return;
            }

            const dirname = process.cwd() || path.resolve(__dirname, '../..');
            const pathToUIFile = path.resolve(dirname, 'node_modules/xray-react/build/xray-react-ui.min.js');
            const pathToClientFile = path.resolve(dirname, 'node_modules/xray-react/build/xray-react-client.min.js');

            if (!fs.existsSync(pathToUIFile)) {
              console.warn(`xray-react: UI file not found at ${pathToUIFile}`);
              callback();
              return;
            }

            const outputFileName = this.getOutputFileName(compilation.options);
            let assetName = outputFileName;
            let asset = assets[assetName];

            if (!asset) {
              const mainChunkNames = [
                'main',
                'pages/_app',
                'pages/_app-client',
                'framework',
              ];
              
              for (const chunkName of mainChunkNames) {
                for (const name of Object.keys(assets)) {
                  if (name.includes('webpack-runtime')) continue;
                  
                  if (name.includes(chunkName) && name.endsWith('.js')) {
                    assetName = name;
                    asset = assets[name];
                    break;
                  }
                }
                if (asset) break;
              }
              
              if (!asset) {
                for (const name of Object.keys(assets)) {
                  if (name.endsWith('.js') && 
                      !name.includes('chunk') && 
                      !name.includes('webpack-runtime') &&
                      !name.includes('server')) {
                    assetName = name;
                    asset = assets[name];
                    break;
                  }
                }
              }
              
              if (!asset) {
                for (const name of Object.keys(assets)) {
                  if (name.endsWith('.js') && 
                      !name.includes('webpack-runtime') &&
                      !name.includes('server')) {
                    assetName = name;
                    asset = assets[name];
                    break;
                  }
                }
              }
            }

            if (asset) {
              const uiScript = fs.readFileSync(pathToUIFile, 'utf8');
              
              let currentSource = '';
              if (typeof asset.source === 'function') {
                currentSource = asset.source();
              } else if (typeof asset === 'string') {
                currentSource = asset;
              } else if (asset._source) {
                currentSource = typeof asset._source.source === 'function' 
                  ? asset._source.source() 
                  : asset._source._value || '';
              } else if (asset._value) {
                currentSource = asset._value;
              }
              
              let combinedSource = currentSource;

              combinedSource += '\n' + uiScript;

              if (this.runServer && fs.existsSync(pathToClientFile)) {
                const port = resolvePort({ port: this.params.port });
                combinedSource += `\nwindow.__XRAY_REACT_PORT__=${port};`;
                
                const clientScript = fs.readFileSync(pathToClientFile, 'utf8');
                combinedSource += '\n' + clientScript;
              }

              compilation.updateAsset(assetName, {
                source: () => combinedSource,
                size: () => Buffer.byteLength(combinedSource, 'utf8')
              });
            } else {
              console.warn(`xray-react: Could not find suitable asset to inject scripts. Available assets: ${Object.keys(assets).slice(0, 10).join(', ')}...`);
            }

            callback();
          } catch (error) {
            console.error('xray-react: Error in processAssets hook', error);
            callback(error);
          }
        }
      );
    });

    if (this.runServer) {
      compiler.hooks.compilation.tap(pluginName, (compilation) => {
        compilation.hooks.afterOptimizeModules.tap(pluginName, (modules) => {
          const sourcePath = this.params.sourcePath || compilation.options.context;
          
          const projectRoot = resolveProjectRoot({
            sourcePath: this.params.sourcePath,
            compilationContext: compilation.options.context,
            fallbackPath: process.cwd()
          });
          
          for (const module of modules) {
            const resource = module.resource || module.userRequest;
            if (this.checkModuleResource(resource, sourcePath)) {
              const componentNames = extractComponentNames(resource);
              const priority = getFilePriority(resource);
              const context = extractComponentContext(resource, projectRoot);
              
              componentNames.forEach(name => {
                if (!this.sources.hasOwnProperty(name)) {
                  this.sources[name] = [];
                }
                this.sources[name].push({
                  path: resource,
                  context: context,
                  priority: priority
                });
              });
            }
          }
        });
      });

      compiler.hooks.done.tap(pluginName, (stats) => {
        if (!this.serverIO) {
          try {
            const projectRoot = resolveProjectRoot({
              sourcePath: this.params.sourcePath,
              compilationContext: stats.compilation?.options?.context,
              fallbackPath: process.cwd()
            });
            
            const sourcePaths = detectSourcePaths(projectRoot);
            
            this.usageMap = buildUsageMap(sourcePaths);
            
            this.importMap = buildImportMap(sourcePaths);
            
            const allProjectFiles = [];
            sourcePaths.forEach(sourcePath => {
              if (fs.existsSync(sourcePath)) {
                const files = scanSourceFiles(sourcePath);
                allProjectFiles.push(...files);
              }
            });
            
            const port = resolvePort({ port: this.params.port });
            
            this.httpServer = createServer();
            this.serverIO = new Server(this.httpServer, {
              cors: {
                origin: '*',
                methods: ['GET', 'POST']
              }
            });
            this.httpServer.listen(port);

            this.serverIO.on('connection', (socket) => {
              socket.emit('project-config', { projectRoot: projectRoot, port: port });
              
              socket.emit('usage-map', { usage: this.usageMap });
              
              socket.emit('import-map', { imports: this.importMap });
              
              socket.emit('project-files', { files: allProjectFiles });
              
              socket.on('xray-react-component', (structure) => {
                if (structure) {
                  const hierarchy = structure.split(' -> ').map(name => name.trim());
                  const componentNames = [...hierarchy].reverse();
                  
                  for (const name of componentNames) {
                    const trimmedName = name.trim();
                    const filepath = findComponentFile(trimmedName, hierarchy, this.sources);
                    if (filepath && fs.existsSync(filepath)) {
                      openFile(filepath);
                      return;
                    }
                  }
                }
              });
            });

            console.log(`xray-react: Socket.IO server started on port ${port}`);
            console.log(`xray-react: Editor: ${process.env.XRAY_REACT_EDITOR || 'not set'}`);
          } catch (error) {
            console.error('xray-react: Failed to start Socket.IO server', error);
          }
        }
      });
    }

    process.once('SIGINT', () => {
      if (this.serverIO) {
        this.serverIO.close();
        if (this.httpServer) {
          this.httpServer.close();
        }
      }
      process.exit(0);
    });
  }
}
