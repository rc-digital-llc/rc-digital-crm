import { format } from "date-fns";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  useCanAccess,
  useDataProvider,
  useGetManyReference,
  useNotify,
} from "ra-core";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

import type {
  BillingEvidenceDownloadRequest,
  BillingEvidenceKind,
  CrmDataProvider,
} from "../providers/types";
import type {
  BillingAccount,
  BillingEvidenceAccessEvent,
  BillingEvidenceMetadata,
} from "../types";
import { registerBillingSecurityInvalidator } from "./billingAccess";

type TransientCapability = {
  value: string;
  expiresAt: string;
};

const useTransientEvidenceCapability = () => {
  const capabilityRef = useRef<TransientCapability | null>(null);
  const expiryTimerRef = useRef<number | null>(null);

  const clearCapability = useCallback(() => {
    if (expiryTimerRef.current !== null) {
      window.clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    capabilityRef.current = null;
  }, []);

  const retainCapability = useCallback(
    (value: string, expiresAt: string) => {
      clearCapability();
      capabilityRef.current = { value, expiresAt };
      const remaining = Math.max(0, Date.parse(expiresAt) - Date.now());
      expiryTimerRef.current = window.setTimeout(clearCapability, remaining);
      return capabilityRef.current.value;
    },
    [clearCapability],
  );

  useEffect(
    () => registerBillingSecurityInvalidator(clearCapability),
    [clearCapability],
  );
  useEffect(() => clearCapability, [clearCapability]);

  return { clearCapability, retainCapability };
};

export const BillingAccountEvidencePanel = ({
  account,
}: {
  account: BillingAccount;
}) => {
  const evidenceQuery = useGetManyReference<BillingEvidenceMetadata>(
    "billing_evidence_support_safe",
    {
      target: "account_id",
      id: account.id,
      pagination: { page: 1, perPage: 100 },
      sort: { field: "created_at", order: "DESC" },
    },
  );
  const uploadAccess = useCanAccess({
    action: "create",
    resource: "billing_evidence_support_safe",
    record: { account_id: account.id },
  });
  const openAccess = useCanAccess({
    action: "access",
    resource: "billing_evidence_support_safe",
    record: { account_id: account.id },
  });
  const historyAccess = useCanAccess({
    action: "list",
    resource: "billing_evidence_access_events",
    record: { account_id: account.id },
  });
  const [uploadOpen, setUploadOpen] = useState(false);
  const transient = useTransientEvidenceCapability();

  if (evidenceQuery.isPending) return <Skeleton className="h-48 w-full" />;
  if (evidenceQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Evidence metadata could not be loaded. Check your connection and try
          again.
        </AlertDescription>
      </Alert>
    );
  }

  const evidence = evidenceQuery.data ?? [];
  const online = typeof navigator === "undefined" || navigator.onLine;

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Quarantine, inspection, retention, and hold state are enforced by
            the server.
          </p>
          {!online ? (
            <p className="text-sm text-amber-700">
              Reconnect to manage billing security.
            </p>
          ) : null}
        </div>
        {uploadAccess.canAccess === true ? (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={!online}
            onClick={() => setUploadOpen(true)}
          >
            Upload evidence
          </Button>
        ) : null}
      </div>

      {evidence.length ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
          {evidence.map((record) => (
            <EvidenceCard
              key={record.id}
              record={record}
              canOpen={openAccess.canAccess === true && online}
              retainCapability={transient.retainCapability}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          No evidence is stored for this account.
        </p>
      )}

      {historyAccess.canAccess === true ? (
        <EvidenceAccessHistory account={account} />
      ) : null}

      <EvidenceUploadDialog
        account={account}
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
          if (!open) transient.clearCapability();
        }}
        onUploaded={async () => {
          transient.clearCapability();
          await evidenceQuery.refetch();
        }}
        retainCapability={transient.retainCapability}
      />
    </div>
  );
};

