import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { soundHandler } from '../server/handler.ts';
import { withProviderKey } from '../server/access.ts';

import { redisSoundCache } from '../server/shared-cache.ts';

const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
const [url, token] = UPSTASH_REDIS_REST_URL || UPSTASH_REDIS_REST_TOKEN
  ? [UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN]
  : [KV_REST_API_URL, KV_REST_API_TOKEN];
if (Boolean(url) !== Boolean(token)) throw new Error('Incomplete Redis sound cache configuration');
const shared = url && token ? redisSoundCache(url, token) : undefined;

export default withProviderKey(soundHandler(join(tmpdir(), 'pocket-band-sounds'), shared), process.env.ELEVENLABS_API_KEY);
