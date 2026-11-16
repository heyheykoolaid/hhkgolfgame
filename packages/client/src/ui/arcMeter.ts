// The swing meter: a chunky, hand-sprayed arc beside the golfer, like a sticker slapped on the screen.
// ONE WAY: the marker starts at the bottom when you press, runs up the arc once, and you press again as it crosses
// the hit zone near the top (green = perfect, orange either side = a little early / late). The arc is longer for a
// bigger shot. Run off the end without pressing and the swing is off.
// Look: wobbly marker-pen outlines (the wobble is baked into the paths, no filters), a die-cut white border, hot
// pink → orange → yellow paint that fills behind the marker, a starburst marker with spray dots behind it.
// Pure view: the game passes in swing state every frame; this never decides gameplay.
const NS = 'http://www.w3.org/2000/svg';
import { ballPreview } from '../avatar/balls';

export interface ArcFrame {
  phase: 'idle' | 'power' | 'acc' | 'follow';
  /** Swing time as the game counts it: 0 = perfect impact, negative = before it (in timing-window units). */
  u: number;
  /** u at the moment of the first press (negative): the marker's start. */
  u0: number;
  /** The timing windows either side of impact: p/g = perfect/good before it, pl/gl = after it. */
  win: { p: number; g: number; pl?: number; gl?: number };
  /** Shot size 0..1: the meter's length. */
  scale?: number;
  line1: string;
  line2: string;
  feetX: number;
  feetY: number;
  hpx: number;
  putt: boolean;
  time: number;
  /** the player's ball skin: the marker is that ball, spinning (a starburst if not given) */
  ball?: string;
  /** How the strike went (set once the ball is hit): the pop-up says so instead of a plain HIT! */
  grade?: 'perfect' | 'good' | 'miss';
  late?: boolean;
}
/** Where the centre of the hit zone sits along the arc (0 = start, 1 = the very end). The rest is the late side. */
export const METER_HIT_AT = 0.84;
/** How far past perfect (as a share of the run-up) the marker can go before it runs off the end. */
export const METER_OVERRUN = (1 - METER_HIT_AT) / METER_HIT_AT;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const INK = '#17131c',
  PAPER = '#fff6e2',
  MARKER = "'Permanent Marker', 'Barlow Condensed', Impact, sans-serif";
/** Spray paint from the bottom of the meter to the hit zone: hot pink, through orange, to yellow. */
function paint(f: number) {
  const h = (330 + 82 * clamp(f, 0, 1)) % 360;
  return `hsl(${h.toFixed(0)},100%,${(57 + 4 * f).toFixed(0)}%)`;
}
/** A steady little random number for (i, seed): the same wobble every time the meter is rebuilt. */
const jit = (i: number, seed: number) => {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};

