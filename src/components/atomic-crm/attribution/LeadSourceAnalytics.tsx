import { useState } from "react";
import { useGetList } from "ra-core";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { leadSources } from "../leads/leadStatuses";

interface SourceRow {
  id: number;
  source: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  total_leads: number;
  qualified_leads: number;
  converted_leads: number;
  conversion_rate: number;
  avg_lead_score: number;
  avg_days_to_convert: number | null;
}

export const LeadSourceAnalytics = ({ sinceDate }: { sinceDate?: string }) => {
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const filter: Record<string, any> = {};
  if (sourceFilter !== "all") filter.source = sourceFilter;
  if (sinceDate) filter["created_at@gte"] = sinceDate;

  const { data, isPending } = useGetList<SourceRow>("lead_source_performance", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "total_leads", order: "DESC" },
    filter: Object.keys(filter).length > 0 ? filter : undefined,
  });

  if (isPending || !data) return null;

  // Funnel totals
  const totalLeads = data.reduce((sum, r) => sum + r.total_leads, 0);
  const totalQualified = data.reduce((sum, r) => sum + r.qualified_leads, 0);
  const totalConverted = data.reduce((sum, r) => sum + r.converted_leads, 0);

  const qualifiedRate =
    totalLeads > 0 ? ((totalQualified / totalLeads) * 100).toFixed(1) : "0";
  const convertedRate =
    totalQualified > 0
      ? ((totalConverted / totalQualified) * 100).toFixed(1)
      : "0";

  return (
    <div className="space-y-6">
      {/* Funnel visualization */}
      <div className="flex items-center justify-center gap-4">
        <FunnelStep
          label="Total Leads"
          value={totalLeads}
          color="#2196F3"
          width="w-48"
        />
        <FunnelArrow rate={`${qualifiedRate}%`} />
        <FunnelStep
          label="Qualified"
          value={totalQualified}
          color="#FF9800"
          width="w-40"
        />
        <FunnelArrow rate={`${convertedRate}%`} />
        <FunnelStep
          label="Converted"
          value={totalConverted}
          color="#4CAF50"
          width="w-32"
        />
      </div>

      {/* Source filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Filter by source:</span>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-48">
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

      {/* Detail table */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left">
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                Source
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                UTM Source
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                UTM Medium
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                Campaign
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">
                Leads
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">
                Qualified
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">
                Converted
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">
                Conv. %
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">
                Avg Score
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">
                Avg Days
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.id}
                className={`border-t border-border hover:bg-muted/30 h-10 ${
                  row.conversion_rate > 20 ? "bg-green-500/5" : ""
                }`}
              >
                <td className="px-3 font-medium">{row.source}</td>
                <td className="px-3 text-muted-foreground">
                  {row.utm_source || "—"}
                </td>
                <td className="px-3 text-muted-foreground">
                  {row.utm_medium || "—"}
                </td>
                <td className="px-3 text-muted-foreground">
                  {row.utm_campaign || "—"}
                </td>
                <td className="px-3 text-right">{row.total_leads}</td>
                <td className="px-3 text-right">{row.qualified_leads}</td>
                <td className="px-3 text-right">{row.converted_leads}</td>
                <td
                  className={`px-3 text-right font-medium ${row.conversion_rate > 20 ? "text-green-600" : ""}`}
                >
                  {row.conversion_rate}%
                </td>
                <td className="px-3 text-right">
                  {Math.round(row.avg_lead_score)}
                </td>
                <td className="px-3 text-right">
                  {row.avg_days_to_convert != null
                    ? `${row.avg_days_to_convert}d`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const FunnelStep = ({
  label,
  value,
  color,
  width,
}: {
  label: string;
  value: number;
  color: string;
  width: string;
}) => (
  <div
    className={`${width} rounded-lg py-4 text-center`}
    style={{ backgroundColor: `${color}15`, borderLeft: `3px solid ${color}` }}
  >
    <p className="text-2xl font-bold" style={{ color }}>
      {value}
    </p>
    <p className="text-xs text-muted-foreground mt-1">{label}</p>
  </div>
);

const FunnelArrow = ({ rate }: { rate: string }) => (
  <div className="flex flex-col items-center gap-0.5">
    <span className="text-xs font-medium text-muted-foreground">{rate}</span>
    <svg
      width="24"
      height="12"
      viewBox="0 0 24 12"
      className="text-muted-foreground"
    >
      <path
        d="M0 6h20M16 1l5 5-5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  </div>
);
