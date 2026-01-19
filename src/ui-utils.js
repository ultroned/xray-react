import * as constants from './constants.js';
import { styleTag, actionBar } from './partials.js';
import css from './css.js';
import { UI_MODE_FULL, UI_MODE_SIMPLE, AVAILABLE_UI_MODES } from './constants.js';

const MAX_FIBER_DEPTH = 50; // Prevent infinite loops

let projectRoot = null;
let usageMap = {};
let importMap = {};
let projectFilePaths = new Set();
let normalizedProjectFilePaths = new Set();           // Pre-normalized paths for O(1) lookup
let componentNameToFilesIndex = new Map();            // componentName -> Set<filePath> for O(1) lookup
const normalizePathCache = new Map();                 // Memoization cache for normalizePath
let currentMode = UI_MODE_FULL;

const EXTERNAL_PATTERNS = [
  /node_modules/i,
  /\.next[\/\\]/i,
  /dist[\/\\]/i,
  /build[\/\\]/i,
  /\.git[\/\\]/i,
  /\.cache[\/\\]/i,
  /coverage[\/\\]/i,
];

/**
 * Normalizes a file path for comparison
 * Handles both Unix and Windows paths, relative and absolute
 * Uses memoization cache for repeated calls with same path
 * @param {string} filePath - File path to normalize
 * @returns {string} Normalized path
 */
const normalizePath = (filePath) => {
  if (!filePath) return '';
  
  const cached = normalizePathCache.get(filePath);
  if (cached !== undefined) return cached;
  
  let normalized = String(filePath).replace(/\\/g, '/');
  normalized = normalized.replace(/^\/+|\/+$/g, '');
  normalized = normalized.toLowerCase();
  
  normalizePathCache.set(filePath, normalized);
  return normalized;
};

/**
 * Checks if a file path is external (node_modules, build artifacts, etc.)
 * @param {string} filePath - File path to check
 * @returns {boolean} True if path is external
 */
const isExternalPath = (filePath) => {
  if (!filePath) return false;
  
  const normalized = normalizePath(filePath);
  
  return EXTERNAL_PATTERNS.some(pattern => pattern.test(normalized));
};

/**
 * Detects project root from a file path by finding common base path
 * @param {Array<string>} filePaths - Array of file paths from fibers
 * @returns {string|null} Detected project root or null
 */
const detectProjectRootFromPaths = (filePaths) => {
  if (!filePaths || filePaths.length === 0) return null;
  
  const projectPaths = filePaths
    .filter(path => path && !isExternalPath(path))
    .map(normalizePath);
  
  if (projectPaths.length === 0) return null;
  
  const pathParts = projectPaths.map(path => path.split('/'));
  const minLength = Math.min(...pathParts.map(parts => parts.length));
  
  let commonParts = [];
  for (let i = 0; i < minLength; i++) {
    const part = pathParts[0][i];
    if (pathParts.every(parts => parts[i] === part)) {
      commonParts.push(part);
    } else {
      break;
    }
  }
  
  if (commonParts.length > 0) {
    return '/' + commonParts.join('/');
  }
  
  const firstPath = projectPaths[0];
  const lastSlash = firstPath.lastIndexOf('/');
  if (lastSlash > 0) {
    return '/' + firstPath.substring(0, lastSlash);
  }
  
  return null;
};

/**
 * Removes consecutive duplicate component names from an array
 * @param {Array<string>} path - Array of component names
 * @returns {Array<string>} Array with consecutive duplicates removed
 */
const removeConsecutiveDuplicates = (path) => {
  if (path.length === 0) return path;
  
  const result = [path[0]];
  for (let i = 1; i < path.length; i++) {
    if (path[i].toLowerCase() !== path[i - 1].toLowerCase()) {
      result.push(path[i]);
    }
  }
  return result;
};

/**
 * Handles search input changes to highlight matching components
 * @param {Event} event - Input event
 */
const handleSearchChange = (event) => {
  const value = event.target.value.toLowerCase();
  const regExp = new RegExp(`^${value}|${value}$`);
  const elements = document.querySelectorAll(`.${constants.xrayReactElemCN}`);
  
  for (const elem of elements) {
    if (value.length >= 2) {
      const searchName = elem.getAttribute('data-xray-react-element-search-name');
      if (searchName && searchName.match(regExp)) {
    elem.classList.add('-highlighted');
      } else {
        elem.classList.remove('-highlighted');
      }
    } else {
      elem.classList.remove('-highlighted');
    }
  }
};

