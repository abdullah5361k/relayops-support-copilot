CREATE TYPE "SupportAnswerOutcome" AS ENUM ('ANSWERED', 'REFUSED', 'ERROR');

CREATE TABLE "support_answer_traces" (
  "id" UUID NOT NULL,
  "question_hash" TEXT NOT NULL,
  "evidence_ids" JSONB NOT NULL,
  "configuration" JSONB NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "outcome" "SupportAnswerOutcome" NOT NULL,
  "refusal_reason" TEXT,
  "citation_count" INTEGER NOT NULL,
  "latency_ms" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_answer_traces_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_answer_traces_created_at_idx" ON "support_answer_traces"("created_at");
CREATE INDEX "support_answer_traces_outcome_idx" ON "support_answer_traces"("outcome");
