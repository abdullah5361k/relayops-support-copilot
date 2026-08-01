# Live local support integration boundary

`packages/contracts/src/index.ts` is the canonical runtime contract for support requests, validated answers/citations, account evidence, SSE, handoffs, and Knowledge operations. `apps/web/lib/rag-contracts.ts` only projects that contract into browser state; it does not define a second wire shape.

`apps/web/lib/service.ts` remains the sole UI binding. Its default `RelayOpsAdapter.support` is `ApiRagClient` in `apps/web/lib/api-rag-client.ts`, which uses cookie-credentialed **same-origin** `/api/...` paths. `next.config.ts` proxies these paths to the local Nest process. `mock-rag-transport.ts` is test-only and is never imported by a production UI component or selected from a query parameter.

## Browser/API validation

The browser sends only `{ question }`, capped at 1,000 characters. It sends neither tenant/actor fields, tool names, source locations, arbitrary URLs, account facts, nor session assertions. `ApiRagClient` caps JSON/SSE payloads, preserves `credentials: include`, propagates `AbortSignal`, frames SSE across arbitrary chunks, and requires matching `event:`/JSON type, one trace ID, ordered lifecycle, one terminal response, and `complete`. A disconnect, malformed frame, out-of-order event, or unsupported terminal state clears pending UI state and never displays draft text.

The server streams lifecycle/status and then exactly one fully server-validated `final`, `refusal`, or `error` response. It never emits Qwen tokens. Browser citation validation requires active-evidence metadata (`logicalId`, title, format, heading/section/page/anchor, excerpt); citation cards render metadata only, never a model URL or fabricated `href`.

## Documentation versus account evidence

Public documentation retrieval always owns the `relayops-public` namespace and active source version. Qwen sees bounded inert evidence records and has no tool or tenant capability. Its claims must cite exactly retrieved active chunks.

Account intent is a deterministic server policy (`subscription_seat_usage`, tenant-owned `job_status`, tenant-owned `support_ticket_status`), not a model proposal. The question body cannot alter the plan, its minimal argument, actor, or organization. A missing/foreign reference has the same refusal. Account facts are returned as a distinct `accountEvidence` union and are visually separated from documentation citations. Public documentation stays available without a session; account questions return `ACCOUNT_SIGN_IN_REQUIRED` without tenant disclosure.

## Handoff and Knowledge

An answer can offer a handoff; it cannot create one. A signed-in browser requests a preview containing bounded question/answer text and active documentation logical IDs. An optional closed account plan is re-run by the server so account evidence is recomputed from the server session, not accepted from the browser. Preview, confirm, and cancel retain existing actor/tenant binding, expiry, replay, serializable one-time confirmation, and synthetic-ticket labeling.

Knowledge read/search/reindex routes are owner-only. They reveal only committed-manifest source/version/chunk counts, sanitized run state, and local MiniLM cache health. Reindex accepts `{ logicalId? }` where the ID must be in the committed manifest; it cannot accept a path, URL, corpus body, model endpoint, or tenant. Sequential ingestion preserves the previous active version on failure.

## Validation

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
# with a seeded isolated local PostgreSQL database
pnpm test:integration
pnpm test:e2e
```

See `README.md`, `docs/GENERATION.md`, and `docs/ACCOUNT_TOOLS.md` for local model setup, evaluation, and the synthetic/non-production disclosure.
