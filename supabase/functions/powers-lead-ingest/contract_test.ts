import {
  classifyChannel,
  normalizeLead,
  POWERS_ACCOUNT_KEY,
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
Deno.test(
  "normalizes a valid Powers lead without accepting billing authority",
  () => {
    const result = normalizeLead({
      ...baseLead(),
      commissionable: true,
      account_key: "other-client",
    });
    assert(result.kind === "valid", "expected a valid lead");
    assert(
      result.lead.email === "jane@example.com",
      "email must normalize to lowercase",
    );
    assert(
      result.lead.firstName === "Jane" && result.lead.lastName === "Homeowner",
      "name must split deterministically",
    );
    assert(
      !("commissionable" in result.lead),
      "browser commissionability must be ignored",
    );
    assert(
      !("accountKey" in result.lead),
      "browser account identity must be ignored",
    );
    assert(
      POWERS_ACCOUNT_KEY === "powers-gc",
      "server account key changed unexpectedly",
    );
  },
);

Deno.test(
  "honeypot submissions are accepted as spam without lead creation",
  () => {
    const result = normalizeLead({
      ...baseLead(),
      website: "https://spam.example",
    });
    assert(result.kind === "spam", "honeypot must classify as spam");
  },
);

Deno.test("requires stable intake id and a contact method", () => {
  assert(
    normalizeLead({ ...baseLead(), intake_id: "short" }).kind === "invalid",
    "short intake id must fail",
  );
  assert(
    normalizeLead({ ...baseLead(), phone: "", email: "" }).kind === "invalid",
    "missing contact method must fail",
  );
});
Deno.test("classifies attribution channels conservatively", () => {
  const valid = normalizeLead(baseLead());
  assert(valid.kind === "valid", "fixture must be valid");
  assert(
    classifyChannel(valid.lead) === "direct",
    "blank attribution should be direct",
  );

  const paid = normalizeLead({ ...baseLead(), gclid: "test-click" });
  assert(
    paid.kind === "valid" && classifyChannel(paid.lead) === "paid_search",
    "gclid should map to paid search",
  );

  const organic = normalizeLead({
    ...baseLead(),
    referrer: "https://www.google.com/search?q=fence",
  });
  assert(
    organic.kind === "valid" &&
      classifyChannel(organic.lead) === "organic_search",
    "Google referrer should map organic",
  );

  const referral = normalizeLead({
    ...baseLead(),
    referrer: "https://example-neighbor.com/recommendations",
  });
  assert(
    referral.kind === "valid" && classifyChannel(referral.lead) === "referral",
    "other referrer should map referral",
  );
});
