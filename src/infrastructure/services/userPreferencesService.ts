import "reflect-metadata"
import { injectable } from "tsyringe"

import type { IUserPreferencesService } from "@/src/application/services/user-preferences.service.interface"
import {
  type UpdateUserPreferencesInput,
  type UserPreferences,
  mapUpdateInputToRow,
  mapUserPreferencesRow,
} from "@/src/infrastructure/models/user-preferences"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

@injectable()
export class UserPreferencesService implements IUserPreferencesService {
  async getForUser(userId: string): Promise<UserPreferences> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      throw new Error(`No user_preferences row for user ${userId}`)
    }
    return mapUserPreferencesRow(data)
  }

  async updateForUser(
    userId: string,
    updates: UpdateUserPreferencesInput
  ): Promise<UserPreferences> {
    const supabase = await getDatabaseClient()
    const row = mapUpdateInputToRow(updates)
    const { data, error } = await supabase
      .from("user_preferences")
      .update(row)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle()

    if (error) throw error
    if (!data) {
      throw new Error(`user_preferences update for ${userId} returned no row (RLS or missing row)`)
    }
    return mapUserPreferencesRow(data)
  }
}

export const userPreferencesService = new UserPreferencesService()
