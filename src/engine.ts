import { partSample } from './part-sample.ts';
import { hoofbeats, horseCallSteps } from './horse.ts';
import { BAR_STEPS, STEP_SECONDS, PHRASE, arrange, bounceHeight, phrase, updateQueue } from './music.ts';
import type { Change, Instrument, Part, Sample, Slots } from './music.ts';

type Frame = { step: number; hits: number[]; slots: Slots };
type Player = { part: Part; events: ReturnType<typeof phrase>; sample: Sample; whinnySteps?: Set<number> };
type ScheduledFrame = Frame & { ensemble: Map<string, Player>; time: number; applied: Map<number, Change> };
const LOOKAHEAD = 0.105;

export class BeatEngine {
  readonly pending = new Map<number, Change>();
  private context?: AudioContext;
  private compressorInput!: DynamicsCompressorNode;
  private buffers = new WeakMap<Sample, AudioBuffer>();
  private songNodes = new Map<AudioBufferSourceNode, { id: string; gain: GainNode; level: number; preview: boolean }>();
  private ensemble: Map<string, Player>;
  private audibleEnsemble: Map<string, Player>;
  private variants = new WeakMap<Sample, Map<Part, Sample>>();
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

  constructor(
    slots: Slots,
    private readonly instruments: Map<string, Instrument>,
    private readonly onFrame: (frame: Frame) => void,
    private readonly onClock: (step: number, landed: string[]) => void,
    savedParts = new Map<string, Part>(),
  ) {
    this.slots = slots;
    this.audibleSlots = slots;
    this.ensemble = this.buildEnsemble(savedParts);
    this.audibleEnsemble = this.ensemble;
  }

  private assign(slots: Slots, previous = new Map(Array.from(this.ensemble ?? [], ([id, player]) => [id, player.part]))) {
    const players = slots.flatMap(id => id && this.instruments.has(id) ? [this.instruments.get(id)!] : []);
    return arrange(players, previous);
  }

  get plannedParts() {
    return this.assign(this.arrangement);
  }

  private buildEnsemble(previous?: Map<string, Part>) {
    const parts = this.assign(this.slots, previous);
    const horses = [...parts.keys()].filter(id => this.instruments.get(id)!.sample.articulation === 'whinny');
    return new Map(Array.from(parts, ([id, part]) => {
      const { sample } = this.instruments.get(id)!;
      const variants = this.variants.get(sample) ?? new Map<Part, Sample>();
      if (!variants.has(part)) variants.set(part, partSample(sample, part));
      this.variants.set(sample, variants);
      const events = phrase(part, parts.size === 1);
      const horseIndex = horses.indexOf(id);
      const whinnySteps = horseIndex < 0 ? undefined : horseCallSteps(events, horseIndex, horses.length, parts.size);
      return [id, { part, events, sample: variants.get(part)!, whinnySteps }];
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
      if (hit.preview) continue;
      hit.gain.gain.setTargetAtTime(this.audibleLevel(hit.id, hit.level), hit.gain.context.currentTime, 0.005);
    }
  }

  dispose() {
    this.pause();
    if (this.context) void this.context.close();
  }

  preview({ id, sample }: Instrument) {
    return new Promise<void>(resolve => this.hit(id, sample, this.context!.currentTime, 0.85, 0, resolve));
  }

  private audibleLevel(id: string, level: number) {
    if (this.soloId !== null) return this.soloId === id ? level : 0;
    // Leave a little more headroom for overlapping tails with each new player.
    return level / (1 + .08 * Math.max(0, this.ensemble.size - 1));
  }

  private hit(id: string, sample: Sample, time: number, level: number, pitch: number, ended?: () => void) {
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
    gain.gain.value = ended ? level : this.audibleLevel(id, level);
    source.connect(gain).connect(this.compressorInput);
    source.onended = () => {
      this.songNodes.delete(source);
      source.disconnect();
      gain.disconnect();
      ended?.();
    };
    this.songNodes.set(source, { id, gain, level, preview: !!ended });
    source.start(time);
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
          return change.id;
        });
      }
      if (applied.size) this.ensemble = this.buildEnsemble();
      const hits: number[] = [];
      if (time >= now - 0.025) {
        this.slots.forEach((id, index) => {
          if (!id) return;
          const player = this.ensemble.get(id);
          const event = player?.events.find(([offset]) => offset === step % PHRASE);
          if (!player || !event) return;
          const [, level, pitch = 0] = event;
          const clop = player.whinnySteps?.has(event[0]) === false;
          const sample = clop ? hoofbeats() : player.sample;
          this.hit(id, sample, time, clop ? level * .58 : level, sample.preserveRecording ? 0 : pitch);
          hits.push(index);
        });
      }
      this.frames.push({ step, time, hits, slots: this.slots, ensemble: this.ensemble, applied });
    }
  };

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
