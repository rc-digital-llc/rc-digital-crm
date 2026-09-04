export const BILLING_FORMULA_VERSION = "billing-agreement-formula-v1" as const;
export const BILLING_CALCULATION_POLICY = Object.freeze({
  currency_policy_version: "usd-v1" as const,
  rounding_policy_version: "half-away-from-zero-v1" as const,
  formula_version: BILLING_FORMULA_VERSION,
});

export type BillingFormulaKind =
  | "fixed"
  | "percentage"
  | "minimum_support"
  | "hybrid";

export type BillingFormulaInput = Readonly<{
  formula_kind: BillingFormulaKind | string;
  commissionable_amount: Readonly<{ amount_minor: string; currency: string }>;
  fixed_amount: Readonly<{ amount_minor: string; currency: string }> | null;
  minimum_amount: Readonly<{ amount_minor: string; currency: string }> | null;
  rate: Readonly<{
    kind: string;
    numerator: string;
    denominator: string;
    submitted_percentage: string;
    rate_policy_version: string;
  }> | null;
  currency_policy_version: string;
  rounding_policy_version: string;
  formula_version: string;
}>;

export type BillingFormulaOutput = Readonly<{
  formula_kind: BillingFormulaKind;
  intermediate_numerator: string | null;
  intermediate_denominator: string | null;
  fixed_candidate_minor: string | null;
  minimum_candidate_minor: string | null;
  percentage_candidate_minor: string | null;
  selected_branch: "fixed" | "minimum" | "minimum_equal" | "percentage";
  final_amount_minor: string;
  currency: "USD";
}>;

export type BillingAdjustmentInput = Readonly<{
  original_amount_minor: string;
  actual_amount_minor: string;
  true_up_policy: "next_period_adjustment" | "credit_candidate" | string;
}>;

export type BillingAdjustmentOutput = Readonly<{
  original_amount_minor: string;
  actual_amount_minor: string;
  delta_minor: string;
  treatment: "true_up" | "no_adjustment" | "credit_candidate" | "held";
  status: "approved" | "no_adjustment" | "held";
}>;

export type BillingCalculationErrorCode =
  | "BILLING_CALCULATION_DIVISION_BY_ZERO"
  | "BILLING_CALCULATION_INVALID"
  | "BILLING_CALCULATION_NEGATIVE_REVENUE"
  | "BILLING_CALCULATION_OVERFLOW"
  | "BILLING_CALCULATION_POLICY_MISMATCH"
  | "BILLING_CALCULATION_UNSUPPORTED_FORMULA";

export class BillingCalculationContractError extends Error {
  readonly code: BillingCalculationErrorCode;

  constructor(code: BillingCalculationErrorCode) {
    super(code);
    this.name = "BillingCalculationContractError";
    this.code = code;
  }
}

const INPUT_KEYS = Object.freeze([
  "commissionable_amount",
  "currency_policy_version",
  "fixed_amount",
  "formula_kind",
  "formula_version",
  "minimum_amount",
  "rate",
  "rounding_policy_version",
]);

function calculationFail(code: BillingCalculationErrorCode): never {
  throw new BillingCalculationContractError(code);
}

