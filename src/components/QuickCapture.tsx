import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Search } from 'lucide-react';
import { BLUEPRINT_LIMITS, CATEGORY_LABELS, ItemCategory } from '../types/research';

interface QuickCaptureProps {
  onCreateItem: (params: {
    title: string;
    userPrompt: string;
    category: ItemCategory | 'auto';
    runResearch: boolean;
  }) => Promise<void>;
}

export function QuickCapture({ onCreateItem }: QuickCaptureProps) {
  const [title, setTitle] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [category, setCategory] = useState<ItemCategory | 'auto'>('auto');
  const [showDetails, setShowDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(runResearch: boolean) {
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onCreateItem({
        title: trimmed,
        userPrompt: userPrompt.trim(),
        category,
        runResearch,
      });
      setTitle('');
      setUserPrompt('');
      setCategory('auto');
      setShowDetails(false);
    } finally {
      setSubmitting(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submit(true);
  }

  return (
    <form
      onSubmit={handleFormSubmit}
      className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <label htmlFor="quick-capture-title" className="sr-only">
          Add a note, to-do, or research topic
        </label>
        <input
          id="quick-capture-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={BLUEPRINT_LIMITS.TITLE_MAX}
          placeholder="Add a note, to-do, or topic (e.g. iCloud vs Google Photos)..."
          className="flex-1 min-w-0 px-3.5 py-2.5 text-sm bg-[#FAFAFA] border border-neutral-200 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-blue-600"
        />
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={!title.trim() || submitting}
            onClick={() => void submit(false)}
            className="px-3.5 py-2.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 hover:bg-neutral-50 disabled:opacity-45 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span className="inline-flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              <span>Save Note</span>
            </span>
          </button>
          <button
            type="submit"
            disabled={!title.trim() || submitting}
            className="px-4 py-2.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-45 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span className="inline-flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" />
              <span>{submitting ? 'Adding…' : 'Add & Research'}</span>
            </span>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setShowDetails((prev) => !prev)}
          className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer whitespace-nowrap"
        >
          {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{showDetails ? 'Hide details & topic' : 'Add constraints or topic category'}</span>
        </button>
      </div>

      {showDetails && (
        <div className="pt-2 border-t border-neutral-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor="quick-capture-prompt" className="block text-xs font-medium text-neutral-600 mb-1">
              Context or questions to answer
            </label>
            <textarea
              id="quick-capture-prompt"
              rows={2}
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              maxLength={BLUEPRINT_LIMITS.PROMPT_MAX}
              placeholder="Budget, current plan, author name, edition, or specific comparisons..."
              className="w-full px-3 py-2 text-xs bg-[#FAFAFA] border border-neutral-200 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-blue-600 resize-y"
            />
          </div>
          <div>
            <label htmlFor="quick-capture-category" className="block text-xs font-medium text-neutral-600 mb-1">
              Category
            </label>
            <select
              id="quick-capture-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ItemCategory | 'auto')}
              className="w-full px-3 py-2 text-xs bg-[#FAFAFA] border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:bg-white focus:border-blue-600"
            >
              <option value="auto">Auto-detect</option>
              {(Object.keys(CATEGORY_LABELS) as ItemCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </form>
  );
}
