import { renderAccompaniment } from './accompaniment.ts';
import { hoofbeats, horseCallSteps, horsePluck } from './horse.ts';
import { chordRoots, loopScore, loopVoice, nativePart, signatureSteps } from './loop-score.ts';
import type { LoopBank } from './loops.ts';
import { BAR_STEPS, STEP_SECONDS, PHRASE, arrange, bounceHeight, updateQueue } from './music.ts';
import type { Change, Hit, Instrument, Part, Sample, Slots } from './music.ts';

type Frame = { step: number; hits: number[]; slots: Slots };
type Player = { part: Part; events: readonly Hit[]; stem: Sample; accent?: { sample: Sample; steps: Set<number> } };
type ScheduledFrame = Frame & { ensemble: Map<string, Player>; time: number; applied: Map<number, Change> };
const LOOKAHEAD = 0.105;

export class BeatEngine {
  readonly pending = new Map<number, Change>();
  private context?: AudioContext;
  private compressorInput!: DynamicsCompressorNode;
  private buffers = new WeakMap<Sample, AudioBuffer>();
  private songNodes = new Map<AudioBufferSourceNode, { id: string | null; gain: GainNode; level: number }>();
  private readonly accompaniment = renderAccompaniment();
  private ensemble: Map<string, Player>;
  private audibleEnsemble: Map<string, Player>;
  private signatureEnds = new Map<string, number>();
  private soloId: string | null = null;
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

  private assign(slots: Slots, previous = new Map(Array.from(this.ensemble ?? [], ([id, player]) => [id, player.part]))) {
    const players = slots.flatMap(id => {
      const item = id && this.instruments.get(id);
      return item ? [{ id: item.id, role: item.role, nativePart: nativePart(item) }] : [];
    });
    return arrange(players, previous);
  }

  get plannedParts() {
    return this.assign(this.arrangement);
  }

  private buildEnsemble(previous?: Map<string, Part>) {
    const parts = this.assign(this.slots, previous);
    const horses = [...parts.keys()].filter(id => this.instruments.get(id)!.sample.articulation === 'whinny');
    return new Map<string, Player>(Array.from(parts, ([id, part]): [string, Player] => {
      const item = this.instruments.get(id)!;
      const { sample } = item;
      const events = loopScore[loopVoice[part]];
      const player: Player = { part, events, stem: this.loops.get(part)! };
      if (nativePart(item) === part && !sample.preserveRecording) return [id, player];
      const horseIndex = horses.indexOf(id);
      const steps = horseIndex < 0 ? signatureSteps(events, sample.samples.length / sample.rate)
        : horseCallSteps(events, horseIndex, horses.length, parts.size);
      return [id, { ...player, accent: { sample, steps } }];
    }));
  }

  part(id: string) {
    return this.audibleEnsemble.get(id)?.part;
  }

  height(id: string, step: number, enteredAt: number) {
    const player = this.audibleEnsemble.get(id) ?? this.ensemble.get(id);
    return player ? bounceHeight(player.events, step, enteredAt) : 1;
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
    if (!this.context) {
      const context = new AudioContext({ latencyHint: 'interactive' });
      const compressor = context.createDynamicsCompressor();
      this.compressorInput = compressor;
      compressor.threshold.value = -15;
      compressor.ratio.value = 5;
      const output = context.createGain();
      output.gain.value = 0.85;
      compressor.connect(output).connect(context.destination);
      this.context = context;
    }
    if (this.context.state !== 'running') await this.context.resume();
    return this.context;
  }

  async play() {
    await this.audio();
    if (this.running) return;
    this.resumeStep = this.next;
    this.anchor = this.context!.currentTime + 0.055 - this.playhead * STEP_SECONDS;
    this.timer = window.setInterval(this.schedule, 22);
    this.schedule();
    this.draw();
  }

  pause() {
    if (!this.running) return;
    clearInterval(this.timer);
    this.timer = undefined;
    cancelAnimationFrame(this.animation);
    for (const node of this.songNodes.keys()) node.stop();
    this.songNodes.clear();
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
    this.soloId = id;
    for (const hit of this.songNodes.values()) {
      hit.gain.gain.setTargetAtTime(this.audibleLevel(hit.id, hit.level), hit.gain.context.currentTime, 0.005);
    }
  }

