#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyBaseline } from "./verify-baseline.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const baselineDirectory = path.join(
  repositoryRoot,
  "supabase/tests/baselines/001-pre-financial",
);
const transformationRegistryDirectory = path.join(
  repositoryRoot,
  "supabase/tests/upgrades",
);
const expectationDirectory = path.join(
  repositoryRoot,
  "supabase/tests/baselines/002-pre-financial-pg17",
);
const coreCategoryNames = [
  "row_identity_counts",
  "ownership_foreign_keys",
  "invoice_numeric_text",
  "row_payload_hashes",
  "constraint_definitions",
  "grant_matrix",
  "queryability",
];
export const PHASE3_CATEGORY_NAMES = Object.freeze([
  "exact_invoice_values",
  "exact_invoice_line_items",
  "exact_automation_contract",
  "exact_evidence_finalization",
  "exact_invoice_rpcs",
  "exact_invoice_acl",
  "exact_tax_rate_compatibility",
  "unrelated_crm_payloads",
]);
export const PHASE3_REQUIRED_TRANSFORMATIONS = Object.freeze([
  "invoice_numeric_text",
  "row_payload_hashes",
  "constraint_definitions",
  "grant_matrix",
  "exact_invoice_values",
  "exact_invoice_line_items",
  "exact_automation_contract",
  "exact_evidence_finalization",
  "exact_invoice_rpcs",
  "exact_invoice_acl",
  "exact_tax_rate_compatibility",
]);
export const PHASE3_EXACT_INVARIANTS = Object.freeze([
  "exact_invoice_values_canonical",
  "exact_line_items_canonical",
  "exact_automation_state_canonical",
  "exact_evidence_finalization_replaced",
  "exact_invoice_rpcs_locked",
  "exact_invoice_acl_least_privilege",
  "tax_rate_compatibility_exact",
  "unrelated_crm_payloads_preserved",
]);
export const PHASE4_CATEGORY_NAMES = Object.freeze([
  "constraint_definitions",
  "grant_matrix",
  "agreement_close_schema",
  "agreement_close_rpcs",
  "agreement_close_security",
  "agreement_close_capabilities",
]);
export const PHASE4_REQUIRED_TRANSFORMATIONS = Object.freeze([
  ...PHASE4_CATEGORY_NAMES,
]);
export const PHASE4_AGREEMENT_CLOSE_INVARIANTS = Object.freeze([
  "agreement_close_schema_complete",
  "agreement_close_rpcs_locked",
  "agreement_close_acl_least_privilege",
  "agreement_close_capabilities_exact",
  "agreement_close_policy_exact",
  "agreement_close_business_facts_append_only",
]);
export const PHASE4_MIGRATIONS = Object.freeze([
  "20260904000001",
  "20260904000002",
  "20260904000003",
  "20260904000004",
  "20260904000005",
  "20260904000006",
  "20260904000007",
]);
const phase3RepeatedCoreCategories = new Set([
  "invoice_numeric_text",
  "row_payload_hashes",
  "constraint_definitions",
  "grant_matrix",
]);
const phase4RepeatedCoreCategories = new Set([
  "constraint_definitions",
  "grant_matrix",
]);
// These are fingerprints of the immutable 001 baseline under the Phase 3-only
// queries. They are kept outside the accepted baseline files so those inputs
// remain byte-identical while a future sequence-003 registry can be validated.
export const PHASE3_BASELINE_CATEGORY_HASHES = Object.freeze({
  exact_invoice_values:
    "4b53a9ecb1db34f69f0e362b0bb698735923a9a166732c98c6408b0a08c61882",
  exact_invoice_line_items:
    "9982234fe4183a271d3b189598b72d4c8fc1f6bdb9694e9b1cdda48dbb7dcba6",
  exact_automation_contract:
    "aa7033d9a8fa8f062a85b219133af2a6cdb85669a331f9fa2e9c5e6535d9398a",
  exact_evidence_finalization:
    "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  exact_invoice_rpcs:
    "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  exact_invoice_acl:
    "643db11d1dcc0fbb22a879394a0f356fe1836010e161cf85d61414feac002bc6",
  exact_tax_rate_compatibility:
    "887c4782b2929597ebcad451e3758924f401060f2a2cdba5823f8a0ce1635fff",
  unrelated_crm_payloads:
    "8fa44e2d8d7dd37160a8680e7be0f167662802a1740cfe8b12d4473f3040e65d",
});
export const PHASE4_BASELINE_CATEGORY_HASHES = Object.freeze({
  constraint_definitions:
    "76355bdf051f18f53a3cb66b66eb10e3a7f5fec6a374edc24697c6428b7f2a37",
  grant_matrix:
    "6efd12a06e66d5a3b266700cd86c7be535f9ca45ad55bc7aaf0ec3319150a8c4",
  agreement_close_schema:
    "4e1d75893abc7a52490325c585ddd9b6522f498abc076502bf11ec5fcb8b6c09",
  agreement_close_rpcs:
    "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  agreement_close_security:
    "214a524735d72acfdfde0a82c188751f08f9d560cf3a8a96e77aec9cce4f8c23",
  agreement_close_capabilities:
    "2cf2a5e2f1abea32565e885543e63a391c12771bbdd828aa5ff397a39c8dfa78",
});
const fixtureUserIds = [
  "10000000-0000-0000-0000-000000000001",
  "10000000-0000-0000-0000-000000000002",
];
const allowedSemanticInvariants = new Set([
  "billing_grants_least_privilege",
  "billing_kernel_rows_added",
  "invoice_business_facts_preserved",
  "invoice_count_preserved",
  "invoice_legacy_ownership_preserved",
  "invoice_numeric_text_preserved",
  "invoice_provider_text_preserved",
  "invoice_tenant_foreign_keys_valid",
  "invoice_tenant_keys_complete",
  ...PHASE3_EXACT_INVARIANTS,
  ...PHASE4_AGREEMENT_CLOSE_INVARIANTS,
]);
const registryFields = [
  "baseline_id",
  "migrations",
  "registry_id",
  "semantic_invariants",
  "sequence",
  "transformations",
  "version",
];
const phase4RegistryFields = [...registryFields, "migration_sha256"];
const transformationFields = ["after_sha256", "before_sha256", "migration"];
const immutableUpgradeInputHashes = Object.freeze({
  "supabase/tests/baselines/001-pre-financial/manifest.json":
    "eb1f2e2cdee134e72f45664a11557dcecce66cec1011cfdfaf99bd5dfd100e93",
  "supabase/tests/upgrades/002-billing-tenancy/expected-transformations.json":
    "dea0df2f23c11c7292e01996fa32e9a0a0e7b6741260de741fee8e76d375211a",
  "supabase/tests/upgrades/003-exact-money/expected-transformations.json":
    "7685e1bb8160219dae2c4745dd99adc5aa5fe05afca1f49f92fab08d5b7d4fd6",
  "supabase/migrations/20260901000002_billing_invoice_boundary.sql":
    "811947e5391aedbbbb452daee5a41302a35d610122845b909b7c53e21ff57817",
  "supabase/migrations/20260901000003_billing_automation_grants.sql":
    "d1c27c260561131037712aab783b90101a7949b41e0528052c9f764666cc92fd",
  "supabase/migrations/20260901000004_billing_evidence_security.sql":
    "740ac8cc9c5955c3e64c837082402f0d7f94e5fe2f145d88489d22b010dc48c0",
  "supabase/migrations/20260902000001_exact_financial_primitives.sql":
    "ef96c9c3c7ece1cca05c4a0bc3c479e72cd30f65acbfe2e0b48b9fa08b561ca3",
  "supabase/migrations/20260902000002_exact_billing_expand.sql":
    "588cee98b2eb5d2c447f413f88fac8eec4930be61f451c2e285033379890df76",
  "supabase/migrations/20260903000001_exact_invoice_save_error_contract.sql":
    "ee40140a610785daa053f1be7480cd371b52c6230a97b4e8630eb7e728fe7f94",
  "supabase/migrations/20260904000001_billing_agreements.sql":
    "922c3cdd9ae66e88e334bfe6ceccf5e77b1dad07ba86697ffbaceba75638b097",
  "supabase/migrations/20260904000002_billing_revenue_periods.sql":
    "314a9cfab2bcf3631fb9779e511eaddb4013ea9e9edb1306440ca1e824b99fc4",
  "supabase/migrations/20260904000003_billing_calculations.sql":
    "5d3b580991bc0fd0af87d07aa844c35764051db9deccc07372275846ba9e5111",
  "supabase/migrations/20260904000004_billing_calculation_close.sql":
    "1c96271b48a6df0600a4c01ffafce2d3cc919275fddccd4ce725b0602e35c9a1",
  "supabase/migrations/20260904000005_billing_provider_reads.sql":
    "b66b5efe45b090fb76fd130ff9f39c770c9b88fb5d4b124f45c175be909a8039",
  "supabase/migrations/20260904000006_billing_agreement_history_read.sql":
    "4a16537fcdd5a6900d8774dd02fdee8a11745687eb5c7d45aea2ed4038483831",
  "supabase/migrations/20260904000007_billing_adjustment_support_read.sql":
    "9a99d365db3f82061110cb9cd2491189b7f1164eb16fa3a514e344b27cbb852b",
});

