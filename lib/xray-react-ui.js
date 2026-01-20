import { enableXrayReact, setProjectRoot, setUsageMap, setImportMap, setProjectFiles, setMode } from '../src/ui-utils.js';

// Expose functions globally for client bundle to use
if (typeof window !== 'undefined') {
  window.xrayReactSetProjectRoot = setProjectRoot;
  window.xrayReactSetUsageMap = setUsageMap;
  window.xrayReactSetImportMap = setImportMap;
  window.xrayReactSetProjectFiles = setProjectFiles;
  window.xrayReactSetMode = setMode;
}

enableXrayReact();
