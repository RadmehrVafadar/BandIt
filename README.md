# BandIt

BandIt turns sketches and photos into playable objects.
Tilt your phone to send them into the screen edges, or build a band that bounces to the beat.
The whole screen is a black canvas with white ink and floating controls.
The rainbow note logo holds still when reduced motion is enabled.

## Features

- Draw with a mouse, finger, or pen and pick a matching illustration from **Choose a sound**.
- Sketch objects from all 345 Quick, Draw! categories, or draw a bell or whistle.
- Hear a lone object's own sound, from a keyring jingle to a horse's whinny.
- Build a ten-second groove from up to four drawings on a shared 96 BPM clock.
- Click an object's headphones to toggle solo, or hold to hear it until you release.
- Open an empty slot to add a beatbox voice, photograph an object, or bring back a saved one.

## Quick start

```bash
npm ci
npm run dev
```

Open the localhost URL Vite prints.

On iPhone, open the site over HTTPS, draw with your finger, and tap a sound.
Allow motion access when prompted, then tilt or shake the phone to send the object into a screen edge.
Each impact plays that object's sound once.
Tap **Tilt to play** to switch between motion and the beat.
With Reduced Motion enabled or motion access unavailable, the beat is available by default.
If an in-app browser waits for a playback gesture, tap **Play** after the object appears.

For camera recognition, put `GEMINI_API_KEY=your-key` in the project's ignored `.env.local` and restart Vite.
Open an empty **+** slot, choose **Camera**, allow camera access, and select **Take photo**.
BandIt sends that frame to Gemini and adds the identified object to the slot you chose.
If Gemini returns an ambiguous label such as “mouse,” you can choose the animal or the computer accessory before adding it.
Familiar objects use their game illustration and sound.
Other objects use the photo and a built-in sound.
A computer mouse keeps its photo and plays a click.
Camera access requires localhost or HTTPS.

