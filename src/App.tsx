import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AudioLines, Headphones, Pause, Play, X } from 'lucide-react';
import { Drawing } from './Drawing.tsx';
import { BeatEngine } from './engine.ts';
import { emptyStage, openLibrary, readLibrary, storeStage } from './library.ts';
import { BAR_STEPS, BPM } from './music.ts';
import type { DrawingSize, Instrument, Part, Position, Slots } from './music.ts';
import { createObject, objects } from './objects.ts';
import type { Suggestion } from './objects.ts';
import { starters } from './starters.ts';
import { objectSound } from './sounds.ts';

function ObjectArt({ item, size }: { item: Instrument; size: number }) {
  if (item.image || !item.kind) return <img src={item.image} alt="" draggable={false} />;
  const Icon = objects[item.kind].Icon;
  return <Icon aria-hidden="true" size={size} strokeWidth={1.8} />;
}

export function App() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [slots, setSlots] = useState<Slots>(emptyStage);
  const [engine, setEngine] = useState<BeatEngine>();
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(-1);
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

  useEffect(() => {
    let canceled = false;
    let instance: BeatEngine | undefined;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    async function load() {
      let arrangement = emptyStage;
      let parts: Map<string, Part> | undefined;
      try {
        const connection = await openLibrary();
        if (canceled) return connection.close();
        db.current = connection;
        const saved = await readLibrary(connection);
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
      if (canceled) return;
      setSlots(arrangement);
      instance = new BeatEngine(arrangement, bank.current, frame => {
        setStep(frame.step);
        setHits(frame.hits);
        setSlots(frame.slots);
      }, (position, landed) => {
        for (const [id, actor] of actors.current) {
          const height = instance!.height(id, position, entrances.current.get(id) ?? 0);
          const rise = landed.includes(id) ? 0 : height;
          actor.style.setProperty('--rise', String(motion.matches ? 1 : rise));
        }
      }, parts);
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

  function freeSlot() {
    return slots.findIndex((id, index) => !id && !engine?.scheduledSlots[index] && !engine?.pending.has(index));
  }

  function add(item: Instrument, isNew = false) {
    const index = freeSlot();
    if (!engine || index < 0 || engine.arrangement.includes(item.id)) return false;
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
    if (!engine || preparing.current || freeSlot() < 0) return false;
    preparing.current = true;
    setLoadingSound(name);
    setError('');
    const item = { ...createObject(suggestion, position), name, image, drawing };
    // Unlock browser audio inside the user's tap, before waiting for the network.
    void engine.audio().then(context => objectSound(name, context)).then(sample => {
      item.sample = sample;
      return engine.preview(item);
    }).catch(() => {
      setError(name + ' is using its built-in sound. The generated clip was unavailable.');
    }).finally(() => {
      add(item, true);
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
  const activeCount = performers.filter(Boolean).length;
  const full = freeSlot() === -1;
  const saved = instruments.filter(item => !performers.includes(item));
  const beat = step % BAR_STEPS;

  return (
    <>
      <main className="workspace">
        <header className="intro">
          <h1 className="brand"><span className="brand-icon"><AudioLines size={21} /></span> Pocket Band</h1>
          <div className="transport">
            <span className="tempo"><strong>{BPM}</strong> BPM</span>
            <button className="primary play-button" disabled={!activeCount && !playing} onClick={togglePlayback}>
              {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              {playing ? 'Pause' : 'Play'}
            </button>
          </div>
        </header>
        <section className="studio" aria-labelledby="board-title">
          <Drawing disabled={!engine || full || !!loadingSound} empty={!activeCount && !loadingSound} full={full} loadingSound={loadingSound} onChoose={drawObject}>
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
              return <div key={item.id} className={'performer ' + item.role} style={style}
                ref={element => {
                  if (element) actors.current.set(item.id, element);
                  else actors.current.delete(item.id);
                }} data-part={engine?.part(item.id)} data-performer={item.name} data-active={slots[index] === item.id}
                data-hit={hits.includes(index)} data-queued={queued} data-drawing={!!item.drawing} aria-hidden="true">
                <ObjectArt item={item} size={36} />
              </div>;
            })}
          </Drawing>
          <div className="beat-rail" aria-hidden="true" data-step={step}>
            {Array.from({ length: 4 }, (_, group) => <div className="beat-group" key={group}>
              {Array.from({ length: 4 }, (_, subdivision) => {
                const offset = group * 4 + subdivision;
                return <i key={subdivision} data-beat={offset === beat ? 'current' : offset < beat ? 'past' : undefined} />;
              })}
            </div>)}
          </div>
        </section>
        <section className="mix" aria-labelledby="mix-title">
          <div className="mix-header"><h2 id="mix-title">Your mix</h2><span>{activeCount} / {slots.length} objects</span></div>
          <div className="mix-slots">
            {performers.map((item, index) => item
              ? <div key={index} className={'mix-slot ' + item.role}>
                <span className="mix-icon"><ObjectArt item={item} size={19} /></span>
                <span className="mix-label"><strong>{item.name}</strong>
                  {!planned[index] ? <small>Leaving on the next bar</small>
                    : !slots[index] ? <small>Joins on the next bar</small> : null}
                </span>
                <div className="mix-actions">
                  <button type="button" className="mix-button" aria-label={'Solo ' + item.name} title={'Solo ' + item.name}
                    aria-pressed={soloId === item.id} disabled={!planned[index]}
                    onClick={() => solo(soloId === item.id ? null : item.id)}><Headphones size={17} /></button>
                  <button type="button" className="mix-button" aria-label={'Remove ' + item.name}
                    disabled={!planned[index]} onClick={() => remove(index, item)}><X size={17} /></button>
                </div>
              </div>
              : <div key={index} className="mix-slot empty-slot">Empty</div>)}
          </div>
        </section>
        {!!saved.length && <details className="saved"><summary>Saved objects</summary>
          <ul>{saved.map(item => <li key={item.id}><button type="button" className="secondary"
            disabled={full || !!loadingSound} onClick={() => add(item)}><ObjectArt item={item} size={17} /> Add {item.name}</button></li>)}</ul>
        </details>}
        <p role="status" className="sr-only">{status}</p>
        {error && <p className="error" role="alert">{error}</p>}
      </main>
    </>
  );
}
