import {
  FileEdit,
  FileText,
  Flag,
  Globe,
  Handshake,
  Mail,
  MailOpen,
  MousePointerClick,
  Phone,
  Search,
  Send,
  Share2,
  Target,
  Star,
  DollarSign,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { channelColors, channelLabel } from "./channelColors";

export interface Touchpoint {
  id: number;
  created_at: string;
  touchpoint_type: string;
  channel: string;
  source: string | null;
  campaign: string | null;
  page_url: string | null;
  is_first_touch: boolean;
  is_last_touch: boolean;
  is_lead_creation_touch: boolean;
  is_deal_creation_touch: boolean;
}

const typeIcons: Record<string, React.ReactNode> = {
  page_view: <FileText className="w-4 h-4" />,
  form_submit: <FileEdit className="w-4 h-4" />,
  ad_click: <MousePointerClick className="w-4 h-4" />,
  organic_search: <Search className="w-4 h-4" />,
  social_click: <Share2 className="w-4 h-4" />,
  email_open: <Mail className="w-4 h-4" />,
  email_click: <MailOpen className="w-4 h-4" />,
  referral: <Globe className="w-4 h-4" />,
  direct: <Globe className="w-4 h-4" />,
  call: <Phone className="w-4 h-4" />,
  meeting: <Handshake className="w-4 h-4" />,
  demo: <Handshake className="w-4 h-4" />,
  proposal_sent: <Send className="w-4 h-4" />,
  contract_signed: <FileEdit className="w-4 h-4" />,
};

const truncateUrl = (url: string, maxLen = 40) =>
  url.length > maxLen ? url.slice(0, maxLen) + "..." : url;

export const TouchpointTimeline = ({
  touchpoints,
}: {
  touchpoints: Touchpoint[];
}) => {
  if (touchpoints.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No touchpoints recorded
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {touchpoints.map((tp, index) => {
        const colors = channelColors[tp.channel] ?? {
          bg: "rgba(156, 163, 175, 0.12)",
          text: "#9CA3AF",
        };

        return (
          <div key={tp.id} className="flex gap-3 pb-4 relative">
            {index < touchpoints.length - 1 && (
              <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
            )}
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 z-10">
              {typeIcons[tp.touchpoint_type] ?? <Globe className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">
                  {tp.touchpoint_type.split("_").join(" ")}
                </span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: colors.bg, color: colors.text }}
                >
                  {channelLabel(tp.channel)}
                </span>
                {/* Attribution badges */}
                {tp.is_first_touch && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium inline-flex items-center gap-0.5">
                    <Flag className="w-2.5 h-2.5" /> First Touch
                  </span>
                )}
                {tp.is_last_touch && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium inline-flex items-center gap-0.5">
                    <Target className="w-2.5 h-2.5" /> Last Touch
                  </span>
                )}
                {tp.is_lead_creation_touch && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium inline-flex items-center gap-0.5">
                    <Star className="w-2.5 h-2.5" /> Lead Created
                  </span>
                )}
                {tp.is_deal_creation_touch && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium inline-flex items-center gap-0.5">
                    <DollarSign className="w-2.5 h-2.5" /> Deal Created
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                <span>
                  {new Date(tp.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                {tp.source && <span>via {tp.source}</span>}
                {tp.campaign && <span>campaign: {tp.campaign}</span>}
              </div>
              {tp.page_url && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-muted-foreground/70 block mt-0.5 truncate">
                        {truncateUrl(tp.page_url)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      className="max-w-md break-all"
                    >
                      {tp.page_url}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
