/* eslint-disable react-refresh/only-export-components */
import { useEffect, useId, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";

import {
  parseOrdinaryPercentage,
  parseUsdMoney,
} from "../financial/exactMoney";
import type {
  BillingAgreementDraftRequest,
  BillingAgreementLifecycleRequest,
} from "../providers/types";
import type {
  BillingAgreementFormulaKind,
  BillingAgreementVersion,
} from "../types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RULE_TOKEN_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const EXACT_USD_PATTERN = /^\$?(?:0|[1-9][0-9]*)\.[0-9]{2}$/;
const EVIDENCE_PRIORITIES = ["api", "statement", "portal"] as const;

export type BillingAgreementFormValues = {
  agreement_family: string;
  effective_start: string;
  effective_end: string;
  timezone: string;
  formula_kind: BillingAgreementFormulaKind;
  fixed_amount_usd: string;
  minimum_amount_usd: string;
  percentage: string;
  timing_basis: "cash" | "accrual";
  included_amounts: string;
  excluded_amounts: string;
  tax_treatment: "include" | "exclude";
  refund_chargeback_policy: "deduct_in_period" | "next_period_adjustment";
  cutoff_day: string;
  dispute_policy: "hold_close" | "exclude_disputed";
  missing_report_policy: "hold_close" | "minimum_only";
  true_up_policy: "next_period_adjustment" | "credit_candidate";
  evidence_priority: string;
  signed_evidence_id: string;
};

export type BillingAgreementFormErrors = Partial<
  Record<keyof BillingAgreementFormValues | "form", string>
>;

type DraftContext = Readonly<{
  account_id: string;
  command_key: string;
  agreement_id?: string;
  version_id?: string;
}>;

const trim = (value: string) => value.trim();

function splitTokens(value: string, allowEmpty = false) {
  const tokens = value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (
    (!allowEmpty && tokens.length === 0) ||
    tokens.some((token) => !RULE_TOKEN_PATTERN.test(token)) ||
    new Set(tokens).size !== tokens.length
  ) {
    throw new Error("AGREEMENT_FORM_INVALID");
  }
  return tokens;
}

function exactUsdFromDisplay(value: string) {
  const normalized = trim(value);
  if (!EXACT_USD_PATTERN.test(normalized)) {
    throw new Error("AGREEMENT_FORM_INVALID");
  }
  const unsigned = normalized.startsWith("$")
    ? normalized.slice(1)
    : normalized;
  const [whole, cents] = unsigned.split(".");
  const amountMinor = (BigInt(whole) * 100n + BigInt(cents)).toString();
  return parseUsdMoney({ amount_minor: amountMinor, currency: "USD" });
}

function validDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function validateBillingAgreementForm(
  values: BillingAgreementFormValues,
): BillingAgreementFormErrors {
  const errors: BillingAgreementFormErrors = {};
  if (!trim(values.agreement_family)) {
    errors.agreement_family = "Agreement family is required.";
  }
  if (!validDate(values.effective_start)) {
    errors.effective_start = "Enter a valid effective start date.";
  }
  if (
    !validDate(values.effective_end) ||
    values.effective_end <= values.effective_start
  ) {
    errors.effective_end = "Effective end must be after the start date.";
  }
  if (!trim(values.timezone) || !values.timezone.includes("/")) {
    errors.timezone = "Enter an IANA timezone such as America/Chicago.";
  }
  const needsFixed = values.formula_kind === "fixed";
  const needsMinimum =
    values.formula_kind === "minimum_support" ||
    values.formula_kind === "hybrid";
  const needsPercentage =
    values.formula_kind === "percentage" || values.formula_kind === "hybrid";
  try {
    if (needsFixed) exactUsdFromDisplay(values.fixed_amount_usd);
  } catch {
    errors.fixed_amount_usd = "Enter exact USD with two decimal places.";
  }
  try {
    if (needsMinimum) exactUsdFromDisplay(values.minimum_amount_usd);
  } catch {
    errors.minimum_amount_usd = "Enter exact USD with two decimal places.";
  }
  try {
    if (needsPercentage) parseOrdinaryPercentage(trim(values.percentage));
  } catch {
    errors.percentage = "Enter a percentage from 0% to 100%.";
  }
  try {
    splitTokens(values.included_amounts);
  } catch {
    errors.included_amounts =
      "List at least one unique snake_case included amount.";
  }
  try {
    splitTokens(values.excluded_amounts, true);
  } catch {
    errors.excluded_amounts = "Use unique snake_case excluded amounts.";
  }
  if (!/^(?:[1-9]|1[0-9]|2[0-8])$/.test(trim(values.cutoff_day))) {
    errors.cutoff_day = "Enter a cutoff day from 1 through 28.";
  }
  try {
    const priorities = splitTokens(values.evidence_priority);
    if (
      priorities.some(
        (priority) =>
          !EVIDENCE_PRIORITIES.includes(
            priority as (typeof EVIDENCE_PRIORITIES)[number],
          ),
      )
    ) {
      throw new Error("AGREEMENT_FORM_INVALID");
    }
  } catch {
    errors.evidence_priority =
      "Use each of api, statement, and portal at most once.";
  }
  if (!UUID_PATTERN.test(trim(values.signed_evidence_id))) {
    errors.signed_evidence_id = "Select valid clean signed agreement evidence.";
  }
  return errors;
}

export function buildBillingAgreementDraftRequest(
  values: BillingAgreementFormValues,
  context: DraftContext,
): BillingAgreementDraftRequest {
  if (Object.keys(validateBillingAgreementForm(values)).length > 0) {
    throw new Error("AGREEMENT_FORM_INVALID");
  }
  const common = {
    account_id: context.account_id,
    ...(context.agreement_id ? { agreement_id: context.agreement_id } : {}),
    ...(context.version_id ? { version_id: context.version_id } : {}),
    agreement_family: trim(values.agreement_family),
    command_key: context.command_key,
    effective_start: values.effective_start,
    effective_end: values.effective_end,
    signed_evidence_id: trim(values.signed_evidence_id),
    timezone: trim(values.timezone),
    timing_basis: values.timing_basis,
    included_amounts: splitTokens(values.included_amounts),
    excluded_amounts: splitTokens(values.excluded_amounts, true),
    tax_treatment: values.tax_treatment,
    refund_chargeback_policy: values.refund_chargeback_policy,
    cutoff_day: Number(trim(values.cutoff_day)),
    dispute_policy: values.dispute_policy,
    missing_report_policy: values.missing_report_policy,
    true_up_policy: values.true_up_policy,
    evidence_priority: splitTokens(values.evidence_priority) as Array<
      (typeof EVIDENCE_PRIORITIES)[number]
    >,
  } as const;
  switch (values.formula_kind) {
    case "fixed":
      return {
        ...common,
        formula_kind: "fixed",
        fixed_amount: exactUsdFromDisplay(values.fixed_amount_usd),
        minimum_amount: null,
        percentage: null,
      };
    case "percentage":
      return {
        ...common,
        formula_kind: "percentage",
        fixed_amount: null,
        minimum_amount: null,
        percentage: parseOrdinaryPercentage(trim(values.percentage)),
      };
    case "minimum_support":
      return {
        ...common,
        formula_kind: "minimum_support",
        fixed_amount: null,
        minimum_amount: exactUsdFromDisplay(values.minimum_amount_usd),
        percentage: null,
      };
    case "hybrid":
      return {
        ...common,
        formula_kind: "hybrid",
        fixed_amount: null,
        minimum_amount: exactUsdFromDisplay(values.minimum_amount_usd),
        percentage: parseOrdinaryPercentage(trim(values.percentage)),
      };
  }
}

export const EMPTY_BILLING_AGREEMENT_FORM: BillingAgreementFormValues = {
  agreement_family: "primary",
  effective_start: "",
  effective_end: "",
  timezone: "America/Chicago",
  formula_kind: "fixed",
  fixed_amount_usd: "",
  minimum_amount_usd: "",
  percentage: "",
  timing_basis: "cash",
  included_amounts: "service_revenue",
  excluded_amounts: "sales_tax, refunds, chargebacks",
  tax_treatment: "exclude",
  refund_chargeback_policy: "next_period_adjustment",
  cutoff_day: "10",
  dispute_policy: "hold_close",
  missing_report_policy: "hold_close",
  true_up_policy: "next_period_adjustment",
  evidence_priority: "api, statement, portal",
  signed_evidence_id: "",
};

type BillingAgreementFormProps = Readonly<{
  account_id: string;
  initialValues?: BillingAgreementFormValues;
  agreement_id?: string;
  version_id?: string;
  saving?: boolean;
  submitLabel?: string;
  onCancel: () => void;
  onSave: (request: BillingAgreementDraftRequest) => Promise<void>;
}>;

export const BillingAgreementForm = ({
  account_id,
  initialValues = EMPTY_BILLING_AGREEMENT_FORM,
  agreement_id,
  version_id,
  saving = false,
  submitLabel = "Save agreement draft",
  onCancel,
  onSave,
}: BillingAgreementFormProps) => {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<BillingAgreementFormErrors>({});
  const [safeError, setSafeError] = useState<string | null>(null);
  const [commandKey] = useState(() => `agreement-draft-${crypto.randomUUID()}`);
  const id = useId();

  const setField = <Key extends keyof BillingAgreementFormValues>(
    field: Key,
    value: BillingAgreementFormValues[Key],
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateBillingAgreementForm(values);
    setErrors(nextErrors);
    setSafeError(null);
    if (Object.keys(nextErrors).length > 0) return;
    try {
      await onSave(
        buildBillingAgreementDraftRequest(values, {
          account_id,
          agreement_id,
          version_id,
          command_key: commandKey,
        }),
      );
    } catch {
      setSafeError(
        "The agreement draft could not be saved. Refresh the account and review the entered terms before trying again.",
      );
    }
  };

  return (
    <form
      className="min-w-0 space-y-8"
      onSubmit={(event) => void submit(event)}
    >
      {safeError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{safeError}</AlertDescription>
        </Alert>
      ) : null}

      <fieldset className="space-y-4" disabled={saving}>
        <legend className="text-lg font-semibold">
          Lifecycle and effective period
        </legend>
        <p className="text-sm text-muted-foreground">
          Dates apply in the agreement timezone; browser timezone is never the
          period authority.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <AgreementInput
            id={`${id}-family`}
            label="Agreement family"
            value={values.agreement_family}
            error={errors.agreement_family}
            onChange={(value) => setField("agreement_family", value)}
          />
          <AgreementInput
            id={`${id}-timezone`}
            label="Agreement timezone"
            value={values.timezone}
            error={errors.timezone}
            onChange={(value) => setField("timezone", value)}
          />
          <AgreementInput
            id={`${id}-start`}
            type="date"
            label="Effective start"
            value={values.effective_start}
            error={errors.effective_start}
            onChange={(value) => setField("effective_start", value)}
          />
          <AgreementInput
            id={`${id}-end`}
            type="date"
            label="Effective end"
            value={values.effective_end}
            error={errors.effective_end}
            onChange={(value) => setField("effective_end", value)}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4" disabled={saving}>
        <legend className="text-lg font-semibold">Formula terms</legend>
        <AgreementSelect
          id={`${id}-formula`}
          label="Formula"
          value={values.formula_kind}
          onChange={(value) =>
            setField("formula_kind", value as BillingAgreementFormulaKind)
          }
          options={[
            ["fixed", "Fixed monthly"],
            ["percentage", "Percentage of revenue"],
            ["minimum_support", "Minimum support"],
            ["hybrid", "Hybrid max(minimum, percentage)"],
          ]}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {values.formula_kind === "fixed" ? (
            <AgreementInput
              id={`${id}-fixed`}
              label="Fixed monthly amount (USD)"
              inputMode="decimal"
              placeholder="$500.00"
              value={values.fixed_amount_usd}
              error={errors.fixed_amount_usd}
              onChange={(value) => setField("fixed_amount_usd", value)}
            />
          ) : null}
          {values.formula_kind === "minimum_support" ||
          values.formula_kind === "hybrid" ? (
            <AgreementInput
              id={`${id}-minimum`}
              label="Minimum support amount (USD)"
              inputMode="decimal"
              placeholder="$500.00"
              value={values.minimum_amount_usd}
              error={errors.minimum_amount_usd}
              onChange={(value) => setField("minimum_amount_usd", value)}
            />
          ) : null}
          {values.formula_kind === "percentage" ||
          values.formula_kind === "hybrid" ? (
            <AgreementInput
              id={`${id}-percentage`}
              label="Commission rate"
              inputMode="decimal"
              placeholder="8.875%"
              value={values.percentage}
              error={errors.percentage}
              onChange={(value) => setField("percentage", value)}
            />
          ) : null}
        </div>
      </fieldset>

      <fieldset className="space-y-4" disabled={saving}>
        <legend className="text-lg font-semibold">
          Commissionable revenue rules
        </legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <AgreementSelect
            id={`${id}-timing`}
            label="Timing basis"
            value={values.timing_basis}
            onChange={(value) =>
              setField("timing_basis", value as "cash" | "accrual")
            }
            options={[
              ["cash", "Cash"],
              ["accrual", "Accrual"],
            ]}
          />
          <AgreementInput
            id={`${id}-cutoff`}
            label="Monthly cutoff day"
            inputMode="numeric"
            value={values.cutoff_day}
            error={errors.cutoff_day}
            onChange={(value) => setField("cutoff_day", value)}
          />
          <AgreementTextarea
            id={`${id}-included`}
            label="Included amounts"
            value={values.included_amounts}
            error={errors.included_amounts}
            onChange={(value) => setField("included_amounts", value)}
          />
          <AgreementTextarea
            id={`${id}-excluded`}
            label="Excluded amounts"
            value={values.excluded_amounts}
            error={errors.excluded_amounts}
            onChange={(value) => setField("excluded_amounts", value)}
          />
          <AgreementSelect
            id={`${id}-tax`}
            label="Tax treatment"
            value={values.tax_treatment}
            onChange={(value) =>
              setField("tax_treatment", value as "include" | "exclude")
            }
            options={[
              ["exclude", "Exclude taxes"],
              ["include", "Include taxes"],
            ]}
          />
          <AgreementSelect
            id={`${id}-refunds`}
            label="Refund and chargeback treatment"
            value={values.refund_chargeback_policy}
            onChange={(value) =>
              setField(
                "refund_chargeback_policy",
                value as BillingAgreementFormValues["refund_chargeback_policy"],
              )
            }
            options={[
              ["deduct_in_period", "Deduct in period"],
              ["next_period_adjustment", "Adjust next period"],
            ]}
          />
          <AgreementSelect
            id={`${id}-dispute`}
            label="Dispute treatment"
            value={values.dispute_policy}
            onChange={(value) =>
              setField(
                "dispute_policy",
                value as BillingAgreementFormValues["dispute_policy"],
              )
            }
            options={[
              ["hold_close", "Hold close"],
              ["exclude_disputed", "Exclude disputed amounts"],
            ]}
          />
          <AgreementSelect
            id={`${id}-true-up`}
            label="True-up and credit treatment"
            value={values.true_up_policy}
            onChange={(value) =>
              setField(
                "true_up_policy",
                value as BillingAgreementFormValues["true_up_policy"],
              )
            }
            options={[
              ["next_period_adjustment", "Next-period adjustment"],
              ["credit_candidate", "Credit candidate"],
            ]}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4" disabled={saving}>
        <legend className="text-lg font-semibold">Evidence policy</legend>
        <AgreementSelect
          id={`${id}-missing`}
          label="Missing report treatment"
          value={values.missing_report_policy}
          onChange={(value) =>
            setField(
              "missing_report_policy",
              value as BillingAgreementFormValues["missing_report_policy"],
            )
          }
          options={[
            ["hold_close", "Hold close"],
            ["minimum_only", "Permit reviewed minimum-only close"],
          ]}
        />
        <AgreementInput
          id={`${id}-priority`}
          label="Ordered evidence ladder"
          value={values.evidence_priority}
          error={errors.evidence_priority}
          onChange={(value) => setField("evidence_priority", value)}
        />
      </fieldset>

      <fieldset className="space-y-4" disabled={saving}>
        <legend className="text-lg font-semibold">
          Signed source evidence
        </legend>
        <p className="text-sm text-muted-foreground">
          Select only a clean contract evidence ID from the account evidence
          panel. The provider rechecks account scope, inspection state, and
          content hash.
        </p>
        <AgreementInput
          id={`${id}-evidence`}
          label="Signed agreement evidence ID"
          value={values.signed_evidence_id}
          error={errors.signed_evidence_id}
          onChange={(value) => setField("signed_evidence_id", value)}
        />
      </fieldset>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={saving}
          onClick={onCancel}
        >
          Keep current agreement
        </Button>
        <Button type="submit" className="h-11" disabled={saving}>
          {saving ? "Saving agreement draft…" : submitLabel}
        </Button>
      </div>
    </form>
  );
};

