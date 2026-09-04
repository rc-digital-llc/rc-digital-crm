/* eslint-disable react-refresh/only-export-components */
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileCheck2, Pencil, Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useCanAccess, useDataProvider, useGetOne, useNotify } from "ra-core";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

import { formatUsdMoney } from "../financial/exactMoney";
import type {
  BillingAgreementDraftRequest,
  BillingAgreementLifecycleRequest,
  CrmDataProvider,
} from "../providers/types";
import type {
  BillingAccount,
  BillingAgreementLifecycleState,
  BillingAgreementVersion,
  BillingEvidenceMetadata,
} from "../types";
import {
  BillingAgreementForm,
  BillingAgreementLifecycleDialog,
  EMPTY_BILLING_AGREEMENT_FORM,
  type BillingAgreementFormValues,
} from "./BillingAgreementForm";

const stateLabels: Record<BillingAgreementLifecycleState, string> = {
  draft: "Draft",
  pending_review: "Awaiting review",
  active: "Active",
  paused: "Paused",
  superseded: "Superseded",
  terminated: "Terminated",
};

const stateClasses: Record<BillingAgreementLifecycleState, string> = {
  draft: "border-slate-500/30 bg-slate-50 text-slate-800",
  pending_review: "border-amber-600/30 bg-amber-50 text-amber-800",
  active: "border-emerald-600/30 bg-emerald-50 text-emerald-800",
  paused: "border-amber-600/30 bg-amber-50 text-amber-800",
  superseded: "border-slate-500/30 bg-slate-50 text-slate-700",
  terminated: "border-[#e94560]/30 bg-[#e94560]/10 text-[#a51d38]",
};

export const agreementStateLabel = (state: BillingAgreementLifecycleState) =>
  stateLabels[state];

export const agreementFormulaSummary = (agreement: BillingAgreementVersion) => {
  if (agreement.formula_kind === "fixed" && agreement.fixed_amount) {
    return `${formatUsdMoney(agreement.fixed_amount)} fixed monthly`;
  }
  if (agreement.formula_kind === "percentage" && agreement.rate) {
    return `${agreement.rate.submitted_percentage} of commissionable revenue`;
  }
  if (
    agreement.formula_kind === "minimum_support" &&
    agreement.minimum_amount
  ) {
    return `${formatUsdMoney(agreement.minimum_amount)} minimum support`;
  }
  if (
    agreement.formula_kind === "hybrid" &&
    agreement.minimum_amount &&
    agreement.rate
  ) {
    return `The greater of ${formatUsdMoney(agreement.minimum_amount)} or ${agreement.rate.submitted_percentage} of commissionable revenue`;
  }
  return "Agreement terms require review";
};

export const agreementToFormValues = (
  agreement: BillingAgreementVersion,
): BillingAgreementFormValues => ({
  agreement_family: agreement.agreement_family,
  effective_start: agreement.effective_start,
  effective_end: agreement.effective_end,
  timezone: agreement.rules.timezone,
  formula_kind: agreement.formula_kind,
  fixed_amount_usd: agreement.fixed_amount
    ? formatUsdMoney(agreement.fixed_amount)
    : "",
  minimum_amount_usd: agreement.minimum_amount
    ? formatUsdMoney(agreement.minimum_amount)
    : "",
  percentage: agreement.rate?.submitted_percentage ?? "",
  timing_basis: agreement.rules.timing_basis,
  included_amounts: agreement.rules.included_amounts.join(", "),
  excluded_amounts: agreement.rules.excluded_amounts.join(", "),
  tax_treatment: agreement.rules.tax_treatment,
  refund_chargeback_policy: agreement.rules.refund_chargeback_policy,
  cutoff_day: String(agreement.rules.cutoff_day),
  dispute_policy: agreement.rules.dispute_policy,
  missing_report_policy: agreement.rules.missing_report_policy,
  true_up_policy: agreement.rules.true_up_policy,
  evidence_priority: agreement.rules.evidence_priority.join(", "),
  signed_evidence_id: agreement.signed_evidence_id,
});

