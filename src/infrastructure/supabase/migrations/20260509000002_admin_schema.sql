-- ═══════════════════════════════════════════════════════════════════════════
-- ARC-25 — File 12: Admin schema (platform-level ops dashboard)
-- ═══════════════════════════════════════════════════════════════════════════
-- The admin.* schema holds tables and views that power the internal ops
-- dashboard: health monitoring, deployment log, alert lifecycle, and an
-- append-only activity audit log. These are NOT tenant-scoped — they're
-- platform-level operational data, gated to platform admins only.
--
-- Ported from dev's 20260417230040 + 20260418000001 + 20260418000002 +
-- 20260419000004 migrations, with two major adaptations:
--
--   1. Access model: dev's admin.is_admin() used has_any_role(...) which
--      was tenant-aware. Here it uses auth_is_platform_admin() — the
--      admin dashboard is for cross-tenant ops, not for tenant admins.
--   2. Cross-schema views: dev queried `rolls.remaining_length` (inches
--      float). 111 uses `rolls.remaining_length_mm` (integer mm). The
--      low-stock view is rewritten to compute area in sqm and compare to
--      `reorder_rules.reorder_point_sqm`.
--
-- Tables (all in admin schema):
--   admin.health_endpoints     — configured services to monitor
--   admin.health_checks        — uptime ping results
--   admin.deployment_log       — deployment events
--   admin.alerts               — alert lifecycle
--   admin.admin_activity_log   — append-only audit trail
--
-- Views (cross-schema reads from public.*):
--   admin.endpoint_uptime
--   admin.public_low_stock_summary
--   admin.public_notification_queue_depth
--
-- Public RPCs that read admin tables (callable by authenticated + service_role):
--   public.get_health_endpoints_with_status
--   public.get_health_timeseries
--   public.get_open_alert_for_service
--   public.get_health_endpoint_ids
--   public.record_health_checks
--   public.get_health_status
--   public.get_health_incidents
--   public.get_recent_health_checks
--   public.get_all_endpoint_uptime
--   public.get_all_health_timeseries
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS admin;

GRANT USAGE ON SCHEMA admin TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA admin TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA admin GRANT ALL ON TABLES TO service_role;

-- service_role needs SELECT on public for cross-schema views to work when
-- called via the SECURITY DEFINER RPC functions below.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO service_role;


-- ─── admin.is_admin ────────────────────────────────────────────────────────
-- Platform-level gate. Returns true ONLY for platform admins (not tenant
-- admins). The admin dashboard is for cross-tenant operations.

CREATE OR REPLACE FUNCTION admin.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
  SELECT auth_is_platform_admin();
$$;

COMMENT ON FUNCTION admin.is_admin() IS
  'Platform admin gate. Returns auth_is_platform_admin(). Tenant admins do NOT pass this check — admin schema is for cross-tenant ops.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: admin.health_endpoints
-- ═══════════════════════════════════════════════════════════════════════════
-- Services monitored by the periodic health-check runner.

CREATE TABLE admin.health_endpoints (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name     text        NOT NULL,
  description      text,
  method           text        NOT NULL DEFAULT 'GET',
  url              text        NOT NULL,
  tier             text        NOT NULL DEFAULT 'standard'
                               CHECK (tier IN ('critical', 'standard', 'extended')),
  check_type       text        NOT NULL DEFAULT 'http'
                               CHECK (check_type IN ('http', 'db', 'storage', 'auth', 'queue')),
  interval_seconds integer     CHECK (interval_seconds IS NULL OR interval_seconds > 0),
  expected_status  smallint    DEFAULT 200,
  is_active        boolean     NOT NULL DEFAULT true,
  secret_ref       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT health_endpoints_service_name_unique UNIQUE (service_name)
);

CREATE INDEX idx_health_endpoints_tier      ON admin.health_endpoints (tier);
CREATE INDEX idx_health_endpoints_is_active ON admin.health_endpoints (is_active);

ALTER TABLE admin.health_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY health_endpoints_admins_only
  ON admin.health_endpoints FOR ALL
  USING (admin.is_admin())
  WITH CHECK (admin.is_admin());

