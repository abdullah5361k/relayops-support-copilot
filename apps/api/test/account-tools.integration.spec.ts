import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MembershipStatus, PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AccountToolService } from '../src/account-tools/account-tool.service';

const integration = process.env.RUN_INTEGRATION_TESTS === '1' ? describe : describe.skip;
const prisma = new PrismaClient();

integration('real PostgreSQL tenant-safe account tools and consent handoff', () => {
  let app: INestApplication; let base: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    base = `http://127.0.0.1:${address.port}/api`;
  });
  afterAll(async () => { await app?.close(); await prisma.$disconnect(); });

  async function signIn(identity: string): Promise<string> {
    const response = await fetch(`${base}/demo/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identity }) });
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error('Expected demo session cookie');
    return cookie;
  }
  function get(path: string, cookie?: string, organization = 'spoofed-organization') {
    return fetch(`${base}${path}`, { headers: { ...(cookie ? { cookie } : {}), 'x-organization-id': organization } });
  }
  function post(path: string, cookie: string, body: unknown, organization = 'spoofed-organization') {
    return fetch(`${base}${path}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-organization-id': organization }, body: JSON.stringify(body) });
  }
  const previewBody = { summary: 'Need synthetic help with seat access', documentationEvidence: [{ sourceId: 'relayops-help', locator: 'seats' }], conversationExcerpt: 'Synthetic conversation excerpt.' };

  it('returns only minimal tenant-owned account facts and makes foreign references indistinguishable from missing', async () => {
    const north = await signIn('northstar-owner'); const prime = await signIn('primeflow-owner');
    const [northSeats, primeSeats] = await Promise.all([
      get('/account-tools/subscription-seat-usage', north, 'primeflow'), get('/account-tools/subscription-seat-usage', prime, 'northstar')
    ]);
    expect(await northSeats.json()).toEqual({ kind: 'subscription_seat_usage', planName: 'Growth Demo', status: 'ACTIVE', seatsUsed: 3, seatLimit: 10 });
    expect(await primeSeats.json()).toEqual({ kind: 'subscription_seat_usage', planName: 'Starter', status: 'TRIALING', seatsUsed: 2, seatLimit: 5 });

    expect(await (await get('/account-tools/jobs/NH-1042/status', north)).json()).toEqual({ kind: 'job_status', reference: 'NH-1042', status: 'IN_PROGRESS' });
    expect(await (await get('/account-tools/jobs/PF-2088/status', prime)).json()).toEqual({ kind: 'job_status', reference: 'PF-2088', status: 'SCHEDULED' });
    expect(await (await get('/account-tools/tickets/SUP-310/status', north)).json()).toEqual({ kind: 'support_ticket_status', reference: 'SUP-310', status: 'OPEN' });

    const foreign = await get('/account-tools/jobs/PF-2088/status', north);
    const missing = await get('/account-tools/jobs/NH-999999/status', north);
    expect(foreign.status).toBe(404); expect(missing.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
    const foreignTicket = await get('/account-tools/tickets/SUP-422/status', north);
    const missingTicket = await get('/account-tools/tickets/SUP-999999/status', north);
    expect(foreignTicket.status).toBe(404); expect(await foreignTicket.json()).toEqual(await missingTicket.json());
  });

  it('rejects malformed and authority-bearing bodies, ignores headers, and rejects missing or inactive sessions', async () => {
    const north = await signIn('northstar-owner');
    expect((await get('/account-tools/jobs/not-a-reference/status', north)).status).toBe(400);
    expect((await post('/account-tools/handoffs/preview', north, { ...previewBody, organizationId: 'primeflow' })).status).toBe(400);
    const preview = await post('/account-tools/handoffs/preview', north, previewBody, 'primeflow');
    expect(preview.status).toBe(200);
    const draft = await preview.json() as { draftId: string };
    // A caller-supplied organization field cannot confirm or redirect the server-derived tenant.
    expect((await post('/account-tools/handoffs/confirm', north, { draftId: draft.draftId, organizationId: 'primeflow' })).status).toBe(400);
    expect((await fetch(`${base}/account-tools/subscription-seat-usage`)).status).toBe(401);

    await prisma.organizationMembership.update({ where: { organizationId_userId: { organizationId: '10000000-0000-4000-8000-000000000001', userId: '11000000-0000-4000-8000-000000000001' } }, data: { status: MembershipStatus.SUSPENDED } });
    try { expect((await get('/account-tools/subscription-seat-usage', north)).status).toBe(401); }
    finally { await prisma.organizationMembership.update({ where: { organizationId_userId: { organizationId: '10000000-0000-4000-8000-000000000001', userId: '11000000-0000-4000-8000-000000000001' } }, data: { status: MembershipStatus.ACTIVE } }); }
  });

  it('requires same tenant/actor consent, redacts audit content, and makes confirmation idempotent', async () => {
    const north = await signIn('northstar-owner'); const prime = await signIn('primeflow-owner');
    const preview = await (await post('/account-tools/handoffs/preview', north, previewBody)).json() as { draftId: string; shared: { summary: string } };
    expect(preview.shared.summary).toBe(previewBody.summary);
    const foreign = await post('/account-tools/handoffs/confirm', prime, { draftId: preview.draftId });
    expect(foreign.status).toBe(409); expect(await foreign.json()).toEqual({ kind: 'error', code: 'invalid_draft' });
    // Direct service validation covers a second active actor in the same tenant; the public
    // demo allowlist intentionally exposes only one identity per tenant.
    await expect(app.get(AccountToolService).confirmHandoff({ organizationId: '10000000-0000-4000-8000-000000000001', userId: '11000000-0000-4000-8000-000000000002', userName: 'Eli Brooks', userEmail: 'eli@northstar.demo', role: 'DISPATCHER' }, { draftId: preview.draftId })).rejects.toMatchObject({ code: 'invalid_draft' });

    const first = await post('/account-tools/handoffs/confirm', north, { draftId: preview.draftId });
    const firstBody = await first.json() as { created: boolean; ticket: { reference: string } };
    expect(first.status).toBe(200); expect(firstBody.created).toBe(true);
    const replay = await (await post('/account-tools/handoffs/confirm', north, { draftId: preview.draftId })).json() as { created: boolean; ticket: { reference: string } };
    expect(replay).toEqual({ kind: 'handoff_confirmed', draftId: preview.draftId, ticket: { reference: firstBody.ticket.reference, status: 'OPEN' }, created: false });
    const ticket = await prisma.supportTicket.findUnique({ where: { organizationId_handoffDraftId: { organizationId: '10000000-0000-4000-8000-000000000001', handoffDraftId: preview.draftId } } });
    expect(ticket).toMatchObject({ status: 'OPEN', priority: 'NORMAL', openedById: '11000000-0000-4000-8000-000000000001', subject: previewBody.summary });
    expect(ticket?.body).toContain('Synthetic conversation excerpt.');
    expect(await prisma.supportTicket.count({ where: { organizationId: '10000000-0000-4000-8000-000000000001', handoffDraftId: preview.draftId } })).toBe(1);
    const audit = await prisma.toolAudit.findFirst({ where: { organizationId: '10000000-0000-4000-8000-000000000001', toolName: 'handoff_preview' }, orderBy: { createdAt: 'desc' } });
    expect(JSON.stringify(audit?.sanitizedArguments)).not.toContain('Synthetic conversation excerpt');
    expect(JSON.stringify(audit?.sanitizedArguments)).not.toContain(previewBody.summary);
    expect(audit).toMatchObject({ actorId: '11000000-0000-4000-8000-000000000001', outcome: 'success' });
    expect(audit?.traceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('cancels and expires safely, and concurrent confirmation creates exactly one ticket', async () => {
    const north = await signIn('northstar-owner');
    const cancelledPreview = await (await post('/account-tools/handoffs/preview', north, previewBody)).json() as { draftId: string };
    expect(await (await post('/account-tools/handoffs/cancel', north, { draftId: cancelledPreview.draftId })).json()).toEqual({ kind: 'handoff_cancelled', draftId: cancelledPreview.draftId, cancelled: true });
    expect(await (await post('/account-tools/handoffs/cancel', north, { draftId: cancelledPreview.draftId })).json()).toEqual({ kind: 'handoff_cancelled', draftId: cancelledPreview.draftId, cancelled: false });
    expect(await (await post('/account-tools/handoffs/confirm', north, { draftId: cancelledPreview.draftId })).json()).toEqual({ kind: 'error', code: 'draft_cancelled' });

    const expiredPreview = await (await post('/account-tools/handoffs/preview', north, previewBody)).json() as { draftId: string };
    await prisma.handoffDraft.update({ where: { organizationId_id: { organizationId: '10000000-0000-4000-8000-000000000001', id: expiredPreview.draftId } }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    const expired = await post('/account-tools/handoffs/confirm', north, { draftId: expiredPreview.draftId });
    expect(expired.status).toBe(410); expect(await expired.json()).toEqual({ kind: 'error', code: 'draft_expired' });
    expect(await prisma.handoffDraft.findUnique({ where: { organizationId_id: { organizationId: '10000000-0000-4000-8000-000000000001', id: expiredPreview.draftId } }, select: { state: true, summary: true } })).toEqual({ state: 'EXPIRED', summary: '' });

    const concurrentPreview = await (await post('/account-tools/handoffs/preview', north, { ...previewBody, summary: 'Concurrent synthetic handoff' })).json() as { draftId: string };
    const results = await Promise.all([post('/account-tools/handoffs/confirm', north, { draftId: concurrentPreview.draftId }), post('/account-tools/handoffs/confirm', north, { draftId: concurrentPreview.draftId })]);
    const bodies = await Promise.all(results.map((result) => result.json())) as Array<{ created: boolean }>;
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(bodies.map((body) => body.created).sort()).toEqual([false, true]);
    expect(await prisma.supportTicket.count({ where: { organizationId: '10000000-0000-4000-8000-000000000001', handoffDraftId: concurrentPreview.draftId } })).toBe(1);
  });
});
