-- Migration: 20260419000001_add_overview_health_endpoints.sql
--
-- Ensures the six Overview-panel services exist in admin.health_endpoints and
-- adds SECURITY DEFINER RPC functions in the public schema so the Next.js API
-- routes can read/write admin-schema tables without requiring PostgREST to
-- expose the admin schema directly.

-- ── 1. Upsert the six Overview service endpoints ──────────────────────────────

INSERT INTO admin.health_endpoints (service_name, description, method, url, tier) VALUES
  ('API Gateway',      'Supabase REST API gateway — lightweight availability check',   'GET',      '/rest/v1/',                        'critical'),
  ('Database Primary', 'PostgreSQL primary — SELECT round-trip via service role',      'INTERNAL', 'internal://db/ping',               'critical'),
  ('Job Queue',        'notification_queue depth and failed-job health',               'INTERNAL', 'internal://notification_queue',    'standard'),
  ('File Storage',     'Supabase Storage — bucket list availability check',            'INTERNAL', 'internal://storage/buckets',       'standard'),
  ('Auth Service',     'Supabase GoTrue — admin listUsers liveness check',             'INTERNAL', 'internal://auth/listUsers',        'critical'),
  ('Email Service',    'Resend API — API key validation via GET /domains',             'GET',      'https://api.resend.com/domains',   'standard')
ON CONFLICT (service_name) DO UPDATE SET
  description = EXCLUDED.description,
  method      = EXCLUDED.method,
  url         = EXCLUDED.url,
  tier        = EXCLUDED.tier,
  updated_at  = NOW();


-- ── 2. RPC: get endpoint IDs + last known status for a list of service names ──

CREATE OR REPLACE FUNCTION public.get_health_endpoint_ids(p_names TEXT[])
RETURNS TABLE (
  id             UUID,
  service_name   TEXT,
  current_status TEXT
)
SECURITY DEFINER
SET search_path = admin, public, pg_catalog
LANGUAGE sql STABLE AS $$
  SELECT
    e.id,
    e.service_name,
    (
      SELECT hc.status
      FROM   admin.health_checks hc
      WHERE  hc.endpoint_id = e.id
      ORDER  BY hc.checked_at DESC
      LIMIT  1
    ) AS current_status
  FROM admin.health_endpoints e
  WHERE e.service_name = ANY(p_names)
    AND e.is_active = TRUE;
$$;

COMMENT ON FUNCTION public.get_health_endpoint_ids IS
  'Returns endpoint IDs and last-known status for the given service names. SECURITY DEFINER so callers do not need admin schema exposure.';

GRANT EXECUTE ON FUNCTION public.get_health_endpoint_ids(TEXT[]) TO authenticated, service_role;


-- ── 3. RPC: insert a batch of health check results ────────────────────────────

CREATE OR REPLACE FUNCTION public.record_health_checks(p_checks JSONB)
RETURNS VOID
SECURITY DEFINER
SET search_path = admin, public, pg_catalog
LANGUAGE plpgsql AS $$
DECLARE
  r JSONB;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_checks)
  LOOP
    INSERT INTO admin.health_checks (
      endpoint_id, status, response_ms, http_status, detail, is_transition
    ) VALUES (
      (r->>'endpoint_id')::UUID,
       r->>'status',
      (r->>'response_ms')::INTEGER,
      (r->>'http_status')::SMALLINT,
       r->>'detail',
      (r->>'is_transition')::BOOLEAN
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.record_health_checks IS
  'Bulk-inserts health check rows into admin.health_checks. SECURITY DEFINER so the Next.js API route can write without direct schema access.';

GRANT EXECUTE ON FUNCTION public.record_health_checks(JSONB) TO authenticated, service_role;


-- ── 4. RPC: uptime summary for a list of service names ───────────────────────

CREATE OR REPLACE FUNCTION public.get_health_status(p_names TEXT[])
RETURNS TABLE (
  endpoint_id        UUID,
  service_name       TEXT,
  tier               TEXT,
  uptime_24h         NUMERIC,
  uptime_7d          NUMERIC,
  uptime_30d         NUMERIC,
  avg_response_ms_24h NUMERIC,
  last_checked_at    TIMESTAMPTZ,
  current_status     TEXT
)
SECURITY DEFINER
SET search_path = admin, public, pg_catalog
LANGUAGE sql STABLE AS $$
  SELECT
    endpoint_id,
    service_name,
    tier,
    uptime_24h,
    uptime_7d,
    uptime_30d,
    avg_response_ms_24h,
    last_checked_at,
    current_status
  FROM admin.endpoint_uptime
  WHERE service_name = ANY(p_names);
$$;

COMMENT ON FUNCTION public.get_health_status IS
  'Returns uptime aggregates and current status from admin.endpoint_uptime for the given service names.';

GRANT EXECUTE ON FUNCTION public.get_health_status(TEXT[]) TO authenticated, service_role;


-- ── 5. RPC: recent incident (transition) events ───────────────────────────────

CREATE OR REPLACE FUNCTION public.get_health_incidents(p_names TEXT[], p_limit INT DEFAULT 20)
RETURNS TABLE (
  checked_at   TIMESTAMPTZ,
  service_name TEXT,
  status       TEXT,
  detail       TEXT
)
SECURITY DEFINER
SET search_path = admin, public, pg_catalog
LANGUAGE sql STABLE AS $$
  SELECT
    hc.checked_at,
    e.service_name,
    hc.status,
    hc.detail
  FROM admin.health_checks hc
  JOIN admin.health_endpoints e ON e.id = hc.endpoint_id
  WHERE hc.is_transition = TRUE
    AND e.service_name   = ANY(p_names)
  ORDER BY hc.checked_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.get_health_incidents IS
  'Returns the most recent status-transition rows (is_transition=true) for the given service names, ordered newest-first.';

GRANT EXECUTE ON FUNCTION public.get_health_incidents(TEXT[], INT) TO authenticated, service_role;
