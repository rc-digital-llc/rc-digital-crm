import { supabaseDataProvider } from "ra-supabase-core";
import {
  withLifecycleCallbacks,
  type DataProvider,
  type GetListParams,
  type Identifier,
  type ResourceCallbacks,
} from "ra-core";
import type {
  BillingAccount,
  ContactNote,
  Deal,
  DealNote,
  ExactBillingInvoice,
  ExactBillingInvoiceLineItem,
  InvoiceStatus,
  RAFile,
  Sale,
  SalesFormData,
  SignUpData,
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
import { ATTACHMENTS_BUCKET } from "../commons/attachments";
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
import { getIsInitialized } from "./authProvider";
import { getEmailRedirectTo } from "./authRedirect";
import { supabase } from "./supabase";

if (import.meta.env.VITE_SUPABASE_URL === undefined) {
  throw new Error("Please set the VITE_SUPABASE_URL environment variable");
}
if (import.meta.env.VITE_SB_PUBLISHABLE_KEY === undefined) {
  throw new Error(
    "Please set the VITE_SB_PUBLISHABLE_KEY environment variable",
  );
}

const baseDataProvider = supabaseDataProvider({
  instanceUrl: import.meta.env.VITE_SUPABASE_URL,
  apiKey: import.meta.env.VITE_SB_PUBLISHABLE_KEY,
  supabaseClient: supabase,
  sortOrder: "asc,desc.nullslast" as any,
});

const INVOICE_READ_INVALID_REQUEST = "INVOICE_READ_INVALID_REQUEST";
const INVOICE_READ_INVALID_RESPONSE = "INVOICE_READ_INVALID_RESPONSE";
const INVOICE_READ_FAILED = "INVOICE_READ_FAILED";
const INVOICE_READ_NOT_FOUND = "INVOICE_READ_NOT_FOUND";
const INVOICE_SAVE_INVALID_REQUEST = "INVOICE_SAVE_INVALID_REQUEST";
const INVOICE_SAVE_FAILED = "INVOICE_SAVE_FAILED";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const INVOICE_SORT_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "invoice_number",
  "issue_date",
  "due_date",
  "status",
]);
const INVOICE_STATUSES = new Set([
  "Draft",
  "Sent",
  "Viewed",
  "Paid",
  "Overdue",
  "Cancelled",
]);
const INVOICE_FILTER_FIELDS = new Set([
  "billing_account_id",
  "invoice_number",
  "status",
]);
const INVOICE_SAVE_FIELDS = new Set([
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
const EXACT_INVOICE_RESPONSE_FIELDS = [
  "amount_minor",
  "billing_account_id",
  "company_id",
  "created_at",
  "currency",
  "currency_policy_version",
  "deal_id",
  "description",
  "due_date",
  "id",
  "invoice_number",
  "issue_date",
  "line_items_exact",
  "notes",
  "paid_date",
  "payment_method",
  "payment_reference",
  "project_id",
  "rate_policy_version",
  "rounding_policy_version",
  "status",
  "submitted_percentage",
  "tax_amount_minor",
  "tax_rate_denominator",
  "tax_rate_numerator",
  "terms",
  "total_amount_minor",
  "updated_at",
];
const EXACT_LINE_ITEM_FIELDS = [
  "currency_policy_version",
  "description",
  "extended_amount",
  "quantity_ratio",
  "rounding_policy_version",
  "unit_price",
];

export class InvoiceProviderError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "InvoiceProviderError";
    this.code = code;
  }
}

function invoiceFailure(code: string): never {
  throw new InvoiceProviderError(code);
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

function requireString(value: unknown, maximumBytes: number): string {
  if (
    typeof value !== "string" ||
    new TextEncoder().encode(value).byteLength > maximumBytes
  ) {
    invoiceFailure(INVOICE_READ_INVALID_RESPONSE);
  }
  return value;
}

function requireNullableString(
  value: unknown,
  maximumBytes: number,
): string | null {
  if (value === null) return null;
  return requireString(value, maximumBytes);
}

function requireUuid(value: unknown, errorCode: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    invoiceFailure(errorCode);
  }
  return value;
}

function requirePositiveId(value: unknown, errorCode: string): string {
  try {
    const id = parseCanonicalIntegerText(value);
    if (BigInt(id) <= 0n) invoiceFailure(errorCode);
    return id;
  } catch {
    invoiceFailure(errorCode);
  }
}

