CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path TO public, extensions;

BEGIN;

SELECT plan(48);

SELECT is(
  (
    SELECT count(*)
    FROM pg_class AS relation
    WHERE relation.oid = ANY (ARRAY[
      'public.billing_automation_principals'::regclass,
      'public.billing_automation_grants'::regclass,
      'public.billing_automation_executions'::regclass
    ]) AND relation.relrowsecurity
  ),
  3::bigint,
  'all automation relations have row-level security enabled'
);
SELECT is(
  (
    SELECT count(*)
    FROM pg_class AS relation
    WHERE relation.oid = ANY (ARRAY[
      'public.billing_automation_principals'::regclass,
      'public.billing_automation_grants'::regclass,
      'public.billing_automation_executions'::regclass
    ]) AND relation.relforcerowsecurity
  ),
  3::bigint,
  'all automation relations force row-level security'
);
SELECT ok(
  (
    SELECT coalesce(array_to_string(proconfig, ','), '') IN ('search_path=', 'search_path=""')
    FROM pg_proc
    WHERE oid = 'private.billing_consume_automation_grant(uuid,uuid,text,text,text,text,numeric,text)'::regprocedure
  ),
  'private automation grant helper has an empty search_path'
);
SELECT ok(
  (
    SELECT coalesce(array_to_string(proconfig, ','), '') IN ('search_path=', 'search_path=""')
    FROM pg_proc
    WHERE oid = 'public.execute_billing_automation_command(uuid,uuid,text,text,text,text,numeric,text)'::regprocedure
  ),
  'public effect entry point has an empty search_path'
);
SELECT ok(
  NOT has_function_privilege(
    'public',
    'private.billing_consume_automation_grant(uuid,uuid,text,text,text,text,numeric,text)',
    'EXECUTE'
  ),
  'PUBLIC cannot execute the private grant helper'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'private.billing_consume_automation_grant(uuid,uuid,text,text,text,text,numeric,text)',
    'EXECUTE'
  ),
  'authenticated callers cannot bypass the public effect entry point'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.execute_billing_automation_command(uuid,uuid,text,text,text,text,numeric,text)',
    'EXECUTE'
  ),
  'authenticated callers can execute only the public effect entry point'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.execute_billing_automation_command(uuid,uuid,text,text,text,text,numeric,text)',
    'EXECUTE'
  ),
  'anonymous callers cannot execute the automation entry point'
);
SELECT is(
  (
    SELECT count(*)
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name LIKE 'billing_automation_%'
      AND grantee = 'authenticated'
  ),
  0::bigint,
  'authenticated callers have no direct automation table privileges'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.billing_role_assignments AS assignment
    JOIN public.sales AS sale ON sale.id = assignment.sales_id
    WHERE sale.user_id IN (
      '21000000-0000-0000-0000-000000000006'::uuid,
      '22000000-0000-0000-0000-000000000006'::uuid
    )
  ),
  0::bigint,
  'automation identities inherit no human billing role'
);

SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000006', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is(
  public.execute_billing_automation_command(
    '22000000-0000-0000-0000-000000000500',
    '22000000-0000-0000-0000-000000000200',
    'test.nonfinancial', 'provider-bravo-fixture', 'policy-fixture-v1',
    'record.test', 1.00, 'alpha-cross-org-001'
  )->>'result',
  'denied',
  'automation cannot consume another organization grant'
);
SELECT is(
  public.execute_billing_automation_command(
    '21000000-0000-0000-0000-000000000500',
    '22000000-0000-0000-0000-000000000200',
    'test.nonfinancial', 'provider-alpha-fixture', 'policy-fixture-v1',
    'record.test', 1.00, 'alpha-wrong-account-001'
  )->>'result',
  'denied',
  'automation cannot substitute another account'
);
SELECT is(
  public.execute_billing_automation_command(
    '21000000-0000-0000-0000-000000000500',
    '21000000-0000-0000-0000-000000000200',
    'test.nonfinancial', 'provider-wrong-fixture', 'policy-fixture-v1',
    'record.test', 1.00, 'alpha-wrong-provider-001'
  )->>'result',
  'denied',
  'automation cannot substitute provider authority'
);
SELECT is(
  public.execute_billing_automation_command(
    '21000000-0000-0000-0000-000000000500',
    '21000000-0000-0000-0000-000000000200',
    'test.nonfinancial', 'provider-alpha-fixture', 'policy-wrong-v9',
    'record.test', 1.00, 'alpha-wrong-policy-001'
  )->>'result',
  'denied',
  'automation cannot substitute a policy version'
);
SELECT is(
  public.execute_billing_automation_command(
    '21000000-0000-0000-0000-000000000500',
    '21000000-0000-0000-0000-000000000200',
    'test.nonfinancial', 'provider-alpha-fixture', 'policy-fixture-v1',
    'record.wrong', 1.00, 'alpha-wrong-action-001'
  )->>'result',
  'denied',
  'automation cannot substitute an action kind'
);
SELECT is(
  public.execute_billing_automation_command(
    '21000000-0000-0000-0000-000000000599',
    '21000000-0000-0000-0000-000000000200',
    'test.nonfinancial', 'provider-alpha-fixture', 'policy-fixture-v1',
    'record.test', 1.00, 'alpha-missing-grant-001'
  )->>'result',
  'denied',
  'a missing grant fails closed'
);