function mapFinancialError(error: unknown): never {
  if (error instanceof BillingCalculationContractError) throw error;
  if (error instanceof FinancialContractError) {
    if (error.code === "FINANCIAL_DIVISION_BY_ZERO") {
      calculationFail("BILLING_CALCULATION_DIVISION_BY_ZERO");
    }
    if (error.code === "FINANCIAL_OVERFLOW") {
      calculationFail("BILLING_CALCULATION_OVERFLOW");
    }
    if (
      error.code === "FINANCIAL_POLICY_MISMATCH" ||
      error.code === "FINANCIAL_UNSUPPORTED_CURRENCY"
    ) {
      calculationFail("BILLING_CALCULATION_POLICY_MISMATCH");
    }
  }
  calculationFail("BILLING_CALCULATION_INVALID");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function calculateBillingFormula(value: unknown): BillingFormulaOutput {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join("\0") !== INPUT_KEYS.join("\0")
  ) {
    calculationFail("BILLING_CALCULATION_INVALID");
  }
  if (
    value.formula_kind !== "fixed" &&
    value.formula_kind !== "percentage" &&
    value.formula_kind !== "minimum_support" &&
    value.formula_kind !== "hybrid"
  ) {
    calculationFail("BILLING_CALCULATION_UNSUPPORTED_FORMULA");
  }
  if (
    value.currency_policy_version !== "usd-v1" ||
    value.rounding_policy_version !== "half-away-from-zero-v1" ||
    value.formula_version !== BILLING_FORMULA_VERSION
  ) {
    calculationFail("BILLING_CALCULATION_POLICY_MISMATCH");
  }

  try {
    roundExactRatioToUsdMoney({
      numerator: "0",
      denominator: "1",
      currency: "USD",
      currency_exponent: "2",
      currency_policy_version: value.currency_policy_version,
      rounding_policy_version: value.rounding_policy_version,
    });
    const commissionable = parseUsdMoney(value.commissionable_amount);
    const commissionableMinor = BigInt(commissionable.amount_minor);
    if (commissionableMinor < 0n) {
      calculationFail("BILLING_CALCULATION_NEGATIVE_REVENUE");
    }

    const formulaKind = value.formula_kind;
    let fixedCandidate: string | null = null;
    let minimumCandidate: string | null = null;
    let percentageCandidate: string | null = null;
    let intermediateNumerator: string | null = null;
    let intermediateDenominator: string | null = null;
    let selectedBranch: BillingFormulaOutput["selected_branch"];
    let finalAmount: string;

    if (formulaKind === "fixed") {
      if (
        value.fixed_amount === null ||
        value.minimum_amount !== null ||
        value.rate !== null
      ) {
        calculationFail("BILLING_CALCULATION_INVALID");
      }
      fixedCandidate = parseUsdMoney(value.fixed_amount).amount_minor;
      if (BigInt(fixedCandidate) < 0n)
        calculationFail("BILLING_CALCULATION_INVALID");
      selectedBranch = "fixed";
      finalAmount = fixedCandidate;
    } else if (formulaKind === "minimum_support") {
      if (
        value.fixed_amount !== null ||
        value.minimum_amount === null ||
        value.rate !== null
      ) {
        calculationFail("BILLING_CALCULATION_INVALID");
      }
      minimumCandidate = parseUsdMoney(value.minimum_amount).amount_minor;
      if (BigInt(minimumCandidate) < 0n)
        calculationFail("BILLING_CALCULATION_INVALID");
      selectedBranch = "minimum";
      finalAmount = minimumCandidate;
    } else {
      if (
        value.fixed_amount !== null ||
        value.rate === null ||
        (formulaKind === "percentage" && value.minimum_amount !== null) ||
        (formulaKind === "hybrid" && value.minimum_amount === null)
      ) {
        calculationFail("BILLING_CALCULATION_INVALID");
      }
      if (isRecord(value.rate) && value.rate.denominator === "0") {
        calculationFail("BILLING_CALCULATION_DIVISION_BY_ZERO");
      }
      const parsedRate = parseOrdinaryPercentageRate(value.rate);
      intermediateNumerator = (
        commissionableMinor * BigInt(parsedRate.numerator)
      ).toString(10);
      intermediateDenominator = parsedRate.denominator;
      percentageCandidate = multiplyUsdMoneyByRate(commissionable, parsedRate, {
        currency: "USD",
        currency_exponent: "2",
        currency_policy_version: value.currency_policy_version,
        rounding_policy_version: value.rounding_policy_version,
      }).amount_minor;
      if (formulaKind === "percentage") {
        selectedBranch = "percentage";
        finalAmount = percentageCandidate;
      } else {
        minimumCandidate = parseUsdMoney(value.minimum_amount).amount_minor;
        if (BigInt(minimumCandidate) < 0n)
          calculationFail("BILLING_CALCULATION_INVALID");
        const percentageValue = BigInt(percentageCandidate);
        const minimumValue = BigInt(minimumCandidate);
        if (percentageValue > minimumValue) {
          selectedBranch = "percentage";
          finalAmount = percentageCandidate;
        } else if (percentageValue === minimumValue) {
          selectedBranch = "minimum_equal";
          finalAmount = minimumCandidate;
        } else {
          selectedBranch = "minimum";
          finalAmount = minimumCandidate;
        }
      }
    }

    return Object.freeze({
      formula_kind: formulaKind,
      intermediate_numerator: intermediateNumerator,
      intermediate_denominator: intermediateDenominator,
      fixed_candidate_minor: fixedCandidate,
      minimum_candidate_minor: minimumCandidate,
      percentage_candidate_minor: percentageCandidate,
      selected_branch: selectedBranch,
      final_amount_minor: finalAmount,
      currency: "USD",
    });
  } catch (error) {
    mapFinancialError(error);
  }
}

