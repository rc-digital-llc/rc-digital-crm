export const USD_CURRENCY = "USD" as const;
export const USD_CURRENCY_POLICY_VERSION = "usd-v1" as const;
export const USD_CURRENCY_EXPONENT = 2 as const;
export const ORDINARY_PERCENTAGE_RATE_POLICY_VERSION =
  "ordinary-percentage-v1" as const;
export const HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION =
  "half-away-from-zero-v1" as const;

export const POSTGRES_BIGINT_MIN = -9_223_372_036_854_775_808n;
export const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;

declare const canonicalIntegerTextBrand: unique symbol;
declare const usdMoneyBrand: unique symbol;
declare const ordinaryPercentageRateBrand: unique symbol;
declare const exactRatioBrand: unique symbol;

export type CanonicalIntegerText = string & {
  readonly [canonicalIntegerTextBrand]: true;
};

export type UsdMoneyWire = Readonly<{
  amount_minor: string;
  currency: typeof USD_CURRENCY;
}>;

export type UsdMoney = Readonly<{
  amount_minor: CanonicalIntegerText;
  currency: typeof USD_CURRENCY;
  readonly [usdMoneyBrand]: true;
}>;

export type OrdinaryPercentageRateWire = Readonly<{
  kind: "ordinary_percentage";
  numerator: string;
  denominator: string;
  submitted_percentage: string;
  rate_policy_version: typeof ORDINARY_PERCENTAGE_RATE_POLICY_VERSION;
}>;

export type OrdinaryPercentageRate = Readonly<{
  kind: "ordinary_percentage";
  numerator: CanonicalIntegerText;
  denominator: CanonicalIntegerText;
  submitted_percentage: string;
  rate_policy_version: typeof ORDINARY_PERCENTAGE_RATE_POLICY_VERSION;
  readonly [ordinaryPercentageRateBrand]: true;
}>;

export type ExactRatioWire = Readonly<{
  numerator: string;
  denominator: string;
}>;

export type ExactRatio = Readonly<{
  numerator: string;
  denominator: string;
  readonly [exactRatioBrand]: true;
}>;

export type FinancialErrorCode =
  | "FINANCIAL_INPUT_TOO_LONG"
  | "FINANCIAL_INVALID_INTEGER"
  | "FINANCIAL_INVALID_MONEY"
  | "FINANCIAL_UNSUPPORTED_CURRENCY"
  | "FINANCIAL_OVERFLOW"
  | "FINANCIAL_INVALID_PERCENTAGE"
  | "FINANCIAL_RATE_OUT_OF_BOUNDS"
  | "FINANCIAL_INVALID_RATE_WIRE"
  | "FINANCIAL_POLICY_MISMATCH"
  | "FINANCIAL_INVALID_RATIO"
  | "FINANCIAL_ZERO_DENOMINATOR"
  | "FINANCIAL_INVALID_ROUNDING_REQUEST";

export class FinancialContractError extends Error {
  readonly code: FinancialErrorCode;

  constructor(code: FinancialErrorCode, message: string) {
    super(message);
    this.name = "FinancialContractError";
    this.code = code;
  }
}

export function parseCanonicalIntegerText(
  input: unknown,
): CanonicalIntegerText {
  if (typeof input !== "string") {
    throw new FinancialContractError(
      "FINANCIAL_INVALID_INTEGER",
      "Expected signed base-10 integer text",
    );
  }
  if (new TextEncoder().encode(input).byteLength > 64) {
    throw new FinancialContractError(
      "FINANCIAL_INPUT_TOO_LONG",
      "Financial integer input exceeds the accepted byte limit",
    );
  }
  if (!/^-?[0-9]+$/.test(input)) {
    throw new FinancialContractError(
      "FINANCIAL_INVALID_INTEGER",
      "Expected signed base-10 integer text",
    );
  }

  const isNegative = input.startsWith("-");
  const digits = isNegative ? input.slice(1) : input;
  const normalizedDigits = digits.replace(/^0+(?=[0-9])/, "");
  const canonical =
    normalizedDigits === "0"
      ? "0"
      : `${isNegative ? "-" : ""}${normalizedDigits}`;
  const exact = BigInt(canonical);

  if (exact < POSTGRES_BIGINT_MIN || exact > POSTGRES_BIGINT_MAX) {
    throw new FinancialContractError(
      "FINANCIAL_OVERFLOW",
      "Financial integer is outside the persisted range",
    );
  }

  return canonical as CanonicalIntegerText;
}

const isRecord = (input: unknown): input is Record<string, unknown> =>
  typeof input === "object" && input !== null && !Array.isArray(input);

