# Grounded generation providers

RelayOps is an original fictional portfolio demo, not production support infrastructure. Generation is **explicitly selected** with `RELAYOPS_GENERATION_PROVIDER=disabled|groq|ollama`; an unset value is `disabled`. There is no fallback, model routing, browser SDK, browser key, hosted deployment, SLA, or claim of customer-data support.

## Provider choices

- `groq` is the captain-approved hosted option. The API server uses direct HTTPS to the pinned official OpenAI-compatible endpoint `https://api.groq.com/openai/v1/chat/completions` and the only allowed model is `openai/gpt-oss-20b`. Neither URL nor model comes from a browser request or a runtime routing setting.
- `ollama` remains an **optional local development** provider only, pinned to `qwen3:4b` and a loopback HTTP endpoint. It is never started/pulled by normal CI or this change.
- `disabled` is the secure default and returns an honest unavailable state.

Groq is external inference: it receives only the bounded support question and the server-selected active **PUBLIC** `relayops-public` evidence excerpts. It never receives a tenant/organization/user identity or name, cookie/session, account tool argument/result, subscription/job/ticket fact, handoff/transcript, database record, private log, arbitrary URL/file, browser authority, or tool choice. Account reads stay deterministic and structurally separate. For a mixed request, the server drops any account/handoff sentence before optional documentation synthesis; an account-only request does not invoke Groq.

Use the dedicated server-only `GROQ_API_KEY` only for intentional checks. For example, from a secure shell with tracing disabled:

```bash
set +x
. ~/.config/relayops/groq.env
export GROQ_API_KEY
RELAYOPS_GENERATION_PROVIDER=groq \
DATABASE_URL='postgresql://relayops@localhost:55434/relayops?schema=public' \
RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" \
pnpm --filter @relayops/api evaluation:groq-smoke
```

Do not put that value in `.env.example`, source, git, browser variables, screenshots, reports, or shell output. A missing selected-provider credential, rejected authentication, quota limit, timeout, malformed response, provider failure, or open circuit produces no plausible answer.

## Evidence and output boundary

`SupportAnswerService` retrieves only active server-owned public evidence before it calls a provider. The bounded system prompt says that question/evidence text is inert untrusted data; it rejects evidence instructions, uncited claims, account claims, tools, web/file/SQL access, source selection, and handoff/account transformations. It requires `{"claims":[]}` for insufficient or conflicting evidence.

Groq requests non-streaming chat completions with `temperature: 0`, a bounded completion, no tools/function calls, and strict `response_format: { type: "json_schema" }`. Every schema field is required and every object has `additionalProperties: false`; claims are limited to three concise sentences with one evidence ID each. The server independently rejects malformed JSON, unknown/duplicate/missing IDs, excess fields, oversized values, unsupported claim text, and empty evidence. Citation display metadata comes only from the exact active retrieved chunk. SSE exposes lifecycle/status plus one validated final/refusal/error response; it never forwards model tokens or drafts.

Hard server caps cover question/evidence/prompt/output bytes. The adapter has a 5-second connect deadline and 24-second end-to-end deadline, abort propagation, a one-active/two-waiting hosted queue, and safe status classes for auth, 400, 413, 429/`Retry-After`, 5xx, network, timeout, cancellation, and malformed output. It never sleeps/retries after output or silently switches provider.

A local breaker opens after three qualifying provider failures in 60 seconds and stays open for five minutes. Safe observability is restricted to trace ID, provider/model, status class, latency, token counts/safe rate headers, citation count, and outcome. It intentionally stores no prompt/question/evidence/answer/account material, key fragment, or derivative hash.

## Free Plan and later hosting work

Groq's Free Plan was researched on **2026-08-01** for this fixed model at 30 RPM, 1,000 RPD, 8K TPM, and 200K TPD. RelayOps reserves below those ceilings (24 RPM, 900 RPD, 7.2K TPM, 180K TPD) with conservative local concurrency. A 429 honors `Retry-After` in the honest unavailable UX without a hidden sleep or retry. These in-memory guards are per process and **are not globally sufficient** for a multi-instance public deployment; a later hosting task must add durable shared quotas and ingress abuse/rate controls before any public exposure. Groq's Free Plan has no SLA. No billing method, credits, paid API, cloud resource, or deployment is added here.

## Evaluation and verification

