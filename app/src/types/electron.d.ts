interface OAuthConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  usePKCE?: boolean;
  clientSecret?: string;
  codeVerifier?: string;
}

interface OAuthResult {
  success: boolean;
  data?: {
    code?: string;
    token?: string;
    verifier?: string;
    access_token?: string;
    refresh_token?: string;
  };
  error?: string;
}

interface ElectronAPI {
  platform: NodeJS.Platform;
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
  send: (channel: string, data?: unknown) => void;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  once: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeAllListeners: (channel: string) => void;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  openExternal: (url: string) => Promise<void>;
  showItemInFolder: (path: string) => void;
  selectFile: () => Promise<{ filePath: string; content: string } | null>;
  saveFile: (content: string, defaultPath?: string) => Promise<boolean>;
  getAppVersion: () => Promise<string>;
  getAppPath: (name: string) => Promise<string>;
  generatePDF: (htmlContent: string, fileName: string) => Promise<boolean>;
  oauth: {
    authenticate: (provider: string, config: OAuthConfig) => Promise<OAuthResult>;
    exchangeToken: (provider: string, code: string, config: OAuthConfig) => Promise<OAuthResult>;
    authenticateViaSystemBrowser: (provider: string, config: OAuthConfig) => Promise<OAuthResult>;
    revokeToken: (provider: string, token: string, config?: Partial<OAuthConfig>) => Promise<OAuthResult>;
    onCallback: (callback: (data: unknown) => void) => void;
    removeCallbackListener: () => void;
    openUrl: (url: string, redirectMatch: string) => Promise<OAuthResult>;
  };
  credentials: {
    store: (key: string, value: string) => Promise<OAuthResult>;
    retrieve: (key: string) => Promise<OAuthResult>;
    delete: (key: string) => Promise<OAuthResult>;
    clear: () => Promise<OAuthResult>;
  };
  notifications: {
    onNotification: (callback: (notification: unknown) => void) => void;
    removeNotificationListener: () => void;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
