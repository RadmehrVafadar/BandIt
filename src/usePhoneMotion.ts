import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { BeatEngine } from './engine.ts';
import type { Position } from './music.ts';
import { createLooseStage, screenForce } from './phone-motion.ts';

type SensorState = 'auto' | 'off' | 'asking' | 'waiting' | 'on' | 'denied' | 'unavailable';

export function usePhoneMotion(engine: BeatEngine | undefined, actors: RefObject<Map<string, HTMLDivElement>>, playing: boolean) {
  const touchDevice = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  const supported = touchDevice && window.isSecureContext && !!window.DeviceMotionEvent;
  const [sensor, setSensor] = useState<SensorState>(() => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : 'auto');
  const [stage] = useState(createLooseStage);
  const force = useRef<Position>({ x: 0, y: 0 });
  const requested = useRef(false);
  const active = sensor === 'on';
  const pending = sensor === 'asking' || sensor === 'waiting';

  useEffect(() => {
    if (!supported) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSensor(preference.matches ? 'off' : 'auto');
    preference.addEventListener('change', change);
    return () => preference.removeEventListener('change', change);
  }, [supported]);

  useEffect(() => {
    if (!supported || sensor === 'off' || sensor === 'asking' || sensor === 'denied') return;
    const appleMobile = /iPhone|iPad|iPod/.test(navigator.platform) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    function read(event: DeviceMotionEvent) {
      const angle = screen.orientation?.angle ?? window.orientation ?? 0;
      const next = screenForce(event.accelerationIncludingGravity, angle, appleMobile)
        ?? screenForce(event.acceleration, angle, appleMobile);
      if (!next) return;
      force.current = next;
      if (sensor !== 'on') setSensor('on');
    }
    window.addEventListener('devicemotion', read);
    // Some in-app browsers grant permission without exposing a sensor.
    const timeout = sensor === 'waiting' ? window.setTimeout(() => setSensor('unavailable'), 2500) : undefined;
    return () => {
      window.removeEventListener('devicemotion', read);
      clearTimeout(timeout);
    };
  }, [sensor, supported]);

  useEffect(() => {
    engine?.setMotionEnabled(sensor === 'on' || sensor === 'asking' || sensor === 'waiting');
  }, [sensor, engine]);
  useEffect(() => {
    if (active) return () => stage.reset(actors.current);
  }, [active, actors, stage]);

  useEffect(() => {
    if (!engine || !active || !playing) return;
    const impact = (id: string) => engine.playImpact(id);
    let previous = performance.now();
    let animation: number;
    function move(now: number) {
      const elapsed = Math.max(0, Math.min(.05, (now - previous) / 1000));
      previous = now;
      if (!document.hidden) stage.move(actors.current, force.current, elapsed, impact);
      animation = requestAnimationFrame(move);
    }
    animation = requestAnimationFrame(move);
    return () => cancelAnimationFrame(animation);
  }, [engine, active, playing, actors, stage]);

  const motion = window.DeviceMotionEvent as (typeof DeviceMotionEvent & { requestPermission?(): Promise<PermissionState> }) | undefined;

  async function enable() {
    requested.current = true;
    engine?.setMotionEnabled(true);
    setSensor('asking');
    try {
      // WebKit requires the permission call directly in a user gesture.
      const permission = await motion?.requestPermission?.();
      setSensor(permission === 'denied' ? 'denied' : 'waiting');
    } catch {
      setSensor('denied');
    }
  }

  function startFromGesture() {
    if (supported && sensor === 'auto' && !requested.current && motion?.requestPermission) void enable();
  }

  function toggle() {
    if (active) setSensor('off');
    else void enable();
  }

  const message = sensor === 'denied' ? 'Motion access was denied. You can still play the beat.'
    : sensor === 'unavailable' ? 'Motion data is unavailable. You can still play the beat.'
    : sensor === 'waiting' ? 'Waiting for phone motion…' : '';
  return { supported, active, startFromGesture, toggle, pending, message };
}