const fingerprintQueries = {
  row_identity_counts: `
    SELECT COALESCE(jsonb_agg(to_jsonb(summary) ORDER BY table_name), '[]'::jsonb)
    FROM (
      SELECT 'companies' AS table_name, count(*)::text AS row_count,
        COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb) AS ids FROM public.companies
      UNION ALL SELECT 'contacts', count(*)::text,
        COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb) FROM public.contacts
      UNION ALL SELECT 'deals', count(*)::text,
        COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb) FROM public.deals
      UNION ALL SELECT 'invoices', count(*)::text,
        COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb) FROM public.invoices
      UNION ALL SELECT 'lead_activities', count(*)::text,
        COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb) FROM public.lead_activities
      UNION ALL SELECT 'leads', count(*)::text,
        COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb) FROM public.leads
      UNION ALL SELECT 'project_analytics', count(*)::text,
        COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb) FROM public.project_analytics
      UNION ALL SELECT 'projects', count(*)::text,
        COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb) FROM public.projects
      UNION ALL SELECT 'sales', count(*)::text,
        COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb) FROM public.sales
      UNION ALL SELECT 'touchpoints', count(*)::text,
        COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb) FROM public.touchpoints
    ) AS summary`,
  ownership_foreign_keys: `
    SELECT COALESCE(jsonb_agg(link ORDER BY link->>'entity', link->>'id'), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object('entity','sales','id',id::text,'user_id',user_id::text) AS link FROM public.sales
      UNION ALL SELECT jsonb_build_object('entity','companies','id',id::text,'sales_id',sales_id::text) FROM public.companies
      UNION ALL SELECT jsonb_build_object('entity','contacts','id',id::text,'sales_id',sales_id::text,'company_id',company_id::text) FROM public.contacts
      UNION ALL SELECT jsonb_build_object('entity','deals','id',id::text,'sales_id',sales_id::text,'company_id',company_id::text) FROM public.deals
      UNION ALL SELECT jsonb_build_object('entity','projects','id',id::text,'sales_id',sales_id::text,'company_id',company_id::text,'deal_id',deal_id::text) FROM public.projects
      UNION ALL SELECT jsonb_build_object('entity','project_analytics','id',id::text,'project_id',project_id::text) FROM public.project_analytics
      UNION ALL SELECT jsonb_build_object('entity','invoices','id',id::text,'sales_id',sales_id::text,'company_id',company_id::text,'project_id',project_id::text,'deal_id',deal_id::text) FROM public.invoices
      UNION ALL SELECT jsonb_build_object('entity','leads','id',id::text,'sales_id',sales_id::text,'contact_id',converted_contact_id::text,'deal_id',converted_deal_id::text) FROM public.leads
      UNION ALL SELECT jsonb_build_object('entity','lead_activities','id',id::text,'sales_id',sales_id::text,'lead_id',lead_id::text) FROM public.lead_activities
      UNION ALL SELECT jsonb_build_object('entity','touchpoints','id',id::text,'sales_id',sales_id::text,'lead_id',lead_id::text,'contact_id',contact_id::text,'deal_id',deal_id::text) FROM public.touchpoints
    ) AS links`,
  invoice_numeric_text: `
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id::text,
          'amount', amount::text,
          'tax_rate', tax_rate::text,
          'tax_amount', tax_amount::text,
          'total_amount', total_amount::text
        ) ORDER BY id
      ),
      '[]'::jsonb
    )
    FROM public.invoices`,
  row_payload_hashes: `
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('entity', entity, 'id', id::text, 'payload', payload)
        ORDER BY entity, id
      ),
      '[]'::jsonb
    )
    FROM (
      SELECT 'companies' AS entity, id, to_jsonb(row_value)::text AS payload FROM public.companies AS row_value
      UNION ALL SELECT 'contacts', id, to_jsonb(row_value)::text FROM public.contacts AS row_value
      UNION ALL SELECT 'deals', id, to_jsonb(row_value)::text FROM public.deals AS row_value
      UNION ALL SELECT 'invoices', id, to_jsonb(row_value)::text FROM public.invoices AS row_value
      UNION ALL SELECT 'lead_activities', id, to_jsonb(row_value)::text FROM public.lead_activities AS row_value
      UNION ALL SELECT 'leads', id, to_jsonb(row_value)::text FROM public.leads AS row_value
      UNION ALL SELECT 'project_analytics', id, to_jsonb(row_value)::text FROM public.project_analytics AS row_value
      UNION ALL SELECT 'projects', id, to_jsonb(row_value)::text FROM public.projects AS row_value
      UNION ALL SELECT 'sales', id, to_jsonb(row_value)::text FROM public.sales AS row_value
      UNION ALL SELECT 'touchpoints', id, to_jsonb(row_value)::text FROM public.touchpoints AS row_value
    ) AS payloads`,
  constraint_definitions: `
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'table', relation.relname,
          'name', constraint_record.conname,
          'type', constraint_record.contype::text,
          'definition', pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
        ) ORDER BY relation.relname, constraint_record.conname
      ),
      '[]'::jsonb
    )
    FROM pg_catalog.pg_constraint AS constraint_record
    JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_record.conrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'`,
  grant_matrix: `
    SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'kind', entry->>'object', entry->>'grantee', entry->>'privilege'), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
        'kind','table','object',table_name,'grantee',grantee,'privilege',privilege_type
      ) AS entry
      FROM information_schema.table_privileges
      WHERE table_schema = 'public'
        AND grantee IN ('anon','authenticated','service_role','PUBLIC')
      UNION ALL
      SELECT jsonb_build_object(
        'kind','routine','object',routine_name,'grantee',grantee,'privilege',privilege_type
      )
      FROM information_schema.routine_privileges
      WHERE routine_schema = 'public'
        AND grantee IN ('anon','authenticated','service_role','PUBLIC')
      UNION ALL
      SELECT jsonb_build_object(
        'kind','sequence','object',object_name,'grantee',grantee,'privilege',privilege_type
      )
      FROM information_schema.usage_privileges
      WHERE object_schema = 'public'
        AND grantee IN ('anon','authenticated','service_role','PUBLIC')
    ) AS grants`,
  queryability: `
    SELECT jsonb_build_object(
      'companies_summary_count', (SELECT count(*)::text FROM public.companies_summary),
      'contacts_summary_count', (SELECT count(*)::text FROM public.contacts_summary),
      'channel_attribution_count', (SELECT count(*)::text FROM public.channel_attribution_summary),
      'lead_source_count', (SELECT count(*)::text FROM public.lead_source_performance),
      'customer_journey_count', (SELECT count(*)::text FROM public.customer_journeys),
      'init_state', (SELECT is_initialized::text FROM public.init_state),
      'favicon_result', public.get_domain_favicon('baseline.example'),
      'conversion_rpc_authenticated_execute', pg_catalog.has_function_privilege(
        'authenticated',
        'public.convert_lead_to_contact(bigint,text,bigint)',
        'EXECUTE'
      )
    )`,
  exact_invoice_values: `
    WITH invoice_rows AS (
      SELECT id, pg_catalog.to_jsonb(invoice) AS row_value
      FROM public.invoices AS invoice
    )
    SELECT pg_catalog.jsonb_build_object(
      'columns', (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'name', column_name,
              'data_type', data_type,
              'udt_name', udt_name,
              'nullable', is_nullable
            ) ORDER BY ordinal_position
          ),
          '[]'::jsonb
        )
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'invoices'
          AND column_name IN (
            'amount_minor', 'currency', 'tax_rate_numerator',
            'tax_rate_denominator', 'submitted_percentage',
            'rate_policy_version', 'tax_amount_minor', 'total_amount_minor',
            'currency_policy_version', 'rounding_policy_version'
          )
      ),
      'rows', (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', id::text,
              'amount_minor', row_value->>'amount_minor',
              'currency', row_value->>'currency',
              'tax_rate_numerator', row_value->>'tax_rate_numerator',
              'tax_rate_denominator', row_value->>'tax_rate_denominator',
              'submitted_percentage', row_value->>'submitted_percentage',
              'rate_policy_version', row_value->>'rate_policy_version',
              'tax_amount_minor', row_value->>'tax_amount_minor',
              'total_amount_minor', row_value->>'total_amount_minor',
              'currency_policy_version', row_value->>'currency_policy_version',
              'rounding_policy_version', row_value->>'rounding_policy_version'
            ) ORDER BY id
          ),
          '[]'::jsonb
        )
        FROM invoice_rows
      )
    )`,
  exact_invoice_line_items: `
    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', id::text,
          'line_items_exact', pg_catalog.to_jsonb(invoice)->'line_items_exact',
          'line_items_legacy_evidence',
            pg_catalog.to_jsonb(invoice)->'line_items_legacy_evidence'
        ) ORDER BY id
      ),
      '[]'::jsonb
    )
    FROM public.invoices AS invoice`,
  exact_automation_contract: `
    SELECT pg_catalog.jsonb_build_object(
      'columns', (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'table', table_name,
              'name', column_name,
              'type', udt_name,
              'nullable', is_nullable
            ) ORDER BY table_name, ordinal_position
          ),
          '[]'::jsonb
        )
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN (
            'billing_automation_grants', 'billing_automation_executions'
          )
          AND column_name IN (
            'amount_limit_minor', 'amount_consumed_minor', 'amount_minor',
            'currency', 'request_fingerprint', 'effect_fingerprint',
            'effect_discriminator'
          )
      ),
      'functions', (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'schema', namespace.nspname,
              'name', procedure_record.proname,
              'arguments', pg_catalog.pg_get_function_identity_arguments(procedure_record.oid),
              'definition', pg_catalog.pg_get_functiondef(procedure_record.oid)
            ) ORDER BY namespace.nspname, procedure_record.proname,
              pg_catalog.pg_get_function_identity_arguments(procedure_record.oid)
          ),
          '[]'::jsonb
        )
        FROM pg_catalog.pg_proc AS procedure_record
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = procedure_record.pronamespace
        WHERE namespace.nspname IN ('private', 'public')
          AND procedure_record.proname IN (
            'billing_consume_automation_grant',
            'billing_execute_automation_command'
          )
      )
    )`,
  exact_evidence_finalization: `
    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema', namespace.nspname,
          'name', procedure_record.proname,
          'arguments', pg_catalog.pg_get_function_identity_arguments(procedure_record.oid),
          'security_definer', procedure_record.prosecdef,
          'config', procedure_record.proconfig,
          'definition', pg_catalog.pg_get_functiondef(procedure_record.oid)
        ) ORDER BY namespace.nspname,
          pg_catalog.pg_get_function_identity_arguments(procedure_record.oid)
      ),
      '[]'::jsonb
    )
    FROM pg_catalog.pg_proc AS procedure_record
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure_record.pronamespace
    WHERE namespace.nspname IN ('private', 'public')
      AND procedure_record.proname = 'billing_finalize_evidence_inspection'`,
  exact_invoice_rpcs: `
    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'name', procedure_record.proname,
          'arguments', pg_catalog.pg_get_function_identity_arguments(procedure_record.oid),
          'security_definer', procedure_record.prosecdef,
          'config', procedure_record.proconfig,
          'owner', owner_role.rolname,
          'definition', pg_catalog.pg_get_functiondef(procedure_record.oid)
        ) ORDER BY procedure_record.proname
      ),
      '[]'::jsonb
    )
    FROM pg_catalog.pg_proc AS procedure_record
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure_record.pronamespace
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_record.proowner
    WHERE namespace.nspname = 'public'
      AND procedure_record.proname IN (
        'read_billing_invoices_exact',
        'read_billing_invoices_legacy_compat',
        'save_billing_invoice_exact'
      )`,
  exact_invoice_acl: `
    SELECT pg_catalog.jsonb_build_object(
      'table', (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'grantee', grantee,
              'privilege', privilege_type
            ) ORDER BY grantee, privilege_type
          ),
          '[]'::jsonb
        )
        FROM information_schema.table_privileges
        WHERE table_schema = 'public'
          AND table_name = 'invoices'
          AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
      ),
      'sequence', (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'grantee', grantee,
              'privilege', privilege_type
            ) ORDER BY grantee, privilege_type
          ),
          '[]'::jsonb
        )
        FROM information_schema.usage_privileges
        WHERE object_schema = 'public'
          AND object_name = 'invoices_id_seq'
          AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
      ),
      'routines', (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'name', routine_name,
              'grantee', grantee,
              'privilege', privilege_type
            ) ORDER BY routine_name, grantee, privilege_type
          ),
          '[]'::jsonb
        )
        FROM information_schema.routine_privileges
        WHERE routine_schema = 'public'
          AND routine_name IN (
            'read_billing_invoices_exact',
            'read_billing_invoices_legacy_compat',
            'save_billing_invoice_exact'
          )
          AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
      )
    )`,
  exact_tax_rate_compatibility: `
    SELECT pg_catalog.jsonb_build_object(
      'column', (
        SELECT pg_catalog.jsonb_build_object(
          'data_type', data_type,
          'numeric_precision', numeric_precision::text,
          'numeric_scale', numeric_scale::text,
          'nullable', is_nullable
        )
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'invoices'
          AND column_name = 'tax_rate'
      ),
      'constraints', (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'name', constraint_record.conname,
              'definition', pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
            ) ORDER BY constraint_record.conname
          ),
          '[]'::jsonb
        )
        FROM pg_catalog.pg_constraint AS constraint_record
        WHERE constraint_record.conrelid = 'public.invoices'::regclass
          AND pg_catalog.pg_get_constraintdef(constraint_record.oid, true) ILIKE '%tax_rate%'
      ),
      'rows', (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', id::text,
              'tax_rate', tax_rate::text,
              'tax_rate_numerator', pg_catalog.to_jsonb(invoice)->>'tax_rate_numerator',
              'tax_rate_denominator', pg_catalog.to_jsonb(invoice)->>'tax_rate_denominator',
              'submitted_percentage', pg_catalog.to_jsonb(invoice)->>'submitted_percentage'
            ) ORDER BY id
          ),
          '[]'::jsonb
        )
        FROM public.invoices AS invoice
      ),
      'compatibility_rpc', (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(
            pg_catalog.pg_get_functiondef(procedure_record.oid)
            ORDER BY procedure_record.oid
          ),
          '[]'::jsonb
        )
        FROM pg_catalog.pg_proc AS procedure_record
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = procedure_record.pronamespace
        WHERE namespace.nspname = 'public'
          AND procedure_record.proname = 'read_billing_invoices_legacy_compat'
      )
    )`,
  unrelated_crm_payloads: `
    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'entity', entity,
          'id', id::text,
          'payload', payload
        ) ORDER BY entity, id
      ),
      '[]'::jsonb
    )
    FROM (
      SELECT 'deals' AS entity, id, pg_catalog.to_jsonb(row_value)::text AS payload
      FROM public.deals AS row_value
      UNION ALL
      SELECT 'project_analytics', id, pg_catalog.to_jsonb(row_value)::text
      FROM public.project_analytics AS row_value
      UNION ALL
      SELECT 'projects', id, pg_catalog.to_jsonb(row_value)::text
      FROM public.projects AS row_value
    ) AS unrelated_rows`,
  agreement_close_schema: `
    WITH phase_tables(table_name) AS (
      VALUES
        ('billing_agreements'), ('billing_agreement_versions'),
        ('billing_agreement_revenue_rules'), ('billing_agreement_events'),
        ('billing_revenue_periods'), ('billing_revenue_submissions'),
        ('billing_revenue_submission_evidence'), ('billing_revenue_command_events'),
        ('billing_revenue_review_events'), ('billing_close_exceptions'),
        ('billing_close_exception_events'), ('billing_revenue_close_snapshots'),
        ('billing_close_policies'), ('billing_calculations'),
        ('billing_calculation_snapshots'), ('billing_calculation_events'),
        ('billing_adjustment_calculations'), ('billing_calculation_links'),
        ('billing_adjustment_exceptions')
    )
    SELECT pg_catalog.jsonb_build_object(
      'columns', (
        SELECT COALESCE(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'table', column_record.table_name,
            'name', column_record.column_name,
            'type', column_record.udt_name,
            'nullable', column_record.is_nullable,
            'default', column_record.column_default
          ) ORDER BY column_record.table_name, column_record.ordinal_position
        ), '[]'::jsonb)
        FROM information_schema.columns AS column_record
        JOIN phase_tables USING (table_name)
        WHERE column_record.table_schema = 'public'
      ),
      'constraints', (
        SELECT COALESCE(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'table', relation.relname,
            'name', constraint_record.conname,
            'type', constraint_record.contype::text,
            'definition', pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
          ) ORDER BY relation.relname, constraint_record.conname
        ), '[]'::jsonb)
        FROM pg_catalog.pg_constraint AS constraint_record
        JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_record.conrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        JOIN phase_tables ON phase_tables.table_name = relation.relname
        WHERE namespace.nspname = 'public'
      )
    )`,
  agreement_close_rpcs: `
    WITH public_methods(name) AS (
      VALUES
        ('save_billing_agreement_draft'), ('submit_billing_agreement_version'),
        ('activate_billing_agreement_version'), ('pause_billing_agreement_version'),
        ('terminate_billing_agreement_version'), ('read_billing_agreements'),
        ('ensure_billing_revenue_period'), ('submit_billing_revenue_revision'),
        ('review_billing_revenue_revision'), ('close_billing_revenue_period'),
        ('preview_billing_calculation'), ('create_billing_calculation'),
        ('approve_billing_calculation'), ('read_billing_calculation_lineage'),
        ('create_billing_adjustment_calculation'), ('read_billing_revenue_periods'),
        ('read_billing_calculations')
    )
    SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'schema', namespace.nspname,
        'name', procedure_record.proname,
        'arguments', pg_catalog.pg_get_function_identity_arguments(procedure_record.oid),
        'security_definer', procedure_record.prosecdef,
        'config', procedure_record.proconfig,
        'owner', owner_role.rolname,
        'definition', pg_catalog.pg_get_functiondef(procedure_record.oid)
      ) ORDER BY namespace.nspname, procedure_record.proname,
        pg_catalog.pg_get_function_identity_arguments(procedure_record.oid)
    ), '[]'::jsonb)
    FROM pg_catalog.pg_proc AS procedure_record
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure_record.pronamespace
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = procedure_record.proowner
    LEFT JOIN public_methods ON public_methods.name = procedure_record.proname
    WHERE (namespace.nspname = 'public' AND public_methods.name IS NOT NULL)
       OR (namespace.nspname = 'private' AND (
         procedure_record.proname LIKE 'billing_agreement_%'
         OR procedure_record.proname LIKE 'billing_revenue_%'
         OR procedure_record.proname LIKE 'billing_close_exception_%'
         OR procedure_record.proname LIKE 'billing_calculation_%'
         OR procedure_record.proname LIKE 'billing_adjustment_%'
       ))`,
  agreement_close_security: `
    WITH phase_tables(table_name) AS (
      VALUES
        ('billing_agreements'), ('billing_agreement_versions'),
        ('billing_agreement_revenue_rules'), ('billing_agreement_events'),
        ('billing_revenue_periods'), ('billing_revenue_submissions'),
        ('billing_revenue_submission_evidence'), ('billing_revenue_command_events'),
        ('billing_revenue_review_events'), ('billing_close_exceptions'),
        ('billing_close_exception_events'), ('billing_revenue_close_snapshots'),
        ('billing_close_policies'), ('billing_calculations'),
        ('billing_calculation_snapshots'), ('billing_calculation_events'),
        ('billing_adjustment_calculations'), ('billing_calculation_links'),
        ('billing_adjustment_exceptions')
    )
    SELECT pg_catalog.jsonb_build_object(
      'relations', (
        SELECT COALESCE(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'table', relation.relname,
            'rls', relation.relrowsecurity,
            'force_rls', relation.relforcerowsecurity,
            'owner', owner_role.rolname
          ) ORDER BY relation.relname
        ), '[]'::jsonb)
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = relation.relowner
        JOIN phase_tables ON phase_tables.table_name = relation.relname
        WHERE namespace.nspname = 'public' AND relation.relkind = 'r'
      ),
      'policies', (
        SELECT COALESCE(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'table', policy.tablename,
            'name', policy.policyname,
            'roles', policy.roles,
            'command', policy.cmd,
            'using', policy.qual,
            'check', policy.with_check
          ) ORDER BY policy.tablename, policy.policyname
        ), '[]'::jsonb)
        FROM pg_catalog.pg_policies AS policy
        JOIN phase_tables ON phase_tables.table_name = policy.tablename
        WHERE policy.schemaname = 'public'
      ),
      'table_grants', (
        SELECT COALESCE(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'table', grant_record.table_name,
            'grantee', grant_record.grantee,
            'privilege', grant_record.privilege_type
          ) ORDER BY grant_record.table_name, grant_record.grantee, grant_record.privilege_type
        ), '[]'::jsonb)
        FROM information_schema.table_privileges AS grant_record
        JOIN phase_tables USING (table_name)
        WHERE grant_record.table_schema = 'public'
          AND grant_record.grantee IN ('anon','authenticated','service_role','PUBLIC')
      )
    )`,
  agreement_close_capabilities: `
    SELECT pg_catalog.to_jsonb(
      CASE
        WHEN pg_catalog.to_regclass('public.billing_role_capabilities') IS NULL
        THEN '<table xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" />'
        ELSE pg_catalog.query_to_xml(
          $query$
            SELECT role::text AS role, capability::text AS capability
            FROM public.billing_role_capabilities
            WHERE capability::text LIKE 'agreement.%'
               OR capability::text LIKE 'revenue.%'
               OR capability::text LIKE 'calculation.%'
            ORDER BY role::text, capability::text
          $query$,
          true,
          false,
          ''
        )::text
      END
    )`,
};

