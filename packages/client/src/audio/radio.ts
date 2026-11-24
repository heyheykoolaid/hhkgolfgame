// The cart radio (cart-radio.md). Off the Claude artifact page each band plays a live internet station (audio/stations.ts);
// on that page, which can't play outside streams, and for any band with no station that plays, the "stations" are
// playlists of public-domain tracks shipped with the game (public/radio, built by tools/radio). Every band runs on the wall clock:
// whoever tunes in, on any computer, lands at the same point of the same song, so a cart's music is the same for
// everyone near it without any audio being sent between players.
import { audioCtx, masterOut } from './ctx';
import { opts, onOptions } from '../ui/options';
import { STATIONS, LIVE_OK } from './stations';

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

/** A live station playing for one radio. Tried first with Web Audio (stereo placement and the volume cap), which
 *  needs the station to allow it (CORS); if it doesn't, the same station plays as a plain audio element with only
 *  its volume set (no left and right). A station that won't start moves on to the band's next one. */
interface Live {
  el: HTMLAudioElement;
  gain: GainNode | null;
  pan: StereoPannerNode | null;
  band: number;
  si: number;
  routed: boolean;
  started: number;
  playing: boolean;
  seen: number;
}
/** The station that last played in each band (so the next radio tuned to it starts there), and bands where none
 *  would play, with when they gave up (tried again after a few minutes). */
const goodStation = new Map<number, number>(),
  deadBand = new Map<number, number>();
const RETRY_DEAD_MS = 5 * 60 * 1000,
  START_WAIT_MS = 12000;

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

  // ---------------------------------------------------------------- live stations
  const lives = new Map<string, Live>();
  const stationsOf = (band: number) => (bands[band] ? STATIONS[bands[band].tag] || [] : []);
  /** Does this band play live right now? */
  const liveBand = (band: number) => {
    if (!LIVE_OK || !stationsOf(band).length) return false;
    const d = deadBand.get(band);
    if (d && Date.now() - d < RETRY_DEAD_MS) return false;
    if (d) deadBand.delete(band);
    return true;
  };
  function dropLive(id: string) {
    const L = lives.get(id);
    if (!L) return;
    L.el.pause();
    L.el.removeAttribute('src');
    try {
      L.el.load();
    } catch {}
    L.gain?.disconnect();
    L.pan?.disconnect();
    lives.delete(id);
  }
  function startLive(id: string, band: number, si: number, routed: boolean, c: AudioContext): Live | null {
    dropLive(id);
    const st = stationsOf(band)[si];
    if (!st) {
      deadBand.set(band, Date.now()); // nothing in this band would play: its shipped tracks take over for a while
      return null;
    }
    if (!bus) {
      bus = c.createGain();
      bus.gain.value = opts.radio;
      bus.connect(masterOut(c));
    }
    const el = new Audio();
    let gain: GainNode | null = null,
      pan: StereoPannerNode | null = null;
    if (routed) {
      el.crossOrigin = 'anonymous';
      gain = c.createGain();
      pan = c.createStereoPanner();
      gain.gain.value = 0;
      c.createMediaElementSource(el).connect(gain).connect(pan).connect(bus);
    } else el.volume = 0;
    const L: Live = { el, gain, pan, band, si, routed, started: Date.now(), playing: false, seen: tick };
    const fail = () => {
      if (lives.get(id) !== L) return;
      // the same station without Web Audio next (no stereo, but it plays), then the band's next station
      startLive(id, band, routed ? si : si + 1, !routed, c);
    };
    el.addEventListener('playing', () => {
      L.playing = true;
      goodStation.set(band, si);
    });
    el.addEventListener('error', fail);
    el.addEventListener('ended', fail);
    el.preload = 'none';
    el.src = st.url;
    el.play().catch(() => {}); // (an error here also fires 'error' if the stream itself is the problem)
    lives.set(id, L);
    return L;
  }
  /** One live radio this frame: tune, keep it playing, set its level. */
  function liveFrame(s: RadioSource, level: number, c: AudioContext) {
    let L = lives.get(s.id) || null;
    if (!L || L.band !== s.band) L = startLive(s.id, s.band, goodStation.get(s.band) ?? 0, true, c);
    if (!L) return;
    L.seen = tick;
    if (!L.playing && Date.now() - L.started > START_WAIT_MS) {
      // never started: the next way to play it
      L = startLive(s.id, s.band, L.routed ? L.si : L.si + 1, !L.routed, c);
      if (!L) return;
      L.seen = tick;
    }
    if (L.playing && L.el.paused) L.el.play().catch(() => {});
    if (L.routed) {
      L.gain!.gain.setTargetAtTime(L.playing ? level : 0, c.currentTime, 0.12);
      L.pan!.pan.setTargetAtTime(s.mine ? 0 : Math.max(-1, Math.min(1, s.pan)) * 0.8, c.currentTime, 0.1);
    } else L.el.volume = Math.max(0, Math.min(1, (L.playing ? level : 0) * opts.radio * opts.master));
  }

  return {
    /** What the stereo shows for a band: a live station's name (or that it's tuning), or the shipped track playing. */
    label(band: number): { tag: string; genre: string; line: string; who: string; live: boolean } | null {
      const b = bands[band];
      if (!b) return null;
      if (liveBand(band)) {
        const mine = [...lives.values()].find(l => l.band === band),
          st = stationsOf(band)[mine?.si ?? goodStation.get(band) ?? 0];
        return { tag: b.tag, genre: b.genre, line: mine?.playing ? st?.name || '' : 'Tuning in…', who: '', live: !!mine?.playing };
      }
      const n = now(band);
      return n ? { tag: b.tag, genre: b.genre, line: n.track.t, who: n.track.a, live: false } : null;
    },
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
        const fall0 = s.mine ? 1 : Math.max(0, 1 - Math.max(0, s.dist - NEAR) / (REACH - NEAR)),
          level0 = s.mine ? s.vol : s.own ? s.vol * fall0 * fall0 : Math.min(CAP, s.vol) * fall0 * fall0 * opts.radioOthers;
        if (liveBand(s.band)) {
          if (players.has(s.id)) stop(s.id); // (a shipped track that was playing for this radio)
          liveFrame(s, level0, c);
          continue;
        }
        if (lives.has(s.id)) dropLive(s.id);
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
      for (const [id, L] of lives)
        if (L.seen !== tick) {
          if (L.gain) L.gain.gain.setTargetAtTime(0, c.currentTime, 0.15);
          else L.el.volume = 0;
          if (L.seen < tick - 45) dropLive(id);
        }
      for (const [id, p] of players)
        if (p.seen !== tick) {
          p.gain.gain.setTargetAtTime(0, c.currentTime, 0.15);
          if (p.seen < tick - 45) stop(id);
        }
    },
    /** Debug: what each player is doing. */
    debug() {
      return [
        ...[...players].map(([id, p]) => ({ id, file: p.file, at: p.el.currentTime, paused: p.el.paused, gain: p.gain.gain.value })),
        ...[...lives].map(([id, L]) => ({ id, live: stationsOf(L.band)[L.si]?.name, url: L.el.src, routed: L.routed, playing: L.playing })),
      ];
    },
    stopAll() {
      for (const id of [...players.keys()]) stop(id);
      for (const id of [...lives.keys()]) dropLive(id);
    },
  };
}
