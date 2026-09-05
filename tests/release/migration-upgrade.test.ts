import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  acceptedUpgradeArtifactDigests,
  assertAcceptedUpgradeArtifactDigests,
  assertExactUpgradeSnapshot,
  assertLegacyEvidenceReplaySnapshot,
  assertLegacyIssueDateAbortSnapshot,
  canonicalFingerprint,
  compareFingerprintSets,
  exactUpgradeCategoryNames,
  exactUpgradeInvariantNames,
  loadTransformationRegistries,
  loadUpgradeExpectation,
  validateTransformationRegistries,
  verifyAcceptedUpgradeArtifacts,
} from "../../scripts/release/fingerprint-upgrade.mjs";

const categories = [
  "row_identity_counts",
  "ownership_foreign_keys",
  "invoice_numeric_text",
  "row_payload_hashes",
  "constraint_definitions",
  "grant_matrix",
  "queryability",
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
];
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function fingerprintSet(hash = HASH_A) {
  return Object.fromEntries(categories.map((category) => [category, hash]));
}

function transformationRegistry(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: "1.0.0",
    registry_id: "002-billing-tenancy",
    sequence: 2,
    baseline_id: "001-pre-financial",
    migrations: ["20260901000001", "20260901000002"],
    transformations: {
      row_payload_hashes: {
        migration: "20260901000002",
        before_sha256: HASH_A,
        after_sha256: HASH_B,
      },
    },
    semantic_invariants: [
      "invoice_count_preserved",
      "invoice_tenant_keys_complete",
    ],
    ...overrides,
  };
}

function baselineExpected() {
  return {
    baseline_id: "001-pre-financial",
    categories: fingerprintSet(),
    transformations: {},
  };
}

function exactTransformationRegistry(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: "1.0.0",
    registry_id: "003-exact-money",
    sequence: 3,
    baseline_id: "001-pre-financial",
    migrations: ["20260902000001", "20260902000002"],
    transformations: Object.fromEntries(
      exactUpgradeCategoryNames.map((category) => [
        category,
        {
          migration: "20260902000002",
          before_sha256: HASH_A,
          after_sha256: HASH_B,
        },
      ]),
    ),
    semantic_invariants: [...exactUpgradeInvariantNames],
    ...overrides,
  };
}

