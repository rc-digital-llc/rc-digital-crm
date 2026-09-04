import {
  multiplyUsdMoneyByExactRatio,
  multiplyUsdMoneyByRate,
  parseExactRatio,
  parseOrdinaryPercentageRate,
  parseUsdMoney,
  type OrdinaryPercentageRate,
  type UsdMoney,
  type UsdRoundingPolicy,
} from "../financial/exactMoney";
import type { ExactBillingInvoiceLineItem } from "../types";

export type ExactInvoicePreview = Readonly<{
  amount: UsdMoney;
  lineItemsTotal: UsdMoney;
  taxAmount: UsdMoney;
  totalAmount: UsdMoney;
  submittedPercentageDescription: string;
  currencyDescription: string;
  roundingDescription: string;
}>;

export class InvoicePreviewError extends Error {
  readonly code: "INVOICE_PREVIEW_LINE_ITEM_MISMATCH";

  constructor() {
    super("INVOICE_PREVIEW_LINE_ITEM_MISMATCH");
    this.name = "InvoicePreviewError";
    this.code = "INVOICE_PREVIEW_LINE_ITEM_MISMATCH";
  }
}

function validateLineItem(item: ExactBillingInvoiceLineItem) {
  const quantityRatio = parseExactRatio(item.quantity_ratio);
  const unitPrice = parseUsdMoney(item.unit_price);
  const extendedAmount = parseUsdMoney(item.extended_amount);
  const expected = multiplyUsdMoneyByExactRatio(unitPrice, quantityRatio, {
    currency: unitPrice.currency,
    currency_exponent: "2",
    currency_policy_version: item.currency_policy_version,
    rounding_policy_version: item.rounding_policy_version,
  });
  if (expected.amount_minor !== extendedAmount.amount_minor) {
    throw new InvoicePreviewError();
  }
  return extendedAmount;
}

export function calculateLineItemsTotal(
  lineItems: readonly ExactBillingInvoiceLineItem[],
): UsdMoney {
  const total = lineItems.reduce(
    (sum, item) => sum + BigInt(validateLineItem(item).amount_minor),
    0n,
  );
  return parseUsdMoney({ amount_minor: total.toString(), currency: "USD" });
}

export function calculateTaxAmount(
  amountValue: unknown,
  taxRateValue: unknown,
  policyValue: unknown,
): UsdMoney {
  return multiplyUsdMoneyByRate(amountValue, taxRateValue, policyValue);
}

export function calculateInvoiceTotal(
  amountValue: unknown,
  taxRateValue: unknown,
  policyValue: unknown,
): Readonly<{ taxAmount: UsdMoney; totalAmount: UsdMoney }> {
  const amount = parseUsdMoney(amountValue);
  const taxRate = parseOrdinaryPercentageRate(taxRateValue);
  const taxAmount = calculateTaxAmount(amount, taxRate, policyValue);
  const totalAmount = parseUsdMoney({
    amount_minor: (
      BigInt(amount.amount_minor) + BigInt(taxAmount.amount_minor)
    ).toString(),
    currency: amount.currency,
  });
  return Object.freeze({ taxAmount, totalAmount });
}

export function createInvoicePreview(
  input: Readonly<{
    amount: UsdMoney;
    tax_rate: OrdinaryPercentageRate;
    line_items: readonly ExactBillingInvoiceLineItem[];
    policy: UsdRoundingPolicy;
  }>,
): ExactInvoicePreview {
  const amount = parseUsdMoney(input.amount);
  const taxRate = parseOrdinaryPercentageRate(input.tax_rate);
  const lineItemsTotal = calculateLineItemsTotal(input.line_items);
  if (
    input.line_items.length > 0 &&
    lineItemsTotal.amount_minor !== amount.amount_minor
  ) {
    throw new InvoicePreviewError();
  }
  const { taxAmount, totalAmount } = calculateInvoiceTotal(
    amount,
    taxRate,
    input.policy,
  );
  return Object.freeze({
    amount,
    lineItemsTotal,
    taxAmount,
    totalAmount,
    submittedPercentageDescription: `Submitted percentage: ${taxRate.submitted_percentage}`,
    currencyDescription: "USD minor units (2 decimal places)",
    roundingDescription: "Half away from zero",
  });
}
