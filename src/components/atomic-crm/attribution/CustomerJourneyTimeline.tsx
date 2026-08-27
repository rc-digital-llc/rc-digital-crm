import { useState } from "react";
import { useGetList, useDataProvider } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  MousePointerClick,
} from "lucide-react";

import { analytics } from "@/providers/posthog";
import { CrmErrorBoundary } from "../misc/CrmErrorBoundary";
import { leadSources } from "../leads/leadStatuses";
import { channelColors } from "./channelColors";
import { TouchpointTimeline, type Touchpoint } from "./TouchpointTimeline";

interface JourneyRow {
  id: number;
  person_name: string;
  email: string;
  lead_id: number;
  contact_id: number | null;
  deal_id: number | null;
  lead_source: string;
  lead_created: string;
  converted_at: string | null;
  deal_created: string | null;
  deal_stage: string | null;
  deal_amount: number | null;
  total_touchpoints: number;
  first_touch_date: string | null;
  last_touch_date: string | null;
  days_in_funnel: number;
}

export const CustomerJourneyTimeline = ({
  sinceDate,
}: {
  sinceDate?: string;
}) => {
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<string>("days_in_funnel");

  const filter: Record<string, any> = {};
  if (sourceFilter !== "all") filter.lead_source = sourceFilter;
  if (sinceDate) filter["lead_created@gte"] = sinceDate;

  const { data, isPending } = useGetList<JourneyRow>("customer_journeys", {
    pagination: { page: 1, perPage: 50 },
    sort: { field: sortField, order: "DESC" },
    filter: Object.keys(filter).length > 0 ? filter : undefined,
  });

  if (isPending || !data) return null;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Source:</span>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {leadSources.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort:</span>
          <Select value={sortField} onValueChange={setSortField}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="days_in_funnel">Days in Funnel</SelectItem>
              <SelectItem value="deal_amount">Deal Amount</SelectItem>
              <SelectItem value="total_touchpoints">Touchpoints</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Journey cards */}
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No customer journeys found
        </p>
      ) : (
        <div className="space-y-3">
          {data.map((journey) => (
            <JourneyCard key={journey.id} journey={journey} />
          ))}
        </div>
      )}
    </div>
  );
};

const JourneyCard = ({ journey }: { journey: JourneyRow }) => {
  const [expanded, setExpanded] = useState(false);

  const sourceColors = channelColors[journey.lead_source] ?? {
    bg: "rgba(156, 163, 175, 0.12)",
    text: "#9CA3AF",
  };

  const handleToggle = () => {
    if (!expanded) {
      analytics.customerJourneyExpanded({
        lead_id: journey.lead_id,
        touchpoint_count: journey.total_touchpoints,
      });
    }
    setExpanded(!expanded);
  };

  // Journey timeline bar stages
  const stages: { label: string; date: string | null; active: boolean }[] = [
    { label: "Lead Created", date: journey.lead_created, active: true },
    {
      label: "Converted",
      date: journey.converted_at,
      active: !!journey.converted_at,
    },
    {
      label: "Deal Created",
      date: journey.deal_created,
      active: !!journey.deal_created,
    },
    {
      label: journey.deal_stage
        ? journey.deal_stage.charAt(0).toUpperCase() +
          journey.deal_stage.slice(1)
        : "No Deal",
      date: null,
      active: !!journey.deal_stage,
    },
  ];

  return (
    <Card className="border border-border">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold">
                {journey.person_name}
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: sourceColors.bg,
                  color: sourceColors.text,
                }}
              >
                {journey.lead_source}
              </span>
            </div>
            {journey.email && (
              <p className="text-xs text-muted-foreground">{journey.email}</p>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MousePointerClick className="w-3 h-3" />
              {journey.total_touchpoints} touches
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {Math.round(journey.days_in_funnel)}d
            </span>
            {journey.deal_amount != null && (
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <DollarSign className="w-3 h-3" />
                {journey.deal_amount.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Timeline bar */}
        <div className="flex items-center gap-0 mt-3">
          {stages.map((stage, i) => (
            <div key={stage.label} className="flex items-center">
              {i > 0 && (
                <div
                  className={`h-0.5 w-8 ${stage.active ? "bg-green-500" : "bg-border"}`}
                />
              )}
              <div className="flex flex-col items-center">
                <div
                  className={`w-3 h-3 rounded-full border-2 ${
                    stage.active
                      ? "bg-green-500 border-green-500"
                      : "bg-background border-border"
                  }`}
                />
                <span className="text-[10px] text-muted-foreground mt-1 whitespace-nowrap">
                  {stage.label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Expand button */}
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 h-7 text-xs"
          onClick={handleToggle}
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3 h-3 mr-1" /> Hide touchpoints
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3 mr-1" /> Show touchpoints
            </>
          )}
        </Button>

        {/* Expanded touchpoint timeline */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-border">
            <CrmErrorBoundary fallbackTitle="Touchpoint timeline failed to load">
              <TouchpointDetails
                leadId={journey.lead_id}
                contactId={journey.contact_id}
              />
            </CrmErrorBoundary>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const TouchpointDetails = ({
  leadId,
  contactId,
}: {
  leadId: number;
  contactId: number | null;
}) => {
  const dataProvider = useDataProvider();
  const { data } = useQuery({
    queryKey: ["touchpoints", "getList", { leadId, contactId }],
    queryFn: async () => {
      // Fetch touchpoints for this lead (and contact if converted)
      const filters: Record<string, any> = {};
      if (leadId) filters.lead_id = leadId;

      const result = await dataProvider.getList<Touchpoint>("touchpoints", {
        filter: filters,
        sort: { field: "created_at", order: "ASC" },
        pagination: { page: 1, perPage: 100 },
      });

      // If there's a contact, also fetch contact touchpoints
      if (contactId) {
        const contactResult = await dataProvider.getList<Touchpoint>(
          "touchpoints",
          {
            filter: { contact_id: contactId },
            sort: { field: "created_at", order: "ASC" },
            pagination: { page: 1, perPage: 100 },
          },
        );
        // Merge and deduplicate by id
        const allTouchpoints = [...result.data, ...contactResult.data];
        const seen = new Set<number>();
        const unique = allTouchpoints.filter((tp) => {
          if (seen.has(tp.id)) return false;
          seen.add(tp.id);
          return true;
        });
        unique.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
        return { data: unique, total: unique.length };
      }

      return result;
    },
  });

  return <TouchpointTimeline touchpoints={data?.data ?? []} />;
};
