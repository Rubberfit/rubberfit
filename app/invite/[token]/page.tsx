import { notFound } from "next/navigation"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"

import { LockCard } from "@/app/components/billing/LockCard"
import { LockScreen } from "@/app/components/billing/LockScreen"
import { getSessionContext } from "@/app/server/auth/get-session-context"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

import { InviteLanding, type InvitePreview } from "./_components/invite-landing"

interface InvitePageProps {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: InvitePageProps) {
  ensureDatabaseFactoryRegistered()
  const { token } = await params
  if (!token || token.length === 0) notFound()

  const organizationService = resolveUseCase<IOrganizationService>(TOKENS.IOrganizationService)
  const preview = await organizationService.getInvitationPreviewByToken(token)
  if (!preview) notFound()

  const session = await getSessionContext()

  const inviteStatus: InvitePreview["status"] =
    preview.status === "pending" && new Date(preview.expires_at) <= new Date()
      ? "expired"
      : preview.status

  const invitePreview: InvitePreview = {
    token,
    status: inviteStatus,
    organizationId: preview.organization_id,
    organizationName: preview.organization_name,
    inviteEmail: preview.email,
    role: preview.role,
    expiresAt: preview.expires_at,
    inviterName: preview.inviter_name,
  }

  return (
    <LockScreen hideSidebar>
      <LockCard maxW="md">
        <InviteLanding preview={invitePreview} session={session} />
      </LockCard>
    </LockScreen>
  )
}