/**
 * Gets the current mode from window or defaults to UI_MODE_FULL
 * @returns {string} Current mode (UI_MODE_FULL or UI_MODE_SIMPLE)
 */
const getCurrentMode = () => {
  if (typeof window !== 'undefined' && window.__XRAY_REACT_MODE__) {
    const mode = window.__XRAY_REACT_MODE__;
    return AVAILABLE_UI_MODES.includes(mode) ? mode : UI_MODE_FULL;
  }
  return UI_MODE_FULL;
};

/**
 * Sets the current mode
 * @param {string} mode - Mode to set (UI_MODE_FULL or UI_MODE_SIMPLE)
 */
export const setMode = (mode) => {
  currentMode = AVAILABLE_UI_MODES.includes(mode) ? mode : UI_MODE_FULL;
  if (typeof window !== 'undefined') {
    window.__XRAY_REACT_MODE__ = currentMode;
  }
};

/**
 * Gets the current mode
 * @returns {string} Current mode
 */
export const getMode = () => {
  return currentMode;
};

/**
 * Creates an overlay element for a React component
 * @param {HTMLElement} elem - The DOM element
 * @param {string} componentName - Name of the React component
 * @returns {Object} Object containing original element and overlay element
 */
const createElemForComponent = (elem, componentName) => {
  const xrayReactElem = document.createElement('div');
  const boundingClientRect = elem.getBoundingClientRect();
  
  xrayReactElem.className = constants.xrayReactElemCN;
  xrayReactElem.setAttribute('data-xray-react-element-name', componentName);
  xrayReactElem.setAttribute('data-xray-react-element-search-name', componentName.toLowerCase());
  xrayReactElem.style.height = `${boundingClientRect.height}px`;
  xrayReactElem.style.width = `${boundingClientRect.width}px`;
  xrayReactElem.style.top = `${boundingClientRect.top + window.scrollY}px`;
  xrayReactElem.style.left = `${boundingClientRect.left + window.scrollX}px`;
  xrayReactElem.style.zIndex = constants.zIndex;
  
  return { elem, xrayReactElem };
};

/**
 * Checks if a name is an HTML element
 * @param {string} name - Component or element name
 * @returns {boolean} True if it's an HTML element
 */
const isHTMLElement = (name) => {
  if (!name || typeof name !== 'string') return false;
  return constants.HTML_ELEMENTS.has(name.toLowerCase());
};

/**
 * Resolves component name from element type and fiber
 * Handles function components, class components, forwardRef, memo, etc.
 * @param {*} elementType - React element type
 * @param {Object} fiber - React fiber node
 * @returns {string|null} Component name or null
 */
const resolveComponentName = (elementType, fiber = null) => {
  if (!elementType) return null;

  if (typeof elementType === 'function') {
    if (elementType.displayName) {
      return elementType.displayName;
    }
    
    if (elementType.name && elementType.name !== 'Anonymous') {
      return elementType.name;
    }
    
    if (elementType.render) {
      return resolveComponentName(elementType.render, fiber);
    }
    
    if (elementType.$$typeof && elementType.type) {
      return resolveComponentName(elementType.type, fiber);
    }
  }
  
  if (typeof elementType === 'string') {
    return elementType;
  }
  
  if (elementType && elementType.$$typeof) {
    if (elementType.type) {
      return resolveComponentName(elementType.type, fiber);
    }
  }
  
  if (fiber && fiber._debugSource) {
    const fileName = fiber._debugSource.fileName;
    if (fileName) {
      const match = fileName.match(/([^/\\]+)\.(jsx?|tsx?)$/);
      if (match) {
        return match[1];
      }
    }
  }
  
  return null;
};

/**
 * Checks if a component belongs to the project based on its source file path
 * @param {Object} fiber - React fiber node
 * @param {string} projectRootPath - Project root path for comparison
 * @param {string} componentName - Optional component name to check against project files
 * @returns {boolean} True if component belongs to project
 */
const isProjectComponent = (fiber, projectRootPath, componentName = null) => {
  if (!projectRootPath) {
    return true;
  }

  const filePath = fiber?._debugSource?.fileName;

  if (filePath) {
    if (isExternalPath(filePath)) {
      return false;
    }
    
    const normalizedFilePath = normalizePath(filePath);
    const normalizedProjectRoot = normalizePath(projectRootPath);
    
    if (normalizedFilePath.startsWith(normalizedProjectRoot)) {
      return true;
    }
    
    if (!normalizedFilePath.includes('node_modules') && 
        !normalizedFilePath.startsWith('/') &&
        !normalizedFilePath.match(/^[a-z]:/i)) {
      return true;
    }
    
    return false;
  }
  
  if (componentName) {
    const normalizedComponentName = componentName.toLowerCase();
    // O(1) lookup using pre-built index instead of O(m) loop through all files
    if (componentNameToFilesIndex.has(normalizedComponentName)) {
      return true;
    }
  }
  
  return false;
};

