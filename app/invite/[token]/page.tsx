import "reflect-metadata"
import "@/di/di-registration"
import Link from "next/link"
import { container } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { IInvitationService } from "@/src/application/services/invitation.service.interface"

import { getOptionalUser } from "@/app/server/auth/require-authenticated-user"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

import { AcceptInvitationCta } from "./_components/accept-invitation-cta"

interface InvitePageProps {
  params: Promise<{ token: string }>
}

/**
 * Public landing for an invitation token. Branches:
 *
 *   • Token not found / accepted / revoked / expired → friendly empty state.
 *   • Signed out → inline Sign in + Create account links that round-trip
 *     back here via `?redirectTo=/invite/<token>`.
 *   • Signed in but email doesn't match the invitation → notice + sign-in
 *     link with the correct account.
 *   • Signed in, email matches, invitation active → AcceptInvitationCta.
 *
 * The lookup uses the SECURITY DEFINER `get_invitation_by_token` RPC so
 * brand-new users (no memberships yet) can resolve the row without
 * tripping the invitations RLS policy.
 */
export default async function InvitePage({ params }: InvitePageProps) {
  ensureDatabaseFactoryRegistered()
  const { token } = await params

  const invitationService = container.resolve<IInvitationService>(TOKENS.IInvitationService)

  const [user, invitation] = await Promise.all([
    getOptionalUser(),
    invitationService.findPublicViewByToken(token),
  ])

  if (!invitation) {
    return (
      <Shell>
        <Heading>Invitation not found</Heading>
        <Body>
          We couldn&apos;t find an invitation for this link. The invite may have been deleted, or
          the URL may be wrong.
        </Body>
        <PrimaryLink href="/login">Go to sign in</PrimaryLink>
      </Shell>
    )
  }

  if (invitation.acceptedAt) {
    return (
      <Shell>
        <Heading>Already accepted</Heading>
        <Body>
          This invitation to <strong>{invitation.tenantName}</strong> has already been accepted.
          Sign in with the invited account to access the workspace.
        </Body>
        <PrimaryLink href="/login">Sign in</PrimaryLink>
      </Shell>
    )
  }

  if (invitation.revokedAt) {
    return (
      <Shell>
        <Heading>Invitation revoked</Heading>
        <Body>
          The admin has revoked this invitation to <strong>{invitation.tenantName}</strong>. Ask
          them to send a fresh one if you still need access.
        </Body>
      </Shell>
    )
  }

  const expiresAt = new Date(invitation.expiresAt)
  if (expiresAt.getTime() < Date.now()) {
    return (
      <Shell>
        <Heading>Invitation expired</Heading>
        <Body>
          This invitation expired on {expiresAt.toLocaleDateString()}. Ask the admin at{" "}
          <strong>{invitation.tenantName}</strong> to resend it.
        </Body>
      </Shell>
    )
  }

  const inviteHref = `/invite/${encodeURIComponent(token)}`

  if (!user) {
    return (
      <Shell>
        <Heading>You&apos;re invited to {invitation.tenantName}</Heading>
        <Body>
          The invitation is for <strong>{invitation.email}</strong>. Sign in with that email to
          accept, or create an account if you don&apos;t have one yet.
        </Body>
        <p className="mt-2 text-xs text-muted-foreground">
          Expires {expiresAt.toLocaleDateString()}.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <PrimaryLink href={`/login?redirectTo=${encodeURIComponent(inviteHref)}`}>
            Sign in
          </PrimaryLink>
          <SecondaryLink href={`/register?redirectTo=${encodeURIComponent(inviteHref)}`}>
            Create account
          </SecondaryLink>
        </div>
      </Shell>
    )
  }

  const emailMatches = user.email.toLowerCase() === invitation.email.toLowerCase()

  if (!emailMatches) {
    return (
      <Shell>
        <Heading>Wrong account</Heading>
        <Body>
          You&apos;re signed in as <strong>{user.email}</strong>, but this invitation is for{" "}
          <strong>{invitation.email}</strong>. Sign out and sign back in with the invited email to
          accept.
        </Body>
        <PrimaryLink href="/login">Sign in with another account</PrimaryLink>
      </Shell>
    )
  }

  return (
    <Shell>
      <Heading>Accept invitation to {invitation.tenantName}</Heading>
      <Body>
        You&apos;re joining as <strong>{invitation.roles.join(", ")}</strong>. Once you accept,
        you&apos;ll land in the {invitation.tenantName} dashboard.
      </Body>
      <p className="mt-2 text-xs text-muted-foreground">
        Expires {expiresAt.toLocaleDateString()}.
      </p>
      <AcceptInvitationCta token={token} tenantName={invitation.tenantName} />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <div className="w-full rounded-lg border bg-card p-8 shadow-sm">{children}</div>
    </main>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
      {children}
    </h1>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm text-muted-foreground">{children}</p>
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
    >
      {children}
    </Link>
  )
}

function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-6 inline-flex h-10 items-center justify-center rounded-md border bg-background px-5 text-sm font-medium text-foreground shadow-sm hover:bg-accent"
    >
      {children}
    </Link>
  )
}
