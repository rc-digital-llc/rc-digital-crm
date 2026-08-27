import { describe, it, expect } from "vitest";
import { leadStatuses, leadStatusColorMap, leadSources } from "./leadStatuses";

describe("Lead Status Validation", () => {
  const statusValues = leadStatuses.map((s) => s.value);

  it("includes all expected statuses in order", () => {
    expect(statusValues).toEqual([
      "new",
      "contacted",
      "qualifying",
      "qualified",
      "unqualified",
      "converted",
      "lost",
    ]);
  });

  it("valid forward transition: new -> contacted -> qualifying -> qualified -> converted", () => {
    const forwardPath = [
      "new",
      "contacted",
      "qualifying",
      "qualified",
      "converted",
    ];
    for (const status of forwardPath) {
      expect(statusValues).toContain(status);
    }
  });

  it("all statuses have color mappings", () => {
    for (const status of statusValues) {
      expect(leadStatusColorMap[status]).toBeDefined();
      expect(leadStatusColorMap[status].bg).toBeTruthy();
      expect(leadStatusColorMap[status].text).toBeTruthy();
    }
  });

  it("converted status exists and has unique color", () => {
    expect(leadStatusColorMap.converted.text).toBe("#00BCD4");
  });

  it("lost status has red-toned color", () => {
    expect(leadStatusColorMap.lost.text).toBe("#e94560");
  });
});

describe("Lead Sources", () => {
  it("has at least 5 source options", () => {
    expect(leadSources.length).toBeGreaterThanOrEqual(5);
  });

  it("each source has value and label", () => {
    for (const source of leadSources) {
      expect(source.value).toBeTruthy();
      expect(source.label).toBeTruthy();
    }
  });

  it("includes common sources", () => {
    const values = leadSources.map((s) => s.value);
    expect(values).toContain("manual");
    expect(values).toContain("website_form");
    expect(values).toContain("referral");
  });
});