/**
 * Sets the project root path for filtering
 * @param {string} rootPath - Project root path
 */
export const setProjectRoot = (rootPath) => {
  projectRoot = rootPath ? normalizePath(rootPath) : null;
  
  if (typeof window !== 'undefined' && window.__XRAY_REACT_PROJECT_ROOT__ && !projectRoot) {
    projectRoot = normalizePath(window.__XRAY_REACT_PROJECT_ROOT__);
  }
};

/**
 * Gets the current project root path
 * @returns {string|null} Project root path or null
 */
export const getProjectRoot = () => {
  return projectRoot;
};

/**
 * Sets the usage map for filtering external components
 * @param {Object} map - Usage map (file path -> Array of component names)
 */
export const setUsageMap = (map) => {
  usageMap = map || {};
  
  if (typeof window !== 'undefined' && window.__XRAY_REACT_USAGE_MAP__ && Object.keys(usageMap).length === 0) {
    usageMap = window.__XRAY_REACT_USAGE_MAP__;
  }
  
  if (projectFilePaths.size === 0) {
    projectFilePaths = new Set(Object.keys(usageMap || {}));
  } else {
    Object.keys(usageMap || {}).forEach(filePath => projectFilePaths.add(filePath));
  }
};

/**
 * Sets the import map for filtering external components (fallback)
 * @param {Object} map - Import map (file path -> Array of component names)
 */
export const setImportMap = (map) => {
  importMap = map || {};
  
  if (typeof window !== 'undefined' && window.__XRAY_REACT_IMPORT_MAP__ && Object.keys(importMap).length === 0) {
    importMap = window.__XRAY_REACT_IMPORT_MAP__;
  }
  
  Object.keys(importMap || {}).forEach(filePath => projectFilePaths.add(filePath));
};

/**
 * Sets the list of all project files found in sourcePath folders
 * @param {Array<string>} files - Array of all file paths found in sourcePath
 */
export const setProjectFiles = (files) => {
  let fileList = files || [];
  
  if (typeof window !== 'undefined' && window.__XRAY_REACT_PROJECT_FILES__ && fileList.length === 0) {
    const globalFiles = window.__XRAY_REACT_PROJECT_FILES__;
    if (Array.isArray(globalFiles)) {
      fileList = [...globalFiles];
    }
  }
  
  projectFilePaths = new Set(fileList);
  
  // Pre-compute normalized paths and component name index for O(1) lookups
  normalizedProjectFilePaths.clear();
  componentNameToFilesIndex.clear();
  
  for (const filePath of fileList) {
    const normalized = normalizePath(filePath);
    normalizedProjectFilePaths.add(normalized);
    
    const pathParts = normalized.split('/');
    const filename = pathParts[pathParts.length - 1] || '';
    const filenameWithoutExt = filename.replace(/\.(tsx?|jsx?)$/, '');
    
    if (filenameWithoutExt) {
      if (!componentNameToFilesIndex.has(filenameWithoutExt)) {
        componentNameToFilesIndex.set(filenameWithoutExt, new Set());
      }
      componentNameToFilesIndex.get(filenameWithoutExt).add(filePath);
    }
    
    for (const part of pathParts.slice(0, -1)) {
      if (part && part.length > 1) {
        if (!componentNameToFilesIndex.has(part)) {
          componentNameToFilesIndex.set(part, new Set());
        }
        componentNameToFilesIndex.get(part).add(filePath);
      }
    }
  }
};

/**
 * Attempts to detect project root from fiber tree when server is not available
 * Scans DOM for React fibers and extracts file paths to infer project root
 */
const detectProjectRootFromDOM = () => {
  if (projectRoot) {
    return;
  }
  
  try {
    const filePaths = [];
    const maxSamples = 50; // Limit samples for performance
    let samples = 0;
    
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      null,
      false
    );
    
    let node;
    while ((node = walker.nextNode()) && samples < maxSamples) {
      const fiberKey = Object.keys(node).find(key =>
        key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
      );
      
      if (fiberKey) {
        const fiber = node[fiberKey];
        let currentFiber = fiber;
        let depth = 0;
        
        while (currentFiber && depth < 10) {
          if (currentFiber._debugSource && currentFiber._debugSource.fileName) {
            const filePath = currentFiber._debugSource.fileName;
            if (!isExternalPath(filePath)) {
              filePaths.push(filePath);
            }
          }
          currentFiber = currentFiber.return;
          depth++;
          samples++;
        }
      }
    }
    
    if (filePaths.length > 0) {
      const detectedRoot = detectProjectRootFromPaths(filePaths);
      if (detectedRoot) {
        projectRoot = detectedRoot;
      }
    }
  } catch (error) {
    // Silently fail - project root detection is optional
  }
};

