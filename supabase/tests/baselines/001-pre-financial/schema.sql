

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."calculate_invoice_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.tax_amount = NEW.amount * (NEW.tax_rate / 100);
  NEW.total_amount = NEW.amount + NEW.tax_amount;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_invoice_totals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_note_attachments"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    DECLARE
      payload jsonb;
      request_headers jsonb;
      auth_header text;
    BEGIN
      request_headers := coalesce(
        nullif(current_setting('request.headers', true), '')::jsonb,
        '{}'::jsonb
      );
      auth_header := request_headers ->> 'authorization';

      IF auth_header IS NULL OR auth_header = '' THEN
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;

        RETURN NEW;
      END IF;

      payload := jsonb_build_object(
        'old_record', OLD,
        'record', NEW,
        'type', TG_OP
      );

      PERFORM net.http_post(
        url := public.get_note_attachments_function_url(),
        body := payload,
        params := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type',
          'application/json',
          'Authorization',
          auth_header
        ),
        timeout_milliseconds := 10000
      );

      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;

      RETURN NEW;
    END;
    $$;


ALTER FUNCTION "public"."cleanup_note_attachments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_lead_to_contact"("p_lead_id" bigint, "p_deal_name" "text" DEFAULT NULL::"text", "p_deal_amount" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."convert_lead_to_contact"("p_lead_id" bigint, "p_deal_name" "text", "p_deal_amount" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_avatar_for_email"("email" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$declare email_hash text;
declare gravatar_url text;
declare gravatar_status int8;
declare email_domain text;
declare favicon_url text;
declare domain_status int8;

begin
    -- Try to fetch a gravatar image
    email_hash = encode(digest(email, 'sha256'), 'hex');
    gravatar_url = concat('https://www.gravatar.com/avatar/', email_hash, '?d=404');

    select status from http_get(gravatar_url) into gravatar_status;

    if gravatar_status = 200 then
        return gravatar_url;
    end if;

    -- Fallback to email's domain favicon if not excluded
    email_domain = split_part(email, '@', 2);
    return get_domain_favicon(email_domain);
exception
    when others then
        return 'ERROR';
end;$$;


ALTER FUNCTION "public"."get_avatar_for_email"("email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_domain_favicon"("domain_name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."get_domain_favicon"("domain_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_note_attachments_function_url"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
    DECLARE
      issuer text;
      function_url text;
    BEGIN
      issuer := coalesce(
        nullif(current_setting('request.jwt.claim.iss', true), ''),
        (
          coalesce(
            nullif(current_setting('request.jwt.claims', true), ''),
            '{}'
          )::jsonb ->> 'iss'
        )
      );
      issuer := nullif(issuer, '');
      IF issuer IS NOT NULL THEN
        issuer := rtrim(issuer, '/');
        IF right(issuer, 8) = '/auth/v1' THEN
          function_url :=
            left(issuer, length(issuer) - 8) || '/functions/v1/delete_note_attachments';

          IF function_url LIKE 'http://127.0.0.1:%' THEN
            RETURN replace(
              function_url,
              'http://127.0.0.1:',
              'http://host.docker.internal:'
            );
          END IF;

          IF function_url LIKE 'http://localhost:%' THEN
            RETURN replace(
              function_url,
              'http://localhost:',
              'http://host.docker.internal:'
            );
          END IF;

          RETURN function_url;
        END IF;
      END IF;

      RETURN 'http://host.docker.internal:54321/functions/v1/delete_note_attachments';
    END;
    $$;


ALTER FUNCTION "public"."get_note_attachments_function_url"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_id_by_email"("email" "text") RETURNS TABLE("id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
BEGIN
  RETURN QUERY SELECT au.id FROM auth.users au WHERE au.email = $1;
END;
$_$;


ALTER FUNCTION "public"."get_user_id_by_email"("email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_company_saved"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_company_saved"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_contact_note_created_or_updated"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.contacts set last_seen = new.date where contacts.id = new.contact_id and contacts.last_seen < new.date;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_contact_note_created_or_updated"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_contact_saved"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$declare contact_avatar text;
declare emails_length int8;
declare item jsonb;

begin
    if new.avatar is not null then
        return new;
    end if;

    select coalesce(jsonb_array_length(new.email_jsonb), 0) into emails_length;

    if emails_length = 0 then
        return new;
    end if;

    for item in select jsonb_array_elements(new.email_jsonb)
    loop
        select public.get_avatar_for_email(item->>'email') into contact_avatar;
        if (contact_avatar is not null) then
            exit;
        end if;
    end loop;

    if contact_avatar is null then
        return new;
    end if;

    new.avatar = concat('{"src":"', contact_avatar, '"}');
    return new;
end;$$;


ALTER FUNCTION "public"."handle_contact_saved"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  sales_count int;
begin
  select count(id) into sales_count
  from public.sales;

  insert into public.sales (first_name, last_name, email, user_id, administrator)
  values (
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    new.email,
    new.id,
    case when sales_count > 0 then FALSE else TRUE end
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_update_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.sales
  set
    first_name = coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    last_name = coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    email = new.email
  where user_id = new.id;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_update_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return exists (
    select 1 from public.sales where user_id = auth.uid() and administrator = true
  );
end;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_contacts"("loser_id" bigint, "winner_id" bigint) RETURNS bigint
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  winner_contact contacts%ROWTYPE;
  loser_contact contacts%ROWTYPE;
  deal_record RECORD;
  merged_emails jsonb;
  merged_phones jsonb;
  merged_tags bigint[];
  winner_emails jsonb;
  loser_emails jsonb;
  winner_phones jsonb;
  loser_phones jsonb;
  email_map jsonb;
  phone_map jsonb;
BEGIN
  -- Fetch both contacts
  SELECT * INTO winner_contact FROM contacts WHERE id = winner_id;
  SELECT * INTO loser_contact FROM contacts WHERE id = loser_id;

  IF winner_contact IS NULL OR loser_contact IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- 1. Reassign tasks from loser to winner
  UPDATE tasks SET contact_id = winner_id WHERE contact_id = loser_id;

  -- 2. Reassign contact notes from loser to winner
  UPDATE "contact_notes" SET contact_id = winner_id WHERE contact_id = loser_id;

  -- 3. Update deals - replace loser with winner in contact_ids array
  FOR deal_record IN
    SELECT id, contact_ids
    FROM deals
    WHERE contact_ids @> ARRAY[loser_id]
  LOOP
    UPDATE deals
    SET contact_ids = (
      SELECT ARRAY(
        SELECT DISTINCT unnest(
          array_remove(deal_record.contact_ids, loser_id) || ARRAY[winner_id]
        )
      )
    )
    WHERE id = deal_record.id;
  END LOOP;

  -- 4. Merge contact data

  -- Get email arrays
  winner_emails := COALESCE(winner_contact.email_jsonb, '[]'::jsonb);
  loser_emails := COALESCE(loser_contact.email_jsonb, '[]'::jsonb);

  -- Merge emails with deduplication by email address
  -- Build a map of email -> email object, then convert back to array
  email_map := '{}'::jsonb;

  -- Add winner emails to map
  IF jsonb_array_length(winner_emails) > 0 THEN
    FOR i IN 0..jsonb_array_length(winner_emails)-1 LOOP
      email_map := email_map || jsonb_build_object(
        winner_emails->i->>'email',
        winner_emails->i
      );
    END LOOP;
  END IF;

  -- Add loser emails to map (won't overwrite existing keys)
  IF jsonb_array_length(loser_emails) > 0 THEN
    FOR i IN 0..jsonb_array_length(loser_emails)-1 LOOP
      IF NOT email_map ? (loser_emails->i->>'email') THEN
        email_map := email_map || jsonb_build_object(
          loser_emails->i->>'email',
          loser_emails->i
        );
      END IF;
    END LOOP;
  END IF;

  -- Convert map back to array
  merged_emails := (SELECT jsonb_agg(value) FROM jsonb_each(email_map));
  merged_emails := COALESCE(merged_emails, '[]'::jsonb);

  -- Get phone arrays
  winner_phones := COALESCE(winner_contact.phone_jsonb, '[]'::jsonb);
  loser_phones := COALESCE(loser_contact.phone_jsonb, '[]'::jsonb);

  -- Merge phones with deduplication by number
  phone_map := '{}'::jsonb;

  -- Add winner phones to map
  IF jsonb_array_length(winner_phones) > 0 THEN
    FOR i IN 0..jsonb_array_length(winner_phones)-1 LOOP
      phone_map := phone_map || jsonb_build_object(
        winner_phones->i->>'number',
        winner_phones->i
      );
    END LOOP;
  END IF;

  -- Add loser phones to map (won't overwrite existing keys)
  IF jsonb_array_length(loser_phones) > 0 THEN
    FOR i IN 0..jsonb_array_length(loser_phones)-1 LOOP
      IF NOT phone_map ? (loser_phones->i->>'number') THEN
        phone_map := phone_map || jsonb_build_object(
          loser_phones->i->>'number',
          loser_phones->i
        );
      END IF;
    END LOOP;
  END IF;

  -- Convert map back to array
  merged_phones := (SELECT jsonb_agg(value) FROM jsonb_each(phone_map));
  merged_phones := COALESCE(merged_phones, '[]'::jsonb);

  -- Merge tags (remove duplicates)
  merged_tags := ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(winner_contact.tags, ARRAY[]::bigint[]) ||
      COALESCE(loser_contact.tags, ARRAY[]::bigint[])
    )
  );

  -- 5. Update winner with merged data
  UPDATE contacts SET
    avatar = COALESCE(winner_contact.avatar, loser_contact.avatar),
    gender = COALESCE(winner_contact.gender, loser_contact.gender),
    first_name = COALESCE(winner_contact.first_name, loser_contact.first_name),
    last_name = COALESCE(winner_contact.last_name, loser_contact.last_name),
    title = COALESCE(winner_contact.title, loser_contact.title),
    company_id = COALESCE(winner_contact.company_id, loser_contact.company_id),
    email_jsonb = merged_emails,
    phone_jsonb = merged_phones,
    linkedin_url = COALESCE(winner_contact.linkedin_url, loser_contact.linkedin_url),
    background = COALESCE(winner_contact.background, loser_contact.background),
    has_newsletter = COALESCE(winner_contact.has_newsletter, loser_contact.has_newsletter),
    first_seen = LEAST(COALESCE(winner_contact.first_seen, loser_contact.first_seen), COALESCE(loser_contact.first_seen, winner_contact.first_seen)),
    last_seen = GREATEST(COALESCE(winner_contact.last_seen, loser_contact.last_seen), COALESCE(loser_contact.last_seen, winner_contact.last_seen)),
    sales_id = COALESCE(winner_contact.sales_id, loser_contact.sales_id),
    tags = merged_tags
  WHERE id = winner_id;

  -- 6. Delete loser contact
  DELETE FROM contacts WHERE id = loser_id;

  RETURN winner_id;
END;
$$;


ALTER FUNCTION "public"."merge_contacts"("loser_id" bigint, "winner_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_lead_score"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."recalculate_lead_score"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_attribution_flags"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  existing_count integer;
BEGIN
  -- Check if this is the first touchpoint for the lead
  IF NEW.lead_id IS NOT NULL THEN
    SELECT COUNT(*) INTO existing_count FROM touchpoints
    WHERE lead_id = NEW.lead_id AND id != NEW.id;

    IF existing_count = 0 THEN
      NEW.is_first_touch = true;
    END IF;
  END IF;

  -- Update previous last_touch to false, set this as last_touch
  IF NEW.lead_id IS NOT NULL THEN
    UPDATE touchpoints SET is_last_touch = false
    WHERE lead_id = NEW.lead_id AND is_last_touch = true AND id != NEW.id;
    NEW.is_last_touch = true;
  END IF;

  IF NEW.contact_id IS NOT NULL THEN
    UPDATE touchpoints SET is_last_touch = false
    WHERE contact_id = NEW.contact_id AND is_last_touch = true AND id != NEW.id;
    NEW.is_last_touch = true;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_attribution_flags"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_sales_id_default"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.sales_id IS NULL THEN
    SELECT id INTO NEW.sales_id FROM sales WHERE user_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_sales_id_default"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_invoices_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_invoices_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_leads_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."update_leads_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_projects_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_projects_timestamp"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."deals" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "company_id" bigint,
    "contact_ids" bigint[],
    "category" "text",
    "stage" "text" NOT NULL,
    "description" "text",
    "amount" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "expected_closing_date" "date",
    "sales_id" bigint,
    "index" smallint
);


ALTER TABLE "public"."deals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."touchpoints" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "lead_id" bigint,
    "contact_id" bigint,
    "deal_id" bigint,
    "anonymous_id" "text",
    "touchpoint_type" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "source" "text",
    "medium" "text",
    "campaign" "text",
    "content" "text",
    "term" "text",
    "page_url" "text",
    "page_title" "text",
    "referrer_url" "text",
    "is_first_touch" boolean DEFAULT false,
    "is_last_touch" boolean DEFAULT false,
    "is_lead_creation_touch" boolean DEFAULT false,
    "is_deal_creation_touch" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "sales_id" bigint
);


ALTER TABLE "public"."touchpoints" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."channel_attribution_summary" WITH ("security_invoker"='on') AS
 SELECT "t"."channel",
    "t"."source",
    "count"(DISTINCT "t"."lead_id") AS "leads_generated",
    "count"(DISTINCT "t"."contact_id") AS "contacts_touched",
    "count"(DISTINCT "t"."deal_id") AS "deals_influenced",
    "count"(DISTINCT
        CASE
            WHEN "t"."is_first_touch" THEN "t"."lead_id"
            ELSE NULL::bigint
        END) AS "first_touch_leads",
    "count"(DISTINCT
        CASE
            WHEN "t"."is_last_touch" THEN "t"."deal_id"
            ELSE NULL::bigint
        END) AS "last_touch_deals",
    COALESCE("sum"(DISTINCT
        CASE
            WHEN ("t"."is_first_touch" AND ("d"."stage" = 'won'::"text")) THEN "d"."amount"
            ELSE NULL::bigint
        END), (0)::numeric) AS "first_touch_revenue",
    COALESCE("sum"(DISTINCT
        CASE
            WHEN ("t"."is_last_touch" AND ("d"."stage" = 'won'::"text")) THEN "d"."amount"
            ELSE NULL::bigint
        END), (0)::numeric) AS "last_touch_revenue",
    "count"(*) AS "total_touchpoints"
   FROM ("public"."touchpoints" "t"
     LEFT JOIN "public"."deals" "d" ON (("t"."deal_id" = "d"."id")))
  GROUP BY "t"."channel", "t"."source"
  ORDER BY ("count"(DISTINCT "t"."lead_id")) DESC;


ALTER TABLE "public"."channel_attribution_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "sector" "text",
    "size" smallint,
    "linkedin_url" "text",
    "website" "text",
    "phone_number" "text",
    "address" "text",
    "zipcode" "text",
    "city" "text",
    "state_abbr" "text",
    "sales_id" bigint,
    "context_links" "json",
    "country" "text",
    "description" "text",
    "revenue" "text",
    "tax_identifier" "text",
    "logo" "jsonb"
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


ALTER TABLE "public"."companies" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."companies_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."companies_summary" AS
SELECT
    NULL::bigint AS "id",
    NULL::timestamp with time zone AS "created_at",
    NULL::"text" AS "name",
    NULL::"text" AS "sector",
    NULL::smallint AS "size",
    NULL::"text" AS "linkedin_url",
    NULL::"text" AS "website",
    NULL::"text" AS "phone_number",
    NULL::"text" AS "address",
    NULL::"text" AS "zipcode",
    NULL::"text" AS "city",
    NULL::"text" AS "state_abbr",
    NULL::bigint AS "sales_id",
    NULL::"json" AS "context_links",
    NULL::"text" AS "country",
    NULL::"text" AS "description",
    NULL::"text" AS "revenue",
    NULL::"text" AS "tax_identifier",
    NULL::"jsonb" AS "logo",
    NULL::bigint AS "nb_deals",
    NULL::bigint AS "nb_contacts";


ALTER TABLE "public"."companies_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."configuration" (
    "id" integer DEFAULT 1 NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "configuration_singleton" CHECK (("id" = 1))
);


ALTER TABLE "public"."configuration" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_notes" (
    "id" bigint NOT NULL,
    "contact_id" bigint NOT NULL,
    "text" "text",
    "date" timestamp with time zone DEFAULT "now"(),
    "sales_id" bigint,
    "status" "text",
    "attachments" "jsonb"[]
);


ALTER TABLE "public"."contact_notes" OWNER TO "postgres";


ALTER TABLE "public"."contact_notes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."contactNotes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" bigint NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "gender" "text",
    "title" "text",
    "background" "text",
    "avatar" "jsonb",
    "first_seen" timestamp with time zone,
    "last_seen" timestamp with time zone,
    "has_newsletter" boolean,
    "status" "text",
    "tags" bigint[],
    "company_id" bigint,
    "sales_id" bigint,
    "linkedin_url" "text",
    "email_jsonb" "jsonb",
    "phone_jsonb" "jsonb"
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


ALTER TABLE "public"."contacts" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."contacts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."contacts_summary" AS
SELECT
    NULL::bigint AS "id",
    NULL::"text" AS "first_name",
    NULL::"text" AS "last_name",
    NULL::"text" AS "gender",
    NULL::"text" AS "title",
    NULL::"jsonb" AS "email_jsonb",
    NULL::"text" AS "email_fts",
    NULL::"jsonb" AS "phone_jsonb",
    NULL::"text" AS "phone_fts",
    NULL::"text" AS "background",
    NULL::"jsonb" AS "avatar",
    NULL::timestamp with time zone AS "first_seen",
    NULL::timestamp with time zone AS "last_seen",
    NULL::boolean AS "has_newsletter",
    NULL::"text" AS "status",
    NULL::bigint[] AS "tags",
    NULL::bigint AS "company_id",
    NULL::bigint AS "sales_id",
    NULL::"text" AS "linkedin_url",
    NULL::"text" AS "company_name",
    NULL::bigint AS "nb_tasks";


ALTER TABLE "public"."contacts_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "company_name" "text",
    "job_title" "text",
    "linkedin_url" "text",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_detail" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_term" "text",
    "utm_content" "text",
    "landing_page_url" "text",
    "referrer_url" "text",
    "lead_score" integer DEFAULT 0,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "qualification_notes" "text",
    "sales_id" bigint NOT NULL,
    "assigned_at" timestamp with time zone,
    "converted_at" timestamp with time zone,
    "converted_contact_id" bigint,
    "converted_deal_id" bigint,
    "tags" bigint[],
    "notes" "text",
    "custom_fields" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."customer_journeys" WITH ("security_invoker"='on') AS
 SELECT COALESCE((("c"."first_name" || ' '::"text") || "c"."last_name"), (("l"."first_name" || ' '::"text") || "l"."last_name")) AS "person_name",
    COALESCE((("c"."email_jsonb" -> 0) ->> 'email'::"text"), "l"."email") AS "email",
    "l"."id" AS "lead_id",
    "c"."id" AS "contact_id",
    "d"."id" AS "deal_id",
    "l"."source" AS "lead_source",
    "l"."created_at" AS "lead_created",
    "l"."converted_at",
    "d"."created_at" AS "deal_created",
    "d"."stage" AS "deal_stage",
    "d"."amount" AS "deal_amount",
    "count"("t"."id") AS "total_touchpoints",
    "min"("t"."created_at") AS "first_touch_date",
    "max"("t"."created_at") AS "last_touch_date",
    (EXTRACT(epoch FROM (COALESCE("l"."converted_at", "now"()) - "l"."created_at")) / (86400)::numeric) AS "days_in_funnel"
   FROM ((("public"."leads" "l"
     LEFT JOIN "public"."contacts" "c" ON (("l"."converted_contact_id" = "c"."id")))
     LEFT JOIN "public"."deals" "d" ON (("l"."converted_deal_id" = "d"."id")))
     LEFT JOIN "public"."touchpoints" "t" ON ((("t"."lead_id" = "l"."id") OR ("t"."contact_id" = "c"."id"))))
  GROUP BY "l"."id", "c"."id", "d"."id", "c"."first_name", "c"."last_name", "l"."first_name", "l"."last_name", (("c"."email_jsonb" -> 0) ->> 'email'::"text"), "l"."email", "l"."source", "l"."created_at", "l"."converted_at", "d"."created_at", "d"."stage", "d"."amount"
  ORDER BY "l"."created_at" DESC;


ALTER TABLE "public"."customer_journeys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deal_notes" (
    "id" bigint NOT NULL,
    "deal_id" bigint NOT NULL,
    "type" "text",
    "text" "text",
    "date" timestamp with time zone DEFAULT "now"(),
    "sales_id" bigint,
    "attachments" "jsonb"[]
);


ALTER TABLE "public"."deal_notes" OWNER TO "postgres";


ALTER TABLE "public"."deal_notes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."dealNotes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."deals" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."deals_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."favicons_excluded_domains" (
    "id" bigint NOT NULL,
    "domain" "text" NOT NULL
);


ALTER TABLE "public"."favicons_excluded_domains" OWNER TO "postgres";


ALTER TABLE "public"."favicons_excluded_domains" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."favicons_excluded_domains_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."sales" (
    "id" bigint NOT NULL,
    "first_name" "text" DEFAULT 'Pending'::"text" NOT NULL,
    "last_name" "text" DEFAULT 'Pending'::"text" NOT NULL,
    "email" "text" NOT NULL,
    "administrator" boolean NOT NULL,
    "user_id" "uuid" NOT NULL,
    "avatar" "jsonb",
    "disabled" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."sales" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."init_state" WITH ("security_invoker"='off') AS
 SELECT "count"("sub"."id") AS "is_initialized"
   FROM ( SELECT "sales"."id"
           FROM "public"."sales"
         LIMIT 1) "sub";


ALTER TABLE "public"."init_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "company_id" bigint NOT NULL,
    "project_id" bigint,
    "deal_id" bigint,
    "sales_id" bigint NOT NULL,
    "invoice_number" "text" NOT NULL,
    "description" "text",
    "amount" numeric(15,2) NOT NULL,
    "tax_rate" numeric(5,2) DEFAULT 0,
    "tax_amount" numeric(15,2) DEFAULT 0,
    "total_amount" numeric(15,2) NOT NULL,
    "line_items" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'Draft'::"text" NOT NULL,
    "issue_date" "date" DEFAULT CURRENT_DATE,
    "due_date" "date",
    "paid_date" "date",
    "payment_method" "text",
    "payment_reference" "text",
    "notes" "text",
    "terms" "text" DEFAULT 'Payment due within 30 days of invoice date.'::"text"
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."invoices_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."invoices_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."invoices_id_seq" OWNED BY "public"."invoices"."id";



CREATE TABLE IF NOT EXISTS "public"."lead_activities" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "lead_id" bigint NOT NULL,
    "sales_id" bigint,
    "activity_type" "text" NOT NULL,
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "score_delta" integer DEFAULT 0
);


ALTER TABLE "public"."lead_activities" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."lead_activities_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."lead_activities_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."lead_activities_id_seq" OWNED BY "public"."lead_activities"."id";



CREATE OR REPLACE VIEW "public"."lead_source_performance" WITH ("security_invoker"='on') AS
 SELECT "l"."source",
    "l"."utm_source",
    "l"."utm_medium",
    "l"."utm_campaign",
    "count"(*) AS "total_leads",
    "count"(
        CASE
            WHEN ("l"."status" = 'qualified'::"text") THEN 1
            ELSE NULL::integer
        END) AS "qualified_leads",
    "count"(
        CASE
            WHEN ("l"."status" = 'converted'::"text") THEN 1
            ELSE NULL::integer
        END) AS "converted_leads",
    "round"(((("count"(
        CASE
            WHEN ("l"."status" = 'converted'::"text") THEN 1
            ELSE NULL::integer
        END))::numeric / (NULLIF("count"(*), 0))::numeric) * (100)::numeric), 1) AS "conversion_rate",
    "avg"("l"."lead_score") AS "avg_lead_score",
    ("avg"((EXTRACT(epoch FROM ("l"."converted_at" - "l"."created_at")) / (86400)::numeric)))::integer AS "avg_days_to_convert"
   FROM "public"."leads" "l"
  GROUP BY "l"."source", "l"."utm_source", "l"."utm_medium", "l"."utm_campaign"
  ORDER BY ("count"(*)) DESC;


ALTER TABLE "public"."lead_source_performance" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."leads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."leads_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."leads_id_seq" OWNED BY "public"."leads"."id";



CREATE TABLE IF NOT EXISTS "public"."project_analytics" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "project_id" bigint NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "organic_traffic" integer DEFAULT 0,
    "keyword_rankings" "jsonb" DEFAULT '[]'::"jsonb",
    "domain_authority" numeric(5,2),
    "backlinks_count" integer DEFAULT 0,
    "leads_generated" integer DEFAULT 0,
    "lead_sources" "jsonb" DEFAULT '[]'::"jsonb",
    "form_submissions" integer DEFAULT 0,
    "phone_calls" integer DEFAULT 0,
    "revenue_from_leads" numeric(15,2) DEFAULT 0,
    "estimated_lead_value" numeric(15,2) DEFAULT 0,
    "page_speed_score" integer,
    "uptime_percent" numeric(5,2) DEFAULT 100.00,
    "performance_bonus_eligible" boolean DEFAULT false,
    "bonus_amount" numeric(15,2) DEFAULT 0,
    "bonus_notes" "text"
);