function requireNullablePositiveId(
  value: unknown,
  errorCode: string,
): string | null {
  return value === null ? null : requirePositiveId(value, errorCode);
}

function requireDate(value: unknown, errorCode: string): string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    invoiceFailure(errorCode);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    invoiceFailure(errorCode);
  }
  return value;
}

function parseExactLineItem(
  value: unknown,
  errorCode: string,
): ExactBillingInvoiceLineItem {
  if (!isPlainRecord(value) || !hasExactKeys(value, EXACT_LINE_ITEM_FIELDS)) {
    invoiceFailure(errorCode);
  }
  if (
    value.currency_policy_version !== "usd-v1" ||
    value.rounding_policy_version !== "half-away-from-zero-v1"
  ) {
    invoiceFailure(errorCode);
  }
  const description = requireString(value.description, 500);
  try {
    const quantityRatio = parseExactRatio(value.quantity_ratio);
    if (BigInt(quantityRatio.numerator) < 0n) invoiceFailure(errorCode);
    const unitPrice = parseUsdMoney(value.unit_price);
    const extendedAmount = parseUsdMoney(value.extended_amount);
    const expectedAmount = multiplyUsdMoneyByExactRatio(
      unitPrice,
      quantityRatio,
      USD_HALF_AWAY_ROUNDING_POLICY,
    );
    if (expectedAmount.amount_minor !== extendedAmount.amount_minor) {
      invoiceFailure(errorCode);
    }
    return Object.freeze({
      description,
      quantity_ratio: quantityRatio,
      unit_price: unitPrice,
      extended_amount: extendedAmount,
      currency_policy_version: "usd-v1",
      rounding_policy_version: "half-away-from-zero-v1",
    });
  } catch {
    invoiceFailure(errorCode);
  }
}

function parseExactLineItems(
  value: unknown,
  errorCode: string,
): ExactBillingInvoiceLineItem[] {
  if (!Array.isArray(value) || value.length > 100) {
    invoiceFailure(errorCode);
  }
  return Object.freeze(
    value.map((item) => parseExactLineItem(item, errorCode)),
  ) as ExactBillingInvoiceLineItem[];
}

function requireInvoiceStatus(
  value: unknown,
  errorCode: string,
): InvoiceStatus {
  if (typeof value !== "string" || !INVOICE_STATUSES.has(value)) {
    invoiceFailure(errorCode);
  }
  return value as InvoiceStatus;
}

export function parseExactBillingInvoiceResponse(
  value: unknown,
): ExactBillingInvoice {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, EXACT_INVOICE_RESPONSE_FIELDS)
  ) {
    invoiceFailure(INVOICE_READ_INVALID_RESPONSE);
  }
  if (
    value.currency !== "USD" ||
    value.currency_policy_version !== "usd-v1" ||
    value.rounding_policy_version !== "half-away-from-zero-v1" ||
    value.rate_policy_version !== "ordinary-percentage-v1"
  ) {
    invoiceFailure(INVOICE_READ_INVALID_RESPONSE);
  }

  try {
    const amount = parseUsdMoney({
      amount_minor: value.amount_minor,
      currency: value.currency,
    });
    const taxRate = parseOrdinaryPercentageRate({
      kind: "ordinary_percentage",
      numerator: value.tax_rate_numerator,
      denominator: value.tax_rate_denominator,
      submitted_percentage: value.submitted_percentage,
      rate_policy_version: value.rate_policy_version,
    });
    const taxAmount = parseUsdMoney({
      amount_minor: value.tax_amount_minor,
      currency: value.currency,
    });
    const totalAmount = parseUsdMoney({
      amount_minor: value.total_amount_minor,
      currency: value.currency,
    });
    if (
      BigInt(amount.amount_minor) + BigInt(taxAmount.amount_minor) !==
      BigInt(totalAmount.amount_minor)
    ) {
      invoiceFailure(INVOICE_READ_INVALID_RESPONSE);
    }

    return Object.freeze({
      id: requirePositiveId(value.id, INVOICE_READ_INVALID_RESPONSE),
      created_at: requireString(value.created_at, 64),
      updated_at: requireString(value.updated_at, 64),
      billing_account_id: requireUuid(
        value.billing_account_id,
        INVOICE_READ_INVALID_RESPONSE,
      ),
      company_id: requirePositiveId(
        value.company_id,
        INVOICE_READ_INVALID_RESPONSE,
      ),
      project_id: requireNullablePositiveId(
        value.project_id,
        INVOICE_READ_INVALID_RESPONSE,
      ),
      deal_id: requireNullablePositiveId(
        value.deal_id,
        INVOICE_READ_INVALID_RESPONSE,
      ),
      invoice_number: requireString(value.invoice_number, 100),
      description: requireNullableString(value.description, 2000),
      amount,
      currency_policy_version: "usd-v1",
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      rounding_policy_version: "half-away-from-zero-v1",
      line_items: parseExactLineItems(
        value.line_items_exact,
        INVOICE_READ_INVALID_RESPONSE,
      ),
      status: requireInvoiceStatus(value.status, INVOICE_READ_INVALID_RESPONSE),
      issue_date: requireDate(value.issue_date, INVOICE_READ_INVALID_RESPONSE),
      due_date:
        value.due_date === null
          ? null
          : requireDate(value.due_date, INVOICE_READ_INVALID_RESPONSE),
      paid_date:
        value.paid_date === null
          ? null
          : requireDate(value.paid_date, INVOICE_READ_INVALID_RESPONSE),
      payment_method: requireNullableString(value.payment_method, 500),
      payment_reference: requireNullableString(value.payment_reference, 500),
      notes: requireNullableString(value.notes, 10000),
      terms: requireNullableString(value.terms, 5000),
    });
  } catch (error) {
    if (error instanceof InvoiceProviderError) throw error;
    invoiceFailure(INVOICE_READ_INVALID_RESPONSE);
  }
}

