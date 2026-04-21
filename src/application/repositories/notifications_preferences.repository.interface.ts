import type {
  NotificationPreferences,
  CreateNotificationPreferences,
  UpdateNotificationPreferences,
} from "@/src/entities"

export interface INotificationPreferencesRepository {
  findByUserId(userId: string): Promise<NotificationPreferences | null>
  create(data: CreateNotificationPreferences): Promise<NotificationPreferences>
  update(userId: string, data: UpdateNotificationPreferences): Promise<NotificationPreferences>
}
