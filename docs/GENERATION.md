# Local grounded generation (Qwen only)

RelayOps is an original fictional portfolio demo. This integration runs only on a local machine: committed MiniLM embeddings, local PostgreSQL, and an optional local Ollama `qwen3:4b`. It has no hosted model, key, billing account, cloud resource, production deployment, or real customer data.

## Current verification status

This branch verified MiniLM ingestion/retrieval, deterministic contract evaluation, tenant/account isolation, handoff confirmation safety, and browser unavailable-provider behavior. On the isolated integrated PostgreSQL database, MiniLM's existing retrieval gold set reported `1.00` recall@5 / expected-source hit rate with zero stale/namespace violations; the 60-case integrated deterministic-provider run reported `0.933` retrieval hit, `0.983` outcome, full citation validity/coverage/tool/handoff precision, and zero unsupported/stale/namespace/tenant/pre-confirmation-mutation violations. These are **not Qwen metrics**. It **did not verify real `qwen3:4b` execution, real-model quality, citations, or latency**: the authorized free Docker image/model download made progress but stalled before completion. The UI/API therefore continue to show only the honest local-provider-unavailable state until a future operator completes the documented local pull. No hosted or substitute model was used.

## Bounded setup

Use an isolated Compose project and ports so another project stack is never reused:

```bash
COMPOSE_PROJECT_NAME=relayops-rag-final RELAYOPS_DB_PORT=55434 docker compose up -d --wait postgres
DATABASE_URL='postgresql://relayops@localhost:55434/relayops?schema=public' pnpm db:deploy
DATABASE_URL='postgresql://relayops@localhost:55434/relayops?schema=public' pnpm db:seed
# Intentional local cache/download, never normal CI or git:
DATABASE_URL='postgresql://relayops@localhost:55434/relayops?schema=public' \
  RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" pnpm --filter @relayops/api knowledge:ingest
COMPOSE_PROJECT_NAME=relayops-rag-final RELAYOPS_OLLAMA_PORT=11436 docker compose --profile ollama up -d --wait ollama
COMPOSE_PROJECT_NAME=relayops-rag-final docker compose exec ollama ollama pull qwen3:4b
```

Model blobs remain in the local Compose volume and MiniLM remains in `RELAYOPS_MODEL_CACHE`; both are ignored by git. Start the API with `RELAYOPS_OLLAMA_BASE_URL=http://127.0.0.1:11436`, `RELAYOPS_OLLAMA_CONCURRENCY=1` on an 11 GiB machine, and a finite read timeout. The app rejects any model tag other than exactly `qwen3:4b` and any non-local provider URL. If the pull/runtime cannot complete after bounded troubleshooting, record the exact blocker; never substitute a model or claim a smoke passed.

## Contract and safety boundary

The shared canonical contract is `packages/contracts/src/index.ts`:

```text
POST /api/support/answers
POST /api/support/answers/stream  # fetch SSE
body: { "question": "…" }
```

The request has no tenant, actor, corpus namespace, URL, tool, account fact, or session assertion. The server derives an optional demo session only from its HttpOnly cookie. Retrieval hardcodes active public evidence. Qwen gets at most four 1,200-character evidence records inside explicit data delimiters, has no tools/files/URLs/account access, and is instructed to treat both question and documents as untrusted data.

The model returns bounded JSON claims. Server validation rejects malformed JSON, fabricated/duplicate IDs, unsupported citations, and claims with no substantive active excerpt. Empty grounded claims become a refusal. SSE sends lifecycle/status then one server-validated terminal response; no draft/model token is authoritative or sent to the UI. Citation metadata is copied from the active chunk (logical ID/title/format/location/excerpt), never from a model URL.

Account facts are not Qwen output. A deterministic server policy may select only subscription seats, job status, or ticket status after a valid demo session. Returned facts are separately typed/labeled account evidence. Qwen cannot create a ticket; handoff requires the existing actor-bound preview then explicit confirmation.

## Evaluation and real smoke

The versioned 60-question set is `corpus/support-evaluation.v1.json` (documentation, paraphrase/multi-source, refusal, stale/injection, two tenant/account paths, and handoff safety). The fully deterministic evaluator uses declared deterministic embeddings/provider and is **not** Qwen evidence:

```bash
# Use a fresh isolated evaluation database because it deliberately indexes deterministic vectors.
DATABASE_URL='postgresql://relayops@localhost:55434/relayops?schema=public' \
  pnpm --filter @relayops/api evaluation:deterministic
```

It exits nonzero below 0.90 retrieval/outcome/tool/handoff rates, below full citation validity/coverage, or for any unsupported claim, stale/namespace/tenant violation, or pre-confirmation handoff mutation. Those thresholds protect deterministic regression behavior. After real MiniLM ingestion, run the same deterministic provider against the integrated real-vector database (still **not** Qwen):

```bash
DATABASE_URL='postgresql://relayops@localhost:55434/relayops?schema=public' RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" \
  pnpm --filter @relayops/api evaluation:integrated
```

Real-model quality is reported separately and is never compared with deterministic-double metrics:

```bash
DATABASE_URL='postgresql://relayops@localhost:55434/relayops?schema=public' \
RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" \
RELAYOPS_OLLAMA_BASE_URL=http://127.0.0.1:11436 RELAYOPS_OLLAMA_CONCURRENCY=1 \
  pnpm --filter @relayops/api evaluation:real-model
```

After a future operator completes the explicit pull, this is the one-command local real-model smoke/evaluator path (it does not pull or substitute a model):

```bash
PATH="$HOME/.nvm/versions/node/v22.11.0/bin:$PATH" DATABASE_URL='postgresql://relayops@localhost:55436/relayops?schema=public' RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" RELAYOPS_OLLAMA_BASE_URL=http://127.0.0.1:11436 RELAYOPS_OLLAMA_CONCURRENCY=1 pnpm --filter @relayops/api evaluation:real-model
```

Record `docker compose ... exec ollama ollama show qwen3:4b --verbose`, host RAM/disk, model tag/digest if reported, API parameters, and latency. Verify a cited documentation answer; out-of-scope refusal; signed-in seat answer with separate account evidence; injection resistance; and a handoff offer followed by preview/cancel (no ticket) then one explicit confirmation (synthetic ticket). Do not call deterministic results real-Qwen metrics.
