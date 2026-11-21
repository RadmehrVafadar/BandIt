import type { IncomingMessage, ServerResponse } from 'node:http';
import { objectLabels, photoMeanings } from '../src/object-labels.ts';

const maxBytes = 1024 * 1024;
const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent';
const photoNames = new Set([...objectLabels.keys()].flatMap(name => photoMeanings.get(name) ?? [name]));
const prompt = 'Identify the single most prominent physical object from its visible features and surroundings. '
  + 'Return a short English name that distinguishes the kind of object shown. For example, buttons and a scroll wheel '
  + 'suggest a computer mouse, while fur and whiskers suggest an animal mouse. Keep qualifiers whenever a word has '
  + 'several meanings. Return null if no object is clear. Use one of these names if its meaning fits, or supply a more '
  + 'accurate name for a different object: ' + [...photoNames].join(', ');

export function identifyHandler(key: string | undefined, request = fetch) {
  // Vercel supplies parsed JSON. Vite supplies the raw request stream.
  return async (req: IncomingMessage & { body?: { image?: unknown } }, res: ServerResponse) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return void res.writeHead(405, { Allow: 'POST' }).end();
    if (req.headers['x-pocket-band'] !== '1') return void res.writeHead(400).end();
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') return void res.writeHead(415).end();
    if (Number(req.headers['content-length']) > maxBytes) return void res.writeHead(413).end();
    if (!key) return void res.writeHead(503).end();

    let image: unknown;
    try {
      let body = req.body;
      if (body === undefined) {
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of req.iterator({ destroyOnReturn: false })) {
          bytes += chunk.length;
          if (bytes > maxBytes) return void res.writeHead(413).end();
          chunks.push(chunk);
        }
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      }
      image = body?.image;
    } catch {
      return void res.writeHead(400).end();
    }
    if (typeof image !== 'string') return void res.writeHead(400).end();
    if (image.length > maxBytes) return void res.writeHead(413).end();
    if (image.length % 4 !== 0 || !/^\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(image)) return void res.writeHead(400).end();

    const canceled = new AbortController();
    res.once('close', () => canceled.abort());
    try {
      const response = await request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ inlineData: { mimeType: 'image/jpeg', data: image } }, { text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 256,
            responseSchema: { type: 'OBJECT', properties: { name: { type: 'STRING', nullable: true } }, required: ['name'] },
          },
        }),
        signal: AbortSignal.any([canceled.signal, AbortSignal.timeout(20000)]),
      });
      if (!response.ok) return void res.writeHead(502).end();
      const result = await response.json();
      const candidate = result.candidates?.[0];
      if (result.promptFeedback?.blockReason || candidate?.finishReason === 'SAFETY') return void res.writeHead(422).end();
      const { name } = JSON.parse(candidate?.content?.parts?.at(-1)?.text);
      if (name === null) return void res.writeHead(422).end();
      if (typeof name !== 'string' || name.length > 60) return void res.writeHead(502).end();
      const label = name.trim().toLowerCase().replaceAll('_', ' ');
      if (!/^[\p{L}\p{N}]+(?:[ '’-][\p{L}\p{N}]+)*$/u.test(label)) {
        return void res.writeHead(502).end();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ name: label }));
    } catch {
      if (!res.destroyed) res.writeHead(502).end();
    }
  };
}
