-- Migration: 20260418000001_create_admin_tables.sql
--
-- Creates all tables in the admin schema for the internal ops dashboard:
--   admin.health_endpoints   — configured services to monitor
--   admin.health_checks      — uptime ping results and status history
--   admin.endpoint_uptime    — view: aggregated uptime % per endpoint
--   admin.deployment_log     — deployment events and version history
--   admin.alerts             — triggered alerts and notification records
--   admin.admin_activity_log — audit trail for admin portal actions
--
-- Access model:
--   All admin tables are RLS-protected; access requires the 'admin' role.
--   service_role bypasses RLS for cron/edge-function writes.
--
-- Cross-schema views (public_low_stock_summary, public_notification_queue_depth)
-- are in the follow-up migration: 20260418000002_create_admin_cross_schema_views.sql


-- ── Helper ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin.is_admin()
RETURNS BOOLEAN AS $$
  SELECT has_any_role(auth.uid(), ARRAY['admin']::TEXT[]);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, admin, pg_catalog;

COMMENT ON FUNCTION admin.is_admin() IS
  'Returns true when the calling user holds the admin role OR is a super_admin.';


-- ── Cross-schema read access for service_role ─────────────────────────────────

GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO service_role;


-- ── TABLE: admin.health_endpoints ─────────────────────────────────────────────
-- Configured services that the periodic health check runner monitors.
--
-- check_type controls which adapter the cron engine uses:
--   'http'    → plain HTTP fetch, validates status code against expected_status
--   'db'      → internal Supabase DB round-trip (profiles SELECT)
--   'storage' → internal Supabase Storage bucket list
--   'auth'    → internal Supabase Auth admin.listUsers
--   'queue'   → internal notification_queue depth check
--
-- tier controls check frequency:
--   critical=5 min | standard=15 min | extended=30 min
--
-- interval_seconds: per-endpoint override; NULL = use tier default.
-- expected_status:  HTTP status code treated as "operational" (default 200).
--   Only meaningful for check_type='http'. NULL = any 2xx is operational.

CREATE TABLE IF NOT EXISTS admin.health_endpoints (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name     TEXT        NOT NULL,
  description      TEXT,
  method           TEXT        NOT NULL DEFAULT 'GET',
  url              TEXT        NOT NULL,
  tier             TEXT        NOT NULL DEFAULT 'standard'
                               CHECK (tier IN ('critical', 'standard', 'extended')),
  check_type       TEXT        NOT NULL DEFAULT 'http'
                               CHECK (check_type IN ('http', 'db', 'storage', 'auth', 'queue')),
  interval_seconds INTEGER     CHECK (interval_seconds IS NULL OR interval_seconds > 0),
  expected_status  SMALLINT    DEFAULT 200,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  secret_ref       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT health_endpoints_service_name_unique UNIQUE (service_name)
);

CREATE INDEX IF NOT EXISTS idx_health_endpoints_tier      ON admin.health_endpoints (tier);
CREATE INDEX IF NOT EXISTS idx_health_endpoints_is_active ON admin.health_endpoints (is_active);

ALTER TABLE admin.health_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_endpoints: admins only"
  ON admin.health_endpoints FOR ALL
  USING (admin.is_admin())
  WITH CHECK (admin.is_admin());

COMMENT ON TABLE  admin.health_endpoints                  IS 'Configured services polled by the periodic health check runner.';
COMMENT ON COLUMN admin.health_endpoints.tier             IS 'critical=every 5 min | standard=every 15 min | extended=every 30 min';
COMMENT ON COLUMN admin.health_endpoints.check_type       IS 'Adapter used by the cron engine: http | db | storage | auth | queue';
COMMENT ON COLUMN admin.health_endpoints.interval_seconds IS 'Per-endpoint check interval override. NULL = use tier default.';
COMMENT ON COLUMN admin.health_endpoints.secret_ref       IS 'Supabase Vault secret name holding the auth credential. Never store raw keys here.';

-- Seed: canonical six monitored services
INSERT INTO admin.health_endpoints (service_name, description, method, url, tier, check_type) VALUES
  ('API Gateway',      'Supabase REST API gateway — lightweight availability check',  'GET',      '/rest/v1/',                       'critical', 'http'),
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
  updated_at       = NOW();


-- ── TABLE: admin.health_checks ────────────────────────────────────────────────
-- One row per completed ping for each monitored endpoint.

