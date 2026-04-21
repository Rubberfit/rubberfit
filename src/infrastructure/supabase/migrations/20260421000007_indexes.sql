-- ═══════════════════════════════════════════════════════════════════════════
-- REDESIGN — File 7 of 9: Non-unique perf indexes
-- ═══════════════════════════════════════════════════════════════════════════
-- Postgres does NOT auto-index FK columns. Every FK below gets a standalone
-- or composite index to support JOINs and cascading deletes.
--
-- Conventions:
--   • FK indexes: idx_<table>_<fk_col>
--   • Composite tenant-scoped: idx_<table>_tenant_<col>
--   • Partial active indexes: idx_<table>_<col>_active with
--       WHERE deleted_at IS NULL (+ status filters where appropriate)
--   • DESC created_at / cut_date / scheduled_for for feed/history queries
--
-- What's NOT in this file:
--   • UNIQUE constraints and filtered UNIQUE indexes — they live with their
--     tables in files 1–6 (data-integrity, not perf)
--   • Triggers / functions → file 8
--   • RLS policies → file 9
--
-- Index count bias: pay writes cost for reads we know we run. Skipped the
-- long tail of "might be useful someday" indexes.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── Core (file 1) ─────────────────────────────────────────────────────────

-- subscriptions
CREATE INDEX idx_subscriptions_tenant_id     ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_plan_id       ON subscriptions(plan_id);
CREATE INDEX idx_subscriptions_stripe_sub_id ON subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- profiles
CREATE INDEX idx_profiles_email ON profiles(email) WHERE email IS NOT NULL;
CREATE INDEX idx_profiles_platform_admin ON profiles(id) WHERE is_platform_admin = true;

-- memberships
-- (tenant_id, profile_id) is UNIQUE — covers tenant_id-leading lookups.
-- Need the reverse for "list tenants this user belongs to":
CREATE INDEX idx_memberships_profile_id ON memberships(profile_id);

-- addresses
CREATE INDEX idx_addresses_tenant_id ON addresses(tenant_id);

-- persons
CREATE INDEX idx_persons_tenant_id  ON persons(tenant_id);
CREATE INDEX idx_persons_profile_id ON persons(profile_id) WHERE profile_id IS NOT NULL;


-- ─── Inventory (file 2) ────────────────────────────────────────────────────

-- material_types
-- (tenant_id, name) is UNIQUE — tenant_id-leading queries already covered.

-- suppliers
-- (tenant_id, name) UNIQUE already covers tenant_id-leading.
CREATE INDEX idx_suppliers_address_id ON suppliers(address_id) WHERE address_id IS NOT NULL;
CREATE INDEX idx_suppliers_tenant_active
  ON suppliers(tenant_id)
  WHERE active = true AND deleted_at IS NULL;

-- supplier_contacts
-- (supplier_id, person_id) UNIQUE covers supplier_id-leading.
CREATE INDEX idx_supplier_contacts_person_id ON supplier_contacts(person_id);
CREATE INDEX idx_supplier_contacts_tenant_id ON supplier_contacts(tenant_id);

-- material_suppliers
-- (material_type_id, supplier_id) UNIQUE covers material_type_id-leading.
CREATE INDEX idx_material_suppliers_supplier_id ON material_suppliers(supplier_id);
CREATE INDEX idx_material_suppliers_tenant_id   ON material_suppliers(tenant_id);
CREATE INDEX idx_material_suppliers_material_active
  ON material_suppliers(material_type_id)
  WHERE active = true AND deleted_at IS NULL;