ALTER TABLE "public"."project_analytics" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."project_analytics_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."project_analytics_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."project_analytics_id_seq" OWNED BY "public"."project_analytics"."id";



CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "name" "text" NOT NULL,
    "description" "text",
    "project_type" "text" DEFAULT 'Website Build'::"text" NOT NULL,
    "company_id" bigint NOT NULL,
    "deal_id" bigint,
    "contact_ids" bigint[] DEFAULT '{}'::bigint[],
    "sales_id" bigint NOT NULL,
    "tech_stack" "text"[],
    "domain" "text",
    "staging_url" "text",
    "production_url" "text",
    "repo_url" "text",
    "start_date" "date",
    "target_end_date" "date",
    "actual_end_date" "date",
    "status" "text" DEFAULT 'Not Started'::"text" NOT NULL,
    "pm_notes" "text",
    "action_items" "jsonb" DEFAULT '[]'::"jsonb",
    "contract_value" numeric(15,2),
    "monthly_retainer" numeric(15,2) DEFAULT 0,
    "total_paid" numeric(15,2) DEFAULT 0,
    "deliverables" "text",
    "value_delivered" "text"
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."projects_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."projects_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."projects_id_seq" OWNED BY "public"."projects"."id";



ALTER TABLE "public"."sales" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."sales_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" NOT NULL
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


