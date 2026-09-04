const canonicalIntegerBrand: unique symbol = Symbol("CanonicalIntegerText");
const exactRatioBrand: unique symbol = Symbol("ExactRatio");

export type CanonicalIntegerText = string & {
  readonly [canonicalIntegerBrand]: true;
};

export type UsdMoney = Readonly<{
  amount_minor: CanonicalIntegerText;
  currency: "USD";
}>;

export type OrdinaryPercentageRate = Readonly<{
  kind: "ordinary_percentage";
  numerator: CanonicalIntegerText;
  denominator: CanonicalIntegerText;
  submitted_percentage: string;
  rate_policy_version: "ordinary-percentage-v1";
}>;

export type ExactRatio = Readonly<{
  numerator: CanonicalIntegerText;
  denominator: CanonicalIntegerText;
  readonly [exactRatioBrand]: true;
}>;

export type UsdRoundingPolicy = Readonly<{
  currency: "USD";
  currency_exponent: "2";
  currency_policy_version: "usd-v1";
  rounding_policy_version: "half-away-from-zero-v1";
}>;

export type FinancialErrorCode =
  | "FINANCIAL_DIVISION_BY_ZERO"
  | "FINANCIAL_INPUT_TOO_LONG"
  | "FINANCIAL_INVALID_INTEGER"
  | "FINANCIAL_INVALID_MONEY"
  | "FINANCIAL_INVALID_RATIO"
  | "FINANCIAL_INVALID_RATE"
  | "FINANCIAL_OVERFLOW"
  | "FINANCIAL_POLICY_MISMATCH"
  | "FINANCIAL_RATE_OUT_OF_BOUNDS"
  | "FINANCIAL_UNSUPPORTED_CURRENCY";

export class FinancialContractError extends Error {
  readonly code: FinancialErrorCode;

  constructor(code: FinancialErrorCode) {
    super(code);
    this.name = "FinancialContractError";
    this.code = code;
  }
}

const POSTGRES_BIGINT_MIN = -9223372036854775808n;
const POSTGRES_BIGINT_MAX = 9223372036854775807n;
const MAX_INTEGER_TEXT_BYTES = 64;
const MAX_PERCENTAGE_TEXT_BYTES = 14;
const CANONICAL_INTEGER_PATTERN = /^-?[0-9]+$/;
const ORDINARY_PERCENTAGE_PATTERN = /^(?:0|[1-9][0-9]?|100)(?:\.[0-9]{1,9})?%$/;
const RATE_WIRE_KEYS = Object.freeze([
  "denominator",
  "kind",
  "numerator",
  "rate_policy_version",
  "submitted_percentage",
]);
const EXACT_RATIO_KEYS = Object.freeze(["denominator", "numerator"]);
const USD_ROUNDING_KEYS = Object.freeze([
  "currency",
  "currency_exponent",
  "currency_policy_version",
  "rounding_policy_version",
]);

export const USD_HALF_AWAY_ROUNDING_POLICY: UsdRoundingPolicy = Object.freeze({
  currency: "USD",
  currency_exponent: "2",
  currency_policy_version: "usd-v1",
  rounding_policy_version: "half-away-from-zero-v1",
});

function fail(code: FinancialErrorCode): never {
  throw new FinancialContractError(code);
}

function asciiByteLength(value: string): bigint {
  let count = 0n;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      fail("FINANCIAL_INVALID_INTEGER");
    }
    count +=
      codePoint <= 0x7f
        ? 1n
        : codePoint <= 0x7ff
          ? 2n
          : codePoint <= 0xffff
            ? 3n
            : 4n;
  }
  return count;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalTextFromBigInt(value: bigint): CanonicalIntegerText {
  return value.toString(10) as CanonicalIntegerText;
}

function assertPersistedBigInt(value: bigint): bigint {
  if (value < POSTGRES_BIGINT_MIN || value > POSTGRES_BIGINT_MAX) {
    fail("FINANCIAL_OVERFLOW");
  }
  return value;
}

export function parseCanonicalIntegerText(
  value: unknown,
): CanonicalIntegerText {
  if (typeof value !== "string") {
    fail("FINANCIAL_INVALID_INTEGER");
  }
  if (asciiByteLength(value) > BigInt(MAX_INTEGER_TEXT_BYTES)) {
    fail("FINANCIAL_INPUT_TOO_LONG");
  }
  if (!CANONICAL_INTEGER_PATTERN.test(value)) {
    fail("FINANCIAL_INVALID_INTEGER");
  }

  return canonicalTextFromBigInt(assertPersistedBigInt(BigInt(value)));
}

