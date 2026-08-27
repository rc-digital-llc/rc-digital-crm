import { ResponsiveBar } from "@nivo/bar";
import { useGetList } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign } from "lucide-react";

import type { AttributionModel } from "./AttributionModelToggle";
import { channelBarColors, channelLabel } from "./channelColors";

interface ChannelRow {
  id: number;
  channel: string;
  source: string;
  leads_generated: number;
  contacts_touched: number;
  deals_influenced: number;
  first_touch_leads: number;
  last_touch_deals: number;
  first_touch_revenue: number;
  last_touch_revenue: number;
  total_touchpoints: number;
}

export const ChannelPerformance = ({
  attributionModel,
  sinceDate,
}: {
  attributionModel: AttributionModel;
  sinceDate?: string;
}) => {
  const { data, isPending } = useGetList<ChannelRow>(
    "channel_attribution_summary",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "leads_generated", order: "DESC" },
      filter: sinceDate ? { "created_at@gte": sinceDate } : undefined,
    },
  );

  if (isPending || !data) return null;

  // Aggregate by channel for the bar chart
  const channelAgg: Record<string, number> = {};
  for (const row of data) {
    channelAgg[row.channel] =
      (channelAgg[row.channel] ?? 0) + row.leads_generated;
  }
  const barData = Object.entries(channelAgg)
    .map(([channel, leads]) => ({
      channel: channelLabel(channel),
      leads,
      color: channelBarColors[channel] ?? "#9CA3AF",
    }))
    .sort((a, b) => b.leads - a.leads);

  // Revenue by channel for comparison cards
  const revenueAgg: Record<string, { firstTouch: number; lastTouch: number }> =
    {};
  for (const row of data) {
    if (!revenueAgg[row.channel]) {
      revenueAgg[row.channel] = { firstTouch: 0, lastTouch: 0 };
    }
    revenueAgg[row.channel].firstTouch += row.first_touch_revenue;
    revenueAgg[row.channel].lastTouch += row.last_touch_revenue;
  }
  const topRevenueChannels = Object.entries(revenueAgg)
    .sort(
      (a, b) =>
        b[1].firstTouch + b[1].lastTouch - (a[1].firstTouch + a[1].lastTouch),
    )
    .slice(0, 4);

  const highlightKey =
    attributionModel === "first_touch" ? "firstTouch" : "lastTouch";

  return (
    <div className="space-y-6">
      {/* Bar chart */}
      {barData.length > 0 && (
        <div className="h-[300px]">
          <ResponsiveBar
            data={barData}
            indexBy="channel"
            keys={["leads"]}
            layout="horizontal"
            colors={({ data }) => (data as any).color}
            margin={{ top: 10, right: 30, bottom: 30, left: 120 }}
            padding={0.4}
            enableLabel={true}
            labelTextColor="#fff"
            enableGridY={false}
            axisBottom={{
              tickSize: 0,
              tickPadding: 8,
            }}
            axisLeft={{
              tickSize: 0,
              tickPadding: 12,
            }}
            tooltip={({ indexValue, value }) => (
              <div className="bg-secondary text-secondary-foreground px-3 py-1.5 rounded shadow text-sm">
                <strong>{indexValue}</strong>: {value} leads
              </div>
            )}
          />
        </div>
      )}

      {/* Revenue comparison cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {topRevenueChannels.map(([channel, rev]) => (
          <Card
            key={channel}
            className={`border ${
              highlightKey === "firstTouch" && rev.firstTouch > rev.lastTouch
                ? "border-green-500/50"
                : highlightKey === "lastTouch" && rev.lastTouch > rev.firstTouch
                  ? "border-blue-500/50"
                  : "border-border"
            }`}
          >
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">
                {channelLabel(channel)}
              </p>
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-3.5 h-3.5 text-green-600" />
                <span
                  className={`text-sm font-semibold ${attributionModel === "first_touch" ? "text-green-600" : ""}`}
                >
                  FT: ${rev.firstTouch.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 text-blue-600" />
                <span
                  className={`text-sm font-semibold ${attributionModel === "last_touch" ? "text-blue-600" : ""}`}
                >
                  LT: ${rev.lastTouch.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detail table */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left">
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                Channel
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                Source
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">
                Leads
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">
                Contacts
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">
                Deals
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">
                FT Leads
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">
                LT Deals
              </th>
              <th
                className={`px-3 py-2.5 text-xs font-medium text-right ${attributionModel === "first_touch" ? "text-green-600" : "text-muted-foreground"}`}
              >
                FT Revenue
              </th>
              <th
                className={`px-3 py-2.5 text-xs font-medium text-right ${attributionModel === "last_touch" ? "text-blue-600" : "text-muted-foreground"}`}
              >
                LT Revenue
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">
                Touchpoints
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.id}
                className="border-t border-border hover:bg-muted/30 h-10"
              >
                <td className="px-3 font-medium">
                  {channelLabel(row.channel)}
                </td>
                <td className="px-3 text-muted-foreground">
                  {row.source || "—"}
                </td>
                <td className="px-3 text-right">{row.leads_generated}</td>
                <td className="px-3 text-right">{row.contacts_touched}</td>
                <td className="px-3 text-right">{row.deals_influenced}</td>
                <td className="px-3 text-right">{row.first_touch_leads}</td>
                <td className="px-3 text-right">{row.last_touch_deals}</td>
                <td
                  className={`px-3 text-right ${attributionModel === "first_touch" ? "font-semibold text-green-600" : ""}`}
                >
                  ${row.first_touch_revenue.toLocaleString()}
                </td>
                <td
                  className={`px-3 text-right ${attributionModel === "last_touch" ? "font-semibold text-blue-600" : ""}`}
                >
                  ${row.last_touch_revenue.toLocaleString()}
                </td>
                <td className="px-3 text-right">{row.total_touchpoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
