-- ═══════════════════════════════════════════════════════════════════════════
-- REDESIGN — File 6 of 9: Reference schema (global)
-- ═══════════════════════════════════════════════════════════════════════════
-- Tables:
--   tax_rates — jurisdiction-level sales tax rates, shared across tenants
--
-- Design decisions:
--   • NO tenant_id (locked decision) — global reference data
--   • Writable only by platform admins; RLS policy in file 9 gates this
--   • Every tenant reads from this table; per-supplier overrides live on
--     suppliers.tax_rate (file 2)
--   • Source column tracks provenance (manually entered vs. synced from
--     Avalara vs. system default) — useful for knowing when to refresh
--   • Partial UNIQUE index enforces one active rate per
--     (state, city, zip_code) tuple; historical/inactive rows can coexist
--
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── tax_rates ─────────────────────────────────────────────────────────────

CREATE TABLE tax_rates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state               varchar(2) NOT NULL,
  city                varchar(100),
  zip_code            varchar(20),
  tax_rate            numeric(5,4) NOT NULL CHECK (tax_rate >= 0 AND tax_rate <= 1),
  tax_name            varchar(200) NOT NULL,
  effective_date      date NOT NULL DEFAULT CURRENT_DATE,
  is_active           boolean NOT NULL DEFAULT true,
  source              varchar(20) NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual', 'avalara', 'default')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,

  CONSTRAINT tax_rates_state_upper
    CHECK (state = UPPER(state) AND char_length(state) = 2)
);

-- Only one active rate per jurisdiction tuple. Historical / inactive rows
-- (e.g., last year's rate) can coexist.
CREATE UNIQUE INDEX tax_rates_active_jurisdiction_unique
  ON tax_rates (state, COALESCE(city, ''), COALESCE(zip_code, ''))
  WHERE is_active = true AND deleted_at IS NULL;

COMMENT ON TABLE tax_rates IS
  'Global jurisdiction-level sales tax rates. No tenant_id — shared reference data. Writes gated to platform admins by RLS (file 9).';
COMMENT ON COLUMN tax_rates.tax_rate IS
  'Decimal fraction (e.g., 0.0825 = 8.25%). CHECK enforces 0..1.';
COMMENT ON COLUMN tax_rates.source IS
  'Provenance: manual (admin-entered), avalara (synced from Avalara API), default (fallback rate).';