CREATE TABLE IF NOT EXISTS admin.health_checks (
  id            BIGSERIAL   PRIMARY KEY,
  endpoint_id   UUID        NOT NULL REFERENCES admin.health_endpoints (id) ON DELETE CASCADE,
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status        TEXT        NOT NULL CHECK (status IN ('operational', 'degraded', 'down', 'unknown')),
  response_ms   INTEGER     CHECK (response_ms IS NULL OR response_ms >= 0),
  http_status   SMALLINT,
  detail        TEXT,
  is_transition BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_health_checks_endpoint_time
  ON admin.health_checks (endpoint_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_checks_checked_at
  ON admin.health_checks (checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_checks_transitions
  ON admin.health_checks (endpoint_id, checked_at DESC)
  WHERE is_transition = TRUE;

ALTER TABLE admin.health_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_checks: admins full access"
  ON admin.health_checks FOR ALL
  USING (admin.is_admin())
  WITH CHECK (admin.is_admin());

CREATE POLICY "health_checks: service_role insert"
  ON admin.health_checks FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

COMMENT ON TABLE  admin.health_checks              IS 'Raw ping results for every monitored endpoint.';
COMMENT ON COLUMN admin.health_checks.is_transition IS 'TRUE when this ping represents a status change from the previous result — used to build the incident timeline.';


-- ── VIEW: admin.endpoint_uptime ───────────────────────────────────────────────
-- Aggregated uptime % and current status per endpoint over common windows.

CREATE OR REPLACE VIEW admin.endpoint_uptime AS
SELECT
  e.id                                                                          AS endpoint_id,
  e.service_name,
  e.tier,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE c.status = 'operational' AND c.checked_at >= NOW() - INTERVAL '24 hours')
           / NULLIF(COUNT(*) FILTER (WHERE c.checked_at >= NOW() - INTERVAL '24 hours'), 0), 2
  )                                                                             AS uptime_24h,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE c.status = 'operational' AND c.checked_at >= NOW() - INTERVAL '7 days')
           / NULLIF(COUNT(*) FILTER (WHERE c.checked_at >= NOW() - INTERVAL '7 days'), 0), 2
  )                                                                             AS uptime_7d,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE c.status = 'operational' AND c.checked_at >= NOW() - INTERVAL '30 days')
           / NULLIF(COUNT(*) FILTER (WHERE c.checked_at >= NOW() - INTERVAL '30 days'), 0), 2
  )                                                                             AS uptime_30d,
  ROUND(AVG(c.response_ms) FILTER (
    WHERE c.status = 'operational' AND c.checked_at >= NOW() - INTERVAL '24 hours'
  ))                                                                            AS avg_response_ms_24h,
  MAX(c.checked_at)                                                             AS last_checked_at,
  (
    SELECT status FROM admin.health_checks hc2
    WHERE  hc2.endpoint_id = e.id
    ORDER  BY hc2.checked_at DESC
    LIMIT  1
  )                                                                             AS current_status
FROM  admin.health_endpoints e
LEFT JOIN admin.health_checks c ON c.endpoint_id = e.id
WHERE e.is_active = TRUE
GROUP BY e.id, e.service_name, e.tier;

COMMENT ON VIEW admin.endpoint_uptime IS
  'Aggregated uptime percentages and current status per endpoint. Query this for the Status Dashboard.';


