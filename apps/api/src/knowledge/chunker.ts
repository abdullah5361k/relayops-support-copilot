import type { Chunk, ExtractedSection } from './types';

/** Deterministic whitespace-token chunking: 180 tokens / 1,200 chars, 30-token overlap. */
export const CHUNK_POLICY = { maxTokens: 180, maxChars: 1200, overlapTokens: 30, minTokens: 12 } as const;
const tokenise = (text: string) => text.trim().split(/\s+/).filter(Boolean);
export const normalizeText = (text: string) => text.split('\0').join('').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

export function chunkSections(sections: ExtractedSection[]): Chunk[] {
  const result: Chunk[] = []; let ordinal = 0; let globalOffset = 0; let previous = '';
  for (const section of sections) {
    const content = normalizeText(section.content); const tokens = tokenise(content);
    if (!content || tokens.length < CHUNK_POLICY.minTokens || content === previous) { globalOffset += content.length + 2; continue; }
    for (let start = 0; start < tokens.length;) {
      let end = Math.min(tokens.length, start + CHUNK_POLICY.maxTokens);
      while (end > start + CHUNK_POLICY.minTokens && tokens.slice(start, end).join(' ').length > CHUNK_POLICY.maxChars) end--;
      const text = tokens.slice(start, end).join(' ');
      if (text.length && (end - start >= CHUNK_POLICY.minTokens || end === tokens.length)) {
        const charStart = globalOffset + content.indexOf(text.split(' ').slice(0, 4).join(' '));
        result.push({ ...section, content: text, ordinal: ordinal++, charStart, charEnd: charStart + text.length, tokenCount: end - start, searchText: normalizeText(`${section.heading ?? ''} ${text}`).toLowerCase() });
      }
      if (end === tokens.length) break;
      start = Math.max(start + 1, end - CHUNK_POLICY.overlapTokens);
    }
    previous = content; globalOffset += content.length + 2;
  }
  return result;
}
