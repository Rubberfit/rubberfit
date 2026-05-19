-- Seed the plans catalog for local dev + e2e fixtures.
-- The subscriptions.plan_id NOT NULL FK to plans means tests can't insert
-- subscription rows until plans is populated. supabase start / db reset
-- auto-executes this file.
--
-- plans.code is unique (3 tier rows). The billing_interval column on plans uses
-- 'month' / 'year' (singular form); subscriptions carry their own billing_interval
-- using 'monthly' / 'annual' (the suffix form). The two vocabularies live in
-- separate CHECK constraints — don't unify them.
INSERT INTO public.plans (code, name, price_cents, currency, billing_interval, stripe_price_id, sort_order)
VALUES
  ('standard', 'Standard',  4900, 'USD', 'month', 'price_standard_monthly_test', 10),
  ('pro',      'Pro',       9900, 'USD', 'month', 'price_pro_monthly_test',      20),
  ('max',      'Max',      19900, 'USD', 'month', 'price_max_monthly_test',      30)
ON CONFLICT (code) DO NOTHING;
