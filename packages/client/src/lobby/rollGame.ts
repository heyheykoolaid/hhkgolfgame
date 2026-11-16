// The rolling minigame (grind-roll-smoke.md): six hands-on steps on a rolling tray, each done with the mouse the way
// you'd do it with your fingers, each timed and given a medal, in the spirit of a cooking minigame.
//   1 Break it up   pinch the buds apart (or load the grinder and twist it)
//   2 Paper         drag a paper from the pack onto the tray, then run a fingertip along it to crease it
//   3 Sprinkle      hold to take a pinch from the dish, carry it, let go over the paper; what you drop stays where it lands
//   4 Tuck & roll   rub up and down in a steady rhythm to roll it
//   5 Lick & seal   one smooth stroke along the gum strip: not too fast, not too slow
//   6 Twist         wind the tip closed, then tap it down
// Everything is drawn on one 960 × 600 canvas in a chunky outlined style. smoke.ts owns the stash and the joint; this
// module only plays the game and reports the grade. Keys work too (see `controls()`), but the mouse is the real thing.
import type { ControlRow } from '../ui/controls';

export interface RollHost {
  hasGrinder(): boolean;
  /** little synthesized sounds from smoke.ts */
  sfx: {
    ok(): void;
    meh(): void;
    rustle(): void;
    cough(): void;
    blip(f: number, dur?: number, type?: OscillatorType, vol?: number, f2?: number): void;
  };
  /** the joint has been graded (0 Messy · 1 Decent · 2 Clean): make it */
  onResult(grade: 0 | 1 | 2): void;
  /** the game closed; grade is −1 if it was abandoned */
  onEnd(grade: number): void;
}

const W = 960,
  H = 600,
  STEPS = ['Break it up', 'Paper', 'Sprinkle', 'Tuck & roll', 'Lick & seal', 'Twist it'],
  LIMIT = [16, 16, 30, 14, 12, 12],
  MEDAL = ['#c9823f', '#d9dde2', '#f6c545'], // bronze, silver, gold
  PAPER = { x: 560, y: 310, w: 480, h: 160 },
  DISH = { x: 150, y: 330, r: 86 },
  INK = '#2a1a10',
  SKIN = '#e9b98f',
  SKIN_D = '#c98f66';
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) & 0xffffff) / 0xffffff;
const medalOf = (s: number) => (s >= 0.8 ? 2 : s >= 0.5 ? 1 : 0);

type Crumb = { x: number; y: number; r: number; sh: number; rot: number; vx?: number; vy?: number; ty?: number; on?: boolean };
type Nug = { x: number; y: number; r: number; lvl: number; seed: number; vx: number; vy: number; squash: number };
type Pop = { x: number; y: number; t: number; text: string; col: string };

