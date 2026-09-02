import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import {
  authorizeEvidenceAccess,
  beginEvidenceUpload,
  disableEvidenceAfterSigningFailure,
  finalizeEvidenceInspection,
  resolveDownloadTarget,
  resolveInspectionAuthority,
  storageObjectExists,
} from "../_shared/billingAuthorization.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  createBillingErrorResponse,
  createSafeLogContext,
} from "../_shared/utils.ts";

type JsonObject = Record<string, unknown>;

const uploadKinds = new Set([
  "contract",
  "revenue_statement",
  "receipt",
  "dispute",
  "other",
]);
const uploadMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/csv",
]);
const accessPurposes = new Set(["download", "review", "audit"]);
const maximumUploadBytes = 10 * 1024 * 1024;
const signedUploadLifetimeSeconds = 2 * 60 * 60;
const signedDownloadLifetimeSeconds = 60;

function jsonResponse(body: JsonObject, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      ...corsHeaders,
    },
  });
}

function errorResponse(status: number, code: string, message: string) {
  const response = createBillingErrorResponse(status, code, message);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  return new Response(response.body, { status: response.status, headers });
}

function isPlainObject(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(value: JsonObject, expected: string[]) {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)
  );
}

function isSafeFilename(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 255 ||
    value !== value.trim()
  ) {
    return false;
  }

  return !Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      character === "/" ||
      character === "\\" ||
      codePoint <= 0x1f ||
      codePoint === 0x7f
    );
  });
}

function isReasonCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{2,63}$/.test(value);
}

function isIdempotencyKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/.test(value)
  );
}

function logResult(
  operation: string,
  result: "succeeded" | "denied" | "failed",
  code: string,
  status: number,
  requestId: string,
) {
  // Edge observability emits only the recursively redacted structured context.
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify(
      createSafeLogContext({
        operation,
        result,
        code,
        status,
        requestId,
      }),
    ),
  );
}

function externalCapabilityUrl(req: Request, signedUrl: string) {
  const capability = new URL(signedUrl);
  const publicOrigin = new URL(
    Deno.env.get("BILLING_EVIDENCE_PUBLIC_URL") ??
      Deno.env.get("SUPABASE_URL") ??
      req.url,
  );
  capability.protocol = publicOrigin.protocol;
  capability.host = publicOrigin.host;
  return capability.toString();
}

async function readBody(req: Request) {
  try {
    const body = await req.json();
    return isPlainObject(body) ? body : null;
  } catch {
    return null;
  }
}

async function handleUpload(
  req: Request,
  userId: string,
  body: JsonObject,
  requestId: string,
) {
  if (
    !hasExactKeys(body, [
      "command",
      "account_id",
      "kind",
      "original_filename",
      "mime_type",
      "size_bytes",
      "sha256",
      "purpose",
    ]) ||
    !isUuid(body.account_id) ||
    typeof body.kind !== "string" ||
    !uploadKinds.has(body.kind) ||
    !isSafeFilename(body.original_filename) ||
    typeof body.mime_type !== "string" ||
    !uploadMimeTypes.has(body.mime_type) ||
    !Number.isSafeInteger(body.size_bytes) ||
    Number(body.size_bytes) <= 0 ||
    Number(body.size_bytes) > maximumUploadBytes ||
    typeof body.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(body.sha256) ||
    !["operator_upload", "customer_submission"].includes(String(body.purpose))
  ) {
    logResult(
      "billing_evidence.upload",
      "denied",
      "INVALID_REQUEST",
      400,
      requestId,
    );
    return errorResponse(400, "INVALID_REQUEST", "Invalid request");
  }

  if (body.purpose === "customer_submission") {
    logResult(
      "billing_evidence.upload",
      "denied",
      "SCANNER_NOT_ENABLED",
      200,
      requestId,
    );
    return jsonResponse({
      result: "denied",
      reason_code: "SCANNER_NOT_ENABLED",
    });
  }

  const decision = await beginEvidenceUpload(userId, {
    accountId: body.account_id,
    kind: body.kind,
    mimeType: body.mime_type,
    originalFilename: body.original_filename,
    sha256: body.sha256,
    sizeBytes: Number(body.size_bytes),
  });
  if (decision.result !== "created") {
    logResult(
      "billing_evidence.upload",
      "denied",
      decision.reason_code,
      200,
      requestId,
    );
    return jsonResponse(decision);
  }

  const { data, error } = await supabaseAdmin.storage
    .from(decision.bucket_id)
    .createSignedUploadUrl(decision.object_path, { upsert: false });
  if (error || !data?.signedUrl) {
    await disableEvidenceAfterSigningFailure(decision.evidence_id);
    logResult(
      "billing_evidence.upload",
      "failed",
      "CAPABILITY_FAILED",
      503,
      requestId,
    );
    return errorResponse(503, "CAPABILITY_FAILED", "Service Unavailable");
  }

  logResult(
    "billing_evidence.upload",
    "succeeded",
    "UPLOAD_READY",
    200,
    requestId,
  );
  return jsonResponse({
    result: "ready",
    evidence_id: decision.evidence_id,
    url: externalCapabilityUrl(req, data.signedUrl),
    expires_at: new Date(
      Date.now() + signedUploadLifetimeSeconds * 1000,
    ).toISOString(),
  });
}