const invoiceSemanticQuery = `
  SELECT jsonb_build_object(
    'invoice_count', pg_catalog.count(*)::text,
    'numeric_values', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id::text,
          'amount', amount::text,
          'tax_rate', pg_catalog.trim_scale(tax_rate)::text,
          'tax_amount', tax_amount::text,
          'total_amount', total_amount::text
        ) ORDER BY id
      ),
      '[]'::jsonb
    ),
    'provider_values', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id::text,
          'payment_method', payment_method,
          'payment_reference', payment_reference
        ) ORDER BY id
      ),
      '[]'::jsonb
    ),
    'legacy_ownership', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id::text,
          'company_id', company_id::text,
          'project_id', project_id::text,
          'deal_id', deal_id::text,
          'sales_id', sales_id::text
        ) ORDER BY id
      ),
      '[]'::jsonb
    ),
    'business_facts', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id::text,
          'created_at', created_at::text,
          'company_id', company_id::text,
          'project_id', project_id::text,
          'deal_id', deal_id::text,
          'sales_id', sales_id::text,
          'invoice_number', invoice_number,
          'description', description,
          'amount', amount::text,
          'tax_rate', pg_catalog.trim_scale(tax_rate)::text,
          'tax_amount', tax_amount::text,
          'total_amount', total_amount::text,
          'line_items', line_items,
          'status', status,
          'issue_date', issue_date::text,
          'due_date', due_date::text,
          'paid_date', paid_date::text,
          'payment_method', payment_method,
          'payment_reference', payment_reference,
          'notes', notes,
          'terms', terms
        ) ORDER BY id
      ),
      '[]'::jsonb
    )
  )
  FROM public.invoices`;

