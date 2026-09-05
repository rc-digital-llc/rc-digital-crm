FINANCIAL_DATABASE_SQL_TESTS := \
	supabase/tests/database/00_schema_contracts.sql \
	supabase/tests/database/10_authorization_rls.sql \
	supabase/tests/database/20_rpc_trigger.sql \
	supabase/tests/database/30_billing_tenancy.sql \
	supabase/tests/database/35_billing_automation.sql \
	supabase/tests/database/40_billing_evidence.sql \
	supabase/tests/database/45_billing_account_commands.sql \
	supabase/tests/database/50_billing_access_commands.sql \
	supabase/tests/database/55_billing_evidence_presentation.sql \
	supabase/tests/database/60_exact_financial_primitives.sql \
	supabase/tests/database/65_exact_billing_conversion.sql

FINANCIAL_DATABASE_HTTP_TESTS := \
	tests/release/auth-rls-rpc-trigger.test.ts \
	tests/release/exact-money-boundaries.test.ts \
	tests/release/billing-tenancy.test.ts \
	src/components/atomic-crm/financial/exactProviderContract.test.ts

FINANCIAL_FUNCTION_TESTS := \
	tests/release/edge-webhook-provider.test.ts \
	tests/release/billing-evidence.test.ts

FINANCIAL_FAST_TESTS := \
	src/components/atomic-crm/financial/exactMoney.test.ts \
	src/components/atomic-crm/invoices/invoiceCalculations.test.ts \
	tests/release/exact-money-release-static.test.ts \
	tests/release/billing-redaction.test.ts \
	src/components/atomic-crm/billing-accounts/billingDataProvider.test.ts \
	src/components/atomic-crm/billing-accounts/billingAccounts.test.ts \
	tests/release/billing-security-static.test.ts

.PHONY: build help financial-gate-help test-financial-migration-clean test-financial-schema-push test-financial-migration-upgrade test-financial-database-sql test-financial-database-http test-financial-database-contracts test-financial-functions test-financial-fast test-financial-concurrency-fixture test-financial-concurrency test-financial-replay-concurrency test-release-secrets test-release-bundle test-release-security financial-gate

help:
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

financial-gate-help: ## list the blocking financial release gate targets
	@grep -E '^(financial-gate-help|test-financial-migration-clean|test-financial-schema-push|test-financial-migration-upgrade|test-financial-database-sql|test-financial-database-http|test-financial-database-contracts|test-financial-functions|test-financial-fast|test-financial-concurrency-fixture|test-financial-concurrency|test-financial-replay-concurrency|test-release-secrets|test-release-bundle|test-release-security|financial-gate):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "%-36s %s\n", $$1, $$2}'

test-financial-migration-clean: ## replay every migration and verify schema contracts on a clean local stack
	node scripts/release/run-supabase-lane.mjs run --lane migration-clean -- node scripts/release/verify-migration-chain.mjs clean
	$(MAKE) test-financial-schema-push

test-financial-schema-push: ## prove schema push against an isolated loopback database
	node scripts/release/run-supabase-lane.mjs run --lane migration-clean -- node scripts/release/verify-migration-chain.mjs schema-push

test-financial-migration-upgrade: ## apply pending migrations to the checked-in baseline and verify fingerprints
	node scripts/release/run-supabase-lane.mjs run --lane migration-upgrade -- node scripts/release/fingerprint-upgrade.mjs
	npm test -- --run tests/release/migration-upgrade.test.ts

test-financial-database-sql: ## execute live PostgreSQL authorization, RLS, RPC, and trigger contracts
	node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- supabase test db $(FINANCIAL_DATABASE_SQL_TESTS) --local

test-financial-database-http: ## execute Auth, REST, and RPC contracts through local HTTP APIs
	node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- npm test -- --run $(FINANCIAL_DATABASE_HTTP_TESTS)

test-financial-database-contracts: ## execute all live database and HTTP authorization contracts
	$(MAKE) test-financial-database-sql
	$(MAKE) test-financial-database-http