function useOnlineStatus() {
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

function chooseCurrentAgreement(
  agreements: readonly BillingAgreementVersion[],
) {
  const priority: BillingAgreementLifecycleState[] = [
    "pending_review",
    "draft",
    "active",
    "paused",
    "superseded",
    "terminated",
  ];
  const sorted = [...agreements].sort(
    (left, right) => right.version_number - left.version_number,
  );
  for (const state of priority) {
    const agreement = sorted.find((candidate) => candidate.state === state);
    if (agreement) return agreement;
  }
  return sorted[0] ?? null;
}

type FormMode =
  | { kind: "create" }
  | { kind: "edit"; agreement: BillingAgreementVersion }
  | { kind: "amend"; agreement: BillingAgreementVersion };

type LifecycleAction = "submit" | "activate" | "pause" | "terminate";

export const BillingAgreementPanel = ({
  account,
}: {
  account: BillingAccount;
}) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const online = useOnlineStatus();
  const agreementQuery = useQuery({
    queryKey: ["billingAgreements", account.id],
    queryFn: () =>
      dataProvider.listBillingAgreements({ account_id: account.id }),
    enabled: online,
  });
  const agreements = agreementQuery.data?.data ?? [];
  const current = chooseCurrentAgreement(agreements);
  const evidenceQuery = useGetOne<BillingEvidenceMetadata>(
    "billing_evidence_support_safe",
    { id: current?.signed_evidence_id ?? "" },
    { enabled: online && Boolean(current?.signed_evidence_id) },
  );
  const manageAccess = useCanAccess({
    action: "manage",
    resource: "billing_agreements_support_safe",
    record: { account_id: account.id },
  });
  const approveAccess = useCanAccess({
    action: "approve",
    resource: "billing_agreements_support_safe",
    record: { account_id: account.id },
  });
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [lifecycleAction, setLifecycleAction] =
    useState<LifecycleAction | null>(null);

  const canManage = manageAccess.canAccess === true;
  const canApprove = approveAccess.canAccess === true;

  const refresh = async () => {
    await agreementQuery.refetch();
    if (current?.signed_evidence_id) await evidenceQuery.refetch();
  };

  const saveDraft = async (request: BillingAgreementDraftRequest) => {
    setSavingDraft(true);
    try {
      await dataProvider.saveBillingAgreementDraft(request);
      await refresh();
      setFormMode(null);
      notify("Agreement draft saved.", { type: "success" });
    } catch (error) {
      await agreementQuery.refetch();
      throw error;
    } finally {
      setSavingDraft(false);
    }
  };

  const runLifecycle = async (
    action: LifecycleAction,
    request: BillingAgreementLifecycleRequest,
  ) => {
    try {
      if (action === "submit") {
        await dataProvider.submitBillingAgreementVersion(request);
      } else if (action === "activate") {
        await dataProvider.activateBillingAgreementVersion(request);
      } else if (action === "pause") {
        await dataProvider.pauseBillingAgreementVersion(request);
      } else {
        await dataProvider.terminateBillingAgreementVersion(request);
      }
      await refresh();
      notify(
        `${stateLabels[action === "submit" ? "pending_review" : action === "activate" ? "active" : action === "pause" ? "paused" : "terminated"]} agreement state recorded.`,
        {
          type: "success",
        },
      );
    } catch (error) {
      await agreementQuery.refetch();
      throw error;
    }
  };

  return (
    <section
      aria-labelledby="billing-agreement-heading"
      data-slot="billing-account-agreement"
      className="min-w-0 md:col-span-2"
    >
      <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 id="billing-agreement-heading" className="text-xl font-semibold">
            Agreement
          </h2>
          <p className="text-sm text-muted-foreground">
            Immutable commercial terms, signed-source evidence, and lifecycle
            history for this billing account.
          </p>
        </div>
      </div>

      {!online ? (
        <Alert className="border-amber-500 bg-amber-50 text-amber-950">
          <AlertTitle>Agreement details are offline</AlertTitle>
          <AlertDescription>
            Reconnect to view or change agreement, evidence, and calculation
            details.
          </AlertDescription>
        </Alert>
      ) : agreementQuery.isPending ? (
        <AgreementLoading />
      ) : agreementQuery.error ? (
        <AgreementError
          denied={isAuthorizationError(agreementQuery.error)}
          onRetry={() => void agreementQuery.refetch()}
        />
      ) : !current ? (
        <AgreementEmpty
          canCreate={canManage}
          onCreate={() => setFormMode({ kind: "create" })}
        />
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_320px] md:gap-8">
          <CurrentAgreementCard agreement={current} />
          <AgreementActionCard
            agreement={current}
            canManage={canManage}
            canApprove={canApprove}
            onEdit={() => setFormMode({ kind: "edit", agreement: current })}
            onAmend={() => setFormMode({ kind: "amend", agreement: current })}
            onLifecycle={setLifecycleAction}
          />
          <RevenueDefinitionCard agreement={current} />
          <SignedEvidenceCard
            agreement={current}
            evidence={evidenceQuery.data}
            loading={evidenceQuery.isPending}
            error={Boolean(evidenceQuery.error)}
          />
          <AgreementHistory agreements={agreements} />
        </div>
      )}

      <AgreementFormSheet
        mode={formMode}
        account={account}
        saving={savingDraft}
        onOpenChange={(open) => !open && setFormMode(null)}
        onSave={saveDraft}
      />
      {current && lifecycleAction ? (
        <BillingAgreementLifecycleDialog
          action={lifecycleAction}
          accountName={account.customer_name}
          agreement={current}
          evidenceFilename={
            evidenceQuery.data?.original_filename ?? "Signed agreement evidence"
          }
          open
          onOpenChange={(open) => !open && setLifecycleAction(null)}
          onConfirm={(request) => runLifecycle(lifecycleAction, request)}
        />
      ) : null}
    </section>
  );
};

