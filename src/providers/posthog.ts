// RC Digital CRM — PostHog Analytics Integration
// Drop this into src/providers/ and import in main.tsx

import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST =
  import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

export function initPostHog() {
  if (!POSTHOG_KEY) {
    console.warn("[PostHog] No API key found. Analytics disabled.");
    return;
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: "localStorage",
    autocapture: true,
  });
}

// Track CRM-specific events
export const analytics = {
  // Deal events
  dealCreated: (dealData: {
    stage: string;
    category: string;
    amount: number;
  }) => {
    posthog.capture("deal_created", dealData);
  },
  dealStageChanged: (data: {
    dealId: number;
    from: string;
    to: string;
    amount: number;
  }) => {
    posthog.capture("deal_stage_changed", data);
  },
  dealWon: (data: {
    dealId: number;
    amount: number;
    daysInPipeline: number;
  }) => {
    posthog.capture("deal_won", data);
  },

  // Project events
  projectStarted: (data: { projectType: string; contractValue: number }) => {
    posthog.capture("project_started", data);
  },
  projectDelivered: (data: {
    projectId: number;
    daysToComplete: number;
    contractValue: number;
  }) => {
    posthog.capture("project_delivered", data);
  },

  // Invoice events
  invoiceSent: (data: { amount: number; projectType: string }) => {
    posthog.capture("invoice_sent", data);
  },
  invoicePaid: (data: { amount: number; daysToPay: number }) => {
    posthog.capture("invoice_paid", data);
  },

  // Lead events
  leadCreated: (data: { source: string; utm_source: string }) => {
    posthog.capture("lead_created", data);
  },
  leadStatusChanged: (data: { from_status: string; to_status: string }) => {
    posthog.capture("lead_status_changed", data);
  },
  leadConverted: (data: {
    lead_id: number;
    contact_id: number;
    deal_id: number | null;
    time_to_convert_days: number;
  }) => {
    posthog.capture("lead_converted", data);
  },
  leadScoreChanged: (data: {
    old_score: number;
    new_score: number;
    activity_type: string;
  }) => {
    posthog.capture("lead_score_changed", data);
  },

  // Attribution events
  attributionDashboardViewed: (data: { tab_name: string }) => {
    posthog.capture("attribution_dashboard_viewed", data);
  },
  customerJourneyExpanded: (data: {
    lead_id: number;
    touchpoint_count: number;
  }) => {
    posthog.capture("customer_journey_expanded", data);
  },
  attributionModelToggled: (data: { model_type: string }) => {
    posthog.capture("attribution_model_toggled", data);
  },

  // User identification
  identifyUser: (userId: string, traits: Record<string, any>) => {
    posthog.identify(userId, traits);
  },
};

export default posthog;
