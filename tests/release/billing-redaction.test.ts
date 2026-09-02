import { describe, expect, it } from "vitest";

import {
  createSafeLogContext,
  redactSensitiveValue,
} from "../../supabase/functions/_shared/redaction.ts";
import {
  createBillingErrorResponse,
  createErrorResponse,
  createSafeLogContext as createSafeLogContextFromUtils,
} from "../../supabase/functions/_shared/utils.ts";

const fixtureValues = {
  secret: ["fixture", "secret", "must", "disappear"].join("-"),
  credential: ["fixture", "credential", "must", "disappear"].join("-"),
  token: ["fixture", "token", "must", "disappear"].join("-"),
  email: ["fixture.contact", "redaction.invalid"].join("@"),
  phone: ["+1", "555", "010", "9090"].join("-"),
  path: ["organization", "account", "evidence", "fixture.pdf"].join("/"),
  providerPayload: ["fixture", "provider", "payload"].join("-"),
};

function expectFixtureValuesAbsent(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const fixtureValue of Object.values(fixtureValues)) {
    expect(serialized).not.toContain(fixtureValue);
  }
  return serialized;
}

describe("billing redaction recursive contracts", () => {
  it("recursive redaction removes prohibited field families at every depth", () => {
    const input = {
      operation: "billing.evidence.inspect",
      result: "failed",
      nested: {
        Authorization: `Bearer ${fixtureValues.token}`,
        api_KEY: fixtureValues.secret,
        PassWord: fixtureValues.credential,
        rawCredential: fixtureValues.credential,
        signedURL: `https://storage.redaction.invalid/${fixtureValues.path}?token=${fixtureValues.token}#fragment`,
        providerPayload: { body: fixtureValues.providerPayload },
        customer: {
          EMAIL_address: fixtureValues.email,
          PhoneNumber: fixtureValues.phone,
        },
        evidence: {
          objectPath: fixtureValues.path,
          content: fixtureValues.secret,
        },
      },
      values: [
        { accessToken: fixtureValues.token },
        { refresh_token: fixtureValues.token },
        { cookie: fixtureValues.credential },
      ],
    };

    const redacted = redactSensitiveValue(input);
    const serialized = expectFixtureValuesAbsent(redacted);

    expect(redacted).toMatchObject({
      operation: "billing.evidence.inspect",
      result: "failed",
    });
    expect(serialized).toContain("[REDACTED]");
  });

  it("recursive redaction sanitizes secret-shaped primitive strings and URLs", () => {
    const jwt = ["eyJmaXh0dXJl", "cGF5bG9hZA", "c2lnbmF0dXJl"].join(".");
    const input = [
      `authorization=Bearer ${fixtureValues.token}`,
      `password=${fixtureValues.credential}`,
      `contact=${fixtureValues.email}`,
      `phone=${fixtureValues.phone}`,
      jwt,
      `https://storage.redaction.invalid/${fixtureValues.path}?signature=${fixtureValues.token}#private`,
    ];

    const redacted = redactSensitiveValue(input);
    const serialized = expectFixtureValuesAbsent(redacted);

    expect(serialized).not.toContain(jwt);
    expect(serialized).not.toContain("signature=");
    expect(serialized).not.toContain("#private");
    expect(serialized).not.toContain(fixtureValues.path);
  });

  it("recursive redaction handles errors, cycles, unsupported values, and depth limits", () => {
    const cycle: Record<string, unknown> = { operation: "billing.cycle" };
    cycle.self = cycle;

    const deep = {
      one: {
        two: {
          three: {
            four: {
              five: {
                six: {
                  seven: { secret: fixtureValues.secret },
                },
              },
            },
          },
        },
      },
    };

    const input = {
      cycle,
      error: new Error(`database detail ${fixtureValues.secret}`),
      request: new Request(
        `https://api.redaction.invalid/${fixtureValues.path}?token=${fixtureValues.token}`,
      ),
      response: new Response(fixtureValues.providerPayload),
      unsupported: Symbol("fixture-unsupported"),
      deep,
    };

    expect(() => redactSensitiveValue(input, { maxDepth: 5 })).not.toThrow();
    const redacted = redactSensitiveValue(input, { maxDepth: 5 });
    const serialized = expectFixtureValuesAbsent(redacted);

    expect(serialized).toContain("[CIRCULAR]");
    expect(serialized).toContain("[MAX_DEPTH]");
    expect(serialized).toContain("[REDACTED_ERROR]");
    expect(serialized).toContain("[UNSUPPORTED]");
  });

  it("recursive safe log context keeps only documented scalar diagnostics", () => {
    const context = createSafeLogContext({
      operation: "billing.evidence.access",
      code: "EVIDENCE_DENIED",
      result: "denied",
      reasonCode: "QUARANTINED",
      requestId: "request-fixture-0123456789",
      status: 403,
      accountId: "account-fixture-must-disappear",
      email: fixtureValues.email,
      rawBody: { token: fixtureValues.token },
      error: new Error(fixtureValues.secret),
      url: `https://storage.redaction.invalid/${fixtureValues.path}?token=${fixtureValues.token}`,
    });

    expect(context).toEqual({
      operation: "billing.evidence.access",
      code: "EVIDENCE_DENIED",
      result: "denied",
      reason_code: "QUARANTINED",
      request_id: "request-fixture-0123456789",
      status: 403,
    });
    expectFixtureValuesAbsent(context);
    expect(context).not.toHaveProperty("accountId");
    expect(context).not.toHaveProperty("rawBody");
    expect(context).not.toHaveProperty("error");
  });
});

