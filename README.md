# RelayOps

RelayOps is an original, fictional multi-tenant field-service SaaS portfolio reference implementation. The current milestone integrates a polished Next.js experience with a NestJS/Prisma/PostgreSQL backend using deterministic Northstar HVAC and PrimeFlow Plumbing data.

**Current state:** Overview, Jobs, Team, Customers, Subscription, and support tickets are database-backed and tenant-scoped by an HttpOnly demo session. Public help remains local content. Support and Knowledge use a typed UI-local `RagClient` boundary with deterministic development transport fixtures for streaming states, validated citations, account evidence, handoff consent, and Knowledge lifecycle inspection. This is not live RAG: no provider, model, retrieval answer, or server account-tool/ticket-mutation integration is connected to that UI. Phase 1 remains a local-only, versioned public-corpus retrieval foundation that returns evidence. Separately, fixed API-only account tools and a confirmed synthetic support-handoff flow are documented in [`docs/ACCOUNT_TOOLS.md`](docs/ACCOUNT_TOOLS.md); later integration may use only that narrow server-authorized seam.

## Zero-cost scope

Everything runs locally with open-source tools and no account, secret, billing detail, cloud resource, or paid API:

- Node.js 22, pnpm, TypeScript
- Next.js and NestJS
- Prisma and PostgreSQL 16 with open-source pgvector
- Local `Xenova/all-MiniLM-L6-v2` embeddings through `@huggingface/transformers` (intentional first-run public download; no API key)
- Jest, Vitest, and Playwright

Fictional subscription rows never trigger billing. GitHub Actions is included for free public-repository CI; local commands remain authoritative and CI availability depends on GitHub's public-repository runner policy.

## Repository map

```text
apps/api/       Nest API, demo-session guard, tenant-scoped services, Prisma schema/seed
apps/web/       Next UI, real API adapter, explicit static help/chat/Knowledge content
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

CI (`.github/workflows/ci.yml`) repeats migration, seed, lint, type checking, unit/component tests, PostgreSQL integration tests, builds, and browser tests. It creates no external resource beyond the ephemeral public-repository runner and service container.

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

## Remaining milestones—not completed claims

The support and Knowledge transport in this milestone is explicitly a UI preview. Its fixtures are not production behavior or customer outcomes.

1. Local grounded answer generation and UI/runtime citations (future Qwen/Ollama work; not present).
2. Grounded runtime citations and a separately reviewed local model/UI integration for the fixed account-tool seam.
3. Production authentication/security review.
4. Deployment and portfolio evidence only after those capabilities genuinely exist.

There are no live AI responses, production auth, payment flows, GPS, dispatch optimization, mobile application, microservices, event bus, Kubernetes, or deployment in scope.

## License

MIT. See [LICENSE](LICENSE).
