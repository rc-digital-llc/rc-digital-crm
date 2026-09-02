import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type ProcessResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type CommandResult = {
  result: "applied" | "duplicate" | "ignored";
  state: "completed" | "ignored";
  event_key: string;
  last_sequence?: number;
};

type AutomationCommandResult = {
  result: "applied" | "duplicate" | "denied";
  reason_code: string;
};

const repositoryRoot = path.resolve(__dirname, "../..");
const projectId = "atomic-crm-demo";
const expectedContainer = `supabase_db_${projectId}`;

function redact(value: string) {
  return value
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[REDACTED_JWT]",
    )
    .replace(/postgresql:\/\/[^\s]+/g, "[REDACTED_DATABASE_URL]")
    .replace(/((?:key|token|secret|password)\s*[=:]\s*)\S+/gi, "$1[REDACTED]");
}

function runProcess(
  command: string,
  args: string[],
  timeoutMs = 10000,
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const finish = (result: ProcessResult) => {
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
      finish({ code: 127, stdout: "", stderr: redact(error.message) });
    });
    child.on("close", (code) => {
      finish({ code: code ?? 1, stdout, stderr: redact(stderr) });
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 500).unref();
      finish({
        code: 124,
        stdout: "",
        stderr: `process exceeded ${timeoutMs}ms`,
      });
    }, timeoutMs);
  });
}

async function resolveDatabaseContainer(run: typeof runProcess = runProcess) {
  const result = await run("docker", [
    "ps",
    "--filter",
    `name=^/${expectedContainer}$`,
    "--format",
    "{{.Names}}",
  ]);
  if (result.code !== 0) {
    throw new Error(`database container discovery failed: ${result.stderr}`);
  }
  const matches = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line === expectedContainer);
  if (matches.length !== 1) {
    throw new Error(
      `expected one repository database container, found ${matches.length}`,
    );
  }
  return matches[0];
}

function assertIdentifier(value: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
    throw new Error("test command identity is invalid");
  }
  return value;
}

