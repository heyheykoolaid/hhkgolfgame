// Ways to spend cash in town that everyone notices (money sinks, Nov 24):
// - a Round for the Room at the Lucky Lie Lounge's bar: everyone in the lounge gets a toast with the buyer's name and
//   a drunk camera sway for a while (sent in presence, `rr`);
// - sponsoring Fun Land at the Golden Wheel's ticket booth: a fireworks show over the plaza that ends by writing your
//   name in the sky, or free rides for everyone for 15 minutes (both kept in your lot's record, plots/{uid}, so
//   everyone sees them, latecomers included, and both run off the wall clock);
// - ride tickets (karts, mini putt, a bucket at the range), free while someone's sponsoring;
// - bribing the Street Dealer (also in your lot's record): which strain he wants, or one he lowballs, for three hours.
import * as THREE from 'three';
import { STRAINS, BRIBE_MS, setDealerBribe, type DealerBribe } from '@gh/shared';
import { progress, addCash } from '../avatar/progress';
import { money, esc } from '../ui/dom';
import { playSample } from '../audio/samples';
import { audioCtx, whiteNoise, sfxOut } from '../audio/ctx';

export const ROUNDS = [
  { id: 1, name: 'A round of beers', price: 500, sway: 0.5, icon: '🍺' },
  { id: 2, name: 'Cocktails all round', price: 1000, sway: 0.8, icon: '🍸' },
  { id: 3, name: 'The top shelf', price: 2000, sway: 1, icon: '🥃' },
];
export const FIREWORKS_PRICE = 1000,
  FREE_RIDES_PRICE = 1000,
  FREE_RIDES_MS = 15 * 60 * 1000,
  BRIBE_PRICE = 2000,
  SHOW_S = 62;
export const RIDES = { karts: 60, putt: 25, range: 40 } as const;
/** The lounge's floor in world coordinates (lobby/shady.ts builds it): who's "in the room" for a round. */
const LOUNGE = { x0: 24.3, x1: 36, z0: -90.2, z1: -74.4 };
export const inLounge = (x: number, z: number) => x > LOUNGE.x0 && x < LOUNGE.x1 && z > LOUNGE.z0 && z < LOUNGE.z1;
/** Where you stand to order: in front of the bar counter. */
export const BAR_SPOT = { x: 30.6, z: -84.5 };

export interface SinksHost {
  scene: THREE.Scene;
  toast(html: string, ms?: number): void;
  openModal(title: string, html: string): void;
  closeModal(): void;
  /** every lot's record, by owner */
  plotDocs(): Map<string, any>;
  saveMyPlot(patch: Record<string, unknown>): void;
  me(): string;
  nameOf(uid: string): string;
  /** where I am */
  at(): { x: number; z: number };
  sendPres(): void;
}