/**
 * Checks if an external component is used by any internal component in the seen list
 * Checks usage map first (primary), then import map (fallback)
 * @param {string} componentName - External component name to check
 * @param {Array} seenInternalComponents - Array of internal components seen so far in path
 * @returns {boolean} True if component is used by any seen internal component
 */
const isUsedByInternalComponents = (componentName, seenInternalComponents) => {
  if (!componentName || seenInternalComponents.length === 0) {
    return false;
  }
  
  if (Object.keys(usageMap).length === 0 && Object.keys(importMap).length === 0) {
    return true;
  }
  
  for (const internalComp of seenInternalComponents) {
    const filePath = internalComp.file;
    if (!filePath) continue;
    
    if (usageMap[filePath] && Array.isArray(usageMap[filePath])) {
      if (usageMap[filePath].includes(componentName)) {
        return true;
      }
    }
    
    if (importMap[filePath] && Array.isArray(importMap[filePath])) {
      if (importMap[filePath].includes(componentName)) {
        return true;
      }
    }
  }
  
  return false;
};

/**
 * Traverses the fiber tree to find React components, skipping HTML elements
 * Filters out external library components based on usage/import maps
 * @param {Object} fiber - Starting fiber node
 * @param {number} maxDepth - Maximum depth to traverse
 * @returns {Array} Array of component information objects
 */
const traverseFiberTree = (fiber, maxDepth = MAX_FIBER_DEPTH) => {
  const allComponents = [];
  const internalComponents = [];
  let currentFiber = fiber;
  let depth = 0;
  // Performance improvements
  const visited = new Set();
  
  while (currentFiber && depth < maxDepth) {
    if (visited.has(currentFiber)) {
      break;
    }
    visited.add(currentFiber);
    
    const elementType = currentFiber.elementType || currentFiber.type;
    
    if (elementType) {
      const componentName = resolveComponentName(elementType, currentFiber);
      
      if (componentName) {
        if (!isHTMLElement(componentName)) {
          const isInternal = isProjectComponent(currentFiber, projectRoot, componentName);
          
          let filePath = null;
          if (currentFiber._debugSource && currentFiber._debugSource.fileName) {
            filePath = currentFiber._debugSource.fileName;
          }
          
          allComponents.push({
            name: componentName,
            fiber: currentFiber,
            elementType: elementType,
            depth: depth,
            isInternal: isInternal,
            file: filePath
          });
          
          if (isInternal) {
            internalComponents.push({
              name: componentName,
              file: filePath
            });
          }
        }
      }
    }
    
    currentFiber = currentFiber.return || currentFiber._owner;
    depth++;
  }
  
  const filteredComponents = [];
  for (const comp of allComponents) {
    if (comp.isInternal) {
      filteredComponents.push({
        name: comp.name,
        fiber: comp.fiber,
        elementType: comp.elementType,
        depth: comp.depth,
        file: comp.file,
        isInternal: comp.isInternal
      });
    } else {
      if (isUsedByInternalComponents(comp.name, internalComponents)) {
        filteredComponents.push({
          name: comp.name,
          fiber: comp.fiber,
          elementType: comp.elementType,
          depth: comp.depth,
          file: comp.file,
          isInternal: comp.isInternal
        });
      }
    }
  }
  
  return filteredComponents;
};

/**
 * Gets React component information from a DOM element using React DevTools protocol
 * Supports React 18+ and falls back to legacy detection for older versions
 * Enhanced to skip HTML elements and find actual React components
 * @param {HTMLElement} elem - The DOM element
 * @returns {Object} Object with component name and optional uid
 */
