import { useEffect, useRef, useState } from 'react';
import { AudioLines, CircleHelp, Hand, Layers2, MousePointer2, Music2, Pause, Play, Plus, Sparkles } from 'lucide-react';
import { BeatEngine } from './engine.ts';
import { openLibrary, readLibrary, storeInstrument, storeStage } from './library.ts';
import { BAR_STEPS, BPM } from './music.ts';
import type { Instrument, Slots } from './music.ts';
import { starters } from './starters.ts';
import { Capture } from './Capture.tsx';

export function App() {
  const [instruments, setInstruments] = useState(starters);
  const [slots, setSlots] = useState<Slots>(['mug', 'pen', null, null]);
  const [step, setStep] = useState(-1);
  const [hits, setHits] = useState<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [capturing, setCapturing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [, refresh] = useState(0);
  const [dropTarget, setDropTarget] = useState<number>();
  const [dragging, setDragging] = useState(false);
  const [engine, setEngine] = useState<BeatEngine>();
  const bank = useRef(new Map(starters.map(item => [item.id, item])));
  const db = useRef<IDBDatabase | undefined>(undefined);
  const objectRefs = useRef<(HTMLImageElement | null)[]>([]);
  const playRequest = useRef(false);

  useEffect(() => {
    let canceled = false;
    let instance: BeatEngine | undefined;
    let arrangement: Slots = ['mug', 'pen', null, null];
    async function load() {
      try {
        const connection = await openLibrary();
        if (canceled) return connection.close();
        db.current = connection;
        const saved = await readLibrary(connection);
        if (canceled) return;
        bank.current = new Map([...starters, ...saved.instruments].map(item => [item.id, item]));
        setInstruments([...bank.current.values()]);
        arrangement = saved.slots;
        setSlots(arrangement);
      } catch {
        if (!canceled) setError('Local storage is unavailable in this browser.');
      }
      if (canceled) return;
      instance = new BeatEngine(arrangement, bank.current, frame => {
        setStep(frame.step);
        setHits(frame.hits);
        if (frame.slots !== arrangement) {
          arrangement = frame.slots;
          setSlots(arrangement);
          if (db.current) void storeStage(db.current, arrangement).catch(() => setError('The stage could not be saved.'));
        }
      });
      setEngine(instance);
      setLoading(false);
    }
    void load();
    return () => {
      canceled = true;
      instance?.pause();
      db.current?.close();
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const index of hits) {
      objectRefs.current[index]?.animate([
        { transform: 'translateY(1px) scale(1.075, 0.93) rotate(-3deg)' },
        { transform: 'translateY(-8px) scale(1.035) rotate(3deg)', offset: 0.38 },
        { transform: 'translateY(0) scale(1) rotate(0)' },
      ], { duration: 215, easing: 'ease-out' });
    }
  }, [hits]);

  async function togglePlayback() {
    if (!engine || playRequest.current) return;
    if (engine.running) {
      engine.pause();
      setPlaying(false);
      return;
    }
    playRequest.current = true;
    try {
      await engine.play();
      setPlaying(true);
    } catch {
      setError('Audio could not start. Tap Play to try again.');
    } finally {
      playRequest.current = false;
    }
  }

  function occupied(id: string) {
    return slots.includes(id) || engine?.scheduledSlots.includes(id)
      || (engine && [...engine.pending.values()].some(change => change.id === id));
  }

  function assign(index: number, id: string) {
    const item = bank.current.get(id);
    if (!item || occupied(id) || !engine || slots[index] || engine.scheduledSlots[index] || engine.pending.has(index)) return;
    engine.change(index, id);
    setSelected(undefined);
    setStatus(playing ? item.name + ' queued to join.' : item.name + ' added to the stage.');
    refresh(value => value + 1);
  }

  function activateSlot(index: number) {
    if (!engine) return;
    const current = slots[index];
    const pending = engine.pending.get(index);
    if (pending) {
      engine.change(index, engine.scheduledSlots[index]);
      setStatus('Queued change canceled.');
      refresh(value => value + 1);
    } else if (current && engine.scheduledSlots[index] === current) {
      engine.change(index, null);
      setStatus(playing ? 'Removal queued for the next bar.' : 'Object returned to the tray.');
      refresh(value => value + 1);
    } else if (selected) {
      assign(index, selected);
    }
  }

  async function save(item: Instrument) {
    if (!db.current) throw new Error('No local library.');
    await storeInstrument(db.current, item);
    bank.current.set(item.id, item);
    setInstruments(previous => [...previous, item]);
    setSelected(item.id);
    setStatus(item.name + ' saved. Tap an empty slot to add it.');
  }

  const activeCount = slots.filter(Boolean).length;
  const bar = step < 0 ? 1 : Math.floor(step / BAR_STEPS) + 1;
  const beat = step < 0 ? -1 : step % BAR_STEPS;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="brand-icon"><AudioLines size={20} strokeWidth={2.4} /></span> Pocket Band</div>
          <span className="local"><i /> Local session</span>
        </div>
      </header>

      <main className="workspace">
        <div className="intro">
          <div>
            <div className="eyebrow"><Sparkles size={15} /> THE OBJECT LOOPER</div>
            <h1>Pocket Band<span>.</span></h1>
            <p>Make music with whatever’s within reach.</p>
          </div>
          <div className="transport">
            <div className="tempo"><strong>{BPM}</strong><span>BPM</span></div>
            <button className="play-button" disabled={loading} onClick={() => void togglePlayback()}>
              {playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />} {playing ? 'Pause' : 'Play'}
            </button>
          </div>
        </div>

        <section className="stage" aria-labelledby="stage-title" data-step={step}>
          <header className="stage-header">
            <div className="section-heading"><span className="section-icon"><Music2 size={21} /></span>
              <div><h2 id="stage-title">The Stage</h2><p>Objects here play in the mix.</p></div>
            </div>
            <span className={'stage-state' + (playing ? ' live' : '')}><i />{playing ? 'Playing' : 'Ready'}</span>
          </header>
          <div className="slots">
            {slots.map((id, index) => {
              const pending = engine?.pending.get(index);
              const scheduled = engine?.scheduledSlots[index] ?? null;
              const upcoming = pending ? pending.id : scheduled;
              const changing = upcoming !== id;
              const item = bank.current.get(id ?? upcoming ?? '');
              const slotLabel = changing
                ? (upcoming ? 'Queued to join' : 'Queued to leave')
                : item ? 'In the mix' : 'Empty slot';
              const name = item ? item.name + ', ' + slotLabel : 'Empty slot ' + (index + 1);
              return <button key={index} className={'slot ' + (item?.role ?? 'empty')
                + (changing ? ' queued' : '') + (dropTarget === index ? ' drop-target' : '')
                + (!item && (selected || dragging) ? ' targetable' : '')}
                aria-label={name} data-slot={index} data-active={!!id} data-hit={hits.includes(index)}
                aria-disabled={!item && !selected ? true : undefined}
                onClick={() => activateSlot(index)}
                onDragOver={event => {
                  if (!item) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(index); }
                }}
                onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(undefined); }}
                onDrop={event => {
                  event.preventDefault();
                  setDropTarget(undefined);
                  assign(index, event.dataTransfer.getData('text/plain'));
                }}>
                <span className="slot-number">{String(index + 1).padStart(2, '0')}</span>
                {item ? <>
                  <span className="slot-indicator" aria-hidden="true"><i /><i /><i /></span>
                  <img className="stage-object" src={item.image} alt="" ref={image => { objectRefs.current[index] = image; }} draggable={false} />
                  <span className="slot-caption"><strong>{item.name}</strong><span>{changing ? slotLabel : item.role}</span></span>
                </> : <span className="empty-content"><span className="slot-plus"><Plus size={23} /></span>
                  <strong>Empty slot</strong><span>{selected ? 'Tap to add' : 'Drop an object'}</span></span>}
              </button>;
            })}
          </div>
          <div className="beat-rail" aria-label={'Bar ' + bar}>
            <div className="beat-bars" aria-hidden="true">
              {Array.from({ length: 4 }, (_, group) => <div className="beat-group" key={group}>
                {Array.from({ length: 4 }, (_, sub) => {
                  const offset = group * 4 + sub;
                  return <i key={sub} className={offset === beat ? 'beat-current' : offset < beat ? 'beat-past' : ''} />;
                })}
              </div>)}
            </div>
            <span>BAR {String(bar).padStart(2, '0')}</span>
          </div>
        </section>

        <section className="tray" aria-labelledby="tray-title">
          <header className="tray-header">
            <div className="section-heading"><span className="tray-icon"><Layers2 size={21} /></span>
              <div><h2 id="tray-title">Instrument Tray</h2><p>Drag or tap an object to bring it onstage.</p></div>
            </div>
            <button className="add-button" disabled={loading} onClick={() => setCapturing(true)}><Plus size={19} /> Add object</button>
          </header>
          <div className="tray-items">
            {instruments.map(item => {
              const unavailable = occupied(item.id);
              return <button className={'tray-item ' + item.role + (selected === item.id ? ' selected' : '')}
                key={item.id} draggable={!unavailable} aria-pressed={selected === item.id}
                aria-disabled={!!unavailable}
                onClick={() => {
                  if (unavailable) return;
                  setSelected(selected === item.id ? undefined : item.id);
                }}
                onDragStart={event => {
                  if (unavailable) { event.preventDefault(); return; }
                  event.dataTransfer.setData('text/plain', item.id);
                  event.dataTransfer.effectAllowed = 'move';
                  setDragging(true);
                }} onDragEnd={() => { setDropTarget(undefined); setDragging(false); }}>
                <span className="tray-thumb"><img src={item.image} alt="" draggable={false} /></span>
                <span className="tray-info"><strong>{item.name}</strong><span><b>{item.role}</b>{unavailable ? 'Onstage' : 'In tray'}</span></span>
              </button>;
            })}
          </div>
        </section>
        <div role="status" className="sr-only">{status}</div>
        {error && <p className="error mixer-error" role="alert">{error}</p>}
        <footer className="workspace-footer">
          <span><span className="help-icons"><MousePointer2 size={14} /><Hand size={14} /></span> Tap or drag to add. Tap an onstage object to remove.</span>
          <span className="count"><CircleHelp size={14} /> {activeCount} / 4 slots filled</span>
        </footer>
      </main>
      {capturing && engine && <Capture engine={engine} close={() => setCapturing(false)} save={save} />}
    </>
  );
}
