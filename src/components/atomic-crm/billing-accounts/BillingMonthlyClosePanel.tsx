/* eslint-disable react-refresh/only-export-components */
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import {
  useCanAccess,
  useDataProvider,
  useGetIdentity,
  useGetManyReference,
  useNotify,
} from "ra-core";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import { formatUsdMoney } from "../financial/exactMoney";
import type {
  BillingCalculationApproveRequest,
  BillingCalculationAdjustmentRequest,
  BillingCalculationPreview as BillingCalculationPreviewValue,
  BillingRevenueCloseRequest,
  BillingRevenuePeriodSummary,
  BillingRevenueReviewRequest,
  BillingRevenueSubmissionRequest,
  CrmDataProvider,
} from "../providers/types";
import type {
  BillingAccount,
  BillingAgreementVersion,
  BillingCalculation,
  BillingEvidenceMetadata,
  BillingRevenueReviewOutcome,
} from "../types";
import { BillingCalculationPreview } from "./BillingCalculationPreview";
import { BillingRevenueRevisionForm } from "./BillingRevenueRevisionForm";

const submissionLabels: Record<BillingRevenueReviewOutcome, string> = {
  accept: "Accepted",
  request_correction: "Correction requested",
  reject: "Rejected",
  hold: "Held",
};

const periodBadgeClasses = {
  open: "border-slate-500/30 bg-slate-50 text-slate-800",
  attention: "border-amber-600/30 bg-amber-50 text-amber-800",
  success: "border-emerald-600/30 bg-emerald-50 text-emerald-800",
} as const;

export const submissionStatusLabel = (
  outcome: BillingRevenueReviewOutcome | undefined,
) => (outcome ? submissionLabels[outcome] : "Submitted");

export const revenuePeriodStatusLabel = (
  summary: BillingRevenuePeriodSummary,
) => {
  if (summary.period.state === "closed") {
    return summary.close_snapshot?.close_mode === "minimum_only"
      ? "Closed on minimum"
      : "Closed";
  }
  const latestReview = summary.reviews.at(-1);
  if (
    latestReview?.outcome === "accept" &&
    !summary.exceptions.some((exception) => exception.status === "open")
  ) {
    return "Ready to close";
  }
  if (summary.submissions.length > 0) return "Under review";
  return "Needs evidence";
};

export const canApproveMinimumClose = (
  summary: BillingRevenuePeriodSummary,
  agreement: BillingAgreementVersion | null,
  now: string = new Date().toISOString(),
) =>
  summary.period.state === "open" &&
  Boolean(agreement) &&
  agreement?.state === "active" &&
  agreement.rules.missing_report_policy === "minimum_only" &&
  Date.parse(now) >= Date.parse(summary.period.submission_deadline_at) &&
  summary.reviews.at(-1)?.outcome !== "accept" &&
  summary.exceptions.some((exception) => exception.status === "open");

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

type ReviewAction = Exclude<BillingRevenueReviewOutcome, "accept"> | "accept";
type CloseMode = "accepted_evidence" | "minimum_only";

