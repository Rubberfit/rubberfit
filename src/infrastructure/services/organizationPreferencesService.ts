import "reflect-metadata"
import { injectable } from "tsyringe"

import type { IOrganizationPreferencesService } from "@/src/application/services/organization-preferences.service.interface"
import {
  type OrganizationPreferences,
  type UpdateOrganizationPreferencesInput,
  mapOrganizationPreferencesRow,
  mapUpdateInputToRow,
} from "@/src/infrastructure/models/organization-preferences"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

@injectable()
export class OrganizationPreferencesService implements IOrganizationPreferencesService {
  async getForOrganization(organizationId: string): Promise<OrganizationPreferences> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("tenant_settings")
      .select("*")
      .eq("tenant_id", organizationId)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      throw new Error(`No tenant_settings row for tenant ${organizationId}`)
    }
    return mapOrganizationPreferencesRow(data)
  }

  async updateForOrganization(
    organizationId: string,
    updates: UpdateOrganizationPreferencesInput
  ): Promise<OrganizationPreferences> {
    const supabase = await getDatabaseClient()
    const row = mapUpdateInputToRow(updates)
    const { data, error } = await supabase
      .from("tenant_settings")
      .update(row)
      .eq("tenant_id", organizationId)
      .select("*")
      .maybeSingle()

    if (error) throw error
    if (!data) {
      // No row returned ⇒ RLS WITH CHECK rejected the write (non-admin).
      throw new Error(
        `tenant_settings update for tenant ${organizationId} returned no row (RLS or missing tenant)`
      )
    }
    return mapOrganizationPreferencesRow(data)
  }
}

export const organizationPreferencesService = new OrganizationPreferencesService()
