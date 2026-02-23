import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// OAuth configuration interface
interface OAuthConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  usePKCE?: boolean;
  clientSecret?: string;
  codeVerifier?: string;
}

// OAuth result interface
interface OAuthResult {
  success: boolean;
  data?: any;
  error?: string;
}

// Define the API that will be exposed to the renderer process
interface ElectronAPI {
  platform: NodeJS.Platform;
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
  // IPC communication methods
  send: (channel: string, data?: any) => void;
  on: (channel: string, callback: (event: IpcRendererEvent, ...args: any[]) => void) => void;
  once: (channel: string, callback: (event: IpcRendererEvent, ...args: any[]) => void) => void;
  removeListener: (channel: string, callback: (...args: any[]) => void) => void;
  removeAllListeners: (channel: string) => void;
  // Application specific methods
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  openExternal: (url: string) => Promise<void>;
  showItemInFolder: (path: string) => void;
  // File operations
  selectFile: () => Promise<{ filePath: string; content: string } | null>;
  saveFile: (content: string, defaultPath?: string) => Promise<boolean>;
  // Application info
  getAppVersion: () => Promise<string>;
  getAppPath: (name: 'home' | 'appData' | 'userData' | 'temp' | 'desktop' | 'documents' | 'downloads' | 'pictures') => Promise<string>;
  // PDF generation functionality
  generatePDF: (htmlContent: string, fileName: string) => Promise<boolean>;
  // OAuth methods
  oauth: {
    authenticate: (provider: string, config: OAuthConfig) => Promise<OAuthResult>;
    exchangeToken: (provider: string, code: string, config: OAuthConfig) => Promise<OAuthResult>;
    authenticateViaSystemBrowser: (provider: string, config: OAuthConfig) => Promise<OAuthResult>;
    revokeToken: (provider: string, token: string, config?: Partial<OAuthConfig>) => Promise<OAuthResult>;
    onCallback: (callback: (data: any) => void) => void;
    removeCallbackListener: () => void;
  };
  // Secure credential storage
  credentials: {
    store: (key: string, value: string) => Promise<OAuthResult>;
    retrieve: (key: string) => Promise<OAuthResult>;
    delete: (key: string) => Promise<OAuthResult>;
    clear: () => Promise<OAuthResult>;
  };
  // Notification methods
  notifications: {
    onNotification: (callback: (notification: any) => void) => void;
    removeNotificationListener: () => void;
  };
}

// Allowed channels for IPC communication
const ALLOWED_CHANNELS = {
  send: [
    'menu-action',
    'window-minimize',
    'window-maximize',
    'window-close',
    'open-external',
    'show-item-in-folder',
    'select-file',
    'save-file',
    'get-app-version',
    'get-app-path',
    'oauth-error',
    'oauth-success'
  ],
  receive: [
    'menu-action',
    'file-selected',
    'file-saved',
    'app-version',
    'app-path',
    'window-maximized',
    'oauth-callback',
    'show-notification'
  ]
};

// OAuth callback listeners
let oauthCallbackListener: ((event: IpcRendererEvent, data: any) => void) | null = null;
let notificationListener: ((event: IpcRendererEvent, notification: any) => void) | null = null;