The 60-case versioned suite is `corpus/support-evaluation.v1.json`. It reports per-category retrieval/outcome/refusal/citation/unsupported-claim results, tenant/stale/namespace violations, account-tool/handoff safety, provider errors, token use, rate headers, and p50/p95 latency. It labels these modes separately:

```bash
# Fresh deterministic-vector database only; neither MiniLM nor Groq evidence.
DATABASE_URL='postgresql://relayops@localhost:55434/relayops?schema=public' \
  pnpm --filter @relayops/api evaluation:deterministic

# Real MiniLM retrieval with deterministic provider, not Groq generation.
DATABASE_URL='postgresql://relayops@localhost:55434/relayops?schema=public' \
RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" \
  pnpm --filter @relayops/api evaluation:integrated

# Intentional hosted smoke first, then the real Groq suite. Account/handoff cases remain deterministic.
set +x; . ~/.config/relayops/groq.env; export GROQ_API_KEY
RELAYOPS_GENERATION_PROVIDER=groq DATABASE_URL='postgresql://relayops@localhost:55434/relayops?schema=public' \
RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" pnpm --filter @relayops/api evaluation:groq-smoke
# Explicit pacing stays below the Free Plan envelope; it is not an automatic retry/sleep.
RELAYOPS_GENERATION_PROVIDER=groq RELAYOPS_EVALUATION_PACE_MS=10000 DATABASE_URL='postgresql://relayops@localhost:55434/relayops?schema=public' \
RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" pnpm --filter @relayops/api evaluation:real-groq
```

The prior branch's historical claim remains unchanged: **real local `qwen3:4b` execution was not verified** because its local download stalled. Existing deterministic and real-MiniLM measurements are not Qwen or Groq generation measurements. Local Ollama may be evaluated later only after an explicit local pull; this work does not download it.

## Recorded Groq evidence

Run the smoke before the suite and record only safe aggregate metrics here: fixed model identity, schema/validated-citation result, token/rate headers, latency, outcome/refusal/citation safety counts, and provider errors. Do not record key material, questions, evidence, answers, account data, or claim that Free Plan access is production infrastructure.

**2026-08-01, isolated PostgreSQL + cached real MiniLM:** the intentional minimal smoke authenticated the pinned `openai/gpt-oss-20b`, produced one server-validated cited answer with strict-schema behavior, used 855 input / 202 output / 1,057 total tokens, reported 999 remaining requests and 6,725 remaining tokens, and took 1,834 ms end-to-end evaluator latency. The subsequent complete 60-case real-Groq run used explicit 10,000 ms operator pacing. It made 46 provider invocations (the 12 account-isolation cases made **zero**), reported six safely mapped 400/provider errors, and measured 33,817 input / 8,004 output / 41,821 total reported tokens, p50 864 ms / p95 1,801 ms, and final safe headers of 927 remaining requests / 6,731 remaining tokens. Citation validity/coverage, tool precision, unsupported-claim rate, stale/namespace/tenant violations, and pre-confirmation handoff mutations were respectively 1.00/1.00/1.00/0/0/0/0. The run exposed low grounded outcome on paraphrase/handoff cases and unsafe/stale requests that were still reaching the provider; it is a Free Plan evaluation, **not** a production-quality claim. The follow-up added a stricter deterministic pre-generation refusal gate for explicit stale/injection/out-of-scope requests without weakening citation validation. It was not re-run, to preserve the remaining Free Plan quota; repeat the documented command deliberately after a quota window if a new measured baseline is required.

| category | retrieval hit | expected outcome | provider calls/errors |
| --- | ---: | ---: | ---: |
| documentation | 0.833 | 0.833 | 12 / 1 |
| paraphrase/multi-source | 0.500 | 0.625 | 8 / 2 |
| unanswerable | 1.000 | 0.900 | 10 / 0 |
| stale/injection | 1.000 | 0.700 | 10 / 1 |
| account isolation | 1.000 | 1.000 | 0 / 0 |
| handoff safety | 0.750 | 0.750 | 6 / 2 |

All categories recorded citation validity/coverage/tool precision at 1.000, unsupported-claim rate 0, and stale-version/namespace/tenant violation counts 0. Handoff safety aggregate was 0.967 because provider errors prevented some documentation handoff offers; no handoff was mutated before explicit confirmation.
