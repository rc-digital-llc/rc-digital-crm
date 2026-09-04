-- Keep malformed invoice JSON behind the stable public save error contract.

ALTER FUNCTION public.save_billing_invoice_exact(jsonb)
  SET SCHEMA private;
ALTER FUNCTION private.save_billing_invoice_exact(jsonb)
  RENAME TO billing_save_invoice_exact_impl;

REVOKE ALL ON FUNCTION private.billing_save_invoice_exact_impl(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.save_billing_invoice_exact(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN private.billing_save_invoice_exact_impl(p_request);
EXCEPTION
  WHEN SQLSTATE '22023' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVOICE_SAVE_INVALID_REQUEST';
END;
$function$;

ALTER FUNCTION private.billing_save_invoice_exact_impl(jsonb) OWNER TO postgres;
ALTER FUNCTION public.save_billing_invoice_exact(jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.save_billing_invoice_exact(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_billing_invoice_exact(jsonb)
  TO authenticated, service_role;
