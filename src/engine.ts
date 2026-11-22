import { renderAccompaniment } from './accompaniment.ts';
import { AudioMixer } from './audio-mixer.ts';
import { assignParts, buildEnsemble } from './ensemble.ts';
import type { Accent, Ensemble } from './ensemble.ts';
import { hoofbeats, horsePluck } from './horse.ts';
import { chords, hitDelay, loopScore } from './loop-score.ts';
import type { LoopBank } from './loops.ts';
import { BAR_STEPS, STEP_SECONDS, PHRASE, bounceHeight, updateQueue } from './music.ts';
import type { Change, Instrument, Part, Slots } from './music.ts';

type Frame = { step: number; hits: number[]; slots: Slots };
type ScheduledFrame = Frame & { ensemble: Ensemble; time: number; applied: Map<number, Change> };
const LOOKAHEAD = 0.105;

function setSlot(slots: Slots, index: number, id: string | null) {
  while (slots.length < index) slots.push(null);
  slots[index] = id;
}

export class BeatEngine {
  readonly pending = new Map<number, Change>();
  private readonly mixer = new AudioMixer(() => this.ensemble.players.size);
  private readonly accompaniment = renderAccompaniment();
  private ensemble: Ensemble;
  private audibleEnsemble: Ensemble;
  private signatureEnds = new Map<string, number>();
  private motionEnabled = false;
  private playing = false;
  private slots: Slots;
  private frames: ScheduledFrame[] = [];
  private timer?: number;
  private animation = 0;
  private anchor = 0;
  private next = 0;
  private position = -1;
  private playhead = -2.4;
  private audibleSlots: Slots;
  private resumeStep = 0;

  constructor(
    slots: Slots,
    private readonly instruments: Map<string, Instrument>,
    private readonly onFrame: (frame: Frame) => void,
    private readonly onClock: (step: number, landed: string[]) => void,
    private readonly loops: LoopBank,
    savedParts = new Map<string, Part>(),
  ) {
    this.slots = slots;
    this.audibleSlots = slots;
    this.ensemble = this.buildEnsemble(savedParts);
    this.audibleEnsemble = this.ensemble;
  }

  get plannedParts() {
    return assignParts(this.arrangement, this.instruments, this.ensemble.parts);
  }

  private buildEnsemble(previous = this.ensemble.parts) {
    return buildEnsemble(this.slots, this.instruments, this.loops, previous);
  }

  part(id: string) {
    return this.audibleEnsemble.parts.get(id);
  }

  height(id: string, step: number, enteredAt: number) {
    const player = this.audibleEnsemble.players.get(id) ?? this.ensemble.players.get(id);
    return player ? bounceHeight(loopScore[player.voice], step, enteredAt) : 1;
  }

  get running() {
    return this.playing;
  }

  get scheduledSlots() {
    return this.slots;
  }

  get arrangement() {
    const slots = [...this.slots];
    for (const [index, change] of this.pending) setSlot(slots, index, change.id);
    return slots;
  }

  get audioContext() {
    return this.mixer.context;
  }

  async resumeAudio() {
    const context = this.audioContext;
    if (context.state !== 'running') await context.resume();
  }

  async play() {
    await this.resumeAudio();
    if (this.running) return;
    this.playing = true;
    if (!this.motionEnabled) this.startClock();
  }

  private startClock() {
    this.resumeStep = this.next;
    this.anchor = this.mixer.context.currentTime + 0.055 - this.playhead * STEP_SECONDS;
    this.timer = window.setInterval(this.schedule, 22);
    this.schedule();
    this.draw();
  }

  pause() {
    if (!this.running) return;
    this.playing = false;
    clearInterval(this.timer);
    this.timer = undefined;
    cancelAnimationFrame(this.animation);
    this.mixer.stopAll();
    this.signatureEnds.clear();
    for (const frame of this.frames) {
      for (const [index, change] of frame.applied) {
        if (!this.pending.has(index)) this.pending.set(index, change);
      }
    }
    this.slots = this.audibleSlots;
    this.ensemble = this.audibleEnsemble;
    this.next = this.position + 1;
    this.frames = [];
    this.onFrame({ step: this.position, hits: [], slots: this.slots });
  }

  setMotionEnabled(enabled: boolean) {
    if (enabled === this.motionEnabled) return;
    const wasPlaying = this.running;
    this.pause();
    this.motionEnabled = enabled;
    if (enabled && this.pending.size) {
      const slots = this.arrangement;
      this.pending.clear();
      this.showSlots(slots);
    }
    this.playing = wasPlaying;
    if (wasPlaying && !enabled) this.startClock();
  }

  playImpact(id: string) {
    if (!this.motionEnabled || !this.running || !this.slots.includes(id)) return;
    if (this.mixer.solo !== null && this.mixer.solo !== id) return;
    const sample = this.instruments.get(id)?.sample;
    const context = this.mixer.context;
    if (!sample || context.state !== 'running') return;
    this.mixer.fadeOut(id, context.currentTime);
    this.mixer.play(id, sample, context.currentTime, 1);
  }

  private showSlots(slots: Slots) {
    this.slots = this.audibleSlots = slots;
    this.audibleEnsemble = this.ensemble = this.buildEnsemble();
    this.onFrame({ step: this.position, hits: [], slots });
  }

