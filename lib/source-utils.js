import fs from 'fs';
import path from 'path';
import {
  REACT_FILE_EXTS,
  EXCLUDED_FILE_PATTERNS,
  HTML_ELEMENTS,
  JS_KEYWORDS,
  COMMON_SOURCE_DIRS,
} from './constants.js';

/**
 * Scans source files recursively
 */
export function scanSourceFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) {
    return fileList;
  }

  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      scanSourceFiles(filePath, fileList);
    } else if (REACT_FILE_EXTS.includes(path.extname(file))) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

/**
 * Checks if a file should be excluded from component extraction
 */
export function shouldExcludeFile(filePath) {
  return EXCLUDED_FILE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Checks if a name should be excluded from component extraction
 */
export function shouldExcludeName(name) {
  if (!name || name.length < 2) return true;
  
  // Exclude HTML elements
  if (HTML_ELEMENTS.includes(name.toLowerCase())) {
    return true;
  }
  
  // Exclude common JavaScript/TypeScript keywords and built-ins
  if (JS_KEYWORDS.includes(name.toLowerCase())) {
    return true;
  }
  
  return false;
}

/**
 * Extracts component names from a file
 * Prioritizes actual React components over other exports
 * Includes standalone export default pattern and filename fallback
 * @param {string} filePath - Path to the source file
 * @returns {Array<string>} Array of component names found in the file
 */
export function extractComponentNames(filePath) {
  if (shouldExcludeFile(filePath)) {
    return [];
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const componentNames = [];
    const allNames = new Set();
    
    // Priority 1: export default function ComponentName (most common pattern)
    const defaultExportFunction = content.match(/export\s+default\s+function\s+(\w+)/);
    if (defaultExportFunction && !shouldExcludeName(defaultExportFunction[1])) {
      componentNames.push(defaultExportFunction[1]);
      allNames.add(defaultExportFunction[1]);
    }
    
    // Priority 2: export default const ComponentName = ...
    const defaultExportConst = content.match(/export\s+default\s+const\s+(\w+)\s*=/);
    if (defaultExportConst && !shouldExcludeName(defaultExportConst[1])) {
      componentNames.push(defaultExportConst[1]);
      allNames.add(defaultExportConst[1]);
    }
    
    // Priority 2.5: export default ComponentName; (standalone export)
    const standaloneDefaultExport = content.match(/export\s+default\s+(\w+)\s*;/);
    if (standaloneDefaultExport && !shouldExcludeName(standaloneDefaultExport[1]) && !allNames.has(standaloneDefaultExport[1])) {
      componentNames.push(standaloneDefaultExport[1]);
      allNames.add(standaloneDefaultExport[1]);
    }
    
    // Priority 3: export const ComponentName = () => or export const ComponentName = function()
    const constComponents = content.matchAll(/export\s+const\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|function|React\.(?:forwardRef|memo))/g);
    for (const match of constComponents) {
      if (!shouldExcludeName(match[1]) && !allNames.has(match[1])) {
        componentNames.push(match[1]);
        allNames.add(match[1]);
      }
    }
    
    // Priority 4: export function ComponentName(
    const functionDeclarations = content.matchAll(/export\s+function\s+(\w+)\s*\(/g);
    for (const match of functionDeclarations) {
      if (!shouldExcludeName(match[1]) && !allNames.has(match[1])) {
        componentNames.push(match[1]);
        allNames.add(match[1]);
      }
    }
    
    // Priority 5: export class ComponentName
    const classDeclarations = content.matchAll(/export\s+class\s+(\w+)/g);
    for (const match of classDeclarations) {
      if (!shouldExcludeName(match[1]) && !allNames.has(match[1])) {
        componentNames.push(match[1]);
        allNames.add(match[1]);
      }
    }
    
    // Lower priority: const ComponentName = ... (non-exported, but might be used)
    // Only if we haven't found any exported components
    if (componentNames.length === 0) {
      const localConstComponents = content.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|function|React\.(?:forwardRef|memo))/g);
      for (const match of localConstComponents) {
        if (!shouldExcludeName(match[1]) && !allNames.has(match[1])) {
          componentNames.push(match[1]);
          allNames.add(match[1]);
        }
      }
    }
    
    // Fallback: extract component name from filename if no patterns matched
    if (componentNames.length === 0) {
      const filename = path.basename(filePath, path.extname(filePath));
      if (!shouldExcludeName(filename)) {
        componentNames.push(filename);
      }
    }
    
    return componentNames;
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
}

