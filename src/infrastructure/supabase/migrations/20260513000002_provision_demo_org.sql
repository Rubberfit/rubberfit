-- Migration: 20260513000002_provision_demo_org.sql
-- Provisions the "Rubberfit Demo" organization with an active Enterprise
-- subscription (no Stripe attached) and adds `demo@rubberfit.app` as
-- its owner-tier member. This bypasses the subscription gate for the
-- shared demo account we hand out to prospective customers / partners.
--
-- Pattern: Enterprise-tier organizations are intentionally not connected
-- to Stripe (Q5 in the rollout — sales-team manual provisioning). The
-- subscription gate accepts `status IN ('trialing', 'active')`
-- regardless of Stripe IDs, so a hand-rolled `status='active'` row is
-- functionally identical to a paid Enterprise customer.
--
-- Fully idempotent — ON CONFLICT DO NOTHING / WHERE NOT EXISTS guards
-- every INSERT so reruns are safe and don't duplicate.

DO $$
DECLARE
  demo_user_id  UUID;
  demo_org_id   UUID;
BEGIN
  -- 1. Find the demo user (must already exist in auth.users via the
  -- normal signup flow). If not present, skip — no error so the
  -- migration stays idempotent.
  SELECT id INTO demo_user_id
  FROM auth.users
  WHERE email = 'demo@rubberfit.app'
  LIMIT 1;

  IF demo_user_id IS NULL THEN
    RAISE NOTICE 'demo@rubberfit.app not found in auth.users — skipping demo org provision';
    RETURN;
  END IF;

  -- 2. Find or create the Demo org. Use a stable UUID so reruns find
  -- the existing row rather than minting a duplicate.
  SELECT id INTO demo_org_id
  FROM public.organizations
  WHERE name = 'Rubberfit Demo'
  LIMIT 1;

  IF demo_org_id IS NULL THEN
    demo_org_id := gen_random_uuid();
    INSERT INTO public.organizations (id, name, billing_email, created_by)
    VALUES (demo_org_id, 'Rubberfit Demo', NULL, demo_user_id);
    RAISE NOTICE 'Created Rubberfit Demo organization with id %', demo_org_id;
  ELSE
    RAISE NOTICE 'Rubberfit Demo organization already exists with id %', demo_org_id;
  END IF;

  -- 3. Add the demo user as owner of the Demo org (status=active).
  -- Owner role grants full access to the dashboard + team management.
  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (demo_org_id, demo_user_id, 'owner', 'active')
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  -- 4. Create the active Enterprise subscription row. No Stripe IDs;
  -- the gate accepts `status='active'` regardless. Mark is_current=true
  -- so the partial unique index governs the entitlement read.
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
  SELECT
    demo_org_id,
    NULL,        -- no stripe_subscription_id
    NULL,
    NULL,
    NULL,
    'enterprise',
    NULL,        -- no billing_interval for unmetered Enterprise
    500,         -- generous seat cap; demo never invites real teammates
    'active',
    NULL,
    NOW(),
    NOW() + INTERVAL '100 years',  -- "never expires"
    FALSE,
    TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM public.organization_subscriptions
    WHERE organization_id = demo_org_id AND is_current = TRUE
  );

END $$;
