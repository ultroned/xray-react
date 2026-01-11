import * as constants from '../src/constants.js';

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
        console.error('Failed to load Socket.IO client library');
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
        console.debug('Xray-react: Connected to server');
      });

      this.client.on('disconnect', () => {
        console.debug('Xray-react: Disconnected from server');
      });

      this.client.on('connect_error', (error) => {
        console.warn('Xray-react: Connection error', error);
      });

      this.client.on('project-config', (config) => {
        if (config) {
          if (config.port && typeof window !== 'undefined') {
            window.__XRAY_REACT_PORT__ = config.port;
            console.debug('Xray-react: Received port from server:', config.port);
          }
          
          if (config.projectRoot) {
            if (typeof window !== 'undefined' && window.xrayReactSetProjectRoot) {
              window.xrayReactSetProjectRoot(config.projectRoot);
              console.debug('Xray-react: Received project root from server:', config.projectRoot);
            } else {
              if (typeof window !== 'undefined') {
                window.__XRAY_REACT_PROJECT_ROOT__ = config.projectRoot;
                console.debug('Xray-react: Stored project root in global variable:', config.projectRoot);
              }
            }
          }
        }
      });

      this.client.on('usage-map', (data) => {
        if (data && data.usage) {
          if (typeof window !== 'undefined' && window.xrayReactSetUsageMap) {
            window.xrayReactSetUsageMap(data.usage);
            console.debug('Xray-react: Received usage map from server:', Object.keys(data.usage).length, 'files');
          } else {
            if (typeof window !== 'undefined') {
              window.__XRAY_REACT_USAGE_MAP__ = data.usage;
              console.debug('Xray-react: Stored usage map in global variable:', Object.keys(data.usage).length, 'files');
            }
          }
        }
      });

      this.client.on('import-map', (data) => {
        if (data && data.imports) {
          if (typeof window !== 'undefined' && window.xrayReactSetImportMap) {
            window.xrayReactSetImportMap(data.imports);
            console.debug('Xray-react: Received import map from server:', Object.keys(data.imports).length, 'files');
          } else {
            if (typeof window !== 'undefined') {
              window.__XRAY_REACT_IMPORT_MAP__ = data.imports;
              console.debug('Xray-react: Stored import map in global variable:', Object.keys(data.imports).length, 'files');
            }
          }
        }
      });

      this.client.on('project-files', (data) => {
        if (data && data.files) {
          if (typeof window !== 'undefined' && window.xrayReactSetProjectFiles) {
            window.xrayReactSetProjectFiles(data.files);
            console.debug('Xray-react: Received project files list from server:', data.files.length, 'files');
          } else {
            if (typeof window !== 'undefined') {
              window.__XRAY_REACT_PROJECT_FILES__ = data.files;
              console.debug('Xray-react: Stored project files list in global variable:', data.files.length, 'files');
            }
          }
        }
      });

      return true;
    } catch (error) {
      console.error('Xray-react: Failed to initialize Socket.IO', error);
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
