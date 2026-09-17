import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  MAX_BODY_BYTES,
  normalizeLead,
  POWERS_ACCOUNT_KEY,
  toRpcPayload,
  type RawLead,
} from "./contract.ts";

const expectedToken = Deno.env.get("POWERS_LEAD_INGEST_TOKEN") ?? "";

type ReadResult =
  | { ok: true; value: RawLead }
  | { ok: false; status: number; error: string };

function json(
  status: number,
  body: Record<string, unknown>,
  headers: HeadersInit = {},
): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers },
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
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

async function readBoundedJsonObject(request: Request): Promise<ReadResult> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "payload too large" };
  }
  if (!request.body) return { ok: false, status: 400, error: "invalid json" };

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      await reader.cancel();
      return { ok: false, status: 413, error: "payload too large" };
    }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, status: 400, error: "invalid json" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, status: 400, error: "invalid json object" };
  }
  return { ok: true, value: parsed as RawLead };
}

function errorKind(error: { message?: string } | null): string {
  const message = String(error?.message ?? "");
  if (message.includes("INGEST_RATE_LIMITED")) return "rate_limited";
  if (message.includes("INTAKE_ID_CONFLICT")) return "intake_conflict";
  if (message.includes("INGEST_SOURCE_NOT_CONFIGURED")) return "source_not_configured";
  return "provider_error";
}

Deno.serve(async (request) => {
  if (!expectedToken) {
    return json(503, { ok: false, error: "lead intake not configured" });
  }
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "method not allowed" });
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "application/json required" });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const candidate = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!(await tokenMatches(candidate))) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  const body = await readBoundedJsonObject(request);
  if (!body.ok) return json(body.status, { ok: false, error: body.error });

  const normalized = normalizeLead(body.value);
  if (normalized.kind === "spam") return json(202, { ok: true });
  if (normalized.kind === "invalid") {
    return json(400, { ok: false, error: normalized.reason });
  }

  const { data, error } = await supabaseAdmin.rpc("ingest_external_lead", {
    p_account_key: POWERS_ACCOUNT_KEY,
    p_intake_id: normalized.lead.intakeId,
    p_payload: toRpcPayload(normalized.lead),
  });

  if (error) {
    const kind = errorKind(error);
    console.error("powers lead ingest failed", kind);
    if (kind === "rate_limited") {
      return json(429, { ok: false, error: "lead intake temporarily busy" }, { "retry-after": "3600" });
    }
    if (kind === "intake_conflict") {
      return json(409, { ok: false, error: "intake id conflict" });
    }
    if (kind === "source_not_configured") {
      return json(503, { ok: false, error: "lead intake not configured" });
    }
    return json(502, { ok: false, error: "lead delivery unavailable" });
  }

  const result = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  return json(202, {
    ok: true,
    intake_id: normalized.lead.intakeId,
    duplicate: result.duplicate === true,
  });
});
