import { useGetList } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { Link } from "react-router";

import { channelColors, channelLabel } from "../attribution/channelColors";

interface ChannelRow {
  id: number;
  channel: string;
  leads_generated: number;
}

export const TopChannelsCard = () => {
  const { data, isPending } = useGetList<ChannelRow>(
    "channel_attribution_summary",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "leads_generated", order: "DESC" },
    },
  );

  if (isPending || !data) return null;

  // Aggregate by channel and take top 3
  const agg: Record<string, number> = {};
  for (const row of data) {
    agg[row.channel] = (agg[row.channel] ?? 0) + row.leads_generated;
  }
  const topChannels = Object.entries(agg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const maxLeads = topChannels[0]?.[1] ?? 1;

  return (
    <Card className="border border-border shadow-sm">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "rgba(124, 94, 233, 0.12)" }}
          >
            <BarChart3 className="w-4 h-4 text-[#7C5EE9]" />
          </div>
          <h3 className="text-base font-semibold">Top Channels</h3>
          <span className="text-xs text-muted-foreground ml-auto">
            All time
          </span>
        </div>

        <div className="space-y-3">
          {topChannels.map(([channel, leads]) => {
            const colors = channelColors[channel] ?? {
              bg: "rgba(156, 163, 175, 0.12)",
              text: "#9CA3AF",
            };
            const pct = (leads / maxLeads) * 100;
            return (
              <div key={channel}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">
                    {channelLabel(channel)}
                  </span>
                  <span className="text-sm" style={{ color: colors.text }}>
                    {leads} leads
                  </span>
                </div>
                <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: colors.text,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <Link
          to="/attribution"
          className="text-xs text-[var(--rc-highlight)] hover:underline mt-3 inline-block no-underline"
        >
          View attribution
        </Link>
      </CardContent>
    </Card>
  );
};
