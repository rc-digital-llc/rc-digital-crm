CREATE OR REPLACE FUNCTION public.get_domain_favicon(domain_name text)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF domain_name IS NULL OR domain_name = '' THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.favicons_excluded_domains AS excluded
    WHERE excluded.domain = domain_name
  ) THEN
    RETURN NULL;
  END IF;

  RETURN pg_catalog.concat(
    'https://favicon.show/',
    (
      pg_catalog.regexp_match(
        domain_name,
        '^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/?\n]+)',
        'i'
      )
    )[1]
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_company_saved()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  company_logo text;
BEGIN
  IF NEW.logo IS NOT NULL OR NEW.website IS NULL OR NEW.website = '' THEN
    RETURN NEW;
  END IF;

  company_logo := public.get_domain_favicon(NEW.website);
  IF company_logo IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.logo := pg_catalog.jsonb_build_object(
    'src', company_logo,
    'title', 'Company favicon'
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_lead_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  new_score integer;
BEGIN
  SELECT COALESCE(SUM(activity.score_delta), 0)
  INTO new_score
  FROM public.lead_activities AS activity
  WHERE activity.lead_id = NEW.lead_id;

  UPDATE public.leads
  SET lead_score = new_score
  WHERE id = NEW.lead_id;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.convert_lead_to_contact(
  p_lead_id bigint,
  p_deal_name text DEFAULT NULL,
  p_deal_amount bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_contact_id bigint;
  v_deal_id bigint;
  v_company_id bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Lead not found or not authorized';
  END IF;

  SELECT lead.*
  INTO v_lead
  FROM public.leads AS lead
  WHERE lead.id = p_lead_id
    AND EXISTS (
      SELECT 1
      FROM public.sales AS owner
      WHERE owner.id = lead.sales_id
        AND owner.user_id = auth.uid()
    )
  FOR UPDATE OF lead;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found or not authorized';
  END IF;

  IF v_lead.status = 'converted' THEN
    RAISE EXCEPTION 'Lead already converted';
  END IF;

  IF v_lead.company_name IS NOT NULL THEN
    SELECT company.id
    INTO v_company_id
    FROM public.companies AS company
    WHERE company.name = v_lead.company_name
      AND company.sales_id = v_lead.sales_id
    ORDER BY company.id
    LIMIT 1;

    IF v_company_id IS NULL THEN
      INSERT INTO public.companies (name, sales_id)
      VALUES (v_lead.company_name, v_lead.sales_id)
      RETURNING id INTO v_company_id;
    END IF;
  END IF;

  INSERT INTO public.contacts (
    first_name,
    last_name,
    email_jsonb,
    phone_jsonb,
    title,
    company_id,
    sales_id,
    linkedin_url,
    first_seen,
    status
  )
  VALUES (
    v_lead.first_name,
    v_lead.last_name,
    CASE
      WHEN NULLIF(v_lead.email, '') IS NULL THEN '[]'::jsonb
      ELSE pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'email', v_lead.email,
          'type', 'Other'
        )
      )
    END,
    CASE
      WHEN NULLIF(v_lead.phone, '') IS NULL THEN '[]'::jsonb
      ELSE pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'number', v_lead.phone,
          'type', 'Other'
        )
      )
    END,
    v_lead.job_title,
    v_company_id,
    v_lead.sales_id,
    v_lead.linkedin_url,
    v_lead.created_at,
    'is_customer'
  )
  RETURNING id INTO v_contact_id;

  IF p_deal_name IS NOT NULL THEN
    INSERT INTO public.deals (
      name,
      company_id,
      contact_ids,
      stage,
      amount,
      sales_id
    )
    VALUES (
      p_deal_name,
      v_company_id,
      ARRAY[v_contact_id],
      'opportunity',
      p_deal_amount,
      v_lead.sales_id
    )
    RETURNING id INTO v_deal_id;
  END IF;

  UPDATE public.leads
  SET
    status = 'converted',
    converted_at = pg_catalog.now(),
    converted_contact_id = v_contact_id,
    converted_deal_id = v_deal_id
  WHERE id = p_lead_id;

  INSERT INTO public.lead_activities (
    lead_id,
    sales_id,
    activity_type,
    description,
    metadata
  )
  VALUES (
    p_lead_id,
    v_lead.sales_id,
    'status_change',
    'Lead converted to contact',
    pg_catalog.jsonb_build_object(
      'contact_id', v_contact_id,
      'deal_id', v_deal_id,
      'company_id', v_company_id
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'contact_id', v_contact_id,
    'deal_id', v_deal_id,
    'company_id', v_company_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.convert_lead_to_contact(bigint, text, bigint)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_lead_to_contact(bigint, text, bigint)
  FROM anon;
REVOKE ALL ON FUNCTION public.convert_lead_to_contact(bigint, text, bigint)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_contact(bigint, text, bigint)
  TO authenticated;
