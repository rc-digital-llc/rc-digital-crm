import { useState } from "react";
import {
  ShowBase,
  useDataProvider,
  useGetIdentity,
  useNotify,
  useRefresh,
  useShowContext,
  useUpdate,
} from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  ExternalLink,
  FileEdit,
  FileText,
  Globe,
  Handshake,
  Linkedin,
  Mail,
  MailOpen,
  Phone,
  RefreshCw,
  Send,
  StickyNote,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { Link } from "react-router";

import { analytics } from "@/providers/posthog";
import { CrmErrorBoundary } from "../misc/CrmErrorBoundary";
import type { Lead, LeadActivity } from "../types";
import { TouchpointTimeline, type Touchpoint } from "../attribution/TouchpointTimeline";
import { LeadScoreBadge } from "./LeadScoreBadge";
import { LeadConvert } from "./LeadConvert";
import {
  leadStatuses,
  leadStatusColorMap,
  activityScoreDefaults,
} from "./leadStatuses";

export const LeadShow = () => {
  return (
    <ShowBase>
      <CrmErrorBoundary fallbackTitle="Lead details failed to load">
        <LeadShowContent />
      </CrmErrorBoundary>
    </ShowBase>
  );
};

const activityIcons: Record<string, React.ReactNode> = {
  page_view: <FileText className="w-4 h-4" />,
  form_submit: <FileEdit className="w-4 h-4" />,
  email_open: <Mail className="w-4 h-4" />,
  email_click: <MailOpen className="w-4 h-4" />,
  email_sent: <Send className="w-4 h-4" />,
  call: <Phone className="w-4 h-4" />,
  meeting: <Handshake className="w-4 h-4" />,
  note: <StickyNote className="w-4 h-4" />,
  status_change: <RefreshCw className="w-4 h-4" />,
  score_change: <TrendingUp className="w-4 h-4" />,
};

