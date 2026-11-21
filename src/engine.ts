import { BAR_STEPS, STEP_SECONDS, patterns, updateQueue } from './music.ts';
import type { Change, Instrument, Role, Sample, Slots } from './music.ts';

type Frame = { step: number; hits: number[]; slots: Slots };
type ScheduledFrame = Frame & { time: number };
const LOOKAHEAD = 0.105;

export class BeatEngine {
  readonly pending = new Map<number, Change>();
  private context?: AudioContext;
  private output?: GainNode;
  private compressorInput!: DynamicsCompressorNode;
  private buffers = new WeakMap<Sample, AudioBuffer>();
  private songNodes = new Set<AudioBufferSourceNode>();
  private previewNodes = new Set<AudioBufferSourceNode>();
  private slots: Slots;
  private frames: ScheduledFrame[] = [];
  private timer?: number;
  private animation = 0;
  private anchor = 0;
  private next = 0;
  private position = -1;
  private muted = false;

  constructor(
    slots: Slots,
    private readonly instruments: Map<string, Instrument>,
    private readonly onFrame: (frame: Frame) => void,
  ) {
    this.slots = slots;
  }

  get running() {
    return this.timer !== undefined;
  }

  get scheduledSlots() {
    return this.slots;
  }

  async audio() {
    if (!this.context) {
      const context = new AudioContext({ latencyHint: 'interactive' });
      const compressor = context.createDynamicsCompressor();
      this.compressorInput = compressor;
      compressor.threshold.value = -15;
      compressor.ratio.value = 5;
      this.output = context.createGain();
      this.output.gain.value = this.muted ? 0 : 0.85;
      compressor.connect(this.output).connect(context.destination);
      this.context = context;
    }
    if (this.context.state !== 'running') await this.context.resume();
    return this.context;
  }

  async play() {
    await this.audio();
    if (this.running) return;
    this.anchor = this.context!.currentTime + 0.055 - this.next * STEP_SECONDS;
    this.timer = window.setInterval(this.schedule, 22);
    this.schedule();
    this.draw();
  }

  pause() {
    if (!this.running) return;
    clearInterval(this.timer);
    this.timer = undefined;
    cancelAnimationFrame(this.animation);
    this.stop(this.songNodes);
    this.next = this.position + 1;
    this.frames = [];
    this.onFrame({ step: this.position, hits: [], slots: this.slots });
  }

  change(slot: number, id: string | null) {
    if (!this.running) {
      this.pending.delete(slot);
      this.slots = this.slots.map((current, index) => index === slot ? id : current);
      this.onFrame({ step: this.position, hits: [], slots: this.slots });
      return;
    }
    updateQueue(this.slots, this.pending, slot, id, this.next);
  }

  mute(muted: boolean) {
    this.muted = muted;
    if (this.context && this.output) {
      this.output.gain.setValueAtTime(muted ? 0 : 0.85, this.context.currentTime);
    }
  }

  async preview(sample: Sample, role?: Role) {
    const context = await this.audio();
    this.stopPreview();
    const start = context.currentTime + 0.025;
    if (role) {
      for (const [step, level, pitch = 0] of patterns[role]) {
        this.hit(sample, start + step * STEP_SECONDS, level, pitch, this.previewNodes);
      }
    } else {
      this.hit(sample, start, 0.85, 0, this.previewNodes);
    }
  }

  stopPreview() {
    this.stop(this.previewNodes);
  }

  private stop(nodes: Set<AudioBufferSourceNode>) {
    for (const node of nodes) node.stop();
    nodes.clear();
  }

  private hit(sample: Sample, time: number, level: number, pitch: number, nodes: Set<AudioBufferSourceNode>) {
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
    gain.gain.value = level;
    source.connect(gain).connect(this.compressorInput);
    source.onended = () => {
      nodes.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    nodes.add(source);
    source.start(time);
  }

  private schedule = () => {
    const now = this.context!.currentTime;
    while (this.anchor + this.next * STEP_SECONDS < now + LOOKAHEAD) {
      const step = this.next++;
      const time = this.anchor + step * STEP_SECONDS;
      const beat = step % BAR_STEPS;
      if (beat === 0 && this.pending.size) {
        this.slots = this.slots.map((id, index) => {
          const change = this.pending.get(index);
          if (!change || change.at > step) return id;
          this.pending.delete(index);
          return change.id;
        });
      }
      const hits: number[] = [];
      if (time >= now - 0.025) {
        this.slots.forEach((id, index) => {
          const instrument = id ? this.instruments.get(id) : undefined;
          if (!instrument) return;
          const event = patterns[instrument.role].find(([offset]) => offset === beat);
          if (!event) return;
          const [, level, pitch = 0] = event;
          this.hit(instrument.sample, time, level, pitch, this.songNodes);
          hits.push(index);
        });
      }
      this.frames.push({ step, time, hits, slots: this.slots });
    }
  };

  private draw = () => {
    const context = this.context!;
    const timestamp = context.getOutputTimestamp?.();
    const now = timestamp?.performanceTime && timestamp.contextTime !== undefined
      ? Math.min(context.currentTime, timestamp.contextTime + (performance.now() - timestamp.performanceTime) / 1000)
      : context.currentTime;
    let frame: ScheduledFrame | undefined;
    while (this.frames.length && this.frames[0].time <= now) frame = this.frames.shift();
    if (frame) {
      this.position = frame.step;
      this.onFrame(frame);
    }
    this.animation = requestAnimationFrame(this.draw);
  };
}