ALTER TABLE "public"."tags" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."tags_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" bigint NOT NULL,
    "contact_id" bigint NOT NULL,
    "type" "text",
    "text" "text",
    "due_date" timestamp with time zone,
    "done_date" timestamp with time zone,
    "sales_id" bigint
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


ALTER TABLE "public"."tasks" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."tasks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."touchpoints_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."touchpoints_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."touchpoints_id_seq" OWNED BY "public"."touchpoints"."id";



ALTER TABLE ONLY "public"."invoices" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."invoices_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."lead_activities" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."lead_activities_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."leads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."leads_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."project_analytics" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."project_analytics_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."projects" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."projects_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."touchpoints" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."touchpoints_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."configuration"
    ADD CONSTRAINT "configuration_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_notes"
    ADD CONSTRAINT "contactNotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deal_notes"
    ADD CONSTRAINT "dealNotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favicons_excluded_domains"
    ADD CONSTRAINT "favicons_excluded_domains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_activities"
    ADD CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_analytics"
    ADD CONSTRAINT "project_analytics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_analytics"
    ADD CONSTRAINT "project_analytics_project_id_date_key" UNIQUE ("project_id", "date");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."touchpoints"
    ADD CONSTRAINT "touchpoints_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_analytics_date" ON "public"."project_analytics" USING "btree" ("date");



