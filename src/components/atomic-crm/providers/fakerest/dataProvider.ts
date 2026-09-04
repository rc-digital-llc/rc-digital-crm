import {
  withLifecycleCallbacks,
  type CreateParams,
  type DataProvider,
  type Identifier,
  type ResourceCallbacks,
  type UpdateParams,
} from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";

import type {
  BillingAccount,
  BillingAccountOwner,
  BillingAutomationPrincipal,
  BillingContact,
  BillingEvidenceMetadata,
  BillingRoleAssignment,
  Company,
  Contact,
  ContactNote,
  Deal,
  DealNote,
  ExactBillingInvoice,
  ExactBillingInvoiceLineItem,
  Sale,
  SalesFormData,
  SignUpData,
  Task,
} from "../../types";
import {
  multiplyUsdMoneyByExactRatio,
  multiplyUsdMoneyByRate,
  parseCanonicalIntegerText,
  parseExactRatio,
  parseOrdinaryPercentageRate,
  parseUsdMoney,
  USD_HALF_AWAY_ROUNDING_POLICY,
} from "../../financial/exactMoney";
import type { ConfigurationContextValue } from "../../root/ConfigurationContext";
import { getActivityLog } from "../commons/activity";
import { getCompanyAvatar } from "../commons/getCompanyAvatar";
import { getContactAvatar } from "../commons/getContactAvatar";
import { mergeContacts } from "../commons/mergeContacts";
import type { CrmDataProvider } from "../types";
import type {
  BillingAccountAccessSummary,
  BillingAccountBoundaryRequest,
  BillingAccountBoundaryResponse,
  BillingEvidenceDownloadRequest,
  BillingEvidenceDownloadResponse,
  BillingEvidenceInspectionRequest,
  BillingEvidenceInspectionResponse,
  BillingEvidenceUploadRequest,
  BillingEvidenceUploadResponse,
  ExactBillingInvoiceGetRequest,
  ExactBillingInvoiceListRequest,
  ExactBillingInvoiceListResult,
  ExactBillingInvoiceSaveRequest,
} from "../types";
import { authProvider, USER_STORAGE_KEY } from "./authProvider";
import { createFakeBillingCloseProvider } from "./billingCloseProvider";
import generateData from "./dataGenerator";
import {
  DEMO_BILLING_ACCOUNT_ID,
  DEMO_EVIDENCE_EXPIRES_AT,
  DEMO_EVIDENCE_NOW,
  generateExactBillingInvoices,
} from "./dataGenerator/billingAccounts";
import { withSupabaseFilterAdapter } from "./internal/supabaseAdapter";

const baseDataProvider = fakeRestDataProvider(generateData(), true, 300);
const {
  inspectBillingCloseState: _inspectBillingCloseState,
  ...billingCloseProvider
} = createFakeBillingCloseProvider();

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const FAKE_INVOICE_SORTS = new Set([
  "id",
  "created_at",
  "updated_at",
  "invoice_number",
  "issue_date",
  "due_date",
  "status",
]);
const FAKE_INVOICE_FILTERS = new Set([
  "billing_account_id",
  "invoice_number",
  "status",
]);
const FAKE_INVOICE_STATUSES = new Set([
  "Draft",
  "Sent",
  "Viewed",
  "Paid",
  "Overdue",
  "Cancelled",
]);
const FAKE_INVOICE_SAVE_FIELDS = new Set([
  "amount",
  "billing_account_id",
  "deal_id",
  "description",
  "due_date",
  "id",
  "invoice_number",
  "issue_date",
  "line_items",
  "notes",
  "payment_method",
  "payment_reference",
  "project_id",
  "status",
  "tax_rate",
  "terms",
]);
const FAKE_LINE_ITEM_FIELDS = [
  "currency_policy_version",
  "description",
  "extended_amount",
  "quantity_ratio",
  "rounding_policy_version",
  "unit_price",
];
const FAKE_PHASE4_AUTHORITATIVE_RESOURCES = new Set([
  "billing_agreements",
  "billing_agreement_versions",
  "billing_agreement_revenue_rules",
  "billing_agreement_events",
  "billing_revenue_periods",
  "billing_revenue_submissions",
  "billing_revenue_submission_evidence",
  "billing_revenue_review_events",
  "billing_close_exceptions",
  "billing_close_exception_events",
  "billing_revenue_close_snapshots",
  "billing_calculations",
  "billing_calculation_snapshots",
  "billing_calculation_events",
  "billing_adjustment_calculations",
  "billing_calculation_links",
  "billing_adjustment_exceptions",
  "billing_agreements_support_safe",
  "billing_revenue_periods_support_safe",
  "billing_calculations_support_safe",
  "billing_calculation_lineage_support_safe",
]);

function fakeInvoiceFailure(code: string): never {
  throw new Error(code);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function fakePositiveId(value: unknown, code: string) {
  try {
    const id = parseCanonicalIntegerText(value);
    if (BigInt(id) <= 0n) fakeInvoiceFailure(code);
    return id;
  } catch {
    fakeInvoiceFailure(code);
  }
}

function fakeUuid(value: unknown, code: string) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    fakeInvoiceFailure(code);
  }
  return value;
}

function fakeDate(value: unknown, code: string) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    fakeInvoiceFailure(code);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    fakeInvoiceFailure(code);
  }
  return value;
}

function fakeNullableText(value: unknown, maximumBytes: number, code: string) {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    new TextEncoder().encode(value).byteLength > maximumBytes
  ) {
    fakeInvoiceFailure(code);
  }
  return value;
}

