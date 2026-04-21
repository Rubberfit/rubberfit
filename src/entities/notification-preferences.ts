/**
 * Notification preferences live on `user_preferences.notification_preferences jsonb`.
 * Not a separate table. This is the typed shape of that JSON blob.
 *
 * The app layer refines this shape as features are added. For now, a
 * permissive record — consumers should cast to the specific subsection
 * they need (e.g., prefs.lowStock?.enabled) and validate at runtime.
 */
export interface NotificationPreferences {
  lowStock?: {
    enabled: boolean
    thresholdSqm?: number | null
  }
  rollDepleted?: {
    enabled: boolean
  }
  cutCompleted?: {
    enabled: boolean
  }
  systemAlert?: {
    enabled: boolean
  }
  channels?: {
    email: boolean
    sms: boolean
  }
  quietHours?: {
    start: string
    end: string
    timezone: string
  }
  [key: string]: unknown
}

export type CreateNotificationPreferences = NotificationPreferences
export type UpdateNotificationPreferences = Partial<NotificationPreferences>
