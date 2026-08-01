# RelayOps

RelayOps is an original, fictional multi-tenant field-service SaaS portfolio reference implementation. The current milestone integrates a polished Next.js experience with a NestJS/Prisma/PostgreSQL backend using deterministic Northstar HVAC and PrimeFlow Plumbing data.

**Current state:** Overview, Jobs, Team, Customers, Subscription, and tickets are database-backed deterministic demo data scoped by an HttpOnly demo session. Public help remains original local content. Support and Knowledge use same-origin APIs: active public-corpus retrieval, an explicitly selected server-only generator (`disabled`, optional hosted Groq `openai/gpt-oss-20b`, or optional local-development Ollama `qwen3:4b`), browser/server citation validation, deterministic tenant-safe account read plans, confirmed synthetic handoff, and owner-only Knowledge inspection/reindex. Groq is external inference of bounded public evidence, not production infrastructure; unavailable/missing credentials/quota/invalid output report honestly with no fallback. **Real local `qwen3:4b` execution was not verified because its local image/model download stalled; no Qwen quality, citation, or latency metric is claimed.** This is a fictional portfolio demo, **not production auth, deployment, customer support, billing, or service availability**. See [`docs/INTEGRATION.md`](docs/INTEGRATION.md), [`docs/GENERATION.md`](docs/GENERATION.md), and [`docs/ACCOUNT_TOOLS.md`](docs/ACCOUNT_TOOLS.md).

## Zero-cost scope

The default stack remains zero-cost and local: it needs no paid API, billing method, cloud resource, or external account. Optional hosted generation is disabled by default; an operator who intentionally selects Groq supplies their own server-only `GROQ_API_KEY`. The captain confirmed Groq activation required no credit card/payment method, but its Free Plan has no SLA and is not a deployment claim.

- Node.js 22, pnpm, TypeScript
- Next.js and NestJS
- Prisma and PostgreSQL 16 with open-source pgvector
- Local `Xenova/all-MiniLM-L6-v2` embeddings through `@huggingface/transformers` (intentional first-run public download; no API key)
- Optional Groq external inference, fixed to `openai/gpt-oss-20b`, only after explicit server configuration
- Optional local-development Ollama `qwen3:4b` (explicit model pull only)
- Jest, Vitest, and Playwright

Fictional subscription rows never trigger billing. GitHub Actions is included for free public-repository CI; local commands remain authoritative and CI availability depends on GitHub's public-repository runner policy.

## Repository map

```text
apps/api/       Nest API, demo-session guard, tenant-scoped services, Prisma schema/seed
apps/web/       Next UI, same-origin live API adapter; static help articles only
packages/contracts/ shared endpoint contracts
packages/widget/    reusable React boundary; no assistant runtime
```

See [`docs/INTEGRATION.md`](docs/INTEGRATION.md) for the precise adapter/static-content split.

## Requirements

- Node.js 22 (`>=22 <25`; see `.nvmrc`)
- Corepack and pinned pnpm 10.15.1
- Docker with Compose

PostgreSQL binds only to loopback on port **55432** by default. If occupied, set `RELAYOPS_DB_PORT` and update `DATABASE_URL` together.

## Clean-clone startup

Run in this order:

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open <http://localhost:3000/demo>. The Next server proxies same-origin `/api` requests to the API at port 3001, so HttpOnly cookies work through navigation and refresh without browser tenant storage. API health is at <http://localhost:3001/api/health>.

Startup commands can also be split:

```bash
pnpm dev:api
pnpm dev:web
```

The API must be running for the integrated dashboard and demo entry. Public pages use local static content, but the application is documented and validated as one integrated stack. Stop PostgreSQL with `docker compose down`; add `--volumes` only to intentionally delete local data.

### Prisma workflow

```bash
pnpm db:generate   # regenerate Prisma Client
pnpm db:migrate    # create/apply local development migrations
pnpm db:deploy     # apply committed migrations (CI-style)
pnpm db:seed       # replace demo rows with deterministic synthetic data
pnpm db:reset      # destructive local reset, migrate, and seed
```

The knowledge migration stores normalized `vector(384)` MiniLM embeddings for an original committed public corpus. See [`docs/RAG.md`](docs/RAG.md) for lifecycle, security boundaries, cache/offline behavior, corpus licensing, and retrieval decisions.

## Demo-session journey

The public allowlist exposes exactly:

- `northstar-owner` → Maya Chen at **Northstar HVAC**
- `primeflow-owner` → Sofia Ramirez at **PrimeFlow Plumbing**

