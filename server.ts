import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface SourceItem {
  title: string;
  uri: string;
}

interface ComparisonRowItem {
  label: string;
  values: string[];
}

interface StructuredResearch {
  detectedCategory: 'comparison' | 'shopping' | 'reading' | 'finance' | 'general';
  summary: string;
  keyFindings: string[];
  comparisonColumns: string[];
  comparisonRows: ComparisonRowItem[];
  actionSteps: string[];
}

function extractSourcesFromResponse(response: unknown): SourceItem[] {
  const resp = response as {
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{
          web?: { uri?: string; title?: string };
        }>;
      };
    }>;
  };
  const chunks = resp?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: SourceItem[] = [];
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri?.trim();
    if (!uri || (!uri.startsWith('http://') && !uri.startsWith('https://'))) continue;
    if (seen.has(uri)) continue;
    seen.add(uri);
    sources.push({
      title: (chunk?.web?.title?.trim() || uri).slice(0, 200),
      uri: uri.slice(0, 1000),
    });
    if (sources.length >= 12) break;
  }
  return sources;
}

function tryParseJsonObject(rawText: string): StructuredResearch | null {
  const trimmed = rawText.trim();
  const candidates: string[] = [trimmed];

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<StructuredResearch>;
      if (parsed && typeof parsed.summary === 'string' && parsed.summary.trim().length > 0) {
        return normalizeStructuredResearch(parsed);
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}

function normalizeCategory(
  val: unknown
): 'comparison' | 'shopping' | 'reading' | 'finance' | 'general' {
  const valid = ['comparison', 'shopping', 'reading', 'finance', 'general'] as const;
  if (typeof val === 'string' && (valid as readonly string[]).includes(val)) {
    return val as 'comparison' | 'shopping' | 'reading' | 'finance' | 'general';
  }
  return 'general';
}

function normalizeStructuredResearch(parsed: Partial<StructuredResearch>): StructuredResearch {
  const cols = Array.isArray(parsed.comparisonColumns)
    ? parsed.comparisonColumns.map((c) => String(c ?? '').trim().slice(0, 80)).filter(Boolean).slice(0, 6)
    : [];
  const valCount = Math.max(cols.length - 1, 0);
  const rows =
    cols.length >= 2 && Array.isArray(parsed.comparisonRows)
      ? parsed.comparisonRows
          .filter((r) => r && typeof r.label === 'string' && Array.isArray(r.values))
          .slice(0, 15)
          .map((r) => ({
            label: String(r.label).trim().slice(0, 120),
            values: Array.from({ length: valCount }, (_, idx) =>
              String(r.values[idx] ?? '—').trim().slice(0, 200)
            ),
          }))
      : [];

  return {
    detectedCategory: normalizeCategory(parsed.detectedCategory),
    summary: String(parsed.summary ?? '').trim().slice(0, 4000),
    keyFindings: Array.isArray(parsed.keyFindings)
      ? parsed.keyFindings.map((f) => String(f ?? '').trim().slice(0, 500)).filter(Boolean).slice(0, 12)
      : [],
    comparisonColumns: cols,
    comparisonRows: rows,
    actionSteps: Array.isArray(parsed.actionSteps)
      ? parsed.actionSteps.map((s) => String(s ?? '').trim().slice(0, 300)).filter(Boolean).slice(0, 10)
      : [],
  };
}

const RESEARCH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    detectedCategory: {
      type: Type.STRING,
      description: 'One of comparison, shopping, reading, finance, general',
    },
    summary: {
      type: Type.STRING,
      description: '2-4 sentence executive summary.',
    },
    keyFindings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    comparisonColumns: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    comparisonRows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          values: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['label', 'values'],
      },
    },
    actionSteps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    'detectedCategory',
    'summary',
    'keyFindings',
    'comparisonColumns',
    'comparisonRows',
    'actionSteps',
  ],
};

function isQuotaError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
}

function parseGeminiError(error: unknown): { statusCode: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  if (isQuotaError(error)) {
    return {
      statusCode: 429,
      message:
        'Gemini API quota reached (429). Please wait a moment and click Retry, or select a billing-enabled API key in Settings > Secrets to increase your quota.',
    };
  }
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return {
      statusCode: 403,
      message:
        'Gemini API key was rejected (403). Please check your API key in Settings > Secrets.',
    };
  }
  if (raw.includes('404') || raw.includes('NOT_FOUND')) {
    return {
      statusCode: 404,
      message: 'The configured Gemini model could not be found.',
    };
  }
  return {
    statusCode: 500,
    message: raw.length > 260 ? `${raw.slice(0, 260)}…` : raw || 'Research request failed.',
  };
}

