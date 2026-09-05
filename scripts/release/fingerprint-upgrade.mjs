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
const legacyCategoryNames = [
  "row_identity_counts",
  "ownership_foreign_keys",
  "invoice_numeric_text",
  "row_payload_hashes",
  "constraint_definitions",
  "grant_matrix",
  "queryability",
];
export const exactUpgradeCategoryNames = Object.freeze([
  "invoice_exact_values",
  "invoice_exact_line_items",
  "automation_exact_values",
  "automation_request_effect_fingerprints",
  "evidence_finalization_exact",
  "invoice_rpc_contracts",
  "invoice_acl_contract",
  "exact_billing_constraints",
  "exact_billing_counts_ids",
  "money_compatibility",
]);
const categoryNames = [...legacyCategoryNames, ...exactUpgradeCategoryNames];
const fixtureUserIds = [
  "10000000-0000-0000-0000-000000000001",
  "10000000-0000-0000-0000-000000000002",
];
export const exactUpgradeInvariantNames = Object.freeze([
  "exact_invoice_values_canonical",
  "exact_invoice_line_items_canonical",
  "exact_automation_values_non_negative",
  "exact_automation_fingerprints_canonical",
  "exact_evidence_wrapper_replaced",
  "exact_invoice_rpcs_caller_bound",
  "exact_invoice_acl_least_privilege",
  "exact_billing_constraints_valid",
  "exact_billing_counts_ids_preserved",
  "exact_money_compatibility_preserved",
  "tax_rate_compatibility_exact",
  "crm_informational_payloads_preserved",
  "accepted_upgrade_history_immutable",
  "legacy_evidence_replay_preserved",
  "legacy_issue_date_preflight_atomic",
]);
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
  ...exactUpgradeInvariantNames,
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
const transformationFields = ["after_sha256", "before_sha256", "migration"];
const exactUpgradeMigration = "20260902000002";
const exactUpgradeMigrations = ["20260902000001", exactUpgradeMigration];

export const acceptedUpgradeArtifactDigests = Object.freeze({
  "supabase/tests/baselines/001-pre-financial/manifest.json":
    "eb1f2e2cdee134e72f45664a11557dcecce66cec1011cfdfaf99bd5dfd100e93",
  "supabase/tests/upgrades/002-billing-tenancy/expected-transformations.json":
    "dea0df2f23c11c7292e01996fa32e9a0a0e7b6741260de741fee8e76d375211a",
  "supabase/migrations/20260901000002_billing_invoice_boundary.sql":
    "811947e5391aedbbbb452daee5a41302a35d610122845b909b7c53e21ff57817",
  "supabase/migrations/20260901000003_billing_automation_grants.sql":
    "d1c27c260561131037712aab783b90101a7949b41e0528052c9f764666cc92fd",
  "supabase/migrations/20260901000004_billing_evidence_security.sql":
    "740ac8cc9c5955c3e64c837082402f0d7f94e5fe2f145d88489d22b010dc48c0",
});