const getComponentObj = (elem) => {
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    try {
      const fiberKey = Object.keys(elem).find(key => 
        key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
      );
      
      if (fiberKey) {
        const fiber = elem[fiberKey];
        const components = traverseFiberTree(fiber);
        
        if (components.length > 0) {
          const firstComponent = components[0];
          const uid = firstComponent.fiber._debugID || 
                     `${firstComponent.fiber.index || ''}${firstComponent.fiber.key || ''}`;
          const reversedHierarchy = components.reverse().map(c => c.name);
          return { 
            name: firstComponent.name, 
            uid,
            hierarchy: reversedHierarchy
          };
        }
      }
    } catch (error) {
      // Silently fall back to legacy detection
    }
  }
  
  for (const key of Object.keys(elem)) {
    if (key.startsWith('__reactInternalInstance$')) {
      const fiberNode = elem[key];
      if (fiberNode) {
        try {
          const components = traverseFiberTree(fiberNode);
          if (components.length > 0) {
            const firstComponent = components[0];
            const reversedHierarchy = components.reverse().map(c => c.name);
            return { 
              name: firstComponent.name,
              uid: `${fiberNode._mountIndex || ''}${fiberNode._mountOrder || ''}`,
              hierarchy: reversedHierarchy
            };
          }
        } catch (error) {
          // Continue to old legacy detection
        }
      }
      
      if (fiberNode && fiberNode._currentElement) {
        const owner = fiberNode._currentElement._owner;
        const fiber = owner && owner._instance;
        if (fiber) {
          const componentName = fiber.constructor.name;
          if (!isHTMLElement(componentName)) {
            return { 
              name: componentName, 
              uid: `${owner._mountIndex || ''}${owner._mountOrder || ''}` 
            };
          }
        }
      } else if (fiberNode) {
        const fiber = fiberNode.return?.stateNode?._reactInternalFiber;
        if (fiber) {
          const componentName = fiber.type?.name || 'Unknown';
          if (componentName !== 'Unknown' && !isHTMLElement(componentName)) {
            return { name: componentName };
          }
        }
      }
    }
  }
  
  const tagName = elem.tagName?.toLowerCase();
  if (tagName && isHTMLElement(tagName)) {
    return { name: tagName };
  }
  
  return {};
};

/**
 * Creates a cached function for searching and creating component overlays
 * @returns {Function} Function that creates overlay elements for components
 */
const searchAndCreateComponentCached = () => {
  // Performance improvements
  const uids = new Set();
  return (elem) => {
    const { name, uid } = getComponentObj(elem);
    
    if (name && name !== 'Unknown') {
      if (uid) {
        if (!uids.has(uid)) {
          uids.add(uid);
          return createElemForComponent(elem, name);
        }
      } else {
        return createElemForComponent(elem, name);
      }
    }
    return null;
  };
};

/**
 * Extracts component objects from React fiber tree
 * @param {HTMLElement} elem - DOM element to extract components from
 * @returns {Array} Array of component objects from fiber tree
 */
const getComponentsFromElement = (elem) => {
  let components = [];
  
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    try {
      const fiberKey = Object.keys(elem).find(key => 
        key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
      );
      
      if (fiberKey) {
        const fiber = elem[fiberKey];
        components = traverseFiberTree(fiber);
        // Reverse to get parent -> child order (traversal goes child -> parent)
        components = components.reverse();
      }
    } catch (error) {
      // Silently fall back to legacy detection
    }
  }
  
  if (components.length === 0) {
    for (const key of Object.keys(elem)) {
      if (key.startsWith('__reactInternalInstance$')) {
        const fiberNode = elem[key];
        if (fiberNode) {
          try {
            components = traverseFiberTree(fiberNode);
            // Reverse to get parent -> child order
            components = components.reverse();
            break;
          } catch (error) {
            // Silently continue to next detection method
          }
        }
      }
    }
  }
  
  return components;
};

/**
 * Gets component path from DOM traversal (fallback method)
 * @param {HTMLElement} elem - DOM element to start traversal from
 * @returns {Array} Array of component names from DOM traversal
 */
const getDomPath = (elem) => {
  let currentElem = elem;
  const domPath = [];
  const seenComponentNames = new Set();
  
  while (currentElem && currentElem.parentNode && domPath.length < 20) {
    currentElem = currentElem.parentNode;
    const { name: component } = getComponentObj(currentElem);
    if (component && component !== 'Unknown' && !isHTMLElement(component)) {
      const normalizedName = component.toLowerCase();
      if (!seenComponentNames.has(normalizedName)) {
        seenComponentNames.add(normalizedName);
        domPath.unshift(component);
      }
    }
  }
  
  return domPath;
};

/**
 * Builds full component structure path (includes all components)
 * @param {Array} components - Component objects from fiber tree
 * @param {string} currentComponentName - Name of current component
 * @param {HTMLElement} elem - Original DOM element for fallback
 * @returns {string} Full component path structure
 */