function exactUpgradeSnapshot() {
  return {
    invoice_exact_values: [
      {
        id: "6002",
        amount_minor: "1234567",
        currency: "USD",
        currency_policy_version: "usd-v1",
        tax_rate_kind: "ordinary_percentage",
        tax_rate_numerator: "33",
        tax_rate_denominator: "400",
        submitted_percentage: "8.250%",
        rate_policy_version: "ordinary-percentage-v1",
        tax_amount_minor: "101852",
        total_amount_minor: "1336419",
        rounding_policy_version: "half-away-from-zero-v1",
      },
    ],
    invoice_exact_line_items: [
      {
        invoice_id: "6001",
        items: [
          {
            quantity_ratio: { numerator: "1", denominator: "1" },
            unit_price: { amount_minor: "1", currency: "USD" },
            extended_amount: { amount_minor: "1", currency: "USD" },
            currency_policy_version: "usd-v1",
            rounding_policy_version: "half-away-from-zero-v1",
          },
        ],
      },
    ],
    automation_exact_values: {
      grants: [
        {
          id: "20000000-0000-0000-0000-000000000001",
          max_amount_minor: "2500",
          total_amount_consumed_minor: "0",
          currency: "USD",
        },
      ],
      executions: [
        {
          id: "30000000-0000-0000-0000-000000000001",
          amount_minor: "0",
          currency: "USD",
        },
      ],
    },
    automation_request_effect_fingerprints: {
      algorithm: "sha256",
      executions: [
        {
          id: "30000000-0000-0000-0000-000000000001",
          request_fingerprint: "a".repeat(64),
          effect_fingerprint: "b".repeat(64),
        },
      ],
    },
    evidence_finalization_exact: {
      private_identity:
        "private.billing_finalize_evidence_inspection(uuid,uuid,text,text,text,text,text)",
      public_identity:
        "public.finalize_billing_evidence_inspection(uuid,uuid,text,text,text,text,text)",
      exact_automation_identity:
        "private.billing_consume_automation_grant(uuid,uuid,text,text,text,text,jsonb,text,jsonb)",
      exact_zero: { amount_minor: "0", currency: "USD" },
      numeric_signature_present: false,
    },
    invoice_rpc_contracts: [
      {
        identity: "public.read_billing_invoices_exact(jsonb)",
        security_definer: true,
        search_path: "",
        caller_capability: "invoice.read",
        dynamic_sql: false,
      },
      {
        identity: "public.read_billing_invoices_legacy_compat(jsonb)",
        security_definer: true,
        search_path: "",
        caller_capability: "invoice.read",
        dynamic_sql: false,
      },
      {
        identity: "public.save_billing_invoice_exact(jsonb)",
        security_definer: true,
        search_path: "",
        caller_capability: "invoice.update",
        dynamic_sql: false,
      },
    ],
    invoice_acl_contract: {
      authenticated_invoice_privileges: [],
      authenticated_sequence_privileges: [],
      public_or_anon_rpc_execute: [],
      authenticated_rpc_execute: [
        "read_billing_invoices_exact(jsonb)",
        "read_billing_invoices_legacy_compat(jsonb)",
        "save_billing_invoice_exact(jsonb)",
      ],
    },
    exact_billing_constraints: [
      {
        table: "invoices",
        name: "invoices_issue_date_not_null",
        definition: "NOT NULL",
      },
      {
        table: "invoices",
        name: "invoices_tax_rate_compatibility_check",
        definition:
          "CHECK (((tax_rate >= 0::numeric) AND (tax_rate <= 100::numeric)))",
      },
    ],
    exact_billing_counts_ids: {
      invoices: { count: "4", ids: ["6001", "6002", "6003", "6004"] },
      billing_automation_grants: {
        count: "1",
        ids: ["20000000-0000-0000-0000-000000000001"],
      },
      billing_automation_executions: {
        count: "1",
        ids: ["30000000-0000-0000-0000-000000000001"],
      },
    },
    money_compatibility: {
      money_type: "numeric(19,2)",
      tax_rate_type: "numeric(12,9)",
      tax_rate_range: "0..100",
      values: [
        {
          submitted_percentage: "8.875%",
          numerator: "71",
          denominator: "800",
          compatibility_percentage: "8.875000000",
        },
        {
          submitted_percentage: "12.500%",
          numerator: "1",
          denominator: "8",
          compatibility_percentage: "12.500000000",
        },
      ],
    },
  };
}

