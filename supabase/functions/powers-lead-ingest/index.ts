import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  classifyChannel,
  MAX_BODY_BYTES,
  normalizeLead,
  POWERS_ACCOUNT_KEY,
  type NormalizedLead,
} from "./contract.ts";

const expectedToken = Deno.env.get("POWERS_LEAD_INGEST_TOKEN") ?? "";
const configuredSalesId = Number(Deno.env.get("POWERS_CRM_SALES_ID") ?? "");

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function digest(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

async function tokenMatches(candidate: string): Promise<boolean> {
  if (!expectedToken || !candidate) return false;
  const [left, right] = await Promise.all([
    digest(candidate),
    digest(expectedToken),
  ]);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1)
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}
function leadRow(lead: NormalizedLead, salesId: number) {
  return {
    first_name: lead.firstName,
    last_name: lead.lastName,
    email: lead.email || null,
    phone: lead.phone || null,
    source: "website_form",
    source_detail: `${POWERS_ACCOUNT_KEY}:${lead.intakeId}`,
    utm_source: lead.utmSource || null,
    utm_medium: lead.utmMedium || null,
    utm_campaign: lead.utmCampaign || null,
    utm_term: lead.utmTerm || null,
    utm_content: lead.utmContent || null,
    landing_page_url: lead.landingPath || null,
    referrer_url: lead.referrer || null,
    status: "new",
    sales_id: salesId,
    notes: lead.message || null,
    custom_fields: {
      account_key: POWERS_ACCOUNT_KEY,
      intake_id: lead.intakeId,
      full_name: lead.fullName,
      service: lead.service,
      project_city: lead.projectCity,
      dimensions: lead.dimensions,
      project_type: lead.projectType,
      timing: lead.timing,
      gclid: lead.gclid,
      fbclid: lead.fbclid,
      commissionable: null,
      commission_note:
        "Requires downstream attribution review after collected revenue evidence.",
    },
  };
}
async function ensureTouchpoint(
  leadId: number,
  lead: NormalizedLead,
  salesId: number,
) {
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("touchpoints")
    .select("id")
    .eq("lead_id", leadId)
    .eq("touchpoint_type", "form_submit")
    .eq("source", POWERS_ACCOUNT_KEY)
    .limit(1);
  if (lookupError) throw new Error("TOUCHPOINT_LOOKUP_FAILED");
  if (existing?.length) return;

  const { error } = await supabaseAdmin.from("touchpoints").insert({
    lead_id: leadId,
    anonymous_id: lead.intakeId,
    touchpoint_type: "form_submit",
    channel: classifyChannel(lead),
    source: POWERS_ACCOUNT_KEY,
    medium: lead.utmMedium || null,
    campaign: lead.utmCampaign || null,
    content: lead.utmContent || null,
    term: lead.utmTerm || null,
    page_url: lead.landingPath || null,
    referrer_url: lead.referrer || null,
    sales_id: salesId,
    metadata: {
      account_key: POWERS_ACCOUNT_KEY,
      gclid: lead.gclid,
      fbclid: lead.fbclid,
    },
  });
  if (error) throw new Error("TOUCHPOINT_INSERT_FAILED");
}
async function persistLead(
  lead: NormalizedLead,
  salesId: number,
): Promise<{ id: number; duplicate: boolean }> {
  const sourceDetail = `${POWERS_ACCOUNT_KEY}:${lead.intakeId}`;
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("source_detail", sourceDetail)
    .eq("sales_id", salesId)
    .limit(1);
  if (lookupError) throw new Error("LEAD_LOOKUP_FAILED");
  if (existing?.length) {
    const id = Number(existing[0].id);
    await ensureTouchpoint(id, lead, salesId);
    return { id, duplicate: true };
  }

  const { data, error } = await supabaseAdmin
    .from("leads")
    .insert(leadRow(lead, salesId))
    .select("id")
    .single();
  if (error || !data) throw new Error("LEAD_INSERT_FAILED");
  const id = Number(data.id);
  await ensureTouchpoint(id, lead, salesId);
  return { id, duplicate: false };
}
Deno.serve(async (request) => {
  if (
    !expectedToken ||
    !Number.isInteger(configuredSalesId) ||
    configuredSalesId <= 0
  ) {
    return json(503, { ok: false, error: "lead intake not configured" });
  }
  if (request.method !== "POST")
    return json(405, { ok: false, error: "method not allowed" });

  const authorization = request.headers.get("authorization") ?? "";
  const candidate = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!(await tokenMatches(candidate)))
    return json(401, { ok: false, error: "unauthorized" });

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: "payload too large" });
  }

  const bodyText = await request.text();
  if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: "payload too large" });
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: "invalid json" });
  }

  const normalized = normalizeLead(raw);
  if (normalized.kind === "spam") return json(202, { ok: true });
  if (normalized.kind === "invalid")
    return json(400, { ok: false, error: normalized.reason });
  try {
    const persisted = await persistLead(normalized.lead, configuredSalesId);
    return json(202, {
      ok: true,
      intake_id: normalized.lead.intakeId,
      duplicate: persisted.duplicate,
    });
  } catch (error) {
    console.error(
      "powers lead ingest failed",
      error instanceof Error ? error.message : "unknown",
    );
    return json(502, { ok: false, error: "lead delivery unavailable" });
  }
});
