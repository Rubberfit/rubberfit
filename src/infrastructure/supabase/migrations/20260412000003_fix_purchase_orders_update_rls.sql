-- Fix purchase_orders UPDATE RLS policy.
--
-- The previous WITH CHECK clause forbade the new row from having
-- status IN ('received', 'cancelled'), which blocked the valid
-- transitions ordered -> received and * -> cancelled. The USING
-- clause already prevents further edits once a PO is in a terminal
-- state, which is the real intent.

DROP POLICY IF EXISTS "purchase_orders_update" ON purchase_orders;

CREATE POLICY "purchase_orders_update"
  ON purchase_orders FOR UPDATE
  USING      (auth.uid() = user_id AND status NOT IN ('received', 'cancelled'))
  WITH CHECK (auth.uid() = user_id);
