import {
  EditBase,
  Form,
  useDataProvider,
  useGetManyReference,
  useNotify,
  useRecordContext,
  useRedirect,
} from "ra-core";

import { CancelButton } from "@/components/admin/cancel-button";
import { SaveButton } from "@/components/admin/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import type { CrmDataProvider } from "../providers/types";
import type {
  BillingAccount,
  BillingAccountOwner,
  BillingContact,
} from "../types";
import {
  BillingAccountInputs,
  sanitizeBillingAccountFormValues,
  validateBillingAccountForm,
  type BillingAccountFormValues,
} from "./BillingAccountInputs";

export const BillingAccountEdit = () => (
  <EditBase actions={false} redirect={false}>
    <BillingAccountEditForm />
  </EditBase>
);

const BillingAccountEditForm = () => {
  const record = useRecordContext<BillingAccount>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const redirect = useRedirect();
  const owners = useGetManyReference<BillingAccountOwner>(
    "billing_account_owners",
    {
      target: "account_id",
      id: record?.id,
      pagination: { page: 1, perPage: 10 },
      sort: { field: "effective_from", order: "DESC" },
      filter: { effective_until: null },
    },
    { enabled: Boolean(record?.id) },
  );
  const contacts = useGetManyReference<BillingContact>(
    "billing_contacts",
    {
      target: "account_id",
      id: record?.id,
      pagination: { page: 1, perPage: 100 },
      sort: { field: "name", order: "ASC" },
      filter: {},
    },
    { enabled: Boolean(record?.id) },
  );

  if (!record || owners.isPending || contacts.isPending) {
    return <Skeleton className="mt-2 h-96 w-full rounded-xl" />;
  }
  if (owners.error || contacts.error) {
    return (
      <Alert variant="destructive" className="mt-2">
        <AlertDescription>
          Account changes were not saved. Review the highlighted fields and try
          again.
        </AlertDescription>
      </Alert>
    );
  }

  const activeOwner = owners.data?.find(
    (owner) => owner.effective_until === null,
  );
  const formRecord = {
    ...record,
    responsible_owner_sales_id: activeOwner?.sales_id,
    billing_contacts: contacts.data ?? [],
    lifecycle_reason: record.end_reason,
  };

  const saveBoundary = async (values: BillingAccountFormValues) => {
    try {
      const account = await dataProvider.saveBillingAccountBoundary({
        account_id: record.id,
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
    <Form
      record={formRecord}
      validate={validateBillingAccountForm}
      onSubmit={saveBoundary}
      className="min-w-0 pb-24"
    >
      <Card className="mt-2 min-w-0 border bg-white dark:bg-[#111113]">
        <CardContent className="p-4 md:p-6">
          <h1 className="mb-8 text-2xl font-semibold">Edit billing account</h1>
          <BillingAccountInputs />
        </CardContent>
      </Card>
      <div
        role="toolbar"
        className="sticky bottom-14 z-10 mt-4 flex min-h-16 items-center justify-end gap-4 border-t bg-white/95 p-4 backdrop-blur md:bottom-0 dark:bg-[#111113]/95"
      >
        <CancelButton className="h-11" />
        <SaveButton className="h-11" label="Save account changes" />
      </div>
    </Form>
  );
};