function fakeLineItem(
  value: unknown,
  code: string,
): ExactBillingInvoiceLineItem {
  if (!isPlainRecord(value) || !hasExactKeys(value, FAKE_LINE_ITEM_FIELDS)) {
    fakeInvoiceFailure(code);
  }
  if (
    typeof value.description !== "string" ||
    new TextEncoder().encode(value.description).byteLength > 500 ||
    value.currency_policy_version !== "usd-v1" ||
    value.rounding_policy_version !== "half-away-from-zero-v1"
  ) {
    fakeInvoiceFailure(code);
  }
  try {
    const quantityRatio = parseExactRatio(value.quantity_ratio);
    if (BigInt(quantityRatio.numerator) < 0n) fakeInvoiceFailure(code);
    if (
      !isPlainRecord(value.unit_price) ||
      !hasExactKeys(value.unit_price, ["amount_minor", "currency"]) ||
      !isPlainRecord(value.extended_amount) ||
      !hasExactKeys(value.extended_amount, ["amount_minor", "currency"])
    ) {
      fakeInvoiceFailure(code);
    }
    const unitPrice = parseUsdMoney(value.unit_price);
    const extendedAmount = parseUsdMoney(value.extended_amount);
    const expected = multiplyUsdMoneyByExactRatio(
      unitPrice,
      quantityRatio,
      USD_HALF_AWAY_ROUNDING_POLICY,
    );
    if (expected.amount_minor !== extendedAmount.amount_minor) {
      fakeInvoiceFailure(code);
    }
    return Object.freeze({
      description: value.description,
      quantity_ratio: quantityRatio,
      unit_price: unitPrice,
      extended_amount: extendedAmount,
      currency_policy_version: "usd-v1",
      rounding_policy_version: "half-away-from-zero-v1",
    });
  } catch {
    fakeInvoiceFailure(code);
  }
}

function fakeLineItems(value: unknown, code: string) {
  if (!Array.isArray(value) || value.length > 100) fakeInvoiceFailure(code);
  return value.map((item) => fakeLineItem(item, code));
}

function cloneExactInvoice(invoice: ExactBillingInvoice): ExactBillingInvoice {
  return {
    ...invoice,
    amount: parseUsdMoney(invoice.amount),
    tax_rate: parseOrdinaryPercentageRate(invoice.tax_rate),
    tax_amount: parseUsdMoney(invoice.tax_amount),
    total_amount: parseUsdMoney(invoice.total_amount),
    line_items: invoice.line_items.map((item) =>
      fakeLineItem(item, "INVOICE_READ_INVALID_RESPONSE"),
    ),
  };
}

function normalizeFakeListRequest(
  value: unknown,
): ExactBillingInvoiceListRequest {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      "filters",
      "mode",
      "order",
      "page",
      "per_page",
      "sort",
    ]) ||
    value.mode !== "list" ||
    !Number.isSafeInteger(value.page) ||
    Number(value.page) < 1 ||
    Number(value.page) > 1_000_000 ||
    !Number.isSafeInteger(value.per_page) ||
    Number(value.per_page) < 1 ||
    Number(value.per_page) > 100 ||
    typeof value.sort !== "string" ||
    !FAKE_INVOICE_SORTS.has(value.sort) ||
    (value.order !== "ASC" && value.order !== "DESC") ||
    !isPlainRecord(value.filters) ||
    Object.keys(value.filters).some((key) => !FAKE_INVOICE_FILTERS.has(key))
  ) {
    fakeInvoiceFailure("INVOICE_READ_INVALID_REQUEST");
  }
  const accountId = value.filters.billing_account_id;
  const invoiceNumber = value.filters.invoice_number;
  const status = value.filters.status;
  if (
    (accountId !== undefined &&
      (typeof accountId !== "string" || !UUID_PATTERN.test(accountId))) ||
    (invoiceNumber !== undefined &&
      (typeof invoiceNumber !== "string" ||
        new TextEncoder().encode(invoiceNumber).byteLength > 200)) ||
    (status !== undefined &&
      (typeof status !== "string" || !FAKE_INVOICE_STATUSES.has(status)))
  ) {
    fakeInvoiceFailure("INVOICE_READ_INVALID_REQUEST");
  }
  return value as ExactBillingInvoiceListRequest;
}

function normalizeFakeGetRequest(
  value: unknown,
): ExactBillingInvoiceGetRequest {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["invoice_id", "mode"]) ||
    value.mode !== "get"
  ) {
    fakeInvoiceFailure("INVOICE_READ_INVALID_REQUEST");
  }
  return {
    mode: "get",
    invoice_id: fakePositiveId(
      value.invoice_id,
      "INVOICE_READ_INVALID_REQUEST",
    ),
  };
}

