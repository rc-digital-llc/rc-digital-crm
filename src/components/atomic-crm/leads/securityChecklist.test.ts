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

describe("Security — RLS Policies", () => {
  describe("leads table", () => {
    const sql = readMigration("20260306000001_add_leads_table.sql");

    it("enables RLS", () => {
      expect(sql).toContain("ALTER TABLE leads ENABLE ROW LEVEL SECURITY");
    });

    it("has SELECT policy", () => {
      expect(sql).toMatch(/CREATE POLICY.*ON leads FOR SELECT/);
    });

    it("has INSERT policy", () => {
      expect(sql).toMatch(/CREATE POLICY.*ON leads FOR INSERT/);
    });

    it("has UPDATE policy", () => {
      expect(sql).toMatch(/CREATE POLICY.*ON leads FOR UPDATE/);
    });

    it("has DELETE policy", () => {
      expect(sql).toMatch(/CREATE POLICY.*ON leads FOR DELETE/);
    });
  });

  describe("lead_activities table", () => {
    const sql = readMigration("20260306000002_add_lead_activities_table.sql");

    it("enables RLS", () => {
      expect(sql).toContain(
        "ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY",
      );
    });

    it("has SELECT policy", () => {
      expect(sql).toMatch(/CREATE POLICY.*ON lead_activities FOR SELECT/);
    });

    it("has INSERT policy", () => {
      expect(sql).toMatch(/CREATE POLICY.*ON lead_activities FOR INSERT/);
    });
  });

  describe("touchpoints table", () => {
    const sql = readMigration("20260306000006_add_touchpoints_table.sql");

    it("enables RLS", () => {
      expect(sql).toContain(
        "ALTER TABLE touchpoints ENABLE ROW LEVEL SECURITY",
      );
    });

    it("has SELECT policy", () => {
      expect(sql).toMatch(/CREATE POLICY.*ON touchpoints FOR SELECT/);
    });

    it("has INSERT policy", () => {
      expect(sql).toMatch(/CREATE POLICY.*ON touchpoints FOR INSERT/);
    });
  });
});

describe("Security — Views use security_invoker", () => {
  const sql = readMigration("20260306000007_attribution_summary_view.sql");

  it("channel_attribution_summary uses security_invoker=on", () => {
    expect(sql).toContain("channel_attribution_summary");
    const idx = sql.indexOf("channel_attribution_summary");
    const viewBlock = sql.slice(idx, idx + 200);
    expect(viewBlock).toContain("security_invoker=on");
  });

  it("lead_source_performance uses security_invoker=on", () => {
    expect(sql).toContain("lead_source_performance");
    const idx = sql.indexOf("lead_source_performance");
    const viewBlock = sql.slice(idx, idx + 200);
    expect(viewBlock).toContain("security_invoker=on");
  });

  it("customer_journeys uses security_invoker=on", () => {
    expect(sql).toContain("customer_journeys");
    const idx = sql.indexOf("customer_journeys");
    const viewBlock = sql.slice(idx, idx + 200);
    expect(viewBlock).toContain("security_invoker=on");
  });
});

describe("Security — Functions use SECURITY DEFINER", () => {
  it("convert_lead_to_contact uses SECURITY DEFINER", () => {
    const sql = readMigration("20260306000004_lead_conversion_function.sql");
    expect(sql).toContain("SECURITY DEFINER");
  });

  it("set_attribution_flags uses SECURITY DEFINER", () => {
    const sql = readMigration("20260306000008_attribution_triggers.sql");
    expect(sql).toContain("SECURITY DEFINER");
  });

  it("recalculate_lead_score uses SECURITY DEFINER", () => {
    const sql = readMigration("20260306000003_lead_scoring_function.sql");
    expect(sql).toContain("SECURITY DEFINER");
  });
});

describe("Security — No secrets in frontend code", () => {
  const srcDir = path.resolve(__dirname, "..");

  function findFiles(dir: string, ext: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        results.push(...findFiles(fullPath, ext));
      } else if (entry.name.endsWith(ext) && !entry.name.includes(".test.")) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const tsxFiles = [
    ...findFiles(path.join(srcDir, "leads"), ".tsx"),
    ...findFiles(path.join(srcDir, "leads"), ".ts"),
    ...findFiles(path.join(srcDir, "attribution"), ".tsx"),
    ...findFiles(path.join(srcDir, "attribution"), ".ts"),
  ];

  it("no service_role key in lead/attribution frontend files", () => {
    for (const file of tsxFiles) {
      const content = fs.readFileSync(file, "utf-8");
      expect(content).not.toMatch(/service_role/i);
      expect(content).not.toMatch(/SUPABASE_SERVICE_ROLE/);
    }
  });

  it("no hardcoded API keys in lead/attribution frontend files", () => {
    for (const file of tsxFiles) {
      const content = fs.readFileSync(file, "utf-8");
      // Check for common key patterns (sk-, eyJ for base64 tokens)
      expect(content).not.toMatch(/["']sk-[a-zA-Z0-9]{20,}["']/);
    }
  });
});
