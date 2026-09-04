export const POSTGRES_BIGINT_MIN_TEXT = "-9223372036854775808";
export const POSTGRES_BIGINT_MAX_TEXT = "9223372036854775807";

export const SIXTY_FOUR_BYTE_INTEGER_TEXT = "0".repeat(64);
export const SIXTY_FIVE_BYTE_INTEGER_TEXT = "0".repeat(65);
export const FOURTEEN_BYTE_PERCENTAGE_TEXT = "100.000000000%";
export const FIFTEEN_BYTE_PERCENTAGE_TEXT = "0100.000000000%";

export const MONEY_CANONICAL_CASES = [
  { submitted: "0", canonical: "0" },
  { submitted: "-0", canonical: "0" },
  { submitted: "000000", canonical: "0" },
  { submitted: "-000000", canonical: "0" },
  { submitted: "00042", canonical: "42" },
  { submitted: "-00042", canonical: "-42" },
  { submitted: POSTGRES_BIGINT_MIN_TEXT, canonical: POSTGRES_BIGINT_MIN_TEXT },
  { submitted: POSTGRES_BIGINT_MAX_TEXT, canonical: POSTGRES_BIGINT_MAX_TEXT },
  { submitted: SIXTY_FOUR_BYTE_INTEGER_TEXT, canonical: "0" },
] as const;

export const MALFORMED_INTEGER_TEXTS = [
  "",
  " 1",
  "1 ",
  "+1",
  "1.0",
  "1e3",
  "1,000",
  "--1",
  "1_000",
] as const;

export const RATE_GOLDEN_CASES = [
  {
    submitted: "0%",
    numerator: "0",
    denominator: "1",
  },
  {
    submitted: "100%",
    numerator: "1",
    denominator: "1",
  },
  {
    submitted: FOURTEEN_BYTE_PERCENTAGE_TEXT,
    numerator: "1",
    denominator: "1",
  },
  {
    submitted: "12.5%",
    numerator: "1",
    denominator: "8",
  },
  {
    submitted: "12.500%",
    numerator: "1",
    denominator: "8",
  },
  {
    submitted: "8.875%",
    numerator: "71",
    denominator: "800",
  },
] as const;

export const MALFORMED_PERCENTAGE_TEXTS = [
  "",
  "0",
  ".5%",
  "5.%",
  "+5%",
  "-1%",
  "01%",
  "1e2%",
  "1,000%",
  " 5%",
  "5% ",
  "0.0000000000%",
  "101%",
  "100.000000001%",
] as const;

export const ROUNDING_POLICY_CONTEXT = {
  currency: "USD",
  currency_policy_version: "usd-v1",
  currency_exponent: 2,
  rounding_policy_version: "half-away-from-zero-v1",
} as const;

export const ROUNDING_GOLDEN_CASES = [
  { numerator: "1", denominator: "2", expected_minor: "1" },
  { numerator: "-1", denominator: "2", expected_minor: "-1" },
  { numerator: "1", denominator: "3", expected_minor: "0" },
  { numerator: "-1", denominator: "3", expected_minor: "0" },
  { numerator: "2", denominator: "3", expected_minor: "1" },
  { numerator: "-2", denominator: "3", expected_minor: "-1" },
  { numerator: "6", denominator: "3", expected_minor: "2" },
  { numerator: "-6", denominator: "3", expected_minor: "-2" },
  { numerator: "0", denominator: "7", expected_minor: "0" },
  { numerator: "-0", denominator: "7", expected_minor: "0" },
  { numerator: "710000", denominator: "800", expected_minor: "888" },
  {
    numerator: POSTGRES_BIGINT_MAX_TEXT,
    denominator: "1",
    expected_minor: POSTGRES_BIGINT_MAX_TEXT,
  },
  {
    numerator: POSTGRES_BIGINT_MIN_TEXT,
    denominator: "1",
    expected_minor: POSTGRES_BIGINT_MIN_TEXT,
  },
] as const;
