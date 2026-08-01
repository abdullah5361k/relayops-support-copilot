# Tenant-safe account tools and synthetic handoff

All account data is deterministic synthetic RelayOps demo data. The only tenant authority is `DemoSessionGuard`/`DemoSessionResolver`: a fixed opaque HttpOnly demo cookie is mapped server-side to an active membership. Browser fields, headers, query strings, prompt text, model output, and tool arguments cannot choose an organization or actor.

## Closed read plan

`SupportAnswerService.planAccountTool()` is deterministic server policy, not an LLM tool call. It can select only:

```text
subscription_seat_usage             {}
job_status                          { reference: /^[A-Z]{2,8}-[0-9]{1,12}$/ }
support_ticket_status               { reference: /^[A-Z]{2,8}-[0-9]{1,12}$/ }
```

The service requires a resolved session, executes through `AccountToolService`, and returns the minimal result as separately labeled `accountEvidence`. It does not pass account facts to Qwen. Missing and foreign job/ticket references both become the same `ACCOUNT_REFERENCE_UNAVAILABLE` support refusal; unauthenticated account intent becomes `ACCOUNT_SIGN_IN_REQUIRED`. Public documentation retrieval remains available with no cookie.

The protected direct API remains useful for inspection:

```text
GET  /api/account-tools/subscription-seat-usage
GET  /api/account-tools/jobs/:reference/status
GET  /api/account-tools/tickets/:reference/status
POST /api/account-tools/handoffs/preview
POST /api/account-tools/handoffs/confirm
POST /api/account-tools/handoffs/cancel
```

Every private read uses tenant predicates/compound keys and emits a sanitized fixed-tool audit entry. There is no generic query tool, SQL, URL/file capability, model-provided tenant context, or model-selected mutation.

## Confirmed handoff

A model can only cause the answer contract to mark `handoffAvailable`; it cannot invoke a write. The browser then requests a preview with bounded user-approved summary/transcript and active documentation logical IDs. Unknown/foreign/stale source IDs are rejected. If there is a closed account plan, the server executes it again against the same session and stores its minimal account evidence rather than trusting browser-provided account facts.

The preview response shows exactly the normalized material that will be shared and expires after ten minutes. Confirmation atomically claims one pending `(organization, actor, draft)` row in a serializable transaction and creates one synthetic `OPEN` ticket. Replay returns the same ticket with `created: false`; expiry/cancel/wrong actor/foreign draft fail without disclosing a tenant. Confirmation and cancellation scrub short-lived draft content, including account evidence. No production ticket system or real support operation exists.

Only owner demo sessions can inspect/reindex Knowledge. Reindex accepts only an already committed manifest logical ID (or all manifest entries), never a handoff/document path, URL, body, tenant, or model parameter.
