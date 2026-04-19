CREATE OR REPLACE FUNCTION public.get_all_health_timeseries(p_points INT DEFAULT 24)
RETURNS TABLE (service_name TEXT, response_ms INTEGER, checked_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER SET search_path = admin, public
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
GRANT EXECUTE ON FUNCTION public.get_all_health_timeseries(INT) TO authenticated, service_role;
