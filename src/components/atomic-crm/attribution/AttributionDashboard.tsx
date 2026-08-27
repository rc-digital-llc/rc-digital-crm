import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { analytics } from "@/providers/posthog";
import { CrmErrorBoundary } from "../misc/CrmErrorBoundary";
import {
  AttributionModelToggle,
  type AttributionModel,
} from "./AttributionModelToggle";
import { ChannelPerformance } from "./ChannelPerformance";
import { LeadSourceAnalytics } from "./LeadSourceAnalytics";
import { CustomerJourneyTimeline } from "./CustomerJourneyTimeline";

export type DateRange = "7" | "30" | "90" | "all";

const dateRangeOptions: { value: DateRange; label: string }[] = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

export function getDateRangeFilter(range: DateRange): string | undefined {
  if (range === "all") return undefined;
  const d = new Date();
  d.setDate(d.getDate() - Number(range));
  return d.toISOString();
}

export const AttributionDashboard = () => {
  const [attributionModel, setAttributionModel] =
    useState<AttributionModel>("first_touch");
  const [activeTab, setActiveTab] = useState("channels");
  const [dateRange, setDateRange] = useState<DateRange>("30");

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    analytics.attributionDashboardViewed({ tab_name: tab });
  };

  const sinceDate = useMemo(() => getDateRangeFilter(dateRange), [dateRange]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Attribution</h1>
        <div className="flex items-center gap-3">
          <Select
            value={dateRange}
            onValueChange={(v) => setDateRange(v as DateRange)}
          >
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dateRangeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AttributionModelToggle
            value={attributionModel}
            onChange={setAttributionModel}
          />
        </div>
      </div>

      {/* Tabs */}
      <CrmErrorBoundary fallbackTitle="Attribution dashboard failed to load">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="w-full justify-start border-b border-border bg-transparent p-0 h-auto">
            <TabsTrigger
              value="channels"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--rc-highlight)] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2"
            >
              Channel Performance
            </TabsTrigger>
            <TabsTrigger
              value="sources"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--rc-highlight)] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2"
            >
              Lead Sources
            </TabsTrigger>
            <TabsTrigger
              value="journeys"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--rc-highlight)] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2"
            >
              Customer Journeys
            </TabsTrigger>
          </TabsList>

          <TabsContent value="channels" className="mt-6">
            <CrmErrorBoundary fallbackTitle="Channel performance failed to load">
              <ChannelPerformance
                attributionModel={attributionModel}
                sinceDate={sinceDate}
              />
            </CrmErrorBoundary>
          </TabsContent>

          <TabsContent value="sources" className="mt-6">
            <CrmErrorBoundary fallbackTitle="Lead source analytics failed to load">
              <LeadSourceAnalytics sinceDate={sinceDate} />
            </CrmErrorBoundary>
          </TabsContent>

          <TabsContent value="journeys" className="mt-6">
            <CrmErrorBoundary fallbackTitle="Customer journeys failed to load">
              <CustomerJourneyTimeline sinceDate={sinceDate} />
            </CrmErrorBoundary>
          </TabsContent>
        </Tabs>
      </CrmErrorBoundary>
    </div>
  );
};

export default AttributionDashboard;