/**
 * Extracts JSX component usage from a source file
 * Scans for actual JSX usage patterns: <Component />, <Library.Component>, {condition && <Component />}
 */
export function extractJSXUsageFromFile(filePath) {
  if (shouldExcludeFile(filePath)) {
    return new Set();
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const usedComponents = new Set();
    const htmlElementsSet = new Set(HTML_ELEMENTS.map(el => el.toLowerCase()));
    
    const selfClosingPattern = /<(\w+)(?:\.\w+)?\s*\/>/g;
    let match;
    while ((match = selfClosingPattern.exec(content)) !== null) {
      const componentName = match[1];
      if (!htmlElementsSet.has(componentName.toLowerCase()) && !shouldExcludeName(componentName)) {
        usedComponents.add(componentName);
      }
    }
    
    const openingTagPattern = /<(\w+)(?:\.(\w+))?(?:\s|>|\/)/g;
    while ((match = openingTagPattern.exec(content)) !== null) {
      const componentName = match[1];
      const namespacedComponent = match[2];
      
      if (namespacedComponent) {
        if (!htmlElementsSet.has(namespacedComponent.toLowerCase()) && !shouldExcludeName(namespacedComponent)) {
          usedComponents.add(namespacedComponent);
        }
      } else {
        if (!htmlElementsSet.has(componentName.toLowerCase()) && !shouldExcludeName(componentName)) {
          usedComponents.add(componentName);
        }
      }
    }
    
    const conditionalPattern = /\{[^}]*?<(\w+)(?:\.(\w+))?(?:\s|>|\/)/g;
    while ((match = conditionalPattern.exec(content)) !== null) {
      const componentName = match[1];
      const namespacedComponent = match[2];
      
      if (namespacedComponent) {
        if (!htmlElementsSet.has(namespacedComponent.toLowerCase()) && !shouldExcludeName(namespacedComponent)) {
          usedComponents.add(namespacedComponent);
        }
      } else {
        if (!htmlElementsSet.has(componentName.toLowerCase()) && !shouldExcludeName(componentName)) {
          usedComponents.add(componentName);
        }
      }
    }
    
    return usedComponents;
  } catch (error) {
    console.error(`Error extracting JSX usage from ${filePath}:`, error);
    return new Set();
  }
}

/**
 * Extracts import statements from a source file (fallback for usage detection)
 */
