import {
  CreateBase,
  Form,
  useDataProvider,
  useNotify,
  useRedirect,
} from "ra-core";

import { CancelButton } from "@/components/admin/cancel-button";
import { SaveButton } from "@/components/admin/form";
import { Card, CardContent } from "@/components/ui/card";

import type { CrmDataProvider } from "../providers/types";
import { RELEASE_SURFACE_MARKER } from "../root/releaseSurface";
import {
  BillingAccountInputs,
  sanitizeBillingAccountFormValues,
  validateBillingAccountForm,
  type BillingAccountFormValues,
} from "./BillingAccountInputs";
import { BillingSurfaceMetadata } from "./BillingSurfaceMetadata";

const defaultValues = {
  billing_status: "active",
  lifecycle_reason: null,
  billing_contacts: [
    {
      id: null,
      name: "",
      email: "",
      phone: "",
      preferred_contact_method: "email",
      auth_user_id: null,
      active: true,
      end_reason: null,
    },
  ],
};

export const BillingAccountCreate = () => (
  <CreateBase redirect={false}>
    <BillingAccountCreateForm />
  </CreateBase>
);

const BillingAccountCreateForm = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const redirect = useRedirect();

  const saveBoundary = async (values: BillingAccountFormValues) => {
    try {
      const account = await dataProvider.saveBillingAccountBoundary({
        account_id: null,
        ...sanitizeBillingAccountFormValues(values),
      });
      redirect("show", "billing_accounts", account.id);
    } catch {
      notify(
        "Account changes were not saved. Review the highlighted fields and try again.",
        { type: "error" },
      );
    }
  };

  return (
    <div className="min-w-0" data-surface-version={RELEASE_SURFACE_MARKER}>
      <BillingSurfaceMetadata />
      <Form
        defaultValues={defaultValues}
        validate={validateBillingAccountForm}
        onSubmit={saveBoundary}
        className="min-w-0 pb-24"
      >
        <Card className="mt-2 min-w-0 border bg-white dark:bg-[#111113]">
          <CardContent className="p-4 md:p-6">
            <h1 className="mb-8 text-2xl font-semibold">
              Create billing account
            </h1>
            <BillingAccountInputs />
          </CardContent>
        </Card>
        <div
          role="toolbar"
          className="sticky bottom-14 z-10 mt-4 flex min-h-16 items-center justify-end gap-4 border-t bg-white/95 p-4 backdrop-blur md:bottom-0 dark:bg-[#111113]/95"
        >
          <CancelButton className="h-11" />
          <span data-critical-billing-create>
            <SaveButton className="h-11" label="Create billing account" />
          </span>
        </div>
      </Form>
    </div>
  );
};
