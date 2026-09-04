import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const exactFinancialPattern = "src/components/atomic-crm/financial/**";
const exactFinancialPaths = [
  "src/components/atomic-crm/financial/exactMoney.ts",
  "src/components/atomic-crm/financial/exactMoney.test.ts",
  "src/components/atomic-crm/financial/exactFinancialFixtures.ts",
  "tests/release/exact-money-release-static.test.ts",
] as const;
const exactFastTests = [
  "src/components/atomic-crm/financial/exactMoney.test.ts",
  "tests/release/exact-money-release-static.test.ts",
] as const;
const inheritedFinancialIdentities = [
  "migration-clean",
  "migration-upgrade",
  "database-contracts",
  "edge-provider-contracts",
  "replay-concurrency",
  "release-security",
] as const;

const globExpression = (pattern: string) => {
  let expression = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      expression += ".*";
      index += 1;
    } else if (character === "*") {
      expression += "[^/]*";
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`^${expression}$`);
};

const extractFastTestBlock = (makefile: string) => {
  const match = makefile.match(
    /FINANCIAL_FAST_TESTS := \\\n([\s\S]*?)\n\n\.PHONY/,
  );
  return match?.[1] ?? "";
};

const couplingErrors = (patterns: string[], makefile: string) => {
  const errors: string[] = [];
  const expressions = patterns.map(globExpression);
  const fastTestBlock = extractFastTestBlock(makefile);

  if (!patterns.includes(exactFinancialPattern)) {
    errors.push("exact-financial-classifier");
  }
  for (const filename of exactFinancialPaths) {
    if (!expressions.some((expression) => expression.test(filename))) {
      errors.push(`unclassified:${filename}`);
    }
  }
  for (const filename of exactFastTests) {
    if (!fastTestBlock.includes(filename)) {
      errors.push(`fast-test:${filename}`);
    }
  }
  if (
    !/test-financial-fast:[^\n]*\n\tnpm test -- --run \$\(FINANCIAL_FAST_TESTS\)/.test(
      makefile,
    ) ||
    /test-financial-fast:[\s\S]*?(?:\|\|\s*true|continue-on-error)/.test(
      makefile.slice(0, makefile.indexOf("\ninstall:")),
    )
  ) {
    errors.push("fast-test-optional");
  }

  return errors;
};

describe("Phase 3 exact-money release coupling", () => {
  const pathConfiguration = JSON.parse(
    readSource(".github/release/financial-paths.json"),
  ) as { financial_paths: string[] };
  const makefile = readSource("makefile");

  it("classifies every Wave 1 exact-money path and runs both exact tests in the protected fast target", () => {
    expect(couplingErrors(pathConfiguration.financial_paths, makefile)).toEqual(
      [],
    );
  });

  it("detects removal from either the classifier or protected fast target", () => {
    const acceptedPatterns = [
      ...pathConfiguration.financial_paths,
      exactFinancialPattern,
    ];
    const acceptedMakefile = exactFastTests.reduce((source, filename) => {
      if (extractFastTestBlock(source).includes(filename)) {
        return source;
      }
      return source.replace(
        "FINANCIAL_FAST_TESTS := \\\n",
        `FINANCIAL_FAST_TESTS := \\\n\t${filename} \\\n`,
      );
    }, makefile);
    const withoutClassifier = acceptedPatterns.filter(
      (pattern) => pattern !== exactFinancialPattern,
    );
    const withoutUnitTest = acceptedMakefile.replace(
      `\t${exactFastTests[0]} \\\n`,
      "",
    );
    const withoutStaticTest = acceptedMakefile.replace(
      `\t${exactFastTests[1]} \\\n`,
      "",
    );

    expect(couplingErrors(withoutClassifier, acceptedMakefile)).toContain(
      "exact-financial-classifier",
    );
    expect(couplingErrors(acceptedPatterns, withoutUnitTest)).toContain(
      `fast-test:${exactFastTests[0]}`,
    );
    expect(couplingErrors(acceptedPatterns, withoutStaticTest)).toContain(
      `fast-test:${exactFastTests[1]}`,
    );
  });

  it("preserves the six inherited merge-group financial identities without a replacement lane", () => {
    const workflow = readSource(".github/workflows/financial-release-gate.yml");
    const jobBlocks = workflow.split(/^ {2}(?=[a-z][a-z-]+:)/m);
    const requiredJobs = jobBlocks.filter((block) =>
      /name:\s*financial \/ [a-z-]+\s*$/m.test(block),
    );

    expect(requiredJobs).toHaveLength(6);
    for (const identity of inheritedFinancialIdentities) {
      const job = requiredJobs.find((block) =>
        block.includes(`name: financial / ${identity}`),
      );
      expect(job, identity).toBeDefined();
      expect(job).toContain("github.event_name == 'merge_group'");
      expect(job).not.toMatch(/continue-on-error|retry/i);
    }
  });
});
