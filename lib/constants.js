/**
 * Server-side constants for xray-react
 * Shared across server.js and all bundler plugins
 */

export const REACT_FILE_EXTS = ['.jsx', '.js', '.tsx', '.ts'];

export const UI_MODE_FULL = 'full';
export const UI_MODE_SIMPLE = 'simple';
export const AVAILABLE_UI_MODES = [UI_MODE_FULL, UI_MODE_SIMPLE];

export const EXCLUDED_FILE_PATTERNS = [
  /\.styles\.(ts|js|tsx|jsx)$/i,
  /\.style\.(ts|js|tsx|jsx)$/i,
  /\.styl\.(ts|js|tsx|jsx)$/i,
  /\.css\.(ts|js|tsx|jsx)$/i,
  /\.test\.(ts|js|tsx|jsx)$/i,
  /\.spec\.(ts|js|tsx|jsx)$/i,
  /\.d\.ts$/i, // TypeScript declaration files
];

export const HTML_ELEMENTS = [
  'div', 'span', 'form', 'button', 'input', 'a', 'img', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'li', 'ol', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'section', 'article', 'header',
  'footer', 'nav', 'main', 'aside', 'br', 'hr', 'strong', 'em', 'b', 'i', 'u', 'label', 'select',
  'option', 'textarea', 'fieldset', 'legend', 'canvas', 'svg', 'path', 'circle', 'rect', 'line'
];

export const JS_KEYWORDS = [
  'function', 'const', 'let', 'var', 'class', 'interface', 'type', 'enum', 'export', 'import',
  'default', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue',
  'try', 'catch', 'finally', 'throw', 'new', 'this', 'super', 'extends', 'implements', 'static',
  'async', 'await', 'promise', 'array', 'object', 'string', 'number', 'boolean', 'null',
  'undefined', 'void'
];

export const COMMON_SOURCE_DIRS = [
  // Project structure
  'src',
  'app',
  'lib',
  'utils',
  // Atomic/UI components
  'atoms',
  'ui',
  // Shared/common components
  'common',
  'shared',
  // Component organization
  'components',
  'sections',
  'forms',
  'containers',
  // Layouts and templates
  'layouts',
  'templates',
  // Views and pages
  'views',
  'screens',
  'pages',
];
