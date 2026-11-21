import type { Instrument, Sample } from './music.ts';

const tau = 2 * Math.PI;
const rate = 24000;
type MouthSound = (seconds: number, breath: number, hiss: number) => number;

function syllable(duration: number, voice: MouthSound): Sample {
  const samples = new Float32Array(Math.round(duration * rate));
  let seed = 73;
  let breath = 0;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    breath += .45 * (noise - breath);
    const fade = Math.min(1, i / 24, (samples.length - 1 - i) / 180);
    samples[i] = voice(i / rate, breath, noise - breath) * fade;
  }
  return { samples, rate, articulation: 'beatbox' };
}

// A burst of air at the lips gives way to a low, falling thump.
const lipKick: MouthSound = (t, breath) => {
  const phase = tau * (54 * t + 2.2 * (1 - Math.exp(-48 * t)));
  return .72 * Math.sin(phase) * Math.exp(-14 * t) + .26 * breath * Math.exp(-125 * t);
};

// The closed-lip pop opens into the longer unvoiced "f".
const pfSnare: MouthSound = (t, breath, hiss) => {
  const pop = Math.sin(tau * (175 * t + .65 * (1 - Math.exp(-55 * t))));
  const puff = (.88 * breath + .22 * hiss) * (1 - Math.exp(-200 * t));
  return .42 * pop * Math.exp(-48 * t) + puff * Math.exp(-20 * t);
};

const tssHat: MouthSound = (t, _breath, hiss) =>
  .68 * hiss * Math.exp(-32 * t) + .13 * Math.sin(tau * 3450 * t) * Math.exp(-160 * t);

// The tongue releases into a rounded "oo" on middle C. The score supplies the melody.
const dooVocal: MouthSound = (t, breath) => {
  const phase = tau * (261.6256 * t - .55 * (1 - Math.exp(-34 * t))) + .055 * Math.sin(tau * 5 * t);
  const vowel = .32 * Math.sin(phase) + .16 * Math.sin(2 * phase)
    + .12 * Math.sin(3 * phase) + .065 * Math.sin(4 * phase);
  return vowel * (1 - Math.exp(-62 * t)) * Math.exp(-5 * t) + .12 * breath * Math.exp(-95 * t);
};

export function createBeatboxPack(baseUrl: string): Instrument[] {
  return [
    { id: 'beatbox-kick', name: 'Lip Kick', role: 'kick', kind: 'drum',
      image: baseUrl + 'drawings/drum.svg', sample: syllable(.32, lipKick) },
    { id: 'beatbox-snare', name: 'Pf Snare', role: 'snare', kind: 'pencil',
      image: baseUrl + 'drawings/mouth.svg', sample: syllable(.22, pfSnare) },
    { id: 'beatbox-hat', name: 'Tss Hat', role: 'shaker', kind: 'keys',
      image: baseUrl + 'drawings/zigzag.svg', sample: syllable(.115, tssHat) },
    { id: 'beatbox-vocal', name: 'Doo Vocal', role: 'melody', kind: 'whistle',
      image: baseUrl + 'drawings/microphone.svg', sample: syllable(.39, dooVocal) },
  ];
}
