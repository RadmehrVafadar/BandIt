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

export class BeatEngine {
  readonly pending = new Map<number, Change>();
  private readonly mixer = new AudioMixer(() => this.ensemble.players.size);
  private readonly accompaniment = renderAccompaniment();
  private ensemble: Ensemble;
  private audibleEnsemble: Ensemble;
  private signatureEnds = new Map<string, number>();
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
    return this.timer !== undefined;
  }

  get scheduledSlots() {
    return this.slots;
  }

  get arrangement() {
    return this.slots.map((id, index) => {
      const change = this.pending.get(index);
      return change ? change.id : id;
    });
  }

  async audio() {
    const context = this.mixer.context;
    if (context.state !== 'running') await context.resume();
    return context;
  }

  async play() {
    const context = await this.audio();
    if (this.running) return;
    this.resumeStep = this.next;
    this.anchor = context.currentTime + 0.055 - this.playhead * STEP_SECONDS;
    this.timer = window.setInterval(this.schedule, 22);
    this.schedule();
    this.draw();
  }

  pause() {
    if (!this.running) return;
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

  change(slot: number, id: string | null) {
    if (!this.running) {
      this.pending.delete(slot);
      this.slots = this.slots.map((current, index) => index === slot ? id : current);
      this.audibleSlots = this.slots;
      this.audibleEnsemble = this.ensemble = this.buildEnsemble();
      this.onFrame({ step: this.position, hits: [], slots: this.slots });
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
    for (const [id, player] of players) {
      if ('stem' in player) this.mixer.play(id, player.stem, time, player.accent ? .62 : 1, 0, phase * STEP_SECONDS, duration);
    }
    const { bass, strings } = this.accompaniment[Math.floor(phase / BAR_STEPS)];
    if (bass && players.size >= 2) this.mixer.play(null, bass, time, 1, 0, beat * STEP_SECONDS, duration);
    if (strings && players.size >= 3) this.mixer.play(null, strings, time, 1, 0, beat * STEP_SECONDS, duration);
  }

  private applyPendingChanges(step: number, time: number) {
    const applied = new Map<number, Change>();
    if (step % BAR_STEPS !== 0 || !this.pending.size) return applied;
    this.slots = this.slots.map((id, index) => {
      const change = this.pending.get(index);
      if (!change || change.at > step) return id;
      applied.set(index, change);
      this.pending.delete(index);
      if (id && id !== change.id) {
        this.signatureEnds.delete(id);
        this.mixer.fadeOut(id, time);
      }
      return change.id;
    });
    if (applied.size) this.ensemble = this.buildEnsemble();
    return applied;
  }

  private playStep(step: number, time: number) {
    if (step % BAR_STEPS === 0 || this.resumeStep === step) this.playBar(step, time);
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
      if ('beatbox' in player) this.mixer.play(id, player.beatbox, hitTime, level, pitch);
      else if (player.accent) this.playAccent(id, player.accent, offset, hitTime, level);
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

  private playAccent(id: string, accent: Accent, step: number, time: number, level: number) {
    const { sample, steps } = accent;
    const featured = steps.has(step);
    if (featured && time >= (this.signatureEnds.get(id) ?? 0)) {
      this.mixer.play(id, sample, time, .80 * level);
      this.signatureEnds.set(id, time + sample.samples.length / sample.rate);
    }
    if (sample.articulation === 'whinny') {
      if (!featured) this.mixer.play(id, hoofbeats(), time, .46 * level);
      this.mixer.play(id, horsePluck(), time, (featured ? .25 : .38) * level, chords[Math.floor(step / BAR_STEPS)].root);
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
