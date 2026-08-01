export const EMBEDDING_DIMENSIONS = 384;
export const PUBLIC_NAMESPACE = 'relayops-public' as const;

export type SourceFormat = 'html' | 'faq-json' | 'pdf' | 'docx';
export interface CorpusSource {
  logicalId: string; title: string; format: SourceFormat; path: string;
  visibility: 'PUBLIC'; namespace: typeof PUBLIC_NAMESPACE;
}
export interface ExtractedSection { content: string; heading?: string; section?: string; page?: number; anchor?: string; }
export interface Chunk extends ExtractedSection { ordinal: number; charStart: number; charEnd: number; tokenCount: number; searchText: string; }
export interface EmbeddingProvider {
  readonly modelId: string; readonly modelVersion: string;
  embed(texts: readonly string[]): Promise<number[][]>;
}
export interface Evidence {
  sourceLogicalId: string; sourceTitle: string; content: string; heading: string | null; section: string | null;
  page: number | null; anchor: string | null; score: number; semanticRank?: number; keywordRank?: number;
}
