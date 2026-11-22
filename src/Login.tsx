import { lazy, Suspense, useEffect, useState } from 'react';
import { AuthenticationError } from '@auth0/auth0-spa-js';
import { ArrowRight } from 'lucide-react';
import { auth, demoUrl, restoreSession, studioUrl } from './auth.ts';
import type { Account, ProviderKeys } from './auth.ts';
import { ApiKeysDialog } from './ApiKeysDialog.tsx';

const Studio = lazy(() => import('./App.tsx').then(({ App }) => ({ default: App })));
const signOutEvents = typeof BroadcastChannel === 'function' ? new BroadcastChannel(studioUrl + 'sign-out') : undefined;
const params = new URLSearchParams(window.location.search);
const demo = params.has('demo');
const loginCallback = !demo && params.has('code') && params.has('state');
const session = demo ? undefined : restoreSession().catch((error: unknown) =>
  error instanceof AuthenticationError && error.error === 'access_denied' ? 'denied' as const : 'error' as const);

const messages = {
  checking: 'Opening your studio…',
  guest: 'Sign in to open your music studio.',
  denied: 'This account doesn’t have access to the studio.',
  unavailable: window.isSecureContext ? 'Google sign-in is unavailable. You can still play the demo.' : 'Open BandIt over HTTPS or localhost to sign in.',
  error: 'Sign-in didn’t finish. Please try again.',
  redirecting: 'Opening Google sign-in…',
  leaving: 'Signing out…',
};
type View = keyof typeof messages | Account;

function LoginPage({ view, onLogin }: { view: keyof typeof messages; onLogin?: () => void }) {
  return <main className="login-page">
    <div className="login-content">
      <span className="brand-note login-note" aria-hidden="true" />
      <h1>BandIt</h1>
      <p role="status">{messages[view]}</p>
      <button type="button" className="login-button" disabled={!onLogin} onClick={onLogin}>
        {view === 'denied' ? 'Use another account' : 'Continue with Google'} <ArrowRight size={18} aria-hidden="true" />
      </button>
      <a className="demo-link" href={demoUrl}>See demo</a>
    </div>
  </main>;
}

export function Login() {
  const [view, setView] = useState<View>('checking');
  const [keys, setKeys] = useState<ProviderKeys>({});
  const [keyPrompt, setKeyPrompt] = useState<'welcome' | 'edit' | null>(loginCallback ? 'welcome' : null);
  useEffect(() => {
    void session?.then(setView);
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    const onSignOut = () => window.location.replace(studioUrl);
    if (session) signOutEvents?.addEventListener('message', onSignOut);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      signOutEvents?.removeEventListener('message', onSignOut);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  function signIn() {
    if (!auth) return;
    setView('redirecting');
    void auth.loginWithRedirect({
      authorizationParams: view === 'denied' ? { prompt: 'login' } : {},
    }).catch(() => setView('error'));
  }

  function signOut() {
    if (!auth) return;
    setKeys({});
    setKeyPrompt(null);
    setView('leaving');
    void auth.logout({
      logoutParams: { returnTo: studioUrl },
      openUrl(url) {
        signOutEvents?.postMessage('signed-out');
        window.location.assign(url);
      },
    }).catch(() => setView('error'));
  }

  if (demo || typeof view === 'object') {
    const access = { account: typeof view === 'object' ? view : null, keys };
    return <>
      <Suspense fallback={<div className="login-page" role="status">Opening your studio…</div>}>
        <Studio access={access} onExit={demo ? () => window.location.assign(studioUrl) : signOut}
          onEditKeys={() => setKeyPrompt('edit')} />
      </Suspense>
      {keyPrompt && <ApiKeysDialog keys={keys} welcome={keyPrompt === 'welcome'}
        onCancel={() => setKeyPrompt(null)} onSave={next => { setKeys(next); setKeyPrompt(null); }} />}
    </>;
  }
  const canSignIn = view === 'guest' || view === 'denied' || view === 'error';
  return <LoginPage view={view} onLogin={canSignIn ? signIn : undefined} />;
}
