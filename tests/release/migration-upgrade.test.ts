import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  PHASE3_BASELINE_CATEGORY_HASHES,
  PHASE3_EXACT_INVARIANTS,
  PHASE3_REQUIRED_TRANSFORMATIONS,
  canonicalFingerprint,
  compareFingerprintSets,
  loadTransformationRegistries,
  loadUpgradeExpectation,
  validateExactUpgradeSnapshot,
  validateTransformationRegistries,
  verifyImmutableUpgradeInputs,
} from "../../scripts/release/fingerprint-upgrade.mjs";

const categories = [
  "row_identity_counts",
  "ownership_foreign_keys",
  "invoice_numeric_text",
  "row_payload_hashes",
  "constraint_definitions",
  "grant_matrix",
  "queryability",
];
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

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
  const transformations = Object.fromEntries(
    PHASE3_REQUIRED_TRANSFORMATIONS.map((category) => [
      category,
      {
        migration: "20260902000002",
        before_sha256:
          category === "row_payload_hashes"
            ? HASH_B
            : (PHASE3_BASELINE_CATEGORY_HASHES[category] ?? HASH_A),
        after_sha256: HASH_C,
      },
    ]),
  );

  return {
    version: "1.0.0",
    registry_id: "003-exact-money",
    sequence: 3,
    baseline_id: "001-pre-financial",
    migrations: ["20260902000001", "20260902000002"],
    transformations,
    semantic_invariants: [...PHASE3_EXACT_INVARIANTS],
    ...overrides,
  };
}

function exactUpgradeSnapshot() {
  return {
    invoice_values: [
      {
        id: "6001",
        amount_minor: "10888",
        currency: "USD",
        tax_rate_numerator: "71",
        tax_rate_denominator: "800",
        submitted_percentage: "8.875%",
        rate_policy_version: "ordinary-percentage-v1",
        tax_amount_minor: "966",
        total_amount_minor: "11854",
        rounding_policy_version: "half-away-from-zero-v1",
      },
    ],
    line_items: [
      {
        invoice_id: "6001",
        quantity_ratio: { numerator: "1", denominator: "1" },
        unit_price: { amount_minor: "10888", currency: "USD" },
        extended_amount: { amount_minor: "10888", currency: "USD" },
        currency_policy_version: "usd-v1",
        rounding_policy_version: "half-away-from-zero-v1",
      },
    ],
    automation: {
      negative_amount_count: "0",
      invalid_request_fingerprint_count: "0",
      invalid_effect_fingerprint_count: "0",
    },
    evidence: {
      exact_helper_dependency: true,
      canonical_zero_dependency: true,
      old_numeric_signature_count: "0",
    },
    invoice_rpcs: {
      locked_function_count: "3",
      dynamic_sql_function_count: "0",
    },
    invoice_acl: {
      authenticated_table_privilege_count: "0",
      authenticated_sequence_privilege_count: "0",
      anonymous_table_privilege_count: "0",
    },
    tax_rate_compatibility: {
      data_type: "numeric",
      numeric_precision: "12",
      numeric_scale: "9",
      out_of_bounds_count: "0",
      derived_mismatch_count: "0",
      samples: [
        {
          submitted_percentage: "8.875%",
          numerator: "71",
          denominator: "800",
          compatibility: "8.875000000",
        },
        {
          submitted_percentage: "12.500%",
          numerator: "1",
          denominator: "8",
          compatibility: "12.500000000",
        },
      ],
    },
    unrelated_crm: {
      before_sha256: HASH_A,
      after_sha256: HASH_A,
    },
  };
}

