import { format } from "date-fns";
import {
  ShowBase,
  useCanAccess,
  useCreatePath,
  useListContext,
  useShowContext,
} from "ra-core";
import { ArrowLeft, Pencil, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { ReferenceField } from "@/components/admin/reference-field";
import { ReferenceManyField } from "@/components/admin/reference-many-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";

import { MobileContent } from "../layout/MobileContent";
import MobileHeader from "../layout/MobileHeader";
import { MobileBackButton } from "../misc/MobileBackButton";
import type {
  BillingAccount,
  BillingAccountOwner,
  BillingContact,
  Sale,
} from "../types";
import { BillingAccountAccessPanels } from "./BillingAccountAccessPanels";
import { BillingAccountEvidencePanel } from "./BillingAccountEvidencePanel";

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

export const BillingAccountShow = () => (
  <ShowBase
    queryOptions={{
      onError: () => {
        // BillingAccountShowController owns stable authorization-safe copy.
      },
    }}
  >
    <BillingAccountShowController />
  </ShowBase>
);

const BillingAccountShowController = () => {
  const isMobile = useIsMobile();
  const { error, isPending, record } = useShowContext<BillingAccount>();

  if (isPending) return <BillingAccountShowLoading />;
  if (error) return <BillingAccountShowError />;
  if (!record) return <BillingAccountShowMissing />;

  return isMobile ? (
    <BillingAccountShowMobile record={record} />
  ) : (
    <BillingAccountShowDesktop record={record} />
  );
};

const BillingAccountShowDesktop = ({ record }: { record: BillingAccount }) => (
  <div className="min-w-0 space-y-4 pb-8">
    <BillingAccountShowActions record={record} />
    <BillingAccountDetailGrid record={record} />
  </div>
);

const BillingAccountShowMobile = ({ record }: { record: BillingAccount }) => (
  <div className="min-w-0 bg-white dark:bg-[#111113]">
    <MobileHeader>
      <div className="[&_button]:!size-11">
        <MobileBackButton resource="billing_accounts" />
      </div>
      <p className="min-w-0 flex-1 truncate text-xl font-semibold">
        Billing account
      </p>
    </MobileHeader>
    <MobileContent>
      <div className="grid min-w-0 grid-cols-1 gap-4 pb-8">
        <BillingAccountDetailGrid record={record} mobile />
      </div>
    </MobileContent>
  </div>
);

const BillingAccountShowActions = ({ record }: { record: BillingAccount }) => {
  const createPath = useCreatePath();
  const { canAccess, isPending } = useCanAccess({
    action: "edit",
    resource: "billing_accounts",
    record,
  });
  const showEdit =
    !isPending && canAccess === true && record.billing_status !== "closed";

  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-4">
      <Button asChild variant="ghost" className="h-11">
        <Link to={createPath({ resource: "billing_accounts", type: "list" })}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to billing accounts
        </Link>
      </Button>
      {showEdit ? (
        <Button asChild variant="outline" className="h-11">
          <Link
            to={createPath({
              resource: "billing_accounts",
              type: "edit",
              id: record.id,
            })}
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
            Edit billing account
          </Link>
        </Button>
      ) : null}
    </div>
  );
};

const BillingAccountDetailGrid = ({
  record,
  mobile = false,
}: {
  record: BillingAccount;
  mobile?: boolean;
}) => (
  <div
    className={
      mobile
        ? "grid min-w-0 grid-cols-1 gap-4"
        : "grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_320px] md:gap-8"
    }
  >
    <AccountIdentityCard record={record} />
    <ResponsibleOwnerCard record={record} />
    <AuthorizedContactsCard record={record} />
    <ScopedAccessSlot account={record} />
    <EvidenceSecuritySlot account={record} />
  </div>
);

const AccountIdentityCard = ({ record }: { record: BillingAccount }) => (
  <Card className="min-w-0 border bg-white py-0 md:col-span-2 dark:bg-[#111113]">
    <CardContent className="min-w-0 space-y-6 p-4 md:p-6">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">
            Account identity and status
          </p>
          <h1 className="break-words text-2xl font-semibold">
            {record.customer_name}
          </h1>
        </div>
        <Badge
          variant="outline"
          className={`shrink-0 text-sm font-normal ${statusClasses[record.billing_status]}`}
        >
          {statusLabels[record.billing_status]}
        </Badge>
      </div>
      <dl className="grid min-w-0 grid-cols-1 gap-4 text-sm md:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-muted-foreground">Organization boundary</dt>
          <dd className="break-all">{record.organization_id}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Billing account identifier</dt>
          <dd className="break-all">{record.id}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last updated</dt>
          <dd>{format(new Date(record.updated_at), "MMM d, yyyy, h:mm a")}</dd>
        </div>
        {record.billing_status !== "active" && record.end_reason ? (
          <div>
            <dt className="text-muted-foreground">Lifecycle reason</dt>
            <dd className="break-words">{record.end_reason}</dd>
          </div>
        ) : null}
      </dl>
    </CardContent>
  </Card>
);