async function psql(
  container: string,
  sql: string,
  run: typeof runProcess = runProcess,
) {
  const result = await run(
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
      sql,
    ],
    15000,
  );
  if (result.code !== 0) {
    throw new Error(`psql process failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

async function applyCommand(
  container: string,
  {
    eventKey,
    streamKey,
    sequence,
    holdMs = 0,
  }: {
    eventKey: string;
    streamKey: string;
    sequence: number;
    holdMs?: number;
  },
) {
  assertIdentifier(eventKey);
  assertIdentifier(streamKey);
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error("test sequence is invalid");
  }
  if (!Number.isInteger(holdMs) || holdMs < 0 || holdMs > 5000) {
    throw new Error("test hold is invalid");
  }
  const output = await psql(
    container,
    `SELECT test_release.apply_command('fixture','${eventKey}','${streamKey}',${sequence},false,${holdMs})::text`,
  );
  return JSON.parse(output) as CommandResult;
}

async function countEffects(
  container: string,
  filter: { eventKey?: string; streamKey?: string } = {},
) {
  const predicates = ["provider = 'fixture'"];
  if (filter.eventKey) {
    predicates.push(`event_key = '${assertIdentifier(filter.eventKey)}'`);
  }
  if (filter.streamKey) {
    predicates.push(`stream_key = '${assertIdentifier(filter.streamKey)}'`);
  }
  return Number(
    await psql(
      container,
      `SELECT count(*) FROM test_release.command_effects WHERE ${predicates.join(" AND ")}`,
    ),
  );
}

async function applyAutomationCommand(
  container: string,
  idempotencyKey: string,
) {
  assertIdentifier(idempotencyKey);
  const output = await psql(
    container,
    `BEGIN;
     SET LOCAL "request.jwt.claim.sub" = '21000000-0000-0000-0000-000000000006';
     SET LOCAL ROLE authenticated;
     SELECT public.execute_billing_automation_command(
       '21000000-0000-0000-0000-000000000501',
       '21000000-0000-0000-0000-000000000200',
       'test.concurrent',
       'provider-alpha-fixture',
       'policy-fixture-v1',
       'record.concurrent',
       1.00,
       '${idempotencyKey}'
     )::text;
     COMMIT;`,
  );
  return JSON.parse(output) as AutomationCommandResult;
}

describe("replay/concurrency fixture contracts", () => {
  it("resolves one exact project container with explicit Docker argv", async () => {
    const calls: string[][] = [];
    const fakeRun = async (command: string, args: string[]) => {
      calls.push([command, ...args]);
      return { code: 0, stdout: `${expectedContainer}\n`, stderr: "" };
    };
    await expect(resolveDatabaseContainer(fakeRun)).resolves.toBe(
      expectedContainer,
    );
    expect(calls).toEqual([
      [
        "docker",
        "ps",
        "--filter",
        `name=^/${expectedContainer}$`,
        "--format",
        "{{.Names}}",
      ],
    ]);
  });

  it("rejects zero or multiple matching database containers", async () => {
    for (const stdout of ["", `${expectedContainer}\n${expectedContainer}\n`]) {
      const fakeRun = async () => ({ code: 0, stdout, stderr: "" });
      await expect(resolveDatabaseContainer(fakeRun)).rejects.toThrow(
        /expected one repository database container/,
      );
    }
  });

  it("keeps test-only support out of every production migration", () => {
    const migrationDirectory = path.join(repositoryRoot, "supabase/migrations");
    for (const filename of fs.readdirSync(migrationDirectory)) {
      const source = fs.readFileSync(
        path.join(migrationDirectory, filename),
        "utf8",
      );
      expect(source).not.toContain("test_release");
    }
  });

  it("rejects financial provider registration without replay and concurrency tests", () => {
    const contract = JSON.parse(
      fs.readFileSync(
        path.join(
          repositoryRoot,
          "tests/release/fixtures/provider-contract.json",
        ),
        "utf8",
      ),
    );
    const provider = contract.providers[0];
    provider.financial = true;
    for (const caseClass of ["duplicate-replay", "concurrency"]) {
      expect(provider.cases[caseClass].tests).toEqual([]);
      expect(() => {
        if (
          provider.financial &&
          provider.cases[caseClass].tests.length === 0
        ) {
          throw new Error(`${caseClass} requires executable tests`);
        }
      }).toThrow(/requires executable tests/);
    }
  });
});

describe.runIf(Boolean(process.env.SUPABASE_DB_URL))(
  "live PostgreSQL replay and concurrency",
  () => {
    it("applies 32 same-key claims once and preserves restart replay", async () => {
      const container = await resolveDatabaseContainer();
      const results = await Promise.all(
        Array.from({ length: 32 }, () =>
          applyCommand(container, {
            eventKey: "same-event",
            streamKey: "same-stream",
            sequence: 1,
            holdMs: 250,
          }),
        ),
      );
      expect(results).toHaveLength(32);
      expect(
        results.filter((result) => result.result === "applied"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.result === "duplicate"),
      ).toHaveLength(31);
      expect(await countEffects(container, { eventKey: "same-event" })).toBe(1);

      const processRestartReplay = await applyCommand(container, {
        eventKey: "same-event",
        streamKey: "same-stream",
        sequence: 1,
      });
      expect(processRestartReplay.result).toBe("duplicate");
      expect(await countEffects(container, { eventKey: "same-event" })).toBe(1);
    }, 30000);

    it("applies 32 distinct keys exactly once without missing results", async () => {
      const container = await resolveDatabaseContainer();
      const results = await Promise.all(
        Array.from({ length: 32 }, (_, index) =>
          applyCommand(container, {
            eventKey: `distinct-event-${String(index).padStart(2, "0")}`,
            streamKey: `distinct-stream-${String(index).padStart(2, "0")}`,
            sequence: index + 1,
          }),
        ),
      );
      expect(results).toHaveLength(32);
      expect(results.every((result) => result.result === "applied")).toBe(true);
      expect(await countEffects(container)).toBe(33);
    }, 30000);

    it("ignores an earlier sequence after a later process completes", async () => {
      const container = await resolveDatabaseContainer();
      const later = await applyCommand(container, {
        eventKey: "ordered-event-20",
        streamKey: "ordered-stream",
        sequence: 20,
      });
      const earlier = await applyCommand(container, {
        eventKey: "ordered-event-10",
        streamKey: "ordered-stream",
        sequence: 10,
      });
      expect(later.result).toBe("applied");
      expect(earlier).toMatchObject({ result: "ignored", last_sequence: 20 });
      expect(
        await countEffects(container, { streamKey: "ordered-stream" }),
      ).toBe(1);
    });

    it("atomically consumes one simultaneous automation grant unit", async () => {
      const container = await resolveDatabaseContainer();
      const idempotencyKey = "automation-last-unit";
      const results = await Promise.all(
        Array.from({ length: 32 }, () =>
          applyAutomationCommand(container, idempotencyKey),
        ),
      );

      expect(results).toHaveLength(32);
      expect(results.filter((result) => result.result === "applied")).toHaveLength(
        1,
      );
      expect(
        results.filter((result) => result.result === "duplicate"),
      ).toHaveLength(31);
      expect(
        Number(
          await psql(
            container,
            `SELECT count(*) FROM public.billing_automation_executions
             WHERE idempotency_key = '${idempotencyKey}'`,
          ),
        ),
      ).toBe(1);
      expect(
        JSON.parse(
          await psql(
            container,
            `SELECT jsonb_build_object(
               'actions', actions_consumed,
               'amount', total_amount_consumed::text,
               'status', status
             )::text
             FROM public.billing_automation_grants
             WHERE id = '21000000-0000-0000-0000-000000000501'`,
          ),
        ),
      ).toEqual({ actions: 1, amount: "1.00", status: "exhausted" });
      expect(
        Number(
          await psql(
            container,
            `SELECT count(*) FROM public.billing_audit_events
             WHERE actor_id = '21000000-0000-0000-0000-000000000400'
               AND action = 'automation.command'
               AND subject_id = '${idempotencyKey}'
               AND result = 'succeeded'`,
          ),
        ),
      ).toBe(1);
    }, 30000);
  },
);
