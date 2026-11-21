import type { Sample } from './music.ts';

type Mix = 'band' | 'solo';
type PlayOptions = { pitch?: number; offset?: number; duration?: number; mix?: Mix };
type ActiveSource = { id: string | null; gain: GainNode; level: number; startsAt: number; mix?: Mix; fadeAt?: number };

export class AudioMixer {
  private output?: { context: AudioContext; input: DynamicsCompressorNode };
  private readonly buffers = new WeakMap<Sample, AudioBuffer>();
  private readonly sources = new Map<AudioBufferSourceNode, ActiveSource>();
  private soloId: string | null = null;

  constructor(private readonly playerCount: () => number) {}

  private get graph() {
    if (!this.output) {
      // iOS routes Web Audio as ambient sound unless the page requests media playback.
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
      const context = new AudioContext({ latencyHint: 'interactive' });
      const input = context.createDynamicsCompressor();
      input.threshold.value = -15;
      input.ratio.value = 5;
      const master = context.createGain();
      master.gain.value = 0.85;
      input.connect(master).connect(context.destination);
      this.output = { context, input };
    }
    return this.output;
  }

  get context() {
    return this.graph.context;
  }

  get solo() {
    return this.soloId;
  }

  private audibleLevel({ id, level, mix }: ActiveSource) {
    if (this.soloId !== null) return this.soloId === id && mix !== 'band' ? level : 0;
    if (mix === 'solo') return 0;
    // Leave a little more headroom for overlapping tails with each new player.
    return level / (1 + .08 * Math.max(0, this.playerCount() - 1));
  }

  setSolo(soloId: string | null) {
    this.soloId = soloId;
    for (const hit of this.sources.values()) {
      const now = hit.gain.context.currentTime;
      if (hit.fadeAt === undefined || now < hit.fadeAt) hit.gain.gain.setTargetAtTime(this.audibleLevel(hit), now, .005);
    }
  }

  play(id: string | null, sample: Sample, time: number, level: number, options: PlayOptions = {}) {
    const { pitch = 0, offset = 0, duration, mix } = options;
    const { context, input } = this.graph;
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
    const hit = { id, gain, level, mix, startsAt: time };
    gain.gain.value = this.audibleLevel(hit);
    source.connect(gain).connect(input);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    this.sources.set(source, hit);
    source.start(time, offset, duration);
  }

  private stop(source: AudioBufferSourceNode, hit: ActiveSource, time: number) {
    if (hit.fadeAt !== undefined && hit.fadeAt <= time) return;
    hit.fadeAt = time;
    if (time <= hit.startsAt) {
      source.stop(time);
      return;
    }
    hit.gain.gain.cancelScheduledValues(time);
    hit.gain.gain.setTargetAtTime(0, time, .003);
    source.stop(time + .015);
  }

  fadeOut(id: string, time: number) {
    for (const [source, hit] of this.sources) {
      if (hit.id === id) this.stop(source, hit, time);
    }
  }

  fadeBacking(time: number) {
    for (const [source, hit] of this.sources) {
      if (hit.mix === 'band') this.stop(source, hit, time);
    }
  }

  stopAll() {
    for (const [source, hit] of this.sources) this.stop(source, hit, hit.gain.context.currentTime);
    this.sources.clear();
  }

  close() {
    if (this.output) void this.output.context.close();
  }
}
