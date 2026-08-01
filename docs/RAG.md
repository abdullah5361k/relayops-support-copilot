# RelayOps retrieval foundation

RelayOps indexes an original fictional public corpus as active-version evidence. The same foundation now feeds the bounded local Qwen support integration, but retrieval itself remains evidence-only: it never accepts tenant authority, calls tools, executes document instructions, or exposes private customer data. See `docs/GENERATION.md` for the optional generation layer.

## Data flow and lifecycle

`corpus/manifest.json` is the only ingestion allowlist. Each entry has a stable logical ID and points below `corpus/sources/`; the CLI never accepts a filesystem path or URL. Input is capped at 5 MiB and format-checked. HTML has scripts/styles stripped as text, FAQ JSON is schema-checked, PDF extraction reads only simple text streams (scanned PDFs fail), and DOCX reads only `word/document.xml` from a ZIP. Nothing executes markup, macros, links, or document instructions.

`knowledge_sources` is the stable identity. `knowledge_source_versions` is immutable after completion; `knowledge_ingestion_runs` records attempts; `knowledge_chunks` stores content, heading/section, page/anchor, offsets, token count, full-text input, and `vector(384)`. A transaction writes all chunks then marks a version `COMPLETE`, moves the source active pointer, and supersedes the prior active version. A deferred PostgreSQL trigger rejects an active pointer to anything except that source's complete version. Failed versions remain traceable and the previous active version stays searchable. SHA-256 plus parser version makes unchanged re-ingestion a recorded skip.

All Phase 1 sources are `PUBLIC` in the server-owned `relayops-public` namespace. Retrieval hardcodes that allowlist and active-version predicates before either ranking path; it accepts no organization ID. Future organization-private retrieval must derive its organization from the session, not a request field.

## Embeddings and retrieval

Production ingestion/search uses `Xenova/all-MiniLM-L6-v2` through `@huggingface/transformers`, mean-pools and normalizes 384-dimensional vectors. It deliberately requires the repository-pinned Node 22 runtime (`.nvmrc`): Node 24's local ONNX runtime rejected the same valid model artifacts during development. `RELAYOPS_MODEL_CACHE=/absolute/cache/path` selects a cache location. First intentional MiniLM use downloads public model artifacts; offline, corrupt, or unavailable artifacts cause a clear failure and no version is activated. Model weights/caches are ignored and must never be committed. Fast tests use only `DeterministicEmbeddingProvider`.

Chunks are deterministic whitespace-token chunks: maximum 180 tokens / 1,200 characters, 30-token overlap, and a 12-token minimum. Headings and source locations are retained. PostgreSQL finds 20 full-text candidates and 20 cosine (`<=>`) vector candidates, fuses them with reciprocal-rank fusion (`1/(60 + rank)`), deduplicates chunks, and initially diversifies sources. Returned evidence contains exact source logical ID/title, heading/section, page/anchor, text and scores.

## Local runbook

```bash
nvm use 22
cp .env.example .env
docker compose up -d --wait
pnpm install
pnpm db:deploy
pnpm db:seed
# intentional network/cache use; not part of normal tests
RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" pnpm --filter @relayops/api knowledge:smoke
RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" pnpm --filter @relayops/api knowledge:ingest
RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" pnpm --filter @relayops/api knowledge:search -- "urgent incident acknowledgement"
pnpm --filter @relayops/api knowledge:inspect
RELAYOPS_MODEL_CACHE="$HOME/.cache/relayops-minilm" pnpm --filter @relayops/api knowledge:evaluate
```

Knowledge inspection is now owner-demo-session protected: `GET /api/knowledge`, `GET /api/knowledge/search?q=...`, and `POST /api/knowledge/reindex`. The UI/API reveal only sanitized source/version/chunk/run/model-cache metadata and active public evidence. Reindex accepts `{ logicalId? }` only when it is in `corpus/manifest.json`; it never accepts a filesystem path, URL, body corpus, secret, or model option. A local MiniLM failure returns a generic local-availability state and retains the previous active version.

The versioned gold set is `corpus/gold-set.v1.json`; it covers direct and paraphrased questions, multi-source retrieval, unanswerable and injection-like prompts, and the superseded four-hour policy. Evaluation reports recall@5, expected-source hit rate, stale-version violations, namespace violations and latency. Node 22.11.0 measured `1.00` recall@5/expected-source hit rate, `0` stale and namespace violations, and 71 ms mean / 478 ms max latency on the committed corpus (first query includes model warm-up). No threshold is claimed because local model/runtime results vary. The deliberately unanswerable items may still retrieve related evidence: Phase 1 is retrieval, not an answerability classifier.

### Reproducibility evidence

On Node 22.11.0, the cached Xenova fp32 `onnx/model.onnx` was 90,387,606 bytes with SHA-256 `759c3cd2b7fe7e93933ad23c4c9181b7396442a2ed746ec7c1d46192c469c46e`; a real smoke/ingestion/search/evaluation succeeded with finite normalized 384d vectors. As a compatibility cross-check, `onnx-community/all-MiniLM-L6-v2-ONNX` also produced a finite normalized 384d vector on Node 22.11.0 (the 56,796-byte graph had SHA-256 `2f019cf6217537cc4bfc7f5192f21dea1e18445177edaab0bc6163a813e5c7a1`, with a separate 90,261,504-byte data file). The production adapter intentionally remains the task-required `Xenova/all-MiniLM-L6-v2`, not a silent model substitution.

## Corpus and limits

Every corpus file is original RelayOps fiction under this repository's MIT license. `field-visit-manual.pdf` is a minimal text-only PDF authored for this repository. `dispatcher-onboarding.docx` is a minimal Office Open XML ZIP authored with Python's standard `zipfile` module; neither artifact includes third-party material. Unsupported, malformed, empty, over-limit, scanned, encrypted, macro-executing, remote, and arbitrary local files are rejected/not offered.

The separately bounded local Qwen/Ollama layer consumes this evidence only through the same server-owned namespace/active-version retrieval path. `corpus/support-evaluation.v1.json` adds a versioned 60-question integration/security evaluation; its deterministic and real-model commands/results are documented in [`GENERATION.md`](GENERATION.md). It does not alter retrieval isolation rules.
