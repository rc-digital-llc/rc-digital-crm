import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type CaseRegistration = {
  tests?: string[];
  limitation?: string;
};

type ProviderRegistration = {
  provider: string;
  path: string;
  endpoint: string;
  financial: boolean;
  event_identity_field: string;
  fixture: string;
  test_file: string;
  cases: Record<string, CaseRegistration>;
};

type ProviderContract = {
  version: string;
  required_case_classes: string[];
  providers: ProviderRegistration[];
};

const repositoryRoot = path.resolve(__dirname, "../..");
const fixturePath = path.join(
  repositoryRoot,
  "tests/release/fixtures/postmark-inbound.json",
);
const contractPath = path.join(
  repositoryRoot,
  "tests/release/fixtures/provider-contract.json",
);
const functionsEnvPath = path.join(
  repositoryRoot,
  "supabase/tests/fixtures/functions.env",
);

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(allStrings);
  }
  return [];
}

function isReservedDomain(domain: string) {
  return ["example.com", "example.org", "example.net"].some(
    (reserved) => domain === reserved || domain.endsWith(`.${reserved}`),
  );
}

function validateSyntheticPostmarkFixture(fixture: Record<string, unknown>) {
  if (typeof fixture.MessageID !== "string" || fixture.MessageID.length === 0) {
    throw new Error("provider fixture requires a fixed MessageID");
  }
  if (fixture.Date !== "2026-08-25T20:00:00.000Z") {
    throw new Error("provider fixture timestamp must be fixed");
  }

  for (const value of allStrings(fixture)) {
    for (const match of value.matchAll(
      /[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi,
    )) {
      if (!isReservedDomain(match[1].toLowerCase())) {
        throw new Error(
          "provider fixture contains a non-reserved email domain",
        );
      }
    }
    if (/https?:\/\//i.test(value)) {
      const url = new URL(value);
      if (
        !isReservedDomain(url.hostname) &&
        !["127.0.0.1", "localhost"].includes(url.hostname)
      ) {
        throw new Error("provider fixture contains a non-reserved URL");
      }
    }
    if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value)) {
      throw new Error("provider fixture contains a token-shaped value");
    }
  }
}

function parseSyntheticFunctionEnv(text: string) {
  const entries = Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 1) throw new Error("invalid function fixture env line");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
  const expectedKeys = [
    "POSTMARK_WEBHOOK_AUTHORIZED_IPS",
    "POSTMARK_WEBHOOK_PASSWORD",
    "POSTMARK_WEBHOOK_USER",
  ];
  expect(Object.keys(entries).sort()).toEqual(expectedKeys);
  if (
    !entries.POSTMARK_WEBHOOK_USER?.startsWith("synthetic-") ||
    !entries.POSTMARK_WEBHOOK_PASSWORD?.startsWith("synthetic-")
  ) {
    throw new Error("function fixture credentials must be visibly synthetic");
  }
  for (const ip of entries.POSTMARK_WEBHOOK_AUTHORIZED_IPS.split(",")) {
    if (ip !== "127.0.0.1" && !ip.startsWith("192.0.2.")) {
      throw new Error("function fixture IP must be loopback or TEST-NET-1");
    }
  }
  return entries;
}

function validateProviderContract(contract: ProviderContract) {
  if (contract.version !== "1.0.0") {
    throw new Error("unsupported provider contract version");
  }
  const required = new Set(contract.required_case_classes);
  for (const provider of contract.providers) {
    if (!provider.event_identity_field) {
      throw new Error(`${provider.provider} requires an event identity field`);
    }
    if (!provider.path.startsWith("supabase/functions/")) {
      throw new Error(
        `${provider.provider} path is outside provider ownership`,
      );
    }
    if (!provider.test_file.startsWith("tests/release/")) {
      throw new Error(`${provider.provider} test ownership is not registered`);
    }
    for (const caseClass of required) {
      const registration = provider.cases[caseClass];
      if (!registration) {
        throw new Error(`${provider.provider} missing ${caseClass} case`);
      }
      const hasTests = (registration.tests?.length ?? 0) > 0;
      const hasLimitation = Boolean(registration.limitation?.trim());
      if (!hasTests && (provider.financial || !hasLimitation)) {
        throw new Error(
          `${provider.provider} ${caseClass} requires executable tests`,
        );
      }
    }
  }
}

describe("Edge/provider fixtures", () => {
  it("fixtures use fixed reserved-example data and visibly synthetic auth", () => {
    const fixture = readJson<Record<string, unknown>>(fixturePath);
    validateSyntheticPostmarkFixture(fixture);
    const env = parseSyntheticFunctionEnv(
      fs.readFileSync(functionsEnvPath, "utf8"),
    );
    expect(env.POSTMARK_WEBHOOK_AUTHORIZED_IPS).toContain("127.0.0.1");
  });

  it("rejects non-synthetic domains, credentials, and missing identities", () => {
    const fixture = readJson<Record<string, unknown>>(fixturePath);
    const unsafeDomain = clone(fixture);
    (unsafeDomain.FromFull as Record<string, unknown>).Email =
      "billing@not-reserved.invalid";
    expect(() => validateSyntheticPostmarkFixture(unsafeDomain)).toThrow(
      /non-reserved/i,
    );

    const missingIdentity = clone(fixture);
    delete missingIdentity.MessageID;
    expect(() => validateSyntheticPostmarkFixture(missingIdentity)).toThrow(
      /MessageID/,
    );

    expect(() =>
      parseSyntheticFunctionEnv(
        "POSTMARK_WEBHOOK_USER=operator\n" +
          "POSTMARK_WEBHOOK_PASSWORD=opaque-value\n" +
          "POSTMARK_WEBHOOK_AUTHORIZED_IPS=127.0.0.1\n",
      ),
    ).toThrow(/synthetic/i);
  });

  it("registers every case class and rejects incomplete financial paths", () => {
    const contract = readJson<ProviderContract>(contractPath);
    expect(() => validateProviderContract(contract)).not.toThrow();
    expect(contract.providers[0]).toMatchObject({
      provider: "postmark",
      financial: false,
      event_identity_field: "MessageID",
    });

    const incomplete = clone(contract);
    incomplete.providers[0].financial = true;
    expect(() => validateProviderContract(incomplete)).toThrow(
      /duplicate-replay requires executable tests/,
    );

    const missingCase = clone(contract);
    delete missingCase.providers[0].cases.auth;
    expect(() => validateProviderContract(missingCase)).toThrow(
      /missing auth case/,
    );
  });
});
