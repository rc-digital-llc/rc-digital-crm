import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  canonicalFingerprint,
  compareFingerprintSets,
  loadUpgradeExpectation,
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

function fingerprintSet(hash = HASH_A) {
  return Object.fromEntries(categories.map((category) => [category, hash]));
}

describe("representative upgrade fingerprints", () => {
  it("uses the additive PostgreSQL 17 expectation over the immutable source baseline", () => {
    const expectation = loadUpgradeExpectation();
    expect(expectation).toMatchObject({
      version: "1.0.0",
      baseline_id: "002-pre-financial-pg17",
    });
    expect(expectation.categories).toHaveProperty("grant_matrix");
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
