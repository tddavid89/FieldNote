import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  ActionStep,
  BLUEPRINT_LIMITS,
  ComparisonRow,
  ItemCategory,
  ResearchFollowup,
  ResearchItem,
  ResearchStatus,
  SourceLink,
  UserProfile,
} from '../types/research';

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const VALID_CATEGORIES: ItemCategory[] = ['comparison', 'shopping', 'reading', 'finance', 'general'];

function clampText(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

function clampRawText(value: string, maxLen: number): string {
  return value.slice(0, maxLen);
}

function sanitizeCategory(category: string): ItemCategory {
  return VALID_CATEGORIES.includes(category as ItemCategory)
    ? (category as ItemCategory)
    : 'general';
}

function sanitizeKeyFindings(list: string[]): string[] {
  return list
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .slice(0, BLUEPRINT_LIMITS.FINDINGS_MAX_ITEMS)
    .map((item) => clampText(item, BLUEPRINT_LIMITS.FINDING_MAX_LEN));
}

function sanitizeColumns(cols: string[]): string[] {
  return cols
    .filter((col) => typeof col === 'string' && col.trim().length > 0)
    .slice(0, BLUEPRINT_LIMITS.COLUMNS_MAX_ITEMS)
    .map((col) => clampText(col, BLUEPRINT_LIMITS.COLUMN_MAX_LEN));
}

function sanitizeRows(rows: ComparisonRow[], maxValuesCount: number): ComparisonRow[] {
  const cap = Math.min(Math.max(maxValuesCount, 0), BLUEPRINT_LIMITS.COLUMNS_MAX_ITEMS);
  return rows
    .filter((r) => r && typeof r.label === 'string' && Array.isArray(r.values))
    .slice(0, BLUEPRINT_LIMITS.ROWS_MAX_ITEMS)
    .map((r) => ({
      label: clampText(r.label, BLUEPRINT_LIMITS.ROW_LABEL_MAX_LEN) || 'Metric',
      values: r.values
        .slice(0, cap > 0 ? cap : BLUEPRINT_LIMITS.COLUMNS_MAX_ITEMS)
        .map((v) => clampText(String(v ?? ''), BLUEPRINT_LIMITS.ROW_VAL_MAX_LEN)),
    }));
}

function sanitizeActionSteps(steps: ActionStep[]): ActionStep[] {
  return steps
    .filter((s) => s && typeof s.text === 'string' && s.text.trim().length > 0)
    .slice(0, BLUEPRINT_LIMITS.STEPS_MAX_ITEMS)
    .map((s, idx) => ({
      id: clampText(s.id || `step_${idx + 1}`, 64).replace(/[^a-zA-Z0-9_-]/g, '_') || `step_${idx + 1}`,
      text: clampText(s.text, BLUEPRINT_LIMITS.STEP_TEXT_MAX_LEN),
      done: Boolean(s.done),
    }));
}

function sanitizeSources(sources: SourceLink[], maxItems: number): SourceLink[] {
  const seen = new Set<string>();
  const out: SourceLink[] = [];
  for (const src of sources) {
    if (!src || typeof src.uri !== 'string') continue;
    const uri = clampText(src.uri, BLUEPRINT_LIMITS.SOURCE_URI_MAX_LEN);
    if (!uri.startsWith('http://') && !uri.startsWith('https://')) continue;
    if (seen.has(uri)) continue;
    seen.add(uri);
    out.push({
      title: clampText(src.title || uri, BLUEPRINT_LIMITS.SOURCE_TITLE_MAX_LEN) || uri,
      uri,
    });
    if (out.length >= maxItems) break;
  }
  return out;
}

export function generateSafeId(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const raw = `${prefix}_${randomPart}`.slice(0, BLUEPRINT_LIMITS.ID_MAX);
  return VALID_ID_REGEX.test(raw) ? raw : `${prefix}_${Date.now()}`;
}

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (val && typeof (val as { toMillis?: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

export async function ensureUserProfile(uid: string): Promise<void> {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid,
        locationContext: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void,
  onError?: (err: Error) => void
): () => void {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const d = snap.data();
      onData({
        uid: String(d.uid ?? uid),
        locationContext: String(d.locationContext ?? ''),
        createdAtMs: toMillis(d.createdAt),
        updatedAtMs: toMillis(d.updatedAt),
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function updateUserLocation(uid: string, locationContext: string): Promise<void> {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  try {
    await updateDoc(ref, {
      locationContext: clampText(locationContext, BLUEPRINT_LIMITS.LOCATION_MAX),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeToResearchItems(
  uid: string,
  onData: (items: ResearchItem[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = `users/${uid}/items`;
  const q = query(collection(db, 'users', uid, 'items'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: ResearchItem[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          userId: String(data.userId ?? uid),
          title: String(data.title ?? ''),
          userPrompt: String(data.userPrompt ?? ''),
          category: sanitizeCategory(String(data.category ?? 'general')),
          completed: Boolean(data.completed),
          personalNotes: String(data.personalNotes ?? ''),
          researchStatus: (data.researchStatus as ResearchStatus) || 'idle',
          researchError: String(data.researchError ?? ''),
          locationUsed: String(data.locationUsed ?? ''),
          summary: String(data.summary ?? ''),
          keyFindings: Array.isArray(data.keyFindings) ? data.keyFindings.map(String) : [],
          comparisonColumns: Array.isArray(data.comparisonColumns)
            ? data.comparisonColumns.map(String)
            : [],
          comparisonRows: Array.isArray(data.comparisonRows)
            ? data.comparisonRows.map((row: { label?: unknown; values?: unknown[] }) => ({
                label: String(row?.label ?? ''),
                values: Array.isArray(row?.values) ? row.values.map(String) : [],
              }))
            : [],
          actionSteps: Array.isArray(data.actionSteps)
            ? data.actionSteps.map((s: { id?: unknown; text?: unknown; done?: unknown }, idx: number) => ({
                id: String(s?.id ?? `step_${idx + 1}`),
                text: String(s?.text ?? ''),
                done: Boolean(s?.done),
              }))
            : [],
          sources: Array.isArray(data.sources)
            ? data.sources.map((src: { title?: unknown; uri?: unknown }) => ({
                title: String(src?.title ?? ''),
                uri: String(src?.uri ?? ''),
              }))
            : [],
          createdAtMs: toMillis(data.createdAt),
          updatedAtMs: toMillis(data.updatedAt),
          researchedAtMs: data.researchedAt ? toMillis(data.researchedAt) : null,
        };
      });
      items.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function createResearchItem(
  uid: string,
  params: {
    title: string;
    userPrompt: string;
    category: ItemCategory;
    initialStatus: ResearchStatus;
    locationUsed?: string;
  }
): Promise<string> {
  const itemId = generateSafeId('item');
  const path = `users/${uid}/items/${itemId}`;
  const ref = doc(db, 'users', uid, 'items', itemId);
  const safeTitle = clampText(params.title, BLUEPRINT_LIMITS.TITLE_MAX) || 'Untitled note';

  try {
    await setDoc(ref, {
      id: itemId,
      userId: uid,
      title: safeTitle,
      userPrompt: clampText(params.userPrompt, BLUEPRINT_LIMITS.PROMPT_MAX),
      category: sanitizeCategory(params.category),
      completed: false,
      personalNotes: '',
      researchStatus: params.initialStatus,
      researchError: '',
      locationUsed: clampText(params.locationUsed ?? '', BLUEPRINT_LIMITS.LOCATION_MAX),
      summary: '',
      keyFindings: [],
      comparisonColumns: [],
      comparisonRows: [],
      actionSteps: [],
      sources: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return itemId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function toggleItemCompleted(
  uid: string,
  itemId: string,
  completed: boolean
): Promise<void> {
  const path = `users/${uid}/items/${itemId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'items', itemId), {
      completed,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleActionStep(
  uid: string,
  itemId: string,
  steps: ActionStep[]
): Promise<void> {
  const path = `users/${uid}/items/${itemId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'items', itemId), {
      actionSteps: sanitizeActionSteps(steps),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updatePersonalNotes(
  uid: string,
  itemId: string,
  personalNotes: string
): Promise<void> {
  const path = `users/${uid}/items/${itemId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'items', itemId), {
      personalNotes: clampRawText(personalNotes, BLUEPRINT_LIMITS.NOTES_MAX),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateItemDetails(
  uid: string,
  itemId: string,
  updates: { title: string; userPrompt: string; category: ItemCategory }
): Promise<void> {
  const path = `users/${uid}/items/${itemId}`;
  const safeTitle = clampText(updates.title, BLUEPRINT_LIMITS.TITLE_MAX);
  if (!safeTitle) return;
  try {
    await updateDoc(doc(db, 'users', uid, 'items', itemId), {
      title: safeTitle,
      userPrompt: clampText(updates.userPrompt, BLUEPRINT_LIMITS.PROMPT_MAX),
      category: sanitizeCategory(updates.category),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function setItemResearchStatus(
  uid: string,
  itemId: string,
  researchStatus: ResearchStatus,
  researchError = ''
): Promise<void> {
  const path = `users/${uid}/items/${itemId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'items', itemId), {
      researchStatus,
      researchError: clampText(researchError, BLUEPRINT_LIMITS.ERROR_MAX),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveItemResearchResult(
  uid: string,
  itemId: string,
  result: {
    category: ItemCategory;
    locationUsed: string;
    summary: string;
    keyFindings: string[];
    comparisonColumns: string[];
    comparisonRows: ComparisonRow[];
    actionSteps: string[];
    sources: SourceLink[];
  }
): Promise<void> {
  const path = `users/${uid}/items/${itemId}`;
  const safeColumns = sanitizeColumns(result.comparisonColumns);
  const safeRows = sanitizeRows(
    result.comparisonRows,
    Math.max(safeColumns.length - 1, 1)
  );
  const safeSteps: ActionStep[] = sanitizeActionSteps(
    result.actionSteps.map((text, idx) => ({
      id: `step_${idx + 1}`,
      text,
      done: false,
    }))
  );

  try {
    await updateDoc(doc(db, 'users', uid, 'items', itemId), {
      category: sanitizeCategory(result.category),
      researchStatus: 'ready',
      researchError: '',
      locationUsed: clampText(result.locationUsed, BLUEPRINT_LIMITS.LOCATION_MAX),
      summary: clampText(result.summary, BLUEPRINT_LIMITS.SUMMARY_MAX),
      keyFindings: sanitizeKeyFindings(result.keyFindings),
      comparisonColumns: safeColumns,
      comparisonRows: safeRows,
      actionSteps: safeSteps,
      sources: sanitizeSources(result.sources, BLUEPRINT_LIMITS.SOURCES_MAX_ITEMS),
      researchedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteResearchItem(uid: string, itemId: string): Promise<void> {
  const path = `users/${uid}/items/${itemId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'items', itemId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToFollowups(
  uid: string,
  itemId: string,
  onData: (followups: ResearchFollowup[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = `users/${uid}/items/${itemId}/followups`;
  const q = query(
    collection(db, 'users', uid, 'items', itemId, 'followups'),
    where('userId', '==', uid),
    where('itemId', '==', itemId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const followups: ResearchFollowup[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          userId: String(data.userId ?? uid),
          itemId: String(data.itemId ?? itemId),
          question: String(data.question ?? ''),
          answer: String(data.answer ?? ''),
          sources: Array.isArray(data.sources)
            ? data.sources.map((s: { title?: unknown; uri?: unknown }) => ({
                title: String(s?.title ?? ''),
                uri: String(s?.uri ?? ''),
              }))
            : [],
          createdAtMs: toMillis(data.createdAt),
        };
      });
      followups.sort((a, b) => a.createdAtMs - b.createdAtMs);
      onData(followups);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function createFollowup(
  uid: string,
  itemId: string,
  params: {
    question: string;
    answer: string;
    sources: SourceLink[];
  }
): Promise<string> {
  const followupId = generateSafeId('fu');
  const path = `users/${uid}/items/${itemId}/followups/${followupId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'items', itemId, 'followups', followupId), {
      id: followupId,
      userId: uid,
      itemId,
      question: clampText(params.question, BLUEPRINT_LIMITS.FOLLOWUP_QUESTION_MAX) || 'Follow-up',
      answer: clampText(params.answer, BLUEPRINT_LIMITS.FOLLOWUP_ANSWER_MAX) || 'No answer returned.',
      sources: sanitizeSources(params.sources, BLUEPRINT_LIMITS.FOLLOWUP_SOURCES_MAX),
      createdAt: serverTimestamp(),
    });
    return followupId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
