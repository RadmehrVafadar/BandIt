import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { soundHandler } from '../server/handler.ts';

import { redisSoundCache } from '../server/shared-cache.ts';

const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = process.env;
if (Boolean(url) !== Boolean(token)) throw new Error('Incomplete Redis sound cache configuration');
const shared = url && token ? redisSoundCache(url, token) : undefined;

export default soundHandler(join(tmpdir(), 'pocket-band-sounds'), process.env.ELEVENLABS_API_KEY ?? '', shared);
