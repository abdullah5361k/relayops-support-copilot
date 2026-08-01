import JSZip from 'jszip';
import type { ExtractedSection, SourceFormat } from './types';
import { normalizeText } from './chunker';

const MAX_BYTES = 5 * 1024 * 1024;
export class ExtractionError extends Error { constructor(message: string) { super(message); this.name = 'ExtractionError'; } }
function assertInput(data: Buffer, format: SourceFormat) {
  if (!data.length) throw new ExtractionError('Input is empty');
  if (data.length > MAX_BYTES) throw new ExtractionError(`Input exceeds ${MAX_BYTES} byte limit`);
  if (format === 'pdf' && !data.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new ExtractionError('PDF signature is invalid');
  if (format === 'docx' && !(data[0] === 0x50 && data[1] === 0x4b)) throw new ExtractionError('DOCX must be a ZIP container');
}
const decodeEntities = (value: string) => value.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const stripMarkup = (value: string) => normalizeText(decodeEntities(value.replace(/<\/?[^>]+>/g, ' ')));

function html(data: Buffer): ExtractedSection[] {
  const input = data.toString('utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<!--([\s\S]*?)-->/gi, '');
  const sections: ExtractedSection[] = []; let heading = ''; let match: RegExpExecArray | null;
  const re = /<(h[1-6]|p|li|td|dd)[^>]*(?:id=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/\1>/gi;
  while ((match = re.exec(input))) { const tag = match[1]!; const text = stripMarkup(match[3] ?? ''); if (!text) continue; if (tag.toLowerCase().startsWith('h')) { heading = text; continue; } sections.push({ content: text, heading, anchor: match[2] || undefined }); }
  if (!sections.length) throw new ExtractionError('HTML contained no readable heading or body text'); return sections;
}
function faq(data: Buffer): ExtractedSection[] {
  let parsed: unknown; try { parsed = JSON.parse(data.toString('utf8')); } catch { throw new ExtractionError('FAQ JSON is malformed'); }
  if (!Array.isArray(parsed)) throw new ExtractionError('FAQ JSON must be an array');
  const sections = parsed.map((item, index) => {
    if (!item || typeof item !== 'object' || typeof (item as { question?: unknown }).question !== 'string' || typeof (item as { answer?: unknown }).answer !== 'string') throw new ExtractionError(`FAQ entry ${index + 1} requires question and answer strings`);
    const entry = item as { question: string; answer: string; id?: string }; return { heading: normalizeText(entry.question), content: normalizeText(entry.answer), anchor: entry.id };
  }).filter((section) => section.content);
  if (!sections.length) throw new ExtractionError('FAQ has no answers'); return sections;
}
function pdf(data: Buffer): ExtractedSection[] {
  const source = data.toString('latin1'); const pageObjects = [...source.matchAll(/\/Type\s*\/Page\b[\s\S]*?\/Contents\s+(\d+)\s+\d+\s+R/g)];
  const pageTexts = pageObjects.map((page) => { const object = page[1] ?? ''; const stream = new RegExp(`${object}\\s+\\d+\\s+obj[\\s\\S]*?stream\\s*([\\s\\S]*?)endstream`).exec(source)?.[1] ?? ''; return [...stream.matchAll(/\(([^()]*)\)\s*Tj/g)].map((m) => (m[1] ?? '').replace(/\\([()\\])/g, '$1')).join(' '); });
  const sections = pageTexts.map((content, index) => ({ content: normalizeText(content), heading: index === 0 ? 'RelayOps field manual' : `Page ${index + 1}`, page: index + 1 })).filter((section) => section.content);
  if (!sections.length) throw new ExtractionError('PDF has no extractable text; scanned PDFs are unsupported'); return sections;
}
async function docx(data: Buffer): Promise<ExtractedSection[]> {
  let zip: JSZip; try { zip = await JSZip.loadAsync(data); } catch { throw new ExtractionError('DOCX ZIP container is corrupt'); }
  const document = zip.file('word/document.xml'); if (!document) throw new ExtractionError('DOCX is missing word/document.xml');
  const xml = await document.async('string'); const sections: ExtractedSection[] = [];
  for (const paragraph of xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const raw = paragraph[0] ?? ''; const content = normalizeText([...raw.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => decodeEntities(m[1] ?? '')).join(' '));
    if (!content) continue; const isHeading = /w:pStyle[^>]+w:val="Heading[1-6]"/.test(raw); if (isHeading) { sections.push({ content: '', heading: content, anchor: `paragraph-${sections.length + 1}` }); } else {
      const prior = [...sections].reverse().find((s) => s.heading)?.heading; sections.push({ content, heading: prior, anchor: `paragraph-${sections.length + 1}` });
    }
  }
  const readable = sections.filter((s) => s.content); if (!readable.length) throw new ExtractionError('DOCX has no readable paragraphs'); return readable;
}
export async function extract(data: Buffer, format: SourceFormat): Promise<ExtractedSection[]> { assertInput(data, format); if (format === 'html') return html(data); if (format === 'faq-json') return faq(data); if (format === 'pdf') return pdf(data); return docx(data); }
