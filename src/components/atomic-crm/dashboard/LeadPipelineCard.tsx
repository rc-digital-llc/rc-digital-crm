import { useGetList } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";
import { Filter } from "lucide-react";
import { Link } from "react-router";

import type { Lead } from "../types";

const sevenDaysAgo = new Date(
  Date.now() - 7 * 24 * 60 * 60 * 1000,
).toISOString();

export const LeadPipelineCard = () => {
  const { data, isPending } = useGetList<Lead>("leads", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "created_at", order: "DESC" },
    filter: { "created_at@gte": sevenDaysAgo },
  });

  if (isPending) return null;

  const leads = data ?? [];
  const newLeads = leads.filter((l) => l.status === "new").length;
  const qualified = leads.filter((l) => l.status === "qualified").length;
  const converted = leads.filter((l) => l.status === "converted").length;
  const total = leads.length;

  return (
    <Card className="border border-border shadow-sm">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "rgba(33, 150, 243, 0.12)" }}
          >
            <Filter className="w-4 h-4 text-[#2196F3]" />
          </div>
          <h3 className="text-base font-semibold">Lead Pipeline</h3>
          <span className="text-xs text-muted-foreground ml-auto">
            This week
          </span>
        </div>

        {/* Mini funnel */}
        <div className="space-y-2">
          <FunnelBar
            label="New"
            value={newLeads}
            total={total}
            color="#2196F3"
          />
          <FunnelBar
            label="Qualified"
            value={qualified}
            total={total}
            color="#FF9800"
          />
          <FunnelBar
            label="Converted"
            value={converted}
            total={total}
            color="#4CAF50"
          />
        </div>

        <Link
          to="/leads"
          className="text-xs text-[var(--rc-highlight)] hover:underline mt-3 inline-block no-underline"
        >
          View all leads
        </Link>
      </CardContent>
    </Card>
  );
};

const FunnelBar = ({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) => {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-16">{label}</span>
      <div className="flex-1 h-5 bg-muted/50 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-sm font-medium w-8 text-right">{value}</span>
    </div>
  );
};
