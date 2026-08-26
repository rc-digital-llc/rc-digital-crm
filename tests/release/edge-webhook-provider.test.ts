import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

type Principal = {
  accessToken: string;
  salesId: number;
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

function localConfiguration() {
  const rawUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  expect(rawUrl).toBeTruthy();
  expect(anonKey).toBeTruthy();
  const url = new URL(rawUrl!);
  expect(["127.0.0.1", "localhost"]).toContain(url.hostname);
  return {
    apiUrl: url.toString().replace(/\/$/, ""),
    anonKey: anonKey!,
  };
}

async function responseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function createPrincipal(): Promise<Principal> {
  const local = localConfiguration();
  const credential = ["local", "edge", "fixture", "2026!"].join("-");
  const email = "webhook-sender@example.com";
  const signup = await fetch(`${local.apiUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: local.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: credential,
      data: { first_name: "Webhook", last_name: "Sender" },
    }),
  });
  expect(signup.status).toBe(200);
  const signupBody = (await responseJson(signup)) as Record<string, unknown>;
  const user = signupBody.user as Record<string, unknown>;

  const login = await fetch(
    `${local.apiUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: local.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: credential }),
    },
  );
  expect(login.status).toBe(200);
  const loginBody = (await responseJson(login)) as Record<string, unknown>;
  const accessToken = String(loginBody.access_token);

  const sales = await restRequest(
    `sales?select=id&user_id=eq.${encodeURIComponent(String(user.id))}`,
    accessToken,
  );
  expect(sales.status).toBe(200);
  const salesRows = (await responseJson(sales)) as Record<string, unknown>[];
  expect(salesRows).toHaveLength(1);
  return { accessToken, salesId: Number(salesRows[0].id) };
}

