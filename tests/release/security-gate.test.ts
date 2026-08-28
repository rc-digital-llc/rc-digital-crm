import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertDependencyAudit,
  assertSecretScanResult,
  assertWorkflowDecoupled,
  buildGitleaksArgs,
  scanBundleTree,
  summarizeFindings,
  validateGitleaksConfig,
  validateGitleaksIgnore,
} from "../../scripts/release/security-gate.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const provenLocalSecretFingerprints = [
  "89d87d9fcbdf0de7bdc3588bc9e9f74f69397cc9:supabase/functions/.env.development:generic-api-key:11",
  "9844ac900acc43e94dc6afa7c1b534524528dcff:supabase/functions/.env.development:generic-api-key:11",
];

const syntheticFinding = {
  RuleID: "generic-api-key",
  Description: "synthetic committed credential",
  File: "tests/fixtures/committed-secret.txt",
  StartLine: 1,
  Commit: "0123456789abcdef",
  Fingerprint:
    "0123456789abcdef:tests/fixtures/committed-secret.txt:generic-api-key:1",
  Match: "api_key=fixture-super-secret-value",
  Secret: "fixture-super-secret-value",
};

describe("release security secret gate", () => {
  it("builds fully redacted history and current-tree scanner argv", () => {
    expect(
      buildGitleaksArgs({
        mode: "history",
        target: "/repo",
        reportPath: "/reports/history.json",
        configPath: "/repo/.gitleaks.toml",
        ignorePath: "/repo/.gitleaksignore",
      }),
    ).toEqual([
      "git",
      "--redact=100",
      "--no-banner",
      "--no-color",
      "--log-level",
      "error",
      "--config",
      "/repo/.gitleaks.toml",
      "--gitleaks-ignore-path",
      "/repo/.gitleaksignore",
      "--report-format",
      "json",
      "--report-path",
      "/reports/history.json",
      "/repo",
    ]);

    expect(
      buildGitleaksArgs({
        mode: "current",
        target: "/snapshot",
        reportPath: "/reports/current.json",
        configPath: "/repo/.gitleaks.toml",
        ignorePath: "/repo/.gitleaksignore",
      })[0],
    ).toBe("dir");
  });

  it("summarizes findings without retaining secret or match values", () => {
    const summary = summarizeFindings([syntheticFinding]);
    const serialized = JSON.stringify(summary);

    expect(summary.findings).toEqual([
      {
        rule_id: "generic-api-key",
        file: "tests/fixtures/committed-secret.txt",
        commit: "0123456789abcdef",
        fingerprint:
          "0123456789abcdef:tests/fixtures/committed-secret.txt:generic-api-key:1",
      },
    ]);
    expect(serialized).not.toContain("fixture-super-secret-value");
    expect(serialized).not.toContain("Match");
    expect(serialized).not.toContain("Secret");
  });

  it("rejects broad path, regex, commit, and stopword allowlists", () => {
    const unsafeConfigs = [
      "[allowlist]\npaths = ['''.*''']",
      "[[allowlists]]\npaths = ['''^\\.env''']",
      "[[allowlists]]\nregexes = ['''token''']",
      "[[allowlists]]\ncommits = ['0123456789abcdef']",
      "[[allowlists]]\nstopwords = ['secret']",
    ];

    for (const config of unsafeConfigs) {
      expect(() => validateGitleaksConfig(config)).toThrow(/allowlist/i);
    }
    expect(() =>
      validateGitleaksConfig(
        'title = "RC Digital release scan"\n[extend]\nuseDefault = true',
      ),
    ).not.toThrow();
  });

  it("pins only the two value-blind proven local Supabase secret fingerprints", () => {
    const ignoreText = fs.readFileSync(
      path.join(repositoryRoot, ".gitleaksignore"),
      "utf8",
    );
    const entries = validateGitleaksIgnore(ignoreText);

    expect(entries).toEqual(
      expect.arrayContaining(provenLocalSecretFingerprints),
    );
    expect(() =>
      validateGitleaksIgnore(
        `${ignoreText}\n0123456789abcdef0123456789abcdef01234567:unsafe.env:generic-api-key:1\n`,
      ),
    ).toThrow(/differs from reviewed policy/i);
  });

  it("keeps a synthetic committed secret blocking with a redacted rotation id", () => {
    expect(() =>
      assertSecretScanResult({
        mode: "history",
        exitCode: 1,
        findings: [syntheticFinding],
      }),
    ).toThrow(/rotation_required=[a-f0-9]{64}/);

    try {
      assertSecretScanResult({
        mode: "history",
        exitCode: 1,
        findings: [syntheticFinding],
      });
    } catch (error) {
      expect(String(error)).not.toContain("fixture-super-secret-value");
    }
  });
});

describe("release security dependency, bundle, and coupling gates", () => {
  it("rejects a high production advisory without exposing advisory detail", () => {
    const audit = {
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 },
      },
      vulnerabilities: {
        fixture: {
          severity: "high",
          via: [{ title: "fixture-exploit-detail-must-not-appear" }],
        },
      },
    };

    expect(() => assertDependencyAudit(audit)).toThrow(/dependencies.*high=1/i);
    try {
      assertDependencyAudit(audit);
    } catch (error) {
      expect(String(error)).not.toContain(
        "fixture-exploit-detail-must-not-appear",
      );
    }
  });

  it("rejects a source map and secret marker as separate bundle failures", () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "rc-security-gate-test-"),
    );
    try {
      const mapPath = path.join(temporaryRoot, "assets", "app.js.map");
      fs.mkdirSync(path.dirname(mapPath), { recursive: true });
      fs.writeFileSync(mapPath, "{}", "utf8");
      expect(() => scanBundleTree(temporaryRoot)).toThrow(
        /bundle.*source_map/i,
      );

      fs.rmSync(mapPath);
      fs.writeFileSync(
        path.join(temporaryRoot, "app.js"),
        "SUPABASE_SERVICE_ROLE_KEY=fixture-bundle-secret-value",
        "utf8",
      );
      expect(() => scanBundleTree(temporaryRoot)).toThrow(
        /bundle.*secret_marker/i,
      );
      try {
        scanBundleTree(temporaryRoot);
      } catch (error) {
        expect(String(error)).not.toContain("fixture-bundle-secret-value");
      }
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects automatic-main workflow coupling only when all mutation powers combine", () => {
    const coupled = `
name: coupled
on:
  push:
    branches: [main]
jobs:
  deploy:
    steps:
      - run: supabase db push
      - run: supabase functions deploy
      - run: npm run build
      - run: gh-pages -d dist
`;
    const buildOnly = `
name: build-only
on:
  push:
    branches: [main]
jobs:
  build:
    steps:
      - run: npm run build
`;

    expect(() => assertWorkflowDecoupled(coupled, "coupled.yml")).toThrow(
      /coupling/i,
    );
    expect(() => assertWorkflowDecoupled(buildOnly, "build.yml")).not.toThrow();
  });
});