const AgreementLoading = () => (
  <div
    aria-label="Loading agreement details"
    className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_320px]"
  >
    <Skeleton className="h-64 w-full" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const AgreementError = ({
  denied,
  onRetry,
}: {
  denied: boolean;
  onRetry: () => void;
}) => (
  <Alert variant="destructive" role="alert">
    <AlertTitle>
      {denied ? "Agreement access denied" : "Agreement details unavailable"}
    </AlertTitle>
    <AlertDescription className="space-y-4">
      <p>
        {denied
          ? "You do not have access to agreement details for this account."
          : "Agreement details could not be loaded. Check your connection and refresh the account."}
      </p>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        onClick={onRetry}
      >
        <RefreshCw aria-hidden="true" className="h-4 w-4" />
        Refresh agreement details
      </Button>
    </AlertDescription>
  </Alert>
);

const AgreementEmpty = ({
  canCreate,
  onCreate,
}: {
  canCreate: boolean;
  onCreate: () => void;
}) => (
  <Card className="min-w-0 border bg-white py-0 dark:bg-[#111113]">
    <CardContent className="space-y-4 p-4 md:p-6">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">No agreement is active</h3>
        <p className="text-sm text-muted-foreground">
          Create a draft and attach the signed commercial terms before this
          account can enter monthly close.
        </p>
      </div>
      {canCreate ? (
        <Button type="button" className="h-11" onClick={onCreate}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Create agreement draft
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          An authorized billing operator can create the first draft.
        </p>
      )}
    </CardContent>
  </Card>
);