export const BillingMonthlyClosePanel = ({
  account,
}: {
  account: BillingAccount;
}) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const online = useOnlineStatus();
  const identity = useGetIdentity();
  const agreementQuery = useQuery({
    queryKey: ["billingMonthlyCloseAgreements", account.id],
    queryFn: () =>
      dataProvider.listBillingAgreements({ account_id: account.id }),
    enabled: online,
  });
  const periodQuery = useQuery({
    queryKey: ["billingRevenuePeriods", account.id],
    queryFn: () =>
      dataProvider.listBillingRevenuePeriods({
        account_id: account.id,
        page: 1,
        per_page: 24,
      }),
    enabled: online,
  });
  const evidenceQuery = useGetManyReference<BillingEvidenceMetadata>(
    "billing_evidence_support_safe",
    {
      target: "account_id",
      id: account.id,
      pagination: { page: 1, perPage: 100 },
      sort: { field: "created_at", order: "DESC" },
    },
    { enabled: online },
  );
  const manageAccess = useCanAccess({
    action: "manage",
    resource: "billing_revenue_periods_support_safe",
    record: { account_id: account.id },
  });
  const reviewAccess = useCanAccess({
    action: "review",
    resource: "billing_revenue_periods_support_safe",
    record: { account_id: account.id },
  });
  const calculationReadAccess = useCanAccess({
    action: "list",
    resource: "billing_calculations_support_safe",
    record: { account_id: account.id },
  });
  const calculationAccess = useCanAccess({
    action: "calculate",
    resource: "billing_calculations_support_safe",
    record: { account_id: account.id },
  });
  const calculationApproveAccess = useCanAccess({
    action: "approve",
    resource: "billing_calculations_support_safe",
    record: { account_id: account.id },
  });
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);
  const [closeMode, setCloseMode] = useState<CloseMode | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BillingCalculationPreviewValue | null>(
    null,
  );
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);

  const periods = periodQuery.data?.data ?? [];
  const current =
    periods.find((summary) => summary.period.id === selectedPeriodId) ??
    periods[0] ??
    null;
  const activeAgreement =
    agreementQuery.data?.data.find(
      (agreement) => agreement.state === "active",
    ) ?? null;
  const latestReview = current?.reviews.at(-1) ?? null;
  const openExceptions =
    current?.exceptions.filter((exception) => exception.status === "open") ??
    [];
  const canManage = manageAccess.canAccess === true;
  const canReview = reviewAccess.canAccess === true;
  const acceptedCloseEligible =
    current?.period.state === "open" &&
    latestReview?.outcome === "accept" &&
    openExceptions.length === 0;
  const minimumCloseEligible = current
    ? canApproveMinimumClose(current, activeAgreement)
    : false;
  const calculationQuery = useQuery({
    queryKey: ["billingCalculations", account.id],
    queryFn: () =>
      dataProvider.listBillingCalculations({
        account_id: account.id,
        page: 1,
        per_page: 100,
      }),
    enabled: online && calculationReadAccess.canAccess === true,
  });
  const currentCalculation = current?.close_snapshot
    ? (calculationQuery.data?.data.find(
        (calculation) =>
          calculation.close_snapshot_id === current.close_snapshot?.id,
      ) ?? null)
    : null;
  const currentAdjustments = currentCalculation
    ? (calculationQuery.data?.adjustments.filter(
        (adjustment) =>
          adjustment.original_calculation_id === currentCalculation.id,
      ) ?? [])
    : [];
  const lineageQuery = useQuery({
    queryKey: ["billingCalculationLineage", account.id, currentCalculation?.id],
    queryFn: () =>
      dataProvider.getBillingCalculationLineage({
        account_id: account.id,
        calculation_id: currentCalculation?.id ?? "",
      }),
    enabled:
      online &&
      currentCalculation?.status === "approved" &&
      calculationReadAccess.canAccess === true,
  });
  const lateSubmission = current?.close_snapshot
    ? [...current.submissions]
        .reverse()
        .find(
          (submission) =>
            submission.id !== current.close_snapshot?.submission_id,
        )
    : undefined;
  const lateReview = lateSubmission
    ? [...(current?.reviews ?? [])]
        .reverse()
        .find(
          (review) =>
            review.submission_id === lateSubmission.id &&
            review.outcome === "accept",
        )
    : undefined;
  const adjustmentPending = Boolean(
    currentCalculation?.status === "approved" &&
      lateSubmission &&
      lateReview &&
      currentAdjustments.length === 0,
  );

  const refresh = async () => {
    const refreshes = [
      periodQuery.refetch(),
      agreementQuery.refetch(),
      evidenceQuery.refetch(),
    ];
    if (calculationReadAccess.canAccess === true) {
      refreshes.push(calculationQuery.refetch());
    }
    await Promise.all(refreshes);
  };

  const runAction = async (label: string, action: () => Promise<void>) => {
    if (pendingAction) return;
    setPendingAction(label);
    setActionError(null);
    try {
      await action();
      await refresh();
    } catch (error) {
      await periodQuery.refetch();
      setActionError(
        String(error).includes("STALE")
          ? "This preview is no longer current. Refresh the period and review the new calculation before approving."
          : "The action could not be completed. Refresh the account and review the reason before trying again.",
      );
      throw error;
    } finally {
      setPendingAction(null);
    }
  };

  const createPeriod = async () => {
    if (!activeAgreement) return;
    try {
      await runAction("create-period", async () => {
        const response = await dataProvider.ensureBillingRevenuePeriod({
          account_id: account.id,
          agreement_version_id: activeAgreement.version_id,
          period_month: new Date().toISOString().slice(0, 7),
          command_key: `revenue-period-${Date.now()}`,
        });
        setSelectedPeriodId(response.period_id);
        notify("Revenue period is ready for evidence review.", {
          type: "success",
        });
      });
    } catch {
      // The section alert owns safe recovery copy.
    }
  };

  const submitRevision = async (request: BillingRevenueSubmissionRequest) => {
    try {
      await runAction("submit-revision", async () => {
        await dataProvider.submitBillingRevenueRevision(request);
        notify("Revenue revision submitted for review.", { type: "success" });
      });
      setRevisionOpen(false);
    } catch {
      throw new Error("REVENUE_FORM_INVALID");
    }
  };

  const submitReview = async (request: BillingRevenueReviewRequest) => {
    try {
      await runAction("review-revision", async () => {
        await dataProvider.reviewBillingRevenueRevision(request);
        notify(`${submissionStatusLabel(request.outcome)} review recorded.`, {
          type: "success",
        });
      });
      setReviewAction(null);
    } catch {
      throw new Error("REVENUE_REVIEW_FAILED");
    }
  };

  const closePeriod = async (request: BillingRevenueCloseRequest) => {
    try {
      await runAction("close-period", async () => {
        await dataProvider.closeBillingRevenuePeriod(request);
        notify(
          request.close_mode === "minimum_only"
            ? "Minimum-only close recorded with the evidence exception open."
            : "Revenue period closed from accepted evidence.",
          { type: "success" },
        );
      });
      setCloseMode(null);
    } catch {
      throw new Error("REVENUE_CLOSE_FAILED");
    }
  };

  const previewCalculation = async () => {
    if (!current?.close_snapshot) return;
    try {
      await runAction("preview-calculation", async () => {
        const response = await dataProvider.previewBillingCalculation({
          account_id: account.id,
          close_snapshot_id: current.close_snapshot?.id ?? "",
        });
        setPreview(response);
        notify("Exact calculation preview refreshed.", { type: "success" });
      });
    } catch {
      // The section alert owns safe stale/recovery copy.
    }
  };

  const createCalculation = async () => {
    if (!preview || preview.anomalies.some((anomaly) => anomaly.blocking))
      return;
    try {
      await runAction("create-calculation", async () => {
        await dataProvider.createBillingCalculation({
          account_id: account.id,
          close_snapshot_id: preview.close_snapshot_id,
          close_policy_version: preview.close_policy_version,
          preview_fingerprint: preview.preview_fingerprint,
          command_key: `calculation-create-${Date.now()}`,
        });
        notify("Calculation snapshot created and ready for approval.", {
          type: "success",
        });
      });
    } catch {
      // The section alert owns safe stale/recovery copy.
    }
  };

  const approveCalculation = async (
    request: BillingCalculationApproveRequest,
  ) => {
    await runAction("approve-calculation", async () => {
      await dataProvider.approveBillingCalculation(request);
      notify("Calculation approval recorded.", { type: "success" });
    });
    setApprovalOpen(false);
  };

  const createAdjustment = async (
    request: BillingCalculationAdjustmentRequest,
  ) => {
    await runAction("create-adjustment", async () => {
      await dataProvider.createBillingAdjustmentCalculation(request);
      notify("Linked late-evidence calculation treatment recorded.", {
        type: "success",
      });
    });
    setAdjustmentOpen(false);
  };

  const queryError = periodQuery.error ?? agreementQuery.error;

  return (
    <section
      aria-labelledby="billing-monthly-close-heading"
      data-slot="billing-account-monthly-close"
      className="min-w-0 md:col-span-2"
    >
      <div className="mb-4 space-y-1">
        <h2
          id="billing-monthly-close-heading"
          className="text-xl font-semibold"
        >
          Monthly close
        </h2>
        <p className="text-sm text-muted-foreground">
          Evidence status, exceptions, exact calculation comparison, and
          approval for this billing account.
        </p>
      </div>

      {!online ? (
        <Alert className="border-amber-500 bg-amber-50 text-amber-950">
          <AlertTitle>Monthly close details are offline</AlertTitle>
          <AlertDescription>
            Reconnect to view or change agreement, evidence, and calculation
            details.
          </AlertDescription>
        </Alert>
      ) : periodQuery.isPending || agreementQuery.isPending ? (
        <MonthlyCloseLoading />
      ) : queryError ? (
        <MonthlyCloseError
          denied={isAuthorizationError(queryError)}
          onRetry={() => void refresh()}
        />
      ) : !current ? (
        <MonthlyCloseEmpty
          canCreate={canManage && Boolean(activeAgreement)}
          hasAgreement={Boolean(activeAgreement)}
          pending={pendingAction === "create-period"}
          onCreate={() => void createPeriod()}
        />
      ) : (
        <div className="min-w-0 space-y-6 rounded-lg border bg-white p-4 md:p-6 dark:bg-[#111113]">
          {actionError ? (
            <Alert variant="destructive" role="alert">
              <AlertTitle>Monthly close action stopped</AlertTitle>
              <AlertDescription className="space-y-4">
                <p>{actionError}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => void refresh()}
                >
                  <RefreshCw aria-hidden="true" className="h-4 w-4" />
                  Refresh monthly close
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <PeriodSummary
            summary={current}
            periods={periods}
            onSelect={setSelectedPeriodId}
          />

          <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
            <RevisionEvidenceCard
              summary={current}
              canManage={canManage}
              canReview={canReview}
              pending={Boolean(pendingAction)}
              onAddRevision={() => setRevisionOpen(true)}
              onReview={setReviewAction}
            />
            <ExceptionCard
              summary={current}
              canReview={canReview}
              pending={Boolean(pendingAction)}
              onRecordMissingEvidence={() => setReviewAction("hold")}
            />
          </div>

          {preview ? (
            <BillingCalculationPreview
              preview={preview}
              calculation={currentCalculation}
              lineage={lineageQuery.data ?? null}
              adjustments={currentAdjustments}
              adjustmentPending={adjustmentPending}
            />
          ) : (
            <CalculationNotReady closed={Boolean(current.close_snapshot)} />
          )}

          <div className="flex flex-wrap justify-end gap-3">
            {canManage && acceptedCloseEligible ? (
              <Button
                type="button"
                className="h-11"
                disabled={Boolean(pendingAction)}
                onClick={() => setCloseMode("accepted_evidence")}
              >
                Close revenue period
              </Button>
            ) : null}
            {canManage && minimumCloseEligible ? (
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={Boolean(pendingAction)}
                onClick={() => setCloseMode("minimum_only")}
              >
                Approve minimum close
              </Button>
            ) : null}
            {calculationAccess.canAccess === true && current.close_snapshot ? (
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={Boolean(pendingAction)}
                onClick={() => void previewCalculation()}
              >
                Preview calculation
              </Button>
            ) : null}
            {calculationAccess.canAccess === true &&
            preview &&
            !currentCalculation &&
            !preview.anomalies.some((anomaly) => anomaly.blocking) ? (
              <Button
                type="button"
                className="h-11"
                disabled={Boolean(pendingAction)}
                onClick={() => void createCalculation()}
              >
                Create calculation
              </Button>
            ) : null}
            {calculationApproveAccess.canAccess === true &&
            preview &&
            currentCalculation?.status === "created" &&
            !preview.anomalies.some((anomaly) => anomaly.blocking) ? (
              <Button
                type="button"
                className="h-11"
                disabled={Boolean(pendingAction)}
                onClick={() => setApprovalOpen(true)}
              >
                Approve calculation
              </Button>
            ) : null}
            {calculationAccess.canAccess === true && adjustmentPending ? (
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={Boolean(pendingAction)}
                onClick={() => setAdjustmentOpen(true)}
              >
                Calculate linked adjustment
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <Sheet open={revisionOpen} onOpenChange={setRevisionOpen}>
        <SheetContent
          side="right"
          className="h-dvh w-full max-w-2xl overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader>
            <SheetTitle>Add revenue revision</SheetTitle>
            <SheetDescription>
              Enter exact revenue values and attach clean evidence. Prior
              revisions remain unchanged.
            </SheetDescription>
          </SheetHeader>
          {current ? (
            <div className="px-4 pb-6">
              <BillingRevenueRevisionForm
                accountId={account.id}
                periodId={current.period.id}
                evidence={evidenceQuery.data ?? []}
                pending={pendingAction === "submit-revision"}
                onSave={submitRevision}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {current && reviewAction ? (
        <RevenueReviewDialog
          open
          action={reviewAction}
          accountId={account.id}
          summary={current}
          defaultOwnerId={String(identity.data?.id ?? "")}
          pending={pendingAction === "review-revision"}
          onOpenChange={(open) => !open && setReviewAction(null)}
          onConfirm={submitReview}
        />
      ) : null}

      {current && closeMode && latestReview ? (
        <RevenueCloseDialog
          open
          mode={closeMode}
          accountId={account.id}
          summary={current}
          reviewEventId={latestReview.id}
          pending={pendingAction === "close-period"}
          onOpenChange={(open) => !open && setCloseMode(null)}
          onConfirm={closePeriod}
        />
      ) : null}

      {preview && currentCalculation && approvalOpen ? (
        <CalculationApprovalDialog
          open
          accountId={account.id}
          preview={preview}
          calculation={currentCalculation}
          pending={pendingAction === "approve-calculation"}
          onOpenChange={setApprovalOpen}
          onConfirm={approveCalculation}
        />
      ) : null}

      {currentCalculation && lateSubmission && lateReview && adjustmentOpen ? (
        <CalculationAdjustmentDialog
          open
          accountId={account.id}
          calculation={currentCalculation}
          lateSubmissionId={lateSubmission.id}
          lateReviewEventId={lateReview.id}
          pending={pendingAction === "create-adjustment"}
          onOpenChange={setAdjustmentOpen}
          onConfirm={createAdjustment}
        />
      ) : null}
    </section>
  );
};

const MonthlyCloseLoading = () => (
  <div
    aria-label="Loading monthly close"
    className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2"
  >
    <Skeleton className="h-64 w-full" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const MonthlyCloseError = ({
  denied,
  onRetry,
}: {
  denied: boolean;
  onRetry: () => void;
}) => (
  <Alert variant="destructive" role="alert">
    <AlertTitle>
      {denied ? "Monthly close access denied" : "Monthly close unavailable"}
    </AlertTitle>
    <AlertDescription className="space-y-4">
      <p>
        {denied
          ? "You do not have access to monthly close details for this account."
          : "Monthly close details could not be loaded. Check the connection and refresh this section."}
      </p>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        onClick={onRetry}
      >
        <RefreshCw aria-hidden="true" className="h-4 w-4" />
        Refresh monthly close
      </Button>
    </AlertDescription>
  </Alert>
);

const MonthlyCloseEmpty = ({
  canCreate,
  hasAgreement,
  pending,
  onCreate,
}: {
  canCreate: boolean;
  hasAgreement: boolean;
  pending: boolean;
  onCreate: () => void;
}) => (
  <Card className="border-dashed py-0">
    <CardContent className="space-y-4 p-6">
      <div>
        <h3 className="text-lg font-semibold">
          No revenue period for this month
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Create the period from the active agreement to begin evidence review.
        </p>
      </div>
      {!hasAgreement ? (
        <p className="text-sm text-amber-700">
          Activate an agreement before creating a revenue period.
        </p>
      ) : null}
      {canCreate ? (
        <Button
          type="button"
          className="h-11"
          disabled={pending}
          onClick={onCreate}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {pending
            ? "Create revenue period · Working"
            : "Create revenue period"}
        </Button>
      ) : null}
    </CardContent>
  </Card>
);

const PeriodSummary = ({
  summary,
  periods,
  onSelect,
}: {
  summary: BillingRevenuePeriodSummary;
  periods: readonly BillingRevenuePeriodSummary[];
  onSelect: (periodId: string) => void;
}) => {
  const label = revenuePeriodStatusLabel(summary);
  const badgeClass =
    label === "Closed" || label === "Ready to close"
      ? periodBadgeClasses.success
      : label === "Open"
        ? periodBadgeClasses.open
        : periodBadgeClasses.attention;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold">Selected revenue period</h3>
          <Badge variant="outline" className={badgeClass}>
            {label}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {formatDate(summary.period.period_start)} to{" "}
          {formatDate(summary.period.period_end)} · {summary.period.timezone}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Submission deadline{" "}
          {format(
            new Date(summary.period.submission_deadline_at),
            "MMM d, yyyy, h:mm a",
          )}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="billing-period-selector">Revenue period</Label>
        <select
          id="billing-period-selector"
          className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          value={summary.period.id}
          onChange={(event) => onSelect(event.target.value)}
        >
          {periods.map((period) => (
            <option key={period.period.id} value={period.period.id}>
              {formatDate(period.period.period_start)} ·{" "}
              {revenuePeriodStatusLabel(period)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

const RevisionEvidenceCard = ({
  summary,
  canManage,
  canReview,
  pending,
  onAddRevision,
  onReview,
}: {
  summary: BillingRevenuePeriodSummary;
  canManage: boolean;
  canReview: boolean;
  pending: boolean;
  onAddRevision: () => void;
  onReview: (action: ReviewAction) => void;
}) => {
  const latest = summary.submissions.at(-1);
  const latestReview = latest
    ? [...summary.reviews]
        .reverse()
        .find((review) => review.submission_id === latest.id)
    : undefined;
  return (
    <Card className="min-w-0 bg-[#fafafa] py-0 dark:bg-[#1c1c1e]">
      <CardContent className="space-y-4 p-4 md:p-6">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">
              Revenue revisions and evidence
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Immutable exact submissions, provenance, evidence hashes, and
              reviews.
            </p>
          </div>
          {canManage && summary.period.state === "open" ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              data-critical-phase4-revenue-action
              disabled={pending}
              onClick={onAddRevision}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Add revenue revision
            </Button>
          ) : null}
        </div>

        {summary.submissions.length ? (
          <div className="grid min-w-0 grid-cols-1 gap-3">
            {[...summary.submissions]
              .sort(
                (left, right) => right.revision_number - left.revision_number,
              )
              .map((submission) => {
                const review = [...summary.reviews]
                  .reverse()
                  .find(
                    (candidate) => candidate.submission_id === submission.id,
                  );
                return (
                  <article
                    key={submission.id}
                    className="min-w-0 rounded-lg border bg-white p-4 dark:bg-[#111113]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-semibold">
                        Revision {submission.revision_number}
                      </h4>
                      <Badge variant="outline">
                        {submissionStatusLabel(review?.outcome)}
                      </Badge>
                    </div>
                    <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                      <Detail label="Gross revenue">
                        <Money value={submission.gross_amount} />
                      </Detail>
                      <Detail label="Excluded revenue">
                        <Money value={submission.excluded_amount} />
                      </Detail>
                      <Detail label="Commissionable revenue">
                        <Money value={submission.commissionable_amount} />
                      </Detail>
                      <Detail label="Provenance">
                        {titleCase(submission.provenance_kind)} ·{" "}
                        <span className="break-all">
                          {submission.provenance_source_id}
                        </span>
                      </Detail>
                      <Detail label="Submitted by">
                        {titleCase(submission.submitter_role)} · actor{" "}
                        <span className="break-all font-mono">
                          {submission.submitter_id.slice(0, 12)}…
                        </span>
                      </Detail>
                      <Detail label="Submitted at">
                        {format(
                          new Date(submission.submitted_at),
                          "MMM d, yyyy, h:mm a",
                        )}
                      </Detail>
                    </dl>
                    <p className="mt-3 break-words text-sm">
                      {submission.attestation_text}
                    </p>
                    <div className="mt-3 space-y-2 border-t pt-3 text-sm">
                      {submission.evidence.map((evidence) => (
                        <p key={evidence.evidence_id} className="break-all">
                          Evidence {evidence.ordinal}:{" "}
                          <span className="font-mono">
                            {evidence.evidence_id}
                          </span>{" "}
                          · hash{" "}
                          <span className="font-mono">
                            {evidence.captured_sha256.slice(0, 16)}…
                          </span>
                        </p>
                      ))}
                      <p className="break-all text-muted-foreground">
                        Request fingerprint{" "}
                        <span className="font-mono">
                          {submission.request_fingerprint.slice(0, 16)}…
                        </span>
                      </p>
                    </div>
                    {review ? (
                      <div className="mt-3 rounded-md border p-3 text-sm">
                        <p className="font-medium">
                          {submissionStatusLabel(review.outcome)}
                        </p>
                        <p className="mt-1 break-words">{review.reason}</p>
                        <p className="mt-1 text-muted-foreground">
                          {titleCase(review.reviewer_role)} ·{" "}
                          {format(
                            new Date(review.created_at),
                            "MMM d, yyyy, h:mm a",
                          )}
                        </p>
                      </div>
                    ) : null}
                  </article>
                );
              })}
          </div>
        ) : (
          <p className="rounded-lg border bg-white p-4 text-sm text-muted-foreground dark:bg-[#111113]">
            No revenue revision has been submitted for this period.
          </p>
        )}

        {canReview && summary.period.state === "open" && latest ? (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {(
              [
                ["accept", "Accept"],
                ["request_correction", "Request correction"],
                ["reject", "Reject"],
                ["hold", "Hold"],
              ] as const
            ).map(([action, label]) => (
              <Button
                key={action}
                type="button"
                variant={action === "accept" ? "default" : "outline"}
                className="h-11"
                disabled={pending || Boolean(latestReview)}
                onClick={() => onReview(action)}
              >
                {label}
              </Button>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

const ExceptionCard = ({
  summary,
  canReview,
  pending,
  onRecordMissingEvidence,
}: {
  summary: BillingRevenuePeriodSummary;
  canReview: boolean;
  pending: boolean;
  onRecordMissingEvidence: () => void;
}) => {
  const open = summary.exceptions.filter(
    (exception) => exception.status === "open",
  );
  return (
    <Card className="min-w-0 py-0">
      <CardContent className="space-y-4 p-4 md:p-6">
        <h3 className="text-lg font-semibold">Evidence exceptions</h3>
        {open.length || summary.submissions.length === 0 ? (
          <Alert className="border-amber-500 bg-amber-50 text-amber-950">
            <AlertTitle>Revenue evidence is unresolved</AlertTitle>
            <AlertDescription>
              Assign the exception and obtain verifiable evidence. The system
              will not estimate revenue.
            </AlertDescription>
          </Alert>
        ) : null}
        {summary.exceptions.length ? (
          <div className="grid grid-cols-1 gap-3">
            {[...summary.exceptions].reverse().map((exception) => (
              <article
                key={exception.id}
                className="rounded-lg border p-4 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-semibold">
                    {titleCase(exception.reason_code)}
                  </h4>
                  <Badge variant="outline">
                    {exception.status === "open" ? "Open" : "Resolved"}
                  </Badge>
                </div>
                <dl className="mt-3 grid gap-3">
                  <Detail label="Owner">
                    <span className="break-all font-mono">
                      {exception.owner_id}
                    </span>
                  </Detail>
                  <Detail label="Amount at risk">
                    {exception.amount_at_risk ? (
                      <Money value={exception.amount_at_risk} />
                    ) : (
                      "Not specified"
                    )}
                  </Detail>
                  <Detail label="Next action">{exception.next_action}</Detail>
                  <Detail label="Due">
                    {format(new Date(exception.due_at), "MMM d, yyyy, h:mm a")}
                  </Detail>
                  {exception.resolution_reason ? (
                    <Detail label="Resolution">
                      {exception.resolution_reason}
                    </Detail>
                  ) : null}
                </dl>
              </article>
            ))}
          </div>
        ) : null}
        {canReview &&
        summary.period.state === "open" &&
        summary.submissions.length === 0 &&
        summary.reviews.length === 0 ? (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={pending}
            onClick={onRecordMissingEvidence}
          >
            Record missing evidence hold
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
};

const CalculationNotReady = ({ closed }: { closed: boolean }) => (
  <Card className="min-w-0 py-0">
    <CardContent className="space-y-2 p-4 md:p-6">
      <h3 className="text-lg font-semibold">Calculation is not ready</h3>
      <p className="text-sm text-muted-foreground">
        {closed
          ? "Preview the exact calculation and review its policy checks before approval."
          : "Resolve the listed agreement, evidence, or close-policy requirements first."}
      </p>
    </CardContent>
  </Card>
);

const RevenueReviewDialog = ({
  open,
  action,
  accountId,
  summary,
  defaultOwnerId,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  action: ReviewAction;
  accountId: string;
  summary: BillingRevenuePeriodSummary;
  defaultOwnerId: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (request: BillingRevenueReviewRequest) => Promise<void>;
}) => {
  const latest = summary.submissions.at(-1) ?? null;
  const [reason, setReason] = useState("");
  const [ownerId, setOwnerId] = useState(defaultOwnerId);
  const [nextAction, setNextAction] = useState(
    action === "request_correction"
      ? "Obtain a corrected revenue revision and clean evidence"
      : "Review and resolve the revenue evidence exception",
  );
  const [error, setError] = useState<string | null>(null);
  const actionLabel =
    action === "accept" ? "Accept" : submissionStatusLabel(action);

  const confirm = async () => {
    if (pending) return;
    const reviewReason =
      reason.trim() ||
      (action === "accept" ? "Accepted reviewed revenue evidence" : "");
    if (
      !reviewReason ||
      (action !== "accept" && (!ownerId.trim() || !nextAction.trim()))
    ) {
      setError("Enter the required reason, exception owner, and next action.");
      return;
    }
    const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const reasonCode =
      action === "request_correction"
        ? "UNVERIFIED_EVIDENCE"
        : action === "reject"
          ? "CONFLICTING_EVIDENCE"
          : "HELD_EVIDENCE";
    const request: BillingRevenueReviewRequest =
      action === "accept"
        ? {
            account_id: accountId,
            period_id: summary.period.id,
            submission_id: latest?.id ?? "",
            outcome: "accept",
            reason_code: "REVENUE_ACCEPTED",
            reason: reviewReason,
            exception: null,
            command_key: `revenue-review-${Date.now()}`,
          }
        : {
            account_id: accountId,
            period_id: summary.period.id,
            submission_id: latest?.id ?? null,
            outcome: action,
            reason_code: reasonCode,
            reason: reviewReason,
            exception: {
              kind: reasonCode,
              owner_id: ownerId.trim(),
              next_action: nextAction.trim(),
              due_at: dueAt,
              amount_at_risk: latest?.commissionable_amount ?? null,
            },
            command_key: `revenue-review-${Date.now()}`,
          };
    try {
      await onConfirm(request);
    } catch {
      setError(
        "The action could not be completed. Refresh the account and review the reason before trying again.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{actionLabel} revenue revision?</DialogTitle>
          <DialogDescription>
            Record the immutable review outcome, reason, actor, and evidence
            fingerprint for revision {latest?.revision_number ?? "missing"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="revenue-review-reason">Review reason</Label>
            <Textarea
              id="revenue-review-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          {action !== "accept" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="revenue-exception-owner">Exception owner</Label>
                <Input
                  id="revenue-exception-owner"
                  className="h-11"
                  value={ownerId}
                  onChange={(event) => setOwnerId(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="revenue-next-action">Next action</Label>
                <Textarea
                  id="revenue-next-action"
                  value={nextAction}
                  onChange={(event) => setNextAction(event.target.value)}
                />
              </div>
            </>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={pending}
            onClick={() => void confirm()}
          >
            {pending ? `${actionLabel} · Working` : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const RevenueCloseDialog = ({
  open,
  mode,
  accountId,
  summary,
  reviewEventId,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  mode: CloseMode;
  accountId: string;
  summary: BillingRevenuePeriodSummary;
  reviewEventId: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (request: BillingRevenueCloseRequest) => Promise<void>;
}) => {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const minimum = mode === "minimum_only";
  const confirm = async () => {
    if (pending || !reason.trim()) {
      setError("Enter a close reason.");
      return;
    }
    try {
      await onConfirm({
        account_id: accountId,
        period_id: summary.period.id,
        close_mode: mode,
        review_event_id: reviewEventId,
        reason: reason.trim(),
        command_key: `revenue-close-${Date.now()}`,
      });
    } catch {
      setError(
        "The action could not be completed. Refresh the account and review the reason before trying again.",
      );
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {minimum ? "Approve minimum-only close?" : "Close revenue period?"}
          </DialogTitle>
          <DialogDescription>
            {minimum
              ? "This keeps the evidence exception open. Accepted late evidence will create a linked true-up or credit calculation without changing this close."
              : "Freeze the accepted revenue revision, review, evidence fingerprints, and active agreement for this period."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm">
            {formatDate(summary.period.period_start)} to{" "}
            {formatDate(summary.period.period_end)} · review event{" "}
            <span className="font-mono">{reviewEventId}</span>
          </p>
          <div className="space-y-2">
            <Label htmlFor="revenue-close-reason">Close reason</Label>
            <Textarea
              id="revenue-close-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={pending}
            onClick={() => void confirm()}
          >
            {minimum ? "Approve minimum close" : "Close revenue period"}
            {pending ? " · Working" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CalculationApprovalDialog = ({
  open,
  accountId,
  preview,
  calculation,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  accountId: string;
  preview: BillingCalculationPreviewValue;
  calculation: BillingCalculation;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (request: BillingCalculationApproveRequest) => Promise<void>;
}) => {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    if (pending || !reason.trim()) {
      setError("Enter an approval reason.");
      return;
    }
    try {
      await onConfirm({
        account_id: accountId,
        calculation_id: calculation.id,
        mode: "manual",
        close_policy_version: preview.close_policy_version,
        preview_fingerprint: preview.preview_fingerprint,
        reason: reason.trim(),
        command_key: `calculation-approve-${Date.now()}`,
      });
    } catch (error) {
      setError(
        String(error).includes("STALE")
          ? "This preview is no longer current. Refresh the period and review the new calculation before approving."
          : "The action could not be completed. Refresh the account and review the reason before trying again.",
      );
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve calculation?</DialogTitle>
          <DialogDescription>
            Confirm the exact result, agreement version, period, input
            fingerprint, and manual approval context.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 text-sm">
          <Detail label="Final amount">
            <Money value={preview.final_amount} />
          </Detail>
          <Detail label="Agreement version">
            <span className="break-all font-mono">
              {preview.agreement_version_id}
            </span>
          </Detail>
          <Detail label="Revenue period">
            {formatDate(preview.period_start)} to{" "}
            {formatDate(preview.period_end)}
          </Detail>
          <Detail label="Input fingerprint">
            <span className="font-mono">
              {preview.close_input_fingerprint.slice(0, 16)}…
            </span>
          </Detail>
          <Detail label="Approval mode">Manual approval</Detail>
        </dl>
        <div className="space-y-2">
          <Label htmlFor="calculation-approval-reason">Approval reason</Label>
          <Textarea
            id="calculation-approval-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={pending}
            onClick={() => void confirm()}
          >
            Approve calculation{pending ? " · Working" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CalculationAdjustmentDialog = ({
  open,
  accountId,
  calculation,
  lateSubmissionId,
  lateReviewEventId,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  accountId: string;
  calculation: BillingCalculation;
  lateSubmissionId: string;
  lateReviewEventId: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (request: BillingCalculationAdjustmentRequest) => Promise<void>;
}) => {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    if (pending || !reason.trim()) {
      setError("Enter the reason for calculating this linked adjustment.");
      return;
    }
    try {
      await onConfirm({
        account_id: accountId,
        original_calculation_id: calculation.id,
        late_submission_id: lateSubmissionId,
        late_review_event_id: lateReviewEventId,
        reason: reason.trim(),
        command_key: `calculation-adjustment-${Date.now()}`,
      });
    } catch {
      setError(
        "The action could not be completed. Refresh the account and review the reason before trying again.",
      );
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Calculate linked adjustment?</DialogTitle>
          <DialogDescription>
            Compare accepted late evidence with the immutable original result.
            The agreement policy determines true-up, credit candidate, or held
            contract review treatment.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 text-sm">
          <Detail label="Original calculation">
            <span className="break-all font-mono">{calculation.id}</span>
          </Detail>
          <Detail label="Late submission">
            <span className="break-all font-mono">{lateSubmissionId}</span>
          </Detail>
          <Detail label="Late review event">
            <span className="font-mono">{lateReviewEventId}</span>
          </Detail>
        </dl>
        <div className="space-y-2">
          <Label htmlFor="calculation-adjustment-reason">
            Adjustment reason
          </Label>
          <Textarea
            id="calculation-adjustment-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={pending}
            onClick={() => void confirm()}
          >
            Calculate linked adjustment{pending ? " · Working" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <dd className="mt-1 min-w-0 break-words">{children}</dd>
  </div>
);

const Money = ({ value }: { value: Parameters<typeof formatUsdMoney>[0] }) => (
  <span className="tabular-nums">{formatUsdMoney(value)}</span>
);

const formatDate = (value: string) =>
  format(new Date(`${value}T00:00:00.000Z`), "MMM d, yyyy");

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const isAuthorizationError = (error: unknown) =>
  String(error).includes("NOT_AUTHORIZED") || String(error).includes("denied");
