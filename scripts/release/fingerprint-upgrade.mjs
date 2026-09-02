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
const categoryNames = [
  "row_identity_counts",
  "ownership_foreign_keys",
  "invoice_numeric_text",
  "row_payload_hashes",
  "constraint_definitions",
  "grant_matrix",
  "queryability",
];
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
};

const invoiceSemanticQuery = `
  SELECT jsonb_build_object(
    'invoice_count', pg_catalog.count(*)::text,
    'numeric_values', COALESCE(
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
          'tax_rate', tax_rate::text,
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
      throw new Error(`upgrade fingerprint mismatch before: ${category}`);
    }
    const transformation = expected.transformations?.[category];
    const expectedAfter = transformation?.after_sha256 ?? before[category];
    if (transformation && transformation.before_sha256 !== before[category]) {
      throw new Error(`upgrade transformation mismatch: ${category}`);
    }
    if (after[category] !== expectedAfter) {
      throw new Error(`upgrade fingerprint mismatch after: ${category}`);
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
  }

  return {
    baseline_id: baselineExpected.baseline_id,
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
      `${deleteUsers}; DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION pg_database_owner;`,
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

export async function captureFingerprints(container, execute = executeProcess) {
  const fingerprints = {};
  for (const category of categoryNames) {
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

function assertSemanticInvariants({ before, after, postUpgrade, invariants }) {
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
  await verifyBaseline({ baselineDirectory });
  const container = await resolveDatabaseContainer(execute);
  await prepareBaseline(container, execute);
  const before = await captureFingerprints(container, execute);
  const beforeSemantics = await captureInvoiceSemantics(container, execute);
  const expected = JSON.parse(
    fs.readFileSync(
      path.join(baselineDirectory, "expected-fingerprints.json"),
      "utf8",
    ),
  );
  const expectedUpgrade = loadTransformationRegistries({
    baselineExpected: expected,
  });
  assertFingerprintShape(expectedUpgrade.categories, "expected");
  for (const category of categoryNames) {
    if (before[category] !== expectedUpgrade.categories[category]) {
      throw new Error(`upgrade fingerprint mismatch before: ${category}`);
    }
  }
  await runChecked(
    execute,
    "supabase",
    ["migration", "up", "--local"],
    "pending migration application",
  );
  const after = await captureFingerprints(container, execute);
  const afterSemantics = await captureInvoiceSemantics(container, execute);
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
  const semanticInvariants = assertSemanticInvariants({
    before: beforeSemantics,
    after: afterSemantics,
    postUpgrade: postUpgradeSemantics,
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
