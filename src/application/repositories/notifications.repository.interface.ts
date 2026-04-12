export interface Notification {
  id: string
  type: string
  title: string
  description: string
  material_type?: string
  current_value?: number
  threshold_value?: number
  is_read: boolean
  created_at: string
  updated_at?: string
}

export interface NotificationByType {
  id: string
  material_type: string | null
}

export interface INotificationRepository {
  getAll(): Promise<Notification[]>
  getByType(type: string): Promise<NotificationByType[] | null>
  getUnreadCount(): Promise<number>
  exists(): Promise<boolean>
  create(notification: Omit<Notification, "id" | "created_at" | "updated_at">): Promise<Notification>
  bulkCreate(
    notifications: Omit<Notification, "id" | "created_at" | "updated_at">[],
  ): Promise<Notification[]>
  update(id: string, updates: Partial<Notification>): Promise<Notification>
  markAsRead(id: string): Promise<Notification>
  markAllAsRead(): Promise<void>
  deleteByIds(ids: string[]): Promise<void>
  deleteAll(): Promise<void>
}