const postUpgradeSemanticQuery = `
  SELECT jsonb_build_object(
    'null_tenant_count', (
      SELECT count(*)::text
      FROM public.invoices
      WHERE organization_id IS NULL OR billing_account_id IS NULL
    ),
    'invalid_tenant_link_count', (
      SELECT count(*)::text
      FROM public.invoices AS invoice
      LEFT JOIN public.billing_accounts AS account
        ON account.id = invoice.billing_account_id
        AND account.organization_id = invoice.organization_id
        AND account.company_id = invoice.company_id
      WHERE account.id IS NULL
    ),
    'invoice_company_count', (
      SELECT count(DISTINCT company_id)::text FROM public.invoices
    ),
    'mapped_account_count', (
      SELECT count(DISTINCT billing_account_id)::text FROM public.invoices
    ),
    'missing_owner_count', (
      SELECT count(*)::text
      FROM public.invoices AS invoice
      LEFT JOIN public.billing_account_owners AS owner
        ON owner.organization_id = invoice.organization_id
        AND owner.account_id = invoice.billing_account_id
        AND owner.sales_id = invoice.sales_id
        AND owner.effective_until IS NULL
      WHERE owner.id IS NULL
    ),
    'missing_operator_count', (
      SELECT count(*)::text
      FROM public.invoices AS invoice
      JOIN public.sales AS sale ON sale.id = invoice.sales_id
      LEFT JOIN public.billing_role_assignments AS assignment
        ON assignment.organization_id = invoice.organization_id
        AND assignment.account_id = invoice.billing_account_id
        AND assignment.sales_id = invoice.sales_id
        AND assignment.role = 'operator'
        AND assignment.disabled_at IS NULL
        AND assignment.valid_until IS NULL
      WHERE NOT sale.administrator AND NOT sale.disabled AND assignment.id IS NULL
    ),
    'anonymous_invoice_privilege_count', (
      SELECT count(*)::text
      FROM information_schema.table_privileges
      WHERE table_schema = 'public'
        AND table_name = 'invoices'
        AND grantee = 'anon'
    ),
    'authenticated_delete', pg_catalog.has_table_privilege(
      'authenticated',
      'public.invoices',
      'DELETE'
    )
  )`;

const exactPostUpgradeSemanticQuery = `
  WITH exact_functions AS (
    SELECT procedure_record.*
    FROM pg_catalog.pg_proc AS procedure_record
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure_record.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure_record.proname IN (
        'read_billing_invoices_exact',
        'read_billing_invoices_legacy_compat',
        'save_billing_invoice_exact'
      )
  ),
  evidence_function AS (
    SELECT pg_catalog.pg_get_functiondef(procedure_record.oid) AS definition
    FROM pg_catalog.pg_proc AS procedure_record
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure_record.pronamespace
    WHERE namespace.nspname = 'private'
      AND procedure_record.proname = 'billing_finalize_evidence_inspection'
      AND pg_catalog.pg_get_function_identity_arguments(procedure_record.oid) =
        'p_grant_id uuid, p_evidence_id uuid, p_decision text, p_reason_code text, p_provider_reference text, p_policy_version text, p_idempotency_key text'
  ),
  rate_samples(submitted_percentage) AS (
    VALUES ('8.875%'), ('12.500%')
  ),
  parsed_rates AS (
    SELECT
      submitted_percentage,
      public.financial_parse_ordinary_percentage(
        pg_catalog.to_jsonb(submitted_percentage),
        'ordinary-percentage-v1'
      ) AS rate
    FROM rate_samples
  )
  SELECT pg_catalog.jsonb_build_object(
    'invoice_values', (
      SELECT COALESCE(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', id::text,
            'amount_minor', amount_minor::text,
            'currency', currency,
            'tax_rate_numerator', tax_rate_numerator::text,
            'tax_rate_denominator', tax_rate_denominator::text,
            'submitted_percentage', submitted_percentage,
            'rate_policy_version', rate_policy_version,
            'tax_amount_minor', tax_amount_minor::text,
            'total_amount_minor', total_amount_minor::text,
            'rounding_policy_version', rounding_policy_version
          ) ORDER BY id
        ),
        '[]'::jsonb
      )
      FROM public.invoices
    ),
    'line_items', (
      SELECT COALESCE(
        pg_catalog.jsonb_agg(
          item || pg_catalog.jsonb_build_object('invoice_id', invoice.id::text)
          ORDER BY invoice.id, item_index
        ),
        '[]'::jsonb
      )
      FROM public.invoices AS invoice
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(invoice.line_items_exact)
        WITH ORDINALITY AS exact_item(item, item_index)
    ),
    'automation', pg_catalog.jsonb_build_object(
      'negative_amount_count', (
        SELECT count(*)::text
        FROM public.billing_automation_executions
        WHERE amount_minor < 0
      ),
      'invalid_request_fingerprint_count', (
        SELECT count(*)::text
        FROM public.billing_automation_executions
        WHERE request_fingerprint !~ '^[0-9a-f]{64}$'
      ),
      'invalid_effect_fingerprint_count', (
        SELECT count(*)::text
        FROM public.billing_automation_executions
        WHERE effect_fingerprint !~ '^[0-9a-f]{64}$'
      )
    ),
    'evidence', pg_catalog.jsonb_build_object(
      'exact_helper_dependency', COALESCE((
        SELECT definition LIKE '%billing_consume_automation_grant%'
          AND definition LIKE '%amount_minor%'
        FROM evidence_function
      ), false),
      'canonical_zero_dependency', COALESCE((
        SELECT definition LIKE '%amount_minor%0%currency%USD%'
        FROM evidence_function
      ), false),
      'old_numeric_signature_count', (
        SELECT count(*)::text
        FROM pg_catalog.pg_proc AS procedure_record
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = procedure_record.pronamespace
        WHERE namespace.nspname = 'private'
          AND procedure_record.proname = 'billing_consume_automation_grant'
          AND pg_catalog.pg_get_function_identity_arguments(procedure_record.oid)
            LIKE '%p_amount numeric%'
      )
    ),
    'invoice_rpcs', pg_catalog.jsonb_build_object(
      'locked_function_count', (
        SELECT count(*)::text
        FROM exact_functions
        JOIN pg_catalog.pg_roles AS owner_role
          ON owner_role.oid = exact_functions.proowner
        WHERE exact_functions.prosecdef
          AND owner_role.rolname = 'postgres'
          AND COALESCE(
            pg_catalog.array_to_string(exact_functions.proconfig, ','),
            ''
          ) IN ('search_path=', 'search_path=""')
      ),
      'dynamic_sql_function_count', (
        SELECT count(*)::text
        FROM exact_functions
        WHERE pg_catalog.pg_get_functiondef(oid) ~* '\\mEXECUTE\\M'
      )
    ),
    'invoice_acl', pg_catalog.jsonb_build_object(
      'authenticated_table_privilege_count', (
        SELECT count(*)::text
        FROM information_schema.table_privileges
        WHERE table_schema = 'public'
          AND table_name = 'invoices'
          AND grantee = 'authenticated'
      ),
      'authenticated_sequence_privilege_count', (
        SELECT count(*)::text
        FROM information_schema.usage_privileges
        WHERE object_schema = 'public'
          AND object_name = 'invoices_id_seq'
          AND grantee = 'authenticated'
      ),
      'anonymous_table_privilege_count', (
        SELECT count(*)::text
        FROM information_schema.table_privileges
        WHERE table_schema = 'public'
          AND table_name = 'invoices'
          AND grantee = 'anon'
      )
    ),
    'tax_rate_compatibility', pg_catalog.jsonb_build_object(
      'data_type', (
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'invoices'
          AND column_name = 'tax_rate'
      ),
      'numeric_precision', (
        SELECT numeric_precision::text
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'invoices'
          AND column_name = 'tax_rate'
      ),
      'numeric_scale', (
        SELECT numeric_scale::text
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'invoices'
          AND column_name = 'tax_rate'
      ),
      'out_of_bounds_count', (
        SELECT count(*)::text FROM public.invoices
        WHERE tax_rate < 0 OR tax_rate > 100
      ),
      'derived_mismatch_count', (
        SELECT count(*)::text FROM public.invoices
        WHERE tax_rate <> (
          tax_rate_numerator::numeric * 100 / tax_rate_denominator::numeric
        )
      ),
      'samples', (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'submitted_percentage', submitted_percentage,
            'numerator', rate->>'numerator',
            'denominator', rate->>'denominator',
            'compatibility', pg_catalog.to_char(
              (rate->>'numerator')::numeric * 100 /
                (rate->>'denominator')::numeric,
              'FM990.000000000'
            )
          ) ORDER BY submitted_percentage
        )
        FROM parsed_rates
      )
    )
  )`;

