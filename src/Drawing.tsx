import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { PencilLine, Trash2, Undo2 } from 'lucide-react';
import type { DrawingSize, Position } from './music.ts';
import { bounds, templateScores } from './sketch.ts';
import type { Stroke } from './sketch.ts';
import { doodlePixels, suggestionLimit } from './doodle.ts';
import { objects, doodleSuggestion, drawingFile } from './objects.ts';
import type { Suggestion } from './objects.ts';

type Props = {
  children: ReactNode;
  disabled: boolean;
  empty: boolean;
  full: boolean;
  onChoose: (suggestion: Suggestion, position: Position, image: string, size: DrawingSize) => boolean;
};

export function Drawing({ children, disabled, empty, full, onChoose }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const activePointer = useRef<number>(undefined);
  const [count, setCount] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const worker = useRef<Worker>(undefined);
  const revision = useRef(0);
  const [recognition, setRecognition] = useState('');

  useEffect(() => () => { worker.current?.terminate(); worker.current = undefined; }, []);

  function updateSuggestions() {
    const { width, height } = canvas.current!.getBoundingClientRect();
    const sketch = strokes.current.map(stroke => stroke.map(({ x, y }) => ({ x: x * width, y: y * height })));
    const id = ++revision.current;
    setSuggestions([]);
    setRecognition('');
    if (!sketch.length) return;
    const ranked = templateScores(sketch);
    const fallback = ranked.map(([kind]) => ({ kind, name: objects[kind].name }));
    const failed = () => {
      if (id !== revision.current) return;
      setRecognition('Using basic sounds');
      setSuggestions(fallback);
    };
    setRecognition('Recognizing sketch…');
    try {
      const recognizer = worker.current ??= new Worker(new URL('./doodle.worker.ts', import.meta.url), { type: 'module' });
      recognizer.onerror = () => {
        recognizer.terminate();
        worker.current = undefined;
        failed();
      };
      recognizer.onmessage = ({ data }: MessageEvent<{ id: number; labels: string[] }>) => {
        if (data.id !== revision.current || data.id !== id) return;
        if (!data.labels.length) return failed();
        const guesses = data.labels.map(doodleSuggestion);
        // Preserve close matches to the six original instrument templates.
        if (ranked[0][1] < 0.004) guesses.unshift(fallback[0]);
        setSuggestions(guesses.filter((guess, i) => guesses.findIndex(g => g.name === guess.name) === i).slice(0, suggestionLimit));
        setRecognition('');
      };
      const base = new URL(import.meta.env.BASE_URL + 'doodlenet/', document.baseURI).href;
      recognizer.postMessage({ id, base, pixels: doodlePixels(sketch) });
    } catch {
      failed();
    }
  }

  function paint() {
    const element = canvas.current!;
    const context = element.getContext('2d');
    if (!context) return;
    const { width, height } = element;
    const weight = 4 * window.devicePixelRatio;
    context.clearRect(0, 0, width, height);
    context.lineWidth = weight;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#463196';
    for (const stroke of strokes.current) {
      context.beginPath();
      const first = stroke[0];
      context.moveTo(first.x * width, first.y * height);
      for (const point of stroke.slice(1)) context.lineTo(point.x * width, point.y * height);
      if (stroke.length === 1) context.lineTo(first.x * width + 0.01, first.y * height);
      context.stroke();
    }
  }

  useEffect(() => {
    const element = canvas.current!;
    function resize() {
      const rect = element.getBoundingClientRect();
      element.width = Math.round(rect.width * window.devicePixelRatio);
      element.height = Math.round(rect.height * window.devicePixelRatio);
      paint();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, []);

  function point(event: Pick<PointerEvent, 'clientX' | 'clientY'>, rect: DOMRect): Position {
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled || activePointer.current !== undefined || event.button !== 0) return;
    const element = event.currentTarget;
    revision.current++;
    activePointer.current = event.pointerId;
    element.setPointerCapture(event.pointerId);
    strokes.current.push([point(event, element.getBoundingClientRect())]);
    setDrawing(true);
    setCount(strokes.current.length);
    paint();
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (activePointer.current !== event.pointerId) return;
    const stroke = strokes.current.at(-1)!;
    const rect = event.currentTarget.getBoundingClientRect();
    const events = event.nativeEvent.getCoalescedEvents?.();
    for (const sample of events?.length ? events : [event]) {
      const next = point(sample, rect);
      const last = stroke.at(-1)!;
      if (Math.hypot((next.x - last.x) * rect.width, (next.y - last.y) * rect.height) >= 1) stroke.push(next);
    }
    paint();
  }

  function finish(event: PointerEvent<HTMLCanvasElement>) {
    if (activePointer.current !== event.pointerId) return;
    if (event.type === 'pointerup') move(event);
    activePointer.current = undefined;
    setDrawing(false);
    if (event.type === 'pointercancel') {
      strokes.current.pop();
      setCount(strokes.current.length);
      paint();
    }
    updateSuggestions();
  }

  function undo() {
    strokes.current.pop();
    setCount(strokes.current.length);
    paint();
    updateSuggestions();
  }

  function clear() {
    revision.current++;
    setRecognition('');
    strokes.current = [];
    setCount(0);
    setSuggestions([]);
    paint();
  }

  function choose(suggestion: Suggestion) {
    if (disabled || drawing || !strokes.current.length) return;
    const element = canvas.current!;
    const box = bounds(strokes.current);
    const padding = Math.ceil(3 * window.devicePixelRatio);
    const left = Math.max(0, Math.floor(box.left * element.width) - padding);
    const top = Math.max(0, Math.floor(box.top * element.height) - padding);
    const right = Math.min(element.width, Math.ceil(box.right * element.width) + padding);
    const bottom = Math.min(element.height, Math.ceil(box.bottom * element.height) + padding);
    const crop = document.createElement('canvas');
    crop.width = right - left;
    crop.height = bottom - top;
    crop.getContext('2d')!.drawImage(element, left, top, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const position = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
    const size = { width: crop.width / element.width, height: crop.height / element.height, aspect: crop.width / crop.height };
    if (onChoose(suggestion, position, crop.toDataURL(), size)) clear();
  }

  return (
    <>
      <div className="board-tools">
        <h2 id="board-title" className="sr-only">Drawing board</h2>
        {suggestions.length
          ? <div className="prediction" role="group" aria-label="Sound suggestions">
            <span className="prediction-label">Do you mean:{recognition && <small>{recognition}</small>}</span>
            <div className="suggestion-strip">
              {suggestions.map(suggestion => (
                <button type="button" key={suggestion.name} className="suggestion"
                  aria-label={'Use ' + suggestion.name + ' sound'} disabled={drawing || disabled}
                  onClick={() => choose(suggestion)}
                  onPointerUp={event => {
                    if (event.pointerType !== 'touch') return;
                    const target = document.elementFromPoint(event.clientX, event.clientY);
                    if (event.currentTarget.contains(target)) choose(suggestion);
                  }}>
                  <img src={import.meta.env.BASE_URL + drawingFile(suggestion.name)} alt="" draggable={false} />
                  <span>{suggestion.name}</span>
                </button>
              ))}
            </div>
          </div>
          : <p className="prediction" role="status">{recognition || 'Sketch an object to find its sound.'}</p>}
      </div>
      <div className="drawing-workspace">
        <div className="tool-rail" aria-label="Drawing tools" role="group">
          <span className="current-tool" title="Freehand drawing"><PencilLine size={20} aria-label="Freehand drawing" /></span>
          <button type="button" className="secondary" aria-label="Undo" title="Undo" disabled={!count || drawing} onClick={undo}><Undo2 size={20} /></button>
          <button type="button" className="secondary" aria-label="Clear sketch" title="Clear sketch" disabled={!count || drawing} onClick={clear}><Trash2 size={19} /></button>
        </div>
        <div className="board">
          <div className="drawing-area">
            <canvas ref={canvas} aria-label="Draw an object" onPointerDown={start} onPointerMove={move}
              onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
              data-disabled={disabled} />
            {empty && !count && <div className="board-prompt">
              <PencilLine size={30} strokeWidth={1.5} />
              <strong>Draw your first object</strong>
              <span>Try a key or a drum.</span>
            </div>}
            {children}
          </div>
          <div className="floor" aria-hidden="true"><span>Floor</span></div>
        </div>
      </div>
      {full && <p className="board-notice">The mix is full. Remove an object to draw another.</p>}
    </>
  );
}
