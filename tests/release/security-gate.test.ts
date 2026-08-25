import { describe, expect, it } from "vitest";

import {
  assertSecretScanResult,
  buildGitleaksArgs,
  summarizeFindings,
  validateGitleaksConfig,
} from "../../scripts/release/security-gate.mjs";

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
      validateGitleaksConfig('title = "RC Digital release scan"\n[extend]\nuseDefault = true'),
    ).not.toThrow();
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
