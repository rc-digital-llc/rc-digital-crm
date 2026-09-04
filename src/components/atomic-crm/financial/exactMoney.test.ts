import { describe, expect, it } from "vitest";
import {
  FinancialContractError,
  USD_HALF_AWAY_ROUNDING_POLICY,
  areRatesFinanciallyEqual,
  areRatiosEqual,
  formatUsdMoney,
  multiplyUsdMoneyByExactRatio,
  parseCanonicalIntegerText,
  parseExactRatio,
  parseOrdinaryPercentage,
  parseOrdinaryPercentageRate,
  parseUsdMoney,
  roundExactRatioToUsdMoney,
} from "./exactMoney";
import {
  INTEGER_LENGTH_BOUNDARIES,
  MONEY_WIRE_FIXTURES,
  ORDINARY_PERCENTAGE_FIXTURES,
  PERCENTAGE_LENGTH_BOUNDARIES,
  POSTGRES_BIGINT_TEXT,
  SIGNED_ROUNDING_FIXTURES,
  UNSAFE_JSON_INTEGER_COLLISION,
  USD_HALF_AWAY_ROUNDING,
} from "./exactFinancialFixtures";

function expectFinancialCode(
  action: () => unknown,
  code:
    | "FINANCIAL_INPUT_TOO_LONG"
    | "FINANCIAL_DIVISION_BY_ZERO"
    | "FINANCIAL_INVALID_INTEGER"
    | "FINANCIAL_INVALID_MONEY"
    | "FINANCIAL_OVERFLOW"
    | "FINANCIAL_POLICY_MISMATCH"
    | "FINANCIAL_RATE_OUT_OF_BOUNDS"
    | "FINANCIAL_INVALID_RATE"
    | "FINANCIAL_UNSUPPORTED_CURRENCY",
): void {
  try {
    action();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(FinancialContractError);
    expect(error).toMatchObject({ code, message: code });
  }
}

describe("exact money wire contract", () => {
  it("accepts both signed bigint endpoints and returns immutable string-only objects", () => {
    for (const amountMinor of [
      POSTGRES_BIGINT_TEXT.min,
      POSTGRES_BIGINT_TEXT.max,
    ]) {
      const money = parseUsdMoney({
        amount_minor: amountMinor,
        currency: "USD",
      });

      expect(money).toEqual({ amount_minor: amountMinor, currency: "USD" });
      expect(Object.isFrozen(money)).toBe(true);
      expect(typeof money.amount_minor).toBe("string");
      expect(JSON.parse(JSON.stringify(money))).toEqual(money);
    }
  });

  it("canonicalizes redundant leading zeros and every signed zero", () => {
    expect(parseUsdMoney(MONEY_WIRE_FIXTURES[0])).toEqual({
      amount_minor: "0",
      currency: "USD",
    });
    expect(parseUsdMoney(MONEY_WIRE_FIXTURES[1])).toEqual({
      amount_minor: "0",
      currency: "USD",
    });
    expect(parseUsdMoney(MONEY_WIRE_FIXTURES[2])).toEqual({
      amount_minor: "10888",
      currency: "USD",
    });
    expect(
      parseCanonicalIntegerText(INTEGER_LENGTH_BOUNDARIES.sixtyFourByteZero),
    ).toBe("0");
  });

  it("rejects non-string JSON numbers, malformed money, and unsupported currency", () => {
    const malformed = [
      { amount_minor: 1, currency: "USD" },
      { amount_minor: " 1", currency: "USD" },
      { amount_minor: "+1", currency: "USD" },
      { amount_minor: "1.0", currency: "USD" },
      { amount_minor: "1e2", currency: "USD" },
      { amount_minor: "1,000", currency: "USD" },
      { amount_minor: "1", currency: "EUR" },
      { amount_minor: "1" },
      null,
    ];

    for (const value of malformed) {
      const code =
        typeof value === "object" && value !== null && "currency" in value
          ? value.currency === "EUR"
            ? "FINANCIAL_UNSUPPORTED_CURRENCY"
            : typeof value.amount_minor === "number"
              ? "FINANCIAL_INVALID_INTEGER"
              : "FINANCIAL_INVALID_INTEGER"
          : "FINANCIAL_INVALID_MONEY";
      expectFinancialCode(() => parseUsdMoney(value), code);
    }
  });

  it("checks input length before parsing and range without leaking submitted tokens", () => {
    expectFinancialCode(
      () =>
        parseCanonicalIntegerText(INTEGER_LENGTH_BOUNDARIES.sixtyFiveByteZero),
      "FINANCIAL_INPUT_TOO_LONG",
    );
    expectFinancialCode(
      () => parseCanonicalIntegerText(POSTGRES_BIGINT_TEXT.belowMin),
      "FINANCIAL_OVERFLOW",
    );
    expectFinancialCode(
      () => parseCanonicalIntegerText(POSTGRES_BIGINT_TEXT.aboveMax),
      "FINANCIAL_OVERFLOW",
    );

    try {
      parseCanonicalIntegerText("9".repeat(65));
    } catch (error) {
      expect(String(error)).not.toContain("999999");
    }
  });

  it("rejects unsafe JSON integer collisions before they become money authority", () => {
    const first = JSON.parse(UNSAFE_JSON_INTEGER_COLLISION.first) as unknown;
    const second = JSON.parse(UNSAFE_JSON_INTEGER_COLLISION.second) as unknown;
    expect(first).toBe(second);

    expectFinancialCode(
      () => parseUsdMoney({ amount_minor: first, currency: "USD" }),
      "FINANCIAL_INVALID_INTEGER",
    );
    expectFinancialCode(
      () => parseUsdMoney({ amount_minor: second, currency: "USD" }),
      "FINANCIAL_INVALID_INTEGER",
    );
  });
});

