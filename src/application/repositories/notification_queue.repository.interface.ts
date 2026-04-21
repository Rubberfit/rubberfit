import type {
  NotificationQueue,
  CreateNotificationQueue,
  UpdateNotificationQueue,
} from "@/src/entities"

export interface INotificationQueueRepository {
  findById(id: string): Promise<NotificationQueue | null>
  findByUserId(userId: string): Promise<NotificationQueue[]>
  findByStatus(status: NotificationQueue["status"]): Promise<NotificationQueue[]>
  findPending(): Promise<NotificationQueue[]>
  create(data: CreateNotificationQueue): Promise<NotificationQueue>
  update(id: string, data: UpdateNotificationQueue): Promise<NotificationQueue>
  delete(id: string): Promise<void>
}
