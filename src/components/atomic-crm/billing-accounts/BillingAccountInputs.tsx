/* eslint-disable react-refresh/only-export-components */
import { email, required, useSimpleFormIterator } from "ra-core";
import { Plus } from "lucide-react";
import { useWatch } from "react-hook-form";

import { ArrayInput } from "@/components/admin/array-input";
import { BooleanInput } from "@/components/admin/boolean-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { SimpleFormIterator } from "@/components/admin/simple-form-iterator";
import { TextInput } from "@/components/admin/text-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import type {
  BillingAccountBoundaryContactInput,
  BillingAccountBoundaryRequest,
} from "../providers/types";
import type {
  BillingAccountStatus,
  BillingContactMethod,
  Sale,
} from "../types";

export type BillingAccountFormValues = {
  customer_name?: unknown;
  billing_status?: unknown;
  responsible_owner_sales_id?: unknown;
  billing_contacts?: unknown;
  lifecycle_reason?: unknown;
  [key: string]: unknown;
};

export const BILLING_ACCOUNT_EDITABLE_FIELDS = [
  "customer_name",
  "billing_status",
  "responsible_owner_sales_id",
  "billing_contacts",
  "lifecycle_reason",
] as const;

const billingStatuses = [
  { id: "active", name: "Active" },
  { id: "on_hold", name: "On hold" },
  { id: "closed", name: "Closed" },
];

const contactMethods = [
  { id: "email", name: "Email" },
  { id: "phone", name: "Phone" },
  { id: "text", name: "Text" },
  { id: "none", name: "Not specified" },
];

const trimOptional = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const sanitizeContact = (
  value: unknown,
): BillingAccountBoundaryContactInput => {
  const contact =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    id: trimOptional(contact.id),
    name: trimOptional(contact.name) ?? "",
    email: trimOptional(contact.email),
    phone: trimOptional(contact.phone),
    preferred_contact_method:
      (trimOptional(
        contact.preferred_contact_method,
      ) as BillingContactMethod) ?? "none",
    auth_user_id: trimOptional(contact.auth_user_id),
    active: contact.active === true,
    end_reason: trimOptional(contact.end_reason),
  };
};

export const sanitizeBillingAccountFormValues = (
  values: BillingAccountFormValues,
): Omit<BillingAccountBoundaryRequest, "account_id"> => {
  const owner = values.responsible_owner_sales_id;
  const ownerId =
    typeof owner === "number" ? owner : Number.parseInt(String(owner), 10);
  const contacts = Array.isArray(values.billing_contacts)
    ? values.billing_contacts.map(sanitizeContact)
    : [];

  return {
    customer_name: trimOptional(values.customer_name) ?? "",
    billing_status:
      (trimOptional(values.billing_status) as BillingAccountStatus) ?? "active",
    responsible_owner_sales_id: ownerId,
    billing_contacts: contacts,
    lifecycle_reason: trimOptional(values.lifecycle_reason),
  };
};

export const validateBillingAccountForm = (
  values: BillingAccountFormValues,
) => {
  const errors: Record<string, unknown> = {};
  const customerName = trimOptional(values.customer_name);
  const status = trimOptional(values.billing_status);
  const owner = values.responsible_owner_sales_id;
  const contacts = Array.isArray(values.billing_contacts)
    ? values.billing_contacts
    : [];

  if (!customerName) errors.customer_name = "Customer name is required.";
  if (!status) errors.billing_status = "Billing status is required.";
  if (owner === undefined || owner === null || owner === "") {
    errors.responsible_owner_sales_id = "Responsible owner is required.";
  }
  if (
    (status === "on_hold" || status === "closed") &&
    !trimOptional(values.lifecycle_reason)
  ) {
    errors.lifecycle_reason = "Enter a reason for this billing status.";
  }

  const hasActiveContact = contacts.some((value) => {
    const contact = value as Record<string, unknown>;
    return contact?.active === true;
  });
  if (!hasActiveContact) {
    errors.billing_contacts = "Add at least one active billing contact.";
    return errors;
  }

  const contactErrors: Record<number, Record<string, string>> = {};
  contacts.forEach((value, index) => {
    const contact =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    const itemErrors: Record<string, string> = {};
    const method = trimOptional(contact.preferred_contact_method);
    if (!trimOptional(contact.name)) {
      itemErrors.name = "Contact name is required.";
    }
    if (method === "email" && !trimOptional(contact.email)) {
      itemErrors.email = "Email is required for the preferred contact method.";
    }
    if (
      (method === "phone" || method === "text") &&
      !trimOptional(contact.phone)
    ) {
      itemErrors.phone = "Phone is required for the preferred contact method.";
    }
    if (contact.active === false && !trimOptional(contact.end_reason)) {
      itemErrors.end_reason = "Enter a reason to end this billing contact.";
    }
    if (Object.keys(itemErrors).length) contactErrors[index] = itemErrors;
  });
  if (Object.keys(contactErrors).length)
    errors.billing_contacts = contactErrors;

  return errors;
};

