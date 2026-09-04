const canonicalIntegerBrand: unique symbol = Symbol("CanonicalIntegerText");

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

export type FinancialErrorCode =
  | "FINANCIAL_DIVISION_BY_ZERO"
  | "FINANCIAL_INPUT_TOO_LONG"
  | "FINANCIAL_INVALID_INTEGER"
  | "FINANCIAL_INVALID_MONEY"
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