function parseExactBillingInvoiceListResponse(
  value: unknown,
): ExactBillingInvoiceListResult {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["data", "total"])) {
    invoiceFailure(INVOICE_READ_INVALID_RESPONSE);
  }
  if (
    !Array.isArray(value.data) ||
    typeof value.total !== "number" ||
    !Number.isSafeInteger(value.total) ||
    value.total < 0
  ) {
    invoiceFailure(INVOICE_READ_INVALID_RESPONSE);
  }
  return Object.freeze({
    data: Object.freeze(value.data.map(parseExactBillingInvoiceResponse)),
    total: value.total,
  });
}

function buildExactInvoiceListRequest(
  params: GetListParams,
): ExactBillingInvoiceListRequest {
  const page = params.pagination?.page ?? 1;
  const perPage = params.pagination?.perPage ?? 25;
  const sort = params.sort?.field ?? "created_at";
  const order = params.sort?.order ?? "DESC";
  const filter = params.filter ?? {};
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1_000_000 ||
    !Number.isSafeInteger(perPage) ||
    perPage < 1 ||
    perPage > 100 ||
    typeof sort !== "string" ||
    !INVOICE_SORT_FIELDS.has(sort) ||
    (order !== "ASC" && order !== "DESC") ||
    !isPlainRecord(filter) ||
    Object.keys(filter).some((key) => !INVOICE_FILTER_FIELDS.has(key))
  ) {
    invoiceFailure(INVOICE_READ_INVALID_REQUEST);
  }
  const billingAccountId = filter.billing_account_id;
  const invoiceNumber = filter.invoice_number;
  const status = filter.status;
  if (
    (billingAccountId !== undefined &&
      (typeof billingAccountId !== "string" ||
        !UUID_PATTERN.test(billingAccountId))) ||
    (invoiceNumber !== undefined &&
      (typeof invoiceNumber !== "string" ||
        new TextEncoder().encode(invoiceNumber).byteLength > 200)) ||
    (status !== undefined &&
      (typeof status !== "string" || !INVOICE_STATUSES.has(status)))
  ) {
    invoiceFailure(INVOICE_READ_INVALID_REQUEST);
  }

  return {
    mode: "list",
    page,
    per_page: perPage,
    sort,
    order,
    filters: {
      ...(billingAccountId === undefined
        ? {}
        : { billing_account_id: billingAccountId }),
      ...(invoiceNumber === undefined ? {} : { invoice_number: invoiceNumber }),
      ...(status === undefined ? {} : { status }),
    },
  } as ExactBillingInvoiceListRequest;
}

