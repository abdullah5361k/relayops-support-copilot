# Tenant-safe account tools and synthetic support handoff

This API-only milestone adds deterministic integration seams. It does **not** add a model runtime, tool selection, generated SQL, remote support connection, product UI wiring, or real support operations. All records and resulting tickets are synthetic RelayOps demo data.

## Authority boundary

`DemoSessionGuard` is the only authority source. It maps the allowlisted HttpOnly demo cookie to an active membership and writes the server-derived tenant and actor to the request. `AccountToolController` obtains that context through `@TenantContext()` and never accepts an organization, actor, owner, ticket status, priority, or ticket reference from a route body, header, query, prompt, or tool argument.

Every private lookup uses an organization predicate; reference lookups use the database compound keys `(organization_id, reference)`. A cross-tenant reference produces the exact same `404 {"kind":"error","code":"not_found"}` as a missing reference. Handoff drafts use `(organization_id, id)` plus the server-derived actor check. Changing `x-organization-id`, an `organizationId` body field, or a query value cannot change authority (body extras are rejected).

## Exact API contracts

All routes require the demo session cookie:

```text
GET  /api/account-tools/subscription-seat-usage
GET  /api/account-tools/jobs/:reference/status
GET  /api/account-tools/tickets/:reference/status
POST /api/account-tools/handoffs/preview
POST /api/account-tools/handoffs/confirm
POST /api/account-tools/handoffs/cancel
```

Read results are intentionally minimal and structurally distinct from documentation evidence:

```ts
{ kind: 'subscription_seat_usage', planName, status, seatsUsed, seatLimit }
{ kind: 'job_status', reference, status }
{ kind: 'support_ticket_status', reference, status }
```

The preview body accepts only the following shape; unknown fields are rejected:

```ts
{
  summary: string, // normalized, required, 1..600 chars
  documentationEvidence: Array<{ sourceId: string; locator?: string }>, // at most 8, each field <=120 chars
  conversationExcerpt?: string // normalized, at most 1,000 chars
}
```

`documentationEvidence` is a display-only set of documentation source references. It is not an account-tool result, does not authorize retrieval, and is not used to access a record. Preview returns the exact normalized summary, documentation references, and excerpt that would be shared, along with a server-generated draft ID and expiry. Confirm and cancel accept exactly `{ draftId: UUID }`.

Errors use the stable `{ kind: 'error', code }` body: `invalid_argument` (400), `not_found` (404), `invalid_draft` (409; includes missing/foreign/wrong-actor drafts), `draft_cancelled` (409), and `draft_expired` (410). Missing or inactive sessions are rejected by the guard with 401 before a tool is called.

## Consent sequence and duplicate safety

1. A signed-in actor requests a preview. The server stores a tenant-and-actor-bound draft for ten minutes and returns exactly the future ticket content inputs.
2. The same actor must confirm the unexpired draft. Confirmation atomically claims only a `PENDING` draft matching organization, actor, and freshness.
3. In the same serializable transaction, the server creates one synthetic `OPEN`/`NORMAL` support ticket with a server-generated reference. Callers cannot provide customer, owner, organization, status, priority, reference, or hidden ticket fields.
4. The draft content is scrubbed after confirmation; the consented ticket contains the shared content. Retrying a committed confirmation returns the same ticket with `created: false`. The composite unique key `(organization_id, handoff_draft_id)` prevents duplicate tickets under replay or concurrent confirmation.
5. Cancellation atomically clears a pending draft's content. Expired pending drafts are marked `EXPIRED` and scrubbed before later preview activity or when accessed. Foreign drafts remain indistinguishable from missing drafts.

## Audit and retention

Each authenticated tool invocation writes `tool_audits`: server-derived organization and actor IDs, fixed allowlisted tool name, generated UUID trace ID, timestamp, latency, outcome, and sanitized arguments. Read references and draft IDs may be retained for operational correlation. Preview audit records retain only shape/length/count metadata—never summary text, conversation excerpt, or documentation source text. The opaque session cookie is never stored.

Drafts are short-lived for sharing authority (ten minutes). Cancellation, observed expiry, and confirmation scrub draft content. This demo has no background retention worker; audit records and state rows remain local PostgreSQL evidence until the local demo database is reset. A future production integration must define deletion jobs and retention policy before using non-synthetic data.

The later model/UI integration may call only these fixed endpoints/contracts after its own authorization review. It must not add a generic tool registry, arbitrary query surface, caller-selected tenant, or model-chosen write execution.
