import "reflect-metadata"
import { inject, injectable } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { IInvitationsRepository } from "@/src/application/repositories/invitations.repository.interface"
import type { IInvitationService } from "@/src/application/services/invitation.service.interface"
import { Invitation, type CreateInvitationProps } from "@/src/entities/invitation"
import { invitationsRepository } from "@/src/infrastructure/repositories/invitations.repository"

/**
 * Thin orchestrator over `IInvitationsRepository`. Reads delegate
 * directly; mutations re-read the entity, run its state-transition
 * method (which enforces invariants), then persist via `repo.update`.
 *
 * Domain errors (`InvalidEntityError`, `InvalidValueObjectError`)
 * propagate unwrapped — the action layer handles them.
 *
 * Accept is NOT here — see the interface doc for why. Use
 * `AcceptInvitationUseCase` for the cross-aggregate accept flow.
 */
@injectable()
export class InvitationService implements IInvitationService {
  constructor(
    @inject(TOKENS.IInvitationsRepository)
    private readonly repo: IInvitationsRepository
  ) {}

  getById(id: string): Promise<Invitation> {
    return this.repo.findById(id)
  }

  getByToken(token: string): Promise<Invitation | null> {
    return this.repo.findByToken(token)
  }

  getActiveByEmail(tenantId: string, email: string): Promise<Invitation | null> {
    return this.repo.findActiveByEmail(tenantId, email)
  }

  listPending(tenantId: string): Promise<Invitation[]> {
    return this.repo.listPendingByTenant(tenantId)
  }

  async create(props: CreateInvitationProps): Promise<Invitation> {
    const entity = Invitation.create(props)
    return this.repo.insert(entity)
  }

  async revoke(id: string): Promise<Invitation> {
    const entity = await this.repo.findById(id)
    entity.revoke()
    return this.repo.update(entity)
  }

  async recordSendSuccess(id: string): Promise<Invitation> {
    const entity = await this.repo.findById(id)
    entity.recordSendSuccess()
    return this.repo.update(entity)
  }

  async recordSendFailure(id: string, error: string): Promise<Invitation> {
    const entity = await this.repo.findById(id)
    entity.recordSendFailure(error)
    return this.repo.update(entity)
  }

  acceptByToken(
    token: string
  ): Promise<{ membershipId: string; tenantId: string }> {
    return this.repo.acceptByToken(token)
  }
}

export const invitationService: IInvitationService = new InvitationService(
  invitationsRepository
)