CREATE INDEX "idx_analytics_project" ON "public"."project_analytics" USING "btree" ("project_id");



CREATE INDEX "idx_analytics_project_date" ON "public"."project_analytics" USING "btree" ("project_id", "date");



CREATE INDEX "idx_invoices_company" ON "public"."invoices" USING "btree" ("company_id");



CREATE INDEX "idx_invoices_due_date" ON "public"."invoices" USING "btree" ("due_date");



CREATE INDEX "idx_invoices_project" ON "public"."invoices" USING "btree" ("project_id");



CREATE INDEX "idx_invoices_sales" ON "public"."invoices" USING "btree" ("sales_id");



CREATE INDEX "idx_invoices_status" ON "public"."invoices" USING "btree" ("status");



CREATE INDEX "idx_lead_activities_created" ON "public"."lead_activities" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_lead_activities_lead" ON "public"."lead_activities" USING "btree" ("lead_id");



CREATE INDEX "idx_lead_activities_type" ON "public"."lead_activities" USING "btree" ("activity_type");



CREATE INDEX "idx_leads_created" ON "public"."leads" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_leads_email" ON "public"."leads" USING "btree" ("email");



CREATE INDEX "idx_leads_sales" ON "public"."leads" USING "btree" ("sales_id");



CREATE INDEX "idx_leads_score" ON "public"."leads" USING "btree" ("lead_score" DESC);



