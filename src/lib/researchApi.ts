import {
  FollowupApiResponse,
  ItemCategory,
  ResearchApiResponse,
  ResearchFollowup,
} from '../types/research';

export async function runBackgroundResearch(params: {
  title: string;
  userPrompt: string;
  category: ItemCategory | 'auto';
  locationContext: string;
}): Promise<ResearchApiResponse> {
  const response = await fetch('/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = (await response.json()) as ResearchApiResponse & { error?: string };
  if (!response.ok) {
    throw new Error(data?.error || `Research request failed (${response.status})`);
  }
  return data;
}

export async function runFollowupResearch(params: {
  title: string;
  category: ItemCategory;
  locationContext: string;
  summary: string;
  keyFindings: string[];
  personalNotes: string;
  question: string;
  previousFollowups: Pick<ResearchFollowup, 'question' | 'answer'>[];
}): Promise<FollowupApiResponse> {
  const response = await fetch('/api/research/followup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = (await response.json()) as FollowupApiResponse & { error?: string };
  if (!response.ok) {
    throw new Error(data?.error || `Follow-up request failed (${response.status})`);
  }
  return data;
}
