import { HttpStatus, Injectable } from '@nestjs/common';
import { HandoffDraftState, KnowledgeVisibility, Prisma, TicketPriority, TicketStatus } from '@prisma/client';
import type {
  AccountToolReadResult,
  DocumentationEvidenceReference,
  HandoffCancellationResult,
  HandoffConfirmationResult,
  HandoffPreviewInput,
  HandoffPreviewResult,
  SupportAccountEvidence,
  SupportAccountToolPlan
} from '@relayops/contracts';
import { randomUUID } from 'node:crypto';
import type { TenantContextValue } from '../auth/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { AccountToolException } from './account-tool.exception';

const draftLifetimeMs = 10 * 60 * 1000;
const referencePattern = /^[A-Z]{2,8}-[0-9]{1,12}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ToolName = 'subscription_seat_usage' | 'job_status' | 'support_ticket_status' | 'handoff_preview' | 'handoff_confirm' | 'handoff_cancel';
type SanitizedArguments = Record<string, string | number | boolean | null>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function cleanText(value: unknown, maximum: number, required: boolean): string | null {
  if (value === undefined && !required) return null;
  if (typeof value !== 'string') throw new AccountToolException('invalid_argument', HttpStatus.BAD_REQUEST);
  const cleaned = value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
  if ((required && cleaned.length === 0) || cleaned.length > maximum) {
    throw new AccountToolException('invalid_argument', HttpStatus.BAD_REQUEST);
  }
  return cleaned || null;
}

function parseReference(value: unknown): string {
  if (typeof value !== 'string' || !referencePattern.test(value)) {
    throw new AccountToolException('invalid_argument', HttpStatus.BAD_REQUEST);
  }
  return value;
}

function parseDraftId(input: unknown): string {
  if (!isPlainObject(input) || !onlyKeys(input, ['draftId']) || !uuidPattern.test(String(input.draftId ?? ''))) {
    throw new AccountToolException('invalid_argument', HttpStatus.BAD_REQUEST);
  }
  return input.draftId as string;
}

function parsePlan(input: unknown): SupportAccountToolPlan | undefined {
  if (input === undefined) return undefined;
  if (!isPlainObject(input) || !onlyKeys(input, ['tool', 'arguments']) || typeof input.tool !== 'string' || !isPlainObject(input.arguments)) throw new AccountToolException('invalid_argument', HttpStatus.BAD_REQUEST);
  if (input.tool === 'subscription_seat_usage' && onlyKeys(input.arguments, []) && Object.keys(input.arguments).length === 0) return { tool: 'subscription_seat_usage', arguments: {} };
  if ((input.tool === 'job_status' || input.tool === 'support_ticket_status') && onlyKeys(input.arguments, ['reference'])) return { tool: input.tool, arguments: { reference: parseReference(input.arguments.reference) } };
  throw new AccountToolException('invalid_argument', HttpStatus.BAD_REQUEST);
}

function parsePreview(input: unknown): HandoffPreviewInput {
  if (!isPlainObject(input) || !onlyKeys(input, ['summary', 'documentationEvidence', 'conversationExcerpt', 'accountToolPlan']) || !Array.isArray(input.documentationEvidence)) {
    throw new AccountToolException('invalid_argument', HttpStatus.BAD_REQUEST);
  }
  if (input.documentationEvidence.length > 8) throw new AccountToolException('invalid_argument', HttpStatus.BAD_REQUEST);
  const documentationEvidence = input.documentationEvidence.map((item): DocumentationEvidenceReference => {
    if (!isPlainObject(item) || !onlyKeys(item, ['sourceId', 'locator'])) {
      throw new AccountToolException('invalid_argument', HttpStatus.BAD_REQUEST);
    }
    const sourceId = cleanText(item.sourceId, 120, true);
    const locator = cleanText(item.locator, 120, false);
    return locator ? { sourceId: sourceId!, locator } : { sourceId: sourceId! };
  });
  return {
    summary: cleanText(input.summary, 600, true)!,
    documentationEvidence,
    conversationExcerpt: cleanText(input.conversationExcerpt, 1_000, false) ?? undefined,
    accountToolPlan: parsePlan(input.accountToolPlan)
  };
}

function ticketReference(draftId: string): string {
  return `HND-${draftId.replaceAll('-', '').slice(0, 12).toUpperCase()}`;
}

