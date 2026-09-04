import { describe, expect, it } from "vitest";
import {
  BILLING_CALCULATION_ERROR_VECTORS,
  BILLING_CALCULATION_GOLDEN_VECTORS,
  BILLING_ADJUSTMENT_GOLDEN_VECTORS,
  BILLING_SIGNED_ADJUSTMENT_ROUNDING_VECTORS,
  BillingCalculationContractError,
  calculateBillingFormula,
  classifyBillingAdjustment,
} from "./billingCalculationFixtures";
import {
  roundExactRatioToUsdMoney,
  USD_HALF_AWAY_ROUNDING_POLICY,
} from "./exactMoney";

describe("exact billing calculation golden vectors", () => {
  it.each(BILLING_CALCULATION_GOLDEN_VECTORS)(
    "$name",
    ({ input, expected }) => {
      expect(calculateBillingFormula(input)).toEqual(expected);
      expect(calculateBillingFormula(structuredClone(input))).toEqual(expected);
    },
  );

  it.each(BILLING_CALCULATION_ERROR_VECTORS)(
    "$name",
    ({ input, expected_error }) => {
      expect(() => calculateBillingFormula(input)).toThrow(
        new BillingCalculationContractError(expected_error),
      );
    },
  );

  it.each(BILLING_SIGNED_ADJUSTMENT_ROUNDING_VECTORS)(
    "rounds $numerator/$denominator to $expected",
    ({ numerator, denominator, expected }) => {
      expect(
        roundExactRatioToUsdMoney({
          numerator,
          denominator,
          ...USD_HALF_AWAY_ROUNDING_POLICY,
        }).amount_minor,
      ).toBe(expected);
    },
  );

  it.each(BILLING_ADJUSTMENT_GOLDEN_VECTORS)(
    "$name",
    ({
      original_amount_minor,
      actual_amount_minor,
      true_up_policy,
      expected,
    }) => {
      expect(
        classifyBillingAdjustment({
          original_amount_minor,
          actual_amount_minor,
          true_up_policy,
        }),
      ).toEqual(expected);
    },
  );

  it("never uses number-valued financial authority in the shared vectors", () => {
    const visit = (value: unknown): void => {
      expect(typeof value).not.toBe("number");
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") {
        Object.values(value).forEach(visit);
      }
    };
    visit(BILLING_CALCULATION_GOLDEN_VECTORS);
    visit(BILLING_CALCULATION_ERROR_VECTORS);
    visit(BILLING_SIGNED_ADJUSTMENT_ROUNDING_VECTORS);
    visit(BILLING_ADJUSTMENT_GOLDEN_VECTORS);
  });
});
