# Project agent memory

- Preserve the zero-cost rule: no paid API, billing requirement, secret, cloud resource, or mandatory external account. See `README.md` for scope and setup.
- Use only original RelayOps branding and deterministic synthetic data; never imply unbuilt AI, production auth, deployment, or customer outcomes exist.
- Derive API tenant context server-side. Every private data model and query must be organization-scoped; keep isolation tests beside API changes.
- Route UI data through `RelayOpsAdapter` (`apps/web/lib/contracts.ts`); `apps/web/lib/service.ts` is the sole binding. Private/session methods use `api-adapter.ts`; only clearly labeled help/chat/Knowledge fixtures belong in `static-content.ts`. See `docs/INTEGRATION.md`.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before review. With seeded PostgreSQL, also run `pnpm test:integration` and `pnpm test:e2e`; exact setup is in `README.md`.
- Knowledge ingestion/retrieval is public evidence-only and must retain the server-owned namespace/active-version filters. See `docs/RAG.md`; never commit Transformers caches or make normal CI download model weights.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
