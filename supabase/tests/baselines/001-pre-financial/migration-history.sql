\set ON_ERROR_STOP on

DELETE FROM supabase_migrations.schema_migrations;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES
  ('20240730075029', 'init_db', ARRAY[]::text[]),
  ('20240730075425', 'init_triggers', ARRAY[]::text[]),
  ('20240806124555', 'task_sales_id', ARRAY[]::text[]),
  ('20240807082449', 'remove-aquisition', ARRAY[]::text[]),
  ('20240808141826', 'init_state_configure', ARRAY[]::text[]),
  ('20240813084010', 'tags_policy', ARRAY[]::text[]),
  ('20241104153231', 'sales_policies', ARRAY[]::text[]),
  ('20250109152531', 'email_jsonb', ARRAY[]::text[]),
  ('20250113132531', 'phone_jsonb', ARRAY[]::text[]),
  ('20251204172855', 'merge_contacts_function', ARRAY[]::text[]),
  ('20251204201317', 'drop_merge_contacts_function', ARRAY[]::text[]),
  ('20260108160722', 'task_default_sales', ARRAY[]::text[]),
  ('20260115150819', 'snake_case_renaming', ARRAY[]::text[]),
  ('20260127140209', 'imports', ARRAY[]::text[]),
  ('20260128165057', 'sso_handling', ARRAY[]::text[]),
  ('20260211194545', 'app_configuration', ARRAY[]::text[]),
  ('20260226163952', 'deals_expected_closing_date_date_only', ARRAY[]::text[]),
  ('20260304104600', 'note_attachments_trigger', ARRAY[]::text[]),
  ('20260305000001', 'custom_pipeline_stages', ARRAY[]::text[]),
  ('20260305000002', 'add_projects_table', ARRAY[]::text[]),
  ('20260305000003', 'add_project_analytics_table', ARRAY[]::text[]),
  ('20260305000004', 'add_invoices_table', ARRAY[]::text[]),
  ('20260305000005', 'add_realtime', ARRAY[]::text[]),
  ('20260306000001', 'add_leads_table', ARRAY[]::text[]),
  ('20260306000002', 'add_lead_activities_table', ARRAY[]::text[]),
  ('20260306000003', 'lead_scoring_function', ARRAY[]::text[]),
  ('20260306000004', 'lead_conversion_function', ARRAY[]::text[]),
  ('20260306000005', 'add_leads_realtime', ARRAY[]::text[]),
  ('20260306000006', 'add_touchpoints_table', ARRAY[]::text[]),
  ('20260306000007', 'attribution_summary_view', ARRAY[]::text[]),
  ('20260306000008', 'attribution_triggers', ARRAY[]::text[]),
  ('20260825000001', 'harden_lead_conversion', ARRAY[]::text[]);
