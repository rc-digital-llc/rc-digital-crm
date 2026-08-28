import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  assertSafeSchemaPushTarget,
  cleanupSchemaPushTarget,
  parseMigrationFilenames,
  parseMigrationListOutput,
  verifyCleanMigrationChain,
  verifySchemaPushTarget,
} from "../../scripts/release/verify-migration-chain.mjs";

const migrations = ["20240101000000_first.sql", "20240202000000_second.sql"];

const matchingHistory = `
  LOCAL          | REMOTE         | TIME (UTC)
 ----------------|----------------|---------------------
  20240101000000 | 20240101000000 | 2024-01-01 00:00:00
  20240202000000 | 20240202000000 | 2024-02-02 00:00:00
`;

describe("clean migration verifier", () => {
  it("rejects malformed, duplicate, and out-of-order versions", () => {
    expect(() =>
      parseMigrationFilenames([
        "20240202000000_second.sql",
        "20240101000000_first.sql",
      ]),
    ).toThrow(/order/i);
    expect(() =>
      parseMigrationFilenames([
        "20240101000000_first.sql",
        "20240101000000_duplicate.sql",
      ]),
    ).toThrow(/duplicate/i);
    expect(() => parseMigrationFilenames(["not-a-migration.sql"])).toThrow(
      /filename/i,
    );
  });

  it("parses structured CLI history and rejects local/database divergence", () => {
    expect(
      parseMigrationListOutput(
        JSON.stringify({
          migrations: [
            {
              local: "20240101000000",
              remote: "20240101000000",
              time: "2024-01-01 00:00:00",
            },
          ],
        }),
      ),
    ).toEqual(["20240101000000"]);
    expect(() =>
      parseMigrationListOutput(
        JSON.stringify({
          migrations: [{ local: "20240101000000", remote: "20240202000000" }],
        }),
      ),
    ).toThrow(/differ/i);
  });

  it("parses current rendered CLI history and rejects missing remote versions", () => {
    const renderedHistory = `
┌────────────────┬────────────────┬─────────────────────┐
│ Local          │ Remote         │ Time (UTC)          │
├────────────────┼────────────────┼─────────────────────┤
│ \`20240101000000\` │ \`20240101000000\` │ \`2024-01-01 00:00:00\` │
│ \`20240202000000\` │ \`20240202000000\` │ \`2024-02-02 00:00:00\` │
└────────────────┴────────────────┴─────────────────────┘
`;

    expect(parseMigrationListOutput(renderedHistory)).toEqual([
      "20240101000000",
      "20240202000000",
    ]);
    expect(() =>
      parseMigrationListOutput(
        renderedHistory.replace(
          "│ `20240202000000` │ `20240202000000` │",
          "│ `20240202000000` │ ` `              │",
        ),
      ),
    ).toThrow(/differ/i);
  });

  it("stops after one reset failure without retrying assertions", async () => {
    const calls: string[][] = [];
    const execute = async (command: string, args: string[]) => {
      calls.push([command, ...args]);
      return { code: 17, stdout: "", stderr: "reset failed" };
    };

    await expect(
      verifyCleanMigrationChain({ migrationFilenames: migrations, execute }),
    ).rejects.toThrow(/reset.*17/i);
    expect(calls).toEqual([["supabase", "db", "reset", "--local"]]);
  });

  it("rejects database history that differs from repository history", async () => {
    const calls: string[][] = [];
    const execute = async (command: string, args: string[]) => {
      calls.push([command, ...args]);
      if (args[0] === "db") return { code: 0, stdout: "", stderr: "" };
      return {
        code: 0,
        stdout: matchingHistory.replace(/.*20240202000000.*\n/, ""),
        stderr: "",
      };
    };

    await expect(
      verifyCleanMigrationChain({ migrationFilenames: migrations, execute }),
    ).rejects.toThrow(/history.*differ/i);
    expect(calls).toHaveLength(2);
  });

  it("runs pgTAP once and preserves its failure", async () => {
    const calls: string[][] = [];
    const execute = async (command: string, args: string[]) => {
      calls.push([command, ...args]);
      if (args[0] === "db") return { code: 0, stdout: "", stderr: "" };
      if (args[0] === "migration") {
        return { code: 0, stdout: matchingHistory, stderr: "" };
      }
      return { code: 23, stdout: "", stderr: "TAP failed" };
    };

    await expect(
      verifyCleanMigrationChain({ migrationFilenames: migrations, execute }),
    ).rejects.toThrow(/schema contracts.*23/i);
    expect(
      calls.filter(
        ([command, first, second]) =>
          command === "supabase" && first === "test" && second === "db",
      ),
    ).toHaveLength(1);
  });

  it("reports exact ordered-history metadata after the three live commands", async () => {
    const calls: string[][] = [];
    const execute = async (command: string, args: string[]) => {
      calls.push([command, ...args]);
      if (args[0] === "migration") {
        return { code: 0, stdout: matchingHistory, stderr: "" };
      }
      return { code: 0, stdout: "ok", stderr: "" };
    };

    const result = await verifyCleanMigrationChain({
      migrationFilenames: migrations,
      execute,
    });

    expect(calls).toEqual([
      ["supabase", "db", "reset", "--local"],
      ["supabase", "migration", "list", "--local"],
      [
        "supabase",
        "test",
        "db",
        "supabase/tests/database/00_schema_contracts.sql",
        "--local",
      ],
    ]);
    expect(result).toEqual({
      first_version: "20240101000000",
      latest_version: "20240202000000",
      migration_count: 2,
      filenames_sha256: createHash("sha256")
        .update(migrations.join("\n"))
        .digest("hex"),
    });
  });
});

