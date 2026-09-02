import fs from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BILLING_ACCOUNT_EXPORT_FIELDS,
  buildBillingAccountExportRows,
  type BillingAccountExportSource,
} from "./billingAccountExport";
import {
  BILLING_ACCOUNT_EDITABLE_FIELDS,
  sanitizeBillingAccountFormValues,
  validateBillingAccountForm,
} from "./BillingAccountInputs";
import {
  canAccessBillingPresentation,
  isSensitiveBillingQueryKey,
  shouldPersistBillingQuery,
  type BillingCapabilitySummary,
} from "./billingAccess";

const readSource = (relativePath: string) =>
  fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("billing account list", () => {
  it("defines distinct desktop and mobile list branches with explicit states", () => {
    const source = readSource("./BillingAccountList.tsx");

    expect(source).toContain("export const BillingAccountList");
    expect(source).toContain("export const BillingAccountListMobile");
    expect(source).toContain("DataTable");
    expect(source).toContain("InfiniteListBase");
    expect(source).toContain("BillingAccountListLoading");
    expect(source).toContain("BillingAccountListEmpty");
    expect(source).toContain("BillingAccountListError");
    expect(source).toContain("Create billing account");
    expect(source).toContain("No billing accounts yet");
    expect(source).toContain("No billing accounts match these filters.");
    expect(source).toContain("Billing accounts could not be loaded.");

    const mobileBranch = source.slice(
      source.indexOf("export const BillingAccountListMobile"),
    );
    expect(mobileBranch).not.toContain("<DataTable");
    expect(mobileBranch).not.toMatch(/overflow-x-(?:auto|scroll)/);
  });

  it("keeps list actions and mobile detail targets at least 44px", () => {
    const source = readSource("./BillingAccountList.tsx");
    expect(source.match(/h-11/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain('aria-label="Open billing account details"');
  });

  it("maps the customer search control in both live and demo providers", () => {
    const liveProvider = readSource("../providers/supabase/dataProvider.ts");
    const demoProvider = readSource("../providers/fakerest/dataProvider.ts");

    for (const provider of [liveProvider, demoProvider]) {
      expect(provider).toMatch(
        /resource:\s*["']billing_accounts["'][\s\S]{0,180}beforeGetList/,
      );
      expect(provider).toMatch(/customer_name@ilike|customer_name/);
    }
  });
});

describe("billing account export", () => {
  it("projects exact safe business fields into a newly constructed row", () => {
    const record = {
      id: "account-secret-id",
      organization_id: "organization-secret-id",
      company_id: 99,
      customer_name: "Example Customer",
      billing_status: "active",
      created_at: "2026-09-01T20:00:00.000Z",
      updated_at: "2026-09-01T20:05:00.000Z",
      ended_at: null,
      end_reason: null,
      responsible_owner: {
        id: "assignment-secret-id",
        organization_id: "organization-secret-id",
        account_id: "account-secret-id",
        sales_id: 17,
        display_name: "RC Digital Owner",
        provider_reference: "provider-secret-ref",
      },
      billing_contacts: [
        {
          id: "contact-secret-id",
          organization_id: "organization-secret-id",
          account_id: "account-secret-id",
          name: "Primary Contact",
          email: "private@example.com",
          phone: "+15555550100",
          preferred_contact_method: "email",
          auth_user_id: "auth-secret-id",
          active: true,
          effective_from: "2026-09-01T20:00:00.000Z",
          effective_until: null,
          end_reason: null,
          created_at: "2026-09-01T20:00:00.000Z",
          updated_at: "2026-09-01T20:00:00.000Z",
        },
      ],
      role_assignments: [{ role: "administrator" }],
      provider_reference: "provider-secret-ref",
      object_path: "private/object/path",
      evidence_metadata: { sha256: "secret-sha" },
      signed_url: "https://secret.invalid/signed",
      token: "secret-token",
      audit_details: { source: "secret-audit" },
    } satisfies BillingAccountExportSource;

    const [exported] = buildBillingAccountExportRows([record]);

    expect(Object.keys(exported)).toEqual(BILLING_ACCOUNT_EXPORT_FIELDS);
    expect(exported).toEqual({
      customer_name: "Example Customer",
      billing_status: "Active",
      responsible_owner_display_name: "RC Digital Owner",
      active_contact_names: "Primary Contact",
      active_contact_preferred_methods: "Email",
      created_at: "2026-09-01T20:00:00.000Z",
      updated_at: "2026-09-01T20:05:00.000Z",
    });
  });

  it("omits every forbidden scope, contact, evidence, capability, and audit field", () => {
    const source = readSource("./billingAccountExport.ts");
    const serialized = JSON.stringify(
      buildBillingAccountExportRows([
        {
          id: "id-secret",
          organization_id: "org-secret",
          company_id: null,
          customer_name: "Safe customer",
          billing_status: "on_hold",
          created_at: "2026-09-01T20:00:00.000Z",
          updated_at: "2026-09-01T20:00:00.000Z",
          ended_at: null,
          end_reason: null,
          responsible_owner: null,
          billing_contacts: [],
          provider_reference: "provider-secret",
          object_path: "path-secret",
          signed_url: "url-secret",
          token: "token-secret",
          audit_details: "audit-secret",
        },
      ]),
    );

    expect(source).not.toMatch(/\.\.\.(?:record|account|contact|source)/);
    for (const forbidden of [
      "id-secret",
      "org-secret",
      "provider-secret",
      "path-secret",
      "url-secret",
      "token-secret",
      "audit-secret",
      "organization_id",
      "company_id",
      "sales_id",
      "email",
      "phone",
      "auth_user_id",
      "role_assignments",
      "provider_reference",
      "object_path",
      "evidence_metadata",
      "signed_url",
      "token",
      "audit_details",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("billing account forms", () => {
  it("requires identity, status, owner, and one complete active contact", () => {
    expect(validateBillingAccountForm({})).toMatchObject({
      customer_name: "Customer name is required.",
      billing_status: "Billing status is required.",
      responsible_owner_sales_id: "Responsible owner is required.",
      billing_contacts: "Add at least one active billing contact.",
    });

    expect(
      validateBillingAccountForm({
        customer_name: "Example Customer",
        billing_status: "active",
        responsible_owner_sales_id: 7,
        billing_contacts: [
          {
            name: "",
            email: "",
            phone: "",
            preferred_contact_method: "email",
            active: true,
          },
        ],
      }),
    ).toMatchObject({
      billing_contacts: {
        0: {
          name: "Contact name is required.",
          email: "Email is required for the preferred contact method.",
        },
      },
    });
  });

  it("requires a reason for on-hold, closed, and ended-contact states", () => {
    const values = {
      customer_name: "Example Customer",
      billing_status: "on_hold",
      responsible_owner_sales_id: 7,
      billing_contacts: [
        {
          name: "Primary Contact",
          email: "primary@example.com",
          phone: "",
          preferred_contact_method: "email",
          active: true,
        },
        {
          id: "ended-contact-id",
          name: "Ended Contact",
          email: "",
          phone: "+15555550100",
          preferred_contact_method: "phone",
          active: false,
          end_reason: "",
        },
      ],
    };

    expect(validateBillingAccountForm(values)).toMatchObject({
      lifecycle_reason: "Enter a reason for this billing status.",
      billing_contacts: {
        1: { end_reason: "Enter a reason to end this billing contact." },
      },
    });
  });

  it("constructs an exact editable payload without browser tenant authority", () => {
    const sanitized = sanitizeBillingAccountFormValues({
      id: "account-id",
      organization_id: "organization-id",
      customer_name: "  Example Customer  ",
      billing_status: "active",
      responsible_owner_sales_id: 7,
      lifecycle_reason: "",
      billing_contacts: [
        {
          id: "contact-id",
          organization_id: "organization-id",
          account_id: "account-id",
          name: "  Primary Contact ",
          email: " primary@example.com ",
          phone: " ",
          preferred_contact_method: "email",
          auth_user_id: "",
          active: true,
          end_reason: "",
          provider_reference: "provider-secret",
          object_path: "path-secret",
          token: "token-secret",
          audit_details: "audit-secret",
        },
      ],
      provider_reference: "provider-secret",
      object_path: "path-secret",
      token: "token-secret",
      audit_details: "audit-secret",
    });

    expect(Object.keys(sanitized)).toEqual(BILLING_ACCOUNT_EDITABLE_FIELDS);
    expect(sanitized).toEqual({
      customer_name: "Example Customer",
      billing_status: "active",
      responsible_owner_sales_id: 7,
      billing_contacts: [
        {
          id: "contact-id",
          name: "Primary Contact",
          email: "primary@example.com",
          phone: null,
          preferred_contact_method: "email",
          auth_user_id: null,
          active: true,
          end_reason: null,
        },
      ],
      lifecycle_reason: null,
    });
    expect(JSON.stringify(sanitized)).not.toMatch(
      /organization_id|account_id|provider|object_path|token|audit/i,
    );
  });

  it("uses grouped CreateBase and EditBase forms with no destructive control", () => {
    const inputs = readSource("./BillingAccountInputs.tsx");
    const create = readSource("./BillingAccountCreate.tsx");
    const edit = readSource("./BillingAccountEdit.tsx");
    const combined = `${inputs}\n${create}\n${edit}`;

    expect(create).toContain("<CreateBase");
    expect(edit).toContain("<EditBase");
    expect(combined).toContain("<Form");
    expect(inputs).toContain("Account identity and status");
    expect(inputs).toContain("Responsible RC Digital owner");
    expect(inputs).toContain("Authorized billing contacts");
    expect(inputs).toContain("<ReferenceInput");
    expect(inputs).toContain("<ArrayInput");
    expect(inputs).toContain("<SimpleFormIterator");
    expect(inputs).toContain("Add billing contact");
    expect(create).toContain("Create billing account");
    expect(edit).toContain("Save account changes");
    expect(combined).not.toMatch(
      /DeleteButton|\.delete\(|deleteMany|hard delete/i,
    );
  });
});

describe("billing account detail", () => {
  it("renders identity, ownership and contacts before stable access and evidence regions", () => {
    const source = readSource("./BillingAccountShow.tsx");
    const headings = [
      "Account identity and status",
      "Responsible RC Digital owner",
      "Authorized billing contacts",
      "Scoped access",
      "Evidence security",
    ];
    const positions = headings.map((heading) => source.indexOf(heading));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual(
      [...positions].sort((left, right) => left - right),
    );
    expect(source).toContain("<h1");
    expect(source.match(/<h2/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source).toContain('data-slot="billing-account-access"');
    expect(source).toContain('data-slot="billing-account-evidence"');
  });

  it("uses a two-column desktop shell and a one-column mobile shell", () => {
    const source = readSource("./BillingAccountShow.tsx");

    expect(source).toContain("BillingAccountShowDesktop");
    expect(source).toContain("BillingAccountShowMobile");
    expect(source).toContain("md:grid-cols-[minmax(0,1fr)_320px]");
    expect(source).toContain("grid-cols-1");
    expect(source).toContain("min-w-0");
    expect(source).not.toMatch(/overflow-x-(?:auto|scroll)|<DataTable|<table/i);
  });

  it("handles loading, authorization, missing, and closed states without overstating UI authority", () => {
    const source = readSource("./BillingAccountShow.tsx");

    expect(source).toContain("BillingAccountShowLoading");
    expect(source).toContain("BillingAccountShowError");
    expect(source).toContain("Billing account not found");
    expect(source).toContain("You do not have access to this billing account.");
    expect(source).toContain("useCanAccess");
    expect(source).toMatch(/billing_status\s*!==\s*["']closed["']/);
    expect(source).toContain("Server-side billing roles remain authoritative");
  });

  it("does not invent deferred money movement or customer portal content", () => {
    const source = readSource("./BillingAccountShow.tsx");

    expect(source).not.toMatch(
      /agreement workflow|invoice issuance|payment provider command|customer portal/i,
    );
  });
});

describe("billing access panels", () => {
  const summary = (
    globalCapabilities: string[],
    accountCapabilities: string[] = [],
  ): BillingCapabilitySummary => ({
    global_capabilities: globalCapabilities,
    accounts: accountCapabilities.length
      ? [{ account_id: "account-one", capabilities: accountCapabilities }]
      : [],
  });

  it("maps normalized capability unions to presentation without granting authority", () => {
    const administrator = summary([
      "account.read",
      "account.create",
      "account.update",
      "role.manage",
      "automation.manage",
      "evidence.read",
    ]);
    const operatorReviewer = summary(
      [],
      ["account.read", "account.update", "contact.manage", "evidence.review"],
    );

    expect(
      canAccessBillingPresentation(administrator, {
        resource: "billing_accounts",
        action: "create",
      }),
    ).toBe(true);
    expect(
      canAccessBillingPresentation(operatorReviewer, {
        resource: "billing_accounts",
        action: "edit",
        record: { id: "account-one" },
      }),
    ).toBe(true);
    expect(
      canAccessBillingPresentation(operatorReviewer, {
        resource: "billing_role_assignments",
        action: "create",
        record: { account_id: "account-one" },
      }),
    ).toBe(false);
    expect(
      canAccessBillingPresentation(operatorReviewer, {
        resource: "billing_evidence_support_safe",
        action: "review",
        record: { account_id: "account-one" },
      }),
    ).toBe(true);
  });

  it("keeps reviewer, auditor, and customer presentation least privileged", () => {
    const reviewer = summary([], ["account.read", "evidence.review"]);
    const auditor = summary(
      [],
      ["account.read", "audit.read", "automation.read"],
    );
    const customer = summary(
      [],
      ["account.read", "contact.self.read", "evidence.read", "evidence.access"],
    );

    for (const restricted of [reviewer, auditor, customer]) {
      expect(
        canAccessBillingPresentation(restricted, {
          resource: "billing_accounts",
          action: "edit",
          record: { id: "account-one" },
        }),
      ).toBe(false);
      expect(
        canAccessBillingPresentation(restricted, {
          resource: "billing_role_assignments",
          action: "create",
          record: { account_id: "account-one" },
        }),
      ).toBe(false);
    }
    expect(
      canAccessBillingPresentation(auditor, {
        resource: "billing_audit_events",
        action: "list",
        record: { account_id: "account-one" },
      }),
    ).toBe(true);
    expect(
      canAccessBillingPresentation(customer, {
        resource: "billing_evidence_support_safe",
        action: "access",
        record: { account_id: "account-one" },
      }),
    ).toBe(true);
  });

  it("renders reasoned role and automation actions without secret or raw provider fields", () => {
    const source = readSource("./BillingAccountAccessPanels.tsx");

    expect(source).toContain("Assign billing role");
    expect(source).toContain("End role assignment");
    expect(source).toContain("Add automation principal");
    expect(source).toContain("Disable automation principal");
    expect(source).toContain("All RC Digital billing accounts");
    expect(source).toContain("Server authorization is enforced independently");
    expect(source).not.toMatch(
      /provider_reference|auth_user_id|credential|password|secret|deleteMany|\.delete\(/i,
    );
  });

  it("fetches allowlisted capability summaries in live and demo auth providers", () => {
    const common = readSource("../providers/commons/canAccess.ts");
    const live = readSource("../providers/supabase/authProvider.ts");
    const demo = readSource("../providers/fakerest/authProvider.ts");

    expect(live).toContain("get_billing_capability_summary");
    expect(live).toContain("clearBillingCapabilityCache");
    expect(demo).toContain("getDemoBillingCapabilitySummary");
    expect(common).toContain("canAccessBillingPresentation");
    expect(common).toContain("presentation only");
  });
});

describe("billing evidence access and cache", () => {
  it("classifies every billing security query as non-persistable", () => {
    const sensitiveKeys = [
      ["billing_accounts", "getList"],
      ["getOne", "billing_contacts", { id: "account-one" }],
      ["billingAccessSummary", "account-one"],
      ["billing_automation_grants", { account_id: "account-one" }],
      ["billing_evidence_support_safe", "getManyReference"],
      ["billing_evidence_access_events", "getManyReference"],
      ["billing_audit_events", "getList"],
      ["auth", "canAccess", "billing_accounts"],
    ];

    sensitiveKeys.forEach((queryKey) => {
      expect(isSensitiveBillingQueryKey(queryKey)).toBe(true);
      expect(shouldPersistBillingQuery({ queryKey })).toBe(false);
    });
    expect(isSensitiveBillingQueryKey(["contacts", "getList"])).toBe(false);
    expect(shouldPersistBillingQuery({ queryKey: ["tasks", "getList"] })).toBe(
      true,
    );
  });

  it("renders safe evidence states and transient server-mediated actions", () => {
    const source = readSource("./BillingAccountEvidencePanel.tsx");

    expect(source).toContain(
      "Inspection required before this file can be opened.",
    );
    expect(source).toContain("Open evidence");
    expect(source).toContain("Upload evidence");
    expect(source).toContain("Access purpose");
    expect(source).toContain("Access history");
    expect(source).toContain("beginBillingEvidenceUpload");
    expect(source).toContain("createBillingEvidenceDownload");
    expect(source).toContain("crypto.subtle.digest");
    expect(source).toContain("registerBillingSecurityInvalidator");
    expect(source).toContain("capabilityRef.current = null");
    expect(source).toContain("clearTimeout");
    expect(source).toContain("window.open");
    expect(source).not.toMatch(
      /object_path|bucket_id|signed_url|localStorage|setQueryData|provider_reference/i,
    );
  });

  it("excludes sensitive dehydration and purges memory and storage on auth transitions", () => {
    const source = readSource("../root/CRM.tsx");

    expect(source).toContain("shouldDehydrateQuery");
    expect(source).toContain("shouldPersistBillingQuery");
    expect(source).toContain("removeQueries");
    expect(source).toContain("removeClient");
    expect(source).toContain("invalidateBillingSecurityState");
    expect(source).toMatch(/login:[\s\S]*purgeBillingSecurityState/);
    expect(source).toMatch(/handleCallback:[\s\S]*purgeBillingSecurityState/);
    expect(source).toMatch(/logout:[\s\S]*purgeBillingSecurityState/);
  });
});
