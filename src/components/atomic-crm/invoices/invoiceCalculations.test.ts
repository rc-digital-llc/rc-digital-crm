import { describe, expect, it } from "vitest";

import {
  FinancialContractError,
  parseOrdinaryPercentageRate,
  parseUsdMoney,
  reduceExactRatio,
} from "../financial/exactMoney";
import {
  calculateInvoicePreview,
  type ExactInvoicePreviewInput,
} from "./invoiceCalculations";

const policy = {
  currency: "USD",
  currency_policy_version: "usd-v1",
  currency_exponent: 2,
  rounding_policy_version: "half-away-from-zero-v1",
} as const;

function inputFor(
  amountMinor: string,
  submittedPercentage: string,
): ExactInvoicePreviewInput {
  return {
    line_items: [
      {
        quantity_ratio: reduceExactRatio({
          numerator: "1",
          denominator: "1",
        }),
        unit_price: parseUsdMoney({
          amount_minor: amountMinor,
          currency: "USD",
        }),
        extended_amount: parseUsdMoney({
          amount_minor: amountMinor,
          currency: "USD",
        }),
        currency_policy_version: "usd-v1",
        rounding_policy_version: "half-away-from-zero-v1",
      },
    ],
    tax_rate: parseOrdinaryPercentageRate(submittedPercentage),
    ...policy,
  };
}

function expectFinancialCode(action: () => unknown, code: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(FinancialContractError);
    expect((error as FinancialContractError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe("calculateInvoicePreview", () => {
  it("rounds 8.875% on 10000 minor units once under the named policy", () => {
    expect(calculateInvoicePreview(inputFor("10000", "8.875%"))).toEqual({
      amount: { amount_minor: "10000", currency: "USD" },
      tax_amount: { amount_minor: "888", currency: "USD" },
      total_amount: { amount_minor: "10888", currency: "USD" },
      description: "$100.00 + 8.875% tax = $108.88",
    });
  });

  it.each([
    ["1", "1", "2"],
    ["-1", "-1", "-2"],
  ])(
    "mirrors signed half ties for %s minor units",
    (amountMinor, taxMinor, totalMinor) => {
      expect(
        calculateInvoicePreview(inputFor(amountMinor, "50%")),
      ).toMatchObject({
        amount: { amount_minor: amountMinor },
        tax_amount: { amount_minor: taxMinor },
        total_amount: { amount_minor: totalMinor },
      });
    },
  );

  it("canonicalizes every zero result without a negative form", () => {
    const input = inputFor("0", "50%");
    const result = calculateInvoicePreview({
      ...input,
      line_items: [
        {
          ...input.line_items[0]!,
          quantity_ratio: { numerator: "-0", denominator: "1" } as never,
          unit_price: { amount_minor: "-0", currency: "USD" } as never,
          extended_amount: { amount_minor: "-0", currency: "USD" } as never,
        },
      ],
    });

    expect(result).toMatchObject({
      amount: { amount_minor: "0" },
      tax_amount: { amount_minor: "0" },
      total_amount: { amount_minor: "0" },
    });
    expect(JSON.stringify(result)).not.toContain("-0");
  });

  it("sums canonical line amounts without floating-point conversion", () => {
    const input = inputFor("125", "0%");
    const result = calculateInvoicePreview({
      ...input,
      line_items: [
        input.line_items[0]!,
        {
          ...input.line_items[0]!,
          quantity_ratio: reduceExactRatio({
            numerator: "5",
            denominator: "2",
          }),
          unit_price: parseUsdMoney({
            amount_minor: "100",
            currency: "USD",
          }),
          extended_amount: parseUsdMoney({
            amount_minor: "250",
            currency: "USD",
          }),
        },
      ],
    });

    expect(result.amount.amount_minor).toBe("375");
    expect(result.total_amount.amount_minor).toBe("375");
  });

  it("rejects currency and named policy mismatches", () => {
    const input = inputFor("10000", "8.875%");
    const invalidInputs: Array<readonly [unknown, string]> = [
      [{ ...input, currency: "EUR" }, "FINANCIAL_UNSUPPORTED_CURRENCY"],
      [
        { ...input, currency_policy_version: "usd-v2" },
        "FINANCIAL_POLICY_MISMATCH",
      ],
      [{ ...input, currency_exponent: 3 }, "FINANCIAL_POLICY_MISMATCH"],
      [
        { ...input, rounding_policy_version: "bankers-v1" },
        "FINANCIAL_POLICY_MISMATCH",
      ],
      [
        {
          ...input,
          line_items: [
            { ...input.line_items[0]!, currency_policy_version: "usd-v2" },
          ],
        },
        "FINANCIAL_POLICY_MISMATCH",
      ],
      [
        {
          ...input,
          line_items: [
            {
              ...input.line_items[0]!,
              unit_price: { amount_minor: "10000", currency: "EUR" },
            },
          ],
        },
        "FINANCIAL_UNSUPPORTED_CURRENCY",
      ],
    ];
    for (const [invalid, code] of invalidInputs) {
      expectFinancialCode(
        () => calculateInvoicePreview(invalid as never),
        code,
      );
    }
  });

  it("rejects zero and noncanonical quantity denominators", () => {
    const input = inputFor("10000", "8.875%");
    expectFinancialCode(
      () =>
        calculateInvoicePreview({
          ...input,
          line_items: [
            {
              ...input.line_items[0]!,
              quantity_ratio: { numerator: "1", denominator: "0" } as never,
            },
          ],
        }),
      "FINANCIAL_ZERO_DENOMINATOR",
    );
    expectFinancialCode(
      () =>
        calculateInvoicePreview({
          ...input,
          line_items: [
            {
              ...input.line_items[0]!,
              quantity_ratio: { numerator: "2", denominator: "2" } as never,
            },
          ],
        }),
      "FINANCIAL_INVALID_RATIO",
    );
  });

  it("fails closed when the rounded total exceeds the persisted range", () => {
    expectFinancialCode(
      () => calculateInvoicePreview(inputFor("9223372036854775807", "100%")),
      "FINANCIAL_OVERFLOW",
    );
  });

  it.each(["9223372036854775807", "-9223372036854775808"])(
    "preserves the signed persisted endpoint %s when no tax applies",
    (endpoint) => {
      const result = calculateInvoicePreview(inputFor(endpoint, "0%"));

      expect(result.amount.amount_minor).toBe(endpoint);
      expect(result.tax_amount.amount_minor).toBe("0");
      expect(result.total_amount.amount_minor).toBe(endpoint);
    },
  );

  it("returns descriptions as one-way display text, separate from authority", () => {
    const result = calculateInvoicePreview(inputFor("10000", "12.500%"));

    expect(result.tax_amount.amount_minor).toBe("1250");
    expect(result.description).toBe("$100.00 + 12.500% tax = $112.50");
    expect(result).not.toHaveProperty("submitted_percentage");
    expect(result).not.toHaveProperty("tax_rate");
  });
});
