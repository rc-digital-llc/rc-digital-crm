import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Read migration files for SQL verification
const migrationsDir = path.resolve(
  __dirname,
  "../../../../supabase/migrations",
);

function readMigration(filename: string): string {
  return fs.readFileSync(path.join(migrationsDir, filename), "utf-8");
}

describe("Lead Conversion Function (SQL)", () => {
  const sql = readMigration("20260306000004_lead_conversion_function.sql");

  it("creates convert_lead_to_contact function", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION convert_lead_to_contact");
  });

  it("accepts p_lead_id parameter", () => {
    expect(sql).toContain("p_lead_id bigint");
  });

  it("accepts optional p_deal_name parameter", () => {
    expect(sql).toContain("p_deal_name text DEFAULT NULL");
  });

  it("accepts optional p_deal_amount parameter", () => {
    expect(sql).toContain("p_deal_amount bigint DEFAULT NULL");
  });

  it("raises exception for already-converted leads", () => {
    expect(sql).toContain("Lead already converted");
  });

  it("raises exception for leads not found", () => {
    expect(sql).toContain("Lead not found");
  });

  it("creates a contact from lead fields", () => {
    expect(sql).toContain("INSERT INTO contacts");
    expect(sql).toContain("v_lead.first_name");
    expect(sql).toContain("v_lead.last_name");
    expect(sql).toContain("v_lead.email");
  });

  it("finds or creates company from company_name", () => {
    expect(sql).toContain(
      "SELECT id INTO v_company_id FROM companies WHERE name = v_lead.company_name",
    );
    expect(sql).toContain("INSERT INTO companies (name");
  });

  it("optionally creates a deal when deal_name provided", () => {
    expect(sql).toContain("IF p_deal_name IS NOT NULL THEN");
    expect(sql).toContain("INSERT INTO deals");
    expect(sql).toContain("'opportunity'");
  });

  it("sets lead status to converted with timestamp", () => {
    expect(sql).toContain("status = 'converted'");
    expect(sql).toContain("converted_at = now()");
  });

  it("logs a conversion activity", () => {
    expect(sql).toContain("INSERT INTO lead_activities");
    expect(sql).toContain("Lead converted to contact");
  });

  it("uses SECURITY DEFINER", () => {
    expect(sql).toContain("SECURITY DEFINER");
  });
});