export const BillingAccountInputs = () => {
  const status = useWatch({ name: "billing_status" });
  const contacts = useWatch({ name: "billing_contacts" });
  const hasActiveContact =
    Array.isArray(contacts) && contacts.some((contact) => contact?.active);

  return (
    <div className="flex min-w-0 flex-col gap-8 p-1 text-base">
      <section aria-labelledby="billing-account-identity" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="billing-account-identity"
            className="text-xl font-semibold text-[#0f3460]"
          >
            Account identity and status
          </h2>
          <p className="text-sm text-muted-foreground">
            Define the customer boundary and its current billing lifecycle.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextInput
            source="customer_name"
            label="Customer name"
            validate={required()}
            helperText={false}
            inputClassName="h-11 text-base"
          />
          <SelectInput
            source="billing_status"
            label="Billing status"
            choices={billingStatuses}
            optionText="name"
            optionValue="id"
            validate={required()}
            helperText={false}
            className="[&_button]:h-11"
          />
          {status === "on_hold" || status === "closed" ? (
            <TextInput
              source="lifecycle_reason"
              label={status === "closed" ? "Closure reason" : "On-hold reason"}
              validate={required()}
              helperText="History remains available to authorized reviewers."
              className="md:col-span-2"
              inputClassName="h-11 text-base"
            />
          ) : null}
        </div>
      </section>

      <section aria-labelledby="billing-account-owner" className="space-y-4">
        <div className="space-y-1">
          <h2 id="billing-account-owner" className="text-xl font-semibold">
            Responsible RC Digital owner
          </h2>
          <p className="text-sm text-muted-foreground">
            Ownership is operational context; server-side roles remain the
            access authority.
          </p>
        </div>
        <ReferenceInput
          source="responsible_owner_sales_id"
          reference="sales"
          filter={{ "disabled@neq": true }}
          sort={{ field: "last_name", order: "ASC" }}
        >
          <SelectInput
            label="Responsible owner"
            optionText={saleOptionRenderer}
            validate={required()}
            helperText={false}
            className="max-w-xl [&_button]:h-11"
          />
        </ReferenceInput>
      </section>

      <section aria-labelledby="billing-account-contacts" className="space-y-4">
        <div className="space-y-1">
          <h2 id="billing-account-contacts" className="text-xl font-semibold">
            Authorized billing contacts
          </h2>
          <p className="text-sm text-muted-foreground">
            End a contact with a reason; prior authorization history is
            preserved.
          </p>
        </div>
        {!hasActiveContact ? (
          <Alert className="border-amber-500 bg-amber-50 text-amber-950">
            <AlertDescription>
              Add at least one active billing contact before saving.
            </AlertDescription>
          </Alert>
        ) : null}
        <ArrayInput source="billing_contacts" label={false} helperText={false}>
          <SimpleFormIterator
            addButton={<AddBillingContactButton />}
            disableClear
            disableRemove
            disableReordering
            getItemLabel={(index) => `Billing contact ${index + 1}`}
          >
            <BillingContactInputs />
          </SimpleFormIterator>
        </ArrayInput>
      </section>

      <section aria-labelledby="billing-account-access" className="space-y-4">
        <h2 id="billing-account-access" className="text-xl font-semibold">
          Explicit access summary
        </h2>
        <Card className="border-[#0f3460]/20 bg-[#fafafa] py-0 dark:bg-[#1c1c1e]">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Billing roles and automation grants are managed separately. The
            responsible owner does not grant access by itself.
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

const BillingContactInputs = () => (
  <Card className="min-w-0 border bg-[#fafafa] py-0 dark:bg-[#1c1c1e]">
    <CardContent className="grid min-w-0 grid-cols-1 gap-4 p-4 md:grid-cols-2">
      <TextInput
        source="name"
        label="Full name"
        validate={required()}
        helperText={false}
        inputClassName="h-11 text-base"
      />
      <SelectInput
        source="preferred_contact_method"
        label="Preferred contact method"
        choices={contactMethods}
        optionText="name"
        optionValue="id"
        validate={required()}
        helperText={false}
        className="[&_button]:h-11"
      />
      <TextInput
        source="email"
        label="Email"
        type="email"
        validate={email()}
        helperText={false}
        inputClassName="h-11 text-base"
      />
      <TextInput
        source="phone"
        label="Phone"
        type="tel"
        helperText={false}
        inputClassName="h-11 text-base"
      />
      <TextInput
        source="auth_user_id"
        label="Authenticated user binding (optional)"
        placeholder="Not linked"
        helperText="Admin-only secondary binding"
        inputClassName="h-11 text-base"
      />
      <BooleanInput source="active" label="Active billing contact" />
      <TextInput
        source="end_reason"
        label="Contact end reason"
        helperText="Required when this contact is inactive."
        className="md:col-span-2"
        inputClassName="h-11 text-base"
      />
    </CardContent>
  </Card>
);

const AddBillingContactButton = () => {
  const { add } = useSimpleFormIterator();
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11"
      onClick={() =>
        add({
          id: null,
          name: "",
          email: "",
          phone: "",
          preferred_contact_method: "email",
          auth_user_id: null,
          active: true,
          end_reason: null,
        })
      }
    >
      <Plus aria-hidden="true" className="h-4 w-4" />
      Add billing contact
    </Button>
  );
};

const saleOptionRenderer = (sale: Sale) =>
  `${sale.first_name} ${sale.last_name}`.trim();