export function createRollGame(host: RollHost) {
  const el = document.createElement('div');
  el.id = 'lroll';
  el.className = 'hidden';
  el.innerHTML = `<div class="rk">
      <div class="rk-top"><div class="rk-num">1</div><div class="rk-title"></div><div class="rk-medals"></div></div>
      <div class="rk-timer"><i></i></div>
      <canvas width="${W}" height="${H}"></canvas>
      <div class="rk-tip"></div>
    </div>`;
  (document.getElementById('lobbyui') || document.body).appendChild(el);
  const cv = el.querySelector('canvas')!,
    x = cv.getContext('2d')!,
    eNum = el.querySelector<HTMLElement>('.rk-num')!,
    eTitle = el.querySelector<HTMLElement>('.rk-title')!,
    eMedals = el.querySelector<HTMLElement>('.rk-medals')!,
    eTimer = el.querySelector<HTMLElement>('.rk-timer i')!,
    eTip = el.querySelector<HTMLElement>('.rk-tip')!;

  // ---------------- state
  const P = { x: W / 2, y: H / 2, down: false, hit: false, up: false, pinch: 0 };
  const keys = new Set<string>();
  let G: {
    strain: string;
    col: [number, number, number];
    size: number;
    step: number;
    t: number; // time in this step
    clock: number;
    scores: number[];
    intro: number; // the step's title card
    out: number; // a beat after a step is scored
    shake: number;
    pops: Pop[];
    nugs: Nug[];
    crumbs: Crumb[]; // loose on the tray (and, later, on the paper)
    grinder: boolean;
    gIn: number;
    gTurns: number;
    gAng: number | null;
    held: Nug | null;
    dish: number; // crumbs waiting in the dish
    // paper
    px: number;
    py: number;
    pState: 'pack' | 'drag' | 'placed';
    placeScore: number;
    crease: number; // how far along (0–1)
    creaseOK: number;
    creaseN: number;
    creasing: boolean;
    // sprinkle
    load: number;
    emit: number;
    seg: number[];
    spill: number;
    doneT: number;
    // roll
    strokes: number;
    strokeY: number;
    strokeDir: number;
    beats: number[];
    lastBeat: number;
    // lick
    lick: number; // 0–1 along the strip
    licking: boolean;
    lickV: number;
    lickMap: number[]; // per slice: 0 dry, 1 good, 2 too fast, 3 soggy
    // twist
    twist: number;
    tAng: number | null;
    taps: number;
    tapT: number;
    grade: number;
    endT: number;
  } | null = null;

  function start(strain: string, colour: string, size: number) {
    const c = parseInt(colour.replace('#', ''), 16) || 0x6fae3c;
    const grinder = host.hasGrinder();
    G = {
      strain,
      col: [(c >> 16) & 255, (c >> 8) & 255, c & 255],
      size,
      step: 0,
      t: 0,
      clock: 0,
      scores: [],
      intro: 1.1,
      out: 0,
      shake: 0,
      pops: [],
      nugs: [
        [300, 320, 1],
        [480, 230, 2],
        [650, 340, 3],
      ].map(([nx, ny, s]) => ({ x: nx, y: ny, r: 64, lvl: 0, seed: s * 7919, vx: 0, vy: 0, squash: 0 })),
      crumbs: [],
      grinder,
      gIn: 0,
      gTurns: 0,
      gAng: null,
      held: null,
      dish: 0,
      px: 150,
      py: 300,
      pState: 'pack',
      placeScore: 0,
      crease: 0,
      creaseOK: 0,
      creaseN: 0,
      creasing: false,
      load: 0,
      emit: 0,
      seg: [0, 0, 0, 0, 0, 0],
      spill: 0,
      doneT: 0,
      strokes: 0,
      strokeY: 0,
      strokeDir: 0,
      beats: [],
      lastBeat: 0,
      lick: 0,
      licking: false,
      lickV: 0,
      lickMap: new Array(48).fill(0),
      twist: 0,
      tAng: null,
      taps: 0,
      tapT: 0,
      grade: -1,
      endT: 0,
    };
    P.down = false;
    keys.clear();
    el.classList.remove('hidden');
    header();
  }
  function close(abandon: boolean) {
    const g = G ? G.grade : -1;
    G = null;
    el.classList.add('hidden');
    host.onEnd(abandon ? -1 : g);
  }
  const need = () => 4 + (G ? G.size : 0); // crumbs wanted in each sixth of the paper

  // ---------------- input
  const at = (e: PointerEvent) => {
    const b = cv.getBoundingClientRect();
    P.x = ((e.clientX - b.left) / b.width) * W;
    P.y = ((e.clientY - b.top) / b.height) * H;
  };
  cv.addEventListener('pointerdown', e => {
    if (!G) return;
    at(e);
    P.down = P.hit = true;
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {}
    e.preventDefault();
  });
  cv.addEventListener('pointermove', e => G && at(e));
  const lift = () => {
    if (G && P.down) {
      P.down = false;
      P.up = true;
    }
  };
  cv.addEventListener('pointerup', lift);
  cv.addEventListener('pointercancel', lift);
  function key(e: KeyboardEvent, down: boolean) {
    if (!G) return;
    if (down && e.code === 'Escape') {
      close(G.grade < 0);
      return;
    }
    if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
    if (!down) {
      keys.delete(e.code);
      if (e.code === 'Space') lift();
      return;
    }
    if (e.repeat) return;
    keys.add(e.code);
    if (G.grade >= 0) {
      if (e.code === 'Space' || e.code === 'Enter') close(false);
      return;
    }
    if (e.code === 'Space') {
      // Space is the mouse button, wherever the fingers are (steps place the fingers for you where that helps)
      const s = G.step;
      if (s === 0 && !G.grinder && G.nugs.length) {
        const n = G.nugs.reduce((a, b) => (Math.hypot(b.x - P.x, b.y - P.y) < Math.hypot(a.x - P.x, a.y - P.y) ? b : a));
        P.x = n.x;
        P.y = n.y;
      } else if (s === 0 && G.grinder && G.gIn < 3 && G.nugs.length) {
        dropIn(G.nugs[0]);
        return;
      } else if (s === 1 && G.pState === 'pack') {
        G.pState = 'placed';
        G.px = PAPER.x + 26;
        G.py = PAPER.y - 14;
        G.placeScore = 0.55;
        pop(PAPER.x, 180, 'Down it goes', '#fff3d0');
        return;
      } else if (s === 2 && G.load <= 0) {
        P.x = DISH.x;
        P.y = DISH.y;
      } else if (s === 3) return;
      else if (s === 5 && G.twist >= 2) {
        P.x = 560;
        P.y = 310;
      }
      P.down = P.hit = true;
    }
    if (G.step === 3 && (e.code === 'KeyW' || e.code === 'KeyS')) {
      const d = e.code === 'KeyW' ? -1 : 1;
      if (d !== G.strokeDir) stroke(d);
    }
  }

  // ---------------- little helpers
  function pop(px: number, py: number, text: string, col = '#fff3d0') {
    G!.pops.push({ x: px, y: py, t: 0, text, col });
  }
  function finish(score: number, good: string, ok: string, bad: string) {
    if (!G || G.out > 0) return;
    const s = clamp(score, 0, 1),
      m = medalOf(s);
    G.scores.push(s);
    G.out = 1.15;
    G.shake = m === 2 ? 0.25 : 0;
    pop(W / 2, 150, m === 2 ? good : m === 1 ? ok : bad, MEDAL[m]);
    (m >= 1 ? host.sfx.ok : host.sfx.meh)();
    if (m === 2) setTimeout(() => host.sfx.blip(1320, 0.14, 'triangle', 0.1, 1760), 120);
    header();
  }
  function header() {
    if (!G) return;
    const done = G.grade >= 0;
    eNum.textContent = done ? '★' : String(G.step + 1);
    eTitle.textContent = done ? ['Messy…', 'Decent!', 'Clean!'][G.grade] : STEPS[G.step];
    eMedals.innerHTML = STEPS.map((n, i) => {
      const s = G!.scores[i];
      return `<i title="${n}" class="${s === undefined ? (i === G!.step ? 'now' : '') : 'got'}" style="${s === undefined ? '' : `--m:${MEDAL[medalOf(s)]}`}">${s === undefined ? i + 1 : ''}</i>`;
    }).join('');
  }
  function crumbBurst(cx: number, cy: number, n: number, speed = 220) {
    const r = Math.random;
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283,
        v = speed * (0.4 + r() * 0.8);
      G!.crumbs.push({ x: cx, y: cy, r: 9 + r() * 6, sh: r(), rot: r() * 6.28, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 });
    }
  }
  function dropIn(n: Nug) {
    G!.nugs.splice(G!.nugs.indexOf(n), 1);
    G!.gIn++;
    G!.held = null;
    host.sfx.blip(220, 0.08, 'sine', 0.14, 120);
    pop(770, 230, G!.gIn < 3 ? `${G!.gIn} / 3` : 'Now twist!', '#fff3d0');
  }
  function stroke(dir: number) {
    const g = G!;
    g.strokeDir = dir;
    g.strokes++;
    if (g.lastBeat) g.beats.push(g.clock - g.lastBeat);
    g.lastBeat = g.clock;
    host.sfx.rustle();
  }

  // ---------------- drawing
  const shade = (k: number, a = 1) => {
    const c = G!.col,
      m = 0.62 + k * 0.5;
    return `rgba(${Math.min(255, c[0] * m) | 0},${Math.min(255, c[1] * m) | 0},${Math.min(255, c[2] * m) | 0},${a})`;
  };
  function outline(w = 4) {
    x.lineWidth = w;
    x.strokeStyle = INK;
    x.lineJoin = x.lineCap = 'round';
    x.stroke();
  }
  function tray() {
    // the table, then a metal rolling tray with a rolled rim
    x.fillStyle = '#5a3b22';
    x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(0,0,0,.16)';
    for (let i = 0; i < 7; i++) x.fillRect(0, i * 96 + 30, W, 3);
    x.beginPath();
    x.roundRect(22, 34, W - 44, H - 60, 46);
    x.fillStyle = 'rgba(0,0,0,.35)';
    x.fill();
    x.beginPath();
    x.roundRect(18, 24, W - 36, H - 56, 46);
    x.fillStyle = '#f0e2c4';
    x.fill();
    outline(5);
    x.beginPath();
    x.roundRect(38, 44, W - 76, H - 96, 32);
    const gr = x.createLinearGradient(0, 44, 0, H - 52);
    gr.addColorStop(0, '#2f7d78');
    gr.addColorStop(1, '#215f60');
    x.fillStyle = gr;
    x.fill();
    outline(4);
    // doodles on the tray, like stickers worn into the paint
    x.save();
    x.globalAlpha = 0.1;
    x.strokeStyle = '#fff';
    x.lineWidth = 5;
    for (const [sx, sy, sr] of [
      [840, 120, 34],
      [110, 110, 22],
      [870, 470, 26],
    ]) {
      x.beginPath();
      for (let k = 0; k < 11; k++) {
        const a = (k / 10) * 6.283 * 2,
          rr = k % 2 ? sr * 0.45 : sr;
        x.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
      }
      x.stroke();
    }
    x.restore();
  }
  function nug(n: Nug) {
    const r = rnd(n.seed),
      lobes = 9;
    x.save();
    x.translate(n.x, n.y);
    x.scale(1 + n.squash * 0.25, 1 - n.squash * 0.25);
    // a soft shadow, then the bud: a cluster of lobes with a dark outline round the lot
    x.fillStyle = 'rgba(0,0,0,.25)';
    x.beginPath();
    x.ellipse(4, n.r * 0.72, n.r * 0.95, n.r * 0.3, 0, 0, 7);
    x.fill();
    const L: [number, number, number, number][] = [];
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * 6.283 + r() * 0.5,
        d = n.r * (0.25 + r() * 0.38);
      L.push([Math.cos(a) * d, Math.sin(a) * d * 0.85, n.r * (0.42 + r() * 0.2), r()]);
    }
    L.push([0, 0, n.r * 0.6, 0.5]);
    x.fillStyle = INK;
    for (const [lx, ly, lr] of L) {
      x.beginPath();
      x.arc(lx, ly, lr + 4, 0, 7);
      x.fill();
    }
    for (const [lx, ly, lr, k] of L) {
      x.fillStyle = shade(0.25 + k * 0.6);
      x.beginPath();
      x.arc(lx, ly, lr, 0, 7);
      x.fill();
      x.fillStyle = shade(0.95, 0.55);
      x.beginPath();
      x.arc(lx - lr * 0.25, ly - lr * 0.3, lr * 0.45, 0, 7);
      x.fill();
    }
    // orange hairs and a dusting of frost
    x.strokeStyle = '#e8862e';
    x.lineWidth = 2.4;
    for (let i = 0; i < n.r / 4; i++) {
      const a = r() * 6.283,
        d = r() * n.r * 0.75,
        hx = Math.cos(a) * d,
        hy = Math.sin(a) * d * 0.85;
      x.beginPath();
      x.moveTo(hx, hy);
      x.quadraticCurveTo(hx + 6, hy - 9, hx + 11 * (r() - 0.5) * 2, hy - 13);
      x.stroke();
    }
    x.fillStyle = 'rgba(255,255,255,.75)';
    for (let i = 0; i < n.r / 3; i++) {
      const a = r() * 6.283,
        d = r() * n.r * 0.8;
      x.fillRect(Math.cos(a) * d, Math.sin(a) * d * 0.85, 2.2, 2.2);
    }
    x.restore();
  }
  function crumb(c: Crumb, squish = 1) {
    x.save();
    x.translate(c.x, c.y);
    x.rotate(c.rot);
    x.beginPath();
    x.ellipse(0, 0, c.r, c.r * 0.78 * squish, 0, 0, 7);
    x.fillStyle = shade(0.2 + c.sh * 0.7);
    x.fill();
    outline(2.2);
    x.fillStyle = shade(1, 0.6);
    x.beginPath();
    x.arc(-c.r * 0.25, -c.r * 0.25, c.r * 0.32, 0, 7);
    x.fill();
    x.restore();
  }
  /** Thumb and forefinger coming in from the top right, tips meeting at (px, py). close: 0 open … 1 pinched. */
  /** One fingertip: just the last joint, fading away toward the hand. (x, y) is the very tip; ang turns it. */
  function tip(tx: number, ty: number, ang: number, wd = 36, len = 92) {
    x.save();
    x.translate(tx, ty);
    x.rotate(ang);
    const fade = (r: number, g: number, b: number) => {
      const gr = x.createLinearGradient(0, wd / 2, 0, -len);
      gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
      gr.addColorStop(0.45, `rgba(${r},${g},${b},1)`);
      gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      return gr;
    };
    x.beginPath();
    x.moveTo(-wd / 2, -len);
    x.lineTo(-wd / 2, 0);
    x.arc(0, 0, wd / 2, Math.PI, 0, true);
    x.lineTo(wd / 2, -len);
    x.fillStyle = fade(233, 185, 143);
    x.fill();
    x.lineWidth = 4;
    x.lineJoin = x.lineCap = 'round';
    x.strokeStyle = fade(42, 26, 16);
    x.stroke();
    x.fillStyle = 'rgba(255,255,255,.6)'; // the nail
    x.beginPath();
    x.roundRect(-wd / 2 + 7, -wd * 0.55, wd - 14, wd * 0.5, 7);
    x.fill();
    x.restore();
  }
  /** Thumb and forefinger tips meeting at (px, py). close: 0 open … 1 pinched. `held` crumbs show between them. */
  function fingers(px: number, py: number, close: number, held = 0) {
    const gap = 30 * (1 - close) + 4;
    tip(px - gap / 2 - 8, py + 2, 0.5, 34); // forefinger
    tip(px + gap / 2 + 10, py + 6, 1.15, 38); // thumb
    for (let i = 0; i < Math.min(6, held); i++)
      crumb({ x: px + ((i * 11) % 23) - 10, y: py + 14 + ((i * 7) % 15), r: 10, sh: (i * 0.37) % 1, rot: i });
  }
  function fingertip(px: number, py: number) {
    tip(px, py, 0.5, 38, 100);
  }
  function paperSheet(cx: number, cy: number, rolled = 0, tilt = 0) {
    x.save();
    x.translate(cx, cy);
    x.rotate(tilt);
    const hh = (PAPER.h / 2) * (1 - rolled * 0.72);
    x.fillStyle = 'rgba(0,0,0,.2)';
    x.beginPath();
    x.roundRect(-PAPER.w / 2 + 5, -hh + 7, PAPER.w, hh * 2, 8);
    x.fill();
    x.beginPath();
    x.roundRect(-PAPER.w / 2, -hh, PAPER.w, hh * 2, 8);
    x.fillStyle = '#fbf6e8';
    x.fill();
    outline(4);
    x.fillStyle = 'rgba(214,170,96,.5)'; // the gum strip along the top edge
    x.fillRect(-PAPER.w / 2 + 3, -hh + 3, PAPER.w - 6, 13);
    x.restore();
  }
  /** The rolled joint lying on the tray, pointing right. twist 0–2 winds the tip. */
  function joint(cx: number, cy: number, twist: number, bounce = 0) {
    x.save();
    x.translate(cx, cy - bounce);
    const L = PAPER.w / 2;
    x.fillStyle = 'rgba(0,0,0,.25)';
    x.beginPath();
    x.ellipse(0, 30 + bounce, L, 10, 0, 0, 7);
    x.fill();
    x.beginPath();
    x.moveTo(-L, -12);
    x.lineTo(L - 26, -24);
    x.quadraticCurveTo(L - 4, -22, L - 4, 0);
    x.quadraticCurveTo(L - 4, 22, L - 26, 24);
    x.lineTo(-L, 12);
    x.closePath();
    const gr = x.createLinearGradient(0, -24, 0, 24);
    gr.addColorStop(0, '#fffdf4');
    gr.addColorStop(0.55, '#f6efdc');
    gr.addColorStop(1, '#d9cfb4');
    x.fillStyle = gr;
    x.fill();
    outline(4);
    // the crutch end, and the seam
    x.fillStyle = '#e6d3a4';
    x.beginPath();
    x.roundRect(-L - 2, -13, 46, 26, 5);
    x.fill();
    outline(3.5);
    x.strokeStyle = 'rgba(120,100,70,.5)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(-L + 46, -10);
    x.lineTo(L - 30, -19);
    x.stroke();
    // the tip: open and full, or wound into a wick
    if (twist < 0.05) {
      x.beginPath();
      x.ellipse(L - 6, 0, 9, 22, 0, 0, 7);
      x.fillStyle = shade(0.45);
      x.fill();
      outline(3.5);
    } else {
      const k = Math.min(1, twist / 2);
      x.beginPath();
      x.moveTo(L - 8, -22 * (1 - k * 0.6));
      x.quadraticCurveTo(L + 16 * k, -4, L + 34 * k, -2 - 6 * Math.sin(twist * 6.283));
      x.quadraticCurveTo(L + 16 * k, 6, L - 8, 22 * (1 - k * 0.6));
      x.closePath();
      x.fillStyle = '#f6efdc';
      x.fill();
      outline(3.5);
      x.strokeStyle = 'rgba(120,100,70,.6)';
      x.lineWidth = 2;
      for (let i = 1; i <= Math.floor(twist * 2); i++) {
        x.beginPath();
        x.moveTo(L - 8 + i * 6, -14 + i * 2);
        x.lineTo(L - 2 + i * 6, 12 - i * 2);
        x.stroke();
      }
    }
    x.restore();
  }
  function dish() {
    x.fillStyle = 'rgba(0,0,0,.25)';
    x.beginPath();
    x.ellipse(DISH.x + 5, DISH.y + 10, DISH.r, DISH.r * 0.84, 0, 0, 7);
    x.fill();
    x.beginPath();
    x.ellipse(DISH.x, DISH.y, DISH.r, DISH.r * 0.84, 0, 0, 7);
    x.fillStyle = '#f0e2c4';
    x.fill();
    outline(4);
    x.beginPath();
    x.ellipse(DISH.x, DISH.y + 3, DISH.r - 14, DISH.r * 0.84 - 13, 0, 0, 7);
    x.fillStyle = '#c9b78e';
    x.fill();
    outline(3);
    const r = rnd(41),
      n = Math.min(46, Math.ceil(G!.dish));
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283,
        d = Math.sqrt(r()) * (DISH.r - 30);
      crumb({ x: DISH.x + Math.cos(a) * d, y: DISH.y + 3 + Math.sin(a) * d * 0.8 - (i > 22 ? 8 : 0), r: 9 + r() * 6, sh: r(), rot: r() * 6 });
    }
  }
  function label(text: string, lx: number, ly: number, size = 26, col = '#fff3d0', align: CanvasTextAlign = 'center') {
    x.font = `${size}px "Permanent Marker", "Barlow Condensed", Impact, sans-serif`;
    x.textAlign = align;
    x.lineWidth = 6;
    x.strokeStyle = INK;
    x.lineJoin = 'round';
    x.strokeText(text, lx, ly);
    x.fillStyle = col;
    x.fillText(text, lx, ly);
  }
  function arrow(ax: number, ay: number, bx: number, by: number, t: number) {
    // a dashed, marching arrow: "do this"
    x.save();
    x.setLineDash([14, 10]);
    x.lineDashOffset = -t * 60;
    x.strokeStyle = 'rgba(255,243,208,.85)';
    x.lineWidth = 5;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(ax, ay);
    x.lineTo(bx, by);
    x.stroke();
    x.setLineDash([]);
    const a = Math.atan2(by - ay, bx - ax);
    x.beginPath();
    x.moveTo(bx, by);
    x.lineTo(bx - Math.cos(a - 0.5) * 18, by - Math.sin(a - 0.5) * 18);
    x.moveTo(bx, by);
    x.lineTo(bx - Math.cos(a + 0.5) * 18, by - Math.sin(a + 0.5) * 18);
    x.stroke();
    x.restore();
  }

  // ---------------- the steps
  function physics(dt: number) {
    const g = G!;
    for (const c of g.crumbs) {
      if (c.ty !== undefined) {
        // falling onto the paper (or the tray)
        c.vy = (c.vy || 0) + 1800 * dt;
        c.y += c.vy * dt;
        c.rot += dt * 6;
        if (c.y >= c.ty) {
          c.y = c.ty;
          c.ty = undefined;
          c.vy = c.vx = 0;
        }
      } else if (c.vx || c.vy) {
        c.x += (c.vx || 0) * dt;
        c.y += (c.vy || 0) * dt;
        const k = Math.exp(-dt * 6);
        c.vx = (c.vx || 0) * k;
        c.vy = (c.vy || 0) * k;
        c.rot += (c.vx || 0) * dt * 0.05;
        c.x = clamp(c.x, 60, W - 60);
        c.y = clamp(c.y, 70, H - 80);
        if (Math.abs(c.vx) + Math.abs(c.vy || 0) < 6) c.vx = c.vy = 0;
      }
    }
    for (const n of g.nugs) {
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      const k = Math.exp(-dt * 7);
      n.vx *= k;
      n.vy *= k;
      n.squash *= Math.exp(-dt * 9);
      n.x = clamp(n.x, 110, W - 110);
      n.y = clamp(n.y, 130, H - 130);
    }
  }
  function stepBreak(dt: number) {
    const g = G!;
    if (g.grinder) {
      const GX = 770,
        GY = 330,
        GR = 84,
        loaded = g.gIn >= 3;
      // pick up a bud and drop it in
      if (P.hit && !loaded) g.held = g.nugs.find(n => Math.hypot(n.x - P.x, n.y - P.y) < n.r + 14) || null;
      if (g.held) {
        g.held.x = P.x;
        g.held.y = P.y + 18;
        if (P.up) {
          if (Math.hypot(P.x - GX, P.y - GY) < GR + 24) dropIn(g.held);
          g.held = null;
        }
      }
      // then twist the lid: circles round the grinder
      if (loaded && P.down) {
        const a = Math.atan2(P.y - GY, P.x - GX);
        if (g.gAng !== null) {
          let d = a - g.gAng;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          if (Math.abs(d) < 1) {
            const before = Math.floor(g.gTurns * 12);
            g.gTurns += Math.abs(d) / 6.283;
            if (Math.floor(g.gTurns * 12) !== before) {
              g.dish += 1.4;
              host.sfx.rustle();
            }
          }
        }
        g.gAng = a;
      } else g.gAng = null;
      if (loaded && keys.has('Space')) {
        const before = Math.floor(g.gTurns * 12);
        g.gTurns += dt * 0.55;
        if (Math.floor(g.gTurns * 12) !== before) {
          g.dish += 1.4;
          host.sfx.rustle();
        }
      }
      // draw: the grinder, its lid turning, crumbs piling in the dish
      dish();
      for (const n of g.nugs) if (n !== g.held) nug(n);
      x.save();
      x.translate(GX, GY);
      x.fillStyle = 'rgba(0,0,0,.25)';
      x.beginPath();
      x.ellipse(6, 14, GR, GR * 0.9, 0, 0, 7);
      x.fill();
      x.beginPath();
      x.arc(0, 0, GR, 0, 7);
      x.fillStyle = '#8b9299';
      x.fill();
      outline(5);
      x.rotate(g.gTurns * 6.283);
      for (let i = 0; i < 14; i++) {
        x.save();
        x.rotate((i / 14) * 6.283);
        x.beginPath();
        x.roundRect(GR - 12, -7, 16, 14, 4);
        x.fillStyle = '#6f767d';
        x.fill();
        outline(3);
        x.restore();
      }
      x.beginPath();
      x.arc(0, 0, GR - 22, 0, 7);
      x.fillStyle = loaded ? '#b9c0c6' : '#3c4146';
      x.fill();
      outline(4);
      if (loaded) {
        x.fillStyle = '#8b9299';
        x.beginPath();
        x.roundRect(-8, -GR + 28, 16, 44, 6);
        x.fill();
        outline(3);
      } else for (let i = 0; i < g.gIn; i++) nug({ x: -18 + i * 18, y: -6 + (i % 2) * 14, r: 22, lvl: 1, seed: 99 + i, vx: 0, vy: 0, squash: 0 });
      x.restore();
      if (g.held) nug(g.held);
      if (!loaded && !g.held && g.nugs[0]) arrow(g.nugs[0].x + 50, g.nugs[0].y - 30, GX - 70, GY - 60, g.clock);
      if (loaded) {
        x.save();
        x.strokeStyle = 'rgba(255,243,208,.8)';
        x.lineWidth = 5;
        x.setLineDash([14, 10]);
        x.lineDashOffset = -g.clock * 70;
        x.beginPath();
        x.arc(GX, GY, GR + 26, g.clock * 2, g.clock * 2 + 4.6);
        x.stroke();
        x.restore();
      }
      fingers(P.x, P.y, P.down ? 1 : 0.2);
      meter(Math.min(1, g.gTurns / 3), 'Ground');
      eTip.textContent = loaded ? 'Draw circles round the grinder to twist it.' : 'Drag each bud into the grinder.';
      if (g.gTurns >= 3) {
        g.dish = Math.max(g.dish, 50);
        finish(1.35 - g.t / 11, 'Fluffy!', 'Ground up.', 'Took a while…');
      }
      return;
    }
    // by hand: pinch a bud and it snaps in two; pinch the halves and they crumble
    if (P.hit) {
      P.pinch = 0.22;
      const n = g.nugs.find(q => Math.hypot(q.x - P.x, q.y - P.y) < q.r + 16);
      if (n) {
        g.nugs.splice(g.nugs.indexOf(n), 1);
        host.sfx.blip(190, 0.07, 'square', 0.12, 90);
        host.sfx.rustle();
        g.shake = 0.12;
        if (n.lvl === 0) {
          const a = Math.random() * 3.14;
          for (const s of [-1, 1])
            g.nugs.push({
              x: n.x,
              y: n.y,
              r: 44,
              lvl: 1,
              seed: n.seed + s * 13 + 50,
              vx: Math.cos(a) * 260 * s,
              vy: Math.sin(a) * 200 * s,
              squash: 1,
            });
          crumbBurst(n.x, n.y, 2, 160);
          pop(n.x, n.y - 60, 'Snap!', '#fff3d0');
        } else {
          crumbBurst(n.x, n.y, 6);
          pop(n.x, n.y - 46, 'Crumble!', '#ffd27a');
        }
      } else host.sfx.blip(520, 0.03, 'sine', 0.04);
    }
    for (const c of g.crumbs) crumb(c);
    for (const n of g.nugs) nug(n);
    const near = g.nugs.find(q => Math.hypot(q.x - P.x, q.y - P.y) < q.r + 16);
    if (near) {
      x.beginPath();
      x.arc(near.x, near.y, near.r + 14, 0, 7);
      x.strokeStyle = 'rgba(255,243,208,.7)';
      x.lineWidth = 4;
      x.setLineDash([10, 8]);
      x.lineDashOffset = -g.clock * 40;
      x.stroke();
      x.setLineDash([]);
    }
    fingers(P.x, P.y, P.pinch > 0 ? 1 : 0.15);
    const total = 9,
      left = g.nugs.reduce((a, n) => a + (n.lvl === 0 ? 3 : 1), 0);
    meter(1 - left / total, 'Broken up');
    eTip.textContent = 'Click a bud to pinch it apart. Then pinch the pieces.';
    if (!g.nugs.length) {
      g.dish = 50;
      finish(Math.min(0.86, 1.3 - g.t / 12), 'Nice and fine!', 'Chunky, but fine.', 'Slow hands…');
    }
  }
  function stepPaper(dt: number) {
    const g = G!,
      x0 = PAPER.x - PAPER.w / 2 + 14,
      x1 = PAPER.x + PAPER.w / 2 - 14;
    dish();
    // the pack, bottom left of the dish's side; the guide where the paper goes
    x.save();
    x.translate(150, 150);
    x.rotate(-0.12);
    x.beginPath();
    x.roundRect(-78, -34, 156, 68, 8);
    x.fillStyle = '#d6452f';
    x.fill();
    outline(4);
    label('PAPERS', 0, 10, 26, '#fff3d0');
    x.restore();
    x.save();
    x.setLineDash([16, 12]);
    x.lineDashOffset = -g.clock * 30;
    x.strokeStyle = g.pState === 'placed' ? 'rgba(255,243,208,.25)' : 'rgba(255,243,208,.9)';
    x.lineWidth = 4;
    x.beginPath();
    x.roundRect(PAPER.x - PAPER.w / 2, PAPER.y - PAPER.h / 2, PAPER.w, PAPER.h, 8);
    x.stroke();
    x.restore();
    if (g.pState !== 'placed') {
      if (g.pState === 'pack') {
        g.px = 150;
        g.py = 150;
        if (P.hit && Math.abs(P.x - 150) < 110 && Math.abs(P.y - 150) < 70) {
          g.pState = 'drag';
          host.sfx.rustle();
        }
        arrow(250, 170, PAPER.x - PAPER.w / 2 - 12, PAPER.y - 30, g.clock);
        eTip.textContent = 'Drag a paper from the pack onto the dashed outline.';
      }
      if (g.pState === 'drag') {
        g.px = P.x;
        g.py = P.y;
        eTip.textContent = 'Line it up with the outline and let go.';
        if (P.up) {
          const d = Math.hypot(g.px - PAPER.x, g.py - PAPER.y);
          if (d < 170) {
            g.pState = 'placed';
            g.placeScore = clamp(1.12 - d / 80, 0.25, 1);
            host.sfx.blip(300, 0.06, 'sine', 0.1, 200);
            pop(g.px, g.py - 110, d < 12 ? 'Dead on!' : d < 40 ? 'Close enough' : 'Wonky…', d < 40 ? '#fff3d0' : '#ffb27a');
          } else g.pState = 'pack';
        }
      }
      if (g.pState !== 'pack') paperSheet(g.px, g.py, 0, g.pState === 'drag' ? Math.sin(g.clock * 9) * 0.02 : 0);
      else {
        x.save();
        x.translate(150, 150);
        x.rotate(-0.12);
        x.beginPath();
        x.roundRect(-70, -44, 140, 20, 4);
        x.fillStyle = '#fbf6e8';
        x.fill();
        outline(3);
        x.restore();
      }
      fingers(P.x, P.y, P.down ? 1 : 0.2);
      meter(0, 'Creased');
      return;
    }
    // it eases to the middle, then: crease it with one stroke of a fingertip
    g.px += (PAPER.x - g.px) * (1 - Math.exp(-dt * 7));
    g.py += (PAPER.y - g.py) * (1 - Math.exp(-dt * 7));
    paperSheet(g.px, g.py);
    const cx = x0 + (x1 - x0) * g.crease;
    if (P.hit && Math.abs(P.x - cx) < 60 && Math.abs(P.y - PAPER.y) < 60) g.creasing = true;
    if (!P.down) g.creasing = false;
    if (keys.has('Space')) {
      g.crease = Math.min(1, g.crease + dt * 0.7);
      g.creaseN++;
      g.creaseOK += 0.6;
      P.x = cx;
      P.y = PAPER.y;
    }
    if (g.creasing && P.x > cx) {
      const nx = clamp((P.x - x0) / (x1 - x0), 0, 1);
      g.creaseN++;
      if (Math.abs(P.y - PAPER.y) < 13) g.creaseOK++;
      if (Math.floor(nx * 14) !== Math.floor(g.crease * 14)) host.sfx.rustle();
      g.crease = nx;
    }
    x.save();
    x.strokeStyle = 'rgba(160,130,80,.55)';
    x.lineWidth = 3;
    x.setLineDash([10, 9]);
    x.beginPath();
    x.moveTo(cx, PAPER.y);
    x.lineTo(x1, PAPER.y);
    x.stroke();
    x.setLineDash([]);
    x.strokeStyle = '#b89a62';
    x.lineWidth = 5;
    x.beginPath();
    x.moveTo(x0, PAPER.y);
    x.lineTo(cx, PAPER.y);
    x.stroke();
    x.restore();
    if (!g.creasing && g.crease < 1) {
      x.beginPath();
      x.arc(cx, PAPER.y, 20 + Math.sin(g.clock * 6) * 4, 0, 7);
      x.strokeStyle = 'rgba(255,243,208,.9)';
      x.lineWidth = 4;
      x.stroke();
      arrow(cx + 30, PAPER.y - 44, Math.min(x1, cx + 150), PAPER.y - 44, g.clock);
    }
    fingertip(P.x, P.y);
    meter(g.crease, 'Creased');
    eTip.textContent = 'Press on the ring and run your finger along the dashed line, left to right.';
    if (g.crease >= 0.995) {
      const cs = clamp((g.creaseOK / Math.max(1, g.creaseN)) * 1.15, 0.2, 1);
      finish((g.placeScore + cs) / 2, 'Crisp fold!', 'Good enough.', 'A bit crooked…');
    }
  }
  function onPaper() {
    // the paper with whatever has been sprinkled on it
    const g = G!;
    for (const c of g.crumbs) if (!c.on) crumb(c);
  }
  function stepSprinkle(dt: number) {
    const g = G!,
      px0 = PAPER.x - PAPER.w / 2,
      n = need();
    if (keys.has('KeyA')) P.x -= 380 * dt;
    if (keys.has('KeyD')) P.x += 380 * dt;
    if (keys.has('KeyW')) P.y -= 380 * dt;
    if (keys.has('KeyS')) P.y += 380 * dt;
    P.x = clamp(P.x, 50, W - 50);
    P.y = clamp(P.y, 60, H - 70);
    const overDish = Math.hypot(P.x - DISH.x, P.y - DISH.y) < DISH.r;
    // press and hold on the dish to take a pinch; it stays between your fingers for as long as you hold; let go to drop it
    if (P.hit && overDish && g.dish > 0 && g.load <= 0) {
      const take = Math.min(n, g.dish);
      g.load = take;
      g.dish -= take;
      P.pinch = 0.2;
      host.sfx.blip(260, 0.05, 'sine', 0.1, 180);
      pop(DISH.x, DISH.y - 100, 'Pinch!', '#fff3d0');
    }
    if (P.up && g.load > 0) {
      if (overDish) {
        g.dish += g.load; // changed your mind: back in the dish
        g.load = 0;
      } else {
        while (g.load > 0) {
          g.load--;
          const cx = P.x + (Math.random() - 0.5) * 44,
            inside = cx > px0 + 6 && cx < px0 + PAPER.w - 6 && P.y < PAPER.y + PAPER.h / 2 + 40;
          const ty = inside
            ? PAPER.y + (Math.random() - 0.5) * 62
            : Math.min(H - 90, Math.max(P.y + 40, PAPER.y + PAPER.h / 2 + 30) + Math.random() * 30);
          g.crumbs.push({
            x: cx,
            y: Math.min(P.y + 8 + Math.random() * 10, ty),
            r: 9 + Math.random() * 6,
            sh: Math.random(),
            rot: Math.random() * 6,
            vy: 40 + Math.random() * 120,
            ty,
            on: inside,
          });
          if (inside) g.seg[clamp(Math.floor((cx - px0) / (PAPER.w / 6)), 0, 5)]++;
          else g.spill++;
        }
        host.sfx.rustle();
        setTimeout(host.sfx.rustle, 90);
      }
    }
    dish();
    paperSheet(PAPER.x, PAPER.y);
    x.strokeStyle = '#b89a62';
    x.lineWidth = 5;
    x.beginPath();
    x.moveTo(px0 + 14, PAPER.y);
    x.lineTo(px0 + PAPER.w - 14, PAPER.y);
    x.stroke();
    for (const c of g.crumbs) crumb(c);
    // a gauge under each sixth of the paper: amber not enough, green right, red too much
    let ok = 0;
    for (let i = 0; i < 6; i++) {
      const r = g.seg[i] / n,
        gx = px0 + i * (PAPER.w / 6) + 6,
        gw = PAPER.w / 6 - 12,
        gy = PAPER.y + PAPER.h / 2 + 22;
      const good = r >= 0.8 && r <= 1.4;
      if (r >= 0.8) ok++;
      x.beginPath();
      x.roundRect(gx, gy, gw, 16, 8);
      x.fillStyle = 'rgba(0,0,0,.35)';
      x.fill();
      x.beginPath();
      x.roundRect(gx, gy, gw * Math.min(1, r / 1.4), 16, 8);
      x.fillStyle = r > 1.4 ? '#e2574c' : good ? '#5fd17a' : '#f0b24a';
      x.fill();
      x.beginPath();
      x.roundRect(gx, gy, gw, 16, 8);
      outline(3);
      if (good) label('✓', gx + gw / 2, gy + 44, 22, '#9ff0ae');
    }
    if (g.load <= 0 && g.dish > 0 && ok < 6) {
      arrow(P.x > 300 ? 300 : DISH.x + 60, DISH.y - 120, DISH.x + 20, DISH.y - 60, g.clock);
      eTip.textContent = 'Press and hold on the dish to take a pinch.';
    } else
      eTip.textContent =
        g.load > 0 ? 'Keep holding, carry it over the paper, and let go to drop it.' : 'One pinch for each gauge: fill them all to green.';
    fingers(P.x, P.y, g.load > 0 || P.pinch > 0 ? 1 : 0.15, g.load);
    if (ok === 6 || (g.dish <= 0 && g.load <= 0)) g.doneT += dt;
    if (g.doneT > 0.6) {
      let s = 0;
      for (const c of g.seg) {
        const r = c / n;
        s += r < 0.8 ? r / 0.8 : r <= 1.4 ? 1 : Math.max(0, 1 - (r - 1.4));
      }
      finish((s / 6) * (1 - Math.min(0.35, g.spill * 0.015)), 'Even spread!', 'Bit lumpy.', 'Product everywhere!');
    }
  }
  function stepRoll(dt: number) {
    const g = G!;
    // rub up and down: each change of direction after a decent stroke counts
    if (P.hit) {
      g.strokeY = P.y;
    }
    if (P.down) {
      const d = P.y - g.strokeY;
      if (Math.abs(d) > 46 && Math.sign(d) !== g.strokeDir) {
        stroke(Math.sign(d));
        g.strokeY = P.y;
      } else if (Math.sign(d) === g.strokeDir) g.strokeY = P.y;
    }
    const k = Math.min(1, g.strokes / 10);
    paperSheet(PAPER.x, PAPER.y, k);
    const sq = 1 - k * 0.85;
    for (const c of g.crumbs) if (c.on) crumb({ ...c, y: PAPER.y + (c.y - PAPER.y) * sq }, 1);
    if (k > 0.3) {
      // the front edge curling over
      x.save();
      x.globalAlpha = Math.min(1, (k - 0.3) * 2);
      x.beginPath();
      const hh = (PAPER.h / 2) * (1 - k * 0.72);
      x.roundRect(PAPER.x - PAPER.w / 2, PAPER.y + hh - 26 * k - 8, PAPER.w, 26 * k + 8, 8);
      x.fillStyle = '#efe6cf';
      x.fill();
      outline(3.5);
      x.restore();
    }
    // the beat to follow: a marker bobbing up and down beside the paper
    const beat = 0.42,
      ph = (g.clock % (beat * 2)) / (beat * 2),
      my = PAPER.y + Math.cos(ph * 6.283) * 70,
      mx = PAPER.x + PAPER.w / 2 + 56;
    x.strokeStyle = 'rgba(255,243,208,.35)';
    x.lineWidth = 6;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(mx, PAPER.y - 70);
    x.lineTo(mx, PAPER.y + 70);
    x.stroke();
    x.beginPath();
    x.arc(mx, my, 15, 0, 7);
    x.fillStyle = '#ffd27a';
    x.fill();
    outline(4);
    label('follow', mx, PAPER.y + 116, 20);
    // two thumb tips on the paper
    for (const sd of [-1, 1]) tip(PAPER.x + sd * 120, P.y + 14, Math.PI + sd * 0.12, 46, 110);
    meter(k, 'Rolled');
    eTip.textContent = 'Hold the mouse button and rub up and down, in time with the yellow marker.';
    if (g.strokes >= 10) {
      let sm = 0.75;
      if (g.beats.length >= 5) {
        const b = g.beats.slice(1),
          m = b.reduce((p, q) => p + q, 0) / b.length,
          cvr = Math.sqrt(b.reduce((p, q) => p + (q - m) ** 2, 0) / b.length) / Math.max(0.01, m);
        sm = clamp(1.22 - cvr * 1.3 - Math.abs(m - beat) * 0.8, 0.25, 1);
      }
      finish(sm, 'Smooth roll!', 'Rolled up.', 'Little loose…');
    }
  }
  function stepLick(dt: number) {
    const g = G!,
      x0 = PAPER.x - PAPER.w / 2 + 50,
      x1 = PAPER.x + PAPER.w / 2 - 30,
      cx = x0 + (x1 - x0) * g.lick,
      LO = 170,
      HI = 380;
    if (P.hit && Math.abs(P.x - cx) < 70 && Math.abs(P.y - (PAPER.y - 22)) < 70) g.licking = true;
    if (!P.down) g.licking = false;
    let v = 0;
    if (keys.has('Space')) {
      // feather Space: it speeds up while held and coasts down when you let go
      g.lickV = Math.min(560, g.lickV + 520 * dt);
      g.licking = false;
    } else g.lickV = Math.max(0, g.lickV - 420 * dt);
    if (g.licking && P.x > cx) {
      v = (P.x - cx) / Math.max(dt, 1 / 240);
      g.lickV += (v - g.lickV) * (1 - Math.exp(-dt * 10));
    } else if (g.licking) g.lickV *= Math.exp(-dt * 8);
    const adv = g.licking ? Math.max(0, P.x - cx) : keys.has('Space') || g.lickV > 0 ? g.lickV * dt : 0;
    if (adv > 0 && g.lick < 1) {
      const nl = clamp(g.lick + adv / (x1 - x0), 0, 1),
        st = g.lickV > HI ? 2 : g.lickV < LO ? 3 : 1;
      for (let i = Math.floor(g.lick * 48); i <= Math.min(47, Math.floor(nl * 48)); i++) if (!g.lickMap[i]) g.lickMap[i] = st;
      g.lick = nl;
    }
    joint(PAPER.x, PAPER.y, 0);
    // the gum strip along the top of the joint, coloured by how each bit was licked
    for (let i = 0; i < 48; i++) {
      const sx = x0 + ((x1 - x0) * i) / 48,
        sy = PAPER.y - 17 - (i / 48) * 8;
      x.fillStyle = ['rgba(214,170,96,.9)', '#7fe0a0', '#b9b2a0', '#6fb6e8'][g.lickMap[i]];
      x.fillRect(sx, sy, (x1 - x0) / 48 + 1, 9);
      if (g.lickMap[i] === 3 && i % 4 === 0) {
        x.beginPath();
        x.ellipse(sx + 4, sy + 16, 3, 6, 0, 0, 7); // a drip
        x.fill();
      }
    }
    x.strokeStyle = INK;
    x.lineWidth = 2.5;
    x.strokeRect(x0, PAPER.y - 26, x1 - x0, 1);
    // the tongue
    const ty = PAPER.y - 20 - g.lick * 8;
    x.save();
    x.translate(g.licking ? Math.max(cx, P.x) : cx, ty);
    x.beginPath();
    x.moveTo(-26, -150);
    x.quadraticCurveTo(-34, -30, -16, 6);
    x.quadraticCurveTo(0, 22, 16, 6);
    x.quadraticCurveTo(34, -30, 26, -150);
    x.closePath();
    x.fillStyle = '#f08a9c';
    x.fill();
    outline(4);
    x.strokeStyle = '#c95f78';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(0, -120);
    x.lineTo(0, 0);
    x.stroke();
    x.restore();
    if (!g.licking && g.lick < 1 && !keys.has('Space')) {
      x.beginPath();
      x.arc(cx, ty, 22 + Math.sin(g.clock * 6) * 4, 0, 7);
      x.strokeStyle = 'rgba(255,243,208,.9)';
      x.lineWidth = 4;
      x.stroke();
    }
    // the speed gauge: keep the needle in the green
    const gx = W / 2 - 220,
      gy = H - 140,
      gw = 440;
    x.beginPath();
    x.roundRect(gx, gy, gw, 26, 13);
    x.fillStyle = '#6fb6e8';
    x.fill();
    x.fillStyle = '#5fd17a';
    x.fillRect(gx + (LO / 560) * gw, gy, ((HI - LO) / 560) * gw, 26);
    x.fillStyle = '#b9b2a0';
    x.beginPath();
    x.roundRect(gx + (HI / 560) * gw, gy, gw - (HI / 560) * gw, 26, [0, 13, 13, 0]);
    x.fill();
    x.beginPath();
    x.roundRect(gx, gy, gw, 26, 13);
    outline(4);
    label('soggy', gx + 44, gy + 52, 20, '#bfe2f7');
    label('just right', gx + ((LO + HI) / 2 / 560) * gw, gy + 52, 20, '#9ff0ae');
    label('dry', gx + gw - 36, gy + 52, 20, '#e2dccb');
    const nx = gx + clamp(g.lickV / 560, 0, 1) * gw;
    x.beginPath();
    x.moveTo(nx, gy - 6);
    x.lineTo(nx - 11, gy - 24);
    x.lineTo(nx + 11, gy - 24);
    x.closePath();
    x.fillStyle = '#fff3d0';
    x.fill();
    outline(3.5);
    eTip.textContent = 'Press on the ring and lick along the strip in one smooth stroke. Keep the needle in the green.';
    if (g.lick >= 0.995) {
      const good = g.lickMap.filter(v2 => v2 === 1).length / 48;
      finish(0.2 + good * 0.95, 'Sealed tight!', 'It’ll hold.', g.lickMap.filter(v2 => v2 === 3).length > 20 ? 'Soggy…' : 'Dry seal…');
    }
  }
  function stepTwist(dt: number) {
    const g = G!,
      TX = PAPER.x + PAPER.w / 2 + 4,
      TY = PAPER.y;
    g.tapT = Math.max(0, g.tapT - dt);
    if (g.twist < 2) {
      if (P.down) {
        const a = Math.atan2(P.y - TY, P.x - TX),
          near = Math.hypot(P.x - TX, P.y - TY) < 130;
        if (g.tAng !== null && near) {
          let d = a - g.tAng;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          if (Math.abs(d) < 1) {
            const b = Math.floor(g.twist * 4);
            g.twist = Math.min(2, g.twist + Math.abs(d) / 6.283);
            if (Math.floor(g.twist * 4) !== b) host.sfx.rustle();
          }
        }
        g.tAng = near ? a : null;
      } else g.tAng = null;
      if (keys.has('Space')) g.twist = Math.min(2, g.twist + dt * 0.9);
      if (g.twist >= 2) pop(TX, TY - 80, 'Twisted!', '#fff3d0');
    } else if (P.hit && Math.abs(P.x - PAPER.x) < PAPER.w / 2 + 30 && Math.abs(P.y - PAPER.y) < 80) {
      g.taps++;
      g.tapT = 0.22;
      host.sfx.blip(150, 0.07, 'sine', 0.16, 80);
      pop(P.x, P.y - 60, ['Tap', 'Tap', 'Packed!'][Math.min(2, g.taps - 1)], '#fff3d0');
    }
    joint(PAPER.x, PAPER.y, g.twist, Math.sin((g.tapT / 0.22) * Math.PI) * 16);
    if (g.twist < 2) {
      x.save();
      x.strokeStyle = 'rgba(255,243,208,.85)';
      x.lineWidth = 5;
      x.setLineDash([12, 9]);
      x.lineDashOffset = -g.clock * 70;
      x.beginPath();
      x.arc(TX, TY, 56, g.clock * 2.4, g.clock * 2.4 + 4.6);
      x.stroke();
      x.restore();
      meter(g.twist / 2, 'Twisted');
      eTip.textContent = 'Hold the mouse button on the open tip and draw two small circles to wind it shut.';
    } else {
      meter(g.taps / 3, 'Packed');
      eTip.textContent = 'Now click the joint three times to tap it down.';
    }
    fingers(P.x, P.y, P.down ? 1 : 0.25);
    if (g.taps >= 3) finish(1.4 - g.t / 9, 'Tidy!', 'Done.', 'Loose end.');
  }
  function meter(k: number, name: string) {
    const mx = W / 2 - 170,
      my = H - 74;
    x.beginPath();
    x.roundRect(mx, my, 340, 20, 10);
    x.fillStyle = 'rgba(0,0,0,.4)';
    x.fill();
    if (k > 0.01) {
      x.beginPath();
      x.roundRect(mx, my, 340 * clamp(k, 0, 1), 20, 10);
      x.fillStyle = '#ffd27a';
      x.fill();
    }
    x.beginPath();
    x.roundRect(mx, my, 340, 20, 10);
    outline(3.5);
    label(name, mx - 14, my + 18, 20, '#fff3d0', 'right');
  }
  function finale(dt: number) {
    const g = G!;
    g.endT += dt;
    const gr = g.grade,
      t = g.endT;
    // rays, the joint held up, the medals it earned, the verdict
    x.save();
    x.translate(W / 2, 290);
    x.rotate(t * 0.25);
    for (let i = 0; i < 14; i++) {
      x.rotate(6.283 / 14);
      x.fillStyle = `rgba(255,236,170,${gr === 2 ? 0.16 : 0.07})`;
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(-46, -520);
      x.lineTo(46, -520);
      x.fill();
    }
    x.restore();
    const pulse = 1 + Math.sin(t * 5) * 0.015;
    x.save();
    x.translate(W / 2, 300);
    x.scale(pulse * Math.min(1, t * 3), pulse * Math.min(1, t * 3));
    x.rotate(-0.12);
    x.translate(-W / 2, -300);
    joint(W / 2, 300, 2);
    x.restore();
    label(['MESSY…', 'DECENT!', 'CLEAN!'][gr], W / 2, 150, 84, MEDAL[gr]);
    g.scores.forEach((s, i) => {
      const mx = W / 2 - 200 + i * 80,
        my = 440,
        show = t > 0.3 + i * 0.13;
      if (!show) return;
      x.beginPath();
      x.arc(mx, my, 26, 0, 7);
      x.fillStyle = MEDAL[medalOf(s)];
      x.fill();
      outline(4);
      label(String(i + 1), mx, my + 9, 24, INK);
      x.font = '700 13px Inter, system-ui, sans-serif';
      x.fillStyle = '#fff3d0';
      x.textAlign = 'center';
      x.fillText(STEPS[i], mx, my + 50);
    });
    if (gr >= 1)
      for (let i = 0; i < (gr + 1) * 10; i++) {
        const a = i * 2.4 + t * 1.5,
          rr = 250 + Math.sin(t * 3 + i) * 40;
        x.fillStyle = ['#ffd27a', '#ff8a5c', '#9ff0ae', '#fff3d0'][i % 4];
        x.fillRect(W / 2 + Math.cos(a) * rr, 300 + Math.sin(a) * rr * 0.5, 8, 8);
      }
    eTip.textContent =
      (gr === 2
        ? 'Beautiful: a longer burn and a stronger buzz.'
        : gr === 1
          ? 'A solid, honest joint.'
          : 'It’s… smokable. Shorter burn, harsher hit.') + '  Click or press Space to finish.';
    if ((t > 0.8 && P.hit) || t > 7) close(false);
  }

  function tick(dt: number) {
    const g = G;
    if (!g) return;
    dt = Math.min(dt, 0.1);
    g.clock += dt;
    P.pinch = Math.max(0, P.pinch - dt);
    x.save();
    if (g.shake > 0) {
      g.shake -= dt;
      x.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8);
    }
    tray();
    if (g.grade >= 0) finale(dt);
    else {
      const playing = g.intro <= 0 && g.out <= 0;
      if (playing) g.t += dt;
      physics(dt);
      if (!playing) {
        // between steps nothing can be clicked: hold the picture still
        P.hit = P.up = false;
      }
      [stepBreak, stepPaper, stepSprinkle, stepRoll, stepLick, stepTwist][g.step](dt);
      cv.style.cursor = g.step === 4 ? 'crosshair' : 'none'; // licking has no hand on screen, so show the real pointer
      eTimer.style.width = `${clamp(1 - g.t / LIMIT[g.step], 0, 1) * 100}%`;
      eTimer.style.background = g.t > LIMIT[g.step] * 0.75 ? '#e2574c' : '#ffd27a';
      if (playing && g.t >= LIMIT[g.step]) {
        // out of time: score what's been done so far
        if (g.step === 2) g.doneT = 1;
        else finish(0.3, '', '', 'Out of time!');
      }
      if (g.intro > 0) {
        g.intro -= dt;
        const a = Math.min(1, g.intro * 3);
        x.fillStyle = `rgba(20,12,6,${0.55 * a})`;
        x.fillRect(0, 0, W, H);
        x.globalAlpha = a;
        label(`Step ${g.step + 1}`, W / 2, 250, 40, '#ffd27a');
        label(STEPS[g.step], W / 2, 330, 78);
        x.globalAlpha = 1;
      }
      if (g.out > 0) {
        g.out -= dt;
        if (g.out <= 0) {
          g.step++;
          g.t = 0;
          g.intro = 1.0;
          P.down = false;
          if (g.step === 2) g.crumbs = g.crumbs.filter(() => false); // the loose crumbs were swept into the dish
          if (g.step >= STEPS.length) {
            const avg = g.scores.reduce((a, b) => a + b, 0) / g.scores.length,
              gr: 0 | 1 | 2 = avg >= 0.74 ? 2 : avg >= 0.48 ? 1 : 0;
            g.grade = gr;
            g.intro = 0;
            (gr === 0 ? host.sfx.cough : host.sfx.ok)();
            host.onResult(gr);
          }
          header();
        }
      }
    }
    // pop-up words
    for (const p of g.pops) {
      p.t += dt;
      const a = clamp(1.4 - p.t, 0, 1),
        s = 1 + Math.max(0, 0.25 - p.t) * 3;
      x.save();
      x.globalAlpha = a;
      x.translate(p.x, p.y - p.t * 46);
      x.rotate(-0.06);
      x.scale(s, s);
      label(p.text, 0, 0, 44, p.col);
      x.restore();
    }
    g.pops = g.pops.filter(p => p.t < 1.4);
    x.restore();
    P.hit = P.up = false;
    void onPaper;
  }

  /** What the mouse and keys do in the current step, for the controls panel (ui/controls.ts). */
  function controls(): [string, ControlRow[]] {
    const g = G;
    if (!g) return ['Rolling', []];
    if (g.grade >= 0)
      return [
        'Rolled',
        [
          ['mouse:left', 'Finish', true],
          ['Space', 'Finish'],
        ],
      ];
    const esc: ControlRow = ['Esc', 'Give up (nothing is lost)'];
    const rows: ControlRow[][] = [
      g.grinder
        ? [
            ['mouse:left', g.gIn < 3 ? 'Drag a bud into the grinder' : 'Draw circles to grind', true],
            ['Space', g.gIn < 3 ? 'Drop the next bud in' : 'Hold to grind (slower)'],
          ]
        : [
            ['mouse:left', 'Pinch a bud apart', true],
            ['Space', 'Pinch the nearest bud'],
          ],
      g.pState !== 'placed'
        ? [
            ['mouse:left', 'Drag the paper onto the outline', true],
            ['Space', 'Just put it down'],
          ]
        : [
            ['mouse:left', 'Drag along the line to crease', true],
            ['Space', 'Hold to crease (rougher)'],
          ],
      [
        ['mouse:left', g.load > 0 ? 'Let go over the paper to drop it' : 'Hold on the dish to take a pinch', true],
        [['W', 'A', 'S', 'D'], 'Move your fingers'],
        ['Space', 'Hold to pinch, let go to drop'],
      ],
      [
        ['mouse:left', 'Hold and rub up and down', true],
        [['W', 'S'], 'Up, down, up, down'],
      ],
      [
        ['mouse:left', 'Drag along the strip, steadily', true],
        ['Space', 'Hold to lick, let go to slow'],
      ],
      [
        ['mouse:left', g.twist < 2 ? 'Circle the tip to twist it' : 'Click the joint to tap it', true],
        ['Space', g.twist < 2 ? 'Hold to twist' : 'Tap'],
      ],
    ];
    return [`${g.step + 1}. ${STEPS[g.step]}`, [...rows[g.step], esc]];
  }

  return {
    start,
    key,
    tick,
    controls,
    active: () => !!G,
    /** dev: jump to a step (0–5) or the result (6 = Clean) */
    debug: (step: number) => {
      if (!G) return;
      if (step >= 6) {
        G.scores = [1, 1, 0.6, 1, 0.9, 1];
        G.grade = 2;
        header();
        return;
      }
      G.scores = G.scores.slice(0, step);
      while (G.scores.length < step) G.scores.push(0.9);
      G.step = step;
      G.t = 0;
      G.intro = 0;
      G.out = 0;
      if (step >= 1) {
        G.nugs = [];
        G.dish = 50;
        G.crumbs = [];
      }
      if (step >= 2) {
        G.pState = 'placed';
        G.px = PAPER.x;
        G.py = PAPER.y;
      }
      if (step >= 3 && !G.crumbs.length) {
        const r = rnd(5);
        for (let i = 0; i < 26; i++)
          G.crumbs.push({
            x: PAPER.x - PAPER.w / 2 + 20 + r() * (PAPER.w - 40),
            y: PAPER.y + (r() - 0.5) * 60,
            r: 9 + r() * 6,
            sh: r(),
            rot: r() * 6,
            on: true,
          });
      }
      header();
    },
    state: () => G,
    pointer: P,
  };
}
