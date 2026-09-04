import { describe, expect, it } from "vitest";

import {
  FIFTEEN_BYTE_PERCENTAGE_TEXT,
  FOURTEEN_BYTE_PERCENTAGE_TEXT,
  MALFORMED_INTEGER_TEXTS,
  MALFORMED_PERCENTAGE_TEXTS,
  MONEY_CANONICAL_CASES,
  POSTGRES_BIGINT_MAX_TEXT,
  POSTGRES_BIGINT_MIN_TEXT,
  RATE_GOLDEN_CASES,
  ROUNDING_GOLDEN_CASES,
  ROUNDING_POLICY_CONTEXT,
  SIXTY_FIVE_BYTE_INTEGER_TEXT,
  SIXTY_FOUR_BYTE_INTEGER_TEXT,
} from "./exactFinancialFixtures";
import {
  FinancialContractError,
  ORDINARY_PERCENTAGE_RATE_POLICY_VERSION,
  POSTGRES_BIGINT_MAX,
  POSTGRES_BIGINT_MIN,
  USD_CURRENCY,
  formatUsdMoney,
  exactRatiosAreEqual,
  parseCanonicalIntegerText,
  parseOrdinaryPercentageRate,
  parseOrdinaryPercentageRateWire,
  parseUsdMoney,
  reduceExactRatio,
  roundExactRatioToUsdMoney,
  ratesAreFinanciallyEqual,
  toOrdinaryPercentageRateWire,
  toExactRatioWire,
  toUsdMoneyWire,
  type FinancialErrorCode,
} from "./exactMoney";