CREATE INDEX "idx_leads_source" ON "public"."leads" USING "btree" ("source");



CREATE INDEX "idx_leads_status" ON "public"."leads" USING "btree" ("status");



CREATE INDEX "idx_projects_company" ON "public"."projects" USING "btree" ("company_id");



CREATE INDEX "idx_projects_deal" ON "public"."projects" USING "btree" ("deal_id");



CREATE INDEX "idx_projects_sales" ON "public"."projects" USING "btree" ("sales_id");



CREATE INDEX "idx_projects_status" ON "public"."projects" USING "btree" ("status");



CREATE INDEX "idx_touchpoints_anonymous" ON "public"."touchpoints" USING "btree" ("anonymous_id");



CREATE INDEX "idx_touchpoints_channel" ON "public"."touchpoints" USING "btree" ("channel");



CREATE INDEX "idx_touchpoints_contact" ON "public"."touchpoints" USING "btree" ("contact_id");



CREATE INDEX "idx_touchpoints_created" ON "public"."touchpoints" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_touchpoints_deal" ON "public"."touchpoints" USING "btree" ("deal_id");



CREATE INDEX "idx_touchpoints_lead" ON "public"."touchpoints" USING "btree" ("lead_id");



CREATE INDEX "idx_touchpoints_type" ON "public"."touchpoints" USING "btree" ("touchpoint_type");



