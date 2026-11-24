// The cart radio as the player uses it, shared by the town and the course: what's on, the keys, and the little
// stereo display. (audio/radio.ts is the player underneath: bands, the shared clock and the mixing.)
import { createRadio, type RadioSource } from './radio';
import { playSample } from './samples';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const radio = createRadio(),
  RS = { on: false, band: 0, vol: 0.7 };
try {
  const sv = JSON.parse(localStorage.getItem('gh.radio') || '{}');
  if (typeof sv.band === 'number') RS.band = clamp(Math.round(sv.band), 0, 9);
  if (typeof sv.vol === 'number') RS.vol = clamp(sv.vol, 0.1, 1);
  RS.on = sv.on === true;
} catch {}
let hud: HTMLDivElement | null = null,
  shown = '';
(window as any).__radio = { RS, radio };
export const cartRadio = {
  radio,
  RS,
  /** While driving: R on/off, 1–0 pick a band, − / = volume. Returns true if the key was the radio's. */
  key(e: KeyboardEvent, toast?: (h: string) => void) {
    const digit = /^Digit(\d)$/.exec(e.code);
    if (e.code === 'KeyR') RS.on = !RS.on;
    else if (digit) {
      RS.band = clamp((+digit[1] + 9) % 10, 0, Math.max(0, radio.bands.length - 1));
      RS.on = true;
    } else if (e.code === 'Minus') RS.vol = clamp(RS.vol - 0.1, 0.1, 1);
    else if (e.code === 'Equal') RS.vol = clamp(RS.vol + 0.1, 0.1, 1);
    else return false;
    playSample('tick', 0.6);
    if (RS.on && !radio.ready) toast?.('The radio is still warming up. One moment…');
    try {
      localStorage.setItem('gh.radio', JSON.stringify(RS));
    } catch {}
    return true;
  },
  /** Per frame: play these sources, and show the stereo display while you're at the wheel with it on. */
  frame(dt: number, src: RadioSource[], driving: boolean) {
    radio.update(dt, src);
    if (!hud) {
      hud = document.createElement('div');
      hud.style.cssText =
        'position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:12;display:none;padding:8px 16px 9px;border-radius:10px;background:linear-gradient(#2a2622,#14110e);border:1px solid rgba(255,232,190,.28);box-shadow:inset 0 0 0 2px #0c0a08,0 6px 18px rgba(0,0,0,.45);color:#ffd27a;font:700 15px "Barlow Condensed",Inter,sans-serif;letter-spacing:.06em;text-align:center;pointer-events:none;min-width:260px;white-space:nowrap';
      document.body.appendChild(hud);
    }
    const n = driving && RS.on ? radio.label(RS.band) : null,
      html = n
        ? `<span style="color:#ff6a4a">●</span> ${n.tag} <span style="opacity:.55;font-weight:600">${RS.band + 1 === 10 ? 0 : RS.band + 1} · ${n.genre}</span><div style="font:600 13px Inter,sans-serif;letter-spacing:0;color:#f6ecd8;margin-top:2px">${n.live ? '<span style="color:#ff6a4a;font-weight:800;letter-spacing:.06em">LIVE</span> ' : ''}${n.line}${n.who ? ` <span style="opacity:.6">· ${n.who}</span>` : ''} <span style="opacity:.5">· vol ${Math.round(RS.vol * 10)}</span></div>`
        : '';
    if (html !== shown) {
      shown = html;
      hud.innerHTML = html;
      hud.style.display = html ? 'block' : 'none';
    }
  },
  /** One call for a scene with just your own cart: at the wheel, or heard from where it's parked. */
  own(
    dt: number,
    driving: boolean,
    cart: { x: number; z: number } | null,
    me: { x: number; z: number },
    cam: { position: { x: number; z: number }; matrixWorld: { elements: ArrayLike<number> } },
  ) {
    const src: RadioSource[] = [];
    if (RS.on && driving) src.push({ id: 'me', band: RS.band, vol: RS.vol, mine: true, dist: 0, pan: 0 });
    else if (RS.on && cart) {
      const dx = cart.x - cam.position.x,
        dz = cart.z - cam.position.z,
        e = cam.matrixWorld.elements;
      src.push({
        id: 'me',
        band: RS.band,
        vol: RS.vol,
        mine: false,
        own: true,
        dist: Math.hypot(cart.x - me.x, cart.z - me.z),
        pan: (dx * e[0] + dz * e[2]) / (Math.hypot(dx, dz) + 4),
      });
    }
    this.frame(dt, src, driving);
  },
};
