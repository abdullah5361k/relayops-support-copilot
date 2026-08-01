# Vercel UI preview

## Buyer verification

**Verified preview URL:** `https://relayops-support-copilot-1i2j6t5v9.vercel.app`

This is an immutable, frontend-only Vercel preview of the RelayOps Next.js UI. It is not a production deployment and does not represent service availability.

## What is live

- Public marketing and Help Centre pages use original static portfolio content.
- `/demo`, private dashboard routes, and Relay support explicitly state that the integrated service is unavailable in this preview. They do not request a backend, synthesize tenant data, show citations, or create tickets.

The preview intentionally has **no** Nest API, PostgreSQL/pgvector database, MiniLM cache, API rewrite, demo-session cookie, RAG retrieval, handoff persistence, or Groq generation. `vercel.json` passes only the public `frontend-preview` build flag; it contains no endpoint or secret. No Vercel environment variables are configured. Verification returned HTTP 200 for `/`, `/help`, `/demo`, `/dashboard/support`, and `/dashboard/overview`; `/api/health` intentionally returns HTTP 404 because no API origin is deployed.

## Full-stack verification (local only)

The integrated synthetic demo must be verified locally. From the repository root:

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d --wait
pnpm db:deploy
pnpm db:seed
pnpm dev
```

Open <http://localhost:3000/demo>. For the complete Node 22, cached-MiniLM browser check, use the commands in [README.md](../README.md#validation). The API and database remain loopback-local in this setup.

## Provider boundary and cost limit

No zero-cost API or PostgreSQL host was provisioned. No compatible hosting-provider CLI was authenticated in this task environment, so provisioning would require the captain to authenticate with a provider and independently accept that provider's current free-tier terms. Do not supply credentials or connection strings in chat.

Groq remains unconfigured for this preview. If an operator intentionally evaluates it in a separately deployed API, set `GROQ_API_KEY` only as a server-side runtime secret, retain `RELAYOPS_GENERATION_PROVIDER=groq`, and follow [GENERATION.md](GENERATION.md). Groq is external inference with free-plan/no-SLA limits, not production infrastructure.

All displayed names, businesses, tickets, and figures are deterministic RelayOps fiction. This is not production authentication, support, billing, customer data, or a production-readiness claim.

## Teardown and secret rotation

Preview deployments can be removed from the RelayOps Vercel project/dashboard when verification is complete. Removing the Vercel project removes its preview deployments; do this only after confirming no one still needs the URL.

If a future API deployment adds a server-only secret, remove it from every Vercel environment before deleting the deployment, then rotate/revoke it at the issuing provider. Never use `NEXT_PUBLIC_*` for `GROQ_API_KEY`, `DATABASE_URL`, cookies, model caches, or local paths.
