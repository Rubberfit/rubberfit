export interface AlertFireInput {
  serviceName: string
  status: "down" | "degraded"
  detail: string
  responseMs: number | null
  checkedAt: string
}

export interface IHealthAlertService {
  maybeFire(input: AlertFireInput): Promise<void>
}