const hasExactKeys = (
  input: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean => {
  const actualKeys = Object.keys(input).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
};

export function parseUsdMoney(input: unknown): UsdMoney {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ["amount_minor", "currency"]) ||
    typeof input.amount_minor !== "string"
  ) {
    throw new FinancialContractError(
      "FINANCIAL_INVALID_MONEY",
      "Money must contain only string minor units and explicit currency",
    );
  }
  if (input.currency !== USD_CURRENCY) {
    throw new FinancialContractError(
      "FINANCIAL_UNSUPPORTED_CURRENCY",
      "Money currency is not supported by this policy",
    );
  }

  return Object.freeze({
    amount_minor: parseCanonicalIntegerText(input.amount_minor),
    currency: USD_CURRENCY,
  }) as UsdMoney;
}

export function toUsdMoneyWire(money: UsdMoney): UsdMoneyWire {
  return Object.freeze({
    amount_minor: money.amount_minor,
    currency: money.currency,
  });
}

export function formatUsdMoney(money: UsdMoney): string {
  const minorUnits = BigInt(money.amount_minor);
  const isNegative = minorUnits < 0n;
  const magnitude = isNegative ? -minorUnits : minorUnits;
  const dollars = magnitude / 100n;
  const cents = (magnitude % 100n).toString().padStart(2, "0");

  return `${isNegative ? "-" : ""}$${dollars.toString()}.${cents}`;
}

export function parseOrdinaryPercentageRate(
  input: unknown,
): OrdinaryPercentageRate {
  if (typeof input !== "string") {
    throw new FinancialContractError(
      "FINANCIAL_INVALID_PERCENTAGE",
      "Expected ordinary percentage text",
    );
  }
  if (new TextEncoder().encode(input).byteLength > 14) {
    throw new FinancialContractError(
      "FINANCIAL_INPUT_TOO_LONG",
      "Percentage input exceeds the accepted byte limit",
    );
  }
  const numericShape = /^(?:[0-9]{1,3})(?:\.[0-9]{1,9})?%$/.test(input);
  if (numericShape) {
    const [candidateWhole, candidateFraction = ""] = input
      .slice(0, -1)
      .split(".");
    const candidateScale = 10n ** BigInt(candidateFraction.length);
    const candidateValue = BigInt(`${candidateWhole}${candidateFraction}`);
    if (candidateValue > 100n * candidateScale) {
      throw new FinancialContractError(
        "FINANCIAL_RATE_OUT_OF_BOUNDS",
        "Ordinary percentage is outside the supported range",
      );
    }
  }
  if (!/^(?:0|[1-9][0-9]?|100)(?:\.[0-9]{1,9})?%$/.test(input)) {
    throw new FinancialContractError(
      "FINANCIAL_INVALID_PERCENTAGE",
      "Expected bounded decimal percentage text",
    );
  }

  const decimal = input.slice(0, -1);
  const [whole, fraction = ""] = decimal.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const scaledPercentage = BigInt(`${whole}${fraction}`);
  const unreducedDenominator = 100n * scale;
  const divisor = greatestCommonDivisor(scaledPercentage, unreducedDenominator);
  const numerator = scaledPercentage / divisor;
  const denominator = unreducedDenominator / divisor;

  return Object.freeze({
    kind: "ordinary_percentage",
    numerator: numerator.toString() as CanonicalIntegerText,
    denominator: denominator.toString() as CanonicalIntegerText,
    submitted_percentage: input,
    rate_policy_version: ORDINARY_PERCENTAGE_RATE_POLICY_VERSION,
  }) as OrdinaryPercentageRate;
}

export function parseOrdinaryPercentageRateWire(
  input: unknown,
): OrdinaryPercentageRate {
  const expectedKeys = [
    "kind",
    "numerator",
    "denominator",
    "submitted_percentage",
    "rate_policy_version",
  ] as const;
  if (!isRecord(input) || !hasExactKeys(input, expectedKeys)) {
    throw new FinancialContractError(
      "FINANCIAL_INVALID_RATE_WIRE",
      "Rate wire shape is invalid",
    );
  }
  if (
    input.kind !== "ordinary_percentage" ||
    input.rate_policy_version !== ORDINARY_PERCENTAGE_RATE_POLICY_VERSION
  ) {
    throw new FinancialContractError(
      "FINANCIAL_POLICY_MISMATCH",
      "Rate policy is not supported",
    );
  }
  if (
    typeof input.numerator !== "string" ||
    typeof input.denominator !== "string" ||
    typeof input.submitted_percentage !== "string"
  ) {
    throw new FinancialContractError(
      "FINANCIAL_INVALID_RATE_WIRE",
      "Rate wire components must be strings",
    );
  }

  const parsed = parseOrdinaryPercentageRate(input.submitted_percentage);
  if (
    input.numerator !== parsed.numerator ||
    input.denominator !== parsed.denominator
  ) {
    throw new FinancialContractError(
      "FINANCIAL_INVALID_RATE_WIRE",
      "Rate wire components do not match submitted evidence",
    );
  }

  return parsed;
}

