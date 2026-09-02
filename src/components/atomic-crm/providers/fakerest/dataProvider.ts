import {
  withLifecycleCallbacks,
  type CreateParams,
  type DataProvider,
  type Identifier,
  type ResourceCallbacks,
  type UpdateParams,
} from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";

import type {
  BillingAccount,
  BillingAccountOwner,
  BillingAutomationPrincipal,
  BillingContact,
  BillingEvidenceMetadata,
  BillingRoleAssignment,
  Company,
  Contact,
  ContactNote,
  Deal,
  DealNote,
  Sale,
  SalesFormData,
  SignUpData,
  Task,
} from "../../types";
import type { ConfigurationContextValue } from "../../root/ConfigurationContext";
import { getActivityLog } from "../commons/activity";
import { getCompanyAvatar } from "../commons/getCompanyAvatar";
import { getContactAvatar } from "../commons/getContactAvatar";
import { mergeContacts } from "../commons/mergeContacts";
import type { CrmDataProvider } from "../types";
import type {
  BillingAccountAccessSummary,
  BillingAccountBoundaryRequest,
  BillingAccountBoundaryResponse,
  BillingEvidenceDownloadRequest,
  BillingEvidenceDownloadResponse,
  BillingEvidenceInspectionRequest,
  BillingEvidenceInspectionResponse,
  BillingEvidenceUploadRequest,
  BillingEvidenceUploadResponse,
} from "../types";
import { authProvider, USER_STORAGE_KEY } from "./authProvider";
import generateData from "./dataGenerator";
import {
  DEMO_EVIDENCE_EXPIRES_AT,
  DEMO_EVIDENCE_NOW,
} from "./dataGenerator/billingAccounts";
import { withSupabaseFilterAdapter } from "./internal/supabaseAdapter";

const baseDataProvider = fakeRestDataProvider(generateData(), true, 300);

const TASK_MARKED_AS_DONE = "TASK_MARKED_AS_DONE";
const TASK_MARKED_AS_UNDONE = "TASK_MARKED_AS_UNDONE";
const TASK_DONE_NOT_CHANGED = "TASK_DONE_NOT_CHANGED";
let taskUpdateType = TASK_DONE_NOT_CHANGED;

const demoEvidenceCapability = (
  operation: "upload" | "download",
  evidenceId: string,
) => `demo://billing-evidence/${operation}/${evidenceId}?expires-in=60`;

const getEvidenceDenialReason = (evidence: BillingEvidenceMetadata) => {
  if (evidence.lifecycle_status !== "active") return "EVIDENCE_NOT_ACTIVE";
  if (evidence.inspection_status === "quarantined")
    return "EVIDENCE_QUARANTINED";
  if (evidence.inspection_status === "rejected") return "EVIDENCE_REJECTED";
  if (
    Date.parse(evidence.retention_expires_at) <= Date.parse(DEMO_EVIDENCE_NOW)
  )
    return "EVIDENCE_EXPIRED";
  if (evidence.is_held) return "EVIDENCE_HELD";
  return null;
};

const processCompanyLogo = async (params: any) => {
  let logo = params.data.logo;

  if (typeof logo !== "object" || logo === null || !logo.src) {
    logo = await getCompanyAvatar(params.data);
  } else if (logo.rawFile instanceof File) {
    const base64Logo = await convertFileToBase64(logo);
    logo = { src: base64Logo, title: logo.title };
  }

  return {
    ...params,
    data: {
      ...params.data,
      logo,
    },
  };
};

async function processContactAvatar(
  params: UpdateParams<Contact>,
): Promise<UpdateParams<Contact>>;

async function processContactAvatar(
  params: CreateParams<Contact>,
): Promise<CreateParams<Contact>>;

async function processContactAvatar(
  params: CreateParams<Contact> | UpdateParams<Contact>,
): Promise<CreateParams<Contact> | UpdateParams<Contact>> {
  const { data } = params;
  if (data.avatar?.src || !data.email_jsonb || !data.email_jsonb.length) {
    return params;
  }
  const avatarUrl = await getContactAvatar(data);

  // Clone the data and modify the clone
  const newData = { ...data, avatar: { src: avatarUrl || undefined } };

  return { ...params, data: newData };
}

