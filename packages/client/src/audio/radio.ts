// The cart radio (cart-radio.md). The published page can't play outside streams, so the "stations" are playlists of
// public-domain tracks shipped with the game (public/radio, built by tools/radio). Every band runs on the wall clock:
// whoever tunes in, on any computer, lands at the same point of the same song, so a cart's music is the same for
// everyone near it without any audio being sent between players.
import { audioCtx, masterOut } from './ctx';
import { opts, onOptions } from '../ui/options';

export interface RadioTrack {
  f: string;
  d: number;
  t: string;
  a: string;
  s: string;
}
export interface RadioBand {
  tag: string;
  genre: string;
  tracks: RadioTrack[];
}
/** One radio that's switched on: the player's own cart, or somebody else's nearby. */
export interface RadioSource {
  id: string;
  band: number;
  vol: number;
  mine: boolean;
  /** the player's own cart heard from outside it (parked with the radio on): no cap, and not under "other carts" */
  own?: boolean;
  /** how far from the listener, and where across the stereo field (-1 left … 1 right) */
  dist: number;
  pan: number;
}

const REACH = 34, // metres at which someone else's radio fades to nothing
  NEAR = 5, // …and inside this it's at its full level
  CAP = 0.55, // other carts never play louder than this, whatever their volume
  MAX_OTHERS = 3;

interface Player {
  el: HTMLAudioElement;
  gain: GainNode;
  pan: StereoPannerNode;
  file: string;
  ready: boolean;
  seen: number;
}

export function createRadio() {
  let bands: RadioBand[] = [],
    loaded = false,
    bus: GainNode | null = null,
    tick = 0;
  const players = new Map<string, Player>(),
    blobs = new Map<string, Promise<string>>(),
    url = (f: string) => new URL('radio/' + f, document.baseURI).href;
  fetch(url('radio.json'))
    .then(r => (r.ok ? r.json() : null))
    .then(j => {
      if (j && Array.isArray(j.bands)) bands = j.bands.filter((b: RadioBand) => b?.tracks?.length);
      loaded = true;
    })
    .catch(() => (loaded = true));
  onOptions(() => {
    const c = audioCtx();
    if (bus && c) bus.gain.setTargetAtTime(opts.radio, c.currentTime, 0.05);
  });

  /** A track is fetched whole and played from memory, so jumping into the middle of it always works. */
  const blob = (f: string) => {
    let p = blobs.get(f);
    if (!p) {
      p = fetch(url(f))
        .then(r => {
          if (!r.ok) throw new Error('radio ' + r.status);
          return r.arrayBuffer();
        })
        .then(b => URL.createObjectURL(new Blob([b], { type: 'audio/mpeg' })));
      p.catch(() => blobs.delete(f));
      blobs.set(f, p);
    }
    return p;
  };
  /** What a band is playing right now, and how far into it. */
  function now(band: number) {
    const b = bands[band];
    if (!b) return null;
    let total = 0;
    for (const t of b.tracks) total += t.d;
    // each band starts its loop at a different point, so they don't all change song together
    let at = (Date.now() / 1000 + band * 67) % total,
      i = 0;
    while (at >= b.tracks[i].d) at -= b.tracks[i++].d;
    return { band: b, track: b.tracks[i], at, next: b.tracks[(i + 1) % b.tracks.length] };
  }
  function playerFor(id: string, c: AudioContext): Player {
    let p = players.get(id);
    if (!p) {
      if (!bus) {
        bus = c.createGain();
        bus.gain.value = opts.radio;
        bus.connect(masterOut(c));
      }
      const el = new Audio(),
        gain = c.createGain(),
        pan = c.createStereoPanner();
      el.preload = 'auto';
      gain.gain.value = 0;
      c.createMediaElementSource(el).connect(gain).connect(pan).connect(bus);
      players.set(id, (p = { el, gain, pan, file: '', ready: false, seen: 0 }));
    }
    return p;
  }
  function stop(id: string) {
    const p = players.get(id);
    if (!p) return;
    p.el.pause();
    p.el.removeAttribute('src');
    p.gain.disconnect();
    p.pan.disconnect();
    players.delete(id);
  }

  return {
    get ready() {
      return loaded && bands.length > 0;
    },
    get bands() {
      return bands;
    },
    now,
    /** Call every frame with every radio that's on. Radios not in the list fade out and stop. */
    update(dt: number, sources: RadioSource[]) {
      const c = audioCtx();
      if (!c || !bands.length) return;
      tick++;
      const mine = sources.filter(s => s.mine),
        others = sources
          .filter(s => !s.mine && s.dist < REACH)
          .sort((a, b) => a.dist - b.dist)
          .slice(0, MAX_OTHERS);
      for (const s of [...mine, ...others]) {
        const n = now(s.band);
        if (!n) continue;
        const p = playerFor(s.id, c);
        p.seen = tick;
        if (p.file !== n.track.f) {
          // a new song (or a new station): fetch it, then start it where the clock says it should be
          const f = (p.file = n.track.f);
          p.ready = false;
          blob(f)
            .then(u => {
              if (p.file !== f) return;
              p.el.src = u;
              p.el.currentTime = Math.min(now(s.band)?.at ?? 0, Math.max(0, n.track.d - 0.5));
              p.ready = true;
              return p.el.play();
            })
            .catch(() => {
              if (p.file === f) p.file = '';
            });
          blob(n.next.f).catch(() => {});
        } else if (p.ready) {
          if (Math.abs(p.el.currentTime - n.at) > 1.5 && n.at < n.track.d - 1) p.el.currentTime = n.at;
          if (p.el.paused) p.el.play().catch(() => {});
        }
        const fall = s.mine ? 1 : Math.max(0, 1 - Math.max(0, s.dist - NEAR) / (REACH - NEAR)),
          level = s.mine ? s.vol : s.own ? s.vol * fall * fall : Math.min(CAP, s.vol) * fall * fall * opts.radioOthers;
        p.gain.gain.setTargetAtTime(p.ready ? level : 0, c.currentTime, 0.12);
        p.pan.pan.setTargetAtTime(s.mine ? 0 : Math.max(-1, Math.min(1, s.pan)) * 0.8, c.currentTime, 0.1);
      }
      for (const [id, p] of players)
        if (p.seen !== tick) {
          p.gain.gain.setTargetAtTime(0, c.currentTime, 0.15);
          if (p.seen < tick - 45) stop(id);
        }
    },
    /** Debug: what each player is doing. */
    debug() {
      return [...players].map(([id, p]) => ({ id, file: p.file, at: p.el.currentTime, paused: p.el.paused, gain: p.gain.gain.value }));
    },
    stopAll() {
      for (const id of [...players.keys()]) stop(id);
    },
  };
}