describe("representative upgrade fingerprints", () => {
  it("classifies legacy NULL issue dates before any exact cutover mutation", () => {
    const valid = {
      fixture_issue_date_is_null: true,
      currency_policy_table_present: false,
      currency_policy_seed_present: false,
      canonical_integer_function_present: false,
      exact_column_present: false,
      exact_save_rpc_present: false,
      exact_primitives_migration_recorded: false,
      exact_billing_migration_recorded: false,
    };

    expect(assertLegacyIssueDateAbortSnapshot(valid)).toBe(true);
    expect(() =>
      assertLegacyIssueDateAbortSnapshot({
        ...valid,
        exact_primitives_migration_recorded: true,
      }),
    ).toThrow("legacy NULL issue-date abort left partial mutation");
    expect(() =>
      assertLegacyIssueDateAbortSnapshot({
        ...valid,
        currency_policy_seed_present: true,
      }),
    ).toThrow("legacy NULL issue-date abort left partial mutation");
  });

  it("fails closed unless a legacy evidence execution keeps its active identity and exact effect", () => {
    const valid = {
      replay_result: "duplicate",
      replay_reason_code: "DUPLICATE_COMMAND",
      principal_id: "30000000-0000-0000-0000-000000000902",
      request_fingerprint_exact: true,
      effect_fingerprint_exact: true,
      evidence_status: "clean",
      evidence_principal_id: "30000000-0000-0000-0000-000000000902",
    };

    expect(assertLegacyEvidenceReplaySnapshot(valid)).toBe(true);
    expect(() =>
      assertLegacyEvidenceReplaySnapshot({
        ...valid,
        principal_id: "30000000-0000-0000-0000-000000000901",
      }),
    ).toThrow("legacy evidence replay binding changed across cutover");
    expect(() =>
      assertLegacyEvidenceReplaySnapshot({
        ...valid,
        effect_fingerprint_exact: false,
      }),
    ).toThrow("legacy evidence replay binding changed across cutover");
  });

  it("uses the additive PostgreSQL 17 expectation over the immutable source baseline", () => {
    const expectation = loadUpgradeExpectation();
    expect(expectation).toMatchObject({
      version: "1.0.0",
      baseline_id: "002-pre-financial-pg17",
    });
    expect(expectation.categories).toHaveProperty("grant_matrix");
    expect(
      loadTransformationRegistries({ baselineExpected: expectation }),
    ).toMatchObject({
      baseline_id: "002-pre-financial-pg17",
      semantic_invariants: expect.arrayContaining([
        "invoice_business_facts_preserved",
        "billing_grants_least_privilege",
      ]),
    });
  });

  it("accepts exact before/after preservation", () => {
    expect(
      compareFingerprintSets({
        before: fingerprintSet(),
        after: fingerprintSet(),
        expected: {
          categories: fingerprintSet(),
          transformations: {},
        },
      }),
    ).toEqual(
      Object.fromEntries(
        categories.map((category) => [
          category,
          { before: HASH_A, after: HASH_A, preserved: true },
        ]),
      ),
    );
  });

  it.each(categories)("fails a targeted %s mutation", (category) => {
    const after = fingerprintSet();
    after[category] = HASH_B;

    expect(() =>
      compareFingerprintSets({
        before: fingerprintSet(),
        after,
        expected: {
          categories: fingerprintSet(),
          transformations: {},
        },
      }),
    ).toThrow(new RegExp(category));
  });

  it("preserves PostgreSQL numeric text without JavaScript conversion", () => {
    const value = [
      {
        id: "6003",
        amount: "9999999999999.99",
        tax_rate: "0.00",
        tax_amount: "0.00",
        total_amount: "9999999999999.99",
      },
      {
        id: "6001",
        amount: "0.01",
        tax_rate: "0.00",
        tax_amount: "0.00",
        total_amount: "0.01",
      },
    ];

    expect(canonicalFingerprint(value)).toContain("9999999999999.99");
    expect(canonicalFingerprint(value)).toContain('"amount":"0.01"');
  });

  it("accepts an ordered append-only transformation registry", () => {
    expect(
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [transformationRegistry()],
      }),
    ).toMatchObject({
      baseline_id: "001-pre-financial",
      transformations: {
        row_payload_hashes: {
          before_sha256: HASH_A,
          after_sha256: HASH_B,
        },
      },
      semantic_invariants: [
        "invoice_count_preserved",
        "invoice_tenant_keys_complete",
      ],
    });
  });

  it("rejects missing, unknown, and stale transformation fields", () => {
    const missingBefore = transformationRegistry({
      transformations: {
        row_payload_hashes: {
          migration: "20260901000002",
          after_sha256: HASH_B,
        },
      },
    });
    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [missingBefore],
      }),
    ).toThrow(/before_sha256/i);

    const unknownCategory = transformationRegistry({
      transformations: {
        unknown_financial_payload: {
          migration: "20260901000002",
          before_sha256: HASH_A,
          after_sha256: HASH_B,
        },
      },
    });
    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [unknownCategory],
      }),
    ).toThrow(/unknown.*category/i);

    const stale = transformationRegistry({
      transformations: {
        row_payload_hashes: {
          migration: "20260901000002",
          before_sha256: "c".repeat(64),
          after_sha256: HASH_B,
        },
      },
    });
    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [stale],
      }),
    ).toThrow(/stale.*row_payload_hashes/i);
  });

  it("rejects overlapping categories and out-of-order registries", () => {
    const second = transformationRegistry({
      registry_id: "003-more-billing",
      sequence: 3,
      migrations: ["20260901000003"],
      transformations: {
        row_payload_hashes: {
          migration: "20260901000003",
          before_sha256: HASH_B,
          after_sha256: "c".repeat(64),
        },
      },
    });

    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [transformationRegistry(), second],
      }),
    ).toThrow(/overlapping.*row_payload_hashes/i);

    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [second, transformationRegistry()],
      }),
    ).toThrow(/ordered/i);
  });

  it("rejects unknown semantic invariants and overbroad registry keys", () => {
    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [
          transformationRegistry({
            semantic_invariants: ["trust_the_migration"],
          }),
        ],
      }),
    ).toThrow(/unknown semantic invariant/i);

    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [transformationRegistry({ allow_all_changes: true })],
      }),
    ).toThrow(/unknown registry field/i);
  });

  it("pins the final Phase 2 constraint and grant state through the latest migration", () => {
    const registry = JSON.parse(
      fs.readFileSync(
        path.resolve(
          __dirname,
          "../../supabase/tests/upgrades/002-billing-tenancy/expected-transformations.json",
        ),
        "utf8",
      ),
    ) as {
      migrations: string[];
      transformations: Record<
        string,
        { after_sha256: string; migration: string }
      >;
    };

    expect(registry.migrations).toEqual([
      "20260901000001",
      "20260901000002",
      "20260901000003",
      "20260901000004",
      "20260901000005",
      "20260901000006",
      "20260901000007",
    ]);
    expect(registry.transformations.constraint_definitions).toEqual(
      expect.objectContaining({
        migration: "20260901000007",
        after_sha256:
          "95feed85ec36cc7908dde269f7867988074a8b04a1482c96c28e459dd96d1fc7",
      }),
    );
    expect(registry.transformations.grant_matrix).toEqual(
      expect.objectContaining({
        migration: "20260901000007",
        after_sha256:
          "452df1f7b5e97ef2879a734bcaf4d4778f6bb6363140e90e2f524a6c415a09f6",
      }),
    );
  });

  it("uses explicit Docker/psql argv and contains no remote or reversal mode", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../scripts/release/fingerprint-upgrade.mjs"),
      "utf8",
    );
    expect(source).toContain('"docker"');
    expect(source).toContain('"psql"');
    expect(source).not.toMatch(/--linked|migration\s+down|db\s+reset/i);
    expect(source).not.toMatch(/spawn\(["']psql["']/);
  });
});

