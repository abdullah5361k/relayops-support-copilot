import { readFile } from 'node:fs/promises';
import { chunkSections, normalizeText } from '../src/knowledge/chunker';
import { DeterministicEmbeddingProvider, validateVector } from '../src/knowledge/embeddings';
import { extract, ExtractionError } from '../src/knowledge/extractors';

describe('knowledge foundation deterministic boundaries', () => {
  it('normalizes and chunks reproducibly without tiny orphan chunks', () => {
    const section = { heading: 'Runbook', content: `  ${Array.from({ length: 240 }, (_, index) => `word${index}`).join(' ')}  ` };
    const first = chunkSections([section]); const second = chunkSections([section]);
    expect(first).toEqual(second); expect(first.length).toBeGreaterThan(1); expect(first.every((chunk) => chunk.tokenCount >= 12)).toBe(true); expect(normalizeText(' a\r\n\n b ')).toBe('a\n\nb');
  });
  it('extracts committed FAQ, PDF and DOCX without interpreting markup', async () => {
    const [faq, pdf, docx] = await Promise.all(['faq.json', 'field-visit-manual.pdf', 'dispatcher-onboarding.docx'].map(async (name) => readFile(`../../corpus/sources/${name}`)));
    await expect(extract(faq!, 'faq-json')).resolves.toHaveLength(3); await expect(extract(pdf!, 'pdf')).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ page: 1 })])); await expect(extract(docx!, 'docx')).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ heading: 'Dispatcher first week' })]));
    await expect(extract(Buffer.from('<script>evil()</script>'), 'html')).rejects.toBeInstanceOf(ExtractionError);
    await expect(extract(Buffer.from('not a PDF'), 'pdf')).rejects.toThrow('signature'); await expect(extract(Buffer.from('[]'), 'faq-json')).rejects.toThrow('no answers');
  });
  it('uses stable normalized deterministic vectors and rejects bad vectors', async () => {
    const provider = new DeterministicEmbeddingProvider(); const [first] = await provider.embed(['dispatch customer schedule']); const [second] = await provider.embed(['dispatch customer schedule']);
    expect(first).toEqual(second); expect(Math.hypot(...first!)).toBeCloseTo(1); expect(() => validateVector([1])).toThrow('384'); expect(() => validateVector(new Array(384).fill(0))).toThrow('zero');
  });
});