RESET ROLE;

SELECT is((SELECT count(*) FROM public.billing_automation_executions), 0::bigint, 'tuple mismatches create no protected effect');
SELECT is(
  (SELECT actions_consumed FROM public.billing_automation_grants WHERE id = '21000000-0000-0000-0000-000000000500'),
  0,
  'tuple mismatches consume no action allowance'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.billing_audit_events
    WHERE actor_id = '21000000-0000-0000-0000-000000000400'
      AND action = 'automation.command'
      AND result = 'denied'
      AND reason = 'GRANT_NOT_AUTHORIZED'
  ),
  6::bigint,
  'every authenticated tuple mismatch appends one exact denial audit'
);

SET LOCAL ROLE authenticated;
SELECT is(
  public.execute_billing_automation_command(
    '21000000-0000-0000-0000-000000000500',
    '21000000-0000-0000-0000-000000000200',
    'test.nonfinancial', 'provider-alpha-fixture', 'policy-fixture-v1',
    'record.test', 25.00, 'alpha-command-0001'
  )->>'result',
  'applied',
  'an exact grant applies one synthetic nonfinancial command'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.billing_automation_executions WHERE idempotency_key = 'alpha-command-0001'),
  1::bigint,
  'an allowed command creates exactly one protected effect receipt'
);
SELECT is(
  (
    SELECT jsonb_build_object('actions', actions_consumed, 'amount', total_amount_consumed::text)
    FROM public.billing_automation_grants
    WHERE id = '21000000-0000-0000-0000-000000000500'
  ),
  '{"actions": 1, "amount": "25.00"}'::jsonb,
  'an allowed command consumes the exact action and numeric amount'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.billing_audit_events
    WHERE actor_id = '21000000-0000-0000-0000-000000000400'
      AND action = 'automation.command'
      AND result = 'succeeded'
      AND reason IS NULL
      AND NOT (details ? 'provider_reference')
  ),
  1::bigint,
  'an allowed command appends one provider-safe success audit'
);

CREATE OR REPLACE FUNCTION public.test_billing_automation_retry_failure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'synthetic retryable automation failure' USING ERRCODE = 'P0001';
END;
$function$;
CREATE TRIGGER test_billing_automation_retry_failure
BEFORE INSERT ON public.billing_automation_executions
FOR EACH ROW
WHEN (NEW.idempotency_key = 'alpha-retry-0001')
EXECUTE FUNCTION public.test_billing_automation_retry_failure();
SELECT pass('retryable failure fixture is installed transactionally');

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.execute_billing_automation_command(
    '21000000-0000-0000-0000-000000000500',
    '21000000-0000-0000-0000-000000000200',
    'test.nonfinancial', 'provider-alpha-fixture', 'policy-fixture-v1',
    'record.test', 10.00, 'alpha-retry-0001'
  )$$,
  'P0001',
  'synthetic retryable automation failure',
  'a protected-effect failure aborts the command statement'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.billing_automation_executions WHERE idempotency_key = 'alpha-retry-0001'),
  0::bigint,
  'a retryable failure leaves no effect receipt'
);
SELECT is(
  (SELECT actions_consumed FROM public.billing_automation_grants WHERE id = '21000000-0000-0000-0000-000000000500'),
  1,
  'a retryable failure rolls back grant consumption'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.billing_audit_events
    WHERE actor_id = '21000000-0000-0000-0000-000000000400'
      AND action = 'automation.command'
      AND subject_id = 'alpha-retry-0001'
  ),
  0::bigint,
  'a retryable failure rolls back the command audit'
);
DROP TRIGGER test_billing_automation_retry_failure ON public.billing_automation_executions;
DROP FUNCTION public.test_billing_automation_retry_failure();
SELECT pass('retryable failure fixture is removed before retry');

