-- ═══════════════════════════════════════════════════════════════════════════
-- REDESIGN — File 9 of 9: Row-Level Security policies
-- ═══════════════════════════════════════════════════════════════════════════
-- Enables RLS on every table and adds policies keyed on tenant membership,
-- with a platform-admin bypass.
--
-- Layers:
--   1. Helper functions (SECURITY DEFINER, STABLE) for the three identity
--      checks used across policies: platform admin, "my tenants",
--      "admin of tenant X"
--   2. ENABLE ROW LEVEL SECURITY on all 32 tables
--   3. Policies, grouped:
--        • Global reference     — plans, tax_rates (read-all / admin write)
--        • Identity             — profiles, memberships, user_preferences
--        • Org                  — tenants, tenant_settings, subscriptions
--        • Standard tenant_iso  — everything with a tenant_id
--        • User-scoped          — cut_favorites, notifications, notification_queue
--
-- Notes:
--   • service_role bypasses RLS (Supabase convention). Server-side code using
--     the service key can always read/write; policies only gate user sessions.
--   • Trigger functions that write for other users (rolls_notify_*) are
--     SECURITY DEFINER in file 8, so they bypass RLS when inserting
--     notifications targeted at tenant admins.
--   • `auth.uid()` returns NULL for anon; helper functions short-circuit
--     false/empty in that case, so anon traffic sees nothing.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- Helper functions
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION auth_is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

COMMENT ON FUNCTION auth_is_platform_admin() IS
  'True if the current JWT user has is_platform_admin = true. NULL auth.uid() returns false.';


CREATE OR REPLACE FUNCTION auth_user_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
    FROM memberships
   WHERE profile_id = auth.uid()
     AND deleted_at IS NULL;
$$;

COMMENT ON FUNCTION auth_user_tenant_ids() IS
  'Tenant IDs the current JWT user is a member of. Empty for anon / non-members.';


CREATE OR REPLACE FUNCTION auth_user_is_admin_of(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM memberships
     WHERE profile_id = auth.uid()
       AND tenant_id = target_tenant_id
       AND 'admin' = ANY(roles)
       AND deleted_at IS NULL
  );
$$;

COMMENT ON FUNCTION auth_user_is_admin_of(uuid) IS
  'True if the current JWT user has admin role in the target tenant.';


-- ═══════════════════════════════════════════════════════════════════════════
-- ENABLE ROW LEVEL SECURITY on all tables
-- ═══════════════════════════════════════════════════════════════════════════

-- Core (file 1)
ALTER TABLE plans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE persons             ENABLE ROW LEVEL SECURITY;

-- Inventory (file 2)
ALTER TABLE material_types          ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_suppliers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rolls                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history           ENABLE ROW LEVEL SECURITY;
ALTER TABLE reorder_rules           ENABLE ROW LEVEL SECURITY;

-- Operations (file 3)
ALTER TABLE cuts                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cut_history             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cut_history_selection   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cut_favorites           ENABLE ROW LEVEL SECURITY;

-- Commerce (file 4)
ALTER TABLE projects                ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_owners          ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_materials       ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_cut_histories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices                ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_parts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_assignees           ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_roll_allocations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items    ENABLE ROW LEVEL SECURITY;

-- Notifications (file 5)
ALTER TABLE notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue      ENABLE ROW LEVEL SECURITY;

-- Reference (file 6)
ALTER TABLE tax_rates               ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════════
-- GLOBAL REFERENCE TABLES — plans, tax_rates
-- Read: any authenticated user. Write: platform admins only.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY plans_read_authenticated ON plans
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY plans_write_platform_admin ON plans
  FOR ALL
  USING (auth_is_platform_admin())
  WITH CHECK (auth_is_platform_admin());


CREATE POLICY tax_rates_read_authenticated ON tax_rates
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY tax_rates_write_platform_admin ON tax_rates
  FOR ALL
  USING (auth_is_platform_admin())
  WITH CHECK (auth_is_platform_admin());


-- ═══════════════════════════════════════════════════════════════════════════
-- IDENTITY TABLES — profiles, memberships, user_preferences
-- ═══════════════════════════════════════════════════════════════════════════

-- profiles: user sees own + tenant-mates; updates own; platform admin sees all
CREATE POLICY profiles_select ON profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR auth_is_platform_admin()
    OR id IN (
      SELECT profile_id FROM memberships
       WHERE tenant_id IN (SELECT auth_user_tenant_ids())
         AND deleted_at IS NULL
    )
  );

