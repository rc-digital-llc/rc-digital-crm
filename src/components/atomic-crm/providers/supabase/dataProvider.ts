import { supabaseDataProvider } from "ra-supabase-core";
import {
  withLifecycleCallbacks,
  type CreateParams,
  type DataProvider,
  type GetListParams,
  type Identifier,
  type ResourceCallbacks,
  type UpdateParams,
} from "ra-core";
import type {
  BillingAccount,
  BillingInvoice,
  ContactNote,
  Deal,
  DealNote,
  RAFile,
  Sale,
  SalesFormData,
  SignUpData,
} from "../../types";
import {
  HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION,
  USD_CURRENCY_POLICY_VERSION,
  parseCanonicalIntegerText,
  parseOrdinaryPercentageRateWire,
  parseUsdMoney,
  reduceExactRatio,
  roundExactRatioToUsdMoney,
  type ExactRatio,
  type OrdinaryPercentageRate,
  type UsdMoney,
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
  ExactBillingInvoiceGetResponse,
  ExactBillingInvoiceListFilter,
  ExactBillingInvoiceListRequest,
  ExactBillingInvoiceListResponse,
  ExactBillingInvoiceSaveRequest,
  ExactBillingInvoiceSaveResponse,
} from "../types";
import {
  EXACT_BILLING_INVOICE_MAX_PAGE,
  isCanonicalExactBillingInvoiceDate,
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

const invoiceReadSortFields = [
  "id",
  "invoice_number",
  "status",
  "issue_date",
  "created_at",
  "total_amount_minor",
] as const;
const invoiceReadFilterFields = [
  "billing_account_id",
  "status",
  "invoice_number",
] as const;
const invoicePayloadFields = [
  "id",
  "organization_id",
  "billing_account_id",
  "company_id",
  "project_id",
  "deal_id",
  "sales_id",
  "invoice_number",
  "description",
  "amount",
  "currency_policy_version",
  "tax_rate",
  "tax_amount",
  "total_amount",
  "rounding_policy_version",
  "line_items",
  "status",
  "issue_date",
  "due_date",
  "paid_date",
  "payment_method",
  "payment_reference",
  "notes",
  "terms",
  "created_at",
  "updated_at",
] as const;
const invoiceRequiredPayloadFields = [
  "id",
  "organization_id",
  "billing_account_id",
  "company_id",
  "sales_id",
  "invoice_number",
  "amount",
  "currency_policy_version",
  "tax_rate",
  "tax_amount",
  "total_amount",
  "rounding_policy_version",
  "line_items",
  "status",
  "created_at",
  "updated_at",
] as const;
const invoiceSaveFields = [
  "id",
  "billing_account_id",
  "invoice_number",
  "description",
  "amount",
  "currency_policy_version",
  "tax_rate",
  "rounding_policy_version",
  "line_items",
  "status",
  "issue_date",
  "due_date",
  "payment_method",
  "payment_reference",
  "notes",
  "terms",
] as const;
const invoiceRequiredSaveFields = [
  "billing_account_id",
  "invoice_number",
  "amount",
  "currency_policy_version",
  "tax_rate",
  "rounding_policy_version",
  "line_items",
  "issue_date",
] as const;

const invoiceUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const invoiceIdPattern = /^[1-9][0-9]{0,18}$/;

type UnknownRecord = Record<string, unknown>;

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyFields(
  value: UnknownRecord,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function hasRequiredFields(
  value: UnknownRecord,
  required: readonly string[],
): boolean {
  return required.every((key) => Object.hasOwn(value, key));
}

function failInvoiceRead(code: "REQUEST" | "RESPONSE" | "NOT_FOUND"): never {
  throw new Error(`INVOICE_READ_INVALID_${code}`);
}

function failInvoiceSave(code: "REQUEST" | "RESPONSE"): never {
  throw new Error(`INVOICE_SAVE_INVALID_${code}`);
}

function parseInvoiceId(value: unknown, failure: () => never): string {
  if (typeof value !== "string" || !invoiceIdPattern.test(value)) failure();
  try {
    return parseCanonicalIntegerText(value);
  } catch {
    return failure();
  }
}

function parseInvoiceUuid(value: unknown, failure: () => never): string {
  if (typeof value !== "string" || !invoiceUuidPattern.test(value)) failure();
  return value;
}

function parseRequiredString(value: unknown, failure: () => never): string {
  if (typeof value !== "string") failure();
  return value;
}

function parseOptionalString(
  value: unknown,
  failure: () => never,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") failure();
  return value;
}

function parseOptionalNullableString(
  value: unknown,
  failure: () => never,
): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") failure();
  return value;
}

function parseInvoiceDate(
  value: unknown,
  failure: () => never,
): string | undefined {
  const parsed = parseOptionalString(value, failure);
  if (parsed === undefined) return undefined;
  if (!isCanonicalExactBillingInvoiceDate(parsed)) failure();
  return parsed;
}

function parseRequiredInvoiceDate(
  value: unknown,
  failure: () => never,
): string {
  const parsed = parseInvoiceDate(value, failure);
  if (parsed === undefined) return failure();
  return parsed;
}

function parseInvoiceTimestamp(value: unknown, failure: () => never): string {
  const parsed = parseRequiredString(value, failure);
  if (Number.isNaN(Date.parse(parsed))) failure();
  return parsed;
}

function parseExactInvoiceLineItem(
  value: unknown,
  failure: () => never,
): BillingInvoice["line_items"][number] {
  const expectedFields = [
    "quantity_ratio",
    "unit_price",
    "extended_amount",
    "currency_policy_version",
    "rounding_policy_version",
  ] as const;
  if (
    !isUnknownRecord(value) ||
    !hasRequiredFields(value, expectedFields) ||
    !hasOnlyFields(value, expectedFields) ||
    value.currency_policy_version !== USD_CURRENCY_POLICY_VERSION ||
    value.rounding_policy_version !==
      HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION
  ) {
    return failure();
  }

  let quantityRatio: ExactRatio;
  let unitPrice: UsdMoney;
  let extendedAmount: UsdMoney;
  try {
    if (!isUnknownRecord(value.quantity_ratio)) return failure();
    const numerator = parseCanonicalIntegerText(value.quantity_ratio.numerator);
    const denominator = parseCanonicalIntegerText(
      value.quantity_ratio.denominator,
    );
    quantityRatio = reduceExactRatio({ numerator, denominator });
    if (
      quantityRatio.numerator !== numerator ||
      quantityRatio.denominator !== denominator
    ) {
      return failure();
    }
    unitPrice = parseUsdMoney(value.unit_price);
    extendedAmount = parseUsdMoney(value.extended_amount);
    const calculated = roundExactRatioToUsdMoney({
      numerator: (
        BigInt(unitPrice.amount_minor) * BigInt(quantityRatio.numerator)
      ).toString(),
      denominator: quantityRatio.denominator,
      currency: "USD",
      currency_policy_version: USD_CURRENCY_POLICY_VERSION,
      currency_exponent: 2,
      rounding_policy_version: HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION,
    });
    if (calculated.amount_minor !== extendedAmount.amount_minor) {
      return failure();
    }
  } catch {
    return failure();
  }

  return Object.freeze({
    quantity_ratio: quantityRatio,
    unit_price: unitPrice,
    extended_amount: extendedAmount,
    currency_policy_version: USD_CURRENCY_POLICY_VERSION,
    rounding_policy_version: HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION,
  });
}

function parseExactInvoiceLineItems(
  value: unknown,
  failure: () => never,
): BillingInvoice["line_items"] {
  if (!Array.isArray(value)) return failure();
  return Object.freeze(
    value.map((item) => parseExactInvoiceLineItem(item, failure)),
  );
}

function assertInvoiceFinancialReconciliation(
  invoice: Pick<
    BillingInvoice,
    "amount" | "tax_rate" | "tax_amount" | "total_amount" | "line_items"
  >,
  failure: () => never,
): void {
  try {
    const expectedTax = roundExactRatioToUsdMoney({
      numerator: (
        BigInt(invoice.amount.amount_minor) * BigInt(invoice.tax_rate.numerator)
      ).toString(),
      denominator: invoice.tax_rate.denominator,
      currency: "USD",
      currency_policy_version: USD_CURRENCY_POLICY_VERSION,
      currency_exponent: 2,
      rounding_policy_version: HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION,
    });
    const expectedTotal = parseUsdMoney({
      amount_minor: (
        BigInt(invoice.amount.amount_minor) + BigInt(expectedTax.amount_minor)
      ).toString(),
      currency: "USD",
    });
    const lineTotal = invoice.line_items.reduce(
      (sum, item) => sum + BigInt(item.extended_amount.amount_minor),
      0n,
    );
    if (
      expectedTax.amount_minor !== invoice.tax_amount.amount_minor ||
      expectedTotal.amount_minor !== invoice.total_amount.amount_minor ||
      (invoice.line_items.length > 0 &&
        lineTotal !== BigInt(invoice.amount.amount_minor))
    ) {
      failure();
    }
  } catch {
    failure();
  }
}

function parseExactBillingInvoice(value: unknown): BillingInvoice {
  const failure = () => failInvoiceRead("RESPONSE");
  if (
    !isUnknownRecord(value) ||
    !hasRequiredFields(value, invoiceRequiredPayloadFields) ||
    !hasOnlyFields(value, invoicePayloadFields) ||
    value.currency_policy_version !== USD_CURRENCY_POLICY_VERSION ||
    value.rounding_policy_version !==
      HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION
  ) {
    return failure();
  }

  let amount: UsdMoney;
  let taxRate: OrdinaryPercentageRate;
  let taxAmount: UsdMoney;
  let totalAmount: UsdMoney;
  try {
    amount = parseUsdMoney(value.amount);
    taxRate = parseOrdinaryPercentageRateWire(value.tax_rate);
    taxAmount = parseUsdMoney(value.tax_amount);
    totalAmount = parseUsdMoney(value.total_amount);
  } catch {
    return failure();
  }
  const lineItems = parseExactInvoiceLineItems(value.line_items, failure);
  const invoice: BillingInvoice = Object.freeze({
    id: parseInvoiceId(value.id, failure),
    organization_id: parseInvoiceUuid(value.organization_id, failure),
    billing_account_id: parseInvoiceUuid(value.billing_account_id, failure),
    company_id: parseInvoiceId(value.company_id, failure),
    project_id:
      value.project_id === undefined
        ? undefined
        : parseInvoiceId(value.project_id, failure),
    deal_id:
      value.deal_id === undefined
        ? undefined
        : parseInvoiceId(value.deal_id, failure),
    sales_id: parseInvoiceId(value.sales_id, failure),
    invoice_number: parseRequiredString(value.invoice_number, failure),
    description: parseOptionalString(value.description, failure),
    amount,
    currency_policy_version: USD_CURRENCY_POLICY_VERSION,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    rounding_policy_version: HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION,
    line_items: lineItems,
    status: parseRequiredString(value.status, failure),
    issue_date: parseRequiredInvoiceDate(value.issue_date, failure),
    due_date: parseInvoiceDate(value.due_date, failure),
    paid_date: parseInvoiceDate(value.paid_date, failure),
    payment_method: parseOptionalString(value.payment_method, failure),
    payment_reference: parseOptionalString(value.payment_reference, failure),
    notes: parseOptionalString(value.notes, failure),
    terms: parseOptionalString(value.terms, failure),
    created_at: parseInvoiceTimestamp(value.created_at, failure),
    updated_at: parseInvoiceTimestamp(value.updated_at, failure),
  });
  assertInvoiceFinancialReconciliation(invoice, failure);
  return invoice;
}

function parseInvoiceListResponse(
  value: unknown,
): ExactBillingInvoiceListResponse {
  if (
    !isUnknownRecord(value) ||
    !hasRequiredFields(value, ["data", "total"]) ||
    !hasOnlyFields(value, ["data", "total"]) ||
    !Array.isArray(value.data) ||
    typeof value.total !== "number" ||
    !Number.isSafeInteger(value.total) ||
    value.total < 0
  ) {
    return failInvoiceRead("RESPONSE");
  }
  return {
    data: value.data.map(parseExactBillingInvoice),
    total: value.total,
  };
}

function parseInvoiceGetResponse(
  value: unknown,
): ExactBillingInvoiceGetResponse {
  if (
    !isUnknownRecord(value) ||
    !hasRequiredFields(value, ["data"]) ||
    !hasOnlyFields(value, ["data"])
  ) {
    return failInvoiceRead("RESPONSE");
  }
  if (value.data === null) return failInvoiceRead("NOT_FOUND");
  return { data: parseExactBillingInvoice(value.data) };
}

function parseInvoiceListRequest(
  params: GetListParams,
): ExactBillingInvoiceListRequest {
  const page = params.pagination?.page ?? 1;
  const perPage = params.pagination?.perPage ?? 50;
  const sort = params.sort?.field ?? "created_at";
  const order = params.sort?.order ?? "DESC";
  const filter: unknown = params.filter ?? {};
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > EXACT_BILLING_INVOICE_MAX_PAGE ||
    !Number.isSafeInteger(perPage) ||
    perPage < 1 ||
    perPage > 100 ||
    !invoiceReadSortFields.includes(
      sort as (typeof invoiceReadSortFields)[number],
    ) ||
    (order !== "ASC" && order !== "DESC") ||
    !isUnknownRecord(filter) ||
    !hasOnlyFields(filter, invoiceReadFilterFields)
  ) {
    return failInvoiceRead("REQUEST");
  }

  const filters: ExactBillingInvoiceListFilter = Object.freeze({
    billing_account_id:
      filter.billing_account_id === undefined
        ? undefined
        : parseInvoiceUuid(filter.billing_account_id, () =>
            failInvoiceRead("REQUEST"),
          ),
    status: parseOptionalString(filter.status, () =>
      failInvoiceRead("REQUEST"),
    ),
    invoice_number: parseOptionalString(filter.invoice_number, () =>
      failInvoiceRead("REQUEST"),
    ),
  });
  return Object.freeze({
    mode: "list",
    page,
    per_page: perPage,
    sort: sort as ExactBillingInvoiceListRequest["sort"],
    order,
    filters,
  });
}

