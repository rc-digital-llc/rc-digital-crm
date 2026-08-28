export const leadStatuses = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualifying", label: "Qualifying" },
  { value: "qualified", label: "Qualified" },
  { value: "unqualified", label: "Unqualified" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

export const leadSources = [
  { value: "manual", label: "Manual" },
  { value: "website_form", label: "Website Form" },
  { value: "landing_page", label: "Landing Page" },
  { value: "referral", label: "Referral" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "cold_outbound", label: "Cold Outbound" },
  { value: "google_ads", label: "Google Ads" },
  { value: "social_media", label: "Social Media" },
  { value: "event", label: "Event" },
  { value: "partner", label: "Partner" },
];

export const leadStatusColorMap: Record<string, { bg: string; text: string }> =
  {
    new: { bg: "rgba(33, 150, 243, 0.12)", text: "#2196F3" },
    contacted: { bg: "rgba(124, 94, 233, 0.12)", text: "#7C5EE9" },
    qualifying: { bg: "rgba(255, 152, 0, 0.12)", text: "#FF9800" },
    qualified: { bg: "rgba(76, 175, 80, 0.12)", text: "#4CAF50" },
    unqualified: { bg: "rgba(156, 163, 175, 0.12)", text: "#9CA3AF" },
    converted: { bg: "rgba(0, 188, 212, 0.12)", text: "#00BCD4" },
    lost: { bg: "rgba(233, 69, 96, 0.12)", text: "#e94560" },
  };

export const activityTypeIcons: Record<string, string> = {
  page_view: "FileText",
  form_submit: "FileEdit",
  email_open: "Mail",
  email_click: "MailOpen",
  email_sent: "Send",
  call: "Phone",
  meeting: "Handshake",
  note: "StickyNote",
  status_change: "RefreshCw",
  score_change: "TrendingUp",
};

export const activityScoreDefaults: Record<string, number> = {
  form_submit: 5,
  email_click: 3,
  email_open: 2,
  page_view: 1,
  meeting: 10,
  call: 8,
  note: 0,
  email_sent: 0,
  status_change: 0,
};
