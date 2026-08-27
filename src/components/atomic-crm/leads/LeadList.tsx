import { useState } from "react";
import { useGetIdentity, useListContext } from "ra-core";
import { List } from "@/components/admin/list";
import { SearchInput } from "@/components/admin/search-input";
import { SelectInput } from "@/components/admin/select-input";
import { FilterButton } from "@/components/admin/filter-form";
import { Button } from "@/components/ui/button";
import { LayoutGrid, Table as TableIcon } from "lucide-react";
import { Link } from "react-router";

import { useRealtimeSubscription } from "@/providers/realtimeProvider";
import { CrmErrorBoundary } from "../misc/CrmErrorBoundary";
import { TopToolbar } from "../layout/TopToolbar";
import type { Lead } from "../types";
import { LeadScoreBadge } from "./LeadScoreBadge";
import { LeadCreate } from "./LeadCreate";
import {
  leadStatuses,
  leadSources,
  leadStatusColorMap,
} from "./leadStatuses";

const LeadList = () => {
  const { identity } = useGetIdentity();
  const [createOpen, setCreateOpen] = useState(false);

  useRealtimeSubscription("leads");

  if (!identity) return null;

  const leadFilters = [
    <SearchInput source="q" alwaysOn />,
    <SelectInput
      source="status"
      choices={leadStatuses}
      optionText="label"
      optionValue="value"
      emptyText="All Statuses"
    />,
    <SelectInput
      source="source"
      choices={leadSources}
      optionText="label"
      optionValue="value"
      emptyText="All Sources"
    />,
  ];

  return (
    <>
      <List
        perPage={100}
        title={false}
        sort={{ field: "lead_score", order: "DESC" }}
        filters={leadFilters}
        actions={
          <LeadActions onCreateClick={() => setCreateOpen(true)} />
        }
        pagination={null}
      >
        <CrmErrorBoundary fallbackTitle="Lead pipeline failed to load">
          <LeadListContent />
        </CrmErrorBoundary>
      </List>
      <LeadCreate open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
};

const LeadActions = ({
  onCreateClick,
}: {
  onCreateClick: () => void;
}) => (
  <TopToolbar>
    <FilterButton />
    <Button size="sm" onClick={onCreateClick}>
      Add Lead
    </Button>
  </TopToolbar>
);

const LeadListContent = () => {
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const { data, isPending } = useListContext<Lead>();

  if (isPending) return null;
  if (!data?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground mb-2">No leads yet</p>
        <p className="text-sm text-muted-foreground">
          Add your first lead to get started
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* View toggle */}
      <div className="flex items-center gap-1 mb-4">
        <Button
          variant={view === "kanban" ? "default" : "ghost"}
          size="sm"
          onClick={() => setView("kanban")}
        >
          <LayoutGrid className="w-4 h-4 mr-1" />
          Board
        </Button>
        <Button
          variant={view === "table" ? "default" : "ghost"}
          size="sm"
          onClick={() => setView("table")}
        >
          <TableIcon className="w-4 h-4 mr-1" />
          Table
        </Button>
      </div>

      {view === "kanban" ? (
        <LeadKanban leads={data} />
      ) : (
        <LeadTable leads={data} />
      )}
    </div>
  );
};

// Kanban columns for lead statuses (excluding converted/lost for the board)
const kanbanStatuses = ["new", "contacted", "qualifying", "qualified"];

const LeadKanban = ({ leads }: { leads: Lead[] }) => {
  const leadsByStatus: Record<string, Lead[]> = {};
  for (const status of kanbanStatuses) {
    leadsByStatus[status] = [];
  }
  for (const lead of leads) {
    if (leadsByStatus[lead.status]) {
      leadsByStatus[lead.status].push(lead);
    }
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {kanbanStatuses.map((status) => {
        const statusConfig = leadStatuses.find((s) => s.value === status);
        const colors = leadStatusColorMap[status] ?? {
          bg: "rgba(156, 163, 175, 0.12)",
          text: "#999",
        };
        return (
          <div key={status} className="flex-1 min-w-[240px]">
            <div className="twenty-kanban-header">
              <span className="twenty-kanban-header__title">
                {statusConfig?.label ?? status}
              </span>
              <span
                className="twenty-kanban-header__value"
                style={{ backgroundColor: colors.bg, color: colors.text }}
              >
                {leadsByStatus[status].length}
              </span>
            </div>
            <div className="flex flex-col gap-2 mt-1 min-h-[80px]">
              {leadsByStatus[status].map((lead) => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const LeadCard = ({ lead }: { lead: Lead }) => (
  <Link
    to={`/leads/${lead.id}/show`}
    className="no-underline"
  >
    <div className="bg-card rounded-lg border border-border p-3.5 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer">
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {lead.first_name} {lead.last_name}
          </p>
          {lead.company_name && (
            <p className="text-xs text-muted-foreground truncate">
              {lead.company_name}
            </p>
          )}
        </div>
        <LeadScoreBadge score={lead.lead_score} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{lead.source}</span>
        <span className="text-xs text-muted-foreground">
          {new Date(lead.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    </div>
  </Link>
);

const LeadTable = ({ leads }: { leads: Lead[] }) => (
  <div className="border border-border rounded-lg overflow-hidden">
    <table className="w-full">
      <thead>
        <tr className="bg-muted/50 text-left">
          <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Name</th>
          <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Company</th>
          <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Source</th>
          <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Score</th>
          <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
          <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Created</th>
        </tr>
      </thead>
      <tbody>
        {leads.map((lead) => {
          const colors = leadStatusColorMap[lead.status] ?? {
            bg: "rgba(156, 163, 175, 0.12)",
            text: "#999",
          };
          return (
            <tr
              key={lead.id}
              className="border-t border-border hover:bg-muted/30 h-12"
            >
              <td className="px-4">
                <Link
                  to={`/leads/${lead.id}/show`}
                  className="text-sm font-medium text-foreground hover:underline no-underline"
                >
                  {lead.first_name} {lead.last_name}
                </Link>
              </td>
              <td className="px-4 text-sm text-muted-foreground">
                {lead.company_name}
              </td>
              <td className="px-4 text-sm text-muted-foreground">
                {lead.source}
              </td>
              <td className="px-4">
                <LeadScoreBadge score={lead.lead_score} />
              </td>
              <td className="px-4">
                <span
                  className="stage-pill"
                  style={{
                    backgroundColor: colors.bg,
                    color: colors.text,
                  }}
                >
                  {leadStatuses.find((s) => s.value === lead.status)?.label ??
                    lead.status}
                </span>
              </td>
              <td className="px-4 text-sm text-muted-foreground">
                {new Date(lead.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export default LeadList;