function parseInvoiceGetRequest(
  invoiceId: Identifier,
): ExactBillingInvoiceGetRequest {
  return Object.freeze({
    mode: "get",
    invoice_id: parseInvoiceId(invoiceId, () => failInvoiceRead("REQUEST")),
  });
}

function parseExactBillingInvoiceSaveRequest(
  value: unknown,
): ExactBillingInvoiceSaveRequest {
  const failure = () => failInvoiceSave("REQUEST");
  if (
    !isUnknownRecord(value) ||
    !hasRequiredFields(value, invoiceRequiredSaveFields) ||
    !hasOnlyFields(value, invoiceSaveFields) ||
    value.currency_policy_version !== USD_CURRENCY_POLICY_VERSION ||
    value.rounding_policy_version !==
      HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION ||
    (value.status !== undefined && value.status !== "Draft") ||
    typeof value.invoice_number !== "string" ||
    value.invoice_number.trim().length === 0 ||
    new TextEncoder().encode(value.invoice_number).byteLength > 128
  ) {
    return failure();
  }

  let amount: UsdMoney;
  let taxRate: OrdinaryPercentageRate;
  try {
    amount = parseUsdMoney(value.amount);
    taxRate = parseOrdinaryPercentageRateWire(value.tax_rate);
  } catch {
    return failure();
  }
  const lineItems = parseExactInvoiceLineItems(value.line_items, failure);
  const lineTotal = lineItems.reduce(
    (sum, item) => sum + BigInt(item.extended_amount.amount_minor),
    0n,
  );
  if (lineTotal !== BigInt(amount.amount_minor)) {
    return failure();
  }

  const optionalDate = (candidate: unknown): string | null | undefined => {
    if (candidate === null || candidate === undefined) return candidate;
    return parseInvoiceDate(candidate, failure);
  };
  return Object.freeze({
    id: value.id === undefined ? undefined : parseInvoiceId(value.id, failure),
    billing_account_id: parseInvoiceUuid(value.billing_account_id, failure),
    invoice_number: value.invoice_number,
    description: parseOptionalNullableString(value.description, failure),
    amount,
    currency_policy_version: USD_CURRENCY_POLICY_VERSION,
    tax_rate: taxRate,
    rounding_policy_version: HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION,
    line_items: lineItems,
    status: value.status === undefined ? undefined : "Draft",
    issue_date: parseRequiredInvoiceDate(value.issue_date, failure),
    due_date: optionalDate(value.due_date),
    payment_method: parseOptionalNullableString(value.payment_method, failure),
    payment_reference: parseOptionalNullableString(
      value.payment_reference,
      failure,
    ),
    notes: parseOptionalNullableString(value.notes, failure),
    terms: parseOptionalNullableString(value.terms, failure),
  });
}

