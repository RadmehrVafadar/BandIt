import { useEffect, useRef, useState } from 'react';
import { AudioLines, Camera, Check, ImagePlus, Mic, Play, X } from 'lucide-react';
import { cleanSample, patterns } from './music.ts';
import type { Instrument, Role, Sample } from './music.ts';
import type { BeatEngine } from './engine.ts';
import { preparePhoto, readPhoto, recordSample, release } from './media.ts';
import type { Photo } from './media.ts';

type Props = { engine: BeatEngine; close: () => void; save: (instrument: Instrument) => Promise<void> };

export function Capture({ engine, close, save }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | undefined>(undefined);
  const session = useRef<AbortController | undefined>(undefined);
  const [photo, setPhoto] = useState<Photo>();
  const [cropped, setCropped] = useState(false);
  const [sample, setSample] = useState<Sample>();
  const [role, setRole] = useState<Role>('shaker');
  const [name, setName] = useState('');
  const [camera, setCamera] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState('');
  const [recording, setRecording] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [audioError, setAudioError] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    session.current = controller;
    const modal = dialog.current!;
    modal.showModal();
    return () => {
      controller.abort();
      release(stream.current);
      engine.stopPreview();
      engine.mute(false);
      modal.close();
    };
  }, [engine]);

  function stopCamera() {
    release(stream.current);
    stream.current = undefined;
    setCamera(false);
    setCameraReady(false);
  }

  async function openCamera() {
    const { signal } = session.current!;
    setBusy('camera');
    setPhotoError('');
    try {
      const input = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
      if (signal.aborted) return release(input);
      stream.current = input;
      setCamera(true);
      video.current!.srcObject = input;
    } catch {
      setPhotoError('Camera unavailable. You can upload a photo.');
    } finally {
      setBusy('');
    }
  }

  function snap() {
    const view = video.current!;
    try {
      setPhoto(preparePhoto(view, view.videoWidth, view.videoHeight));
      setCropped(false);
      setPhotoError('');
    } catch {
      setPhotoError('The photo could not be captured. Try again or upload a photo.');
    } finally {
      stopCamera();
    }
  }

  async function upload(file: File) {
    stopCamera();
    setBusy('photo');
    setPhotoError('');
    try {
      setPhoto(await readPhoto(file));
      setCropped(false);
    } catch {
      setPhotoError('This photo could not be opened. Try a JPG or PNG.');
    } finally {
      setBusy('');
    }
  }

  async function record() {
    const { signal } = session.current!;
    setBusy('audio');
    setAudioError('');
    engine.stopPreview();
    let input: MediaStream | undefined;
    try {
      const context = await engine.audio();
      signal.throwIfAborted();
      input = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      signal.throwIfAborted();
      engine.mute(true);
      await new Promise(resolve => setTimeout(resolve, 70));
      const blob = await recordSample(input, signal, () => setRecording(true));
      engine.mute(false);
      setRecording(false);
      signal.throwIfAborted();
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel));
      const cleaned = cleanSample(channels, decoded.sampleRate);
      if (cleaned) setSample(cleaned);
      else setAudioError('That take was too quiet. Bring the object closer and try again.');
    } catch (error) {
      if (!signal.aborted) {
        setAudioError(error instanceof DOMException && ['NotAllowedError', 'NotFoundError', 'NotReadableError'].includes(error.name)
          ? 'Microphone unavailable. Check your browser permissions and try again.'
          : 'The sound could not be recorded. Check your microphone and try again.');
      }
    } finally {
      release(input);
      if (!signal.aborted) {
        engine.mute(false);
        setRecording(false);
        setBusy('');
      }
    }
  }

  async function audition(part?: Role) {
    if (!sample) return;
    try {
      await engine.preview(sample, part);
    } catch {
      setAudioError('Playback is unavailable. Try the preview again.');
    }
  }

  async function finish() {
    if (!photo || !sample) return;
    setBusy('save');
    setSaveError('');
    try {
      await save({
        id: crypto.randomUUID(), name: name.trim() || 'New object',
        image: (!cropped && photo.cutout) || photo.crop, sample, role,
      });
      close();
    } catch {
      setSaveError('Could not save to this browser. Your photo and sound are still here. Try saving again.');
      setBusy('');
    }
  }

  return (
    <dialog ref={dialog} className="capture" aria-labelledby="capture-title"
      onCancel={event => { event.preventDefault(); if (busy !== 'save') close(); }}>
      <header className="capture-header">
        <div><h2 id="capture-title">Add an object</h2><p>Give an everyday object a part in the band.</p></div>
        <button className="icon-button" aria-label="Cancel capture" onClick={close} disabled={busy === 'save'}><X size={22} /></button>
      </header>
      <div className="capture-body">
        <section className="capture-section">
          <h3><Camera size={17} /> Photo</h3>
          <div className="photo-panel">
            <video ref={video} autoPlay playsInline muted hidden={!camera} onCanPlay={() => setCameraReady(true)} />
            {!camera && (photo ? <img alt="Object preview" src={(!cropped && photo.cutout) || photo.crop} />
              : <div className="photo-placeholder"><ImagePlus size={30} /><span>Use a plain background for a clean cutout.</span></div>)}
          </div>
          <div className="button-row">
            {camera ? <><button className="primary" disabled={!cameraReady} onClick={snap}>Take photo</button>
              <button className="secondary" onClick={stopCamera}>Close camera</button></>
              : <button className="secondary" disabled={!!busy} onClick={() => void openCamera()}><Camera size={16} />{busy === 'camera' ? 'Opening camera' : photo ? 'Retake photo' : 'Open camera'}</button>}
            {!camera && <label className="secondary file-button"><ImagePlus size={16} /> Upload photo
              <input type="file" accept="image/*" disabled={!!busy} onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void upload(file);
              }} />
            </label>}
          </div>
          {photo?.cutout && !camera && <div className="photo-choice" aria-label="Photo treatment">
            <button aria-pressed={!cropped} onClick={() => setCropped(false)}>Cutout</button>
            <button aria-pressed={cropped} onClick={() => setCropped(true)}>Cropped photo</button>
          </div>}
          {photoError && <p className="error" role="alert">{photoError}</p>}
        </section>
        <section className="capture-section details">
          <h3><Mic size={17} /> Sound</h3>
          <p>Tap, shake, or scrape your object for up to two seconds.</p>
          <div className="button-row">
            <button className={recording ? 'primary recording' : 'secondary'} disabled={!!busy || camera} onClick={() => void record()}>
              <Mic size={16} /> {recording ? 'Recording…' : busy === 'audio' ? 'Preparing…' : sample ? 'Retake sound' : 'Record sound'}
            </button>
            {sample && <button className="secondary" disabled={!!busy} onClick={() => void audition()}><Play size={15} /> Listen</button>}
          </div>
          {recording && <p role="status">Speakers muted. Make your sound now.</p>}
          {audioError && <p className="error" role="alert">{audioError}</p>}
          <h3 className="role-heading"><AudioLines size={18} /> Part</h3>
          <p>Choose a part to hear its rhythm.</p>
          <div className="role-grid">
            {(Object.keys(patterns) as Role[]).map(part => <button key={part} className={'role-option ' + part} aria-pressed={role === part}
              disabled={!!busy} onClick={() => { setRole(part); void audition(part); }}>
              {part[0].toUpperCase() + part.slice(1)}{role === part && <Check size={15} aria-hidden="true" />}
            </button>)}
          </div>
          <label className="name-label">Object name<input value={name} maxLength={30} placeholder="e.g. Keys" onChange={event => setName(event.target.value)} /></label>
          {saveError && <p className="error" role="alert">{saveError}</p>}
        </section>
      </div>
      <footer className="capture-footer">
        <button className="secondary" disabled={busy === 'save'} onClick={close}>Cancel</button>
        <button className="primary" disabled={!photo || !sample || !!busy || camera} onClick={() => void finish()}><Check size={18} /> {busy === 'save' ? 'Saving…' : 'Save to tray'}</button>
      </footer>
    </dialog>
  );
}
