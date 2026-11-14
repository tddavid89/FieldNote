import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { ArrowRight, BookOpen, Compass, FileText, Landmark } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';

export function AuthGate() {
  const [signingIn, setSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setSigningIn(true);
    setErrorMessage(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unable to sign in with Google.';
      setErrorMessage(msg);
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-neutral-900 flex flex-col justify-between px-6 py-10">
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between gap-8">
        <span className="font-display text-xl font-semibold tracking-tight text-neutral-900 whitespace-nowrap shrink-0">
          Fieldnote
        </span>
      </header>

      <main className="max-w-3xl w-full mx-auto my-auto py-12">
        <div className="bg-white border border-neutral-200 rounded-xl p-8 sm:p-10">
          <p className="text-xs font-medium text-neutral-500 mb-3">
            Notes, to-dos &amp; background briefs
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-neutral-900 leading-tight mb-4">
            A to-do list that gathers the background before you come back to it.
          </h1>
          <p className="text-base text-neutral-600 leading-relaxed max-w-2xl mb-8">
            Capture decisions, books to read, local searches, or financial questions. Fieldnote
            assembles live web-grounded pricing, comparisons, library checks, and next steps alongside
            your own scratchpad notes.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-6 border-y border-neutral-200 mb-8">
            <div className="flex items-start gap-3">
              <Compass className="w-4 h-4 text-blue-700 mt-1 shrink-0" />
              <div>
                <p className="text-sm font-medium text-neutral-900">Side-by-side comparisons</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Storage plans, loan options, and tradeoffs laid out in structured tables.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <BookOpen className="w-4 h-4 text-blue-700 mt-1 shrink-0" />
              <div>
                <p className="text-sm font-medium text-neutral-900">Library &amp; format prices</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Local library availability alongside ebook, paperback, and audiobook costs.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Landmark className="w-4 h-4 text-blue-700 mt-1 shrink-0" />
              <div>
                <p className="text-sm font-medium text-neutral-900">Yields, loans &amp; local inventory</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Up-to-date rates, tax treatment, and availability tailored to your city.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <FileText className="w-4 h-4 text-blue-700 mt-1 shrink-0" />
              <div>
                <p className="text-sm font-medium text-neutral-900">Saved notes &amp; follow-ups</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Keep your own thoughts and ask follow-up questions anytime you return.
                </p>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mb-5 px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg"
            >
              {errorMessage}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              className="inline-flex items-center justify-center gap-2.5 px-5 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              <span>{signingIn ? 'Signing in…' : 'Continue with Google'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <span className="text-xs text-neutral-500">
              Your notes and briefs sync privately to your account.
            </span>
          </div>
        </div>
      </main>

      <footer className="max-w-4xl w-full mx-auto text-xs text-neutral-400">
        Fieldnote Workspace
      </footer>
    </div>
  );
}
