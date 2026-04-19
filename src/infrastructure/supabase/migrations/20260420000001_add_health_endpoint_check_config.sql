-- ── 1. Add check configuration columns to admin.health_endpoints ─────────────
--
-- check_type: which adapter the cron engine uses for this endpoint
--   'http'     → plain HTTP fetch to endpoint.url, validates status code
--   'db'       → internal Supabase DB round-trip (profiles SELECT)
--   'storage'  → internal Supabase Storage bucket list
--   'auth'     → internal Supabase Auth admin.listUsers
--   'queue'    → internal notification_queue depth check
--
-- interval_seconds: per-endpoint override; NULL = use tier default
--   (critical → 300s, standard → 900s, extended → 1800s)
--
-- expected_status: HTTP status code treated as "operational" (default 200)
--   Only meaningful for check_type='http'. NULL = any 2xx is operational.

ALTER TABLE admin.health_endpoints
  ADD COLUMN IF NOT EXISTS check_type       TEXT     NOT NULL DEFAULT 'http'
    CHECK (check_type IN ('http', 'db', 'storage', 'auth', 'queue')),
  ADD COLUMN IF NOT EXISTS interval_seconds INTEGER  CHECK (interval_seconds IS NULL OR interval_seconds > 0),
  ADD COLUMN IF NOT EXISTS expected_status  SMALLINT DEFAULT 200;

-- Back-fill check_type for the seeded internal endpoints
UPDATE admin.health_endpoints SET check_type = 'db'      WHERE service_name IN ('Database Primary', 'Supabase DB');
UPDATE admin.health_endpoints SET check_type = 'storage' WHERE service_name = 'File Storage';
UPDATE admin.health_endpoints SET check_type = 'auth'    WHERE service_name IN ('Auth Service', 'Supabase Auth');
UPDATE admin.health_endpoints SET check_type = 'queue'   WHERE service_name = 'Job Queue';
-- Remaining rows ('API Gateway', 'Email Service', 'Supabase Edge Functions', etc.) keep check_type='http'

-- ── 2. RPC: last N response_ms values for sparkline charts ───────────────────

CREATE OR REPLACE FUNCTION public.get_health_timeseries(
  p_service_name TEXT,
  p_points       INT DEFAULT 24
)
RETURNS TABLE (
  checked_at  TIMESTAMPTZ,
  response_ms INTEGER,
  status      TEXT
)
SECURITY DEFINER
SET search_path = admin, public, pg_catalog
LANGUAGE sql STABLE AS $$
  SELECT hc.checked_at, hc.response_ms, hc.status
  FROM   admin.health_checks  hc
  JOIN   admin.health_endpoints e ON e.id = hc.endpoint_id
  WHERE  e.service_name = p_service_name
    AND  e.is_active    = TRUE
  ORDER  BY hc.checked_at DESC
  LIMIT  p_points;
$$;

GRANT EXECUTE ON FUNCTION public.get_health_timeseries(TEXT, INT) TO authenticated, service_role;

-- ── 3. RPC: alert deduplication — find open alert for a service ───────────────

CREATE OR REPLACE FUNCTION public.get_open_alert_for_service(
  p_service_name TEXT
)
RETURNS TABLE (
  id     UUID,
  status TEXT
)
SECURITY DEFINER
SET search_path = admin, public, pg_catalog
LANGUAGE sql STABLE AS $$
  SELECT id, status
  FROM   admin.alerts
  WHERE  service_name = p_service_name
    AND  status IN ('active', 'investigating')
  ORDER  BY triggered_at DESC
  LIMIT  1;
$$;

GRANT EXECUTE ON FUNCTION public.get_open_alert_for_service(TEXT) TO authenticated, service_role;

-- ── 4. RPC: all active endpoints with check config (used by cron engine) ──────
--
-- Only callable by service_role so the cron route (which uses service-role key)
-- can read full endpoint config without going through the authenticated path.

CREATE OR REPLACE FUNCTION public.get_active_health_endpoints()
RETURNS TABLE (
  id               UUID,
  service_name     TEXT,
  check_type       TEXT,
  method           TEXT,
  url              TEXT,
  tier             TEXT,
  interval_seconds INTEGER,
  expected_status  SMALLINT,
  secret_ref       TEXT,
  current_status   TEXT
)
SECURITY DEFINER
SET search_path = admin, public, pg_catalog
LANGUAGE sql STABLE AS $$
  SELECT
    e.id,
    e.service_name,
    e.check_type,
    e.method,
    e.url,
    e.tier,
    e.interval_seconds,
    e.expected_status,
    e.secret_ref,
    (
      SELECT hc.status
      FROM   admin.health_checks hc
      WHERE  hc.endpoint_id = e.id
      ORDER  BY hc.checked_at DESC
      LIMIT  1
    ) AS current_status
  FROM admin.health_endpoints e
  WHERE e.is_active = TRUE;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_health_endpoints() TO service_role;
