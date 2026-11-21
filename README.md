# Pocket Band

Pocket Band turns sketches of everyday objects into a beat that plays every time they hit the floor.

## Features

- Draw with a mouse, finger, or pen and pick a matching illustration from the **Do you mean:** strip.
- Sketch objects from all 345 Quick, Draw! categories, or draw a bell or whistle.
- Hear an ElevenLabs sound effect for the selected object when it joins the beat.
- Layer up to four objects on a shared 100 BPM grid, each with its own rhythm and sound.
- Use an object's headphone button to hear it on its own, then press it again to restore the mix.
- Reopen your saved mix paused in the same browser.

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
The app plays a new clip once before adding it to the beat.
Other labels generate on first use and reuse the server's `.sound-cache/` on subsequent requests.
The band keeps playing while a new sound loads, and uses a built-in voice if sound generation is unavailable.

## Demo

1. Draw a key with a round head and a toothed shaft.
2. Choose the **Keys** illustration to give your original sketch a jingle.
3. Watch it drop to the floor and listen for the jingle when it lands.
4. Draw a drum and choose **Drum** to add its thump on the next bar.
5. Pause the mix or remove a layer with the **Remove** button in **Your mix**.

Recognition runs in a browser worker using [DoodleNet by Yining Shi](https://github.com/yining1023/doodleNet), trained on the [Google Quick, Draw! dataset](https://github.com/googlecreativelab/quickdraw-dataset) (CC BY 4.0).
The site serves the [model weights and matching labels](https://github.com/ml5js/ml5-data-and-models/tree/main/models/doodlenet) with the app and keeps drawings on the device.
Close matches to the original six instrument templates remain available, and these templates provide suggestions if the model cannot load.
The strip shows up to eight illustrated guesses in ranked order and scrolls horizontally on smaller screens.
Picking an illustration assigns its sound to your freehand drawing.
Try drawing four bells to hear a damped low pulse, a clipped backbeat, muted offbeats, and a ringing C-minor hook.
Every lineup uses the same two-bar score, with parts assigned to suit the sounds and changes landing on the next bar.
Pocket Band saves the original sketches, positions, and sounds in IndexedDB for the current browser profile and origin.
Older recorded instruments already onstage still use their images and recordings.
You can bring other previously saved instruments back from **Saved objects**.

Most suggestion drawings come from the [AutoDraw artists](https://www.autodraw.com/artists), with the source stencil credited inside each SVG.
Pocket Band supplies the church, face, knife, lighter, rifle, and zigzag drawings.
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

The browser tests exercise mouse and touch drawing, sound timing, solo playback, pause and resume, persistence, and reduced motion.
Set `POCKET_BAND_CHROME` to use an existing Chrome or Chromium executable.
For a local demo of the built app with live generation, run `npm run build` followed by `npm run preview`.
Static hosting serves bundled demo clips and built-in voices; live generation requires the sound endpoint on a server with the API key.
