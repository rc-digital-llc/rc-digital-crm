import { describe, expect, it } from "vitest";
import {
  classifyChannel,
  normalizeLead,
  POWERS_ACCOUNT_KEY,
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
    referrer: "",
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    utm_term: "",
    utm_content: "",
    gclid: "",
    fbclid: "",
  };
}
describe("Powers lead intake contract", () => {
  it("normalizes without accepting browser billing or tenant authority", () => {
    const result = normalizeLead({
      ...baseLead(),
      commissionable: true,
      account_key: "other-client",
    });
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") return;
    expect(result.lead.email).toBe("jane@example.com");
    expect(result.lead.firstName).toBe("Jane");
    expect(result.lead.lastName).toBe("Homeowner");
    expect("commissionable" in result.lead).toBe(false);
    expect("accountKey" in result.lead).toBe(false);
    expect(POWERS_ACCOUNT_KEY).toBe("powers-gc");
  });

  it("treats the honeypot as spam and requires a stable contactable intake", () => {
    expect(normalizeLead({ ...baseLead(), website: "spam.example" }).kind).toBe(
      "spam",
    );
    expect(normalizeLead({ ...baseLead(), intake_id: "short" }).kind).toBe(
      "invalid",
    );
    expect(normalizeLead({ ...baseLead(), phone: "", email: "" }).kind).toBe(
      "invalid",
    );
  });

  it("classifies direct and paid search conservatively", () => {
    const direct = normalizeLead(baseLead());
    expect(direct.kind).toBe("valid");
    if (direct.kind === "valid")
      expect(classifyChannel(direct.lead)).toBe("direct");
    const paid = normalizeLead({ ...baseLead(), gclid: "test-click" });
    expect(paid.kind).toBe("valid");
    if (paid.kind === "valid")
      expect(classifyChannel(paid.lead)).toBe("paid_search");
  });
  it("classifies organic and referral traffic conservatively", () => {
    const organic = normalizeLead({
      ...baseLead(),
      referrer: "https://www.google.com/search?q=fence",
    });
    expect(organic.kind).toBe("valid");
    if (organic.kind === "valid")
      expect(classifyChannel(organic.lead)).toBe("organic_search");
    const referral = normalizeLead({
      ...baseLead(),
      referrer: "https://example-neighbor.com/recommendations",
    });
    expect(referral.kind).toBe("valid");
    if (referral.kind === "valid")
      expect(classifyChannel(referral.lead)).toBe("referral");
  });
});
