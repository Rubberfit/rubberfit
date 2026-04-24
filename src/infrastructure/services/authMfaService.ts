import { supabase } from "@/src/infrastructure/models/supabase"

/**
 * Thin wrapper over `supabase.auth.mfa.*`. Keeps the UI layer out of
 * the raw Supabase SDK surface and gives us one place to massage
 * return shapes (e.g. "is MFA required" as a boolean instead of the
 * `{ currentLevel, nextLevel }` assurance-level tuple).
 *
 * Native Supabase GoTrue supports TOTP — no extra backend needed.
 * The browser calls below all run against the caller's auth session;
 * there's no server-side equivalent here by design.
 */

export interface MfaFactor {
  id: string
  friendlyName: string | null
  /** Only TOTP is supported today. Phone / WebAuthn are future work. */
  factorType: "totp" | "phone"
  status: "verified" | "unverified"
  createdAt: string | null
}

export interface MfaEnrollmentHandle {
  factorId: string
  /** SVG string of the TOTP QR code — paint directly via dangerouslySetInnerHTML. */
  qrSvg: string
  /** Base-32 secret to show as a manual-entry fallback. */
  secret: string
  /** `otpauth://` URI (also encoded in the QR) — useful for deep-link buttons. */
  uri: string
}

function mapFactor(raw: {
  id: string
  friendly_name?: string | null
  factor_type?: string
  status?: string
  created_at?: string | null
}): MfaFactor {
  return {
    id: raw.id,
    friendlyName: raw.friendly_name ?? null,
    factorType: (raw.factor_type as MfaFactor["factorType"]) ?? "totp",
    status: (raw.status as MfaFactor["status"]) ?? "unverified",
    createdAt: raw.created_at ?? null,
  }
}

export const authMfaService = {
  /**
   * Returns the caller's enrolled factors, verified + unverified.
   * UI usually filters to `status === "verified"` for display.
   */
  async listFactors(): Promise<MfaFactor[]> {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) throw error
    const combined = [...(data?.totp ?? []), ...(data?.phone ?? [])]
    return combined.map(mapFactor)
  },

  /**
   * Starts a TOTP enrollment. Returns the factor id + QR to scan.
   * The factor stays `unverified` until `verifyEnrollment` succeeds.
   *
   * Before enrolling we clean up any dangling UNVERIFIED TOTP
   * factors from a previously-abandoned attempt. Supabase rejects
   * a second enrollment if a friendly-name collision exists, so
   * without the sweep the user would hit "friendly name … already
   * exists" every time they reopened the dialog.
   *
   * Verified factors are left intact — adding a second verified
   * factor (backup device) is a separate legitimate flow.
   */
  async startEnrollment(friendlyName?: string): Promise<MfaEnrollmentHandle> {
    try {
      const existing = await this.listFactors()
      const unverified = existing.filter(
        (f) => f.status === "unverified" && f.factorType === "totp"
      )
      for (const f of unverified) {
        try {
          await this.unenroll(f.id)
        } catch {
          // Non-fatal — if Supabase rejects cleanup, the caller still
          // gets to try enroll; we just won't have prevented the
          // collision below.
        }
      }
    } catch {
      // If listing factors fails we proceed to enroll anyway — the
      // caller will surface whatever error comes back from enroll.
    }

    // We deliberately DON'T pass a default friendly name. A custom
    // name can still be supplied for the explicit "add another
    // device" flow, but the default path uses GoTrue's own unique
    // identifier so collisions never land on a fixed label.
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      ...(friendlyName ? { friendlyName } : {}),
    })
    if (error) throw error
    return {
      factorId: data.id,
      qrSvg: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    }
  },

  /**
   * Verifies a 6-digit code against an in-progress enrollment. On
   * success the factor transitions to `verified` and the session
   * upgrades to aal2.
   */
  async verifyEnrollment(factorId: string, code: string): Promise<void> {
    // challengeAndVerify bundles the create-challenge + verify
    // round-trip Supabase would otherwise require as two calls.
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    })
    if (error) throw error
  },

  /** Remove a factor (verified or unverified). */
  async unenroll(factorId: string): Promise<void> {
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    if (error) throw error
  },

  /**
   * True when the user has a verified factor and the current session
   * isn't yet aal2 — i.e. login isn't complete until they TOTP.
   * The login form uses this right after password sign-in to decide
   * whether to show the code-entry step.
   *
   * Uses `listFactors` as the source of truth rather than relying
   * solely on `getAuthenticatorAssuranceLevel`. The AAL helper reads
   * from the JWT, and right after `signInWithPassword` resolves the
   * new token hasn't always propagated — we were hitting a race
   * where the stale `aal2` carried over from a prior enrollment
   * session told us no challenge was needed and the user breezed
   * straight into the dashboard.
   */
  async isChallengeRequired(): Promise<boolean> {
    const factors = await this.listFactors()
    const hasVerified = factors.some((f) => f.status === "verified" && f.factorType === "totp")
    let aalCurrent: string | null = null
    let aalNext: string | null = null
    try {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      aalCurrent = data?.currentLevel ?? null
      aalNext = data?.nextLevel ?? null
    } catch (err) {
      console.error("[mfa] AAL probe failed", err)
    }
    console.log("[mfa] isChallengeRequired probe", {
      factorCount: factors.length,
      hasVerified,
      aalCurrent,
      aalNext,
    })
    if (!hasVerified) return false
    // Factor exists — only skip if we can confirm the CURRENT
    // session is already aal2.
    if (aalCurrent === "aal2") return false
    return true
  },

  /**
   * Finds the primary verified TOTP factor to challenge, or null if
   * the user isn't enrolled. Currently returns the first verified
   * factor — multi-factor pick-one UX is a future enhancement.
   */
  async getPrimaryFactor(): Promise<MfaFactor | null> {
    const factors = await this.listFactors()
    return factors.find((f) => f.status === "verified") ?? null
  },

  /**
   * Verifies a login-time TOTP code. Upgrades the session to aal2.
   */
  async challengeLogin(factorId: string, code: string): Promise<void> {
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    })
    if (error) throw error
  },
}
