import { Check, Loader2, Search, X } from 'lucide-react';
import { STARTER_TEMPLATES, StarterTemplate } from '../lib/starterTemplates';
import { CATEGORY_LABELS, ResearchItem } from '../types/research';

export type ListStatusFilter = 'all' | 'open' | 'done';

interface ItemListProps {
  items: ResearchItem[];
  totalItemCount: number;
  selectedId: string | null;
  onSelectItem: (id: string) => void;
  onToggleComplete: (item: ResearchItem) => Promise<void>;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: ListStatusFilter;
  onStatusFilterChange: (filter: ListStatusFilter) => void;
  onUseStarter: (template: StarterTemplate) => Promise<void>;
  loading: boolean;
}

function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ItemList({
  items,
  totalItemCount,
  selectedId,
  onSelectItem,
  onToggleComplete,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onUseStarter,
  loading,
}: ItemListProps) {
  if (loading) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-200">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="p-4 space-y-2 animate-pulse">
            <div className="h-4 bg-neutral-200 rounded w-3/4" />
            <div className="h-3 bg-neutral-100 rounded w-1/2" />
            <div className="h-3 bg-neutral-100 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl flex flex-col overflow-hidden">
      <div className="p-3 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter notes and briefs..."
            aria-label="Filter notes and briefs"
            className="w-full pl-8 pr-8 py-1.5 text-xs bg-[#FAFAFA] border border-neutral-200 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-blue-600"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg shrink-0 self-start sm:self-auto">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'open', label: 'Open' },
              { id: 'done', label: 'Done' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onStatusFilterChange(tab.id)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                statusFilter === tab.id
                  ? 'bg-white text-neutral-950 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="p-6 sm:p-8">
          {totalItemCount === 0 ? (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-lg font-semibold text-neutral-900">
                  Your research list is empty
                </h2>
                <p className="text-sm text-neutral-600 mt-1 leading-relaxed">
                  Type any topic above, or start with one of these real-world research templates to
                  see Fieldnote build a grounded brief automatically.
                </p>
              </div>
              <div className="border-t border-neutral-200 divide-y divide-neutral-200">
                {STARTER_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.title}
                    type="button"
                    onClick={() => void onUseStarter(tpl)}
                    className="w-full text-left py-3 px-2 -mx-2 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer group flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900 group-hover:text-blue-700 transition-colors">
                        {tpl.title}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">
                        {CATEGORY_LABELS[tpl.category]} · {tpl.userPrompt}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-blue-700 whitespace-nowrap shrink-0 mt-0.5">
                      Run brief
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm font-medium text-neutral-900">No matching items</p>
              <p className="text-xs text-neutral-500">
                Adjust your search or filter to see your other saved notes.
              </p>
            </div>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {items.map((item) => {
            const isSelected = item.id === selectedId;
            const previewText =
              item.summary ||
              item.userPrompt ||
              item.personalNotes ||
              'No background brief generated yet.';

            const statusLabel =
              item.researchStatus === 'researching'
                ? 'Researching…'
                : item.researchStatus === 'ready'
                ? `${item.sources.length} sources`
                : item.researchStatus === 'error'
                ? 'Research failed'
                : 'Note only';

            return (
              <li
                key={item.id}
                className={`transition-colors ${
                  isSelected ? 'bg-blue-50/50' : 'hover:bg-neutral-50'
                }`}
              >
                <div className="flex items-start gap-2.5 p-3.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onToggleComplete(item);
                    }}
                    aria-label={item.completed ? `Mark "${item.title}" incomplete` : `Mark "${item.title}" complete`}
                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                      item.completed
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white border-neutral-300 hover:border-blue-600'
                    }`}
                  >
                    {item.completed && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectItem(item.id)}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <p
                      className={`text-sm font-medium leading-snug ${
                        item.completed ? 'line-through text-neutral-400' : 'text-neutral-900'
                      }`}
                    >
                      {item.title}
                    </p>
                    <p className="text-xs text-neutral-500 mt-1 line-clamp-2 leading-relaxed">
                      {previewText}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500 tabular-nums">
                      <span>{CATEGORY_LABELS[item.category]}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`inline-flex items-center gap-1 ${
                          item.researchStatus === 'researching'
                            ? 'text-amber-700 font-medium'
                            : item.researchStatus === 'error'
                            ? 'text-red-700 font-medium'
                            : ''
                        }`}
                      >
                        {item.researchStatus === 'researching' && (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        )}
                        <span>{statusLabel}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatShortDate(item.updatedAtMs)}</span>
                    </div>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
