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
  SELECT
    hc.id,
    he.service_name,
    hc.checked_at,
    hc.status,
    hc.response_ms,
    hc.http_status,
    hc.detail,
    hc.is_transition
  FROM admin.health_checks hc
  JOIN admin.health_endpoints he ON he.id = hc.endpoint_id
  ORDER BY hc.checked_at DESC
  LIMIT p_limit;
$$;



GRANT EXECUTE ON FUNCTION public.get_recent_health_checks(INT) TO authenticated, service_role;

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
  FROM admin.endpoint_uptime;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_endpoint_uptime() TO authenticated, service_role;
 