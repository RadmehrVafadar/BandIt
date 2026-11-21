import type { Instrument, Slots } from './music.ts';

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

export function readLibrary(db: IDBDatabase): Promise<{ instruments: Instrument[]; slots: Slots }> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['instruments', 'stage']);
    const instruments = tx.objectStore('instruments').getAll();
    const stage = tx.objectStore('stage').get('slots');
    tx.oncomplete = () => {
      const ids = new Set(['mug', 'pen', ...instruments.result.map(item => item.id)]);
      const saved: Slots = stage.result ?? (instruments.result.length ? ['mug', 'pen', null, null] : emptyStage);
      const slots = emptyStage.map((_, index) => {
        const id = saved[index];
        return id && ids.has(id) ? id : null;
      });
      resolve({ instruments: instruments.result, slots });
    };
    tx.onabort = () => reject(tx.error);
  });
}

export function storeStage(db: IDBDatabase, slots: Slots, instrument?: Instrument) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(instrument ? ['instruments', 'stage'] : 'stage', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    if (instrument) tx.objectStore('instruments').put(instrument);
    tx.objectStore('stage').put(slots, 'slots');
  });
}