function conditionalJsonQuery({ relation, requiredColumns, query }) {
  const columnChecks = requiredColumns
    .map(
      (column) => `EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = '${relation}'
          AND column_name = '${column}'
      )`,
    )
    .join(" AND ");
  return `
    CREATE OR REPLACE FUNCTION pg_temp.exact_upgrade_json(p_query text)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = ''
    AS $function$
    DECLARE result jsonb;
    BEGIN
      EXECUTE p_query INTO result;
      RETURN result;
    END;
    $function$;
    SELECT CASE
      WHEN ${columnChecks}
      THEN pg_temp.exact_upgrade_json($query$${query}$query$)
      ELSE '[]'::jsonb
    END`;
}

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
          'tax_rate', CASE
            WHEN to_jsonb(invoices) ? 'tax_rate_kind'
              THEN (tax_rate::numeric(5, 2))::text
            ELSE tax_rate::text
          END,
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
      UNION ALL SELECT 'invoices', id, (
        CASE
          WHEN to_jsonb(row_value) ? 'tax_rate_kind' THEN
            (
              to_jsonb(row_value)
              - ARRAY[
                'amount_minor',
                'currency',
                'currency_policy_version',
                'tax_rate_kind',
                'tax_rate_numerator',
                'tax_rate_denominator',
                'submitted_percentage',
                'rate_policy_version',
                'tax_amount_minor',
                'total_amount_minor',
                'rounding_policy_version',
                'line_items_exact',
                'line_items_legacy_evidence'
              ]::text[]
            ) || pg_catalog.jsonb_build_object(
              'tax_rate',
              row_value.tax_rate::numeric(5, 2)
            )
          ELSE to_jsonb(row_value)
        END
      )::text FROM public.invoices AS row_value
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
    WHERE namespace.nspname = 'public'
      AND relation.relname NOT LIKE 'financial\\_%' ESCAPE '\\'
      AND constraint_record.conname NOT IN (
        'invoices_exact_currency_check',
        'invoices_exact_currency_policy_check',
        'invoices_exact_rate_check',
        'invoices_exact_rounding_policy_check',
        'invoices_exact_total_check',
        'invoices_exact_money_compatibility_check',
        'invoices_tax_rate_compatibility_check',
        'invoices_exact_line_items_check',
        'billing_automation_grants_exact_values_check',
        'billing_automation_executions_exact_values_check'
      )`,
  grant_matrix: `
    SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'kind', entry->>'object', entry->>'grantee', entry->>'privilege'), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
        'kind','table','object',table_name,'grantee',grantee,'privilege',privilege_type
      ) AS entry
      FROM information_schema.table_privileges
      WHERE table_schema = 'public'
        AND grantee IN ('anon','authenticated','service_role','PUBLIC')
        AND table_name NOT LIKE 'financial\\_%' ESCAPE '\\'
      UNION ALL
      SELECT jsonb_build_object(
        'kind','routine','object',routine_name,'grantee',grantee,'privilege',privilege_type
      )
      FROM information_schema.routine_privileges
      WHERE routine_schema = 'public'
        AND grantee IN ('anon','authenticated','service_role','PUBLIC')
        AND routine_name NOT LIKE 'financial\\_%' ESCAPE '\\'
        AND routine_name NOT IN (
          'read_billing_invoices_exact',
          'read_billing_invoices_legacy_compat',
          'save_billing_invoice_exact'
        )
      UNION ALL
      SELECT jsonb_build_object(
        'kind','sequence','object',object_name,'grantee',grantee,'privilege',privilege_type
      )
      FROM information_schema.usage_privileges
      WHERE object_schema = 'public'
        AND grantee IN ('anon','authenticated','service_role','PUBLIC')
        AND object_name NOT LIKE 'financial\\_%' ESCAPE '\\'
      UNION ALL
      SELECT pg_catalog.jsonb_build_object(
        'kind', 'table',
        'object', 'invoices',
        'grantee', 'authenticated',
        'privilege', legacy_privilege.privilege
      )
      FROM (VALUES ('INSERT'), ('SELECT'), ('UPDATE')) AS legacy_privilege(privilege)
      WHERE EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'invoices'
          AND column_name = 'amount_minor'
      )
      UNION ALL
      SELECT pg_catalog.jsonb_build_object(
        'kind', 'sequence',
        'object', 'invoices_id_seq',
        'grantee', 'authenticated',
        'privilege', 'USAGE'
      )
      WHERE EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'invoices'
          AND column_name = 'amount_minor'
      )
      UNION ALL
      SELECT pg_catalog.jsonb_build_object(
        'kind', 'routine',
        'object', 'calculate_invoice_totals',
        'grantee', 'PUBLIC',
        'privilege', 'EXECUTE'
      )
      WHERE EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'invoices'
          AND column_name = 'amount_minor'
      )
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
  invoice_exact_values: `
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', invoice_value->>'id',
          'amount_minor', invoice_value->>'amount_minor',
          'currency', invoice_value->>'currency',
          'currency_policy_version', invoice_value->>'currency_policy_version',
          'tax_rate_kind', invoice_value->>'tax_rate_kind',
          'tax_rate_numerator', invoice_value->>'tax_rate_numerator',
          'tax_rate_denominator', invoice_value->>'tax_rate_denominator',
          'submitted_percentage', invoice_value->>'submitted_percentage',
          'rate_policy_version', invoice_value->>'rate_policy_version',
          'tax_amount_minor', invoice_value->>'tax_amount_minor',
          'total_amount_minor', invoice_value->>'total_amount_minor',
          'rounding_policy_version', invoice_value->>'rounding_policy_version'
        ) ORDER BY (invoice_value->>'id')::bigint
      ),
      '[]'::jsonb
    )
    FROM (
      SELECT pg_catalog.to_jsonb(invoice) AS invoice_value
      FROM public.invoices AS invoice
    ) AS invoice_values
    WHERE invoice_value ?& ARRAY[
      'amount_minor',
      'currency',
      'currency_policy_version',
      'tax_rate_kind',
      'tax_rate_numerator',
      'tax_rate_denominator',
      'submitted_percentage',
      'rate_policy_version',
      'tax_amount_minor',
      'total_amount_minor',
      'rounding_policy_version'
    ]`,
  invoice_exact_line_items: `
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'invoice_id', invoice_value->>'id',
          'items', invoice_value->'line_items_exact',
          'legacy_evidence', invoice_value->'line_items_legacy_evidence'
        ) ORDER BY (invoice_value->>'id')::bigint
      ),
      '[]'::jsonb
    )
    FROM (
      SELECT pg_catalog.to_jsonb(invoice) AS invoice_value
      FROM public.invoices AS invoice
    ) AS invoice_values
    WHERE invoice_value ?& ARRAY[
      'line_items_exact',
      'line_items_legacy_evidence'
    ]`,
  automation_exact_values: conditionalJsonQuery({
    relation: "billing_automation_grants",
    requiredColumns: ["max_amount_minor", "total_amount_consumed_minor"],
    query: `
      SELECT pg_catalog.jsonb_build_object(
        'grants', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', grant_row.id::text,
              'max_amount_minor', grant_row.max_amount_minor::text,
              'total_amount_consumed_minor', grant_row.total_amount_consumed_minor::text,
              'currency', grant_row.currency
            ) ORDER BY grant_row.id
          )
          FROM public.billing_automation_grants AS grant_row
        ), '[]'::jsonb),
        'executions', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', execution.id::text,
              'amount_minor', execution.amount_minor::text,
              'currency', execution.currency
            ) ORDER BY execution.id
          )
          FROM public.billing_automation_executions AS execution
        ), '[]'::jsonb)
      )`,
  }),
  automation_request_effect_fingerprints: conditionalJsonQuery({
    relation: "billing_automation_executions",
    requiredColumns: ["request_fingerprint", "effect_fingerprint"],
    query: `
      SELECT pg_catalog.jsonb_build_object(
        'algorithm', 'sha256',
        'executions', COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', execution.id::text,
              'request_fingerprint', execution.request_fingerprint,
              'effect_fingerprint', execution.effect_fingerprint
            ) ORDER BY execution.id
          ),
          '[]'::jsonb
        )
      )
      FROM public.billing_automation_executions AS execution`,
  }),
  evidence_finalization_exact: `
    WITH function_state AS (
      SELECT
        pg_catalog.to_regprocedure(
          'private.billing_finalize_evidence_inspection(uuid,uuid,text,text,text,text,text)'
        ) AS private_oid,
        pg_catalog.to_regprocedure(
          'public.finalize_billing_evidence_inspection(uuid,uuid,text,text,text,text,text)'
        ) AS public_oid,
        pg_catalog.to_regprocedure(
          'private.billing_consume_automation_grant(uuid,uuid,text,text,text,text,jsonb,text,jsonb)'
        ) AS exact_automation_oid,
        pg_catalog.to_regprocedure(
          'private.billing_consume_automation_grant(uuid,uuid,text,text,text,text,numeric,text)'
        ) AS numeric_automation_oid
    ), definitions AS (
      SELECT
        function_state.*,
        CASE WHEN private_oid IS NULL THEN ''
          ELSE pg_catalog.pg_get_functiondef(private_oid) END AS private_definition,
        CASE WHEN public_oid IS NULL THEN ''
          ELSE pg_catalog.pg_get_functiondef(public_oid) END AS public_definition
      FROM function_state
    )
    SELECT CASE
      WHEN private_oid IS NOT NULL
        AND public_oid IS NOT NULL
        AND exact_automation_oid IS NOT NULL
        AND private_definition LIKE '%amount_minor%'
        AND private_definition LIKE '%effect%'
      THEN pg_catalog.jsonb_build_object(
        'private_identity', 'private.billing_finalize_evidence_inspection(uuid,uuid,text,text,text,text,text)',
        'public_identity', 'public.finalize_billing_evidence_inspection(uuid,uuid,text,text,text,text,text)',
        'exact_automation_identity', 'private.billing_consume_automation_grant(uuid,uuid,text,text,text,text,jsonb,text,jsonb)',
        'exact_zero', pg_catalog.jsonb_build_object('amount_minor', '0', 'currency', 'USD'),
        'numeric_signature_present', numeric_automation_oid IS NOT NULL
      )
      ELSE '[]'::jsonb
    END
    FROM definitions`,
  invoice_rpc_contracts: `
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'identity', pg_catalog.format(
            '%I.%I(%s)',
            namespace.nspname,
            procedure.proname,
            pg_catalog.pg_get_function_identity_arguments(procedure.oid)
          ),
          'security_definer', procedure.prosecdef,
          'search_path', CASE
            WHEN COALESCE(pg_catalog.array_to_string(procedure.proconfig, ','), '')
              IN ('search_path=', 'search_path=""')
            THEN '' ELSE NULL END,
          'caller_capability', CASE
            WHEN procedure.proname LIKE 'read_billing_invoices_%'
              AND pg_catalog.pg_get_functiondef(procedure.oid) LIKE '%invoice.read%'
            THEN 'invoice.read'
            WHEN procedure.proname = 'save_billing_invoice_exact'
              AND pg_catalog.pg_get_functiondef(procedure.oid) LIKE '%invoice.update%'
            THEN 'invoice.update'
            ELSE NULL
          END,
          'dynamic_sql', pg_catalog.pg_get_functiondef(procedure.oid)
            ~* '\\m(EXECUTE|format[[:space:]]*\\()'
        ) ORDER BY procedure.proname
      ),
      '[]'::jsonb
    )
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'read_billing_invoices_exact',
        'read_billing_invoices_legacy_compat',
        'save_billing_invoice_exact'
      )
      AND pg_catalog.pg_get_function_identity_arguments(procedure.oid) = 'jsonb'`,
  invoice_acl_contract: `
    SELECT CASE
      WHEN pg_catalog.to_regprocedure('public.read_billing_invoices_exact(jsonb)') IS NULL
      THEN '[]'::jsonb
      ELSE pg_catalog.jsonb_build_object(
        'authenticated_invoice_privileges', COALESCE((
          SELECT jsonb_agg(privilege_type ORDER BY privilege_type)
          FROM information_schema.table_privileges
          WHERE table_schema = 'public'
            AND table_name = 'invoices'
            AND grantee = 'authenticated'
        ), '[]'::jsonb),
        'authenticated_sequence_privileges', COALESCE((
          SELECT jsonb_agg(privilege_type ORDER BY privilege_type)
          FROM information_schema.usage_privileges
          WHERE object_schema = 'public'
            AND object_name = 'invoices_id_seq'
            AND grantee = 'authenticated'
        ), '[]'::jsonb),
        'public_or_anon_rpc_execute', COALESCE((
          SELECT jsonb_agg(
            procedure_name || '(' || arguments || ')' ORDER BY procedure_name
          )
          FROM (
            SELECT procedure.proname AS procedure_name,
              pg_catalog.pg_get_function_identity_arguments(procedure.oid) AS arguments
            FROM pg_catalog.pg_proc AS procedure
            JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid = procedure.pronamespace
            WHERE namespace.nspname = 'public'
              AND procedure.proname IN (
                'read_billing_invoices_exact',
                'read_billing_invoices_legacy_compat',
                'save_billing_invoice_exact'
              )
              AND (
                pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
                OR EXISTS (
                  SELECT 1
                  FROM pg_catalog.aclexplode(
                    COALESCE(
                      procedure.proacl,
                      pg_catalog.acldefault('f', procedure.proowner)
                    )
                  ) AS access_entry
                  WHERE access_entry.grantee = 0
                    AND access_entry.privilege_type = 'EXECUTE'
                )
              )
          ) AS widened
        ), '[]'::jsonb),
        'authenticated_rpc_execute', COALESCE((
          SELECT jsonb_agg(
            procedure.proname || '(' || pg_catalog.pg_get_function_identity_arguments(procedure.oid) || ')'
            ORDER BY procedure.proname
          )
          FROM pg_catalog.pg_proc AS procedure
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
          WHERE namespace.nspname = 'public'
            AND procedure.proname IN (
              'read_billing_invoices_exact',
              'read_billing_invoices_legacy_compat',
              'save_billing_invoice_exact'
            )
            AND pg_catalog.has_function_privilege(
              'authenticated', procedure.oid, 'EXECUTE'
            )
        ), '[]'::jsonb)
      )
    END`,
  exact_billing_constraints: `
    WITH exact_constraints AS (
      SELECT
        relation.relname::text AS table_name,
        constraint_record.conname::text AS name,
        pg_catalog.pg_get_constraintdef(constraint_record.oid, true) AS definition
      FROM pg_catalog.pg_constraint AS constraint_record
      JOIN pg_catalog.pg_class AS relation
        ON relation.oid = constraint_record.conrelid
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN (
          'invoices',
          'billing_automation_grants',
          'billing_automation_executions'
        )
        AND pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
          ~ '(amount_minor|currency|tax_rate|rate_numerator|rate_denominator|line_items_exact|request_fingerprint|effect_fingerprint)'
    ), issue_date_invariant AS (
      SELECT
        'invoices'::text AS table_name,
        'invoices_issue_date_not_null'::text AS name,
        CASE WHEN issue_date.attnotnull THEN 'NOT NULL' ELSE 'NULLABLE' END AS definition
      FROM pg_catalog.pg_attribute AS issue_date
      WHERE issue_date.attrelid = 'public.invoices'::regclass
        AND issue_date.attname = 'issue_date'
        AND issue_date.attnum > 0
        AND NOT issue_date.attisdropped
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.pg_attribute AS exact_column
          WHERE exact_column.attrelid = issue_date.attrelid
            AND exact_column.attname = 'amount_minor'
            AND exact_column.attnum > 0
            AND NOT exact_column.attisdropped
        )
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'table', exact_constraint.table_name,
          'name', exact_constraint.name,
          'definition', exact_constraint.definition
        ) ORDER BY exact_constraint.table_name, exact_constraint.name
      ),
      '[]'::jsonb
    )
    FROM (
      SELECT * FROM exact_constraints
      UNION ALL
      SELECT * FROM issue_date_invariant
    ) AS exact_constraint`,
  exact_billing_counts_ids: conditionalJsonQuery({
    relation: "invoices",
    requiredColumns: ["amount_minor", "line_items_exact"],
    query: `
      SELECT pg_catalog.jsonb_build_object(
        'invoices', pg_catalog.jsonb_build_object(
          'count', (SELECT pg_catalog.count(*)::text FROM public.invoices),
          'ids', (SELECT COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb) FROM public.invoices)
        ),
        'billing_automation_grants', pg_catalog.jsonb_build_object(
          'count', (SELECT pg_catalog.count(*)::text FROM public.billing_automation_grants),
          'ids', (SELECT COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb) FROM public.billing_automation_grants)
        ),
        'billing_automation_executions', pg_catalog.jsonb_build_object(
          'count', (SELECT pg_catalog.count(*)::text FROM public.billing_automation_executions),
          'ids', (SELECT COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb) FROM public.billing_automation_executions)
        )
      )`,
  }),
  money_compatibility: conditionalJsonQuery({
    relation: "invoices",
    requiredColumns: [
      "amount_minor",
      "tax_rate_numerator",
      "tax_rate_denominator",
    ],
    query: `
      WITH types AS (
        SELECT
          MAX(pg_catalog.format_type(attribute.atttypid, attribute.atttypmod))
            FILTER (WHERE attribute.attname IN ('amount', 'tax_amount', 'total_amount')) AS money_type,
          MAX(pg_catalog.format_type(attribute.atttypid, attribute.atttypmod))
            FILTER (WHERE attribute.attname = 'tax_rate') AS tax_rate_type
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = 'public.invoices'::regclass
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      ), fixtures AS (
        SELECT percentage,
          public.financial_parse_percentage(
            pg_catalog.to_jsonb(percentage),
            'ordinary-percentage-v1'
          ) AS rate
        FROM (VALUES ('8.875%'::text), ('12.500%'::text)) AS values(percentage)
      )
      SELECT pg_catalog.jsonb_build_object(
        'money_type', types.money_type,
        'tax_rate_type', types.tax_rate_type,
        'tax_rate_range', '0..100',
        'values', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'submitted_percentage', fixtures.percentage,
              'numerator', fixtures.rate->>'numerator',
              'denominator', fixtures.rate->>'denominator',
              'compatibility_percentage', pg_catalog.to_char(
                ((fixtures.rate->>'numerator')::numeric * 100::numeric)
                  / (fixtures.rate->>'denominator')::numeric,
                'FM999999990.000000000'
              )
            ) ORDER BY fixtures.percentage
          )
          FROM fixtures
        )
      )
      FROM types`,
  }),
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

