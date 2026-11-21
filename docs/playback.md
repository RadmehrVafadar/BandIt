# Beat playback

BandIt plays each object's own sample on a phone motion impact or schedules its part against the beat clock.

## How it works

1. The ensemble assigns each occupied slot a part, using the previous lineup to keep existing parts where possible.
2. The beat engine applies queued lineup changes on a bar boundary and schedules the next sounds from the shared score.
3. The mixer reuses an audio buffer for each sample and gives every playing source its own gain so solo changes also affect sounds already in progress.
4. The animation reads the audio output timestamp and displays the lineup and hits for the step that has reached the speakers.

A lone object plays its sample on its assigned rhythm.
In a band, the headphones isolate that same sample and mute all backing, including any backing already playing.
On browsers with the Audio Session API, the mixer requests media playback when the user starts audio.

## Phone motion

On a touch device with motion access, a single object follows the phone automatically.
A steady tilt accelerates it across the screen, while a firm shake sends it toward an edge.
Phone playback uses a fixed gravity of 13% and shake sensitivity of 5%.
The stage keeps the strongest shake between animation frames, including a shake through the face of the phone.
A moving object plays its own sample when it reaches an edge and stays quiet while resting there.
Adding a second object starts the beat, and returning to one object restores motion playback.
For a saved band, the permission prompt waits until one playing object needs the sensor.
Pausing freezes movement and sound and discards shakes made while paused.
The beat takes over when motion permission is denied or the browser supplies no usable readings.

## Pausing between beats

Audio for the next bar can already be scheduled while the stage still shows the previous lineup.
Pausing stops all sources, restores the audible lineup, and requeues changes scheduled for beats the listener has yet to hear.
On resume, stems and accompaniment start at the offset for the next step so they stay in phase.

## Key files

- For the playback clock, queued changes, and animation frames, see [engine.ts](../src/engine.ts).
- For how a part selects a stem, recorded accent, or beatbox voice, see [ensemble.ts](../src/ensemble.ts).
- For Web Audio buffers, source gains, and fades, see [audio-mixer.ts](../src/audio-mixer.ts).
- For sensor permission and edge collisions, see [usePhoneMotion.ts](../src/usePhoneMotion.ts) and [phone-motion.ts](../src/phone-motion.ts).
- For the four-bar score shared by playback and the loop renderer, see [loop-score.ts](../src/loop-score.ts).
