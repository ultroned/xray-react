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
  resolvePort,
} from '../source-utils.js';
import { REACT_FILE_EXTS, UI_MODE_FULL, AVAILABLE_UI_MODES } from '../constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Served from the package itself so it works with npm link, file: deps and Vite's fs.strict
const BUILD_DIR = path.resolve(__dirname, '../../build');
const BASE_PATH = '/@xray-react';
const UI_FILE = 'xray-react-ui.min.js';
const CLIENT_FILE = 'xray-react-client.min.js';

/**
 * Vite plugin for xray-react
 */
export function xrayReactVitePlugin(params = {}) {
  const runServer = typeof params.server !== 'undefined' ? params.server : true;
  const mode = AVAILABLE_UI_MODES.includes(params.mode) ? params.mode : UI_MODE_FULL;
  const port = resolvePort({ port: params.port });
  const sources = {};
  let serverIO = null;
  let httpServer = null;
  let projectRoot = null;

  const startServer = () => {
    if (serverIO) return;

    try {
      const sourcePaths = detectSourcePaths(projectRoot);
      const usageMap = buildUsageMap(sourcePaths);
      const importMap = buildImportMap(sourcePaths);

      const allProjectFiles = [];
      sourcePaths.forEach((sourcePath) => {
        if (fs.existsSync(sourcePath)) {
          const files = scanSourceFiles(sourcePath);
          allProjectFiles.push(...files);
        }
      });

      const server = createServer();
      httpServer = server;
      serverIO = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

      // Vite restarts (config/.env changes) start this server before closing the previous one,
      // so retry a busy port briefly. Without an error listener it would crash the dev server.
      let retries = 0;
      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE' && retries < 20 && httpServer === server) {
          retries += 1;
          setTimeout(() => httpServer === server && server.listen(port), 250);
          return;
        }
        console.error(`xray-react: Socket.IO server failed on port ${port}: ${error.message}`);
      });
      server.listen(port, () => {
        console.log(`xray-react: Socket.IO server started on port ${port}`);
        console.log(`xray-react: Editor: ${process.env.XRAY_REACT_EDITOR || 'not set'}`);
      });

      serverIO.on('connection', (socket) => {
        socket.emit('project-config', { projectRoot: projectRoot, port: port, mode: mode });

        socket.emit('usage-map', { usage: usageMap });

        socket.emit('import-map', { imports: importMap });

        socket.emit('project-files', { files: allProjectFiles });

        socket.on('xray-react-component', (structure) => {
          if (structure) {
            const hierarchy = structure.split(' -> ').map((name) => name.trim());
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
    } catch (error) {
      console.error('xray-react: Failed to start Socket.IO server', error);
    }
  };

  const stopServer = () => {
    if (serverIO) {
      serverIO.close();
      serverIO = null;
    }
    if (httpServer) {
      httpServer.close();
      httpServer = null;
    }
  };

  const injectScripts = (html) => {
    const scripts = [];
    if (fs.existsSync(path.join(BUILD_DIR, UI_FILE))) {
      scripts.push(`<script>window.__XRAY_REACT_MODE__='${mode}';</script>`);
      scripts.push(`<script src="${BASE_PATH}/${UI_FILE}"></script>`);
    }
    if (runServer && fs.existsSync(path.join(BUILD_DIR, CLIENT_FILE))) {
      scripts.push(`<script>window.__XRAY_REACT_PORT__=${port};</script>`);
      scripts.push(`<script src="${BASE_PATH}/${CLIENT_FILE}"></script>`);
    }

    if (scripts.length === 0) return null;
    return html.replace('</body>', `${scripts.join('\n')}\n</body>`);
  };

  return {
    name: 'xray-react',
    enforce: 'post',
    apply: 'serve',

    configResolved(config) {
      projectRoot = resolveProjectRoot({
        sourcePath: params.sourcePath,
        compilationContext: config.root,
        fallbackPath: process.cwd(),
      });
    },

    load(id) {
      const filePath = id ? id.split('?')[0] : '';
      if (
        filePath &&
        !filePath.includes('/node_modules/') &&
        !filePath.includes('\\node_modules\\')
      ) {
        const ext = path.extname(filePath);
        if (REACT_FILE_EXTS.includes(ext)) {
          const componentNames = extractComponentNames(filePath);
          const priority = getFilePriority(filePath);
          const context = extractComponentContext(filePath, projectRoot);

          componentNames.forEach((name) => {
            if (!sources.hasOwnProperty(name)) {
              sources[name] = [];
            }
            // HMR reloads the same module, keep a single entry per file
            if (!sources[name].some((source) => source.path === filePath)) {
              sources[name].push({ path: filePath, context: context, priority: priority });
            }
          });
        }
      }
      return null;
    },

    configureServer(server) {
      if (runServer) {
        startServer();
        server.httpServer?.once('close', stopServer);
      }

      server.middlewares.use(BASE_PATH, (req, res, next) => {
        const fileName = path.basename((req.url || '').split('?')[0]);
        if (fileName !== UI_FILE && fileName !== CLIENT_FILE) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(fs.readFileSync(path.join(BUILD_DIR, fileName)));
      });

      // Covers HTML that bypasses transformIndexHtml (e.g. SSR middleware responses)
      server.middlewares.use((req, res, next) => {
        if (
          req.url === '/' ||
          req.url === '/index.html' ||
          (req.headers.accept && req.headers.accept.includes('text/html'))
        ) {
          const originalEnd = res.end.bind(res);
          const chunks = [];

          res.write = function (chunk) {
            if (chunk) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8'));
            }
            return true;
          };

          res.end = function (chunk) {
            if (chunk) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8'));
            }

            try {
              const html = chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : '';

              const alreadyInjected =
                html.includes('xray-react-ui') || html.includes('__XRAY_REACT_PORT__');

              if (!alreadyInjected && html.includes('</body>')) {
                const modifiedHtml = injectScripts(html);
                if (modifiedHtml) {
                  res.setHeader('Content-Length', Buffer.byteLength(modifiedHtml, 'utf8'));
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

      const htmlString = typeof html === 'string' ? html : html?.html || '';
      const isObjectInput = typeof html === 'object' && html !== null;

      if (!htmlString.includes('</body>')) {
        console.warn('xray-react: HTML does not contain </body> tag');
        return html;
      }

      const modifiedHtml = injectScripts(htmlString);
      if (!modifiedHtml) {
        return html;
      }
      if (isObjectInput) {
        return { ...html, html: modifiedHtml };
      }
      return modifiedHtml;
    },

    buildEnd() {
      stopServer();
    },
  };
}