export function classifyBillingAdjustment(
  value: BillingAdjustmentInput,
): BillingAdjustmentOutput {
  if (
    value.true_up_policy !== "next_period_adjustment" &&
    value.true_up_policy !== "credit_candidate"
  ) {
    calculationFail("BILLING_CALCULATION_POLICY_MISMATCH");
  }
  try {
    const original = parseUsdMoney({
      amount_minor: value.original_amount_minor,
      currency: "USD",
    }).amount_minor;
    const actual = parseUsdMoney({
      amount_minor: value.actual_amount_minor,
      currency: "USD",
    }).amount_minor;
    if (BigInt(original) < 0n || BigInt(actual) < 0n) {
      calculationFail("BILLING_CALCULATION_INVALID");
    }
    const delta = BigInt(actual) - BigInt(original);
    const treatment =
      delta > 0n
        ? "true_up"
        : delta === 0n
          ? "no_adjustment"
          : value.true_up_policy === "credit_candidate"
            ? "credit_candidate"
            : "held";
    const status =
      treatment === "held"
        ? "held"
        : treatment === "no_adjustment"
          ? "no_adjustment"
          : "approved";
    return Object.freeze({
      original_amount_minor: original,
      actual_amount_minor: actual,
      delta_minor: delta.toString(10),
      treatment,
      status,
    });
  } catch (error) {
    mapFinancialError(error);
  }
}

const money = (amountMinor: string) =>
  Object.freeze({ amount_minor: amountMinor, currency: "USD" });
const rate = (
  numerator: string,
  denominator: string,
  submittedPercentage: string,
) =>
  Object.freeze({
    kind: "ordinary_percentage",
    numerator,
    denominator,
    submitted_percentage: submittedPercentage,
    rate_policy_version: "ordinary-percentage-v1",
  });

const baseInput = Object.freeze({
  commissionable_amount: money("0"),
  fixed_amount: null,
  minimum_amount: null,
  rate: null,
  ...BILLING_CALCULATION_POLICY,
});

