# UI adapter integration

All dashboard, tenant, knowledge, help-centre, and support-chat data crosses the typed `RelayOpsAdapter` boundary in `apps/web/lib/contracts.ts`. The UI currently binds that interface to `mockAdapter` only in `apps/web/lib/service.ts`.

A later API adapter must provide:

- tenant summaries available to the authenticated demo identity;
- a tenant-scoped `Workspace` projection for each dashboard screen;
- help article indexes and exact article content;
- support replies with an explicit result state, separately typed documentation/account evidence, optional source URLs, and optional handoff confirmation IDs.

Replace the export in `service.ts`; view components should not import fixtures or API clients. The integration must preserve server-enforced tenant scope, authorization, loading/error handling, and evidence provenance. Current delays, answers, confirmations, and identity selection are simulations—not working AI, authentication, persistence, billing, or ticket creation.
