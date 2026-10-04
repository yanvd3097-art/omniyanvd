import { Chapter } from '../types.js';

export function countWords(text: string): number {
  if (!text) return 0;
  // For CJK (Chinese, Japanese, Korean) characters, count each character
  const cjkChars = (text.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  // For other alphabetic words, count whitespace-separated words
  const nonCjk = text.replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, ' ');
  const words = (nonCjk.trim().match(/\b\w+\b/g) || []).length;
  return cjkChars + words;
}

export function splitTextIntoChapters(rawText: string, defaultTitle: string = 'Untitled Novel'): Chapter[] {
  // Normalize line endings
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  if (!text) {
    return [];
  }

  // Regexes matching common chapter headings in web novels / light novels / books
  // 1. Chinese/Japanese: 第...章/回/节/集/卷/話/幕
  // 2. English: Chapter \d+, Ch. \d+, Book \d+, Act \d+, Episode \d+, Prologue, Epilogue
  // 3. Korean: 제\s*\d+\s*[장|화]
  // 4. Roman numerals or plain "Chapter Title"
  const chapterRegex = /(?:^|\n)(?=(?:第\s*[0-9一二三四五六七八九十百千万零]+\s*[章回节集卷話幕][^\n]*|Chapter\s+[0-9IVXLCDMivxlcdm]+[^\n]*|Ch\.\s*[0-9]+[^\n]*|Cap[ií]tulo\s+[0-9]+[^\n]*|제\s*[0-9]+\s*[장화][^\n]*|Prologue|Epilogue|Preface|Interlude\s*[0-9]*)[^\n]*)/i;

  const rawSplits = text.split(chapterRegex).map(s => s.trim()).filter(s => s.length > 0);

  // If chapter regex matched multiple distinct sections (at least 2)
  if (rawSplits.length >= 2) {
    const chapters: Chapter[] = [];
    let idx = 1;

    for (const chunk of rawSplits) {
      const lines = chunk.split('\n');
      let title = lines[0].trim();
      let content = lines.slice(1).join('\n').trim();

      // If first line wasn't the heading or chunk is very short, keep it together
      if (lines.length === 1 && title.length < 100) {
        // Just a header with no body, maybe next chunk has body
        continue;
      }

      if (!content) {
        content = title;
        title = `Chapter ${idx}`;
      }

      // Clean title
      title = title.slice(0, 100).trim();

      chapters.push({
        index: idx++,
        title: title || `Chapter ${idx}`,
        originalText: chunk,
        status: 'pending',
        originalWordCount: countWords(chunk),
        translatedWordCount: 0,
      });
    }

    if (chapters.length > 0) {
      return chapters;
    }
  }

  // Fallback: Smart chunking based on paragraphs (~1,500 - 2,500 words or ~4,000 characters per chapter)
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const chapters: Chapter[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;
  const TARGET_WORDS_PER_CHAPTER = 1800;
  let idx = 1;

  for (const para of paragraphs) {
    const pWords = countWords(para);
    if (currentWordCount + pWords > TARGET_WORDS_PER_CHAPTER && currentChunk.length > 0) {
      const fullText = currentChunk.join('\n\n');
      chapters.push({
        index: idx,
        title: `Chapter ${idx}`,
        originalText: fullText,
        status: 'pending',
        originalWordCount: countWords(fullText),
        translatedWordCount: 0,
      });
      idx++;
      currentChunk = [para];
      currentWordCount = pWords;
    } else {
      currentChunk.push(para);
      currentWordCount += pWords;
    }
  }

  if (currentChunk.length > 0) {
    const fullText = currentChunk.join('\n\n');
    chapters.push({
      index: idx,
      title: `Chapter ${idx}`,
      originalText: fullText,
      status: 'pending',
      originalWordCount: countWords(fullText),
      translatedWordCount: 0,
    });
  }

  return chapters;
}