function normalizeFakeSaveRequest(
  value: unknown,
): ExactBillingInvoiceSaveRequest {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).some((key) => !FAKE_INVOICE_SAVE_FIELDS.has(key)) ||
    !Object.hasOwn(value, "amount") ||
    !Object.hasOwn(value, "billing_account_id") ||
    !Object.hasOwn(value, "invoice_number") ||
    !Object.hasOwn(value, "line_items") ||
    !Object.hasOwn(value, "status") ||
    !Object.hasOwn(value, "tax_rate") ||
    value.status !== "Draft" ||
    typeof value.invoice_number !== "string" ||
    value.invoice_number.trim() === "" ||
    new TextEncoder().encode(value.invoice_number).byteLength > 100 ||
    !isPlainRecord(value.amount) ||
    !hasExactKeys(value.amount, ["amount_minor", "currency"])
  ) {
    fakeInvoiceFailure("INVOICE_SAVE_INVALID_REQUEST");
  }
  try {
    const amount = parseUsdMoney(value.amount);
    const taxRate = parseOrdinaryPercentageRate(value.tax_rate);
    const lineItems = fakeLineItems(
      value.line_items,
      "INVOICE_SAVE_INVALID_REQUEST",
    );
    if (
      lineItems.length > 0 &&
      lineItems.reduce(
        (sum, item) => sum + BigInt(item.extended_amount.amount_minor),
        0n,
      ) !== BigInt(amount.amount_minor)
    ) {
      fakeInvoiceFailure("INVOICE_SAVE_INVALID_REQUEST");
    }
    const taxAmount = multiplyUsdMoneyByRate(
      amount,
      taxRate,
      USD_HALF_AWAY_ROUNDING_POLICY,
    );
    parseCanonicalIntegerText(
      (BigInt(amount.amount_minor) + BigInt(taxAmount.amount_minor)).toString(),
    );
    return {
      ...(value.id === undefined
        ? {}
        : {
            id: fakePositiveId(value.id, "INVOICE_SAVE_INVALID_REQUEST"),
          }),
      billing_account_id: fakeUuid(
        value.billing_account_id,
        "INVOICE_SAVE_INVALID_REQUEST",
      ),
      invoice_number: value.invoice_number,
      ...(value.description === undefined
        ? {}
        : {
            description: fakeNullableText(
              value.description,
              2000,
              "INVOICE_SAVE_INVALID_REQUEST",
            ),
          }),
      amount,
      tax_rate: taxRate,
      line_items: lineItems,
      status: "Draft",
      ...(value.project_id === undefined
        ? {}
        : {
            project_id:
              value.project_id === null
                ? null
                : fakePositiveId(
                    value.project_id,
                    "INVOICE_SAVE_INVALID_REQUEST",
                  ),
          }),
      ...(value.deal_id === undefined
        ? {}
        : {
            deal_id:
              value.deal_id === null
                ? null
                : fakePositiveId(value.deal_id, "INVOICE_SAVE_INVALID_REQUEST"),
          }),
      ...(value.issue_date === undefined
        ? {}
        : {
            issue_date: fakeDate(
              value.issue_date,
              "INVOICE_SAVE_INVALID_REQUEST",
            ),
          }),
      ...(value.due_date === undefined
        ? {}
        : {
            due_date:
              value.due_date === null
                ? null
                : fakeDate(value.due_date, "INVOICE_SAVE_INVALID_REQUEST"),
          }),
      ...(value.payment_method === undefined
        ? {}
        : {
            payment_method: fakeNullableText(
              value.payment_method,
              500,
              "INVOICE_SAVE_INVALID_REQUEST",
            ),
          }),
      ...(value.payment_reference === undefined
        ? {}
        : {
            payment_reference: fakeNullableText(
              value.payment_reference,
              500,
              "INVOICE_SAVE_INVALID_REQUEST",
            ),
          }),
      ...(value.notes === undefined
        ? {}
        : {
            notes: fakeNullableText(
              value.notes,
              10000,
              "INVOICE_SAVE_INVALID_REQUEST",
            ),
          }),
      ...(value.terms === undefined
        ? {}
        : {
            terms: fakeNullableText(
              value.terms,
              5000,
              "INVOICE_SAVE_INVALID_REQUEST",
            ),
          }),
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("INVOICE_")) {
      throw error;
    }
    fakeInvoiceFailure("INVOICE_SAVE_INVALID_REQUEST");
  }
}

