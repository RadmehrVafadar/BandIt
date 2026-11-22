import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { BeatEngine } from './engine.ts';
import { createLooseStage } from './phone-motion.ts';
import { glowOnLanding } from './stage-physics.ts';

type MotionSensor = typeof DeviceMotionEvent & { requestPermission?(): Promise<PermissionState> };

export function usePhoneMotion(
  engine: BeatEngine | undefined, actors: RefObject<Map<string, HTMLDivElement>>, playing: boolean, objectCount: number,
) {
  const motion = window.DeviceMotionEvent as MotionSensor | undefined;
  const touchDevice = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  const supported = touchDevice && window.isSecureContext && !!motion;
  const single = supported && objectCount === 1;
  const [access, setAccess] = useState<PermissionState | 'asking'>(motion?.requestPermission ? 'prompt' : 'granted');
  const [signal, setSignal] = useState<'waiting' | 'ready' | 'unavailable'>('waiting');
  const [stage] = useState(createLooseStage);
  const requested = useRef(false);
  const active = single && access === 'granted' && signal === 'ready';

  useEffect(() => {
    setSignal('waiting');
    if (!single || access !== 'granted' || !engine) return;
    const appleMobile = /iPhone|iPad|iPod/.test(navigator.platform) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const timeout = window.setTimeout(() => setSignal('unavailable'), 2500);
    let ready = false;
    const read = (event: DeviceMotionEvent) => {
      const angle = screen.orientation?.angle ?? window.orientation ?? 0;
      const usable = stage.read(event, angle, appleMobile, engine.running && !document.hidden);
      if (usable && !ready) {
        ready = true;
        clearTimeout(timeout);
        setSignal('ready');
      }
    };
    window.addEventListener('devicemotion', read);
    return () => {
      window.removeEventListener('devicemotion', read);
      clearTimeout(timeout);
      stage.reset(actors.current);
    };
  }, [single, access, engine, actors, stage]);

  useEffect(() => {
    engine?.setMotionEnabled(single && (access === 'asking' || (access === 'granted' && signal !== 'unavailable')));
  }, [single, access, signal, engine]);

  useEffect(() => {
    if (!engine || !active || !playing) return;
    const impact = (id: string, hitFloor: boolean) => {
      engine.playImpact(id);
      if (hitFloor) glowOnLanding(actors.current.get(id)!);
    };
    let previous = performance.now();
    let animation: number;
    function move(now: number) {
      const elapsed = Math.max(0, Math.min(.05, (now - previous) / 1000));
      previous = now;
      if (!document.hidden) stage.move(actors.current, elapsed, impact);
      animation = requestAnimationFrame(move);
    }
    document.addEventListener('visibilitychange', stage.clearShake);
    animation = requestAnimationFrame(move);
    return () => {
      document.removeEventListener('visibilitychange', stage.clearShake);
      cancelAnimationFrame(animation);
      stage.clearShake();
    };
  }, [engine, active, playing, actors, stage]);

  async function requestAccess(nextCount = objectCount) {
    if (!supported || nextCount !== 1 || !motion?.requestPermission || access !== 'prompt' || requested.current) return;
    requested.current = true;
    engine?.setMotionEnabled(true);
    setAccess('asking');
    try {
      const permission = await motion.requestPermission();
      setAccess(permission === 'granted' ? 'granted' : 'denied');
    } catch {
      setAccess('denied');
    }
  }

  let message = '';
  if (single && access === 'denied') message = 'Motion access was denied. You can still play the beat.';
  if (single && access === 'granted' && signal === 'unavailable') message = 'Motion data is unavailable. You can still play the beat.';
  return { requestAccess, message };
}