export function extractImportsFromFile(filePath) {
  if (shouldExcludeFile(filePath)) {
    return new Set();
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const importedComponents = new Set();
    
    const defaultImportPattern = /import\s+(\w+)\s+from\s+['"](.+?)['"]/g;
    let match;
    while ((match = defaultImportPattern.exec(content)) !== null) {
      const componentName = match[1];
      if (!content.substring(Math.max(0, match.index - 10), match.index).includes('type ') &&
          !shouldExcludeName(componentName)) {
        importedComponents.add(componentName);
      }
    }
    
    const namedImportPattern = /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"](.+?)['"]/g;
    while ((match = namedImportPattern.exec(content)) !== null) {
      const importsList = match[1];
      const components = importsList.split(',').map(imp => {
        const trimmed = imp.trim();
        const aliasMatch = trimmed.match(/^(\w+)(?:\s+as\s+\w+)?$/);
        return aliasMatch ? aliasMatch[1] : trimmed.split(/\s+/)[0];
      });
      
      components.forEach(componentName => {
        if (componentName && !shouldExcludeName(componentName)) {
          importedComponents.add(componentName);
        }
      });
    }
    
    const namespacePattern = /import\s+\*\s+as\s+(\w+)\s+from\s+['"](.+?)['"]/g;
    while ((match = namespacePattern.exec(content)) !== null) {
      const namespaceName = match[1];
      if (!shouldExcludeName(namespaceName)) {
        importedComponents.add(namespaceName);
      }
    }
    
    const mixedImportPattern = /import\s+(\w+)(?:\s*,\s*\{([^}]+)\})?\s+from\s+['"](.+?)['"]/g;
    while ((match = mixedImportPattern.exec(content)) !== null) {
      const defaultComponent = match[1];
      const namedImports = match[2];
      
      if (defaultComponent && !shouldExcludeName(defaultComponent)) {
        importedComponents.add(defaultComponent);
      }
      
      if (namedImports) {
        const components = namedImports.split(',').map(imp => {
          const trimmed = imp.trim();
          const aliasMatch = trimmed.match(/^(\w+)(?:\s+as\s+\w+)?$/);
          return aliasMatch ? aliasMatch[1] : trimmed.split(/\s+/)[0];
        });
        
        components.forEach(componentName => {
          if (componentName && !shouldExcludeName(componentName)) {
            importedComponents.add(componentName);
          }
        });
      }
    }
    
    return importedComponents;
  } catch (error) {
    console.error(`Error extracting imports from ${filePath}:`, error);
    return new Set();
  }
}

/**
 * Detects common source directories in a project
 * Looks for src, pages, components, app, etc.
 */
export function detectSourcePaths(projectRoot) {
  const sourcePaths = [];
  
  for (const dir of COMMON_SOURCE_DIRS) {
    const dirPath = path.join(projectRoot, dir);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      sourcePaths.push(dirPath);
    }
  }
  
  // If no common directories found, use project root itself
  if (sourcePaths.length === 0) {
    sourcePaths.push(projectRoot);
  }
  
  return sourcePaths;
}

/**
 * Builds usage map by scanning all project source files for JSX component usage
 */
export function buildUsageMap(sourcePaths) {
  const usageMap = {};
  
  sourcePaths.forEach(sourcePath => {
    if (!fs.existsSync(sourcePath)) {
      console.warn(`xray-react: Source path not found: ${sourcePath}`);
      return;
    }
    
    const files = scanSourceFiles(sourcePath);
    
    files.forEach(filePath => {
      const usedComponents = extractJSXUsageFromFile(filePath);
      if (usedComponents.size > 0) {
        usageMap[filePath] = Array.from(usedComponents);
      }
    });
  });
  
  return usageMap;
}

/**
 * Builds import map by scanning all project source files for import statements
 */
export function buildImportMap(sourcePaths) {
  const importMap = {};
  
  sourcePaths.forEach(sourcePath => {
    if (!fs.existsSync(sourcePath)) {
      console.warn(`xray-react: Source path not found: ${sourcePath}`);
      return;
    }
    
    const files = scanSourceFiles(sourcePath);
    
    files.forEach(filePath => {
      const importedComponents = extractImportsFromFile(filePath);
      if (importedComponents.size > 0) {
        importMap[filePath] = Array.from(importedComponents);
      }
    });
  });
  
  return importMap;
}

/**
 * Determines file priority for component mapping
 * Higher priority files take precedence when component names conflict
 * @param {string} filePath - Path to the file
 * @returns {number} Priority value (higher = more important)
 */
export function getFilePriority(filePath) {
  if (shouldExcludeFile(filePath)) {
    return 0;
  }
  
  if (filePath.match(/\.(tsx|jsx)$/)) {
    return 3;
  }
  
  if (filePath.match(/\.(ts|js)$/)) {
    return 2;
  }
  
  return 1;
}

/**
 * Extracts component context (parent component/directory) from file path
 * Used to disambiguate duplicate component names based on their location
 * @param {string} filePath - Full path to the component file
 * @param {string} projectRoot - Root directory of the project
 * @returns {Array<string>} Array of context identifiers (e.g., ["Navbar"])
 */