function ticketBody(input: HandoffPreviewInput, accountEvidence: readonly SupportAccountEvidence[]): string {
  const evidence = input.documentationEvidence.length ? input.documentationEvidence.map((item) => `- ${item.sourceId}${item.locator ? ` (${item.locator})` : ''}`).join('\n') : '- No documentation evidence supplied';
  const account = accountEvidence.length ? accountEvidence.map((item) => `- ${item.label}: ${item.kind === 'subscription_seat_usage' ? `${item.seatsUsed} of ${item.seatLimit} seats (${item.status})` : `${item.reference} (${item.status})`}`).join('\n') : '- No account evidence shared';
  return `Synthetic RelayOps support handoff\n\nSummary:\n${input.summary}\n\nDocumentation evidence:\n${evidence}\n\nAccount evidence (separate from documentation):\n${account}\n\nConversation excerpt:\n${input.conversationExcerpt ?? '[none provided]'}`;
}

@Injectable()
export class AccountToolService {
  constructor(private readonly prisma: PrismaService) {}

  async subscriptionSeatUsage(tenant: TenantContextValue): Promise<AccountToolReadResult> {
    return this.run(tenant, 'subscription_seat_usage', {}, async () => {
      const [subscription, seatsUsed] = await Promise.all([
        this.prisma.subscription.findUnique({
          where: { organizationId: tenant.organizationId },
          select: { status: true, plan: { select: { name: true, seatLimit: true } } }
        }),
        this.prisma.organizationMembership.count({ where: { organizationId: tenant.organizationId, status: 'ACTIVE' } })
      ]);
      if (!subscription) throw new AccountToolException('not_found', HttpStatus.NOT_FOUND);
      return { kind: 'subscription_seat_usage', planName: subscription.plan.name, status: subscription.status, seatsUsed, seatLimit: subscription.plan.seatLimit };
    });
  }

  async jobStatus(tenant: TenantContextValue, rawReference: unknown): Promise<AccountToolReadResult> {
    return this.run(tenant, 'job_status', { reference: typeof rawReference === 'string' ? rawReference : null }, async () => {
      const reference = parseReference(rawReference);
      const job = await this.prisma.job.findUnique({
        where: { organizationId_reference: { organizationId: tenant.organizationId, reference } },
        select: { reference: true, status: true }
      });
      if (!job) throw new AccountToolException('not_found', HttpStatus.NOT_FOUND);
      return { kind: 'job_status', reference: job.reference, status: job.status };
    });
  }

  async supportTicketStatus(tenant: TenantContextValue, rawReference: unknown): Promise<AccountToolReadResult> {
    return this.run(tenant, 'support_ticket_status', { reference: typeof rawReference === 'string' ? rawReference : null }, async () => {
      const reference = parseReference(rawReference);
      const ticket = await this.prisma.supportTicket.findUnique({
        where: { organizationId_reference: { organizationId: tenant.organizationId, reference } },
        select: { reference: true, status: true }
      });
      if (!ticket) throw new AccountToolException('not_found', HttpStatus.NOT_FOUND);
      return { kind: 'support_ticket_status', reference: ticket.reference, status: ticket.status };
    });
  }

  async previewHandoff(tenant: TenantContextValue, rawInput: unknown): Promise<HandoffPreviewResult> {
    return this.run(tenant, 'handoff_preview', this.previewAuditArguments(rawInput), async () => {
      await this.expirePendingForTenant(tenant);
      const input = parsePreview(rawInput);
      await this.validateActiveDocumentation(input.documentationEvidence);
      const accountEvidence = input.accountToolPlan ? [await this.executeClosedReadPlan(tenant, input.accountToolPlan)] : [];
      const expiresAt = new Date(Date.now() + draftLifetimeMs);
      const draft = await this.prisma.handoffDraft.create({
        data: {
          organizationId: tenant.organizationId,
          actorId: tenant.userId,
          summary: input.summary,
          documentationEvidence: input.documentationEvidence as unknown as Prisma.InputJsonValue,
          accountEvidence: accountEvidence as unknown as Prisma.InputJsonValue,
          conversationExcerpt: input.conversationExcerpt ?? null,
          expiresAt
        },
        select: { id: true, expiresAt: true }
      });
      return {
        kind: 'handoff_preview', draftId: draft.id, expiresAt: draft.expiresAt.toISOString(),
        shared: { summary: input.summary, documentationEvidence: input.documentationEvidence, conversationExcerpt: input.conversationExcerpt ?? null, accountEvidence }
      };
    });
  }