SET LOCAL ROLE authenticated;
SELECT is(
  public.execute_billing_automation_command(
    '21000000-0000-0000-0000-000000000500',
    '21000000-0000-0000-0000-000000000200',
    'test.nonfinancial', 'provider-alpha-fixture', 'policy-fixture-v1',
    'record.test', 10.00, 'alpha-retry-0001'
  )->>'result',
  'applied',
  'the rolled-back command key is explicitly retryable'
);
RESET ROLE;
SELECT is(
  (
    SELECT jsonb_build_object(
      'actions', actions_consumed,
      'amount', total_amount_consumed::text,
      'status', status
    )
    FROM public.billing_automation_grants
    WHERE id = '21000000-0000-0000-0000-000000000500'
  ),
  '{"actions": 2, "amount": "35.00", "status": "exhausted"}'::jsonb,
  'the successful retry consumes the final exact allowance'
);

SET LOCAL ROLE authenticated;
SELECT is(
  public.execute_billing_automation_command(
    '21000000-0000-0000-0000-000000000500',
    '21000000-0000-0000-0000-000000000200',
    'test.nonfinancial', 'provider-alpha-fixture', 'policy-fixture-v1',
    'record.test', 10.00, 'alpha-retry-0001'
  )->>'result',
  'duplicate',
  'a completed command key is idempotently recognized after exhaustion'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.billing_automation_executions WHERE idempotency_key = 'alpha-retry-0001'),
  1::bigint,
  'a duplicate command key creates no second effect'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.billing_audit_events
    WHERE actor_id = '21000000-0000-0000-0000-000000000400'
      AND action = 'automation.command'
      AND result = 'ignored'
      AND reason = 'DUPLICATE_COMMAND'
  ),
  1::bigint,
  'a duplicate command appends one exact ignored audit'
);

INSERT INTO public.billing_automation_grants (
  id, organization_id, account_id, principal_id, command_name,
  provider_reference, policy_version, action_kind, max_amount, max_actions
) VALUES (
  '21000000-0000-0000-0000-000000000510',
  '21000000-0000-0000-0000-000000000100',
  '21000000-0000-0000-0000-000000000200',
  '21000000-0000-0000-0000-000000000400',
  'test.amount-limit', 'provider-alpha-fixture', 'policy-fixture-v1',
  'record.amount-limit', 10.00, 5
);
SET LOCAL ROLE authenticated;
SELECT is(
  public.execute_billing_automation_command(
    '21000000-0000-0000-0000-000000000510',
    '21000000-0000-0000-0000-000000000200',
    'test.amount-limit', 'provider-alpha-fixture', 'policy-fixture-v1',
    'record.amount-limit', 10.01, 'alpha-amount-limit-0001'
  )->>'reason_code',
  'GRANT_LIMIT_EXCEEDED',
  'an amount above the exact remaining limit is denied'
);
RESET ROLE;
SELECT is(
  (
    SELECT jsonb_build_object('actions', actions_consumed, 'amount', total_amount_consumed::text)
    FROM public.billing_automation_grants
    WHERE id = '21000000-0000-0000-0000-000000000510'
  ),
  '{"actions": 0, "amount": "0.00"}'::jsonb,
  'a limit denial consumes no counters'
);
SELECT is(
  (SELECT count(*) FROM public.billing_automation_executions WHERE idempotency_key = 'alpha-amount-limit-0001'),
  0::bigint,
  'a limit denial creates no effect'
);

