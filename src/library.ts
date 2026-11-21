import type { Instrument, Slots } from './music.ts';

const defaultSlots = ['mug', 'pen', null, null];

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
      const saved: Slots = stage.result ?? defaultSlots;
      const slots = defaultSlots.map((_, index) => {
        const id = saved[index];
        return id && ids.has(id) ? id : null;
      });
      resolve({ instruments: instruments.result, slots });
    };
    tx.onabort = () => reject(tx.error);
  });
}

export function storeInstrument(db: IDBDatabase, instrument: Instrument) {
  return write(db, 'instruments', store => store.put(instrument));
}

export function storeStage(db: IDBDatabase, slots: Slots) {
  return write(db, 'stage', store => store.put(slots, 'slots'));
}

function write(db: IDBDatabase, kind: string, action: (store: IDBObjectStore) => void) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(kind, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    action(tx.objectStore(kind));
  });
}
