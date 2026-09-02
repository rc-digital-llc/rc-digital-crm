import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { useCanAccess, useDataProvider, useGetList, useNotify } from "ra-core";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";

import type {
  BillingAccessAutomationSummary,
  BillingAccessRoleSummary,
  CrmDataProvider,
} from "../providers/types";
import type { BillingAccount, Sale } from "../types";
import { invalidateBillingSecurityState } from "./billingAccess";

const assignableRoles = [
  { value: "administrator", label: "Billing administrator" },
  { value: "operator", label: "Billing operator" },
  { value: "reviewer", label: "Billing reviewer" },
  { value: "auditor", label: "Billing auditor" },
];

export const BillingAccountAccessPanels = ({
  account,
}: {
  account: BillingAccount;
}) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["billingAccessSummary", account.id],
    queryFn: () => dataProvider.getBillingAccountAccessSummary(account.id),
  });
  const roleManagement = useCanAccess({
    action: "create",
    resource: "billing_role_assignments",
    record: { account_id: account.id },
  });
  const automationManagement = useCanAccess({
    action: "create",
    resource: "billing_automation_principals",
    record: { account_id: account.id },
  });

  if (isPending) {
    return <Skeleton className="h-48 w-full" />;
  }
  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Billing access could not be loaded. Check your connection and try
          again.
        </AlertDescription>
      </Alert>
    );
  }

  const refreshSecurity = async () => {
    await invalidateBillingSecurityState();
    await refetch();
  };

  return (
    <div className="min-w-0 space-y-8">
      <HumanRolePanel
        account={account}
        assignments={data.roles}
        canManage={roleManagement.canAccess === true}
        onChanged={refreshSecurity}
      />
      <AutomationPanel
        account={account}
        principals={data.automation}
        canManage={automationManagement.canAccess === true}
        onChanged={refreshSecurity}
      />
      <p className="text-sm text-muted-foreground">
        Server authorization is enforced independently of these presentation
        controls.
      </p>
    </div>
  );
};

