import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { PencilLine, Trash2, Undo2 } from 'lucide-react';
import type { DrawingSize, Position } from './music.ts';
import { bounds, rankSketch } from './sketch.ts';
import type { ObjectKind, Stroke } from './sketch.ts';
import { objects } from './objects.ts';

type Props = {
  children: ReactNode;
  disabled: boolean;
  empty: boolean;
  full: boolean;
  onChoose: (kind: ObjectKind, position: Position, image: string, size: DrawingSize) => boolean;
};

export function Drawing({ children, disabled, empty, full, onChoose }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const activePointer = useRef<number>(undefined);
  const [count, setCount] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [suggestions, setSuggestions] = useState<ObjectKind[]>([]);

  function updateSuggestions() {
    const { width, height } = canvas.current!.getBoundingClientRect();
    const sketch = strokes.current.map(stroke => stroke.map(({ x, y }) => ({ x: x * width, y: y * height })));
    setSuggestions(sketch.length ? rankSketch(sketch).slice(0, 3) : []);
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
    strokes.current = [];
    setCount(0);
    setSuggestions([]);
    paint();
  }

  function choose(kind: ObjectKind) {
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
    if (onChoose(kind, position, crop.toDataURL(), size)) clear();
  }

  return (
    <>
      <div className="board-tools">
        <h2 id="board-title" className="sr-only">Drawing board</h2>
        {suggestions.length
          ? <div className="prediction" role="group" aria-label="Sound suggestions">
            <span>Did you draw</span>
            {suggestions.map(kind => {
              const { Icon, name } = objects[kind];
              return <button type="button" key={kind} className="suggestion" aria-label={'Use ' + name + ' sound'}
                disabled={drawing || disabled} onClick={() => choose(kind)}><Icon size={19} aria-hidden="true" />{name}</button>;
            })}
          </div>
          : <p className="prediction">Sketch an object to find its sound.</p>}
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