const crmInformationalSemanticQuery = `
  SELECT pg_catalog.jsonb_build_object(
    'deals', COALESCE((
      SELECT jsonb_agg(pg_catalog.to_jsonb(deal) ORDER BY deal.id)
      FROM public.deals AS deal
    ), '[]'::jsonb),
    'projects', COALESCE((
      SELECT jsonb_agg(pg_catalog.to_jsonb(project) ORDER BY project.id)
      FROM public.projects AS project
    ), '[]'::jsonb),
    'project_analytics', COALESCE((
      SELECT jsonb_agg(pg_catalog.to_jsonb(analytics) ORDER BY analytics.id)
      FROM public.project_analytics AS analytics
    ), '[]'::jsonb)
  )`;

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

export function assertAcceptedUpgradeArtifactDigests(actualDigests) {
  assertExactFields(
    actualDigests,
    Object.keys(acceptedUpgradeArtifactDigests),
    "accepted upgrade artifacts",
  );
  for (const [relativePath, expectedDigest] of Object.entries(
    acceptedUpgradeArtifactDigests,
  )) {
    if (actualDigests[relativePath] !== expectedDigest) {
      throw new Error(`accepted upgrade artifact differs: ${relativePath}`);
    }
  }
  return actualDigests;
}

export function verifyAcceptedUpgradeArtifacts({
  root = repositoryRoot,
  readFile = fs.readFileSync,
} = {}) {
  const actualDigests = Object.fromEntries(
    Object.keys(acceptedUpgradeArtifactDigests).map((relativePath) => [
      relativePath,
      sha256(readFile(path.join(root, relativePath))),
    ]),
  );
  return assertAcceptedUpgradeArtifactDigests(actualDigests);
}

