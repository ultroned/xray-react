export const xrayReactElemCN = 'xray-react-element';
export const xrayReactWrapperCN = 'xray-react-elements-wrapper';
export const xrayReactCompPathAttr = 'data-xray-react-components-path';
export const xrayReactFilteredCompPathAttr = 'data-xray-react-filtered-components-path';
export const zIndex = 10000;

export const UI_MODE_FULL = 'full';
export const UI_MODE_SIMPLE = 'simple';
export const AVAILABLE_UI_MODES = [UI_MODE_FULL, UI_MODE_SIMPLE];

export const HTML_ELEMENTS = new Set([
  'div', 'span', 'form', 'button', 'input', 'a', 'img', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'li', 'ol', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot',
  'section', 'article', 'header', 'footer', 'nav', 'main', 'aside',
  'label', 'select', 'option', 'textarea', 'fieldset', 'legend',
  'br', 'hr', 'strong', 'em', 'b', 'i', 'u', 'small', 'sub', 'sup',
  'dl', 'dt', 'dd', 'pre', 'code', 'blockquote', 'cite',
  'canvas', 'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon',
  'iframe', 'embed', 'object', 'video', 'audio', 'source', 'track',
  'meta', 'link', 'style', 'script', 'noscript', 'template'
]);
