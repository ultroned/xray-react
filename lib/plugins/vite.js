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
import { REACT_FILE_EXTS, UI_MODE_FULL, AVAILABLE_UI_MODES } from '../constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Vite plugin for xray-react
 */
export function xrayReactVitePlugin(params = {}) {
  const runServer = typeof params.server !== 'undefined' ? params.server : true;
  const mode = AVAILABLE_UI_MODES.includes(params.mode) ? params.mode : UI_MODE_FULL;
  const sources = {};
  let usageMap = {};
  let importMap = {};
  let serverIO = null;
  let httpServer = null;
  let projectRoot = null;

  if (runServer) {
    try {
      projectRoot = resolveProjectRoot({
        sourcePath: params.sourcePath,
        compilationContext: null,
        fallbackPath: process.cwd()
      });
      
      const sourcePaths = detectSourcePaths(projectRoot);
      
      usageMap = buildUsageMap(sourcePaths);
      
      importMap = buildImportMap(sourcePaths);
      
      const allProjectFiles = [];
      sourcePaths.forEach(sourcePath => {
        if (fs.existsSync(sourcePath)) {
          const files = scanSourceFiles(sourcePath);
          allProjectFiles.push(...files);
        }
      });
      
      const port = resolvePort({ port: params.port });
      
      httpServer = createServer();
      serverIO = new Server(httpServer, {
        cors: {
          origin: '*',
          methods: ['GET', 'POST']
        }
      });
      httpServer.listen(port);

      serverIO.on('connection', (socket) => {
        socket.emit('project-config', { projectRoot: projectRoot, port: port, mode: mode });
        
        socket.emit('usage-map', { usage: usageMap });
        
        socket.emit('import-map', { imports: importMap });
        
        socket.emit('project-files', { files: allProjectFiles });
        
        socket.on('xray-react-component', (structure) => {
          if (structure) {
            const hierarchy = structure.split(' -> ').map(name => name.trim());
            const componentNames = [...hierarchy].reverse();
            
            for (const name of componentNames) {
              const trimmedName = name.trim();
              const filepath = findComponentFile(trimmedName, hierarchy, sources);
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

  return {
    name: 'xray-react',
    enforce: 'post',
    apply: 'serve',

    load(id) {
      if (id && !id.includes('/node_modules/') && !id.includes('\\node_modules\\')) {
        const ext = path.extname(id);
        if (REACT_FILE_EXTS.includes(ext)) {
          const componentNames = extractComponentNames(id);
          const priority = getFilePriority(id);
          const context = extractComponentContext(id, projectRoot);
          
          componentNames.forEach(name => {
            if (!sources.hasOwnProperty(name)) {
              sources[name] = [];
            }
            sources[name].push({
              path: id,
              context: context,
              priority: priority
            });
          });
        }
      }
      return null;
    },

    configureServer(server) {
      const dirname = process.cwd() || path.resolve(__dirname, '../..');
      const pathToUIFile = path.resolve(dirname, 'node_modules/xray-react/build/xray-react-ui.min.js');
      const pathToClientFile = path.resolve(dirname, 'node_modules/xray-react/build/xray-react-client.min.js');

      const basePath = '/node_modules/xray-react/build';
      
      server.middlewares.use((req, res, next) => {
        if (req.url === '/' || req.url === '/index.html' || (req.headers.accept && req.headers.accept.includes('text/html'))) {
          const originalEnd = res.end.bind(res);
          const chunks = [];
          
          res.write = function(chunk) {
            if (chunk) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8'));
            }
            return true;
          };
          
          res.end = function(chunk) {
            if (chunk) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8'));
            }
            
            try {
              const html = chunks.length > 0 
                ? Buffer.concat(chunks).toString('utf8')
                : (typeof chunk === 'string' ? chunk : '');
              
              const alreadyInjected = html.includes('xray-react-ui') || html.includes('__XRAY_REACT_PORT__');
              
              if (!alreadyInjected && html.includes('</body>')) {
                const scripts = [];
                if (fs.existsSync(pathToUIFile)) {
                  scripts.push(`<script>window.__XRAY_REACT_MODE__='${mode}';</script>`);
                  scripts.push(`<script src="${basePath}/xray-react-ui.min.js"></script>`);
                }
                if (runServer && fs.existsSync(pathToClientFile)) {
                  const port = resolvePort({ port: params.port });
                  scripts.push(`<script>window.__XRAY_REACT_PORT__=${port};</script>`);
                  scripts.push(`<script src="${basePath}/xray-react-client.min.js"></script>`);
                }
                
                if (scripts.length > 0) {
                  const modifiedHtml = html.replace('</body>', `${scripts.join('\n')}\n</body>`);
                  const newLength = Buffer.byteLength(modifiedHtml, 'utf8');
                  res.setHeader('Content-Length', newLength);
                  
                  originalEnd(modifiedHtml);
                  return;
                }
              }
            } catch (error) {
              console.error('xray-react: Error in middleware', error);
            }
            
            if (chunks.length > 0) {
              originalEnd(Buffer.concat(chunks));
            } else {
              originalEnd(chunk);
            }
          };
        }
        next();
      });
    },

    transformIndexHtml(html, context) {
      const isServerBuild = 
        context?.server === true ||
        (context?.path && context.path.includes('server')) ||
        (typeof html === 'string' && html.includes('ssr') && html.includes('server'));
      
      if (isServerBuild) {
        return html;
      }

      const htmlString = typeof html === 'string' ? html : (html?.html || '');
      const isObjectInput = typeof html === 'object' && html !== null;
      
      if (!htmlString.includes('</body>')) {
        console.warn('xray-react: HTML does not contain </body> tag');
        return html;
      }
      
      const dirname = process.cwd() || path.resolve(__dirname, '../..');
      const pathToUIFile = path.resolve(dirname, 'node_modules/xray-react/build/xray-react-ui.min.js');
      const pathToClientFile = path.resolve(dirname, 'node_modules/xray-react/build/xray-react-client.min.js');

      const scripts = [];
      
      const basePath = '/node_modules/xray-react/build';

      if (fs.existsSync(pathToUIFile)) {
        scripts.push(`<script>window.__XRAY_REACT_MODE__='${mode}';</script>`);
        scripts.push(`<script src="${basePath}/xray-react-ui.min.js"></script>`);
      }

      if (runServer && fs.existsSync(pathToClientFile)) {
        const port = resolvePort({ port: params.port });
        scripts.push(`<script>window.__XRAY_REACT_PORT__=${port};</script>`);
        scripts.push(`<script src="${basePath}/xray-react-client.min.js"></script>`);
      }

      if (scripts.length > 0) {
        const modifiedHtml = htmlString.replace('</body>', `${scripts.join('\n')}\n</body>`);
        
        if (isObjectInput) {
          return { ...html, html: modifiedHtml };
        }
        return modifiedHtml;
      }

      return html;
    },

    buildEnd() {
      if (serverIO) {
        serverIO.close();
      }
      if (httpServer) {
        httpServer.close();
      }
    }
  };
}
