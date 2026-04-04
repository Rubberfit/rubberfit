"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { getBrowserAppUrl } from "@/lib/app-url";
import { resolvePostAuthRedirect, sanitizeRedirectPath } from "@/lib/auth-redirect";
import { isElectron } from "@/lib/isElectron";
import { supabase } from "@/lib/supabase";
import { type AuthUser, authService } from "@/services/authService";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isElectron: boolean;
  signIn: (
    email: string,
    password: string,
    redirectTo?: string | null,
  ) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: (redirectTo?: string | null) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
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
        console.error("Error getting initial user:", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    getInitialUser();

    const {
      data: { subscription },
    } = authService.onAuthStateChange((authUser) => {
      setUser(authUser);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (
    email: string,
    password: string,
    redirectTo?: string | null,
  ): Promise<{ success: boolean; error?: string }> => {
    setLoading(true);
    try {
      const { user: authUser, error } = await authService.signIn(email, password);

      if (error) {
        setLoading(false);
        return { success: false, error: error.message };
      }

      if (authUser) {
        setUser(authUser);
        router.push(resolvePostAuthRedirect(authUser.roles, redirectTo));
        return { success: true };
      }

      setLoading(false);
      return { success: false, error: "Authentication failed" };
    } catch (error) {
      setLoading(false);
      return {
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
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
      return { success: false, error: "Registration failed" };
    } catch (error) {
      setLoading(false);
      return {
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      };
    }
  };

  const signOut = async (): Promise<void> => {
    setLoading(true);
    try {
      await authService.signOut();
      setUser(null);
      router.push("/auth/v2/login");
    } catch (error) {
      console.error("Sign out error:", error);
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
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      };
    }
  };

  /** Google OAuth — dispatches to Electron popup or web redirect flow. */
  const signInWithGoogle = async (redirectTo?: string | null): Promise<{ success: boolean; error?: string }> => {
    try {
      if (electron) {
        return await handleElectronOAuth(redirectTo);
      }
      return await handleWebOAuth(redirectTo);
    } catch {
      return { success: false, error: "Failed to initiate Google sign in" };
    }
  };

  /** Web: normal redirect flow. */
  const handleWebOAuth = async (redirectTo?: string | null): Promise<{ success: boolean; error?: string }> => {
    const callbackUrl = new URL(getBrowserAppUrl("/auth/v2/callback"));
    const safeRedirect = sanitizeRedirectPath(redirectTo);

    if (safeRedirect) {
      callbackUrl.searchParams.set("next", safeRedirect);
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
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
  const handleElectronOAuth = async (redirectTo?: string | null): Promise<{ success: boolean; error?: string }> => {
    const finalPath = sanitizeRedirectPath(redirectTo) ?? "/dashboard/default";
    const oauthRedirectTo = getBrowserAppUrl(finalPath);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        skipBrowserRedirect: true,
        redirectTo: oauthRedirectTo,
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

    const electronApi = window.electronAPI;

    if (!electronApi) {
      return { success: false, error: "Electron OAuth bridge unavailable" };
    }

    const result = await electronApi.oauth.openUrl(data.url, oauthRedirectTo);

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

    const authUser = await authService.getCurrentUser();
    window.location.href = resolvePostAuthRedirect(authUser?.roles, finalPath);
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
