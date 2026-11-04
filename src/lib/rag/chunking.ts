export interface Chunk {
  index: number;
  content: string;
}

export interface DocumentChunk extends Chunk {
  page?: number;
}

/**
 * Chunks each section separately so a chunk never spans two PDF pages (which
 * keeps page citations exact), then drops exact-duplicate chunks such as
 * repeated headers and footers. Indices are renumbered sequentially.
 */
export function chunkSections(
  sections: { text: string; page?: number }[],
  options: { chunkSize?: number; overlap?: number } = {}
): DocumentChunk[] {
  const seen = new Set<string>();
  const result: DocumentChunk[] = [];
  for (const section of sections) {
    for (const chunk of chunkText(section.text, options)) {
      const key = chunk.content.replace(/\s+/g, " ").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ index: result.length, content: chunk.content, page: section.page });
    }
  }
  return result;
}

/**
 * Splits cleaned text into overlapping chunks by character count.
 * Character-based (not token-based) to avoid pulling in a tokenizer
 * dependency — good enough for a first production version and easy
 * to swap for a token-aware splitter later.
 */
export function chunkText(
  text: string,
  options: { chunkSize?: number; overlap?: number } = {}
): Chunk[] {
  const chunkSize = options.chunkSize ?? Number(process.env.RAG_CHUNK_SIZE || 1000);
  const overlap = options.overlap ?? Number(process.env.RAG_CHUNK_OVERLAP || 150);

  if (chunkSize <= 0) throw new Error("chunkSize must be > 0");
  if (overlap < 0 || overlap >= chunkSize) {
    throw new Error("overlap must be >= 0 and < chunkSize");
  }

  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const chunks: Chunk[] = [];
  let current = "";

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed.length > 0) {
      chunks.push({ index: chunks.length, content: trimmed });
    }
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > chunkSize) {
      // Paragraph itself exceeds chunk size: hard-split it with overlap.
      if (current.length > 0) {
        pushCurrent();
        current = "";
      }
      let start = 0;
      while (start < paragraph.length) {
        const end = Math.min(start + chunkSize, paragraph.length);
        chunks.push({ index: chunks.length, content: paragraph.slice(start, end).trim() });
        if (end === paragraph.length) break;
        start = end - overlap;
      }
      continue;
    }

    if ((current + "\n\n" + paragraph).length > chunkSize) {
      pushCurrent();
      // Start next chunk with the overlap tail of the previous one.
      const tail = current.slice(Math.max(0, current.length - overlap));
      current = tail ? tail + "\n\n" + paragraph : paragraph;
    } else {
      current = current ? current + "\n\n" + paragraph : paragraph;
    }
  }
  pushCurrent();

  return chunks;
}
