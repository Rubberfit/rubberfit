import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"
import type {
  INotificationRepository,
  Notification,
  NotificationByType,
} from "@/src/application/repositories/notifications.repository.interface"

export class NotificationRepository implements INotificationRepository {
  async getAll(): Promise<Notification[]> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) throw error
    return data as Notification[]
  }

  async getByType(type: string): Promise<NotificationByType[] | null> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("notifications")
      .select("id, material_type")
      .eq("type", type)

    if (error) throw error
    return data
  }

  async getUnreadCount(): Promise<number> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase.from("notifications").select("id").eq("is_read", false)

    if (error) throw error
    return data?.length ?? 0
  }

  async exists(): Promise<boolean> {
    const supabase = await getDatabaseClient()
    const { error } = await supabase.from("notifications").select("id").limit(1)

    return !error
  }

  async create(
    notification: Omit<Notification, "id" | "created_at" | "updated_at">
  ): Promise<Notification> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("notifications")
      .insert([notification])
      .select()
      .single()

    if (error) throw error
    return data as Notification
  }

  async bulkCreate(
    notifications: Omit<Notification, "id" | "created_at" | "updated_at">[]
  ): Promise<Notification[]> {
    if (notifications.length === 0) return []
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase.from("notifications").insert(notifications).select()

    if (error) throw error
    return data as Notification[]
  }

  async update(id: string, updates: Partial<Notification>): Promise<Notification> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("notifications")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return data as Notification
  }

  async markAsRead(id: string): Promise<Notification> {
    return this.update(id, { is_read: true })
  }

  async markAllAsRead(): Promise<void> {
    const supabase = await getDatabaseClient()
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("is_read", false)

    if (error) throw error
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const supabase = await getDatabaseClient()
    const { error } = await supabase.from("notifications").delete().in("id", ids)

    if (error) throw error
  }

  async deleteAll(): Promise<void> {
    const supabase = await getDatabaseClient()
    const { error } = await supabase
      .from("notifications")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")

    if (error) throw error
  }
}

export const notificationRepository = new NotificationRepository()
