import { supabase } from "@/src/infrastructure/models/supabase"
import type { UserProfile, UpdateUserProfile } from "@/src/infrastructure/models/supabase"
import type { AppRole } from "@/src/application/permissions"
import type { IUserManagementService } from "@/src/application/services/user-management.service.interface"
import "reflect-metadata"
import { injectable } from "tsyringe"

@injectable()
export class UserManagementService implements IUserManagementService {
  async getAllUsers(): Promise<UserProfile[]> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error
      return data as UserProfile[]
    } catch (error) {
      console.error("Error fetching users:", error)
      throw error
    }
  }

  async updateUser(userId: string, updates: UpdateUserProfile): Promise<UserProfile> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", userId)
        .select()
        .single()

      if (error) throw error
      return data as UserProfile
    } catch (error) {
      console.error("Error updating user:", error)
      throw error
    }
  }

  async updateUserRoles(userId: string, roles: AppRole[]): Promise<UserProfile> {
    return this.updateUser(userId, { roles })
  }

  async deactivateUser(userId: string): Promise<UserProfile> {
    return this.updateUser(userId, { is_deleted: true })
  }

  async reactivateUser(userId: string): Promise<UserProfile> {
    return this.updateUser(userId, { is_deleted: false })
  }
}

export const userManagementService = new UserManagementService()
