/* eslint-disable react-refresh/only-export-components */
import { format } from "date-fns";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import { formatUsdMoney } from "../financial/exactMoney";
import type { BillingCalculationPreview as BillingCalculationPreviewValue } from "../providers/types";
import type {
  BillingAdjustmentCalculation,
  BillingCalculation,
  BillingCalculationComparison,
  BillingCalculationLineage,
  BillingCalculationSelectedBranch,
} from "../types";
import type { ExactRatio } from "../financial/exactMoney";

export const calculationBranchLabel = (
  branch: BillingCalculationSelectedBranch,
) =>
  ({
    fixed: "Fixed amount selected",
    percentage: "Percentage candidate selected",
    minimum: "Minimum candidate selected",
    minimum_equal: "Minimum and percentage are equal; minimum selected",
  })[branch];

export const formatExactDeltaRate = (ratio: ExactRatio) => {
  const numerator = BigInt(ratio.numerator);
  const denominator = BigInt(ratio.denominator);
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const scaledNumerator = absolute * 10_000n;
  let hundredths = scaledNumerator / denominator;
  if ((scaledNumerator % denominator) * 2n >= denominator) hundredths += 1n;
  const whole = hundredths / 100n;
  const fraction = (hundredths % 100n).toString().padStart(2, "0");
  const sign = numerator === 0n ? "" : negative ? "-" : "+";
  return `${sign}${whole}.${fraction}%`;
};

export const formatCalculationComparison = (
  comparison: BillingCalculationComparison,
) => {
  if (comparison.status === "unavailable" || !comparison.delta) {
    return "Prior period unavailable";
  }
  const amount = BigInt(comparison.delta.amount_minor);
  if (amount === 0n) return "$0.00 no change";
  const formatted = formatUsdMoney(comparison.delta);
  return amount > 0n ? `+${formatted} increase` : `${formatted} decrease`;
};

const adjustmentLabels = {
  true_up: "True-up",
  no_adjustment: "No adjustment",
  credit_candidate: "Credit candidate",
  held: "Held for contract review",
} as const;

