/**
 * Machine-code registry for structured error responses the UI
 * needs to handle with tailored messaging.
 *
 * Context: service routes (POs in particular) return 409s with
 * a `code` field carrying one of these strings. Rather than
 * every caller re-implementing a switch over the codes, the
 * registry here centralizes:
 *
 *   - Title + description (what happened, in plain language).
 *   - Severity intent (matches `InlineNotice` / `StatusBadge`
 *     tokens).
 *   - Optional action-label hint for the primary remediation
 *     CTA.
 *
 * Add a new entry here first; then `ErrorState` /
 * `InlineNotice` consumers can look it up by code with
 * `resolveErrorCopy(code)`.
 */

import type { StatusIntent } from "./status-badge"

export type ErrorCode =
  | "RECEIVED_REQUIRES_RECEIVE_FLOW"
  | "INVALID_STATE_TRANSITION"
  | "DUPLICATE_RULE_IDS"
  | "INSUFFICIENT_STOCK"
  | "TENANT_MISMATCH"
  | "MISSING_REQUIRED_FIELD"
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL"

export interface ErrorCopy {
  title: string
  description: string
  intent: StatusIntent
  actionLabel?: string
}

const registry: Record<ErrorCode, ErrorCopy> = {
  RECEIVED_REQUIRES_RECEIVE_FLOW: {
    title: "Use the Receive flow",
    description:
      "This purchase order can't be edited directly once it's marked as received. Open the Receive dialog to log stock deliveries.",
    intent: "warning",
    actionLabel: "Open Receive",
  },
  INVALID_STATE_TRANSITION: {
    title: "That transition isn't allowed",
    description:
      "The purchase order is in a state that doesn't permit this change. Check the status and pick an allowed next step.",
    intent: "warning",
  },
  DUPLICATE_RULE_IDS: {
    title: "Duplicate rule IDs",
    description:
      "Two or more reorder rules share the same identifier. Remove the duplicates before saving.",
    intent: "danger",
  },
  INSUFFICIENT_STOCK: {
    title: "Not enough material on hand",
    description:
      "The requested cut requires more material than current inventory. Reduce quantity or reorder first.",
    intent: "warning",
    actionLabel: "Create PO",
  },
  TENANT_MISMATCH: {
    title: "Record belongs to another tenant",
    description:
      "You can't access this record under the current signed-in workspace. Switch workspaces or contact your admin.",
    intent: "danger",
  },
  MISSING_REQUIRED_FIELD: {
    title: "Missing required information",
    description:
      "One or more required fields are empty. Check the form and try again.",
    intent: "warning",
  },
  VALIDATION_FAILED: {
    title: "Input didn't pass validation",
    description:
      "The server couldn't accept the submitted data. Review the highlighted fields and try again.",
    intent: "warning",
  },
  UNAUTHORIZED: {
    title: "You don't have permission for this",
    description:
      "Your role doesn't include access to this action. Contact your admin if you need it.",
    intent: "danger",
  },
  NOT_FOUND: {
    title: "Record not found",
    description:
      "We couldn't find what you were looking for. It may have been deleted or you may have followed a stale link.",
    intent: "neutral",
  },
  RATE_LIMITED: {
    title: "Too many requests",
    description:
      "You're hitting this service faster than the rate limit permits. Wait a moment and try again.",
    intent: "warning",
  },
  INTERNAL: {
    title: "Something went wrong on our side",
    description:
      "An unexpected error stopped the request from completing. The team has been notified; retrying often helps.",
    intent: "danger",
  },
}

export function resolveErrorCopy(code: string | null | undefined): ErrorCopy | null {
  if (!code) return null
  if (code in registry) {
    return registry[code as ErrorCode]
  }
  return null
}

export function isKnownErrorCode(code: string): code is ErrorCode {
  return code in registry
}