export function toOrdinaryPercentageRateWire(
  rate: OrdinaryPercentageRate,
): OrdinaryPercentageRateWire {
  return Object.freeze({
    kind: rate.kind,
    numerator: rate.numerator,
    denominator: rate.denominator,
    submitted_percentage: rate.submitted_percentage,
    rate_policy_version: rate.rate_policy_version,
  });
}

export function ratesAreFinanciallyEqual(
  left: OrdinaryPercentageRate,
  right: OrdinaryPercentageRate,
): boolean {
  return (
    left.kind === right.kind &&
    left.rate_policy_version === right.rate_policy_version &&
    left.numerator === right.numerator &&
    left.denominator === right.denominator
  );
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let dividend = left < 0n ? -left : left;
  let divisor = right < 0n ? -right : right;

  while (divisor !== 0n) {
    const remainder = dividend % divisor;
    dividend = divisor;
    divisor = remainder;
  }

  return dividend === 0n ? 1n : dividend;
}

function parseExactRatioInteger(input: unknown): string {
  if (typeof input !== "string") {
    throw new FinancialContractError(
      "FINANCIAL_INVALID_RATIO",
      "Exact ratio components must be signed integer text",
    );
  }
  if (new TextEncoder().encode(input).byteLength > 64) {
    throw new FinancialContractError(
      "FINANCIAL_INPUT_TOO_LONG",
      "Exact ratio input exceeds the accepted byte limit",
    );
  }
  if (!/^-?[0-9]+$/.test(input)) {
    throw new FinancialContractError(
      "FINANCIAL_INVALID_RATIO",
      "Exact ratio components must be signed integer text",
    );
  }

  const isNegative = input.startsWith("-");
  const digits = isNegative ? input.slice(1) : input;
  const normalizedDigits = digits.replace(/^0+(?=[0-9])/, "");

  return normalizedDigits === "0"
    ? "0"
    : `${isNegative ? "-" : ""}${normalizedDigits}`;
}

export function reduceExactRatio(input: unknown): ExactRatio {
  if (!isRecord(input) || !hasExactKeys(input, ["numerator", "denominator"])) {
    throw new FinancialContractError(
      "FINANCIAL_INVALID_RATIO",
      "Exact ratio shape is invalid",
    );
  }

  const numeratorText = parseExactRatioInteger(input.numerator);
  const denominatorText = parseExactRatioInteger(input.denominator);
  const numerator = BigInt(numeratorText);
  const denominator = BigInt(denominatorText);
  if (denominator === 0n) {
    throw new FinancialContractError(
      "FINANCIAL_ZERO_DENOMINATOR",
      "Exact ratio denominator cannot be zero",
    );
  }
  if (denominator < 0n) {
    throw new FinancialContractError(
      "FINANCIAL_INVALID_RATIO",
      "Exact ratio denominator must be positive",
    );
  }

  const divisor = greatestCommonDivisor(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator =
    reducedNumerator === 0n ? 1n : denominator / divisor;

  return Object.freeze({
    numerator: reducedNumerator.toString(),
    denominator: reducedDenominator.toString(),
  }) as ExactRatio;
}

export function toExactRatioWire(ratio: ExactRatio): ExactRatioWire {
  return Object.freeze({
    numerator: ratio.numerator,
    denominator: ratio.denominator,
  });
}

export function exactRatiosAreEqual(
  left: ExactRatio,
  right: ExactRatio,
): boolean {
  return (
    left.numerator === right.numerator && left.denominator === right.denominator
  );
}

export function roundExactRatioToUsdMoney(input: unknown): UsdMoney {
  const expectedKeys = [
    "numerator",
    "denominator",
    "currency",
    "currency_policy_version",
    "currency_exponent",
    "rounding_policy_version",
  ] as const;
  if (!isRecord(input) || !hasExactKeys(input, expectedKeys)) {
    throw new FinancialContractError(
      "FINANCIAL_INVALID_ROUNDING_REQUEST",
      "Rounding request shape is invalid",
    );
  }
  if (input.currency !== USD_CURRENCY) {
    throw new FinancialContractError(
      "FINANCIAL_UNSUPPORTED_CURRENCY",
      "Rounding currency is not supported",
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
      "Rounding policy context is not supported",
    );
  }

  const ratio = reduceExactRatio({
    numerator: input.numerator,
    denominator: input.denominator,
  });
  const numerator = BigInt(ratio.numerator);
  const denominator = BigInt(ratio.denominator);
  const isNegative = numerator < 0n;
  const magnitude = isNegative ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const remainder = magnitude % denominator;
  const roundedMagnitude =
    remainder * 2n >= denominator ? quotient + 1n : quotient;
  const rounded = isNegative ? -roundedMagnitude : roundedMagnitude;

  return parseUsdMoney({
    amount_minor: rounded.toString(),
    currency: USD_CURRENCY,
  });
}