describe("representative upgrade fingerprints", () => {
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

  it("accepts only the closed exact-money registry vocabulary", () => {
    const result = validateTransformationRegistries({
      baselineExpected: baselineExpected(),
      registries: [transformationRegistry(), exactTransformationRegistry()],
    });

    expect(Object.keys(result.transformations).sort()).toEqual(
      [
        ...new Set(["row_payload_hashes", ...PHASE3_REQUIRED_TRANSFORMATIONS]),
      ].sort(),
    );
    expect(result.semantic_invariants).toEqual(
      expect.arrayContaining(PHASE3_EXACT_INVARIANTS),
    );
    expect(result.migrations).toEqual([
      "20260901000001",
      "20260901000002",
      "20260902000001",
      "20260902000002",
    ]);
  });

  it("rejects missing, reordered, overlapping, or broadened exact transforms", () => {
    const missing = exactTransformationRegistry();
    delete (missing.transformations as Record<string, unknown>)[
      "exact_evidence_finalization"
    ];
    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [transformationRegistry(), missing],
      }),
    ).toThrow(/missing exact transformation/i);

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
              ...(exactTransformationRegistry().transformations as Record<
                string,
                unknown
              >),
              queryability: {
                migration: "20260902000002",
                before_sha256: HASH_A,
                after_sha256: HASH_C,
              },
            },
          }),
        ],
      }),
    ).toThrow(/unexpected exact transformation.*queryability/i);

    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [
          transformationRegistry(),
          exactTransformationRegistry({ allow_unrelated_crm_changes: true }),
        ],
      }),
    ).toThrow(/unknown registry field/i);
  });

  it("rejects stale exact hashes, missing invariants, and new financial versions", () => {
    const stale = exactTransformationRegistry();
    (
      stale.transformations as Record<string, { before_sha256: string }>
    ).row_payload_hashes.before_sha256 = HASH_A;
    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [transformationRegistry(), stale],
      }),
    ).toThrow(/stale transformation hash.*row_payload_hashes/i);

    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [
          transformationRegistry(),
          exactTransformationRegistry({
            semantic_invariants: PHASE3_EXACT_INVARIANTS.slice(1),
          }),
        ],
      }),
    ).toThrow(/missing exact semantic invariant/i);

    expect(() =>
      validateTransformationRegistries({
        baselineExpected: baselineExpected(),
        registries: [
          transformationRegistry(),
          exactTransformationRegistry({
            migrations: ["20260902000001", "20260902000002", "20260902000003"],
          }),
        ],
      }),
    ).toThrow(/exact migration set/i);
  });

  it("validates exact string snapshots and fixed-nine tax compatibility", () => {
    expect(validateExactUpgradeSnapshot(exactUpgradeSnapshot())).toBe(true);

    const numericToken = exactUpgradeSnapshot();
    (numericToken.invoice_values[0] as Record<string, unknown>).amount_minor =
      10888;
    expect(() => validateExactUpgradeSnapshot(numericToken)).toThrow(
      /string financial token/i,
    );

    const wrongScale = exactUpgradeSnapshot();
    wrongScale.tax_rate_compatibility.samples[0].compatibility = "8.875";
    expect(() => validateExactUpgradeSnapshot(wrongScale)).toThrow(
      /fixed nine-decimal/i,
    );

    const wrongRatio = exactUpgradeSnapshot();
    wrongRatio.tax_rate_compatibility.samples[1].denominator = "10";
    expect(() => validateExactUpgradeSnapshot(wrongRatio)).toThrow(
      /canonical ratio derivation/i,
    );
  });

  it("pins every immutable exact-upgrade input by SHA-256", () => {
    expect(verifyImmutableUpgradeInputs()).toBe(true);
    expect(() =>
      verifyImmutableUpgradeInputs({
        readFile: (path: string) =>
          path.endsWith("20260901000004_billing_evidence_security.sql")
            ? Buffer.from("mutated")
            : fs.readFileSync(path),
      }),
    ).toThrow(/immutable upgrade input differs.*20260901000004/i);
  });

  it("keeps exact fingerprints free of JavaScript numeric coercion", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../scripts/release/fingerprint-upgrade.mjs"),
      "utf8",
    );
    expect(source).not.toMatch(/\bNumber\s*\(|\bparseFloat\s*\(/);
    expect(canonicalFingerprint(exactUpgradeSnapshot())).toContain(
      '"compatibility":"8.875000000"',
    );
  });
});
