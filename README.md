# RelayOps

RelayOps is an original, fictional multi-tenant field-service SaaS portfolio project for small HVAC, plumbing, electrical, and repair businesses. The long-term product story is a website-integrated support assistant that combines public product documentation with safely tenant-scoped synthetic account data.

**Current state:** this first focused PR is the backend and workspace foundation. It does not contain an LLM, RAG pipeline, production authentication, deployed service, or completed dashboard product.

## Why this exists

The project demonstrates careful SaaS boundaries before adding AI: a maintainable TypeScript workspace, a relational tenant model, deterministic demo businesses, server-derived tenant context, and tests that make isolation visible. All branding, people, businesses, and records are synthetic.

## Zero-cost constraint

The complete project must remain useful without payment, billing details, paid APIs, secrets, or external accounts. This milestone uses only open-source local tools:

- Node.js, pnpm, TypeScript
- NestJS and Next.js
- PostgreSQL 16 with the open-source pgvector extension
- Prisma
- Jest and Vitest

No cloud resource or hosted service is created or required. The plans and subscriptions in the database are fictional product records; they never trigger billing.

## Repository map

```text
apps/
  api/       NestJS API, Prisma schema/migration/seed, tenant boundary
  web/       deliberately minimal buildable Next.js shell
packages/
  contracts/ shared API response contracts and demo identity types
  widget/    reusable React package boundary; assistant behavior is not implemented
docker-compose.yml  local pgvector-enabled PostgreSQL
```

The API is a modular monolith. Every private business table (`subscriptions`, `customers`, `technicians`, `jobs`, and `support_tickets`) has an `organization_id`. Composite foreign keys prevent a job or ticket from referencing another tenant's customer or technician. Global users join organizations through explicit memberships and roles.

## Requirements

- Node.js 22 LTS (supported range: `>=22 <25`; see `.nvmrc`)
- Corepack and pnpm 10.15.1 (pinned in `package.json`)
- Docker with Compose

No API key or account is needed. Port **55432** is used by default so an existing PostgreSQL on 5432 is not disturbed. Set `RELAYOPS_DB_PORT` and update `DATABASE_URL` together if 55432 is occupied.

## Clean-clone setup

```bash
corepack enable
cp .env.example .env
pnpm install

docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open:

- minimal web shell: <http://localhost:3000>
- API health: <http://localhost:3001/api/health>

Stop the local database with `docker compose down`. Add `--volumes` only when you intentionally want to delete local data. `.env` and generated output are ignored by Git.

### Prisma workflow

```bash
pnpm db:generate       # regenerate Prisma Client after schema changes
pnpm db:migrate        # create/apply a development migration
pnpm db:seed           # replace demo rows with deterministic synthetic data
pnpm db:reset          # destructive local reset, migrate, and seed
```

The initial migration enables `vector`, making pgvector available for a later ingestion milestone. This milestone stores no embeddings and performs no vector search.

## Demo API journey

Demo authentication deliberately accepts only two supplied identities:

- `northstar-owner` → Maya Chen at **Northstar HVAC**
- `primeflow-owner` → Sofia Ramirez at **PrimeFlow Plumbing**

Create an HttpOnly demo-session cookie, then query the scoped API:

```bash
curl -i -c /tmp/relayops-demo.cookie \
  -H 'content-type: application/json' \
  -d '{"identity":"northstar-owner"}' \
  http://localhost:3001/api/demo/session

curl -b /tmp/relayops-demo.cookie http://localhost:3001/api/dashboard
curl -b /tmp/relayops-demo.cookie http://localhost:3001/api/jobs
curl -b /tmp/relayops-demo.cookie http://localhost:3001/api/team
curl -b /tmp/relayops-demo.cookie http://localhost:3001/api/subscription
curl -b /tmp/relayops-demo.cookie http://localhost:3001/api/support/tickets
```

Other public/session routes:

```text
GET    /api/health
GET    /api/demo/identities
POST   /api/demo/session
DELETE /api/demo/session
```

Protected routes are `GET /api/dashboard`, `/api/jobs`, `/api/jobs/:id`, `/api/team`, `/api/subscription`, and `/api/support/tickets`.

### Demo-auth boundary

This is intentionally **demo authentication, not production authentication**. A public, fixed identity allowlist maps to an opaque HttpOnly demo cookie. On every protected request, the API maps that cookie to a synthetic user, loads the active membership, and derives `organizationId` server-side. Organization IDs from headers, URL selection, request bodies, prompts, or model text are never accepted as tenant authority. Every Prisma query adds the derived organization predicate; record lookup uses a compound organization/record key.

A production milestone must replace this entire mechanism with a real identity provider/session verifier, secure secret-backed session rotation, authorization policy, CSRF review, rate limiting, and audit behavior. The current cookie is deliberately inspectable public-demo infrastructure and must not protect real data.

## Synthetic seed data

`apps/api/prisma/seed.ts` creates deterministic and distinguishable data for:

| Tenant | Trade / city | Plan | Active seats | Example records |
| --- | --- | --- | ---: | --- |
| Northstar HVAC | HVAC / Minneapolis | Growth Demo | 3 / 10 | `NH-*` jobs, `SUP-3*` tickets |
| PrimeFlow Plumbing | Plumbing / Austin | Starter | 2 / 5 | `PF-*` jobs, `SUP-4*` tickets |

Names, contact details, addresses, job narratives, and support requests are invented. They do not represent customers, employers, or real operational outcomes.

## Quality commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The API tests cover the principal dashboard aggregation, exact demo-identity validation, server-derived tenant context, organization-scoped job lists, cross-tenant job denial, separate subscription seat counts, and isolated support tickets. The web test is only a smoke render for the intentionally minimal shell.

## Screenshots

No polished product screenshot is claimed in this backend-focused milestone. When the dashboard milestone lands:

1. run the seeded apps at the default local URLs;
2. capture both desktop and narrow responsive views for each demo tenant;
3. remove any browser/profile identifiers;
4. place optimized original images in `docs/screenshots/` and link them here.

## Scope and roadmap

### Complete in this milestone

- pnpm TypeScript monorepo and shared contract/widget boundaries
- minimal buildable Next.js shell (not the final product UI)
- NestJS API vertical slice backed by PostgreSQL
- tenant-structured Prisma schema, migration, pgvector availability, and seed
- Northstar HVAC and PrimeFlow Plumbing demo sessions
- tenant-isolation, API behavior, and shell smoke tests

### Later milestones — not completed claims

1. **Product UI:** responsive authenticated dashboard navigation and database-backed jobs, team, subscription, and support views.
2. **Documentation ingestion and RAG:** local/open-source ingestion, chunking, embeddings, retrieval, and source lifecycle.
3. **Controlled account tools:** narrow read-only tenant tools with explicit authorization and schemas.
4. **Support safety:** citations, uncertainty handling, refusal behavior, prompt-injection defenses, and privacy review.
5. **Evaluation:** retrieval and response fixtures, tenant-leakage adversarial cases, quality thresholds, and regression reporting.
6. **Deployment:** genuinely free-tier-compatible packaging and documented limits; no deployment exists today.
7. **Portfolio assets:** original screenshots, architecture diagrams, demo script, accessibility/performance review, and truthful case-study copy.

There are no payment flows, GPS features, dispatch optimization, mobile application, microservices, event bus, or Kubernetes in scope.

## License

MIT. See [LICENSE](LICENSE).