COMMENT ON TABLE  admin.health_endpoints                  IS 'Services monitored by the periodic health-check runner.';
COMMENT ON COLUMN admin.health_endpoints.tier             IS 'critical=every 5 min | standard=every 15 min | extended=every 30 min';
COMMENT ON COLUMN admin.health_endpoints.check_type       IS 'Adapter used by the cron engine: http | db | storage | auth | queue';
COMMENT ON COLUMN admin.health_endpoints.interval_seconds IS 'Per-endpoint check interval override. NULL = use tier default.';
COMMENT ON COLUMN admin.health_endpoints.secret_ref       IS 'Supabase Vault secret name holding the auth credential. Never store raw keys here.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: admin.health_checks
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE admin.health_checks (
  id            bigserial   PRIMARY KEY,
  endpoint_id   uuid        NOT NULL REFERENCES admin.health_endpoints (id) ON DELETE CASCADE,
  checked_at    timestamptz NOT NULL DEFAULT now(),
  status        text        NOT NULL CHECK (status IN ('operational', 'degraded', 'down', 'unknown')),
  response_ms   integer     CHECK (response_ms IS NULL OR response_ms >= 0),
  http_status   smallint,
  detail        text,
  is_transition boolean     NOT NULL DEFAULT false
);

CREATE INDEX idx_health_checks_endpoint_time
  ON admin.health_checks (endpoint_id, checked_at DESC);
CREATE INDEX idx_health_checks_checked_at
  ON admin.health_checks (checked_at DESC);
CREATE INDEX idx_health_checks_transitions
  ON admin.health_checks (endpoint_id, checked_at DESC)
  WHERE is_transition = true;

ALTER TABLE admin.health_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY health_checks_admins_full
  ON admin.health_checks FOR ALL
  USING (admin.is_admin())
  WITH CHECK (admin.is_admin());

CREATE POLICY health_checks_service_role_insert
  ON admin.health_checks FOR INSERT
  TO service_role
  WITH CHECK (true);

COMMENT ON TABLE  admin.health_checks               IS 'Raw ping results for every monitored endpoint.';
COMMENT ON COLUMN admin.health_checks.is_transition IS 'TRUE when this ping represents a status change from the previous result — used to build the incident timeline.';


-- ═══════════════════════════════════════════════════════════════════════════
-- VIEW: admin.endpoint_uptime
-- ═══════════════════════════════════════════════════════════════════════════
-- Aggregated uptime % and current status per endpoint over common windows.

CREATE OR REPLACE VIEW admin.endpoint_uptime AS
SELECT
  e.id                                                                          AS endpoint_id,
  e.service_name,
  e.tier,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE c.status = 'operational' AND c.checked_at >= now() - INTERVAL '24 hours')
           / NULLIF(COUNT(*) FILTER (WHERE c.checked_at >= now() - INTERVAL '24 hours'), 0), 2
  )                                                                             AS uptime_24h,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE c.status = 'operational' AND c.checked_at >= now() - INTERVAL '7 days')
           / NULLIF(COUNT(*) FILTER (WHERE c.checked_at >= now() - INTERVAL '7 days'), 0), 2
  )                                                                             AS uptime_7d,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE c.status = 'operational' AND c.checked_at >= now() - INTERVAL '30 days')
           / NULLIF(COUNT(*) FILTER (WHERE c.checked_at >= now() - INTERVAL '30 days'), 0), 2
  )                                                                             AS uptime_30d,
  ROUND(AVG(c.response_ms) FILTER (
    WHERE c.status = 'operational' AND c.checked_at >= now() - INTERVAL '24 hours'
  ))                                                                            AS avg_response_ms_24h,
  MAX(c.checked_at)                                                             AS last_checked_at,
  (
    SELECT status FROM admin.health_checks hc2
     WHERE hc2.endpoint_id = e.id
     ORDER BY hc2.checked_at DESC
     LIMIT 1
  )                                                                             AS current_status
FROM admin.health_endpoints e
LEFT JOIN admin.health_checks c ON c.endpoint_id = e.id
WHERE e.is_active = true
GROUP BY e.id, e.service_name, e.tier;

COMMENT ON VIEW admin.endpoint_uptime IS
  'Aggregated uptime percentages and current status per endpoint. Source for the Status Dashboard.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: admin.deployment_log
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE admin.deployment_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deploy_ref   text        NOT NULL UNIQUE,
  branch       text        NOT NULL,
  environment  text        NOT NULL CHECK (environment IN ('production', 'staging', 'preview')),
  triggered_by text        NOT NULL,
  image_tag    text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms  integer     CHECK (duration_ms IS NULL OR duration_ms >= 0),
  status       text        NOT NULL DEFAULT 'in_progress'
                           CHECK (status IN ('in_progress', 'success', 'failed', 'cancelled')),
  log_output   text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_deployment_log_started_at  ON admin.deployment_log (started_at DESC);
CREATE INDEX idx_deployment_log_environment ON admin.deployment_log (environment);
CREATE INDEX idx_deployment_log_status      ON admin.deployment_log (status);