async function listExactBillingInvoices(
  params: GetListParams,
): Promise<ExactBillingInvoiceListResponse> {
  const request = parseInvoiceListRequest(params);
  const { data, error } = await supabase.rpc(
    "read_billing_invoices_exact",
    request,
  );
  if (error || data === null) return failInvoiceRead("RESPONSE");
  return parseInvoiceListResponse(data);
}

async function getExactBillingInvoice(
  invoiceId: Identifier,
): Promise<ExactBillingInvoiceGetResponse> {
  const request = parseInvoiceGetRequest(invoiceId);
  const { data, error } = await supabase.rpc(
    "read_billing_invoices_exact",
    request,
  );
  if (error || data === null) return failInvoiceRead("RESPONSE");
  return parseInvoiceGetResponse(data);
}

async function saveExactBillingInvoice(
  request: unknown,
): Promise<ExactBillingInvoiceSaveResponse> {
  const parsedRequest = parseExactBillingInvoiceSaveRequest(request);
  const { data, error } = await supabase.rpc(
    "save_billing_invoice_exact",
    parsedRequest,
  );
  if (error || data === null) return failInvoiceSave("RESPONSE");
  if (
    !isUnknownRecord(data) ||
    !hasRequiredFields(data, ["result", "data"]) ||
    !hasOnlyFields(data, ["result", "data"]) ||
    data.result !== "saved"
  ) {
    return failInvoiceSave("RESPONSE");
  }
  return Object.freeze({
    result: "saved",
    data: parseExactBillingInvoice(data.data),
  });
}

