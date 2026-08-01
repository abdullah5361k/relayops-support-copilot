# RelayOps grounded generation (local Qwen only)

This layer produces public-corpus support answers only. It has no product UI binding, account tools, handoff, customer-data retrieval, writes, URLs, files, shell access, model-selected tools, hosted model, API key, billing requirement, or cloud dependency. It is intentionally separate from the static support-chat demonstration.

## Optional zero-cost runtime

The normal database path remains unchanged and **does not** start Ollama or download model weights. Use a distinct Compose project and an explicit loopback port for this task:

```bash
COMPOSE_PROJECT_NAME=relayops-rag-generation RELAYOPS_DB_PORT=55433 docker compose up -d --wait
# Pick another port if 11435 is occupied; it is deliberately not assumed free.
COMPOSE_PROJECT_NAME=relayops-rag-generation RELAYOPS_OLLAMA_PORT=11435 docker compose --profile ollama up -d --wait ollama
COMPOSE_PROJECT_NAME=relayops-rag-generation docker compose exec ollama ollama pull qwen3:4b
```

`ollama pull` is deliberately separate from service startup. `qwen3:4b` is pinned: `RELAYOPS_OLLAMA_MODEL` may only be that exact value, and RelayOps never silently substitutes a model. Blobs live in the local Docker volume `relayops_ollama`, which is not in git. Do not add model caches to the repository.

For an API started on the host, set the matching local endpoint:

```bash
RELAYOPS_OLLAMA_BASE_URL=http://127.0.0.1:11435 \
RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" pnpm dev:api
```

The production adapter accepts local `http://localhost`, `127.0.0.1`, or `::1` only. Its defaults are 1.5s connect, 45s read, two active requests and four queued requests; configure `RELAYOPS_OLLAMA_CONNECT_TIMEOUT_MS`, `RELAYOPS_OLLAMA_READ_TIMEOUT_MS`, and `RELAYOPS_OLLAMA_CONCURRENCY` for a constrained local machine. A stopped service, missing model, timeout, invalid provider JSON, or cancellation is reported as such—never as an answer.

## Grounding boundary

`SupportAnswerService` embeds the question with the existing MiniLM adapter, calls the server-owned public namespace/active-version hybrid retrieval, and requires at least one substantive record with RRF score `>= 0.015` by default. Tune only deliberately with `RELAYOPS_GENERATION_MIN_EVIDENCE_COUNT` and `RELAYOPS_GENERATION_MIN_EVIDENCE_SCORE`. Weak evidence refuses before the Qwen availability check or generation call.

The model prompt contains the bounded question and at most four 1,200-character evidence records inside `EVIDENCE_DATA_START` / `EVIDENCE_DATA_END`. Documents are expressly untrusted data; their instructions, links, tool requests, and role changes are ignored. Qwen is asked for JSON claims with one distinct evidence ID per claim. It is forbidden to guess, invent tools/actions, or make uncited account, legal, competitor, pricing, security, or product claims.

The server parses and validates JSON before exposing any text. Each citation ID must occur exactly once in that exact active retrieval set and maps server-side to source logical ID/title and heading, section, page, and anchor. Fabricated or duplicate IDs, malformed claims, empty support excerpts, and invalid JSON become `INVALID_MODEL_OUTPUT`; no partial model tokens are sent to callers. Suggested topics are derived only from retrieved headings/source titles.

A trace stores a UUID, question SHA-256 (not raw question/prompt), retrieved chunk IDs, embedding/prompt/threshold/generation configuration, provider/model identity, outcome, refusal reason, citation count, and latency. It stores no account data and no raw prompts/completions.

## API and SSE contract

Shared request/response/event types live in `packages/contracts/src/index.ts`.

```text
POST /api/support/answers
POST /api/support/answers/stream   (SSE response over fetch)
body: { "question": "…" }
```

`session` is a reserved response-contract-compatible extension only; callers cannot use it to provide account data. A normal response has `traceId`, `state` (`ANSWERED`, `REFUSED`, `ERROR`), nullable `answer`, validated `citations`, nullable `refusalReason`, grounded `suggestedTopics`, pinned `provider` status, and an intentionally empty future extension point.

The stream sends `lifecycle` (`retrieving`, `generating`, `complete`), `status`, then exactly one terminal sequence: `answer` followed by `citations`, `refusal`, or `error`. It intentionally has no text delta event: the final answer is released only after citation validation. Disconnecting the browser aborts queued or active downstream Qwen work and prevents further writes.

## Explicit real-model smoke

This is intentionally manual and resource-dependent (the Qwen download is multi-gigabyte and local CPU latency can be substantial). After corpus ingestion has been deliberately completed, use the API and record the actual model/runtime/latency output in a local run log; do not claim it succeeded without running it:

```bash
curl -N -H 'content-type: application/json' \
  -d '{"question":"How quickly should an urgent incident be acknowledged?"}' \
  http://127.0.0.1:3001/api/support/answers/stream
curl -s -H 'content-type: application/json' \
  -d '{"question":"Can you change my subscription?"}' \
  http://127.0.0.1:3001/api/support/answers
```

The first must show a validated citation; the second must refuse for insufficient public evidence. If the local host cannot pull/run Qwen after bounded troubleshooting, report the local resource/runtime blocker rather than treating deterministic test doubles as a smoke success.

## Validation

Normal deterministic checks never pull Qwen:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

With PostgreSQL seeded, also run `pnpm test:integration` and `pnpm test:e2e`. Generation unit tests use deterministic fake embeddings and model providers; they cover prompt injection boundaries, thresholds, provider failures, malformed output, fabricated/duplicate citations, and SSE final-event ordering/cancellation.
