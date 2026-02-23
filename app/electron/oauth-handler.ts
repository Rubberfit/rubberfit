import { BrowserWindow, shell, net, session } from 'electron';
import * as isDev from 'electron-is-dev';
import * as crypto from 'crypto';

/**
 * OAuth Configuration for different providers
 */
export interface OAuthProvider {
  name: string;
  authUrl: string;
  tokenUrl?: string;
  scopes: string[];
  clientId: string;
  redirectUri: string;
  responseType: 'code' | 'token';
  // URL patterns that should be allowed during OAuth flow
  allowedUrls: string[];
}

/**
 * OAuth providers configuration
 * In production, these should come from environment variables
 */
export const OAUTH_PROVIDERS: Record<string, Partial<OAuthProvider>> = {
  google: {
    name: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    responseType: 'code',
    allowedUrls: [
      'https://accounts.google.com',
      'https://*.google.com',
      'https://*.googleapis.com',
      'https://*.googleusercontent.com',
      'https://lh3.googleusercontent.com'
    ]
  },
  github: {
    name: 'GitHub',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    responseType: 'code',
    allowedUrls: [
      'https://github.com',
      'https://*.github.com',
      'https://api.github.com'
    ]
  },
  microsoft: {
    name: 'Microsoft',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    responseType: 'code',
    allowedUrls: [
      'https://login.microsoftonline.com',
      'https://login.live.com',
      'https://*.microsoft.com',
      'https://*.windows.net'
    ]
  },
  apple: {
    name: 'Apple',
    authUrl: 'https://appleid.apple.com/auth/authorize',
    tokenUrl: 'https://appleid.apple.com/auth/token',
    responseType: 'code',
    allowedUrls: [
      'https://appleid.apple.com',
      'https://*.apple.com',
      'https://*.icloud.com'
    ]
  },
  facebook: {
    name: 'Facebook',
    authUrl: 'https://www.facebook.com/v12.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v12.0/oauth/access_token',
    responseType: 'code',
    allowedUrls: [
      'https://www.facebook.com',
      'https://*.facebook.com',
      'https://graph.facebook.com'
    ]
  },
  twitter: {
    name: 'Twitter',
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    responseType: 'code',
    allowedUrls: [
      'https://twitter.com',
      'https://*.twitter.com',
      'https://api.twitter.com'
    ]
  }
};

/**
 * OAuth handler class for managing OAuth flows in Electron
 */
export class OAuthHandler {
  private authWindow: BrowserWindow | null = null;
  private parentWindow: BrowserWindow;
  private currentProvider: string | null = null;
  private verifier: string | null = null;
  private state: string | null = null;

  /** Returns the current CSRF state token. */
  public getState(): string | null {
    return this.state;
  }

  /** Returns the current PKCE verifier. */
  public getVerifier(): string | null {
    return this.verifier;
  }

  constructor(parentWindow: BrowserWindow) {
    this.parentWindow = parentWindow;
  }

  /**
   * Generate PKCE challenge for OAuth 2.0
   */
  private generatePKCE(): { verifier: string; challenge: string; challengeMethod: string } {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');

    return {
      verifier,
      challenge,
      challengeMethod: 'S256'
    };
  }

