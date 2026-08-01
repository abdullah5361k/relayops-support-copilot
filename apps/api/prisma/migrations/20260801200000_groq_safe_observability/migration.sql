-- Generation observability intentionally stores only allowlisted operational fields.
-- Remove question hashes, evidence IDs, and configuration blobs rather than retaining derivative private/prompt material.
ALTER TABLE "support_answer_traces"
  DROP COLUMN "question_hash",
  DROP COLUMN "evidence_ids",
  DROP COLUMN "configuration",
  ADD COLUMN "status_class" TEXT NOT NULL DEFAULT 'unavailable',
  ADD COLUMN "input_tokens" INTEGER,
  ADD COLUMN "output_tokens" INTEGER,
  ADD COLUMN "total_tokens" INTEGER,
  ADD COLUMN "remaining_requests" INTEGER,
  ADD COLUMN "remaining_tokens" INTEGER,
  ADD COLUMN "retry_after_seconds" INTEGER;

ALTER TABLE "support_answer_traces" ALTER COLUMN "status_class" DROP DEFAULT;