For live sounds, put `ELEVENLABS_API_KEY=your-key` in the project's ignored `.env.local` and restart Vite.
For sound generation, the server sends the selected label to ElevenLabs and requests a short one-shot.
Keys, Drum, and Cup ship with generated clips in `public/demo-sounds/`.
Run `npm run sounds:demo` before rehearsal to fill any missing clips.
Listen to the MP3s and remove an individual clip before rerunning the command if you want another take.
Horse plays without an API key using a trimmed [public-domain field recording by Hü](https://commons.wikimedia.org/wiki/File:Wiehern.ogg).
In beat playback, new drawings join a running band on a bar boundary.
Other labels generate on first use and reuse the server's `.sound-cache/` on subsequent requests.
The band keeps playing while a new sound loads, and uses a built-in voice if sound generation is unavailable.

## Demo

For a beatbox demo, open an empty **+** slot and choose **Lip Kick** under **Beatbox**.
Add **Pf Snare**, **Tss Hat**, and **Doo Vocal** to hear all four parts together, or mix a voice with a drawing.
BandIt synthesizes these original sounds locally and saves the selected slots across reloads.
Hear the full band in the [ten-second beatbox preview](docs/samples/beatbox.wav).

1. Draw a key with a round head and a toothed shaft.
2. Choose **Keys** to replace your sketch with the keys illustration.
3. Watch it drop to the floor and listen for the jingle when it lands.
4. Draw a drum and choose **Drum** to add its thump on the next bar.
5. Add **Cup** for a hollow backbeat and **Bell** for a pitched hook.
6. Use the **×** on Bell's slot to remove it, then draw a horse and listen for its neigh over the melody.
7. Hold the horse's headphones to hear it alone while the other drawings dim, then release to hear the previous mix.
8. Click **Pause**, remove Horse, and choose **Bell** from the empty slot to bring it back.

Drum, Keys, Cup, and Bell each have a recorded four-bar part and play without an API key.
A lone drawing plays its own sample, as does a drawing selected with the headphones.
In a band, other drawings take an available part and play their own sound over a quieter backing.
Short taps can follow the whole rhythm, while long sounds like a starting engine get room to finish.
If a loop file is unavailable, the browser recreates its arrangement from the built-in instrument.
After installing Playwright Chromium, edit the [shared score](src/loop-score.ts) and run `node scripts/render-loops.ts` to rebuild the four WAV files.

**Tabletop Bingo** opens with a three-note bell call answered lower, then repeats the call up to B-flat.
The drum carries a plucked bass line between kicks, the cup rings in two pitches on the backbeat, and the keyring leaves the last beat open for the return to C minor.
Listen to the [full mix](docs/samples/tabletop-bingo.wav) or hear the previous and revised grooves at equal loudness in the [before-and-after clip](docs/samples/original-and-loops.wav).
Hear the instruments enter one per bar in the [layered demo](docs/samples/building-the-band.wav), or compare the [horse call](public/demo-sounds/horse.wav) with the [horse and drum duet](docs/samples/horse-and-drum.wav).
The [bass and strings comparison](docs/samples/bass-and-strings.wav) demonstrates how those backing parts enter in the previous arrangement.
The editable exports cover the four drawing layers using General MIDI instruments. [MIDI](docs/samples/tabletop-bingo.mid) · [music-production project](docs/samples/tabletop-bingo.json) · [music-production skill](https://github.com/owoevan-dev/music-skill)

Sketch recognition runs in a browser worker using [DoodleNet by Yining Shi](https://github.com/yining1023/doodleNet), trained on the [Google Quick, Draw! dataset](https://github.com/googlecreativelab/quickdraw-dataset) (CC BY 4.0).
The site serves the [model weights and matching labels](https://github.com/ml5js/ml5-data-and-models/tree/main/models/doodlenet) with the app and keeps drawings on the device.
Close matches to the original six instrument templates remain available, and these templates provide suggestions if the model cannot load.
The strip shows up to eight illustrated guesses in ranked order and scrolls horizontally on smaller screens.
Picking an illustration adds it to the stage where you drew and gives it the selected object's sound.
In beat playback, bouncing objects knock each other sideways and settle back toward where you placed them, with each landing timed to the beat.
Reduced motion keeps performers in place.
Try one bell to hear the melody, then draw more bells to add the pulse, backbeat, and offbeats.
The harmony moves through Cm7, A-flat major 7, E-flat 6, and G7 before returning to C minor.
With two or more drawings, a quieter bass joins on the offbeat in the second bar.
With three or four, soft strings enter halfway through the phrase and release before it repeats.
Soloing a drawing mutes the other players and all backing parts.
Lineup changes take effect on the next downbeat in a running band and immediately in phone motion.
For how sound and stage animation stay in sync across lineup changes and pauses, see the [playback guide](docs/playback.md).
In a band, Horse plays soft hoofbeats and a plucked string between full-length calls.
Multiple horses take turns whinnying.
The mixer balances sustained sounds against short taps and leaves a little more headroom with each added object.
BandIt saves the selected illustrations, positions, and sounds in IndexedDB for the current browser profile and origin.
Older recorded instruments already onstage still use their images and recordings.

Most suggestion drawings come from the [AutoDraw artists](https://www.autodraw.com/artists), with the source stencil credited inside each SVG.
BandIt supplies the church, face, knife, lighter, rifle, and zigzag drawings.
The layered beat is inspired by [Incredibox](https://www.incredibox.com/demo/).

## Verification

```bash
npm run check
npm run lint
npm test
npx playwright install chromium webkit
npm run test:e2e
npm run build
```

The browser tests exercise camera capture with a simulated webcam, ambiguous labels, interrupted touch strokes, mobile audio startup, phone motion and wall impacts, alongside beat playback and persistence.
Set `BANDIT_CHROME` to use an existing Chrome or Chromium executable.
For a local demo of the built app with live generation, run `npm run build` followed by `npm run preview`.
Static hosting serves bundled demo clips and built-in voices; live generation requires the sound endpoint on a server with the API key.

On Vercel, set `ELEVENLABS_API_KEY` in the Production environment and redeploy to enable live generation at `/api/sounds`.
Set `GEMINI_API_KEY` in the deployment environment and redeploy to enable camera recognition at `/api/identify`.
The function and recognition worker import the same bundled object labels.
The browser saves successfully decoded generated clips by object name and reuses them across drawings and reloads.
Connect Upstash for Redis from Vercel Storage and redeploy to use the injected `KV_REST_API_URL` and `KV_REST_API_TOKEN` across users and cold starts.
For manual setup, set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for the same Redis database and redeploy.
Concurrent requests for an uncached object share one generation, and completed clips have no expiry.
Without Redis, each warm instance keeps its own temporary server cache.
New car drawings use a starter motor cranking, catching and idling, and the sequencer preserves the generated recording.
