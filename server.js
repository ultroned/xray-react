import { Server } from 'socket.io';
import { createServer } from 'http';
import { openFile } from './lib/editor-utils.js';
import path from 'path';
import fs from 'fs';
import {
  scanSourceFiles,
  buildUsageMap,
  buildImportMap,
  extractComponentNames,
  extractComponentContext,
  findComponentFile,
  getFilePriority,
  detectSourcePaths,
  detectProjectRootByPackageJson,
} from './lib/source-utils.js';
import { UI_MODE_FULL, AVAILABLE_UI_MODES } from './lib/constants.js';

const PORT = parseInt(process.env.XRAY_REACT_PORT || '8124', 10);
const MODE = AVAILABLE_UI_MODES.includes(process.env.XRAY_REACT_MODE)
  ? process.env.XRAY_REACT_MODE
  : UI_MODE_FULL;
const sources = {};
let projectRoot = null;
const usageMap = {};
const importMap = {};
let sourcePaths = [];
let allProjectFiles = [];

/**
 * Detects project root using multiple strategies for standalone server:
 * 1. XRAY_REACT_PROJECT_ROOT environment variable (highest priority)
 * 2. Finding package.json by walking up directory tree
 * 3. Using startPath as last resort
 * @param {string} startPath - Starting directory path
 * @returns {string} Project root path
 */
function detectProjectRoot(startPath = process.cwd()) {
  if (process.env.XRAY_REACT_PROJECT_ROOT) {
    const envRoot = path.resolve(process.env.XRAY_REACT_PROJECT_ROOT);
    if (fs.existsSync(envRoot)) {
      return envRoot;
    } else {
      console.warn(`xray-react: XRAY_REACT_PROJECT_ROOT path does not exist: ${envRoot}`);
    }
  }
  
  const packageJsonRoot = detectProjectRootByPackageJson(startPath);
  if (packageJsonRoot) {
    return packageJsonRoot;
  }
  
  return startPath;
}

/**
 * Gets the project root path
 * Detects it if not already set
 * @returns {string} Project root path
 */
function getProjectRoot() {
  if (!projectRoot) {
    projectRoot = detectProjectRoot();
  }
  return projectRoot;
}

/**
 * Build component name to file path mapping
 * Stores arrays of candidates with context for duplicate component names
 * Uses priority system to prefer component files over style/test files
 */
function buildSourceMap() {
  Object.keys(sources).forEach(key => delete sources[key]);
  
  if (sourcePaths.length === 0) {
    const root = getProjectRoot();
    sourcePaths = detectSourcePaths(root);
  }
  
  const mappings = new Map(); // component name -> Array of { filePath, context, priority }
  
  const root = getProjectRoot();
  
  sourcePaths.forEach(sourcePath => {
    if (!fs.existsSync(sourcePath)) {
      console.warn(`xray-react: Source path not found: ${sourcePath}`);
      return;
    }
    
    const files = scanSourceFiles(sourcePath);
    
    files.forEach(filePath => {
      const componentNames = extractComponentNames(filePath);
      const priority = getFilePriority(filePath);
      const context = extractComponentContext(filePath, root);
      
      componentNames.forEach(name => {
        if (!mappings.has(name)) {
          mappings.set(name, []);
        }
        
        mappings.get(name).push({
          path: filePath,
          context: context,
          priority: priority
        });
      });
    });
  });
  
  mappings.forEach((candidates, name) => {
    sources[name] = candidates;
  });
}

/**
 * Collects all files from source paths
 * This includes all React files, not just those with usage/imports
 */
function collectAllProjectFiles() {
  allProjectFiles = [];
  
  if (sourcePaths.length === 0) {
    const root = getProjectRoot();
    sourcePaths = detectSourcePaths(root);
  }
  
  sourcePaths.forEach(sourcePath => {
    if (!fs.existsSync(sourcePath)) {
      console.warn(`xray-react: Source path not found: ${sourcePath}`);
      return;
    }
    
    const files = scanSourceFiles(sourcePath);
    allProjectFiles.push(...files);
  });
}

/**
 * Builds usage map by scanning all project source files for JSX component usage
 * Maps file path to Set of component names used in JSX
 */
function buildUsageMapForServer() {
  Object.keys(usageMap).forEach(key => delete usageMap[key]);
  
  if (sourcePaths.length === 0) {
    const root = getProjectRoot();
    sourcePaths = detectSourcePaths(root);
  }
  
  const builtMap = buildUsageMap(sourcePaths);
  Object.assign(usageMap, builtMap);
}

/**
 * Builds import map by scanning all project source files for import statements
 * Maps file path to Set of imported component names (fallback for usage map)
 */
function buildImportMapForServer() {
  Object.keys(importMap).forEach(key => delete importMap[key]);
  
  if (sourcePaths.length === 0) {
    const root = getProjectRoot();
    sourcePaths = detectSourcePaths(root);
  }
  
  const builtMap = buildImportMap(sourcePaths);
  Object.assign(importMap, builtMap);
}

projectRoot = getProjectRoot();
buildSourceMap();
collectAllProjectFiles();
buildUsageMapForServer();
buildImportMapForServer();

const httpServer = createServer();
const serverIO = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

serverIO.on('connection', (socket) => {
  const root = getProjectRoot();
  socket.emit('project-config', { projectRoot: root, port: PORT, mode: MODE });
  socket.emit('usage-map', { usage: usageMap });
  socket.emit('import-map', { imports: importMap });
  socket.emit('project-files', { files: allProjectFiles });
  
  socket.on('xray-react-component', (structure) => {
    if (structure) {
      const hierarchy = structure.split(' -> ').map(name => name.trim());
      const componentNames = [...hierarchy].reverse(); // Try from leaf to root
      
      for (const name of componentNames) {
        const trimmedName = name.trim();
        const filepath = findComponentFile(trimmedName, hierarchy, sources);
        
        if (filepath && fs.existsSync(filepath)) {
          openFile(filepath);
          return;
        }
      }
      
      console.warn(`xray-react: No file found for components: ${componentNames.join(', ')}`);
    }
  });
  
  socket.on('register-source', (data) => {
    if (data.name && data.path) {
      if (!sources[data.name]) {
        sources[data.name] = [];
      }
      if (Array.isArray(sources[data.name])) {
        const priority = getFilePriority(data.path);
        const context = extractComponentContext(data.path, getProjectRoot());
        sources[data.name].push({
          path: data.path,
          context: context,
          priority: priority
        });
      }
    }
  });
  
  socket.on('rebuild-source-map', () => {
    buildSourceMap();
    socket.emit('source-map-rebuilt', { count: Object.keys(sources).length });
  });
});

httpServer.listen(PORT, () => {
  console.log(`xray-react: Socket.IO server running on port ${PORT}`);
  console.log(`xray-react: Editor: ${process.env.XRAY_REACT_EDITOR || 'not set'}`);
});

process.on('SIGINT', () => {
  console.log('\nxray-react: Shutting down server...');
  serverIO.close();
  httpServer.close();
  process.exit(0);
});