const buildFullStructure = (components, currentComponentName, elem) => {
  if (components.length > 0) {
    const filteredComponents = components.filter(comp => 
      comp.name !== currentComponentName && !isHTMLElement(comp.name)
    );
    
    if (filteredComponents.length > 0) {
      const fullPath = filteredComponents.map(comp => comp.name);
      return [...fullPath, currentComponentName].join(' -> ');
    }
    
    return currentComponentName;
  }
  
  const domPath = getDomPath(elem);
  
  if (domPath.length > 0) {
    return [...domPath, currentComponentName].join(' -> ');
  }
  
  return currentComponentName;
};

/**
 * Builds filtered component structure path (only project-owned components)
 * @param {Array} components - Component objects from fiber tree
 * @param {string} currentComponentName - Name of current component
 * @param {HTMLElement} elem - Original DOM element for fallback
 * @returns {string} Filtered component path structure
 */
const buildFilteredStructure = (components, currentComponentName, elem) => {
  if (components.length > 0) {
    const filteredComponents = components.filter(comp => 
      comp.name !== currentComponentName && !isHTMLElement(comp.name)
    );
    
    const seenComponents = new Set();
    const projectOwnedComponents = [];
    
    for (const comp of filteredComponents) {
      if (!comp.isInternal) {
        continue;
      }

      const normalizedName = comp.name.toLowerCase();
      
      if (comp.file) {
        const normalizedFile = comp.file.toLowerCase();
        const pathParts = normalizedFile.split(/[\/\\]/);
        const filename = pathParts[pathParts.length - 1];
        const filenameWithoutExt = filename.replace(/\.(tsx?|jsx?)$/, '');

        const nameMatchesFile = normalizedFile.includes(`/${normalizedName}`) || 
                                normalizedFile.includes(`\\${normalizedName}`) ||
                                normalizedFile.endsWith(`/${normalizedName}.tsx`) ||
                                normalizedFile.endsWith(`/${normalizedName}.ts`) ||
                                normalizedFile.endsWith(`/${normalizedName}.jsx`) ||
                                normalizedFile.endsWith(`/${normalizedName}.js`) ||
                                normalizedFile.endsWith(`\\${normalizedName}.tsx`) ||
                                normalizedFile.endsWith(`\\${normalizedName}.ts`) ||
                                normalizedFile.endsWith(`\\${normalizedName}.jsx`) ||
                                normalizedFile.endsWith(`\\${normalizedName}.js`) ||
                                filenameWithoutExt === normalizedName;
        
        // O(1) lookup using pre-built index instead of O(m) spread + some + includes
        const inProjectFilePaths = componentNameToFilesIndex.has(normalizedName);

        if (!nameMatchesFile && !inProjectFilePaths) {
          continue;
        }
        
        // Deduplicate by component identity: use normalized name + normalized file path as unique key
        // This ensures that:
        // 1. The same component (same name, same file) appearing multiple times is only shown once
        //    (e.g., WebAppLayout -> WebAppLayout -> WebAppLayout)
        // 2. Different components with the same name but different files are both shown
        //    (e.g., components_left/Parent.jsx vs components_right/Parent.jsx)
        const normalizedFilePath = normalizePath(comp.file);
        const componentKey = `${normalizedName}:${normalizedFilePath}`;
        
        if (seenComponents.has(componentKey)) {
          continue;
        }
        
        seenComponents.add(componentKey);
        projectOwnedComponents.push(comp);
      } else {
        const componentKey = normalizedName;
        
        if (seenComponents.has(componentKey)) {
          continue;
        }

        seenComponents.add(componentKey);
        projectOwnedComponents.push(comp);
      }
    }

    if (projectOwnedComponents.length > 0) {
      const filteredPath = projectOwnedComponents.map(comp => comp.name);
      const currentNameLower = currentComponentName.toLowerCase();
      const pathContainsCurrent = filteredPath.some(name => name.toLowerCase() === currentNameLower);
      
      let finalPath;
      if (!pathContainsCurrent) {
        finalPath = [...filteredPath, currentComponentName];
      } else {
        finalPath = filteredPath;
      }
      
      // Remove consecutive duplicates of the same components before joining
      finalPath = removeConsecutiveDuplicates(finalPath);
      return finalPath.join(' -> ');
    }
    
    return currentComponentName;
  }
  
  const domPath = getDomPath(elem);
  
  if (domPath.length > 0) {
    const currentNameLower = currentComponentName.toLowerCase();
    const pathContainsCurrent = domPath.some(name => name.toLowerCase() === currentNameLower);
    
    let finalPath;
    if (!pathContainsCurrent) {
      finalPath = [...domPath, currentComponentName];
    } else {
      finalPath = domPath;
    }
    
    // Remove consecutive duplicates of the same components before joining
    finalPath = removeConsecutiveDuplicates(finalPath);
    return finalPath.join(' -> ');
  }
  
  return currentComponentName;
};

