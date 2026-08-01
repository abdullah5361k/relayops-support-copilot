import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KnowledgeConsole } from '@/components/KnowledgeConsole';
import type { RagClient } from '@/lib/rag-contracts';

const client: RagClient = {
  async *streamAnswer() { yield { type: 'ended' as const }; }, previewHandoff: async () => { throw new Error('unused'); }, confirmHandoff: async () => { throw new Error('unused'); }, cancelHandoff: async () => undefined,
  getKnowledge: async () => ({ sources: [{ logicalId: 'dispatch-basics', title: 'Dispatch basics', sourceType: 'html', status: 'active', activeVersion: 'version-1', updatedAt: '2026-08-01T00:00:00.000Z', chunkCount: 2 }], runs: [{ id: 'run-1', sourceLogicalId: 'dispatch-basics', status: 'completed', stage: 'complete', startedAt: '2026-08-01T00:00:00.000Z', finishedAt: '2026-08-01T00:01:00.000Z', error: null }], model: { name: 'Xenova/all-MiniLM-L6-v2', status: 'ready', cache: 'present', note: 'Configured local MiniLM cache is present.' } }),
  searchKnowledge: async () => [{ citation: { evidenceId: 'chunk-1', sourceLogicalId: 'dispatch-basics', sourceTitle: 'Dispatch basics', sourceType: 'html', heading: 'Urgent jobs', section: null, page: 2, anchor: 'urgent', excerpt: 'Acknowledge urgent jobs before assigning the next available technician.' }, score: 0.94 }],
  reindexKnowledge: async () => ({ results: [{ logicalId: 'dispatch-basics', status: 'skipped' }], runs: [] })
};
describe('KnowledgeConsole', () => {
  it('shows active source/version health and evidence search using the canonical client', async () => {
    const user = userEvent.setup(); render(<KnowledgeConsole client={client} />);
    expect(await screen.findByText('Sources and active versions')).toBeInTheDocument();
    expect(screen.getByText(/Configured local MiniLM cache/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /search evidence chunks/i }), 'urgent'); await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/Acknowledge urgent jobs/)).toBeInTheDocument();
  });
});
