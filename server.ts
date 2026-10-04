import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { splitTextIntoChapters, countWords } from './server/services/textSplitter.js';
import { jobManager } from './server/services/jobManager.js';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Enable large text uploads up to 50MB (novels can be large .txt files)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Compress responses for mobile data saving if client supports gzip/deflate
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

// 1. Text Parsing & Chapter Detection API
app.post('/api/parse-text', (req: Request, res: Response) => {
  try {
    const { text, title } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Text content is required' });
      return;
    }

    const chapters = splitTextIntoChapters(text, title || 'Uploaded Novel');
    const totalWords = chapters.reduce((acc, c) => acc + c.originalWordCount, 0);

    // Return chapter summaries without repeating the full text to save bandwidth
    const summaries = chapters.map(c => ({
      index: c.index,
      title: c.title,
      wordCount: c.originalWordCount,
      preview: c.originalText.slice(0, 150).replace(/\n+/g, ' ') + '...',
    }));

    res.json({
      success: true,
      totalChapters: chapters.length,
      totalWords,
      chapters: summaries,
      rawChapters: chapters,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to parse text' });
  }
});

// 2. Create and Start Translation Job
app.post('/api/jobs', (req: Request, res: Response) => {
  try {
    const {
      title,
      chapters,
      sourceLang,
      targetLang,
      model,
      apiKeys,
      glossary,
      telegramConfig,
      autoStart,
    } = req.body;

    if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
      res.status(400).json({ error: 'At least one chapter is required' });
      return;
    }

    const job = jobManager.createJob({
      title: title || 'Untitled Novel',
      chapters,
      sourceLang: sourceLang || 'auto',
      targetLang: targetLang || 'en',
      model: model || 'gemini-3.8-flash',
      apiKeys: Array.isArray(apiKeys) ? apiKeys : [],
      glossary: glossary || {},
      telegramConfig,
    });

    if (autoStart !== false) {
      jobManager.startJob(job.id);
    }

    const summary = jobManager.getJobStatusSummary(job.id);
    res.json({ success: true, job: summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create job' });
  }
});

// 3. List all jobs summary (Data-saving lightweight list)
app.get('/api/jobs', (req: Request, res: Response) => {
  try {
    const jobs = jobManager.getAllJobs();
    const summaries = jobs.map(j => jobManager.getJobStatusSummary(j.id));
    res.json({ success: true, jobs: summaries });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get jobs' });
  }
});

// 4. Ultra lightweight single job status (~200 bytes)
app.get('/api/jobs/:id/status', (req: Request, res: Response) => {
  try {
    const summary = jobManager.getJobStatusSummary(req.params.id);
    if (!summary) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json({ success: true, status: summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get status' });
  }
});

// 5. Job details (chapter index & status only, no full text, data saving)
app.get('/api/jobs/:id/details', (req: Request, res: Response) => {
  try {
    const job = jobManager.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const chapterList = job.chapters.map(c => ({
      index: c.index,
      title: c.title,
      status: c.status,
      translatorUsed: c.translatorUsed,
      originalWordCount: c.originalWordCount,
      translatedWordCount: c.translatedWordCount,
      fallbackReason: c.fallbackReason,
      error: c.error,
    }));

    res.json({
      success: true,
      job: {
        id: job.id,
        title: job.title,
        status: job.status,
        sourceLang: job.sourceLang,
        targetLang: job.targetLang,
        model: job.model,
        totalChapters: job.totalChapters,
        completedChapters: job.completedChapters,
        totalOriginalWords: job.totalOriginalWords,
        translatedWords: job.translatedWords,
        activeKeyIndex: job.activeKeyIndex,
        totalKeys: job.apiKeys.length,
        hasEnvKey: !!process.env.GEMINI_API_KEY,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        chapters: chapterList,
        glossary: job.glossary,
        telegramConfig: job.telegramConfig,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get job details' });
  }
});

// 6. Single chapter text (lazy loaded on demand for reader)
app.get('/api/jobs/:id/chapter/:index', (req: Request, res: Response) => {
  try {
    const job = jobManager.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const index = parseInt(req.params.index, 10);
    const chapter = job.chapters.find(c => c.index === index);
    if (!chapter) {
      res.status(404).json({ error: 'Chapter not found' });
      return;
    }

    res.json({ success: true, chapter });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load chapter' });
  }
});

// 7. Start / Resume Job
app.post('/api/jobs/:id/start', (req: Request, res: Response) => {
  try {
    const ok = jobManager.startJob(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    const summary = jobManager.getJobStatusSummary(req.params.id);
    res.json({ success: true, status: summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to start job' });
  }
});

// 8. Pause Job
app.post('/api/jobs/:id/pause', (req: Request, res: Response) => {
  try {
    const ok = jobManager.pauseJob(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    const summary = jobManager.getJobStatusSummary(req.params.id);
    res.json({ success: true, status: summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to pause job' });
  }
});

// 9. Delete Job
app.delete('/api/jobs/:id', (req: Request, res: Response) => {
  try {
    const ok = jobManager.deleteJob(req.params.id);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete job' });
  }
});

// 10. Update API Keys for Job
app.post('/api/jobs/:id/keys', (req: Request, res: Response) => {
  try {
    const { keys } = req.body;
    if (!Array.isArray(keys)) {
      res.status(400).json({ error: 'Keys array required' });
      return;
    }
    const ok = jobManager.updateJobKeys(req.params.id, keys);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update keys' });
  }
});

// 11. Live EPUB Download (Does NOT interrupt translation!)
app.get('/api/jobs/:id/download/epub', async (req: Request, res: Response) => {
  try {
    const partial = req.query.partial !== 'false';
    const job = jobManager.getJob(req.params.id);
    if (!job) {
      res.status(404).send('Job not found');
      return;
    }

    const epubBuffer = await jobManager.generateEpub(job.id, partial);
    if (!epubBuffer) {
      res.status(500).send('Failed to generate EPUB');
      return;
    }

    const sanitizedTitle = (job.title || 'novel').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
    const suffix = partial ? `_part_${job.completedChapters}ch` : '_full';
    const filename = `${sanitizedTitle}${suffix}.epub`;

    res.setHeader('Content-Type', 'application/epub+zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', epubBuffer.length);
    res.end(epubBuffer);
  } catch (err: any) {
    res.status(500).send('Error generating EPUB: ' + (err?.message || err));
  }
});

// 12. TXT Download
app.get('/api/jobs/:id/download/txt', (req: Request, res: Response) => {
  try {
    const partial = req.query.partial !== 'false';
    const job = jobManager.getJob(req.params.id);
    if (!job) {
      res.status(404).send('Job not found');
      return;
    }

    const txtContent = jobManager.generateTxt(job.id, partial);
    if (!txtContent) {
      res.status(500).send('Failed to export TXT');
      return;
    }

    const sanitizedTitle = (job.title || 'novel').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
    const suffix = partial ? `_part_${job.completedChapters}ch` : '_full';
    const filename = `${sanitizedTitle}${suffix}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(txtContent);
  } catch (err: any) {
    res.status(500).send('Error generating TXT: ' + (err?.message || err));
  }
});

// 13. Test API Keys Connectivity
app.post('/api/test-keys', async (req: Request, res: Response) => {
  try {
    const { keys } = req.body;
    if (!Array.isArray(keys)) {
      res.status(400).json({ error: 'keys must be an array' });
      return;
    }

    const results = await Promise.all(
      keys.map(async (key: string, idx: number) => {
        const cleanKey = (key || '').trim();
        if (!cleanKey) return { index: idx, status: 'empty', message: 'Empty key' };

        try {
          const ai = new GoogleGenAI({
            apiKey: cleanKey,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
          });
          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: 'ping',
            config: { maxOutputTokens: 5 },
          });
          return {
            index: idx,
            status: 'valid',
            prefix: cleanKey.slice(0, 4) + '...' + cleanKey.slice(-4),
            message: 'Active & responding',
          };
        } catch (err: any) {
          const msg = err?.message || String(err);
          const is429 = /quota|429|resource_exhausted/i.test(msg);
          return {
            index: idx,
            status: is429 ? 'rate_limited' : 'invalid',
            prefix: cleanKey.slice(0, 4) + '...' + cleanKey.slice(-4),
            message: msg.slice(0, 100),
          };
        }
      })
    );

    res.json({ success: true, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Key test failed' });
  }
});

// Setup Vite middleware for development or static serving for production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(process.cwd(), 'dist/index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MegaTXT Lite server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
