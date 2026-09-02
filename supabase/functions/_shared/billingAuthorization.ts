import { createClient } from "jsr:@supabase/supabase-js@2";
import { supabaseAdmin } from "./supabaseAdmin.ts";

type UploadDecision =
  | {
      result: "created";
      evidence_id: string;
      organization_id: string;
      account_id: string;
      bucket_id: "billing-evidence";
      object_path: string;
    }
  | { result: "denied"; reason_code: string };

type InspectionDecision =
  | {
      result: "applied";
      reason_code: "INSPECTION_RECORDED";
      evidence_id: string;
      decision: "clean" | "rejected";
    }
  | { result: "duplicate" | "denied"; reason_code: string };

type AccessDecision = {
  capability_eligible: boolean;
  reason_code: string;
  access_event_id?: number;
  expires_at?: string;
};

export type EvidenceStorageTarget = {
  id: string;
  organization_id: string;
  account_id: string;
  bucket_id: "billing-evidence";
  object_path: string;
  inspection_status: "quarantined" | "clean" | "rejected";
  lifecycle_status: "active" | "disabled" | "expired";
  retention_expires_at: string;
  hold_started_at: string | null;
  hold_released_at: string | null;
};

export type InspectionAuthority = {
  target: EvidenceStorageTarget;
  grantId: string;
  providerReference: string;
  policyVersion: string;
};

function callerClient(req: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SB_PUBLISHABLE_KEY") ??
      Deno.env.get("SUPABASE_ANON_KEY") ??
      "",
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
    },
  );
}

export async function beginEvidenceUpload(
  actorUserId: string,
  input: {
    accountId: string;
    kind: string;
    mimeType: string;
    originalFilename: string;
    sha256: string;
    sizeBytes: number;
  },
): Promise<UploadDecision> {
  const { data, error } = await supabaseAdmin.rpc(
    "begin_billing_evidence_upload",
    {
      p_actor_user_id: actorUserId,
      p_account_id: input.accountId,
      p_sha256: input.sha256,
      p_size_bytes: input.sizeBytes,
      p_mime_type: input.mimeType,
      p_kind: input.kind,
      p_original_filename: input.originalFilename,
    },
  );
  if (error || !data || typeof data !== "object") {
    throw new Error("UPLOAD_DECISION_FAILED");
  }
  return data as UploadDecision;
}

export async function disableEvidenceAfterSigningFailure(evidenceId: string) {
  const { error } = await supabaseAdmin
    .from("billing_evidence_objects")
    .update({
      lifecycle_status: "disabled",
      ended_at: new Date().toISOString(),
      end_reason: "capability issuance failed",
    })
    .eq("id", evidenceId)
    .eq("lifecycle_status", "active");
  if (error) throw new Error("UPLOAD_COMPENSATION_FAILED");
}

async function evidenceTarget(
  evidenceId: string,
): Promise<EvidenceStorageTarget | null> {
  const { data, error } = await supabaseAdmin
    .from("billing_evidence_objects")
    .select(
      "id,organization_id,account_id,bucket_id,object_path,inspection_status,lifecycle_status,retention_expires_at,hold_started_at,hold_released_at",
    )
    .eq("id", evidenceId)
    .maybeSingle();
  if (error) throw new Error("EVIDENCE_LOOKUP_FAILED");
  return (data as EvidenceStorageTarget | null) ?? null;
}

export async function resolveInspectionAuthority(
  actorUserId: string,
  evidenceId: string,
  idempotencyKey: string,
): Promise<InspectionAuthority | null> {
  const target = await evidenceTarget(evidenceId);
  if (!target) return null;

  const { data: principal, error: principalError } = await supabaseAdmin
    .from("billing_automation_principals")
    .select("id,organization_id")
    .eq("auth_user_id", actorUserId)
    .eq("organization_id", target.organization_id)
    .eq("status", "active")
    .is("disabled_at", null)
    .lte("valid_from", new Date().toISOString())
    .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
    .maybeSingle();
  if (principalError || !principal) return null;

  const { data: execution, error: executionError } = await supabaseAdmin
    .from("billing_automation_executions")
    .select("grant_id,account_id")
    .eq("principal_id", principal.id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (executionError) return null;

  let grantQuery = supabaseAdmin
    .from("billing_automation_grants")
    .select("id,provider_reference,policy_version")
    .eq("principal_id", principal.id)
    .eq("organization_id", target.organization_id)
    .eq("account_id", target.account_id)
    .eq("command_name", "evidence.inspect")
    .eq("action_kind", "evidence.inspection");
  if (execution) {
    if (execution.account_id !== target.account_id) return null;
    grantQuery = grantQuery.eq("id", execution.grant_id);
  } else {
    grantQuery = grantQuery.eq("status", "active").is("disabled_at", null);
  }
  const { data: grants, error: grantError } = await grantQuery;
  if (grantError || grants?.length !== 1) return null;

  return {
    target,
    grantId: String(grants[0].id),
    providerReference: String(grants[0].provider_reference),
    policyVersion: String(grants[0].policy_version),
  };
}

export async function storageObjectExists(target: EvidenceStorageTarget) {
  const segments = target.object_path.split("/");
  const objectName = segments.pop();
  if (!objectName || segments.length === 0) return false;
  const { data, error } = await supabaseAdmin.storage
    .from(target.bucket_id)
    .list(segments.join("/"), { limit: 2, search: objectName });
  if (error) throw new Error("EVIDENCE_STORAGE_LOOKUP_FAILED");
  return data.some((entry) => entry.name === objectName);
}

export async function finalizeEvidenceInspection(
  req: Request,
  authority: InspectionAuthority,
  input: {
    decision: "clean" | "rejected";
    evidenceId: string;
    idempotencyKey: string;
    reasonCode: string;
  },
): Promise<InspectionDecision> {
  const { data, error } = await callerClient(req).rpc(
    "finalize_billing_evidence_inspection",
    {
      p_evidence_id: input.evidenceId,
      p_grant_id: authority.grantId,
      p_provider_reference: authority.providerReference,
      p_policy_version: authority.policyVersion,
      p_decision: input.decision,
      p_reason_code: input.reasonCode,
      p_idempotency_key: input.idempotencyKey,
    },
  );
  if (error || !data || typeof data !== "object") {
    throw new Error("INSPECTION_DECISION_FAILED");
  }
  return data as InspectionDecision;
}

export async function authorizeEvidenceAccess(
  req: Request,
  evidenceId: string,
  purpose: "download" | "review" | "audit",
): Promise<AccessDecision> {
  const { data, error } = await callerClient(req).rpc(
    "authorize_billing_evidence_access",
    { p_evidence_id: evidenceId, p_purpose: purpose },
  );
  if (error || !data || typeof data !== "object") {
    throw new Error("ACCESS_DECISION_FAILED");
  }
  return data as AccessDecision;
}

export async function resolveDownloadTarget(evidenceId: string) {
  const target = await evidenceTarget(evidenceId);
  if (!target) return null;
  const held =
    target.hold_started_at !== null && target.hold_released_at === null;
  if (
    target.inspection_status !== "clean" ||
    target.lifecycle_status !== "active" ||
    new Date(target.retention_expires_at).getTime() <= Date.now() ||
    held
  ) {
    return null;
  }
  return target;
}
