import sfx from '@audio/synth-sfx';
import type { SfxOptions } from '@audio/synth-sfx';
import type { Sample } from './music.ts';
import type { ObjectKind } from './sketch.ts';

// The kind supplies the beat and suggestion icon. The synth patch supplies the sound.
type Voice = { kind: ObjectKind; patch: SfxOptions & { freq: number; release: number } };
type Family = [labels: string, kind: ObjectKind, patch: Voice['patch']];

const pluck: Voice = { kind: 'whistle', patch: {
  shape: 'triangle', freq: 261.63, sustain: 0.015, release: 0.22, lowpass: 2000,
} };

const families: Family[] = [
  ['ear face nose yoga mouth smiley_face eye brain The_Mona_Lisa',
    'whistle', { shape: 'sine', freq: 329.63, attack: 0.04, sustain: 0.075, release: 0.15, vibrato: 5, vibratoDepth: 0.035 }],
  ['square octagon line circle squiggle triangle hexagon zigzag',
    'whistle', { shape: 'square', freq: 392, arp: 1.33, arpAt: 0.055, sustain: 0.075, release: 0.12, lowpass: 1450 }],
  ['moon',
    'bell', { shape: 'sine', freq: 523.25, attack: 0.035, sustain: 0.08, release: 0.65, vibrato: 3, vibratoDepth: 0.006, arp: 1.5, arpAt: 0.19 }],
  ['star sun snowflake rainbow diamond angel crown chandelier snowman lantern flower',
    'bell', { shape: 'triangle', freq: 783.99, sustain: 0.025, release: 0.36, arp: 1.5, arpAt: 0.085 }],
  ['bird flamingo parrot penguin swan duck',
    'whistle', { shape: 'sine', freq: 1046.5, slide: 3, arp: 0.67, arpAt: 0.055, sustain: 0.1, release: 0.085 }],
  ['owl whale',
    'whistle', { shape: 'sine', freq: 261.63, slide: -0.9, attack: 0.035, sustain: 0.12, release: 0.25 }],
  ['bee mosquito ant butterfly spider scorpion',
    'keys', { shape: 'saw', freq: 196, vibrato: 34, vibratoDepth: 0.16, sustain: 0.12, release: 0.08 }],
  ['dog bear tiger lion dragon crocodile bat',
    'drum', { shape: 'saw', freq: 116.54, slide: -3, vibrato: 35, vibratoDepth: 0.32, lowpass: 960, sustain: 0.065, release: 0.16 }],
  ['cow sheep elephant camel giraffe zebra horse rhinoceros',
    'whistle', { shape: 'saw', freq: 146.83, slide: -1.2, attack: 0.04, sustain: 0.17, release: 0.18, lowpass: 760 }],
  ['frog pig',
    'cup', { shape: 'square', freq: 146.83, slide: -4, vibrato: 26, vibratoDepth: 0.28, lowpass: 1200, sustain: 0.08, release: 0.1 }],
  ['cat dolphin monkey mouse squirrel rabbit hedgehog raccoon panda kangaroo',
    'whistle', { shape: 'triangle', freq: 523.25, slide: 2.5, arp: 0.68, arpAt: 0.095, sustain: 0.14, release: 0.14 }],
  ['snake grass bush leaf tree palm_tree feather house_plant cactus camouflage garden broom rake',
    'keys', { shape: 'noise', freq: 420, attack: 0.025, sustain: 0.035, release: 0.17, lowpass: 4100 }],
  ['pond river sink bathtub pool hot_tub ice_cream popsicle toothpaste teapot fish shark octopus sea_turtle lobster crab snail',
    'cup', { shape: 'sine', freq: 523.25, slide: -9, sustain: 0.02, release: 0.15 }],
  ['ocean beach rain garden_hose waterslide dishwasher toilet snorkel',
    'keys', { shape: 'noise', freq: 600, attack: 0.035, sustain: 0.08, release: 0.24, lowpass: 2500 }],
  ['cloud hurricane tornado windmill parachute hot_air_balloon mountain',
    'keys', { shape: 'noise', freq: 180, attack: 0.055, sustain: 0.12, release: 0.28, lowpass: 850 }],
  ['campfire fireplace matches lightning candle lighter',
    'pencil', { shape: 'noise', freq: 180, sustain: 0.014, release: 0.16, crush: 0.85, lowpass: 2500 }],
  ['airplane helicopter motorbike truck pickup_truck tractor van car bus school_bus bulldozer speedboat cruise_ship train aircraft_carrier',
    'drum', { shape: 'saw', freq: 98, slide: 1.6, vibrato: 19, vibratoDepth: 0.12, lowpass: 670, sustain: 0.13, release: 0.14 }],
  ['ambulance firetruck police_car',
    'whistle', { shape: 'triangle', freq: 659.25, vibrato: 2.8, vibratoDepth: 0.25, sustain: 0.22, release: 0.12 }],
  ['fan ceiling_fan washing_machine drill saw oven toaster roller_coaster stove',
    'keys', { shape: 'saw', freq: 130.81, vibrato: 23, vibratoDepth: 0.2, sustain: 0.085, release: 0.11, lowpass: 1250 }],
  ['alarm_clock telephone cell_phone church hospital lighthouse castle bicycle',
    'bell', { shape: 'triangle', freq: 783.99, vibrato: 18, vibratoDepth: 0.04, sustain: 0.085, release: 0.24 }],
  ['computer laptop calculator microwave television remote_control traffic_light spreadsheet camera flashlight light_bulb streetlight stethoscope compass floor_lamp power_outlet',
    'cup', { shape: 'square', freq: 659.25, arp: 1.5, arpAt: 0.045, sustain: 0.06, release: 0.085, lowpass: 2300 }],
  ['flying_saucer submarine mermaid',
    'whistle', { shape: 'sine', freq: 392, slide: 2.4, vibrato: 6, vibratoDepth: 0.14, sustain: 0.12, release: 0.24 }],
  ['guitar harp piano keyboard',
    'whistle', { shape: 'triangle', freq: 261.63, attack: 0.002, sustain: 0.024, release: 0.39 }],
  ['violin cello saxophone clarinet trombone trumpet megaphone microphone stereo radio headphones',
    'whistle', { shape: 'saw', freq: 261.63, attack: 0.032, sustain: 0.09, release: 0.18, vibrato: 5, vibratoDepth: 0.012, lowpass: 1750 }],
  ['mug coffee_cup vase wine_glass wine_bottle eyeglasses hourglass binoculars lipstick',
    'cup', { shape: 'sine', freq: 783.99, sustain: 0.008, release: 0.27 }],
  ['anvil hammer nail sword axe frying_pan fork spoon knife pliers screwdriver shovel scissors paper_clip bracelet necklace bucket paint_can bottlecap mailbox fire_hydrant dumbbell helmet stop_sign The_Eiffel_Tower',
    'bell', { shape: 'square', freq: 392, arp: 1.41, arpAt: 0.018, sustain: 0.012, release: 0.19, lowpass: 2600 }],
  ['shoe flip_flops foot leg knee elbow hand finger toe arm skull tooth soccer_ball basketball baseball hockey_puck skateboard rollerskates wheel animal_migration cannon rifle',
    'drum', { shape: 'sine', freq: 130.81, slide: -8, sustain: 0.014, release: 0.16 }],
  ['clock wristwatch marker crayon paintbrush toothbrush stitches eraser syringe',
    'pencil', { shape: 'noise', freq: 600, sustain: 0.004, release: 0.055, lowpass: 4200 }],
  ['door ladder chair bench table dresser fence stairs swing_set see_saw bed house barn bridge hockey_stick baseball_bat golf_club tennis_racquet boomerang canoe sailboat diving_board couch jail skyscraper The_Great_Wall_of_China picture_frame basket cooler',
    'cup', { shape: 'triangle', freq: 196, slide: -2, sustain: 0.008, release: 0.12 }],
  ['book envelope map postcard calendar passport backpack jacket shorts pants hat t-shirt underwear sock sweater sleeping_bag pillow bandage tent purse bowtie belt umbrella suitcase teddy-bear beard moustache goatee',
    'keys', { shape: 'noise', freq: 300, sustain: 0.02, release: 0.12, lowpass: 1600 }],
  ['apple pineapple blackberry blueberry strawberry watermelon carrot broccoli asparagus peas grapes banana onion string_bean peanut potato pear bread cookie mushroom lollipop steak cake birthday_cake hot_dog pizza donut sandwich hamburger',
    'cup', { shape: 'triangle', freq: 349.23, slide: -5, sustain: 0.016, release: 0.11 }],
];

