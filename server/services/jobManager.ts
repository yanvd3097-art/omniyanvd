import fs from 'fs';
import path from 'path';
import { Chapter, JobStatusSummary, TranslationJob } from '../types.js';
import { countWords } from './textSplitter.js';
import { translateChapterWithGemini, SafetyBlockError, RateLimitError } from './geminiTranslator.js';
import { translateWithGoogleTranslate } from './googleTranslator.js';
import { sendTelegramNotification } from './telegramService.js';
import { generateEpubBuffer } from './epubGenerator.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

export class JobManager {
  private jobs: Map<string, TranslationJob> = new Map();
  private runningJobIds: Set<string> = new Set();

  constructor() {
    this.ensureDataDir();
    this.loadJobsFromDisk();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadJobsFromDisk() {
    try {
      if (fs.existsSync(JOBS_FILE)) {
        const raw = fs.readFileSync(JOBS_FILE, 'utf-8');
        const list: TranslationJob[] = JSON.parse(raw);
        for (const job of list) {
          // If server restarted while job was running, mark it paused
          if (job.status === 'running') {
            job.status = 'paused';
          }
          this.jobs.set(job.id, job);
        }
      }
    } catch (err) {
      console.error('Failed to load jobs from disk:', err);
    }
  }

  private saveJobsToDisk() {
    try {
      this.ensureDataDir();
      const list = Array.from(this.jobs.values()).map(job => ({
        ...job,
        apiKeys: [], // Keep API keys strictly in memory; never persist to disk
      }));
      fs.writeFileSync(JOBS_FILE, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist jobs to disk:', err);
    }
  }

  public createJob(params: {
    title: string;
    chapters: Chapter[];
    sourceLang: string;
    targetLang: string;
    model: string;
    apiKeys: string[];
    glossary?: Record<string, string>;
    telegramConfig?: { botToken: string; chatId: string; enabled: boolean };
  }): TranslationJob {
    const id = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const totalOriginalWords = params.chapters.reduce((acc, c) => acc + (c.originalWordCount || 0), 0);

    // If no keys provided in params, fallback to process.env.GEMINI_API_KEY
    const keys = (params.apiKeys || []).map(k => k.trim()).filter(Boolean);
    if (keys.length === 0 && process.env.GEMINI_API_KEY) {
      keys.push(process.env.GEMINI_API_KEY.trim());
    }

    const job: TranslationJob = {
      id,
      title: params.title || 'Untitled Novel',
      sourceLang: params.sourceLang || 'auto',
      targetLang: params.targetLang || 'en',
      model: params.model || 'gemini-3.8-flash',
      status: 'idle',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalChapters: params.chapters.length,
      completedChapters: 0,
      totalOriginalWords,
      translatedWords: 0,
      activeKeyIndex: 0,
      apiKeys: keys,
      glossary: params.glossary || {},
      chapters: params.chapters,
      telegramConfig: params.telegramConfig,
    };

    this.jobs.set(id, job);
    this.saveJobsToDisk();
    return job;
  }

  public getJob(id: string): TranslationJob | undefined {
    return this.jobs.get(id);
  }

  public getAllJobs(): TranslationJob[] {
    return Array.from(this.jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public getJobStatusSummary(id: string): JobStatusSummary | null {
    const job = this.jobs.get(id);
    if (!job) return null;

    const currentChapter = job.chapters.find(c => c.status === 'translating');
    const sensitiveChaptersCount = job.chapters.filter(c => c.status === 'fallback_google').length;

    return {
      id: job.id,
      title: job.title,
      status: job.status,
      sourceLang: job.sourceLang,
      targetLang: job.targetLang,
      totalChapters: job.totalChapters,
      completedChapters: job.completedChapters,
      totalOriginalWords: job.totalOriginalWords,
      translatedWords: job.translatedWords,
      activeKeyIndex: job.activeKeyIndex,
      totalKeys: job.apiKeys.length,
      currentChapterTitle: currentChapter ? currentChapter.title : undefined,
      currentChapterIndex: currentChapter ? currentChapter.index : undefined,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      lastError: job.lastError,
      readyForEpub: job.translatedWords >= 20000 || job.completedChapters > 0,
      sensitiveChaptersCount,
    };
  }

  public startJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (this.runningJobIds.has(id)) {
      return true;
    }

    job.status = 'running';
    job.updatedAt = Date.now();
    this.runningJobIds.add(id);
    this.saveJobsToDisk();

    // Start background translation loop
    this.runTranslationLoop(id);
    return true;
  }

  public pauseJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    job.status = 'paused';
    job.updatedAt = Date.now();
    this.runningJobIds.delete(id);
    this.saveJobsToDisk();
    return true;
  }

  public deleteJob(id: string): boolean {
    this.runningJobIds.delete(id);
    const res = this.jobs.delete(id);
    this.saveJobsToDisk();
    return res;
  }

  public updateJobKeys(id: string, keys: string[]): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    job.apiKeys = keys.map(k => k.trim()).filter(Boolean);
    if (job.apiKeys.length === 0 && process.env.GEMINI_API_KEY) {
      job.apiKeys.push(process.env.GEMINI_API_KEY.trim());
    }
    job.activeKeyIndex = 0;
    job.updatedAt = Date.now();
    this.saveJobsToDisk();
    return true;
  }

  private async runTranslationLoop(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    if (job.telegramConfig?.enabled && job.telegramConfig.botToken) {
      sendTelegramNotification(
        job.telegramConfig.botToken,
        job.telegramConfig.chatId,
        `🚀 <b>MegaTXT Translator Started</b>\nNovel: <i>${job.title}</i>\nTotal Chapters: ${job.totalChapters}\nKeys in rotation: ${job.apiKeys.length}`
      ).catch(() => {});
    }

    let notified20k = false;

    while (this.runningJobIds.has(jobId)) {
      // Find the next chapter that is pending or failed
      const chapter = job.chapters.find(c => c.status === 'pending');

      if (!chapter) {
        // Translation completed!
        job.status = 'completed';
        job.updatedAt = Date.now();
        this.runningJobIds.delete(jobId);
        this.saveJobsToDisk();

        if (job.telegramConfig?.enabled && job.telegramConfig.botToken) {
          sendTelegramNotification(
            job.telegramConfig.botToken,
            job.telegramConfig.chatId,
            `🎉 <b>Novel Translation Finished!</b>\nNovel: <i>${job.title}</i>\nChapters translated: ${job.completedChapters}/${job.totalChapters}\nTotal Words: ${job.translatedWords.toLocaleString()} words.\nYou can now download the complete EPUB!`
          ).catch(() => {});
        }
        break;
      }

      chapter.status = 'translating';
      job.updatedAt = Date.now();
      this.saveJobsToDisk();

      let translated = '';
      let usedGoogleFallback = false;
      let chapterError = '';

      // Check available keys
      if (job.apiKeys.length === 0) {
        if (process.env.GEMINI_API_KEY) {
          job.apiKeys = [process.env.GEMINI_API_KEY.trim()];
        } else {
          job.status = 'error';
          job.lastError = 'No Gemini API keys configured. Please add an API key.';
          this.runningJobIds.delete(jobId);
          this.saveJobsToDisk();
          break;
        }
      }

      // Try translating with Gemini key rotation
      let keyAttempts = 0;
      const maxKeyAttempts = Math.max(job.apiKeys.length, 1);
      let success = false;

      while (keyAttempts < maxKeyAttempts && this.runningJobIds.has(jobId)) {
        const currentKey = job.apiKeys[job.activeKeyIndex % job.apiKeys.length];

        try {
          translated = await translateChapterWithGemini(chapter.originalText, currentKey, {
            model: job.model,
            sourceLang: job.sourceLang,
            targetLang: job.targetLang,
            glossary: job.glossary,
          });
          success = true;
          break;
        } catch (err: any) {
          if (err instanceof SafetyBlockError) {
            // SENSITIVE CHAPTER REFUSAL:
            // Explicit requirement:
            // "i want to use gemini but when gemini cant translate the chapter bc of eg. sensitive chapter ..i want that chapter to be translated by google translate instead but ONLY the sensitive chapters NOT the rest or the normal chapters...i dont want google translate accedntally translating normal chapters"
            console.warn(`[Job ${job.id}] Chapter ${chapter.index} blocked by Gemini Safety filter. Invoking Google Translate fallback for this chapter ONLY.`);
            usedGoogleFallback = true;
            try {
              translated = await translateWithGoogleTranslate(chapter.originalText, job.targetLang);
              success = true;
              break;
            } catch (gtErr: any) {
              chapterError = `Safety block on Gemini, and Google Translate fallback failed: ${gtErr?.message || gtErr}`;
              break;
            }
          } else if (err instanceof RateLimitError || err?.status === 429) {
            console.warn(`[Job ${job.id}] Key ${job.activeKeyIndex + 1}/${job.apiKeys.length} rate limited. Rotating to next key...`);
            job.activeKeyIndex = (job.activeKeyIndex + 1) % job.apiKeys.length;
            keyAttempts++;
            await new Promise(r => setTimeout(r, 1000));
          } else {
            // General error (network / temporary): retry with next key
            console.warn(`[Job ${job.id}] Gemini error on key ${job.activeKeyIndex + 1}: ${err?.message || err}. Rotating key...`);
            job.activeKeyIndex = (job.activeKeyIndex + 1) % job.apiKeys.length;
            keyAttempts++;
            await new Promise(r => setTimeout(r, 1500));
          }
        }
      }

      if (success && translated) {
        chapter.translatedText = translated;
        chapter.translatedWordCount = countWords(translated);
        chapter.completedAt = Date.now();

        if (usedGoogleFallback) {
          chapter.status = 'fallback_google';
          chapter.translatorUsed = 'google_translate';
          chapter.fallbackReason = 'Gemini Safety Filter / Content Policy refusal';
        } else {
          chapter.status = 'completed';
          chapter.translatorUsed = 'gemini';
        }

        job.completedChapters = job.chapters.filter(
          c => c.status === 'completed' || c.status === 'fallback_google'
        ).length;
        job.translatedWords = job.chapters.reduce(
          (sum, c) => sum + (c.translatedWordCount || 0),
          0
        );
        job.updatedAt = Date.now();
        this.saveJobsToDisk();

        // 20k milestone notification if configured
        if (!notified20k && job.translatedWords >= 20000) {
          notified20k = true;
          if (job.telegramConfig?.enabled && job.telegramConfig.botToken) {
            sendTelegramNotification(
              job.telegramConfig.botToken,
              job.telegramConfig.chatId,
              `📖 <b>Milestone: 20k Words Ready!</b>\nNovel: <i>${job.title}</i>\n${job.completedChapters} chapters are ready to download as EPUB while the rest continues translating!`
            ).catch(() => {});
          }
        }

        // Polite delay between chapters (300ms)
        await new Promise(r => setTimeout(r, 300));
      } else {
        // Mark chapter failed so translation loop doesn't infinite loop on it
        chapter.status = 'failed';
        chapter.error = chapterError || 'Translation failed across all available keys';
        job.lastError = `Chapter ${chapter.index} failed: ${chapter.error}`;
        job.updatedAt = Date.now();
        this.saveJobsToDisk();

        // Wait 2 seconds before moving to next chapter
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  public async generateEpub(jobId: string, onlyCompleted: boolean = true): Promise<Buffer | null> {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    return await generateEpubBuffer(job, { onlyCompleted });
  }

  public generateTxt(jobId: string, onlyCompleted: boolean = true): string | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    let chapters = job.chapters;
    if (onlyCompleted) {
      chapters = chapters.filter(c => c.status === 'completed' || c.status === 'fallback_google');
    }

    // Strict numerical sort
    chapters = [...chapters].sort((a, b) => a.index - b.index);

    const parts: string[] = [job.title, `Translated with MegaTXT Lite\n\n`];
    for (const ch of chapters) {
      parts.push(`=== ${ch.title} ===\n\n${ch.translatedText || ch.originalText || ''}\n\n`);
    }

    return parts.join('\n');
  }
}

export const jobManager = new JobManager();