// Expose protected methods that allow the renderer process to use
// a limited set of Electron APIs without directly exposing the entire Electron API
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform information
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  },

  // IPC communication with channel validation
  send: (channel: string, data?: any) => {
    if (ALLOWED_CHANNELS.send.includes(channel)) {
      ipcRenderer.send(channel, data);
    } else {
      console.error(`Channel '${channel}' is not allowed for sending`);
    }
  },

  on: (channel: string, callback: (event: IpcRendererEvent, ...args: any[]) => void) => {
    if (ALLOWED_CHANNELS.receive.includes(channel)) {
      ipcRenderer.on(channel, callback);
    } else {
      console.error(`Channel '${channel}' is not allowed for receiving`);
    }
  },

  once: (channel: string, callback: (event: IpcRendererEvent, ...args: any[]) => void) => {
    if (ALLOWED_CHANNELS.receive.includes(channel)) {
      ipcRenderer.once(channel, callback);
    } else {
      console.error(`Channel '${channel}' is not allowed for receiving`);
    }
  },

  removeListener: (channel: string, callback: (...args: any[]) => void) => {
    if (ALLOWED_CHANNELS.receive.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  },

  removeAllListeners: (channel: string) => {
    if (ALLOWED_CHANNELS.receive.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  },

  // Window controls
  minimize: () => {
    ipcRenderer.send('window-minimize');
  },

  maximize: () => {
    ipcRenderer.send('window-maximize');
  },

  close: () => {
    ipcRenderer.send('window-close');
  },

  isMaximized: (): Promise<boolean> => {
    return ipcRenderer.invoke('window-is-maximized');
  },

  // External links
  openExternal: (url: string): Promise<void> => {
    return ipcRenderer.invoke('open-external', url);
  },

  showItemInFolder: (path: string) => {
    ipcRenderer.send('show-item-in-folder', path);
  },

  // File operations
  selectFile: (): Promise<{ filePath: string; content: string } | null> => {
    return ipcRenderer.invoke('select-file');
  },

  saveFile: (content: string, defaultPath?: string): Promise<boolean> => {
    return ipcRenderer.invoke('save-file', content, defaultPath);
  },

  // App information
  getAppVersion: (): Promise<string> => {
    return ipcRenderer.invoke('get-app-version');
  },

  getAppPath: (name: 'home' | 'appData' | 'userData' | 'temp' | 'desktop' | 'documents' | 'downloads' | 'pictures'): Promise<string> => {
    return ipcRenderer.invoke('get-app-path', name);
  },

  // PDF generation functionality
  generatePDF: (htmlContent: string, fileName: string): Promise<boolean> => {
    return ipcRenderer.invoke('generate-pdf', htmlContent, fileName);
  },

  // OAuth methods
  oauth: {
    authenticate: async (provider: string, config: OAuthConfig): Promise<OAuthResult> => {
      try {
        const result = await ipcRenderer.invoke('oauth-authenticate', provider, config);
        return result;
      } catch (error: any) {
        console.error('OAuth authentication error:', error);
        return { success: false, error: error.message };
      }
    },

    exchangeToken: async (provider: string, code: string, config: OAuthConfig): Promise<OAuthResult> => {
      try {
        const result = await ipcRenderer.invoke('oauth-exchange-token', provider, code, config);
        return result;
      } catch (error: any) {
        console.error('Token exchange error:', error);
        return { success: false, error: error.message };
      }
    },

    authenticateViaSystemBrowser: async (provider: string, config: OAuthConfig): Promise<OAuthResult> => {
      try {
        const result = await ipcRenderer.invoke('oauth-authenticate-browser', provider, config);
        return result;
      } catch (error: any) {
        console.error('Browser authentication error:', error);
        return { success: false, error: error.message };
      }
    },

    revokeToken: async (provider: string, token: string, config?: Partial<OAuthConfig>): Promise<OAuthResult> => {
      try {
        const result = await ipcRenderer.invoke('oauth-revoke-token', provider, token, config);
        return result;
      } catch (error: any) {
        console.error('Token revocation error:', error);
        return { success: false, error: error.message };
      }
    },

    onCallback: (callback: (data: any) => void) => {
      // Remove existing listener if any
      if (oauthCallbackListener) {
        ipcRenderer.removeListener('oauth-callback', oauthCallbackListener);
      }

      oauthCallbackListener = (event: IpcRendererEvent, data: any) => {
        callback(data);
      };

      ipcRenderer.on('oauth-callback', oauthCallbackListener);
    },

    removeCallbackListener: () => {
      if (oauthCallbackListener) {
        ipcRenderer.removeListener('oauth-callback', oauthCallbackListener);
        oauthCallbackListener = null;
      }
    },

    openUrl: async (url: string, redirectMatch: string): Promise<OAuthResult> => {
      try {
        const result = await ipcRenderer.invoke('oauth-open-url', url, redirectMatch);
        return result;
      } catch (error: any) {
        console.error('OAuth openUrl error:', error);
        return { success: false, error: error.message };
      }
    }
  },

  // Secure credential storage
  credentials: {
    store: async (key: string, value: string): Promise<OAuthResult> => {
      try {
        const result = await ipcRenderer.invoke('store-credential', key, value);
        return result;
      } catch (error: any) {
        console.error('Credential storage error:', error);
        return { success: false, error: error.message };
      }
    },

    retrieve: async (key: string): Promise<OAuthResult> => {
      try {
        const result = await ipcRenderer.invoke('retrieve-credential', key);
        return result;
      } catch (error: any) {
        console.error('Credential retrieval error:', error);
        return { success: false, error: error.message };
      }
    },

    delete: async (key: string): Promise<OAuthResult> => {
      try {
        const result = await ipcRenderer.invoke('delete-credential', key);
        return result;
      } catch (error: any) {
        console.error('Credential deletion error:', error);
        return { success: false, error: error.message };
      }
    },

    clear: async (): Promise<OAuthResult> => {
      try {
        const result = await ipcRenderer.invoke('clear-credentials');
        return result;
      } catch (error: any) {
        console.error('Credential clearing error:', error);
        return { success: false, error: error.message };
      }
    }
  },

  // Notification methods
  notifications: {
    onNotification: (callback: (notification: any) => void) => {
      // Remove existing listener if any
      if (notificationListener) {
        ipcRenderer.removeListener('show-notification', notificationListener);
      }

      notificationListener = (event: IpcRendererEvent, notification: any) => {
        callback(notification);
      };

      ipcRenderer.on('show-notification', notificationListener);
    },

    removeNotificationListener: () => {
      if (notificationListener) {
        ipcRenderer.removeListener('show-notification', notificationListener);
        notificationListener = null;
      }
    }
  }
} as ElectronAPI);