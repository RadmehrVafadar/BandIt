import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { photoMeanings } from './object-labels.ts';
import { fetchStudioApi } from './auth.ts';
import type { StudioAccess } from './auth.ts';

type Props = {
  access: StudioAccess;
  onClose: () => void;
  onCapture: () => void;
  onIdentify: (name: string, photo: string) => boolean;
};

export function CameraCapture({ access, onClose, onCapture, onIdentify }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef<AbortController>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState('');
  const [clarification, setClarification] = useState<{ names: readonly string[]; photo: string }>();

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    session.current = controller;
    const preview = video.current!;
    let stream: MediaStream | undefined;
    const stop = () => stream?.getTracks().forEach(track => track.stop());

    async function connect() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setAccessError('Camera access needs a supported browser on HTTPS or localhost.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (controller.signal.aborted) return stop();
        preview.srcObject = stream;
        stream.getVideoTracks()[0].addEventListener('ended', () => {
          setReady(false);
          setAccessError('The camera disconnected. Reconnect it and try again.');
        }, { signal: controller.signal });
      } catch (cause) {
        if (controller.signal.aborted) return;
        setAccessError(cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'Allow camera access in your browser, then try again.' : 'Could not open a camera. Check your camera and try again.');
      }
    }
    void connect();
    return () => {
      controller.abort();
      stop();
      preview.srcObject = null;
    };
  }, [attempt]);

  function close() {
    session.current?.abort();
    dialog.current?.close();
    onClose();
  }

  function add(name: string, snapshot: string) {
    if (onIdentify(name, snapshot)) close();
    else setError('This slot is no longer available. Choose an empty slot.');
  }

  async function capture() {
    const preview = video.current!;
    const signal = session.current!.signal;
    if (!ready || photo || !preview.videoWidth || !preview.videoHeight) return;
    onCapture();
    setError('');
    try {
      const frame = document.createElement('canvas');
      const scale = Math.min(1, 768 / Math.max(preview.videoWidth, preview.videoHeight));
      frame.width = Math.round(preview.videoWidth * scale);
      frame.height = Math.round(preview.videoHeight * scale);
      frame.getContext('2d')!.drawImage(preview, 0, 0, frame.width, frame.height);
      const snapshot = frame.toDataURL('image/jpeg', 0.8);
      setPhoto(snapshot);
      const response = await fetchStudioApi(access, 'identify', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pocket-band': '1' },
        body: JSON.stringify({ image: snapshot.slice(snapshot.indexOf(',') + 1) }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
      });
      if (signal.aborted) return;
      if (response.status === 422) {
        setError('No clear object found. Center one object and take another photo.');
        return;
      }
      if (response.status === 403 && access.keys.gemini) {
        setError('Check your Gemini key in API keys, then try the photo again.');
        return;
      }
      if (response.status === 503) {
        setError('Photo recognition is unavailable. You can still draw the object.');
        return;
      }
      if (!response.ok) throw new Error('Recognition unavailable');
      const { name } = await response.json();
      if (signal.aborted) return;
      if (typeof name !== 'string' || !name) throw new Error('Missing object name');
      const names = photoMeanings.get(name);
      if (names) setClarification({ names, photo: snapshot });
      else add(name, snapshot);
    } catch {
      if (!signal.aborted) setError('Photo recognition is unavailable. Try again in a moment.');
    } finally {
      if (!signal.aborted) setPhoto('');
    }
  }

  const snapshot = clarification?.photo ?? photo;
  return <dialog ref={dialog} className="camera-dialog" aria-labelledby="camera-title"
    onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 id="camera-title">Camera</h2>
      <button type="button" className="icon-button" aria-label="Close camera" onClick={close}><X size={19} /></button>
    </header>
    <div className="camera-preview" hidden={!!accessError && !snapshot}>
      <video ref={video} aria-label="Camera preview" autoPlay playsInline muted onLoadedData={() => setReady(true)} />
      {snapshot && <img src={snapshot} alt="Captured photo" />}
    </div>
    {(accessError || error) && <p className="camera-error" role="alert">{accessError || error}</p>}
    {clarification ? <>
      <fieldset className="camera-choices">
        <legend>Which object is in your photo?</legend>
        {clarification.names.map(name =>
          <button key={name} type="button" className="camera-shutter" onClick={() => add(name, clarification.photo)}>
            {name[0].toUpperCase() + name.slice(1)}
          </button>)}
      </fieldset>
      <button type="button" className="camera-retake" onClick={() => {
        setClarification(undefined); setError('');
      }}>Retake photo</button>
    </> : accessError
      ? <button type="button" className="camera-shutter" onClick={() => {
        setAccessError(''); setError(''); setReady(false); setAttempt(value => value + 1);
      }}>Try camera again</button>
      : <>
        <p role="status">{photo ? 'Identifying object…' : ready ? 'Center one object. Gemini will identify it from your photo.' : 'Opening camera…'}</p>
        <button type="button" className="camera-shutter" disabled={!ready || !!photo} onClick={capture}>
          <Camera size={19} />Take photo
        </button>
      </>}
  </dialog>;
}
