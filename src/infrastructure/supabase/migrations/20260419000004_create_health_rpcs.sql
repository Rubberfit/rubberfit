-- Migration: 20260419000001_create_health_rpcs.sql
--
-- All public RPC functions for the admin health monitoring system.
-- Tables and views are defined in 20260418000001_create_admin_tables.sql.
--
-- Functions:
--   get_health_endpoints_with_status  — active endpoints + uptime metrics (UI + cron engine)
--   get_health_timeseries             — last N response_ms values for sparkline charts
--   get_open_alert_for_service        — alert deduplication: find open alert for a service
--   get_health_endpoint_ids           — endpoint IDs + last known status for a name list
--   record_health_checks              — bulk-insert check results (cron engine write path)
--   get_health_status                 — uptime summary for a list of service names
--   get_health_incidents              — recent status-transition events (incident timeline)
--   get_recent_health_checks          — latest N check rows across all endpoints
--   get_all_endpoint_uptime           — uptime aggregates for all active endpoints
--   get_all_health_timeseries         — last N timeseries points partitioned by service


-- ── get_health_endpoints_with_status ─────────────────────────────────────────
-- Returns all active endpoints with full check config and live uptime metrics.
-- Used by the health dashboard (authenticated) and the cron check engine
-- (service_role). Unified replacement for the former get_active_health_endpoints.