async function restRequest(
  pathName: string,
  token: string,
  init: RequestInit = {},
) {
  const local = localConfiguration();
  return fetch(`${local.apiUrl}/rest/v1/${pathName}`, {
    ...init,
    headers: {
      apikey: local.anonKey,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

function postmarkAuthorization() {
  const fixtureEnv = parseSyntheticFunctionEnv(
    fs.readFileSync(functionsEnvPath, "utf8"),
  );
  return `Basic ${Buffer.from(
    `${fixtureEnv.POSTMARK_WEBHOOK_USER}:${fixtureEnv.POSTMARK_WEBHOOK_PASSWORD}`,
  ).toString("base64")}`;
}

async function invokePostmark(
  body: Record<string, unknown>,
  overrides: { method?: string; headers?: Record<string, string> } = {},
) {
  const local = localConfiguration();
  return fetch(`${local.apiUrl}/functions/v1/postmark`, {
    method: overrides.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "127.0.0.1",
      Authorization: postmarkAuthorization(),
      ...overrides.headers,
    },
    body:
      (overrides.method ?? "POST") === "POST"
        ? JSON.stringify(body)
        : undefined,
  });
}

async function selectRows(
  resource: string,
  query: string,
  principal: Principal,
) {
  const response = await restRequest(
    `${resource}?select=*&${query}`,
    principal.accessToken,
  );
  expect(response.status).toBe(200);
  return (await responseJson(response)) as Record<string, unknown>[];
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

describe.runIf(Boolean(process.env.SUPABASE_DB_URL))(
  "running Edge and provider contracts",
  () => {
    let principal: Principal;

    beforeAll(async () => {
      principal = await createPrincipal();
    });

    afterAll(async () => {
      if (!principal?.accessToken || !process.env.SUPABASE_URL) return;
      await fetch(
        `${process.env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/logout?scope=global`,
        {
          method: "POST",
          headers: {
            apikey: process.env.SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${principal.accessToken}`,
          },
        },
      );
    });

    it("rejects missing or untrusted forwarded IPs and Basic credentials", async () => {
      const fixture = readJson<Record<string, unknown>>(fixturePath);
      for (const headers of [
        { "x-forwarded-for": "" },
        { "x-forwarded-for": "203.0.113.50" },
        {
          Authorization: `Basic ${Buffer.from("synthetic-user:wrong").toString("base64")}`,
        },
      ]) {
        const response = await invokePostmark(fixture, { headers });
        expect(response.status).toBe(401);
        expect(await response.text()).toBe("Unauthorized");
      }
    });

    it("rejects unsupported methods and missing required fields", async () => {
      const fixture = readJson<Record<string, unknown>>(fixturePath);
      const method = await invokePostmark(fixture, { method: "GET" });
      expect(method.status).toBe(405);

      const malformed = clone(fixture);
      delete malformed.Subject;
      const body = await invokePostmark(malformed);
      expect(body.status).toBe(403);
      expect(await body.text()).toBe("Missing parameter: Subject");
    });

    it("rejects missing and invalid Bearer JWTs in authenticated functions", async () => {
      const local = localConfiguration();
      for (const authorization of [
        undefined,
        `Bearer ${["invalid", "jwt", "signature"].join(".")}`,
      ]) {
        const response = await fetch(`${local.apiUrl}/functions/v1/users`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(authorization ? { Authorization: authorization } : {}),
          },
          body: JSON.stringify({}),
        });
        expect(response.status).toBe(401);
        const body = (await responseJson(response)) as Record<string, unknown>;
        expect(body.status).toBe(401);
        expect(String(body.message)).not.toMatch(
          /auth\.users|postgres|stack trace|search_path/i,
        );
      }
    });

    it("returns database helper 403 and 500 failures without acknowledging success", async () => {
      const fixture = readJson<Record<string, unknown>>(fixturePath);
      const missingSales = clone(fixture);
      (missingSales.FromFull as Record<string, unknown>).Email =
        "missing-sender@example.com";

      const beforeCompanies = await selectRows(
        "companies",
        `sales_id=eq.${principal.salesId}`,
        principal,
      );
      const beforeContacts = await selectRows(
        "contacts",
        `sales_id=eq.${principal.salesId}`,
        principal,
      );
      const beforeNotes = await selectRows(
        "contact_notes",
        `sales_id=eq.${principal.salesId}`,
        principal,
      );

      const missingSalesResponse = await invokePostmark(missingSales);
      expect(missingSalesResponse.status).toBe(403);
      expect(
        await selectRows(
          "companies",
          `sales_id=eq.${principal.salesId}`,
          principal,
        ),
      ).toEqual(beforeCompanies);
      expect(
        await selectRows(
          "contacts",
          `sales_id=eq.${principal.salesId}`,
          principal,
        ),
      ).toEqual(beforeContacts);
      expect(
        await selectRows(
          "contact_notes",
          `sales_id=eq.${principal.salesId}`,
          principal,
        ),
      ).toEqual(beforeNotes);

      const ambiguousEmail = "ambiguous-recipient@example.com";
      const duplicates = await restRequest(
        "contacts?select=id",
        principal.accessToken,
        {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify([
            {
              first_name: "Duplicate",
              last_name: "One",
              email_jsonb: [{ email: ambiguousEmail, type: "Work" }],
              sales_id: principal.salesId,
            },
            {
              first_name: "Duplicate",
              last_name: "Two",
              email_jsonb: [{ email: ambiguousEmail, type: "Work" }],
              sales_id: principal.salesId,
            },
          ]),
        },
      );
      expect(duplicates.status).toBe(201);
      expect(await responseJson(duplicates)).toHaveLength(2);

      const ambiguous = clone(fixture);
      ambiguous.ToFull = [
        {
          Email: ambiguousEmail,
          Name: "Ambiguous Recipient",
          MailboxHash: "fixture-ambiguous",
        },
      ];
      const notesBeforeFailure = await selectRows(
        "contact_notes",
        `sales_id=eq.${principal.salesId}`,
        principal,
      );
      const ambiguousResponse = await invokePostmark(ambiguous);
      expect(ambiguousResponse.status).toBe(500);
      expect(
        await selectRows(
          "contact_notes",
          `sales_id=eq.${principal.salesId}`,
          principal,
        ),
      ).toEqual(notesBeforeFailure);
    });

    it("creates one contact and one note before returning success", async () => {
      const fixture = readJson<Record<string, unknown>>(fixturePath);
      const beforeContacts = await selectRows(
        "contacts",
        `sales_id=eq.${principal.salesId}`,
        principal,
      );
      const beforeNotes = await selectRows(
        "contact_notes",
        `sales_id=eq.${principal.salesId}`,
        principal,
      );

      const response = await invokePostmark(fixture);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("OK");

      const contacts = await selectRows(
        "contacts",
        `sales_id=eq.${principal.salesId}`,
        principal,
      );
      const notes = await selectRows(
        "contact_notes",
        `sales_id=eq.${principal.salesId}`,
        principal,
      );
      expect(contacts).toHaveLength(beforeContacts.length + 1);
      expect(notes).toHaveLength(beforeNotes.length + 1);

      const createdContact = contacts.find((contact) =>
        JSON.stringify(contact.email_jsonb).includes(
          "webhook-recipient@example.com",
        ),
      );
      expect(createdContact).toMatchObject({
        first_name: "Synthetic",
        last_name: "Recipient",
        sales_id: principal.salesId,
      });
      expect(notes).toContainEqual(
        expect.objectContaining({
          contact_id: createdContact?.id,
          sales_id: principal.salesId,
          text: "Deterministic provider contract\n\nSynthetic inbound note body.",
        }),
      );
    });
  },
);
