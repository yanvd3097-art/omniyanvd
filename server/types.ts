export interface Chapter {
  index: number;
  title: string;
  originalText: string;
  translatedText?: string;
  status: 'pending' | 'translating' | 'completed' | 'failed' | 'fallback_google';
  translatorUsed?: 'gemini' | 'google_translate';
  originalWordCount: number;
  translatedWordCount: number;
  error?: string;
  fallbackReason?: string;
  completedAt?: number;
}

export interface TranslationJob {
  id: string;
  title: string;
  sourceLang: string;
  targetLang: string;
  model: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  createdAt: number;
  updatedAt: number;
  totalChapters: number;
  completedChapters: number;
  totalOriginalWords: number;
  translatedWords: number;
  activeKeyIndex: number;
  apiKeys: string[];
  glossary: Record<string, string>;
  chapters: Chapter[];
  telegramConfig?: {
    botToken: string;
    chatId: string;
    enabled: boolean;
  };
  lastError?: string;
}

export interface JobStatusSummary {
  id: string;
  title: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  sourceLang: string;
  targetLang: string;
  totalChapters: number;
  completedChapters: number;
  totalOriginalWords: number;
  translatedWords: number;
  activeKeyIndex: number;
  totalKeys: number;
  currentChapterTitle?: string;
  currentChapterIndex?: number;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
  readyForEpub: boolean;
  sensitiveChaptersCount: number;
}
