-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260513000001_cut_history_id_to_uuid.sql
-- Repairs cut_history.id (and cut_history_favorites.id +
-- cut_history_favorites.cut_history_id) when the deployed table was
-- created with an INTEGER / SERIAL primary key instead of the UUID
-- shape declared in 20260412055550_create_cut_history.sql.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Why this exists:
--   The /dashboard/cutting-engine save flow generates `cutId =
--   crypto.randomUUID()` client-side and the saveCut action posts it
--   as `id` to the cut_history INSERT (see app/actions/cut-history.ts).
--   On the deployed preview/production DB this throws
--   `invalid input syntax for type integer: "<uuid>" (22P02)` because
--   the column is INTEGER. The CREATE TABLE in 20260412055550 used
--   `CREATE TABLE IF NOT EXISTS`, so when an earlier-shape cut_history
--   already existed (SERIAL id from a pre-migration scaffold) the
--   declaration was a no-op and the wrong type survived.
--
-- Companion tables fixed in the same migration:
--   * cut_history_favorites.id          INTEGER → UUID (per
--     20260412120000_create_cut_history_favorites.sql)
--   * cut_history_favorites.cut_history_id INTEGER → UUID (FK to
--     cut_history.id which is being rewritten)
--
-- Safety:
--   * Wrapped in a single transaction so a partial failure rolls back.
--   * Idempotent — if cut_history.id is already UUID, the migration
--     short-circuits at the guard and exits without touching anything.
--   * Preserves existing rows. Each integer id is replaced with a
--     freshly-minted UUID, and the favorites table's FK column is
--     remapped row-by-row before old columns are dropped, so no
--     favorite row goes orphaned.
--   * pdf_url values are untouched — existing rows keep their storage
--     paths (which encode the old integer id in the filename); only
--     the row's id changes. New rows after this migration write UUID-
--     based pdf paths and no path mismatch results.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  cut_id_type TEXT;
BEGIN
  SELECT data_type INTO cut_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'cut_history'
    AND column_name = 'id';

  IF cut_id_type = 'uuid' THEN
    RAISE NOTICE 'cut_history.id is already uuid — skipping repair';
    RETURN;
  END IF;

  RAISE NOTICE 'cut_history.id is %, rewriting to uuid', cut_id_type;

  -- Drop FK + unique constraint on cut_history_favorites since both
  -- the FK target and the local column are about to change type.
  ALTER TABLE cut_history_favorites
    DROP CONSTRAINT IF EXISTS cut_history_favorites_cut_history_id_fkey;
  ALTER TABLE cut_history_favorites
    DROP CONSTRAINT IF EXISTS cut_history_favorites_user_id_cut_history_id_key;
  DROP INDEX IF EXISTS idx_favorites_cut_history_id;

  -- Stage the new UUID columns. The favorites side is populated via
  -- a join against the cut_history mapping so each existing favorite
  -- row points at the same logical cut after the swap.
  ALTER TABLE cut_history
    ADD COLUMN id_new UUID NOT NULL DEFAULT gen_random_uuid();

  ALTER TABLE cut_history_favorites
    ADD COLUMN cut_history_id_new UUID;
  ALTER TABLE cut_history_favorites
    ADD COLUMN id_new UUID NOT NULL DEFAULT gen_random_uuid();

  UPDATE cut_history_favorites f
  SET cut_history_id_new = ch.id_new
  FROM cut_history ch
  WHERE f.cut_history_id = ch.id;

  -- Any favorite row whose cut_history_id no longer resolves (FK was
  -- supposed to prevent this, but defend against legacy stragglers).
  DELETE FROM cut_history_favorites
  WHERE cut_history_id_new IS NULL;

  -- Drop primary keys, sequence-backed defaults, and the old columns.
  ALTER TABLE cut_history_favorites DROP CONSTRAINT IF EXISTS cut_history_favorites_pkey;
  ALTER TABLE cut_history DROP CONSTRAINT IF EXISTS cut_history_pkey;

  ALTER TABLE cut_history       ALTER COLUMN id              DROP DEFAULT;
  ALTER TABLE cut_history_favorites ALTER COLUMN id              DROP DEFAULT;
  ALTER TABLE cut_history_favorites ALTER COLUMN cut_history_id  DROP DEFAULT;

  ALTER TABLE cut_history_favorites DROP COLUMN cut_history_id;
  ALTER TABLE cut_history_favorites DROP COLUMN id;
  ALTER TABLE cut_history       DROP COLUMN id;

  ALTER TABLE cut_history_favorites RENAME COLUMN cut_history_id_new TO cut_history_id;
  ALTER TABLE cut_history_favorites RENAME COLUMN id_new             TO id;
  ALTER TABLE cut_history       RENAME COLUMN id_new             TO id;

  -- Restore constraints, defaults, indexes.
  ALTER TABLE cut_history       ADD PRIMARY KEY (id);
  ALTER TABLE cut_history       ALTER COLUMN id SET DEFAULT gen_random_uuid();

  ALTER TABLE cut_history_favorites ADD PRIMARY KEY (id);
  ALTER TABLE cut_history_favorites ALTER COLUMN id SET DEFAULT gen_random_uuid();
  ALTER TABLE cut_history_favorites ALTER COLUMN cut_history_id SET NOT NULL;

  ALTER TABLE cut_history_favorites
    ADD CONSTRAINT cut_history_favorites_cut_history_id_fkey
    FOREIGN KEY (cut_history_id) REFERENCES cut_history(id) ON DELETE CASCADE;

  ALTER TABLE cut_history_favorites
    ADD CONSTRAINT cut_history_favorites_user_id_cut_history_id_key
    UNIQUE (user_id, cut_history_id);

  CREATE INDEX IF NOT EXISTS idx_favorites_cut_history_id
    ON cut_history_favorites(cut_history_id);
END;
$$;