const HumanRolePanel = ({
  account,
  assignments,
  canManage,
  onChanged,
}: {
  account: BillingAccount;
  assignments: BillingAccessRoleSummary[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}) => {
  const [assignOpen, setAssignOpen] = useState(false);
  const [ending, setEnding] = useState<BillingAccessRoleSummary | null>(null);

  return (
    <section aria-labelledby="human-billing-roles" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 id="human-billing-roles" className="text-base font-semibold">
            Human billing roles
          </h3>
          <p className="text-sm text-muted-foreground">
            Multiple explicit roles combine their capabilities. Scope is the
            named customer or All RC Digital billing accounts.
          </p>
        </div>
        {canManage ? (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setAssignOpen(true)}
          >
            Assign billing role
          </Button>
        ) : null}
      </div>
      {assignments.length ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          {assignments.map((assignment) => (
            <Card
              key={assignment.assignment_id}
              className="min-w-0 bg-[#fafafa] py-0 dark:bg-[#1c1c1e]"
            >
              <CardContent className="space-y-3 p-4">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="break-words text-base font-semibold">
                      {assignment.subject_display_name}
                    </h4>
                    <p className="text-sm">{roleLabel(assignment.role)}</p>
                  </div>
                  <Badge
                    variant={
                      assignment.status === "active" ? "outline" : "secondary"
                    }
                  >
                    {assignment.status === "active" ? "Active" : "Ended"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {assignment.description}
                </p>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Scope</dt>
                    <dd>{assignment.scope_label}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Effective</dt>
                    <dd>
                      {format(
                        new Date(assignment.effective_from),
                        "MMM d, yyyy",
                      )}
                      {assignment.effective_until
                        ? ` to ${format(new Date(assignment.effective_until), "MMM d, yyyy")}`
                        : " onward"}
                    </dd>
                  </div>
                  {assignment.reason ? (
                    <div>
                      <dt className="text-muted-foreground">End reason</dt>
                      <dd className="break-words">{assignment.reason}</dd>
                    </div>
                  ) : null}
                </dl>
                {canManage && assignment.status === "active" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={() => setEnding(assignment)}
                  >
                    End role assignment
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          No billing roles are visible for this account.
        </p>
      )}
      <AssignRoleDialog
        account={account}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        onChanged={onChanged}
      />
      <EndRoleDialog
        assignment={ending}
        onOpenChange={(open) => !open && setEnding(null)}
        onChanged={onChanged}
      />
    </section>
  );
};

const AssignRoleDialog = ({
  account,
  open,
  onOpenChange,
  onChanged,
}: {
  account: BillingAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
}) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const { data: sales = [] } = useGetList<Sale>(
    "sales",
    {
      filter: { "disabled@neq": true },
      pagination: { page: 1, perPage: 100 },
      sort: { field: "last_name", order: "ASC" },
    },
    { enabled: open },
  );
  const [saleId, setSaleId] = useState("");
  const [role, setRole] = useState("operator");
  const [saving, setSaving] = useState(false);

  const assign = async () => {
    if (!saleId) return;
    setSaving(true);
    try {
      await dataProvider.assignBillingRole({
        account_id: account.id,
        sales_id: Number(saleId),
        role,
      });
      await onChanged();
      onOpenChange(false);
    } catch {
      notify("Billing role was not assigned.", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign billing role</DialogTitle>
          <DialogDescription>
            Assign an explicit role for {account.customer_name}. Access remains
            subject to server policy.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="billing-role-person">RC Digital staff member</Label>
            <select
              id="billing-role-person"
              className="h-11 rounded-md border bg-background px-3 text-base"
              value={saleId}
              onChange={(event) => setSaleId(event.target.value)}
            >
              <option value="">Select a staff member</option>
              {sales.map((sale) => (
                <option key={sale.id} value={sale.id}>
                  {sale.first_name} {sale.last_name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="billing-role-name">Billing role</Label>
            <select
              id="billing-role-name"
              className="h-11 rounded-md border bg-background px-3 text-base"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              {assignableRoles.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => onOpenChange(false)}
          >
            Keep current roles
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={!saleId || saving}
            onClick={() => void assign()}
          >
            Assign billing role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const EndRoleDialog = ({
  assignment,
  onOpenChange,
  onChanged,
}: {
  assignment: BillingAccessRoleSummary | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
}) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const endAssignment = async () => {
    if (!assignment || !reason.trim()) return;
    setSaving(true);
    try {
      await dataProvider.endBillingRoleAssignment({
        assignment_id: assignment.assignment_id,
        reason: reason.trim(),
      });
      await onChanged();
      setReason("");
      onOpenChange(false);
    } catch {
      notify("Billing role assignment was not ended.", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(assignment)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End role assignment</DialogTitle>
          <DialogDescription>
            End this billing role assignment? Access ends now and the assignment
            remains in the audit history. Enter a reason to continue.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-4">
          <Label htmlFor="billing-role-end-reason">End reason</Label>
          <Input
            id="billing-role-end-reason"
            className="h-11 text-base"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => onOpenChange(false)}
          >
            Keep assignment
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-11"
            disabled={!reason.trim() || saving}
            onClick={() => void endAssignment()}
          >
            End role assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AutomationPanel = ({
  account,
  principals,
  canManage,
  onChanged,
}: {
  account: BillingAccount;
  principals: BillingAccessAutomationSummary[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}) => {
  const [provisioningOpen, setProvisioningOpen] = useState(false);
  const [disabling, setDisabling] =
    useState<BillingAccessAutomationSummary | null>(null);
  return (
    <section aria-labelledby="billing-automation" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 id="billing-automation" className="text-base font-semibold">
            Automation principals
          </h3>
          <p className="text-sm text-muted-foreground">
            Machine identities never inherit human billing roles.
          </p>
        </div>
        {canManage ? (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setProvisioningOpen(true)}
          >
            Add automation principal
          </Button>
        ) : null}
      </div>
      {principals.length ? (
        <div className="space-y-4">
          {principals.map((principal) => (
            <Card
              key={principal.principal_id}
              className="min-w-0 bg-[#fafafa] py-0 dark:bg-[#1c1c1e]"
            >
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="break-words text-base font-semibold">
                    {principal.name}
                  </h4>
                  <Badge
                    variant={
                      principal.status === "active" ? "outline" : "destructive"
                    }
                  >
                    {principal.status === "active" ? "Active" : "Disabled"}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {principal.grants.map((grant) => (
                    <div key={grant.grant_id} className="rounded-md border p-3">
                      <p className="text-sm font-semibold">
                        {grant.command_name} · {grant.action_kind}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {grant.provider_label} · policy {grant.policy_version}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {grant.limit_summary} · {grant.status}
                      </p>
                    </div>
                  ))}
                </div>
                {principal.disabled_reason ? (
                  <p className="break-words text-sm">
                    Disable reason: {principal.disabled_reason}
                  </p>
                ) : null}
                {canManage && principal.status === "active" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={() => setDisabling(principal)}
                  >
                    Disable automation principal
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          No automation principal is configured for this account.
        </p>
      )}
      <AutomationProvisioningDialog
        open={provisioningOpen}
        onOpenChange={setProvisioningOpen}
      />
      <DisableAutomationDialog
        account={account}
        principal={disabling}
        onOpenChange={(open) => !open && setDisabling(null)}
        onChanged={onChanged}
      />
    </section>
  );
};

const AutomationProvisioningDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add automation principal</DialogTitle>
        <DialogDescription>
          Automation identities are provisioned through the protected server
          workflow. This browser accepts no identity or provider material.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button
          type="button"
          className="h-11"
          onClick={() => onOpenChange(false)}
        >
          Return to account access
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

const DisableAutomationDialog = ({
  account,
  principal,
  onOpenChange,
  onChanged,
}: {
  account: BillingAccount;
  principal: BillingAccessAutomationSummary | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
}) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const disable = async () => {
    if (!principal || !reason.trim()) return;
    setSaving(true);
    try {
      await dataProvider.disableBillingAutomationPrincipal({
        account_id: account.id,
        principal_id: principal.principal_id,
        reason: reason.trim(),
      });
      await onChanged();
      setReason("");
      onOpenChange(false);
    } catch {
      notify("Automation principal was not disabled.", { type: "error" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={Boolean(principal)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disable automation principal</DialogTitle>
          <DialogDescription>
            Disable this automation principal? Its future commands will be
            rejected; prior command and audit history will remain. Enter a
            reason to continue.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-4">
          <Label htmlFor="automation-disable-reason">Disable reason</Label>
          <Input
            id="automation-disable-reason"
            className="h-11 text-base"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => onOpenChange(false)}
          >
            Keep principal active
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-11"
            disabled={!reason.trim() || saving}
            onClick={() => void disable()}
          >
            Disable automation principal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const roleLabel = (role: string) =>
  assignableRoles.find((choice) => choice.value === role)?.label ?? role;