Choosing an identity creates/replaces `relayops_demo_session`, an HttpOnly, SameSite=Lax cookie. Refresh and navigation retain it. Switching identities replaces it server-side; Sign out deletes it. Missing/expired sessions and direct protected routes return to `/demo` without rendering private records.

This is deliberately **demo authentication, not production authentication**. The backend maps the fixed opaque cookie to a seeded active membership and derives `organizationId` on every request. It ignores organization IDs from browser storage, headers, bodies, URLs, prompts, and text. Every private query remains organization-scoped, and direct job/customer lookup uses a compound organization/record key.

A future production-auth milestone would require a real identity provider, secret-backed rotation, authorization policy, CSRF review, rate limiting, and auditing. Do not use this mechanism for real data.

## Database-backed API

```text
GET    /api/demo/identities       public allowlist
POST   /api/demo/session          create/replace cookie
GET    /api/demo/session          inspect current allowlisted session
DELETE /api/demo/session          clear cookie
GET    /api/dashboard             protected overview
GET    /api/jobs[/:id]            protected jobs
GET    /api/team                  protected technicians
GET    /api/customers[/:id]       protected customers
GET    /api/subscription          protected plan/seat usage
GET    /api/support/tickets       protected tickets
GET    /api/account-tools/subscription-seat-usage  protected fixed tool
GET    /api/account-tools/jobs/:reference/status   protected fixed tool
GET    /api/account-tools/tickets/:reference/status protected fixed tool
POST   /api/account-tools/handoffs/preview         protected consent preview
POST   /api/account-tools/handoffs/confirm         protected consent confirmation
POST   /api/account-tools/handoffs/cancel          protected consent cancellation
```

For direct API diagnostics, create a cookie jar with curl:

```bash
curl -i -c /tmp/relayops.cookie -H 'content-type: application/json' \
  -d '{"identity":"northstar-owner"}' http://localhost:3001/api/demo/session
curl -b /tmp/relayops.cookie http://localhost:3001/api/customers
```

All businesses, people, contacts, jobs, tickets, and figures are deterministic synthetic data.

## Validation

Fast quality suite (API integration test is intentionally skipped here because it requires PostgreSQL):

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Full local validation after PostgreSQL is healthy and seeded:

```bash
pnpm db:deploy
pnpm db:seed
pnpm test:integration
pnpm --filter @relayops/web exec playwright install chromium   # one-time local browser install
pnpm test:e2e
```

Playwright starts the real API and web processes and runs both synthetic identities on desktop Chromium and a narrow/mobile Chromium viewport. It covers sign-in, refresh, all database-backed screens, tenant-specific records, identity replacement, sign-out, and direct protected-route access. API integration tests attempt cross-tenant jobs, customers, subscription usage, and tickets against PostgreSQL. Unit/component tests cover adapter success, empty responses, 401, failures, retry, switch/sign-out behavior, and static widget labeling.

For an isolated browser run that includes owner Knowledge search/reindex, the API must use the pinned Node 22 runtime and an existing MiniLM cache; Node 24 intentionally makes the API return the honest local-embedding 503. Build the web with its internal proxy URL set **at build time**, then run the browser tests against that stack:

```bash
nvm use 22
DATABASE_URL='postgresql://relayops@localhost:55434/relayops?schema=public' \
RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" API_PORT=3011 WEB_ORIGIN='http://127.0.0.1:3005' \
RELAYOPS_GENERATION_PROVIDER=disabled pnpm --filter @relayops/api build
RELAYOPS_API_INTERNAL_URL='http://127.0.0.1:3011' pnpm --filter @relayops/web build
DATABASE_URL='postgresql://relayops@localhost:55434/relayops?schema=public' \
RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" API_PORT=3011 WEB_ORIGIN='http://127.0.0.1:3005' \
RELAYOPS_GENERATION_PROVIDER=disabled node apps/api/dist/main.js
# Separate shell, still on Node 22:
RELAYOPS_API_INTERNAL_URL='http://127.0.0.1:3011' node apps/web/node_modules/next/dist/bin/next start -p 3005
# Separate shell:
RELAYOPS_E2E_BASE_URL='http://127.0.0.1:3005' pnpm test:e2e
```

Use a seeded isolated database/port in place of `55434`; do not run `next build` while a Next development server shares its `.next` directory.