async function withTransientRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const isTransient =
        !isQuotaError(error) &&
        (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('DEADLINE_EXCEEDED'));
      if (!isTransient || attempt === retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
    }
  }
  throw lastError;
}

const app = express();
app.use(express.json({ limit: '1mb' }));

app.post('/api/research', async (req: Request, res: Response) => {
  try {
    const { title, userPrompt, category, locationContext } = req.body as {
      title?: string;
      userPrompt?: string;
      category?: string;
      locationContext?: string;
    };

    if (!title || typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ error: 'A topic or task title is required.' });
      return;
    }

    const ai = getGeminiClient();
    const safeTitle = title.trim().slice(0, 240);
    const safePrompt = typeof userPrompt === 'string' ? userPrompt.trim().slice(0, 1200) : '';
    const safeLocation = typeof locationContext === 'string' ? locationContext.trim().slice(0, 120) : '';
    const requestedCategory = typeof category === 'string' ? category : 'auto';
    const todayDate = new Date().toISOString().slice(0, 10);

    const systemInstruction = [
      `You are Fieldnote's research analyst. Today's date is ${todayDate}.`,
      `Prepare a concise, decision-ready background brief for a personal note or to-do item.`,
      `Adapt your research depth to the topic:`,
      `- Product/Service Comparisons (e.g. iCloud vs Google Photos): compare exact pricing tiers, storage limits, ecosystem lock-in, sharing, and recommend who wins for which scenario.`,
      `- Books & Media: note public library availability paths (OverDrive/Libby/Hoopla and physical library systems for the user's location if provided), plus typical ebook, physical paperback/hardcover/used, and audiobook options/costs.`,
      `- Local Vehicles or Local Shopping: cover MSRP/market price range, local inventory/listing channels near the user's location if provided, key trim/reliability considerations, and where to look.`,
      `- Finance, Student Loans, & Money Markets: cover federal repayment programs, 7-day SEC yield ranges, expense ratios, federal vs state tax exemptions (e.g. Treasury MMFs vs Municipal MMFs), and switching trade-offs.`,
      `- General Tasks: synthesize practical facts, costs, timelines, and step-by-step preparation.`,
      `Return ONLY valid JSON (no markdown commentary outside the JSON) matching this exact schema:`,
      `{`,
      `  "detectedCategory": "comparison" | "shopping" | "reading" | "finance" | "general",`,
      `  "summary": "2-4 crisp sentences directly summarizing the answer and practical recommendation.",`,
      `  "keyFindings": ["Up to 8 concrete bullet points with prices, yields, or availability details."],`,
      `  "comparisonColumns": ["Criterion or Format", "Option A", "Option B"] (include whenever comparing 2+ options, book formats, loan plans, or funds; otherwise empty array []),`,
      `  "comparisonRows": [{"label": "Row label", "values": ["Value A", "Value B"]}] (each values array length MUST equal comparisonColumns.length - 1; empty array [] if no comparisonColumns),`,
      `  "actionSteps": ["3 to 5 specific, actionable next steps the user can check off."]`,
      `}`,
    ].join('\n');

    const promptParts = [
      `Topic / To-Do: ${safeTitle}`,
      safePrompt ? `Additional details from user: ${safePrompt}` : null,
      requestedCategory && requestedCategory !== 'auto'
        ? `User-selected category: ${requestedCategory}`
        : `Classify into the best category from: comparison, shopping, reading, finance, general.`,
      safeLocation
        ? `User's location for local library / local inventory / state tax context: ${safeLocation}`
        : `No specific city/state was provided; note national options or mention checking local availability where relevant.`,
    ]
      .filter(Boolean)
      .join('\n');

    let rawText = '';
    let sources: SourceItem[] = [];
    let structured: StructuredResearch | null = null;

    try {
      const groundedResponse = await withTransientRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: promptParts,
          config: {
            systemInstruction,
            tools: [{ googleSearch: {} }],
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          },
        })
      );
      sources = extractSourcesFromResponse(groundedResponse);
      rawText = groundedResponse.text ?? '';
      structured = tryParseJsonObject(rawText);
    } catch (primaryError) {
      if (!isQuotaError(primaryError)) {
        throw primaryError;
      }
      // Fallback to gemini-3.1-flash-lite without Google Search if search/primary quota is reached
      const fallbackResponse = await withTransientRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: promptParts,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            responseMimeType: 'application/json',
            responseSchema: RESEARCH_RESPONSE_SCHEMA,
          },
        })
      );
      rawText = fallbackResponse.text ?? '';
      structured = tryParseJsonObject(rawText);
      if (structured && structured.summary) {
        structured.summary = `${structured.summary} (Live web search quota was reached; verify live prices and local availability before deciding.)`;
      }
    }

    if (!structured && rawText.trim()) {
      const extractionResponse = await withTransientRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: `Convert the following research notes into the required JSON structure.\n\nResearch Notes:\n${rawText}`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            responseMimeType: 'application/json',
            responseSchema: RESEARCH_RESPONSE_SCHEMA,
          },
        })
      );

      structured = tryParseJsonObject(extractionResponse.text ?? '');
    }

    if (!structured) {
      structured = {
        detectedCategory: normalizeCategory(requestedCategory),
        summary: rawText.trim().slice(0, 3500) || 'Research completed, but structured parsing was unavailable.',
        keyFindings: [],
        comparisonColumns: [],
        comparisonRows: [],
        actionSteps: [],
      };
    }

    const finalCategory =
      requestedCategory && requestedCategory !== 'auto' && requestedCategory !== 'general'
        ? normalizeCategory(requestedCategory)
        : structured.detectedCategory;

    res.json({
      detectedCategory: finalCategory,
      summary: structured.summary,
      keyFindings: structured.keyFindings,
      comparisonColumns: structured.comparisonColumns,
      comparisonRows: structured.comparisonRows,
      actionSteps: structured.actionSteps,
      sources,
      locationUsed: safeLocation,
    });
  } catch (error) {
    const parsed = parseGeminiError(error);
    if (parsed.statusCode === 429 || parsed.statusCode === 403) {
      console.warn(`Research API notice (${parsed.statusCode}): ${parsed.message}`);
    } else {
      console.error('Research API failure:', parsed.message);
    }
    res.status(parsed.statusCode).json({ error: parsed.message });
  }
});

