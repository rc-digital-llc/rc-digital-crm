export const POWERS_ACCOUNT_KEY = "powers-gc";
export const MAX_BODY_BYTES = 32 * 1024;

export type RawLead = Record<string, unknown>;

export type NormalizedLead = {
  intakeId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  service: string;
  projectCity: string;
  dimensions: string;
  projectType: string;
  timing: string;
  message: string;
  landingPath: string;
  referrer: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
  gclid: string;
  fbclid: string;
};
export type NormalizeResult =
  | { kind: "spam" }
  | { kind: "invalid"; reason: string }
  | { kind: "valid"; lead: NormalizedLead };

export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const withoutControls = Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127 ? " " : character;
  }).join("");
  return withoutControls.replace(/\s+/gu, " ").trim().slice(0, max);
}

function validIntakeId(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{15,95}$/u.test(value);
}

function splitName(fullName: string): [string, string] {
  const parts = fullName.split(/\s+/u).filter(Boolean);
  if (parts.length <= 1) return [fullName, ""];
  return [parts[0], parts.slice(1).join(" ")];
}

export function normalizeLead(raw: RawLead): NormalizeResult {
  if (cleanText(raw.website, 120)) return { kind: "spam" };
  const intakeId = cleanText(raw.intake_id, 96);
  const fullName = cleanText(raw.name, 120);
  const phone = cleanText(raw.phone, 40);
  const email = cleanText(raw.email, 180).toLowerCase();
  if (!validIntakeId(intakeId))
    return { kind: "invalid", reason: "invalid intake id" };
  if (!fullName || (!phone && !email))
    return { kind: "invalid", reason: "name and contact method required" };
  const [firstName, lastName] = splitName(fullName);
  return {
    kind: "valid",
    lead: {
      intakeId,
      fullName,
      firstName,
      lastName,
      email,
      phone,
      service: cleanText(raw.service, 100),
      projectCity: cleanText(raw.project_city, 100),
      dimensions: cleanText(raw.dimensions, 180),
      projectType: cleanText(raw.project_type, 100),
      timing: cleanText(raw.timing, 100),
      message: cleanText(raw.message, 1200),
      landingPath: cleanText(raw.landing_path, 300),
      referrer: cleanText(raw.referrer, 500),
      utmSource: cleanText(raw.utm_source, 120),
      utmMedium: cleanText(raw.utm_medium, 120),
      utmCampaign: cleanText(raw.utm_campaign, 180),
      utmTerm: cleanText(raw.utm_term, 180),
      utmContent: cleanText(raw.utm_content, 180),
      gclid: cleanText(raw.gclid, 180),
      fbclid: cleanText(raw.fbclid, 180),
    },
  };
}

export function classifyChannel(lead: NormalizedLead): string {
  const medium = lead.utmMedium.toLowerCase();
  const referrer = lead.referrer.toLowerCase();
  if (lead.gclid || ["cpc", "ppc", "paid_search"].includes(medium))
    return "paid_search";
  if (lead.fbclid || medium.includes("paid_social")) return "social_paid";
  if (/google\.|bing\.|yahoo\.|duckduckgo\./u.test(referrer))
    return "organic_search";
  if (lead.utmSource.toLowerCase().includes("facebook") || medium === "social")
    return "social_organic";
  if (referrer) return "referral";
  return "direct";
}
