import { describe, expect, it } from "vitest";

import {
  FinancialContractError,
  parseExactRatio,
  parseOrdinaryPercentage,
  parseUsdMoney,
  USD_HALF_AWAY_ROUNDING_POLICY,
} from "../financial/exactMoney";
import type { ExactBillingInvoiceLineItem } from "../types";
import {
  calculateInvoiceTotal,
  calculateLineItemsTotal,
  calculateTaxAmount,
  createInvoicePreview,
} from "./invoiceCalculations";

function money(amountMinor: string) {
  return parseUsdMoney({ amount_minor: amountMinor, currency: "USD" });
}

function lineItem(
  description: string,
  quantityNumerator: string,
  quantityDenominator: string,
  unitAmountMinor: string,
  extendedAmountMinor: string,
): ExactBillingInvoiceLineItem {
  return {
    description,
    quantity_ratio: parseExactRatio({
      numerator: quantityNumerator,
      denominator: quantityDenominator,
    }),
    unit_price: money(unitAmountMinor),
    extended_amount: money(extendedAmountMinor),
    currency_policy_version: "usd-v1",
    rounding_policy_version: "half-away-from-zero-v1",
  };
}

describe("exact invoice preview", () => {
  it("sums canonical line-item minor units without floating authority", () => {
    expect(
      calculateLineItemsTotal([
        lineItem("Design", "1", "1", "500000", "500000"),
        lineItem("Development", "2", "1", "300000", "600000"),
      ]),
    ).toEqual(money("1100000"));
  });

  it("keeps fractional quantities exact until the named rounding boundary", () => {
    expect(
      calculateLineItemsTotal([
        lineItem("Half hour", "5", "2", "10000", "25000"),
      ]),
    ).toEqual(money("25000"));
  });

  it("rounds 8.875 percent once to minor units", () => {
    const rate = parseOrdinaryPercentage("8.875%");
    expect(
      calculateTaxAmount(
        money("10000"),
        rate,
        USD_HALF_AWAY_ROUNDING_POLICY,
      ),
    ).toEqual(money("888"));
    expect(
      calculateInvoiceTotal(
        money("10000"),
        rate,
        USD_HALF_AWAY_ROUNDING_POLICY,
      ),
    ).toEqual({ taxAmount: money("888"), totalAmount: money("10888") });
  });

  it("mirrors positive and negative half ties and canonicalizes zero", () => {
    const half = parseOrdinaryPercentage("50%");
    expect(
      calculateTaxAmount(money("1"), half, USD_HALF_AWAY_ROUNDING_POLICY),
    ).toEqual(money("1"));
    expect(
      calculateTaxAmount(money("-1"), half, USD_HALF_AWAY_ROUNDING_POLICY),
    ).toEqual(money("-1"));
    expect(
      calculateTaxAmount(money("0"), half, USD_HALF_AWAY_ROUNDING_POLICY),
    ).toEqual(money("0"));
  });

  it("returns exact preview values and non-authoritative descriptions", () => {
    const preview = createInvoicePreview({
      amount: money("800"),
      tax_rate: parseOrdinaryPercentage("12.500%"),
      line_items: [lineItem("Two units", "2", "1", "400", "800")],
      policy: USD_HALF_AWAY_ROUNDING_POLICY,
    });
    expect(preview).toEqual({
      amount: money("800"),
      lineItemsTotal: money("800"),
      taxAmount: money("100"),
      totalAmount: money("900"),
      submittedPercentageDescription: "Submitted percentage: 12.500%",
      currencyDescription: "USD minor units (2 decimal places)",
      roundingDescription: "Half away from zero",
    });
  });

  it("rejects line-item mismatch, bad policies, zero denominators, and overflow", () => {
    expect(() =>
      calculateLineItemsTotal([
        lineItem("Mismatch", "2", "1", "400", "799"),
      ]),
    ).toThrowError("INVOICE_PREVIEW_LINE_ITEM_MISMATCH");

    expect(() =>
      calculateInvoiceTotal(
        money("1"),
        parseOrdinaryPercentage("0%"),
        {
          ...USD_HALF_AWAY_ROUNDING_POLICY,
          rounding_policy_version: "bankers-v1",
        },
      ),
    ).toThrowError("FINANCIAL_POLICY_MISMATCH");

    expect(() =>
      calculateTaxAmount(
        money("1"),
        {
          kind: "ordinary_percentage",
          numerator: "1",
          denominator: "0",
          submitted_percentage: "1%",
          rate_policy_version: "ordinary-percentage-v1",
        },
        USD_HALF_AWAY_ROUNDING_POLICY,
      ),
    ).toThrow(FinancialContractError);

    expect(() =>
      calculateInvoiceTotal(
        money("9223372036854775807"),
        parseOrdinaryPercentage("1%"),
        USD_HALF_AWAY_ROUNDING_POLICY,
      ),
    ).toThrowError("FINANCIAL_OVERFLOW");
  });
});
