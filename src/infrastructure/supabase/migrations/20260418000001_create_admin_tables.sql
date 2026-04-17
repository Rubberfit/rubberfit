
-- Migration: 20260418000001_create_admin_tables.sql
--
-- Creates all tables in the admin schema for the internal ops dashboard:
--   admin.health_endpoints   — configured services to monitor
--   admin.health_checks      — uptime ping results and status history
--   admin.deployment_log     — deployment events and version history
--   admin.alerts             — triggered alerts and notification records
--   admin.admin_activity_log — audit trail for admin portal actions
--
-- Cross-schema read access:
--   service_role can SELECT from public schema tables for monitoring queries.
--   No direct SELECT grants are added to anon/authenticated for admin tables;
--   all access is gated by RLS policies that require the 'admin' role.


-- Helper: is the calling user an admin? 
-- Reuses has_any_role() already defined in 20260322050232_update_profiles_multi_role.sql.
-- We add a zero-argument convenience wrapper scoped to this schema.

CREATE OR REPLACE FUNCTION admin.is_admin()
RETURNS BOOLEAN AS $$
  -- has_any_role() already returns TRUE for super_admin users, so this
  -- covers both regular admins and super_admins in a single check.
  SELECT has_any_role(auth.uid(), ARRAY['admin']::TEXT[]);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, admin, pg_catalog;

COMMENT ON FUNCTION admin.is_admin() IS
  'Returns true when the calling user holds the admin role OR is a super_admin. Used in all admin schema RLS policies.';


-- Cross-schema read access for monitoring 
-- service_role already has full access (granted in 20260417230040).
-- These grants let service_role queries (e.g. health check functions) JOIN
-- against public tables without switching search_path.

GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO service_role;



-- TABLE: admin.health_endpoints
-- Configured services that the periodic health check runner monitors.


CREATE TABLE IF NOT EXISTS admin.health_endpoints (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT        NOT NULL,
  description  TEXT,
  method       TEXT        NOT NULL DEFAULT 'GET',
  url          TEXT        NOT NULL,
  -- tier controls check frequency: critical=5 min, standard=15 min, extended=30 min
  tier         TEXT        NOT NULL DEFAULT 'standard'
                           CHECK (tier IN ('critical', 'standard', 'extended')),
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  -- optional bearer token or API key stored as a secret reference (not the raw value)
  secret_ref   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT health_endpoints_service_name_unique UNIQUE (service_name)
);

CREATE INDEX IF NOT EXISTS idx_health_endpoints_tier      ON admin.health_endpoints (tier);
CREATE INDEX IF NOT EXISTS idx_health_endpoints_is_active ON admin.health_endpoints (is_active);

ALTER TABLE admin.health_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_endpoints: admins only"
  ON admin.health_endpoints FOR ALL
  USING (admin.is_admin())
  WITH CHECK (admin.is_admin());

-- Seed the six endpoints shown in the UI
INSERT INTO admin.health_endpoints (service_name, description, method, url, tier) VALUES
  ('Supabase DB',      'SELECT 1 ping via REST',          'SQL',  '/rest/v1/rpc/ping',               'critical'),
  ('Supabase Auth',    'Token validation endpoint',        'POST', '/auth/v1/token',                  'critical'),
  ('Edge Functions',   'Invoke health check function',     'POST', '/functions/v1/health',            'standard'),
  ('Frontend',         'HTTP 200 check on deployed URL',   'GET',  '/',                               'critical'),
  ('Email (Resend)',   'API key validation check',         'GET',  'https://api.resend.com/domains',  'standard'),
  ('Stripe',           'API connectivity check',           'GET',  'https://api.stripe.com/v1/balance','extended')
ON CONFLICT (service_name) DO NOTHING;