export function createSinks(host: SinksHost) {
  const { toast } = host;
  // ---------------- town state from everyone's lot records ----------------
  let freeUntil = 0,
    show: { t: number; n: string } | null = null;
  function readTown(now: number) {
    let br: (DealerBribe & { at: number }) | null = null;
    freeUntil = 0;
    show = null;
    for (const [uid, d] of host.plotDocs()) {
      if (!d || typeof d !== 'object') continue;
      const b = d.bribe;
      if (b && typeof b === 'object' && +b.until > now && +b.until < now + BRIBE_MS + 60000 && (!br || +b.at > br.at))
        br = {
          want: typeof b.want === 'string' && STRAINS.some(s => s.id === b.want) ? b.want : undefined,
          dump: typeof b.dump === 'string' && STRAINS.some(s => s.id === b.dump) ? b.dump : undefined,
          until: +b.until,
          at: +b.at || 0,
        };
      if (+d.rides > now && +d.rides < now + FREE_RIDES_MS + 60000) freeUntil = Math.max(freeUntil, +d.rides);
      if (d.fw && +d.fw.t <= now + 5000 && now - +d.fw.t < SHOW_S * 1000 && (!show || +d.fw.t > show.t))
        show = { t: +d.fw.t, n: String(d.fw.n || host.nameOf(uid)).slice(0, 18) };
    }
    setDealerBribe(br);
  }
  // ---------------- ride tickets ----------------
  const ridesFree = () => Date.now() < freeUntil;
  /** Pay for a ride (true = go ahead). Free while someone's sponsoring the park. */
  async function payRide(kind: keyof typeof RIDES, what: string) {
    if (ridesFree()) {
      toast(`${what}: <b>free</b> today, someone's sponsoring the park!`, 2000);
      return true;
    }
    const p = RIDES[kind];
    if (!(await addCash(-p))) {
      toast(`${what} is ${money(p)}. You can't afford it right now.`, 2400);
      return false;
    }
    toast(`${what}: ${money(p)}.`, 1600);
    return true;
  }
  // ---------------- a round for the room ----------------
  let myRound: [number, number] | null = null,
    sway = 0,
    swayT = 0;
  const seenRounds = new Map<string, number>();
  function openBar() {
    const c = progress().cash;
    host.openModal(
      'The bar',
      `<div class="shop"><div class="shophead"><p class="muted">"What'll it be? Buy for the room and everybody in here knows your name."</p><div class="shopcash">Cash <b>${money(c)}</b></div></div>
       <div class="goods">${ROUNDS.map(
         r => `<div class="good"><div class="gi">${r.icon}</div><div class="gt"><b>${r.name} for the room</b><p>Everyone in the lounge drinks on you. Their screens will tell them who to thank.</p></div>
         <button data-round="${r.id}" ${c < r.price ? 'disabled' : ''}>${money(r.price)}</button></div>`,
       ).join('')}</div></div>`,
    );
    document.querySelectorAll<HTMLButtonElement>('#lmodal [data-round]').forEach(
      b =>
        (b.onclick = async () => {
          const r = ROUNDS.find(x => x.id === +b.dataset.round!)!;
          if (!(await addCash(-r.price))) return toast("You can't afford that round.");
          playSample('win', 0.5);
          myRound = [Date.now(), r.id];
          host.sendPres();
          host.closeModal();
          drink(r.sway);
          toast(`${r.icon} You bought <b>${r.name.toLowerCase()}</b> for the room. Cheers!`, 3500);
        }),
    );
  }
  function drink(k: number) {
    sway = Math.min(1.2, sway + k);
    swayT = 0;
  }
  /** a round in someone's presence: if it's new and I'm in the lounge, I'm drinking too */
  function peerRound(uid: string, rr: unknown) {
    if (!Array.isArray(rr) || rr.length !== 2) return;
    const t = +rr[0],
      r = ROUNDS.find(x => x.id === +rr[1]);
    if (!r || !(t > 0) || seenRounds.get(uid) === t) return;
    const first = !seenRounds.has(uid);
    seenRounds.set(uid, t);
    if (first && Date.now() - t > 30000) return; // (an old round, seen as they arrived)
    const a = host.at();
    if (Date.now() - t > 30000 || !inLounge(a.x, a.z)) return;
    drink(r.sway);
    playSample('win', 0.35);
    toast(`${r.icon} <b>${esc(host.nameOf(uid))}</b> bought ${r.name.toLowerCase()} for the room! Cheers!`, 4000);
  }
  // ---------------- the Golden Wheel's ticket booth: sponsor the park ----------------
  function openSponsor() {
    const c = progress().cash,
      free = ridesFree();
    host.openModal(
      'Sponsor Fun Land',
      `<div class="shop"><div class="shophead"><p class="muted">"Want your name up in lights? It's for a good cause. Mostly."</p><div class="shopcash">Cash <b>${money(c)}</b></div></div>
       <div class="goods">
        <div class="good"><div class="gi">🎆</div><div class="gt"><b>Golden-hour fireworks</b><p>A minute of fireworks over the plaza for the whole town, finishing with your name written in the sky.</p><em>${show ? 'A show is on right now' : ''}</em></div>
          <button data-fw ${c < FIREWORKS_PRICE || show ? 'disabled' : ''}>${money(FIREWORKS_PRICE)}</button></div>
        <div class="good"><div class="gi">🎟️</div><div class="gt"><b>Free rides for everyone</b><p>Go-karts, mini putt and the driving range are free for the whole town for 15 minutes.</p><em>${free ? `Free for another ${Math.ceil((freeUntil - Date.now()) / 60000)} min` : ''}</em></div>
          <button data-rides ${c < FREE_RIDES_PRICE ? 'disabled' : ''}>${money(FREE_RIDES_PRICE)}</button></div>
       </div>
       <p class="muted" style="margin-top:10px">Ride prices: go-karts ${money(RIDES.karts)}, mini putt ${money(RIDES.putt)}, a bucket at the range ${money(RIDES.range)}.</p></div>`,
    );
    document.querySelector<HTMLButtonElement>('#lmodal [data-fw]')?.addEventListener('click', async () => {
      if (!(await addCash(-FIREWORKS_PRICE))) return;
      host.saveMyPlot({ fw: { t: Date.now() + 3000, n: host.nameOf(host.me()) } });
      playSample('confirm', 0.5);
      host.closeModal();
      toast('🎆 Look up over the plaza: the show starts in a few seconds.', 4000);
    });
    document.querySelector<HTMLButtonElement>('#lmodal [data-rides]')?.addEventListener('click', async () => {
      if (!(await addCash(-FREE_RIDES_PRICE))) return;
      host.saveMyPlot({ rides: Math.max(Date.now(), freeUntil) + FREE_RIDES_MS });
      playSample('confirm', 0.5);
      host.closeModal();
      toast('🎟️ Fun Land is free for everyone for the next 15 minutes. Thanks to you.', 4000);
    });
  }
  // ---------------- bribing the Street Dealer ----------------
  function openBribe() {
    const c = progress().cash,
      list = STRAINS.filter(s => !s.hidden);
    host.openModal(
      'A word with the dealer',
      `<div class="shop"><div class="shophead"><p class="muted">"${money(BRIBE_PRICE)} and I'll see things your way for a few hours. Nobody needs to know."</p><div class="shopcash">Cash <b>${money(c)}</b></div></div>
       <h3>Make him want a strain</h3><p class="muted">He pays 22% more for it, to everyone, for three hours.</p>
       <div class="tg">${list.map(s => `<button class="t" data-want="${s.id}" ${c < BRIBE_PRICE ? 'disabled' : ''}>${esc(s.name)}</button>`).join('')}</div>
       <h3>Make him lowball a strain</h3><p class="muted">He pays 30% less for it, to everyone, for three hours. Know someone sitting on a big crop?</p>
       <div class="tg">${list.map(s => `<button class="t" data-dump="${s.id}" ${c < BRIBE_PRICE ? 'disabled' : ''}>${esc(s.name)}</button>`).join('')}</div>
       <p class="muted" style="margin-top:10px">The latest bribe wins: someone else can pay him to change his mind.</p></div>`,
    );
    document.querySelectorAll<HTMLButtonElement>('#lmodal [data-want],#lmodal [data-dump]').forEach(
      b =>
        (b.onclick = async () => {
          if (!(await addCash(-BRIBE_PRICE))) return;
          const now = Date.now(),
            bribe = { want: b.dataset.want, dump: b.dataset.dump, until: now + BRIBE_MS, at: now };
          host.saveMyPlot({ bribe });
          playSample('confirm', 0.45);
          host.closeModal();
          const s = STRAINS.find(x => x.id === (bribe.want || bribe.dump))!;
          toast(
            bribe.want ? `"${esc(s.name)}? Sure. That's what I want now."` : `"${esc(s.name)}? Nobody wants that stuff. Not at those prices."`,
            3500,
          );
        }),
    );
  }
  // ---------------- fireworks ----------------
  const FW = createFireworks(host.scene);
  let readT = 0;
  function update(dt: number, camera: THREE.Camera) {
    const now = Date.now();
    if ((readT -= dt) <= 0) {
      readT = 1;
      readTown(now);
    }
    FW.update(dt, show ? (now - show.t) / 1000 : -1, show?.n || '', camera);
    // the round's sway: a slow roll and drift that wears off over a couple of minutes
    if (sway > 0.01) {
      swayT += dt;
      sway = Math.max(0, sway - dt / 150);
      camera.rotateZ(Math.sin(swayT * 0.45) * 0.03 * sway);
      camera.rotateX(Math.sin(swayT * 0.31 + 1) * 0.012 * sway);
    }
  }
  return {
    update,
    openBar,
    openSponsor,
    openBribe,
    payRide,
    ridesFree,
    peerRound,
    /** my round, for presence (kept up for 20 s) */
    pres: () => (myRound && Date.now() - myRound[0] < 20000 ? myRound : undefined),
  };
}