export function parseUsdMoney(value: unknown): UsdMoney {
  if (!isPlainRecord(value)) {
    fail("FINANCIAL_INVALID_MONEY");
  }
  if (!("currency" in value)) {
    fail("FINANCIAL_INVALID_MONEY");
  }
  if (value.currency !== "USD") {
    fail("FINANCIAL_UNSUPPORTED_CURRENCY");
  }
  if (!("amount_minor" in value)) {
    fail("FINANCIAL_INVALID_MONEY");
  }

  return Object.freeze({
    amount_minor: parseCanonicalIntegerText(value.amount_minor),
    currency: "USD",
  });
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

export function parseExactRatio(value: unknown): ExactRatio {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).sort().join("\0") !== EXACT_RATIO_KEYS.join("\0")
  ) {
    fail("FINANCIAL_INVALID_RATIO");
  }

  let numerator: CanonicalIntegerText;
  let denominator: CanonicalIntegerText;
  try {
    numerator = parseCanonicalIntegerText(value.numerator);
    denominator = parseCanonicalIntegerText(value.denominator);
  } catch (error) {
    if (
      error instanceof FinancialContractError &&
      error.code === "FINANCIAL_INPUT_TOO_LONG"
    ) {
      throw error;
    }
    fail("FINANCIAL_INVALID_RATIO");
  }

  const numeratorValue = BigInt(numerator);
  const denominatorValue = BigInt(denominator);
  if (denominatorValue === 0n) {
    fail("FINANCIAL_DIVISION_BY_ZERO");
  }
  if (denominatorValue < 0n) {
    fail("FINANCIAL_INVALID_RATIO");
  }

  const divisor = greatestCommonDivisor(numeratorValue, denominatorValue);
  const reducedNumerator =
    numeratorValue === 0n ? 0n : numeratorValue / divisor;
  const reducedDenominator =
    numeratorValue === 0n ? 1n : denominatorValue / divisor;

  return Object.freeze({
    numerator: canonicalTextFromBigInt(assertPersistedBigInt(reducedNumerator)),
    denominator: canonicalTextFromBigInt(
      assertPersistedBigInt(reducedDenominator),
    ),
  }) as ExactRatio;
}

function makeOrdinaryPercentageRate(
  numerator: bigint,
  denominator: bigint,
  submittedPercentage: string,
): OrdinaryPercentageRate {
  const divisor = greatestCommonDivisor(numerator, denominator);
  const reducedNumerator = numerator === 0n ? 0n : numerator / divisor;
  const reducedDenominator = numerator === 0n ? 1n : denominator / divisor;

  return Object.freeze({
    kind: "ordinary_percentage",
    numerator: canonicalTextFromBigInt(assertPersistedBigInt(reducedNumerator)),
    denominator: canonicalTextFromBigInt(
      assertPersistedBigInt(reducedDenominator),
    ),
    submitted_percentage: submittedPercentage,
    rate_policy_version: "ordinary-percentage-v1",
  });
}

export function parseOrdinaryPercentage(
  value: unknown,
): OrdinaryPercentageRate {
  if (typeof value !== "string") {
    fail("FINANCIAL_INVALID_RATE");
  }
  if (asciiByteLength(value) > BigInt(MAX_PERCENTAGE_TEXT_BYTES)) {
    fail("FINANCIAL_INPUT_TOO_LONG");
  }
  if (!ORDINARY_PERCENTAGE_PATTERN.test(value)) {
    fail("FINANCIAL_INVALID_RATE");
  }

  const decimalText = value.slice(0, -1);
  const [whole, fraction = ""] = decimalText.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const scaled = BigInt(`${whole}${fraction}`);
  const maximum = 100n * scale;
  if (scaled > maximum) {
    fail("FINANCIAL_RATE_OUT_OF_BOUNDS");
  }

  return makeOrdinaryPercentageRate(scaled, maximum, value);
}

function invalidRateUnlessLengthError(error: unknown): never {
  if (
    error instanceof FinancialContractError &&
    error.code === "FINANCIAL_INPUT_TOO_LONG"
  ) {
    throw error;
  }
  fail("FINANCIAL_INVALID_RATE");
}

export function parseOrdinaryPercentageRate(
  value: unknown,
): OrdinaryPercentageRate {
  if (!isPlainRecord(value)) {
    fail("FINANCIAL_INVALID_RATE");
  }
  if (Object.keys(value).sort().join("\0") !== RATE_WIRE_KEYS.join("\0")) {
    fail("FINANCIAL_INVALID_RATE");
  }
  if (
    value.kind !== "ordinary_percentage" ||
    value.rate_policy_version !== "ordinary-percentage-v1" ||
    typeof value.submitted_percentage !== "string"
  ) {
    fail("FINANCIAL_INVALID_RATE");
  }

  let numerator: CanonicalIntegerText;
  let denominator: CanonicalIntegerText;
  let submitted: OrdinaryPercentageRate;
  try {
    numerator = parseCanonicalIntegerText(value.numerator);
    denominator = parseCanonicalIntegerText(value.denominator);
    submitted = parseOrdinaryPercentage(value.submitted_percentage);
  } catch (error) {
    invalidRateUnlessLengthError(error);
  }

  const numeratorValue = BigInt(numerator);
  const denominatorValue = BigInt(denominator);
  if (
    numeratorValue < 0n ||
    denominatorValue <= 0n ||
    greatestCommonDivisor(numeratorValue, denominatorValue) !== 1n ||
    numerator !== submitted.numerator ||
    denominator !== submitted.denominator
  ) {
    fail("FINANCIAL_INVALID_RATE");
  }

  return Object.freeze({
    kind: "ordinary_percentage",
    numerator,
    denominator,
    submitted_percentage: value.submitted_percentage,
    rate_policy_version: "ordinary-percentage-v1",
  });
}

