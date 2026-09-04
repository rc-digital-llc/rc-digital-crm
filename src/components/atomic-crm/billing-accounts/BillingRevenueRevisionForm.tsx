/* eslint-disable react-refresh/only-export-components */
import { useId, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { formatUsdMoney, parseUsdMoney } from "../financial/exactMoney";
import type { BillingRevenueSubmissionRequest } from "../providers/types";
import type {
  BillingEvidenceMetadata,
  BillingRevenueProvenance,
} from "../types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EXACT_USD_PATTERN =
  /^\$?(?:0|[1-9][0-9]*|[1-9][0-9]{0,2}(?:,[0-9]{3})+)\.[0-9]{2}$/;
const PROVENANCE_KINDS = ["api", "statement", "portal"] as const;

export type BillingRevenueRevisionFormValues = {
  gross_amount_usd: string;
  excluded_amount_usd: string;
  provenance_kind: BillingRevenueProvenance;
  provenance_source_id: string;
  attestation_accurate: boolean;
  attestation_text: string;
  evidence_ids: string[];
};

export type BillingRevenueRevisionFormErrors = Partial<
  Record<keyof BillingRevenueRevisionFormValues | "form", string>
>;

type RevisionContext = Readonly<{
  account_id: string;
  period_id: string;
  command_key: string;
}>;

const trim = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

function exactUsdFromDisplay(value: unknown) {
  const normalized = trim(value);
  if (!EXACT_USD_PATTERN.test(normalized)) {
    throw new Error("REVENUE_FORM_INVALID");
  }
  const unsigned = normalized.startsWith("$")
    ? normalized.slice(1)
    : normalized;
  const [whole, cents] = unsigned.replaceAll(",", "").split(".");
  return parseUsdMoney({
    amount_minor: (BigInt(whole) * 100n + BigInt(cents)).toString(),
    currency: "USD",
  });
}

export const EMPTY_BILLING_REVENUE_REVISION_FORM: BillingRevenueRevisionFormValues =
  {
    gross_amount_usd: "",
    excluded_amount_usd: "$0.00",
    provenance_kind: "statement",
    provenance_source_id: "",
    attestation_accurate: false,
    attestation_text: "",
    evidence_ids: [],
  };

export function validateBillingRevenueRevisionForm(
  values: BillingRevenueRevisionFormValues,
): BillingRevenueRevisionFormErrors {
  const errors: BillingRevenueRevisionFormErrors = {};
  let gross;
  let excluded;
  try {
    gross = exactUsdFromDisplay(values.gross_amount_usd);
  } catch {
    errors.gross_amount_usd = "Enter exact USD with two decimal places.";
  }
  try {
    excluded = exactUsdFromDisplay(values.excluded_amount_usd);
  } catch {
    errors.excluded_amount_usd = "Enter exact USD with two decimal places.";
  }
  if (
    gross &&
    excluded &&
    BigInt(excluded.amount_minor) > BigInt(gross.amount_minor)
  ) {
    errors.excluded_amount_usd =
      "Excluded revenue cannot exceed gross revenue.";
  }
  if (!PROVENANCE_KINDS.includes(values.provenance_kind)) {
    errors.provenance_kind = "Select an allowed provenance source.";
  }
  if (!trim(values.provenance_source_id)) {
    errors.provenance_source_id = "Source identifier is required.";
  }
  if (!values.attestation_accurate) {
    errors.attestation_accurate = "Confirm the revenue attestation.";
  }
  if (!trim(values.attestation_text)) {
    errors.attestation_text = "Describe how the revenue was verified.";
  }
  if (
    !Array.isArray(values.evidence_ids) ||
    values.evidence_ids.length < 1 ||
    values.evidence_ids.length > 100 ||
    values.evidence_ids.some((id) => !UUID_PATTERN.test(id)) ||
    new Set(values.evidence_ids).size !== values.evidence_ids.length
  ) {
    errors.evidence_ids = "Select at least one unique clean evidence record.";
  }
  return errors;
}

export function buildBillingRevenueRevisionRequest(
  values: BillingRevenueRevisionFormValues,
  context: RevisionContext,
): BillingRevenueSubmissionRequest {
  if (Object.keys(validateBillingRevenueRevisionForm(values)).length > 0) {
    throw new Error("REVENUE_FORM_INVALID");
  }
  const gross = exactUsdFromDisplay(values.gross_amount_usd);
  const excluded = exactUsdFromDisplay(values.excluded_amount_usd);
  const commissionable = parseUsdMoney({
    amount_minor: (
      BigInt(gross.amount_minor) - BigInt(excluded.amount_minor)
    ).toString(),
    currency: "USD",
  });
  return Object.freeze({
    account_id: context.account_id,
    period_id: context.period_id,
    gross_amount: gross,
    excluded_amount: excluded,
    commissionable_amount: commissionable,
    provenance_kind: values.provenance_kind,
    provenance_source_id: trim(values.provenance_source_id),
    attestation: Object.freeze({
      accurate: true as const,
      text: trim(values.attestation_text),
    }),
    evidence_ids: Object.freeze([...values.evidence_ids]),
    command_key: context.command_key,
  });
}

export const BillingRevenueRevisionForm = ({
  accountId,
  periodId,
  evidence,
  pending,
  onSave,
}: {
  accountId: string;
  periodId: string;
  evidence: readonly BillingEvidenceMetadata[];
  pending: boolean;
  onSave: (request: BillingRevenueSubmissionRequest) => Promise<void>;
}) => {
  const formId = useId();
  const [values, setValues] = useState<BillingRevenueRevisionFormValues>({
    ...EMPTY_BILLING_REVENUE_REVISION_FORM,
  });
  const [errors, setErrors] = useState<BillingRevenueRevisionFormErrors>({});
  const eligibleEvidence = evidence.filter(
    (record) =>
      record.inspection_status === "clean" &&
      record.lifecycle_status === "active" &&
      !record.is_held &&
      Date.parse(record.retention_expires_at) > Date.now(),
  );

  const setField = <K extends keyof BillingRevenueRevisionFormValues>(
    key: K,
    value: BillingRevenueRevisionFormValues[K],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const nextErrors = validateBillingRevenueRevisionForm(values);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    try {
      await onSave(
        buildBillingRevenueRevisionRequest(values, {
          account_id: accountId,
          period_id: periodId,
          command_key: `revenue-revision-${Date.now()}`,
        }),
      );
    } catch {
      setErrors((current) => ({
        ...current,
        form: "The action could not be completed. Refresh the account and review the reason before trying again.",
      }));
    }
  };

  let commissionable = "—";
  try {
    const gross = exactUsdFromDisplay(values.gross_amount_usd);
    const excluded = exactUsdFromDisplay(values.excluded_amount_usd);
    const amount = BigInt(gross.amount_minor) - BigInt(excluded.amount_minor);
    if (amount >= 0n) {
      commissionable = formatUsdMoney(
        parseUsdMoney({ amount_minor: amount.toString(), currency: "USD" }),
      );
    }
  } catch {
    // The validation message remains beside the authoritative inputs.
  }

  return (
    <form className="space-y-6" noValidate onSubmit={submit}>
      {errors.form ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{errors.form}</AlertDescription>
        </Alert>
      ) : null}

      <FormSection title="Exact revenue amounts">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            id={`${formId}-gross`}
            label="Gross revenue"
            value={values.gross_amount_usd}
            error={errors.gross_amount_usd}
            inputMode="decimal"
            onChange={(value) => setField("gross_amount_usd", value)}
          />
          <TextField
            id={`${formId}-excluded`}
            label="Excluded revenue"
            value={values.excluded_amount_usd}
            error={errors.excluded_amount_usd}
            inputMode="decimal"
            onChange={(value) => setField("excluded_amount_usd", value)}
          />
        </div>
        <div className="rounded-lg border bg-[#fafafa] p-4 dark:bg-[#1c1c1e]">
          <p className="text-sm text-muted-foreground">
            Commissionable revenue
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {commissionable}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Gross less excluded revenue, converted through exact integer minor
            units before submission.
          </p>
        </div>
      </FormSection>

      <FormSection title="Source provenance">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-provenance`}>Provenance kind</Label>
            <select
              id={`${formId}-provenance`}
              className="h-11 w-full rounded-md border bg-background px-3 text-sm"
              value={values.provenance_kind}
              onChange={(event) =>
                setField(
                  "provenance_kind",
                  event.target.value as BillingRevenueProvenance,
                )
              }
            >
              <option value="api">API</option>
              <option value="statement">Statement</option>
              <option value="portal">Portal</option>
            </select>
          </div>
          <TextField
            id={`${formId}-source`}
            label="Source identifier"
            value={values.provenance_source_id}
            error={errors.provenance_source_id}
            onChange={(value) => setField("provenance_source_id", value)}
          />
        </div>
      </FormSection>

      <FormSection title="Clean source evidence">
        {eligibleEvidence.length ? (
          <div className="grid grid-cols-1 gap-2">
            {eligibleEvidence.map((record) => {
              const checked = values.evidence_ids.includes(record.id);
              return (
                <label
                  key={record.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setField(
                        "evidence_ids",
                        checked
                          ? values.evidence_ids.filter((id) => id !== record.id)
                          : [...values.evidence_ids, record.id],
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="block break-words font-medium">
                      {record.original_filename}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      Clean · {record.kind.replaceAll("_", " ")}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border p-4 text-sm text-amber-700">
            No clean active evidence is available. Upload and inspect evidence
            in Evidence security before submitting a revision.
          </p>
        )}
        <FieldError value={errors.evidence_ids} />
      </FormSection>

      <FormSection title="Revenue attestation">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-attestation`}>Verification note</Label>
          <Textarea
            id={`${formId}-attestation`}
            value={values.attestation_text}
            aria-invalid={Boolean(errors.attestation_text)}
            aria-describedby={
              errors.attestation_text
                ? `${formId}-attestation-error`
                : undefined
            }
            onChange={(event) =>
              setField("attestation_text", event.target.value)
            }
          />
          <FieldError
            id={`${formId}-attestation-error`}
            value={errors.attestation_text}
          />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            checked={values.attestation_accurate}
            onChange={(event) =>
              setField("attestation_accurate", event.target.checked)
            }
          />
          <span>I attest these exact values and evidence are accurate.</span>
        </label>
        <FieldError value={errors.attestation_accurate} />
      </FormSection>

      <Button type="submit" className="h-11 w-full" disabled={pending}>
        {pending
          ? "Submit revenue revision · Working"
          : "Submit revenue revision"}
      </Button>
    </form>
  );
};

const FormSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <fieldset className="space-y-4 rounded-lg border p-4">
    <legend className="px-1 text-base font-semibold">{title}</legend>
    {children}
  </fieldset>
);

const TextField = ({
  id,
  label,
  value,
  error,
  inputMode,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  onChange: (value: string) => void;
}) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      type="text"
      inputMode={inputMode}
      value={value}
      className="h-11"
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${id}-error` : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
    <FieldError id={`${id}-error`} value={error} />
  </div>
);

const FieldError = ({ id, value }: { id?: string; value?: string }) =>
  value ? (
    <p id={id} className="text-sm text-destructive">
      {value}
    </p>
  ) : null;
