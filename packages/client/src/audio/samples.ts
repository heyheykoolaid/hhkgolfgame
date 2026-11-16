// Recorded interface sounds and jingles (Kenney, CC0; packed by tools/sfx/pack.py into public/sfx/ui.json). The game's
// other sounds are synthesized; these are the ones a synth does badly: clicks, confirmations and little fanfares.
import { audioCtx, sfxOut } from './ctx';

export type Sample =
  | 'click'
  | 'select'
  | 'open'
  | 'close'
  | 'toggle'
  | 'confirm'
  | 'error'
  | 'tick'
  | 'drop'
  | 'back'
  | 'win'
  | 'lap'
  | 'best'
  | 'sunk'
  | 'trophy'
  | 'lose';
const bufs = new Map<string, AudioBuffer>();
let started = false;
function load(c: AudioContext) {
  if (started) return;
  started = true;
  fetch(new URL('sfx/ui.json', document.baseURI).href)
    .then(r => (r.ok ? r.json() : {}))
    .then(j => {
      for (const [k, b64] of Object.entries(j)) {
        const bin = Uint8Array.from(atob(b64 as string), ch => ch.charCodeAt(0));
        c.decodeAudioData(bin.buffer).then(
          b => bufs.set(k, b),
          () => {},
        );
      }
    })
    .catch(() => {});
}
const last = new Map<string, number>();
/** Play one. Silent until the first key press or click has woken the audio, and never twice within 40 ms. */
export function playSample(name: Sample, vol = 0.5, rate = 1) {
  const c = audioCtx();
  if (!c) return;
  load(c);
  const b = bufs.get(name),
    now = c.currentTime;
  if (!b || now - (last.get(name) ?? -1) < 0.04) return;
  last.set(name, now);
  const s = c.createBufferSource(),
    g = c.createGain();
  s.buffer = b;
  s.playbackRate.value = rate;
  g.gain.value = vol;
  s.connect(g).connect(sfxOut(c));
  s.start();
}
/** Every button in the game clicks: chips and tabs with a softer note, switches with a switch. Call once. */
export function wireUiSounds() {
  addEventListener(
    'click',
    e => {
      const t = (e.target as HTMLElement | null)?.closest?.('button, [role=button], .tloc, input[type=checkbox]') as HTMLElement | null;
      if (!t) return;
      if (t.classList.contains('otog') || (t as HTMLInputElement).type === 'checkbox') playSample('toggle', 0.4);
      else if (t.classList.contains('t') || t.classList.contains('tloc') || t.dataset.s !== undefined || t.classList.contains('tab'))
        playSample('select', 0.35);
      else if (t.classList.contains('primary')) playSample('confirm', 0.4);
      else playSample('click', 0.5);
    },
    true,
  );
}
