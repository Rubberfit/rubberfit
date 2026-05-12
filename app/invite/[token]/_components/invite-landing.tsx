"use client"

import * as React from "react"
import { useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import { acceptInvitation } from "@/app/actions/team"
import type { SessionContext } from "@/app/server/auth/get-session-context"

import { InviteStateCard } from "./invite-state-card"

export type InvitePreview = {
  token: string
  status: "pending" | "accepted" | "expired" | "revoked"
  organizationId: string
  organizationName: string
  inviteEmail: string
  role: "admin" | "member"
  expiresAt: string
  inviterName: string | null
}

interface InviteLandingProps {
  preview: InvitePreview
  session: SessionContext
}

export function InviteLanding({ preview, session }: InviteLandingProps) {
  const router = useRouter()
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [pending, startTransition] = useTransition()

  const isMatch =
    session.kind === "authenticated" &&
    session.email.toLowerCase() === preview.inviteEmail.toLowerCase()
  const isMismatch =
    session.kind === "authenticated" &&
    session.email.toLowerCase() !== preview.inviteEmail.toLowerCase()

  function handleAccept() {
    startTransition(async () => {
      const result = await acceptInvitation({ token: preview.token })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Welcome to the workspace")
      router.push("/dashboard")
    })
  }

  function handleJoinWithPassword(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters")
      return
    }
    handleAccept()
  }

  if (preview.status === "expired") {
    const inviter = preview.inviterName ?? preview.organizationName
    return (
      <InviteStateCard
        title="This invitation has expired."
        body={`Ask ${inviter} to send a new one.`}
      />
    )
  }

  if (preview.status === "revoked") {
    return <InviteStateCard title="This invitation is no longer valid." />
  }

  if (preview.status === "accepted") {
    return (
      <InviteStateCard
        title={`You've already joined ${preview.organizationName}.`}
        cta={
          <Button
            asChild
            className="w-full bg-[var(--accent-fg)] text-white hover:bg-[var(--accent-fg)]/90"
          >
            <Link href="/dashboard">Go to dashboard.</Link>
          </Button>
        }
      />
    )
  }

  if (session.kind === "anonymous") {
    return (
      <>
        <InviteStateCard
          title={`You've been invited to join ${preview.organizationName}.`}
          body="Set a password to accept and start collaborating."
        />
        <form onSubmit={handleJoinWithPassword} className="mt-6 w-full space-y-4">
          <div>
            <Label htmlFor="password" className="text-sm font-medium text-foreground">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1"
              required
            />
          </div>
          <div>
            <Label htmlFor="confirm-password" className="text-sm font-medium text-foreground">
              Confirm password
            </Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1"
              required
            />
          </div>
          <Button
            type="submit"
            className="mt-2 w-full bg-[var(--accent-fg)] text-white hover:bg-[var(--accent-fg)]/90"
            disabled={pending}
          >
            {pending ? "Joining..." : "Accept & join"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={`/login?next=/invite/${preview.token}`}
            className="text-[var(--accent-fg)] hover:underline"
          >
            Log in to accept →
          </Link>
        </p>
      </>
    )
  }

  if (isMatch) {
    const roleLabel = preview.role === "admin" ? "Admin" : "Member"
    return (
      <>
        <InviteStateCard
          title={`Join ${preview.organizationName}?`}
          body={`You'll be added as a ${roleLabel}.`}
        />
        <Button
          className="mt-6 w-full bg-[var(--accent-fg)] text-white hover:bg-[var(--accent-fg)]/90"
          onClick={handleAccept}
          disabled={pending}
        >
          {pending ? "Joining..." : "Join workspace"}
        </Button>
        <Link
          href="/dashboard"
          className="mt-3 block text-center text-sm text-muted-foreground hover:text-foreground"
        >
          Not now
        </Link>
      </>
    )
  }

  if (isMismatch && session.kind === "authenticated") {
    return (
      <InviteStateCard
        title="This invite isn't for your current account."
        body={`This invitation was sent to ${preview.inviteEmail}. You're currently logged in as ${session.email}.`}
        cta={
          <Link
            href={`/login?next=/invite/${preview.token}`}
            className="mt-4 block text-center text-[var(--accent-fg)] hover:underline"
          >
            Log in as {preview.inviteEmail}
          </Link>
        }
      />
    )
  }

  return null
}