/**
 * Adds the absolute component path to an overlay element
 * Uses fiber-based hierarchy for accurate React component paths
 * @param {HTMLElement} elem - Original DOM element
 * @param {HTMLElement} xrayReactElem - Overlay element
 */
const addAbsoluteComponentPath = (elem, xrayReactElem) => {
  const currentComponentName = xrayReactElem.getAttribute('data-xray-react-element-name') || '';
  
  const components = getComponentsFromElement(elem);
  
  const fullStructure = buildFullStructure(components, currentComponentName, elem);
  const filteredStructure = buildFilteredStructure(components, currentComponentName, elem);
  
  xrayReactElem.setAttribute(constants.xrayReactCompPathAttr, fullStructure);
  xrayReactElem.setAttribute(constants.xrayReactFilteredCompPathAttr, filteredStructure);
};

/**
 * Handles mouseover events on overlay elements
 * @param {Event} event - Mouseover event
 */
const onXrayReactMouseover = (event) => {
  const { target } = event;
  if (target.classList.contains(constants.xrayReactElemCN)) {
    const componentsPath = target.getAttribute(constants.xrayReactFilteredCompPathAttr) || 
                           target.getAttribute(constants.xrayReactCompPathAttr) || '';
    const pathElement = document.querySelector('.xray-react-actions-wrapper .components-path');
    if (pathElement) {
      pathElement.innerHTML = componentsPath;
    }
  }
};


/**
 * Toggles the xray-react overlay on/off
 */
const toggleXrayReact = () => {
  const body = document.body;
  
  if (body.classList.contains('xray-react-enabled')) {
    body.classList.remove('xray-react-enabled');
    const xrayReactElementsWrapper = document.querySelector(`.${constants.xrayReactWrapperCN}`);
    const xrayReactActionBar = document.querySelector('.xray-react-action-bar');
    const xrayReactStyleTag = document.querySelector('.xray-react-style-tag');
    const tempElements = document.querySelectorAll('.xray-react-element-temp');
    
    if (xrayReactActionBar) {
      xrayReactActionBar.classList.remove('-simple-mode');
    }
    if (xrayReactElementsWrapper) xrayReactElementsWrapper.remove();
    if (xrayReactActionBar) xrayReactActionBar.remove();
    if (xrayReactStyleTag) xrayReactStyleTag.remove();
    tempElements.forEach(el => el.remove());
    
    body.removeEventListener('mouseover', onXrayReactMouseover);
  } else {
    body.classList.add('xray-react-enabled');

    currentMode = getCurrentMode();

    let styleElement = document.querySelector('.xray-react-style-tag');
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.className = 'xray-react-style-tag';
      styleElement.textContent = css;
      document.head.appendChild(styleElement);
    }
    
    const existingActionBar = document.querySelector('.xray-react-action-bar');
    if (!existingActionBar) {
      body.insertAdjacentHTML('beforeend', actionBar);
    }
    if (currentMode === UI_MODE_SIMPLE && existingActionBar) {
      existingActionBar.classList.add('-simple-mode');
    } else if (currentMode === UI_MODE_SIMPLE && !existingActionBar) {
      setTimeout(() => {
        const actionBar = document.querySelector('.xray-react-action-bar');
        if (actionBar) {
          actionBar.classList.add('-simple-mode');
        }
      }, 0);
    } else if (currentMode !== UI_MODE_SIMPLE && existingActionBar) {
      existingActionBar.classList.remove('-simple-mode');
    }
    const searchInput = document.getElementById('search-component');
    if (searchInput) {
      searchInput.addEventListener('input', handleSearchChange);
    }
    body.addEventListener('mouseover', onXrayReactMouseover);
    
    const existingWrapper = document.querySelector(`.${constants.xrayReactWrapperCN}`);
    if (existingWrapper) {
      existingWrapper.remove();
    }
    
    const xrayReactElementsWrapper = document.createElement('div');
    xrayReactElementsWrapper.className = constants.xrayReactWrapperCN;
    if (currentMode === UI_MODE_SIMPLE) {
      xrayReactElementsWrapper.classList.add('-simple-mode');
    }
    body.append(xrayReactElementsWrapper);
    if (currentMode === UI_MODE_SIMPLE) {
      const actionBar = document.querySelector('.xray-react-action-bar');
      if (actionBar) {
        actionBar.classList.add('-simple-mode');
      }
    }
    const existingLoading = document.querySelectorAll('.xray-react-element-temp');
    existingLoading.forEach(el => el.remove());
    
    const loadingElement = document.createElement('div');
    loadingElement.className = 'xray-react-element xray-react-element-temp';
    loadingElement.style.height = `${window.innerHeight}px`;
    loadingElement.style.width = `${window.innerWidth}px`;
    loadingElement.style.top = `${window.scrollY}px`;
    loadingElement.style.left = `${window.scrollX}px`;
    loadingElement.style.zIndex = '10000';
    loadingElement.innerHTML = '<div class="xray-react-spinner xray-react-element-temp"></div>';
    xrayReactElementsWrapper.appendChild(loadingElement);
    
    // Performance improvements
    const processElementsAsync = () => {
      const xrayReactObjects = [];
      const searchAndCreateComponent = searchAndCreateComponentCached();
      const allElements = Array.from(body.getElementsByTagName('*')).filter(elem => {
        return !elem.classList.contains('xray-react-element-temp') &&
               !elem.closest('.xray-react-action-bar') &&
               !elem.closest(`.${constants.xrayReactWrapperCN}`);
      });
      const batchSize = 20;
      let index = 0;
      
      const processBatch = () => {
        const endIndex = Math.min(index + batchSize, allElements.length);
        
        for (let i = index; i < endIndex; i++) {
          const elem = allElements[i];
          const xrayReactObj = searchAndCreateComponent(elem);
          if (xrayReactObj) {
            xrayReactObjects.push(xrayReactObj);
          }
        }
        
        index = endIndex;
        
        if (index < allElements.length) {
          setTimeout(processBatch, 1);
        } else {
          let pathIndex = 0;
          const pathBatchSize = 10;
          
          const processPaths = () => {
            const endIndex = Math.min(pathIndex + pathBatchSize, xrayReactObjects.length);
            
            for (let i = pathIndex; i < endIndex; i++) {
              const { elem, xrayReactElem } = xrayReactObjects[i];
              addAbsoluteComponentPath(elem, xrayReactElem);
            }
            
            pathIndex = endIndex;
            
            if (pathIndex < xrayReactObjects.length) {
              setTimeout(processPaths, 1);
            } else {
              const wrapper = document.querySelector(`.${constants.xrayReactWrapperCN}`);
              if (wrapper) {
                const tempElements = wrapper.querySelectorAll('.xray-react-element-temp');
                tempElements.forEach(el => el.remove());
                wrapper.append(...xrayReactObjects.map(obj => obj.xrayReactElem));
              }
            }
          };
          
          setTimeout(processPaths, 1);
        }
      };
      
      setTimeout(processBatch, 1);
    };
    
    processElementsAsync();
  }
};

