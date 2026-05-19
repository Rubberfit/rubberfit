import type {
  UpdateUserPreferencesInput,
  UserPreferences,
} from "@/src/infrastructure/models/user-preferences"

/**
 * IUserPreferencesService — per-user regional + operational defaults.
 * Surfaced in /dashboard/settings/general (one row per user). No
 * admin gate; RLS at the DB layer enforces "users see + write only
 * their own row".
 */
export interface IUserPreferencesService {
  getForUser(userId: string): Promise<UserPreferences>
  updateForUser(userId: string, updates: UpdateUserPreferencesInput): Promise<UserPreferences>
}
