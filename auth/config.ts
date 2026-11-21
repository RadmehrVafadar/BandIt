// These public identifiers register the BandIt SPA and its API with Auth0.
const bandit = {
  VITE_AUTH0_DOMAIN: 'dev-fk6e616at1r53rhj.us.auth0.com',
  VITE_AUTH0_CLIENT_ID: '6YbUMHtFq5OKim3MX7qs6t2eaJZEfCiO',
  VITE_AUTH0_AUDIENCE: 'urn:bandit:api',
};

export function authConfig(env: Record<string, string | undefined>) {
  const settings = Object.keys(bandit).some(key => env[key] !== undefined) ? env : bandit;
  const domain = settings.VITE_AUTH0_DOMAIN?.trim().toLowerCase();
  const clientId = settings.VITE_AUTH0_CLIENT_ID?.trim();
  const audience = settings.VITE_AUTH0_AUDIENCE?.trim();
  const ownerSub = env.VITE_AUTH0_OWNER_SUB?.trim();
  if (!domain || !clientId || !audience || audience === clientId) return;
  try {
    const issuer = new URL('https://' + domain);
    if (issuer.hostname === domain) return { domain, issuer: issuer.href, clientId, audience, ownerSub };
  } catch {
    return undefined;
  }
}

export function isGoogleSubject(sub: unknown): sub is string {
  return typeof sub === 'string' && /^google-oauth2\|[^|\s]+$/.test(sub);
}

export function isProviderKey(value: unknown): value is string {
  return typeof value === 'string' && /^[!-~]{1,512}$/.test(value) && !value.includes(',');
}
