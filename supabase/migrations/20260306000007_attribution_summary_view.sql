-- Channel performance summary
CREATE OR REPLACE VIEW channel_attribution_summary
WITH (security_invoker=on) AS
SELECT
  t.channel,
  t.source,
  COUNT(DISTINCT t.lead_id) as leads_generated,
  COUNT(DISTINCT t.contact_id) as contacts_touched,
  COUNT(DISTINCT t.deal_id) as deals_influenced,
  COUNT(DISTINCT CASE WHEN t.is_first_touch THEN t.lead_id END) as first_touch_leads,
  COUNT(DISTINCT CASE WHEN t.is_last_touch THEN t.deal_id END) as last_touch_deals,
  COALESCE(SUM(DISTINCT CASE WHEN t.is_first_touch AND d.stage IN ('won') THEN d.amount END), 0) as first_touch_revenue,
  COALESCE(SUM(DISTINCT CASE WHEN t.is_last_touch AND d.stage IN ('won') THEN d.amount END), 0) as last_touch_revenue,
  COUNT(*) as total_touchpoints
FROM touchpoints t
LEFT JOIN deals d ON t.deal_id = d.id
GROUP BY t.channel, t.source
ORDER BY leads_generated DESC;

-- Lead source performance
CREATE OR REPLACE VIEW lead_source_performance
WITH (security_invoker=on) AS
SELECT
  l.source,
  l.utm_source,
  l.utm_medium,
  l.utm_campaign,
  COUNT(*) as total_leads,
  COUNT(CASE WHEN l.status = 'qualified' THEN 1 END) as qualified_leads,
  COUNT(CASE WHEN l.status = 'converted' THEN 1 END) as converted_leads,
  ROUND(
    COUNT(CASE WHEN l.status = 'converted' THEN 1 END)::numeric /
    NULLIF(COUNT(*), 0) * 100, 1
  ) as conversion_rate,
  AVG(l.lead_score) as avg_lead_score,
  AVG(EXTRACT(EPOCH FROM (l.converted_at - l.created_at)) / 86400)::integer as avg_days_to_convert
FROM leads l
GROUP BY l.source, l.utm_source, l.utm_medium, l.utm_campaign
ORDER BY total_leads DESC;

-- Full customer journey view
CREATE OR REPLACE VIEW customer_journeys
WITH (security_invoker=on) AS
SELECT
  COALESCE(c.first_name || ' ' || c.last_name, l.first_name || ' ' || l.last_name) as person_name,
  COALESCE(c.email_jsonb -> 0 ->> 'email', l.email) as email,
  l.id as lead_id,
  c.id as contact_id,
  d.id as deal_id,
  l.source as lead_source,
  l.created_at as lead_created,
  l.converted_at as converted_at,
  d.created_at as deal_created,
  d.stage as deal_stage,
  d.amount as deal_amount,
  COUNT(t.id) as total_touchpoints,
  MIN(t.created_at) as first_touch_date,
  MAX(t.created_at) as last_touch_date,
  EXTRACT(EPOCH FROM (COALESCE(l.converted_at, now()) - l.created_at)) / 86400 as days_in_funnel
FROM leads l
LEFT JOIN contacts c ON l.converted_contact_id = c.id
LEFT JOIN deals d ON l.converted_deal_id = d.id
LEFT JOIN touchpoints t ON t.lead_id = l.id OR t.contact_id = c.id
GROUP BY l.id, c.id, d.id, c.first_name, c.last_name, l.first_name, l.last_name,
  c.email_jsonb -> 0 ->> 'email', l.email,
  l.source, l.created_at, l.converted_at, d.created_at, d.stage, d.amount
ORDER BY l.created_at DESC;
