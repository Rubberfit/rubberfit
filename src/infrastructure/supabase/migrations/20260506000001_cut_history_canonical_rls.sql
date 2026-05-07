-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260506000001_cut_history_canonical_rls.sql
-- ARC-135 + ARC-143 + ARC-144 (Bundle 1): bring cut_history to its
-- canonical 5-policy write-once shape.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Why this migration exists:
--   ARC-135 [ASVS 8.2.2]: 20260412055559_add_cut_history.sql declared
--     `cut_history_update_own` as `FOR INSERT` instead of `FOR UPDATE`,
--     so the policy actually acted as the table's only INSERT capability.
--     20260420000001_cut_history_pdf_uploads.sql later DROP'd and
--     recreated it as `FOR UPDATE`, but that left the table without any
--     INSERT policy at all.
--
--   ARC-143: 20260412055559 created two DELETE policies with identical
--     USING clauses — `admins_managers_delete_cut_history` (misnamed,
--     omits 'supervisor') and `cut_history_delete_privileged`. The first
--     is a redundant duplicate.
--
--   ARC-144: 20260412055550_create_cut_history.sql ENABLEs RLS but
--     defines no policies — the policies live in 055559. Partial-apply
--     risk: if 055550 lands without 055559, the table is fully locked.
--
-- Design call (Bundle 1): cut_history is treated as a write-once
-- immutable log. The "PDF first, INSERT second" save flow in
-- app/actions/cut-history.ts populates pdf_url at INSERT time so no
-- UPDATE path is needed. Eliminating the UPDATE policy enforces the
-- contract at the database layer instead of relying on convention.
--
-- Final canonical policy set on cut_history (5 policies, no UPDATE):
--   - cut_history_select_own           (own SELECT)            ← from 055559, kept
--   - cut_history_select_all           (privileged SELECT)     ← from 055559, kept
--   - cut_history_insert_own           (own INSERT)            ← created here
--   - users_delete_own_cut_history     (own DELETE)            ← from 055559, kept
--   - cut_history_delete_privileged    (privileged DELETE)     ← from 055559, kept
--
-- Safe on:
--   - production (had the misnamed dup + the FOR UPDATE policy from
--     20260420000001 — both dropped; INSERT policy created)
--   - fresh local DBs (state after 055559 + 20260420000001 matches prod)
--   - any partial-state env (every operation is idempotent: DROP IF EXISTS,
--     and the CREATE is preceded by its own DROP IF EXISTS)
-- ─────────────────────────────────────────────────────────────────────────────

-- ARC-143: drop the misnamed duplicate of cut_history_delete_privileged.
DROP POLICY IF EXISTS admins_managers_delete_cut_history ON cut_history;

-- ARC-135 + write-once design: drop the FOR UPDATE policy added by
-- 20260420000001. cut_history rows are immutable once inserted.
DROP POLICY IF EXISTS cut_history_update_own ON cut_history;

-- ARC-135: explicit INSERT policy. Replaces the role formerly played by
-- the misnamed `cut_history_update_own FOR INSERT` from 055559.
DROP POLICY IF EXISTS cut_history_insert_own ON cut_history;
CREATE POLICY cut_history_insert_own
  ON cut_history FOR INSERT
  WITH CHECK (user_id = auth.uid());
