import { app, BrowserWindow, Menu, shell, dialog, nativeTheme, protocol, session } from 'electron';
import * as path from 'path';
import * as isDev from 'electron-is-dev';
import { spawn, ChildProcess } from 'child_process';
import waitOn from 'wait-on';
import { registerIpcHandlers } from './ipc-handlers';
import { OAuthHandler } from './oauth-handler';

let mainWindow: BrowserWindow | null = null;
let nextServerProcess: ChildProcess | null = null;
let oauthHandler: OAuthHandler | null = null;

// Enable sandboxing for all renderers
app.enableSandbox();

// Configuration for OAuth and external URLs
const OAUTH_CONFIG = {
  // Supabase OAuth configuration
  supabase: {
    urls: [
      'https://*.supabase.co',
      'wss://*.supabase.co',
      'https://*.supabase.in'
    ]
  },
  // OAuth provider URLs that should be allowed
  providers: {
    google: [
      'https://accounts.google.com',
      'https://*.google.com',
      'https://*.googleapis.com',
      'https://*.googleusercontent.com',
      'https://lh3.googleusercontent.com',
      'https://*.gstatic.com'
    ],
    github: [
      'https://github.com',
      'https://*.github.com',
      'https://api.github.com'
    ],
    microsoft: [
      'https://login.microsoftonline.com',
      'https://login.live.com',
      'https://*.microsoft.com',
      'https://*.windows.net'
    ],
    apple: [
      'https://appleid.apple.com',
      'https://*.apple.com',
      'https://*.icloud.com'
    ],
    facebook: [
      'https://www.facebook.com',
      'https://*.facebook.com',
      'https://graph.facebook.com'
    ],
    twitter: [
      'https://twitter.com',
      'https://*.twitter.com',
      'https://api.twitter.com'
    ]
  },
  // Local development URLs
  local: [
    'http://localhost:3000',
    'http://localhost:3001',
    'ws://localhost:3000',
    'ws://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001'
  ]
};

/**
 * Check if a URL matches any of the allowed patterns
 */
function isUrlAllowed(url: string, patterns: string[]): boolean {
  try {
    const parsedUrl = new URL(url);

    // Always allow file:// protocol
    if (parsedUrl.protocol === 'file:') {
      return true;
    }

    // Check against patterns
    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        // Wildcard pattern: escape regex special chars, then convert * to [^/]*
        const regexPattern = pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '[^/]*');
        // No $ anchor — allow URLs with paths after the domain
        if (new RegExp(`^${regexPattern}`).test(url)) {
          return true;
        }
      } else {
        // Exact prefix match
        if (url.startsWith(pattern)) {
          return true;
        }
      }
    }
  } catch (error) {
    console.error('Failed to parse URL:', url, error);
  }

  return false;
}

/**
 * Get all allowed URLs for navigation
 */
function getAllowedUrls(): string[] {
  const urls: string[] = [
    ...OAUTH_CONFIG.local,
    ...OAUTH_CONFIG.supabase.urls
  ];

  // Add all OAuth provider URLs
  Object.values(OAUTH_CONFIG.providers).forEach(providerUrls => {
    urls.push(...providerUrls);
  });

  return urls;
}

/**
 * Setup security policies and request interceptors
 */
function setupSecurity() {
  // Prevent new window creation except for OAuth
  app.on('web-contents-created', (event, contents) => {
    // Handle window open requests
    contents.setWindowOpenHandler(({ url, frameName, features }) => {
      // Check if this is an OAuth popup request
      if (frameName === 'oauth-popup' || features.includes('oauth')) {
        // Allow OAuth popups to be created
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 600,
            height: 800,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true
            }
          }
        };
      }

      // Open other URLs in external browser
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // Security: Disable webview tag
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });

    // Only apply navigation restrictions to the main window (default session).
    // OAuth popup windows use their own session partition ('persist:oauth')
    // and handle navigation/security independently — don't interfere with them.
    if (contents.session !== session.defaultSession) return;

    // Security: Handle navigation
    contents.on('will-navigate', (event, navigationUrl) => {
      handleNavigation(event, navigationUrl, 'will-navigate');
    });

    // Handle redirects (important for OAuth flows)
    contents.on('will-redirect', (event, navigationUrl) => {
      handleNavigation(event, navigationUrl, 'will-redirect');
    });

    // Handle frame navigation (for iframes)
    contents.on('will-frame-navigate', (event) => {
      const url = event.url;
      handleNavigation(event, url, 'will-frame-navigate');
    });
  });
}

