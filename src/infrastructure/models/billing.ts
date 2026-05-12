// Organization billing types — mirror migration
// 20260512000001_create_organizations_billing.sql

import type { UserProfile } from "./supabase"

/** Billing/tenant role on an organization. Separate from profiles.roles (in-app RBAC). */
export type OrganizationRole = "owner" | "admin" | "member"

/** Activation status on an organization_members row. Pending invites + active members count against the seat cap. */
export type OrganizationMemberStatus = "active" | "deactivated" | "removed"

/** Plan tier mirrored from Stripe subscription metadata. */
export type PlanTier = "standard" | "pro" | "max" | "enterprise"

/** Billing cycle mirrored from Stripe price. */
export type BillingInterval = "monthly" | "annual"

/** Full Stripe subscription.status enum — gate logic matches on this string. */
export type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused"

/** Lifecycle of an organization invitation token. */
export type OrganizationInvitationStatus = "pending" | "accepted" | "expired" | "revoked"

/** Status of a stripe_events idempotency row. */
export type StripeEventStatus = "pending" | "processed" | "error"

export interface Organization {
  id: string
  name: string
  billing_email: string | null
  stripe_customer_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: OrganizationRole
  status: OrganizationMemberStatus
  invited_by: string | null
  joined_at: string
  deactivated_at: string | null
  created_at: string
  updated_at: string
}

export interface OrganizationSubscription {
  id: string
  organization_id: string
  stripe_subscription_id: string | null
  stripe_subscription_item_id: string | null
  stripe_price_id: string | null
  stripe_product_id: string | null
  latest_invoice_id: string | null
  plan_tier: PlanTier
  billing_interval: BillingInterval | null
  seat_count: number
  status: SubscriptionStatus
  trial_end: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  cancel_at: string | null
  canceled_at: string | null
  last_payment_status: string | null
  last_stripe_event_id: string | null
  last_stripe_event_created_at: string | null
  is_current: boolean
  created_at: string
  updated_at: string
}

export interface OrganizationInvitation {
  id: string
  organization_id: string
  email: string
  role: Exclude<OrganizationRole, "owner">
  status: OrganizationInvitationStatus
  token: string
  invited_by: string | null
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export interface StripeEvent {
  stripe_event_id: string
  type: string
  status: StripeEventStatus
  attempt_count: number
  error: string | null
  event_created_at: string | null
  received_at: string
  processed_at: string | null
  updated_at: string
}

/** Composite view of an org with its current entitlement row. */
export interface OrganizationWithSubscription extends Organization {
  current_subscription: OrganizationSubscription | null
}

/** Composite view of a member row joined to the user's profile fields. */
export interface OrganizationMemberWithProfile extends OrganizationMember {
  profile: Pick<UserProfile, "id" | "email" | "full_name" | "avatar_url"> | null
}

export type CreateOrganization = Pick<Organization, "name" | "billing_email" | "created_by">

export type UpdateOrganization = Partial<
  Pick<Organization, "name" | "billing_email" | "stripe_customer_id">
>

export type CreateOrganizationMember = Pick<
  OrganizationMember,
  "organization_id" | "user_id" | "role"
> & {
  invited_by?: OrganizationMember["invited_by"]
  status?: OrganizationMember["status"]
  joined_at?: OrganizationMember["joined_at"]
}

export type UpdateOrganizationMember = Partial<
  Pick<OrganizationMember, "role" | "status" | "deactivated_at">
>

export type CreateOrganizationInvitation = Pick<
  OrganizationInvitation,
  "organization_id" | "email" | "role" | "token" | "invited_by"
> & {
  expires_at?: OrganizationInvitation["expires_at"]
}

export type UpdateOrganizationInvitation = Partial<
  Pick<OrganizationInvitation, "status" | "accepted_at" | "revoked_at" | "expires_at">
>

/**
 * Webhook-side upsert payload for organization_subscriptions. All fields
 * optional because each Stripe event carries a different subset.
 */
export type UpsertOrganizationSubscription = Partial<
  Omit<OrganizationSubscription, "id" | "created_at" | "updated_at">
> & {
  organization_id: OrganizationSubscription["organization_id"]
}

/**
 * Seat-usage helper return shape. Active members + pending invites both
 * count toward the cap.
 */
export interface OrganizationSeatUsage {
  purchased: number
  active_members: number
  pending_invites: number
  used: number
  available: number
}

/**
 * Read-only invitation preview returned by `get_invitation_preview_by_token`
 * RPC. Powers the public `/invite/[token]` landing page without exposing
 * internal columns (no `token`, no `invited_by`, no `created_at`).
 */
export interface OrganizationInvitationPreview {
  invitation_id: string
  organization_id: string
  organization_name: string
  email: string
  role: Exclude<OrganizationRole, "owner">
  status: OrganizationInvitationStatus
  expires_at: string
  inviter_name: string | null
}

/** Typed result of the atomic accept-invitation RPC. */
export type AcceptInvitationResult =
  | {
      result_code: "ok"
      organization_id: string
      membership_id: string
    }
  | {
      result_code:
        | "not_found"
        | "already_accepted"
        | "revoked"
        | "expired"
        | "email_mismatch"
        | "org_subscription_inactive"
        | "membership_exists"
    }