function buildExactInvoiceGetRequest(
  value: unknown,
): ExactBillingInvoiceGetRequest {
  return {
    mode: "get",
    invoice_id: requirePositiveId(value, INVOICE_READ_INVALID_REQUEST),
  };
}

function parseExactInvoiceListMethodRequest(
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
    value.mode !== "list"
  ) {
    invoiceFailure(INVOICE_READ_INVALID_REQUEST);
  }
  return buildExactInvoiceListRequest({
    pagination: { page: value.page, perPage: value.per_page },
    sort: { field: value.sort, order: value.order },
    filter: value.filters,
  });
}

function parseExactInvoiceGetMethodRequest(
  value: unknown,
): ExactBillingInvoiceGetRequest {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["invoice_id", "mode"]) ||
    value.mode !== "get"
  ) {
    invoiceFailure(INVOICE_READ_INVALID_REQUEST);
  }
  return buildExactInvoiceGetRequest(value.invoice_id);
}

function requireSaveNullableString(
  value: unknown,
  maximumBytes: number,
): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    new TextEncoder().encode(value).byteLength > maximumBytes
  ) {
    invoiceFailure(INVOICE_SAVE_INVALID_REQUEST);
  }
  return value;
}

function parseExactInvoiceSaveRequest(
  value: unknown,
): ExactBillingInvoiceSaveRequest {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).some((key) => !INVOICE_SAVE_FIELDS.has(key))
  ) {
    invoiceFailure(INVOICE_SAVE_INVALID_REQUEST);
  }
  if (
    !Object.hasOwn(value, "amount") ||
    !Object.hasOwn(value, "billing_account_id") ||
    !Object.hasOwn(value, "invoice_number") ||
    !Object.hasOwn(value, "line_items") ||
    !Object.hasOwn(value, "status") ||
    !Object.hasOwn(value, "tax_rate") ||
    value.status !== "Draft" ||
    typeof value.invoice_number !== "string" ||
    value.invoice_number.trim() === "" ||
    new TextEncoder().encode(value.invoice_number).byteLength > 100
  ) {
    invoiceFailure(INVOICE_SAVE_INVALID_REQUEST);
  }
  if (
    !isPlainRecord(value.amount) ||
    !hasExactKeys(value.amount, ["amount_minor", "currency"])
  ) {
    invoiceFailure(INVOICE_SAVE_INVALID_REQUEST);
  }

  try {
    const amount = parseUsdMoney(value.amount);
    const taxRate = parseOrdinaryPercentageRate(value.tax_rate);
    const lineItems = parseExactLineItems(
      value.line_items,
      INVOICE_SAVE_INVALID_REQUEST,
    );
    if (
      lineItems.length > 0 &&
      lineItems.reduce(
        (total, item) => total + BigInt(item.extended_amount.amount_minor),
        0n,
      ) !== BigInt(amount.amount_minor)
    ) {
      invoiceFailure(INVOICE_SAVE_INVALID_REQUEST);
    }
    const taxAmount = multiplyUsdMoneyByRate(
      amount,
      taxRate,
      USD_HALF_AWAY_ROUNDING_POLICY,
    );
    parseCanonicalIntegerText(
      (BigInt(amount.amount_minor) + BigInt(taxAmount.amount_minor)).toString(),
    );

    return Object.freeze({
      ...(value.id === undefined
        ? {}
        : {
            id: requirePositiveId(value.id, INVOICE_SAVE_INVALID_REQUEST),
          }),
      billing_account_id: requireUuid(
        value.billing_account_id,
        INVOICE_SAVE_INVALID_REQUEST,
      ),
      invoice_number: value.invoice_number,
      ...(value.description === undefined
        ? {}
        : { description: requireSaveNullableString(value.description, 2000) }),
      amount,
      tax_rate: taxRate,
      line_items: lineItems,
      status: "Draft",
      ...(value.project_id === undefined
        ? {}
        : {
            project_id: requireNullablePositiveId(
              value.project_id,
              INVOICE_SAVE_INVALID_REQUEST,
            ),
          }),
      ...(value.deal_id === undefined
        ? {}
        : {
            deal_id: requireNullablePositiveId(
              value.deal_id,
              INVOICE_SAVE_INVALID_REQUEST,
            ),
          }),
      ...(value.issue_date === undefined
        ? {}
        : {
            issue_date: requireDate(
              value.issue_date,
              INVOICE_SAVE_INVALID_REQUEST,
            ),
          }),
      ...(value.due_date === undefined
        ? {}
        : {
            due_date:
              value.due_date === null
                ? null
                : requireDate(value.due_date, INVOICE_SAVE_INVALID_REQUEST),
          }),
      ...(value.payment_method === undefined
        ? {}
        : {
            payment_method: requireSaveNullableString(
              value.payment_method,
              500,
            ),
          }),
      ...(value.payment_reference === undefined
        ? {}
        : {
            payment_reference: requireSaveNullableString(
              value.payment_reference,
              500,
            ),
          }),
      ...(value.notes === undefined
        ? {}
        : { notes: requireSaveNullableString(value.notes, 10000) }),
      ...(value.terms === undefined
        ? {}
        : { terms: requireSaveNullableString(value.terms, 5000) }),
    });
  } catch (error) {
    if (error instanceof InvoiceProviderError) throw error;
    invoiceFailure(INVOICE_SAVE_INVALID_REQUEST);
  }
}

