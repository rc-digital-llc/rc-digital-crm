import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION,
  USD_CURRENCY_POLICY_VERSION,
  parseOrdinaryPercentageRateWire,
  parseUsdMoney,
  roundExactRatioToUsdMoney,
} from "./exactMoney";
import type { BillingInvoice } from "../types";
import { EXACT_BILLING_INVOICE_MAX_PAGE } from "../providers/types";
import type { CrmDataProvider } from "../providers/types";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  noop: vi.fn(),
}));

vi.mock("ra-supabase-core", () => ({
  supabaseAuthProvider: () => ({
    checkAuth: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  }),
  supabaseDataProvider: () => ({
    create: mocks.noop,
    delete: mocks.noop,
    deleteMany: mocks.noop,
    getList: mocks.noop,
    getMany: mocks.noop,
    getManyReference: mocks.noop,
    getOne: mocks.noop,
    update: mocks.noop,
    updateMany: mocks.noop,
  }),
}));

vi.mock("../providers/supabase/supabase", () => ({
  supabase: {
    auth: { signUp: vi.fn() },
    functions: { invoke: vi.fn() },
    rpc: mocks.rpc,
    storage: { from: vi.fn() },
  },
}));

type ExactInvoiceProvider = Pick<
  CrmDataProvider,
  | "listExactBillingInvoices"
  | "getExactBillingInvoice"
  | "saveExactBillingInvoice"
>;

type ProviderHarness = Readonly<{
  provider: ExactInvoiceProvider;
  effects: () => Promise<Readonly<{ invoices: number; audits: number }>>;
}>;

const memoryStorage = (() => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } satisfies Storage;
})();

const unknownAccountId = "31000000-0000-0000-0000-000000000299";
const zeroRate = {
  kind: "ordinary_percentage",
  numerator: "0",
  denominator: "1",
  submitted_percentage: "0.00%",
  rate_policy_version: "ordinary-percentage-v1",
} as const;

let liveProvider: ExactInvoiceProvider;
let createFakeRestExactInvoiceProvider: () => ExactInvoiceProvider;
let generateExactBillingInvoices: () => BillingInvoice[];
let demoAccountId: string;

function cloneInvoices(invoices: readonly BillingInvoice[]): BillingInvoice[] {
  return structuredClone(invoices);
}

function compareInvoices(
  left: BillingInvoice,
  right: BillingInvoice,
  field: string,
): number {
  if (field === "id" || field === "total_amount_minor") {
    const leftValue =
      field === "id" ? BigInt(left.id) : BigInt(left.total_amount.amount_minor);
    const rightValue =
      field === "id"
        ? BigInt(right.id)
        : BigInt(right.total_amount.amount_minor);
    return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
  }
  return String(left[field as keyof BillingInvoice] ?? "").localeCompare(
    String(right[field as keyof BillingInvoice] ?? ""),
  );
}

