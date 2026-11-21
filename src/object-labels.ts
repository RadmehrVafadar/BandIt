import labels from './doodle-labels.json' with { type: 'json' };

export const objectLabels = new Map(labels.map(label => [label.toLowerCase().replaceAll('_', ' '), label]));
objectLabels.set('keys', 'key');
objectLabels.set('drum', 'drums');
objectLabels.set('bell', 'bell');
objectLabels.set('whistle', 'whistle');

// The first meaning in each pair is the one depicted by the bundled illustration.
export const photoMeanings = new Map<string, readonly [string, string]>([
  ['mouse', ['animal mouse', 'computer mouse']],
  ['keyboard', ['computer keyboard', 'musical keyboard']],
  ['bat', ['flying bat', 'baseball bat']],
  ['pool', ['swimming pool', 'pool table']],
  ['compass', ['magnetic compass', 'drawing compass']],
  ['fan', ['electric fan', 'hand fan']],
  ['nail', ['metal nail', 'fingernail']],
]);

for (const [label, [illustratedName]] of photoMeanings) objectLabels.set(illustratedName, label);

export function illustratedSoundName(label: string) {
  return photoMeanings.get(label)?.[0] ?? label;
}