function throwSafeRpcError(error: unknown, fallback: string): never {
  const message =
    isPlainRecord(error) && typeof error.message === "string"
      ? error.message
      : "";
  for (const code of [
    INVOICE_READ_INVALID_REQUEST,
    "INVOICE_READ_NOT_AUTHORIZED",
    INVOICE_SAVE_INVALID_REQUEST,
    "INVOICE_SAVE_NOT_AUTHORIZED",
    "FINANCIAL_OVERFLOW",
    "BILLING_LINE_ITEMS_INVALID",
  ]) {
    if (message.includes(code)) invoiceFailure(code);
  }
  invoiceFailure(fallback);
}

async function listExactBillingInvoices(
  requestValue: unknown,
): Promise<ExactBillingInvoiceListResult> {
  const request = parseExactInvoiceListMethodRequest(requestValue);
  const { data, error } = await supabase.rpc("read_billing_invoices_exact", {
    p_request: request,
  });
  if (error || data === null) {
    throwSafeRpcError(error, INVOICE_READ_FAILED);
  }
  return parseExactBillingInvoiceListResponse(data);
}

async function getExactBillingInvoice(
  requestValue: unknown,
): Promise<ExactBillingInvoice> {
  const request = parseExactInvoiceGetMethodRequest(requestValue);
  const { data, error } = await supabase.rpc("read_billing_invoices_exact", {
    p_request: request,
  });
  if (error || data === null) {
    throwSafeRpcError(error, INVOICE_READ_FAILED);
  }
  if (!isPlainRecord(data) || !hasExactKeys(data, ["data"])) {
    invoiceFailure(INVOICE_READ_INVALID_RESPONSE);
  }
  if (data.data === null) invoiceFailure(INVOICE_READ_NOT_FOUND);
  return parseExactBillingInvoiceResponse(data.data);
}

async function saveExactBillingInvoice(
  requestValue: unknown,
): Promise<ExactBillingInvoice> {
  const request = parseExactInvoiceSaveRequest(requestValue);
  const { data, error } = await supabase.rpc("save_billing_invoice_exact", {
    p_request: request,
  });
  if (error || data === null) {
    throwSafeRpcError(error, INVOICE_SAVE_FAILED);
  }
  if (!isPlainRecord(data) || !hasExactKeys(data, ["data"])) {
    invoiceFailure(INVOICE_READ_INVALID_RESPONSE);
  }
  return parseExactBillingInvoiceResponse(data.data);
}

const processCompanyLogo = async (params: any) => {
  const logo = params.data.logo;

  if (logo?.rawFile instanceof File) {
    await uploadToBucket(logo);
  }

  return {
    ...params,
    data: {
      ...params.data,
      logo,
    },
  };
};