const expectFinancialError = (
  operation: () => unknown,
  code: FinancialErrorCode,
  forbiddenText?: string,
) => {
  let thrown: unknown;

  try {
    operation();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(FinancialContractError);
  expect((thrown as FinancialContractError).code).toBe(code);
  if (forbiddenText !== undefined) {
    expect((thrown as Error).message).not.toContain(forbiddenText);
  }
};

describe("exact money contract", () => {
  it("pins the signed PostgreSQL bigint money endpoints", () => {
    expect(POSTGRES_BIGINT_MIN.toString()).toBe(POSTGRES_BIGINT_MIN_TEXT);
    expect(POSTGRES_BIGINT_MAX.toString()).toBe(POSTGRES_BIGINT_MAX_TEXT);
  });

  it.each(MONEY_CANONICAL_CASES)(
    "canonicalizes money integer $submitted to $canonical",
    ({ submitted, canonical }) => {
      const money = parseUsdMoney({
        amount_minor: submitted,
        currency: USD_CURRENCY,
      });

      expect(money).toEqual({ amount_minor: canonical, currency: "USD" });
      expect(Object.isFrozen(money)).toBe(true);
    },
  );

  it("checks the 64-byte money limit before BigInt construction", () => {
    expect(SIXTY_FOUR_BYTE_INTEGER_TEXT).toHaveLength(64);
    expect(SIXTY_FIVE_BYTE_INTEGER_TEXT).toHaveLength(65);
    expect(parseCanonicalIntegerText(SIXTY_FOUR_BYTE_INTEGER_TEXT)).toBe("0");
    expectFinancialError(
      () => parseCanonicalIntegerText(SIXTY_FIVE_BYTE_INTEGER_TEXT),
      "FINANCIAL_INPUT_TOO_LONG",
      SIXTY_FIVE_BYTE_INTEGER_TEXT,
    );
  });

  it.each(MALFORMED_INTEGER_TEXTS)(
    "rejects malformed money integer text without normalization: %s",
    (amount_minor) => {
      expectFinancialError(
        () => parseUsdMoney({ amount_minor, currency: "USD" }),
        "FINANCIAL_INVALID_INTEGER",
        amount_minor || undefined,
      );
    },
  );

  it("rejects money JSON numbers, ambiguous objects, and unsupported currency", () => {
    const unsafeNumericJson = JSON.parse(
      '{"amount_minor":9007199254740993,"currency":"USD"}',
    ) as unknown;

    expectFinancialError(
      () => parseUsdMoney(unsafeNumericJson),
      "FINANCIAL_INVALID_MONEY",
    );
    expectFinancialError(
      () => parseUsdMoney({ amount_minor: "1" }),
      "FINANCIAL_INVALID_MONEY",
    );
    expectFinancialError(
      () =>
        parseUsdMoney({
          amount_minor: "1",
          currency: "USD",
          formatted: "$0.01",
        }),
      "FINANCIAL_INVALID_MONEY",
    );
    expectFinancialError(
      () => parseUsdMoney({ amount_minor: "1", currency: "EUR" }),
      "FINANCIAL_UNSUPPORTED_CURRENCY",
    );
  });

  it("rejects money values outside the persisted signed bigint range", () => {
    expectFinancialError(
      () =>
        parseUsdMoney({
          amount_minor: "9223372036854775808",
          currency: "USD",
        }),
      "FINANCIAL_OVERFLOW",
    );
    expectFinancialError(
      () =>
        parseUsdMoney({
          amount_minor: "-9223372036854775809",
          currency: "USD",
        }),
      "FINANCIAL_OVERFLOW",
    );
  });

  it("round-trips money wire JSON without unsafe-number collisions", () => {
    const submitted = {
      amount_minor: "9007199254740993",
      currency: "USD",
    } as const;
    const money = parseUsdMoney(submitted);
    const wire = toUsdMoneyWire(money);
    const json = JSON.stringify(wire);

    expect(JSON.parse(json)).toEqual(submitted);
    expect(json).toBe('{"amount_minor":"9007199254740993","currency":"USD"}');
    expect(
      Object.values(wire).every((value) => typeof value === "string"),
    ).toBe(true);
  });

  it("formats validated USD money one way without making display text authoritative", () => {
    expect(
      formatUsdMoney(parseUsdMoney({ amount_minor: "10888", currency: "USD" })),
    ).toBe("$108.88");
    expect(
      formatUsdMoney(parseUsdMoney({ amount_minor: "-5", currency: "USD" })),
    ).toBe("-$0.05");
  });
});

describe("exact ordinary percentage rate contract", () => {
  it.each(RATE_GOLDEN_CASES)(
    "reduces rate $submitted to $numerator/$denominator",
    ({ submitted, numerator, denominator }) => {
      const rate = parseOrdinaryPercentageRate(submitted);

      expect(rate).toEqual({
        kind: "ordinary_percentage",
        numerator,
        denominator,
        submitted_percentage: submitted,
        rate_policy_version: ORDINARY_PERCENTAGE_RATE_POLICY_VERSION,
      });
      expect(Object.isFrozen(rate)).toBe(true);
    },
  );

  it("checks the 14-byte rate limit before grammar or ratio construction", () => {
    expect(FOURTEEN_BYTE_PERCENTAGE_TEXT).toHaveLength(14);
    expect(FIFTEEN_BYTE_PERCENTAGE_TEXT).toHaveLength(15);
    expect(
      parseOrdinaryPercentageRate(FOURTEEN_BYTE_PERCENTAGE_TEXT).numerator,
    ).toBe("1");
    expectFinancialError(
      () => parseOrdinaryPercentageRate(FIFTEEN_BYTE_PERCENTAGE_TEXT),
      "FINANCIAL_INPUT_TOO_LONG",
      FIFTEEN_BYTE_PERCENTAGE_TEXT,
    );
  });

  it.each(MALFORMED_PERCENTAGE_TEXTS)(
    "rejects malformed or out-of-bounds rate text: %s",
    (submitted) => {
      const expectedCode =
        submitted === "101%" || submitted === "100.000000001%"
          ? "FINANCIAL_RATE_OUT_OF_BOUNDS"
          : "FINANCIAL_INVALID_PERCENTAGE";
      expectFinancialError(
        () => parseOrdinaryPercentageRate(submitted),
        expectedCode,
        submitted || undefined,
      );
    },
  );

  it("rejects rate JSON numbers and unverified canonical components", () => {
    const valid = parseOrdinaryPercentageRate("12.500%");
    const wire = toOrdinaryPercentageRateWire(valid);

    expectFinancialError(
      () => parseOrdinaryPercentageRate(12.5),
      "FINANCIAL_INVALID_PERCENTAGE",
    );
    expectFinancialError(
      () => parseOrdinaryPercentageRateWire({ ...wire, numerator: 1 }),
      "FINANCIAL_INVALID_RATE_WIRE",
    );
    expectFinancialError(
      () => parseOrdinaryPercentageRateWire({ ...wire, numerator: "2" }),
      "FINANCIAL_INVALID_RATE_WIRE",
    );
    expectFinancialError(
      () =>
        parseOrdinaryPercentageRateWire({
          ...wire,
          rate_policy_version: "ordinary-percentage-v2",
        }),
      "FINANCIAL_POLICY_MISMATCH",
    );
  });

  it("treats equivalent rates as equal while preserving submitted evidence", () => {
    const concise = parseOrdinaryPercentageRate("12.5%");
    const displayPreserving = parseOrdinaryPercentageRate("12.500%");

    expect(ratesAreFinanciallyEqual(concise, displayPreserving)).toBe(true);
    expect(concise.submitted_percentage).toBe("12.5%");
    expect(displayPreserving.submitted_percentage).toBe("12.500%");
  });

  it("round-trips the exact rate wire using string-only components", () => {
    const rate = parseOrdinaryPercentageRate("8.875%");
    const wire = toOrdinaryPercentageRateWire(rate);
    const json = JSON.stringify(wire);
    const reparsed = parseOrdinaryPercentageRateWire(JSON.parse(json));

    expect(reparsed).toEqual(rate);
    expect(wire).toEqual({
      kind: "ordinary_percentage",
      numerator: "71",
      denominator: "800",
      submitted_percentage: "8.875%",
      rate_policy_version: "ordinary-percentage-v1",
    });
    expect(
      Object.values(wire).every((value) => typeof value === "string"),
    ).toBe(true);
    expect(json).not.toMatch(/71n|800n/);
  });
});

describe("exact signed rounding contract", () => {
  const round = (numerator: string, denominator: string) =>
    roundExactRatioToUsdMoney({
      numerator,
      denominator,
      ...ROUNDING_POLICY_CONTEXT,
    });

  it.each(ROUNDING_GOLDEN_CASES)(
    "applies named rounding to $numerator/$denominator as $expected_minor",
    ({ numerator, denominator, expected_minor }) => {
      expect(round(numerator, denominator)).toEqual({
        amount_minor: expected_minor,
        currency: "USD",
      });
    },
  );

  it("rounds the exact 8.875 percent tax intermediate only at the USD minor-unit boundary", () => {
    expect(round("710000", "800")).toEqual({
      amount_minor: "888",
      currency: "USD",
    });
  });

  it("fails rounding closed on policy, currency, and exponent mismatch", () => {
    expectFinancialError(
      () =>
        roundExactRatioToUsdMoney({
          numerator: "1",
          denominator: "2",
          ...ROUNDING_POLICY_CONTEXT,
          rounding_policy_version: "half-to-even-v1",
        }),
      "FINANCIAL_POLICY_MISMATCH",
    );
    expectFinancialError(
      () =>
        roundExactRatioToUsdMoney({
          numerator: "1",
          denominator: "2",
          ...ROUNDING_POLICY_CONTEXT,
          currency_policy_version: "usd-v2",
        }),
      "FINANCIAL_POLICY_MISMATCH",
    );
    expectFinancialError(
      () =>
        roundExactRatioToUsdMoney({
          numerator: "1",
          denominator: "2",
          ...ROUNDING_POLICY_CONTEXT,
          currency_exponent: 3,
        }),
      "FINANCIAL_POLICY_MISMATCH",
    );
    expectFinancialError(
      () =>
        roundExactRatioToUsdMoney({
          numerator: "1",
          denominator: "2",
          ...ROUNDING_POLICY_CONTEXT,
          currency: "EUR",
        }),
      "FINANCIAL_UNSUPPORTED_CURRENCY",
    );
  });

  it("rejects invalid rounding ratios and zero denominator without coercion", () => {
    expectFinancialError(() => round("1", "0"), "FINANCIAL_ZERO_DENOMINATOR");
    expectFinancialError(() => round("1", "-2"), "FINANCIAL_INVALID_RATIO");
    expectFinancialError(
      () =>
        roundExactRatioToUsdMoney({
          numerator: 1,
          denominator: "2",
          ...ROUNDING_POLICY_CONTEXT,
        }),
      "FINANCIAL_INVALID_RATIO",
    );
  });

  it("rejects final rounding results outside the persisted signed bigint range", () => {
    expectFinancialError(
      () => round("18446744073709551615", "2"),
      "FINANCIAL_OVERFLOW",
    );
    expectFinancialError(
      () => round("-18446744073709551617", "2"),
      "FINANCIAL_OVERFLOW",
    );
  });

  it("proves deterministic rounding reduction, sign, equality, monotonicity, and JSON properties", () => {
    let seed = 0x5eed_0301n;
    const next = () => {
      seed = (seed * 1_103_515_245n + 12_345n) % 2_147_483_648n;
      return seed;
    };

    for (let index = 0; index < 128; index += 1) {
      const numerator = (next() % 2_000_001n) - 1_000_000n;
      const denominator = (next() % 997n) + 1n;
      const multiplier = (next() % 31n) + 1n;
      const ratio = reduceExactRatio({
        numerator: numerator.toString(),
        denominator: denominator.toString(),
      });
      const equivalent = reduceExactRatio({
        numerator: (numerator * multiplier).toString(),
        denominator: (denominator * multiplier).toString(),
      });
      const reparsed = reduceExactRatio(
        JSON.parse(JSON.stringify(toExactRatioWire(ratio))),
      );
      const positiveResult = round(
        (numerator < 0n ? -numerator : numerator).toString(),
        denominator.toString(),
      );
      const negativeResult = round(
        (numerator < 0n ? numerator : -numerator).toString(),
        denominator.toString(),
      );
      const lower = round(numerator.toString(), denominator.toString());
      const upper = round((numerator + 1n).toString(), denominator.toString());

      expect(exactRatiosAreEqual(ratio, equivalent)).toBe(true);
      expect(reparsed).toEqual(ratio);
      expect(reduceExactRatio(toExactRatioWire(reparsed))).toEqual(ratio);
      expect(BigInt(negativeResult.amount_minor)).toBe(
        -BigInt(positiveResult.amount_minor),
      );
      expect(BigInt(lower.amount_minor)).toBeLessThanOrEqual(
        BigInt(upper.amount_minor),
      );
    }
  });
});
