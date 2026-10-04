import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { jobManager } from './server/services/jobManager.js';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Enable large text uploads up to 50MB for raw novels
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Default cache control
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

/**
 * 1. Upload & Prepare Novel API
 * Requirement 5: NEVER return rawChapters or full novel text back to the browser!
 */
app.post('/api/parse-text', (req: Request, res: Response) => {
  try {
    const { text, title, targetChunkChars } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Novel text content is required' });
      return;
    }

    const prepared = jobManager.prepareNovel(
      text,
      title || 'Uploaded Novel',
      targetChunkChars ? parseInt(targetChunkChars, 10) : 2500
    );

    res.json({
      success: true,
      prepareId: prepared.prepareId,
      title: prepared.title,
      totalChapters: prepared.totalChapters,
      totalOriginalWords: prepared.totalOriginalWords,
      chapters: prepared.chapters, // Lightweight headers only!
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to prepare novel' });
  }
});

/**
 * 2. Create Translation Job API
 * Takes prepareId, persists directly to Firestore, begins cloud translation.
 */
app.post('/api/jobs', async (req: Request, res: Response) => {
  try {
    const {
      prepareId,
      title,
      sourceLang,
      targetLang,
      model,
      apiKeys,
      glossary,
      targetChunkChars,
      telegramConfig,
      autoStart,
    } = req.body;

    if (!prepareId) {
      res.status(400).json({ error: 'prepareId is required' });
      return;
    }

    const job = await jobManager.createJob({
      prepareId,
      title,
      sourceLang: sourceLang || 'Chinese',
      targetLang: targetLang || 'English',
      model: model || 'gemini-3.8-flash',
      apiKeys: Array.isArray(apiKeys) ? apiKeys : [],
      glossary: glossary || {},
      targetChunkChars: targetChunkChars ? parseInt(targetChunkChars, 10) : 2500,
      telegramConfig,
      autoStart: autoStart !== false,
    });

    const summary = jobManager.getJobStatusSummary(job.id);
    res.json({ success: true, job: summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create translation job' });
  }
});

/**
 * 3. List all jobs summary (Data-saving lightweight list)
 */
app.get('/api/jobs', async (req: Request, res: Response) => {
  try {
    const jobs = await jobManager.getAllJobs();
    const summaries = jobs.map(j => jobManager.getJobStatusSummary(j.id)).filter(Boolean);
    res.json({ success: true, jobs: summaries });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get jobs' });
  }
});

/**
 * 4. Lightweight status endpoint (~250-400 bytes)
 * Supports ETag / 304 Not Modified for maximum mobile data saving!
 * Also handles GET /api/cloud-job/status?jobId=...&summary=true
 */
const handleStatusRequest = (req: Request, res: Response) => {
  try {
    const jobId = (req.params.id || req.query.jobId) as string;
    if (!jobId) {
      res.status(400).json({ error: 'jobId is required' });
      return;
    }

    const summary = jobManager.getJobStatusSummary(jobId);
    if (!summary) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    // ETag caching for zero mobile data consumption on unchanged status
    const etag = `W/"${summary.id}-${summary.updatedAt}-${summary.completedChunks}"`;
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    res.setHeader('ETag', etag);
    res.json({ success: true, status: summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get status' });
  }
};

app.get('/api/jobs/:id/status', handleStatusRequest);
app.get('/api/cloud-job/status', handleStatusRequest);

/**
 * 5. Job chapter list details (metadata headers only, NO full text)
 */
app.get('/api/jobs/:id/details', async (req: Request, res: Response) => {
  try {
    const job = await jobManager.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const chapterHeaders = await jobManager.getChapterHeaders(req.params.id);

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
        contiguousCompletedChapters: job.contiguousCompletedChapters,
        totalChunks: job.totalChunks,
        completedChunks: job.completedChunks,
        totalOriginalWords: job.totalOriginalWords,
        translatedWords: job.translatedWords,
        activeKeyIndex: job.activeKeyIndex,
        totalKeys: job.apiKeys.length,
        hasEnvKey: !!process.env.GEMINI_API_KEY,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        chapters: chapterHeaders,
        glossary: job.glossary,
        telegramConfig: job.telegramConfig,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get job details' });
  }
});

/**
 * 6. Lazy-loaded Reader Chapter (Returns text for ONE chapter only)
 * Also handles GET /api/cloud-job/chapter/{chapterIndex}?jobId=...
 */
const handleChapterRequest = async (req: Request, res: Response) => {
  try {
    const jobId = (req.params.id || req.query.jobId) as string;
    const index = parseInt(req.params.index, 10);

    if (!jobId || isNaN(index)) {
      res.status(400).json({ error: 'jobId and chapter index are required' });
      return;
    }

    const chapter = await jobManager.getMergedChapter(jobId, index);
    if (!chapter) {
      res.status(404).json({ error: `Chapter ${index} not found` });
      return;
    }

    res.json({ success: true, chapter });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load chapter' });
  }
};

app.get('/api/jobs/:id/chapter/:index', handleChapterRequest);
app.get('/api/cloud-job/chapter/:index', handleChapterRequest);

/**
 * 7. Start / Resume Job API
 */
app.post('/api/jobs/:id/start', async (req: Request, res: Response) => {
  try {
    const ok = await jobManager.startJob(req.params.id);
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

/**
 * 8. Pause Job API
 */
app.post('/api/jobs/:id/pause', async (req: Request, res: Response) => {
  try {
    const ok = await jobManager.pauseJob(req.params.id);
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

/**
 * 9. Delete Job API
 */
app.delete('/api/jobs/:id', async (req: Request, res: Response) => {
  try {
    const ok = await jobManager.deleteJob(req.params.id);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete job' });
  }
});

/**
 * 10. Update API Keys for Job
 */
app.post('/api/jobs/:id/keys', async (req: Request, res: Response) => {
  try {
    const { keys } = req.body;
    if (!Array.isArray(keys)) {
      res.status(400).json({ error: 'Keys array required' });
      return;
    }
    const ok = await jobManager.updateJobKeys(req.params.id, keys);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update keys' });
  }
});

/**
 * 11. Live EPUB Download (Contiguous Never-Skip output, does NOT stop background translation)
 */
app.get('/api/jobs/:id/download/epub', async (req: Request, res: Response) => {
  try {
    const partial = req.query.partial !== 'false';
    const job = await jobManager.getJob(req.params.id);
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
    const suffix = partial
      ? `_ch1-${job.contiguousCompletedChapters || job.completedChapters}`
      : '_full';
    const filename = `${sanitizedTitle}${suffix}.epub`;

    res.setHeader('Content-Type', 'application/epub+zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', epubBuffer.length);
    res.end(epubBuffer);
  } catch (err: any) {
    res.status(500).send('Error generating EPUB: ' + (err?.message || err));
  }
});

/**
 * 12. TXT Download
 */
app.get('/api/jobs/:id/download/txt', async (req: Request, res: Response) => {
  try {
    const partial = req.query.partial !== 'false';
    const job = await jobManager.getJob(req.params.id);
    if (!job) {
      res.status(404).send('Job not found');
      return;
    }

    const txtContent = await jobManager.generateTxt(job.id, partial);
    if (!txtContent) {
      res.status(500).send('Failed to export TXT');
      return;
    }

    const sanitizedTitle = (job.title || 'novel').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
    const suffix = partial
      ? `_ch1-${job.contiguousCompletedChapters || job.completedChapters}`
      : '_full';
    const filename = `${sanitizedTitle}${suffix}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(txtContent);
  } catch (err: any) {
    res.status(500).send('Error generating TXT: ' + (err?.message || err));
  }
});

/**
 * 13. Test API Keys Connectivity (Zero prompt waste)
 */
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
          await ai.models.generateContent({
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

// Setup Vite middleware for dev or static serving for prod
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
