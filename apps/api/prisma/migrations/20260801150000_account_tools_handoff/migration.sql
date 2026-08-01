-- Narrow, tenant-scoped account-tool audit and consent-handoff state. All content is
-- synthetic demo content; ticket creation is only possible from a confirmed draft.
CREATE TYPE "public"."HandoffDraftState" AS ENUM ('PENDING', 'CANCELLED', 'CONFIRMED', 'EXPIRED');

ALTER TABLE "public"."support_tickets" ADD COLUMN "handoff_draft_id" UUID;
CREATE UNIQUE INDEX "support_tickets_organization_id_handoff_draft_id_key"
  ON "public"."support_tickets"("organization_id", "handoff_draft_id");

CREATE TABLE "public"."handoff_drafts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "state" "public"."HandoffDraftState" NOT NULL DEFAULT 'PENDING',
  "summary" TEXT NOT NULL,
  "documentation_evidence" JSONB NOT NULL,
  "conversation_excerpt" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "handoff_drafts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "handoff_drafts_organization_id_id_key"
  ON "public"."handoff_drafts"("organization_id", "id");
CREATE INDEX "handoff_drafts_organization_id_actor_id_state_expires_at_idx"
  ON "public"."handoff_drafts"("organization_id", "actor_id", "state", "expires_at");
ALTER TABLE "public"."handoff_drafts" ADD CONSTRAINT "handoff_drafts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."handoff_drafts" ADD CONSTRAINT "handoff_drafts_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "public"."tool_audits" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "tool_name" TEXT NOT NULL,
  "sanitized_arguments" JSONB NOT NULL,
  "outcome" TEXT NOT NULL,
  "trace_id" UUID NOT NULL,
  "latency_ms" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tool_audits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tool_audits_organization_id_actor_id_created_at_idx"
  ON "public"."tool_audits"("organization_id", "actor_id", "created_at");
CREATE INDEX "tool_audits_trace_id_idx" ON "public"."tool_audits"("trace_id");
ALTER TABLE "public"."tool_audits" ADD CONSTRAINT "tool_audits_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."tool_audits" ADD CONSTRAINT "tool_audits_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