describe("exact Phase 3 upgrade registry", () => {
  it("accepts the complete closed 003 vocabulary in order", () => {
    const expected = baselineExpected();
    const phaseTwo = transformationRegistry();
    const phaseThree = exactTransformationRegistry();

    expect(
      validateTransformationRegistries({
        baselineExpected: expected,
        registries: [phaseTwo, phaseThree],
      }),
    ).toMatchObject({
      registry_ids: ["002-billing-tenancy", "003-exact-money"],
      transformations: expect.objectContaining(
        Object.fromEntries(
          exactUpgradeCategoryNames.map((category) => [
            category,
            expect.objectContaining({
              migration: "20260902000002",
              before_sha256: HASH_A,
              after_sha256: HASH_B,
            }),
          ]),
        ),
      ),
      semantic_invariants: expect.arrayContaining(exactUpgradeInvariantNames),
    });
  });

  it("rejects missing, unrelated, reordered, stale, and mismatched 003 entries", () => {
    const transformations = exactTransformationRegistry()
      .transformations as Record<string, unknown>;
    const withoutInvoiceValues = { ...transformations };
    delete withoutInvoiceValues.invoice_exact_values;
    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [
          transformationRegistry(),
          exactTransformationRegistry({
            transformations: withoutInvoiceValues,
          }),
        ],
      }),
    ).toThrow(/missing exact transformation category: invoice_exact_values/i);

    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [
          transformationRegistry(),
          exactTransformationRegistry({
            transformations: {
              ...transformations,
              deal_amounts: {
                migration: "20260902000002",
                before_sha256: HASH_A,
                after_sha256: HASH_B,
              },
            },
          }),
        ],
      }),
    ).toThrow(/unknown exact transformation category: deal_amounts/i);

    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [
          transformationRegistry(),
          exactTransformationRegistry({
            migrations: ["20260902000002", "20260902000001"],
          }),
        ],
      }),
    ).toThrow(/migrations are not ordered/i);

    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [
          transformationRegistry(),
          exactTransformationRegistry({
            transformations: {
              ...transformations,
              invoice_exact_values: {
                migration: "20260902000002",
                before_sha256: "c".repeat(64),
                after_sha256: HASH_B,
              },
            },
          }),
        ],
      }),
    ).toThrow(/stale transformation hash: invoice_exact_values/i);

    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [
          transformationRegistry(),
          exactTransformationRegistry({
            transformations: {
              ...transformations,
              invoice_exact_values: {
                migration: "20260902000001",
                before_sha256: HASH_A,
                after_sha256: HASH_B,
              },
            },
          }),
        ],
      }),
    ).toThrow(/exact transformation migration is mismatched/i);
  });

  it("rejects missing, unknown, and overlapping exact semantic invariants", () => {
    const withoutAcl = exactUpgradeInvariantNames.filter(
      (invariant) => invariant !== "exact_invoice_acl_least_privilege",
    );
    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [
          transformationRegistry(),
          exactTransformationRegistry({
            semantic_invariants: withoutAcl,
          }),
        ],
      }),
    ).toThrow(
      /missing exact semantic invariant: exact_invoice_acl_least_privilege/i,
    );

    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [
          transformationRegistry(),
          exactTransformationRegistry({
            semantic_invariants: [
              ...exactUpgradeInvariantNames,
              "trust_the_cutover",
            ],
          }),
        ],
      }),
    ).toThrow(/unknown semantic invariant: trust_the_cutover/i);

    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [
          transformationRegistry(),
          exactTransformationRegistry({
            semantic_invariants: [
              ...exactUpgradeInvariantNames,
              exactUpgradeInvariantNames[0],
            ],
          }),
        ],
      }),
    ).toThrow(/overlapping semantic invariant/i);
  });
});