const phase4PostUpgradeSemanticQuery = `
  WITH phase_tables(table_name) AS (
    VALUES
      ('billing_agreements'), ('billing_agreement_versions'),
      ('billing_agreement_revenue_rules'), ('billing_agreement_events'),
      ('billing_revenue_periods'), ('billing_revenue_submissions'),
      ('billing_revenue_submission_evidence'), ('billing_revenue_command_events'),
      ('billing_revenue_review_events'), ('billing_close_exceptions'),
      ('billing_close_exception_events'), ('billing_revenue_close_snapshots'),
      ('billing_close_policies'), ('billing_calculations'),
      ('billing_calculation_snapshots'), ('billing_calculation_events'),
      ('billing_adjustment_calculations'), ('billing_calculation_links'),
      ('billing_adjustment_exceptions')
  ),
  public_methods(name) AS (
    VALUES
      ('save_billing_agreement_draft'), ('submit_billing_agreement_version'),
      ('activate_billing_agreement_version'), ('pause_billing_agreement_version'),
      ('terminate_billing_agreement_version'), ('read_billing_agreements'),
      ('ensure_billing_revenue_period'), ('submit_billing_revenue_revision'),
      ('review_billing_revenue_revision'), ('close_billing_revenue_period'),
      ('preview_billing_calculation'), ('create_billing_calculation'),
      ('approve_billing_calculation'), ('read_billing_calculation_lineage'),
      ('create_billing_adjustment_calculation'), ('read_billing_revenue_periods'),
      ('read_billing_calculations')
  ),
  phase_functions AS (
    SELECT procedure_record.*, owner_role.rolname AS owner_name
    FROM pg_catalog.pg_proc AS procedure_record
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure_record.pronamespace
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = procedure_record.proowner
    JOIN public_methods ON public_methods.name = procedure_record.proname
    WHERE namespace.nspname = 'public'
  )
  SELECT pg_catalog.jsonb_build_object(
    'schema', pg_catalog.jsonb_build_object(
      'required_table_count', (SELECT count(*)::text FROM phase_tables),
      'present_table_count', (
        SELECT count(*)::text
        FROM phase_tables
        JOIN information_schema.tables AS table_record
          ON table_record.table_schema = 'public'
          AND table_record.table_name = phase_tables.table_name
      ),
      'forced_rls_count', (
        SELECT count(*)::text
        FROM phase_tables
        JOIN pg_catalog.pg_class AS relation ON relation.relname = phase_tables.table_name
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relrowsecurity
          AND relation.relforcerowsecurity
      )
    ),
    'rpcs', pg_catalog.jsonb_build_object(
      'required_count', (SELECT count(*)::text FROM public_methods),
      'present_count', (SELECT count(*)::text FROM phase_functions),
      'locked_count', (
        SELECT count(*)::text FROM phase_functions
        WHERE prosecdef
          AND owner_name = 'postgres'
          AND COALESCE(pg_catalog.array_to_string(proconfig, ','), '')
            IN ('search_path=', 'search_path=""')
      ),
      'dynamic_sql_count', (
        SELECT count(*)::text FROM phase_functions
        WHERE pg_catalog.pg_get_functiondef(oid) ~* '\\mEXECUTE\\M'
      )
    ),
    'acl', pg_catalog.jsonb_build_object(
      'authenticated_mutation_privilege_count', (
        SELECT count(*)::text
        FROM information_schema.table_privileges AS grant_record
        JOIN phase_tables ON phase_tables.table_name = grant_record.table_name
        WHERE grant_record.table_schema = 'public'
          AND grant_record.grantee = 'authenticated'
          AND grant_record.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
      ),
      'anonymous_table_privilege_count', (
        SELECT count(*)::text
        FROM information_schema.table_privileges AS grant_record
        JOIN phase_tables ON phase_tables.table_name = grant_record.table_name
        WHERE grant_record.table_schema = 'public'
          AND grant_record.grantee = 'anon'
      ),
      'anonymous_execute_count', (
        SELECT count(*)::text
        FROM information_schema.routine_privileges AS grant_record
        JOIN public_methods ON public_methods.name = grant_record.routine_name
        WHERE grant_record.routine_schema = 'public'
          AND grant_record.grantee = 'anon'
          AND grant_record.privilege_type = 'EXECUTE'
      )
    ),
    'capabilities', pg_catalog.jsonb_build_object(
      'row_count', (
        SELECT count(*)::text FROM public.billing_role_capabilities
        WHERE capability LIKE 'agreement.%'
           OR capability LIKE 'revenue.%'
           OR capability LIKE 'calculation.%'
      ),
      'distinct_capability_count', (
        SELECT count(DISTINCT capability)::text FROM public.billing_role_capabilities
        WHERE capability LIKE 'agreement.%'
           OR capability LIKE 'revenue.%'
           OR capability LIKE 'calculation.%'
      )
    ),
    'policy', (
      SELECT pg_catalog.jsonb_build_object(
        'policy_version', policy_version,
        'policy_mode', policy_mode,
        'active', active,
        'allowed_account_statuses', allowed_account_statuses,
        'allowed_formula_kinds', allowed_formula_kinds,
        'allowed_close_modes', allowed_close_modes,
        'allowed_provenance_kinds', allowed_provenance_kinds,
        'require_zero_anomalies', require_zero_anomalies,
        'minimum_result_minor', minimum_result_minor::text,
        'maximum_result_minor', maximum_result_minor::text,
        'effective_from', effective_from::text
      )
      FROM public.billing_close_policies
      WHERE policy_version = 'billing-manual-v1'
    ),
    'business_facts', pg_catalog.jsonb_build_object(
      'agreement_count', (SELECT count(*)::text FROM public.billing_agreements),
      'revenue_period_count', (SELECT count(*)::text FROM public.billing_revenue_periods),
      'calculation_count', (SELECT count(*)::text FROM public.billing_calculations),
      'adjustment_count', (SELECT count(*)::text FROM public.billing_adjustment_calculations)
    )
  )`;

function executeProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repositoryRoot,
      env: options.env ?? process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      finish({ code: 127, stdout: "", stderr: error.message });
    });
    child.on("close", (code) => {
      finish({ code: code ?? 1, stdout, stderr });
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000).unref();
      finish({ code: 124, stdout: "", stderr: "process timed out" });
    }, options.timeoutMs ?? 300000);
  });
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalFingerprint(value) {
  return JSON.stringify(canonicalize(value));
}

function hashFingerprint(value) {
  return createHash("sha256")
    .update(canonicalFingerprint(value), "utf8")
    .digest("hex");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyImmutableUpgradeInputs({
  readFile = fs.readFileSync,
} = {}) {
  for (const [relativePath, expectedHash] of Object.entries(
    immutableUpgradeInputHashes,
  )) {
    const actualHash = sha256(
      readFile(path.join(repositoryRoot, relativePath)),
    );
    if (actualHash !== expectedHash) {
      throw new Error(`immutable upgrade input differs: ${relativePath}`);
    }
  }
  return true;
}

function assertCanonicalIntegerToken(value, label) {
  if (typeof value !== "string" || !/^-?(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(
      `exact snapshot has invalid string financial token: ${label}`,
    );
  }
  return BigInt(value);
}

function greatestCommonDivisor(left, right) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function fixedNinePercentage(numerator, denominator) {
  const scale = 1000000000n;
  const scaledNumerator = numerator * 100n * scale;
  if (denominator <= 0n || scaledNumerator % denominator !== 0n) {
    throw new Error("tax compatibility lacks exact canonical ratio derivation");
  }
  const scaledPercentage = scaledNumerator / denominator;
  const whole = scaledPercentage / scale;
  const fraction = (scaledPercentage % scale).toString().padStart(9, "0");
  return `${whole}.${fraction}`;
}

export function validateExactUpgradeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("exact upgrade snapshot must be an object");
  }

  const invoiceIntegerFields = [
    "amount_minor",
    "tax_rate_numerator",
    "tax_rate_denominator",
    "tax_amount_minor",
    "total_amount_minor",
  ];
  if (
    !Array.isArray(snapshot.invoice_values) ||
    snapshot.invoice_values.length === 0
  ) {
    throw new Error("exact invoice values are missing");
  }
  for (const [index, invoice] of snapshot.invoice_values.entries()) {
    for (const field of invoiceIntegerFields) {
      assertCanonicalIntegerToken(
        invoice?.[field],
        `invoice_values.${index}.${field}`,
      );
    }
    if (
      invoice.currency !== "USD" ||
      invoice.rate_policy_version !== "ordinary-percentage-v1" ||
      invoice.rounding_policy_version !== "half-away-from-zero-v1" ||
      typeof invoice.submitted_percentage !== "string"
    ) {
      throw new Error("exact invoice policy identity is invalid");
    }
  }

  if (!Array.isArray(snapshot.line_items) || snapshot.line_items.length === 0) {
    throw new Error("exact line items are missing");
  }
  for (const [index, item] of snapshot.line_items.entries()) {
    const numerator = assertCanonicalIntegerToken(
      item?.quantity_ratio?.numerator,
      `line_items.${index}.quantity_ratio.numerator`,
    );
    const denominator = assertCanonicalIntegerToken(
      item?.quantity_ratio?.denominator,
      `line_items.${index}.quantity_ratio.denominator`,
    );
    if (
      denominator <= 0n ||
      greatestCommonDivisor(numerator, denominator) !== 1n
    ) {
      throw new Error("exact line item ratio is not canonical");
    }
    assertCanonicalIntegerToken(
      item?.unit_price?.amount_minor,
      `line_items.${index}.unit_price.amount_minor`,
    );
    assertCanonicalIntegerToken(
      item?.extended_amount?.amount_minor,
      `line_items.${index}.extended_amount.amount_minor`,
    );
    if (
      item?.unit_price?.currency !== "USD" ||
      item?.extended_amount?.currency !== "USD" ||
      item.currency_policy_version !== "usd-v1" ||
      item.rounding_policy_version !== "half-away-from-zero-v1"
    ) {
      throw new Error("exact line item policy identity is invalid");
    }
  }

  for (const field of [
    "negative_amount_count",
    "invalid_request_fingerprint_count",
    "invalid_effect_fingerprint_count",
  ]) {
    if (snapshot.automation?.[field] !== "0") {
      throw new Error(`exact automation invariant failed: ${field}`);
    }
  }
  if (
    snapshot.evidence?.exact_helper_dependency !== true ||
    snapshot.evidence?.canonical_zero_dependency !== true ||
    snapshot.evidence?.old_numeric_signature_count !== "0"
  ) {
    throw new Error("exact evidence finalization invariant failed");
  }
  if (
    snapshot.invoice_rpcs?.locked_function_count !== "3" ||
    snapshot.invoice_rpcs?.dynamic_sql_function_count !== "0"
  ) {
    throw new Error("exact invoice RPC invariant failed");
  }
  if (
    snapshot.invoice_acl?.authenticated_table_privilege_count !== "0" ||
    snapshot.invoice_acl?.authenticated_sequence_privilege_count !== "0" ||
    snapshot.invoice_acl?.anonymous_table_privilege_count !== "0"
  ) {
    throw new Error("exact invoice ACL invariant failed");
  }

  const compatibility = snapshot.tax_rate_compatibility;
  if (
    compatibility?.data_type !== "numeric" ||
    compatibility?.numeric_precision !== "12" ||
    compatibility?.numeric_scale !== "9" ||
    compatibility?.out_of_bounds_count !== "0" ||
    compatibility?.derived_mismatch_count !== "0" ||
    !Array.isArray(compatibility.samples)
  ) {
    throw new Error("exact tax-rate compatibility metadata is invalid");
  }
  const expectedSamples = new Map([
    ["8.875%", ["71", "800", "8.875000000"]],
    ["12.500%", ["1", "8", "12.500000000"]],
  ]);
  for (const [submitted, expected] of expectedSamples) {
    const sample = compatibility.samples.find(
      (candidate) => candidate?.submitted_percentage === submitted,
    );
    if (!sample)
      throw new Error(`exact tax-rate sample is missing: ${submitted}`);
    const numerator = assertCanonicalIntegerToken(
      sample.numerator,
      `${submitted}.numerator`,
    );
    const denominator = assertCanonicalIntegerToken(
      sample.denominator,
      `${submitted}.denominator`,
    );
    if (!/^(?:0|[1-9][0-9]*)\.[0-9]{9}$/.test(sample.compatibility)) {
      throw new Error("tax compatibility is not fixed nine-decimal text");
    }
    if (
      sample.numerator !== expected[0] ||
      sample.denominator !== expected[1] ||
      greatestCommonDivisor(numerator, denominator) !== 1n ||
      fixedNinePercentage(numerator, denominator) !== sample.compatibility
    ) {
      throw new Error(
        "tax compatibility lacks exact canonical ratio derivation",
      );
    }
    if (sample.compatibility !== expected[2]) {
      throw new Error("tax compatibility is not fixed nine-decimal text");
    }
  }
  if (
    snapshot.unrelated_crm?.before_sha256 !==
    snapshot.unrelated_crm?.after_sha256
  ) {
    throw new Error("unrelated CRM payloads changed during exact upgrade");
  }

  return true;
}

