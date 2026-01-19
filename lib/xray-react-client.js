import * as constants from '../src/constants.js';
import { UI_MODE_FULL, AVAILABLE_UI_MODES } from '../lib/constants.js';

const getIOConnectURL = () => {
  const port = (typeof window !== 'undefined' && window.__XRAY_REACT_PORT__) || 8124;
  return `http://127.0.0.1:${port}`;
};

/**
 * ClientIO class for handling Socket.IO connections
 */
class ClientIO {
  constructor() {
    this.client = null;
  }

  /**
   * Dynamically loads Socket.IO client library
   * @returns {Promise<boolean>} True if loaded successfully
   */
  addScript() {
    return new Promise((resolve) => {
      if (typeof window.io !== 'undefined') {
        resolve(true);
        return;
      }

      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.async = true;
      script.src = 'https://cdn.socket.io/4.8.1/socket.io.min.js';

      script.addEventListener('load', () => {
        resolve(true);
        script.remove();
      });

      script.addEventListener('error', () => {
        console.error('xray-react: Failed to load Socket.IO client library');
        resolve(false);
        script.remove();
      });

      document.body.appendChild(script);
    });
  }

  /**
   * Initializes Socket.IO connection
   * @returns {Promise<boolean>} True if connected successfully
   */
  async init() {
    if (typeof window.io === 'undefined') {
      const isSuccess = await this.addScript();
      if (!isSuccess) {
        return false;
      }
    }

    try {
      // Socket.IO 4.x uses io() instead of io.connect()
      this.client = window.io(getIOConnectURL(), {
        transports: ['websocket', 'polling']
      });

      this.client.on('connect', () => {
        // Connected successfully
      });

      this.client.on('disconnect', () => {
        // Disconnected from server
      });

      this.client.on('connect_error', (error) => {
        console.warn('xray-react: Connection error', error);
      });

      this.client.on('project-config', (config) => {
        if (config) {
          if (config.port && typeof window !== 'undefined') {
            window.__XRAY_REACT_PORT__ = config.port;
          }
          if (config.mode && typeof window !== 'undefined') {
            const mode = AVAILABLE_UI_MODES.includes(config.mode) ? config.mode : UI_MODE_FULL;
            window.__XRAY_REACT_MODE__ = mode;
            if (window.xrayReactSetMode) {
              window.xrayReactSetMode(mode);
            }
          }
          if (config.projectRoot) {
            if (typeof window !== 'undefined' && window.xrayReactSetProjectRoot) {
              window.xrayReactSetProjectRoot(config.projectRoot);
            } else {
              if (typeof window !== 'undefined') {
                window.__XRAY_REACT_PROJECT_ROOT__ = config.projectRoot;
              }
            }
          }
        }
      });

      this.client.on('usage-map', (data) => {
        if (data && data.usage) {
          if (typeof window !== 'undefined' && window.xrayReactSetUsageMap) {
            window.xrayReactSetUsageMap(data.usage);
          } else {
            if (typeof window !== 'undefined') {
              window.__XRAY_REACT_USAGE_MAP__ = data.usage;
            }
          }
        }
      });

      this.client.on('import-map', (data) => {
        if (data && data.imports) {
          if (typeof window !== 'undefined' && window.xrayReactSetImportMap) {
            window.xrayReactSetImportMap(data.imports);
          } else {
            if (typeof window !== 'undefined') {
              window.__XRAY_REACT_IMPORT_MAP__ = data.imports;
            }
          }
        }
      });

      this.client.on('project-files', (data) => {
        if (data && data.files) {
          if (typeof window !== 'undefined' && window.xrayReactSetProjectFiles) {
            window.xrayReactSetProjectFiles(data.files);
          } else {
            if (typeof window !== 'undefined') {
              window.__XRAY_REACT_PROJECT_FILES__ = data.files;
            }
          }
        }
      });

      return true;
    } catch (error) {
      console.error('xray-react: Failed to initialize Socket.IO', error);
      return false;
    }
  }
}

/**
 * Initializes Socket.IO and sets up click listeners
 */
const initIOAndListeners = async () => {
  const clientIO = new ClientIO();
  const isSuccess = await clientIO.init();

  if (isSuccess) {
    document.body.addEventListener('click', (event) => {
      const target = event.target;
      if (target.classList.contains(constants.xrayReactElemCN)) {
        const componentPath = target.getAttribute(constants.xrayReactCompPathAttr);
        if (componentPath && clientIO.client) {
          clientIO.client.emit('xray-react-component', componentPath);
        }
      }
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIOAndListeners);
} else {
  initIOAndListeners();
}
