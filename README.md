# BandIt

BandIt turns sketches and photos into instruments you can play together in your browser.

[Play the demo](https://www.bandit.select/?demo) · [Hear the ten-second Tabletop Bingo mix](docs/samples/tabletop-bingo.wav)

## Features

- Draw with a mouse, finger, or pen and choose from illustrated sound suggestions.
- Add a photo, a saved object, or one of four beatbox voices to an empty slot.
- Shake a phone to play one object on impact, or add a second object to start a four-bar groove.
- Tap an object's headphones to toggle solo, or hold them to listen until you release.
- Return to your saved instruments and lineup in the same browser.

## Quick start

Use Node.js with built-in TypeScript support and npm.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints and choose **See demo**.
Draw a key, choose **Keys**, then add **Drum** to hear the two parts together.
The bundled instruments play without provider keys.

## Docs

- [Object recognition](docs/recognition.md) covers sketch suggestions, photos, and illustration credits.
- [Beat playback](docs/playback.md) explains phone motion, the four-bar score, and how to rebuild the loops.
- [Object sounds](docs/sounds.md) covers recordings, generated clips, and caching.
- [Sign-in and the public demo](docs/authentication.md) explains local libraries, provider keys, and hosting.