describe("named signed rounding", () => {
  it.each(SIGNED_ROUNDING_FIXTURES)(
    "rounds $numerator/$denominator to $expected with signed half-away-from-zero",
    ({ numerator, denominator, expected }) => {
      expect(
        roundExactRatioToUsdMoney({
          numerator,
          denominator,
          ...USD_HALF_AWAY_ROUNDING,
        }),
      ).toEqual({ amount_minor: expected, currency: "USD" });
    },
  );

  it("rounds a USD amount multiplied by an exact ratio once at the minor-unit boundary", () => {
    expect(
      multiplyUsdMoneyByExactRatio(
        { amount_minor: "10000", currency: "USD" },
        { numerator: "71", denominator: "800" },
        USD_HALF_AWAY_ROUNDING,
      ),
    ).toEqual({ amount_minor: "888", currency: "USD" });
  });

  it("handles the full signed persistence range without negating the minimum in-range", () => {
    expect(
      roundExactRatioToUsdMoney({
        numerator: POSTGRES_BIGINT_TEXT.min,
        denominator: "1",
        ...USD_HALF_AWAY_ROUNDING,
      }),
    ).toEqual({ amount_minor: POSTGRES_BIGINT_TEXT.min, currency: "USD" });
    expect(
      roundExactRatioToUsdMoney({
        numerator: POSTGRES_BIGINT_TEXT.max,
        denominator: "1",
        ...USD_HALF_AWAY_ROUNDING,
      }),
    ).toEqual({ amount_minor: POSTGRES_BIGINT_TEXT.max, currency: "USD" });
  });

  it("fails closed on policy, currency, exponent, division, and final overflow", () => {
    for (const override of [
      { rounding_policy_version: "ambient" },
      { currency_policy_version: "latest" },
      { currency_exponent: "3" },
    ]) {
      expectFinancialCode(
        () =>
          roundExactRatioToUsdMoney({
            numerator: "1",
            denominator: "2",
            ...USD_HALF_AWAY_ROUNDING,
            ...override,
          }),
        "FINANCIAL_POLICY_MISMATCH",
      );
    }
    expectFinancialCode(
      () =>
        roundExactRatioToUsdMoney({
          numerator: "1",
          denominator: "2",
          ...USD_HALF_AWAY_ROUNDING,
          currency: "EUR",
        }),
      "FINANCIAL_UNSUPPORTED_CURRENCY",
    );
    expectFinancialCode(
      () =>
        roundExactRatioToUsdMoney({
          numerator: "1",
          denominator: "0",
          ...USD_HALF_AWAY_ROUNDING,
        }),
      "FINANCIAL_DIVISION_BY_ZERO",
    );
    expectFinancialCode(
      () =>
        multiplyUsdMoneyByExactRatio(
          { amount_minor: POSTGRES_BIGINT_TEXT.max, currency: "USD" },
          { numerator: "2", denominator: "1" },
          USD_HALF_AWAY_ROUNDING,
        ),
      "FINANCIAL_OVERFLOW",
    );
  });

  it("uses deterministic bigint property loops for reduction, symmetry, equality, monotonicity, and wire stability", () => {
    let state = 0x5eedn;
    const next = (): bigint => {
      state = (state * 1103515245n + 12345n) % 2147483648n;
      return state;
    };

    for (let index = 0; index < 128; index += 1) {
      const numerator = (next() % 200001n) - 100000n;
      const denominator = (next() % 997n) + 1n;
      const ratio = parseExactRatio({
        numerator: numerator.toString(),
        denominator: denominator.toString(),
      });
      const sameRatio = parseExactRatio(JSON.parse(JSON.stringify(ratio)));
      const equivalent = parseExactRatio({
        numerator: (BigInt(ratio.numerator) * 7n).toString(),
        denominator: (BigInt(ratio.denominator) * 7n).toString(),
      });
      const positive = roundExactRatioToUsdMoney({
        numerator: numerator.toString(),
        denominator: denominator.toString(),
        ...USD_HALF_AWAY_ROUNDING,
      });
      const negative = roundExactRatioToUsdMoney({
        numerator: (-numerator).toString(),
        denominator: denominator.toString(),
        ...USD_HALF_AWAY_ROUNDING,
      });
      const nextValue = roundExactRatioToUsdMoney({
        numerator: (numerator + 1n).toString(),
        denominator: denominator.toString(),
        ...USD_HALF_AWAY_ROUNDING,
      });

      expect(sameRatio).toEqual(ratio);
      expect(areRatiosEqual(ratio, equivalent)).toBe(true);
      expect(BigInt(negative.amount_minor)).toBe(
        -BigInt(positive.amount_minor),
      );
      expect(BigInt(nextValue.amount_minor)).toBeGreaterThanOrEqual(
        BigInt(positive.amount_minor),
      );
      expect(parseUsdMoney(JSON.parse(JSON.stringify(positive)))).toEqual(
        positive,
      );
    }
  });

  it("keeps presentation formatting one-way and string based", () => {
    expect(formatUsdMoney({ amount_minor: "10888", currency: "USD" })).toBe(
      "$108.88",
    );
    expect(formatUsdMoney({ amount_minor: "-5", currency: "USD" })).toBe(
      "-$0.05",
    );
    expect(USD_HALF_AWAY_ROUNDING_POLICY).toEqual(USD_HALF_AWAY_ROUNDING);
  });
});