/**
 * Keydown event handler for xray-react shortcuts
 * Matches xray-rails: Cmd+Shift+X (Mac) / Ctrl+Shift+X (Windows/Linux)
 */
let keydownHandler = null;
let isHandlerRegistered = false;

const createKeydownHandler = () => {
  return (event) => {
    if (event.key === 'Escape') {
      const body = document.body;
      if (body && body.classList.contains('xray-react-enabled')) {
        toggleXrayReact();
        event.preventDefault();
      }
      return;
    }
    
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isMetaOrCtrl = isMac ? event.metaKey : event.ctrlKey;
    const isShift = event.shiftKey;
    const isX = event.key === 'x' || event.key === 'X' || event.keyCode === 88;
    
    if (isMetaOrCtrl && isShift && isX) {
      toggleXrayReact();
      event.preventDefault();
      event.stopPropagation();
    }
  };
};

/**
 * Handles keyboard shortcut to toggle xray-react
 * Ensures the listener is only registered once
 */
const handleXrayReactToggle = () => {
  if (isHandlerRegistered) {
    return;
  }
  
  if (!keydownHandler) {
    keydownHandler = createKeydownHandler();
  }
  
  document.addEventListener('keydown', keydownHandler, true);
  isHandlerRegistered = true;
};

/**
 * Enables xray-react functionality
 */
export const enableXrayReact = () => {
  currentMode = getCurrentMode();

  if (!projectRoot) {
    if (typeof window !== 'undefined' && window.__XRAY_REACT_PROJECT_ROOT__) {
      projectRoot = normalizePath(window.__XRAY_REACT_PROJECT_ROOT__);
    } else {
      setTimeout(() => {
        detectProjectRootFromDOM();
      }, 1000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleXrayReactToggle);
  } else {
    handleXrayReactToggle();
  }
};