const baseDataProvider = supabaseDataProvider({
  instanceUrl: import.meta.env.VITE_SUPABASE_URL,
  apiKey: import.meta.env.VITE_SB_PUBLISHABLE_KEY,
  supabaseClient: supabase,
  sortOrder: "asc,desc.nullslast" as any,
});

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
    if (resource === "companies") {
      return baseDataProvider.getList("companies_summary", params);
    }
    if (resource === "contacts") {
      return baseDataProvider.getList("contacts_summary", params);
    }
    if (resource === "invoices") {
      return listExactBillingInvoices(params);
    }

    return baseDataProvider.getList(resource, params);
  },
  async getOne(resource: string, params: any) {
    if (resource === "companies") {
      return baseDataProvider.getOne("companies_summary", params);
    }
    if (resource === "contacts") {
      return baseDataProvider.getOne("contacts_summary", params);
    }
    if (resource === "invoices") {
      return getExactBillingInvoice(params.id);
    }

    return baseDataProvider.getOne(resource, params);
  },
  async create(resource: string, params: CreateParams) {
    if (resource === "invoices") {
      const result = await saveExactBillingInvoice(params.data);
      return { data: result.data };
    }
    return baseDataProvider.create(resource, params);
  },
  async update(resource: string, params: UpdateParams) {
    if (resource === "invoices") {
      const result = await saveExactBillingInvoice({
        ...params.data,
        id: params.id,
      });
      return { data: result.data };
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