async function fetchAndUpdateCompanyData(
  params: UpdateParams<Contact>,
  dataProvider: DataProvider,
): Promise<UpdateParams<Contact>>;

async function fetchAndUpdateCompanyData(
  params: CreateParams<Contact>,
  dataProvider: DataProvider,
): Promise<CreateParams<Contact>>;

async function fetchAndUpdateCompanyData(
  params: CreateParams<Contact> | UpdateParams<Contact>,
  dataProvider: DataProvider,
): Promise<CreateParams<Contact> | UpdateParams<Contact>> {
  const { data } = params;
  const newData = { ...data };

  if (!newData.company_id) {
    return params;
  }

  const { data: company } = await dataProvider.getOne("companies", {
    id: newData.company_id,
  });

  if (!company) {
    return params;
  }

  newData.company_name = company.name;
  return { ...params, data: newData };
}

const dataProviderWithCustomMethod: CrmDataProvider = {
  ...baseDataProvider,
  unarchiveDeal: async (deal: Deal) => {
    // get all deals where stage is the same as the deal to unarchive
    const { data: deals } = await baseDataProvider.getList<Deal>("deals", {
      filter: { stage: deal.stage },
      pagination: { page: 1, perPage: 1000 },
      sort: { field: "index", order: "ASC" },
    });

    // set index for each deal starting from 1, if the deal to unarchive is found, set its index to the last one
    const updatedDeals = deals.map((d, index) => ({
      ...d,
      index: d.id === deal.id ? 0 : index + 1,
      archived_at: d.id === deal.id ? null : d.archived_at,
    }));

    return await Promise.all(
      updatedDeals.map((updatedDeal) =>
        dataProvider.update("deals", {
          id: updatedDeal.id,
          data: updatedDeal,
          previousData: deals.find((d) => d.id === updatedDeal.id),
        }),
      ),
    );
  },
  // We simulate a remote endpoint that is in charge of returning activity log
  getActivityLog: async (companyId?: Identifier) => {
    return getActivityLog(dataProvider, companyId);
  },
  signUp: async ({
    email,
    password,
    first_name,
    last_name,
  }: SignUpData): Promise<{ id: string; email: string; password: string }> => {
    const user = await baseDataProvider.create("sales", {
      data: {
        email,
        first_name,
        last_name,
      },
    });

    return {
      ...user.data,
      password,
    };
  },
  salesCreate: async ({ ...data }: SalesFormData): Promise<Sale> => {
    const response = await dataProvider.create("sales", {
      data: {
        ...data,
        password: "new_password",
      },
    });

    return response.data;
  },
  salesUpdate: async (
    id: Identifier,
    data: Partial<Omit<SalesFormData, "password">>,
  ): Promise<Sale> => {
    const { data: previousData } = await dataProvider.getOne<Sale>("sales", {
      id,
    });

    if (!previousData) {
      throw new Error("User not found");
    }

    const { data: sale } = await dataProvider.update<Sale>("sales", {
      id,
      data,
      previousData,
    });
    return { ...sale, user_id: sale.id.toString() };
  },
  isInitialized: async (): Promise<boolean> => {
    const sales = await dataProvider.getList<Sale>("sales", {
      filter: {},
      pagination: { page: 1, perPage: 1 },
      sort: { field: "id", order: "ASC" },
    });
    if (sales.data.length === 0) {
      return false;
    }
    return true;
  },
  updatePassword: async (id: Identifier): Promise<true> => {
    const currentUser = await authProvider.getIdentity?.();
    if (!currentUser) {
      throw new Error("User not found");
    }
    const { data: previousData } = await dataProvider.getOne<Sale>("sales", {
      id: currentUser.id,
    });

    if (!previousData) {
      throw new Error("User not found");
    }

    await dataProvider.update("sales", {
      id,
      data: {
        password: "demo_newPassword",
      },
      previousData,
    });

    return true;
  },
  mergeContacts: async (sourceId: Identifier, targetId: Identifier) => {
    return mergeContacts(sourceId, targetId, baseDataProvider);
  },
  saveBillingAccountBoundary: async (
    request: BillingAccountBoundaryRequest,
  ): Promise<BillingAccountBoundaryResponse> => {
    const now = DEMO_EVIDENCE_NOW;
    const account = request.account_id
      ? (
          await baseDataProvider.getOne<BillingAccount>("billing_accounts", {
            id: request.account_id,
          })
        ).data
      : null;
    const organizationId = account
      ? account.organization_id
      : (
          await baseDataProvider.getList("billing_organizations", {
            filter: { status: "active" },
            pagination: { page: 1, perPage: 2 },
            sort: { field: "id", order: "ASC" },
          })
        ).data[0]?.id;

    if (!organizationId) throw new Error("Account changes were not saved");

    const accountData: BillingAccount = {
      id: account?.id ?? crypto.randomUUID(),
      organization_id: String(organizationId),
      company_id: account?.company_id ?? null,
      customer_name: request.customer_name,
      billing_status: request.billing_status,
      created_at: account?.created_at ?? now,
      updated_at: now,
      ended_at: request.billing_status === "closed" ? now : null,
      end_reason:
        request.billing_status === "active" ? null : request.lifecycle_reason,
    };

    if (account) {
      await baseDataProvider.update<BillingAccount>("billing_accounts", {
        id: account.id,
        data: accountData,
        previousData: account,
      });
    } else {
      await baseDataProvider.create<BillingAccount>("billing_accounts", {
        data: accountData,
      });
    }

    const owners = await baseDataProvider.getList<BillingAccountOwner>(
      "billing_account_owners",
      {
        filter: { account_id: accountData.id, effective_until: null },
        pagination: { page: 1, perPage: 10 },
        sort: { field: "effective_from", order: "DESC" },
      },
    );
    const currentOwner = owners.data[0];
    if (currentOwner?.sales_id !== request.responsible_owner_sales_id) {
      if (currentOwner) {
        await baseDataProvider.update<BillingAccountOwner>(
          "billing_account_owners",
          {
            id: currentOwner.id,
            data: {
              effective_until: now,
              end_reason: "Responsible owner reassigned",
            },
            previousData: currentOwner,
          },
        );
      }
      await baseDataProvider.create<BillingAccountOwner>(
        "billing_account_owners",
        {
          data: {
            id: crypto.randomUUID(),
            organization_id: accountData.organization_id,
            account_id: accountData.id,
            sales_id: request.responsible_owner_sales_id,
            effective_from: now,
            effective_until: null,
            end_reason: null,
            created_at: now,
          },
        },
      );
    }

    for (const contact of request.billing_contacts) {
      const previousContact = contact.id
        ? (
            await baseDataProvider.getOne<BillingContact>("billing_contacts", {
              id: contact.id,
            })
          ).data
        : null;
      const contactData: BillingContact = {
        id: previousContact?.id ?? crypto.randomUUID(),
        organization_id: accountData.organization_id,
        account_id: accountData.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        preferred_contact_method: contact.preferred_contact_method,
        auth_user_id: contact.auth_user_id,
        active: contact.active,
        effective_from: previousContact?.effective_from ?? now,
        effective_until: contact.active ? null : now,
        end_reason: contact.active ? null : contact.end_reason,
        created_at: previousContact?.created_at ?? now,
        updated_at: now,
      };
      if (previousContact) {
        await baseDataProvider.update<BillingContact>("billing_contacts", {
          id: previousContact.id,
          data: contactData,
          previousData: previousContact,
        });
      } else {
        await baseDataProvider.create<BillingContact>("billing_contacts", {
          data: contactData,
        });
      }
    }

    return accountData;
  },
  getBillingAccountAccessSummary: async (
    accountId: string,
  ): Promise<BillingAccountAccessSummary> => {
    const { data: account } = await baseDataProvider.getOne<BillingAccount>(
      "billing_accounts",
      { id: accountId },
    );
    const { data: assignments } =
      await baseDataProvider.getList<BillingRoleAssignment>(
        "billing_role_assignments",
        {
          filter: { account_id: accountId },
          pagination: { page: 1, perPage: 100 },
          sort: { field: "created_at", order: "ASC" },
        },
      );
    const roles = await Promise.all(
      assignments.map(async (assignment) => {
        const [{ data: sale }, { data: role }] = await Promise.all([
          baseDataProvider.getOne<Sale>("sales", { id: assignment.sales_id }),
          baseDataProvider.getOne("billing_roles", { id: assignment.role }),
        ]);
        return {
          assignment_id: assignment.id,
          role: assignment.role,
          description: String(role.description),
          subject_display_name: `${sale.first_name} ${sale.last_name}`.trim(),
          scope_label: account.customer_name,
          effective_from: assignment.valid_from,
          effective_until: assignment.valid_until,
          status:
            assignment.disabled_at || assignment.valid_until
              ? ("ended" as const)
              : ("active" as const),
          reason: assignment.disabled_reason,
        };
      }),
    );
    return { roles, automation: [] };
  },
  assignBillingRole: async (request: {
    account_id: string;
    sales_id: number;
    role: string;
  }) => {
    const { data: account } = await baseDataProvider.getOne<BillingAccount>(
      "billing_accounts",
      { id: request.account_id },
    );
    const assignmentId = crypto.randomUUID();
    await baseDataProvider.create<BillingRoleAssignment>(
      "billing_role_assignments",
      {
        data: {
          id: assignmentId,
          organization_id: account.organization_id,
          account_id: account.id,
          sales_id: request.sales_id,
          role: request.role as BillingRoleAssignment["role"],
          valid_from: DEMO_EVIDENCE_NOW,
          valid_until: null,
          disabled_at: null,
          disabled_reason: null,
          created_at: DEMO_EVIDENCE_NOW,
          updated_at: DEMO_EVIDENCE_NOW,
        },
      },
    );
    return { assignment_id: assignmentId };
  },
  endBillingRoleAssignment: async (request: {
    assignment_id: string;
    reason: string;
  }) => {
    const { data: previousData } =
      await baseDataProvider.getOne<BillingRoleAssignment>(
        "billing_role_assignments",
        { id: request.assignment_id },
      );
    await baseDataProvider.update<BillingRoleAssignment>(
      "billing_role_assignments",
      {
        id: previousData.id,
        data: {
          valid_until: DEMO_EVIDENCE_NOW,
          disabled_at: DEMO_EVIDENCE_NOW,
          disabled_reason: request.reason,
          updated_at: DEMO_EVIDENCE_NOW,
        },
        previousData,
      },
    );
    return { assignment_id: previousData.id };
  },
  disableBillingAutomationPrincipal: async (request: {
    account_id: string;
    principal_id: string;
    reason: string;
  }) => {
    const { data: previousData } =
      await baseDataProvider.getOne<BillingAutomationPrincipal>(
        "billing_automation_principals",
        { id: request.principal_id },
      );
    await baseDataProvider.update<BillingAutomationPrincipal>(
      "billing_automation_principals",
      {
        id: previousData.id,
        data: {
          status: "disabled",
          disabled_at: DEMO_EVIDENCE_NOW,
          disabled_reason: request.reason,
          updated_at: DEMO_EVIDENCE_NOW,
        },
        previousData,
      },
    );
    return { principal_id: previousData.id };
  },
  beginBillingEvidenceUpload: async (
    request: BillingEvidenceUploadRequest,
  ): Promise<BillingEvidenceUploadResponse> => {
    const { data: account } = await baseDataProvider.getOne<BillingAccount>(
      "billing_accounts",
      { id: request.account_id },
    );
    const evidenceId = `31000000-0000-0000-0000-${request.sha256.slice(0, 12)}`;
    const evidence: BillingEvidenceMetadata = {
      id: evidenceId,
      organization_id: account.organization_id,
      account_id: account.id,
      kind: request.kind,
      original_filename: request.original_filename,
      uploader_label: "Jane Doe",
      mime_type: request.mime_type,
      size_bytes: request.size_bytes,
      inspection_status: "quarantined",
      inspection_reason_code: null,
      retention_expires_at: "2030-01-01T00:00:00.000Z",
      is_held: false,
      lifecycle_status: "active",
      end_reason: null,
      created_at: DEMO_EVIDENCE_NOW,
      updated_at: DEMO_EVIDENCE_NOW,
    };

    await baseDataProvider.create<BillingEvidenceMetadata>(
      "billing_evidence_support_safe",
      { data: evidence },
    );

    return {
      result: "ready",
      evidence_id: evidenceId,
      url: demoEvidenceCapability("upload", evidenceId),
      expires_at: DEMO_EVIDENCE_EXPIRES_AT,
    };
  },
  finalizeBillingEvidenceInspection: async (
    request: BillingEvidenceInspectionRequest,
  ): Promise<BillingEvidenceInspectionResponse> => {
    const { data: previousData } =
      await baseDataProvider.getOne<BillingEvidenceMetadata>(
        "billing_evidence_support_safe",
        { id: request.evidence_id },
      );
    if (previousData.inspection_status !== "quarantined") {
      return { result: "duplicate", reason_code: "DUPLICATE_COMMAND" };
    }

    await baseDataProvider.update<BillingEvidenceMetadata>(
      "billing_evidence_support_safe",
      {
        id: previousData.id,
        data: {
          inspection_status: request.decision,
          inspection_reason_code: request.reason_code,
          updated_at: DEMO_EVIDENCE_NOW,
        },
        previousData,
      },
    );
    return {
      result: "applied",
      reason_code: "INSPECTION_RECORDED",
      evidence_id: previousData.id,
      decision: request.decision,
    };
  },
  createBillingEvidenceDownload: async (
    request: BillingEvidenceDownloadRequest,
  ): Promise<BillingEvidenceDownloadResponse> => {
    const { data: evidence } =
      await baseDataProvider.getOne<BillingEvidenceMetadata>(
        "billing_evidence_support_safe",
        { id: request.evidence_id },
      );
    const reasonCode = getEvidenceDenialReason(evidence);
    if (reasonCode) {
      return { result: "denied", reason_code: reasonCode };
    }

    return {
      result: "ready",
      evidence_id: evidence.id,
      url: demoEvidenceCapability("download", evidence.id),
      expires_at: DEMO_EVIDENCE_EXPIRES_AT,
    };
  },
  getConfiguration: async (): Promise<ConfigurationContextValue> => {
    const { data } = await baseDataProvider.getOne("configuration", { id: 1 });
    return (data?.config as ConfigurationContextValue) ?? {};
  },
  updateConfiguration: async (
    config: ConfigurationContextValue,
  ): Promise<ConfigurationContextValue> => {
    const { data: prev } = await baseDataProvider.getOne("configuration", {
      id: 1,
    });
    await baseDataProvider.update("configuration", {
      id: 1,
      data: { config },
      previousData: prev,
    });
    return config;
  },
};