const voices = new Map<string, Voice>();
for (const [labels, kind, patch] of families) {
  for (const label of labels.split(' ')) voices.set(label, { kind, patch });
}

export function drawingVoice(label: string): Voice {
  return voices.get(label) ?? pluck;
}

export function drawingSample(label: string): Sample {
  if (label === 'car') {
    const rate = 44100;
    const samples = new Float32Array(Math.round(rate * .94));
    let phase = 0;
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate;
      const starting = t < .38;
      const frequency = starting ? 115 + 22 * Math.sin(2 * Math.PI * 9 * t)
        : 48 + 52 * Math.exp(-4 * (t - .38));
      phase += 2 * Math.PI * frequency / rate;
      const crank = starting ? .2 + .8 * Math.sin(Math.PI * 9 * t) ** 2 : 1;
      const engine = Math.sin(phase) + .42 * Math.sin(phase * 2) + .24 * Math.sin(phase * 5);
      samples[i] = .33 * engine * crank * Math.min(1, t / .01, (samples.length - 1 - i) / (rate * .17));
    }
    return { samples, rate, preserveRecording: true };
  }
  const { patch } = drawingVoice(label);
  let seed = 2166136261;
  for (const char of label) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  // Keep relatives in the same musical scale while varying pitch, tail and brightness.
  const semitones = [-5, -2, 0, 3, 5, 7, 10, 12][seed % 8];
  const tail = 0.8 + ((seed >>> 8) & 255) / 512;
  const brightness = 0.8 + ((seed >>> 16) & 255) / 512;
  const rate = 44100;
  const samples = sfx(patch, {
    freq: patch.freq * 2 ** (semitones / 12), release: patch.release * tail,
    lowpass: (patch.lowpass ?? 6000) * brightness, amp: 0.65, seed, fs: rate,
  });
  // Fade the synth's truncated exponential tail to zero before the next hit.
  for (let i = 0; i < 80; i++) samples[samples.length - 1 - i] *= i / 80;
  return { samples, rate };
}
