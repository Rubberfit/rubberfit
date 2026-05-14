import type {
  OrganizationPreferences,
  UpdateOrganizationPreferencesInput,
} from "@/src/infrastructure/models/organization-preferences"

/**
 * IOrganizationPreferencesService — regional + operational defaults
 * for an organization. Surfaced in /dashboard/settings/general.
 *
 * One row per organization (auto-provisioned via DB trigger on org
 * creation). The service exposes read-by-org and a partial-update API;
 * RLS at the DB layer enforces member-read / admin-write semantics.
 */
export interface IOrganizationPreferencesService {
  /**
   * Read the preferences row for the given organization. Returns the
   * row when the caller is an active member; throws when RLS rejects
   * the read or the org has no row (shouldn't happen — the trigger
   * provisions on org creation + the backfill seeded existing orgs).
   */
  getForOrganization(organizationId: string): Promise<OrganizationPreferences>

  /**
   * Partial update. Only admins/owners can succeed; non-admins hit
   * the RLS WITH CHECK and the underlying Supabase call returns an
   * empty row set, which the implementation surfaces as a thrown
   * error for the action layer to discriminate.
   */
  updateForOrganization(
    organizationId: string,
    updates: UpdateOrganizationPreferencesInput
  ): Promise<OrganizationPreferences>
}
