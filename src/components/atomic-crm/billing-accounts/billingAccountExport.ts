import jsonExport from "jsonexport/dist";
import { downloadCSV, type DataProvider, type Exporter } from "ra-core";

import type {
  BillingAccount,
  BillingAccountOwner,
  BillingContact,
  Sale,
} from "../types";

type ExportOwner = BillingAccountOwner & {
  display_name: string;
  [key: string]: unknown;
};

export type BillingAccountExportSource = BillingAccount & {
  responsible_owner?: ExportOwner | null;
  billing_contacts?: BillingContact[];
  [key: string]: unknown;
};

export const BILLING_ACCOUNT_EXPORT_FIELDS = [
  "customer_name",
  "billing_status",
  "responsible_owner_display_name",
  "active_contact_names",
  "active_contact_preferred_methods",
  "created_at",
  "updated_at",
] as const;

const statusLabels: Record<BillingAccount["billing_status"], string> = {
  active: "Active",
  on_hold: "On hold",
  closed: "Closed",
};

const contactMethodLabels: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  text: "Text",
  none: "Not specified",
};

export const buildBillingAccountExportRows = (
  records: BillingAccountExportSource[],
) =>
  records.map((record) => {
    const activeContacts = (record.billing_contacts ?? []).filter(
      (contact) => contact.active,
    );

    return {
      customer_name: record.customer_name,
      billing_status: statusLabels[record.billing_status],
      responsible_owner_display_name:
        record.responsible_owner?.display_name ?? "Unassigned",
      active_contact_names: activeContacts
        .map((contact) => contact.name)
        .join(", "),
      active_contact_preferred_methods: activeContacts
        .map(
          (contact) =>
            contactMethodLabels[contact.preferred_contact_method] ??
            "Not specified",
        )
        .join(", "),
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  });

const getExportSource = async (
  account: BillingAccount,
  dataProvider: DataProvider,
): Promise<BillingAccountExportSource> => {
  const [ownersResponse, contactsResponse] = await Promise.all([
    dataProvider.getManyReference<BillingAccountOwner>(
      "billing_account_owners",
      {
        target: "account_id",
        id: account.id,
        pagination: { page: 1, perPage: 10 },
        sort: { field: "effective_from", order: "DESC" },
        filter: { effective_until: null },
      },
    ),
    dataProvider.getManyReference<BillingContact>("billing_contacts", {
      target: "account_id",
      id: account.id,
      pagination: { page: 1, perPage: 100 },
      sort: { field: "name", order: "ASC" },
      filter: { active: true },
    }),
  ]);
  const owner = ownersResponse.data[0];
  const ownerSale = owner
    ? (await dataProvider.getOne<Sale>("sales", { id: owner.sales_id })).data
    : null;
  const responsibleOwner =
    owner && ownerSale
      ? {
          id: owner.id,
          organization_id: owner.organization_id,
          account_id: owner.account_id,
          sales_id: owner.sales_id,
          effective_from: owner.effective_from,
          effective_until: owner.effective_until,
          end_reason: owner.end_reason,
          created_at: owner.created_at,
          display_name: `${ownerSale.first_name} ${ownerSale.last_name}`.trim(),
        }
      : null;

  return {
    id: account.id,
    organization_id: account.organization_id,
    company_id: account.company_id,
    customer_name: account.customer_name,
    billing_status: account.billing_status,
    created_at: account.created_at,
    updated_at: account.updated_at,
    ended_at: account.ended_at,
    end_reason: account.end_reason,
    responsible_owner: responsibleOwner,
    billing_contacts: contactsResponse.data,
  };
};

export const billingAccountExporter: Exporter<BillingAccount> = async (
  records,
  _fetchRelatedRecords,
  dataProvider,
) => {
  const sources = await Promise.all(
    records.map((record) => getExportSource(record, dataProvider)),
  );
  const csv = await jsonExport(buildBillingAccountExportRows(sources), {
    headers: [...BILLING_ACCOUNT_EXPORT_FIELDS],
  });
  downloadCSV(csv, "billing-accounts");
};