const dataProviderWithCustomMethods = {
  ...baseDataProvider,
  listExactBillingInvoices,
  getExactBillingInvoice,
  saveExactBillingInvoice,
  async getList(resource: string, params: GetListParams) {
    if (resource === "invoices") {
      const request = buildExactInvoiceListRequest(params);
      return listExactBillingInvoices(request);
    }
    if (resource === "companies") {
      return baseDataProvider.getList("companies_summary", params);
    }
    if (resource === "contacts") {
      return baseDataProvider.getList("contacts_summary", params);
    }

    return baseDataProvider.getList(resource, params);
  },
  async getOne(resource: string, params: any) {
    if (resource === "invoices") {
      return {
        data: await getExactBillingInvoice(
          buildExactInvoiceGetRequest(params?.id),
        ),
      };
    }
    if (resource === "companies") {
      return baseDataProvider.getOne("companies_summary", params);
    }
    if (resource === "contacts") {
      return baseDataProvider.getOne("contacts_summary", params);
    }

    return baseDataProvider.getOne(resource, params);
  },
  async create(resource: string, params: any) {
    if (resource === "invoices") {
      return { data: await saveExactBillingInvoice(params?.data) };
    }
    return baseDataProvider.create(resource, params);
  },
  async update(resource: string, params: any) {
    if (resource === "invoices") {
      if (!isPlainRecord(params?.data)) {
        invoiceFailure(INVOICE_SAVE_INVALID_REQUEST);
      }
      return {
        data: await saveExactBillingInvoice({
          ...params.data,
          id: params.id,
        }),
      };
    }
    return baseDataProvider.update(resource, params);
  },

  async signUp({ email, password, first_name, last_name }: SignUpData) {
    const response = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getEmailRedirectTo(),
        data: {
          first_name,
          last_name,
        },
      },
    });

    if (!response.data?.user || response.error) {
      console.error("signUp.error", response.error);
      throw new Error(response?.error?.message || "Failed to create account");
    }

    // Update the is initialized cache
    getIsInitialized._is_initialized_cache = true;

    return {
      id: response.data.user.id,
      email,
      password,
    };
  },
  async salesCreate(body: SalesFormData) {
    const { data, error } = await supabase.functions.invoke<{ data: Sale }>(
      "users",
      {
        method: "POST",
        body,
      },
    );

    if (!data || error) {
      console.error("salesCreate.error", error);
      const errorDetails = await (async () => {
        try {
          return (await error?.context?.json()) ?? {};
        } catch {
          return {};
        }
      })();
      throw new Error(errorDetails?.message || "Failed to create the user");
    }

    return data.data;
  },
  async salesUpdate(
    id: Identifier,
    data: Partial<Omit<SalesFormData, "password">>,
  ) {
    const { email, first_name, last_name, administrator, avatar, disabled } =
      data;

    const { data: updatedData, error } = await supabase.functions.invoke<{
      data: Sale;
    }>("users", {
      method: "PATCH",
      body: {
        sales_id: id,
        email,
        first_name,
        last_name,
        administrator,
        disabled,
        avatar,
      },
    });

    if (!updatedData || error) {
      console.error("salesCreate.error", error);
      throw new Error("Failed to update account manager");
    }

    return updatedData.data;
  },
  async updatePassword(id: Identifier) {
    const { data: passwordUpdated, error } =
      await supabase.functions.invoke<boolean>("update_password", {
        method: "PATCH",
        body: {
          sales_id: id,
        },
      });

    if (!passwordUpdated || error) {
      console.error("update_password.error", error);
      throw new Error("Failed to update password");
    }

    return passwordUpdated;
  },
  async unarchiveDeal(deal: Deal) {
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
        baseDataProvider.update("deals", {
          id: updatedDeal.id,
          data: updatedDeal,
          previousData: deals.find((d) => d.id === updatedDeal.id),
        }),
      ),
    );
  },
  async getActivityLog(companyId?: Identifier) {
    return getActivityLog(baseDataProvider, companyId);
  },
  async isInitialized() {
    return getIsInitialized();
  },
  async mergeContacts(sourceId: Identifier, targetId: Identifier) {
    const { data, error } = await supabase.functions.invoke("merge_contacts", {
      method: "POST",
      body: { loserId: sourceId, winnerId: targetId },
    });

    if (error) {
      console.error("merge_contacts.error", error);
      throw new Error("Failed to merge contacts");
    }

    return data;
  },
  async saveBillingAccountBoundary(
    request: BillingAccountBoundaryRequest,
  ): Promise<BillingAccountBoundaryResponse> {
    const { data, error } = await supabase.rpc(
      "save_billing_account_boundary",
      {
        p_payload: request,
      },
    );

    if (!data || error) {
      throw new Error("Account changes were not saved");
    }
    return data as BillingAccount;
  },
  async getBillingAccountAccessSummary(
    accountId: string,
  ): Promise<BillingAccountAccessSummary> {
    const { data, error } = await supabase.rpc(
      "get_billing_account_access_summary",
      { p_account_id: accountId },
    );
    if (!data || error) throw new Error("Billing access could not be loaded");
    return data as BillingAccountAccessSummary;
  },
  async assignBillingRole(request: {
    account_id: string;
    sales_id: number;
    role: string;
  }): Promise<{ assignment_id: string }> {
    const { data, error } = await supabase.rpc("assign_billing_role", {
      p_account_id: request.account_id,
      p_sales_id: request.sales_id,
      p_role: request.role,
    });
    if (!data || error) throw new Error("Billing role was not assigned");
    return data as { assignment_id: string };
  },
  async endBillingRoleAssignment(request: {
    assignment_id: string;
    reason: string;
  }): Promise<{ assignment_id: string }> {
    const { data, error } = await supabase.rpc("end_billing_role_assignment", {
      p_assignment_id: request.assignment_id,
      p_reason: request.reason,
      p_effective_at: new Date().toISOString(),
    });
    if (!data || error) throw new Error("Billing role was not ended");
    return data as { assignment_id: string };
  },
  async disableBillingAutomationPrincipal(request: {
    account_id: string;
    principal_id: string;
    reason: string;
  }): Promise<{ principal_id: string }> {
    const { data, error } = await supabase.rpc(
      "disable_billing_automation_principal",
      {
        p_account_id: request.account_id,
        p_principal_id: request.principal_id,
        p_reason: request.reason,
      },
    );
    if (!data || error)
      throw new Error("Automation principal was not disabled");
    return data as { principal_id: string };
  },
  async beginBillingEvidenceUpload(
    request: BillingEvidenceUploadRequest,
  ): Promise<BillingEvidenceUploadResponse> {
    const { data, error } =
      await supabase.functions.invoke<BillingEvidenceUploadResponse>(
        "billing_evidence",
        {
          method: "POST",
          body: { command: "upload", ...request },
        },
      );

    if (!data || error) {
      throw new Error("Failed to prepare billing evidence upload");
    }
    return data;
  },
  async finalizeBillingEvidenceInspection(
    request: BillingEvidenceInspectionRequest,
  ): Promise<BillingEvidenceInspectionResponse> {
    const { data, error } =
      await supabase.functions.invoke<BillingEvidenceInspectionResponse>(
        "billing_evidence",
        {
          method: "POST",
          body: { command: "inspection", ...request },
        },
      );

    if (!data || error) {
      throw new Error("Failed to record billing evidence inspection");
    }
    return data;
  },
  async createBillingEvidenceDownload(
    request: BillingEvidenceDownloadRequest,
  ): Promise<BillingEvidenceDownloadResponse> {
    const { data, error } =
      await supabase.functions.invoke<BillingEvidenceDownloadResponse>(
        "billing_evidence",
        {
          method: "POST",
          body: { command: "download", ...request },
        },
      );

    if (!data || error) {
      throw new Error("Failed to prepare billing evidence download");
    }
    return data;
  },
  async getConfiguration(): Promise<ConfigurationContextValue> {
    const { data } = await baseDataProvider.getOne("configuration", { id: 1 });
    return (data?.config as ConfigurationContextValue) ?? {};
  },
  async updateConfiguration(
    config: ConfigurationContextValue,
  ): Promise<ConfigurationContextValue> {
    const { data } = await baseDataProvider.update("configuration", {
      id: 1,
      data: { config },
      previousData: { id: 1 },
    });
    return data.config as ConfigurationContextValue;
  },
} satisfies DataProvider;