export function validatePhase4UpgradeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Phase 4 upgrade snapshot must be an object");
  }
  if (
    snapshot.schema?.required_table_count !== "19" ||
    snapshot.schema?.present_table_count !== "19" ||
    snapshot.schema?.forced_rls_count !== "19"
  ) {
    throw new Error("Phase 4 schema or forced-RLS inventory is incomplete");
  }
  if (
    snapshot.rpcs?.required_count !== "17" ||
    snapshot.rpcs?.present_count !== "17" ||
    snapshot.rpcs?.locked_count !== "17" ||
    snapshot.rpcs?.dynamic_sql_count !== "0"
  ) {
    throw new Error("Phase 4 RPC inventory is incomplete or unlocked");
  }
  if (
    snapshot.acl?.authenticated_mutation_privilege_count !== "0" ||
    snapshot.acl?.anonymous_table_privilege_count !== "0" ||
    snapshot.acl?.anonymous_execute_count !== "0"
  ) {
    throw new Error("Phase 4 ACL is not least privilege");
  }
  if (
    snapshot.capabilities?.row_count !== "23" ||
    snapshot.capabilities?.distinct_capability_count !== "9"
  ) {
    throw new Error("Phase 4 capability fixture inventory differs");
  }

  const policy = snapshot.policy;
  if (
    policy?.policy_version !== "billing-manual-v1" ||
    policy?.policy_mode !== "manual" ||
    policy?.active !== true ||
    JSON.stringify(policy?.allowed_account_statuses) !==
      JSON.stringify(["active", "on_hold", "closed"]) ||
    JSON.stringify(policy?.allowed_formula_kinds) !==
      JSON.stringify(["fixed", "percentage", "minimum_support", "hybrid"]) ||
    JSON.stringify(policy?.allowed_close_modes) !==
      JSON.stringify(["accepted_evidence", "minimum_only"]) ||
    JSON.stringify(policy?.allowed_provenance_kinds) !==
      JSON.stringify(["api", "statement", "portal", "minimum_only"]) ||
    policy?.require_zero_anomalies !== true ||
    policy?.minimum_result_minor !== "0" ||
    policy?.maximum_result_minor !== null ||
    policy?.effective_from !== "2026-01-01 00:00:00+00"
  ) {
    throw new Error("Phase 4 close policy fixture differs");
  }
  for (const [name, count] of Object.entries(snapshot.business_facts ?? {})) {
    if (count !== "0") {
      throw new Error(`Phase 4 baseline business fact changed: ${name}`);
    }
  }
  if (Object.keys(snapshot.business_facts ?? {}).length !== 4) {
    throw new Error("Phase 4 business fact inventory is incomplete");
  }
  return true;
}

function assertFingerprintShape(
  fingerprints,
  label,
  expectedCategories = coreCategoryNames,
) {
  const received = Object.keys(fingerprints ?? {}).sort();
  if (
    JSON.stringify(received) !== JSON.stringify([...expectedCategories].sort())
  ) {
    throw new Error(`${label} fingerprint categories are incomplete`);
  }
  for (const [category, digest] of Object.entries(fingerprints)) {
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      throw new Error(`${label} fingerprint is invalid: ${category}`);
    }
  }
}

export function compareFingerprintSets({ before, after, expected }) {
  const expectedCategories = Object.keys(expected?.categories ?? {});
  assertFingerprintShape(before, "before", expectedCategories);
  assertFingerprintShape(after, "after", expectedCategories);
  assertFingerprintShape(expected?.categories, "expected", expectedCategories);
  const results = {};
  for (const category of expectedCategories) {
    if (before[category] !== expected.categories[category]) {
      throw new Error(
        `upgrade fingerprint mismatch before: ${category} ` +
          `(expected ${expected.categories[category]}, received ${before[category]})`,
      );
    }
    const transformation = expected.transformations?.[category];
    const expectedAfter = transformation?.after_sha256 ?? before[category];
    if (transformation && transformation.before_sha256 !== before[category]) {
      throw new Error(`upgrade transformation mismatch: ${category}`);
    }
    if (after[category] !== expectedAfter) {
      throw new Error(
        `upgrade fingerprint mismatch after: ${category} ` +
          `(expected ${expectedAfter}, received ${after[category]})`,
      );
    }
    results[category] = {
      before: before[category],
      after: after[category],
      preserved: before[category] === after[category],
    };
  }
  return results;
}

function assertExactFields(value, expectedFields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actualFields = Object.keys(value).sort();
  if (
    JSON.stringify(actualFields) !== JSON.stringify([...expectedFields].sort())
  ) {
    const unknown = actualFields.filter(
      (field) => !expectedFields.includes(field),
    );
    if (unknown.length > 0) {
      throw new Error(`${label} has unknown registry field: ${unknown[0]}`);
    }
    const missing = expectedFields.filter(
      (field) => !actualFields.includes(field),
    );
    throw new Error(`${label} is missing ${missing[0]}`);
  }
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
}