CREATE OR REPLACE FUNCTION public.get_health_endpoints_with_status()
RETURNS TABLE (
  id                  UUID,
  service_name        TEXT,
  description         TEXT,
  method              TEXT,
  url                 TEXT,
  tier                TEXT,
  check_type          TEXT,
  interval_seconds    INTEGER,
  expected_status     SMALLINT,
  secret_ref          TEXT,
  is_active           BOOLEAN,
  current_status      TEXT,
  last_checked_at     TIMESTAMPTZ,
  avg_response_ms_24h NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = admin, public
AS $$
  SELECT
    he.id,
    he.service_name,
    he.description,
    he.method,
    he.url,
    he.tier,
    he.check_type,
    he.interval_seconds,
    he.expected_status,
    he.secret_ref,
    he.is_active,
    eu.current_status,
    eu.last_checked_at,
    eu.avg_response_ms_24h
  FROM  admin.health_endpoints he
  LEFT JOIN admin.endpoint_uptime eu ON eu.service_name = he.service_name
  WHERE he.is_active = TRUE
  ORDER BY he.tier, he.service_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_health_endpoints_with_status()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_health_endpoints_with_status IS
  'Returns all active endpoints with full check config and live uptime metrics. '
  'Callable by both the health dashboard (authenticated) and the cron engine (service_role).';


-- ── get_health_timeseries ─────────────────────────────────────────────────────
-- Last N response_ms values for a single service — used to render sparkline charts.

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
  FROM   admin.health_checks hc
  JOIN   admin.health_endpoints e ON e.id = hc.endpoint_id
  WHERE  e.service_name = p_service_name
    AND  e.is_active    = TRUE
  ORDER  BY hc.checked_at DESC
  LIMIT  p_points;
$$;

GRANT EXECUTE ON FUNCTION public.get_health_timeseries(TEXT, INT)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_health_timeseries IS
  'Returns the last N (checked_at, response_ms, status) rows for one service, '
  'ordered newest-first. Used to populate sparkline charts.';


-- ── get_open_alert_for_service ────────────────────────────────────────────────
-- Alert deduplication: returns the most recent active/investigating alert for
-- a service so the cron engine can avoid opening duplicate alerts.

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

GRANT EXECUTE ON FUNCTION public.get_open_alert_for_service(TEXT)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_open_alert_for_service IS
  'Returns the most recent open (active or investigating) alert for a service. '
  'Used by the cron engine for alert deduplication before opening a new incident.';


-- ── get_health_endpoint_ids ───────────────────────────────────────────────────
-- Returns endpoint IDs and last-known status for a list of service names.
-- Used by the check runner to resolve names → IDs before writing health_checks.

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

GRANT EXECUTE ON FUNCTION public.get_health_endpoint_ids(TEXT[])
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_health_endpoint_ids IS
  'Returns endpoint IDs and last-known status for the given service names. '
  'SECURITY DEFINER so callers do not need direct admin schema access.';


-- ── record_health_checks ──────────────────────────────────────────────────────
-- Bulk-inserts health check results. Called by the cron edge function after
-- each check round; avoids exposing the admin schema to the client.

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

GRANT EXECUTE ON FUNCTION public.record_health_checks(JSONB)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.record_health_checks IS
  'Bulk-inserts health check rows into admin.health_checks. '
  'SECURITY DEFINER so the Next.js API route can write without direct schema access.';


-- ── get_health_status ─────────────────────────────────────────────────────────
-- Returns uptime aggregates and current status for a list of service names.
-- Thin wrapper over admin.endpoint_uptime for filtered queries.

CREATE OR REPLACE FUNCTION public.get_health_status(p_names TEXT[])
RETURNS TABLE (
  endpoint_id         UUID,
  service_name        TEXT,
  tier                TEXT,
  uptime_24h          NUMERIC,
  uptime_7d           NUMERIC,
  uptime_30d          NUMERIC,
  avg_response_ms_24h NUMERIC,
  last_checked_at     TIMESTAMPTZ,
  current_status      TEXT
)
SECURITY DEFINER
SET search_path = admin, public, pg_catalog
LANGUAGE sql STABLE AS $$
  SELECT
    endpoint_id, service_name, tier,
    uptime_24h, uptime_7d, uptime_30d,
    avg_response_ms_24h, last_checked_at, current_status
  FROM admin.endpoint_uptime
  WHERE service_name = ANY(p_names);
$$;

GRANT EXECUTE ON FUNCTION public.get_health_status(TEXT[])
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_health_status IS
  'Returns uptime aggregates and current status from admin.endpoint_uptime '
  'for the given service names.';


-- ── get_health_incidents ──────────────────────────────────────────────────────
-- Recent status-transition events for an incident timeline feed.

CREATE OR REPLACE FUNCTION public.get_health_incidents(
  p_names TEXT[],
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  checked_at   TIMESTAMPTZ,
  service_name TEXT,
  status       TEXT,
  detail       TEXT
)
SECURITY DEFINER
SET search_path = admin, public, pg_catalog
LANGUAGE sql STABLE AS $$
  SELECT hc.checked_at, e.service_name, hc.status, hc.detail
  FROM   admin.health_checks hc
  JOIN   admin.health_endpoints e ON e.id = hc.endpoint_id
  WHERE  hc.is_transition = TRUE
    AND  e.service_name   = ANY(p_names)
  ORDER  BY hc.checked_at DESC
  LIMIT  p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_health_incidents(TEXT[], INT)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_health_incidents IS
  'Returns the most recent status-transition rows for the given service names, '
  'ordered newest-first. Used to build the incident timeline.';


-- ── get_recent_health_checks ──────────────────────────────────────────────────
-- Latest N check rows across all endpoints — used by the "Recent Checks" panel.

CREATE OR REPLACE FUNCTION public.get_recent_health_checks(p_limit INT DEFAULT 50)
RETURNS TABLE (
  id            BIGINT,
  service_name  TEXT,
  checked_at    TIMESTAMPTZ,
  status        TEXT,
  response_ms   INTEGER,
  http_status   SMALLINT,
  detail        TEXT,
  is_transition BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = admin, public
AS $$
  SELECT hc.id, he.service_name, hc.checked_at, hc.status,
         hc.response_ms, hc.http_status, hc.detail, hc.is_transition
  FROM   admin.health_checks hc
  JOIN   admin.health_endpoints he ON he.id = hc.endpoint_id
  ORDER  BY hc.checked_at DESC
  LIMIT  p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_recent_health_checks(INT)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_recent_health_checks IS
  'Returns the most recent N health check rows across all endpoints, ordered '
  'newest-first. Includes is_transition flag for incident highlighting.';


-- ── get_all_endpoint_uptime ───────────────────────────────────────────────────
-- Uptime aggregates for every active endpoint — used by the status overview panel.

CREATE OR REPLACE FUNCTION public.get_all_endpoint_uptime()
RETURNS TABLE (
  service_name        TEXT,
  uptime_24h          NUMERIC,
  uptime_7d           NUMERIC,
  uptime_30d          NUMERIC,
  avg_response_ms_24h NUMERIC,
  last_checked_at     TIMESTAMPTZ,
  current_status      TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = admin, public
AS $$
  SELECT service_name, uptime_24h, uptime_7d, uptime_30d,
         avg_response_ms_24h, last_checked_at, current_status
  FROM   admin.endpoint_uptime;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_endpoint_uptime()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_all_endpoint_uptime IS
  'Returns uptime percentages (24h / 7d / 30d), average response time, and '
  'current status for every active endpoint. Thin wrapper over admin.endpoint_uptime.';


-- ── get_all_health_timeseries ─────────────────────────────────────────────────
-- Last N timeseries points for every service in a single query — used to
-- populate all sparklines in one round-trip instead of N individual calls.

CREATE OR REPLACE FUNCTION public.get_all_health_timeseries(p_points INT DEFAULT 24)
RETURNS TABLE (
  service_name TEXT,
  response_ms  INTEGER,
  checked_at   TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = admin, public
AS $$
  SELECT sub.service_name, sub.response_ms, sub.checked_at
  FROM (
    SELECT he.service_name, hc.response_ms, hc.checked_at,
           ROW_NUMBER() OVER (PARTITION BY he.service_name ORDER BY hc.checked_at DESC) AS rn
    FROM   admin.health_checks hc
    JOIN   admin.health_endpoints he ON he.id = hc.endpoint_id
  ) sub
  WHERE sub.rn <= p_points
  ORDER BY sub.service_name, sub.checked_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_health_timeseries(INT)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_all_health_timeseries IS
  'Returns the last N timeseries points for all services in one query, '
  'partitioned by service_name and ordered chronologically. Used to populate sparklines.';