export const BILLING_CALCULATION_GOLDEN_VECTORS = Object.freeze([
  Object.freeze({
    name: "fixed zero",
    input: Object.freeze({
      ...baseInput,
      formula_kind: "fixed",
      fixed_amount: money("0"),
    }),
    expected: Object.freeze({
      formula_kind: "fixed",
      intermediate_numerator: null,
      intermediate_denominator: null,
      fixed_candidate_minor: "0",
      minimum_candidate_minor: null,
      percentage_candidate_minor: null,
      selected_branch: "fixed",
      final_amount_minor: "0",
      currency: "USD",
    }),
  }),
  Object.freeze({
    name: "fixed bigint maximum",
    input: Object.freeze({
      ...baseInput,
      formula_kind: "fixed",
      fixed_amount: money("9223372036854775807"),
    }),
    expected: Object.freeze({
      formula_kind: "fixed",
      intermediate_numerator: null,
      intermediate_denominator: null,
      fixed_candidate_minor: "9223372036854775807",
      minimum_candidate_minor: null,
      percentage_candidate_minor: null,
      selected_branch: "fixed",
      final_amount_minor: "9223372036854775807",
      currency: "USD",
    }),
  }),
  Object.freeze({
    name: "percentage exact division",
    input: Object.freeze({
      ...baseInput,
      formula_kind: "percentage",
      commissionable_amount: money("1000"),
      rate: rate("1", "8", "12.5%"),
    }),
    expected: Object.freeze({
      formula_kind: "percentage",
      intermediate_numerator: "1000",
      intermediate_denominator: "8",
      fixed_candidate_minor: null,
      minimum_candidate_minor: null,
      percentage_candidate_minor: "125",
      selected_branch: "percentage",
      final_amount_minor: "125",
      currency: "USD",
    }),
  }),
  Object.freeze({
    name: "percentage positive tie rounds away",
    input: Object.freeze({
      ...baseInput,
      formula_kind: "percentage",
      commissionable_amount: money("1"),
      rate: rate("1", "2", "50%"),
    }),
    expected: Object.freeze({
      formula_kind: "percentage",
      intermediate_numerator: "1",
      intermediate_denominator: "2",
      fixed_candidate_minor: null,
      minimum_candidate_minor: null,
      percentage_candidate_minor: "1",
      selected_branch: "percentage",
      final_amount_minor: "1",
      currency: "USD",
    }),
  }),
  Object.freeze({
    name: "minimum support",
    input: Object.freeze({
      ...baseInput,
      formula_kind: "minimum_support",
      minimum_amount: money("125000"),
    }),
    expected: Object.freeze({
      formula_kind: "minimum_support",
      intermediate_numerator: null,
      intermediate_denominator: null,
      fixed_candidate_minor: null,
      minimum_candidate_minor: "125000",
      percentage_candidate_minor: null,
      selected_branch: "minimum",
      final_amount_minor: "125000",
      currency: "USD",
    }),
  }),
  Object.freeze({
    name: "minimum support bigint maximum",
    input: Object.freeze({
      ...baseInput,
      formula_kind: "minimum_support",
      minimum_amount: money("9223372036854775807"),
    }),
    expected: Object.freeze({
      formula_kind: "minimum_support",
      intermediate_numerator: null,
      intermediate_denominator: null,
      fixed_candidate_minor: null,
      minimum_candidate_minor: "9223372036854775807",
      percentage_candidate_minor: null,
      selected_branch: "minimum",
      final_amount_minor: "9223372036854775807",
      currency: "USD",
    }),
  }),
  Object.freeze({
    name: "hybrid percentage below minimum",
    input: Object.freeze({
      ...baseInput,
      formula_kind: "hybrid",
      commissionable_amount: money("1000"),
      minimum_amount: money("200"),
      rate: rate("1", "10", "10%"),
    }),
    expected: Object.freeze({
      formula_kind: "hybrid",
      intermediate_numerator: "1000",
      intermediate_denominator: "10",
      fixed_candidate_minor: null,
      minimum_candidate_minor: "200",
      percentage_candidate_minor: "100",
      selected_branch: "minimum",
      final_amount_minor: "200",
      currency: "USD",
    }),
  }),
  Object.freeze({
    name: "hybrid equality deterministically selects minimum equal",
    input: Object.freeze({
      ...baseInput,
      formula_kind: "hybrid",
      commissionable_amount: money("2000"),
      minimum_amount: money("200"),
      rate: rate("1", "10", "10%"),
    }),
    expected: Object.freeze({
      formula_kind: "hybrid",
      intermediate_numerator: "2000",
      intermediate_denominator: "10",
      fixed_candidate_minor: null,
      minimum_candidate_minor: "200",
      percentage_candidate_minor: "200",
      selected_branch: "minimum_equal",
      final_amount_minor: "200",
      currency: "USD",
    }),
  }),
  Object.freeze({
    name: "hybrid percentage above minimum",
    input: Object.freeze({
      ...baseInput,
      formula_kind: "hybrid",
      commissionable_amount: money("3000"),
      minimum_amount: money("200"),
      rate: rate("1", "10", "10%"),
    }),
    expected: Object.freeze({
      formula_kind: "hybrid",
      intermediate_numerator: "3000",
      intermediate_denominator: "10",
      fixed_candidate_minor: null,
      minimum_candidate_minor: "200",
      percentage_candidate_minor: "300",
      selected_branch: "percentage",
      final_amount_minor: "300",
      currency: "USD",
    }),
  }),
] satisfies ReadonlyArray<{
  name: string;
  input: BillingFormulaInput;
  expected: BillingFormulaOutput;
}>);