export function validateTransformationRegistries({
  baselineExpected,
  registries,
}) {
  assertFingerprintShape(
    baselineExpected?.categories,
    "expected",
    coreCategoryNames,
  );
  if (typeof baselineExpected?.baseline_id !== "string") {
    throw new Error("baseline expected identity is missing");
  }
  if (!Array.isArray(registries)) {
    throw new Error("transformation registries must be ordered");
  }

  const baselineCategories = { ...baselineExpected.categories };
  const current = { ...baselineCategories };
  const combined = {};
  const migrations = [];
  for (const [category, transformation] of Object.entries(
    baselineExpected.transformations ?? {},
  )) {
    if (!coreCategoryNames.includes(category)) {
      throw new Error(
        `baseline has unknown transformation category: ${category}`,
      );
    }
    assertDigest(transformation?.before_sha256, `${category} before_sha256`);
    assertDigest(transformation?.after_sha256, `${category} after_sha256`);
    if (transformation.before_sha256 !== current[category]) {
      throw new Error(`baseline transformation is stale: ${category}`);
    }
    if (
      typeof transformation.migration !== "string" ||
      !/^\d{14}$/.test(transformation.migration)
    ) {
      throw new Error(
        `baseline transformation migration is invalid: ${category}`,
      );
    }
    if (!migrations.includes(transformation.migration)) {
      migrations.push(transformation.migration);
    }
    current[category] = transformation.after_sha256;
    combined[category] = {
      migration: transformation.migration,
      before_sha256: baselineExpected.categories[category],
      after_sha256: transformation.after_sha256,
    };
  }

  const transformedCategories = new Map();
  const semanticInvariants = [];
  const seenInvariants = new Set();
  for (const [index, registry] of registries.entries()) {
    assertExactFields(
      registry,
      registry?.sequence === 4 ? phase4RegistryFields : registryFields,
      `registry ${index + 2}`,
    );
    const expectedSequence = index + 2;
    if (registry.sequence !== expectedSequence) {
      throw new Error("transformation registries are not ordered");
    }
    if (
      typeof registry.registry_id !== "string" ||
      !registry.registry_id.startsWith(
        `${String(registry.sequence).padStart(3, "0")}-`,
      )
    ) {
      throw new Error(`registry ${registry.sequence} identity is invalid`);
    }
    if (registry.version !== "1.0.0") {
      throw new Error(`${registry.registry_id} version is unsupported`);
    }
    if (registry.sequence > 4) {
      throw new Error(`registry sequence is unsupported: ${registry.sequence}`);
    }
    if (registry.baseline_id !== baselineExpected.baseline_id) {
      throw new Error(`${registry.registry_id} baseline identity is stale`);
    }
    if (
      !Array.isArray(registry.migrations) ||
      registry.migrations.length === 0 ||
      registry.migrations.some(
        (migration) =>
          typeof migration !== "string" || !/^\d{14}$/.test(migration),
      ) ||
      registry.migrations.some(
        (migration, migrationIndex) =>
          migrationIndex > 0 &&
          migration <= registry.migrations[migrationIndex - 1],
      )
    ) {
      throw new Error(`${registry.registry_id} migrations are not ordered`);
    }
    if (
      migrations.length > 0 &&
      registry.migrations[0] <= migrations[migrations.length - 1]
    ) {
      throw new Error("transformation registry migrations overlap or reorder");
    }
    migrations.push(...registry.migrations);

    if (registry.sequence === 3 && registry.registry_id === "003-exact-money") {
      if (
        JSON.stringify(registry.migrations) !==
        JSON.stringify(["20260902000001", "20260902000002", "20260903000001"])
      ) {
        throw new Error("sequence 003 exact migration set is invalid");
      }
      Object.assign(baselineCategories, PHASE3_BASELINE_CATEGORY_HASHES);
      Object.assign(current, PHASE3_BASELINE_CATEGORY_HASHES);
    }
    if (registry.sequence === 4) {
      if (registry.registry_id !== "004-agreement-close") {
        throw new Error(
          "sequence 004 agreement-close registry identity is invalid",
        );
      }
      if (
        JSON.stringify(registry.migrations) !==
        JSON.stringify(PHASE4_MIGRATIONS)
      ) {
        throw new Error(
          "sequence 004 agreement-close migration set is invalid",
        );
      }
      assertExactFields(
        registry.migration_sha256,
        PHASE4_MIGRATIONS,
        "004-agreement-close migration_sha256",
      );
      for (const version of PHASE4_MIGRATIONS) {
        assertDigest(
          registry.migration_sha256[version],
          `004-agreement-close ${version} sha256`,
        );
        const matches = fs
          .readdirSync(path.join(repositoryRoot, "supabase/migrations"))
          .filter((filename) => filename.startsWith(`${version}_`));
        if (matches.length !== 1) {
          throw new Error(
            `Phase 4 migration file resolution failed: ${version}`,
          );
        }
        const actual = sha256(
          fs.readFileSync(
            path.join(repositoryRoot, "supabase/migrations", matches[0]),
          ),
        );
        if (registry.migration_sha256[version] !== actual) {
          throw new Error(`Phase 4 migration hash differs: ${version}`);
        }
      }
      for (const [category, digest] of Object.entries(
        PHASE4_BASELINE_CATEGORY_HASHES,
      )) {
        if (!Object.hasOwn(baselineCategories, category)) {
          baselineCategories[category] = digest;
        }
      }
      Object.assign(current, PHASE4_BASELINE_CATEGORY_HASHES);
    }
    if (
      !registry.transformations ||
      typeof registry.transformations !== "object" ||
      Array.isArray(registry.transformations) ||
      Object.keys(registry.transformations).length === 0
    ) {
      throw new Error(`${registry.registry_id} transformations are missing`);
    }

    for (const [category, transformation] of Object.entries(
      registry.transformations,
    )) {
      if (!Object.hasOwn(current, category)) {
        throw new Error(`unknown transformation category: ${category}`);
      }
      const previousSequence = transformedCategories.get(category);
      const isAllowedPhase3Repeat =
        registry.sequence === 3 &&
        registry.registry_id === "003-exact-money" &&
        previousSequence === 2 &&
        phase3RepeatedCoreCategories.has(category);
      const isAllowedPhase4Repeat =
        registry.sequence === 4 &&
        registry.registry_id === "004-agreement-close" &&
        previousSequence === 3 &&
        phase4RepeatedCoreCategories.has(category);
      if (
        previousSequence !== undefined &&
        !isAllowedPhase3Repeat &&
        !isAllowedPhase4Repeat
      ) {
        throw new Error(`overlapping transformation category: ${category}`);
      }
      assertExactFields(
        transformation,
        transformationFields,
        `${registry.registry_id} ${category}`,
      );
      assertDigest(transformation.before_sha256, `${category} before_sha256`);
      assertDigest(transformation.after_sha256, `${category} after_sha256`);
      if (!registry.migrations.includes(transformation.migration)) {
        throw new Error(`${category} transformation migration is unknown`);
      }
      if (transformation.before_sha256 !== current[category]) {
        throw new Error(`stale transformation hash: ${category}`);
      }
      if (transformation.after_sha256 === transformation.before_sha256) {
        throw new Error(`overbroad unchanged transformation: ${category}`);
      }
      transformedCategories.set(category, registry.sequence);
      current[category] = transformation.after_sha256;
      combined[category] = combined[category]
        ? {
            ...combined[category],
            migration: transformation.migration,
            after_sha256: transformation.after_sha256,
          }
        : {
            migration: transformation.migration,
            before_sha256: baselineCategories[category],
            after_sha256: transformation.after_sha256,
          };
    }

    if (
      !Array.isArray(registry.semantic_invariants) ||
      registry.semantic_invariants.length === 0
    ) {
      throw new Error(
        `${registry.registry_id} semantic invariants are missing`,
      );
    }
    for (const invariant of registry.semantic_invariants) {
      if (!allowedSemanticInvariants.has(invariant)) {
        throw new Error(`unknown semantic invariant: ${String(invariant)}`);
      }
      if (seenInvariants.has(invariant)) {
        throw new Error(`overlapping semantic invariant: ${invariant}`);
      }
      seenInvariants.add(invariant);
      semanticInvariants.push(invariant);
    }

    if (registry.sequence === 3) {
      if (registry.registry_id !== "003-exact-money") {
        throw new Error("sequence 003 exact registry identity is invalid");
      }
      const receivedTransformations = Object.keys(registry.transformations);
      const missingTransformation = PHASE3_REQUIRED_TRANSFORMATIONS.find(
        (category) => !receivedTransformations.includes(category),
      );
      if (missingTransformation) {
        throw new Error(
          `missing exact transformation: ${missingTransformation}`,
        );
      }
      const unexpectedTransformation = receivedTransformations.find(
        (category) => !PHASE3_REQUIRED_TRANSFORMATIONS.includes(category),
      );
      if (unexpectedTransformation) {
        throw new Error(
          `unexpected exact transformation: ${unexpectedTransformation}`,
        );
      }
      const missingInvariant = PHASE3_EXACT_INVARIANTS.find(
        (invariant) => !registry.semantic_invariants.includes(invariant),
      );
      if (missingInvariant) {
        throw new Error(
          `missing exact semantic invariant: ${missingInvariant}`,
        );
      }
      const unexpectedInvariant = registry.semantic_invariants.find(
        (invariant) => !PHASE3_EXACT_INVARIANTS.includes(invariant),
      );
      if (unexpectedInvariant) {
        throw new Error(
          `unexpected exact semantic invariant: ${unexpectedInvariant}`,
        );
      }
    }
    if (registry.sequence === 4) {
      const receivedTransformations = Object.keys(registry.transformations);
      const missingTransformation = PHASE4_REQUIRED_TRANSFORMATIONS.find(
        (category) => !receivedTransformations.includes(category),
      );
      if (missingTransformation) {
        throw new Error(
          `missing agreement-close transformation: ${missingTransformation}`,
        );
      }
      const unexpectedTransformation = receivedTransformations.find(
        (category) => !PHASE4_REQUIRED_TRANSFORMATIONS.includes(category),
      );
      if (unexpectedTransformation) {
        throw new Error(
          `unexpected agreement-close transformation: ${unexpectedTransformation}`,
        );
      }
      const missingInvariant = PHASE4_AGREEMENT_CLOSE_INVARIANTS.find(
        (invariant) => !registry.semantic_invariants.includes(invariant),
      );
      if (missingInvariant) {
        throw new Error(
          `missing agreement-close semantic invariant: ${missingInvariant}`,
        );
      }
      const unexpectedInvariant = registry.semantic_invariants.find(
        (invariant) => !PHASE4_AGREEMENT_CLOSE_INVARIANTS.includes(invariant),
      );
      if (unexpectedInvariant) {
        throw new Error(
          `unexpected agreement-close semantic invariant: ${unexpectedInvariant}`,
        );
      }
    }
  }

  return {
    baseline_id: baselineExpected.baseline_id,
    categories: baselineCategories,
    transformations: combined,
    semantic_invariants: semanticInvariants,
    migrations,
  };
}

export function loadTransformationRegistries({
  baselineExpected,
  registryDirectory = transformationRegistryDirectory,
}) {
  if (!fs.existsSync(registryDirectory)) {
    return validateTransformationRegistries({
      baselineExpected,
      registries: [],
    });
  }
  const registryDirectories = fs
    .readdirSync(registryDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{3}-/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const registries = registryDirectories.map((entry) => {
    const registryPath = path.join(
      registryDirectory,
      entry.name,
      "expected-transformations.json",
    );
    if (!fs.existsSync(registryPath)) {
      throw new Error(`${entry.name} transformation registry is missing`);
    }
    return JSON.parse(fs.readFileSync(registryPath, "utf8"));
  });
  return validateTransformationRegistries({ baselineExpected, registries });
}

export function loadUpgradeExpectation() {
  const config = fs.readFileSync(
    path.join(repositoryRoot, "supabase/config.toml"),
    "utf8",
  );
  if (!/^major_version\s*=\s*17$/m.test(config)) {
    throw new Error("PG17 upgrade expectation requires PostgreSQL 17");
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(expectationDirectory, "manifest.json"), "utf8"),
  );
  const expectedBytes = fs.readFileSync(
    path.join(expectationDirectory, "expected-fingerprints.json"),
  );
  const expected = JSON.parse(expectedBytes.toString("utf8"));
  const sourceManifestBytes = fs.readFileSync(
    path.join(baselineDirectory, "manifest.json"),
  );
  if (
    manifest.version !== "1.0.0" ||
    manifest.baseline_id !== "002-pre-financial-pg17" ||
    manifest.source_baseline !== "001-pre-financial" ||
    manifest.postgres_major_version !== 17 ||
    expected.version !== "1.0.0" ||
    expected.baseline_id !== manifest.baseline_id
  ) {
    throw new Error("PG17 upgrade expectation identity is invalid");
  }
  if (manifest.source_manifest_sha256 !== sha256(sourceManifestBytes)) {
    throw new Error("PG17 upgrade expectation source baseline differs");
  }
  if (manifest.expected_fingerprints_sha256 !== sha256(expectedBytes)) {
    throw new Error("PG17 expected fingerprint file hash differs");
  }
  assertFingerprintShape(expected.categories, "expected");
  if (
    expected.categories_sha256 !==
    sha256(Buffer.from(JSON.stringify(expected.categories), "utf8"))
  ) {
    throw new Error("PG17 expected fingerprint category hash differs");
  }
  return expected;
}

function assertLocalDatabase(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("upgrade lane requires a valid local database URL");
  }
  if (
    !new Set(["127.0.0.1", "localhost", "[::1]", "::1"]).has(parsed.hostname)
  ) {
    throw new Error("upgrade lane database must be loopback");
  }
}

function projectId() {
  const config = fs.readFileSync(
    path.join(repositoryRoot, "supabase/config.toml"),
    "utf8",
  );
  const match = /^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m.exec(config);
  if (!match) throw new Error("Supabase project identifier is missing");
  return match[1];
}

export async function resolveDatabaseContainer(execute = executeProcess) {
  const project = projectId();
  const result = await execute(
    "docker",
    [
      "ps",
      "--filter",
      `label=com.supabase.cli.project=${project}`,
      "--format",
      "{{.Names}}",
    ],
    { cwd: repositoryRoot, timeoutMs: 60000 },
  );
  if (result.code !== 0)
    throw new Error("local database container lookup failed");
  const expected = `supabase_db_${project}`;
  const matches = result.stdout
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter((name) => name === expected);
  if (matches.length !== 1) {
    throw new Error(
      "upgrade lane could not resolve exactly one database container",
    );
  }
  return expected;
}