function installSupabaseRpcHarness(): () => ProviderHarness {
  const invoices = cloneInvoices(generateExactBillingInvoices());
  let auditCount = 0;

  mocks.rpc.mockImplementation(async (name: string, request: unknown) => {
    if (name === "read_billing_invoices_exact") {
      const read = request as {
        mode: "list" | "get";
        invoice_id?: string;
        page?: number;
        per_page?: number;
        sort?: string;
        order?: "ASC" | "DESC";
        filters?: {
          billing_account_id?: string;
          status?: string;
          invoice_number?: string;
        };
      };
      if (read.mode === "get") {
        return {
          data: {
            data:
              invoices.find((invoice) => invoice.id === read.invoice_id) ??
              null,
          },
          error: null,
        };
      }

      const filters = read.filters ?? {};
      const selected = invoices
        .filter(
          (invoice) =>
            (filters.billing_account_id === undefined ||
              invoice.billing_account_id === filters.billing_account_id) &&
            (filters.status === undefined ||
              invoice.status === filters.status) &&
            (filters.invoice_number === undefined ||
              invoice.invoice_number === filters.invoice_number),
        )
        .sort((left, right) => {
          const compared = compareInvoices(
            left,
            right,
            read.sort ?? "created_at",
          );
          if (compared !== 0)
            return read.order === "ASC" ? compared : -compared;
          return BigInt(left.id) < BigInt(right.id) ? -1 : 1;
        });
      const page = read.page ?? 1;
      const perPage = read.per_page ?? 50;
      const offset = (page - 1) * perPage;
      return {
        data: {
          data: selected.slice(offset, offset + perPage),
          total: selected.length,
        },
        error: null,
      };
    }

    const save = request as Record<string, unknown>;
    if (save.billing_account_id !== demoAccountId) {
      return { data: null, error: { message: "scope rejected" } };
    }
    const previous =
      save.id === undefined
        ? undefined
        : invoices.find((invoice) => invoice.id === save.id);
    if (
      (save.id !== undefined && previous === undefined) ||
      (previous !== undefined && previous.status !== "Draft")
    ) {
      return { data: null, error: { message: "scope rejected" } };
    }
    try {
      const amount = parseUsdMoney(save.amount);
      const taxRate = parseOrdinaryPercentageRateWire(save.tax_rate);
      const taxAmount = roundExactRatioToUsdMoney({
        numerator: (
          BigInt(amount.amount_minor) * BigInt(taxRate.numerator)
        ).toString(),
        denominator: taxRate.denominator,
        currency: "USD",
        currency_policy_version: USD_CURRENCY_POLICY_VERSION,
        currency_exponent: 2,
        rounding_policy_version: HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION,
      });
      const totalAmount = parseUsdMoney({
        amount_minor: (
          BigInt(amount.amount_minor) + BigInt(taxAmount.amount_minor)
        ).toString(),
        currency: "USD",
      });
      const nextId = previous
        ? previous.id
        : (
            invoices.reduce(
              (largest, invoice) =>
                BigInt(invoice.id) > largest ? BigInt(invoice.id) : largest,
              0n,
            ) + 1n
          ).toString();
      const invoice = {
        id: nextId,
        organization_id:
          previous?.organization_id ?? "31000000-0000-0000-0000-000000000100",
        billing_account_id: demoAccountId,
        company_id: previous?.company_id ?? "1",
        sales_id: previous?.sales_id ?? "1",
        invoice_number: save.invoice_number,
        description: save.description ?? undefined,
        amount,
        currency_policy_version: USD_CURRENCY_POLICY_VERSION,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        rounding_policy_version: HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION,
        line_items: save.line_items,
        status: "Draft",
        issue_date: save.issue_date as string,
        due_date: save.due_date ?? undefined,
        payment_method: save.payment_method ?? undefined,
        payment_reference: save.payment_reference ?? undefined,
        notes: save.notes ?? undefined,
        terms: save.terms ?? "Payment due within 30 days of invoice date.",
        created_at: previous?.created_at ?? "2026-09-04T20:00:00.000Z",
        updated_at: "2026-09-04T20:00:00.000Z",
      } as BillingInvoice;
      if (previous) {
        invoices[invoices.indexOf(previous)] = invoice;
      } else {
        invoices.push(invoice);
      }
      auditCount += 1;
      return { data: { result: "saved", data: invoice }, error: null };
    } catch {
      return { data: null, error: { message: "financial rejection" } };
    }
  });

  return () => ({
    provider: liveProvider,
    effects: async () => ({ invoices: invoices.length, audits: auditCount }),
  });
}

async function fakeRestHarness(): Promise<ProviderHarness> {
  const provider = createFakeRestExactInvoiceProvider();
  return {
    provider,
    effects: async () => ({
      invoices: (
        await provider.listExactBillingInvoices({
          filter: {},
          pagination: { page: 1, perPage: 100 },
          sort: { field: "id", order: "ASC" },
        })
      ).total,
      audits: 0,
    }),
  };
}

beforeAll(async () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: memoryStorage,
  });
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("VITE_SB_PUBLISHABLE_KEY", "test-publishable-key");

  ({ dataProvider: liveProvider } = await import(
    "../providers/supabase/dataProvider"
  ));
  ({ createFakeRestExactInvoiceProvider } = await import(
    "../providers/fakerest/dataProvider"
  ));
  ({ generateExactBillingInvoices } = await import(
    "../providers/fakerest/dataGenerator/billingAccounts"
  ));
  ({ DEMO_BILLING_ACCOUNT_ID: demoAccountId } = await import(
    "../providers/fakerest/dataGenerator/billingAccounts"
  ));
});

