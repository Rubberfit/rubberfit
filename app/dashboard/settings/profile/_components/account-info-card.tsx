"use client"

import type { AuthUser } from "@/src/infrastructure/services/authService"
import { Badge } from "@/app/components/ui/badge"
import { FormFieldset, FormSectionHeader } from "@/app/components/ui/forms"

interface AccountInfoCardProps {
  user: Pick<AuthUser, "id" | "authProvider" | "createdAt">
}

/**
 * Read-only account metadata. Phase 2 PR 2b chrome — flat section
 * with mono-uppercase row labels matching the rest of the
 * primitive language. No save/cancel; this is pure display.
 */
export function AccountInfoCard({ user }: AccountInfoCardProps) {
  const provider = user.authProvider
  const signInMethod =
    provider === "google"
      ? "Google OAuth"
      : provider === "email"
        ? "Email & Password"
        : provider
          ? provider
              .split(/[_-]/)
              .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
              .join(" ")
          : "Unavailable"
  const memberSince = user.createdAt ? new Date(user.createdAt) : null
  const memberSinceLabel =
    memberSince && !Number.isNaN(memberSince.getTime()) ? memberSince.toLocaleDateString() : null

  return (
    <FormFieldset>
      <FormSectionHeader
        eyebrow="Account"
        title="Account information"
        description="Sign-in details on file for this account."
      />
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <ReadOnlyRow label="User ID" value={<span className="font-mono">{user.id}</span>} />
        <ReadOnlyRow label="Account status" value={<Badge variant="default">Active</Badge>} />
        <ReadOnlyRow label="Sign-in method" value={signInMethod} />
        {memberSinceLabel ? <ReadOnlyRow label="Member since" value={memberSinceLabel} /> : null}
      </div>
    </FormFieldset>
  )
}

function ReadOnlyRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] leading-4 text-foreground/80">
        {label}
      </p>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  )
}