export type CrmDataProvider = typeof dataProviderWithCustomMethods;

const processConfigLogo = async (logo: any): Promise<string> => {
  if (typeof logo === "string") return logo;
  if (logo?.rawFile instanceof File) {
    await uploadToBucket(logo);
    return logo.src;
  }
  return logo?.src ?? "";
};

const lifeCycleCallbacks: ResourceCallbacks[] = [
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
    resource: "contact_notes",
    beforeSave: async (data: ContactNote, _, __) => {
      if (data.attachments) {
        data.attachments = await Promise.all(
          data.attachments.map((fi) => uploadToBucket(fi)),
        );
      }
      return data;
    },
  },
  {
    resource: "deal_notes",
    beforeSave: async (data: DealNote, _, __) => {
      if (data.attachments) {
        data.attachments = await Promise.all(
          data.attachments.map((fi) => uploadToBucket(fi)),
        );
      }
      return data;
    },
  },
  {
    resource: "sales",
    beforeSave: async (data: Sale, _, __) => {
      if (data.avatar) {
        await uploadToBucket(data.avatar);
      }
      return data;
    },
  },
  {
    resource: "billing_accounts",
    beforeGetList: async (params) => {
      return applyFullTextSearch(["customer_name"])(params);
    },
  },
  {
    resource: "contacts",
    beforeGetList: async (params) => {
      return applyFullTextSearch([
        "first_name",
        "last_name",
        "company_name",
        "title",
        "email",
        "phone",
        "background",
      ])(params);
    },
  },
  {
    resource: "companies",
    beforeGetList: async (params) => {
      return applyFullTextSearch([
        "name",
        "phone_number",
        "website",
        "zipcode",
        "city",
        "state_abbr",
      ])(params);
    },
    beforeCreate: async (params) => {
      const createParams = await processCompanyLogo(params);

      return {
        ...createParams,
        data: {
          created_at: new Date().toISOString(),
          ...createParams.data,
        },
      };
    },
    beforeUpdate: async (params) => {
      return await processCompanyLogo(params);
    },
  },
  {
    resource: "contacts_summary",
    beforeGetList: async (params) => {
      return applyFullTextSearch(["first_name", "last_name"])(params);
    },
  },
  {
    resource: "deals",
    beforeGetList: async (params) => {
      return applyFullTextSearch(["name", "category", "description"])(params);
    },
  },
  {
    resource: "leads",
    beforeGetList: async (params) => {
      return applyFullTextSearch([
        "first_name",
        "last_name",
        "company_name",
        "email",
      ])(params);
    },
  },
];

