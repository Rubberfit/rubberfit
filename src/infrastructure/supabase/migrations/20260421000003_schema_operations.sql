-- ═══════════════════════════════════════════════════════════════════════════
-- REDESIGN — File 3 of 9: Operations schema (cut planner)
-- ═══════════════════════════════════════════════════════════════════════════
-- Tables (in dependency order):
--   cuts, cut_history, cut_history_selection, cut_favorites
--
-- Also at the bottom of this file: ALTER TABLE rolls to add
-- source_cut_history_id (FK to cut_history) + the consistency CHECK that
-- ties rolls.source_type to parent_roll_id / source_cut_history_id.
-- These live here because the FK target (cut_history) doesn't exist yet
-- when file 2 runs.
--
-- Design decisions:
--   • Units: lengths as integer mm (numeric(8,3) for thickness); computed
--            areas as bigint sqmm (source is the nesting engine's sqmm math);
--            money as bigint cents per m²; percentages as numeric(5,2)/(5,4).
--   • tenant_id on every table, ON DELETE CASCADE
--   • cut_history array columns (part_selected_*) are normalized into
--     cut_history_selection (one row per selection, ordered by selection_index)
--   • Reusable offcuts are NOT a separate table — they are stored as rolls
--     rows with source_type = 'offcut'. This unifies the inventory for cut
--     planning, QR code generation, and low-stock alerts.
--   • user_id and created_by are kept as semantically distinct: user_id is
--     the operator (cutter / favoriter); created_by is who wrote the record
--
-- Open question: cut_history.part_id has no referenced table. Left nullable
-- with no FK pending the Part-entity decision (plan Q3). If parts become
-- persisted domain entities, add the FK in a later migration.
--
-- Indexes (non-unique), triggers, and RLS live in files 7–9.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── cuts ──────────────────────────────────────────────────────────────────
-- A single cut operation against a roll. Triggers in file 8 will decrement
-- rolls.remaining_length_mm and fire cut_completed notifications.

CREATE TABLE cuts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  roll_id             uuid REFERENCES rolls(id) ON DELETE SET NULL,
  cut_width_mm        integer NOT NULL CHECK (cut_width_mm > 0),
  cut_length_mm       integer NOT NULL CHECK (cut_length_mm > 0),
  quantity            integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  waste_sqmm          bigint CHECK (waste_sqmm IS NULL OR waste_sqmm >= 0),
  waste_percentage    numeric(5,2)
                      CHECK (waste_percentage IS NULL
                             OR (waste_percentage >= 0 AND waste_percentage <= 100)),
  total_sqmm_used     bigint CHECK (total_sqmm_used IS NULL OR total_sqmm_used >= 0),
  job_reference       varchar(100),
  cut_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz
);

COMMENT ON COLUMN cuts.waste_sqmm IS
  'Total waste in square millimeters (nesting engine produces sqmm natively).';
COMMENT ON COLUMN cuts.cut_by IS
  'The cutter (operator). May differ from created_by if a manager logs the cut on their behalf.';


-- ─── cut_history ───────────────────────────────────────────────────────────
-- Per-job history of cuts executed. Captures the material, the selected
-- part dimensions, performance metrics (fab_score, parts_completed), and a
-- price snapshot at cut time.