COMMENT ON TABLE  admin.health_endpoints           IS 'Configured services polled by the periodic health check runner.';
COMMENT ON COLUMN admin.health_endpoints.tier      IS 'critical=every 5 min | standard=every 15 min | extended=every 30 min';
COMMENT ON COLUMN admin.health_endpoints.secret_ref IS 'Name of the Supabase Vault secret that holds the auth credential. Never store raw keys here.';


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: admin.health_checks
-- One row per completed ping for each monitored endpoint.
-- Used to calculate uptime %, average response time, and incident detection.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin.health_checks (
  id           BIGSERIAL   PRIMARY KEY,
  endpoint_id  UUID        NOT NULL REFERENCES admin.health_endpoints (id) ON DELETE CASCADE,
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status       TEXT        NOT NULL CHECK (status IN ('operational', 'degraded', 'down', 'unknown')),
  response_ms  INTEGER     CHECK (response_ms IS NULL OR response_ms >= 0),
  http_status  SMALLINT,
  detail       TEXT,
  -- set when this row transitions the endpoint into a new status (enables incident detection)
  is_transition BOOLEAN    NOT NULL DEFAULT FALSE
);

-- Time-series queries: endpoint history, uptime window calculations
CREATE INDEX IF NOT EXISTS idx_health_checks_endpoint_time
  ON admin.health_checks (endpoint_id, checked_at DESC);

-- Fast window aggregation for uptime % dashboards
CREATE INDEX IF NOT EXISTS idx_health_checks_checked_at
  ON admin.health_checks (checked_at DESC);

-- Incident detection: find rows where status changed
CREATE INDEX IF NOT EXISTS idx_health_checks_transitions
  ON admin.health_checks (endpoint_id, checked_at DESC)
  WHERE is_transition = TRUE;

ALTER TABLE admin.health_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_checks: admins full access"
  ON admin.health_checks FOR ALL
  USING (admin.is_admin())
  WITH CHECK (admin.is_admin());

-- service_role bypass so the edge function cron job can INSERT without a user session
CREATE POLICY "health_checks: service_role insert"
  ON admin.health_checks FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

COMMENT ON TABLE  admin.health_checks              IS 'Raw ping results for every monitored endpoint. Partitioning by month is recommended once volume grows.';
COMMENT ON COLUMN admin.health_checks.is_transition IS 'TRUE when this ping represents a status change from the previous result — used to build the incident timeline.';


-- ── Convenience view: uptime % by endpoint over common windows ───────────────

CREATE OR REPLACE VIEW admin.endpoint_uptime AS
SELECT
  e.id                                                        AS endpoint_id,
  e.service_name,
  e.tier,
  -- 24-hour uptime %
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE c.status = 'operational' AND c.checked_at >= NOW() - INTERVAL '24 hours')
           / NULLIF(COUNT(*) FILTER (WHERE c.checked_at >= NOW() - INTERVAL '24 hours'), 0),
    2
  )                                                           AS uptime_24h,
  -- 7-day uptime %
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE c.status = 'operational' AND c.checked_at >= NOW() - INTERVAL '7 days')
           / NULLIF(COUNT(*) FILTER (WHERE c.checked_at >= NOW() - INTERVAL '7 days'), 0),
    2
  )                                                           AS uptime_7d,
  -- 30-day uptime %
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE c.status = 'operational' AND c.checked_at >= NOW() - INTERVAL '30 days')
           / NULLIF(COUNT(*) FILTER (WHERE c.checked_at >= NOW() - INTERVAL '30 days'), 0),
    2
  )                                                           AS uptime_30d,
  -- average response time over last 24h (operational checks only)
  ROUND(AVG(c.response_ms) FILTER (
    WHERE c.status = 'operational' AND c.checked_at >= NOW() - INTERVAL '24 hours'
  ))                                                          AS avg_response_ms_24h,
  -- most recent check
  MAX(c.checked_at)                                           AS last_checked_at,
  -- current status (latest row)
  (
    SELECT status FROM admin.health_checks hc2
    WHERE hc2.endpoint_id = e.id
    ORDER BY hc2.checked_at DESC
    LIMIT 1
  )                                                           AS current_status
FROM admin.health_endpoints e
LEFT JOIN admin.health_checks c ON c.endpoint_id = e.id
WHERE e.is_active = TRUE
GROUP BY e.id, e.service_name, e.tier;