async function updateCompany(
  companyId: Identifier,
  updateFn: (company: Company) => Partial<Company>,
) {
  const { data: company } = await dataProvider.getOne<Company>("companies", {
    id: companyId,
  });

  return await dataProvider.update("companies", {
    id: companyId,
    data: {
      ...updateFn(company),
    },
    previousData: company,
  });
}

const processConfigLogo = async (logo: any): Promise<string> => {
  if (typeof logo === "string") return logo;
  if (logo?.rawFile instanceof File) {
    return (await convertFileToBase64(logo)) as string;
  }
  return logo?.src ?? "";
};

const preserveAttachmentMimeType = <
  NoteType extends { attachments?: Array<{ rawFile?: File; type?: string }> },
>(
  note: NoteType,
): NoteType => ({
  ...note,
  attachments: (note.attachments ?? []).map((attachment) => ({
    ...attachment,
    type: attachment.type ?? attachment.rawFile?.type,
  })),
});

export const dataProvider = withLifecycleCallbacks(
  withSupabaseFilterAdapter(dataProviderWithCustomMethod),
  [
    {
      resource: "configuration",
      beforeUpdate: async (params) => {
        const config = params.data.config;
        if (config) {
          config.lightModeLogo = await processConfigLogo(config.lightModeLogo);
          config.darkModeLogo = await processConfigLogo(config.darkModeLogo);
        }
        return params;
      },
    },
    {
      resource: "sales",
      beforeCreate: async (params) => {
        const { data } = params;
        // If administrator role is not set, we simply set it to false
        if (data.administrator == null) {
          data.administrator = false;
        }
        return params;
      },
      afterSave: async (data) => {
        // Since the current user is stored in localStorage in fakerest authProvider
        // we need to update it to keep information up to date in the UI
        const currentUser = await authProvider.getIdentity?.();
        if (currentUser?.id === data.id) {
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data));
        }
        return data;
      },
      beforeDelete: async (params) => {
        if (params.meta?.identity?.id == null) {
          throw new Error("Identity MUST be set in meta");
        }

        const newSaleId = params.meta.identity.id as Identifier;

        const [companies, contacts, contactNotes, deals] = await Promise.all([
          dataProvider.getList("companies", {
            filter: { sales_id: params.id },
            pagination: {
              page: 1,
              perPage: 10_000,
            },
            sort: { field: "id", order: "ASC" },
          }),
          dataProvider.getList("contacts", {
            filter: { sales_id: params.id },
            pagination: {
              page: 1,
              perPage: 10_000,
            },
            sort: { field: "id", order: "ASC" },
          }),
          dataProvider.getList("contact_notes", {
            filter: { sales_id: params.id },
            pagination: {
              page: 1,
              perPage: 10_000,
            },
            sort: { field: "id", order: "ASC" },
          }),
          dataProvider.getList("deals", {
            filter: { sales_id: params.id },
            pagination: {
              page: 1,
              perPage: 10_000,
            },
            sort: { field: "id", order: "ASC" },
          }),
        ]);

        await Promise.all([
          dataProvider.updateMany("companies", {
            ids: companies.data.map((company) => company.id),
            data: {
              sales_id: newSaleId,
            },
          }),
          dataProvider.updateMany("contacts", {
            ids: contacts.data.map((company) => company.id),
            data: {
              sales_id: newSaleId,
            },
          }),
          dataProvider.updateMany("contact_notes", {
            ids: contactNotes.data.map((company) => company.id),
            data: {
              sales_id: newSaleId,
            },
          }),
          dataProvider.updateMany("deals", {
            ids: deals.data.map((company) => company.id),
            data: {
              sales_id: newSaleId,
            },
          }),
        ]);

        return params;
      },
    } satisfies ResourceCallbacks<Sale>,
    {
      resource: "billing_accounts",
      beforeGetList: async (params) => {
        if (!params.filter?.q) return params;
        const { q, ...filter } = params.filter;
        return {
          ...params,
          filter: { ...filter, "customer_name@ilike": q },
        };
      },
    },
    {
      resource: "contacts",
      beforeCreate: async (createParams, dataProvider) => {
        const params = {
          ...createParams,
          data: {
            ...createParams.data,
            first_seen:
              createParams.data.first_seen ?? new Date().toISOString(),
            last_seen: createParams.data.last_seen ?? new Date().toISOString(),
          },
        };
        const newParams = await processContactAvatar(params);
        return fetchAndUpdateCompanyData(newParams, dataProvider);
      },
      afterCreate: async (result) => {
        if (result.data.company_id != null) {
          await updateCompany(result.data.company_id, (company) => ({
            nb_contacts: (company.nb_contacts ?? 0) + 1,
          }));
        }

        return result;
      },
      beforeUpdate: async (params) => {
        const newParams = await processContactAvatar(params);
        return fetchAndUpdateCompanyData(newParams, dataProvider);
      },
      afterDelete: async (result) => {
        if (result.data.company_id != null) {
          await updateCompany(result.data.company_id, (company) => ({
            nb_contacts: (company.nb_contacts ?? 1) - 1,
          }));
        }

        return result;
      },
    } satisfies ResourceCallbacks<Contact>,
    {
      resource: "tasks",
      afterCreate: async (result, dataProvider) => {
        // update the task count in the related contact
        const { contact_id } = result.data;
        const { data: contact } = await dataProvider.getOne("contacts", {
          id: contact_id,
        });
        await dataProvider.update("contacts", {
          id: contact_id,
          data: {
            nb_tasks: (contact.nb_tasks ?? 0) + 1,
          },
          previousData: contact,
        });
        return result;
      },
      beforeUpdate: async (params) => {
        const { data, previousData } = params;
        if (previousData.done_date !== data.done_date) {
          taskUpdateType = data.done_date
            ? TASK_MARKED_AS_DONE
            : TASK_MARKED_AS_UNDONE;
        } else {
          taskUpdateType = TASK_DONE_NOT_CHANGED;
        }
        return params;
      },
      afterUpdate: async (result, dataProvider) => {
        // update the contact: if the task is done, decrement the nb tasks, otherwise increment it
        const { contact_id } = result.data;
        const { data: contact } = await dataProvider.getOne("contacts", {
          id: contact_id,
        });
        if (taskUpdateType !== TASK_DONE_NOT_CHANGED) {
          await dataProvider.update("contacts", {
            id: contact_id,
            data: {
              nb_tasks:
                taskUpdateType === TASK_MARKED_AS_DONE
                  ? (contact.nb_tasks ?? 0) - 1
                  : (contact.nb_tasks ?? 0) + 1,
            },
            previousData: contact,
          });
        }
        return result;
      },
      afterDelete: async (result, dataProvider) => {
        // update the task count in the related contact
        const { contact_id } = result.data;
        const { data: contact } = await dataProvider.getOne("contacts", {
          id: contact_id,
        });
        await dataProvider.update("contacts", {
          id: contact_id,
          data: {
            nb_tasks: (contact.nb_tasks ?? 0) - 1,
          },
          previousData: contact,
        });
        return result;
      },
    } satisfies ResourceCallbacks<Task>,
    {
      resource: "companies",
      beforeCreate: async (params) => {
        const createParams = await processCompanyLogo(params);

        return {
          ...createParams,
          data: {
            ...createParams.data,
            created_at: new Date().toISOString(),
          },
        };
      },
      beforeUpdate: async (params) => {
        return await processCompanyLogo(params);
      },
      afterUpdate: async (result, dataProvider) => {
        // get all contacts of the company and for each contact, update the company_name
        const { id, name } = result.data;
        const { data: contacts } = await dataProvider.getList("contacts", {
          filter: { company_id: id },
          pagination: { page: 1, perPage: 1000 },
          sort: { field: "id", order: "ASC" },
        });

        const contactIds = contacts.map((contact) => contact.id);
        await dataProvider.updateMany("contacts", {
          ids: contactIds,
          data: { company_name: name },
        });
        return result;
      },
    } satisfies ResourceCallbacks<Company>,
    {
      resource: "deals",
      beforeCreate: async (params) => {
        return {
          ...params,
          data: {
            ...params.data,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        };
      },
      afterCreate: async (result) => {
        await updateCompany(result.data.company_id, (company) => ({
          nb_deals: (company.nb_deals ?? 0) + 1,
        }));

        return result;
      },
      beforeUpdate: async (params) => {
        return {
          ...params,
          data: {
            ...params.data,
            updated_at: new Date().toISOString(),
          },
        };
      },
      afterDelete: async (result) => {
        await updateCompany(result.data.company_id, (company) => ({
          nb_deals: (company.nb_deals ?? 1) - 1,
        }));

        return result;
      },
    } satisfies ResourceCallbacks<Deal>,
    {
      resource: "contact_notes",
      beforeSave: async (params) => preserveAttachmentMimeType(params),
    } satisfies ResourceCallbacks<ContactNote>,
    {
      resource: "deal_notes",
      beforeSave: async (params) => preserveAttachmentMimeType(params),
    } satisfies ResourceCallbacks<DealNote>,
  ],
) as CrmDataProvider;

/**
 * Convert a `File` object returned by the upload input into a base 64 string.
 * That's not the most optimized way to store images in production, but it's
 * enough to illustrate the idea of dataprovider decoration.
 */
const convertFileToBase64 = (file: { rawFile: Blob }): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    // We know result is a string as we used readAsDataURL
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file.rawFile);
  });