const LeadShowContent = () => {
  const { record, isPending } = useShowContext<Lead>();
  const [convertOpen, setConvertOpen] = useState(false);
  const [activityModalOpen, setActivityModalOpen] = useState(false);

  if (isPending || !record) return null;

  const statusColors = leadStatusColorMap[record.status] ?? {
    bg: "rgba(156, 163, 175, 0.12)",
    text: "#999",
  };

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/leads"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground no-underline"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Leads
      </Link>

      <div className="twenty-detail-layout">
        {/* Main content - 60% */}
        <div className="space-y-6">
          {/* Header card */}
          <Card className="border border-border shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-foreground">
                    {record.first_name} {record.last_name}
                  </h1>
                  {record.company_name && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {record.job_title && `${record.job_title} at `}
                      {record.company_name}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <LeadScoreBadge score={record.lead_score} />
                  <span
                    className="stage-pill"
                    style={{
                      backgroundColor: statusColors.bg,
                      color: statusColors.text,
                    }}
                  >
                    {leadStatuses.find((s) => s.value === record.status)?.label ??
                      record.status}
                  </span>
                </div>
              </div>

              <Separator className="my-4" />

              {/* Contact info */}
              <div className="grid grid-cols-2 gap-4">
                {record.email && (
                  <InfoRow
                    icon={<Mail className="w-4 h-4 text-muted-foreground" />}
                    label="Email"
                    value={record.email}
                  />
                )}
                {record.phone && (
                  <InfoRow
                    icon={<Phone className="w-4 h-4 text-muted-foreground" />}
                    label="Phone"
                    value={record.phone}
                  />
                )}
                {record.linkedin_url && (
                  <InfoRow
                    icon={<Linkedin className="w-4 h-4 text-muted-foreground" />}
                    label="LinkedIn"
                    value={
                      <a
                        href={record.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-500 hover:underline inline-flex items-center gap-1"
                      >
                        Profile <ExternalLink className="w-3 h-3" />
                      </a>
                    }
                  />
                )}
                {record.job_title && (
                  <InfoRow
                    icon={<UserPlus className="w-4 h-4 text-muted-foreground" />}
                    label="Job Title"
                    value={record.job_title}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Source info card */}
          <Card className="border border-border shadow-sm">
            <CardContent className="pt-6">
              <h3 className="text-base font-semibold mb-3">Source Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <InfoRow
                  icon={<Globe className="w-4 h-4 text-muted-foreground" />}
                  label="Source"
                  value={record.source}
                />
                {record.source_detail && (
                  <InfoRow label="Detail" value={record.source_detail} />
                )}
                {record.utm_source && (
                  <InfoRow label="UTM Source" value={record.utm_source} />
                )}
                {record.utm_medium && (
                  <InfoRow label="UTM Medium" value={record.utm_medium} />
                )}
                {record.utm_campaign && (
                  <InfoRow label="UTM Campaign" value={record.utm_campaign} />
                )}
                {record.landing_page_url && (
                  <InfoRow label="Landing Page" value={record.landing_page_url} />
                )}
                {record.referrer_url && (
                  <InfoRow label="Referrer" value={record.referrer_url} />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Score Breakdown */}
          <Card className="border border-border shadow-sm">
            <CardContent className="pt-6">
              <h3 className="text-base font-semibold mb-3">Score Breakdown</h3>
              <ScoreBreakdown leadId={record.id as number} />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - 40% */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card className="border border-border shadow-sm">
            <CardContent className="pt-6 space-y-3">
              <h3 className="text-base font-semibold mb-2">Quick Actions</h3>
              <StatusChanger lead={record} />
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setActivityModalOpen(true)}
              >
                <StickyNote className="w-4 h-4 mr-2" />
                Log Activity
              </Button>
              {record.status !== "converted" && (
                <Button
                  className="w-full"
                  onClick={() => setConvertOpen(true)}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Convert to Contact
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card className="border border-border shadow-sm">
            <CardContent className="pt-6">
              <h3 className="text-base font-semibold mb-4">Activity Timeline</h3>
              <ActivityTimeline leadId={record.id as number} />
            </CardContent>
          </Card>

          {/* Touchpoint Timeline */}
          <Card className="border border-border shadow-sm">
            <CardContent className="pt-6">
              <h3 className="text-base font-semibold mb-4">Touchpoints</h3>
              <LeadTouchpoints leadId={record.id as number} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modals */}
      {convertOpen && (
        <LeadConvert
          open={convertOpen}
          onClose={() => setConvertOpen(false)}
          lead={record}
        />
      )}
      {activityModalOpen && (
        <LogActivityModal
          open={activityModalOpen}
          onClose={() => setActivityModalOpen(false)}
          lead={record}
        />
      )}
    </div>
  );
};

const InfoRow = ({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) => (
  <div>
    <span className="text-xs text-muted-foreground block mb-1">{label}</span>
    <div className="flex items-center gap-1.5">
      {icon}
      {typeof value === "string" ? (
        <span className="text-sm font-medium">{value}</span>
      ) : (
        value
      )}
    </div>
  </div>
);

const StatusChanger = ({ lead }: { lead: Lead }) => {
  const [update] = useUpdate();
  const notify = useNotify();
  const refresh = useRefresh();

  const handleChange = (newStatus: string) => {
    const oldStatus = lead.status;
    update(
      "leads",
      {
        id: lead.id,
        data: { status: newStatus },
        previousData: lead,
      },
      {
        onSuccess: () => {
          analytics.leadStatusChanged({
            from_status: oldStatus,
            to_status: newStatus,
          });
          notify("Status updated", { type: "success" });
          refresh();
        },
        onError: () => {
          notify("Failed to update status", { type: "error" });
        },
      }
    );
  };

  return (
    <Select value={lead.status} onValueChange={handleChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Change status" />
      </SelectTrigger>
      <SelectContent>
        {leadStatuses.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const ActivityTimeline = ({ leadId }: { leadId: number }) => {
  const dataProvider = useDataProvider();
  const { data } = useQuery({
    queryKey: ["lead_activities", "getList", { leadId }],
    queryFn: () =>
      dataProvider.getList<LeadActivity>("lead_activities", {
        filter: { lead_id: leadId },
        sort: { field: "created_at", order: "DESC" },
        pagination: { page: 1, perPage: 50 },
      }),
  });

  const activities = data?.data ?? [];

  if (activities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No activities yet
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {activities.map((activity, index) => (
        <div key={activity.id} className="flex gap-3 pb-4 relative">
          {/* Timeline line */}
          {index < activities.length - 1 && (
            <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
          )}
          {/* Icon */}
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 z-10">
            {activityIcons[activity.activity_type] ?? (
              <FileText className="w-4 h-4" />
            )}
          </div>
          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm">{activity.description}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">
                {new Date(activity.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              {activity.score_delta !== 0 && (
                <span
                  className={`text-xs font-medium ${
                    activity.score_delta > 0
                      ? "text-green-600"
                      : "text-red-500"
                  }`}
                >
                  {activity.score_delta > 0 ? "+" : ""}
                  {activity.score_delta} pts
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const ScoreBreakdown = ({ leadId }: { leadId: number }) => {
  const dataProvider = useDataProvider();
  const { data } = useQuery({
    queryKey: ["lead_activities", "getList", { leadId, forScore: true }],
    queryFn: () =>
      dataProvider.getList<LeadActivity>("lead_activities", {
        filter: { lead_id: leadId },
        sort: { field: "created_at", order: "DESC" },
        pagination: { page: 1, perPage: 100 },
      }),
  });

  const activities = data?.data ?? [];
  const scoringActivities = activities.filter((a) => a.score_delta !== 0);

  if (scoringActivities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No scoring activities yet
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {scoringActivities.map((activity) => (
        <div
          key={activity.id}
          className="flex items-center justify-between text-sm"
        >
          <div className="flex items-center gap-2">
            {activityIcons[activity.activity_type] ?? (
              <FileText className="w-3 h-3" />
            )}
            <span>{activity.description || activity.activity_type}</span>
          </div>
          <span
            className={`font-medium ${
              activity.score_delta > 0 ? "text-green-600" : "text-red-500"
            }`}
          >
            {activity.score_delta > 0 ? "+" : ""}
            {activity.score_delta}
          </span>
        </div>
      ))}
    </div>
  );
};

const LeadTouchpoints = ({ leadId }: { leadId: number }) => {
  const dataProvider = useDataProvider();
  const { data } = useQuery({
    queryKey: ["touchpoints", "getList", { leadId }],
    queryFn: () =>
      dataProvider.getList<Touchpoint>("touchpoints", {
        filter: { lead_id: leadId },
        sort: { field: "created_at", order: "ASC" },
        pagination: { page: 1, perPage: 100 },
      }),
  });

  return <TouchpointTimeline touchpoints={data?.data ?? []} />;
};

const LogActivityModal = ({
  open,
  onClose,
  lead,
}: {
  open: boolean;
  onClose: () => void;
  lead: Lead;
}) => {
  const [activityType, setActivityType] = useState("note");
  const [description, setDescription] = useState("");
  const { identity } = useGetIdentity();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();

  const activityChoices = [
    { value: "call", label: "Phone Call" },
    { value: "email_sent", label: "Email Sent" },
    { value: "meeting", label: "Meeting" },
    { value: "note", label: "Note" },
  ];

  const handleSubmit = async () => {
    const scoreDelta = activityScoreDefaults[activityType] ?? 0;
    await dataProvider.create("lead_activities", {
      data: {
        lead_id: lead.id,
        sales_id: identity?.id,
        activity_type: activityType,
        description,
        score_delta: scoreDelta,
      },
    });

    if (scoreDelta !== 0) {
      analytics.leadScoreChanged({
        old_score: lead.lead_score,
        new_score: lead.lead_score + scoreDelta,
        activity_type: activityType,
      });
    }

    notify("Activity logged", { type: "success" });
    refresh();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Activity</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Activity Type</Label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {activityChoices.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!description}>
            Log Activity
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