describe("billing redaction boundary contracts", () => {
  it("boundary error responses expose only a stable public contract", async () => {
    const response = createBillingErrorResponse(
      403,
      "EVIDENCE_DENIED",
      "Forbidden",
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      status: 403,
      code: "EVIDENCE_DENIED",
      message: "Forbidden",
    });
  });

  it("boundary error responses replace exception text and invalid metadata", async () => {
    const internalDetail = ["database", "relation", fixtureValues.secret].join(
      " ",
    );
    const response = createBillingErrorResponse(
      299,
      `invalid-code-${fixtureValues.token}`,
      internalDetail,
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      status: 500,
      code: "OPERATION_FAILED",
      message: "Internal Server Error",
    });
    expectFixtureValuesAbsent(body);
    expect(JSON.stringify(body)).not.toContain("database relation");
  });

  it("boundary log context re-export strips broad inputs deterministically", () => {
    const input = {
      operation: "billing.account.update",
      code: "ACCOUNT_UPDATED",
      result: "succeeded",
      reason_code: "OPERATOR_REQUEST",
      request_id: "request-fixture-9876543210",
      status: 200,
      body: { password: fixtureValues.credential },
      error: new Error(fixtureValues.secret),
      url: `https://api.redaction.invalid/${fixtureValues.path}?token=${fixtureValues.token}`,
      customerEmail: fixtureValues.email,
      providerAccountId: "provider-account-fixture",
    };

    expect(createSafeLogContextFromUtils(input)).toEqual(
      createSafeLogContext(input),
    );
    expect(createSafeLogContextFromUtils(input)).toEqual({
      operation: "billing.account.update",
      code: "ACCOUNT_UPDATED",
      result: "succeeded",
      reason_code: "OPERATOR_REQUEST",
      request_id: "request-fixture-9876543210",
      status: 200,
    });
    expectFixtureValuesAbsent(createSafeLogContextFromUtils(input));
  });

  it("boundary keeps the unrelated legacy error helper source-compatible", async () => {
    const response = createErrorResponse(409, "Existing conflict", {
      code: "EXISTING_CONFLICT",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      status: 409,
      message: "Existing conflict",
      code: "EXISTING_CONFLICT",
    });
  });
});
