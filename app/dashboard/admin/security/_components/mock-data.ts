/**
 * Mock fixtures for the admin security surface (Phase 2 PR 5).
 *
 * Per the locked spec §2.3 resolution, the visual pass ships
 * against mock data so backend wiring (sessions table, MFA
 * enforcement flag, real `audit_log`) can land independently.
 * Every fixture below is gated by an explicit
 * `TODO(ARC-DASHBOARD-AUDIT)` marker so the cleanup pass can find
 * them when the real data lands.
 */
import type { AppRole, Permission } from "@/src/application/permissions"

export interface SecurityHeroMetrics {
  activeSessions: number
  activeSessionsTrend: number
  mfaEnrollmentPercent: number
  mfaEnrollmentTrend: number
  auditEvents7d: number
  auditEvents7dTrend: number
  failedLogins24h: number
  failedLogins24hTrend: number
}

// TODO(ARC-DASHBOARD-AUDIT): replace with `securityMetricsService.getOverview()`.
export const HERO_METRICS: SecurityHeroMetrics = {
  activeSessions: 12,
  activeSessionsTrend: 2,
  mfaEnrollmentPercent: 67,
  mfaEnrollmentTrend: 8,
  auditEvents7d: 142,
  auditEvents7dTrend: -14,
  failedLogins24h: 3,
  failedLogins24hTrend: -2,
}

export type AuditSeverity = "info" | "success" | "warning" | "danger" | "accent"

export interface AuditEvent {
  id: string
  timestamp: string
  actor: string
  action: string
  resource: string
  ip: string
  severity: AuditSeverity
}

// TODO(ARC-DASHBOARD-AUDIT): replace with `auditLogService.list({ limit: 50 })`.
export const AUDIT_EVENTS: AuditEvent[] = [
  {
    id: "evt_01HK9X4Y8M",
    timestamp: "2026-05-06T16:42:11Z",
    actor: "alice@workspace.example",
    action: "policy.mfa.enabled",
    resource: "tenant.policy",
    ip: "10.0.4.21",
    severity: "accent",
  },
  {
    id: "evt_01HK9X3J2W",
    timestamp: "2026-05-06T15:11:53Z",
    actor: "bob@example.test",
    action: "auth.mfa.enrolled",
    resource: "user.bob@example.test",
    ip: "73.222.18.4",
    severity: "success",
  },
  {
    id: "evt_01HK9X23QF",
    timestamp: "2026-05-06T14:02:47Z",
    actor: "carol@example.test",
    action: "auth.failed_login",
    resource: "user.carol@example.test",
    ip: "73.222.18.4",
    severity: "danger",
  },
  {
    id: "evt_01HK9X1H7X",
    timestamp: "2026-05-06T13:38:09Z",
    actor: "alice@workspace.example",
    action: "user.role.added:admin",
    resource: "user.bob@example.test",
    ip: "10.0.4.21",
    severity: "warning",
  },
  {
    id: "evt_01HK9X05PR",
    timestamp: "2026-05-06T12:14:20Z",
    actor: "system",
    action: "session.expired",
    resource: "user.viewer@example.test",
    ip: "—",
    severity: "info",
  },
  {
    id: "evt_01HK9WZRTS",
    timestamp: "2026-05-06T11:08:55Z",
    actor: "alice@workspace.example",
    action: "material.created",
    resource: "material_type.mat-7f",
    ip: "10.0.4.21",
    severity: "info",
  },
]

/** Roles to display, in matrix column order. */
export const MATRIX_ROLES: ReadonlyArray<AppRole> = [
  "admin",
  "manager",
  "supervisor",
  "cutter",
  "member",
  "viewer",
]

/**
 * Permissions to surface in the matrix. Hand-picked to keep the
 * page readable; covers the interesting sensitive permissions
 * without dumping every entry from `PERMISSIONS`.
 */
export const MATRIX_PERMISSIONS: ReadonlyArray<{
  permission: Permission
  label: string
  category: "Inventory" | "Cut" | "Management" | "Analytics"
}> = [
  { permission: "viewInventory", label: "View inventory", category: "Inventory" },
  { permission: "manageRolls", label: "Manage rolls", category: "Inventory" },
  { permission: "accessCutPlanner", label: "Use cutting engine", category: "Cut" },
  { permission: "approveCut", label: "Approve cut", category: "Cut" },
  { permission: "viewCutHistory", label: "View cut history", category: "Cut" },
  { permission: "manageMaterialTypes", label: "Manage materials", category: "Management" },
  { permission: "manageSuppliers", label: "Manage suppliers", category: "Management" },
  { permission: "manageUsers", label: "Manage users", category: "Management" },
  { permission: "managePricing", label: "Manage pricing", category: "Management" },
  { permission: "accessAnalytics", label: "Access analytics", category: "Analytics" },
  { permission: "viewCostReports", label: "View cost reports", category: "Analytics" },
]