function assertFingerprintShape(fingerprints, label) {
  const received = Object.keys(fingerprints ?? {}).sort();
  if (JSON.stringify(received) !== JSON.stringify([...categoryNames].sort())) {
    throw new Error(`${label} fingerprint categories are incomplete`);
  }
  for (const [category, digest] of Object.entries(fingerprints)) {
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      throw new Error(`${label} fingerprint is invalid: ${category}`);
    }
  }
}

export function compareFingerprintSets({ before, after, expected }) {
  assertFingerprintShape(before, "before");
  assertFingerprintShape(after, "after");
  assertFingerprintShape(expected?.categories, "expected");
  const results = {};
  for (const category of categoryNames) {
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

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function assertCanonicalIntegerText(
  value,
  label,
  { nonNegative = false } = {},
) {
  const pattern = nonNegative ? /^(0|[1-9][0-9]*)$/ : /^(0|-?[1-9][0-9]*)$/;
  if (typeof value !== "string" || !pattern.test(value)) {
    const suffix = nonNegative
      ? "automation values must be non-negative"
      : `${label} must be canonical PostgreSQL text`;
    throw new Error(suffix);
  }
  return value;
}

function assertMoneyWire(value, label) {
  assertExactFields(value, ["amount_minor", "currency"], label);
  assertCanonicalIntegerText(value.amount_minor, `${label}.amount_minor`);
  if (value.currency !== "USD") {
    throw new Error(`${label}.currency must be USD`);
  }
}

function assertReducedRatio(numeratorText, denominatorText, label) {
  assertCanonicalIntegerText(numeratorText, `${label}.numerator`);
  assertCanonicalIntegerText(denominatorText, `${label}.denominator`, {
    nonNegative: true,
  });
  const numerator = BigInt(numeratorText);
  const denominator = BigInt(denominatorText);
  if (denominator === 0n)
    throw new Error(`${label} denominator must be positive`);
  let left = numerator < 0n ? -numerator : numerator;
  let right = denominator;
  while (right !== 0n) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  if (left !== 1n) throw new Error(`${label} must be a reduced ratio`);
}

export function assertExactUpgradeSnapshot(snapshot) {
  assertExactFields(
    snapshot,
    exactUpgradeCategoryNames,
    "exact upgrade snapshot",
  );
  const results = {};

  for (const [index, invoice] of assertArray(
    snapshot.invoice_exact_values,
    "invoice_exact_values",
  ).entries()) {
    assertExactFields(
      invoice,
      [
        "id",
        "amount_minor",
        "currency",
        "currency_policy_version",
        "tax_rate_kind",
        "tax_rate_numerator",
        "tax_rate_denominator",
        "submitted_percentage",
        "rate_policy_version",
        "tax_amount_minor",
        "total_amount_minor",
        "rounding_policy_version",
      ],
      `invoice_exact_values[${index}]`,
    );
    assertCanonicalIntegerText(invoice.id, `invoice_exact_values[${index}].id`);
    for (const field of [
      "amount_minor",
      "tax_rate_numerator",
      "tax_rate_denominator",
      "tax_amount_minor",
      "total_amount_minor",
    ]) {
      assertCanonicalIntegerText(
        invoice[field],
        `invoice_exact_values[${index}].${field}`,
      );
    }
    assertReducedRatio(
      invoice.tax_rate_numerator,
      invoice.tax_rate_denominator,
      `invoice_exact_values[${index}].tax_rate`,
    );
    if (
      invoice.currency !== "USD" ||
      invoice.currency_policy_version !== "usd-v1" ||
      invoice.tax_rate_kind !== "ordinary_percentage" ||
      invoice.rate_policy_version !== "ordinary-percentage-v1" ||
      invoice.rounding_policy_version !== "half-away-from-zero-v1" ||
      typeof invoice.submitted_percentage !== "string"
    ) {
      throw new Error("invoice exact policy identity is invalid");
    }
  }
  results.exact_invoice_values_canonical = true;

  for (const [invoiceIndex, invoice] of assertArray(
    snapshot.invoice_exact_line_items,
    "invoice_exact_line_items",
  ).entries()) {
    const fields = Object.keys(invoice);
    const unknown = fields.find(
      (field) => !["invoice_id", "items", "legacy_evidence"].includes(field),
    );
    if (unknown) {
      throw new Error(
        `invoice line item snapshot has unknown field: ${unknown}`,
      );
    }
    if (!fields.includes("invoice_id") || !fields.includes("items")) {
      throw new Error("invoice line item snapshot is incomplete");
    }
    assertCanonicalIntegerText(
      invoice.invoice_id,
      `invoice_exact_line_items[${invoiceIndex}].invoice_id`,
    );
    for (const [itemIndex, item] of assertArray(
      invoice.items,
      `invoice_exact_line_items[${invoiceIndex}].items`,
    ).entries()) {
      assertExactFields(
        item,
        [
          "quantity_ratio",
          "unit_price",
          "extended_amount",
          "currency_policy_version",
          "rounding_policy_version",
        ],
        `line item ${invoiceIndex}:${itemIndex}`,
      );
      assertExactFields(
        item.quantity_ratio,
        ["numerator", "denominator"],
        `line item ${invoiceIndex}:${itemIndex} quantity_ratio`,
      );
      assertReducedRatio(
        item.quantity_ratio.numerator,
        item.quantity_ratio.denominator,
        `line item ${invoiceIndex}:${itemIndex} quantity_ratio`,
      );
      assertMoneyWire(
        item.unit_price,
        `line item ${invoiceIndex}:${itemIndex} unit_price`,
      );
      assertMoneyWire(
        item.extended_amount,
        `line item ${invoiceIndex}:${itemIndex} extended_amount`,
      );
      if (
        item.currency_policy_version !== "usd-v1" ||
        item.rounding_policy_version !== "half-away-from-zero-v1"
      ) {
        throw new Error("line item policy identity is invalid");
      }
    }
  }
  results.exact_invoice_line_items_canonical = true;

  assertExactFields(
    snapshot.automation_exact_values,
    ["grants", "executions"],
    "automation_exact_values",
  );
  for (const grant of assertArray(
    snapshot.automation_exact_values.grants,
    "automation grants",
  )) {
    if (grant.max_amount_minor !== null) {
      assertCanonicalIntegerText(grant.max_amount_minor, "max_amount_minor", {
        nonNegative: true,
      });
    }
    assertCanonicalIntegerText(
      grant.total_amount_consumed_minor,
      "total_amount_consumed_minor",
      { nonNegative: true },
    );
    if (grant.currency !== "USD")
      throw new Error("automation currency must be USD");
  }
  for (const execution of assertArray(
    snapshot.automation_exact_values.executions,
    "automation executions",
  )) {
    assertCanonicalIntegerText(execution.amount_minor, "amount_minor", {
      nonNegative: true,
    });
    if (execution.currency !== "USD") {
      throw new Error("automation currency must be USD");
    }
  }
  results.exact_automation_values_non_negative = true;

  assertExactFields(
    snapshot.automation_request_effect_fingerprints,
    ["algorithm", "executions"],
    "automation_request_effect_fingerprints",
  );
  if (snapshot.automation_request_effect_fingerprints.algorithm !== "sha256") {
    throw new Error("automation fingerprint algorithm must be sha256");
  }
  for (const fingerprint of assertArray(
    snapshot.automation_request_effect_fingerprints.executions,
    "automation_request_effect_fingerprints.executions",
  )) {
    for (const field of ["request_fingerprint", "effect_fingerprint"]) {
      if (
        typeof fingerprint[field] !== "string" ||
        !/^[0-9a-f]{64}$/.test(fingerprint[field])
      ) {
        throw new Error(`automation ${field} must be canonical SHA-256`);
      }
    }
  }
  results.exact_automation_fingerprints_canonical = true;

  assertExactFields(
    snapshot.evidence_finalization_exact,
    [
      "private_identity",
      "public_identity",
      "exact_automation_identity",
      "exact_zero",
      "numeric_signature_present",
    ],
    "evidence_finalization_exact",
  );
  assertMoneyWire(
    snapshot.evidence_finalization_exact.exact_zero,
    "evidence exact zero",
  );
  if (snapshot.evidence_finalization_exact.exact_zero.amount_minor !== "0") {
    throw new Error("evidence finalization must consume canonical zero");
  }
  if (
    snapshot.evidence_finalization_exact.numeric_signature_present !== false
  ) {
    throw new Error("numeric evidence automation signature remains");
  }
  if (
    snapshot.evidence_finalization_exact.private_identity !==
      "private.billing_finalize_evidence_inspection(uuid,uuid,text,text,text,text,text)" ||
    snapshot.evidence_finalization_exact.public_identity !==
      "public.finalize_billing_evidence_inspection(uuid,uuid,text,text,text,text,text)" ||
    snapshot.evidence_finalization_exact.exact_automation_identity !==
      "private.billing_consume_automation_grant(uuid,uuid,text,text,text,text,jsonb,text,jsonb)"
  ) {
    throw new Error("evidence finalization wrapper identity differs");
  }
  results.exact_evidence_wrapper_replaced = true;

  const expectedRpcCapabilities = new Map([
    ["public.read_billing_invoices_exact(jsonb)", "invoice.read"],
    ["public.read_billing_invoices_legacy_compat(jsonb)", "invoice.read"],
    ["public.save_billing_invoice_exact(jsonb)", "invoice.update"],
  ]);
  const seenRpcs = new Set();
  for (const rpc of assertArray(
    snapshot.invoice_rpc_contracts,
    "invoice_rpc_contracts",
  )) {
    assertExactFields(
      rpc,
      [
        "identity",
        "security_definer",
        "search_path",
        "caller_capability",
        "dynamic_sql",
      ],
      "invoice RPC",
    );
    if (
      !expectedRpcCapabilities.has(rpc.identity) ||
      rpc.security_definer !== true ||
      rpc.search_path !== "" ||
      rpc.dynamic_sql !== false ||
      rpc.caller_capability !== expectedRpcCapabilities.get(rpc.identity)
    ) {
      throw new Error(
        `invoice RPC is not caller-bound: ${String(rpc.identity)}`,
      );
    }
    seenRpcs.add(rpc.identity);
  }
  if (seenRpcs.size !== expectedRpcCapabilities.size) {
    throw new Error("invoice RPC contract is incomplete");
  }
  results.exact_invoice_rpcs_caller_bound = true;

  assertExactFields(
    snapshot.invoice_acl_contract,
    [
      "authenticated_invoice_privileges",
      "authenticated_sequence_privileges",
      "public_or_anon_rpc_execute",
      "authenticated_rpc_execute",
    ],
    "invoice_acl_contract",
  );
  if (snapshot.invoice_acl_contract.authenticated_invoice_privileges.length) {
    throw new Error("authenticated invoice table privilege remains");
  }
  if (snapshot.invoice_acl_contract.authenticated_sequence_privileges.length) {
    throw new Error("authenticated invoice sequence privilege remains");
  }
  if (snapshot.invoice_acl_contract.public_or_anon_rpc_execute.length) {
    throw new Error("public or anonymous invoice RPC execute remains");
  }
  const expectedRpcExecute = [...expectedRpcCapabilities.keys()]
    .map((identity) => identity.replace(/^public\./, ""))
    .sort();
  if (
    JSON.stringify(
      [...snapshot.invoice_acl_contract.authenticated_rpc_execute].sort(),
    ) !== JSON.stringify(expectedRpcExecute)
  ) {
    throw new Error("authenticated invoice RPC execute contract is incomplete");
  }
  results.exact_invoice_acl_least_privilege = true;

  const constraints = assertArray(
    snapshot.exact_billing_constraints,
    "exact_billing_constraints",
  );
  if (
    !constraints.some(
      (constraint) =>
        constraint.table === "invoices" &&
        constraint.name === "invoices_tax_rate_compatibility_check" &&
        typeof constraint.definition === "string" &&
        /tax_rate\s*>=\s*0/.test(constraint.definition) &&
        /tax_rate\s*<=\s*100/.test(constraint.definition),
    )
  ) {
    throw new Error("exact tax-rate compatibility constraint is missing");
  }
  if (
    !constraints.some(
      (constraint) =>
        constraint.table === "invoices" &&
        constraint.name === "invoices_issue_date_not_null" &&
        constraint.definition === "NOT NULL",
    )
  ) {
    throw new Error("exact invoice issue_date NOT NULL invariant is missing");
  }
  results.exact_billing_constraints_valid = true;

  assertExactFields(
    snapshot.exact_billing_counts_ids,
    ["invoices", "billing_automation_grants", "billing_automation_executions"],
    "exact_billing_counts_ids",
  );
  for (const [table, identity] of Object.entries(
    snapshot.exact_billing_counts_ids,
  )) {
    assertExactFields(identity, ["count", "ids"], `${table} count/ids`);
    assertCanonicalIntegerText(identity.count, `${table}.count`, {
      nonNegative: true,
    });
    const ids = assertArray(identity.ids, `${table}.ids`);
    if (BigInt(identity.count) !== BigInt(ids.length)) {
      throw new Error(`${table} count and IDs differ`);
    }
    if (ids.some((id) => typeof id !== "string")) {
      throw new Error(`${table} ID must remain text`);
    }
  }
  results.exact_billing_counts_ids_preserved = true;

  assertExactFields(
    snapshot.money_compatibility,
    ["money_type", "tax_rate_type", "tax_rate_range", "values"],
    "money_compatibility",
  );
  if (snapshot.money_compatibility.money_type !== "numeric(19,2)") {
    throw new Error("legacy money must be numeric(19,2)");
  }
  if (snapshot.money_compatibility.tax_rate_type !== "numeric(12,9)") {
    throw new Error("tax_rate must be numeric(12,9)");
  }
  if (snapshot.money_compatibility.tax_rate_range !== "0..100") {
    throw new Error("tax_rate compatibility range must be 0..100");
  }
  const compatibilityValues = assertArray(
    snapshot.money_compatibility.values,
    "money compatibility values",
  );
  const expectedCompatibility = new Map([
    ["8.875%", ["71", "800", "8.875000000"]],
    ["12.500%", ["1", "8", "12.500000000"]],
  ]);
  if (
    !compatibilityValues.some(
      (value) => value.submitted_percentage === "12.500%",
    )
  ) {
    throw new Error("submitted 12.500% evidence is missing");
  }
  if (
    !compatibilityValues.some(
      (value) => value.submitted_percentage === "8.875%",
    )
  ) {
    throw new Error("submitted 8.875% evidence is missing");
  }
  for (const value of compatibilityValues) {
    const unknownCompatibilityField = Object.keys(value).find(
      (field) =>
        ![
          "submitted_percentage",
          "numerator",
          "denominator",
          "compatibility_percentage",
        ].includes(field),
    );
    if (unknownCompatibilityField) {
      throw new Error(
        `unknown compatibility field: ${unknownCompatibilityField}`,
      );
    }
    assertExactFields(
      value,
      [
        "submitted_percentage",
        "numerator",
        "denominator",
        "compatibility_percentage",
      ],
      "compatibility value",
    );
    if (!/^\d{1,3}\.\d{9}$/.test(value.compatibility_percentage)) {
      throw new Error(
        "compatibility percentage must use fixed nine-decimal scale",
      );
    }
    const expected = expectedCompatibility.get(value.submitted_percentage);
    if (!expected) {
      throw new Error(
        `unexpected compatibility percentage evidence: ${value.submitted_percentage}`,
      );
    }
    if (
      value.numerator !== expected[0] ||
      value.denominator !== expected[1] ||
      value.compatibility_percentage !== expected[2]
    ) {
      throw new Error("canonical reduced ratio mismatch");
    }
  }
  results.exact_money_compatibility_preserved = true;
  results.tax_rate_compatibility_exact = true;

  return results;
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
  assertFingerprintShape(baselineExpected?.categories, "expected");
  if (typeof baselineExpected?.baseline_id !== "string") {
    throw new Error("baseline expected identity is missing");
  }
  if (!Array.isArray(registries)) {
    throw new Error("transformation registries must be ordered");
  }

  const current = { ...baselineExpected.categories };
  const combined = {};
  for (const [category, transformation] of Object.entries(
    baselineExpected.transformations ?? {},
  )) {
    if (!categoryNames.includes(category)) {
      throw new Error(
        `baseline has unknown transformation category: ${category}`,
      );
    }
    assertDigest(transformation?.before_sha256, `${category} before_sha256`);
    assertDigest(transformation?.after_sha256, `${category} after_sha256`);
    if (transformation.before_sha256 !== current[category]) {
      throw new Error(`baseline transformation is stale: ${category}`);
    }
    current[category] = transformation.after_sha256;
    combined[category] = {
      migration: transformation.migration,
      before_sha256: baselineExpected.categories[category],
      after_sha256: transformation.after_sha256,
    };
  }

  const transformedCategories = new Set();
  const semanticInvariants = [];
  const seenInvariants = new Set();
  const registryIds = [];
  for (const [index, registry] of registries.entries()) {
    assertExactFields(registry, registryFields, `registry ${index + 2}`);
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
      !registry.transformations ||
      typeof registry.transformations !== "object" ||
      Array.isArray(registry.transformations) ||
      Object.keys(registry.transformations).length === 0
    ) {
      throw new Error(`${registry.registry_id} transformations are missing`);
    }
    const overlappingCategory = Object.keys(registry.transformations).find(
      (category) => transformedCategories.has(category),
    );
    if (overlappingCategory) {
      throw new Error(
        `overlapping transformation category: ${overlappingCategory}`,
      );
    }

    if (registry.sequence === 3) {
      if (registry.registry_id !== "003-exact-money") {
        throw new Error("registry 3 identity is invalid");
      }
      if (
        JSON.stringify(registry.migrations) !==
        JSON.stringify(exactUpgradeMigrations)
      ) {
        throw new Error("003-exact-money migrations are not ordered");
      }
      const exactCategories = Object.keys(registry.transformations);
      const unknownCategory = exactCategories.find(
        (category) => !exactUpgradeCategoryNames.includes(category),
      );
      if (unknownCategory) {
        throw new Error(
          `unknown exact transformation category: ${unknownCategory}`,
        );
      }
      const missingCategory = exactUpgradeCategoryNames.find(
        (category) => !exactCategories.includes(category),
      );
      if (missingCategory) {
        throw new Error(
          `missing exact transformation category: ${missingCategory}`,
        );
      }
      const exactInvariants = registry.semantic_invariants;
      if (!Array.isArray(exactInvariants)) {
        throw new Error("003-exact-money semantic invariants are missing");
      }
      const missingInvariant = exactUpgradeInvariantNames.find(
        (invariant) => !exactInvariants.includes(invariant),
      );
      if (missingInvariant) {
        throw new Error(
          `missing exact semantic invariant: ${missingInvariant}`,
        );
      }
    }

    for (const [category, transformation] of Object.entries(
      registry.transformations,
    )) {
      if (!categoryNames.includes(category)) {
        throw new Error(`unknown transformation category: ${category}`);
      }
      if (transformedCategories.has(category)) {
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
      if (
        registry.sequence === 3 &&
        transformation.migration !== exactUpgradeMigration
      ) {
        throw new Error(
          `exact transformation migration is mismatched: ${category}`,
        );
      }
      if (transformation.before_sha256 !== current[category]) {
        throw new Error(`stale transformation hash: ${category}`);
      }
      if (transformation.after_sha256 === transformation.before_sha256) {
        throw new Error(`overbroad unchanged transformation: ${category}`);
      }
      transformedCategories.add(category);
      current[category] = transformation.after_sha256;
      combined[category] = {
        migration: transformation.migration,
        before_sha256: baselineExpected.categories[category],
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
    registryIds.push(registry.registry_id);
  }

  return {
    baseline_id: baselineExpected.baseline_id,
    registry_ids: registryIds,
    categories: { ...baselineExpected.categories },
    transformations: combined,
    semantic_invariants: semanticInvariants,
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
  const legacyFields = Object.keys(expected.categories).sort();
  if (
    JSON.stringify(legacyFields) !==
    JSON.stringify([...legacyCategoryNames].sort())
  ) {
    throw new Error("PG17 expected fingerprint categories are incomplete");
  }
  for (const [category, digest] of Object.entries(expected.categories)) {
    assertDigest(digest, `expected fingerprint ${category}`);
  }
  if (
    expected.categories_sha256 !==
    sha256(Buffer.from(JSON.stringify(expected.categories), "utf8"))
  ) {
    throw new Error("PG17 expected fingerprint category hash differs");
  }
  const emptyExactFingerprint = hashFingerprint([]);
  return {
    ...expected,
    categories: {
      ...expected.categories,
      ...Object.fromEntries(
        exactUpgradeCategoryNames.map((category) => [
          category,
          emptyExactFingerprint,
        ]),
      ),
    },
  };
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
    throw new Error(
      `${description} failed with exit code ${result.code}: ${result.stderr.trim()} ${result.stdout.trim()}`,
    );
  }
  return result;
}

async function runExpectedFailure(
  execute,
  command,
  args,
  description,
  expectedOutput,
  timeoutMs = 300000,
) {
  const result = await execute(command, args, {
    cwd: repositoryRoot,
    timeoutMs,
  });
  const output = `${result.stderr}\n${result.stdout}`;
  if (result.code === 0) {
    throw new Error(`${description} unexpectedly succeeded`);
  }
  if (!output.includes(expectedOutput)) {
    throw new Error(
      `${description} failed without ${expectedOutput}: ${output.trim()}`,
    );
  }
  return result;
}

async function prepareBaseline(container, execute) {
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

const phaseThreeMigrationHistorySql = `
  INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
  VALUES
    ('20260902000001', 'exact_money_preflight', ARRAY[]::text[]),
    ('20260902000002', 'exact_billing_expand', ARRAY[]::text[])
  ON CONFLICT (version) DO NOTHING`;

const legacyEvidenceReplayFixtureSql = `
  BEGIN;
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-0000-0000-000000000900',
    'authenticated', 'authenticated', 'upgrade-scanner@fixture.invalid', '',
    '2026-09-01T00:00:00Z',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z'
  );
  DELETE FROM public.sales
  WHERE user_id = '30000000-0000-0000-0000-000000000900';
  INSERT INTO public.billing_automation_principals (
    id, organization_id, auth_user_id, name, status, disabled_at, disabled_reason
  ) VALUES
    (
      '30000000-0000-0000-0000-000000000901',
      '00000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000900',
      'Retired upgrade scanner', 'disabled', '2026-09-01T01:00:00Z',
      'rotated before exact-money cutover'
    ),
    (
      '30000000-0000-0000-0000-000000000902',
      '00000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000900',
      'Active upgrade scanner', 'active', NULL, NULL
    );
  INSERT INTO public.billing_automation_grants (
    id, organization_id, account_id, principal_id, command_name,
    provider_reference, policy_version, action_kind, max_actions
  )
  SELECT
    '30000000-0000-0000-0000-000000000903',
    account.organization_id, account.id,
    '30000000-0000-0000-0000-000000000902',
    'evidence.inspect', 'upgrade-scanner', 'upgrade-fixture-v1',
    'evidence.inspection', 5
  FROM public.billing_accounts AS account
  WHERE account.company_id = 2001;
  INSERT INTO public.billing_evidence_objects (
    id, organization_id, account_id, sha256, size_bytes, mime_type,
    retention_expires_at
  )
  SELECT
    '30000000-0000-0000-0000-000000000904',
    account.organization_id, account.id, repeat('9', 64), 904,
    'application/pdf', now() + interval '7 years'
  FROM public.billing_accounts AS account
  WHERE account.company_id = 2001;
  ALTER TABLE public.billing_automation_executions
    ALTER COLUMN id SET DEFAULT
      '30000000-0000-0000-0000-000000000905'::uuid;
  SELECT set_config(
    'request.jwt.claim.sub',
    '30000000-0000-0000-0000-000000000900',
    true
  );
  SELECT set_config(
    'request.jwt.claims',
    '{"sub":"30000000-0000-0000-0000-000000000900","role":"authenticated"}',
    true
  );
  SET LOCAL ROLE authenticated;
  SELECT public.finalize_billing_evidence_inspection(
    '30000000-0000-0000-0000-000000000904',
    '30000000-0000-0000-0000-000000000903',
    'upgrade-scanner', 'upgrade-fixture-v1', 'clean', 'SCAN_CLEAN',
    'upgrade-evidence-replay-0001'
  );
  RESET ROLE;
  ALTER TABLE public.billing_automation_executions
    ALTER COLUMN id SET DEFAULT gen_random_uuid();
  COMMIT`;

const legacyEvidenceReplayVerificationQuery = `
  SELECT jsonb_build_object(
    'principal_id', execution.principal_id::text,
    'request_fingerprint_exact',
      execution.request_fingerprint = expected.request_fingerprint,
    'effect_fingerprint_exact',
      execution.effect_fingerprint = expected.effect_fingerprint,
    'evidence_status', evidence.inspection_status,
    'evidence_principal_id', evidence.inspection_principal_id::text
  )
  FROM public.billing_automation_executions AS execution
  CROSS JOIN LATERAL (
    SELECT
      encode(digest(convert_to(jsonb_build_object(
        'grant_id', '30000000-0000-0000-0000-000000000903',
        'account_id', execution.account_id::text,
        'command_name', 'evidence.inspect',
        'provider_reference', 'upgrade-scanner',
        'policy_version', 'upgrade-fixture-v1',
        'action_kind', 'evidence.inspection',
        'money', jsonb_build_object(
          'amount_minor', '0',
          'currency', 'USD'
        )
      )::text, 'UTF8'), 'sha256'), 'hex') AS request_fingerprint,
      encode(digest(convert_to(jsonb_build_object(
        'kind', 'evidence.inspection',
        'evidence_id', '30000000-0000-0000-0000-000000000904',
        'decision', 'clean',
        'reason_code', 'SCAN_CLEAN'
      )::text, 'UTF8'), 'sha256'), 'hex') AS effect_fingerprint
  ) AS expected
  JOIN public.billing_evidence_objects AS evidence
    ON evidence.id = '30000000-0000-0000-0000-000000000904'
  WHERE execution.idempotency_key = 'upgrade-evidence-replay-0001'`;

async function prepareLegacyEvidenceReplayFixture(container, execute) {
  await runChecked(
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
      phaseThreeMigrationHistorySql,
    ],
    "temporary Phase 3 migration hold",
    120000,
  );
  await runChecked(
    execute,
    "supabase",
    ["migration", "up", "--local", "--include-all"],
    "pre-cutover migration application",
  );
  await runChecked(
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
      `DELETE FROM supabase_migrations.schema_migrations
       WHERE version IN ('20260902000001', '20260902000002');
       ${legacyEvidenceReplayFixtureSql}`,
    ],
    "pre-cutover evidence replay fixture",
    120000,
  );
}

export function assertLegacyEvidenceReplaySnapshot(snapshot) {
  const expected = {
    replay_result: "duplicate",
    replay_reason_code: "DUPLICATE_COMMAND",
    principal_id: "30000000-0000-0000-0000-000000000902",
    request_fingerprint_exact: true,
    effect_fingerprint_exact: true,
    evidence_status: "clean",
    evidence_principal_id: "30000000-0000-0000-0000-000000000902",
  };
  if (canonicalFingerprint(snapshot) !== canonicalFingerprint(expected)) {
    throw new Error(
      `legacy evidence replay binding changed across cutover: ${JSON.stringify(snapshot)}`,
    );
  }
  return true;
}

export function assertLegacyIssueDateAbortSnapshot(snapshot) {
  const expected = {
    fixture_issue_date_is_null: true,
    currency_policy_table_present: false,
    currency_policy_seed_present: false,
    canonical_integer_function_present: false,
    exact_column_present: false,
    exact_save_rpc_present: false,
    exact_primitives_migration_recorded: false,
    exact_billing_migration_recorded: false,
  };
  if (canonicalFingerprint(snapshot) !== canonicalFingerprint(expected)) {
    throw new Error(
      `legacy NULL issue-date abort left partial mutation: ${JSON.stringify(snapshot)}`,
    );
  }
  return true;
}

async function proveLegacyIssueDateAbort(container, execute) {
  const fixture = await queryJson(
    container,
    `SELECT pg_catalog.jsonb_build_object(
       'id', invoice.id::text,
       'issue_date', invoice.issue_date::text
     )
     FROM public.invoices AS invoice
     WHERE invoice.issue_date IS NOT NULL
     ORDER BY invoice.id
     LIMIT 1`,
    "legacy_null_issue_date_fixture_source",
    execute,
  );
  if (
    typeof fixture.id !== "string" ||
    !/^[1-9][0-9]*$/.test(fixture.id) ||
    typeof fixture.issue_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fixture.issue_date)
  ) {
    throw new Error("legacy NULL issue-date fixture source is invalid");
  }

  await runChecked(
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
      `BEGIN;
       SET LOCAL session_replication_role = replica;
       UPDATE public.invoices SET issue_date = NULL WHERE id = ${fixture.id};
       COMMIT`,
    ],
    "pre-Phase-3 NULL issue-date fixture",
    120000,
  );

  await runExpectedFailure(
    execute,
    "supabase",
    ["migration", "up", "--local"],
    "legacy NULL issue-date cutover",
    "EXACT_BILLING_LEGACY_ISSUE_DATE_REQUIRED",
  );

  const abortSnapshot = await queryJson(
    container,
    `CREATE OR REPLACE FUNCTION pg_temp.phase_three_currency_policy_seed_present()
     RETURNS boolean
     LANGUAGE plpgsql
     SET search_path = ''
     AS $function$
     DECLARE
       seed_present boolean;
     BEGIN
       IF pg_catalog.to_regclass('public.financial_currency_policies') IS NULL THEN
         RETURN false;
       END IF;
       EXECUTE $query$
         SELECT EXISTS (
           SELECT 1
           FROM public.financial_currency_policies
           WHERE policy_version = 'usd-v1'
             AND currency = 'USD'
             AND exponent = 2
         )
       $query$ INTO seed_present;
       RETURN seed_present;
     END;
     $function$;
     SELECT pg_catalog.jsonb_build_object(
       'fixture_issue_date_is_null', (
         SELECT invoice.issue_date IS NULL
         FROM public.invoices AS invoice
         WHERE invoice.id = ${fixture.id}
       ),
       'currency_policy_table_present', pg_catalog.to_regclass(
         'public.financial_currency_policies'
       ) IS NOT NULL,
       'currency_policy_seed_present',
         pg_temp.phase_three_currency_policy_seed_present(),
       'canonical_integer_function_present', pg_catalog.to_regprocedure(
         'private.financial_canonical_integer_text(jsonb,boolean)'
       ) IS NOT NULL,
       'exact_column_present', EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'invoices'
           AND column_name = 'amount_minor'
       ),
       'exact_save_rpc_present', pg_catalog.to_regprocedure(
         'public.save_billing_invoice_exact(jsonb)'
       ) IS NOT NULL,
       'exact_primitives_migration_recorded', EXISTS (
         SELECT 1 FROM supabase_migrations.schema_migrations
         WHERE version = '20260902000001'
       ),
       'exact_billing_migration_recorded', EXISTS (
         SELECT 1 FROM supabase_migrations.schema_migrations
         WHERE version = '20260902000002'
       )
     )`,
    "legacy_null_issue_date_abort",
    execute,
  );
  assertLegacyIssueDateAbortSnapshot(abortSnapshot);

  await runChecked(
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
      `BEGIN;
       SET LOCAL session_replication_role = replica;
       UPDATE public.invoices
       SET issue_date = DATE '${fixture.issue_date}'
       WHERE id = ${fixture.id} AND issue_date IS NULL;
       COMMIT`,
    ],
    "legacy issue-date fixture restoration",
    120000,
  );

  const restoredFixture = await queryJson(
    container,
    `SELECT pg_catalog.jsonb_build_object(
       'id', invoice.id::text,
       'issue_date', invoice.issue_date::text
     )
     FROM public.invoices AS invoice
     WHERE invoice.id = ${fixture.id}`,
    "legacy_issue_date_fixture_restored",
    execute,
  );
  if (
    restoredFixture.id !== fixture.id ||
    restoredFixture.issue_date !== fixture.issue_date
  ) {
    throw new Error("legacy issue-date fixture was not restored exactly");
  }

  return true;
}