async function handleInspection(
  req: Request,
  userId: string,
  body: JsonObject,
  requestId: string,
) {
  if (
    !hasExactKeys(body, [
      "command",
      "evidence_id",
      "decision",
      "reason_code",
      "idempotency_key",
    ]) ||
    !isUuid(body.evidence_id) ||
    !["clean", "rejected"].includes(String(body.decision)) ||
    !isReasonCode(body.reason_code) ||
    !isIdempotencyKey(body.idempotency_key)
  ) {
    logResult(
      "billing_evidence.inspection",
      "denied",
      "INVALID_REQUEST",
      400,
      requestId,
    );
    return errorResponse(400, "INVALID_REQUEST", "Invalid request");
  }

  const authority = await resolveInspectionAuthority(
    userId,
    body.evidence_id,
    body.idempotency_key,
  );
  if (!authority || !(await storageObjectExists(authority.target))) {
    logResult(
      "billing_evidence.inspection",
      "denied",
      "INSPECTION_NOT_AUTHORIZED",
      200,
      requestId,
    );
    return jsonResponse({
      result: "denied",
      reason_code: "INSPECTION_NOT_AUTHORIZED",
    });
  }

  const decision = await finalizeEvidenceInspection(req, authority, {
    decision: body.decision as "clean" | "rejected",
    evidenceId: body.evidence_id,
    idempotencyKey: body.idempotency_key,
    reasonCode: body.reason_code,
  });
  logResult(
    "billing_evidence.inspection",
    decision.result === "applied" ? "succeeded" : "denied",
    decision.reason_code,
    200,
    requestId,
  );
  return jsonResponse(decision);
}

async function handleDownload(
  req: Request,
  body: JsonObject,
  requestId: string,
) {
  if (
    !hasExactKeys(body, ["command", "evidence_id", "purpose"]) ||
    !isUuid(body.evidence_id) ||
    typeof body.purpose !== "string" ||
    !accessPurposes.has(body.purpose)
  ) {
    logResult(
      "billing_evidence.download",
      "denied",
      "INVALID_REQUEST",
      400,
      requestId,
    );
    return errorResponse(400, "INVALID_REQUEST", "Invalid request");
  }

  const decision = await authorizeEvidenceAccess(
    req,
    body.evidence_id,
    body.purpose as "download" | "review" | "audit",
  );
  if (!decision.capability_eligible || !decision.expires_at) {
    logResult(
      "billing_evidence.download",
      "denied",
      decision.reason_code,
      200,
      requestId,
    );
    return jsonResponse({
      result: "denied",
      reason_code: decision.reason_code,
    });
  }

  const target = await resolveDownloadTarget(body.evidence_id);
  if (!target) {
    logResult(
      "billing_evidence.download",
      "denied",
      "ACCESS_NOT_AUTHORIZED",
      200,
      requestId,
    );
    return jsonResponse({
      result: "denied",
      reason_code: "ACCESS_NOT_AUTHORIZED",
    });
  }

  const { data, error } = await supabaseAdmin.storage
    .from(target.bucket_id)
    .createSignedUrl(target.object_path, signedDownloadLifetimeSeconds);
  if (error || !data?.signedUrl) {
    logResult(
      "billing_evidence.download",
      "failed",
      "CAPABILITY_FAILED",
      503,
      requestId,
    );
    return errorResponse(503, "CAPABILITY_FAILED", "Service Unavailable");
  }

  logResult(
    "billing_evidence.download",
    "succeeded",
    "DOWNLOAD_READY",
    200,
    requestId,
  );
  return jsonResponse({
    result: "ready",
    evidence_id: target.id,
    url: externalCapabilityUrl(req, data.signedUrl),
    expires_at: decision.expires_at,
  });
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        const requestId = crypto.randomUUID();
        if (!user) {
          return errorResponse(401, "UNAUTHORIZED", "Unauthorized");
        }
        if (req.method !== "POST") {
          return errorResponse(405, "METHOD_NOT_ALLOWED", "Operation failed");
        }
        const body = await readBody(req);
        if (!body || typeof body.command !== "string") {
          return errorResponse(400, "INVALID_REQUEST", "Invalid request");
        }

        try {
          if (body.command === "upload") {
            return await handleUpload(req, user.id, body, requestId);
          }
          if (body.command === "inspection") {
            return await handleInspection(req, user.id, body, requestId);
          }
          if (body.command === "download") {
            return await handleDownload(req, body, requestId);
          }
          return errorResponse(400, "INVALID_REQUEST", "Invalid request");
        } catch {
          logResult(
            "billing_evidence",
            "failed",
            "OPERATION_FAILED",
            500,
            requestId,
          );
          return errorResponse(
            500,
            "OPERATION_FAILED",
            "Internal Server Error",
          );
        }
      }),
    ),
  ),
);
