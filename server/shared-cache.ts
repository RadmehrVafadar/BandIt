import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export type SharedSoundCache = (id: string, generate?: () => Promise<Buffer>) => Promise<Buffer | undefined>;

// A single Redis key holds either a short generation lease or the finished MP3.
export function redisSoundCache(url: string, token: string, request = fetch): SharedSoundCache {
  async function command(...args: string[]) {
    const res = await request(url, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(args), signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error('Sound cache returned HTTP ' + res.status);
    const reply = await res.json() as { result: string | null; error?: string };
    if (reply.error) throw new Error('Sound cache command failed');
    return reply.result;
  }
  return async (id, generate) => {
    const key = 'bandit:sounds:' + id;
    const owner = 'pending:' + randomUUID();
    const deadline = Date.now() + 22000;
    do {
      const value = await command('GET', key);
      if (value && !value.startsWith('pending:')) return Buffer.from(value, 'base64');
      if (!generate) return;
      if (!value && await command('SET', key, owner, 'NX', 'EX', '60')) {
        const audio = await generate().catch(async error => {
          await command('EVAL', "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) end", '1', key, owner);
          throw error;
        });
        await command('SET', key, audio.toString('base64'));
        return audio;
      }
      await delay(250);
    } while (Date.now() < deadline);
    throw new Error('Object sound is still being generated');
  };
}
