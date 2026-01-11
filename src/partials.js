import css from './css.js';

export const styleTag = `<style class="xray-react-style-tag">${css}</style>`;
export const actionBar = `
  <div class="xray-react-action-bar">
    <div class="xray-react-actions-wrapper">
      <input id="search-component" type="text" placeholder="Search component by name..."/>
      <div class="components-path"></div>
    </div>
  </div>
`;