const EvidenceCard = ({
  record,
  canOpen,
  retainCapability,
}: {
  record: BillingEvidenceMetadata;
  canOpen: boolean;
  retainCapability: (value: string, expiresAt: string) => string;
}) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const [purpose, setPurpose] =
    useState<BillingEvidenceDownloadRequest["purpose"]>("download");
  const [opening, setOpening] = useState(false);
  const expired = Date.parse(record.retention_expires_at) <= Date.now();
  const openEligible =
    canOpen &&
    record.inspection_status === "clean" &&
    record.lifecycle_status === "active" &&
    !expired &&
    !record.is_held;

  const openEvidence = async () => {
    if (!openEligible) return;
    setOpening(true);
    try {
      const response = await dataProvider.createBillingEvidenceDownload({
        evidence_id: record.id,
        purpose,
      });
      if (response.result !== "ready") {
        notify(
          `Evidence access was denied (${formatReason(response.reason_code)}).`,
          {
            type: "warning",
          },
        );
        return;
      }
      const target = retainCapability(response.url, response.expires_at);
      const opened = window.open(target, "_blank", "noopener,noreferrer");
      if (!opened) {
        notify("The evidence window was blocked by the browser.", {
          type: "warning",
        });
      }
    } catch {
      notify("Evidence could not be opened.", { type: "error" });
    } finally {
      setOpening(false);
    }
  };

  return (
    <Card className="min-w-0 bg-[#fafafa] py-0 dark:bg-[#1c1c1e]">
      <CardContent className="min-w-0 space-y-4 p-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="break-words text-base font-semibold">
              {record.original_filename}
            </h3>
            <p className="text-sm text-muted-foreground">
              {kindLabel(record.kind)} · {formatBytes(record.size_bytes)}
            </p>
          </div>
          <Badge
            variant={
              record.inspection_status === "clean" ? "outline" : "secondary"
            }
          >
            {formatReason(record.inspection_status)}
          </Badge>
        </div>

        <EvidenceStateMessage record={record} expired={expired} />

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Uploaded by</dt>
            <dd className="break-words">{record.uploader_label}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Uploaded</dt>
            <dd>
              {format(new Date(record.created_at), "MMM d, yyyy, h:mm a")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Retention through</dt>
            <dd>
              {format(new Date(record.retention_expires_at), "MMM d, yyyy")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Hold</dt>
            <dd>{record.is_held ? "Held" : "Not held"}</dd>
          </div>
        </dl>

        {openEligible ? (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor={`evidence-purpose-${record.id}`}>
                Access purpose
              </Label>
              <select
                id={`evidence-purpose-${record.id}`}
                className="h-11 rounded-md border bg-background px-3 text-base"
                value={purpose}
                onChange={(event) =>
                  setPurpose(
                    event.target
                      .value as BillingEvidenceDownloadRequest["purpose"],
                  )
                }
              >
                <option value="download">Download</option>
                <option value="review">Review</option>
                <option value="audit">Audit</option>
              </select>
            </div>
            <Button
              type="button"
              className="h-11"
              disabled={opening}
              onClick={() => void openEvidence()}
            >
              Open evidence
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

const EvidenceStateMessage = ({
  record,
  expired,
}: {
  record: BillingEvidenceMetadata;
  expired: boolean;
}) => {
  if (record.lifecycle_status !== "active" || expired) {
    return (
      <p className="text-sm text-amber-700">
        This evidence is expired or inactive.
      </p>
    );
  }
  if (record.is_held) {
    return (
      <p className="text-sm text-amber-700">
        This evidence is on hold and cannot be opened.
      </p>
    );
  }
  if (record.inspection_status === "quarantined") {
    return (
      <p className="text-sm text-amber-700">
        Inspection required before this file can be opened.
      </p>
    );
  }
  if (record.inspection_status === "rejected") {
    return (
      <p className="text-sm text-[#a51d38]">
        Rejected:{" "}
        {formatReason(record.inspection_reason_code ?? "inspection_rejected")}.
      </p>
    );
  }
  return (
    <p className="text-sm text-emerald-700">
      Clean and available for authorized access.
    </p>
  );
};

const EvidenceUploadDialog = ({
  account,
  open,
  onOpenChange,
  onUploaded,
  retainCapability,
}: {
  account: BillingAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => Promise<void>;
  retainCapability: (value: string, expiresAt: string) => string;
}) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<BillingEvidenceKind>("contract");
  const [saving, setSaving] = useState(false);

  const upload = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const response = await dataProvider.beginBillingEvidenceUpload({
        account_id: account.id,
        kind,
        original_filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        sha256: await sha256For(file),
        purpose: "operator_upload",
      });
      if (response.result !== "ready") {
        notify(
          `Evidence upload was denied (${formatReason(response.reason_code)}).`,
          {
            type: "warning",
          },
        );
        return;
      }
      const target = retainCapability(response.url, response.expires_at);
      const uploadResult = await fetch(target, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadResult.ok) throw new Error("upload failed");
      await onUploaded();
      notify("Evidence uploaded for inspection.", { type: "success" });
      setFile(null);
      onOpenChange(false);
    } catch {
      notify("Evidence was not uploaded.", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload evidence</DialogTitle>
          <DialogDescription>
            Files enter quarantine and cannot be opened before inspection.
            Customer submission remains unavailable until scanning is enabled.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="evidence-kind">Evidence kind</Label>
            <select
              id="evidence-kind"
              className="h-11 rounded-md border bg-background px-3 text-base"
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as BillingEvidenceKind)
              }
            >
              <option value="contract">Contract</option>
              <option value="revenue_statement">Revenue statement</option>
              <option value="receipt">Receipt</option>
              <option value="dispute">Dispute</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="evidence-file">File</Label>
            <Input
              id="evidence-file"
              type="file"
              className="h-11 text-base"
              accept="application/pdf,image/jpeg,image/png,text/csv"
              onChange={selectFile}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => onOpenChange(false)}
          >
            Keep current evidence
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={!file || saving}
            onClick={() => void upload()}
          >
            Upload evidence
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const EvidenceAccessHistory = ({ account }: { account: BillingAccount }) => {
  const history = useGetManyReference<BillingEvidenceAccessEvent>(
    "billing_evidence_access_events",
    {
      target: "account_id",
      id: account.id,
      pagination: { page: 1, perPage: 20 },
      sort: { field: "created_at", order: "DESC" },
    },
  );

  return (
    <section aria-labelledby="evidence-access-history" className="space-y-3">
      <h3 id="evidence-access-history" className="text-base font-semibold">
        Access history
      </h3>
      {history.isPending ? <Skeleton className="h-20 w-full" /> : null}
      {history.error ? (
        <p className="text-sm text-muted-foreground">
          Access history is unavailable.
        </p>
      ) : null}
      {history.data?.length ? (
        <div className="space-y-2">
          {history.data.map((event) => (
            <div key={event.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {event.actor_type === "customer"
                    ? "Authorized customer"
                    : "RC Digital staff"}
                  {" · "}
                  {formatReason(event.purpose)}
                </span>
                <Badge
                  variant={event.result === "allowed" ? "outline" : "secondary"}
                >
                  {formatReason(event.result)}
                </Badge>
              </div>
              <p className="mt-1 text-muted-foreground">
                {format(new Date(event.created_at), "MMM d, yyyy, h:mm a")} ·{" "}
                {formatReason(event.reason_code)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
};

const sha256For = async (file: File) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const kindLabel = (kind: BillingEvidenceKind) =>
  kind
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const formatReason = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const formatBytes = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};