function compareFakeInvoiceField(
  left: ExactBillingInvoice,
  right: ExactBillingInvoice,
  field: ExactBillingInvoiceListRequest["sort"],
) {
  if (field === "id") {
    const leftId = BigInt(left.id);
    const rightId = BigInt(right.id);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  }
  const leftValue = left[field] ?? "";
  const rightValue = right[field] ?? "";
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

export function createExactFakeInvoiceProvider(
  options: {
    accountId?: string;
    companyId?: string;
    records?: ExactBillingInvoice[];
  } = {},
) {
  const accountId = options.accountId ?? DEMO_BILLING_ACCOUNT_ID;
  const records = (options.records ?? generateExactBillingInvoices()).map(
    cloneExactInvoice,
  );
  const companyId = options.companyId ?? records[0]?.company_id ?? "1";

  return {
    async listExactBillingInvoices(
      requestValue: unknown,
    ): Promise<ExactBillingInvoiceListResult> {
      const request = normalizeFakeListRequest(requestValue);
      const filtered = records.filter(
        (record) =>
          record.billing_account_id === accountId &&
          (request.filters.billing_account_id === undefined ||
            request.filters.billing_account_id === record.billing_account_id) &&
          (request.filters.invoice_number === undefined ||
            request.filters.invoice_number === record.invoice_number) &&
          (request.filters.status === undefined ||
            request.filters.status === record.status),
      );
      const direction = request.order === "ASC" ? 1 : -1;
      filtered.sort(
        (left, right) =>
          compareFakeInvoiceField(left, right, request.sort) * direction ||
          compareFakeInvoiceField(left, right, "id"),
      );
      const start = (request.page - 1) * request.per_page;
      return {
        data: filtered
          .slice(start, start + request.per_page)
          .map(cloneExactInvoice),
        total: filtered.length,
      };
    },
    async getExactBillingInvoice(requestValue: unknown) {
      const request = normalizeFakeGetRequest(requestValue);
      const record = records.find(
        (candidate) =>
          candidate.id === request.invoice_id &&
          candidate.billing_account_id === accountId,
      );
      if (!record) fakeInvoiceFailure("INVOICE_READ_NOT_FOUND");
      return cloneExactInvoice(record);
    },
    async saveExactBillingInvoice(requestValue: unknown) {
      const request = normalizeFakeSaveRequest(requestValue);
      if (request.billing_account_id !== accountId) {
        fakeInvoiceFailure("INVOICE_SAVE_NOT_AUTHORIZED");
      }
      const existing = request.id
        ? records.find((candidate) => candidate.id === request.id)
        : undefined;
      if (request.id && (!existing || existing.status !== "Draft")) {
        fakeInvoiceFailure("INVOICE_SAVE_NOT_AUTHORIZED");
      }
      const taxAmount = multiplyUsdMoneyByRate(
        request.amount,
        request.tax_rate,
        USD_HALF_AWAY_ROUNDING_POLICY,
      );
      const totalAmount = parseUsdMoney({
        amount_minor: (
          BigInt(request.amount.amount_minor) + BigInt(taxAmount.amount_minor)
        ).toString(),
        currency: "USD",
      });
      const nextId =
        records.reduce(
          (maximum, record) =>
            BigInt(record.id) > maximum ? BigInt(record.id) : maximum,
          0n,
        ) + 1n;
      const record: ExactBillingInvoice = {
        id: existing?.id ?? nextId.toString(),
        created_at: existing?.created_at ?? DEMO_EVIDENCE_NOW,
        updated_at: DEMO_EVIDENCE_NOW,
        billing_account_id: accountId,
        company_id: existing?.company_id ?? companyId,
        project_id: request.project_id ?? null,
        deal_id: request.deal_id ?? null,
        invoice_number: request.invoice_number,
        description: request.description ?? null,
        amount: request.amount,
        currency_policy_version: "usd-v1",
        tax_rate: request.tax_rate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        rounding_policy_version: "half-away-from-zero-v1",
        line_items: request.line_items,
        status: "Draft",
        issue_date: request.issue_date ?? "2026-09-01",
        due_date: request.due_date ?? null,
        paid_date: null,
        payment_method: request.payment_method ?? null,
        payment_reference: request.payment_reference ?? null,
        notes: request.notes ?? null,
        terms:
          request.terms ??
          existing?.terms ??
          "Payment due within 30 days of invoice date.",
      };
      if (existing) records.splice(records.indexOf(existing), 1, record);
      else records.push(record);
      return cloneExactInvoice(record);
    },
  };
}

const exactInvoiceProvider = createExactFakeInvoiceProvider();

const TASK_MARKED_AS_DONE = "TASK_MARKED_AS_DONE";
const TASK_MARKED_AS_UNDONE = "TASK_MARKED_AS_UNDONE";
const TASK_DONE_NOT_CHANGED = "TASK_DONE_NOT_CHANGED";
let taskUpdateType = TASK_DONE_NOT_CHANGED;

const demoEvidenceCapability = (
  operation: "upload" | "download",
  evidenceId: string,
) => `demo://billing-evidence/${operation}/${evidenceId}?expires-in=60`;

const getEvidenceDenialReason = (evidence: BillingEvidenceMetadata) => {
  if (evidence.lifecycle_status !== "active") return "EVIDENCE_NOT_ACTIVE";
  if (evidence.inspection_status === "quarantined")
    return "EVIDENCE_QUARANTINED";
  if (evidence.inspection_status === "rejected") return "EVIDENCE_REJECTED";
  if (
    Date.parse(evidence.retention_expires_at) <= Date.parse(DEMO_EVIDENCE_NOW)
  )
    return "EVIDENCE_EXPIRED";
  if (evidence.is_held) return "EVIDENCE_HELD";
  return null;
};

const processCompanyLogo = async (params: any) => {
  let logo = params.data.logo;

  if (typeof logo !== "object" || logo === null || !logo.src) {
    logo = await getCompanyAvatar(params.data);
  } else if (logo.rawFile instanceof File) {
    const base64Logo = await convertFileToBase64(logo);
    logo = { src: base64Logo, title: logo.title };
  }

  return {
    ...params,
    data: {
      ...params.data,
      logo,
    },
  };
};

async function processContactAvatar(
  params: UpdateParams<Contact>,
): Promise<UpdateParams<Contact>>;

async function processContactAvatar(
  params: CreateParams<Contact>,
): Promise<CreateParams<Contact>>;

async function processContactAvatar(
  params: CreateParams<Contact> | UpdateParams<Contact>,
): Promise<CreateParams<Contact> | UpdateParams<Contact>> {
  const { data } = params;
  if (data.avatar?.src || !data.email_jsonb || !data.email_jsonb.length) {
    return params;
  }
  const avatarUrl = await getContactAvatar(data);

  // Clone the data and modify the clone
  const newData = { ...data, avatar: { src: avatarUrl || undefined } };

  return { ...params, data: newData };
}

async function fetchAndUpdateCompanyData(
  params: UpdateParams<Contact>,
  dataProvider: DataProvider,
): Promise<UpdateParams<Contact>>;

async function fetchAndUpdateCompanyData(
  params: CreateParams<Contact>,
  dataProvider: DataProvider,
): Promise<CreateParams<Contact>>;

async function fetchAndUpdateCompanyData(
  params: CreateParams<Contact> | UpdateParams<Contact>,
  dataProvider: DataProvider,
): Promise<CreateParams<Contact> | UpdateParams<Contact>> {
  const { data } = params;
  const newData = { ...data };

  if (!newData.company_id) {
    return params;
  }

  const { data: company } = await dataProvider.getOne("companies", {
    id: newData.company_id,
  });

  if (!company) {
    return params;
  }

  newData.company_name = company.name;
  return { ...params, data: newData };
}

const dataProviderWithCustomMethod: CrmDataProvider = {
  ...baseDataProvider,
  ...billingCloseProvider,
  listExactBillingInvoices: exactInvoiceProvider.listExactBillingInvoices,
  getExactBillingInvoice: exactInvoiceProvider.getExactBillingInvoice,
  saveExactBillingInvoice: exactInvoiceProvider.saveExactBillingInvoice,
  getList: async (resource, params) => {
    if (resource === "invoices") {
      return exactInvoiceProvider.listExactBillingInvoices({
        mode: "list",
        page: params.pagination?.page ?? 1,
        per_page: params.pagination?.perPage ?? 25,
        sort: params.sort?.field ?? "created_at",
        order: params.sort?.order ?? "DESC",
        filters: params.filter ?? {},
      });
    }
    return baseDataProvider.getList(resource, params);
  },
  getOne: async (resource, params) => {
    if (resource === "invoices") {
      return {
        data: await exactInvoiceProvider.getExactBillingInvoice({
          mode: "get",
          invoice_id: params.id,
        }),
      };
    }
    return baseDataProvider.getOne(resource, params);
  },
  create: async (resource, params) => {
    if (resource === "invoices") {
      return {
        data: await exactInvoiceProvider.saveExactBillingInvoice(params.data),
      };
    }
    if (FAKE_PHASE4_AUTHORITATIVE_RESOURCES.has(resource)) {
      throw new Error("BILLING_CLOSE_INVALID_REQUEST");
    }
    return baseDataProvider.create(resource, params);
  },
  update: async (resource, params) => {
    if (resource === "invoices") {
      if (!isPlainRecord(params.data)) {
        fakeInvoiceFailure("INVOICE_SAVE_INVALID_REQUEST");
      }
      return {
        data: await exactInvoiceProvider.saveExactBillingInvoice({
          ...params.data,
          id: params.id,
        }),
      };
    }
    if (FAKE_PHASE4_AUTHORITATIVE_RESOURCES.has(resource)) {
      throw new Error("BILLING_CLOSE_INVALID_REQUEST");
    }
    return baseDataProvider.update(resource, params);
  },
  delete: async (resource, params) => {
    if (FAKE_PHASE4_AUTHORITATIVE_RESOURCES.has(resource)) {
      throw new Error("BILLING_CLOSE_INVALID_REQUEST");
    }
    return baseDataProvider.delete(resource, params);
  },
  unarchiveDeal: async (deal: Deal) => {
    // get all deals where stage is the same as the deal to unarchive
    const { data: deals } = await baseDataProvider.getList<Deal>("deals", {
      filter: { stage: deal.stage },
      pagination: { page: 1, perPage: 1000 },
      sort: { field: "index", order: "ASC" },
    });

    // set index for each deal starting from 1, if the deal to unarchive is found, set its index to the last one
    const updatedDeals = deals.map((d, index) => ({
      ...d,
      index: d.id === deal.id ? 0 : index + 1,
      archived_at: d.id === deal.id ? null : d.archived_at,
    }));

    return await Promise.all(
      updatedDeals.map((updatedDeal) =>
        dataProvider.update("deals", {
          id: updatedDeal.id,
          data: updatedDeal,
          previousData: deals.find((d) => d.id === updatedDeal.id),
        }),
      ),
    );
  },
  // We simulate a remote endpoint that is in charge of returning activity log
  getActivityLog: async (companyId?: Identifier) => {
    return getActivityLog(dataProvider, companyId);
  },
  signUp: async ({
    email,
    password,
    first_name,
    last_name,
  }: SignUpData): Promise<{ id: string; email: string; password: string }> => {
    const user = await baseDataProvider.create("sales", {
      data: {
        email,
        first_name,
        last_name,
      },
    });

    return {
      ...user.data,
      password,
    };
  },
  salesCreate: async ({ ...data }: SalesFormData): Promise<Sale> => {
    const response = await dataProvider.create("sales", {
      data: {
        ...data,
        password: "new_password",
      },
    });

    return response.data;
  },
  salesUpdate: async (
    id: Identifier,
    data: Partial<Omit<SalesFormData, "password">>,
  ): Promise<Sale> => {
    const { data: previousData } = await dataProvider.getOne<Sale>("sales", {
      id,
    });

    if (!previousData) {
      throw new Error("User not found");
    }

    const { data: sale } = await dataProvider.update<Sale>("sales", {
      id,
      data,
      previousData,
    });
    return { ...sale, user_id: sale.id.toString() };
  },
  isInitialized: async (): Promise<boolean> => {
    const sales = await dataProvider.getList<Sale>("sales", {
      filter: {},
      pagination: { page: 1, perPage: 1 },
      sort: { field: "id", order: "ASC" },
    });
    if (sales.data.length === 0) {
      return false;
    }
    return true;
  },
  updatePassword: async (id: Identifier): Promise<true> => {
    const currentUser = await authProvider.getIdentity?.();
    if (!currentUser) {
      throw new Error("User not found");
    }
    const { data: previousData } = await dataProvider.getOne<Sale>("sales", {
      id: currentUser.id,
    });

    if (!previousData) {
      throw new Error("User not found");
    }

    await dataProvider.update("sales", {
      id,
      data: {
        password: "demo_newPassword",
      },
      previousData,
    });

    return true;
  },
  mergeContacts: async (sourceId: Identifier, targetId: Identifier) => {
    return mergeContacts(sourceId, targetId, baseDataProvider);
  },
  saveBillingAccountBoundary: async (
    request: BillingAccountBoundaryRequest,
  ): Promise<BillingAccountBoundaryResponse> => {
    const now = DEMO_EVIDENCE_NOW;
    const account = request.account_id
      ? (
          await baseDataProvider.getOne<BillingAccount>("billing_accounts", {
            id: request.account_id,
          })
        ).data
      : null;
    const organizationId = account
      ? account.organization_id
      : (
          await baseDataProvider.getList("billing_organizations", {
            filter: { status: "active" },
            pagination: { page: 1, perPage: 2 },
            sort: { field: "id", order: "ASC" },
          })
        ).data[0]?.id;

    if (!organizationId) throw new Error("Account changes were not saved");

    const accountData: BillingAccount = {
      id: account?.id ?? crypto.randomUUID(),
      organization_id: String(organizationId),
      company_id: account?.company_id ?? null,
      customer_name: request.customer_name,
      billing_status: request.billing_status,
      created_at: account?.created_at ?? now,
      updated_at: now,
      ended_at: request.billing_status === "closed" ? now : null,
      end_reason:
        request.billing_status === "active" ? null : request.lifecycle_reason,
    };

    if (account) {
      await baseDataProvider.update<BillingAccount>("billing_accounts", {
        id: account.id,
        data: accountData,
        previousData: account,
      });
    } else {
      await baseDataProvider.create<BillingAccount>("billing_accounts", {
        data: accountData,
      });
    }

    const owners = await baseDataProvider.getList<BillingAccountOwner>(
      "billing_account_owners",
      {
        filter: { account_id: accountData.id, effective_until: null },
        pagination: { page: 1, perPage: 10 },
        sort: { field: "effective_from", order: "DESC" },
      },
    );
    const currentOwner = owners.data[0];
    if (currentOwner?.sales_id !== request.responsible_owner_sales_id) {
      if (currentOwner) {
        await baseDataProvider.update<BillingAccountOwner>(
          "billing_account_owners",
          {
            id: currentOwner.id,
            data: {
              effective_until: now,
              end_reason: "Responsible owner reassigned",
            },
            previousData: currentOwner,
          },
        );
      }
      await baseDataProvider.create<BillingAccountOwner>(
        "billing_account_owners",
        {
          data: {
            id: crypto.randomUUID(),
            organization_id: accountData.organization_id,
            account_id: accountData.id,
            sales_id: request.responsible_owner_sales_id,
            effective_from: now,
            effective_until: null,
            end_reason: null,
            created_at: now,
          },
        },
      );
    }

    for (const contact of request.billing_contacts) {
      const previousContact = contact.id
        ? (
            await baseDataProvider.getOne<BillingContact>("billing_contacts", {
              id: contact.id,
            })
          ).data
        : null;
      const contactData: BillingContact = {
        id: previousContact?.id ?? crypto.randomUUID(),
        organization_id: accountData.organization_id,
        account_id: accountData.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        preferred_contact_method: contact.preferred_contact_method,
        auth_user_id: contact.auth_user_id,
        active: contact.active,
        effective_from: previousContact?.effective_from ?? now,
        effective_until: contact.active ? null : now,
        end_reason: contact.active ? null : contact.end_reason,
        created_at: previousContact?.created_at ?? now,
        updated_at: now,
      };
      if (previousContact) {
        await baseDataProvider.update<BillingContact>("billing_contacts", {
          id: previousContact.id,
          data: contactData,
          previousData: previousContact,
        });
      } else {
        await baseDataProvider.create<BillingContact>("billing_contacts", {
          data: contactData,
        });
      }
    }

    return accountData;
  },
  getBillingAccountAccessSummary: async (
    accountId: string,
  ): Promise<BillingAccountAccessSummary> => {
    const { data: account } = await baseDataProvider.getOne<BillingAccount>(
      "billing_accounts",
      { id: accountId },
    );
    const { data: assignments } =
      await baseDataProvider.getList<BillingRoleAssignment>(
        "billing_role_assignments",
        {
          filter: { account_id: accountId },
          pagination: { page: 1, perPage: 100 },
          sort: { field: "created_at", order: "ASC" },
        },
      );
    const roles = await Promise.all(
      assignments.map(async (assignment) => {
        const [{ data: sale }, { data: role }] = await Promise.all([
          baseDataProvider.getOne<Sale>("sales", { id: assignment.sales_id }),
          baseDataProvider.getOne("billing_roles", { id: assignment.role }),
        ]);
        return {
          assignment_id: assignment.id,
          role: assignment.role,
          description: String(role.description),
          subject_display_name: `${sale.first_name} ${sale.last_name}`.trim(),
          scope_label: account.customer_name,
          effective_from: assignment.valid_from,
          effective_until: assignment.valid_until,
          status:
            assignment.disabled_at || assignment.valid_until
              ? ("ended" as const)
              : ("active" as const),
          reason: assignment.disabled_reason,
        };
      }),
    );
    return { roles, automation: [] };
  },
  assignBillingRole: async (request: {
    account_id: string;
    sales_id: number;
    role: string;
  }) => {
    const { data: account } = await baseDataProvider.getOne<BillingAccount>(
      "billing_accounts",
      { id: request.account_id },
    );
    const assignmentId = crypto.randomUUID();
    await baseDataProvider.create<BillingRoleAssignment>(
      "billing_role_assignments",
      {
        data: {
          id: assignmentId,
          organization_id: account.organization_id,
          account_id: account.id,
          sales_id: request.sales_id,
          role: request.role as BillingRoleAssignment["role"],
          valid_from: DEMO_EVIDENCE_NOW,
          valid_until: null,
          disabled_at: null,
          disabled_reason: null,
          created_at: DEMO_EVIDENCE_NOW,
          updated_at: DEMO_EVIDENCE_NOW,
        },
      },
    );
    return { assignment_id: assignmentId };
  },
  endBillingRoleAssignment: async (request: {
    assignment_id: string;
    reason: string;
  }) => {
    const { data: previousData } =
      await baseDataProvider.getOne<BillingRoleAssignment>(
        "billing_role_assignments",
        { id: request.assignment_id },
      );
    await baseDataProvider.update<BillingRoleAssignment>(
      "billing_role_assignments",
      {
        id: previousData.id,
        data: {
          valid_until: DEMO_EVIDENCE_NOW,
          disabled_at: DEMO_EVIDENCE_NOW,
          disabled_reason: request.reason,
          updated_at: DEMO_EVIDENCE_NOW,
        },
        previousData,
      },
    );
    return { assignment_id: previousData.id };
  },
  disableBillingAutomationPrincipal: async (request: {
    account_id: string;
    principal_id: string;
    reason: string;
  }) => {
    const { data: previousData } =
      await baseDataProvider.getOne<BillingAutomationPrincipal>(
        "billing_automation_principals",
        { id: request.principal_id },
      );
    await baseDataProvider.update<BillingAutomationPrincipal>(
      "billing_automation_principals",
      {
        id: previousData.id,
        data: {
          status: "disabled",
          disabled_at: DEMO_EVIDENCE_NOW,
          disabled_reason: request.reason,
          updated_at: DEMO_EVIDENCE_NOW,
        },
        previousData,
      },
    );
    return { principal_id: previousData.id };
  },
  beginBillingEvidenceUpload: async (
    request: BillingEvidenceUploadRequest,
  ): Promise<BillingEvidenceUploadResponse> => {
    const { data: account } = await baseDataProvider.getOne<BillingAccount>(
      "billing_accounts",
      { id: request.account_id },
    );
    const evidenceId = `31000000-0000-0000-0000-${request.sha256.slice(0, 12)}`;
    const evidence: BillingEvidenceMetadata = {
      id: evidenceId,
      organization_id: account.organization_id,
      account_id: account.id,
      kind: request.kind,
      original_filename: request.original_filename,
      uploader_label: "Jane Doe",
      mime_type: request.mime_type,
      size_bytes: request.size_bytes,
      inspection_status: "quarantined",
      inspection_reason_code: null,
      retention_expires_at: "2030-01-01T00:00:00.000Z",
      is_held: false,
      lifecycle_status: "active",
      end_reason: null,
      created_at: DEMO_EVIDENCE_NOW,
      updated_at: DEMO_EVIDENCE_NOW,
    };

    await baseDataProvider.create<BillingEvidenceMetadata>(
      "billing_evidence_support_safe",
      { data: evidence },
    );

    return {
      result: "ready",
      evidence_id: evidenceId,
      url: demoEvidenceCapability("upload", evidenceId),
      expires_at: DEMO_EVIDENCE_EXPIRES_AT,
    };
  },
  finalizeBillingEvidenceInspection: async (
    request: BillingEvidenceInspectionRequest,
  ): Promise<BillingEvidenceInspectionResponse> => {
    const { data: previousData } =
      await baseDataProvider.getOne<BillingEvidenceMetadata>(
        "billing_evidence_support_safe",
        { id: request.evidence_id },
      );
    if (previousData.inspection_status !== "quarantined") {
      return { result: "duplicate", reason_code: "DUPLICATE_COMMAND" };
    }

    await baseDataProvider.update<BillingEvidenceMetadata>(
      "billing_evidence_support_safe",
      {
        id: previousData.id,
        data: {
          inspection_status: request.decision,
          inspection_reason_code: request.reason_code,
          updated_at: DEMO_EVIDENCE_NOW,
        },
        previousData,
      },
    );
    return {
      result: "applied",
      reason_code: "INSPECTION_RECORDED",
      evidence_id: previousData.id,
      decision: request.decision,
    };
  },
  createBillingEvidenceDownload: async (
    request: BillingEvidenceDownloadRequest,
  ): Promise<BillingEvidenceDownloadResponse> => {
    const { data: evidence } =
      await baseDataProvider.getOne<BillingEvidenceMetadata>(
        "billing_evidence_support_safe",
        { id: request.evidence_id },
      );
    const reasonCode = getEvidenceDenialReason(evidence);
    if (reasonCode) {
      return { result: "denied", reason_code: reasonCode };
    }

    return {
      result: "ready",
      evidence_id: evidence.id,
      url: demoEvidenceCapability("download", evidence.id),
      expires_at: DEMO_EVIDENCE_EXPIRES_AT,
    };
  },
  getConfiguration: async (): Promise<ConfigurationContextValue> => {
    const { data } = await baseDataProvider.getOne("configuration", { id: 1 });
    return (data?.config as ConfigurationContextValue) ?? {};
  },
  updateConfiguration: async (
    config: ConfigurationContextValue,
  ): Promise<ConfigurationContextValue> => {
    const { data: prev } = await baseDataProvider.getOne("configuration", {
      id: 1,
    });
    await baseDataProvider.update("configuration", {
      id: 1,
      data: { config },
      previousData: prev,
    });
    return config;
  },
};

async function updateCompany(
  companyId: Identifier,
  updateFn: (company: Company) => Partial<Company>,
) {
  const { data: company } = await dataProvider.getOne<Company>("companies", {
    id: companyId,
  });

  return await dataProvider.update("companies", {
    id: companyId,
    data: {
      ...updateFn(company),
    },
    previousData: company,
  });
}

const processConfigLogo = async (logo: any): Promise<string> => {
  if (typeof logo === "string") return logo;
  if (logo?.rawFile instanceof File) {
    return (await convertFileToBase64(logo)) as string;
  }
  return logo?.src ?? "";
};

const preserveAttachmentMimeType = <
  NoteType extends { attachments?: Array<{ rawFile?: File; type?: string }> },
>(
  note: NoteType,
): NoteType => ({
  ...note,
  attachments: (note.attachments ?? []).map((attachment) => ({
    ...attachment,
    type: attachment.type ?? attachment.rawFile?.type,
  })),
});

export const dataProvider = withLifecycleCallbacks(
  withSupabaseFilterAdapter(dataProviderWithCustomMethod),
  [
    {
      resource: "configuration",
      beforeUpdate: async (params) => {
        const config = params.data.config;
        if (config) {
          config.lightModeLogo = await processConfigLogo(config.lightModeLogo);
          config.darkModeLogo = await processConfigLogo(config.darkModeLogo);
        }
        return params;
      },
    },
    {
      resource: "sales",
      beforeCreate: async (params) => {
        const { data } = params;
        // If administrator role is not set, we simply set it to false
        if (data.administrator == null) {
          data.administrator = false;
        }
        return params;
      },
      afterSave: async (data) => {
        // Since the current user is stored in localStorage in fakerest authProvider
        // we need to update it to keep information up to date in the UI
        const currentUser = await authProvider.getIdentity?.();
        if (currentUser?.id === data.id) {
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data));
        }
        return data;
      },
      beforeDelete: async (params) => {
        if (params.meta?.identity?.id == null) {
          throw new Error("Identity MUST be set in meta");
        }

        const newSaleId = params.meta.identity.id as Identifier;

        const [companies, contacts, contactNotes, deals] = await Promise.all([
          dataProvider.getList("companies", {
            filter: { sales_id: params.id },
            pagination: {
              page: 1,
              perPage: 10_000,
            },
            sort: { field: "id", order: "ASC" },
          }),
          dataProvider.getList("contacts", {
            filter: { sales_id: params.id },
            pagination: {
              page: 1,
              perPage: 10_000,
            },
            sort: { field: "id", order: "ASC" },
          }),
          dataProvider.getList("contact_notes", {
            filter: { sales_id: params.id },
            pagination: {
              page: 1,
              perPage: 10_000,
            },
            sort: { field: "id", order: "ASC" },
          }),
          dataProvider.getList("deals", {
            filter: { sales_id: params.id },
            pagination: {
              page: 1,
              perPage: 10_000,
            },
            sort: { field: "id", order: "ASC" },
          }),
        ]);

        await Promise.all([
          dataProvider.updateMany("companies", {
            ids: companies.data.map((company) => company.id),
            data: {
              sales_id: newSaleId,
            },
          }),
          dataProvider.updateMany("contacts", {
            ids: contacts.data.map((company) => company.id),
            data: {
              sales_id: newSaleId,
            },
          }),
          dataProvider.updateMany("contact_notes", {
            ids: contactNotes.data.map((company) => company.id),
            data: {
              sales_id: newSaleId,
            },
          }),
          dataProvider.updateMany("deals", {
            ids: deals.data.map((company) => company.id),
            data: {
              sales_id: newSaleId,
            },
          }),
        ]);

        return params;
      },
    } satisfies ResourceCallbacks<Sale>,
    {
      resource: "billing_accounts",
      beforeGetList: async (params) => {
        if (!params.filter?.q) return params;
        const { q, ...filter } = params.filter;
        return {
          ...params,
          filter: { ...filter, "customer_name@ilike": q },
        };
      },
    },
    {
      resource: "contacts",
      beforeCreate: async (createParams, dataProvider) => {
        const params = {
          ...createParams,
          data: {
            ...createParams.data,
            first_seen:
              createParams.data.first_seen ?? new Date().toISOString(),
            last_seen: createParams.data.last_seen ?? new Date().toISOString(),
          },
        };
        const newParams = await processContactAvatar(params);
        return fetchAndUpdateCompanyData(newParams, dataProvider);
      },
      afterCreate: async (result) => {
        if (result.data.company_id != null) {
          await updateCompany(result.data.company_id, (company) => ({
            nb_contacts: (company.nb_contacts ?? 0) + 1,
          }));
        }

        return result;
      },
      beforeUpdate: async (params) => {
        const newParams = await processContactAvatar(params);
        return fetchAndUpdateCompanyData(newParams, dataProvider);
      },
      afterDelete: async (result) => {
        if (result.data.company_id != null) {
          await updateCompany(result.data.company_id, (company) => ({
            nb_contacts: (company.nb_contacts ?? 1) - 1,
          }));
        }

        return result;
      },
    } satisfies ResourceCallbacks<Contact>,
    {
      resource: "tasks",
      afterCreate: async (result, dataProvider) => {
        // update the task count in the related contact
        const { contact_id } = result.data;
        const { data: contact } = await dataProvider.getOne("contacts", {
          id: contact_id,
        });
        await dataProvider.update("contacts", {
          id: contact_id,
          data: {
            nb_tasks: (contact.nb_tasks ?? 0) + 1,
          },
          previousData: contact,
        });
        return result;
      },
      beforeUpdate: async (params) => {
        const { data, previousData } = params;
        if (previousData.done_date !== data.done_date) {
          taskUpdateType = data.done_date
            ? TASK_MARKED_AS_DONE
            : TASK_MARKED_AS_UNDONE;
        } else {
          taskUpdateType = TASK_DONE_NOT_CHANGED;
        }
        return params;
      },
      afterUpdate: async (result, dataProvider) => {
        // update the contact: if the task is done, decrement the nb tasks, otherwise increment it
        const { contact_id } = result.data;
        const { data: contact } = await dataProvider.getOne("contacts", {
          id: contact_id,
        });
        if (taskUpdateType !== TASK_DONE_NOT_CHANGED) {
          await dataProvider.update("contacts", {
            id: contact_id,
            data: {
              nb_tasks:
                taskUpdateType === TASK_MARKED_AS_DONE
                  ? (contact.nb_tasks ?? 0) - 1
                  : (contact.nb_tasks ?? 0) + 1,
            },
            previousData: contact,
          });
        }
        return result;
      },
      afterDelete: async (result, dataProvider) => {
        // update the task count in the related contact
        const { contact_id } = result.data;
        const { data: contact } = await dataProvider.getOne("contacts", {
          id: contact_id,
        });
        await dataProvider.update("contacts", {
          id: contact_id,
          data: {
            nb_tasks: (contact.nb_tasks ?? 0) - 1,
          },
          previousData: contact,
        });
        return result;
      },
    } satisfies ResourceCallbacks<Task>,
    {
      resource: "companies",
      beforeCreate: async (params) => {
        const createParams = await processCompanyLogo(params);

        return {
          ...createParams,
          data: {
            ...createParams.data,
            created_at: new Date().toISOString(),
          },
        };
      },
      beforeUpdate: async (params) => {
        return await processCompanyLogo(params);
      },
      afterUpdate: async (result, dataProvider) => {
        // get all contacts of the company and for each contact, update the company_name
        const { id, name } = result.data;
        const { data: contacts } = await dataProvider.getList("contacts", {
          filter: { company_id: id },
          pagination: { page: 1, perPage: 1000 },
          sort: { field: "id", order: "ASC" },
        });

        const contactIds = contacts.map((contact) => contact.id);
        await dataProvider.updateMany("contacts", {
          ids: contactIds,
          data: { company_name: name },
        });
        return result;
      },
    } satisfies ResourceCallbacks<Company>,
    {
      resource: "deals",
      beforeCreate: async (params) => {
        return {
          ...params,
          data: {
            ...params.data,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        };
      },
      afterCreate: async (result) => {
        await updateCompany(result.data.company_id, (company) => ({
          nb_deals: (company.nb_deals ?? 0) + 1,
        }));

        return result;
      },
      beforeUpdate: async (params) => {
        return {
          ...params,
          data: {
            ...params.data,
            updated_at: new Date().toISOString(),
          },
        };
      },
      afterDelete: async (result) => {
        await updateCompany(result.data.company_id, (company) => ({
          nb_deals: (company.nb_deals ?? 1) - 1,
        }));

        return result;
      },
    } satisfies ResourceCallbacks<Deal>,
    {
      resource: "contact_notes",
      beforeSave: async (params) => preserveAttachmentMimeType(params),
    } satisfies ResourceCallbacks<ContactNote>,
    {
      resource: "deal_notes",
      beforeSave: async (params) => preserveAttachmentMimeType(params),
    } satisfies ResourceCallbacks<DealNote>,
  ],
) as CrmDataProvider;

/**
 * Convert a `File` object returned by the upload input into a base 64 string.
 * That's not the most optimized way to store images in production, but it's
 * enough to illustrate the idea of dataprovider decoration.
 */
const convertFileToBase64 = (file: { rawFile: Blob }): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    // We know result is a string as we used readAsDataURL
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file.rawFile);
  });
