import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const migrationsDir = path.resolve(
  __dirname,
  "../../../../supabase/migrations",
);

function readMigration(filename: string): string {
  return fs.readFileSync(path.join(migrationsDir, filename), "utf-8");
}

describe("Attribution Triggers (SQL)", () => {
  const sql = readMigration("20260306000008_attribution_triggers.sql");

  it("creates set_attribution_flags function", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION set_attribution_flags()");
  });

  it("sets is_first_touch when no existing touchpoints for lead", () => {
    expect(sql).toContain("NEW.is_first_touch = true");
  });

  it("updates previous last_touch to false for lead", () => {
    expect(sql).toContain("UPDATE touchpoints SET is_last_touch = false");
    expect(sql).toContain("WHERE lead_id = NEW.lead_id");
  });

  it("sets new touchpoint as last_touch for lead", () => {
    expect(sql).toContain("NEW.is_last_touch = true");
  });

  it("handles contact-level last_touch updates", () => {
    expect(sql).toContain("WHERE contact_id = NEW.contact_id");
  });

  it("creates a BEFORE INSERT trigger on touchpoints", () => {
    expect(sql).toContain("BEFORE INSERT ON touchpoints");
    expect(sql).toContain("EXECUTE FUNCTION set_attribution_flags()");
  });

  it("uses SECURITY DEFINER", () => {
    expect(sql).toContain("SECURITY DEFINER");
  });
});

describe("Attribution Summary Views (SQL)", () => {
  const sql = readMigration("20260306000007_attribution_summary_view.sql");

  it("creates channel_attribution_summary view", () => {
    expect(sql).toContain("CREATE OR REPLACE VIEW channel_attribution_summary");
  });

  it("channel_attribution_summary aggregates leads_generated", () => {
    expect(sql).toContain("COUNT(DISTINCT t.lead_id) as leads_generated");
  });

  it("channel_attribution_summary calculates first_touch_revenue", () => {
    expect(sql).toContain("first_touch_revenue");
  });

  it("channel_attribution_summary calculates last_touch_revenue", () => {
    expect(sql).toContain("last_touch_revenue");
  });

  it("creates lead_source_performance view", () => {
    expect(sql).toContain("CREATE OR REPLACE VIEW lead_source_performance");
  });

  it("lead_source_performance calculates conversion_rate", () => {
    expect(sql).toContain("conversion_rate");
  });

  it("creates customer_journeys view", () => {
    expect(sql).toContain("CREATE OR REPLACE VIEW customer_journeys");
  });

  it("customer_journeys includes days_in_funnel", () => {
    expect(sql).toContain("days_in_funnel");
  });
});