async function verifyLegacyEvidenceReplayFixture(container, execute) {
  const replay = await queryJson(
    container,
    `SET request.jwt.claim.sub TO '30000000-0000-0000-0000-000000000900';
     SET request.jwt.claims TO
       '{"sub":"30000000-0000-0000-0000-000000000900","role":"authenticated"}';
     SET ROLE authenticated;
     SELECT public.finalize_billing_evidence_inspection(
       '30000000-0000-0000-0000-000000000904',
       '30000000-0000-0000-0000-000000000903',
       'upgrade-scanner', 'upgrade-fixture-v1', 'clean', 'SCAN_CLEAN',
       'upgrade-evidence-replay-0001'
     );
     RESET ROLE`,
    "legacy_evidence_replay_result",
    execute,
  );
  const inspection = await queryJson(
    container,
    legacyEvidenceReplayVerificationQuery,
    "legacy_evidence_replay_binding",
    execute,
  );
  return assertLegacyEvidenceReplaySnapshot({
    replay_result: replay.result,
    replay_reason_code: replay.reason_code,
    ...inspection,
  });
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

async function captureFingerprintValues(container, execute) {
  const values = {};
  for (const category of categoryNames) {
    values[category] = await queryJson(
      container,
      fingerprintQueries[category],
      category,
      execute,
    );
  }
  return values;
}

function hashFingerprintValues(values) {
  return Object.fromEntries(
    categoryNames.map((category) => [
      category,
      hashFingerprint(values[category]),
    ]),
  );
}

export async function captureFingerprints(container, execute = executeProcess) {
  return hashFingerprintValues(
    await captureFingerprintValues(container, execute),
  );
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

async function captureCrmInformationalSemantics(container, execute) {
  return hashFingerprint(
    await queryJson(
      container,
      crmInformationalSemanticQuery,
      "crm_informational_semantics",
      execute,
    ),
  );
}

function assertSemanticInvariants({
  before,
  after,
  postUpgrade,
  beforeCrm,
  afterCrm,
  exactResults,
  acceptedHistory,
  invariants,
}) {
  const results = {};
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
    crm_informational_payloads_preserved: () => beforeCrm === afterCrm,
    accepted_upgrade_history_immutable: () => acceptedHistory === true,
    ...Object.fromEntries(
      Object.entries(exactResults).map(([invariant, passed]) => [
        invariant,
        () => passed === true,
      ]),
    ),
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
  for (const category of categoryNames) {
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
  verifyAcceptedUpgradeArtifacts();
  await verifyBaseline({ baselineDirectory });
  const container = await resolveDatabaseContainer(execute);
  await prepareBaseline(container, execute);
  const beforeValues = await captureFingerprintValues(container, execute);
  const before = hashFingerprintValues(beforeValues);
  const beforeSemantics = await captureInvoiceSemantics(container, execute);
  const beforeCrm = await captureCrmInformationalSemantics(container, execute);
  const expected = loadUpgradeExpectation();
  const expectedUpgrade = loadTransformationRegistries({
    baselineExpected: expected,
  });
  assertFingerprintShape(expectedUpgrade.categories, "expected");
  for (const category of categoryNames) {
    if (before[category] !== expectedUpgrade.categories[category]) {
      throw new Error(
        `upgrade fingerprint mismatch before: ${category} ` +
          `(expected ${expectedUpgrade.categories[category]}, received ${before[category]})`,
      );
    }
  }
  await prepareLegacyEvidenceReplayFixture(container, execute);
  const legacyIssueDatePreflightAtomic = await proveLegacyIssueDateAbort(
    container,
    execute,
  );
  await runChecked(
    execute,
    "supabase",
    ["migration", "up", "--local"],
    "pending migration application",
  );
  const legacyEvidenceReplayPreserved = await verifyLegacyEvidenceReplayFixture(
    container,
    execute,
  );
  const afterValues = await captureFingerprintValues(container, execute);
  const after = hashFingerprintValues(afterValues);
  const afterSemantics = await captureInvoiceSemantics(container, execute);
  const afterCrm = await captureCrmInformationalSemantics(container, execute);
  const postUpgradeSemantics = await queryJson(
    container,
    postUpgradeSemanticQuery,
    "post_upgrade_semantics",
    execute,
  );
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
  const exactResults = expectedUpgrade.registry_ids.includes("003-exact-money")
    ? {
        ...assertExactUpgradeSnapshot(
          Object.fromEntries(
            exactUpgradeCategoryNames.map((category) => [
              category,
              afterValues[category],
            ]),
          ),
        ),
        legacy_evidence_replay_preserved: legacyEvidenceReplayPreserved,
        legacy_issue_date_preflight_atomic: legacyIssueDatePreflightAtomic,
      }
    : {};
  const semanticInvariants = assertSemanticInvariants({
    before: beforeSemantics,
    after: afterSemantics,
    postUpgrade: postUpgradeSemantics,
    beforeCrm,
    afterCrm,
    exactResults,
    acceptedHistory: true,
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
