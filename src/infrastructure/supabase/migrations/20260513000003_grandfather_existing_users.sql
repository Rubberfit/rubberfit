-- Migration: 20260513000003_grandfather_existing_users.sql
-- Grandfathers every CURRENT auth.user into a free personal Enterprise
-- organization so the v1.3.0 subscription gate doesn't bounce them
-- onto Stripe Checkout. From this migration forward, only NEW signups
-- (auth.users rows created AFTER this runs) hit the paywall.
--
-- Pattern: each existing user gets their own personal org (one per
-- user, not a shared "Legacy" pool) so existing per-user data stays
-- attached to its owner once we eventually migrate data to be
-- org-scoped. Demo account (already in Rubberfit Demo via prior
-- migration) is skipped via the NOT EXISTS guard.
--
-- Idempotent — reruns are no-ops because of the WHERE NOT EXISTS
-- guards on every INSERT.

DO $$
DECLARE
  rec       RECORD;
  new_org   UUID;
  org_name  TEXT;
BEGIN
  FOR rec IN
    SELECT u.id, u.email, u.raw_user_meta_data
    FROM auth.users u
    LEFT JOIN public.organization_members om ON om.user_id = u.id
    WHERE u.email IS NOT NULL
      AND om.user_id IS NULL
  LOOP
    -- Prefer "{full_name}'s workspace" when full_name is present,
    -- otherwise fall back to "{email-local-part}'s workspace".
    org_name := COALESCE(
      NULLIF(TRIM(rec.raw_user_meta_data ->> 'full_name'), '') || '''s workspace',
      SPLIT_PART(rec.email, '@', 1) || '''s workspace'
    );

    new_org := gen_random_uuid();
    INSERT INTO public.organizations (id, name, billing_email, created_by)
    VALUES (new_org, org_name, rec.email, rec.id);

    INSERT INTO public.organization_members (organization_id, user_id, role, status)
    VALUES (new_org, rec.id, 'owner', 'active');

    INSERT INTO public.organization_subscriptions (
      organization_id,
      stripe_subscription_id,
      stripe_subscription_item_id,
      stripe_price_id,
      stripe_product_id,
      plan_tier,
      billing_interval,
      seat_count,
      status,
      trial_end,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      is_current
    )
    VALUES (
      new_org,
      NULL, NULL, NULL, NULL,
      'enterprise',
      NULL,
      500,
      'active',
      NULL,
      NOW(),
      NOW() + INTERVAL '100 years',
      FALSE,
      TRUE
    );

    RAISE NOTICE 'Grandfathered user % (%) into org % (%)', rec.email, rec.id, org_name, new_org;
  END LOOP;
END $$;
