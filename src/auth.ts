import { Auth0Client } from '@auth0/auth0-spa-js';
import { authConfig, isGoogleSubject } from '../auth/config.ts';

const config = authConfig(import.meta.env);
export type Account = { sub: string; legacyLibrary: boolean };
export type ProviderKeys = { gemini?: string; elevenlabs?: string };
export type StudioAccess = { account: Account | null; keys: ProviderKeys };

export function storageSuffix(account: Account | null) {
  return account?.legacyLibrary ? '' : ':' + (account?.sub ?? 'demo');
}

export const studioUrl = window.location.origin + new URL(import.meta.env.BASE_URL, document.baseURI).pathname;
export const demoUrl = studioUrl + '?demo';
export const auth = config && window.isSecureContext ? new Auth0Client({
  domain: config.domain,
  clientId: config.clientId,
  authorizationParams: { audience: config.audience, redirect_uri: studioUrl, scope: 'openid' },
}) : undefined;

export async function restoreSession() {
  if (!auth || !config) return 'unavailable';
  const params = new URLSearchParams(window.location.search);
  if (params.has('state') && (params.has('code') || params.has('error'))) {
    try {
      await auth.handleRedirectCallback();
    } finally {
      window.history.replaceState(null, '', studioUrl);
    }
  } else {
    await auth.checkSession();
  }
  const user = await auth.getUser();
  if (!user) return 'guest';
  if (!isGoogleSubject(user.sub)) return 'denied';
  return { sub: user.sub, legacyLibrary: user.sub === config.ownerSub } satisfies Account;
}

export async function fetchStudioApi(access: StudioAccess, path: 'identify' | `sounds?name=${string}`, init: RequestInit) {
  const headers = new Headers(init.headers);
  if (access.account) {
    if (!auth) throw new Error('Sign-in is unavailable.');
    const token = await auth.getTokenSilently();
    if ((await auth.getUser())?.sub !== access.account.sub) throw new Error('Sign in again to use this account.');
    headers.set('Authorization', 'Bearer ' + token);
  } else {
    headers.set('X-BandIt-Demo', '1');
  }
  const key = access.keys[path === 'identify' ? 'gemini' : 'elevenlabs'];
  if (key) headers.set('X-BandIt-API-Key', key);
  return fetch(studioUrl + 'api/' + path, { ...init, headers, redirect: 'error', cache: 'no-store' });
}
