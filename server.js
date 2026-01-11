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

const PORT = parseInt(process.env.XRAY_REACT_PORT || '8124', 10);
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
  // 1. Check XRAY_REACT_PROJECT_ROOT environment variable first
  if (process.env.XRAY_REACT_PROJECT_ROOT) {
    const envRoot = path.resolve(process.env.XRAY_REACT_PROJECT_ROOT);
    if (fs.existsSync(envRoot)) {
      console.log(`xray-react: Using project root from XRAY_REACT_PROJECT_ROOT: ${envRoot}`);
      return envRoot;
    } else {
      console.warn(`xray-react: XRAY_REACT_PROJECT_ROOT path does not exist: ${envRoot}`);
    }
  }
  
  // 2. Try to find package.json by walking up directory tree
  const packageJsonRoot = detectProjectRootByPackageJson(startPath);
  if (packageJsonRoot) {
    console.log(`xray-react: Detected project root by package.json: ${packageJsonRoot}`);
    return packageJsonRoot;
  }
  
  // 3. Last resort: use startPath
  console.log(`xray-react: Using startPath as project root: ${startPath}`);
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
    console.log(`xray-react: Detected project root: ${projectRoot}`);
  }
  return projectRoot;
}

/**
 * Build component name to file path mapping
 * Stores arrays of candidates with context for duplicate component names
 * Uses priority system to prefer component files over style/test files
 */
function buildSourceMap() {
  console.log('xray-react: Scanning source files...');
  
  // Clear existing mappings
  Object.keys(sources).forEach(key => delete sources[key]);
  
  // Detect source paths if not already set
  if (sourcePaths.length === 0) {
    const root = getProjectRoot();
    sourcePaths = detectSourcePaths(root);
    console.log(`xray-react: Detected source paths:`, sourcePaths);
  }
  
  // Collect all mappings with context and priorities
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
        
        // Add candidate with context and priority
        mappings.get(name).push({
          path: filePath,
          context: context,
          priority: priority
        });
      });
    });
  });
  
  // Build final sources object: arrays of candidates
  mappings.forEach((candidates, name) => {
    sources[name] = candidates;
  });
  
  const totalComponents = Object.keys(sources).length;
  const totalCandidates = Object.values(sources).reduce((sum, candidates) => sum + (Array.isArray(candidates) ? candidates.length : 1), 0);
  console.log(`xray-react: Mapped ${totalComponents} components to ${totalCandidates} source files`);
  console.log('xray-react: Sample mappings:', Object.keys(sources).slice(0, 10).map(name => {
    const candidates = sources[name];
    if (Array.isArray(candidates)) {
      return `${name} -> ${candidates.length} candidate(s)`;
    }
    return `${name} -> ${candidates}`;
  }));
}

/**
 * Collects all files from source paths
 * This includes all React files, not just those with usage/imports
 */
function collectAllProjectFiles() {
  console.log('xray-react: Collecting all project files...');
  
  // Clear existing list
  allProjectFiles = [];
  
  // Detect source paths if not already set
  if (sourcePaths.length === 0) {
    const root = getProjectRoot();
    sourcePaths = detectSourcePaths(root);
    console.log(`xray-react: Detected source paths:`, sourcePaths);
  }
  
  // Collect all files from each source path
  sourcePaths.forEach(sourcePath => {
    if (!fs.existsSync(sourcePath)) {
      console.warn(`xray-react: Source path not found: ${sourcePath}`);
      return;
    }
    
    const files = scanSourceFiles(sourcePath);
    allProjectFiles.push(...files);
  });
  
  console.log(`xray-react: Collected ${allProjectFiles.length} project files from sourcePath folders`);
  console.log('xray-react: All project files:', allProjectFiles);
}

/**
 * Builds usage map by scanning all project source files for JSX component usage
 * Maps file path to Set of component names used in JSX
 */