COMMENT ON VIEW admin.endpoint_uptime IS 'Aggregated uptime percentages and current status per endpoint. Query this for the Status Dashboard.';


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: admin.deployment_log
-- One row per deployment event (triggered manually or by CI).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin.deployment_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- short human-readable identifier, e.g. "d-0197"
  deploy_ref     TEXT        NOT NULL UNIQUE,
  branch         TEXT        NOT NULL,
  environment    TEXT        NOT NULL CHECK (environment IN ('production', 'staging', 'preview')),
  triggered_by   TEXT        NOT NULL,          -- email or "CI / GitHub Actions"
  image_tag      TEXT,                           -- Docker image or Vercel deployment URL
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  duration_ms    INTEGER     CHECK (duration_ms IS NULL OR duration_ms >= 0),
  status         TEXT        NOT NULL DEFAULT 'in_progress'
                             CHECK (status IN ('in_progress', 'success', 'failed', 'cancelled')),
  log_output     TEXT,                           -- captured stdout/stderr from the deploy runner
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployment_log_started_at   ON admin.deployment_log (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployment_log_environment  ON admin.deployment_log (environment);
CREATE INDEX IF NOT EXISTS idx_deployment_log_status       ON admin.deployment_log (status);

ALTER TABLE admin.deployment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deployment_log: admins full access"
  ON admin.deployment_log FOR ALL
  USING (admin.is_admin())
  WITH CHECK (admin.is_admin());

CREATE POLICY "deployment_log: service_role insert"
  ON admin.deployment_log FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

CREATE POLICY "deployment_log: service_role update status"
  ON admin.deployment_log FOR UPDATE
  TO service_role
  USING (TRUE);

COMMENT ON TABLE  admin.deployment_log          IS 'Full history of every deploy event across all environments.';
COMMENT ON COLUMN admin.deployment_log.log_output IS 'Raw deploy runner output. Truncate to last 50 KB before storing to avoid bloat.';


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: admin.alerts
-- Triggered alerts from health checks, deployments, or threshold breaches.
-- Each row is a single alert lifecycle: opened → investigating → resolved.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin.alerts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- source links the alert back to the thing that triggered it
  source_table    TEXT        CHECK (source_table IN ('health_checks', 'deployment_log', 'system')),
  source_id       TEXT,                          -- FK value as text (bigint or uuid)
  service_name    TEXT        NOT NULL,
  severity        TEXT        NOT NULL DEFAULT 'medium'
                              CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title           TEXT        NOT NULL,
  message         TEXT,
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'investigating', 'resolved', 'suppressed')),
  triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_by TEXT,                          -- email of admin who acknowledged
  acknowledged_at TIMESTAMPTZ,
  resolved_by     TEXT,
  resolved_at     TIMESTAMPTZ,
  -- optional: link to a Slack message, PagerDuty incident, etc.
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
  USING (admin.is_admin())
  WITH CHECK (admin.is_admin());

CREATE POLICY "alerts: service_role insert"
  ON admin.alerts FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

CREATE POLICY "alerts: service_role update"
  ON admin.alerts FOR UPDATE
  TO service_role
  USING (TRUE);

-- Auto-update updated_at on every change
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