  async confirmHandoff(tenant: TenantContextValue, rawInput: unknown): Promise<HandoffConfirmationResult> {
    return this.run(tenant, 'handoff_confirm', { draftId: this.auditDraftId(rawInput) }, async () => {
      const draftId = parseDraftId(rawInput);
      const confirmation = await this.withSerializationRetry<HandoffConfirmationResult | null>(() => this.prisma.$transaction<HandoffConfirmationResult | null>(async (tx) => {
        const now = new Date();
        const claim = await tx.handoffDraft.updateMany({
          where: { id: draftId, organizationId: tenant.organizationId, actorId: tenant.userId, state: HandoffDraftState.PENDING, expiresAt: { gt: now } },
          data: { state: HandoffDraftState.CONFIRMED, confirmedAt: now }
        });
        if (claim.count === 1) {
          const draft = await tx.handoffDraft.findUnique({
            where: { organizationId_id: { organizationId: tenant.organizationId, id: draftId } },
            select: { summary: true, documentationEvidence: true, accountEvidence: true, conversationExcerpt: true, actorId: true }
          });
          // The update predicate above establishes actor ownership; keep this check defensive.
          if (!draft || draft.actorId !== tenant.userId) throw new AccountToolException('invalid_draft', HttpStatus.CONFLICT);
          const input: HandoffPreviewInput = {
            summary: draft.summary,
            documentationEvidence: draft.documentationEvidence as unknown as DocumentationEvidenceReference[],
            conversationExcerpt: draft.conversationExcerpt ?? undefined
          };
          const accountEvidence = draft.accountEvidence as unknown as SupportAccountEvidence[];
          const ticket = await tx.supportTicket.create({
            data: {
              organizationId: tenant.organizationId,
              openedById: tenant.userId,
              handoffDraftId: draftId,
              reference: ticketReference(draftId),
              subject: input.summary,
              body: ticketBody(input, accountEvidence),
              status: TicketStatus.OPEN,
              priority: TicketPriority.NORMAL
            },
            select: { reference: true, status: true }
          });
          // The consented ticket retains the content; the short-lived draft does not.
          await tx.handoffDraft.update({
            where: { organizationId_id: { organizationId: tenant.organizationId, id: draftId } },
            data: { summary: '', documentationEvidence: [], accountEvidence: [], conversationExcerpt: null }
          });
          return { kind: 'handoff_confirmed', draftId, ticket: { reference: ticket.reference, status: 'OPEN' }, created: true };
        }

        const draft = await tx.handoffDraft.findUnique({
          where: { organizationId_id: { organizationId: tenant.organizationId, id: draftId } },
          select: { actorId: true, state: true, expiresAt: true }
        });
        if (!draft || draft.actorId !== tenant.userId) throw new AccountToolException('invalid_draft', HttpStatus.CONFLICT);
        if (draft.state === HandoffDraftState.CONFIRMED) {
          const ticket = await tx.supportTicket.findUnique({
            where: { organizationId_handoffDraftId: { organizationId: tenant.organizationId, handoffDraftId: draftId } },
            select: { reference: true, status: true }
          });
          if (ticket) return { kind: 'handoff_confirmed', draftId, ticket: { reference: ticket.reference, status: ticket.status }, created: false };
        }
        if (draft.state === HandoffDraftState.CANCELLED) throw new AccountToolException('draft_cancelled', HttpStatus.CONFLICT);
        if (draft.state === HandoffDraftState.EXPIRED || draft.expiresAt <= now) return null;
        throw new AccountToolException('invalid_draft', HttpStatus.CONFLICT);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
      if (confirmation === null) {
        // Do this after the read transaction commits so privacy scrubbing is durable.
        await this.expireOne(this.prisma, tenant, draftId, new Date());
        throw new AccountToolException('draft_expired', HttpStatus.GONE);
      }
      return confirmation;
    });
  }

  async cancelHandoff(tenant: TenantContextValue, rawInput: unknown): Promise<HandoffCancellationResult> {
    return this.run(tenant, 'handoff_cancel', { draftId: this.auditDraftId(rawInput) }, async () => {
      const draftId = parseDraftId(rawInput);
      const now = new Date();
      const cancelled = await this.prisma.handoffDraft.updateMany({
        where: { id: draftId, organizationId: tenant.organizationId, actorId: tenant.userId, state: HandoffDraftState.PENDING, expiresAt: { gt: now } },
        data: { state: HandoffDraftState.CANCELLED, summary: '', documentationEvidence: [], accountEvidence: [], conversationExcerpt: null }
      });
      if (cancelled.count === 1) return { kind: 'handoff_cancelled', draftId, cancelled: true };
      const draft = await this.prisma.handoffDraft.findUnique({
        where: { organizationId_id: { organizationId: tenant.organizationId, id: draftId } },
        select: { actorId: true, state: true, expiresAt: true }
      });
      if (!draft || draft.actorId !== tenant.userId) throw new AccountToolException('invalid_draft', HttpStatus.CONFLICT);
      if (draft.state === HandoffDraftState.CANCELLED) return { kind: 'handoff_cancelled', draftId, cancelled: false };
      if (draft.state === HandoffDraftState.EXPIRED || draft.expiresAt <= now) {
        await this.expireOne(this.prisma, tenant, draftId, now);
        throw new AccountToolException('draft_expired', HttpStatus.GONE);
      }
      throw new AccountToolException('invalid_draft', HttpStatus.CONFLICT);
    });
  }

  private async executeClosedReadPlan(tenant: TenantContextValue, plan: SupportAccountToolPlan): Promise<SupportAccountEvidence> {
    const result = plan.tool === 'subscription_seat_usage' ? await this.subscriptionSeatUsage(tenant)
      : plan.tool === 'job_status' ? await this.jobStatus(tenant, plan.arguments.reference)
        : await this.supportTicketStatus(tenant, plan.arguments.reference);
    if (result.kind === 'subscription_seat_usage') return { kind: result.kind, label: 'Subscription seat usage', planName: result.planName, status: result.status, seatsUsed: result.seatsUsed, seatLimit: result.seatLimit };
    if (result.kind === 'job_status') return { kind: result.kind, label: 'Job status', reference: result.reference, status: result.status };
    return { kind: result.kind, label: 'Support ticket status', reference: result.reference, status: result.status };
  }

  private async validateActiveDocumentation(references: readonly DocumentationEvidenceReference[]): Promise<void> {
    if (!references.length) return;
    const logicalIds = [...new Set(references.map((reference) => reference.sourceId))];
    const sources = await this.prisma.knowledgeSource.findMany({
      where: { logicalId: { in: logicalIds }, visibility: KnowledgeVisibility.PUBLIC, namespace: 'relayops-public' },
      select: { logicalId: true, activeVersionId: true, activeVersion: { select: { chunks: { select: { anchor: true } } } } }
    });
    if (sources.length !== logicalIds.length || sources.some((source) => !source.activeVersionId)) throw new AccountToolException('invalid_argument', HttpStatus.BAD_REQUEST);
    const anchors = new Map(sources.map((source) => [source.logicalId, new Set(source.activeVersion?.chunks.map((chunk) => chunk.anchor).filter((anchor): anchor is string => Boolean(anchor)) ?? [])]));
    if (references.some((reference) => reference.locator && !anchors.get(reference.sourceId)?.has(reference.locator))) throw new AccountToolException('invalid_argument', HttpStatus.BAD_REQUEST);
  }

  private async withSerializationRetry<T>(action: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try { return await action(); }
      catch (error) {
        if (attempt < 2 && typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034') continue;
        throw error;
      }
    }
  }

  private async expirePendingForTenant(tenant: TenantContextValue): Promise<void> {
    await this.prisma.handoffDraft.updateMany({
      where: { organizationId: tenant.organizationId, state: HandoffDraftState.PENDING, expiresAt: { lte: new Date() } },
      data: { state: HandoffDraftState.EXPIRED, summary: '', documentationEvidence: [], accountEvidence: [], conversationExcerpt: null }
    });
  }

  private async expireOne(client: Pick<PrismaService, 'handoffDraft'>, tenant: TenantContextValue, draftId: string, now: Date): Promise<void> {
    await client.handoffDraft.updateMany({
      where: { id: draftId, organizationId: tenant.organizationId, actorId: tenant.userId, state: HandoffDraftState.PENDING, expiresAt: { lte: now } },
      data: { state: HandoffDraftState.EXPIRED, summary: '', documentationEvidence: [], accountEvidence: [], conversationExcerpt: null }
    });
  }

  private previewAuditArguments(input: unknown): SanitizedArguments {
    if (!isPlainObject(input)) return { validShape: false, summaryLength: null, conversationExcerptLength: null, documentationEvidenceCount: null };
    return {
      validShape: onlyKeys(input, ['summary', 'documentationEvidence', 'conversationExcerpt', 'accountToolPlan']),
      summaryLength: typeof input.summary === 'string' ? input.summary.length : null,
      conversationExcerptLength: typeof input.conversationExcerpt === 'string' ? input.conversationExcerpt.length : null,
      documentationEvidenceCount: Array.isArray(input.documentationEvidence) ? input.documentationEvidence.length : null
    };
  }

  private auditDraftId(input: unknown): string | null {
    return isPlainObject(input) && typeof input.draftId === 'string' && uuidPattern.test(input.draftId) ? input.draftId : null;
  }

  private async run<T>(tenant: TenantContextValue, toolName: ToolName, sanitizedArguments: SanitizedArguments, action: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    const traceId = randomUUID();
    let outcome = 'success';
    try {
      return await action();
    } catch (error) {
      outcome = error instanceof AccountToolException ? error.code : 'failed';
      throw error;
    } finally {
      await this.prisma.toolAudit.create({
        data: {
          organizationId: tenant.organizationId,
          actorId: tenant.userId,
          toolName,
          sanitizedArguments: sanitizedArguments as Prisma.InputJsonValue,
          outcome,
          traceId,
          latencyMs: Date.now() - startedAt
        }
      });
    }
  }
}