describe("schema push verifier", () => {
  const target = {
    databaseUrl: "postgresql://postgres:local@127.0.0.1:55432/postgres",
    projectId: "rc-digital-schema-push-1234-a1b2c3d4",
    workdir: "/tmp/rc-digital-schema-push-1234-a1b2c3d4",
  };

  it.each([
    {
      name: "remote host",
      target: {
        ...target,
        databaseUrl: "postgresql://postgres:pw@db.example.com/postgres",
      },
      environment: {},
      argv: [],
      pattern: /loopback/i,
    },
    {
      name: "linked mode",
      target,
      environment: {},
      argv: ["--linked"],
      pattern: /linked/i,
    },
    {
      name: "unresolved variable",
      target: {
        ...target,
        databaseUrl:
          "postgresql://postgres:$LOCAL_PASSWORD@127.0.0.1:55432/postgres",
      },
      environment: {},
      argv: [],
      pattern: /unresolved/i,
    },
    {
      name: "production identifier",
      target: { ...target, projectId: "rc-digital-production" },
      environment: {},
      argv: [],
      pattern: /test-scoped/i,
    },
    {
      name: "access token",
      target,
      environment: { SUPABASE_ACCESS_TOKEN: "present-but-never-printed" },
      argv: [],
      pattern: /access token/i,
    },
    {
      name: "project reference",
      target,
      environment: { SUPABASE_PROJECT_REF: "production-ref" },
      argv: [],
      pattern: /project ref/i,
    },
  ])(
    "rejects $name before executing a command",
    async ({ target: unsafeTarget, environment, argv, pattern }) => {
      const calls: string[][] = [];
      const execute = async (command: string, args: string[]) => {
        calls.push([command, ...args]);
        return { code: 0, stdout: "", stderr: "" };
      };

      expect(() =>
        assertSafeSchemaPushTarget({
          target: unsafeTarget,
          environment,
          argv,
        }),
      ).toThrow(pattern);
      await expect(
        verifySchemaPushTarget({
          target: unsafeTarget,
          migrationFilenames: migrations,
          environment,
          argv,
          execute,
        }),
      ).rejects.toThrow(pattern);
      expect(calls).toEqual([]);
    },
  );

  it("pushes the ordered history and schema contracts to the validated URL", async () => {
    const calls: string[][] = [];
    const execute = async (command: string, args: string[]) => {
      calls.push([command, ...args]);
      if (args[0] === "migration") {
        return { code: 0, stdout: matchingHistory, stderr: "" };
      }
      return { code: 0, stdout: "ok", stderr: "" };
    };

    const result = await verifySchemaPushTarget({
      target,
      migrationFilenames: migrations,
      environment: {},
      argv: [],
      execute,
    });

    expect(calls).toEqual([
      [
        "supabase",
        "db",
        "push",
        "--db-url",
        target.databaseUrl,
        "--include-all",
      ],
      ["supabase", "migration", "list", "--db-url", target.databaseUrl],
      [
        "supabase",
        "test",
        "db",
        "supabase/tests/database/00_schema_contracts.sql",
        "--db-url",
        target.databaseUrl,
      ],
    ]);
    expect(result).toMatchObject({
      project_id: target.projectId,
      first_version: "20240101000000",
      latest_version: "20240202000000",
      migration_count: 2,
    });
    expect(JSON.stringify(result)).not.toContain(target.databaseUrl);
  });

  it("cleans up only the exact validated project", async () => {
    const calls: string[][] = [];
    const execute = async (command: string, args: string[]) => {
      calls.push([command, ...args]);
      return { code: 0, stdout: "", stderr: "" };
    };

    await cleanupSchemaPushTarget({ target, execute });

    expect(calls).toEqual([
      [
        "supabase",
        "stop",
        "--project-id",
        target.projectId,
        "--no-backup",
        "--workdir",
        target.workdir,
      ],
    ]);
  });
});
