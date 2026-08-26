REVOKE SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.leads, public.lead_activities, public.touchpoints
  FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leads TO authenticated;
GRANT SELECT, INSERT ON TABLE public.lead_activities TO authenticated;
GRANT SELECT, INSERT ON TABLE public.touchpoints TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE public.leads_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.lead_activities_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.touchpoints_id_seq TO authenticated;

GRANT ALL ON TABLE public.leads TO service_role;
GRANT ALL ON TABLE public.lead_activities TO service_role;
GRANT ALL ON TABLE public.touchpoints TO service_role;
GRANT ALL ON SEQUENCE public.leads_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.lead_activities_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.touchpoints_id_seq TO service_role;

REVOKE SELECT ON TABLE
  public.channel_attribution_summary,
  public.lead_source_performance,
  public.customer_journeys
  FROM anon;

GRANT SELECT ON TABLE
  public.channel_attribution_summary,
  public.lead_source_performance,
  public.customer_journeys
  TO authenticated;

GRANT SELECT ON TABLE
  public.channel_attribution_summary,
  public.lead_source_performance,
  public.customer_journeys
  TO service_role;

REVOKE ALL ON FUNCTION public.set_attribution_flags() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_attribution_flags() FROM anon;
REVOKE ALL ON FUNCTION public.set_attribution_flags() FROM authenticated;

REVOKE ALL ON FUNCTION public.recalculate_lead_score() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalculate_lead_score() FROM anon;
REVOKE ALL ON FUNCTION public.recalculate_lead_score() FROM authenticated;
