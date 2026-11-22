# Beat playback

BandIt plays each object's own sample on a phone motion impact or schedules its part against the beat clock.

## Why

The audio engine schedules ahead to keep the beat steady.
The stage follows the sound reaching the speakers so you see a landing when you hear its note.

## How it works

1. The ensemble assigns each occupied slot a part, using the previous lineup to keep existing parts where possible.
2. The beat engine applies queued lineup changes on a bar boundary and schedules the next sounds from the shared score.
3. The mixer reuses an audio buffer for each sample and gives every playing source its own gain so solo changes also affect sounds already in progress.
4. The animation reads the audio output timestamp and displays the lineup and hits for the step that has reached the speakers.

### Stage layout

The tray starts with four **+** slots, each centered on its own stage column.
On desktop, filling the tray adds another column and the tray scrolls horizontally when it outgrows the screen.
A fresh drawing starts where you drew it.
Picking it again through **+** saves its new column placement and scales the artwork to fit.

Each floor landing gives the object a random neon tint and matching glow that fade together over 460 ms.
During beat playback, the object rebounds a little left or right and favors open space near the edges.
Reduced Motion uses a softer tint on the stationary performer during beat playback.

A lone object plays its sample on its assigned rhythm.
In a band, click the headphones to isolate that sample and mute the backing, or hold them to listen until you release.
On browsers with the Audio Session API, the mixer requests media playback when the user starts audio.

### Phone motion

With motion access, tilting the phone accelerates a single object across the screen and a firm shake sends it toward an edge.
Phone playback uses a fixed gravity of 13% and shake sensitivity of 5%.
The stage keeps the strongest shake between animation frames, including a shake through the face of the phone.
An edge impact plays the object's sample once, and a floor impact also triggers the landing glow.
Adding a second object starts the beat, and returning to one object restores motion playback unless it has a recorded rhythm.
For a saved band, the permission prompt waits until one playing object needs the sensor.
Pausing freezes movement and sound and discards shakes made while paused.
The beat takes over when motion permission is denied or the browser supplies no usable readings.
On iPhone, open the studio over HTTPS and grant motion access when prompted.
Tap **Play** if the browser waits for a playback gesture after the object appears.

### Loop my rhythm

With one object onstage, choose **Loop my rhythm**.
Tap the object or give the phone a firm shake to start the bar.
Each strike sounds immediately, and four beat marks show how much of the bar has elapsed.
The first strike sets the downbeat, and replay snaps each hit to the nearest sixteenth note.
At 96 BPM the bar lasts 2.5 seconds.
The object repeats its own sample on that rhythm, including when a second instrument joins on the next bar.
You can add that instrument while the take is still recording.

The studio saves the rhythm with the object's ID in the current browser.
With that object alone, choose **Record again** to replace its rhythm or **Clear rhythm** to restore its usual playback.
Pausing or canceling an unfinished take keeps the previous recording.

### Pausing between beats

Audio for the next bar can already be scheduled while the stage still shows the previous lineup.
Pausing stops all sources, restores the audible lineup, and requeues changes scheduled for beats the listener has yet to hear.
On resume, stems and accompaniment start at the offset for the next step so they stay in phase.

### Score and recordings

Tabletop Bingo loops four bars at 96 BPM through Cm7, A-flat major 7, E-flat 6, and G7.
Try Keys, Drum, Cup, and Bell to hear the keyring offbeats, kick and plucked bass, two-pitch backbeat, and three-note bell call.
Other drawings can take an available part and play their own sound over its backing.
Short sounds can follow each hit, while longer recordings get time to finish.
In a band, horses take turns whinnying over hoofbeats and a plucked string.
With at least two objects, a quieter bass enters in the second bar, and with three, soft strings enter in the third.

| Listening example | What to listen for |
| --- | --- |
| [Tabletop Bingo](samples/tabletop-bingo.wav) | The full four-part groove |
| [Building the band](samples/building-the-band.wav) | The instruments enter one per bar |
| [Before and after](samples/original-and-loops.wav) | Earlier and revised grooves at equal loudness |
| [Bass and strings](samples/bass-and-strings.wav) | The backing parts in the earlier arrangement |
| [Horse and drum](samples/horse-and-drum.wav) | The [horse recording](../public/demo-sounds/horse.wav) against the beat |
| [Beatbox](samples/beatbox.wav) | Lip Kick, Pf Snare, Tss Hat, and Doo Vocal together |

The editable arrangement uses General MIDI instruments. [MIDI](samples/tabletop-bingo.mid) · [Music-production project](samples/tabletop-bingo.json) · [Music-production skill](https://github.com/owoevan-dev/music-skill)
The layered beat was inspired by [Incredibox](https://www.incredibox.com/demo/).

### Rebuilding the loops

Edit the shared score, then run these commands from the repository root to regenerate the four WAVs in `public/loops/`.
If a bundled loop fails to load, the browser renders the same score with its built-in instrument.

```sh
npx playwright install chromium
node scripts/render-loops.ts
```

Set `BANDIT_CHROME` to use an existing Chrome or Chromium executable for the renderer or browser tests.

## Key files

- For the playback clock, queued changes, and animation frames, see [engine.ts](../src/engine.ts).
- For how a part selects a stem, recorded accent, or beatbox voice, see [ensemble.ts](../src/ensemble.ts).
- For Web Audio buffers, source gains, and fades, see [audio-mixer.ts](../src/audio-mixer.ts).
- For sensor permission and edge collisions, see [usePhoneMotion.ts](../src/usePhoneMotion.ts) and [phone-motion.ts](../src/phone-motion.ts).
- For the four-bar score shared by playback and the loop renderer, see [loop-score.ts](../src/loop-score.ts).

## Related

- [Object recognition](recognition.md)
- [Object sounds](sounds.md)
