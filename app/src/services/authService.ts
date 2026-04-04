import { supabase } from '@/lib/supabase';
import { getBrowserAppUrl } from '@/lib/app-url';
import { normalizeRoles } from '@/lib/rbac';
import type { User, AuthError } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  roles: string[];
}

export interface AuthResponse {
  user: AuthUser | null;
  error: AuthError | null;
}

// Generate a random avatar using DiceBear API
const generateRandomAvatar = (seed: string): string => {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=2563eb&textColor=ffffff`;
};

const getProfileRoles = async (userId: string): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('roles')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error loading profile roles:', error);
      return normalizeRoles();
    }

    return normalizeRoles(data?.roles);
  } catch (error) {
    console.error('Error loading profile roles:', error);
    return normalizeRoles();
  }
};

export const authService = {
  // Sign in with email and password
  async signIn(email: string, password: string): Promise<AuthResponse> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { user: null, error };
      }

      if (!data.user) {
        return {
          user: null,
          error: {
            message: 'No user returned from sign in',
            name: 'AuthError',
            status: 400
          } as AuthError
        };
      }

      // Get avatar - prioritize Google avatar, then use generated avatar
      const avatar = data.user.user_metadata?.avatar_url ||
                    data.user.user_metadata?.picture ||
                    generateRandomAvatar(data.user.email!);

      const user: AuthUser = {
        id: data.user.id,
        email: data.user.email!,
        name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || data.user.email?.split('@')[0],
        avatar,
        roles: await getProfileRoles(data.user.id),
      };

      return { user, error: null };
    } catch (error) {
      return {
        user: null,
        error: {
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
          name: 'AuthError',
          status: 500
        } as AuthError
      };
    }
  },

  // Sign up with email and password
  async signUp(email: string, password: string): Promise<AuthResponse> {
    try {
      const avatar = generateRandomAvatar(email);

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: email.split('@')[0], // Use email prefix as default name
            avatar_url: avatar, // Store generated avatar
          }
        }
      });

      if (error) {
        return { user: null, error };
      }

      if (!data.user) {
        return {
          user: null,
          error: {
            message: 'No user returned from sign up',
            name: 'AuthError',
            status: 400
          } as AuthError
        };
      }

      const user: AuthUser = {
        id: data.user.id,
        email: data.user.email!,
        name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0],
        avatar: data.user.user_metadata?.avatar_url || avatar,
        roles: await getProfileRoles(data.user.id),
      };

      return { user, error: null };
    } catch (error) {
      return {
        user: null,
        error: {
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
          name: 'AuthError',
          status: 500
        } as AuthError
      };
    }
  },

  // Sign out
  async signOut(): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.signOut();
      return { error };
    } catch (error) {
      return {
        error: {
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
          name: 'AuthError',
          status: 500
        } as AuthError
      };
    }
  },

  // Reset password
  async resetPassword(email: string): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getBrowserAppUrl('/auth/v2/reset-password?mode=recovery'),
      });
      return { error };
    } catch (error) {
      return {
        error: {
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
          name: 'AuthError',
          status: 500
        } as AuthError
      };
    }
  },

  // Update password during recovery
  async updatePassword(password: string): Promise<AuthResponse> {
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        return { user: null, error };
      }

      return {
        user: await authService.getCurrentUser(),
        error: null,
      };
    } catch (error) {
      return {
        user: null,
        error: {
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
          name: 'AuthError',
          status: 500
        } as AuthError
      };
    }
  },

  // Get current user
  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        return null;
      }

      // Get avatar - prioritize Google avatar, then use generated avatar
      const avatar = user.user_metadata?.avatar_url ||
                    user.user_metadata?.picture ||
                    user.user_metadata?.avatar ||
                    generateRandomAvatar(user.email!);

      return {
        id: user.id,
        email: user.email!,
        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
        avatar,
        roles: await getProfileRoles(user.id),
      };
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  },

  // Get auth session
  async getSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  },

  // Listen to auth state changes
  onAuthStateChange(callback: (user: AuthUser | null) => void) {
    return supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session?.user) {
        // Get avatar - prioritize Google avatar, then use generated avatar
        const avatar = session.user.user_metadata?.avatar_url ||
                      session.user.user_metadata?.picture ||
                      session.user.user_metadata?.avatar ||
                      generateRandomAvatar(session.user.email!);

        const user: AuthUser = {
          id: session.user.id,
          email: session.user.email!,
          name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0],
          avatar,
          roles: await getProfileRoles(session.user.id),
        };
        callback(user);
      } else if (event === 'SIGNED_OUT') {
        callback(null);
      }
    });
  },
};
