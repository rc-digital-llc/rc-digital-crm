import { format } from "date-fns";
import {
  FilterLiveForm,
  InfiniteListBase,
  useCreatePath,
  useListContext,
  useRecordContext,
} from "ra-core";
import { Building2, ChevronRight, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";

import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { ExportButton } from "@/components/admin/export-button";
import { List } from "@/components/admin/list";
import { ReferenceField } from "@/components/admin/reference-field";
import { ReferenceManyField } from "@/components/admin/reference-many-field";
import { SearchInput } from "@/components/admin/search-input";
import { SelectInput } from "@/components/admin/select-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { MobileContent } from "../layout/MobileContent";
import MobileHeader from "../layout/MobileHeader";
import { RELEASE_SURFACE_MARKER } from "../root/releaseSurface";
import type {
  BillingAccount,
  BillingAccountOwner,
  BillingContact,
  Sale,
} from "../types";
import { billingAccountExporter } from "./billingAccountExport";
import { BillingSurfaceMetadata } from "./BillingSurfaceMetadata";

const statusChoices = [
  { id: "active", name: "Active" },
  { id: "on_hold", name: "On hold" },
  { id: "closed", name: "Closed" },
];

const statusLabels: Record<BillingAccount["billing_status"], string> = {
  active: "Active",
  on_hold: "On hold",
  closed: "Closed",
};

const statusClasses: Record<BillingAccount["billing_status"], string> = {
  active: "border-emerald-600/30 bg-emerald-50 text-emerald-800",
  on_hold: "border-amber-600/30 bg-amber-50 text-amber-800",
  closed: "border-[#e94560]/30 bg-[#e94560]/10 text-[#a51d38]",
};

const listFilters = [
  <SearchInput
    key="search"
    source="q"
    alwaysOn
    placeholder="Search customers"
    inputClassName="h-11 text-base"
  />,
  <SelectInput
    key="status"
    source="billing_status"
    label="Billing status"
    choices={statusChoices}
    optionText="name"
    optionValue="id"
    className="min-w-48 [&_button]:h-11"
  />,
];

export const BillingAccountList = () => (
  <div className="min-w-0">
    <BillingSurfaceMetadata />
    <List<BillingAccount>
      title="Billing accounts"
      perPage={25}
      sort={{ field: "updated_at", order: "DESC" }}
      exporter={billingAccountExporter}
      filters={listFilters}
      queryOptions={{
        onError: () => {
          // BillingAccountListLayout owns the stable, non-leaking error state.
        },
      }}
      actions={<BillingAccountListActions />}
    >
      <BillingAccountListLayout />
    </List>
  </div>
);

const BillingAccountListActions = () => (
  <div
    className="flex min-h-11 items-center gap-2 [&_a]:h-11"
    data-critical-billing-create
  >
    <ExportButton
      exporter={billingAccountExporter}
      className="h-11 cursor-pointer"
    />
    <CreateButton label="Create billing account" />
  </div>
);

const BillingAccountListLayout = () => {
  const { data, error, filterValues, isPending, refetch } =
    useListContext<BillingAccount>();
  const hasFilters = Object.values(filterValues ?? {}).some(
    (value) => value !== undefined && value !== null && value !== "",
  );

  if (isPending) return <BillingAccountListLoading />;

  return (
    <div data-surface-version={RELEASE_SURFACE_MARKER}>
      {error ? (
        <BillingAccountListError onRetry={() => void refetch()} />
      ) : !data?.length ? (
        <BillingAccountListEmpty filtered={hasFilters} />
      ) : (
        <Card className="border bg-white py-0 dark:bg-[#111113]">
          <DataTable<BillingAccount> rowClick="show" bulkActionsToolbar={false}>
            <DataTable.Col source="customer_name" label="Customer" />
            <DataTable.Col label="Billing status" disableSort>
              <BillingAccountStatus />
            </DataTable.Col>
            <DataTable.Col label="Responsible owner" disableSort>
              <BillingAccountOwnerSummary />
            </DataTable.Col>
            <DataTable.Col label="Billing contacts" disableSort>
              <BillingAccountContactSummary />
            </DataTable.Col>
            <DataTable.Col
              source="updated_at"
              label="Last updated"
              render={(record) =>
                format(new Date(record.updated_at), "MMM d, yyyy")
              }
            />
          </DataTable>
        </Card>
      )}
    </div>
  );
};

export const BillingAccountListMobile = () => (
  <InfiniteListBase<BillingAccount>
    perPage={25}
    sort={{ field: "updated_at", order: "DESC" }}
    exporter={billingAccountExporter}
    queryOptions={{
      onError: () => {
        // BillingAccountMobileLayout owns the stable error state.
      },
    }}
  >
    <BillingAccountMobileLayout />
  </InfiniteListBase>
);

const BillingAccountMobileLayout = () => {
  const { data, error, filterValues, isPending, refetch } =
    useListContext<BillingAccount>();
  const hasFilters = Object.values(filterValues ?? {}).some(
    (value) => value !== undefined && value !== null && value !== "",
  );

  return (
    <div
      className="min-w-0 bg-white text-base dark:bg-[#111113]"
      data-surface-version={isPending ? undefined : RELEASE_SURFACE_MARKER}
    >
      <MobileHeader>
        <FilterLiveForm className="flex min-w-0 flex-1 gap-2 [&_button]:min-h-11">
          <SearchInput
            source="q"
            placeholder="Search customers"
            inputClassName="h-11 text-base"
          />
          <SelectInput
            source="billing_status"
            label={false}
            choices={statusChoices}
            optionText="name"
            optionValue="id"
            className="w-32 [&_button]:h-11"
          />
        </FilterLiveForm>
      </MobileHeader>
      <MobileContent>
        <BillingSurfaceMetadata />
        <div
          className="mb-4 flex min-h-11 items-center justify-end [&_a]:h-11"
          data-critical-billing-create
        >
          <CreateButton label="Create billing account" />
        </div>
        {isPending ? <BillingAccountListLoading mobile /> : null}
        {error ? (
          <BillingAccountListError onRetry={() => void refetch()} />
        ) : null}
        {!isPending && !error && !data?.length ? (
          <BillingAccountListEmpty filtered={hasFilters} />
        ) : null}
        {!isPending && !error && data?.length ? (
          <div className="flex min-w-0 flex-col gap-4">
            {data.map((account) => (
              <BillingAccountMobileCard key={account.id} account={account} />
            ))}
          </div>
        ) : null}
      </MobileContent>
    </div>
  );
};

const BillingAccountMobileCard = ({ account }: { account: BillingAccount }) => {
  const createPath = useCreatePath();
  return (
    <Card className="min-w-0 border bg-[#fafafa] py-0 dark:bg-[#1c1c1e]">
      <CardContent className="flex min-w-0 items-start gap-4 p-4">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <h2 className="min-w-0 truncate text-xl font-semibold">
              {account.customer_name}
            </h2>
            <BillingAccountStatus record={account} />
          </div>
          <div className="grid min-w-0 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Responsible owner: </span>
              <BillingAccountOwnerSummary record={account} />
            </div>
            <div>
              <span className="text-muted-foreground">Billing contact: </span>
              <BillingAccountContactSummary record={account} />
            </div>
            <div className="text-muted-foreground">
              Updated {format(new Date(account.updated_at), "MMM d, yyyy")}
            </div>
          </div>
        </div>
        <Link
          to={createPath({
            resource: "billing_accounts",
            id: account.id,
            type: "show",
          })}
          aria-label="Open billing account details"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#0f3460] outline-none focus-visible:ring-2 focus-visible:ring-[#0f3460]"
        >
          <ChevronRight aria-hidden="true" className="h-5 w-5" />
        </Link>
      </CardContent>
    </Card>
  );
};

const BillingAccountStatus = ({
  record: recordProp,
}: {
  record?: BillingAccount;
}) => {
  const contextRecord = useRecordContext<BillingAccount>();
  const record = recordProp ?? contextRecord;
  if (!record) return null;
  return (
    <Badge
      variant="outline"
      className={`shrink-0 text-sm font-normal ${statusClasses[record.billing_status]}`}
    >
      {statusLabels[record.billing_status]}
    </Badge>
  );
};

const BillingAccountOwnerSummary = ({
  record,
}: {
  record?: BillingAccount;
}) => (
  <ReferenceManyField<BillingAccount, BillingAccountOwner>
    record={record}
    reference="billing_account_owners"
    target="account_id"
    filter={{ effective_until: null }}
    sort={{ field: "effective_from", order: "DESC" }}
    perPage={1}
    empty={<span className="text-amber-700">Owner not assigned</span>}
    loading={<Skeleton className="h-4 w-24" />}
    error={<span>Owner unavailable</span>}
  >
    <BillingAccountOwnerValue />
  </ReferenceManyField>
);

const BillingAccountOwnerValue = () => {
  const { data } = useListContext<BillingAccountOwner>();
  const owner = data[0];
  if (!owner) return <span className="text-amber-700">Owner not assigned</span>;
  return (
    <ReferenceField<BillingAccountOwner, Sale>
      record={owner}
      source="sales_id"
      reference="sales"
      link={false}
      empty={<span>Owner unavailable</span>}
      render={({ referenceRecord }) => {
        const sale = referenceRecord as Sale | undefined;
        return sale
          ? `${sale.first_name} ${sale.last_name}`.trim()
          : "Owner unavailable";
      }}
    />
  );
};

const BillingAccountContactSummary = ({
  record,
}: {
  record?: BillingAccount;
}) => (
  <ReferenceManyField<BillingAccount, BillingContact>
    record={record}
    reference="billing_contacts"
    target="account_id"
    filter={{ active: true }}
    sort={{ field: "name", order: "ASC" }}
    perPage={3}
    empty={<span className="text-amber-700">No active billing contact</span>}
    loading={<Skeleton className="h-4 w-28" />}
    error={<span>Contacts unavailable</span>}
  >
    <BillingAccountContactValue />
  </ReferenceManyField>
);

const BillingAccountContactValue = () => {
  const { data, total } = useListContext<BillingContact>();
  const first = data[0];
  if (!first)
    return <span className="text-amber-700">No active billing contact</span>;
  const method = first.preferred_contact_method;
  const methodLabel = method === "none" ? "not specified" : method;
  const additional = total > 1 ? ` +${total - 1}` : "";
  return (
    <span>
      {first.name} · {methodLabel}
      {additional}
    </span>
  );
};

export const BillingAccountListLoading = ({ mobile = false }) => (
  <div
    aria-label="Loading billing accounts"
    className={`grid gap-4 ${mobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3"}`}
  >
    {Array.from({ length: mobile ? 4 : 6 }, (_, index) => (
      <Skeleton key={index} className="h-24 w-full rounded-xl" />
    ))}
  </div>
);

export const BillingAccountListEmpty = ({
  filtered,
}: {
  filtered: boolean;
}) => (
  <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl border bg-[#fafafa] p-6 text-center dark:bg-[#1c1c1e]">
    <Building2 aria-hidden="true" className="h-8 w-8 text-[#0f3460]" />
    <div className="space-y-2">
      <h2 className="text-xl font-semibold">
        {filtered ? "No matching billing accounts" : "No billing accounts yet"}
      </h2>
      <p className="max-w-xl text-base text-muted-foreground">
        {filtered
          ? "No billing accounts match these filters. Clear a filter or search for another customer."
          : "Create the first billing account to define its owner, billing contacts, and access boundary."}
      </p>
    </div>
    {!filtered ? (
      <div className="min-h-11 [&_a]:h-11">
        <CreateButton label="Create billing account" />
      </div>
    ) : null}
  </div>
);

export const BillingAccountListError = ({
  onRetry,
}: {
  onRetry: () => void;
}) => (
  <div
    role="alert"
    className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl border bg-[#fafafa] p-6 text-center dark:bg-[#1c1c1e]"
  >
    <p className="max-w-xl text-base">
      Billing accounts could not be loaded. Check your connection and try again.
    </p>
    <Button type="button" variant="outline" className="h-11" onClick={onRetry}>
      <RotateCcw aria-hidden="true" className="h-4 w-4" />
      Try again
    </Button>
  </div>
);
