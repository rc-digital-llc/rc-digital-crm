import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import {
  archiveReleaseSources,
  FUNCTION_ARTIFACT_SOURCES,
  MIGRATION_ARTIFACT_SOURCES,
} from "../../scripts/release/prepare-build-evidence.mjs";

const repositoryRoot = path.resolve(__dirname, "../..");
const supabaseConfigSupportPaths = [
  "supabase/config.toml",
  "supabase/templates",
];

describe("release build evidence", () => {
  it.each([
    ["functions", FUNCTION_ARTIFACT_SOURCES],
    ["migrations", MIGRATION_ARTIFACT_SOURCES],
  ])("packages Supabase config support files with %s", (_name, sources) => {
    expect(sources).toEqual(expect.arrayContaining(supabaseConfigSupportPaths));
    expect(sources).not.toContain("supabase/signing_keys.json");
  });

  it("keeps every required Supabase config support path tracked", () => {
    for (const sourcePath of supabaseConfigSupportPaths) {
      expect(fs.existsSync(path.join(repositoryRoot, sourcePath))).toBe(true);
    }
  });

  it.each([
    ["functions", FUNCTION_ARTIFACT_SOURCES],
    ["migrations", MIGRATION_ARTIFACT_SOURCES],
  ])("creates a release-safe %s archive", (name, sources) => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "rc-digital-release-evidence-"),
    );
    try {
      const archivePath = path.join(temporaryDirectory, `${name}.tar.gz`);
      const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repositoryRoot,
        encoding: "utf8",
      }).trim();
      archiveReleaseSources(commitSha, sources, archivePath);
      const archiveEntries = execFileSync("tar", ["-tzf", archivePath], {
        encoding: "utf8",
      })
        .trim()
        .split("\n");
      const releaseConfig = execFileSync(
        "tar",
        ["-xOzf", archivePath, "supabase/config.toml"],
        { encoding: "utf8" },
      );

      expect(archiveEntries).toContain("supabase/config.toml");
      expect(
        archiveEntries.some((entry) => entry.startsWith("supabase/templates/")),
      ).toBe(true);
      expect(archiveEntries).not.toContain("supabase/signing_keys.json");
      expect(releaseConfig).toContain("[auth]");
      expect(releaseConfig).not.toContain("signing_keys_path");
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