describe("ordinary percentage rate contract", () => {
  it.each(ORDINARY_PERCENTAGE_FIXTURES)(
    "reduces $submitted exactly to $numerator/$denominator",
    ({ submitted, numerator, denominator }) => {
      expect(parseOrdinaryPercentage(submitted)).toEqual({
        kind: "ordinary_percentage",
        numerator,
        denominator,
        submitted_percentage: submitted,
        rate_policy_version: "ordinary-percentage-v1",
      });
    },
  );

  it("treats equivalent reduced rates as equal without erasing display evidence", () => {
    const first = parseOrdinaryPercentage("12.5%");
    const second = parseOrdinaryPercentage("12.500%");

    expect(areRatesFinanciallyEqual(first, second)).toBe(true);
    expect(first.submitted_percentage).toBe("12.5%");
    expect(second.submitted_percentage).toBe("12.500%");
    expect(first).not.toEqual(second);
  });

  it("enforces the percentage grammar, precision, bounds, and pre-parse limit", () => {
    for (const submitted of [
      "00%",
      "+1%",
      "-1%",
      "1 %",
      " 1%",
      "1.0",
      "1e2%",
      "1,0%",
      "1.%",
      ".5%",
    ]) {
      expectFinancialCode(
        () => parseOrdinaryPercentage(submitted),
        "FINANCIAL_INVALID_RATE",
      );
    }

    expect(
      parseOrdinaryPercentage(PERCENTAGE_LENGTH_BOUNDARIES.fourteenByteMaximum),
    ).toEqual(expect.objectContaining({ numerator: "1", denominator: "1" }));
    expectFinancialCode(
      () =>
        parseOrdinaryPercentage(PERCENTAGE_LENGTH_BOUNDARIES.fifteenByteValue),
      "FINANCIAL_INPUT_TOO_LONG",
    );
    expectFinancialCode(
      () => parseOrdinaryPercentage("100.000000001%"),
      "FINANCIAL_RATE_OUT_OF_BOUNDS",
    );
  });

  it("validates canonical rate wire objects and proves bigint never leaks into JSON", () => {
    const original = parseOrdinaryPercentage("8.875%");
    const roundTrip = parseOrdinaryPercentageRate(
      JSON.parse(JSON.stringify(original)),
    );

    expect(roundTrip).toEqual(original);
    expect(JSON.stringify(roundTrip)).toBe(
      '{"kind":"ordinary_percentage","numerator":"71","denominator":"800","submitted_percentage":"8.875%","rate_policy_version":"ordinary-percentage-v1"}',
    );
    expect(
      Object.values(roundTrip).some((value) => typeof value === "bigint"),
    ).toBe(false);
  });

  it("rejects tampered, numeric, or policy-mismatched rate wire objects", () => {
    for (const value of [
      { ...parseOrdinaryPercentage("12.5%"), numerator: 1 },
      { ...parseOrdinaryPercentage("12.5%"), numerator: "2" },
      { ...parseOrdinaryPercentage("12.5%"), denominator: "0" },
      { ...parseOrdinaryPercentage("12.5%"), kind: "discount" },
      { ...parseOrdinaryPercentage("12.5%"), rate_policy_version: "latest" },
    ]) {
      expectFinancialCode(
        () => parseOrdinaryPercentageRate(value),
        "FINANCIAL_INVALID_RATE",
      );
    }
  });
});