COMMENT ON TABLE  admin.alerts                 IS 'Alert lifecycle table. One row per incident; update status in place rather than inserting new rows.';
COMMENT ON COLUMN admin.alerts.source_table    IS 'Which table generated this alert so the UI can deep-link to the source row.';
COMMENT ON COLUMN admin.alerts.severity        IS 'low=informational | medium=degraded | high=service down | critical=data loss risk';


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: admin.admin_activity_log
-- Immutable audit trail of every action taken inside the admin portal.
-- Rows are never updated or deleted — append-only.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin.admin_activity_log (
  id            BIGSERIAL   PRIMARY KEY,
  actor_id      UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_email   TEXT        NOT NULL,
  -- what was done, e.g. "acknowledged_alert", "triggered_deployment", "edited_endpoint"
  action        TEXT        NOT NULL,
  -- which admin section / resource type the action touched
  resource_type TEXT        NOT NULL
                            CHECK (resource_type IN (
                              'health_endpoint', 'health_check', 'deployment',
                              'alert', 'org', 'user', 'system'
                            )),
  -- UUID or string identifier of the affected row
  resource_id   TEXT,
  -- structured diff or context, e.g. {"from": "active", "to": "resolved"}
  metadata      JSONB       NOT NULL DEFAULT '{}',
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Queries by actor (personal audit trail)
CREATE INDEX IF NOT EXISTS idx_admin_activity_actor       ON admin.admin_activity_log (actor_id, created_at DESC);
-- Queries by resource (what happened to a specific endpoint/deployment/etc.)
CREATE INDEX IF NOT EXISTS idx_admin_activity_resource    ON admin.admin_activity_log (resource_type, resource_id, created_at DESC);
-- Time-based feed (recent activity panel)
CREATE INDEX IF NOT EXISTS idx_admin_activity_created_at  ON admin.admin_activity_log (created_at DESC);
-- GIN index for metadata JSONB searches
CREATE INDEX IF NOT EXISTS idx_admin_activity_metadata    ON admin.admin_activity_log USING GIN (metadata);

ALTER TABLE admin.admin_activity_log ENABLE ROW LEVEL SECURITY;

-- Admins can read all activity
CREATE POLICY "admin_activity_log: admins select"
  ON admin.admin_activity_log FOR SELECT
  USING (admin.is_admin());

-- Inserts only via service_role (server-side logging) or admin session
CREATE POLICY "admin_activity_log: admins insert"
  ON admin.admin_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (admin.is_admin() AND actor_id = auth.uid());

CREATE POLICY "admin_activity_log: service_role insert"
  ON admin.admin_activity_log FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

-- No UPDATE or DELETE — this table is append-only by design.
-- Enforce at the DB level:
CREATE RULE admin_activity_log_no_update AS ON UPDATE TO admin.admin_activity_log DO INSTEAD NOTHING;
CREATE RULE admin_activity_log_no_delete AS ON DELETE TO admin.admin_activity_log DO INSTEAD NOTHING;

COMMENT ON TABLE  admin.admin_activity_log             IS 'Append-only audit log for all admin portal actions. Rows must never be mutated or deleted.';
COMMENT ON COLUMN admin.admin_activity_log.action      IS 'Snake_case verb describing the operation, e.g. acknowledged_alert, edited_endpoint, triggered_deployment.';
COMMENT ON COLUMN admin.admin_activity_log.metadata    IS 'Structured context: before/after values, extra identifiers, error messages, etc.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Cross-schema monitoring queries
--
-- These views let the admin health runner JOIN public tables without needing
-- to change search_path. They are service_role-accessible only.
-- ─────────────────────────────────────────────────────────────────────────────

-- How many rolls are currently below their reorder threshold (feeds health checks)
CREATE OR REPLACE VIEW admin.public_low_stock_summary AS
SELECT
  mt.name     AS material_type,
  COUNT(*)    AS rolls_below_threshold
FROM public.rolls r
JOIN public.material_types mt ON mt.id = r.material_type_id
JOIN public.reorder_rules  rr ON rr.material_type_id = r.material_type_id
WHERE r.remaining_length <= rr.reorder_point
GROUP BY mt.name;

COMMENT ON VIEW admin.public_low_stock_summary IS 'Read-only cross-schema view: counts rolls below reorder threshold per material type. Used by admin health monitoring.';

-- Recent notification queue backlog (alerts if queue depth grows)
CREATE OR REPLACE VIEW admin.public_notification_queue_depth AS
SELECT
  status,
  COUNT(*) AS count,
  MIN(created_at) AS oldest_entry
FROM public.notification_queue
GROUP BY status;

COMMENT ON VIEW admin.public_notification_queue_depth IS 'Read-only cross-schema view: notification queue depth by status. Used by admin health monitoring to detect processing lag.';