  /**
   * Generate random state for CSRF protection
   */
  private generateState(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Check if URL matches allowed patterns
   */
  private isUrlAllowed(url: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      // Convert wildcard patterns to regex
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');

      const regex = new RegExp(`^${regexPattern}`);
      if (regex.test(url)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Create OAuth window with security settings
   */
  private createAuthWindow(): BrowserWindow {
    const authWindow = new BrowserWindow({
      width: 600,
      height: 800,
      parent: this.parentWindow,
      modal: true,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false
      }
    });

    // Clear session data before starting OAuth
    authWindow.webContents.session.clearStorageData({
      storages: ['cookies', 'localstorage']
    });

    // Show window when ready
    authWindow.once('ready-to-show', () => {
      authWindow.show();
    });

    return authWindow;
  }

  /**
   * Handle OAuth flow with popup window
   */
  public async authenticate(
    provider: string,
    config: {
      clientId: string;
      redirectUri: string;
      scopes: string[];
      usePKCE?: boolean;
    }
  ): Promise<{ code?: string; token?: string; error?: string }> {
    return new Promise((resolve, reject) => {
      try {
        const providerConfig = OAUTH_PROVIDERS[provider.toLowerCase()];
        if (!providerConfig) {
          throw new Error(`Unknown OAuth provider: ${provider}`);
        }

        this.currentProvider = provider;
        this.state = this.generateState();

        // Build authorization URL
        const authUrl = new URL(providerConfig.authUrl!);
        authUrl.searchParams.set('client_id', config.clientId);
        authUrl.searchParams.set('redirect_uri', config.redirectUri);
        authUrl.searchParams.set('response_type', providerConfig.responseType || 'code');
        authUrl.searchParams.set('scope', config.scopes.join(' '));
        authUrl.searchParams.set('state', this.state);

        // Add PKCE if supported
        if (config.usePKCE && providerConfig.responseType === 'code') {
          const pkce = this.generatePKCE();
          this.verifier = pkce.verifier;
          authUrl.searchParams.set('code_challenge', pkce.challenge);
          authUrl.searchParams.set('code_challenge_method', pkce.challengeMethod);
        }

        // Create auth window
        this.authWindow = this.createAuthWindow();

        // Handle navigation
        this.authWindow.webContents.on('will-navigate', (event, navigationUrl) => {
          const isAllowed = this.isUrlAllowed(navigationUrl, [
            config.redirectUri,
            ...providerConfig.allowedUrls!
          ]);

          if (!isAllowed) {
            console.warn(`Blocked navigation to: ${navigationUrl}`);
            event.preventDefault();
          }
        });

        // Handle redirect
        this.authWindow.webContents.on('will-redirect', (event, url) => {
          this.handleRedirect(url, config.redirectUri, resolve, reject);
        });

        // Also check navigation for redirects that don't trigger will-redirect
        this.authWindow.webContents.on('did-navigate', (event, url) => {
          this.handleRedirect(url, config.redirectUri, resolve, reject);
        });

        // Handle window closed
        this.authWindow.on('closed', () => {
          this.authWindow = null;
          reject(new Error('Authentication window was closed'));
        });

        // Load authorization URL
        this.authWindow.loadURL(authUrl.toString());

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle OAuth redirect
   */
  private handleRedirect(
    url: string,
    redirectUri: string,
    resolve: (value: any) => void,
    reject: (reason?: any) => void
  ) {
    if (!url.startsWith(redirectUri)) {
      return;
    }

    const parsedUrl = new URL(url);

    // Check for error
    const error = parsedUrl.searchParams.get('error');
    if (error) {
      const errorDescription = parsedUrl.searchParams.get('error_description');
      this.closeAuthWindow();
      reject(new Error(`OAuth error: ${error} - ${errorDescription}`));
      return;
    }

    // Verify state
    const state = parsedUrl.searchParams.get('state');
    if (state !== this.state) {
      this.closeAuthWindow();
      reject(new Error('State mismatch - possible CSRF attack'));
      return;
    }

    // Extract code or token
    const code = parsedUrl.searchParams.get('code');
    const token = parsedUrl.searchParams.get('access_token') ||
                  parsedUrl.hash.match(/access_token=([^&]+)/)?.[1];

    if (code || token) {
      this.closeAuthWindow();
      resolve({
        code,
        token,
        verifier: this.verifier
      });
    }
  }

  /**
   * Close auth window
   */
  private closeAuthWindow() {
    if (this.authWindow && !this.authWindow.isDestroyed()) {
      this.authWindow.close();
      this.authWindow = null;
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  public async exchangeCodeForToken(
    provider: string,
    code: string,
    config: {
      clientId: string;
      clientSecret?: string;
      redirectUri: string;
      codeVerifier?: string;
    }
  ): Promise<any> {
    const providerConfig = OAUTH_PROVIDERS[provider.toLowerCase()];
    if (!providerConfig || !providerConfig.tokenUrl) {
      throw new Error(`Token exchange not supported for provider: ${provider}`);
    }

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      redirect_uri: config.redirectUri
    });

    if (config.clientSecret) {
      params.set('client_secret', config.clientSecret);
    }

    if (config.codeVerifier) {
      params.set('code_verifier', config.codeVerifier);
    }

    const request = net.request({
      method: 'POST',
      url: providerConfig.tokenUrl,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    });

    return new Promise((resolve, reject) => {
      let responseData = '';

      request.on('response', (response) => {
        response.on('data', (chunk) => {
          responseData += chunk.toString();
        });

        response.on('end', () => {
          try {
            const data = JSON.parse(responseData);
            if (data.error) {
              reject(new Error(`Token exchange failed: ${data.error_description || data.error}`));
            } else {
              resolve(data);
            }
          } catch (error) {
            reject(new Error(`Failed to parse token response: ${error}`));
          }
        });

        response.on('error', reject);
      });

      request.on('error', reject);
      request.write(params.toString());
      request.end();
    });
  }

  /**
   * Handle OAuth via system browser (deep linking)
   */
  public async authenticateViaSystemBrowser(
    provider: string,
    config: {
      clientId: string;
      redirectUri: string;
      scopes: string[];
      usePKCE?: boolean;
    }
  ): Promise<void> {
    const providerConfig = OAUTH_PROVIDERS[provider.toLowerCase()];
    if (!providerConfig) {
      throw new Error(`Unknown OAuth provider: ${provider}`);
    }

    this.state = this.generateState();

    // Build authorization URL
    const authUrl = new URL(providerConfig.authUrl!);
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('response_type', providerConfig.responseType || 'code');
    authUrl.searchParams.set('scope', config.scopes.join(' '));
    authUrl.searchParams.set('state', this.state);

    // Add PKCE if supported
    if (config.usePKCE && providerConfig.responseType === 'code') {
      const pkce = this.generatePKCE();
      this.verifier = pkce.verifier;
      authUrl.searchParams.set('code_challenge', pkce.challenge);
      authUrl.searchParams.set('code_challenge_method', pkce.challengeMethod);

    }

    // Open in system browser
    await shell.openExternal(authUrl.toString());
  }

  /**
   * Revoke OAuth tokens
   */
  public async revokeToken(
    provider: string,
    token: string,
    config?: {
      clientId?: string;
      clientSecret?: string;
    }
  ): Promise<void> {
    // Provider-specific revocation endpoints
    const revokeUrls: Record<string, string> = {
      google: 'https://oauth2.googleapis.com/revoke',
      github: 'https://api.github.com/applications/{client_id}/token',
      microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/logout'
    };

    const revokeUrl = revokeUrls[provider.toLowerCase()];
    if (!revokeUrl) {
      throw new Error(`Token revocation not supported for provider: ${provider}`);
    }

    // Implementation depends on provider
    // This is a simplified example
    const request = net.request({
      method: 'POST',
      url: revokeUrl.replace('{client_id}', config?.clientId || ''),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    return new Promise((resolve, reject) => {
      request.on('response', (response) => {
        if (response.statusCode === 200 || response.statusCode === 204) {
          resolve();
        } else {
          reject(new Error(`Failed to revoke token: ${response.statusCode}`));
        }
      });

      request.on('error', reject);
      request.write(`token=${token}`);
      request.end();
    });
  }
}