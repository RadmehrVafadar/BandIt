import { useEffect, useState } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import type { BeatEngine } from './engine.ts';

const HOLD_MS = 300;
type Press = { id: string; input: number | ' ' | 'Enter'; startedAt: number };

export function useSolo(engine?: BeatEngine) {
  const [latchedId, setLatchedId] = useState<string | null>(null);
  const [press, setPress] = useState<Press | null>(null);
  const soloId = press?.id ?? latchedId;

  useEffect(() => { engine?.setSolo(soloId); }, [engine, soloId]);
  useEffect(() => {
    if (!press) return;
    const cancel = () => setPress(null);
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, [press]);

  function buttonProps(id: string): ButtonHTMLAttributes<HTMLButtonElement> {
    function toggle() {
      setLatchedId(current => current === id ? null : id);
    }
    function release(input: Press['input'], time: number, inside: boolean) {
      if (press?.id !== id || press.input !== input) return;
      if (inside && time - press.startedAt < HOLD_MS) toggle();
      setPress(null);
    }
    function cancelPointer(event: { pointerId: number }) {
      if (press?.id === id && press.input === event.pointerId) setPress(null);
    }
    return {
      'aria-pressed': soloId === id,
      onPointerDown(event) {
        if (press || !event.isPrimary || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setPress({ id, input: event.pointerId, startedAt: event.timeStamp });
      },
      onPointerUp(event) {
        const target = document.elementFromPoint(event.clientX, event.clientY);
        release(event.pointerId, event.timeStamp, event.currentTarget.contains(target));
      },
      onPointerCancel: cancelPointer,
      onLostPointerCapture: cancelPointer,
      onContextMenu(event) {
        if (press?.id === id) event.preventDefault();
      },
      onKeyDown(event) {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        if (!event.repeat && !press) setPress({ id, input: event.key, startedAt: event.timeStamp });
      },
      onKeyUp(event) {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        release(event.key, event.timeStamp, true);
      },
      onBlur() {
        if (press?.id === id) setPress(null);
      },
      onClick(event) {
        // Assistive technologies can activate a button without a preceding press.
        if (event.detail === 0) toggle();
      },
    };
  }

  function remove(id: string) {
    if (latchedId === id) setLatchedId(null);
    if (press?.id === id) setPress(null);
  }

  return { buttonProps, remove, isMuted: (id: string) => soloId !== null && soloId !== id };
}