CREATE POLICY profiles_insert_self ON profiles
  FOR INSERT
  WITH CHECK (id = auth.uid() OR auth_is_platform_admin());

CREATE POLICY profiles_update_self ON profiles
  FOR UPDATE
  USING (id = auth.uid() OR auth_is_platform_admin())
  WITH CHECK (id = auth.uid() OR auth_is_platform_admin());

CREATE POLICY profiles_delete_platform_admin ON profiles
  FOR DELETE
  USING (auth_is_platform_admin());


-- memberships: members see their tenant's rows; admins write
CREATE POLICY memberships_select ON memberships
  FOR SELECT
  USING (
    auth_is_platform_admin()
    OR tenant_id IN (SELECT auth_user_tenant_ids())
  );

CREATE POLICY memberships_write_admin ON memberships
  FOR ALL
  USING (
    auth_is_platform_admin()
    OR auth_user_is_admin_of(tenant_id)
  )
  WITH CHECK (
    auth_is_platform_admin()
    OR auth_user_is_admin_of(tenant_id)
  );


-- user_preferences: strictly self + platform admin
CREATE POLICY user_preferences_self ON user_preferences
  FOR ALL
  USING (profile_id = auth.uid() OR auth_is_platform_admin())
  WITH CHECK (profile_id = auth.uid() OR auth_is_platform_admin());


-- ═══════════════════════════════════════════════════════════════════════════
-- ORG TABLES — tenants, tenant_settings, subscriptions
-- ═══════════════════════════════════════════════════════════════════════════

-- tenants: members can see; only tenant admins can update; platform admin full
CREATE POLICY tenants_select ON tenants
  FOR SELECT
  USING (
    auth_is_platform_admin()
    OR id IN (SELECT auth_user_tenant_ids())
  );

CREATE POLICY tenants_insert_platform_admin ON tenants
  FOR INSERT
  WITH CHECK (auth_is_platform_admin());

CREATE POLICY tenants_update_admin ON tenants
  FOR UPDATE
  USING (auth_is_platform_admin() OR auth_user_is_admin_of(id))
  WITH CHECK (auth_is_platform_admin() OR auth_user_is_admin_of(id));

CREATE POLICY tenants_delete_platform_admin ON tenants
  FOR DELETE
  USING (auth_is_platform_admin());


-- tenant_settings: shared PK with tenants; same access pattern
CREATE POLICY tenant_settings_select ON tenant_settings
  FOR SELECT
  USING (
    auth_is_platform_admin()
    OR tenant_id IN (SELECT auth_user_tenant_ids())
  );

CREATE POLICY tenant_settings_write_admin ON tenant_settings
  FOR ALL
  USING (auth_is_platform_admin() OR auth_user_is_admin_of(tenant_id))
  WITH CHECK (auth_is_platform_admin() OR auth_user_is_admin_of(tenant_id));


-- subscriptions: members read; admins write (billing)
CREATE POLICY subscriptions_select ON subscriptions
  FOR SELECT
  USING (
    auth_is_platform_admin()
    OR tenant_id IN (SELECT auth_user_tenant_ids())
  );

CREATE POLICY subscriptions_write_admin ON subscriptions
  FOR ALL
  USING (auth_is_platform_admin() OR auth_user_is_admin_of(tenant_id))
  WITH CHECK (auth_is_platform_admin() OR auth_user_is_admin_of(tenant_id));


-- ═══════════════════════════════════════════════════════════════════════════
-- STANDARD TENANT-ISOLATION — all data tables
-- Any tenant member can read/write rows in their tenants. Platform admin full.
-- ═══════════════════════════════════════════════════════════════════════════

-- persons (file 1) — addresses table dropped 2026-05-12; addresses are
-- inline columns on suppliers/purchase_orders/invoices now.
CREATE POLICY persons_tenant_isolation ON persons
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

-- Inventory (file 2)
CREATE POLICY material_types_tenant_isolation ON material_types
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

CREATE POLICY suppliers_tenant_isolation ON suppliers
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

CREATE POLICY supplier_contacts_tenant_isolation ON supplier_contacts
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

CREATE POLICY material_suppliers_tenant_isolation ON material_suppliers
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

CREATE POLICY rolls_tenant_isolation ON rolls
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

CREATE POLICY price_history_tenant_isolation ON price_history
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

CREATE POLICY reorder_rules_tenant_isolation ON reorder_rules
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

-- Operations (file 3)
CREATE POLICY cuts_tenant_isolation ON cuts
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