const CurrentAgreementCard = ({
  agreement,
}: {
  agreement: BillingAgreementVersion;
}) => (
  <Card className="min-w-0 border bg-white py-0 dark:bg-[#111113]">
    <CardContent className="min-w-0 space-y-5 p-4 md:p-6">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-lg font-semibold">Current agreement</h3>
          <p className="break-words text-2xl font-semibold tabular-nums">
            {agreementFormulaSummary(agreement)}
          </p>
        </div>
        <Badge variant="outline" className={stateClasses[agreement.state]}>
          {agreementStateLabel(agreement.state)}
        </Badge>
      </div>
      <dl className="grid min-w-0 grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <Detail label="Effective period">
          {formatDate(agreement.effective_start)} to{" "}
          {formatDate(agreement.effective_end)}
        </Detail>
        <Detail label="Agreement timezone">{agreement.rules.timezone}</Detail>
        <Detail label="Billing cadence">Monthly</Detail>
        <Detail label="Timing basis">
          {titleCase(agreement.rules.timing_basis)}
        </Detail>
        <Detail label="Formula policy">{agreement.formula_version}</Detail>
        <Detail label="Rounding policy">
          {agreement.rounding_policy_version}
        </Detail>
        <Detail label="Terms fingerprint">
          <span className="break-all font-mono">
            {agreement.terms_fingerprint.slice(0, 16)}…
          </span>
        </Detail>
        <Detail label="Self-approval">
          {agreement.self_approved ? "Recorded" : "Not recorded"}
        </Detail>
      </dl>
    </CardContent>
  </Card>
);