export const dataProvider = withLifecycleCallbacks(
  dataProviderWithCustomMethods,
  lifeCycleCallbacks,
) as CrmDataProvider;

const applyFullTextSearch = (columns: string[]) => (params: GetListParams) => {
  if (!params.filter?.q) {
    return params;
  }
  const { q, ...filter } = params.filter;
  return {
    ...params,
    filter: {
      ...filter,
      "@or": columns.reduce((acc, column) => {
        if (column === "email")
          return {
            ...acc,
            [`email_fts@ilike`]: q,
          };
        if (column === "phone")
          return {
            ...acc,
            [`phone_fts@ilike`]: q,
          };
        else
          return {
            ...acc,
            [`${column}@ilike`]: q,
          };
      }, {}),
    },
  };
};

const uploadToBucket = async (fi: RAFile) => {
  if (!fi.src.startsWith("blob:") && !fi.src.startsWith("data:")) {
    // Sign URL check if path exists in the bucket
    if (fi.path) {
      const { error } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .createSignedUrl(fi.path, 60);

      if (!error) {
        return fi;
      }
    }
  }

  const dataContent = fi.src
    ? await fetch(fi.src)
        .then((res) => {
          if (res.status !== 200) {
            return null;
          }
          return res.blob();
        })
        .catch(() => null)
    : fi.rawFile;

  if (dataContent == null) {
    // We weren't able to download the file from its src (e.g. user must be signed in on another website to access it)
    // or the file has no content (not probable)
    // In that case, just return it as is: when trying to download it, users should be redirected to the other website
    // and see they need to be signed in. It will then be their responsibility to upload the file back to the note.
    return fi;
  }

  const file = fi.rawFile;
  const fileParts = file.name.split(".");
  const fileExt = fileParts.length > 1 ? `.${file.name.split(".").pop()}` : "";
  const fileName = `${Math.random()}${fileExt}`;
  const filePath = `${fileName}`;
  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(filePath, dataContent);

  if (uploadError) {
    console.error("uploadError", uploadError);
    throw new Error("Failed to upload attachment");
  }

  const { data } = supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .getPublicUrl(filePath);

  fi.path = filePath;
  fi.src = data.publicUrl;

  // save MIME type
  const mimeType = file.type;
  fi.type = mimeType;

  return fi;
};