/**
 * Handle navigation events with OAuth awareness
 */
function handleNavigation(event: any, url: string, eventType: string) {
  const allowedUrls = getAllowedUrls();
  const isAllowed = isUrlAllowed(url, allowedUrls);

  if (!isAllowed) {
    console.warn(`[${eventType}] Blocked navigation to:`, url);
    event.preventDefault();

    // If it's an OAuth URL we don't recognize, log it for debugging
    if (url.includes('oauth') || url.includes('auth') || url.includes('login')) {
      console.error('Potential OAuth URL blocked. Consider adding to whitelist:', url);

      // Show developer warning in dev mode
      if (isDev && mainWindow) {
        mainWindow.webContents.executeJavaScript(
          `console.warn('OAuth navigation blocked:', ${JSON.stringify(url)})`
        );
      }
    }
  } else {
    console.log(`[${eventType}] Allowed navigation to:`, url);
  }
}

/**
 * Setup Content Security Policy with OAuth support
 */
function setupCSP(mainWindow: BrowserWindow) {
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    // Build CSP based on environment
    let csp: string;

    if (isDev) {
      // Development CSP - more permissive
      csp = [
        "default-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https: blob:",
        "font-src 'self' data:",
        "connect-src 'self' " + [
          ...OAUTH_CONFIG.local,
          ...OAUTH_CONFIG.supabase.urls,
          ...Object.values(OAUTH_CONFIG.providers).flat()
        ].join(' '),
        "frame-src 'self' " + [
          ...OAUTH_CONFIG.supabase.urls,
          'https://accounts.google.com',
          'https://github.com'
        ].join(' '),
        "media-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self' https://accounts.google.com https://github.com",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests"
      ].join('; ');
    } else {
      // Production CSP - stricter
      csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'", // unsafe-inline needed for Next.js
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https: blob:",
        "font-src 'self' data:",
        "connect-src 'self' " + [
          ...OAUTH_CONFIG.supabase.urls,
          ...Object.values(OAUTH_CONFIG.providers).flat()
        ].join(' '),
        "frame-src 'self' " + [
          ...OAUTH_CONFIG.supabase.urls,
          'https://accounts.google.com'
        ].join(' '),
        "media-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self' https://accounts.google.com",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests"
      ].join('; ');
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
        'X-XSS-Protection': ['1; mode=block'],
        'Referrer-Policy': ['strict-origin-when-cross-origin'],
        'Permissions-Policy': [
          'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
        ]
      }
    });
  });
}

/**
 * Register protocol for deep linking OAuth callbacks
 */
function registerProtocol() {
  // Register custom protocol for OAuth callbacks
  protocol.registerHttpProtocol('rubberfitpro', (request, callback) => {
    const url = request.url.replace('rubberfitpro://', 'http://localhost:3000/');

    // Handle OAuth callback
    if (url.includes('auth/callback')) {
      // Parse OAuth response
      const parsedUrl = new URL(url);
      const code = parsedUrl.searchParams.get('code');
      const state = parsedUrl.searchParams.get('state');
      const error = parsedUrl.searchParams.get('error');

      // Send to renderer process
      if (mainWindow) {
        mainWindow.webContents.send('oauth-callback', {
          code,
          state,
          error,
          error_description: parsedUrl.searchParams.get('error_description')
        });
      }
    }

    callback({ url });
  });
}

