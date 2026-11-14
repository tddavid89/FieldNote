export type ItemCategory = 'comparison' | 'shopping' | 'reading' | 'finance' | 'general';

export type ResearchStatus = 'idle' | 'researching' | 'ready' | 'error';

export interface ComparisonRow {
  label: string;
  values: string[];
}

export interface ActionStep {
  id: string;
  text: string;
  done: boolean;
}

export interface SourceLink {
  title: string;
  uri: string;
}

export interface ResearchItem {
  id: string;
  userId: string;
  title: string;
  userPrompt: string;
  category: ItemCategory;
  completed: boolean;
  personalNotes: string;
  researchStatus: ResearchStatus;
  researchError: string;
  locationUsed: string;
  summary: string;
  keyFindings: string[];
  comparisonColumns: string[];
  comparisonRows: ComparisonRow[];
  actionSteps: ActionStep[];
  sources: SourceLink[];
  createdAtMs: number;
  updatedAtMs: number;
  researchedAtMs: number | null;
}

export interface ResearchFollowup {
  id: string;
  userId: string;
  itemId: string;
  question: string;
  answer: string;
  sources: SourceLink[];
  createdAtMs: number;
}

export interface UserProfile {
  uid: string;
  locationContext: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ResearchApiResponse {
  detectedCategory: ItemCategory;
  summary: string;
  keyFindings: string[];
  comparisonColumns: string[];
  comparisonRows: ComparisonRow[];
  actionSteps: string[];
  sources: SourceLink[];
  locationUsed: string;
}

export interface FollowupApiResponse {
  answer: string;
  sources: SourceLink[];
}

export const BLUEPRINT_LIMITS = {
  ID_MAX: 128,
  LOCATION_MAX: 120,
  TITLE_MAX: 240,
  PROMPT_MAX: 1200,
  NOTES_MAX: 15000,
  ERROR_MAX: 500,
  SUMMARY_MAX: 4000,
  FINDINGS_MAX_ITEMS: 12,
  FINDING_MAX_LEN: 500,
  COLUMNS_MAX_ITEMS: 6,
  COLUMN_MAX_LEN: 80,
  ROWS_MAX_ITEMS: 15,
  ROW_LABEL_MAX_LEN: 120,
  ROW_VAL_MAX_LEN: 200,
  STEPS_MAX_ITEMS: 10,
  STEP_TEXT_MAX_LEN: 300,
  SOURCES_MAX_ITEMS: 12,
  SOURCE_TITLE_MAX_LEN: 200,
  SOURCE_URI_MAX_LEN: 1000,
  FOLLOWUP_QUESTION_MAX: 1000,
  FOLLOWUP_ANSWER_MAX: 8000,
  FOLLOWUP_SOURCES_MAX: 10,
} as const;

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  comparison: 'Comparison',
  shopping: 'Shopping & Local',
  reading: 'Books & Media',
  finance: 'Finance & Loans',
  general: 'General',
};
