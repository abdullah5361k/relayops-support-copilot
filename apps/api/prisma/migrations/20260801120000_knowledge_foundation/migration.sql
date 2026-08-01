-- Immutable, versioned knowledge corpus. Vectors remain outside Prisma writes and are
-- persisted through parameterised SQL because pgvector is an extension type.
CREATE TYPE "public"."KnowledgeVisibility" AS ENUM ('PUBLIC', 'ORGANIZATION');
CREATE TYPE "public"."KnowledgeVersionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED', 'SUPERSEDED');
CREATE TYPE "public"."KnowledgeRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'SKIPPED', 'FAILED');

CREATE TABLE "public"."knowledge_sources" (
  "id" UUID NOT NULL,
  "logical_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "visibility" "public"."KnowledgeVisibility" NOT NULL,
  "namespace" TEXT NOT NULL,
  "organization_id" UUID,
  "active_version_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_sources_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."knowledge_source_versions" (
  "id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "checksum" TEXT NOT NULL,
  "parser_version" TEXT NOT NULL,
  "source_format" TEXT NOT NULL,
  "status" "public"."KnowledgeVersionStatus" NOT NULL DEFAULT 'PENDING',
  "model_id" TEXT,
  "model_version" TEXT,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "knowledge_source_versions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."knowledge_ingestion_runs" (
  "id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "version_id" UUID,
  "status" "public"."KnowledgeRunStatus" NOT NULL DEFAULT 'RUNNING',
  "error" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  CONSTRAINT "knowledge_ingestion_runs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."knowledge_chunks" (
  "id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "heading" TEXT,
  "section" TEXT,
  "page" INTEGER,
  "anchor" TEXT,
  "char_start" INTEGER NOT NULL,
  "char_end" INTEGER NOT NULL,
  "token_count" INTEGER NOT NULL,
  "search_text" TEXT NOT NULL,
  "embedding" vector(384),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_sources_logical_id_key" ON "public"."knowledge_sources"("logical_id");
CREATE UNIQUE INDEX "knowledge_sources_active_version_id_key" ON "public"."knowledge_sources"("active_version_id");
CREATE INDEX "knowledge_sources_visibility_namespace_idx" ON "public"."knowledge_sources"("visibility", "namespace");
CREATE INDEX "knowledge_sources_organization_id_idx" ON "public"."knowledge_sources"("organization_id");
CREATE UNIQUE INDEX "knowledge_source_versions_source_id_checksum_parser_version_key" ON "public"."knowledge_source_versions"("source_id", "checksum", "parser_version");
CREATE INDEX "knowledge_source_versions_source_id_status_idx" ON "public"."knowledge_source_versions"("source_id", "status");
CREATE INDEX "knowledge_ingestion_runs_source_id_started_at_idx" ON "public"."knowledge_ingestion_runs"("source_id", "started_at");
CREATE UNIQUE INDEX "knowledge_chunks_version_id_ordinal_key" ON "public"."knowledge_chunks"("version_id", "ordinal");
CREATE INDEX "knowledge_chunks_version_id_idx" ON "public"."knowledge_chunks"("version_id");
CREATE INDEX "knowledge_chunks_search_idx" ON "public"."knowledge_chunks" USING GIN (to_tsvector('english', "search_text"));
-- Approximate index; exact ordering still makes test-sized corpora deterministic.
CREATE INDEX "knowledge_chunks_embedding_idx" ON "public"."knowledge_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 10);

ALTER TABLE "public"."knowledge_sources" ADD CONSTRAINT "knowledge_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."knowledge_source_versions" ADD CONSTRAINT "knowledge_source_versions_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."knowledge_sources" ADD CONSTRAINT "knowledge_sources_active_version_id_fkey" FOREIGN KEY ("active_version_id") REFERENCES "public"."knowledge_source_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."knowledge_ingestion_runs" ADD CONSTRAINT "knowledge_ingestion_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."knowledge_ingestion_runs" ADD CONSTRAINT "knowledge_ingestion_runs_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."knowledge_source_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."knowledge_source_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A source can only point at a complete version. This prevents partial or failed data
-- becoming searchable even if application code regresses.
CREATE OR REPLACE FUNCTION "public".relayops_active_version_is_complete() RETURNS trigger AS $$
BEGIN
  IF NEW.active_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "public"."knowledge_source_versions" v
    WHERE v.id = NEW.active_version_id AND v.source_id = NEW.id AND v.status = 'COMPLETE'
  ) THEN RAISE EXCEPTION 'active knowledge version must belong to source and be COMPLETE'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "knowledge_sources_active_version_complete"
AFTER INSERT OR UPDATE OF "active_version_id" ON "public"."knowledge_sources"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public".relayops_active_version_is_complete();