-- rolls
CREATE INDEX idx_rolls_tenant_id          ON rolls(tenant_id);
CREATE INDEX idx_rolls_material_type_id   ON rolls(material_type_id);
CREATE INDEX idx_rolls_supplier_id        ON rolls(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX idx_rolls_tenant_status
  ON rolls(tenant_id, status)
  WHERE deleted_at IS NULL;

-- price_history
CREATE INDEX idx_price_history_material_supplier_id ON price_history(material_supplier_id);
CREATE INDEX idx_price_history_tenant_id            ON price_history(tenant_id);
CREATE INDEX idx_price_history_effective_date_desc
  ON price_history(material_supplier_id, effective_date DESC);

-- reorder_rules
-- material_type_id UNIQUE covers material_type_id lookups.
CREATE INDEX idx_reorder_rules_tenant_id   ON reorder_rules(tenant_id);
CREATE INDEX idx_reorder_rules_supplier_id ON reorder_rules(supplier_id)
  WHERE supplier_id IS NOT NULL;
CREATE INDEX idx_reorder_rules_active
  ON reorder_rules(last_triggered_at NULLS FIRST)
  WHERE active = true AND deleted_at IS NULL;


-- ─── Operations (file 3) ───────────────────────────────────────────────────

-- cuts
CREATE INDEX idx_cuts_tenant_id ON cuts(tenant_id);
CREATE INDEX idx_cuts_roll_id   ON cuts(roll_id) WHERE roll_id IS NOT NULL;
CREATE INDEX idx_cuts_cut_by    ON cuts(cut_by)  WHERE cut_by IS NOT NULL;
CREATE INDEX idx_cuts_tenant_created_desc
  ON cuts(tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- cut_history
CREATE INDEX idx_cut_history_tenant_id        ON cut_history(tenant_id);
CREATE INDEX idx_cut_history_user_id          ON cut_history(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_cut_history_material_type_id ON cut_history(material_type_id);
CREATE INDEX idx_cut_history_part_id          ON cut_history(part_id) WHERE part_id IS NOT NULL;
CREATE INDEX idx_cut_history_tenant_cut_date_desc
  ON cut_history(tenant_id, cut_date DESC)
  WHERE deleted_at IS NULL;

-- cut_history_selection
-- (cut_history_id, selection_index) UNIQUE covers cut_history_id-leading.
CREATE INDEX idx_cut_history_selection_tenant_id ON cut_history_selection(tenant_id);

-- cut_favorites
-- (user_id, cut_history_id) UNIQUE covers user_id-leading.
CREATE INDEX idx_cut_favorites_cut_history_id ON cut_favorites(cut_history_id);
CREATE INDEX idx_cut_favorites_tenant_id      ON cut_favorites(tenant_id);

-- cut_reusable
CREATE INDEX idx_cut_reusable_cut_history_id ON cut_reusable(cut_history_id);
CREATE INDEX idx_cut_reusable_tenant_id      ON cut_reusable(tenant_id);
CREATE INDEX idx_cut_reusable_user_id        ON cut_reusable(user_id) WHERE user_id IS NOT NULL;


-- ─── Commerce (file 4) ─────────────────────────────────────────────────────

-- projects
CREATE INDEX idx_projects_tenant_id ON projects(tenant_id);
CREATE INDEX idx_projects_person_id ON projects(person_id) WHERE person_id IS NOT NULL;
CREATE INDEX idx_projects_tenant_status
  ON projects(tenant_id, status)
  WHERE deleted_at IS NULL;

-- project_owners
-- (project_id, owner_profile_id) UNIQUE covers project_id-leading.
CREATE INDEX idx_project_owners_owner_profile_id ON project_owners(owner_profile_id);
CREATE INDEX idx_project_owners_tenant_id        ON project_owners(tenant_id);

-- project_materials
-- (project_id, material_type_id) UNIQUE covers project_id-leading.
CREATE INDEX idx_project_materials_material_type_id ON project_materials(material_type_id);
CREATE INDEX idx_project_materials_tenant_id        ON project_materials(tenant_id);

-- project_cut_histories
-- (project_id, cut_history_id) UNIQUE covers project_id-leading.
CREATE INDEX idx_project_cut_histories_cut_history_id ON project_cut_histories(cut_history_id);
CREATE INDEX idx_project_cut_histories_tenant_id      ON project_cut_histories(tenant_id);

-- invoices
-- (tenant_id, invoice_number) UNIQUE covers tenant_id-leading.
CREATE INDEX idx_invoices_project_id         ON invoices(project_id)         WHERE project_id IS NOT NULL;
CREATE INDEX idx_invoices_person_id          ON invoices(person_id)          WHERE person_id IS NOT NULL;
CREATE INDEX idx_invoices_billing_address_id ON invoices(billing_address_id) WHERE billing_address_id IS NOT NULL;
CREATE INDEX idx_invoices_tenant_status
  ON invoices(tenant_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_tenant_due_date_outstanding
  ON invoices(tenant_id, due_date)
  WHERE status IN ('sent', 'overdue') AND deleted_at IS NULL;

-- jobs
CREATE INDEX idx_jobs_tenant_id  ON jobs(tenant_id);
CREATE INDEX idx_jobs_project_id ON jobs(project_id);
CREATE INDEX idx_jobs_person_id  ON jobs(person_id)  WHERE person_id IS NOT NULL;
CREATE INDEX idx_jobs_invoice_id ON jobs(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_jobs_tenant_status
  ON jobs(tenant_id, status)
  WHERE deleted_at IS NULL;

-- purchase_orders
-- (tenant_id, po_number) UNIQUE covers tenant_id-leading.
CREATE INDEX idx_purchase_orders_supplier_id         ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_shipping_address_id ON purchase_orders(shipping_address_id) WHERE shipping_address_id IS NOT NULL;
CREATE INDEX idx_purchase_orders_billing_address_id  ON purchase_orders(billing_address_id)  WHERE billing_address_id IS NOT NULL;
CREATE INDEX idx_purchase_orders_reorder_rule_id     ON purchase_orders(reorder_rule_id)     WHERE reorder_rule_id IS NOT NULL;
CREATE INDEX idx_purchase_orders_approved_by         ON purchase_orders(approved_by)         WHERE approved_by IS NOT NULL;
CREATE INDEX idx_purchase_orders_tenant_status
  ON purchase_orders(tenant_id, status)
  WHERE deleted_at IS NULL;

-- purchase_order_items
-- (purchase_order_id, line_number) UNIQUE covers purchase_order_id-leading.
CREATE INDEX idx_purchase_order_items_material_type_id ON purchase_order_items(material_type_id);
CREATE INDEX idx_purchase_order_items_tenant_id        ON purchase_order_items(tenant_id);


-- ─── Notifications (file 5) ────────────────────────────────────────────────

-- notifications
CREATE INDEX idx_notifications_tenant_id ON notifications(tenant_id);
CREATE INDEX idx_notifications_user_unread_created_desc
  ON notifications(user_id, created_at DESC)
  WHERE is_read = false;
CREATE INDEX idx_notifications_user_created_desc
  ON notifications(user_id, created_at DESC);

-- notification_queue
CREATE INDEX idx_notification_queue_tenant_id ON notification_queue(tenant_id);
CREATE INDEX idx_notification_queue_user_id   ON notification_queue(user_id);
-- Dispatcher hot path: pick next due item by priority + schedule.
CREATE INDEX idx_notification_queue_dispatch
  ON notification_queue(priority DESC, scheduled_for)
  WHERE status IN ('pending', 'failed');
-- Retry scheduler: find items whose backoff window has passed.
CREATE INDEX idx_notification_queue_retry
  ON notification_queue(next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;


-- ─── Reference (file 6) ────────────────────────────────────────────────────

-- tax_rates
-- Active-jurisdiction partial UNIQUE already covers (state, city, zip_code) lookups.
CREATE INDEX idx_tax_rates_state ON tax_rates(state) WHERE is_active = true AND deleted_at IS NULL;