INSERT INTO public.billing_automation_grants (
  id, organization_id, account_id, principal_id, command_name,
  provider_reference, policy_version, action_kind, max_actions,
  valid_from, valid_until
) VALUES (
  '21000000-0000-0000-0000-000000000511',
  '21000000-0000-0000-0000-000000000100',
  '21000000-0000-0000-0000-000000000200',
  '21000000-0000-0000-0000-000000000400',
  'test.expired', 'provider-alpha-fixture', 'policy-fixture-v1',
  'record.expired', 1, now() - interval '2 days', now() - interval '1 day'
);
SET LOCAL ROLE authenticated;
SELECT is(
  public.execute_billing_automation_command(
    '21000000-0000-0000-0000-000000000511',
    '21000000-0000-0000-0000-000000000200',
    'test.expired', 'provider-alpha-fixture', 'policy-fixture-v1',
    'record.expired', 0, 'alpha-expired-0001'
  )->>'result',
  'denied',
  'an expired exact grant is denied'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.billing_automation_executions WHERE idempotency_key = 'alpha-expired-0001'),
  0::bigint,
  'an expired grant creates no effect'
);

INSERT INTO public.billing_automation_grants (
  id, organization_id, account_id, principal_id, command_name,
  provider_reference, policy_version, action_kind, max_actions,
  status, disabled_at, disabled_reason
) VALUES (
  '21000000-0000-0000-0000-000000000512',
  '21000000-0000-0000-0000-000000000100',
  '21000000-0000-0000-0000-000000000200',
  '21000000-0000-0000-0000-000000000400',
  'test.disabled', 'provider-alpha-fixture', 'policy-fixture-v1',
  'record.disabled', 1, 'disabled', now(), 'test disabled grant'
);
SET LOCAL ROLE authenticated;
SELECT is(
  public.execute_billing_automation_command(
    '21000000-0000-0000-0000-000000000512',
    '21000000-0000-0000-0000-000000000200',
    'test.disabled', 'provider-alpha-fixture', 'policy-fixture-v1',
    'record.disabled', 0, 'alpha-disabled-0001'
  )->>'result',
  'denied',
  'a disabled exact grant is denied'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.billing_automation_executions WHERE idempotency_key = 'alpha-disabled-0001'),
  0::bigint,
  'a disabled grant creates no effect'
);

UPDATE public.billing_automation_principals
SET status = 'disabled', disabled_at = now(), disabled_reason = 'test disabled principal'
WHERE id = '22000000-0000-0000-0000-000000000400';
SELECT pass('the Bravo automation principal is disabled non-destructively');
SELECT set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000006', true);
SELECT set_config('request.jwt.claims', '{"sub":"22000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is(
  public.execute_billing_automation_command(
    '22000000-0000-0000-0000-000000000500',
    '22000000-0000-0000-0000-000000000200',
    'test.nonfinancial', 'provider-bravo-fixture', 'policy-fixture-v1',
    'record.test', 1, 'bravo-disabled-principal-0001'
  )->>'result',
  'denied',
  'a disabled principal receives no grant authority'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.billing_automation_executions WHERE idempotency_key = 'bravo-disabled-principal-0001'),
  0::bigint,
  'a disabled principal creates no effect'
);

SELECT throws_ok(
  $$INSERT INTO public.billing_role_assignments (organization_id, account_id, sales_id, role)
    SELECT
      '21000000-0000-0000-0000-000000000100'::uuid,
      '21000000-0000-0000-0000-000000000200'::uuid,
      id,
      'reviewer'
    FROM public.sales
    WHERE user_id = '21000000-0000-0000-0000-000000000006'::uuid$$,
  'P0001',
  'Automation principals cannot inherit human billing roles',
  'an automation identity cannot receive a human role'
);
SELECT throws_ok(
  $$INSERT INTO public.billing_automation_principals (
      organization_id, auth_user_id, name
    ) VALUES (
      '21000000-0000-0000-0000-000000000100',
      '21000000-0000-0000-0000-000000000001',
      'Forbidden Human Overlap'
    )$$,
  'P0001',
  'Automation principals cannot inherit human billing roles',
  'a human role holder cannot become an active automation principal'
);
SELECT throws_ok(
  $$UPDATE public.billing_automation_executions
    SET result = 'succeeded'
    WHERE idempotency_key = 'alpha-command-0001'$$,
  'P0001',
  'Automation execution receipts are append-only',
  'automation effect receipts cannot be updated'
);
SELECT throws_ok(
  $$DELETE FROM public.billing_automation_executions
    WHERE idempotency_key = 'alpha-command-0001'$$,
  'P0001',
  'Automation execution receipts are append-only',
  'automation effect receipts cannot be deleted'
);

SELECT * FROM finish();
ROLLBACK;
