# Object sounds

Each object starts with a local voice and can use a recording for its individual sound.

## Why

The band can keep playing while a clip loads or when a provider is unavailable.
Reusing generated recordings also avoids paying twice for the same sound.

## How it works

- Keys, Drum, and Cup have bundled MP3s, Bell uses its synthesized tone, and Horse uses a trimmed field recording. [Horse recording by Hü, public domain](https://commons.wikimedia.org/wiki/File:Wiehern.ogg)
- Beatbox voices are synthesized locally and can share a lineup with drawings.
- For other recognized labels, the browser checks its audio cache, then requests a short ElevenLabs sound effect through `POST /api/sounds`.
- The browser decodes the response before caching it, trims leading silence, and normalizes the level.
- If a clip is unavailable, the object keeps its built-in voice.

### Generation and caching

Add your own ElevenLabs key through **API keys** to generate a clip in either mode.
The server caches generated clips by object and signed-in account, or by object and a hash of the demo visitor's ElevenLabs key.
Concurrent requests for the same uncached sound share a generation within that scope.
Requests without a key can replay clips from the shared cache.

Vite stores generated clips in `.sound-cache/`.
A Vercel function uses its temporary directory and can share recordings across instances via Upstash Redis.
Connect Redis through Vercel Storage and redeploy to use `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
For manual configuration, supply the pair `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

### Rehearsal clips

Set `ELEVENLABS_API_KEY` in the ignored `.env.local` and run `npm run sounds:demo` to fill missing Keys, Drum, and Cup recordings in `public/demo-sounds/`.
The command reuses existing files.
To record another take, remove just that clip and rerun the command with a provider key.

## Key files

- [Browser sound loader](../src/sounds.ts) selects, decodes, and caches recordings.
- [Drawing sounds](../src/drawing-sounds.ts) and [beatbox voices](../src/beatbox.ts) synthesize local audio.
- [Sound bank](../server/sounds.ts) generates and caches provider recordings.
- [Shared cache](../server/shared-cache.ts) coordinates generation across Vercel instances.

## Related

- [Beat playback](playback.md)
- [Sign-in and provider keys](authentication.md)
