CREATE OR REPLACE FUNCTION public.get_health_endpoints_with_status()
RETURNS TABLE (
  id                  UUID,
  service_name        TEXT,
  description         TEXT,
  method              TEXT,
  tier                TEXT,
  check_type          TEXT,
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
    he.tier,
    he.check_type,
    he.is_active,
    eu.current_status,
    eu.last_checked_at,
    eu.avg_response_ms_24h
  FROM admin.health_endpoints he
  LEFT JOIN admin.endpoint_uptime eu ON eu.service_name = he.service_name
  ORDER BY he.tier, he.service_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_health_endpoints_with_status() TO authenticated, service_role;