app.post('/api/research/followup', async (req: Request, res: Response) => {
  try {
    const {
      title,
      category,
      locationContext,
      summary,
      keyFindings,
      personalNotes,
      question,
      previousFollowups,
    } = req.body as {
      title?: string;
      category?: string;
      locationContext?: string;
      summary?: string;
      keyFindings?: string[];
      personalNotes?: string;
      question?: string;
      previousFollowups?: Array<{ question: string; answer: string }>;
    };

    if (!title || !question || typeof question !== 'string' || !question.trim()) {
      res.status(400).json({ error: 'A follow-up question is required.' });
      return;
    }

    const ai = getGeminiClient();
    const todayDate = new Date().toISOString().slice(0, 10);

    const contextBlock = [
      `Today's date: ${todayDate}`,
      `Item Title: ${String(title).slice(0, 240)}`,
      category ? `Category: ${category}` : null,
      locationContext ? `User Location Context: ${locationContext}` : null,
      summary ? `Existing Research Summary: ${String(summary).slice(0, 2500)}` : null,
      Array.isArray(keyFindings) && keyFindings.length > 0
        ? `Key Findings:\n- ${keyFindings.slice(0, 8).join('\n- ')}`
        : null,
      personalNotes ? `User's Own Notes: ${String(personalNotes).slice(0, 1500)}` : null,
      Array.isArray(previousFollowups) && previousFollowups.length > 0
        ? `Previous Follow-up Q&A:\n${previousFollowups
            .slice(-3)
            .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
            .join('\n\n')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    const promptText = `${contextBlock}\n\nFollow-up Question: ${question.trim().slice(0, 1000)}`;
    const followupInstruction =
      'You are a sharp, practical research assistant. Use Google Search when needed to verify current prices, local availability, rules, or rates. Answer in clear, direct prose or short bullet points without fluff.';

    let answer = '';
    let sources: SourceItem[] = [];

    try {
      const response = await withTransientRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: promptText,
          config: {
            systemInstruction: followupInstruction,
            tools: [{ googleSearch: {} }],
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        })
      );
      answer = (response.text ?? '').trim().slice(0, 8000);
      sources = extractSourcesFromResponse(response).slice(0, 10);
    } catch (primaryError) {
      if (!isQuotaError(primaryError)) {
        throw primaryError;
      }
      const fallbackResponse = await withTransientRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: promptText,
          config: {
            systemInstruction:
              'You are a sharp, practical research assistant. Answer clearly and concisely without fluff, and note if live verification is recommended.',
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
        })
      );
      answer = (fallbackResponse.text ?? '').trim().slice(0, 8000);
    }

    res.json({
      answer: answer || 'Unable to generate a follow-up answer right now.',
      sources,
    });
  } catch (error) {
    const parsed = parseGeminiError(error);
    if (parsed.statusCode === 429 || parsed.statusCode === 403) {
      console.warn(`Follow-up API notice (${parsed.statusCode}): ${parsed.message}`);
    } else {
      console.error('Follow-up API failure:', parsed.message);
    }
    res.status(parsed.statusCode).json({ error: parsed.message });
  }
});

async function startServer() {
  if (isProduction) {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
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
    console.log(`Fieldnote server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
