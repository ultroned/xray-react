import css from './css.js';

export const styleTag = `<style class="xray-react-style-tag">${css}</style>`;
export const actionBar = `
  <div class="xray-react-action-bar">
    <div class="xray-react-actions-wrapper">
      <div class="search-wrapper">
        <input id="search-component" type="text" placeholder="Search component by name..."/>
        <button type="button" class="search-clear" aria-label="Clear search" style="display: none;">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13 1L1 13M1 1L13 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="components-path"></div>
    </div>
  </div>
`;
