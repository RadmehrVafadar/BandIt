import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { isProviderKey } from '../auth/config.ts';
import type { ProviderKeys } from './auth.ts';

type Props = {
  keys: ProviderKeys;
  welcome: boolean;
  onCancel: () => void;
  onSave: (keys: ProviderKeys) => void;
};

export function ApiKeysDialog({ keys, welcome, onCancel, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const gemini = String(form.get('gemini') ?? '').trim();
    const elevenlabs = String(form.get('elevenlabs') ?? '').trim();
    if ([gemini, elevenlabs].some(key => key && !isProviderKey(key))) {
      return setError('Check the keys for spaces or extra characters.');
    }
    onSave({ gemini, elevenlabs });
  }

  return <dialog ref={dialog} className="keys-dialog" aria-labelledby="keys-title" onCancel={event => {
    event.preventDefault();
    onCancel();
  }}>
    <form onSubmit={submit} autoComplete="off">
      <h2 id="keys-title">Your API keys</h2>
      <p>Use your own provider accounts for photos or sounds. Both keys are optional.</p>
      <label htmlFor="gemini-key">Gemini API key <span>Photo recognition</span></label>
      <input id="gemini-key" name="gemini" type="password" maxLength={512} defaultValue={keys.gemini}
        spellCheck={false} autoComplete="off" />
      <label htmlFor="elevenlabs-key">ElevenLabs API key <span>Generated sounds</span></label>
      <input id="elevenlabs-key" name="elevenlabs" type="password" maxLength={512} defaultValue={keys.elevenlabs}
        spellCheck={false} autoComplete="off" />
      <p className="key-lifetime">Keys are forgotten when you reload or sign out.</p>
      {error && <p role="alert">{error}</p>}
      <button type="submit" className="login-button">{welcome ? 'Open studio' : 'Save keys'} <ArrowRight size={17} /></button>
      <div className="key-actions">
        <button type="button" className="text-button" onClick={onCancel}>{welcome ? 'Skip for now' : 'Cancel'}</button>
      </div>
    </form>
  </dialog>;
}