export class ArcMeter {
  private R = 100;
  private a0 = 80; // degrees: where the arc starts (lower right of the circle; SVG y points down)
  private sweep = 140;
  private scale = 1;
  private built = 0;
  private builtPutt = false;
  private size = 0;
  private thick = 12;
  private zoneKey = '';
  private fade = 0;
  private spin = 0;
  private ballShown = '';
  private segs: { q: number; el: SVGElement }[] = [];
  private dots: SVGElement[] = [];
  private els: Record<string, SVGElement> = {};
  private zone!: SVGElement;
  constructor(private svg: SVGSVGElement) {}
  /** q = 0 (start) … 1 (end of the arc). */
  private ang(q: number) {
    return ((this.a0 - q * this.sweep) * Math.PI) / 180;
  }
  private pt(q: number, grow = 0) {
    const a = this.ang(q),
      r = this.R + grow;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }
  /** A clean arc (for the paint inside the outlines). */
  private d(q0: number, q1: number, grow = 0) {
    const [x0, y0] = this.pt(q0, grow),
      [x1, y1] = this.pt(q1, grow),
      sw = Math.abs(q1 - q0) * this.sweep,
      r = (this.R + grow).toFixed(1);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${sw > 180 ? 1 : 0} ${q1 > q0 ? 0 : 1} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  /** A hand-drawn arc: the same curve with a slow wobble in and out, as if done with a fat marker. */
  private wob(q0: number, q1: number, grow: number, amp: number, seed: number) {
    const n = Math.max(4, Math.round((Math.abs(q1 - q0) * this.sweep) / 5));
    let s = '';
    for (let i = 0; i <= n; i++) {
      const q = q0 + ((q1 - q0) * i) / n,
        w = (jit(i, seed) * 0.6 + jit(Math.floor(i / 3), seed + 9) * 0.4) * amp,
        [x, y] = this.pt(q, grow + w);
      s += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return s;
  }
  private mk(tag: string, attrs: Record<string, any>, parent: Element = this.svg) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    parent.appendChild(e);
    return e as SVGElement;
  }
  private build(h: number, putt: boolean) {
    this.R = h * 0.35 * (putt ? 0.8 : 1);
    const R = this.R,
      W = Math.ceil(R * 2 + 200),
      th = Math.max(11, R * 0.17);
    this.thick = th;
    this.svg.setAttribute('viewBox', `${-W / 2} ${-W / 2} ${W} ${W}`);
    this.svg.style.width = this.svg.style.height = W + 'px';
    this.svg.innerHTML = '';
    const round = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    // the sticker: a hard shadow, a die-cut cream border, a fat ink outline, and the dark track the paint goes on
    this.mk('path', { ...round, d: this.d(0, 1), stroke: 'rgba(0,0,0,.38)', 'stroke-width': th + 15, transform: 'translate(5 6)' });
    this.mk('path', { ...round, d: this.wob(0, 1, 0, 1.6, 1), stroke: PAPER, 'stroke-width': th + 15 });
    this.mk('path', { ...round, d: this.wob(0, 1, 0, 1.3, 2), stroke: INK, 'stroke-width': th + 7 });
    this.mk('path', { ...round, d: this.d(0, 1), stroke: '#2b2433', 'stroke-width': th - 2 });
    const g = this.mk('g', {});
    // the paint: fills behind the marker. A soft shot only reaches the first colours.
    this.segs = [];
    const N = 48;
    for (let i = 0; i < N; i++) {
      const q0 = (i / N) * METER_HIT_AT,
        q1 = Math.min(METER_HIT_AT, ((i + 1.25) / N) * METER_HIT_AT);
      this.segs.push({
        q: q0,
        el: this.mk('path', { d: this.d(q0, q1), fill: 'none', stroke: paint((i / N) * this.scale), 'stroke-width': th - 2, opacity: 0 }, g),
      });
    }
    // the hit zone is part of the gauge: painted on the track itself, under the same outlines and border
    this.zone = this.mk('g', {});
    // marker-pen edges over the paint, and a dashed streak down the middle of the track
    this.mk('path', { ...round, d: this.wob(0, 1, th * 0.5, 1.1, 3), stroke: INK, 'stroke-width': Math.max(2.5, th * 0.2) });
    this.mk('path', { ...round, d: this.wob(0, 1, -th * 0.5, 1.1, 4), stroke: INK, 'stroke-width': Math.max(2.5, th * 0.2) });
    this.mk('path', {
      ...round,
      d: this.wob(0.03, METER_HIT_AT - 0.06, 0, 0.5, 6),
      stroke: 'rgba(255,255,255,.55)',
      'stroke-width': Math.max(1.5, th * 0.11),
      'stroke-dasharray': `${th * 1.1} ${th * 0.9} ${th * 0.35} ${th * 0.9}`,
    });
    // the marker: spray dots behind a spinning starburst
    this.dots = [0, 1, 2, 3, 4, 5].map(i => this.mk('circle', { r: Math.max(1.2, th * (0.16 - i * 0.018)), fill: '#fff', opacity: 0 }));
    const star = (ro: number, ri: number) => {
      let s = '';
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2,
          r = i % 2 ? ri : ro;
        s += `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
      }
      return s + 'Z';
    };
    const knob = this.mk('g', {});
    this.mk('path', { d: star(th * 1.02, th * 0.66), fill: '#fff', stroke: INK, 'stroke-width': 3.5, 'stroke-linejoin': 'round' }, knob);
    this.mk('circle', { r: th * 0.3, fill: '#ff3d8b', stroke: INK, 'stroke-width': 2.5 }, knob);
    // …or, when the game says which ball you play, that ball: a round picture of it with an inked rim, spinning the same way
    const br = th * 0.92,
      ballG = this.mk('g', { display: 'none' }, knob);
    this.mk('circle', { r: br + 2.5, fill: '#fff', stroke: INK, 'stroke-width': 3.5 }, ballG);
    this.els.ballImg = this.mk('image', { x: -br, y: -br, width: br * 2, height: br * 2, preserveAspectRatio: 'xMidYMid slice' }, ballG);
    this.els.ballG = ballG;
    this.els.star = knob.children[0] as SVGElement;
    this.els.starDot = knob.children[1] as SVGElement;
    this.ballShown = '';
    this.els.knob = knob;
    // the tag
    const tag = (fill: string, dx = 0, dy = 0) =>
      this.mk('text', {
        'font-family': MARKER,
        'font-size': Math.max(15, th * 1.35),
        fill,
        stroke: INK,
        'stroke-width': dx ? 0 : 5,
        'paint-order': 'stroke',
        'stroke-linejoin': 'round',
        transform: `translate(${dx} ${dy})`,
      });
    this.els.hitSh = tag(INK, 2.5, 3.5);
    this.els.hit = tag('#ffe23d');
    this.els.hitSh.textContent = this.els.hit.textContent = 'HIT!';
    // the yardage, scrawled inside the arc
    const fs = Math.max(13, R * 0.17),
      txt = { 'text-anchor': 'end', stroke: INK, 'paint-order': 'stroke', 'stroke-linejoin': 'round' };
    this.els.t1 = this.mk('text', { ...txt, 'font-family': MARKER, 'font-size': fs * 1.1, fill: '#ffe23d', 'stroke-width': 5 });
    this.els.t2 = this.mk('text', {
      ...txt,
      'font-family': 'Barlow Condensed, Impact, sans-serif',
      'font-weight': 800,
      'font-size': fs * 0.82,
      fill: PAPER,
      'stroke-width': 4,
      'letter-spacing': '.04em',
    });
    this.built = h;
    this.builtPutt = putt;
    this.size = W;
    this.zoneKey = '';
  }
  private drawZone(g0: number, p0: number, p1: number, g1: number) {
    const th = this.thick,
      z = this.zone,
      butt = { fill: 'none', 'stroke-linejoin': 'round' };
    z.innerHTML = '';
    this.mk('path', { ...butt, d: this.d(g0, g1), stroke: '#ff8a1f', 'stroke-width': th - 2 }, z);
    this.mk('path', { ...butt, d: this.d(p0, p1), stroke: '#4dff6e', 'stroke-width': th - 2 }, z);
    const [lx, ly] = this.pt(METER_HIT_AT + 0.02, th * 1.5);
    for (const e of [this.els.hitSh, this.els.hit]) {
      const sh = e === this.els.hitSh;
      e.setAttribute('transform', `translate(${(lx + (sh ? 2.5 : 0)).toFixed(1)} ${(ly + (sh ? 3.5 : 0)).toFixed(1)}) rotate(-12)`);
    }
  }
  private hitT = 0;
  update(f: ArcFrame, dt: number, visible: boolean) {
    this.fade = clamp(this.fade + (visible ? dt * 6 : -dt * 4), 0, 1);
    this.svg.style.opacity = String(this.fade);
    this.svg.style.display = this.fade > 0 ? 'block' : 'none';
    if (this.fade <= 0) return;
    const hpx = clamp(f.hpx, 60, innerHeight * 0.75),
      sc = clamp(f.scale ?? 1, 0.12, 1);
    if (!this.built || this.builtPutt !== f.putt || Math.abs(hpx - this.built) / this.built > 0.1 || Math.abs(sc - this.scale) > 0.01) {
      this.scale = sc;
      this.sweep = 150 * (0.5 + 0.5 * sc); // a soft shot: a shorter meter
      this.build(hpx, f.putt);
    }
    const hb = this.built,
      cx = f.feetX + hb * (f.putt ? 0.78 : 0.92),
      cy = f.feetY - hb * (f.putt ? 0.42 : 0.5) /* to the right of the ball and clubhead, not over them */,
      th = this.thick,
      e = this.els;
    this.svg.style.transform = `translate(${(cx - this.size / 2).toFixed(1)}px,${(cy - this.size / 2).toFixed(1)}px)`;
    // time → place on the arc: the run-up (u0 … 0) fills the arc up to the hit line, then on at the same speed
    const span = Math.max(0.2, -f.u0),
      qOf = (u: number) => METER_HIT_AT * (1 + u / span),
      wq = (w: number) => (METER_HIT_AT * w) / span;
    const zk = `${hb}|${this.scale.toFixed(2)}|${wq(f.win.p).toFixed(4)}|${wq(f.win.g).toFixed(4)}|${wq(f.win.pl ?? f.win.p).toFixed(4)}|${wq(f.win.gl ?? f.win.g).toFixed(4)}`;
    if (zk !== this.zoneKey) {
      this.zoneKey = zk;
      const min = 0.012; // always wide enough to see
      this.drawZone(
        Math.max(0.02, METER_HIT_AT - Math.max(wq(f.win.g), min * 2)),
        METER_HIT_AT - Math.max(wq(f.win.p), min),
        Math.min(0.985, METER_HIT_AT + Math.max(wq(f.win.pl ?? f.win.p), min)),
        Math.min(0.995, METER_HIT_AT + Math.max(wq(f.win.gl ?? f.win.g), min * 2)),
      );
    }
    const idle = f.phase === 'idle',
      q = idle ? 0 : clamp(qOf(f.u), 0, 1);
    for (const s of this.segs) s.el.setAttribute('opacity', s.q < q ? '1' : '0');
    if ((f.ball || '') !== this.ballShown) {
      this.ballShown = f.ball || '';
      if (f.ball) e.ballImg.setAttribute('href', ballPreview(f.ball, 96).toDataURL());
      e.ballG.setAttribute('display', f.ball ? '' : 'none');
      e.star.setAttribute('display', f.ball ? 'none' : '');
      e.starDot.setAttribute('display', f.ball ? 'none' : '');
    }
    this.spin += dt * (f.phase === 'power' || f.phase === 'acc' ? 560 : 80);
    {
      // the strike call-out: what you did, popping in big and settling
      const on = f.phase === 'follow',
        word = !f.grade
          ? 'HIT!'
          : f.grade === 'perfect'
            ? 'PERFECT!'
            : f.grade === 'good'
              ? f.late
                ? 'A HAIR LATE'
                : 'A HAIR EARLY'
              : f.late
                ? 'LATE!'
                : 'EARLY!',
        col = !f.grade ? '#ffe23d' : f.grade === 'perfect' ? '#4dff6e' : f.grade === 'good' ? '#ffe23d' : '#ff5a7a';
      this.hitT = on ? this.hitT + dt : 0;
      if (on && e.hit.textContent !== word) {
        e.hitSh.textContent = e.hit.textContent = word;
        e.hit.setAttribute('fill', col);
        this.hitT = 0;
      }
      const k = 1 + 0.9 * Math.max(0, 1 - this.hitT / 0.16);
      for (const t of [e.hitSh, e.hit]) {
        t.setAttribute('opacity', on ? '1' : '0');
        t.setAttribute('transform', `${t.getAttribute('transform')!.replace(/ scale\(.*\)/, '')} scale(${k.toFixed(2)})`);
      }
      // the zone flashes on a clean strike
      this.zone.setAttribute('opacity', on && f.grade === 'perfect' && this.hitT < 0.5 ? String(0.55 + 0.45 * Math.cos(this.hitT * 38)) : '1');
    }
    const [kx, ky] = this.pt(q),
      moving = f.phase === 'power' || f.phase === 'acc',
      pop = f.phase === 'follow' ? 1.25 : 1;
    e.knob.setAttribute('transform', `translate(${kx.toFixed(1)} ${ky.toFixed(1)}) rotate(${(this.spin % 360).toFixed(0)}) scale(${pop})`);
    e.knob.setAttribute('opacity', idle ? '0' : '1');
    this.dots.forEach((dot, i) => {
      const dq = q - (i + 1) * 0.022;
      if (!moving || dq < 0) return dot.setAttribute('opacity', '0');
      const [x, y] = this.pt(dq, jit(i + Math.floor(f.time * 24), 7) * th * 0.32);
      dot.setAttribute('cx', x.toFixed(1));
      dot.setAttribute('cy', y.toFixed(1));
      dot.setAttribute('opacity', (0.85 - i * 0.13).toFixed(2));
    });
    const [tx, ty] = this.pt(0.36, -th * 1.25);
    e.t1.setAttribute('transform', `translate(${tx.toFixed(1)} ${(ty - th * 0.15).toFixed(1)}) rotate(-5)`);
    e.t2.setAttribute('transform', `translate(${tx.toFixed(1)} ${(ty + th * 0.95).toFixed(1)}) rotate(-5)`);
    if (e.t1.textContent !== f.line1) e.t1.textContent = f.line1;
    if (e.t2.textContent !== f.line2) e.t2.textContent = f.line2;
  }
}
