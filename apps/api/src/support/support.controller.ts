import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { SupportAnswerRequest, SupportStreamEvent } from '@relayops/contracts';
import type { Request, Response } from 'express';
import { SupportAnswerService, type SupportStage } from './support-answer.service';

function sendEvent(response: Response, event: SupportStreamEvent): void {
  response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

@Controller('support')
export class SupportController {
  constructor(private readonly answers: SupportAnswerService) {}

  @Post('answers')
  @HttpCode(200)
  async answer(@Body() body: SupportAnswerRequest) {
    return this.answers.answer(typeof body?.question === 'string' ? body.question : '');
  }

  /** SSE uses final validated answer events only; no unvalidated model tokens cross this boundary. */
  @Post('answers/stream')
  @HttpCode(200)
  async stream(@Body() body: SupportAnswerRequest, @Req() request: Request, @Res() response: Response): Promise<void> {
    response.status(200).set({ 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    response.flushHeaders();
    const abort = new AbortController(); let disconnected = false;
    const disconnect = () => { disconnected = true; abort.abort(); };
    request.once('aborted', disconnect);
    response.once('close', disconnect);
    let traceId = '';
    const stage = (value: SupportStage, id: string) => {
      traceId = id;
      if (!disconnected) sendEvent(response, { type: 'lifecycle', traceId: id, stage: value });
    };
    try {
      const result = await this.answers.answer(typeof body?.question === 'string' ? body.question : '', { signal: abort.signal, onStage: stage });
      traceId ||= result.traceId;
      if (disconnected || abort.signal.aborted) return;
      sendEvent(response, { type: 'status', traceId, provider: result.provider });
      if (result.state === 'ANSWERED') {
        sendEvent(response, { type: 'answer', traceId, answer: result.answer! });
        sendEvent(response, { type: 'citations', traceId, citations: result.citations });
      } else if (result.state === 'REFUSED') {
        sendEvent(response, { type: 'refusal', traceId, reason: result.refusalReason!, suggestedTopics: result.suggestedTopics });
      } else {
        sendEvent(response, { type: 'error', traceId, reason: result.refusalReason!, message: 'No validated answer is available. Please retry after resolving the reported local dependency.' });
      }
      sendEvent(response, { type: 'lifecycle', traceId, stage: 'complete' });
    } finally {
      request.off('aborted', disconnect);
      response.off('close', disconnect);
      if (!disconnected) response.end();
    }
  }
}
