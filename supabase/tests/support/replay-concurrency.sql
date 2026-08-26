\if :{?setup_only}
\else
\set setup_only false
\endif

DROP SCHEMA IF EXISTS test_release CASCADE;
CREATE SCHEMA test_release;

CREATE TABLE test_release.command_inbox (
  provider text NOT NULL,
  event_key text NOT NULL,
  stream_key text NOT NULL,
  sequence_number bigint NOT NULL,
  state text NOT NULL CHECK (state IN ('processing', 'completed', 'ignored')),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
  completed_at timestamptz,
  PRIMARY KEY (provider, event_key)
);

CREATE TABLE test_release.stream_state (
  provider text NOT NULL,
  stream_key text NOT NULL,
  last_sequence bigint,
  last_event_key text,
  PRIMARY KEY (provider, stream_key)
);

CREATE TABLE test_release.command_effects (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider text NOT NULL,
  event_key text NOT NULL,
  stream_key text NOT NULL,
  sequence_number bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (provider, event_key)
);

CREATE OR REPLACE FUNCTION test_release.apply_command(
  p_provider text,
  p_event_key text,
  p_stream_key text,
  p_sequence_number bigint,
  p_should_fail boolean DEFAULT false,
  p_hold_ms integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_inserted integer;
  v_existing_state text;
  v_last_sequence bigint;
BEGIN
  IF p_provider IS NULL OR p_event_key IS NULL OR p_stream_key IS NULL THEN
    RAISE EXCEPTION 'command identity is required';
  END IF;
  IF p_sequence_number < 0 THEN
    RAISE EXCEPTION 'command sequence must be non-negative';
  END IF;
  IF p_hold_ms < 0 OR p_hold_ms > 5000 THEN
    RAISE EXCEPTION 'command hold is outside the test bound';
  END IF;

  INSERT INTO test_release.command_inbox (
    provider,
    event_key,
    stream_key,
    sequence_number,
    state
  )
  VALUES (
    p_provider,
    p_event_key,
    p_stream_key,
    p_sequence_number,
    'processing'
  )
  ON CONFLICT (provider, event_key) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT inbox.state
    INTO v_existing_state
    FROM test_release.command_inbox AS inbox
    WHERE inbox.provider = p_provider
      AND inbox.event_key = p_event_key
    FOR UPDATE;

    RETURN pg_catalog.jsonb_build_object(
      'result', 'duplicate',
      'state', v_existing_state,
      'event_key', p_event_key
    );
  END IF;

  IF p_should_fail THEN
    RAISE EXCEPTION 'synthetic retryable command failure' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO test_release.stream_state (provider, stream_key)
  VALUES (p_provider, p_stream_key)
  ON CONFLICT (provider, stream_key) DO NOTHING;

  SELECT stream.last_sequence
  INTO v_last_sequence
  FROM test_release.stream_state AS stream
  WHERE stream.provider = p_provider
    AND stream.stream_key = p_stream_key
  FOR UPDATE;

  IF p_hold_ms > 0 THEN
    PERFORM pg_catalog.pg_sleep(p_hold_ms::double precision / 1000.0);
  END IF;

  IF v_last_sequence IS NOT NULL AND p_sequence_number <= v_last_sequence THEN
    UPDATE test_release.command_inbox
    SET state = 'ignored', completed_at = pg_catalog.clock_timestamp()
    WHERE provider = p_provider AND event_key = p_event_key;

    RETURN pg_catalog.jsonb_build_object(
      'result', 'ignored',
      'state', 'ignored',
      'event_key', p_event_key,
      'last_sequence', v_last_sequence
    );
  END IF;

  INSERT INTO test_release.command_effects (
    provider,
    event_key,
    stream_key,
    sequence_number
  )
  VALUES (p_provider, p_event_key, p_stream_key, p_sequence_number);

  UPDATE test_release.stream_state
  SET last_sequence = p_sequence_number, last_event_key = p_event_key
  WHERE provider = p_provider AND stream_key = p_stream_key;

  UPDATE test_release.command_inbox
  SET state = 'completed', completed_at = pg_catalog.clock_timestamp()
  WHERE provider = p_provider AND event_key = p_event_key;

  RETURN pg_catalog.jsonb_build_object(
    'result', 'applied',
    'state', 'completed',
    'event_key', p_event_key,
    'last_sequence', p_sequence_number
  );
END;
$function$;

REVOKE ALL ON SCHEMA test_release FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA test_release FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA test_release FROM PUBLIC;

\if :setup_only
\else
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path TO public, extensions;
BEGIN;
SELECT plan(18);

SELECT is(
  test_release.apply_command('fixture', 'event-001', 'stream-a', 10)->>'result',
  'applied',
  'a first command is applied'
);
SELECT is(
  (SELECT state FROM test_release.command_inbox WHERE event_key = 'event-001'),
  'completed',
  'the first claim reaches a terminal state'
);
SELECT is(
  (SELECT count(*)::text FROM test_release.command_effects WHERE event_key = 'event-001'),
  '1',
  'the first command creates exactly one effect'
);

SELECT is(
  test_release.apply_command('fixture', 'event-001', 'stream-a', 10)->>'result',
  'duplicate',
  'a sequential duplicate is rejected'
);
SELECT is(
  (SELECT count(*)::text FROM test_release.command_effects WHERE event_key = 'event-001'),
  '1',
  'a sequential duplicate creates no second effect'
);
SELECT is(
  test_release.apply_command('fixture', 'event-001', 'stream-a', 10)->>'result',
  'duplicate',
  'a completed command replay stays duplicate'
);
SELECT is(
  (SELECT count(*)::text FROM test_release.command_effects WHERE event_key = 'event-001'),
  '1',
  'a completed replay retains one effect'
);

SELECT is(
  test_release.apply_command('fixture', 'event-020', 'stream-a', 20)->>'result',
  'applied',
  'a later stream sequence advances state'
);
SELECT is(
  (SELECT last_sequence::text FROM test_release.stream_state WHERE stream_key = 'stream-a'),
  '20',
  'stream state records the later sequence'
);
SELECT is(
  test_release.apply_command('fixture', 'event-015', 'stream-a', 15)->>'result',
  'ignored',
  'an earlier sequence arriving later is ignored'
);
SELECT is(
  (SELECT last_sequence::text FROM test_release.stream_state WHERE stream_key = 'stream-a'),
  '20',
  'an earlier sequence cannot regress stream state'
);
SELECT is(
  (SELECT count(*)::text FROM test_release.command_effects WHERE event_key = 'event-015'),
  '0',
  'an ignored earlier sequence creates no effect'
);
SELECT is(
  (SELECT count(*)::text FROM test_release.command_effects WHERE stream_key = 'stream-a'),
  '2',
  'only the two advancing sequences have effects'
);

SELECT throws_ok(
  $$SELECT test_release.apply_command('fixture', 'event-fail', 'stream-fail', 1, true)$$,
  'P0001',
  'synthetic retryable command failure',
  'a failed claimed transaction is surfaced'
);
SELECT is(
  (SELECT count(*)::text FROM test_release.command_inbox WHERE event_key = 'event-fail'),
  '0',
  'a failed transaction leaves no committed claim'
);
SELECT is(
  (SELECT count(*)::text FROM test_release.command_effects WHERE event_key = 'event-fail'),
  '0',
  'a failed transaction leaves no committed effect'
);
SELECT is(
  test_release.apply_command('fixture', 'event-fail', 'stream-fail', 1)->>'result',
  'applied',
  'the rolled-back key is explicitly retryable'
);
SELECT is(
  (SELECT count(*)::text FROM test_release.command_effects WHERE event_key = 'event-fail'),
  '1',
  'the successful retry creates exactly one effect'
);

SELECT * FROM finish();
ROLLBACK;
DROP SCHEMA test_release CASCADE;
\endif
