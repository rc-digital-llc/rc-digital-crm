import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import {
  FUNCTION_ARTIFACT_SOURCES,
  MIGRATION_ARTIFACT_SOURCES,
} from "../../scripts/release/prepare-build-evidence.mjs";

const repositoryRoot = path.resolve(__dirname, "../..");
const supabaseConfigSupportPaths = [
  "supabase/config.toml",
  "supabase/signing_keys.json",
  "supabase/templates",
];

describe("release build evidence", () => {
  it.each([
    ["functions", FUNCTION_ARTIFACT_SOURCES],
    ["migrations", MIGRATION_ARTIFACT_SOURCES],
  ])("packages Supabase config support files with %s", (_name, sources) => {
    expect(sources).toEqual(expect.arrayContaining(supabaseConfigSupportPaths));
  });

  it("keeps every required Supabase config support path tracked", () => {
    for (const sourcePath of supabaseConfigSupportPaths) {
      expect(fs.existsSync(path.join(repositoryRoot, sourcePath))).toBe(true);
    }
  });
});