  dispose() {
    this.pause();
    if (this.context) void this.context.close();
  }

  private audibleLevel(id: string | null, level: number) {
    if (this.soloId !== null) return this.soloId === id ? level : 0;
    // Leave a little more headroom for overlapping tails with each new player.
    return level / (1 + .08 * Math.max(0, this.ensemble.size - 1));
  }

  private hit(id: string | null, sample: Sample, time: number, level: number, pitch = 0, offset = 0, duration?: number) {
    const context = this.context!;
    let buffer = this.buffers.get(sample);
    if (!buffer) {
      buffer = context.createBuffer(1, sample.samples.length, sample.rate);
      buffer.getChannelData(0).set(sample.samples);
      this.buffers.set(sample, buffer);
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = 2 ** (pitch / 12);
    gain.gain.value = this.audibleLevel(id, level);
    source.connect(gain).connect(this.compressorInput);
    source.onended = () => {
      this.songNodes.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    this.songNodes.set(source, { id, gain, level });
    source.start(time, offset, duration);
  }

  private playBar(step: number, time: number) {
    const phase = step % PHRASE;
    const beat = step % BAR_STEPS;
    const duration = (BAR_STEPS - beat) * STEP_SECONDS;
    for (const [id, player] of this.ensemble) {
      this.hit(id, player.stem, time, player.accent ? .62 : 1, 0, phase * STEP_SECONDS, duration);
    }
    const { bass, strings } = this.accompaniment[Math.floor(phase / BAR_STEPS)];
    if (bass && this.ensemble.size >= 2) this.hit(null, bass, time, 1, 0, beat * STEP_SECONDS, duration);
    if (strings && this.ensemble.size >= 3) this.hit(null, strings, time, 1, 0, beat * STEP_SECONDS, duration);
  }

  private schedule = () => {
    const now = this.context!.currentTime;
    while (this.anchor + this.next * STEP_SECONDS < now + LOOKAHEAD) {
      const step = this.next++;
      const time = this.anchor + step * STEP_SECONDS;
      const beat = step % BAR_STEPS;
      const applied = new Map<number, Change>();
      if (beat === 0 && this.pending.size) {
        this.slots = this.slots.map((id, index) => {
          const change = this.pending.get(index);
          if (!change || change.at > step) return id;
          applied.set(index, change);
          this.pending.delete(index);
          if (id && id !== change.id) {
            this.signatureEnds.delete(id);
            for (const [source, hit] of this.songNodes) {
              if (hit.id !== id) continue;
              hit.gain.gain.setTargetAtTime(0, time, .003);
              source.stop(time + .015);
            }
          }
          return change.id;
        });
      }
      if (applied.size) this.ensemble = this.buildEnsemble();
      const hits: number[] = [];
      if (time >= now - 0.025) {
        if (beat === 0 || this.resumeStep === step) this.playBar(step, time);
        this.slots.forEach((id, index) => {
          if (!id) return;
          const player = this.ensemble.get(id);
          if (!player) return;
          const offset = step % PHRASE;
          const { accent } = player;
          const event = player.events.find(([at]) => at === offset);
          if (!event) return;
          hits.push(index);
          if (accent) this.playAccent(id, accent, offset, time, event[1]);
        });
      } else this.resumeStep = step + 1;
      this.frames.push({ step, time, hits, slots: this.slots, ensemble: this.ensemble, applied });
    }
  };

  private playAccent(id: string, accent: NonNullable<Player['accent']>, step: number, time: number, level: number) {
    const { sample, steps } = accent;
    const featured = steps.has(step);
    if (featured && time >= (this.signatureEnds.get(id) ?? 0)) {
      this.hit(id, sample, time, .80 * level);
      this.signatureEnds.set(id, time + sample.samples.length / sample.rate);
    }
    if (sample.articulation === 'whinny') {
      if (!featured) this.hit(id, hoofbeats(), time, .46 * level);
      this.hit(id, horsePluck(), time, (featured ? .25 : .38) * level, chordRoots[Math.floor(step / BAR_STEPS)]);
    }
  }

  private draw = () => {
    const context = this.context!;
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