// Create native menu
function createMenu() {
  const template: any[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow?.webContents.send('menu-action', 'new');
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { label: 'Toggle Developer Tools', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Toggle Fullscreen', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: 'Close', accelerator: 'CmdOrCtrl+W', role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About RubberFit Pro',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About RubberFit Pro',
              message: 'RubberFit Pro',
              detail: 'Material optimization and inventory management system for USI Manufacturing.\n\nVersion: 1.0.0-beta.1\nElectron: ' + process.versions.electron + '\nNode: ' + process.versions.node,
              buttons: ['OK']
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Learn More',
          click: async () => {
            await shell.openExternal('https://github.com');
          }
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        {
          label: 'About ' + app.getName(),
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About RubberFit Pro',
              message: 'RubberFit Pro',
              detail: 'Material optimization and inventory management system.\n\nVersion: 1.0.0-beta.1',
              buttons: ['OK']
            });
          }
        },
        { type: 'separator' },
        { label: 'Services', submenu: [] },
        { type: 'separator' },
        { label: 'Hide ' + app.getName(), accelerator: 'Command+H', role: 'hide' },
        { label: 'Hide Others', accelerator: 'Command+Shift+H', role: 'hideOthers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'Command+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function createWindow() {
  // Create the browser window with security-first configuration
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'RubberFit Pro',
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webgl: true,
      images: true
    },
    show: false,
    backgroundColor: '#FFFFFF',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: false
  });

  // Setup CSP
  setupCSP(mainWindow);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();

    // Open DevTools in development
    if (isDev) {
      mainWindow?.webContents.openDevTools();
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
    oauthHandler = null;
  });

  // OAuth handler for deep-link protocol callbacks (separate from IPC handler's instance)
  oauthHandler = new OAuthHandler(mainWindow);

  // Register IPC handlers
  registerIpcHandlers(mainWindow);

  // Load the app
  if (isDev) {
    // In development, connect to the Next.js dev server
    await mainWindow.loadURL('http://localhost:3000');
  } else {
    // In production, serve the built Next.js app
    await mainWindow.loadURL('http://localhost:3000');
  }
}

async function startNextServer() {
  if (isDev) {
    console.log('Starting Next.js development server...');

    // Start Next.js dev server
    nextServerProcess = spawn('npm', ['run', 'dev'], {
      shell: true,
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, BROWSER: 'none' },
      stdio: 'inherit'
    });

    // Wait for Next.js server to be ready
    await waitOn({
      resources: ['http://localhost:3000'],
      delay: 1000,
      interval: 100,
      timeout: 30000,
      tcpTimeout: 1000,
      window: 1000,
      validateStatus: (status: number) => status >= 200 && status < 400
    });

    console.log('Next.js development server is ready');
  } else {
    console.log('Starting Next.js production server...');

    // Build Next.js app if not already built
    const { execSync } = require('child_process');

    try {
      console.log('Building Next.js application...');
      execSync('npm run build', {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit'
      });
    } catch (error) {
      console.error('Failed to build Next.js app:', error);
      app.quit();
      return;
    }

    // Start Next.js production server
    nextServerProcess = spawn('npm', ['run', 'start'], {
      shell: true,
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, BROWSER: 'none' },
      stdio: 'inherit'
    });

    // Wait for production server to be ready
    await waitOn({
      resources: ['http://localhost:3000'],
      delay: 1000,
      interval: 100,
      timeout: 30000,
      tcpTimeout: 1000,
      window: 1000,
      validateStatus: (status: number) => status >= 200 && status < 400
    });

    console.log('Next.js production server is ready');
  }
}

// App event handlers
app.whenReady().then(async () => {
  // Setup security policies
  setupSecurity();

  // Register protocol for deep linking
  registerProtocol();

  // Set app user model id for Windows
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.usimanufacturing.rubberfitpro');
  }

  // Start Next.js server first
  await startNextServer();

  // Create menu
  createMenu();

  // Create window
  await createWindow();

  // Handle app activation (macOS)
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS, keep the app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up before quitting
app.on('before-quit', () => {
  // Kill Next.js server process
  if (nextServerProcess) {
    console.log('Stopping Next.js server...');
    nextServerProcess.kill();
    nextServerProcess = null;
  }
});

// Handle protocol for deep linking
app.setAsDefaultProtocolClient('rubberfitpro');

// Handle OAuth protocol callbacks
app.on('open-url', (event, url) => {
  event.preventDefault();

  // Parse OAuth callback
  if (url.startsWith('rubberfitpro://auth/callback')) {
    const parsedUrl = new URL(url);
    const code = parsedUrl.searchParams.get('code');
    const state = parsedUrl.searchParams.get('state');

    // Verify state matches against the OAuthHandler instance
    if (oauthHandler && state === oauthHandler.getState()) {
      // Send to renderer
      if (mainWindow) {
        mainWindow.webContents.send('oauth-callback', {
          code,
          state,
          verifier: oauthHandler.getVerifier()
        });
      }
    }
  }
});

// Handle certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  // In development, ignore certificate errors for localhost
  if (isDev && url.startsWith('https://localhost')) {
    event.preventDefault();
    callback(true);
  } else {
    // In production, use default behavior (reject invalid certificates)
    callback(false);
  }
});

// Export OAuth handler for use in IPC handlers
export { oauthHandler };