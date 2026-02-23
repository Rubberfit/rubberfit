import { ipcMain, dialog, shell, app, BrowserWindow, safeStorage, session } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { OAuthHandler } from './oauth-handler';

// Store for OAuth handlers per window
const oauthHandlers = new Map<number, OAuthHandler>();

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  // Initialize OAuth handler for this window
  const oauthHandler = new OAuthHandler(mainWindow);
  oauthHandlers.set(mainWindow.id, oauthHandler);

  // Window controls
  ipcMain.on('window-minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.restore();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    mainWindow.close();
  });

  ipcMain.handle('window-is-maximized', () => {
    return mainWindow.isMaximized();
  });

  // External links
  ipcMain.handle('open-external', async (event, url: string) => {
    // Validate URL before opening
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        await shell.openExternal(url);
      } else {
        throw new Error('Invalid URL protocol');
      }
    } catch (error) {
      console.error('Failed to open external URL:', error);
      throw error;
    }
  });

  // PDF generation functionality
  ipcMain.handle('generate-pdf', async (event, htmlContent: string, fileName: string) => {
    try {
      // Create a hidden window for PDF generation
      const pdfWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      // Load the HTML content
      await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

      // Generate PDF
      const pdfData = await pdfWindow.webContents.printToPDF({
        printBackground: true,
        landscape: false,
        margins: {
          marginType: 'default'
        },
        pageSize: 'Letter'
      });

      // Close the window
      pdfWindow.close();

      // Save the PDF
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        defaultPath: fileName,
        filters: [
          { name: 'PDF Files', extensions: ['pdf'] }
        ]
      });

      if (filePath) {
        await fs.writeFile(filePath, pdfData);
        // Show the file in folder after saving
        shell.showItemInFolder(filePath);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      return false;
    }
  });

  ipcMain.on('show-item-in-folder', (event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  // File operations
  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'Text Files', extensions: ['txt'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    try {
      const filePath = result.filePaths[0];
      const content = await fs.readFile(filePath, 'utf-8');
      return { filePath, content };
    } catch (error) {
      console.error('Failed to read file:', error);
      return null;
    }
  });

  ipcMain.handle('save-file', async (event, content: string, defaultPath?: string) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultPath || 'untitled.txt',
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'Text Files', extensions: ['txt'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return false;
    }

    try {
      await fs.writeFile(result.filePath, content, 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save file:', error);
      return false;
    }
  });

  // App information
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('get-app-path', (event, name: string) => {
    const validNames = ['home', 'appData', 'userData', 'temp', 'desktop', 'documents', 'downloads', 'pictures'];

    if (validNames.includes(name)) {
      return app.getPath(name as any);
    } else {
      throw new Error(`Invalid path name: ${name}`);
    }
  });

  // OAuth handlers
  ipcMain.handle('oauth-authenticate', async (event, provider: string, config: any) => {
    try {
      const windowId = BrowserWindow.fromWebContents(event.sender)?.id;
      if (!windowId) {
        throw new Error('Window not found');
      }

      const handler = oauthHandlers.get(windowId);
      if (!handler) {
        throw new Error('OAuth handler not initialized');
      }

      const result = await handler.authenticate(provider, config);
      return { success: true, data: result };
    } catch (error: any) {
      console.error('OAuth authentication failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('oauth-exchange-token', async (event, provider: string, code: string, config: any) => {
    try {
      const windowId = BrowserWindow.fromWebContents(event.sender)?.id;
      if (!windowId) {
        throw new Error('Window not found');
      }

      const handler = oauthHandlers.get(windowId);
      if (!handler) {
        throw new Error('OAuth handler not initialized');
      }

      const result = await handler.exchangeCodeForToken(provider, code, config);
      return { success: true, data: result };
    } catch (error: any) {
      console.error('Token exchange failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('oauth-authenticate-browser', async (event, provider: string, config: any) => {
    try {
      const windowId = BrowserWindow.fromWebContents(event.sender)?.id;
      if (!windowId) {
        throw new Error('Window not found');
      }

      const handler = oauthHandlers.get(windowId);
      if (!handler) {
        throw new Error('OAuth handler not initialized');
      }

      await handler.authenticateViaSystemBrowser(provider, config);
      return { success: true };
    } catch (error: any) {
      console.error('OAuth browser authentication failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('oauth-revoke-token', async (event, provider: string, token: string, config?: any) => {
    try {
      const windowId = BrowserWindow.fromWebContents(event.sender)?.id;
      if (!windowId) {
        throw new Error('Window not found');
      }

      const handler = oauthHandlers.get(windowId);
      if (!handler) {
        throw new Error('OAuth handler not initialized');
      }

      await handler.revokeToken(provider, token, config);
      return { success: true };
    } catch (error: any) {
      console.error('Token revocation failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Secure credential storage
  ipcMain.handle('store-credential', async (event, key: string, value: string) => {
    try {
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
        throw new Error('Invalid credential key');
      }
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption not available');
      }

      const encrypted = safeStorage.encryptString(value);
      const credPath = path.join(app.getPath('userData'), 'credentials');

      // Ensure directory exists
      await fs.mkdir(credPath, { recursive: true });

      // Store encrypted credential
      await fs.writeFile(
        path.join(credPath, `${key}.enc`),
        encrypted
      );

      return { success: true };
    } catch (error: any) {
      console.error('Failed to store credential:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('retrieve-credential', async (event, key: string) => {
    try {
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
        throw new Error('Invalid credential key');
      }
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption not available');
      }

      const credPath = path.join(app.getPath('userData'), 'credentials', `${key}.enc`);

      // Check if credential exists
      try {
        await fs.access(credPath);
      } catch {
        return { success: false, error: 'Credential not found' };
      }

      // Read and decrypt
      const encrypted = await fs.readFile(credPath);
      const decrypted = safeStorage.decryptString(encrypted);

      return { success: true, data: decrypted };
    } catch (error: any) {
      console.error('Failed to retrieve credential:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('delete-credential', async (event, key: string) => {
    try {
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
        throw new Error('Invalid credential key');
      }
      const credPath = path.join(app.getPath('userData'), 'credentials', `${key}.enc`);

      // Delete credential file
      await fs.unlink(credPath);

      return { success: true };
    } catch (error: any) {
      console.error('Failed to delete credential:', error);
      return { success: false, error: error.message };
    }
  });

  // Clear all stored credentials
  ipcMain.handle('clear-credentials', async () => {
    try {
      const credPath = path.join(app.getPath('userData'), 'credentials');

      // Remove entire credentials directory
      await fs.rm(credPath, { recursive: true, force: true });

      return { success: true };
    } catch (error: any) {
      console.error('Failed to clear credentials:', error);
      return { success: false, error: error.message };
    }
  });

  // Listen for window state changes
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized', false);
  });

  // Clean up OAuth handler when window closes
  mainWindow.on('closed', () => {
    oauthHandlers.delete(mainWindow.id);
  });

  // Open an arbitrary OAuth URL in a popup and intercept the redirect.
  // Used for Supabase OAuth where the URL is pre-built by the Supabase client.
  ipcMain.handle('oauth-open-url', async (event, url: string, redirectMatch: string) => {
    return new Promise((resolve) => {
      // Use a dedicated session partition for the OAuth popup so we can
      // strip Google's Cross-Origin-* headers without affecting the main app.
      const oauthPartition = 'persist:oauth';
      const oauthSession = session.fromPartition(oauthPartition);

      // Google's consent subframes (e.g. _/bscframe) set strict CORP/COEP/COOP
      // headers that cause ERR_BLOCKED_BY_RESPONSE in sandboxed Electron windows.
      // Strip them so the consent flow can complete.
      oauthSession.webRequest.onHeadersReceived((details, callback) => {
        const headers = { ...details.responseHeaders };
        delete headers['cross-origin-opener-policy'];
        delete headers['Cross-Origin-Opener-Policy'];
        delete headers['cross-origin-embedder-policy'];
        delete headers['Cross-Origin-Embedder-Policy'];
        delete headers['cross-origin-resource-policy'];
        delete headers['Cross-Origin-Resource-Policy'];
        callback({ responseHeaders: headers });
      });

      const authWindow = new BrowserWindow({
        width: 600,
        height: 800,
        parent: mainWindow,
        modal: false,
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          partition: oauthPartition,
        },
      });

      authWindow.once('ready-to-show', () => authWindow.show());

      let resolved = false;

      const finish = (result: { success: boolean; data?: { access_token: string; refresh_token: string }; error?: string }) => {
        if (resolved) return;
        resolved = true;
        if (!authWindow.isDestroyed()) authWindow.close();
        resolve(result);
      };

      const tryExtractTokens = (_source: string, navUrl: string) => {
        if (resolved) return;
        if (!navUrl.startsWith(redirectMatch)) return;

        // Tokens may be in the hash fragment (#access_token=...) or query string
        const hashStr = navUrl.includes('#') ? navUrl.split('#')[1] : '';
        const queryStr = navUrl.includes('?') ? navUrl.split('?')[1]?.split('#')[0] : '';
        const params = new URLSearchParams(hashStr || queryStr);

        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (access_token && refresh_token) {
          finish({ success: true, data: { access_token, refresh_token } });
        }
        // If no tokens found, don't resolve yet — hash fragment may arrive
        // via did-finish-load or did-navigate-in-page
      };

      // HTTP redirects (302/303)
      authWindow.webContents.on('will-redirect', (_event, navUrl) => tryExtractTokens('will-redirect', navUrl));
      // Full page navigations
      authWindow.webContents.on('did-navigate', (_event, navUrl) => tryExtractTokens('did-navigate', navUrl));
      // Hash-only navigations (e.g. window.location.hash = ...)
      authWindow.webContents.on('did-navigate-in-page', (_event, navUrl) => tryExtractTokens('did-navigate-in-page', navUrl));

      // After a page finishes loading, getURL() includes the hash fragment
      // that will-redirect/did-navigate may have stripped
      authWindow.webContents.on('did-finish-load', () => {
        if (resolved) return;
        const currentUrl = authWindow.webContents.getURL();
        tryExtractTokens('did-finish-load', currentUrl);
      });

      authWindow.on('closed', () => {
        if (!resolved) {
          resolved = true;
          resolve({ success: false, error: 'Authentication window was closed' });
        }
      });

      // Safety timeout — don't hang forever
      setTimeout(() => {
        finish({ success: false, error: 'Authentication timed out' });
      }, 120_000);

      authWindow.loadURL(url);
    });
  });

  // Handle OAuth error reporting
  ipcMain.on('oauth-error', (event, error: any) => {
    console.error('OAuth error reported from renderer:', error);

    // Show error dialog to user
    dialog.showErrorBox(
      'Authentication Error',
      `Failed to authenticate: ${error.message || 'Unknown error'}`
    );
  });

  // Handle OAuth success
  ipcMain.on('oauth-success', (event, data: any) => {
    console.log('OAuth success:', data.provider);

    // Optionally show success notification
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('show-notification', {
        title: 'Authentication Successful',
        body: `Successfully signed in with ${data.provider}`,
        type: 'success'
      });
    }
  });
}