-- ── TABLE: admin.deployment_log ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin.deployment_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deploy_ref   TEXT        NOT NULL UNIQUE,
  branch       TEXT        NOT NULL,
  environment  TEXT        NOT NULL CHECK (environment IN ('production', 'staging', 'preview')),
  triggered_by TEXT        NOT NULL,
  image_tag    TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms  INTEGER     CHECK (duration_ms IS NULL OR duration_ms >= 0),
  status       TEXT        NOT NULL DEFAULT 'in_progress'
                           CHECK (status IN ('in_progress', 'success', 'failed', 'cancelled')),
  log_output   TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployment_log_started_at  ON admin.deployment_log (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployment_log_environment ON admin.deployment_log (environment);
CREATE INDEX IF NOT EXISTS idx_deployment_log_status      ON admin.deployment_log (status);

ALTER TABLE admin.deployment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deployment_log: admins full access"
  ON admin.deployment_log FOR ALL
  USING (admin.is_admin()) WITH CHECK (admin.is_admin());

CREATE POLICY "deployment_log: service_role insert"
  ON admin.deployment_log FOR INSERT TO service_role WITH CHECK (TRUE);

CREATE POLICY "deployment_log: service_role update status"
  ON admin.deployment_log FOR UPDATE TO service_role USING (TRUE);

COMMENT ON TABLE  admin.deployment_log           IS 'Full history of every deploy event across all environments.';
COMMENT ON COLUMN admin.deployment_log.log_output IS 'Raw deploy runner output. Truncate to last 50 KB before storing to avoid bloat.';


-- ── TABLE: admin.alerts ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin.alerts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table    TEXT        CHECK (source_table IN ('health_checks', 'deployment_log', 'system')),
  source_id       TEXT,
  service_name    TEXT        NOT NULL,
  severity        TEXT        NOT NULL DEFAULT 'medium'
                              CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title           TEXT        NOT NULL,
  message         TEXT,
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'investigating', 'resolved', 'suppressed')),
  triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  resolved_by     TEXT,
  resolved_at     TIMESTAMPTZ,
  external_ref    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_status       ON admin.alerts (status) WHERE status != 'resolved';
CREATE INDEX IF NOT EXISTS idx_alerts_severity     ON admin.alerts (severity, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_service      ON admin.alerts (service_name, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_triggered_at ON admin.alerts (triggered_at DESC);

ALTER TABLE admin.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alerts: admins full access"
  ON admin.alerts FOR ALL
  USING (admin.is_admin()) WITH CHECK (admin.is_admin());

CREATE POLICY "alerts: service_role insert"
  ON admin.alerts FOR INSERT TO service_role WITH CHECK (TRUE);

CREATE POLICY "alerts: service_role update"
  ON admin.alerts FOR UPDATE TO service_role USING (TRUE);

CREATE OR REPLACE FUNCTION admin.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER alerts_updated_at
  BEFORE UPDATE ON admin.alerts
  FOR EACH ROW EXECUTE FUNCTION admin.set_updated_at();

COMMENT ON TABLE  admin.alerts              IS 'Alert lifecycle table. One row per incident; update status in place rather than inserting new rows.';
COMMENT ON COLUMN admin.alerts.source_table IS 'Which table generated this alert so the UI can deep-link to the source row.';
COMMENT ON COLUMN admin.alerts.severity     IS 'low=informational | medium=degraded | high=service down | critical=data loss risk';


-- ── TABLE: admin.admin_activity_log ──────────────────────────────────────────
-- Immutable audit trail — append-only, no UPDATE or DELETE.

CREATE TABLE IF NOT EXISTS admin.admin_activity_log (
  id            BIGSERIAL   PRIMARY KEY,
  actor_id      UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_email   TEXT        NOT NULL,
  action        TEXT        NOT NULL,
  resource_type TEXT        NOT NULL
                            CHECK (resource_type IN (
                              'health_endpoint', 'health_check', 'deployment',
                              'alert', 'org', 'user', 'system'
                            )),
  resource_id   TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_actor      ON admin.admin_activity_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_resource   ON admin.admin_activity_log (resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_created_at ON admin.admin_activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_metadata   ON admin.admin_activity_log USING GIN (metadata);

ALTER TABLE admin.admin_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_activity_log: admins select"
  ON admin.admin_activity_log FOR SELECT USING (admin.is_admin());

CREATE POLICY "admin_activity_log: admins insert"
  ON admin.admin_activity_log FOR INSERT TO authenticated
  WITH CHECK (admin.is_admin() AND actor_id = auth.uid());

CREATE POLICY "admin_activity_log: service_role insert"
  ON admin.admin_activity_log FOR INSERT TO service_role WITH CHECK (TRUE);

CREATE RULE admin_activity_log_no_update AS ON UPDATE TO admin.admin_activity_log DO INSTEAD NOTHING;
CREATE RULE admin_activity_log_no_delete AS ON DELETE TO admin.admin_activity_log DO INSTEAD NOTHING;

COMMENT ON TABLE  admin.admin_activity_log          IS 'Append-only audit log for all admin portal actions. Rows must never be mutated or deleted.';
COMMENT ON COLUMN admin.admin_activity_log.action   IS 'Snake_case verb, e.g. acknowledged_alert, edited_endpoint, triggered_deployment.';
COMMENT ON COLUMN admin.admin_activity_log.metadata IS 'Structured context: before/after values, extra identifiers, error messages, etc.';


