# BandIt

BandIt turns sketches of everyday objects into a beat that plays every time they hit the floor.
The whole screen is a black canvas with white ink and floating controls.
The rainbow note logo holds still when reduced motion is enabled.

## Features

- Draw with a mouse, finger, or pen and pick a matching illustration from **Choose a sound**.
- Sketch objects from all 345 Quick, Draw! categories, or draw a bell or whistle.
- Hear each object join the beat with its own sound, from a keyring jingle to a horse's whinny.
- Layer up to four objects on a shared 100 BPM grid, each with its own rhythm and sound.
- Click an occupied slot to hear its object on its own, then click it again to restore the mix.
- Reopen your mix paused in the same browser or click an empty slot to bring back a saved object.

## Quick start

```bash
npm ci
npm run dev
```

Open the localhost URL Vite prints.

For live sounds, put `ELEVENLABS_API_KEY=your-key` in the project's ignored `.env.local` and restart Vite.
Only the selected label goes to the local server, which requests a short one-shot from ElevenLabs.
Keys, Drum, and Cup ship with generated clips in `public/demo-sounds/`.
Run `npm run sounds:demo` before rehearsal to fill any missing clips.
Listen to the MP3s and remove an individual clip before rerunning the command if you want another take.
Horse plays without an API key using a trimmed [public-domain field recording by Hü](https://commons.wikimedia.org/wiki/File:Wiehern.ogg).
The app plays a new clip once before adding it to the beat.
Other labels generate on first use and reuse the server's `.sound-cache/` on subsequent requests.
The band keeps playing while a new sound loads, and uses a built-in voice if sound generation is unavailable.

## Demo

1. Draw a key with a round head and a toothed shaft.
2. Choose **Keys** to replace your sketch with the keys illustration.
3. Watch it drop to the floor and listen for the jingle when it lands.
4. Draw a drum and choose **Drum** to add its thump on the next bar.
5. Click **Pause** to stop playback, or use the **×** on an object's slot to remove it from the mix.
6. Click any empty slot and choose **Keys** or **Drum** to bring the removed object back into that slot.

Hear the [horse call](public/demo-sounds/horse.wav), the [horse with a drum](docs/samples/horse-and-drum.wav), or the [mix as drum, keys, and cup join](docs/samples/building-the-band.wav).

Recognition runs in a browser worker using [DoodleNet by Yining Shi](https://github.com/yining1023/doodleNet), trained on the [Google Quick, Draw! dataset](https://github.com/googlecreativelab/quickdraw-dataset) (CC BY 4.0).
The site serves the [model weights and matching labels](https://github.com/ml5js/ml5-data-and-models/tree/main/models/doodlenet) with the app and keeps drawings on the device.
Close matches to the original six instrument templates remain available, and these templates provide suggestions if the model cannot load.
The strip shows up to eight illustrated guesses in ranked order and scrolls horizontally on smaller screens.
Picking an illustration adds it to the stage where you drew and gives it the selected object's sound.
Try one bell to hear a four-bar melody, then add three more to hear a bass line, clipped backbeat, and muted offbeats underneath it.
The bass and melody move through C minor, A-flat major, E-flat major, and G minor before returning to C.
A lone object marks the start of each bar, and lineup changes land on the next downbeat.
The horse plays soft hoofbeats between full-length calls and calls less often when other objects join.
Multiple horses take turns whinnying.
The mixer balances sustained sounds against short taps and leaves a little more headroom with each added object.
BandIt saves the selected illustrations, positions, and sounds in IndexedDB for the current browser profile and origin.
Older recorded instruments already onstage still use their images and recordings.
The picker in each empty slot shows saved instruments that are available to add.

Most suggestion drawings come from the [AutoDraw artists](https://www.autodraw.com/artists), with the source stencil credited inside each SVG.
BandIt supplies the church, face, knife, lighter, rifle, and zigzag drawings.
The layered beat is inspired by [Incredibox](https://www.incredibox.com/demo/).

## Verification

```bash
npm run check
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

The browser tests exercise full-viewport drawing, touch gestures, saved-slot selection, sound timing, solo playback, pause and resume, persistence, and reduced motion.
Set `BANDIT_CHROME` to use an existing Chrome or Chromium executable.
For a local demo of the built app with live generation, run `npm run build` followed by `npm run preview`.
Static hosting serves bundled demo clips and built-in voices; live generation requires the sound endpoint on a server with the API key.

On Vercel, set `ELEVENLABS_API_KEY` in the Production environment and redeploy to enable live generation at `/api/sounds`.
The function and recognition worker import the same bundled object labels.
The browser saves successfully decoded generated clips by object name and reuses them across drawings and reloads.
Connect Upstash for Redis from Vercel Storage and redeploy to use the injected `KV_REST_API_URL` and `KV_REST_API_TOKEN` across users and cold starts.
For manual setup, set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for the same Redis database and redeploy.
Concurrent requests for an uncached object share one generation, and completed clips have no expiry.
Without Redis, each warm instance keeps its own temporary server cache.
New car drawings use a starter motor cranking, catching and idling, and the sequencer preserves the generated recording.
