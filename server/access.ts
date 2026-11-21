import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { authConfig, isGoogleSubject, isProviderKey } from '../auth/config.ts';

export type ProviderAccess = { key: string | undefined; member?: string };
type ProviderHandler = (req: IncomingMessage, res: ServerResponse, access: ProviderAccess) => Promise<void>;

export function withProviderKey(handler: ProviderHandler, sharedKey: string | undefined,
  env: Record<string, string | undefined> = process.env): RequestListener {
  const config = authConfig(env);
  const keys = config && createRemoteJWKSet(new URL('.well-known/jwks.json', config.issuer));

  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.headers['sec-fetch-site'] === 'cross-site') return void res.writeHead(403).end();
    const supplied = req.headers['x-bandit-api-key'];
    const demo = req.headers['x-bandit-demo'] === '1';
    let subject: string | undefined;
    if (demo) {
      if (req.headers.authorization !== undefined || supplied !== undefined) return void res.writeHead(400).end();
    } else {
      if (!config || !keys) return void res.writeHead(503).end();
      const token = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '')?.[1];
      if (!token) return void res.writeHead(401, { 'WWW-Authenticate': 'Bearer' }).end();
      try {
        const { payload } = await jwtVerify(token, keys, {
          issuer: config.issuer, audience: config.audience, algorithms: ['RS256'], requiredClaims: ['exp', 'sub'],
        });
        const clientId = payload.azp ?? payload.client_id;
        if (!isGoogleSubject(payload.sub) || clientId !== config.clientId) return void res.writeHead(403).end();
        subject = payload.sub;
      } catch (error) {
        if (error instanceof errors.JOSEError && error.code !== 'ERR_JOSE_GENERIC' &&
          !(error instanceof errors.JWKSTimeout) && !(error instanceof errors.JWKSInvalid)) {
          return void res.writeHead(401, { 'WWW-Authenticate': 'Bearer error="invalid_token"' }).end();
        }
        return void res.writeHead(503).end();
      }
    }
    if (supplied !== undefined && !isProviderKey(supplied)) {
      return void res.writeHead(400).end();
    }
    const key = supplied ?? sharedKey;
    return handler(req, res, { key, member: supplied ? subject : undefined });
  };
}
