import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { soundHandler } from '../server/handler.ts';

export default soundHandler(join(tmpdir(), 'pocket-band-sounds'), process.env.ELEVENLABS_API_KEY ?? '');