async function runChecked(
  execute,
  command,
  args,
  description,
  timeoutMs = 300000,
) {
  const result = await execute(command, args, {
    cwd: repositoryRoot,
    timeoutMs,
  });
  if (result.code !== 0) {
    throw new Error(`${description} failed with exit code ${result.code}`);
  }
  return result;
}

export async function prepareBaseline(container, execute = executeProcess) {
  const files = ["schema.sql", "migration-history.sql", "fixtures.sql"];
  for (const filename of files) {
    await runChecked(
      execute,
      "docker",
      [
        "cp",
        path.join(baselineDirectory, filename),
        `${container}:/tmp/rc-${filename}`,
      ],
      `baseline copy ${filename}`,
      60000,
    );
  }
  const deleteUsers = `DELETE FROM auth.users WHERE id IN ('${fixtureUserIds.join("','")}')`;
  await runChecked(
    execute,
    "docker",
    [
      "exec",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `${deleteUsers}; DROP SCHEMA IF EXISTS private CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION pg_database_owner;`,
    ],
    "disposable baseline initialization",
  );
  for (const filename of files) {
    await runChecked(
      execute,
      "docker",
      [
        "exec",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "--file",
        `/tmp/rc-${filename}`,
      ],
      `baseline load ${filename}`,
    );
  }
}

export async function applyRegisteredMigrations(
  container,
  migrations,
  execute = executeProcess,
) {
  const migrationFiles = fs
    .readdirSync(path.join(repositoryRoot, "supabase/migrations"))
    .filter((filename) => filename.endsWith(".sql"));
  for (const version of migrations) {
    const matches = migrationFiles.filter((filename) =>
      filename.startsWith(`${version}_`),
    );
    if (matches.length !== 1) {
      throw new Error(
        `registered migration file resolution failed: ${version}`,
      );
    }
    const filename = matches[0];
    const containerPath = `/tmp/rc-registered-${filename}`;
    await runChecked(
      execute,
      "docker",
      [
        "cp",
        path.join(repositoryRoot, "supabase/migrations", filename),
        `${container}:${containerPath}`,
      ],
      `registered migration copy ${version}`,
      60000,
    );
    await runChecked(
      execute,
      "docker",
      [
        "exec",
        container,
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "--file",
        containerPath,
      ],
      `registered migration application ${version}`,
    );
  }
}

async function queryJson(container, query, category, execute) {
  const result = await runChecked(
    execute,
    "docker",
    [
      "exec",
      container,
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      query,
    ],
    `fingerprint query ${category}`,
    120000,
  );
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(`fingerprint query returned invalid JSON: ${category}`);
  }
}

export async function captureFingerprints(
  container,
  execute = executeProcess,
  categories = coreCategoryNames,
) {
  const fingerprints = {};
  for (const category of categories) {
    fingerprints[category] = hashFingerprint(
      await queryJson(
        container,
        fingerprintQueries[category],
        category,
        execute,
      ),
    );
  }
  return fingerprints;
}

async function captureInvoiceSemantics(container, execute) {
  const snapshot = await queryJson(
    container,
    invoiceSemanticQuery,
    "invoice_semantics",
    execute,
  );
  return {
    invoice_count: snapshot.invoice_count,
    invoice_numeric_text: hashFingerprint(snapshot.numeric_values),
    invoice_provider_text: hashFingerprint(snapshot.provider_values),
    invoice_legacy_ownership: hashFingerprint(snapshot.legacy_ownership),
    invoice_business_facts: hashFingerprint(snapshot.business_facts),
  };
}

function assertSemanticInvariants({
  before,
  after,
  postUpgrade,
  exactSnapshot,
  phase4Snapshot,
  invariants,
}) {
  const results = {};
  let exactSnapshotValidated;
  const exactSnapshotIsValid = () => {
    if (exactSnapshotValidated === undefined) {
      exactSnapshotValidated = validateExactUpgradeSnapshot(exactSnapshot);
    }
    return exactSnapshotValidated;
  };
  let phase4SnapshotValidated;
  const phase4SnapshotIsValid = () => {
    if (phase4SnapshotValidated === undefined) {
      phase4SnapshotValidated = validatePhase4UpgradeSnapshot(phase4Snapshot);
    }
    return phase4SnapshotValidated;
  };
  const assertions = {
    invoice_count_preserved: () => before.invoice_count === after.invoice_count,
    invoice_numeric_text_preserved: () =>
      before.invoice_numeric_text === after.invoice_numeric_text,
    invoice_provider_text_preserved: () =>
      before.invoice_provider_text === after.invoice_provider_text,
    invoice_legacy_ownership_preserved: () =>
      before.invoice_legacy_ownership === after.invoice_legacy_ownership,
    invoice_business_facts_preserved: () =>
      before.invoice_business_facts === after.invoice_business_facts,
    invoice_tenant_keys_complete: () => postUpgrade.null_tenant_count === "0",
    invoice_tenant_foreign_keys_valid: () =>
      postUpgrade.invalid_tenant_link_count === "0" &&
      postUpgrade.missing_owner_count === "0" &&
      postUpgrade.missing_operator_count === "0",
    billing_kernel_rows_added: () =>
      postUpgrade.invoice_company_count === postUpgrade.mapped_account_count,
    billing_grants_least_privilege: () =>
      postUpgrade.anonymous_invoice_privilege_count === "0" &&
      postUpgrade.authenticated_delete === false,
    exact_invoice_values_canonical: exactSnapshotIsValid,
    exact_line_items_canonical: exactSnapshotIsValid,
    exact_automation_state_canonical: exactSnapshotIsValid,
    exact_evidence_finalization_replaced: exactSnapshotIsValid,
    exact_invoice_rpcs_locked: exactSnapshotIsValid,
    exact_invoice_acl_least_privilege: exactSnapshotIsValid,
    tax_rate_compatibility_exact: exactSnapshotIsValid,
    unrelated_crm_payloads_preserved: exactSnapshotIsValid,
    agreement_close_schema_complete: phase4SnapshotIsValid,
    agreement_close_rpcs_locked: phase4SnapshotIsValid,
    agreement_close_acl_least_privilege: phase4SnapshotIsValid,
    agreement_close_capabilities_exact: phase4SnapshotIsValid,
    agreement_close_policy_exact: phase4SnapshotIsValid,
    agreement_close_business_facts_append_only: phase4SnapshotIsValid,
  };
  for (const invariant of invariants) {
    const assertion = assertions[invariant];
    if (!assertion || !assertion()) {
      throw new Error(`upgrade semantic invariant failed: ${invariant}`);
    }
    results[invariant] = true;
  }
  return results;
}

function fingerprintMismatches({ before, after, expected }) {
  const mismatches = {};
  for (const category of Object.keys(expected.categories)) {
    const expectedAfter =
      expected.transformations?.[category]?.after_sha256 ?? before[category];
    if (after[category] !== expectedAfter) {
      mismatches[category] = {
        expected_sha256: expectedAfter,
        actual_sha256: after[category],
      };
    }
  }
  return mismatches;
}

async function runUpgradeProof({ execute = executeProcess } = {}) {
  assertLocalDatabase(process.env.SUPABASE_DB_URL);
  verifyImmutableUpgradeInputs();
  await verifyBaseline({ baselineDirectory });
  const container = await resolveDatabaseContainer(execute);
  const expected = loadUpgradeExpectation();
  const expectedUpgrade = loadTransformationRegistries({
    baselineExpected: expected,
  });
  const activeCategories = Object.keys(expectedUpgrade.categories);
  assertFingerprintShape(
    expectedUpgrade.categories,
    "expected",
    activeCategories,
  );
  await prepareBaseline(container, execute);
  const before = await captureFingerprints(
    container,
    execute,
    activeCategories,
  );
  const beforeSemantics = await captureInvoiceSemantics(container, execute);
  for (const category of activeCategories) {
    if (before[category] !== expectedUpgrade.categories[category]) {
      throw new Error(
        `upgrade fingerprint mismatch before: ${category} ` +
          `(expected ${expectedUpgrade.categories[category]}, received ${before[category]})`,
      );
    }
  }
  await applyRegisteredMigrations(
    container,
    expectedUpgrade.migrations,
    execute,
  );
  const after = await captureFingerprints(container, execute, activeCategories);
  const afterSemantics = await captureInvoiceSemantics(container, execute);
  const postUpgradeSemantics = await queryJson(
    container,
    postUpgradeSemanticQuery,
    "post_upgrade_semantics",
    execute,
  );
  let exactSnapshot;
  if (
    expectedUpgrade.semantic_invariants.some((invariant) =>
      PHASE3_EXACT_INVARIANTS.includes(invariant),
    )
  ) {
    exactSnapshot = await queryJson(
      container,
      exactPostUpgradeSemanticQuery,
      "exact_post_upgrade_semantics",
      execute,
    );
    exactSnapshot.unrelated_crm = {
      before_sha256: before.unrelated_crm_payloads,
      after_sha256: after.unrelated_crm_payloads,
    };
  }
  let phase4Snapshot;
  if (
    expectedUpgrade.semantic_invariants.some((invariant) =>
      PHASE4_AGREEMENT_CLOSE_INVARIANTS.includes(invariant),
    )
  ) {
    phase4Snapshot = await queryJson(
      container,
      phase4PostUpgradeSemanticQuery,
      "phase4_post_upgrade_semantics",
      execute,
    );
  }
  const mismatches = fingerprintMismatches({
    before,
    after,
    expected: expectedUpgrade,
  });
  if (Object.keys(mismatches).length > 0) {
    throw new Error(
      `upgrade fingerprint mismatch after: ${JSON.stringify(mismatches)}`,
    );
  }
  const categories = compareFingerprintSets({
    before,
    after,
    expected: expectedUpgrade,
  });
  const semanticInvariants = assertSemanticInvariants({
    before: beforeSemantics,
    after: afterSemantics,
    postUpgrade: postUpgradeSemantics,
    exactSnapshot,
    phase4Snapshot,
    invariants: expectedUpgrade.semantic_invariants,
  });
  return {
    baseline_id: expectedUpgrade.baseline_id,
    categories,
    semantic_invariants: semanticInvariants,
    report_sha256: hashFingerprint(categories),
  };
}

async function main() {
  try {
    if (process.argv.length !== 2) {
      throw new Error("usage: fingerprint-upgrade.mjs");
    }
    const result = await runUpgradeProof();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "error"}\n`,
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