beforeEach(() => {
  vi.clearAllMocks();
});

const providerCases = [
  {
    name: "Supabase",
    create: async () => installSupabaseRpcHarness()(),
  },
  { name: "FakeRest", create: fakeRestHarness },
] as const;

describe.each(providerCases)("$name exact invoice provider", ({ create }) => {
  it("lists, filters, sorts, paginates, and gets the same canonical records", async () => {
    const { provider } = await create();
    const all = await provider.listExactBillingInvoices({
      filter: {},
      pagination: { page: 1, perPage: 100 },
      sort: { field: "invoice_number", order: "ASC" },
    });
    expect(all.total).toBe(3);
    expect(all.data.map((invoice) => invoice.invoice_number)).toEqual([
      "DEMO-EXACT-8875",
      "DEMO-EXACT-MAX",
      "DEMO-EXACT-MIN",
    ]);
    expect(all.data[0]).toMatchObject({
      amount: { amount_minor: "10000", currency: "USD" },
      tax_rate: {
        numerator: "71",
        denominator: "800",
        submitted_percentage: "8.875%",
      },
      tax_amount: { amount_minor: "888", currency: "USD" },
      total_amount: { amount_minor: "10888", currency: "USD" },
    });
    expect(JSON.stringify(all)).not.toMatch(
      /"(?:amount_minor|numerator|denominator)":-?[0-9]/,
    );
    expect(JSON.stringify(all)).not.toMatch(/line_items_legacy_evidence/);

    const draftInvoices = await provider.listExactBillingInvoices({
      filter: { billing_account_id: demoAccountId, status: "Draft" },
      pagination: { page: 1, perPage: 1 },
      sort: { field: "invoice_number", order: "ASC" },
    });
    expect(draftInvoices).toMatchObject({
      total: 1,
      data: [{ invoice_number: "DEMO-EXACT-8875" }],
    });
    await expect(
      provider.listExactBillingInvoices({
        filter: {},
        pagination: { page: EXACT_BILLING_INVOICE_MAX_PAGE, perPage: 100 },
        sort: { field: "id", order: "ASC" },
      }),
    ).resolves.toEqual({ data: [], total: 3 });
    await expect(
      provider.getExactBillingInvoice(all.data[0]!.id),
    ).resolves.toEqual({ data: all.data[0] });
    await expect(
      provider.listExactBillingInvoices({
        filter: { billing_account_id: unknownAccountId },
        pagination: { page: 1, perPage: 10 },
        sort: { field: "id", order: "ASC" },
      }),
    ).resolves.toEqual({ data: [], total: 0 });
    await expect(provider.getExactBillingInvoice("999999999")).rejects.toThrow(
      "INVOICE_READ_INVALID_NOT_FOUND",
    );
  });

  it("rejects every non-closed list/get request with stable safe errors", async () => {
    const { provider } = await create();
    const invalidLists = [
      {
        filter: { organization_id: "31000000-0000-0000-0000-000000000100" },
        pagination: { page: 1, perPage: 50 },
        sort: { field: "id", order: "ASC" },
      },
      {
        filter: {},
        pagination: { page: 0, perPage: 50 },
        sort: { field: "id", order: "ASC" },
      },
      {
        filter: {},
        pagination: {
          page: EXACT_BILLING_INVOICE_MAX_PAGE + 1,
          perPage: 100,
        },
        sort: { field: "id", order: "ASC" },
      },
      {
        filter: {},
        pagination: { page: 1, perPage: 101 },
        sort: { field: "amount", order: "ASC" },
      },
      {
        filter: {},
        pagination: { page: 1, perPage: 50 },
        sort: { field: "id", order: "SIDEWAYS" },
      },
    ];
    for (const request of invalidLists) {
      await expect(
        provider.listExactBillingInvoices(request as never),
      ).rejects.toThrow("INVOICE_READ_INVALID_REQUEST");
    }
    for (const invoiceId of [0, "01", "+1", "9223372036854775808"]) {
      await expect(
        provider.getExactBillingInvoice(invoiceId as never),
      ).rejects.toThrow("INVOICE_READ_INVALID_REQUEST");
    }
  });

  it("canonicalizes exact saves and preserves submitted percentage as evidence", async () => {
    const { provider } = await create();
    const saved = await provider.saveExactBillingInvoice({
      billing_account_id: demoAccountId,
      invoice_number: "DEMO-EXACT-CANONICAL",
      amount: { amount_minor: "01000", currency: "USD" },
      currency_policy_version: "usd-v1",
      tax_rate: zeroRate,
      rounding_policy_version: "half-away-from-zero-v1",
      line_items: [
        {
          quantity_ratio: { numerator: "01", denominator: "01" },
          unit_price: { amount_minor: "01000", currency: "USD" },
          extended_amount: { amount_minor: "01000", currency: "USD" },
          currency_policy_version: "usd-v1",
          rounding_policy_version: "half-away-from-zero-v1",
        },
      ],
      status: "Draft",
      issue_date: "2026-09-04",
    } as never);
    expect(saved).toMatchObject({
      result: "saved",
      data: {
        amount: { amount_minor: "1000", currency: "USD" },
        tax_rate: {
          numerator: "0",
          denominator: "1",
          submitted_percentage: "0.00%",
        },
        tax_amount: { amount_minor: "0", currency: "USD" },
        total_amount: { amount_minor: "1000", currency: "USD" },
        line_items: [
          {
            quantity_ratio: { numerator: "1", denominator: "1" },
            unit_price: { amount_minor: "1000", currency: "USD" },
            extended_amount: { amount_minor: "1000", currency: "USD" },
            currency_policy_version: "usd-v1",
            rounding_policy_version: "half-away-from-zero-v1",
          },
        ],
      },
    });
    expect(saved.data).not.toHaveProperty("line_items_legacy_evidence");

    const canonicalZero = await provider.saveExactBillingInvoice({
      billing_account_id: demoAccountId,
      invoice_number: "DEMO-EXACT-CANONICAL-ZERO",
      amount: { amount_minor: "-0", currency: "USD" },
      currency_policy_version: "usd-v1",
      tax_rate: zeroRate,
      rounding_policy_version: "half-away-from-zero-v1",
      line_items: [
        {
          quantity_ratio: { numerator: "-0", denominator: "1" },
          unit_price: { amount_minor: "-0", currency: "USD" },
          extended_amount: { amount_minor: "-0", currency: "USD" },
          currency_policy_version: "usd-v1",
          rounding_policy_version: "half-away-from-zero-v1",
        },
      ],
      issue_date: "2026-09-04",
    } as never);
    expect(canonicalZero.data).toMatchObject({
      amount: { amount_minor: "0" },
      tax_amount: { amount_minor: "0" },
      total_amount: { amount_minor: "0" },
      line_items: [
        {
          quantity_ratio: { numerator: "0", denominator: "1" },
          unit_price: { amount_minor: "0" },
          extended_amount: { amount_minor: "0" },
        },
      ],
    });

    const leapDate = await provider.saveExactBillingInvoice({
      billing_account_id: demoAccountId,
      invoice_number: "DEMO-EXACT-LEAP-DATE",
      amount: { amount_minor: "1", currency: "USD" },
      currency_policy_version: "usd-v1",
      tax_rate: zeroRate,
      rounding_policy_version: "half-away-from-zero-v1",
      line_items: [
        {
          quantity_ratio: { numerator: "1", denominator: "1" },
          unit_price: { amount_minor: "1", currency: "USD" },
          extended_amount: { amount_minor: "1", currency: "USD" },
          currency_policy_version: "usd-v1",
          rounding_policy_version: "half-away-from-zero-v1",
        },
      ],
      issue_date: "2024-02-29",
      due_date: "2028-02-29",
    });
    expect(leapDate.data).toMatchObject({
      issue_date: "2024-02-29",
      due_date: "2028-02-29",
    });

    const rangeDate = await provider.saveExactBillingInvoice({
      billing_account_id: demoAccountId,
      invoice_number: "DEMO-EXACT-DATE-RANGE",
      amount: { amount_minor: "1", currency: "USD" },
      currency_policy_version: "usd-v1",
      tax_rate: zeroRate,
      rounding_policy_version: "half-away-from-zero-v1",
      line_items: [
        {
          quantity_ratio: { numerator: "1", denominator: "1" },
          unit_price: { amount_minor: "1", currency: "USD" },
          extended_amount: { amount_minor: "1", currency: "USD" },
          currency_policy_version: "usd-v1",
          rounding_policy_version: "half-away-from-zero-v1",
        },
      ],
      issue_date: "0001-01-01",
      due_date: "9999-12-31",
    });
    expect(rangeDate.data).toMatchObject({
      issue_date: "0001-01-01",
      due_date: "9999-12-31",
    });
  });

  it("round-trips both signed persisted endpoints without numeric coercion", async () => {
    const { provider } = await create();
    for (const [suffix, amountMinor] of [
      ["MAXIMUM", "9223372036854775807"],
      ["MINIMUM", "-9223372036854775808"],
    ] as const) {
      const saved = await provider.saveExactBillingInvoice({
        billing_account_id: demoAccountId,
        invoice_number: `DEMO-EXACT-${suffix}`,
        amount: { amount_minor: amountMinor, currency: "USD" },
        currency_policy_version: "usd-v1",
        tax_rate: zeroRate,
        rounding_policy_version: "half-away-from-zero-v1",
        line_items: [
          {
            quantity_ratio: { numerator: "1", denominator: "1" },
            unit_price: { amount_minor: amountMinor, currency: "USD" },
            extended_amount: { amount_minor: amountMinor, currency: "USD" },
            currency_policy_version: "usd-v1",
            rounding_policy_version: "half-away-from-zero-v1",
          },
        ],
        issue_date: "2026-09-04",
      });
      expect(saved.data.amount.amount_minor).toBe(amountMinor);
      expect(saved.data.total_amount.amount_minor).toBe(amountMinor);
    }
  });

  it("rejects Sent and Paid rewrites without changing invoice or effect state", async () => {
    const harness = await create();
    for (const invoiceId of ["310002", "310003"]) {
      const beforeInvoice =
        await harness.provider.getExactBillingInvoice(invoiceId);
      expect(["Sent", "Paid"]).toContain(beforeInvoice.data.status);
      const beforeEffects = await harness.effects();

      await expect(
        harness.provider.saveExactBillingInvoice({
          id: invoiceId,
          billing_account_id: demoAccountId,
          invoice_number: `${beforeInvoice.data.invoice_number}-REWRITE`,
          amount: beforeInvoice.data.amount,
          currency_policy_version: "usd-v1",
          tax_rate: beforeInvoice.data.tax_rate,
          rounding_policy_version: "half-away-from-zero-v1",
          line_items: beforeInvoice.data.line_items,
          status: "Draft",
          issue_date: beforeInvoice.data.issue_date,
        }),
      ).rejects.toThrow("INVOICE_SAVE_INVALID_RESPONSE");

      await expect(
        harness.provider.getExactBillingInvoice(invoiceId),
      ).resolves.toEqual(beforeInvoice);
      await expect(harness.effects()).resolves.toEqual(beforeEffects);
    }
  });

  it("rejects unsafe, legacy, policy, scope, and overflow saves with zero effects", async () => {
    const harness = await create();
    const validBase = {
      billing_account_id: demoAccountId,
      invoice_number: "DEMO-EXACT-REJECTED",
      amount: { amount_minor: "1", currency: "USD" },
      currency_policy_version: "usd-v1",
      tax_rate: zeroRate,
      rounding_policy_version: "half-away-from-zero-v1",
      line_items: [
        {
          quantity_ratio: { numerator: "1", denominator: "1" },
          unit_price: { amount_minor: "1", currency: "USD" },
          extended_amount: { amount_minor: "1", currency: "USD" },
          currency_policy_version: "usd-v1",
          rounding_policy_version: "half-away-from-zero-v1",
        },
      ],
      issue_date: "2026-09-04",
    } as const;
    const missingIssueDate: Record<string, unknown> = { ...validBase };
    delete missingIssueDate.issue_date;
    const invalidRequests: Array<readonly [unknown, string]> = [
      [missingIssueDate, "REQUEST"],
      [{ ...validBase, issue_date: "today" }, "REQUEST"],
      [{ ...validBase, issue_date: "tomorrow" }, "REQUEST"],
      [{ ...validBase, issue_date: "09/04/2026" }, "REQUEST"],
      [{ ...validBase, issue_date: "2026-02-30" }, "REQUEST"],
      [{ ...validBase, issue_date: "0000-01-01" }, "REQUEST"],
      [{ ...validBase, due_date: "today" }, "REQUEST"],
      [{ ...validBase, due_date: "tomorrow" }, "REQUEST"],
      [{ ...validBase, due_date: "09/04/2026" }, "REQUEST"],
      [{ ...validBase, due_date: "2026-02-30" }, "REQUEST"],
      [{ ...validBase, due_date: "0000-02-29" }, "REQUEST"],
      [
        { ...validBase, amount: { amount_minor: 1, currency: "USD" } },
        "REQUEST",
      ],
      [
        { ...validBase, amount: { amount_minor: "1.00", currency: "USD" } },
        "REQUEST",
      ],
      [
        {
          ...validBase,
          amount: { amount_minor: "9".repeat(65), currency: "USD" },
        },
        "REQUEST",
      ],
      [
        {
          ...validBase,
          amount: { amount_minor: "9223372036854775808", currency: "USD" },
        },
        "REQUEST",
      ],
      [{ ...validBase, currency_policy_version: "usd-v2" }, "REQUEST"],
      [{ ...validBase, rounding_policy_version: "bankers-v1" }, "REQUEST"],
      [
        { ...validBase, amount: { amount_minor: "1", currency: "EUR" } },
        "REQUEST",
      ],
      [
        {
          ...validBase,
          tax_rate: { ...zeroRate, denominator: "0" },
        },
        "REQUEST",
      ],
      [
        {
          ...validBase,
          tax_rate: { ...zeroRate, rate_policy_version: "ordinary-v2" },
        },
        "REQUEST",
      ],
      [
        {
          ...validBase,
          tax_rate: {
            ...zeroRate,
            submitted_percentage: "100.0000000000%",
          },
        },
        "REQUEST",
      ],
      [
        {
          ...validBase,
          line_items: [{ quantity: "1", rate: "0.01", amount: "0.01" }],
        },
        "REQUEST",
      ],
      [{ ...validBase, line_items_legacy_evidence: [] }, "REQUEST"],
      [
        {
          ...validBase,
          organization_id: "31000000-0000-0000-0000-000000000100",
        },
        "REQUEST",
      ],
      [{ ...validBase, billing_account_id: unknownAccountId }, "RESPONSE"],
      [
        {
          ...validBase,
          amount: { amount_minor: "9223372036854775807", currency: "USD" },
          tax_rate: {
            kind: "ordinary_percentage",
            numerator: "1",
            denominator: "1",
            submitted_percentage: "100%",
            rate_policy_version: "ordinary-percentage-v1",
          },
          line_items: [
            {
              quantity_ratio: { numerator: "1", denominator: "1" },
              unit_price: {
                amount_minor: "9223372036854775807",
                currency: "USD",
              },
              extended_amount: {
                amount_minor: "9223372036854775807",
                currency: "USD",
              },
              currency_policy_version: "usd-v1",
              rounding_policy_version: "half-away-from-zero-v1",
            },
          ],
        },
        "RESPONSE",
      ],
    ];

    for (const [request, errorSuffix] of invalidRequests) {
      const before = await harness.effects();
      await expect(
        harness.provider.saveExactBillingInvoice(request),
      ).rejects.toThrow(`INVOICE_SAVE_INVALID_${errorSuffix}`);
      await expect(harness.effects()).resolves.toEqual(before);
    }
  });
});