CREATE TABLE cut_history (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id                 uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  material_type_id        uuid NOT NULL REFERENCES material_types(id) ON DELETE RESTRICT,
  part_id                 uuid,
  cut_length_mm           integer NOT NULL CHECK (cut_length_mm > 0),
  cut_width_mm            integer NOT NULL CHECK (cut_width_mm > 0),
  cut_thickness_mm        numeric(8,3) CHECK (cut_thickness_mm IS NULL OR cut_thickness_mm > 0),
  part_custom_width_mm    integer
                          CHECK (part_custom_width_mm IS NULL OR part_custom_width_mm > 0),
  part_custom_height_mm   integer
                          CHECK (part_custom_height_mm IS NULL OR part_custom_height_mm > 0),
  part_custom_dimensions  jsonb,
  cut_amount              integer NOT NULL DEFAULT 1 CHECK (cut_amount > 0),
  parts_completed         integer NOT NULL DEFAULT 0 CHECK (parts_completed >= 0),
  cut_pieces              integer NOT NULL DEFAULT 0 CHECK (cut_pieces >= 0),
  material_used_sqmm      bigint NOT NULL DEFAULT 0 CHECK (material_used_sqmm >= 0),
  scrap_sqmm              bigint NOT NULL DEFAULT 0 CHECK (scrap_sqmm >= 0),
  fab_score               numeric(5,4)
                          CHECK (fab_score IS NULL OR (fab_score >= 0 AND fab_score <= 1)),
  cost_per_sqm_cents      bigint
                          CHECK (cost_per_sqm_cents IS NULL OR cost_per_sqm_cents >= 0),
  stock_label             varchar(200),
  pdf_url                 varchar(500),
  cut_date                timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at              timestamptz,

  CONSTRAINT cut_history_parts_completed_le_amount
    CHECK (parts_completed <= cut_amount)
);

COMMENT ON COLUMN cut_history.part_id IS
  'Reference to a Part entity. No FK yet — awaiting the Part-table decision. Nullable.';
COMMENT ON COLUMN cut_history.part_custom_dimensions IS
  'Arbitrary part-shape metadata (JSON). Type definition lives in the app layer.';
COMMENT ON COLUMN cut_history.fab_score IS
  'Fabrication quality score on 0..1 scale. NULL until scored.';
COMMENT ON COLUMN cut_history.cost_per_sqm_cents IS
  'Price snapshot at cut_date. Not kept in sync with later material_suppliers price changes.';


-- ─── cut_history_selection ─────────────────────────────────────────────────
-- Replaces the legacy INTEGER[] / TEXT[] array columns on cut_history
-- (part_selected_size, part_selected_size_text, part_selected_label).
-- One row per selection, ordered by selection_index.

CREATE TABLE cut_history_selection (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cut_history_id      uuid NOT NULL REFERENCES cut_history(id) ON DELETE CASCADE,
  selection_index     integer NOT NULL CHECK (selection_index >= 0),
  size_value          integer,
  size_text           varchar(200),
  label               varchar(200),
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT cut_history_selection_unique_index
    UNIQUE (cut_history_id, selection_index)
);

COMMENT ON TABLE cut_history_selection IS
  'Ordered selections made during a cut job. Replaces legacy array columns for portability.';


-- ─── cut_favorites ─────────────────────────────────────────────────────────
-- Per-user bookmarks of cut_history rows. Renamed from legacy
-- cut_history_favorites for brevity.

CREATE TABLE cut_favorites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cut_history_id      uuid NOT NULL REFERENCES cut_history(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,

  CONSTRAINT cut_favorites_user_cut_unique UNIQUE (user_id, cut_history_id)
);


-- ─── rolls: offcut lineage (deferred columns + consistency CHECK) ──────────
-- rolls.source_type and rolls.parent_roll_id are defined in file 2. The FK
-- to cut_history and the consistency CHECK live here because cut_history is
-- only defined above.

ALTER TABLE rolls
  ADD COLUMN source_cut_history_id uuid
    REFERENCES cut_history(id) ON DELETE RESTRICT;

COMMENT ON COLUMN rolls.source_cut_history_id IS
  'The cut_history row that produced this offcut. NULL for received rolls; required for offcuts (CHECK below).';

ALTER TABLE rolls
  ADD CONSTRAINT rolls_source_consistency
    CHECK (
      (source_type = 'received'
         AND parent_roll_id IS NULL
         AND source_cut_history_id IS NULL)
      OR
      (source_type = 'offcut'
         AND parent_roll_id IS NOT NULL
         AND source_cut_history_id IS NOT NULL)
    );