test-financial-functions: ## execute Edge Function and provider-boundary contracts
	node scripts/release/run-supabase-lane.mjs run --lane edge-provider-contracts -- npm test -- --run $(FINANCIAL_FUNCTION_TESTS)

test-financial-fast: ## execute billing redaction, provider, UI, and release-coupling contracts
	npm test -- --run $(FINANCIAL_FAST_TESTS)

test-financial-concurrency-fixture: ## validate the deterministic replay/concurrency database fixture
	node scripts/release/run-supabase-lane.mjs run --lane replay-concurrency -- supabase test db supabase/tests/support/replay-concurrency.sql --local

test-financial-concurrency: ## execute replay and concurrency assertions exactly once
	node scripts/release/run-supabase-lane.mjs run --lane replay-concurrency -- npm test -- --run tests/release/replay-concurrency.test.ts

test-financial-replay-concurrency: ## execute sequential and parallel replay/concurrency contracts
	$(MAKE) test-financial-concurrency-fixture
	$(MAKE) test-financial-concurrency

test-release-secrets: ## scan Git history and the current tree for secret exposure
	node scripts/release/security-gate.mjs secrets

test-release-bundle: ## scan production source maps and bundles for sensitive data
	node scripts/release/security-gate.mjs bundle

test-release-security: ## run dependency, secret, source-map, and bundle security gates
	$(MAKE) test-financial-fast
	node scripts/release/security-gate.mjs all

financial-gate: ## run all six blocking financial release lanes
	$(MAKE) test-financial-migration-clean
	$(MAKE) test-financial-migration-upgrade
	$(MAKE) test-financial-database-contracts
	$(MAKE) test-financial-functions
	$(MAKE) test-financial-replay-concurrency
	$(MAKE) test-release-security

install: package.json ## install dependencies
	npm install;

start-supabase: ## start supabase locally
	npx supabase start

start-supabase-functions: ## start the supabase Functions watcher
	npx supabase functions serve

supabase-migrate-database: ## apply the migrations to the database
	npx supabase migration up

supabase-reset-database: ## reset (and clear!) the database
	npx supabase db reset

start-app: ## start the app locally
	npm run dev

start: start-supabase start-app ## start the stack locally

start-demo: ## start the app locally in demo mode
	npm run dev:demo

stop-supabase: ## stop local supabase
	npx supabase stop

stop: stop-supabase ## stop the stack locally

build: ## build the app
	npm run build

build-demo: ## build the app in demo mode
	npm run build:demo

prod-start: build supabase-deploy
	open http://127.0.0.1:3000 && npx serve -l tcp://127.0.0.1:3000 dist

prod-deploy: build supabase-deploy
	npm run ghpages:deploy

supabase-remote-init:
	npm run supabase:remote:init
	$(MAKE) supabase-deploy

supabase-deploy:
	npx supabase db push
	npx supabase functions deploy

test:
	npm test

test-ci:
	CI=1 npm test

lint:
	npm run lint
	npm run prettier

publish:
	npm publish

typecheck:
	npm run typecheck

doc-install:
	@(cd doc && npm install)

doc: doc-dev

doc-dev:
	@(cd doc && npm run dev)

doc-build:
	@(cd doc && npm run build)

doc-preview: doc-build
	@(cd doc && npm run preview)

doc-deploy:
	@(cd doc && npx gh-pages -b gh-pages -d dist -e doc -m "Deploy docs" --remove doc)

registry-build: ## build the shadcn registry
	npm run registry:build

registry-deploy: registry-build ## Deploy the shadcn registry (Automatically done by CI/CD pipeline)
	@(cd public/r && npx gh-pages -b gh-pages -d ./ -s atomic-crm.json -e r -m "Deploy registry" --remove r)

registry-gen: ## Generate the shadcn registry (ran automatically by a pre-commit hook)
	npm run registry:gen
	npx prettier --config ./.prettierrc.json --write "registry.json"