ALTER TABLE admin.deployment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY deployment_log_admins_full
  ON admin.deployment_log FOR ALL
  USING (admin.is_admin()) WITH CHECK (admin.is_admin());

CREATE POLICY deployment_log_service_role_insert
  ON admin.deployment_log FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY deployment_log_service_role_update
  ON admin.deployment_log FOR UPDATE TO service_role USING (true);

COMMENT ON TABLE  admin.deployment_log            IS 'Full history of every deploy event across all environments.';
COMMENT ON COLUMN admin.deployment_log.log_output IS 'Raw deploy runner output. Truncate to last 50 KB before storing to avoid bloat.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: admin.alerts
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE admin.alerts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table    text        CHECK (source_table IN ('health_checks', 'deployment_log', 'system')),
  source_id       text,
  service_name    text        NOT NULL,
  severity        text        NOT NULL DEFAULT 'medium'
                              CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title           text        NOT NULL,
  message         text,
  status          text        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'investigating', 'resolved', 'suppressed')),
  triggered_at    timestamptz NOT NULL DEFAULT now(),
  acknowledged_by text,
  acknowledged_at timestamptz,
  resolved_by     text,
  resolved_at     timestamptz,
  external_ref    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_status       ON admin.alerts (status) WHERE status != 'resolved';
CREATE INDEX idx_alerts_severity     ON admin.alerts (severity, triggered_at DESC);
CREATE INDEX idx_alerts_service      ON admin.alerts (service_name, triggered_at DESC);
CREATE INDEX idx_alerts_triggered_at ON admin.alerts (triggered_at DESC);

ALTER TABLE admin.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY alerts_admins_full
  ON admin.alerts FOR ALL
  USING (admin.is_admin()) WITH CHECK (admin.is_admin());

CREATE POLICY alerts_service_role_insert
  ON admin.alerts FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY alerts_service_role_update
  ON admin.alerts FOR UPDATE TO service_role USING (true);

CREATE TRIGGER trg_admin_alerts_updated_at
  BEFORE UPDATE ON admin.alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE  admin.alerts              IS 'Alert lifecycle table. One row per incident; update status in place rather than inserting new rows.';
