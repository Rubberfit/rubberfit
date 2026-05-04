-- Unify purchase_orders.po_number to the canonical PO-YY-NNNN format.
--
-- History: the DB function generate_po_number() has always produced
-- PO-YY-NNNN (e.g. PO-26-0042). Two TypeScript services, however, were
-- producing the legacy PO-YYYYMM-NNNN format (e.g. PO-202601-0042) for
-- auto-generated and manually created POs. Those services now call the
-- shared generatePoNumber() helper, which mirrors the DB function.
--
-- This migration backfills any remaining legacy rows. The DB function
-- itself is already canonical and is left untouched.
--
-- Uniqueness: purchase_orders.po_number carries a UNIQUE constraint, and
-- different months within the same year (e.g. PO-202601-0001 and
-- PO-202602-0001) can both collapse to the same PO-YY-NNNN literal if a
-- naive regexp_replace is used. To avoid collisions we renumber legacy
-- rows within each year by created_at, appending their new sequence to
-- the largest existing canonical sequence for that year.
--
-- Safe: UPDATE is gated by a WHERE clause that only matches the legacy
-- format. Rows already in canonical form are untouched. No DROP, no
-- destructive ops.

WITH legacy AS (
  SELECT
    id,
    substring(po_number FROM '^PO-([0-9]{2})[0-9]{4}-[0-9]+$') AS yy,
    created_at
  FROM purchase_orders
  WHERE po_number ~ '^PO-[0-9]{6}-[0-9]+$'
),
canonical_max AS (
  SELECT
    substring(po_number FROM '^PO-([0-9]{2})-([0-9]+)$') AS yy,
    COALESCE(
      MAX(CAST(substring(po_number FROM '^PO-[0-9]{2}-([0-9]+)$') AS INTEGER)),
      0
    ) AS max_seq
  FROM purchase_orders
  WHERE po_number ~ '^PO-[0-9]{2}-[0-9]+$'
  GROUP BY 1
),
renumbered AS (
  SELECT
    l.id,
    l.yy,
    COALESCE(cm.max_seq, 0)
      + ROW_NUMBER() OVER (PARTITION BY l.yy ORDER BY l.created_at, l.id) AS new_seq
  FROM legacy l
  LEFT JOIN canonical_max cm ON cm.yy = l.yy
)
UPDATE purchase_orders p
SET po_number = 'PO-' || r.yy || '-' || LPAD(r.new_seq::TEXT, 4, '0')
FROM renumbered r
WHERE p.id = r.id;