CI (`.github/workflows/ci.yml`) repeats migration, seed, lint, type checking, unit/component tests, PostgreSQL integration tests, builds, and browser tests. To exercise the committed public corpus without downloading MiniLM weights, it explicitly sets `RELAYOPS_TEST_DETERMINISTIC_EMBEDDINGS=1` only while ingesting that corpus and starting the browser-test stack. This is a CI/test-only deterministic vector fixture, never a MiniLM fallback or deployed setting; without the exact flag, local and deployed paths require MiniLM as above. CI creates no external resource beyond the ephemeral public-repository runner and service container.

## Retrieval foundation (evidence only)

The committed corpus is ingested only through its fixed manifest; no arbitrary filesystem path or URL is accepted. Use an explicit cache location if desired, then intentionally download/index MiniLM:

```bash
nvm use 22
RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" pnpm --filter @relayops/api knowledge:smoke
RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" pnpm --filter @relayops/api knowledge:ingest
RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" pnpm --filter @relayops/api knowledge:search -- "urgent incident acknowledgement"
pnpm --filter @relayops/api knowledge:inspect
RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" pnpm --filter @relayops/api knowledge:evaluate
```

Normal CI and unit tests do not download model weights. MiniLM requires the repository-pinned Node 22 runtime; if the runtime/cache/network/model is unavailable, ingestion/search fails honestly and a new source version is not activated. Full instructions, model integrity evidence, and the versioned retrieval gold set are in [`docs/RAG.md`](docs/RAG.md).

## Optional grounded generation

The browser uses the same-origin `/api/support/answers/stream` adapter; it never contains a provider SDK/key or a model selector. The API accepts only `RELAYOPS_GENERATION_PROVIDER=disabled|groq|ollama`: `groq` pins server-side HTTPS to `openai/gpt-oss-20b`; `ollama` is explicit local-development-only `qwen3:4b`; `disabled` is the default. The generator receives only a bounded question and active public evidence. Every claim/citation is revalidated by the server before one final response; account facts remain fixed tenant-safe server-tool evidence and are never sent to a generator. See [`docs/GENERATION.md`](docs/GENERATION.md) for Free Plan/no-SLA limits, privacy boundary, circuit/failure behavior, smoke, and evaluator commands.

## Buyer verification and boundaries

Use a fresh local Compose project/ports so you do not reuse another stack. The optional model pull is a multi-gigabyte local download; normal lint/test/build/CI never pulls it.

```bash
COMPOSE_PROJECT_NAME=relayops-rag-final RELAYOPS_DB_PORT=55434 docker compose up -d --wait postgres
DATABASE_URL='postgresql://relayops@localhost:55434/relayops?schema=public' pnpm db:deploy
DATABASE_URL='postgresql://relayops@localhost:55434/relayops?schema=public' pnpm db:seed
DATABASE_URL='postgresql://relayops@localhost:55434/relayops?schema=public' RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" pnpm --filter @relayops/api knowledge:ingest
COMPOSE_PROJECT_NAME=relayops-rag-final RELAYOPS_OLLAMA_PORT=11436 docker compose --profile ollama up -d --wait ollama
COMPOSE_PROJECT_NAME=relayops-rag-final docker compose exec ollama ollama pull qwen3:4b
```

For the optional local-development path only, run the API/web with `RELAYOPS_GENERATION_PROVIDER=ollama RELAYOPS_OLLAMA_BASE_URL=http://127.0.0.1:11436`. For intentional hosted checks, set `RELAYOPS_GENERATION_PROVIDER=groq` and source the server-only key as documented in [`docs/GENERATION.md`](docs/GENERATION.md); never expose it to the browser. Sign into either supplied synthetic identity, inspect a cited documentation answer, a refusal, separate seat evidence, and handoff preview/cancel before explicit confirmation. The owner Knowledge screen shows real local source/version/run/cache state and only committed-manifest reindex actions. Run deterministic and real-MiniLM evaluations separately from the documented real-Groq smoke/suite; never treat deterministic doubles as Qwen or Groq evidence.

There are no production authentication, real customer records, payment flows, real ticket delivery, deployment, GPS, dispatch optimization, mobile application, microservices, event bus, Kubernetes, or service availability claims in scope.

## Portfolio/Fiverr wording

Truthful wording: “RelayOps is a fictional multi-tenant support portfolio demo with server-validated public-documentation citations, deterministic synthetic account tools, and an optional server-side Groq `openai/gpt-oss-20b` evaluation path.” Do not describe Groq Free Plan access, demo authentication, synthetic data, or the unverified local Qwen path as production infrastructure, customer outcomes, SLA-backed service, deployment, or a paid/billed integration.

## License

MIT. See [LICENSE](LICENSE).