COMMENT ON COLUMN admin.alerts.source_table IS 'Which table generated this alert so the UI can deep-link to the source row.';
COMMENT ON COLUMN admin.alerts.severity     IS 'low=informational | medium=degraded | high=service down | critical=data loss risk';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: admin.admin_activity_log (append-only audit trail)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE admin.admin_activity_log (
  id            bigserial   PRIMARY KEY,
  actor_id      uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_email   text        NOT NULL,
  action        text        NOT NULL,
  resource_type text        NOT NULL
                            CHECK (resource_type IN (
                              'health_endpoint', 'health_check', 'deployment',
                              'alert', 'org', 'user', 'system'
                            )),
  resource_id   text,
  metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_activity_actor      ON admin.admin_activity_log (actor_id, created_at DESC);
CREATE INDEX idx_admin_activity_resource   ON admin.admin_activity_log (resource_type, resource_id, created_at DESC);
CREATE INDEX idx_admin_activity_created_at ON admin.admin_activity_log (created_at DESC);
CREATE INDEX idx_admin_activity_metadata   ON admin.admin_activity_log USING GIN (metadata);

ALTER TABLE admin.admin_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_activity_log_admins_select
  ON admin.admin_activity_log FOR SELECT USING (admin.is_admin());

CREATE POLICY admin_activity_log_admins_insert
  ON admin.admin_activity_log FOR INSERT TO authenticated
  WITH CHECK (admin.is_admin() AND actor_id = auth.uid());

CREATE POLICY admin_activity_log_service_role_insert
  ON admin.admin_activity_log FOR INSERT TO service_role WITH CHECK (true);

CREATE RULE admin_activity_log_no_update AS ON UPDATE TO admin.admin_activity_log DO INSTEAD NOTHING;
CREATE RULE admin_activity_log_no_delete AS ON DELETE TO admin.admin_activity_log DO INSTEAD NOTHING;

COMMENT ON TABLE  admin.admin_activity_log          IS 'Append-only audit log for all admin portal actions. Rows must never be mutated or deleted.';


-- ═══════════════════════════════════════════════════════════════════════════
-- CROSS-SCHEMA VIEWS
-- ═══════════════════════════════════════════════════════════════════════════

-- Counts rolls below their material's reorder threshold (per-roll, in sqm).
-- Adapted from dev's view: 111 stores remaining_length in mm and reorder
-- thresholds in sqm, so we compute (length_mm × width_mm / 1e6) → sqm and
-- compare to reorder_point_sqm.
CREATE OR REPLACE VIEW admin.public_low_stock_summary AS
SELECT
  mt.name              AS material_type,
  COUNT(*)             AS rolls_below_threshold
FROM  public.rolls r
JOIN  public.material_types mt ON mt.id = r.material_type_id
JOIN  public.reorder_rules  rr ON rr.material_type_id = r.material_type_id
WHERE (r.remaining_length_mm::numeric * r.width_mm::numeric / 1000000.0) <= rr.reorder_point_sqm
  AND r.status = 'active'
  AND r.deleted_at IS NULL
GROUP BY mt.name;

COMMENT ON VIEW admin.public_low_stock_summary IS
  'Cross-schema: counts rolls whose remaining area is at or below their material''s reorder threshold. Adapted to 111''s mm/sqm units.';


-- Notification queue depth by status — used to detect processing lag.
CREATE OR REPLACE VIEW admin.public_notification_queue_depth AS
SELECT
  status,
  COUNT(*)        AS count,
  MIN(created_at) AS oldest_entry
FROM public.notification_queue
GROUP BY status;

COMMENT ON VIEW admin.public_notification_queue_depth IS
  'Cross-schema: notification queue depth by status. Used by admin health monitoring to detect processing lag.';


-- ═══════════════════════════════════════════════════════════════════════════
-- PUBLIC RPCs (for clients without direct admin schema access)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_health_endpoints_with_status()
RETURNS TABLE (
  id                  uuid,
  service_name        text,
  description         text,
  method              text,
  url                 text,
  tier                text,
  check_type          text,
  interval_seconds    integer,
  expected_status     smallint,
  secret_ref          text,
  is_active           boolean,
  current_status      text,
  last_checked_at     timestamptz,
  avg_response_ms_24h numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = admin, public
AS $$
  SELECT he.id, he.service_name, he.description, he.method, he.url, he.tier,
         he.check_type, he.interval_seconds, he.expected_status, he.secret_ref,
         he.is_active,
         eu.current_status, eu.last_checked_at, eu.avg_response_ms_24h
  FROM admin.health_endpoints he
  LEFT JOIN admin.endpoint_uptime eu ON eu.service_name = he.service_name
  WHERE he.is_active = true
  ORDER BY he.tier, he.service_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_health_endpoints_with_status() TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_health_timeseries(
  p_service_name text,
  p_points       integer DEFAULT 24
)
RETURNS TABLE (
  checked_at  timestamptz,
  response_ms integer,
  status      text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = admin, public, pg_catalog
AS $$
  SELECT hc.checked_at, hc.response_ms, hc.status
  FROM admin.health_checks hc
  JOIN admin.health_endpoints e ON e.id = hc.endpoint_id
  WHERE e.service_name = p_service_name
    AND e.is_active    = true
  ORDER BY hc.checked_at DESC
  LIMIT p_points;
$$;

GRANT EXECUTE ON FUNCTION public.get_health_timeseries(text, integer) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_open_alert_for_service(p_service_name text)
RETURNS TABLE (id uuid, status text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = admin, public, pg_catalog
AS $$
  SELECT id, status
  FROM admin.alerts
  WHERE service_name = p_service_name
    AND status IN ('active', 'investigating')
  ORDER BY triggered_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_open_alert_for_service(text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_health_endpoint_ids(p_names text[])
RETURNS TABLE (
  id             uuid,
  service_name   text,
  current_status text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = admin, public, pg_catalog
AS $$
  SELECT
    e.id,
    e.service_name,
    (
      SELECT hc.status
      FROM admin.health_checks hc
      WHERE hc.endpoint_id = e.id
      ORDER BY hc.checked_at DESC
      LIMIT 1
    ) AS current_status
  FROM admin.health_endpoints e
  WHERE e.service_name = ANY(p_names)
    AND e.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_health_endpoint_ids(text[]) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.record_health_checks(p_checks jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = admin, public, pg_catalog
AS $$
DECLARE
  r jsonb;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_checks)
  LOOP
    INSERT INTO admin.health_checks (
      endpoint_id, status, response_ms, http_status, detail, is_transition
    ) VALUES (
      (r->>'endpoint_id')::uuid,
       r->>'status',
      (r->>'response_ms')::integer,
      (r->>'http_status')::smallint,
       r->>'detail',
      (r->>'is_transition')::boolean
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_health_checks(jsonb) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_health_status(p_names text[])
RETURNS TABLE (
  endpoint_id         uuid,
  service_name        text,
  tier                text,
  uptime_24h          numeric,
  uptime_7d           numeric,
  uptime_30d          numeric,
  avg_response_ms_24h numeric,
  last_checked_at     timestamptz,
  current_status      text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = admin, public, pg_catalog
AS $$
  SELECT endpoint_id, service_name, tier,
         uptime_24h, uptime_7d, uptime_30d,
         avg_response_ms_24h, last_checked_at, current_status
  FROM admin.endpoint_uptime
  WHERE service_name = ANY(p_names);
$$;

GRANT EXECUTE ON FUNCTION public.get_health_status(text[]) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_health_incidents(
  p_names text[],
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  checked_at   timestamptz,
  service_name text,
  status       text,
  detail       text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = admin, public, pg_catalog
AS $$
  SELECT hc.checked_at, e.service_name, hc.status, hc.detail
  FROM admin.health_checks hc
  JOIN admin.health_endpoints e ON e.id = hc.endpoint_id
  WHERE hc.is_transition = true
    AND e.service_name   = ANY(p_names)
  ORDER BY hc.checked_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_health_incidents(text[], integer) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_recent_health_checks(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id            bigint,
  service_name  text,
  checked_at    timestamptz,
  status        text,
  response_ms   integer,
  http_status   smallint,
  detail        text,
  is_transition boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = admin, public
AS $$
  SELECT hc.id, he.service_name, hc.checked_at, hc.status,
         hc.response_ms, hc.http_status, hc.detail, hc.is_transition
  FROM admin.health_checks hc
  JOIN admin.health_endpoints he ON he.id = hc.endpoint_id
  ORDER BY hc.checked_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_recent_health_checks(integer) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_all_endpoint_uptime()
RETURNS TABLE (
  service_name        text,
  uptime_24h          numeric,
  uptime_7d           numeric,
  uptime_30d          numeric,
  avg_response_ms_24h numeric,
  last_checked_at     timestamptz,
  current_status      text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = admin, public
AS $$
  SELECT service_name, uptime_24h, uptime_7d, uptime_30d,
         avg_response_ms_24h, last_checked_at, current_status
  FROM admin.endpoint_uptime;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_endpoint_uptime() TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_all_health_timeseries(p_points integer DEFAULT 24)
RETURNS TABLE (
  service_name text,
  response_ms  integer,
  checked_at   timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = admin, public
AS $$
  SELECT sub.service_name, sub.response_ms, sub.checked_at
  FROM (
    SELECT he.service_name, hc.response_ms, hc.checked_at,
           ROW_NUMBER() OVER (PARTITION BY he.service_name ORDER BY hc.checked_at DESC) AS rn
    FROM admin.health_checks hc
    JOIN admin.health_endpoints he ON he.id = hc.endpoint_id
  ) sub
  WHERE sub.rn <= p_points
  ORDER BY sub.service_name, sub.checked_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_health_timeseries(integer) TO authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- updated_at triggers for admin tables (uses public.set_updated_at from file 8)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TRIGGER trg_admin_health_endpoints_updated_at
  BEFORE UPDATE ON admin.health_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- admin.alerts updated_at trigger lives next to its table definition above.


-- ═══════════════════════════════════════════════════════════════════════════
-- Seed: canonical six monitored services
-- ═══════════════════════════════════════════════════════════════════════════
-- Replace the host portion of API Gateway URL with whatever production env
-- requires; the seed value is a placeholder copied verbatim from dev.

INSERT INTO admin.health_endpoints (service_name, description, method, url, tier, check_type) VALUES
  ('API Gateway',      'Supabase REST API gateway — lightweight availability check',  'GET',      'https://mwwqklbbyvqcijarqdql.supabase.co/auth/v1/health', 'critical', 'http'),
  ('Database Primary', 'PostgreSQL primary — SELECT round-trip via service role',     'INTERNAL', 'internal://db/ping',              'critical', 'db'),
  ('Auth Service',     'Supabase GoTrue — admin listUsers liveness check',            'INTERNAL', 'internal://auth/listUsers',       'critical', 'auth'),
  ('File Storage',     'Supabase Storage — bucket list availability check',           'INTERNAL', 'internal://storage/buckets',      'standard', 'storage'),
  ('Job Queue',        'notification_queue depth and failed-job health',              'INTERNAL', 'internal://notification_queue',   'standard', 'queue'),
  ('Email Service',    'Resend API — API key validation via GET /domains',            'GET',      'https://api.resend.com/domains',  'standard', 'http')
ON CONFLICT (service_name) DO UPDATE SET
  description      = EXCLUDED.description,
  method           = EXCLUDED.method,
  url              = EXCLUDED.url,
  tier             = EXCLUDED.tier,
  check_type       = EXCLUDED.check_type,
  updated_at       = now();