function buildUsageMapForServer() {
  console.log('xray-react: Building usage map...');
  
  // Clear existing map
  Object.keys(usageMap).forEach(key => delete usageMap[key]);
  
  // Detect source paths if not already set
  if (sourcePaths.length === 0) {
    const root = getProjectRoot();
    sourcePaths = detectSourcePaths(root);
    console.log(`xray-react: Detected source paths:`, sourcePaths);
  }
  
  // Build map using shared utility
  const builtMap = buildUsageMap(sourcePaths);
  Object.assign(usageMap, builtMap);
  
  const totalFiles = Object.keys(usageMap).length;
  const totalComponents = Object.values(usageMap).reduce((sum, components) => sum + components.length, 0);
  console.log(`xray-react: Built usage map: ${totalFiles} files, ${totalComponents} component usages`);
}

/**
 * Builds import map by scanning all project source files for import statements
 * Maps file path to Set of imported component names (fallback for usage map)
 */
function buildImportMapForServer() {
  console.log('xray-react: Building import map...');
  
  // Clear existing map
  Object.keys(importMap).forEach(key => delete importMap[key]);
  
  // Detect source paths if not already set
  if (sourcePaths.length === 0) {
    const root = getProjectRoot();
    sourcePaths = detectSourcePaths(root);
    console.log(`xray-react: Detected source paths:`, sourcePaths);
  }
  
  // Build map using shared utility
  const builtMap = buildImportMap(sourcePaths);
  Object.assign(importMap, builtMap);
  
  const totalFiles = Object.keys(importMap).length;
  const totalComponents = Object.values(importMap).reduce((sum, components) => sum + components.length, 0);
  console.log(`xray-react: Built import map: ${totalFiles} files, ${totalComponents} component imports`);
}

// Detect and set project root
projectRoot = getProjectRoot();

// Build source map on startup
buildSourceMap();

// Collect all project files on startup
collectAllProjectFiles();

// Build usage and import maps on startup
buildUsageMapForServer();
buildImportMapForServer();

// Start HTTP server
const httpServer = createServer();
const serverIO = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

serverIO.on('connection', (socket) => {
  console.log('xray-react: Client connected');
  
  // Send project root and port to client on connection
  const root = getProjectRoot();
  socket.emit('project-config', { projectRoot: root, port: PORT });
  console.log(`xray-react: Sent project root to client: ${root}`);
  
  // Send usage map to client (primary)
  socket.emit('usage-map', { usage: usageMap });
  console.log(`xray-react: Sent usage map to client: ${Object.keys(usageMap).length} files`);
  
  // Send import map to client (fallback)
  socket.emit('import-map', { imports: importMap });
  console.log(`xray-react: Sent import map to client: ${Object.keys(importMap).length} files`);
  
  // Send all project files list to client
  socket.emit('project-files', { files: allProjectFiles });
  console.log(`xray-react: Sent project files list to client: ${allProjectFiles.length} files`);
  
  socket.on('xray-react-component', (structure) => {
    if (structure) {
      console.log('xray-react: Received component path:', structure);
      const hierarchy = structure.split(' -> ').map(name => name.trim());
      const componentNames = [...hierarchy].reverse(); // Try from leaf to root
      
      for (const name of componentNames) {
        const trimmedName = name.trim();
        // Use context-aware lookup with full hierarchy
        const filepath = findComponentFile(trimmedName, hierarchy, sources);
        console.log('xray-react-component:', {name, trimmedName, filepath, hierarchy});
        
        if (filepath && fs.existsSync(filepath)) {
          console.log(`xray-react: Opening ${filepath} (component: ${trimmedName})`);
          openFile(filepath);
          return;
        }
      }
      
      console.warn(`xray-react: No file found for components: ${componentNames.join(', ')}`);
      console.log('xray-react: Available components:', Object.keys(sources).slice(0, 10));
    }
  });
  
  socket.on('register-source', (data) => {
    if (data.name && data.path) {
      // Support new format: array of candidates
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
        console.log(`xray-react: Registered ${data.name} -> ${data.path}`);
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

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nxray-react: Shutting down server...');
  serverIO.close();
  httpServer.close();
  process.exit(0);
});
