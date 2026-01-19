export default `
  .xray-react-enabled {
    margin-bottom: 50px !important;
  }
  .xray-react-elements-wrapper {
    bottom: 0;
    font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-style: normal;
    left: 0;
    position: absolute;
    right: 0;
    top: 0;
  }
  .xray-react-element {
    background-color: rgba(0, 0, 255, 0.25);
    border: 2px solid blue;
    cursor: pointer;
    position: absolute;
  }
  .xray-react-element::before {
    align-self: center;
    color: white;
    content: attr(data-xray-react-element-name);
    display: table;
    font-size: 18px;
    font-weight: 400;
    left: 50%;
    position: absolute;
    right: 0;
    text-align: center;
    top: 50%;
    transform: translate(-50%, -50%);
  }
  .xray-react-element::after {
    background-color: darkblue;
    color: white;
    content: attr(data-xray-react-element-name);
    display: inline-block;
    font-size: 10px;
    left: 0;
    padding: 0 5px;
    position: absolute;
    top: 0;
  }
  .xray-react-element:hover,
  .xray-react-element.-highlighted {
    background-color: rgba(0, 0, 255, 0.75);
    border-color: cyan;
  }
  .xray-react-element:hover::before,
  .xray-react-element.-highlighted::before {
    color: cyan;
  }
  .xray-react-element:hover::after,
  .xray-react-element.-highlighted::after {
    background-color: cyan;
    color: darkblue;
  }
  .xray-react-element.-highlighted {
    z-index: 99999 !important;
  }
  .xray-react-action-bar {
    align-items: center;
    background-color: darkblue;
    bottom: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    max-height: 100px;
    min-height: 50px;
    overflow-y: auto;
    padding: 0 10px;
    position: fixed;
    width: 100vw;
    z-index: 999999;
  }
  .xray-react-action-bar::-webkit-scrollbar {
    width: 8px;
  }
  .xray-react-action-bar::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
  }
  .xray-react-action-bar::-webkit-scrollbar-thumb {
    background: cyan;
    border-radius: 4px;
  }
  .xray-react-action-bar::-webkit-scrollbar-thumb:hover {
    background: #00ffff;
  }
  .xray-react-actions-wrapper {
    align-items: center;
    display: flex;
    font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-style: normal;
    min-height: 50px;
    padding: 5px 0;
    position: sticky;
    top: 0;
    width: 100%;
  }
  #search-component {
    align-self: center;
    background-color: lightgray;
    border-radius: 3px;
    border: 0;
    flex-shrink: 0;
    font-size: 14px;
    height: 30px;
    line-height: 20px;
    margin-right: 15px;
    min-width: 200px;
    outline: 0;
    padding: 5px 10px;
    width: 25%;
  }
  .components-path {
    color: cyan;
    flex: 1;
    font-size: 11px;
    line-height: 1.4;
    min-width: 0;
    overflow-x: auto;
    overflow-y: visible;
    white-space: nowrap;
    word-break: keep-all;
  }
  .components-path::-webkit-scrollbar {
    height: 4px;
  }
  .components-path::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
  }
  .components-path::-webkit-scrollbar-thumb {
    background: cyan;
    border-radius: 2px;
  }
  .components-path::-webkit-scrollbar-thumb:hover {
    background: #00ffff;
  }
  .xray-react-element-temp {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  .xray-react-element-temp::before {
    display: none !important;
  }
  .xray-react-element-temp::after {
    display: none !important;
  }
  .xray-react-spinner {
    width: 50px;
    height: 50px;
    border: 4px solid rgba(0, 255, 255, 0.3);
    border-top-color: cyan;
    border-radius: 50%;
    animation: xray-react-spin 1s linear infinite;
    position: relative;
    z-index: 1;
  }
  @keyframes xray-react-spin {
    to { transform: rotate(360deg); }
  }
  /* Simple mode styles */
  .xray-react-elements-wrapper.-simple-mode {
    border: 2px solid blue;
    box-sizing: border-box;
  }
  .xray-react-elements-wrapper.-simple-mode .xray-react-element {
    opacity: 0;
    pointer-events: auto;
  }
  .xray-react-elements-wrapper.-simple-mode .xray-react-element:hover {
    opacity: 1;
  }
  .xray-react-action-bar.-simple-mode #search-component {
    display: none;
  }
`;
