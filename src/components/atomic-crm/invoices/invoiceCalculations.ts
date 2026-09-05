import type { ExactBillingInvoiceLineItem } from "../types";
import {
  FinancialContractError,
  HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION,
  USD_CURRENCY,
  USD_CURRENCY_EXPONENT,
  USD_CURRENCY_POLICY_VERSION,
  formatUsdMoney,
  parseCanonicalIntegerText,
  parseOrdinaryPercentageRateWire,
  parseUsdMoney,
  reduceExactRatio,
  roundExactRatioToUsdMoney,
  type OrdinaryPercentageRate,
  type UsdMoney,
} from "../financial/exactMoney";

export type ExactInvoicePreviewInput = Readonly<{
  line_items: readonly ExactBillingInvoiceLineItem[];
  tax_rate: OrdinaryPercentageRate;
  currency: typeof USD_CURRENCY;
  currency_policy_version: typeof USD_CURRENCY_POLICY_VERSION;
  currency_exponent: typeof USD_CURRENCY_EXPONENT;
  rounding_policy_version: typeof HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION;
}>;

export type ExactInvoicePreview = Readonly<{
  amount: UsdMoney;
  tax_amount: UsdMoney;
  total_amount: UsdMoney;
  description: string;
}>;

const previewFields = [
  "line_items",
  "tax_rate",
  "currency",
  "currency_policy_version",
  "currency_exponent",
  "rounding_policy_version",
] as const;
const lineItemFields = [
  "quantity_ratio",
  "unit_price",
  "extended_amount",
  "currency_policy_version",
  "rounding_policy_version",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  return (
    actual.length === required.length &&
    actual.every((key, index) => key === required[index])
  );
}

function failInvalidPreview(): never {
  throw new FinancialContractError(
    "FINANCIAL_INVALID_ROUNDING_REQUEST",
    "Invoice preview input is invalid",
  );
}

function validateLineItem(value: ExactBillingInvoiceLineItem): UsdMoney {
  if (!isRecord(value) || !hasExactKeys(value, lineItemFields)) {
    return failInvalidPreview();
  }
  if (
    value.currency_policy_version !== USD_CURRENCY_POLICY_VERSION ||
    value.rounding_policy_version !==
      HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION
  ) {
    throw new FinancialContractError(
      "FINANCIAL_POLICY_MISMATCH",
      "Invoice line policy does not match the preview policy",
    );
  }

  const quantity = reduceExactRatio(value.quantity_ratio);
  const canonicalNumerator = parseCanonicalIntegerText(
    value.quantity_ratio.numerator,
  );
  const canonicalDenominator = parseCanonicalIntegerText(
    value.quantity_ratio.denominator,
  );
  if (
    quantity.numerator !== canonicalNumerator ||
    quantity.denominator !== canonicalDenominator
  ) {
    throw new FinancialContractError(
      "FINANCIAL_INVALID_RATIO",
      "Invoice quantity ratio must be canonical",
    );
  }
  parseUsdMoney(value.unit_price);
  return parseUsdMoney(value.extended_amount);
}

export function calculateInvoicePreview(
  input: ExactInvoicePreviewInput,
): ExactInvoicePreview {
  if (!isRecord(input) || !hasExactKeys(input, previewFields)) {
    return failInvalidPreview();
  }
  if (input.currency !== USD_CURRENCY) {
    throw new FinancialContractError(
      "FINANCIAL_UNSUPPORTED_CURRENCY",
      "Invoice preview currency is not supported",
    );
  }
  if (
    input.currency_policy_version !== USD_CURRENCY_POLICY_VERSION ||
    input.currency_exponent !== USD_CURRENCY_EXPONENT ||
    input.rounding_policy_version !==
      HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION
  ) {
    throw new FinancialContractError(
      "FINANCIAL_POLICY_MISMATCH",
      "Invoice preview policy context is not supported",
    );
  }
  if (!Array.isArray(input.line_items)) return failInvalidPreview();

  const taxRate = parseOrdinaryPercentageRateWire(input.tax_rate);
  const amount = parseUsdMoney({
    amount_minor: input.line_items
      .reduce(
        (sum, lineItem) =>
          sum + BigInt(validateLineItem(lineItem).amount_minor),
        0n,
      )
      .toString(),
    currency: USD_CURRENCY,
  });
  const taxAmount = roundExactRatioToUsdMoney({
    numerator: (
      BigInt(amount.amount_minor) * BigInt(taxRate.numerator)
    ).toString(),
    denominator: taxRate.denominator,
    currency: input.currency,
    currency_policy_version: input.currency_policy_version,
    currency_exponent: input.currency_exponent,
    rounding_policy_version: input.rounding_policy_version,
  });
  const totalAmount = parseUsdMoney({
    amount_minor: (
      BigInt(amount.amount_minor) + BigInt(taxAmount.amount_minor)
    ).toString(),
    currency: USD_CURRENCY,
  });

  return Object.freeze({
    amount,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    description: `${formatUsdMoney(amount)} + ${taxRate.submitted_percentage} tax = ${formatUsdMoney(totalAmount)}`,
  });
}
