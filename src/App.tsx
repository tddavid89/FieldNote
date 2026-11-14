import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { Menu } from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { DossierDetail } from './components/DossierDetail';
import { ItemList, ListStatusFilter } from './components/ItemList';
import { QuickCapture } from './components/QuickCapture';
import { Sidebar, WorkspaceView } from './components/Sidebar';
import { auth } from './lib/firebase';
import {
  createFollowup,
  createResearchItem,
  deleteResearchItem,
  ensureUserProfile,
  saveItemResearchResult,
  setItemResearchStatus,
  subscribeToFollowups,
  subscribeToResearchItems,
  subscribeToUserProfile,
  toggleActionStep,
  toggleItemCompleted,
  updateItemDetails,
  updatePersonalNotes,
  updateUserLocation,
} from './lib/firestoreService';
import { runBackgroundResearch, runFollowupResearch } from './lib/researchApi';
import { StarterTemplate } from './lib/starterTemplates';
import {
  ActionStep,
  CATEGORY_LABELS,
  ItemCategory,
  ResearchFollowup,
  ResearchItem,
  UserProfile,
} from './types/research';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<ResearchItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [followups, setFollowups] = useState<ResearchFollowup[]>([]);

  const [activeView, setActiveView] = useState<WorkspaceView>('all');
  const [activeCategory, setActiveCategory] = useState<ItemCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ListStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (!firebaseUser) {
        setProfile(null);
        setItems([]);
        setSelectedId(null);
        setFollowups([]);
        setItemsLoading(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user || !user.emailVerified) return;
    let active = true;
    setItemsLoading(true);
    setWorkspaceError(null);

    void ensureUserProfile(user.uid).catch((err) => {
      if (active) setWorkspaceError(err instanceof Error ? err.message : 'Unable to initialize profile.');
    });

    const unsubProfile = subscribeToUserProfile(
      user.uid,
      (p) => {
        if (active) setProfile(p);
      },
      (err) => {
        if (active) setWorkspaceError(err.message);
      }
    );

    const unsubItems = subscribeToResearchItems(
      user.uid,
      (nextItems) => {
        if (!active) return;
        setItems(nextItems);
        setItemsLoading(false);
        setSelectedId((prev) => {
          if (prev && nextItems.some((item) => item.id === prev)) return prev;
          return nextItems[0]?.id ?? null;
        });
      },
      (err) => {
        if (active) {
          setItemsLoading(false);
          setWorkspaceError(err.message);
        }
      }
    );

    return () => {
      active = false;
      unsubProfile();
      unsubItems();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !user.emailVerified || !selectedId) {
      setFollowups([]);
      return;
    }
    const unsub = subscribeToFollowups(
      user.uid,
      selectedId,
      (list) => setFollowups(list),
      (err) => setWorkspaceError(err.message)
    );
    return unsub;
  }, [user, selectedId]);

  const locationContext = profile?.locationContext ?? '';

  const counts = useMemo(() => {
    const byCategory: Record<ItemCategory, number> = {
      comparison: 0,
      shopping: 0,
      reading: 0,
      finance: 0,
      general: 0,
    };
    let open = 0;
    let researched = 0;
    let completed = 0;

    for (const item of items) {
      byCategory[item.category] += 1;
      if (item.completed) completed += 1;
      else open += 1;
      if (item.researchStatus === 'ready') researched += 1;
    }

    return {
      all: items.length,
      open,
      researched,
      completed,
      byCategory,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (activeView === 'open' && item.completed) return false;
      if (activeView === 'completed' && !item.completed) return false;
      if (activeView === 'researched' && item.researchStatus !== 'ready') return false;
      if (statusFilter === 'open' && item.completed) return false;
      if (statusFilter === 'done' && !item.completed) return false;
      if (q) {
        const haystack = `${item.title} ${item.userPrompt} ${item.summary} ${item.personalNotes}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, activeCategory, activeView, statusFilter, searchQuery]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );

  const executeResearchForItem = useCallback(
    async (
      uid: string,
      itemId: string,
      params: {
        title: string;
        userPrompt: string;
        category: ItemCategory | 'auto';
        loc: string;
      }
    ) => {
      try {
        await setItemResearchStatus(uid, itemId, 'researching', '');
        const result = await runBackgroundResearch({
          title: params.title,
          userPrompt: params.userPrompt,
          category: params.category,
          locationContext: params.loc,
        });
        await saveItemResearchResult(uid, itemId, {
          category: result.detectedCategory,
          locationUsed: result.locationUsed,
          summary: result.summary,
          keyFindings: result.keyFindings,
          comparisonColumns: result.comparisonColumns,
          comparisonRows: result.comparisonRows,
          actionSteps: result.actionSteps,
          sources: result.sources,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Research request failed.';
        await setItemResearchStatus(uid, itemId, 'error', msg).catch(() => undefined);
      }
    },
    []
  );

  async function handleCreateItem(params: {
    title: string;
    userPrompt: string;
    category: ItemCategory | 'auto';
    runResearch: boolean;
  }) {
    if (!user) return;
    const initialCategory: ItemCategory =
      params.category === 'auto' ? 'general' : params.category;

    const newId = await createResearchItem(user.uid, {
      title: params.title,
      userPrompt: params.userPrompt,
      category: initialCategory,
      initialStatus: params.runResearch ? 'researching' : 'idle',
      locationUsed: locationContext,
    });

    setSelectedId(newId);
    setMobileDetailOpen(true);

    if (params.runResearch) {
      void executeResearchForItem(user.uid, newId, {
        title: params.title,
        userPrompt: params.userPrompt,
        category: params.category,
        loc: locationContext,
      });
    }
  }

  async function handleUseStarter(template: StarterTemplate) {
    await handleCreateItem({
      title: template.title,
      userPrompt: template.userPrompt,
      category: template.category,
      runResearch: true,
    });
  }

  async function handleRunResearch(item: ResearchItem) {
    if (!user) return;
    await executeResearchForItem(user.uid, item.id, {
      title: item.title,
      userPrompt: item.userPrompt,
      category: item.category,
      loc: locationContext,
    });
  }

  async function handleToggleComplete(item: ResearchItem) {
    if (!user) return;
    await toggleItemCompleted(user.uid, item.id, !item.completed);
  }

  async function handleToggleActionStep(item: ResearchItem, steps: ActionStep[]) {
    if (!user) return;
    await toggleActionStep(user.uid, item.id, steps);
  }

  async function handleSaveNotes(itemId: string, notes: string) {
    if (!user) return;
    await updatePersonalNotes(user.uid, itemId, notes);
  }

  async function handleUpdateDetails(
    itemId: string,
    updates: { title: string; userPrompt: string; category: ItemCategory }
  ) {
    if (!user) return;
    await updateItemDetails(user.uid, itemId, updates);
  }

  async function handleAskFollowup(item: ResearchItem, question: string) {
    if (!user) return;
    const result = await runFollowupResearch({
      title: item.title,
      category: item.category,
      locationContext: locationContext || item.locationUsed,
      summary: item.summary,
      keyFindings: item.keyFindings,
      personalNotes: item.personalNotes,
      question,
      previousFollowups: followups.map((f) => ({ question: f.question, answer: f.answer })),
    });
    await createFollowup(user.uid, item.id, {
      question,
      answer: result.answer,
      sources: result.sources,
    });
  }

  async function handleDeleteItem(itemId: string) {
    if (!user) return;
    await deleteResearchItem(user.uid, itemId);
    setMobileDetailOpen(false);
    setSelectedId((prev) => (prev === itemId ? null : prev));
  }

  async function handleSaveLocation(loc: string) {
    if (!user) return;
    await updateUserLocation(user.uid, loc);
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center text-sm text-neutral-500">
        Loading workspace…
      </div>
    );
  }

  if (!user) {
    return <AuthGate />;
  }

  if (!user.emailVerified) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
          <h1 className="font-display text-xl font-semibold text-neutral-900">
            Verify your email to continue
          </h1>
          <p className="text-sm text-neutral-600">
            Fieldnote requires a verified email address to protect your private notes and research
            dossiers.
          </p>
          <button
            type="button"
            onClick={() => void signOut(auth)}
            className="px-4 py-2 text-xs font-medium text-white bg-neutral-900 rounded-lg cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const activeBreadcrumb =
    activeCategory !== 'all'
      ? CATEGORY_LABELS[activeCategory]
      : activeView === 'all'
      ? 'All Notes'
      : activeView === 'open'
      ? 'Open To-Dos'
      : activeView === 'researched'
      ? 'With Briefs'
      : 'Completed';

  return (
    <div className="min-h-screen flex bg-[#FAFAFA] text-neutral-900">
      <Sidebar
        activeView={activeView}
        activeCategory={activeCategory}
        onSelectView={setActiveView}
        onSelectCategory={setActiveCategory}
        counts={counts}
        locationContext={locationContext}
        onSaveLocation={handleSaveLocation}
        userEmail={user.email ?? ''}
        userName={user.displayName ?? ''}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 px-4 sm:px-6 bg-white border-b border-neutral-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-neutral-600 hover:text-neutral-900 rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-medium text-neutral-500 whitespace-nowrap">Workspace</span>
              <span aria-hidden="true" className="text-neutral-300">
                /
              </span>
              <span className="font-semibold text-neutral-900 truncate whitespace-nowrap">
                {activeBreadcrumb}
              </span>
            </div>
          </div>

          <div className="text-xs text-neutral-500 tabular-nums whitespace-nowrap shrink-0">
            {locationContext ? `Location: ${locationContext}` : 'No location set'}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1360px] w-full mx-auto space-y-4">
          {workspaceError && (
            <div
              role="alert"
              className="px-4 py-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between gap-3"
            >
              <span className="truncate">{workspaceError}</span>
              <button
                type="button"
                onClick={() => setWorkspaceError(null)}
                className="font-medium underline shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          <QuickCapture onCreateItem={handleCreateItem} />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div
              className={`lg:col-span-5 ${
                mobileDetailOpen ? 'hidden lg:block' : 'block'
              }`}
            >
              <ItemList
                items={filteredItems}
                totalItemCount={items.length}
                selectedId={selectedId}
                onSelectItem={(id) => {
                  setSelectedId(id);
                  setMobileDetailOpen(true);
                }}
                onToggleComplete={handleToggleComplete}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                onUseStarter={handleUseStarter}
                loading={itemsLoading}
              />
            </div>

            <div
              className={`lg:col-span-7 ${
                mobileDetailOpen ? 'block' : 'hidden lg:block'
              }`}
            >
              <DossierDetail
                item={selectedItem}
                followups={followups}
                locationContext={locationContext}
                onBackMobile={() => setMobileDetailOpen(false)}
                onToggleComplete={handleToggleComplete}
                onUpdateDetails={handleUpdateDetails}
                onSaveNotes={handleSaveNotes}
                onRunResearch={handleRunResearch}
                onToggleActionStep={handleToggleActionStep}
                onAskFollowup={handleAskFollowup}
                onDeleteItem={handleDeleteItem}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
