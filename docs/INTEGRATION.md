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

`apps/web/lib/static-content.ts` contains original public help-centre articles and a clearly deprecated compatibility fixture used by the legacy unit test. The workspace fallback `knowledge` records remain generic and are not rendered by the Knowledge preview. Support and Knowledge preview fixtures live behind the UI-local `RagClient` mock transport.

Those articles visibly state that they are original demo guidance. The mock transport visibly states that no live ingestion, embeddings, retrieval, account tools, AI response, ticket mutation, or publishing exists. Static content is not private tenant business data. The database-backed support ticket table is kept visually and structurally separate from the support stream and handoff preview.

## UI-local live-RAG seam (preview branch)

`apps/web/lib/rag-contracts.ts` is the proposed replaceable transport contract. `RagClient.streamAnswer({ question, scenario? }, signal?)` yields `started`, ordered `phase` (`pending`, `retrieving`, `generating`), `delta`, and exactly one terminal `final`, `refusal`, `error`, or `cancelled` event, followed by `ended` when applicable. A `final` event owns the only validated answer and its `Citation[]`; deltas are explicitly unvalidated and the UI discards them on malformed order, disconnect, error, refusal, or cancellation. The optional `scenario` is a development/test fixture selector and must be removed by live integration.

The same client exposes `previewHandoff({ question, transcript, citations, accountEvidence })`, `confirmHandoff(previewId)`, and `cancelHandoff(previewId)`. A preview includes an expiry and the exact share payload. The UI never creates a ticket optimistically: confirmation is explicit, replay/expiry is an error, and synthetic success is labeled. `getKnowledge()`, `searchKnowledge(query)`, and `reindexKnowledge(sourceId)` power the source/version, run-stage/failure, public evidence inspector, and model/cache status surfaces.

`apps/web/lib/mock-rag-transport.ts` is the sole deterministic fixture implementation in this branch. It has no provider SDK, account, model, network, database, or organization-ID input. Account evidence is a distinct typed section from public documentation citations; a future server derives tenant context from the authenticated session. Replace `ragClient` at this one seam after the backend integration lands. Until then, every support and Knowledge surface says “Development mock transport” or equivalent and makes no live-RAG claim.

### State and accessibility behavior

The support state machine is idle → pending → retrieving → generating (draft only) → validated final/refusal/error/cancelled. One request is allowed at a time; cancel aborts the stream, clears draft text, and returns focus to the input. Status transitions use `role=status`; refusal and transport failures use `role=alert` where appropriate. Citation cards expose title, source type, heading, page/anchor, excerpt, and only supplied deep links. Account facts use a separate visual and semantic group. Handoff confirmation lists transcript, documentation sources, and account evidence before the confirm action. Reduced-motion CSS disables animation and smooth scrolling.

## Final integration checklist

- Replace the mock import with the live `RagClient`; remove fixture scenario controls and preview disclosure only after the live provider/retrieval contract is verified.
- Preserve server-owned public namespace/active-version filters and server-derived tenant authority; never accept organization IDs from the browser.
- Validate event ordering and citations server-side as well as in the client, map provider failures to the documented error codes, and retain cancellation/expiry/replay behavior.
- Keep public help, database-backed dashboard data, and private account evidence on their existing boundaries. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, browser accessibility checks, then integration/e2e with seeded PostgreSQL.

## Configuration and validation

See `README.md` for exact startup and test order. The important configuration variables are in `.env.example`. Adapter tests inject a fake `fetch`, API unit tests assert organization predicates, API integration tests use seeded PostgreSQL, and Playwright covers both identities on desktop and mobile against the real web/API/database stack.