const AgreementActionCard = ({
  agreement,
  canManage,
  canApprove,
  onEdit,
  onAmend,
  onLifecycle,
}: {
  agreement: BillingAgreementVersion;
  canManage: boolean;
  canApprove: boolean;
  onEdit: () => void;
  onAmend: () => void;
  onLifecycle: (action: LifecycleAction) => void;
}) => {
  const actions: React.ReactNode[] = [];
  if (agreement.state === "draft" && canManage) {
    actions.push(
      <Button
        key="edit"
        type="button"
        variant="outline"
        className="h-11"
        onClick={onEdit}
      >
        <Pencil aria-hidden="true" className="h-4 w-4" />
        Edit draft
      </Button>,
      <Button
        key="submit"
        type="button"
        className="h-11"
        onClick={() => onLifecycle("submit")}
      >
        Submit for review
      </Button>,
    );
  }
  if (agreement.state === "pending_review" && canApprove) {
    actions.push(
      <Button
        key="activate"
        type="button"
        className="h-11"
        onClick={() => onLifecycle("activate")}
      >
        Activate agreement
      </Button>,
    );
  }
  if (agreement.state === "active" && canManage) {
    actions.push(
      <Button
        key="amend"
        type="button"
        variant="outline"
        className="h-11"
        onClick={onAmend}
      >
        Amend agreement
      </Button>,
      <Button
        key="pause"
        type="button"
        variant="outline"
        className="h-11"
        onClick={() => onLifecycle("pause")}
      >
        Pause agreement
      </Button>,
      <Button
        key="terminate"
        type="button"
        variant="outline"
        className="h-11"
        onClick={() => onLifecycle("terminate")}
      >
        Terminate agreement
      </Button>,
    );
  }
  if (
    ["paused", "superseded", "terminated"].includes(agreement.state) &&
    canManage
  ) {
    actions.push(
      <Button
        key="amend"
        type="button"
        variant="outline"
        className="h-11"
        onClick={onAmend}
      >
        Create amendment draft
      </Button>,
    );
  }
  return (
    <Card className="min-w-0 border bg-[#fafafa] py-0 dark:bg-[#1c1c1e]">
      <CardContent className="space-y-4 p-4 md:p-6">
        <h3 className="text-base font-semibold">Permitted next actions</h3>
        {actions.length ? (
          <div className="grid gap-3">{actions}</div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This agreement is read-only for your current access and lifecycle
            state.
          </p>
        )}
        {agreement.state === "active" ? (
          <p className="text-sm text-muted-foreground">
            Amendments create a new draft. The active version is never edited.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};

const RevenueDefinitionCard = ({
  agreement,
}: {
  agreement: BillingAgreementVersion;
}) => (
  <Card className="min-w-0 border bg-white py-0 dark:bg-[#111113]">
    <CardContent className="space-y-5 p-4 md:p-6">
      <h3 className="text-lg font-semibold">
        Commissionable revenue definition
      </h3>
      <dl className="grid min-w-0 grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <Detail label="Included amounts">
          {agreement.rules.included_amounts.map(titleCase).join(", ")}
        </Detail>
        <Detail label="Excluded amounts">
          {agreement.rules.excluded_amounts.length
            ? agreement.rules.excluded_amounts.map(titleCase).join(", ")
            : "None"}
        </Detail>
        <Detail label="Tax treatment">
          {titleCase(agreement.rules.tax_treatment)}
        </Detail>
        <Detail label="Refunds and chargebacks">
          {titleCase(agreement.rules.refund_chargeback_policy)}
        </Detail>
        <Detail label="Monthly cutoff">
          Day {agreement.rules.cutoff_day} in {agreement.rules.timezone}
        </Detail>
        <Detail label="Disputes">
          {titleCase(agreement.rules.dispute_policy)}
        </Detail>
        <Detail label="Missing report">
          {titleCase(agreement.rules.missing_report_policy)}
        </Detail>
        <Detail label="Late true-up or credit">
          {titleCase(agreement.rules.true_up_policy)}
        </Detail>
      </dl>
      <div className="space-y-2">
        <p className="text-sm font-medium">Ordered provenance ladder</p>
        <ol className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
          {agreement.rules.evidence_priority.map((source, index) => (
            <li
              key={source}
              className="rounded-md border bg-[#fafafa] p-3 text-sm dark:bg-[#1c1c1e]"
            >
              {index + 1}. {titleCase(source)}
            </li>
          ))}
        </ol>
      </div>
    </CardContent>
  </Card>
);

const SignedEvidenceCard = ({
  agreement,
  evidence,
  loading,
  error,
}: {
  agreement: BillingAgreementVersion;
  evidence?: BillingEvidenceMetadata;
  loading: boolean;
  error: boolean;
}) => (
  <Card className="min-w-0 border bg-[#fafafa] py-0 dark:bg-[#1c1c1e]">
    <CardContent className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <FileCheck2 aria-hidden="true" className="h-5 w-5" />
        <h3 className="text-lg font-semibold">Signed source evidence</h3>
      </div>
      {loading ? <Skeleton className="h-20 w-full" /> : null}
      {error ? (
        <p className="text-sm text-amber-700">
          Evidence metadata is unavailable. Refresh before a lifecycle action.
        </p>
      ) : null}
      {evidence ? (
        <div className="space-y-3 text-sm">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <p className="break-words font-medium">
              {evidence.original_filename}
            </p>
            <Badge variant="outline">
              {titleCase(evidence.inspection_status)}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Access and download remain in Evidence security below.
          </p>
        </div>
      ) : null}
      <dl className="grid gap-3 text-sm">
        <Detail label="Evidence identifier">
          <span className="break-all font-mono">
            {agreement.signed_evidence_id}
          </span>
        </Detail>
        <Detail label="Content hash prefix">
          <span className="font-mono">
            {agreement.signed_evidence_sha256.slice(0, 16)}…
          </span>
        </Detail>
      </dl>
    </CardContent>
  </Card>
);

const AgreementHistory = ({
  agreements,
}: {
  agreements: readonly BillingAgreementVersion[];
}) => (
  <Card className="min-w-0 border bg-white py-0 md:col-span-2 dark:bg-[#111113]">
    <CardContent className="space-y-4 p-4 md:p-6">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Lifecycle history</h3>
        <p className="text-sm text-muted-foreground">
          Each event retains its authenticated actor, role, reason, and
          timestamp.
        </p>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
        {[...agreements]
          .sort((left, right) => right.version_number - left.version_number)
          .map((agreement) => (
            <article
              key={agreement.version_id}
              className="grid min-w-0 gap-3 rounded-lg border bg-[#fafafa] p-4 text-sm dark:bg-[#1c1c1e]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold">
                  Version {agreement.version_number}
                </h4>
                <Badge
                  variant="outline"
                  className={stateClasses[agreement.state]}
                >
                  {agreementStateLabel(agreement.state)}
                </Badge>
              </div>
              <dl className="grid gap-3">
                <Detail label="Latest lifecycle event">
                  {titleCase(agreement.latest_event)}
                </Detail>
                <Detail label="Effective period">
                  {formatDate(agreement.effective_start)} to{" "}
                  {formatDate(agreement.effective_end)}
                </Detail>
                <Detail label="Formula">
                  {agreementFormulaSummary(agreement)}
                </Detail>
                <Detail label="Approval context">
                  {agreement.self_approved
                    ? "Self-approval recorded"
                    : "Separate approval or draft state"}
                </Detail>
                <Detail label="Immutable version identifier">
                  <span className="break-all font-mono">
                    {agreement.version_id}
                  </span>
                </Detail>
              </dl>
              <div className="space-y-2 border-t pt-3">
                <p className="font-medium">Recorded events</p>
                {agreement.lifecycle_events.map((event) => (
                  <div
                    key={event.event_id}
                    className="min-w-0 rounded-md border bg-white p-3 dark:bg-[#111113]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {titleCase(event.event_type)}
                      </span>
                      <span className="text-muted-foreground">
                        {format(
                          new Date(event.created_at),
                          "MMM d, yyyy, h:mm a",
                        )}
                      </span>
                    </div>
                    <p className="mt-1 break-words">{event.reason}</p>
                    <p className="mt-1 break-all text-muted-foreground">
                      {titleCase(event.actor_role)} · actor{" "}
                      <span className="font-mono">
                        {event.actor_id.slice(0, 12)}…
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </article>
          ))}
      </div>
    </CardContent>
  </Card>
);

const AgreementFormSheet = ({
  mode,
  account,
  saving,
  onOpenChange,
  onSave,
}: {
  mode: FormMode | null;
  account: BillingAccount;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (request: BillingAgreementDraftRequest) => Promise<void>;
}) => {
  const agreement = mode && mode.kind !== "create" ? mode.agreement : null;
  const initialValues = agreement
    ? agreementToFormValues(agreement)
    : EMPTY_BILLING_AGREEMENT_FORM;
  const isAmendment = mode?.kind === "amend";
  return (
    <Sheet open={Boolean(mode)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-dvh w-full max-w-none overflow-y-auto sm:max-w-3xl"
      >
        <SheetHeader className="border-b">
          <SheetTitle>
            {isAmendment
              ? "Create agreement amendment draft"
              : agreement
                ? "Edit agreement draft"
                : "Create agreement draft"}
          </SheetTitle>
          <SheetDescription>
            {isAmendment
              ? `The active agreement for ${account.customer_name} remains unchanged until this new draft is reviewed and activated.`
              : `Enter complete structured terms for ${account.customer_name}. Financial values are parsed exactly before saving.`}
          </SheetDescription>
        </SheetHeader>
        <div className="p-4 md:p-6">
          {mode ? (
            <BillingAgreementForm
              key={`${mode.kind}-${agreement?.version_id ?? "new"}`}
              account_id={account.id}
              initialValues={initialValues}
              agreement_id={agreement?.agreement_id}
              version_id={
                mode.kind === "edit" ? agreement?.version_id : undefined
              }
              saving={saving}
              submitLabel={
                isAmendment ? "Save amendment draft" : "Save agreement draft"
              }
              onCancel={() => onOpenChange(false)}
              onSave={onSave}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
};

const Detail = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="min-w-0">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-words">{children}</dd>
  </div>
);

const titleCase = (value: string) =>
  value
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const formatDate = (value: string) =>
  format(new Date(`${value}T00:00:00.000Z`), "MMM d, yyyy");

const isAuthorizationError = (error: unknown) =>
  error instanceof Error && /NOT_AUTHORIZED|ACCESS_DENIED/.test(error.message);
