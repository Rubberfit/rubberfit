"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { authService, type AuthUser } from '@/services/authService';
import { supabase } from '@/lib/supabase';
import { isElectron } from '@/lib/isElectron';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isElectron: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const electron = useMemo(() => isElectron(), []);

  useEffect(() => {
    const getInitialUser = async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
      } catch (error) {
        console.error('Error getting initial user:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    getInitialUser();

    const subscription = authService.onAuthStateChange((authUser) => {
      setUser(authUser);
      setLoading(false);
    });

    return () => {
      if (subscription && 'unsubscribe' in subscription) {
        (subscription as any).unsubscribe();
      } else if (subscription && 'subscription' in subscription) {
        (subscription as any).subscription?.unsubscribe();
      }
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setLoading(true);
    try {
      const { user: authUser, error } = await authService.signIn(email, password);

      if (error) {
        setLoading(false);
        return { success: false, error: error.message };
      }

      if (authUser) {
        setUser(authUser);
        router.push('/dashboard/default');
        return { success: true };
      }

      setLoading(false);
      return { success: false, error: 'Authentication failed' };
    } catch (error) {
      setLoading(false);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      };
    }
  };

  const signUp = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setLoading(true);
    try {
      const { user: authUser, error } = await authService.signUp(email, password);

      if (error) {
        setLoading(false);
        return { success: false, error: error.message };
      }

      if (authUser) {
        setUser(authUser);
        setLoading(false);
        return { success: true };
      }

      setLoading(false);
      return { success: false, error: 'Registration failed' };
    } catch (error) {
      setLoading(false);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      };
    }
  };

  const signOut = async (): Promise<void> => {
    setLoading(true);
    try {
      await authService.signOut();
      setUser(null);
      router.push('/auth/v2/login');
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await authService.resetPassword(email);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      };
    }
  };

  /** Google OAuth — dispatches to Electron popup or web redirect flow. */
  const signInWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      if (electron) {
        return await handleElectronOAuth();
      }
      return await handleWebOAuth();
    } catch {
      return { success: false, error: 'Failed to initiate Google sign in' };
    }
  };

  /** Web: normal redirect flow. */
  const handleWebOAuth = async (): Promise<{ success: boolean; error?: string }> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/dashboard/default`,
        scopes: "openid email profile https://www.googleapis.com/auth/userinfo.profile",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
        },
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  /**
   * Electron: get the Supabase OAuth URL without redirecting the main window,
   * then open it in an Electron popup. The popup intercepts the final redirect
   * and returns tokens so we can call supabase.auth.setSession().
   */
  const handleElectronOAuth = async (): Promise<{ success: boolean; error?: string }> => {
    const redirectTo = `${window.location.origin}/dashboard/default`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        skipBrowserRedirect: true,
        redirectTo,
        scopes: "openid email profile https://www.googleapis.com/auth/userinfo.profile",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
        },
      },
    });

    if (error || !data.url) {
      return { success: false, error: error?.message ?? "No OAuth URL returned" };
    }

    const result = await window.electronAPI!.oauth.openUrl(data.url, redirectTo);

    if (!result.success || !result.data) {
      return { success: false, error: result.error ?? "Authentication was cancelled" };
    }

    const { access_token, refresh_token } = result.data;

    if (!access_token || !refresh_token) {
      return { success: false, error: "Missing access or refresh token" };
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (sessionError) {
      return { success: false, error: sessionError.message };
    }

    window.location.href = "/dashboard/default";
    return { success: true };
  };

  const value: AuthContextType = {
    user,
    loading,
    isElectron: electron,
    signIn,
    signUp,
    signOut,
    resetPassword,
    signInWithGoogle,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