export function extractComponentContext(filePath, projectRoot) {
  if (!filePath || !projectRoot) {
    return [];
  }
  
  try {
    const relativePath = path.relative(projectRoot, filePath);
    const pathParts = relativePath.split(path.sep);
    const context = [];
    
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (COMMON_SOURCE_DIRS.includes(pathParts[i].toLowerCase())) {
        if (i + 1 < pathParts.length - 1) {
          context.push(pathParts[i + 1]);
        }
      }
    }
    
    // Fallback: use immediate parent directory
    if (context.length === 0 && pathParts.length > 1) {
      context.push(pathParts[pathParts.length - 2]);
    }
    
    return context;
  } catch (error) {
    console.error(`Error extracting context from ${filePath}:`, error);
    return [];
  }
}

/**
 * Detects project root by finding package.json
 * Walks up directory tree from startPath until package.json is found
 * @param {string} startPath - Starting directory path
 * @returns {string|null} Project root path or null if not found
 */
export function detectProjectRootByPackageJson(startPath = process.cwd()) {
  let currentPath = path.resolve(startPath);
  const root = path.parse(currentPath).root;
  
  while (currentPath !== root) {
    const packageJsonPath = path.join(currentPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return currentPath;
    }
    
    const parentPath = path.dirname(currentPath);
    // Reached filesystem root
    if (parentPath === currentPath) {
      break;
    }
    currentPath = parentPath;
  }
  
  return null;
}

/**
 * Resolves project root with correct precedence for plugins:
 * 1. Plugin param sourcePath (highest priority)
 * 2. Auto-detection (package.json walk, compilation context)
 * 3. XRAY_REACT_PROJECT_ROOT env var (fallback for standalone server.js)
 * @param {Object} options - Options object
 * @param {string} options.sourcePath - Plugin sourcePath parameter
 * @param {string} options.compilationContext - Compilation context (from webpack/vite/etc)
 * @param {string} options.fallbackPath - Fallback path (e.g., process.cwd())
 * @returns {string} Resolved project root path
 */
export function resolveProjectRoot({ sourcePath, compilationContext, fallbackPath = process.cwd() }) {
  if (sourcePath) {
    const resolved = path.resolve(sourcePath);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }
  
  const startPath = compilationContext || fallbackPath;
  const packageJsonRoot = detectProjectRootByPackageJson(startPath);
  if (packageJsonRoot) {
    return packageJsonRoot;
  }
  
  return path.resolve(startPath);
}

/**
 * Resolves port with correct precedence for plugins:
 * 1. Plugin param port (highest priority)
 * 2. XRAY_REACT_PORT env var (for standalone server.js)
 * 3. Default port 8124
 * @param {Object} options - Options object
 * @param {number} options.port - Plugin port parameter
 * @param {number} options.defaultPort - Default port (default: 8124)
 * @returns {number} Resolved port
 */
export function resolvePort({ port, defaultPort = 8124 }) {
  if (port !== undefined && port !== null) {
    return parseInt(port, 10);
  }
  
  if (process.env.XRAY_REACT_PORT) {
    return parseInt(process.env.XRAY_REACT_PORT, 10);
  }
  
  return defaultPort;
}

/**
 * Finds the correct component file using context-aware matching
 * Handles duplicate component names by matching against component hierarchy
 * @param {string} componentName - Name of the component to find
 * @param {Array<string>} hierarchy - Full component hierarchy path (e.g., ["Dashboard", "Navbar", "Logo"])
 * @param {Object} sources - Sources map (can be old format {name: path} or new format {name: [{path, context, priority}]})
 * @returns {string|null} File path to the component, or null if not found
 */
export function findComponentFile(componentName, hierarchy, sources) {
  if (!componentName || !sources) {
    return null;
  }
  
  const candidates = sources[componentName];
  if (!candidates) return null;
  
  if (typeof candidates === 'string') {
    return candidates;
  }
  
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].path;
  
  const componentIndex = hierarchy.indexOf(componentName);
  const parentComponent = componentIndex > 0 ? hierarchy[componentIndex - 1] : null;
  
  if (parentComponent) {
    const match = candidates.find(c => 
      c.context && (
        c.context.includes(parentComponent) || 
        c.context.some(ctx => ctx.toLowerCase() === parentComponent.toLowerCase())
      )
    );
    if (match) return match.path;
  }
  
  const sorted = candidates.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  return sorted[0].path;
}
