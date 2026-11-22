# BandIt

BandIt turns sketches and photos into a band you can play in a browser.
The React and TypeScript studio uses Web Audio for playback and shares its API handlers between Vite and Vercel.

## Commands

```sh
npm ci                                    # Install the locked dependencies.
npm run dev                               # Start the studio and local API.
npm run check                             # Type-check the project.
npm run lint                              # Run ESLint.
npm test                                  # Run the unit suite with Node's test runner.
node --test tests/unit/sketch.test.ts     # Run one unit test file.
npx playwright install chromium webkit    # Install the browsers used by the test suite.
npm run test:e2e                          # Test the production preview in Playwright.
npm run build                             # Type-check and build the studio into dist/.
npm run preview                           # Serve the existing build and the local API.
```

## Repo map

```text
src/           Studio UI, recognition worker, audio engine, and browser storage
public/        Model weights, illustrations, recordings, and rendered loops
auth/          Auth0 configuration shared by the browser and API
server/        Provider access, request handlers, and the sound cache
api/           Vercel function entry points
scripts/       Renderers for the bundled loops and logo
tests/         Node unit tests, Playwright browser tests, and provider fixtures
docs/          Concept guides and listening samples
```

## Conventions

- Include file extensions in relative TypeScript imports so Node can run tests and scripts directly.
- Keep access checks and provider calls in `server/` so the Vite middleware and Vercel functions use the same rules.
- Preserve saved instrument IDs and the IndexedDB store layout so returning players can load their recordings and mixes.
- Edit the shared score and regenerate its WAVs together so downloaded loops and synthesized fallbacks stay in sync.

## Docs

- Before changing sign-in, provider keys, or library ownership, read [authentication](docs/authentication.md).
- Before changing sketch or photo matching, read [object recognition](docs/recognition.md).
- Before changing recordings, provider requests, or caching, read [object sounds](docs/sounds.md).
- Before changing timing, stage motion, or the score, read [beat playback](docs/playback.md).
