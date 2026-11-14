import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import {
  ActionStep,
  BLUEPRINT_LIMITS,
  CATEGORY_LABELS,
  ItemCategory,
  ResearchFollowup,
  ResearchItem,
} from '../types/research';

interface DossierDetailProps {
  item: ResearchItem | null;
  followups: ResearchFollowup[];
  locationContext: string;
  onBackMobile: () => void;
  onToggleComplete: (item: ResearchItem) => Promise<void>;
  onUpdateDetails: (
    itemId: string,
    updates: { title: string; userPrompt: string; category: ItemCategory }
  ) => Promise<void>;
  onSaveNotes: (itemId: string, notes: string) => Promise<void>;
  onRunResearch: (item: ResearchItem) => Promise<void>;
  onToggleActionStep: (item: ResearchItem, steps: ActionStep[]) => Promise<void>;
  onAskFollowup: (item: ResearchItem, question: string) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
}

function getHostname(uri: string): string {
  try {
    return new URL(uri).hostname.replace(/^www\./, '');
  } catch {
    return uri;
  }
}

function formatFullDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DossierDetail({
  item,
  followups,
  locationContext,
  onBackMobile,
  onToggleComplete,
  onUpdateDetails,
  onSaveNotes,
  onRunResearch,
  onToggleActionStep,
  onAskFollowup,
  onDeleteItem,
}: DossierDetailProps) {
  const [titleDraft, setTitleDraft] = useState('');
  const [promptDraft, setPromptDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaveState, setNotesSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [followupInput, setFollowupInput] = useState('');
  const [askingFollowup, setAskingFollowup] = useState(false);
  const [followupError, setFollowupError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const notesTimerRef = useRef<number | null>(null);
  const lastSavedNotesRef = useRef<string>('');
  const currentItemIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!item) {
      currentItemIdRef.current = null;
      return;
    }
    if (currentItemIdRef.current !== item.id) {
      currentItemIdRef.current = item.id;
      setTitleDraft(item.title);
      setPromptDraft(item.userPrompt);
      setNotesDraft(item.personalNotes);
      lastSavedNotesRef.current = item.personalNotes;
      setNotesSaveState('idle');
      setFollowupInput('');
      setFollowupError(null);
      setConfirmDelete(false);
    } else {
      setTitleDraft(item.title);
      setPromptDraft(item.userPrompt);
    }
  }, [item]);

  useEffect(() => {
    return () => {
      if (notesTimerRef.current !== null) {
        window.clearTimeout(notesTimerRef.current);
      }
    };
  }, []);

  if (!item) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-10 flex flex-col items-center justify-center text-center min-h-[420px]">
        <p className="font-display text-lg font-semibold text-neutral-900">
          Select an item to inspect its dossier
        </p>
        <p className="text-sm text-neutral-500 mt-1.5 max-w-md">
          Each item stores its live background research brief, comparison matrix, actionable next
          steps, follow-up Q&amp;A, and your personal scratchpad notes.
        </p>
      </div>
    );
  }

  function handleNotesChange(nextValue: string) {
    setNotesDraft(nextValue);
    if (!item) return;
    if (notesTimerRef.current !== null) {
      window.clearTimeout(notesTimerRef.current);
    }
    setNotesSaveState('saving');
    const targetId = item.id;
    notesTimerRef.current = window.setTimeout(async () => {
      if (nextValue === lastSavedNotesRef.current) {
        setNotesSaveState('saved');
        return;
      }
      try {
        await onSaveNotes(targetId, nextValue);
        lastSavedNotesRef.current = nextValue;
        setNotesSaveState('saved');
      } catch {
        setNotesSaveState('idle');
      }
    }, 700);
  }

  async function flushNotesOnBlur() {
    if (!item) return;
    if (notesTimerRef.current !== null) {
      window.clearTimeout(notesTimerRef.current);
      notesTimerRef.current = null;
    }
    if (notesDraft !== lastSavedNotesRef.current) {
      setNotesSaveState('saving');
      await onSaveNotes(item.id, notesDraft);
      lastSavedNotesRef.current = notesDraft;
      setNotesSaveState('saved');
    }
  }

  async function commitTitleOrPrompt() {
    if (!item) return;
    const trimmedTitle = titleDraft.trim() || item.title;
    const trimmedPrompt = promptDraft.trim();
    if (trimmedTitle !== item.title || trimmedPrompt !== item.userPrompt) {
      await onUpdateDetails(item.id, {
        title: trimmedTitle,
        userPrompt: trimmedPrompt,
        category: item.category,
      });
    }
  }

  async function handleFollowupSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item || !followupInput.trim() || askingFollowup) return;
    setAskingFollowup(true);
    setFollowupError(null);
    try {
      await onAskFollowup(item, followupInput.trim());
      setFollowupInput('');
    } catch (err) {
      setFollowupError(err instanceof Error ? err.message : 'Follow-up request failed.');
    } finally {
      setAskingFollowup(false);
    }
  }

  async function handleToggleStep(stepId: string) {
    if (!item) return;
    const updated = item.actionSteps.map((s) =>
      s.id === stepId ? { ...s, done: !s.done } : s
    );
    await onToggleActionStep(item, updated);
  }

  const isResearching = item.researchStatus === 'researching';

  return (
    <article className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="px-5 py-3.5 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBackMobile}
            className="lg:hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>List</span>
          </button>

          <button
            type="button"
            onClick={() => void onToggleComplete(item)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              item.completed
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>{item.completed ? 'Completed' : 'Mark Done'}</span>
          </button>

          <select
            aria-label="Item category"
            value={item.category}
            onChange={(e) =>
              void onUpdateDetails(item.id, {
                title: item.title,
                userPrompt: item.userPrompt,
                category: e.target.value as ItemCategory,
              })
            }
            className="px-2.5 py-1.5 text-xs font-medium bg-[#FAFAFA] border border-neutral-200 rounded-lg text-neutral-700 focus:outline-none focus:border-blue-600 cursor-pointer"
          >
            {(Object.keys(CATEGORY_LABELS) as ItemCategory[]).map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isResearching}
            onClick={() => void onRunResearch(item)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {isResearching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>
              {isResearching
                ? 'Researching…'
                : item.researchStatus === 'ready'
                ? 'Refresh Research'
                : 'Run Research'}
            </span>
          </button>

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete item"
              className="p-2 text-neutral-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void onDeleteItem(item.id)}
                className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md cursor-pointer whitespace-nowrap"
              >
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 rounded-md cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Editorial Content */}
      <div className="p-6 sm:p-8 divide-y divide-neutral-200">
        {/* Title & Context */}
        <header className="pb-6 space-y-2.5">
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => void commitTitleOrPrompt()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            maxLength={BLUEPRINT_LIMITS.TITLE_MAX}
            aria-label="Item title"
            className="w-full font-display text-2xl font-semibold tracking-tight text-neutral-950 bg-transparent border border-transparent hover:border-neutral-200 focus:border-blue-600 focus:bg-[#FAFAFA] rounded-lg px-2 -mx-2 py-1 focus:outline-none"
          />
          <input
            type="text"
            value={promptDraft}
            onChange={(e) => setPromptDraft(e.target.value)}
            onBlur={() => void commitTitleOrPrompt()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            maxLength={BLUEPRINT_LIMITS.PROMPT_MAX}
            placeholder="Add extra context or criteria for research..."
            aria-label="Additional research context"
            className="w-full text-sm text-neutral-600 placeholder:text-neutral-400 bg-transparent border border-transparent hover:border-neutral-200 focus:border-blue-600 focus:bg-[#FAFAFA] rounded-lg px-2 -mx-2 py-1 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 tabular-nums pt-1">
            <span>{CATEGORY_LABELS[item.category]}</span>
            <span aria-hidden="true">·</span>
            <span>Created {formatFullDate(item.createdAtMs)}</span>
            {(item.locationUsed || locationContext) && (
              <>
                <span aria-hidden="true">·</span>
                <span>Local context: {item.locationUsed || locationContext}</span>
              </>
            )}
          </div>
        </header>

        {/* Section 1: Grounded Background Brief */}
        <section className="py-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-lg font-semibold text-neutral-900">
              Background Brief
            </h2>
            {item.researchStatus === 'ready' && item.researchedAtMs && (
              <span className="text-xs text-neutral-500 tabular-nums">
                Researched {formatFullDate(item.researchedAtMs)}
              </span>
            )}
          </div>

          {item.researchStatus === 'researching' && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 text-sm text-amber-700 font-medium">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Searching live sources and structuring your background brief…</span>
              </div>
              <div className="space-y-2.5 animate-pulse">
                <div className="h-4 bg-neutral-100 rounded w-full" />
                <div className="h-4 bg-neutral-100 rounded w-5/6" />
                <div className="h-4 bg-neutral-100 rounded w-2/3" />
              </div>
            </div>
          )}

          {item.researchStatus === 'error' && (
            <div
              role="alert"
              className="p-4 bg-red-50 border border-red-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div>
                <p className="text-sm font-medium text-red-800">Research could not be completed</p>
                <p className="text-xs text-red-700 mt-0.5">
                  {item.researchError?.includes('429') || item.researchError?.includes('RESOURCE_EXHAUSTED')
                    ? 'Gemini API quota reached (429). Please wait a moment and click Retry, or select a billing-enabled API key in Settings > Secrets to increase your quota.'
                    : item.researchError || 'An error occurred while gathering background info.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void onRunResearch(item)}
                className="px-3.5 py-2 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
              >
                Retry Research
              </button>
            </div>
          )}

          {item.researchStatus === 'idle' && (
            <div className="p-5 bg-[#FAFAFA] border border-neutral-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  Saved as a note — no background brief yet
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Run research whenever you want Fieldnote to gather prices, comparisons, or local
                  availability.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void onRunResearch(item)}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
              >
                Assemble Brief
              </button>
            </div>
          )}

          {item.researchStatus === 'ready' && (
            <div className="space-y-6">
              {item.summary && (
                <p className="text-[15px] text-neutral-800 leading-relaxed max-w-[72ch]">
                  {item.summary}
                </p>
              )}

              {item.keyFindings.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold text-neutral-500 tracking-wide">
                    Key Findings
                  </h3>
                  <ul className="space-y-2 list-disc pl-5 text-sm text-neutral-800 leading-relaxed tabular-nums">
                    {item.keyFindings.map((finding, idx) => (
                      <li key={idx}>{finding}</li>
                    ))}
                  </ul>
                </div>
              )}

              {item.comparisonColumns.length >= 2 && item.comparisonRows.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold text-neutral-500 tracking-wide">
                    Comparison Matrix
                  </h3>
                  <div className="overflow-x-auto border border-neutral-200 rounded-lg">
                    <table className="w-full text-left border-collapse text-sm tabular-nums">
                      <thead>
                        <tr className="bg-[#FAFAFA] border-b border-neutral-200">
                          {item.comparisonColumns.map((col, idx) => (
                            <th
                              key={idx}
                              className="py-2.5 px-3.5 text-xs font-semibold text-neutral-700 whitespace-nowrap"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200">
                        {item.comparisonRows.map((row, rowIdx) => (
                          <tr key={rowIdx} className="hover:bg-neutral-50/70">
                            <td className="py-2.5 px-3.5 font-medium text-neutral-900 align-top">
                              {row.label}
                            </td>
                            {row.values.map((val, colIdx) => (
                              <td
                                key={colIdx}
                                className="py-2.5 px-3.5 text-neutral-700 align-top"
                              >
                                {val}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {item.actionSteps.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold text-neutral-500 tracking-wide">
                    Recommended Next Steps
                  </h3>
                  <ul className="space-y-2">
                    {item.actionSteps.map((step) => (
                      <li key={step.id}>
                        <button
                          type="button"
                          onClick={() => void handleToggleStep(step.id)}
                          className="flex items-start gap-2.5 text-left w-full py-1 group cursor-pointer"
                        >
                          <span
                            className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              step.done
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'bg-white border-neutral-300 group-hover:border-blue-600'
                            }`}
                          >
                            {step.done && <Check className="w-3 h-3 stroke-[2.5]" />}
                          </span>
                          <span
                            className={`text-sm leading-snug ${
                              step.done ? 'line-through text-neutral-400' : 'text-neutral-800'
                            }`}
                          >
                            {step.text}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {item.sources.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-neutral-500 tracking-wide">
                    Grounded Sources
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {item.sources.map((src, idx) => (
                      <a
                        key={`${src.uri}-${idx}`}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-[#FAFAFA] hover:bg-neutral-100 border border-neutral-200 rounded-lg transition-colors min-w-0"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-neutral-900 truncate">{src.title}</p>
                          <p className="text-neutral-500 truncate">{getHostname(src.uri)}</p>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Section 2: Personal Scratchpad Notes */}
        <section className="py-6 space-y-2.5">
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="personal-notes-editor"
              className="font-display text-lg font-semibold text-neutral-900"
            >
              Your Notes
            </label>
            <span className="text-xs text-neutral-500">
              {notesSaveState === 'saving'
                ? 'Saving…'
                : notesSaveState === 'saved'
                ? 'Saved'
                : 'Auto-saves as you type'}
            </span>
          </div>
          <textarea
            id="personal-notes-editor"
            rows={5}
            value={notesDraft}
            onChange={(e) => handleNotesChange(e.target.value)}
            onBlur={() => void flushNotesOnBlur()}
            maxLength={BLUEPRINT_LIMITS.NOTES_MAX}
            placeholder="Jot down your thoughts, dealer quotes, library hold numbers, or final decision..."
            className="w-full p-3.5 text-sm bg-[#FAFAFA] border border-neutral-200 rounded-lg text-neutral-900 placeholder:text-neutral-400 leading-relaxed focus:outline-none focus:bg-white focus:border-blue-600 resize-y"
          />
        </section>

        {/* Section 3: Follow-up Research */}
        <section className="pt-6 space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-neutral-900">
              Follow-Up Research
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Ask a specific question based on this brief and your notes.
            </p>
          </div>

          {followups.length > 0 && (
            <div className="space-y-4">
              {followups.map((fu) => (
                <div
                  key={fu.id}
                  className="p-4 bg-[#FAFAFA] border border-neutral-200 rounded-lg space-y-2.5"
                >
                  <p className="text-sm font-medium text-neutral-900">{fu.question}</p>
                  <div className="text-sm text-neutral-700 leading-relaxed whitespace-pre-line">
                    {fu.answer}
                  </div>
                  {fu.sources.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {fu.sources.map((src, idx) => (
                        <a
                          key={`${src.uri}-${idx}`}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                        >
                          <span>{getHostname(src.uri)}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {followupError && (
            <div
              role="alert"
              className="px-3.5 py-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg"
            >
              {followupError}
            </div>
          )}

          <form onSubmit={handleFollowupSubmit} className="flex items-center gap-2">
            <label htmlFor="followup-question-input" className="sr-only">
              Ask a follow-up question
            </label>
            <input
              id="followup-question-input"
              type="text"
              value={followupInput}
              onChange={(e) => setFollowupInput(e.target.value)}
              maxLength={BLUEPRINT_LIMITS.FOLLOWUP_QUESTION_MAX}
              placeholder="e.g. Compare California state tax treatment for VUSXX vs FDLXX..."
              className="flex-1 min-w-0 px-3.5 py-2.5 text-sm bg-[#FAFAFA] border border-neutral-200 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-blue-600"
            />
            <button
              type="submit"
              disabled={!followupInput.trim() || askingFollowup}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-45 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {askingFollowup ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>{askingFollowup ? 'Searching…' : 'Ask'}</span>
            </button>
          </form>
        </section>
      </div>
    </article>
  );
}
