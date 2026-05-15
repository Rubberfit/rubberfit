"""One-shot generator for the invitations workflow .docx.

Usage:
    python scripts/generate-invitations-workflow-docx.py

Writes invitations-workflow.docx at the repo root.
"""

from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.shared import Inches, Pt, RGBColor


def add_heading(doc, text, level):
    h = doc.add_heading(text, level=level)
    for run in h.runs:
        run.font.color.rgb = RGBColor(0x11, 0x18, 0x27)


def add_para(doc, text):
    doc.add_paragraph(text)


def add_bullet(doc, text):
    doc.add_paragraph(text, style="List Bullet")


def add_number(doc, text):
    doc.add_paragraph(text, style="List Number")


def add_code(doc, text):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.name = "Consolas"
    run.font.size = Pt(10)


def add_table(doc, headers, rows):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Light Grid Accent 1"
    table.alignment = WD_TABLE_ALIGNMENT.LEFT

    hdr = table.rows[0].cells
    for i, header in enumerate(headers):
        hdr[i].text = header
        for run in hdr[i].paragraphs[0].runs:
            run.bold = True

    for r, row in enumerate(rows, start=1):
        cells = table.rows[r].cells
        for c, value in enumerate(row):
            cells[c].text = value


def build():
    doc = Document()

    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.9)
        section.right_margin = Inches(0.9)

    title = doc.add_heading("Invitations Workflow", level=0)
    for run in title.runs:
        run.font.color.rgb = RGBColor(0x11, 0x18, 0x27)

    intro = doc.add_paragraph()
    intro.add_run(
        "End-to-end flow for tenant-membership invitations in rema-portal. "
        "Covers the admin-side create / resend / revoke surface, the public "
        "/invite/[token] landing, the atomic accept transaction, and the two "
        "SECURITY DEFINER RPCs that bridge the new-user RLS gap."
    ).italic = True

    add_heading(doc, "1. Admin invites someone", 1)
    add_para(doc, "Path: /dashboard/admin/members -> Invite a new member form.")
    add_number(doc, "Form submits { email, roles[] } to the inviteMember server action (app/actions/invitations.ts).")
    add_number(doc, "Action runs requireAuthenticatedUser + requirePermission(actor, manageMembers).")
    add_number(doc, "Resolves CreateInvitationUseCase, which:")
    add_bullet(doc, "Validates email + roles.")
    add_bullet(doc, "Checks for an existing active invitation for (tenantId, email) - returns 409 if found.")
    add_bullet(doc, "Looks up the tenant name (for the email body).")
    add_bullet(doc, "Generates a 32-byte hex token via crypto.randomBytes(32).toString hex.")
    add_bullet(doc, "Computes expiresAt = now + 7 days (APP_CONFIG.INVITATION_EXPIRY_DAYS).")
    add_bullet(doc, "Creates the entity, then IInvitationService.create, then repo INSERT into invitations.")
    add_bullet(doc, "Calls emailService.sendInvitation which renders the React Email template (app/templates/email/invitation.tsx) and dispatches via Resend.")
    add_bullet(doc, "Records the send outcome on the row (recordSendSuccess clears last_send_error; recordSendFailure writes the error message).")
    add_bullet(doc, "Email failure does NOT roll back the row - the admin sees the error inline and can use Resend.")
    add_number(doc, "revalidatePath /dashboard/admin/members refreshes the page; new row appears in the pending table.")

    add_heading(doc, "2. Email arrives", 1)
    add_para(doc, "The recipient gets a styled email with their tenant name, inviter, roles, expiry date, and a single CTA button:")
    add_code(doc, "https://app.../invite/<token>")

    add_heading(doc, "3. Recipient lands on /invite/[token] (public route)", 1)
    add_para(doc, "/invite is on the PUBLIC_PATHS allowlist (src/middleware/auth-allowlist.ts), so the proxy does not redirect.")
    add_para(doc, "The page (app/invite/[token]/page.tsx) does two reads in parallel:")
    add_bullet(doc, "getOptionalUser - soft session check (does NOT require memberships, so brand-new users do not get bounced).")
    add_bullet(doc, "invitationService.findPublicViewByToken(token) - calls the get_invitation_by_token SECURITY DEFINER RPC (in 20260515000002_invitation_lookup_rpc.sql). Bypasses RLS because brand-new users have no memberships - knowing the token is the auth.")
    add_para(doc, "Then branches:")
    add_table(
        doc,
        ["State", "What renders"],
        [
            ["Token not found", "Invitation not found + sign-in link"],
            ["accepted_at set", "Already accepted"],
            ["revoked_at set", "Invitation revoked"],
            ["expires_at < now", "Invitation expired"],
            ["Signed out", "Tenant + email shown; Sign in + Create account buttons, both with ?redirectTo=/invite/<token>"],
            ["Signed in, wrong email", "Wrong account + sign-in link to switch"],
            ["Signed in, email matches", "AcceptInvitationCta - single Accept button"],
        ],
    )

    add_heading(doc, "4. Sign-up / sign-in detour (if signed out)", 1)
    add_bullet(doc, "Sign in -> /login?redirectTo=/invite/<token>. Existing login already honors redirectTo. After auth -> back to invite page.")
    add_bullet(doc, "Create account -> /register?redirectTo=/invite/<token>. Updated register form forwards redirectTo to login after signup. After verify + sign-in -> invite page.")

    add_heading(doc, "5. Recipient clicks Accept", 1)
    add_para(doc, "AcceptInvitationCta calls the acceptInvitation({ token }) server action.")
    add_para(doc, "The action runs requireAuthenticatedUser (no permission gate - the token IS the authorization) and resolves AcceptInvitationUseCase, which calls invitationService.acceptByToken(token) -> repo -> accept_invitation(p_token) RPC.")
    add_para(doc, "The RPC (20260515000001_accept_invitation_rpc.sql) is SECURITY DEFINER and runs both writes in one transaction:")
    add_number(doc, "Validates: auth required -> token exists -> not accepted -> not revoked -> not expired -> auth.users.email matches invitations.email (case-insensitive).")
    add_number(doc, "INSERT INTO memberships ON CONFLICT (tenant_id, profile_id) DO UPDATE - fresh membership, or resurrects a soft-deleted one.")
    add_number(doc, "UPDATE invitations SET accepted_at = now.")
    add_number(doc, "Returns (membership_id, tenant_id).")
    add_para(doc, "Failures raise custom SQLSTATEs P0001-P0006 so the use case discriminates: not_found / already_accepted / revoked / expired / email_mismatch / unknown.")

    add_heading(doc, "6. Action finishes the handoff", 1)
    add_para(doc, "On success, the action:")
    add_bullet(doc, "Sets the rema_active_tenant cookie to the new tenantId (buildActiveTenantCookieOptions).")
    add_bullet(doc, "revalidatePath / layout so RSC re-fetches with the new membership active.")
    add_para(doc, "The CTA pushes the browser to /dashboard and the user is in.")

    add_heading(doc, "7. Resend / Revoke", 1)
    add_para(doc, "From the pending-invitations table:")
    add_bullet(doc, "Resend -> resendInvitation({ id }) -> ResendInvitationUseCase -> re-dispatch email + record outcome. Refuses accepted/revoked/expired (409).")
    add_bullet(doc, "Revoke -> revokeInvitation({ id }) -> RevokeInvitationUseCase -> entity .revoke -> update. Refuses accepted (409). Idempotent on already-revoked.")
    add_para(doc, "Both revalidate the page.")

    add_heading(doc, "Two SECURITY DEFINER RPCs explained", 1)
    add_table(
        doc,
        ["RPC", "Caller", "Why DEFINER"],
        [
            [
                "get_invitation_by_token",
                "Public page (anon or authenticated)",
                "Brand-new user cannot read invitations (RLS scopes to inviting tenant members). Token possession is the auth.",
            ],
            [
                "accept_invitation",
                "Authenticated user only",
                "Same chicken-and-egg for memberships INSERT: an invitee without memberships cannot pass RLS write check. Also gives transactional atomicity for the two-table mutation.",
            ],
        ],
    )
    add_para(
        doc,
        "Both omit admin-only fields (invited_by, last_send_error) and the accept one extra-validates the email match against auth.users.email so a stolen token alone cannot be redeemed by the wrong account.",
    )

    add_heading(doc, "Key files", 1)
    add_table(
        doc,
        ["Concern", "Path"],
        [
            ["Server actions", "app/actions/invitations.ts"],
            ["Create use case", "src/application/use-cases/invitations/create-invitation.use-case.ts"],
            ["Resend use case", "src/application/use-cases/invitations/resend-invitation.use-case.ts"],
            ["Revoke use case", "src/application/use-cases/invitations/revoke-invitation.use-case.ts"],
            ["Accept use case", "src/application/use-cases/invitations/accept-invitation.use-case.ts"],
            ["Invitation entity", "src/entities/invitation.ts"],
            ["Repository", "src/infrastructure/repositories/invitations.repository.ts"],
            ["Service", "src/infrastructure/services/invitationService.ts"],
            ["Email template", "app/templates/email/invitation.tsx"],
            ["Email send", "src/infrastructure/services/emailService.ts (sendInvitation)"],
            ["Admin members page", "app/dashboard/admin/members/page.tsx"],
            ["Public accept page", "app/invite/[token]/page.tsx"],
            ["Accept CTA (client)", "app/invite/[token]/_components/accept-invitation-cta.tsx"],
            ["Soft auth helper", "app/server/auth/require-authenticated-user.ts (getOptionalUser)"],
            ["Public route allowlist", "src/middleware/auth-allowlist.ts"],
            ["Permission entry", "src/application/permissions.ts (manageMembers)"],
            ["accept_invitation RPC", "src/infrastructure/supabase/migrations/20260515000001_accept_invitation_rpc.sql"],
            ["get_invitation_by_token RPC", "src/infrastructure/supabase/migrations/20260515000002_invitation_lookup_rpc.sql"],
            ["Schema (invitations table)", "src/infrastructure/supabase/migrations/20260509000001_invitations.sql"],
        ],
    )

    return doc


def main():
    repo_root = Path(__file__).resolve().parent.parent
    out = repo_root / "invitations-workflow.docx"
    build().save(out)
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
