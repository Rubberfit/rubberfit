import { supabase } from "@/src/infrastructure/models/supabase"
import type {
  IProfileRepository,
  ProfileUpdates,
  ProfileUpdateResult,
  AvatarUploadResult,
  BucketResult,
} from "@/src/application/repositories/profiles.repository.interface"

export class ProfileRepository implements IProfileRepository {
  async updateProfile(userId: string, updates: ProfileUpdates): Promise<ProfileUpdateResult> {
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: {
          full_name: updates.name,
          avatar_url: updates.avatar,
        },
      })

      if (error) {
        console.error("Error updating profile:", error)
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      console.error("Error updating profile:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update profile",
      }
    }
  }

  async uploadAvatar(userId: string, file: File): Promise<AvatarUploadResult> {
    try {
      const fileExt = file.name.split(".").pop()
      const fileName = `${userId}-${Math.random()}.${fileExt}`
      const filePath = `avatars/${fileName}`

      const { error } = await supabase.storage.from("avatars").upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      })

      if (error) {
        console.error("Error uploading avatar:", error)
        return { success: false, error: error.message }
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath)

      return { success: true, url: publicUrl }
    } catch (error) {
      console.error("Error uploading avatar:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to upload avatar",
      }
    }
  }

  async createAvatarsBucket(): Promise<BucketResult> {
    try {
      const { data: buckets } = await supabase.storage.listBuckets()

      if (buckets?.find((b) => b.name === "avatars")) {
        return { success: true, message: "Bucket already exists" }
      }

      const { data, error } = await supabase.storage.createBucket("avatars", {
        public: true,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
        fileSizeLimit: 5242880,
      })

      if (error) {
        console.error("Error creating avatars bucket:", error)
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      console.error("Error creating avatars bucket:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create avatars bucket",
      }
    }
  }
}

export const profileRepository = new ProfileRepository()
