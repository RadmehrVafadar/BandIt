import labels from './doodle-labels.json' with { type: 'json' };

export const objectLabels = new Map(labels.map(label => [label.toLowerCase().replaceAll('_', ' '), label]));
objectLabels.set('keys', 'key');
objectLabels.set('drum', 'drums');
objectLabels.set('bell', 'bell');
objectLabels.set('whistle', 'whistle');