// ---------------- the fireworks show: shells on a fixed schedule from the start time, so everyone sees the same show
function createFireworks(scene: THREE.Scene) {
  const MAX = 4000,
    pos = new Float32Array(MAX * 3),
    col = new Float32Array(MAX * 3),
    geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dot = document.createElement('canvas');
  dot.width = dot.height = 32;
  {
    const g = dot.getContext('2d')!,
      gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
  }
  const mat = new THREE.PointsMaterial({
    size: 2.2,
    map: new THREE.CanvasTexture(dot),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.visible = false;
  scene.add(pts);
  const PAL = ['#ffd24a', '#ff5fa2', '#3fd6c1', '#a77bff', '#ff8a3d', '#f4f1ea', '#7cff6a'].map(c => new THREE.Color(c));
  const C = { x: 0, y: 70, z: -10 }; // over the plaza
  const rnd = (k: number) => {
    const x = Math.sin(k * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  /** shell k: when it bursts, where, how big, which colour */
  const shell = (k: number) => ({
    t: 1.2 + k * 0.85 + rnd(k) * 0.5,
    x: C.x + (rnd(k + 0.1) - 0.5) * 70,
    y: C.y + (rnd(k + 0.2) - 0.5) * 30,
    z: C.z + (rnd(k + 0.3) - 0.5) * 50,
    r: 14 + rnd(k + 0.4) * 12,
    c: PAL[Math.floor(rnd(k + 0.5) * PAL.length)],
    n: 90 + Math.floor(rnd(k + 0.6) * 80),
  });
  const SHELLS = Array.from({ length: 58 }, (_, k) => shell(k)).filter(s => s.t < SHOW_S - 12);
  let nameFor = '',
    namePts: [number, number][] = [];
  function nameDots(n: string) {
    if (n === nameFor) return namePts;
    nameFor = n;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 48;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.font = 'bold 40px "Barlow Condensed", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(n.toUpperCase(), 128, 26);
    const d = g.getImageData(0, 0, 256, 48).data;
    namePts = [];
    for (let y = 0; y < 48; y += 2)
      for (let x = 0; x < 256; x += 2) if (d[(y * 256 + x) * 4 + 3] > 128) namePts.push([(x - 128) / 2.2, (24 - y) / 2.2]);
    if (namePts.length > 1400) namePts = namePts.filter((_, i) => i % Math.ceil(namePts.length / 1400) === 0);
    return namePts;
  }
  const lastBoom = new Set<number>();
  function boom(s: { x: number; y: number; z: number; r: number }, cam: THREE.Camera, big = false) {
    const c = audioCtx();
    if (!c) return;
    const d = Math.hypot(cam.position.x - s.x, cam.position.y - s.y, cam.position.z - s.z),
      vol = Math.min(0.5, 30 / (d + 20)) * (big ? 1.4 : 1),
      at = c.currentTime + d / 343; // (sound arrives after the flash)
    const src = c.createBufferSource(),
      f = c.createBiquadFilter(),
      gn = c.createGain();
    src.buffer = whiteNoise(c);
    f.type = 'lowpass';
    f.frequency.value = 500;
    gn.gain.setValueAtTime(0, at);
    gn.gain.linearRampToValueAtTime(vol, at + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.001, at + 1.4);
    src.connect(f).connect(gn).connect(sfxOut(c));
    src.start(at, Math.random());
    src.stop(at + 1.5);
  }
  const fwd = new THREE.Vector3();
  return {
    update(_dt: number, t: number, name: string, cam: THREE.Camera) {
      if (t < 0 || t > SHOW_S) {
        pts.visible = false;
        lastBoom.clear();
        return;
      }
      pts.visible = true;
      let n = 0;
      const put = (x: number, y: number, z: number, c: THREE.Color, k: number) => {
        if (n >= MAX) return;
        pos[n * 3] = x;
        pos[n * 3 + 1] = y;
        pos[n * 3 + 2] = z;
        col[n * 3] = c.r * k;
        col[n * 3 + 1] = c.g * k;
        col[n * 3 + 2] = c.b * k;
        n++;
      };
      SHELLS.forEach((s, k) => {
        const a = t - s.t;
        if (a < -1.2 || a > 3.2) return;
        if (a < 0) {
          // the rising streak
          const u = 1 + a / 1.2;
          for (let i = 0; i < 6; i++) put(s.x, s.y * (u - i * 0.012), s.z, PAL[0], 0.6 - i * 0.08);
          return;
        }
        if (!lastBoom.has(k)) {
          lastBoom.add(k);
          boom(s, cam);
        }
        const fade = Math.max(0, 1 - a / 3.2),
          rr = s.r * (1 - Math.exp(-a * 2.6));
        for (let i = 0; i < s.n; i++) {
          const u = rnd(k * 7 + i * 0.37) * 2 - 1,
            th = rnd(k * 3 + i * 0.91) * Math.PI * 2,
            q = Math.sqrt(1 - u * u);
          put(s.x + Math.cos(th) * q * rr, s.y + u * rr - a * a * 1.6, s.z + Math.sin(th) * q * rr, s.c, fade * (0.6 + 0.4 * Math.sin(t * 30 + i)));
        }
      });
      // the finale: the sponsor's name in gold, facing the camera
      const a = t - (SHOW_S - 11);
      if (a > 0) {
        if (!lastBoom.has(-1)) {
          lastBoom.add(-1);
          boom({ x: C.x, y: C.y + 8, z: C.z, r: 0 }, cam, true);
        }
        cam.getWorldDirection(fwd);
        const yaw = Math.atan2(fwd.x, fwd.z),
          rx = Math.cos(yaw),
          rz = -Math.sin(yaw),
          fade = a < 8 ? Math.min(1, a * 2) : Math.max(0, 1 - (a - 8) / 3),
          grow = 1 - Math.exp(-a * 3);
        for (const [i, [px, py]] of nameDots(name).entries())
          put(
            C.x - rx * px * 1.4 * grow,
            C.y + 8 + py * 1.4 * grow - Math.max(0, a - 8) * 1.5,
            C.z - rz * px * 1.4 * grow,
            PAL[0],
            fade * (0.7 + 0.3 * Math.sin(t * 9 + i)),
          );
      }
      geo.setDrawRange(0, n);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}