CREATE UNIQUE INDEX "uq__sales__user_id" ON "public"."sales" USING "btree" ("user_id");



CREATE OR REPLACE VIEW "public"."companies_summary" WITH ("security_invoker"='on') AS
 SELECT "c"."id",
    "c"."created_at",
    "c"."name",
    "c"."sector",
    "c"."size",
    "c"."linkedin_url",
    "c"."website",
    "c"."phone_number",
    "c"."address",
    "c"."zipcode",
    "c"."city",
    "c"."state_abbr",
    "c"."sales_id",
    "c"."context_links",
    "c"."country",
    "c"."description",
    "c"."revenue",
    "c"."tax_identifier",
    "c"."logo",
    "count"(DISTINCT "d"."id") AS "nb_deals",
    "count"(DISTINCT "co"."id") AS "nb_contacts"
   FROM (("public"."companies" "c"
     LEFT JOIN "public"."deals" "d" ON (("c"."id" = "d"."company_id")))
     LEFT JOIN "public"."contacts" "co" ON (("c"."id" = "co"."company_id")))
  GROUP BY "c"."id";



CREATE OR REPLACE VIEW "public"."contacts_summary" AS
 SELECT "co"."id",
    "co"."first_name",
    "co"."last_name",
    "co"."gender",
    "co"."title",
    "co"."email_jsonb",
    ("jsonb_path_query_array"("co"."email_jsonb", '$[*]."email"'::"jsonpath"))::"text" AS "email_fts",
    "co"."phone_jsonb",
    ("jsonb_path_query_array"("co"."phone_jsonb", '$[*]."number"'::"jsonpath"))::"text" AS "phone_fts",
    "co"."background",
    "co"."avatar",
    "co"."first_seen",
    "co"."last_seen",
    "co"."has_newsletter",
    "co"."status",
    "co"."tags",
    "co"."company_id",
    "co"."sales_id",
    "co"."linkedin_url",
    "c"."name" AS "company_name",
    "count"(DISTINCT "t"."id") AS "nb_tasks"
   FROM (("public"."contacts" "co"
     LEFT JOIN "public"."tasks" "t" ON (("co"."id" = "t"."contact_id")))
     LEFT JOIN "public"."companies" "c" ON (("co"."company_id" = "c"."id")))
  GROUP BY "co"."id", "c"."name";



CREATE OR REPLACE TRIGGER "auto_recalculate_lead_score" AFTER INSERT OR UPDATE ON "public"."lead_activities" FOR EACH ROW EXECUTE FUNCTION "public"."recalculate_lead_score"();



CREATE OR REPLACE TRIGGER "company_saved" BEFORE INSERT OR UPDATE ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."handle_company_saved"();



CREATE OR REPLACE TRIGGER "contact_saved" BEFORE INSERT OR UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_contact_saved"();



CREATE OR REPLACE TRIGGER "invoices_calculate_totals" BEFORE INSERT OR UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_invoice_totals"();



CREATE OR REPLACE TRIGGER "invoices_updated_at" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."update_invoices_timestamp"();



CREATE OR REPLACE TRIGGER "leads_updated_at" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."update_leads_timestamp"();



