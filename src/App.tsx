import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Headphones, Pause, Play, Plus, X } from 'lucide-react';
import { Drawing } from './Drawing.tsx';
import { BeatEngine } from './engine.ts';
import { emptyStage, openLibrary, readLibrary, storeStage } from './library.ts';
import { nativePart } from './loop-score.ts';
import { loadLoops } from './loops.ts';
import type { DrawingSize, Instrument, Part, Position, Slots } from './music.ts';
import { createObject, objects } from './objects.ts';
import type { Suggestion } from './objects.ts';
import { starters } from './starters.ts';
import { objectSound, restoreHorseSounds } from './sounds.ts';

function ObjectArt({ item, size }: { item: Instrument; size: number }) {
  if (item.image || !item.kind) {
    return <img src={item.image} className={item.kind ? 'sketch-art' : undefined} alt="" draggable={false} />;
  }
  const Icon = objects[item.kind].Icon;
  return <Icon aria-hidden="true" size={size} strokeWidth={1.8} />;
}

export function App() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [slots, setSlots] = useState<Slots>(emptyStage);
  const [engine, setEngine] = useState<BeatEngine>();
  const [playing, setPlaying] = useState(false);
  const [hits, setHits] = useState<number[]>([]);
  const [soloId, setSoloId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [, refresh] = useState(0);
  const bank = useRef(new Map(starters.map(item => [item.id, item])));
  const db = useRef<IDBDatabase>(undefined);
  const actors = useRef(new Map<string, HTMLDivElement>());
  const entrances = useRef(new Map<string, number>());
  const starting = useRef(false);
  const preparing = useRef(false);
  const [loadingSound, setLoadingSound] = useState('');
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const picker = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let canceled = false;
    let instance: BeatEngine | undefined;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    async function load() {
      const loadingLoops = loadLoops();
      let arrangement = emptyStage;
      let parts: Map<string, Part> | undefined;
      try {
        const connection = await openLibrary();
        if (canceled) return connection.close();
        db.current = connection;
        const saved = await readLibrary(connection);
        await restoreHorseSounds(saved.instruments);
        if (canceled) return;
        for (const item of saved.instruments) bank.current.set(item.id, item);
        const hasLegacyLibrary = saved.slots.some(id => starters.some(item => item.id === id))
          || saved.instruments.some(item => !item.kind);
        setInstruments(hasLegacyLibrary ? [...starters, ...saved.instruments] : saved.instruments);
        arrangement = saved.slots;
        parts = saved.parts;
      } catch {
        if (!canceled) setError('Local storage is unavailable. You can still draw and play.');
      }
      const loops = await loadingLoops;
      if (canceled) return;
      setSlots(arrangement);
      instance = new BeatEngine(arrangement, bank.current, frame => {
        setHits(frame.hits);
        setSlots(frame.slots);
      }, (position, landed) => {
        for (const [id, actor] of actors.current) {
          const height = instance!.height(id, position, entrances.current.get(id) ?? 0);
          const rise = landed.includes(id) ? 0 : height;
          actor.style.setProperty('--rise', String(motion.matches ? 1 : rise));
        }
      }, loops, parts);
      setEngine(instance);
    }

    void load();
    return () => {
      canceled = true;
      instance?.dispose();
      db.current?.close();
    };
  }, []);

  async function play() {
    if (!engine || starting.current || engine.running) return;
    starting.current = true;
    try {
      await engine.play();
      setPlaying(true);
    } catch {
      setError('Audio could not start. Tap Play to try again.');
    } finally {
      starting.current = false;
    }
  }

  function togglePlayback() {
    if (engine?.running) {
      engine.pause();
      setPlaying(false);
    } else {
      void play();
    }
  }

  function persist(item?: Instrument) {
    if (engine && db.current) {
      void storeStage(db.current, engine.arrangement, item, engine.plannedParts).catch(() => {
        setError('The mix could not be saved on this device.');
      });
    }
  }

  function isFree(index: number) {
    return index >= 0 && !slots[index] && !engine?.scheduledSlots[index] && !engine?.pending.has(index);
  }

  function add(item: Instrument, index: number, isNew = false) {
    if (!engine || !isFree(index) || engine.arrangement.includes(item.id)) return false;
    const first = !engine.running && !slots.some(Boolean);
    if (isNew) {
      bank.current.set(item.id, item);
      setInstruments(items => [...items, item]);
    }
    entrances.current.set(item.id, engine.change(index, item.id));
    persist(isNew ? item : undefined);
    setStatus(engine.running ? item.name + ' joins on the next bar.' : item.name + ' added to the mix.');
    refresh(value => value + 1);
    if (first) void play();
    return true;
  }

  function drawObject(suggestion: Suggestion, position: Position, image: string, drawing: DrawingSize) {
    const { name } = suggestion;
    if (!engine || preparing.current || firstFree < 0) return false;
    preparing.current = true;
    setLoadingSound(name);
    setError('');
    const item = { ...createObject(suggestion, position), name, image, drawing };
    const native = nativePart(item);
    // Unlock browser audio inside the user's tap, before waiting for the network.
    void engine.audio().then(async context => {
      // Bell's bundled stem and its recognizable accent both use the built-in bell.
      if (native !== 'hook') item.sample = await objectSound(name, context);
    }).catch(() => {
      if (!native) setError(name + ' is using its built-in sound. The clip was unavailable.');
    }).finally(() => {
      add(item, firstFree, true);
      preparing.current = false;
      setLoadingSound('');
    });
    return true;
  }

  function solo(id: string | null) {
    engine?.setSolo(id);
    setSoloId(id);
  }

  function remove(index: number, item: Instrument) {
    if (!engine) return;
    if (soloId === item.id) solo(null);
    engine.change(index, null);
    persist();
    setStatus(engine.running && slots[index] ? item.name + ' leaves on the next bar.' : item.name + ' removed from the mix.');
    refresh(value => value + 1);
  }

  const planned = engine?.arrangement ?? slots;
  const performers = slots.map((id, index) => bank.current.get(id ?? engine?.scheduledSlots[index] ?? planned[index] ?? ''));
  const hasObjects = performers.some(Boolean);
  const firstFree = slots.findIndex((_, index) => isFree(index));
  const full = firstFree < 0;
  const saved = pickerSlot === null ? [] : instruments.filter(item => !performers.includes(item));

  return (
    <main className="workspace">
      <h1 className="brand"><span className="brand-note" aria-hidden="true" />BandIt</h1>
      <Drawing disabled={!engine || full || !!loadingSound} empty={!hasObjects && !loadingSound}
        full={full} loadingSound={loadingSound} onChoose={drawObject}
        playback={<button type="button" className="play-button" disabled={!hasObjects && !playing} onClick={togglePlayback}>
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          {playing ? 'Pause' : 'Play'}
        </button>}>
        {performers.map((item, index) => {
          if (!item) return null;
          const position = item.position ?? { x: (index + 0.5) / slots.length, y: 0.36 };
          const style = {
            '--x': position.x * 100 + '%', '--y': position.y * 100 + 'cqh',
            '--art-width': item.drawing && item.drawing.width * 100 + 'cqw',
            '--art-height': item.drawing && item.drawing.height * 100 + 'cqh',
            '--art-aspect': item.drawing?.aspect,
          } as CSSProperties;
          const queued = slots[index] !== planned[index] || !slots[index];
          return <div key={item.id} className="performer" style={style}
            ref={element => {
              if (element) actors.current.set(item.id, element);
              else actors.current.delete(item.id);
            }} data-part={engine?.part(item.id)} data-performer={item.name} data-active={slots[index] === item.id}
            data-hit={hits.includes(index)} data-queued={queued} data-drawing={!!item.drawing} aria-hidden="true">
            <ObjectArt item={item} size={36} />
          </div>;
        })}
      </Drawing>
      <section className="mix" aria-label="Object slots">
        {performers.map((item, index) => {
          const label = item ? 'Solo ' + item.name : 'Add a saved object to slot ' + (index + 1);
          const queued = !planned[index] ? 'Leaving on the next bar' : !slots[index] ? 'Joins on the next bar' : '';
          return (
            <div key={index} className="mix-slot">
              <button type="button" className={item ? 'slot-button' : 'slot-button empty-slot'}
                aria-label={label} title={item ? label : 'Choose a saved object'} aria-pressed={item ? soloId === item.id : undefined}
                disabled={item ? !planned[index] : !engine || !!loadingSound}
                popoverTarget={item ? undefined : 'saved-picker'} popoverTargetAction={item ? undefined : 'show'}
                aria-haspopup={item ? undefined : 'dialog'} aria-expanded={item ? undefined : pickerSlot === index}
                onClick={() => item ? solo(soloId === item.id ? null : item.id) : setPickerSlot(index)}>
                {item ? <>
                  <Headphones className="solo-icon" size={15} />
                  <span className="slot-art"><ObjectArt item={item} size={28} /></span>
                  <span className={queued ? 'slot-label queued' : 'slot-label'}>{queued || item.name}</span>
                </> : <Plus size={20} strokeWidth={1.5} />}
              </button>
              {item && <button type="button" className="icon-button remove-object"
                aria-label={'Remove ' + item.name} title={'Remove ' + item.name}
                disabled={!planned[index]} onClick={() => remove(index, item)}><X size={15} /></button>}
            </div>
          );
        })}
        <div id="saved-picker" className="picker" popover="auto" role="dialog" aria-label="Saved objects"
          tabIndex={-1} ref={picker} onToggle={event => {
            if (event.newState === 'open') event.currentTarget.focus();
            else setPickerSlot(null);
          }}>
          <button type="button" className="icon-button close-picker" aria-label="Close saved objects"
            popoverTarget="saved-picker" popoverTargetAction="hide"><X size={18} /></button>
          {pickerSlot !== null && (saved.length ? <ul className="saved-objects">{saved.map(item => (
            <li key={item.id}><button type="button" aria-label={'Add ' + item.name}
              disabled={!isFree(pickerSlot) || !!loadingSound} onClick={() => {
                if (add(item, pickerSlot)) picker.current?.hidePopover();
              }}><ObjectArt item={item} size={28} /><span>{item.name}</span></button></li>
          ))}</ul> : <p>{instruments.length ? 'All your saved objects are in the mix.' : 'No saved objects yet.'}
            <span>{instruments.length ? 'Remove one from the mix to use it here.' : 'Draw an object and choose its sound to save it.'}</span>
          </p>)}
        </div>
      </section>
      <p role="status" className="sr-only">{status}</p>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
