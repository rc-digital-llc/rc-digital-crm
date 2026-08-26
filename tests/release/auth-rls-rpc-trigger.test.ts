import { afterAll, describe, expect, it } from "vitest";

type JsonObject = Record<string, unknown>;

type Principal = {
  accessToken: string;
  salesId: number;
  userId: string;
};

const apiUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const activeTokens: string[] = [];

function localApiConfiguration() {
  expect(apiUrl).toBeTruthy();
  expect(anonKey).toBeTruthy();
  const parsed = new URL(apiUrl!);
  expect(["127.0.0.1", "localhost"]).toContain(parsed.hostname);
  return { apiUrl: parsed.toString().replace(/\/$/, ""), anonKey: anonKey! };
}

async function json(response: Response): Promise<unknown> {
  const text = await response.text();
  return text.length === 0 ? null : JSON.parse(text);
}

async function authRequest(path: string, body: JsonObject) {
  const local = localApiConfiguration();
  return fetch(`${local.apiUrl}${path}`, {
    method: "POST",
    headers: {
      apikey: local.anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function restRequest(
  path: string,
  token?: string,
  init: RequestInit = {},
) {
  const local = localApiConfiguration();
  return fetch(`${local.apiUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: local.anonKey,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

async function createPrincipal(
  label: "one" | "two",
  credential: string,
): Promise<Principal> {
  const email = `http-owner-${label}@release.example`;
  const signup = await authRequest("/auth/v1/signup", {
    email,
    password: credential,
    data: { first_name: "HTTP", last_name: `Owner ${label}` },
  });
  expect(signup.status).toBe(200);
  const signupBody = (await json(signup)) as JsonObject;
  const signupUser = signupBody.user as JsonObject;
  expect(signupUser.id).toEqual(expect.any(String));

  const login = await authRequest("/auth/v1/token?grant_type=password", {
    email,
    password: credential,
  });
  expect(login.status).toBe(200);
  const loginBody = (await json(login)) as JsonObject;
  const accessToken = loginBody.access_token;
  expect(accessToken).toEqual(expect.any(String));
  activeTokens.push(accessToken as string);

  const sales = await restRequest(
    `sales?select=id&user_id=eq.${encodeURIComponent(String(signupUser.id))}`,
    accessToken as string,
  );
  expect(sales.status).toBe(200);
  const salesRows = (await json(sales)) as JsonObject[];
  expect(salesRows).toHaveLength(1);

  return {
    accessToken: accessToken as string,
    salesId: Number(salesRows[0].id),
    userId: String(signupUser.id),
  };
}

async function insertLead(principal: Principal, suffix: string) {
  const response = await restRequest(
    "leads?select=id,status,sales_id",
    principal.accessToken,
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        first_name: "Release",
        last_name: `Lead ${suffix}`,
        email: `http-lead-${suffix}@release.example`,
        company_name: `HTTP Company ${suffix}`,
        source: "manual",
        sales_id: principal.salesId,
      }),
    },
  );
  expect(response.status).toBe(201);
  const rows = (await json(response)) as JsonObject[];
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ status: "new", sales_id: principal.salesId });
  return Number(rows[0].id);
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
  return (await json(response)) as JsonObject[];
}

function expectSafeAuthFailure(response: Response, body: unknown) {
  expect([401, 403]).toContain(response.status);
  expect(body).toEqual(expect.any(Object));
  expect(Object.keys(body as JsonObject)).toEqual(
    expect.arrayContaining(["message"]),
  );
  expect(JSON.stringify(body)).not.toMatch(
    /auth\.users|request\.jwt|postgres|stack trace|search_path/i,
  );
}

afterAll(async () => {
  if (!apiUrl || !anonKey) return;
  await Promise.allSettled(
    activeTokens.map((token) =>
      fetch(`${apiUrl.replace(/\/$/, "")}/auth/v1/logout?scope=global`, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      }),
    ),
  );
});

describe.runIf(Boolean(process.env.SUPABASE_DB_URL))(
  "live local Auth, RLS, RPC, and trigger boundaries",
  () => {
    it("keeps owner access, denials, and effects aligned across HTTP", async () => {
      const credential = ["local", "release", "fixture", "2026!"].join("-");
      const ownerOne = await createPrincipal("one", credential);
      const ownerTwo = await createPrincipal("two", credential);

      expect(ownerOne.userId).not.toBe(ownerTwo.userId);
      expect(ownerOne.accessToken).not.toBe(ownerTwo.accessToken);

      const ownerOneLead = await insertLead(ownerOne, "one");
      const ownerTwoLead = await insertLead(ownerTwo, "two");

      const sameOwner = await selectRows(
        "leads",
        `id=eq.${ownerOneLead}`,
        ownerOne,
      );
      expect(sameOwner).toHaveLength(1);

      const crossOwner = await selectRows(
        "leads",
        `id=eq.${ownerTwoLead}`,
        ownerOne,
      );
      expect(crossOwner).toEqual([]);

      const crossMutation = await restRequest(
        `leads?id=eq.${ownerTwoLead}&select=id`,
        ownerOne.accessToken,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ status: "qualified" }),
        },
      );
      expect(crossMutation.status).toBe(200);
      expect(await json(crossMutation)).toEqual([]);

      const crossRpc = await restRequest(
        "rpc/convert_lead_to_contact",
        ownerOne.accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            p_lead_id: ownerTwoLead,
            p_deal_name: "Cross-owner deal",
            p_deal_amount: 7500,
          }),
        },
      );
      expect(crossRpc.ok).toBe(false);
      const crossRpcBody = (await json(crossRpc)) as JsonObject;
      expect(Object.keys(crossRpcBody).sort()).toEqual([
        "code",
        "details",
        "hint",
        "message",
      ]);
      expect(crossRpcBody.message).toBe("Lead not found or not authorized");
      expect(JSON.stringify(crossRpcBody)).not.toMatch(
        /auth\.users|public\.|postgres|stack trace|search_path/i,
      );

      expect(
        await selectRows(
          "companies",
          `sales_id=eq.${ownerTwo.salesId}`,
          ownerTwo,
        ),
      ).toEqual([]);
      expect(
        await selectRows(
          "contacts",
          `sales_id=eq.${ownerTwo.salesId}`,
          ownerTwo,
        ),
      ).toEqual([]);
      expect(
        await selectRows("deals", `sales_id=eq.${ownerTwo.salesId}`, ownerTwo),
      ).toEqual([]);
      expect(
        await selectRows(
          "lead_activities",
          `lead_id=eq.${ownerTwoLead}`,
          ownerTwo,
        ),
      ).toEqual([]);
      expect(
        await selectRows("leads", `id=eq.${ownerTwoLead}`, ownerTwo),
      ).toEqual([expect.objectContaining({ status: "new" })]);

      for (const token of [
        undefined,
        ["not", "a", "token"].join("-"),
        ["invalid", "jwt", "signature"].join("."),
      ]) {
        const denied = await restRequest(
          `leads?select=id&id=eq.${ownerTwoLead}`,
          token,
        );
        expectSafeAuthFailure(denied, await json(denied));
      }

      const afterTokenFailures = await selectRows(
        "leads",
        `id=eq.${ownerTwoLead}`,
        ownerTwo,
      );
      expect(afterTokenFailures).toEqual([
        expect.objectContaining({ status: "new" }),
      ]);

      const conversion = await restRequest(
        "rpc/convert_lead_to_contact",
        ownerOne.accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            p_lead_id: ownerOneLead,
            p_deal_name: "HTTP Converted Deal",
            p_deal_amount: 12500,
          }),
        },
      );
      expect(conversion.status).toBe(200);
      const conversionBody = (await json(conversion)) as JsonObject;
      expect(conversionBody.contact_id).toEqual(expect.any(Number));
      expect(conversionBody.company_id).toEqual(expect.any(Number));
      expect(conversionBody.deal_id).toEqual(expect.any(Number));

      expect(
        await selectRows(
          "companies",
          `sales_id=eq.${ownerOne.salesId}`,
          ownerOne,
        ),
      ).toHaveLength(1);
      expect(
        await selectRows(
          "contacts",
          `sales_id=eq.${ownerOne.salesId}`,
          ownerOne,
        ),
      ).toHaveLength(1);
      expect(
        await selectRows("deals", `sales_id=eq.${ownerOne.salesId}`, ownerOne),
      ).toEqual([
        expect.objectContaining({ name: "HTTP Converted Deal", amount: 12500 }),
      ]);
      expect(
        await selectRows(
          "lead_activities",
          `lead_id=eq.${ownerOneLead}`,
          ownerOne,
        ),
      ).toEqual([
        expect.objectContaining({
          activity_type: "status_change",
          description: "Lead converted to contact",
        }),
      ]);

      for (const [index, source] of ["first", "second"].entries()) {
        const touchpoint = await restRequest(
          "touchpoints?select=id,is_first_touch,is_last_touch",
          ownerOne.accessToken,
          {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({
              lead_id: ownerOneLead,
              anonymous_id: `http-${source}`,
              touchpoint_type: "page_view",
              channel: "direct",
              source,
              sales_id: ownerOne.salesId,
            }),
          },
        );
        expect(touchpoint.status).toBe(201);
        expect(await json(touchpoint)).toEqual([
          expect.objectContaining({
            is_first_touch: index === 0,
            is_last_touch: true,
          }),
        ]);
      }

      const touchpoints = await selectRows(
        "touchpoints",
        `lead_id=eq.${ownerOneLead}&order=id.asc`,
        ownerOne,
      );
      expect(touchpoints).toEqual([
        expect.objectContaining({ is_first_touch: true, is_last_touch: false }),
        expect.objectContaining({ is_first_touch: false, is_last_touch: true }),
      ]);
    });
  },
);