export const BILLING_CALCULATION_ERROR_VECTORS = Object.freeze([
  Object.freeze({
    name: "negative base revenue",
    input: Object.freeze({
      ...baseInput,
      formula_kind: "fixed",
      commissionable_amount: money("-1"),
      fixed_amount: money("1"),
    }),
    expected_error: "BILLING_CALCULATION_NEGATIVE_REVENUE",
  }),
  Object.freeze({
    name: "unsupported formula",
    input: Object.freeze({ ...baseInput, formula_kind: "tiered" }),
    expected_error: "BILLING_CALCULATION_UNSUPPORTED_FORMULA",
  }),
  Object.freeze({
    name: "wrong rounding policy",
    input: Object.freeze({
      ...baseInput,
      formula_kind: "fixed",
      fixed_amount: money("1"),
      rounding_policy_version: "bankers-v1",
    }),
    expected_error: "BILLING_CALCULATION_POLICY_MISMATCH",
  }),
  Object.freeze({
    name: "ambiguous fixed candidates",
    input: Object.freeze({
      ...baseInput,
      formula_kind: "fixed",
      fixed_amount: money("1"),
      minimum_amount: money("1"),
    }),
    expected_error: "BILLING_CALCULATION_INVALID",
  }),
  Object.freeze({
    name: "percentage division by zero",
    input: Object.freeze({
      ...baseInput,
      formula_kind: "percentage",
      commissionable_amount: money("1"),
      rate: Object.freeze({
        kind: "ordinary_percentage",
        numerator: "1",
        denominator: "0",
        submitted_percentage: "50%",
        rate_policy_version: "ordinary-percentage-v1",
      }),
    }),
    expected_error: "BILLING_CALCULATION_DIVISION_BY_ZERO",
  }),
  Object.freeze({
    name: "fixed result above bigint maximum",
    input: Object.freeze({
      ...baseInput,
      formula_kind: "fixed",
      fixed_amount: money("9223372036854775808"),
    }),
    expected_error: "BILLING_CALCULATION_OVERFLOW",
  }),
] satisfies ReadonlyArray<{
  name: string;
  input: BillingFormulaInput;
  expected_error: BillingCalculationErrorCode;
}>);

export const BILLING_SIGNED_ADJUSTMENT_ROUNDING_VECTORS = Object.freeze([
  Object.freeze({ numerator: "1", denominator: "2", expected: "1" }),
  Object.freeze({ numerator: "-1", denominator: "2", expected: "-1" }),
]);

export const BILLING_ADJUSTMENT_GOLDEN_VECTORS = Object.freeze([
  Object.freeze({
    name: "late evidence positive true-up",
    original_amount_minor: "125000",
    actual_amount_minor: "175000",
    true_up_policy: "next_period_adjustment",
    expected: Object.freeze({
      original_amount_minor: "125000",
      actual_amount_minor: "175000",
      delta_minor: "50000",
      treatment: "true_up",
      status: "approved",
    }),
  }),
  Object.freeze({
    name: "late evidence exact no-adjustment",
    original_amount_minor: "125000",
    actual_amount_minor: "125000",
    true_up_policy: "next_period_adjustment",
    expected: Object.freeze({
      original_amount_minor: "125000",
      actual_amount_minor: "125000",
      delta_minor: "0",
      treatment: "no_adjustment",
      status: "no_adjustment",
    }),
  }),
  Object.freeze({
    name: "contract-permitted negative credit candidate",
    original_amount_minor: "125000",
    actual_amount_minor: "100000",
    true_up_policy: "credit_candidate",
    expected: Object.freeze({
      original_amount_minor: "125000",
      actual_amount_minor: "100000",
      delta_minor: "-25000",
      treatment: "credit_candidate",
      status: "approved",
    }),
  }),
  Object.freeze({
    name: "contract-prohibited negative held for review",
    original_amount_minor: "125000",
    actual_amount_minor: "100000",
    true_up_policy: "next_period_adjustment",
    expected: Object.freeze({
      original_amount_minor: "125000",
      actual_amount_minor: "100000",
      delta_minor: "-25000",
      treatment: "held",
      status: "held",
    }),
  }),
] satisfies ReadonlyArray<{
  name: string;
  original_amount_minor: string;
  actual_amount_minor: string;
  true_up_policy: "next_period_adjustment" | "credit_candidate";
  expected: BillingAdjustmentOutput;
}>);
import {
  FinancialContractError,
  multiplyUsdMoneyByRate,
  parseOrdinaryPercentageRate,
  parseUsdMoney,
  roundExactRatioToUsdMoney,
} from "./exactMoney";