export function areRatesFinanciallyEqual(
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

export function areRatiosEqual(left: ExactRatio, right: ExactRatio): boolean {
  return (
    left.numerator === right.numerator && left.denominator === right.denominator
  );
}

function parseUsdRoundingPolicy(value: unknown): UsdRoundingPolicy {
  if (!isPlainRecord(value)) {
    fail("FINANCIAL_POLICY_MISMATCH");
  }
  if (!("currency" in value) || value.currency !== "USD") {
    fail("FINANCIAL_UNSUPPORTED_CURRENCY");
  }
  if (Object.keys(value).sort().join("\0") !== USD_ROUNDING_KEYS.join("\0")) {
    fail("FINANCIAL_POLICY_MISMATCH");
  }
  if (
    value.currency_exponent !== "2" ||
    value.currency_policy_version !== "usd-v1" ||
    value.rounding_policy_version !== "half-away-from-zero-v1"
  ) {
    fail("FINANCIAL_POLICY_MISMATCH");
  }
  return USD_HALF_AWAY_ROUNDING_POLICY;
}

function roundSignedFraction(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    fail("FINANCIAL_DIVISION_BY_ZERO");
  }
  if (denominator < 0n) {
    fail("FINANCIAL_INVALID_RATIO");
  }

  const isNegative = numerator < 0n;
  const absoluteNumerator = isNegative ? -numerator : numerator;
  let absoluteResult = absoluteNumerator / denominator;
  const remainder = absoluteNumerator % denominator;
  if (remainder * 2n >= denominator) {
    absoluteResult += 1n;
  }

  if (absoluteResult === 0n) {
    return 0n;
  }
  return isNegative ? -absoluteResult : absoluteResult;
}

function usdMoneyFromBigInt(value: bigint): UsdMoney {
  return Object.freeze({
    amount_minor: canonicalTextFromBigInt(assertPersistedBigInt(value)),
    currency: "USD",
  });
}

export function roundExactRatioToUsdMoney(value: unknown): UsdMoney {
  if (!isPlainRecord(value)) {
    fail("FINANCIAL_INVALID_RATIO");
  }
  const policy = parseUsdRoundingPolicy({
    currency: value.currency,
    currency_exponent: value.currency_exponent,
    currency_policy_version: value.currency_policy_version,
    rounding_policy_version: value.rounding_policy_version,
  });
  const ratio = parseExactRatio({
    numerator: value.numerator,
    denominator: value.denominator,
  });
  parseUsdRoundingPolicy(policy);

  return usdMoneyFromBigInt(
    roundSignedFraction(BigInt(ratio.numerator), BigInt(ratio.denominator)),
  );
}

export function multiplyUsdMoneyByExactRatio(
  moneyValue: unknown,
  ratioValue: unknown,
  policyValue: unknown,
): UsdMoney {
  const money = parseUsdMoney(moneyValue);
  const ratio = parseExactRatio(ratioValue);
  parseUsdRoundingPolicy(policyValue);

  const intermediateNumerator =
    BigInt(money.amount_minor) * BigInt(ratio.numerator);
  return usdMoneyFromBigInt(
    roundSignedFraction(intermediateNumerator, BigInt(ratio.denominator)),
  );
}

export function multiplyUsdMoneyByRate(
  moneyValue: unknown,
  rateValue: unknown,
  policyValue: unknown,
): UsdMoney {
  const rate = parseOrdinaryPercentageRate(rateValue);
  return multiplyUsdMoneyByExactRatio(
    moneyValue,
    { numerator: rate.numerator, denominator: rate.denominator },
    policyValue,
  );
}

export function formatUsdMoney(value: unknown): string {
  const money = parseUsdMoney(value);
  const amount = BigInt(money.amount_minor);
  const isNegative = amount < 0n;
  const absolute = isNegative ? -amount : amount;
  const dollars = (absolute / 100n)
    .toString(10)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = (absolute % 100n).toString(10).padStart(2, "0");
  return `${isNegative ? "-" : ""}$${dollars}.${cents}`;
}
