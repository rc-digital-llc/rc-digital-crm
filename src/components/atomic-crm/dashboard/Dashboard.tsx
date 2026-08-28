import {
  Building2,
  DollarSign,
  FolderKanban,
  TrendingUp,
  Users,
} from "lucide-react";
import { useGetList } from "ra-core";

import type { Contact, ContactNote, Deal } from "../types";
import { CrmErrorBoundary } from "../misc/CrmErrorBoundary";
import { DashboardActivityLog } from "./DashboardActivityLog";
import { DashboardStepper } from "./DashboardStepper";
import { DealsChart } from "./DealsChart";
import { HotContacts } from "./HotContacts";
import { LeadPipelineCard } from "./LeadPipelineCard";
import { TasksList } from "./TasksList";
import { TopChannelsCard } from "./TopChannelsCard";
import { Welcome } from "./Welcome";

const MetricCard = ({
  icon,
  iconBg,
  label,
  value,
  trend,
  trendUp,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
}) => (
  <div className="twenty-metric-card">
    <div
      className="twenty-metric-card__icon"
      style={{ backgroundColor: iconBg }}
    >
      {icon}
    </div>
    <div className="twenty-metric-card__content">
      <div className="twenty-metric-card__label">{label}</div>
      <div className="twenty-metric-card__value">{value}</div>
      {trend && (
        <div
          className={`twenty-metric-card__trend ${trendUp ? "twenty-metric-card__trend--up" : "twenty-metric-card__trend--down"}`}
        >
          <TrendingUp
            className="w-3 h-3"
            style={{ transform: trendUp ? "none" : "rotate(180deg)" }}
          />
          {trend}
        </div>
      )}
    </div>
  </div>
);

export const Dashboard = () => {
  const {
    data: dataContact,
    total: totalContact,
    isPending: isPendingContact,
  } = useGetList<Contact>("contacts", {
    pagination: { page: 1, perPage: 1 },
  });

  const { total: totalContactNotes, isPending: isPendingContactNotes } =
    useGetList<ContactNote>("contact_notes", {
      pagination: { page: 1, perPage: 1 },
    });

  const {
    data: dealData,
    total: totalDeal,
    isPending: isPendingDeal,
  } = useGetList<Deal>("deals", {
    pagination: { page: 1, perPage: 100 },
  });

  const { total: totalCompanies } = useGetList("companies", {
    pagination: { page: 1, perPage: 1 },
  });

  const isPending = isPendingContact || isPendingContactNotes || isPendingDeal;

  if (isPending) {
    return null;
  }

  if (!totalContact) {
    return <DashboardStepper step={1} />;
  }

  if (!totalContactNotes) {
    return <DashboardStepper step={2} contactId={dataContact?.[0]?.id} />;
  }

  const totalPipelineValue =
    dealData?.reduce((sum, deal) => sum + (deal.amount || 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      {import.meta.env.VITE_IS_DEMO === "true" ? <Welcome /> : null}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<Users className="w-5 h-5 text-[#7C5EE9]" />}
          iconBg="rgba(124, 94, 233, 0.12)"
          label="Total Contacts"
          value={totalContact ?? 0}
        />
        <MetricCard
          icon={<Building2 className="w-5 h-5 text-[#00BCD4]" />}
          iconBg="rgba(0, 188, 212, 0.12)"
          label="Companies"
          value={totalCompanies ?? 0}
        />
        <MetricCard
          icon={<FolderKanban className="w-5 h-5 text-[#FF9800]" />}
          iconBg="rgba(255, 152, 0, 0.12)"
          label="Active Deals"
          value={totalDeal ?? 0}
        />
        <MetricCard
          icon={<DollarSign className="w-5 h-5 text-[#4CAF50]" />}
          iconBg="rgba(76, 175, 80, 0.12)"
          label="Pipeline Value"
          value={totalPipelineValue.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
            notation: "compact",
            minimumSignificantDigits: 3,
          })}
        />
      </div>

      {/* Main content grid */}
      <CrmErrorBoundary fallbackTitle="Dashboard failed to load">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-3">
            <div className="flex flex-col gap-4">
              <HotContacts />
              <LeadPipelineCard />
              <TopChannelsCard />
            </div>
          </div>
          <div className="md:col-span-6">
            <div className="flex flex-col gap-6">
              {totalDeal ? <DealsChart /> : null}
              <DashboardActivityLog />
            </div>
          </div>
          <div className="md:col-span-3">
            <TasksList />
          </div>
        </div>
      </CrmErrorBoundary>
    </div>
  );
};
