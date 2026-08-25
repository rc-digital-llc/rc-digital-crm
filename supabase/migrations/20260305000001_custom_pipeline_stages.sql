-- RC Digital LLC: Custom Pipeline Stages
-- Replaces default Atomic CRM deal stages with RC Digital's pipeline

UPDATE public.configuration SET config = '{
  "dealStages": [
    { "value": "lead", "label": "Lead" },
    { "value": "discovery-call", "label": "Discovery Call" },
    { "value": "proposal-sent", "label": "Proposal Sent" },
    { "value": "signed", "label": "Signed" },
    { "value": "in-build", "label": "In Build" },
    { "value": "review", "label": "Review" },
    { "value": "delivered", "label": "Delivered" },
    { "value": "paid", "label": "Paid" }
  ],
  "dealPipelineStatuses": ["paid"],
  "dealCategories": [
    { "value": "website-build", "label": "Website Build" },
    { "value": "app-development", "label": "App Development" },
    { "value": "redesign", "label": "Redesign" },
    { "value": "maintenance", "label": "Maintenance" },
    { "value": "consulting", "label": "Consulting" }
  ],
  "noteStatuses": [
    { "value": "cold", "label": "Cold", "color": "#7dbde8" },
    { "value": "warm", "label": "Warm", "color": "#e8cb7d" },
    { "value": "hot", "label": "Hot", "color": "#e88b7d" }
  ],
  "taskTypes": [
    { "value": "email", "label": "Email" },
    { "value": "call", "label": "Call" },
    { "value": "meeting", "label": "Meeting" },
    { "value": "follow-up", "label": "Follow-up" },
    { "value": "demo", "label": "Demo" },
    { "value": "proposal", "label": "Proposal" },
    { "value": "review", "label": "Review" }
  ],
  "companySectors": [
    { "value": "healthcare", "label": "Healthcare" },
    { "value": "legal", "label": "Legal" },
    { "value": "real-estate", "label": "Real Estate" },
    { "value": "restaurant", "label": "Restaurant" },
    { "value": "retail", "label": "Retail" },
    { "value": "tech-startup", "label": "Tech Startup" },
    { "value": "construction", "label": "Construction" },
    { "value": "finance", "label": "Finance" },
    { "value": "education", "label": "Education" },
    { "value": "nonprofit", "label": "Nonprofit" },
    { "value": "other", "label": "Other" }
  ]
}'::jsonb WHERE id = 1;
