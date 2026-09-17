import {
  normalizeLead,
  POWERS_ACCOUNT_KEY,
  toRpcPayload,
} from "./contract.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

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

Deno.test("normalizes without accepting browser billing or tenant authority", () => {
  const result = normalizeLead({
    ...baseLead(),
    commissionable: true,
    account_key: "other-client",
  });
  assert(result.kind === "valid", "expected a valid lead");
  assert(result.lead.email === "jane@example.com", "email must normalize");
  assert(result.lead.firstName === "Jane" && result.lead.lastName === "Homeowner", "name must split");
  assert(!("commissionable" in result.lead), "browser commissionability must be ignored");
  assert(!("accountKey" in result.lead), "browser account identity must be ignored");
  assert(POWERS_ACCOUNT_KEY === "powers-gc", "server account key changed");
});

Deno.test("browser attribution remains explicitly unverified evidence", () => {
  const result = normalizeLead(baseLead());
  assert(result.kind === "valid", "fixture must be valid");
  const payload = toRpcPayload(result.lead);
  assert(payload.browser_attribution.verification_status === "unverified_browser", "browser evidence must be labeled unverified");
  assert(payload.browser_attribution.gclid === "browser-click-id", "click evidence must be preserved");
  assert(!("channel" in payload), "browser data must not become an authoritative channel");
  assert(!("commissionable" in payload), "RPC payload must not carry commission authority");
});

Deno.test("honeypot submissions are accepted as spam without lead creation", () => {
  const result = normalizeLead({ ...baseLead(), website: "https://spam.example" });
  assert(result.kind === "spam", "honeypot must classify as spam");
});

Deno.test("requires stable intake id and a contact method", () => {
  assert(normalizeLead({ ...baseLead(), intake_id: "short" }).kind === "invalid", "short intake id must fail");
  assert(normalizeLead({ ...baseLead(), phone: "", email: "" }).kind === "invalid", "missing contact method must fail");
});
