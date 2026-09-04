import { beforeAll, describe, expect, it } from "vitest";

import {
  DEMO_BILLING_ACCOUNT_ID,
  generateExactBillingInvoices,
} from "../providers/fakerest/dataGenerator/billingAccounts";

let createExactFakeInvoiceProvider: typeof import("../providers/fakerest/dataProvider").createExactFakeInvoiceProvider;

beforeAll(async () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    } satisfies Storage,
  });
  ({ createExactFakeInvoiceProvider } = await import(
    "../providers/fakerest/dataProvider"
  ));
});

describe("exact invoice provider parity", () => {
  it("starts FakeRest from canonical deterministic exact records", async () => {
    const provider = createExactFakeInvoiceProvider({
      accountId: DEMO_BILLING_ACCOUNT_ID,
      records: generateExactBillingInvoices(),
    });

    const result = await provider.listExactBillingInvoices({
      mode: "list",
      page: 1,
      per_page: 2,
      sort: "invoice_number",
      order: "ASC",
      filters: { billing_account_id: DEMO_BILLING_ACCOUNT_ID },
    });

    expect(result.total).toBe(4);
    expect(result.data).toHaveLength(2);
    expect(JSON.stringify(result.data)).not.toMatch(
      /"(?:amount_minor|numerator|denominator)":-?[0-9]/,
    );
  });
});