type LifecycleAction = "submit" | "activate" | "pause" | "terminate";

const lifecycleLabels: Record<LifecycleAction, string> = {
  submit: "Submit for review",
  activate: "Activate agreement",
  pause: "Pause agreement",
  terminate: "Terminate agreement",
};

export const BillingAgreementLifecycleDialog = ({
  action,
  accountName,
  agreement,
  evidenceFilename = "Signed agreement evidence",
  open,
  onOpenChange,
  onConfirm,
}: Readonly<{
  action: LifecycleAction;
  accountName: string;
  agreement: BillingAgreementVersion;
  evidenceFilename?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (request: BillingAgreementLifecycleRequest) => Promise<void>;
}>) => {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [safeError, setSafeError] = useState<string | null>(null);
  const [commandKey, setCommandKey] = useState(
    () => `agreement-${action}-${crypto.randomUUID()}`,
  );

  useEffect(() => {
    if (!open) {
      setReason("");
      setSafeError(null);
      setCommandKey(`agreement-${action}-${crypto.randomUUID()}`);
    }
  }, [action, open]);

  const confirm = async () => {
    if (!reason.trim()) return;
    setPending(true);
    setSafeError(null);
    try {
      await onConfirm({
        version_id: agreement.version_id,
        reason: reason.trim(),
        command_key: commandKey,
      });
      onOpenChange(false);
    } catch {
      setSafeError(
        "The action could not be completed. Refresh the account and review the reason before trying again.",
      );
    } finally {
      setPending(false);
    }
  };

  const historicalCopy =
    action === "pause" || action === "terminate"
      ? " Historical closes remain unchanged."
      : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lifecycleLabels[action]}</DialogTitle>
          <DialogDescription>
            {lifecycleLabels[action]} for {accountName}, effective{" "}
            {agreement.effective_start} through {agreement.effective_end}.
            Formula: {agreement.formula_kind}. Evidence: {evidenceFilename} (
            {agreement.signed_evidence_sha256.slice(0, 12)}…).{historicalCopy}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-2 rounded-md border p-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Self-approval</dt>
            <dd>{agreement.self_approved ? "Recorded" : "Not recorded"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Version</dt>
            <dd className="break-all font-mono">{agreement.version_id}</dd>
          </div>
        </dl>
        <div className="grid gap-2">
          <Label htmlFor="agreement-lifecycle-reason">Reason</Label>
          <Textarea
            id="agreement-lifecycle-reason"
            className="min-h-24 text-base"
            value={reason}
            disabled={pending}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        {safeError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{safeError}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Review agreement
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={!reason.trim() || pending}
            onClick={() => void confirm()}
          >
            {pending ? `${lifecycleLabels[action]}…` : lifecycleLabels[action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AgreementInput = ({
  id,
  label,
  value,
  error,
  onChange,
  ...props
}: Readonly<{
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}> &
  Omit<React.ComponentProps<typeof Input>, "id" | "value" | "onChange">) => (
  <div className="grid min-w-0 gap-2">
    <Label htmlFor={id}>{label}</Label>
    <Input
      {...props}
      id={id}
      className="h-11 min-w-0 text-base"
      value={value}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${id}-error` : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
    {error ? (
      <p id={`${id}-error`} className="text-sm text-destructive">
        {error}
      </p>
    ) : null}
  </div>
);

const AgreementTextarea = ({
  id,
  label,
  value,
  error,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}>) => (
  <div className="grid min-w-0 gap-2">
    <Label htmlFor={id}>{label}</Label>
    <Textarea
      id={id}
      className="min-h-24 text-base"
      value={value}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${id}-error` : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
    {error ? (
      <p id={`${id}-error`} className="text-sm text-destructive">
        {error}
      </p>
    ) : null}
  </div>
);

const AgreementSelect = ({
  id,
  label,
  value,
  options,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}>) => (
  <div className="grid min-w-0 gap-2">
    <Label htmlFor={id}>{label}</Label>
    <select
      id={id}
      className="h-11 min-w-0 rounded-md border bg-background px-3 text-base"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map(([optionValue, optionLabel]) => (
        <option key={optionValue} value={optionValue}>
          {optionLabel}
        </option>
      ))}
    </select>
  </div>
);
