import { describe, it, expect } from "vitest";
import { getDateRangeFilter } from "./AttributionDashboard";

describe("getDateRangeFilter", () => {
  it("returns undefined for 'all'", () => {
    expect(getDateRangeFilter("all")).toBeUndefined();
  });

  it("returns an ISO string for '7'", () => {
    const result = getDateRangeFilter("7");
    expect(result).toBeTruthy();
    expect(new Date(result!).toISOString()).toBe(result);
  });

  it("returns an ISO string for '30'", () => {
    const result = getDateRangeFilter("30");
    expect(result).toBeTruthy();
    expect(new Date(result!).toISOString()).toBe(result);
  });

  it("returns an ISO string for '90'", () => {
    const result = getDateRangeFilter("90");
    expect(result).toBeTruthy();
    expect(new Date(result!).toISOString()).toBe(result);
  });

  it("'7' returns a date ~7 days ago", () => {
    const result = getDateRangeFilter("7")!;
    const diff =
      (Date.now() - new Date(result).getTime()) / (1000 * 60 * 60 * 24);
    expect(diff).toBeCloseTo(7, 0);
  });

  it("'30' returns a date ~30 days ago", () => {
    const result = getDateRangeFilter("30")!;
    const diff =
      (Date.now() - new Date(result).getTime()) / (1000 * 60 * 60 * 24);
    expect(diff).toBeCloseTo(30, 0);
  });
});
