# Pocket Band

Pocket Band turns photos and sounds from everyday objects into instruments you can add to a live loop.

## Features

- Play a 100 BPM starter groove with a mug kick and pen snare.
- Photograph or upload an object and record a two-second sound.
- Preview four musical parts and choose between a cutout and a square crop.
- Add or remove stage instruments at the next bar while playing.
- Reopen your instrument tray and stage arrangement in the same browser.

## Quick start

```bash
npm ci
npm run dev
```

Open the localhost URL Vite prints.
Camera and microphone permissions are requested when you open the camera or record sound.

## Docs

### Demo

1. Press **Play** to start the Mug and Pen groove.
2. Choose **Add object**, place your keys against a plain background, and take a photo.
3. Press **Record sound** and shake the keys when the recording indicator appears.
4. Choose **Shaker**, name the instrument, and press **Save to tray**.
5. Tap an empty stage slot and watch the keys enter on the next bar and move on their hits.
6. Tap the keys onstage to queue removal, then select them in the tray to add them again.
7. Reload to confirm the tray and active arrangement return paused.

### HTTPS deployment

Build with `npm run build` and publish the `dist/` directory to a static HTTPS host.
Open the HTTPS URL directly on the phone.
A plain HTTP URL on the local network does not grant camera or microphone access on another device.
Recordings, photos, and arrangement data stay in IndexedDB for the current browser profile and origin.
[Media capture requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

### Verification

```bash
npm run check
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

The browser suite uses generated camera and microphone fixtures.
Set `POCKET_BAND_CHROME` to a local Chromium or Chrome executable if you want to use it in place of Playwright's bundled browser.
For the physical-device check, run the demo on iPhone Safari and desktop Chrome with speakers on.
Verify camera and mic permissions, mute during the take, and continuity when capture is canceled.
Fill all four slots and listen for two minutes to check for drift or restarts.
