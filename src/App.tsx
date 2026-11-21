import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Camera, Headphones, Pause, Play, Plus, X } from 'lucide-react';
import { createBeatboxPack } from './beatbox.ts';
import { CameraCapture } from './CameraCapture.tsx';
import { Drawing } from './Drawing.tsx';
import { BeatEngine } from './engine.ts';
import { emptyStage, openLibrary, readLibrary, storeStage } from './library.ts';
import { nativePart } from './loop-score.ts';
import { loadLoops } from './loops.ts';
import { STEP_SECONDS } from './music.ts';
import type { DrawingSize, Instrument, Part, Position, Slots } from './music.ts';
import { objectLabels } from './object-labels.ts';
import { createObject, doodleSuggestion, drawingFile, objects } from './objects.ts';
import type { Suggestion } from './objects.ts';
import { starters } from './starters.ts';
import { objectSound, restoreHorseSounds } from './sounds.ts';
import { createStagePhysics } from './stage-physics.ts';
import { useSolo } from './useSolo.ts';

const beatbox = createBeatboxPack(import.meta.env.BASE_URL);
const builtIns = new Map([...starters, ...beatbox].map(item => [item.id, item]));

function ObjectArt({ item, size }: { item: Instrument; size: number }) {
  if (item.image || !item.kind) {
    const art = item.kind && (item.image?.startsWith('data:image/jpeg;') ? 'photo-art' : 'sketch-art');
    return <img src={item.image} className={art} alt="" draggable={false} />;
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
  const solo = useSolo(engine);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [, refresh] = useState(0);
  const bank = useRef(new Map(builtIns));
  const db = useRef<IDBDatabase>(undefined);
  const actors = useRef(new Map<string, HTMLDivElement>());
  const entrances = useRef(new Map<string, number>());
  const starting = useRef(false);
  const preparing = useRef(false);
  const [loadingSound, setLoadingSound] = useState('');
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [cameraSlot, setCameraSlot] = useState<number | null>(null);
  const picker = useRef<HTMLDivElement>(null);
  const pickerTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let canceled = false;
    let instance: BeatEngine | undefined;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const movePerformers = createStagePhysics();

    async function load() {
      const loadingLoops = loadLoops();
      let arrangement = emptyStage;
      let parts: Map<string, Part> | undefined;
      try {
        const connection = await openLibrary();
        if (canceled) return connection.close();
        db.current = connection;
        const saved = await readLibrary(connection, builtIns.keys());
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
        const active: HTMLDivElement[] = [];
        for (const [id, actor] of actors.current) {
          const height = instance!.height(id, position, entrances.current.get(id) ?? 0);
          const rise = landed.includes(id) ? 0 : height;
          actor.style.setProperty('--rise', String(rise));
          if (actor.dataset.active === 'true') active.push(actor);
        }
        movePerformers(active, position * STEP_SECONDS, motion.matches);
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

  function prepareObject(item: Instrument, slot: number, hasClip = true) {
    const { name } = item;
    if (!engine || preparing.current || !isFree(slot)) return false;
    preparing.current = true;
    setLoadingSound(name);
    setError('');
    const native = nativePart(item);
    // Unlock browser audio inside the user's tap, before waiting for the network.
    void engine.audio().then(async context => {
      // Bell's bundled stem and its recognizable accent both use the built-in bell.
      if (hasClip && native !== 'hook') item.sample = await objectSound(name, context);
    }).catch(() => {
      if (!native) setError(name + ' is using its built-in sound. The clip was unavailable.');
    }).finally(() => {
      add(item, slot, true);
      preparing.current = false;
      setLoadingSound('');
    });
    return true;
  }

  function drawObject(suggestion: Suggestion, position: Position, image: string, drawing: DrawingSize) {
    return prepareObject({ ...createObject(suggestion, position), image, drawing }, firstFree);
  }

  function addPhoto(name: string, photo: string) {
    if (cameraSlot === null) return false;
    const label = objectLabels.get(name);
    const suggestion = doodleSuggestion(label ?? name.replaceAll(' ', '_'));
    const item = createObject(suggestion, { x: (cameraSlot + 0.5) / slots.length, y: 0.36 });
    item.image = label ? import.meta.env.BASE_URL + drawingFile(suggestion.name) : photo;
    return prepareObject(item, cameraSlot, label !== undefined);
  }

  function remove(index: number, item: Instrument) {
    if (!engine) return;
    solo.remove(item.id);
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
  const voices = pickerSlot === null ? [] : beatbox.filter(item => !performers.includes(item));

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
          return <div key={item.id} className="performer" style={style} data-solo-muted={solo.isMuted(item.id)}
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
          const label = item ? 'Solo ' + item.name : 'Add an object to slot ' + (index + 1);
          const queued = !planned[index] ? 'Leaving on the next bar' : !slots[index] ? 'Joins on the next bar' : '';
          return (
            <div key={index} className="mix-slot">
              <button type="button" className={item ? 'slot-button' : 'slot-button empty-slot'}
                aria-label={label} title={item ? label + ' (click to toggle, hold to preview)' : 'Add an object'}
                disabled={item ? !planned[index] : !engine || !!loadingSound}
                popoverTarget={item ? undefined : 'saved-picker'} popoverTargetAction={item ? undefined : 'show'}
                aria-haspopup={item ? undefined : 'dialog'} aria-expanded={item ? undefined : pickerSlot === index}
                {...(item ? solo.buttonProps(item.id) : { onClick: event => {
                  pickerTrigger.current = event.currentTarget;
                  setPickerSlot(index);
                } })}>
                {item ? <>
                  <Headphones className="solo-icon" size={15} />
                  <span className="slot-art" data-solo-muted={solo.isMuted(item.id)}><ObjectArt item={item} size={28} /></span>
                  <span className={queued ? 'slot-label queued' : 'slot-label'}>{queued || item.name}</span>
                </> : <Plus size={20} strokeWidth={1.5} />}
              </button>
              {item && <button type="button" className="icon-button remove-object"
                aria-label={'Remove ' + item.name} title={'Remove ' + item.name}
                disabled={!planned[index]} onClick={() => remove(index, item)}><X size={15} /></button>}
            </div>
          );
        })}
        <div id="saved-picker" className="picker" popover="auto" role="dialog" aria-label="Add an object"
          tabIndex={-1} ref={picker} onToggle={event => {
            if (event.newState === 'open') event.currentTarget.focus();
            else setPickerSlot(null);
          }}>
          {pickerSlot !== null && <div className="picker-options">
            <button type="button" disabled={!isFree(pickerSlot) || !!loadingSound} onClick={() => {
              // Unlock audio on this tap so the first object can play after recognition.
              void engine?.audio().catch(() => setError('Tap Play to start audio.'));
              picker.current?.hidePopover();
              pickerTrigger.current?.focus();
              setCameraSlot(pickerSlot);
            }}><Camera size={28} /><span>Camera</span></button>
            {[{ label: 'Beatbox', items: voices }, { label: 'Saved objects', items: saved }].map(({ label, items }) =>
              items.length > 0 && <fieldset key={label}>
                <legend>{label}</legend>
                <ul className="saved-objects">{items.map(item => (
                  <li key={item.id}><button type="button" aria-label={'Add ' + item.name}
                    disabled={!isFree(pickerSlot) || !!loadingSound} onClick={() => {
                      if (add(item, pickerSlot)) picker.current?.hidePopover();
                    }}><ObjectArt item={item} size={28} /><span>{item.name}</span></button></li>
                ))}</ul>
              </fieldset>)}
          </div>}
          {pickerSlot !== null && !saved.length &&
            <p>{instruments.length ? 'All your saved objects are in the mix.' : 'No saved objects yet.'}</p>}
          <button type="button" className="icon-button close-picker" aria-label="Close object picker"
            popoverTarget="saved-picker" popoverTargetAction="hide"><X size={18} /></button>
        </div>
      </section>
      {cameraSlot !== null && <CameraCapture onClose={() => setCameraSlot(null)} onIdentify={addPhoto} />}
      <p role="status" className="sr-only">{status}</p>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