describe("exact Phase 3 semantic and history proof", () => {
  it("accepts canonical strings, exact wrappers, closed ACLs, and fixed compatibility", () => {
    expect(assertExactUpgradeSnapshot(exactUpgradeSnapshot())).toEqual({
      exact_invoice_values_canonical: true,
      exact_invoice_line_items_canonical: true,
      exact_automation_values_non_negative: true,
      exact_automation_fingerprints_canonical: true,
      exact_evidence_wrapper_replaced: true,
      exact_invoice_rpcs_caller_bound: true,
      exact_invoice_acl_least_privilege: true,
      exact_billing_constraints_valid: true,
      exact_billing_counts_ids_preserved: true,
      exact_money_compatibility_preserved: true,
      tax_rate_compatibility_exact: true,
    });
  });

  it("rejects numeric coercion, negative automation, wrapper drift, and privilege widening", () => {
    const numericAmount = exactUpgradeSnapshot();
    numericAmount.invoice_exact_values[0].amount_minor = 1234567 as never;
    expect(() => assertExactUpgradeSnapshot(numericAmount)).toThrow(
      /amount_minor must be canonical PostgreSQL text/i,
    );

    const negativeAutomation = exactUpgradeSnapshot();
    negativeAutomation.automation_exact_values.grants[0].max_amount_minor =
      "-1";
    expect(() => assertExactUpgradeSnapshot(negativeAutomation)).toThrow(
      /automation values must be non-negative/i,
    );

    const numericSignature = exactUpgradeSnapshot();
    numericSignature.evidence_finalization_exact.numeric_signature_present = true;
    expect(() => assertExactUpgradeSnapshot(numericSignature)).toThrow(
      /numeric evidence automation signature remains/i,
    );

    const widenedAcl = exactUpgradeSnapshot();
    widenedAcl.invoice_acl_contract.authenticated_invoice_privileges.push(
      "SELECT",
    );
    expect(() => assertExactUpgradeSnapshot(widenedAcl)).toThrow(
      /authenticated invoice table privilege remains/i,
    );
  });

  it("rejects a nullable exact invoice issue date", () => {
    const nullableIssueDate = exactUpgradeSnapshot();
    nullableIssueDate.exact_billing_constraints =
      nullableIssueDate.exact_billing_constraints.map((constraint) =>
        constraint.name === "invoices_issue_date_not_null"
          ? { ...constraint, definition: "NULLABLE" }
          : constraint,
      );
    expect(() => assertExactUpgradeSnapshot(nullableIssueDate)).toThrow(
      /issue_date NOT NULL invariant is missing/i,
    );
  });

  it("rejects tax-rate narrowing, variable scale, ratio mismatch, lost evidence, and a new version", () => {
    const narrowType = exactUpgradeSnapshot();
    narrowType.money_compatibility.tax_rate_type = "numeric(5,2)";
    expect(() => assertExactUpgradeSnapshot(narrowType)).toThrow(
      /tax_rate must be numeric\(12,9\)/i,
    );

    const variableScale = exactUpgradeSnapshot();
    variableScale.money_compatibility.values[0].compatibility_percentage =
      "8.875";
    expect(() => assertExactUpgradeSnapshot(variableScale)).toThrow(
      /fixed nine-decimal scale/i,
    );

    const ratioMismatch = exactUpgradeSnapshot();
    ratioMismatch.money_compatibility.values[1].numerator = "2";
    expect(() => assertExactUpgradeSnapshot(ratioMismatch)).toThrow(
      /canonical reduced ratio mismatch/i,
    );

    const lostEvidence = exactUpgradeSnapshot();
    lostEvidence.money_compatibility.values[1].submitted_percentage = "12.5%";
    expect(() => assertExactUpgradeSnapshot(lostEvidence)).toThrow(
      /submitted 12\.500% evidence is missing/i,
    );

    const newVersion = exactUpgradeSnapshot();
    Object.assign(newVersion.money_compatibility.values[1], {
      financial_version: "rate-v2",
    });
    expect(() => assertExactUpgradeSnapshot(newVersion)).toThrow(
      /unknown compatibility field: financial_version/i,
    );
  });

  it("pins baseline 001, registry 002, and the three accepted Phase 2 migrations", () => {
    expect(verifyAcceptedUpgradeArtifacts()).toEqual(
      acceptedUpgradeArtifactDigests,
    );

    expect(() =>
      assertAcceptedUpgradeArtifactDigests({
        ...acceptedUpgradeArtifactDigests,
        "supabase/migrations/20260901000004_billing_evidence_security.sql":
          "f".repeat(64),
      }),
    ).toThrow(/accepted upgrade artifact differs.*20260901000004/i);
  });

  it("keeps exact fingerprint handling free of JavaScript numeric coercion", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../scripts/release/fingerprint-upgrade.mjs"),
      "utf8",
    );
    expect(source).not.toMatch(
      /\bNumber\s*\(|\bparseFloat\s*\(|\bparseInt\s*\(/,
    );
    expect(canonicalFingerprint(exactUpgradeSnapshot())).toContain(
      '"amount_minor":"1234567"',
    );
  });
});
