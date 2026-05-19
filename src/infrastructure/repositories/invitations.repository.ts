import "reflect-metadata"
import { injectable } from "tsyringe"

import type {
  IInvitationsRepository,
  InvitationPublicView,
} from "@/src/application/repositories/invitations.repository.interface"
import type { Invitation } from "@/src/entities/invitation"
import {
  invitationToInsertRow,
  invitationToUpdateRow,
  rowToInvitation,
  type InvitationRow,
} from "@/src/infrastructure/mappers/invitation.mapper"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

const TABLE = "invitations"
const SELECT_COLUMNS = "*"

@injectable()
export class InvitationsRepository implements IInvitationsRepository {
  async findById(id: string): Promise<Invitation> {
    const client = await getDatabaseClient()
    const { data, error } = await client.from(TABLE).select(SELECT_COLUMNS).eq("id", id).single()
    if (error) throw error
    return rowToInvitation(data as InvitationRow)
  }

  async findByToken(token: string): Promise<Invitation | null> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .eq("token", token)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    return rowToInvitation(data as InvitationRow)
  }

  async findActiveByEmail(tenantId: string, email: string): Promise<Invitation | null> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .eq("tenant_id", tenantId)
      .ilike("email", email)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    return rowToInvitation(data as InvitationRow)
  }

  async listPendingByTenant(tenantId: string): Promise<Invitation[]> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .eq("tenant_id", tenantId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
    if (error) throw error
    return ((data ?? []) as InvitationRow[]).map(rowToInvitation)
  }

  async insert(entity: Invitation): Promise<Invitation> {
    const client = await getDatabaseClient()
    const { error } = await client.from(TABLE).insert(invitationToInsertRow(entity))
    if (error) throw error
    return this.findById(entity.id.value)
  }

  async update(entity: Invitation): Promise<Invitation> {
    const client = await getDatabaseClient()
    const { error } = await client
      .from(TABLE)
      .update(invitationToUpdateRow(entity))
      .eq("id", entity.id.value)
    if (error) throw error
    return this.findById(entity.id.value)
  }

  async acceptByToken(token: string): Promise<{ membershipId: string; tenantId: string }> {
    const client = await getDatabaseClient()
    const { data, error } = await client.rpc("accept_invitation", { p_token: token }).single()
    if (error) throw error
    const row = data as { membership_id: string; tenant_id: string } | null
    if (!row) {
      throw new Error("accept_invitation RPC returned no row")
    }
    return { membershipId: row.membership_id, tenantId: row.tenant_id }
  }

  async findPublicViewByToken(token: string): Promise<InvitationPublicView | null> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .rpc("get_invitation_by_token", { p_token: token })
      .maybeSingle()
    if (error) {
      console.error("findPublicViewByToken failed:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      })
      throw error
    }
    if (!data) return null
    const row = data as {
      tenant_id: string
      tenant_name: string
      email: string
      roles: string[]
      expires_at: string
      accepted_at: string | null
      revoked_at: string | null
    }
    return {
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      email: row.email,
      roles: row.roles,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      revokedAt: row.revoked_at,
    }
  }
}

export const invitationsRepository = new InvitationsRepository()
