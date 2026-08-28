import { describe, it, expect } from "vitest";
import { activityScoreDefaults } from "./leadStatuses";

describe("Lead Scoring — activityScoreDefaults", () => {
  it("form_submit scores +5", () => {
    expect(activityScoreDefaults.form_submit).toBe(5);
  });

  it("email_click scores +3", () => {
    expect(activityScoreDefaults.email_click).toBe(3);
  });

  it("email_open scores +2", () => {
    expect(activityScoreDefaults.email_open).toBe(2);
  });

  it("page_view scores +1", () => {
    expect(activityScoreDefaults.page_view).toBe(1);
  });

  it("meeting scores +10", () => {
    expect(activityScoreDefaults.meeting).toBe(10);
  });

  it("call scores +8", () => {
    expect(activityScoreDefaults.call).toBe(8);
  });

  it("note scores 0 (neutral)", () => {
    expect(activityScoreDefaults.note).toBe(0);
  });

  it("recalculates correctly after multiple activities", () => {
    const activities = ["form_submit", "email_click", "page_view", "meeting"];
    const totalScore = activities.reduce(
      (sum, type) => sum + (activityScoreDefaults[type] ?? 0),
      0,
    );
    // 5 + 3 + 1 + 10 = 19
    expect(totalScore).toBe(19);
  });

  it("handles unknown activity types as 0", () => {
    expect(activityScoreDefaults["unsubscribe"] ?? 0).toBe(0);
    expect(activityScoreDefaults["bounce"] ?? 0).toBe(0);
  });
});
