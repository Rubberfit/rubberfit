/**
 * `EmailService.sendInvitationEmail` render contract.
 *
 * PR 2g locked the email service into a pure transport: the
 * invitation use-cases format the expiry with operator prefs and
 * pass a pre-formatted `expiresAtLabel` string. This test pins the
 * contract:
 *   - the rendered HTML escapes the label
 *   - no `Date.toLocaleDateString` path is exercised (the bug we fixed)
 *   - subject + tags continue to wire through
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const resendSendMock = vi.hoisted(() => vi.fn())
vi.mock("resend", () => {
  // Class-shaped mock so the EmailService's `new Resend(key)` returns
  // an instance whose `.emails.send` is the tracked spy. `vi.fn(impl)`
  // doesn't reliably wire the constructor-return path across Node
  // versions; a literal class is the safe shape.
  class FakeResend {
    public readonly emails = { send: resendSendMock }
  }
  return { Resend: FakeResend }
})

// `getCurrentUserId` is referenced at module-load. Stub it so the
// import is side-effect-free even though we never call methods that
// depend on it.
vi.mock("@/src/infrastructure/services/getCurrentUserId", () => ({
  getCurrentUserId: vi.fn(async () => "00000000-0000-4000-8000-000000000001"),
}))

vi.mock("@/src/infrastructure/models/supabase", () => ({
  supabase: { from: vi.fn() },
  __noopType: undefined,
}))

describe("EmailService.sendInvitationEmail", () => {
  beforeEach(() => {
    resendSendMock.mockReset()
    resendSendMock.mockResolvedValue({ data: { id: "msg_test" }, error: null })
  })

  async function send(opts: {
    expiresAtLabel: string
    organizationName?: string
    inviterName?: string | null
    role?: "admin" | "member"
  }) {
    const { EmailService } = await import("@/src/infrastructure/services/emailService")
    const service = new EmailService()
    return service.sendInvitationEmail({
      to: "invitee@example.com",
      organizationName: opts.organizationName ?? "Acme Rubber",
      role: opts.role ?? "member",
      inviterName: opts.inviterName ?? "alice@example.com",
      inviteUrl: "https://rubberfit.app/invite/tok_test",
      expiresAtLabel: opts.expiresAtLabel,
    })
  }

  it("renders the expiresAtLabel verbatim inside the invitation body", async () => {
    const result = await send({ expiresAtLabel: "22/05/2026" })

    expect(result.success).toBe(true)
    expect(resendSendMock).toHaveBeenCalledTimes(1)
    const sendArg: { html?: string; subject?: string } = resendSendMock.mock.calls[0]?.[0] ?? {}
    expect(sendArg.html).toContain("This invitation expires on 22/05/2026.")
  })

  it("HTML-escapes the expiresAtLabel on insertion (defense-in-depth)", async () => {
    // The closed `SupportedDateFormat` union can't produce metacharacters
    // today, but the email service still escapes on every HTML boundary.
    // If a future label source ever carries `<` / `&` / quotes, the
    // escape keeps the boundary uniform — that's what this guard pins.
    await send({ expiresAtLabel: "<script>alert(1)</script>" })

    const sendArg: { html?: string } = resendSendMock.mock.calls[0]?.[0] ?? {}
    expect(sendArg.html).not.toContain("<script>")
    expect(sendArg.html).toContain("&lt;script&gt;")
  })

  it("does not call any Date / toLocaleDateString path for the expiry", async () => {
    // Spy on Date.prototype.toLocaleDateString to ensure the email
    // service stays a pure transport. If a future regression
    // reintroduces in-service formatting, this fails immediately.
    const localeSpy = vi.spyOn(Date.prototype, "toLocaleDateString")
    try {
      await send({ expiresAtLabel: "2026-05-22" })
      expect(localeSpy).not.toHaveBeenCalled()
    } finally {
      localeSpy.mockRestore()
    }
  })

  it("threads subject + tags through Resend", async () => {
    await send({
      expiresAtLabel: "05/22/2026",
      organizationName: "Acme",
      role: "admin",
    })

    const sendArg: {
      subject?: string
      tags?: ReadonlyArray<{ name: string; value: string }>
    } = resendSendMock.mock.calls[0]?.[0] ?? {}
    expect(sendArg.subject).toBe("You're invited to join Acme on Rubberfit")
    expect(sendArg.tags).toEqual(
      expect.arrayContaining([
        { name: "notification_type", value: "team_invitation" },
        { name: "role", value: "admin" },
      ])
    )
  })
})
