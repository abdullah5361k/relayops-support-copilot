import { BadRequestException, Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { SupportAnswerRequest, SupportAnswerResponse, SupportStreamEvent } from '@relayops/contracts';
import type { Request, Response } from 'express';
import { SupportAnswerService, type SupportStage } from './support-answer.service';

function sendEvent(response: Response, event: SupportStreamEvent): void { response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`); }
function question(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'question') || typeof (body as { question?: unknown }).question !== 'string') throw new BadRequestException('Request must contain only a question string');
  const value = (body as { question: string }).question.replace(/\p{Cc}/gu, ' ').trim();
  if (!value || value.length > 1_000) throw new BadRequestException('Question must be between 1 and 1000 characters');
  return value;
}

@Controller('support')
export class SupportController {
  constructor(private readonly answers: SupportAnswerService) {}

  @Post('answers') @HttpCode(200)
  async answer(@Body() body: SupportAnswerRequest | unknown, @Req() request: Request): Promise<SupportAnswerResponse> {
    return this.answers.answer(question(body), { headers: request.headers });
  }

  /** SSE exposes lifecycle only until one validated terminal response is available. */
  @Post('answers/stream') @HttpCode(200)
  async stream(@Body() body: SupportAnswerRequest | unknown, @Req() request: Request, @Res() response: Response): Promise<void> {
    const validatedQuestion = question(body);
    response.status(200).set({ 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    response.flushHeaders(); const abort = new AbortController(); let disconnected = false; let traceId = '';
    const disconnect = () => { disconnected = true; abort.abort(); };
    request.once('aborted', disconnect); response.once('close', disconnect);
    const stage = (value: SupportStage, id: string) => { traceId = id; if (!disconnected) sendEvent(response, { type: 'lifecycle', traceId: id, stage: value }); };
    try {
      const result = await this.answers.answer(validatedQuestion, { signal: abort.signal, onStage: stage, headers: request.headers });
      traceId ||= result.traceId;
      if (disconnected || abort.signal.aborted) return;
      sendEvent(response, { type: 'status', traceId, provider: result.provider });
      sendEvent(response, result.state === 'ANSWERED' ? { type: 'final', response: result } : result.state === 'REFUSED' ? { type: 'refusal', response: result } : { type: 'error', response: result });
      sendEvent(response, { type: 'lifecycle', traceId, stage: 'complete' });
    } finally { request.off('aborted', disconnect); response.off('close', disconnect); if (!disconnected) response.end(); }
  }
}
