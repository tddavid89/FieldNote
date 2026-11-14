import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Columns2,
  Inbox,
  Landmark,
  LogOut,
  MapPin,
  SearchCheck,
  ShoppingBag,
  StickyNote,
  X,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { CATEGORY_LABELS, ItemCategory } from '../types/research';

export type WorkspaceView = 'all' | 'open' | 'researched' | 'completed';

interface SidebarProps {
  activeView: WorkspaceView;
  activeCategory: ItemCategory | 'all';
  onSelectView: (view: WorkspaceView) => void;
  onSelectCategory: (category: ItemCategory | 'all') => void;
  counts: {
    all: number;
    open: number;
    researched: number;
    completed: number;
    byCategory: Record<ItemCategory, number>;
  };
  locationContext: string;
  onSaveLocation: (location: string) => Promise<void>;
  userEmail: string;
  userName: string;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const CATEGORY_ICONS: Record<ItemCategory, typeof Columns2> = {
  comparison: Columns2,
  shopping: ShoppingBag,
  reading: BookOpen,
  finance: Landmark,
  general: StickyNote,
};

export function Sidebar({
  activeView,
  activeCategory,
  onSelectView,
  onSelectCategory,
  counts,
  locationContext,
  onSaveLocation,
  userEmail,
  userName,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [locationDraft, setLocationDraft] = useState(locationContext);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationSavedNotice, setLocationSavedNotice] = useState(false);

  useEffect(() => {
    setLocationDraft(locationContext);
  }, [locationContext]);

  async function handleLocationSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavingLocation(true);
    setLocationSavedNotice(false);
    try {
      await onSaveLocation(locationDraft.trim());
      setLocationSavedNotice(true);
      setTimeout(() => setLocationSavedNotice(false), 2000);
    } finally {
      setSavingLocation(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
  }

  const navContent = (
    <div className="flex flex-col h-full bg-[#FAFAFA] border-r border-neutral-200 w-[260px] shrink-0">
      <div className="h-14 px-5 flex items-center justify-between border-b border-neutral-200">
        <span className="font-display text-lg font-semibold tracking-tight text-neutral-900 whitespace-nowrap shrink-0">
          Fieldnote
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation"
          className="lg:hidden p-1.5 text-neutral-500 hover:text-neutral-900 rounded-md"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <nav aria-label="Workspace views" className="space-y-0.5">
          <p className="px-2.5 pb-1.5 text-xs font-medium text-neutral-500">Workspace</p>
          {(
            [
              { id: 'all', label: 'All Notes', icon: Inbox, count: counts.all },
              { id: 'open', label: 'Open To-Dos', icon: Circle, count: counts.open },
              { id: 'researched', label: 'With Briefs', icon: SearchCheck, count: counts.researched },
              { id: 'completed', label: 'Completed', icon: CheckCircle2, count: counts.completed },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const isSelected = activeView === item.id && activeCategory === 'all';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectView(item.id);
                  onSelectCategory('all');
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-2.5 py-2 text-sm rounded-lg transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-neutral-200/70 text-neutral-950 font-medium'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0 text-neutral-500" />
                  <span className="truncate whitespace-nowrap">{item.label}</span>
                </span>
                <span className="text-xs font-mono tabular-nums text-neutral-500 ml-2 shrink-0">
                  {item.count}
                </span>
              </button>
            );
          })}
        </nav>

        <nav aria-label="Topics by category" className="space-y-0.5">
          <p className="px-2.5 pb-1.5 text-xs font-medium text-neutral-500">Topics</p>
          {(Object.keys(CATEGORY_LABELS) as ItemCategory[]).map((cat) => {
            const Icon = CATEGORY_ICONS[cat];
            const isSelected = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  onSelectCategory(isSelected ? 'all' : cat);
                  onSelectView('all');
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-2.5 py-2 text-sm rounded-lg transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-neutral-200/70 text-neutral-950 font-medium'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0 text-neutral-500" />
                  <span className="truncate whitespace-nowrap">{CATEGORY_LABELS[cat]}</span>
                </span>
                <span className="text-xs font-mono tabular-nums text-neutral-500 ml-2 shrink-0">
                  {counts.byCategory[cat]}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="pt-4 border-t border-neutral-200 px-2">
          <form onSubmit={handleLocationSubmit} className="space-y-2">
            <label
              htmlFor="sidebar-location-input"
              className="flex items-center gap-1.5 text-xs font-medium text-neutral-700"
            >
              <MapPin className="w-3.5 h-3.5 text-neutral-500" />
              <span>Local Research Context</span>
            </label>
            <p className="text-xs text-neutral-500 leading-snug">
              City or ZIP used for library checks, car listings, and state tax rules.
            </p>
            <div className="flex items-center gap-1.5">
              <input
                id="sidebar-location-input"
                type="text"
                value={locationDraft}
                onChange={(e) => setLocationDraft(e.target.value)}
                placeholder="e.g. Seattle, WA"
                maxLength={120}
                className="min-w-0 flex-1 px-2.5 py-1.5 text-xs bg-white border border-neutral-200 rounded-md text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                disabled={savingLocation || locationDraft.trim() === locationContext}
                className="px-2.5 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 rounded-md hover:bg-neutral-100 disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
              >
                {savingLocation ? 'Saving' : 'Save'}
              </button>
            </div>
            {locationSavedNotice && (
              <p className="text-xs text-emerald-700 font-medium">Location saved</p>
            )}
          </form>
        </div>
      </div>

      <div className="p-3 border-t border-neutral-200 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-neutral-900 truncate">{userName || 'Account'}</p>
          <p className="text-xs text-neutral-500 truncate">{userEmail}</p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          title="Sign out"
          aria-label="Sign out"
          className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/60 rounded-lg transition-colors cursor-pointer shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{navContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-neutral-900/30"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-50 flex">{navContent}</div>
        </div>
      )}
    </>
  );
}
