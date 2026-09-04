export const POSTGRES_BIGINT_TEXT = Object.freeze({
  min: "-9223372036854775808",
  max: "9223372036854775807",
  belowMin: "-9223372036854775809",
  aboveMax: "9223372036854775808",
});

export const INTEGER_LENGTH_BOUNDARIES = Object.freeze({
  sixtyFourByteZero: "0".repeat(64),
  sixtyFiveByteZero: "0".repeat(65),
});

export const PERCENTAGE_LENGTH_BOUNDARIES = Object.freeze({
  fourteenByteMaximum: "100.000000000%",
  fifteenByteValue: "100.0000000000%",
});

export const MONEY_WIRE_FIXTURES = Object.freeze([
  Object.freeze({ amount_minor: "0", currency: "USD" as const }),
  Object.freeze({ amount_minor: "-0", currency: "USD" as const }),
  Object.freeze({ amount_minor: "00010888", currency: "USD" as const }),
  Object.freeze({
    amount_minor: POSTGRES_BIGINT_TEXT.min,
    currency: "USD" as const,
  }),
  Object.freeze({
    amount_minor: POSTGRES_BIGINT_TEXT.max,
    currency: "USD" as const,
  }),
]);

export const ORDINARY_PERCENTAGE_FIXTURES = Object.freeze([
  Object.freeze({ submitted: "0%", numerator: "0", denominator: "1" }),
  Object.freeze({ submitted: "100%", numerator: "1", denominator: "1" }),
  Object.freeze({ submitted: "12.5%", numerator: "1", denominator: "8" }),
  Object.freeze({ submitted: "12.500%", numerator: "1", denominator: "8" }),
  Object.freeze({ submitted: "8.875%", numerator: "71", denominator: "800" }),
]);

export const UNSAFE_JSON_INTEGER_COLLISION = Object.freeze({
  first: "9223372036854775807",
  second: "9223372036854775808",
});

export const USD_HALF_AWAY_ROUNDING = Object.freeze({
  currency: "USD" as const,
  currency_exponent: "2" as const,
  currency_policy_version: "usd-v1" as const,
  rounding_policy_version: "half-away-from-zero-v1" as const,
});

export const SIGNED_ROUNDING_FIXTURES = Object.freeze([
  Object.freeze({ numerator: "1", denominator: "2", expected: "1" }),
  Object.freeze({ numerator: "-1", denominator: "2", expected: "-1" }),
  Object.freeze({ numerator: "1", denominator: "3", expected: "0" }),
  Object.freeze({ numerator: "-1", denominator: "3", expected: "0" }),
  Object.freeze({ numerator: "2", denominator: "3", expected: "1" }),
  Object.freeze({ numerator: "-2", denominator: "3", expected: "-1" }),
  Object.freeze({ numerator: "6", denominator: "3", expected: "2" }),
  Object.freeze({ numerator: "0", denominator: "9", expected: "0" }),
  Object.freeze({ numerator: "710000", denominator: "800", expected: "888" }),
]);
