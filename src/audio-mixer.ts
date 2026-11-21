import type { Sample } from './music.ts';

type ActiveSource = { id: string | null; gain: GainNode; level: number };

export class AudioMixer {
  private output?: { context: AudioContext; input: DynamicsCompressorNode };
  private readonly buffers = new WeakMap<Sample, AudioBuffer>();
  private readonly sources = new Map<AudioBufferSourceNode, ActiveSource>();
  private soloId: string | null = null;

  constructor(private readonly playerCount: () => number) {}

  private get graph() {
    if (!this.output) {
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

  private audibleLevel(id: string | null, level: number) {
    if (this.soloId !== null) return this.soloId === id ? level : 0;
    // Leave a little more headroom for overlapping tails with each new player.
    return level / (1 + .08 * Math.max(0, this.playerCount() - 1));
  }

  setSolo(soloId: string | null) {
    this.soloId = soloId;
    for (const { id, gain, level } of this.sources.values()) {
      gain.gain.setTargetAtTime(this.audibleLevel(id, level), gain.context.currentTime, 0.005);
    }
  }

  play(id: string | null, sample: Sample, time: number, level: number, pitch = 0, offset = 0, duration?: number) {
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
    gain.gain.value = this.audibleLevel(id, level);
    source.connect(gain).connect(input);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    this.sources.set(source, { id, gain, level });
    source.start(time, offset, duration);
  }

  fadeOut(id: string, time: number) {
    for (const [source, hit] of this.sources) {
      if (hit.id !== id) continue;
      hit.gain.gain.setTargetAtTime(0, time, .003);
      source.stop(time + .015);
    }
  }

  stopAll() {
    for (const source of this.sources.keys()) source.stop();
    this.sources.clear();
  }

  close() {
    if (this.output) void this.output.context.close();
  }
}
