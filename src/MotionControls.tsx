import { SlidersHorizontal, X } from 'lucide-react';
import type { MotionSettings } from './phone-motion.ts';

const sliders = [
  { key: 'gravity', label: 'Gravity', hint: 'Raise it to make the object harder to lift.' },
  { key: 'sensitivity', label: 'Shake sensitivity', hint: 'Lower it to require a firmer shake.' },
] as const;

export function MotionControls({ settings, onChange }: { settings: MotionSettings; onChange: (next: MotionSettings) => void }) {
  return <>
    <button type="button" className="icon-button motion-settings-trigger" aria-label="Motion settings" title="Motion settings"
      aria-haspopup="dialog" popoverTarget="motion-settings"><SlidersHorizontal size={19} aria-hidden="true" /></button>
    <section id="motion-settings" className="motion-settings" popover="auto" role="dialog" aria-labelledby="motion-settings-title">
      <header>
        <h2 id="motion-settings-title">Motion settings</h2>
        <button type="button" className="icon-button" aria-label="Close motion settings" popoverTarget="motion-settings"
          popoverTargetAction="hide"><X size={18} aria-hidden="true" /></button>
      </header>
      {sliders.map(({ key, label, hint }) => {
        const id = 'motion-' + key;
        const value = settings[key];
        return <div className="motion-setting" key={key}>
          <div><label htmlFor={id}>{label}</label><span aria-hidden="true">{value}%</span></div>
          <p id={id + '-hint'}>{hint}</p>
          <input id={id} type="range" min={0} max={100} value={value} aria-valuetext={value + '%'} aria-describedby={id + '-hint'}
            onChange={event => onChange({ ...settings, [key]: event.currentTarget.valueAsNumber })} />
        </div>;
      })}
    </section>
  </>;
}
