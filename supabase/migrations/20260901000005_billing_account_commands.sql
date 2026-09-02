-- Phase 2: caller-bound, atomic billing-account boundary saves.

ALTER TABLE public.billing_contacts
  DROP CONSTRAINT billing_contacts_method_value;

ALTER TABLE public.billing_contacts
  ADD CONSTRAINT billing_contacts_method_value CHECK (
    (preferred_contact_method = 'email' AND NULLIF(btrim(email), '') IS NOT NULL)
    OR (preferred_contact_method IN ('phone', 'text') AND NULLIF(btrim(phone), '') IS NOT NULL)
    OR preferred_contact_method = 'none'
  );

ALTER TABLE public.billing_contacts
  DROP CONSTRAINT billing_contacts_preferred_contact_method_check;

ALTER TABLE public.billing_contacts
  ADD CONSTRAINT billing_contacts_preferred_contact_method_check
  CHECK (preferred_contact_method IN ('email', 'phone', 'text', 'none'));

CREATE OR REPLACE FUNCTION public.save_billing_account_boundary(p_payload jsonb)
RETURNS public.billing_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  caller_user_id uuid := (SELECT auth.uid());
  account_id_value uuid := NULLIF(p_payload->>'account_id', '')::uuid;
  account_row public.billing_accounts%ROWTYPE;
  organization_id_value uuid;
  eligible_organization_count integer;
  owner_sales_id_value bigint;
  contact_value jsonb;
  contact_id_value uuid;
  contact_active boolean;
  contact_method text;
  contact_reason text;
  status_value text := NULLIF(btrim(p_payload->>'billing_status'), '');
  customer_name_value text := NULLIF(btrim(p_payload->>'customer_name'), '');
  lifecycle_reason_value text := NULLIF(btrim(p_payload->>'lifecycle_reason'), '');
  existing_owner public.billing_account_owners%ROWTYPE;
