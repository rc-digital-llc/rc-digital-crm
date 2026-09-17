import { describe, expect, it } from "vitest";
import {
  normalizeLead,
  POWERS_ACCOUNT_KEY,
  toRpcPayload,
} from "../supabase/functions/powers-lead-ingest/contract.ts";

function baseLead() {
  return {
    intake_id: "intake_1234567890abcdef",
    name: "Jane Homeowner",
    phone: "253-555-0100",
    email: "Jane@Example.com",
    service: "Wood Fencing",
    project_city: "Lake Tapps, WA",
    dimensions: "180 linear feet",
    project_type: "Replacement",
    timing: "30-60 days",
    message: "Back fence replacement",
    landing_path: "/services/wood-fencing",
    referrer: "https://www.google.com/search?q=fence",
    utm_source: "google",
    utm_medium: "organic",
    utm_campaign: "spring",
    utm_term: "fence",
    utm_content: "cta-a",
    gclid: "browser-click-id",
    fbclid: "",
  };
}

describe("Powers lead intake contract", () => {
  it("ignores browser billing and tenant authority", () => {
    const result = normalizeLead({ ...baseLead(), commissionable: true, account_key: "other-client" });
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") return;
    expect(result.lead.email).toBe("jane@example.com");
    expect("commissionable" in result.lead).toBe(false);
    expect("accountKey" in result.lead).toBe(false);
    expect(POWERS_ACCOUNT_KEY).toBe("powers-gc");
  });

  it("keeps browser attribution unverified and non-authoritative", () => {
    const result = normalizeLead(baseLead());
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") return;
    const payload = toRpcPayload(result.lead);
    expect(payload.browser_attribution.verification_status).toBe("unverified_browser");
    expect(payload.browser_attribution.gclid).toBe("browser-click-id");
    expect("channel" in payload).toBe(false);
    expect("commissionable" in payload).toBe(false);
  });

  it("treats the honeypot as spam", () => {
    expect(normalizeLead({ ...baseLead(), website: "spam.example" }).kind).toBe("spam");
  });

  it("requires a stable contactable intake", () => {
    expect(normalizeLead({ ...baseLead(), intake_id: "short" }).kind).toBe("invalid");
    expect(normalizeLead({ ...baseLead(), phone: "", email: "" }).kind).toBe("invalid");
  });
});