export const BillingCalculationPreview = ({
  preview,
  calculation,
  lineage,
  adjustments,
  adjustmentPending,
}: {
  preview: BillingCalculationPreviewValue;
  calculation: BillingCalculation | null;
  lineage: BillingCalculationLineage | null;
  adjustments: readonly BillingAdjustmentCalculation[];
  adjustmentPending: boolean;
}) => {
  const blocking = preview.anomalies.filter((anomaly) => anomaly.blocking);
  const status = adjustmentPending
    ? "Adjustment pending"
    : calculation?.status === "approved"
      ? lineage?.approval.mode === "auto"
        ? "Auto-approved"
        : "Approved"
      : calculation
        ? "Needs approval"
        : "Preview";
  return (
    <div className="min-w-0 space-y-6">
      <Card className="min-w-0 py-0">
        <CardContent className="space-y-6 p-4 md:p-6">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">
                Exact calculation preview
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Server-decoded candidates and policy checks. This display does
                not become calculation authority.
              </p>
            </div>
            <Badge variant="outline">{status}</Badge>
          </div>

          <div className="rounded-lg border bg-[#fafafa] p-4 dark:bg-[#1c1c1e]">
            <p className="text-sm text-muted-foreground">Exact final amount</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatUsdMoney(preview.final_amount)}
            </p>
            <p className="mt-1 text-sm">
              {calculationBranchLabel(preview.selected_branch)}
            </p>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
            <Candidate
              label="Fixed candidate"
              value={preview.fixed_candidate}
              selected={preview.selected_branch === "fixed"}
            />
            <Candidate
              label="Minimum candidate"
              value={preview.minimum_candidate}
              selected={
                preview.selected_branch === "minimum" ||
                preview.selected_branch === "minimum_equal"
              }
            />
            <Candidate
              label="Percentage candidate"
              value={preview.percentage_candidate}
              selected={preview.selected_branch === "percentage"}
            />
          </div>

          <section
            aria-labelledby="winning-branch-heading"
            className="space-y-3"
          >
            <h4 id="winning-branch-heading" className="font-semibold">
              Winning branch
            </h4>
            <dl className="grid min-w-0 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <Detail label="Formula kind">
                {titleCase(preview.formula_kind)}
              </Detail>
              <Detail label="Selected branch">
                {calculationBranchLabel(preview.selected_branch)}
              </Detail>
              <Detail label="Calculation base">
                <Money value={preview.calculation_base} />
              </Detail>
              <Detail label="Exact rate">
                {preview.rate ? (
                  <>
                    {preview.rate.submitted_percentage} ·{" "}
                    <span className="font-mono">
                      {preview.rate.numerator}/{preview.rate.denominator}
                    </span>
                  </>
                ) : (
                  "Not applicable"
                )}
              </Detail>
            </dl>
          </section>

          <section
            aria-labelledby="prior-comparison-heading"
            className="space-y-3"
          >
            <h4 id="prior-comparison-heading" className="font-semibold">
              Prior-period comparison
            </h4>
            <div className="rounded-lg border p-4">
              <p className="font-medium tabular-nums">
                {formatCalculationComparison(preview.comparison)}
              </p>
              {preview.comparison.previous_amount ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Previous approved amount{" "}
                  <span className="tabular-nums">
                    {formatUsdMoney(preview.comparison.previous_amount)}
                  </span>
                  {preview.comparison.delta_rate ? (
                    <>
                      {" "}
                      · exact change{" "}
                      <span className="tabular-nums">
                        {formatExactDeltaRate(preview.comparison.delta_rate)}
                      </span>
                    </>
                  ) : preview.comparison.status === "zero_baseline" ? (
                    " · percentage unavailable from a zero baseline"
                  ) : null}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  No approved prior calculation is available; it is not treated
                  as zero.
                </p>
              )}
            </div>
          </section>

          <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
            <section
              aria-labelledby="policy-provenance-heading"
              className="space-y-3"
            >
              <h4 id="policy-provenance-heading" className="font-semibold">
                Policy and provenance
              </h4>
              <dl className="grid gap-3 text-sm">
                <Detail label="Agreement version">
                  <span className="break-all font-mono">
                    {preview.agreement_version_id}
                  </span>
                </Detail>
                <Detail label="Revenue period">
                  {formatDate(preview.period_start)} to{" "}
                  {formatDate(preview.period_end)}
                </Detail>
                <Detail label="Provenance">
                  {titleCase(preview.provenance_kind)}
                  {preview.provenance_source_id
                    ? ` · ${preview.provenance_source_id}`
                    : ""}
                </Detail>
                <Detail label="Formula policy">
                  {preview.formula_version}
                </Detail>
                <Detail label="Rounding policy">
                  {preview.rounding_policy_version}
                </Detail>
                <Detail label="Revenue close policy">
                  {preview.revenue_close_policy_version}
                </Detail>
                <Detail label="Calculation close policy">
                  {preview.close_policy_version}
                </Detail>
                <Detail label="Approval eligibility">
                  {preview.close_policy.mode === "auto" &&
                  preview.close_policy.active &&
                  blocking.length === 0
                    ? "Automatic approval eligible"
                    : "Manual approval required"}
                </Detail>
                <Detail label="Explanation policy">
                  {preview.explanation_version}
                </Detail>
                <Detail label="Input fingerprint">
                  <span className="font-mono">
                    {preview.close_input_fingerprint.slice(0, 16)}…
                  </span>
                </Detail>
              </dl>
            </section>

            <section
              aria-labelledby="anomaly-checks-heading"
              className="space-y-3"
            >
              <h4 id="anomaly-checks-heading" className="font-semibold">
                Anomaly checks
              </h4>
              {preview.anomalies.length ? (
                <div className="grid gap-2">
                  {preview.anomalies.map((anomaly) => (
                    <div
                      key={anomaly.code}
                      className="rounded-lg border p-3 text-sm"
                    >
                      <p className="font-medium">{titleCase(anomaly.code)}</p>
                      <p className="mt-1 text-muted-foreground">
                        {anomaly.status === "pass" ? "Passed" : "Failed"}
                        {anomaly.blocking
                          ? " · approval blocked"
                          : " · non-blocking"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-emerald-600/30 bg-emerald-50 p-3 text-sm text-emerald-800">
                  Passed · no blocking anomalies
                </p>
              )}
              {blocking.length ? (
                <Alert className="border-amber-500 bg-amber-50 text-amber-950">
                  <AlertTitle>Calculation held</AlertTitle>
                  <AlertDescription>
                    Resolve every named anomaly and refresh before creating or
                    approving the calculation.
                  </AlertDescription>
                </Alert>
              ) : null}
            </section>
          </div>

          {calculation ? (
            <div className="rounded-lg border p-4 text-sm">
              <p className="font-medium">Calculation snapshot</p>
              <p className="mt-1 break-all font-mono">{calculation.id}</p>
              <p className="mt-2 text-muted-foreground">
                Snapshot hash {calculation.snapshot_hash.slice(0, 16)}… ·
                explanation hash {calculation.explanation_hash.slice(0, 16)}…
              </p>
              {lineage ? (
                <p className="mt-2 text-muted-foreground">
                  Approval {lineage.approval.mode} · event{" "}
                  <span className="font-mono">{lineage.approval.event_id}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {adjustments.length ? (
        <section
          aria-labelledby="linked-adjustments-heading"
          className="space-y-3"
        >
          <h3 id="linked-adjustments-heading" className="text-lg font-semibold">
            Linked late-evidence adjustments
          </h3>
          <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
            {adjustments.map((adjustment) => (
              <AdjustmentCard key={adjustment.id} adjustment={adjustment} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
};

const Candidate = ({
  label,
  value,
  selected,
}: {
  label: string;
  value: BillingCalculationPreviewValue["fixed_candidate"];
  selected: boolean;
}) => (
  <div className="rounded-lg border bg-[#fafafa] p-4 dark:bg-[#1c1c1e]">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-1 font-semibold tabular-nums">
      {value ? formatUsdMoney(value) : "Not applicable"}
    </p>
    {selected ? <p className="mt-1 text-sm">Selected</p> : null}
  </div>
);

const AdjustmentCard = ({
  adjustment,
}: {
  adjustment: BillingAdjustmentCalculation;
}) => (
  <Card className="min-w-0 py-0">
    <CardContent className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">
          {adjustmentLabels[adjustment.treatment]}
        </h4>
        <Badge variant="outline">
          {adjustment.status === "held" ? "Held" : "Linked"}
        </Badge>
      </div>
      <p className="break-words text-sm">{adjustment.reason}</p>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <Detail label="Original result">
          <Money value={adjustment.original_amount} />
        </Detail>
        <Detail label="Actual result">
          <Money value={adjustment.actual_amount} />
        </Detail>
        <Detail label="Signed delta">
          <span className="tabular-nums">
            {BigInt(adjustment.delta.amount_minor) > 0n ? "+" : ""}
            {formatUsdMoney(adjustment.delta)}
          </span>
        </Detail>
      </dl>
      <p className="break-all text-sm text-muted-foreground">
        Late review{" "}
        <span className="font-mono">{adjustment.late_review_event_id}</span> ·
        relationship{" "}
        <span className="font-mono">
          {adjustment.relationship_hash.slice(0, 16)}…
        </span>
      </p>
      <p className="text-sm text-muted-foreground">
        This is calculation treatment only; downstream financial obligations are
        outside this phase.
      </p>
    </CardContent>
  </Card>
);

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
