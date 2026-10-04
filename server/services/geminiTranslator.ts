import { GoogleGenAI } from '@google/genai';

export class SafetyBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafetyBlockError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export interface TranslationOptions {
  model?: string;
  sourceLang?: string;
  targetLang?: string;
  glossary?: Record<string, string>;
}

export function sanitizeApiKey(key: string): string {
  if (!key) return '';
  return key.trim();
}

export async function translateChapterWithGemini(
  text: string,
  apiKey: string,
  options: TranslationOptions = {}
): Promise<string> {
  const cleanKey = sanitizeApiKey(apiKey);
  if (!cleanKey) {
    throw new Error('No API key provided');
  }

  const model = options.model || 'gemini-3.8-flash';
  const targetLang = options.targetLang || 'English';
  const sourceLang = options.sourceLang || 'the original novel language';

  const ai = new GoogleGenAI({
    apiKey: cleanKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Prepare glossary hints if available
  let glossaryPrompt = '';
  if (options.glossary && Object.keys(options.glossary).length > 0) {
    const entries = Object.entries(options.glossary)
      .map(([k, v]) => `- "${k}" -> "${v}"`)
      .join('\n');
    glossaryPrompt = `\nEnsure strict adherence to these specific novel terms and character names:\n${entries}\n`;
  }

  const systemInstruction = `You are a master professional literary translator specializing in web novels, light novels, and literary fiction.
Translate the provided chapter from ${sourceLang} into natural, immersive, and fluent ${targetLang}.
Preserve paragraph breaks, dialogue nuances, emotional tone, and literary atmosphere.
DO NOT summarize or skip paragraphs. Output ONLY the translated story text without any conversational preamble or sign-off commentary.${glossaryPrompt}`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: text,
      config: {
        systemInstruction,
        temperature: 0.3,
      },
    });

    // Check for safety finish reason
    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;

    if (finishReason && ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(finishReason.toString())) {
      throw new SafetyBlockError(`Gemini safety filter triggered with finishReason: ${finishReason}`);
    }

    const output = response.text;
    if (!output || output.trim().length === 0) {
      if (candidate?.finishReason) {
        throw new SafetyBlockError(`Gemini returned empty text with finishReason: ${candidate.finishReason}`);
      }
      throw new Error('Gemini returned an empty translation response');
    }

    return output.trim();
  } catch (err: any) {
    const errMsg = err?.message || String(err);

    // Detect safety block in error message
    if (
      err instanceof SafetyBlockError ||
      /safety|blocked|harm_category|policy|sensitive/i.test(errMsg)
    ) {
      throw new SafetyBlockError(errMsg);
    }

    // Detect rate limit / quota exhaustion
    if (
      err?.status === 429 ||
      /429|quota|rate limit|resource_exhausted/i.test(errMsg)
    ) {
      throw new RateLimitError(errMsg);
    }

    throw err;
  }
}
