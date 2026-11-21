import { loadEnv } from 'vite';
import { demoPrompts, soundBank } from './sounds.ts';

const key = loadEnv('development', process.cwd(), 'ELEVENLABS_').ELEVENLABS_API_KEY;
const bank = soundBank('public/demo-sounds', new Set(demoPrompts.keys()), key);
for (const name of demoPrompts.keys()) {
  await bank(name);
  console.log(name + ' ready in public/demo-sounds');
}