CREATE OR REPLACE TRIGGER "on_contact_notes_attachments_updated_delete_note_attachments" AFTER UPDATE ON "public"."contact_notes" FOR EACH ROW WHEN (("old"."attachments" IS DISTINCT FROM "new"."attachments")) EXECUTE FUNCTION "public"."cleanup_note_attachments"();



CREATE OR REPLACE TRIGGER "on_contact_notes_deleted_delete_note_attachments" AFTER DELETE ON "public"."contact_notes" FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_note_attachments"();



CREATE OR REPLACE TRIGGER "on_deal_notes_attachments_updated_delete_note_attachments" AFTER UPDATE ON "public"."deal_notes" FOR EACH ROW WHEN (("old"."attachments" IS DISTINCT FROM "new"."attachments")) EXECUTE FUNCTION "public"."cleanup_note_attachments"();



CREATE OR REPLACE TRIGGER "on_deal_notes_deleted_delete_note_attachments" AFTER DELETE ON "public"."deal_notes" FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_note_attachments"();



CREATE OR REPLACE TRIGGER "on_public_contact_notes_created_or_updated" AFTER INSERT ON "public"."contact_notes" FOR EACH ROW EXECUTE FUNCTION "public"."handle_contact_note_created_or_updated"();



CREATE OR REPLACE TRIGGER "projects_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."update_projects_timestamp"();



CREATE OR REPLACE TRIGGER "set_company_sales_id_trigger" BEFORE INSERT ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."set_sales_id_default"();



CREATE OR REPLACE TRIGGER "set_contact_notes_sales_id_trigger" BEFORE INSERT ON "public"."contact_notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_sales_id_default"();



CREATE OR REPLACE TRIGGER "set_contact_sales_id_trigger" BEFORE INSERT ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."set_sales_id_default"();



CREATE OR REPLACE TRIGGER "set_deal_notes_sales_id_trigger" BEFORE INSERT ON "public"."deal_notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_sales_id_default"();



CREATE OR REPLACE TRIGGER "set_deal_sales_id_trigger" BEFORE INSERT ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."set_sales_id_default"();



CREATE OR REPLACE TRIGGER "set_task_sales_id_trigger" BEFORE INSERT ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_sales_id_default"();



CREATE OR REPLACE TRIGGER "touchpoint_attribution_flags" BEFORE INSERT ON "public"."touchpoints" FOR EACH ROW EXECUTE FUNCTION "public"."set_attribution_flags"();



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "public"."sales"("id");



ALTER TABLE ONLY "public"."contact_notes"
    ADD CONSTRAINT "contactNotes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_notes"
    ADD CONSTRAINT "contactNotes_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "public"."sales"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "public"."sales"("id");



ALTER TABLE ONLY "public"."deal_notes"
    ADD CONSTRAINT "dealNotes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deal_notes"
    ADD CONSTRAINT "dealNotes_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "public"."sales"("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "public"."sales"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "public"."sales"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."lead_activities"
    ADD CONSTRAINT "lead_activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_activities"
    ADD CONSTRAINT "lead_activities_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "public"."sales"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_converted_contact_id_fkey" FOREIGN KEY ("converted_contact_id") REFERENCES "public"."contacts"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_converted_deal_id_fkey" FOREIGN KEY ("converted_deal_id") REFERENCES "public"."deals"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "public"."sales"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."project_analytics"
    ADD CONSTRAINT "project_analytics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "public"."sales"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."touchpoints"
    ADD CONSTRAINT "touchpoints_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."touchpoints"
    ADD CONSTRAINT "touchpoints_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."touchpoints"
    ADD CONSTRAINT "touchpoints_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."touchpoints"
    ADD CONSTRAINT "touchpoints_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "public"."sales"("id");