const ResponsibleOwnerCard = ({ record }: { record: BillingAccount }) => (
  <Card className="min-w-0 border bg-[#fafafa] py-0 md:col-start-2 md:row-start-2 dark:bg-[#1c1c1e]">
    <CardContent className="min-w-0 space-y-4 p-4 md:p-6">
      <h2 className="text-xl font-semibold">Responsible RC Digital owner</h2>
      <ReferenceManyField<BillingAccount, BillingAccountOwner>
        record={record}
        reference="billing_account_owners"
        target="account_id"
        filter={{ effective_until: null }}
        sort={{ field: "effective_from", order: "DESC" }}
        perPage={1}
        empty={<p className="text-amber-700">Owner not assigned</p>}
        loading={<Skeleton className="h-12 w-full" />}
        error={<p>Owner details are unavailable.</p>}
      >
        <ResponsibleOwnerValue />
      </ReferenceManyField>
      <Alert className="border-[#0f3460]/20 bg-white dark:bg-[#111113]">
        <ShieldCheck aria-hidden="true" />
        <AlertDescription>
          Server-side billing roles remain authoritative; ownership is not an
          access grant.
        </AlertDescription>
      </Alert>
    </CardContent>
  </Card>
);

const ResponsibleOwnerValue = () => {
  const { data } = useListContext<BillingAccountOwner>();
  const owner = data[0];
  if (!owner) return <p className="text-amber-700">Owner not assigned</p>;
  return (
    <div className="space-y-1 text-base">
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
      <p className="text-sm text-muted-foreground">
        Effective {format(new Date(owner.effective_from), "MMM d, yyyy")}
      </p>
    </div>
  );
};

const AuthorizedContactsCard = ({ record }: { record: BillingAccount }) => (
  <Card className="min-w-0 border bg-white py-0 md:col-start-1 md:row-start-2 dark:bg-[#111113]">
    <CardContent className="min-w-0 space-y-4 p-4 md:p-6">
      <h2 className="text-xl font-semibold">Authorized billing contacts</h2>
      <ReferenceManyField<BillingAccount, BillingContact>
        record={record}
        reference="billing_contacts"
        target="account_id"
        sort={{ field: "name", order: "ASC" }}
        perPage={100}
        empty={
          <p className="text-amber-700">No billing contacts are configured.</p>
        }
        loading={<Skeleton className="h-24 w-full" />}
        error={<p>Billing contacts are unavailable.</p>}
      >
        <AuthorizedContactRows />
      </ReferenceManyField>
    </CardContent>
  </Card>
);

const AuthorizedContactRows = () => {
  const { data } = useListContext<BillingContact>();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {data.map((contact) => (
        <div
          key={contact.id}
          className="min-w-0 rounded-lg border bg-[#fafafa] p-4 dark:bg-[#1c1c1e]"
        >
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h3 className="break-words text-base font-semibold">
              {contact.name}
            </h3>
            <Badge variant={contact.active ? "outline" : "destructive"}>
              {contact.active ? "Active" : "Ended"}
            </Badge>
          </div>
          <p className="mt-2 break-words text-sm text-muted-foreground">
            Preferred method: {formatContactMethod(contact)}
          </p>
          {contact.end_reason ? (
            <p className="mt-2 break-words text-sm">{contact.end_reason}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
};

const ScopedAccessSlot = ({ account }: { account: BillingAccount }) => (
  <Card
    data-slot="billing-account-access"
    className="min-w-0 border bg-white py-0 md:col-start-1 dark:bg-[#111113]"
  >
    <CardContent className="space-y-2 p-4 md:p-6">
      <h2 className="text-xl font-semibold">Scoped access</h2>
      <p className="text-sm text-muted-foreground">
        Human assignments and exact automation grants for this account.
      </p>
      <BillingAccountAccessPanels account={account} />
    </CardContent>
  </Card>
);

const EvidenceSecuritySlot = ({ account }: { account: BillingAccount }) => (
  <Card
    data-slot="billing-account-evidence"
    className="min-w-0 border bg-white py-0 md:col-start-1 dark:bg-[#111113]"
  >
    <CardContent className="space-y-2 p-4 md:p-6">
      <h2 className="text-xl font-semibold">Evidence security</h2>
      <p className="text-sm text-muted-foreground">
        Private evidence state and access history appear in this protected
        region without exposing storage paths.
      </p>
      <BillingAccountEvidencePanel account={account} />
    </CardContent>
  </Card>
);

export const BillingAccountShowLoading = () => (
  <div
    aria-label="Loading billing account"
    className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_320px]"
  >
    <Skeleton className="h-48 w-full md:col-span-2" />
    <Skeleton className="h-64 w-full" />
    <Skeleton className="h-64 w-full" />
  </div>
);

export const BillingAccountShowError = () => (
  <Alert variant="destructive" className="mt-2">
    <AlertTitle>Billing account unavailable</AlertTitle>
    <AlertDescription>
      You do not have access to this billing account. Return to the billing
      account list or ask a billing administrator for access.
    </AlertDescription>
  </Alert>
);

export const BillingAccountShowMissing = () => (
  <Alert className="mt-2">
    <AlertTitle>Billing account not found</AlertTitle>
    <AlertDescription>
      Return to the billing account list and select another customer.
    </AlertDescription>
  </Alert>
);

const formatContactMethod = (contact: BillingContact) => {
  if (contact.preferred_contact_method === "none") return "Not specified";
  return `${contact.preferred_contact_method.charAt(0).toUpperCase()}${contact.preferred_contact_method.slice(1)}`;
};