-- cut_history: canonical write-once 4-policy shape (no UPDATE policy →
-- the table is immutable once inserted). Ports the post-bundle-1 shape
-- from dev's 20260506000001_cut_history_canonical_rls.sql, retrofitted
-- for tenant scope.
CREATE POLICY cut_history_select_tenant ON cut_history
  FOR SELECT
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

CREATE POLICY cut_history_insert_self_tenant ON cut_history
  FOR INSERT
  WITH CHECK (
    auth_is_platform_admin()
    OR (
      tenant_id IN (SELECT auth_user_tenant_ids())
      AND (user_id IS NULL OR user_id = auth.uid())
    )
  );

CREATE POLICY cut_history_delete_self_tenant ON cut_history
  FOR DELETE
  USING (
    auth_is_platform_admin()
    OR (
      tenant_id IN (SELECT auth_user_tenant_ids())
      AND user_id = auth.uid()
    )
  );

CREATE POLICY cut_history_delete_admin ON cut_history
  FOR DELETE
  USING (auth_is_platform_admin() OR auth_user_is_admin_of(tenant_id));

CREATE POLICY cut_history_selection_tenant_isolation ON cut_history_selection
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

-- Commerce (file 4)
CREATE POLICY projects_tenant_isolation ON projects
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

CREATE POLICY project_owners_tenant_isolation ON project_owners
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

CREATE POLICY project_materials_tenant_isolation ON project_materials
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

CREATE POLICY project_cut_histories_tenant_isolation ON project_cut_histories
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

CREATE POLICY invoices_tenant_isolation ON invoices
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

CREATE POLICY jobs_tenant_isolation ON jobs
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

CREATE POLICY job_parts_tenant_isolation ON job_parts
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

CREATE POLICY job_assignees_tenant_isolation ON job_assignees
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

CREATE POLICY job_roll_allocations_tenant_isolation ON job_roll_allocations
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

CREATE POLICY purchase_orders_tenant_isolation ON purchase_orders
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));

CREATE POLICY purchase_order_items_tenant_isolation ON purchase_order_items
  FOR ALL
  USING (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()))
  WITH CHECK (auth_is_platform_admin() OR tenant_id IN (SELECT auth_user_tenant_ids()));


-- ═══════════════════════════════════════════════════════════════════════════
-- USER-SCOPED — rows filtered by user_id within a tenant
-- ═══════════════════════════════════════════════════════════════════════════

-- cut_favorites: only the owning user sees / writes their own favorites
CREATE POLICY cut_favorites_self ON cut_favorites
  FOR ALL
  USING (user_id = auth.uid() OR auth_is_platform_admin())
  WITH CHECK (user_id = auth.uid() OR auth_is_platform_admin());


-- notifications: recipient-scoped read/update/delete;
-- INSERT allowed for any tenant member (triggers are SECURITY DEFINER and
-- bypass RLS; app-layer inserts stay tenant-scoped).
CREATE POLICY notifications_select_self ON notifications
  FOR SELECT
  USING (user_id = auth.uid() OR auth_is_platform_admin());

CREATE POLICY notifications_insert_tenant ON notifications
  FOR INSERT
  WITH CHECK (
    auth_is_platform_admin()
    OR tenant_id IN (SELECT auth_user_tenant_ids())
  );

CREATE POLICY notifications_update_self ON notifications
  FOR UPDATE
  USING (user_id = auth.uid() OR auth_is_platform_admin())
  WITH CHECK (user_id = auth.uid() OR auth_is_platform_admin());

CREATE POLICY notifications_delete_self ON notifications
  FOR DELETE
  USING (user_id = auth.uid() OR auth_is_platform_admin());


-- notification_queue: same shape as notifications
CREATE POLICY notification_queue_select_self ON notification_queue
  FOR SELECT
  USING (user_id = auth.uid() OR auth_is_platform_admin());

CREATE POLICY notification_queue_insert_tenant ON notification_queue
  FOR INSERT
  WITH CHECK (
    auth_is_platform_admin()
    OR tenant_id IN (SELECT auth_user_tenant_ids())
  );

CREATE POLICY notification_queue_update_self ON notification_queue
  FOR UPDATE
  USING (user_id = auth.uid() OR auth_is_platform_admin())
  WITH CHECK (user_id = auth.uid() OR auth_is_platform_admin());

CREATE POLICY notification_queue_delete_self ON notification_queue
  FOR DELETE
  USING (user_id = auth.uid() OR auth_is_platform_admin());
