# Web/API integration boundary

`apps/web/lib/contracts.ts` defines the UI-facing `RelayOpsAdapter`. `apps/web/lib/service.ts` is its sole binding, and binds `createApiAdapter()` from `apps/web/lib/api-adapter.ts`.

## Database-backed methods

The adapter sends cookie-credentialed requests for:

- public demo identity listing and demo-session create/read/delete;
- dashboard overview, jobs, team, customers, subscription, and support tickets.

`getWorkspace()` composes those typed endpoint responses. It never sends an organization identifier. The Nest guard maps the allowlisted opaque HttpOnly cookie to an active membership and derives `organizationId` server-side. API services still apply an organization predicate to every private query and compound record lookup.

Browser requests use same-origin `/api` by default. `apps/web/next.config.ts` proxies these to `RELAYOPS_API_INTERNAL_URL` (default `http://127.0.0.1:3001`). This avoids browser CORS/cookie complexity while preserving the independently testable Nest API. Direct API CORS remains credential-aware for documented curl and development diagnostics.

A `401` from session or private data causes protected UI routes to return to `/demo` before rendering private data. Other failures show retry controls. Switching identity calls `POST /api/demo/session`, replacing the cookie; sign-out calls `DELETE /api/demo/session`. No tenant selection is persisted in local/session storage or treated as authority.

## Deliberately static methods

`apps/web/lib/static-content.ts` contains only:

- original public help-centre demonstration articles;
- generic local Knowledge screen fixtures;
- prewritten support-chat UI scenarios.

Those screens visibly state that no ingestion, embeddings, retrieval, live citations, account tools, AI response, ticket mutation, or publishing exists. Static content is not private tenant business data. The database-backed support ticket table is kept visually and structurally separate from the prewritten chat console.

## Configuration and validation

See `README.md` for exact startup and test order. The important configuration variables are in `.env.example`. Adapter tests inject a fake `fetch`, API unit tests assert organization predicates, API integration tests use seeded PostgreSQL, and Playwright covers both identities on desktop and mobile against the real web/API/database stack.