BEGIN
  IF caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Billing account save is not authorized';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_payload) AS payload_key
      WHERE payload_key NOT IN (
        'account_id', 'customer_name', 'billing_status',
        'responsible_owner_sales_id', 'billing_contacts', 'lifecycle_reason'
      )
    )
  THEN
    RAISE EXCEPTION 'Billing account payload is invalid';
  END IF;

  IF customer_name_value IS NULL OR status_value NOT IN ('active', 'on_hold', 'closed') THEN
    RAISE EXCEPTION 'Billing account payload is invalid';
  END IF;
  IF status_value IN ('on_hold', 'closed') AND lifecycle_reason_value IS NULL THEN
    RAISE EXCEPTION 'Billing lifecycle reason is required';
  END IF;
  IF jsonb_typeof(p_payload->'responsible_owner_sales_id') <> 'number' THEN
    RAISE EXCEPTION 'Responsible owner is required';
  END IF;
  owner_sales_id_value := (p_payload->>'responsible_owner_sales_id')::bigint;

  IF jsonb_typeof(p_payload->'billing_contacts') <> 'array'
    OR jsonb_array_length(p_payload->'billing_contacts') = 0
    OR jsonb_array_length(p_payload->'billing_contacts') > 100
    OR NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_payload->'billing_contacts') AS active_contact(value)
      WHERE jsonb_typeof(active_contact.value->'active') = 'boolean'
        AND (active_contact.value->>'active')::boolean
    )
  THEN
    RAISE EXCEPTION 'At least one active billing contact is required';
  END IF;

  IF account_id_value IS NULL THEN
    SELECT
      count(DISTINCT assignment.organization_id),
      min(assignment.organization_id::text)::uuid
    INTO eligible_organization_count, organization_id_value
    FROM public.billing_role_assignments AS assignment
    JOIN public.billing_role_capabilities AS capability
      ON capability.role = assignment.role
    JOIN public.sales AS sale ON sale.id = assignment.sales_id
    JOIN public.billing_organizations AS organization
      ON organization.id = assignment.organization_id
    WHERE sale.user_id = caller_user_id
      AND NOT sale.disabled
      AND assignment.account_id IS NULL
      AND assignment.disabled_at IS NULL
      AND assignment.valid_from <= pg_catalog.now()
      AND (assignment.valid_until IS NULL OR assignment.valid_until > pg_catalog.now())
      AND capability.capability = 'account.create'
      AND organization.status = 'active';

    IF eligible_organization_count <> 1 OR organization_id_value IS NULL THEN
      RAISE EXCEPTION 'Billing account save is not authorized';
    END IF;

    IF NOT private.billing_has_capability(
      organization_id_value,
      NULL,
      'owner.manage'
    ) OR NOT private.billing_has_capability(
      organization_id_value,
      NULL,
      'contact.manage'
    ) THEN
      RAISE EXCEPTION 'Billing account save is not authorized';
    END IF;

    INSERT INTO public.billing_accounts (
      organization_id, customer_name, billing_status, ended_at, end_reason
    ) VALUES (
      organization_id_value,
      customer_name_value,
      status_value,
      CASE WHEN status_value = 'closed' THEN pg_catalog.now() ELSE NULL END,
      CASE WHEN status_value = 'active' THEN NULL ELSE lifecycle_reason_value END
    ) RETURNING * INTO account_row;
    account_id_value := account_row.id;
  ELSE
    SELECT * INTO account_row
    FROM public.billing_accounts AS account
    WHERE account.id = account_id_value
    FOR UPDATE;

    IF NOT FOUND OR NOT private.billing_has_capability(
      account_row.organization_id,
      account_row.id,
      'account.update'
    ) THEN
      RAISE EXCEPTION 'Billing account save is not authorized';
    END IF;
    organization_id_value := account_row.organization_id;

    IF NOT private.billing_has_capability(
      organization_id_value,
      account_id_value,
      'owner.manage'
    ) OR NOT private.billing_has_capability(
      organization_id_value,
      account_id_value,
      'contact.manage'
    ) THEN
      RAISE EXCEPTION 'Billing account save is not authorized';
    END IF;

    UPDATE public.billing_accounts
    SET customer_name = customer_name_value,
        billing_status = status_value,
        updated_at = pg_catalog.now(),
        ended_at = CASE WHEN status_value = 'closed' THEN pg_catalog.now() ELSE NULL END,
        end_reason = CASE WHEN status_value = 'active' THEN NULL ELSE lifecycle_reason_value END
    WHERE id = account_id_value
    RETURNING * INTO account_row;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sales AS sale
    JOIN public.billing_role_assignments AS assignment
      ON assignment.sales_id = sale.id
    WHERE sale.id = owner_sales_id_value
      AND NOT sale.disabled
      AND assignment.organization_id = organization_id_value
      AND assignment.disabled_at IS NULL
      AND assignment.valid_from <= pg_catalog.now()
      AND (assignment.valid_until IS NULL OR assignment.valid_until > pg_catalog.now())
  ) THEN
    RAISE EXCEPTION 'Responsible owner is invalid';
  END IF;

  SELECT * INTO existing_owner
  FROM public.billing_account_owners AS owner_record
  WHERE owner_record.account_id = account_id_value
    AND owner_record.effective_until IS NULL
  FOR UPDATE;

  IF existing_owner.id IS NULL OR existing_owner.sales_id <> owner_sales_id_value THEN
    IF existing_owner.id IS NOT NULL THEN
      UPDATE public.billing_account_owners
      SET effective_until = pg_catalog.now(),
          end_reason = 'Responsible owner reassigned'
      WHERE id = existing_owner.id;
    END IF;
    INSERT INTO public.billing_account_owners (
      organization_id, account_id, sales_id
    ) VALUES (
      organization_id_value, account_id_value, owner_sales_id_value
    );
  END IF;

  FOR contact_value IN
    SELECT value FROM jsonb_array_elements(p_payload->'billing_contacts')
  LOOP
    IF jsonb_typeof(contact_value) <> 'object'
      OR EXISTS (
        SELECT 1
        FROM jsonb_object_keys(contact_value) AS contact_key
        WHERE contact_key NOT IN (
          'id', 'name', 'email', 'phone', 'preferred_contact_method',
          'auth_user_id', 'active', 'end_reason'
        )
      )
      OR NULLIF(btrim(contact_value->>'name'), '') IS NULL
      OR jsonb_typeof(contact_value->'active') <> 'boolean'
    THEN
      RAISE EXCEPTION 'Billing contact payload is invalid';
    END IF;

    contact_id_value := NULLIF(contact_value->>'id', '')::uuid;
    contact_active := (contact_value->>'active')::boolean;
    contact_method := NULLIF(btrim(contact_value->>'preferred_contact_method'), '');
    contact_reason := NULLIF(btrim(contact_value->>'end_reason'), '');

    IF contact_method NOT IN ('email', 'phone', 'text', 'none')
      OR (contact_method = 'email' AND NULLIF(btrim(contact_value->>'email'), '') IS NULL)
      OR (contact_method IN ('phone', 'text') AND NULLIF(btrim(contact_value->>'phone'), '') IS NULL)
      OR (NOT contact_active AND contact_reason IS NULL)
    THEN
      RAISE EXCEPTION 'Billing contact payload is invalid';
    END IF;

    IF contact_id_value IS NULL THEN
      INSERT INTO public.billing_contacts (
        organization_id, account_id, name, email, phone,
        preferred_contact_method, auth_user_id, active,
        effective_until, end_reason
      ) VALUES (
        organization_id_value,
        account_id_value,
        btrim(contact_value->>'name'),
        NULLIF(btrim(contact_value->>'email'), ''),
        NULLIF(btrim(contact_value->>'phone'), ''),
        contact_method,
        NULLIF(contact_value->>'auth_user_id', '')::uuid,
        contact_active,
        CASE WHEN contact_active THEN NULL ELSE pg_catalog.now() END,
        CASE WHEN contact_active THEN NULL ELSE contact_reason END
      );
    ELSE
      UPDATE public.billing_contacts
      SET name = btrim(contact_value->>'name'),
          email = NULLIF(btrim(contact_value->>'email'), ''),
          phone = NULLIF(btrim(contact_value->>'phone'), ''),
          preferred_contact_method = contact_method,
          auth_user_id = NULLIF(contact_value->>'auth_user_id', '')::uuid,
          active = contact_active,
          effective_until = CASE
            WHEN contact_active THEN NULL
            WHEN effective_until IS NULL THEN pg_catalog.now()
            ELSE effective_until
          END,
          end_reason = CASE WHEN contact_active THEN NULL ELSE contact_reason END,
          updated_at = pg_catalog.now()
      WHERE id = contact_id_value
        AND organization_id = organization_id_value
        AND account_id = account_id_value;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Billing contact payload is invalid';
      END IF;
    END IF;
  END LOOP;

  SELECT * INTO account_row
  FROM public.billing_accounts AS account
  WHERE account.id = account_id_value;
  RETURN account_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_billing_account_boundary(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_billing_account_boundary(jsonb) TO authenticated;