CREATE POLICY "Company Delete Policy" ON "public"."companies" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Contact Delete Policy" ON "public"."contacts" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Contact Notes Delete Policy" ON "public"."contact_notes" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Contact Notes Update policy" ON "public"."contact_notes" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Deal Notes Delete Policy" ON "public"."deal_notes" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Deal Notes Update Policy" ON "public"."deal_notes" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Deals Delete Policy" ON "public"."deals" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Enable access for authenticated users only" ON "public"."favicons_excluded_domains" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable delete for authenticated users only" ON "public"."tags" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Enable insert for admins" ON "public"."configuration" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "Enable insert for authenticated users only" ON "public"."companies" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."contact_notes" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."contacts" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."deal_notes" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."deals" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."tags" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."companies" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."contact_notes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."contacts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."deal_notes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."deals" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."sales" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."tags" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."tasks" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read for authenticated" ON "public"."configuration" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable update for admins" ON "public"."configuration" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Enable update for authenticated users only" ON "public"."companies" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable update for authenticated users only" ON "public"."contacts" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable update for authenticated users only" ON "public"."deals" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable update for authenticated users only" ON "public"."tags" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Task Delete Policy" ON "public"."tasks" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Task Update Policy" ON "public"."tasks" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Users can delete own invoices" ON "public"."invoices" FOR DELETE USING (("sales_id" = ( SELECT "sales"."id"
   FROM "public"."sales"
  WHERE ("sales"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can delete own leads" ON "public"."leads" FOR DELETE USING (("sales_id" = ( SELECT "sales"."id"
   FROM "public"."sales"
  WHERE ("sales"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can delete own projects" ON "public"."projects" FOR DELETE USING (("sales_id" = ( SELECT "sales"."id"
   FROM "public"."sales"
  WHERE ("sales"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert analytics for own projects" ON "public"."project_analytics" FOR INSERT WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."sales_id" = ( SELECT "sales"."id"
           FROM "public"."sales"
          WHERE ("sales"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can insert own invoices" ON "public"."invoices" FOR INSERT WITH CHECK (("sales_id" = ( SELECT "sales"."id"
   FROM "public"."sales"
  WHERE ("sales"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert own lead activities" ON "public"."lead_activities" FOR INSERT WITH CHECK (("lead_id" IN ( SELECT "leads"."id"
   FROM "public"."leads"
  WHERE ("leads"."sales_id" = ( SELECT "sales"."id"
           FROM "public"."sales"
          WHERE ("sales"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can insert own leads" ON "public"."leads" FOR INSERT WITH CHECK (("sales_id" = ( SELECT "sales"."id"
   FROM "public"."sales"
  WHERE ("sales"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert own projects" ON "public"."projects" FOR INSERT WITH CHECK (("sales_id" = ( SELECT "sales"."id"
   FROM "public"."sales"
  WHERE ("sales"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert touchpoints" ON "public"."touchpoints" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can update analytics for own projects" ON "public"."project_analytics" FOR UPDATE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."sales_id" = ( SELECT "sales"."id"
           FROM "public"."sales"
          WHERE ("sales"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can update own invoices" ON "public"."invoices" FOR UPDATE USING (("sales_id" = ( SELECT "sales"."id"
   FROM "public"."sales"
  WHERE ("sales"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can update own leads" ON "public"."leads" FOR UPDATE USING (("sales_id" = ( SELECT "sales"."id"
   FROM "public"."sales"
  WHERE ("sales"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can update own projects" ON "public"."projects" FOR UPDATE USING (("sales_id" = ( SELECT "sales"."id"
   FROM "public"."sales"
  WHERE ("sales"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view analytics for own projects" ON "public"."project_analytics" FOR SELECT USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."sales_id" = ( SELECT "sales"."id"
           FROM "public"."sales"
          WHERE ("sales"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view own invoices" ON "public"."invoices" FOR SELECT USING (("sales_id" = ( SELECT "sales"."id"
   FROM "public"."sales"
  WHERE ("sales"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view own lead activities" ON "public"."lead_activities" FOR SELECT USING (("lead_id" IN ( SELECT "leads"."id"
   FROM "public"."leads"
  WHERE ("leads"."sales_id" = ( SELECT "sales"."id"
           FROM "public"."sales"
          WHERE ("sales"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view own leads" ON "public"."leads" FOR SELECT USING (("sales_id" = ( SELECT "sales"."id"
   FROM "public"."sales"
  WHERE ("sales"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view own projects" ON "public"."projects" FOR SELECT USING (("sales_id" = ( SELECT "sales"."id"
   FROM "public"."sales"
  WHERE ("sales"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view own touchpoints" ON "public"."touchpoints" FOR SELECT USING ((("sales_id" = ( SELECT "sales"."id"
   FROM "public"."sales"
  WHERE ("sales"."user_id" = "auth"."uid"()))) OR ("sales_id" IS NULL)));



ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."configuration" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deal_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."favicons_excluded_domains" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_analytics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."touchpoints" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."convert_lead_to_contact"("p_lead_id" bigint, "p_deal_name" "text", "p_deal_amount" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."convert_lead_to_contact"("p_lead_id" bigint, "p_deal_name" "text", "p_deal_amount" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_user_id_by_email"("email" "text") FROM PUBLIC;



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."deals" TO "anon";
GRANT ALL ON TABLE "public"."deals" TO "authenticated";
GRANT ALL ON TABLE "public"."deals" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."touchpoints" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."touchpoints" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."touchpoints" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."channel_attribution_summary" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."channel_attribution_summary" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."channel_attribution_summary" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."companies_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."companies_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."companies_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."companies_summary" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."companies_summary" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."companies_summary" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."configuration" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."configuration" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."configuration" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."contact_notes" TO "anon";
GRANT ALL ON TABLE "public"."contact_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_notes" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."contactNotes_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."contactNotes_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."contactNotes_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."contacts_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."contacts_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."contacts_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."contacts_summary" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."contacts_summary" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."contacts_summary" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."leads" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."leads" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."leads" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."customer_journeys" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."customer_journeys" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."customer_journeys" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."deal_notes" TO "anon";
GRANT ALL ON TABLE "public"."deal_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."deal_notes" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."dealNotes_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."dealNotes_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."dealNotes_id_seq" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."deals_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."deals_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."deals_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."favicons_excluded_domains" TO "anon";
GRANT ALL ON TABLE "public"."favicons_excluded_domains" TO "authenticated";
GRANT ALL ON TABLE "public"."favicons_excluded_domains" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."favicons_excluded_domains_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."favicons_excluded_domains_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."favicons_excluded_domains_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."sales" TO "anon";
GRANT ALL ON TABLE "public"."sales" TO "authenticated";
GRANT ALL ON TABLE "public"."sales" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."init_state" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."init_state" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."init_state" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoices" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoices" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoices" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."invoices_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."invoices_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."invoices_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."lead_activities" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."lead_activities" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."lead_activities" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."lead_activities_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."lead_activities_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."lead_activities_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."lead_source_performance" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."lead_source_performance" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."lead_source_performance" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."leads_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."leads_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."leads_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."project_analytics" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."project_analytics" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."project_analytics" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."project_analytics_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."project_analytics_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."project_analytics_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."projects" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."projects" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."projects" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."projects_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."projects_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."projects_id_seq" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."sales_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."sales_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."sales_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."tags_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."tags_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."tags_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."tasks_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."tasks_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."tasks_id_seq" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."touchpoints_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."touchpoints_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."touchpoints_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLES  TO "service_role";


CREATE TRIGGER "on_auth_user_created"
  AFTER INSERT ON "auth"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();

CREATE TRIGGER "on_auth_user_updated"
  AFTER UPDATE ON "auth"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_update_user"();

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."companies";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."contacts";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."deals";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tasks";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."projects";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."invoices";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."contact_notes";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."deal_notes";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."leads";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."lead_activities";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."touchpoints";





