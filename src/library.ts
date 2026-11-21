import type { Instrument, Part, Slots } from './music.ts';

export const emptyStage: Slots = [null, null, null, null];

export function openLibrary(name = 'pocket-band'): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('instruments', { keyPath: 'id' });
      request.result.createObjectStore('stage');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function readLibrary(
  db: IDBDatabase, builtInIds: Iterable<string> = ['mug', 'pen'],
): Promise<{ instruments: Instrument[]; slots: Slots; parts?: Map<string, Part> }> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['instruments', 'stage']);
    const instruments = tx.objectStore('instruments').getAll();
    const stage = tx.objectStore('stage').get('slots');
    const parts = tx.objectStore('stage').get('parts');
    tx.oncomplete = () => {
      const ids = new Set([...builtInIds, ...instruments.result.map(item => item.id)]);
      const saved: Slots = stage.result ?? (instruments.result.length ? ['mug', 'pen', null, null] : emptyStage);
      const slots = Array.from({ length: Math.max(emptyStage.length, saved.length) }, (_, index) => {
        const id = saved[index];
        return id && ids.has(id) ? id : null;
      });
      resolve({ instruments: instruments.result, slots, ...(parts.result && { parts: parts.result }) });
    };
    tx.onabort = () => reject(tx.error);
  });
}

export function storeStage(db: IDBDatabase, slots: Slots, instrument?: Instrument, parts?: Map<string, Part>) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(instrument ? ['instruments', 'stage'] : 'stage', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    if (instrument) tx.objectStore('instruments').put(instrument);
    if (parts) tx.objectStore('stage').put(parts, 'parts');
    tx.objectStore('stage').put(slots, 'slots');
  });
}
