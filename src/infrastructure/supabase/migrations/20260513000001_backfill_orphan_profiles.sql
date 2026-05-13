-- Migration: 20260513000001_backfill_orphan_profiles.sql
-- Backfills `profiles` rows for any `auth.users` that don't have one.
--
-- Root cause: a user authenticated via Google OAuth hit the v1.3.0 lock
-- screen (`/checkout?intent=needs_workspace`) and got a 500 because
-- `requireAuthenticatedUser()` couldn't find their profile row. The
-- `handle_new_user()` trigger only fires on INSERT into `auth.users`,
-- so any user whose `auth.users` row predates the trigger (or whose
-- trigger run errored silently for some reason) is orphaned at this
-- point and re-signing in doesn't trigger a backfill.
--
-- This migration is idempotent (ON CONFLICT DO NOTHING) — safe to
-- apply multiple times.

INSERT INTO public.profiles (id, full_name, email, roles, super_admin, is_deleted)
SELECT
  u.id,
  u.raw_user_meta_data ->> 'full_name',
  u.email,
  ARRAY['member']::TEXT[],
  FALSE,
  FALSE
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
  AND u.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;
