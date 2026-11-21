# Beat playback

BandIt schedules sound slightly ahead of the audio clock and animates each landing when the listener hears it.

## How it works

1. The ensemble assigns each occupied slot a part, using the previous lineup to keep existing parts where possible.
2. The beat engine applies queued lineup changes on a bar boundary and schedules the next sounds from the shared score.
3. The mixer reuses an audio buffer for each sample and gives every playing source its own gain so solo changes also affect sounds already in progress.
4. The animation reads the audio output timestamp and displays the lineup and hits for the step that has reached the speakers.

## Pausing between beats

Audio for the next bar can already be scheduled while the stage still shows the previous lineup.
Pausing stops all sources, restores the audible lineup, and requeues changes scheduled for beats the listener has yet to hear.
On resume, stems and accompaniment start at the offset for the next step so they stay in phase.

## Key files

- For the playback clock, queued changes, and animation frames, see [engine.ts](../src/engine.ts).
- For how a part selects a stem, recorded accent, or beatbox voice, see [ensemble.ts](../src/ensemble.ts).
- For Web Audio buffers, source gains, and fades, see [audio-mixer.ts](../src/audio-mixer.ts).
- For the four-bar score shared by playback and the loop renderer, see [loop-score.ts](../src/loop-score.ts).
