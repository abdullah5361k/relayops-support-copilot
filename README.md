# RelayOps

RelayOps is an original, fictional multi-tenant field-service SaaS portfolio reference implementation. The current milestone integrates a polished Next.js experience with a NestJS/Prisma/PostgreSQL backend using deterministic Northstar HVAC and PrimeFlow Plumbing data.

**Current state:** Overview, Jobs, Team, Customers, Subscription, and support tickets are database-backed and tenant-scoped by an HttpOnly demo session. Public help, Knowledge, and support-chat scenarios remain clearly labeled local static demonstrations. There is no RAG, LLM/model inference, document ingestion, embeddings, live citation system, production authentication, deployment, billing, or real customer outcome.

## Zero-cost scope

Everything runs locally with open-source tools and no account, secret, billing detail, cloud resource, or paid API:

- Node.js 22, pnpm, TypeScript
- Next.js and NestJS
- Prisma and PostgreSQL 16 with the open-source pgvector extension available for a later milestone
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

The initial migration enables pgvector for a later milestone. No vectors or embeddings are stored or queried now.

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

## Remaining milestones—not completed claims

1. Local/open-source documentation ingestion and RAG, with evaluated retrieval and source lifecycle.
2. Narrow authorized account tools and grounded runtime citations.
3. Production authentication/security review.
4. Deployment and portfolio evidence only after those capabilities genuinely exist.

There are no live AI responses, production auth, payment flows, GPS, dispatch optimization, mobile application, microservices, event bus, Kubernetes, or deployment in scope.

## License

MIT. See [LICENSE](LICENSE).