  change(slot: number, id: string | null) {
    if (!this.running || this.motionEnabled) {
      this.pending.delete(slot);
      const previous = this.slots[slot];
      if (this.running && previous && previous !== id) this.mixer.fadeOut(previous, this.mixer.context.currentTime);
      const slots = [...this.slots];
      setSlot(slots, slot, id);
      this.showSlots(slots);
      return this.next;
    }
    updateQueue(this.slots, this.pending, slot, id, this.next);
    return this.pending.get(slot)?.at ?? this.next;
  }

  setSolo(id: string | null) {
    this.mixer.setSolo(id);
  }

  dispose() {
    this.pause();
    this.mixer.close();
  }

  private playBar(step: number, time: number) {
    const phase = step % PHRASE;
    const beat = step % BAR_STEPS;
    const duration = (BAR_STEPS - beat) * STEP_SECONDS;
    const { players } = this.ensemble;
    const stemSlice = { offset: phase * STEP_SECONDS, duration, mix: 'band' } as const;
    for (const [id, player] of players) {
      if ('stem' in player && player.stem) this.mixer.play(id, player.stem, time, player.accent ? .62 : 1, stemSlice);
    }
    const { bass, strings } = this.accompaniment[Math.floor(phase / BAR_STEPS)];
    const slice = { ...stemSlice, offset: beat * STEP_SECONDS };
    if (bass && players.size >= 2) this.mixer.play(null, bass, time, 1, slice);
    if (strings && players.size >= 3) this.mixer.play(null, strings, time, 1, slice);
  }

  private applyPendingChanges(step: number, time: number) {
    const applied = new Map<number, Change>();
    if (step % BAR_STEPS !== 0 || !this.pending.size) return applied;
    const slots = [...this.slots];
    for (const [index, change] of this.pending) {
      if (change.at > step) continue;
      applied.set(index, change);
      this.pending.delete(index);
      const id = slots[index];
      if (id && id !== change.id) {
        this.signatureEnds.delete(id);
        this.mixer.fadeOut(id, time);
      }
      setSlot(slots, index, change.id);
    }
    if (applied.size) {
      this.slots = slots;
      this.ensemble = this.buildEnsemble();
      if (this.ensemble.players.size < 2) this.mixer.fadeBacking(time);
    }
    return applied;
  }

  private playStep(step: number, time: number) {
    const band = this.ensemble.players.size > 1;
    if (band && (step % BAR_STEPS === 0 || this.resumeStep === step)) this.playBar(step, time);
    const offset = step % PHRASE;
    const hits: number[] = [];
    for (const [index, id] of this.slots.entries()) {
      if (!id) continue;
      const player = this.ensemble.players.get(id);
      if (!player) continue;
      const event = loopScore[player.voice].find(([at]) => at === offset);
      if (!event) continue;
      hits.push(index);
      const [, level, pitch] = event;
      const hitTime = time + hitDelay(player.voice, offset);
      if ('beatbox' in player) {
        this.mixer.play(id, player.beatbox, hitTime, level, { pitch });
      } else if (!band || this.mixer.solo === id) {
        const mix = band && !player.accent?.steps.has(offset) ? 'solo' : undefined;
        if (player.accent) this.playAccent(id, player.solo, offset, hitTime, level, mix);
        else this.mixer.play(id, player.solo.sample, hitTime, level, { pitch, mix });
      } else if (player.accent) {
        this.playAccent(id, player.accent, offset, hitTime, level, 'band');
      }
    }
    return hits;
  }

  private schedule = () => {
    const now = this.mixer.context.currentTime;
    while (this.anchor + this.next * STEP_SECONDS < now + LOOKAHEAD) {
      const step = this.next++;
      const time = this.anchor + step * STEP_SECONDS;
      const applied = this.applyPendingChanges(step, time);
      let hits: number[] = [];
      if (time >= now - 0.025) hits = this.playStep(step, time);
      else this.resumeStep = step + 1;
      this.frames.push({ step, time, hits, slots: this.slots, ensemble: this.ensemble, applied });
    }
  };

  private playAccent(id: string, accent: Accent, step: number, time: number, level: number, mix?: 'band' | 'solo') {
    const { sample, steps } = accent;
    const featured = steps.has(step);
    if (featured && time >= (this.signatureEnds.get(id) ?? 0)) {
      this.mixer.play(id, sample, time, .80 * level, { mix: mix === 'solo' ? 'solo' : undefined });
      this.signatureEnds.set(id, time + sample.samples.length / sample.rate);
    }
    if (mix === 'band' && sample.articulation === 'whinny') {
      if (!featured) this.mixer.play(id, hoofbeats(), time, .46 * level, { mix });
      const pitch = chords[Math.floor(step / BAR_STEPS)].root;
      this.mixer.play(id, horsePluck(), time, (featured ? .25 : .38) * level, { pitch, mix });
    }
  }

  private draw = () => {
    const context = this.mixer.context;
    const timestamp = context.getOutputTimestamp?.();
    const now = timestamp?.performanceTime && timestamp.contextTime !== undefined
      ? Math.min(context.currentTime, timestamp.contextTime + (performance.now() - timestamp.performanceTime) / 1000)
      : context.currentTime;
    let frame: ScheduledFrame | undefined;
    while (this.frames.length && this.frames[0].time <= now) {
      frame = this.frames.shift()!;
      this.position = frame.step;
      this.audibleSlots = frame.slots;
      this.audibleEnsemble = frame.ensemble;
    }
    if (frame) {
      this.onFrame(frame);
    }
    this.playhead = Math.max(this.playhead, (now - this.anchor) / STEP_SECONDS);
    this.onClock(this.playhead, frame ? frame.hits.map(index => frame.slots[index]!) : []);
    this.animation = requestAnimationFrame(this.draw);
  };
}
