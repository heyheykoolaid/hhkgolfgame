// The lounge's machines: two slot machines and two video poker cabinets along the back wall. You sit down at one and
// play it in first person: the game runs on the cabinet's own screen (a canvas texture), your hands rest on the button
// deck and reach for the spin button or the lever, and V pulls the camera back. Rules and odds: shared/src/vlt.ts.
// The cabinets are built in code. Single player against the house; other players see you sitting at the machine.
import * as THREE from 'three';
import {
  SLOT_THREE,
  SLOT_TWO_CHERRIES,
  slotStop,
  slotPay,
  POKER_PAYS,
  pokerHand,
  pokerPay,
  pokerDeck,
  type SlotSym,
  type PokerHand,
} from '@gh/shared';
import { loadProgress, addCash } from '../avatar/progress';
import { playSample } from '../audio/samples';
import type { Golfer } from '../characters/golfer';

export interface VltSpot {
  id: string;
  x: number;
  z: number;
  r: number;
  label: string;
}
interface MachineDef {
  id: string;
  kind: 'slots' | 'poker';
  name: string;
  bets: number[];
  color: string;
}
export const MACHINES: MachineDef[] = [
  { id: 'vlt:0', kind: 'slots', name: 'Lucky Lie Slots', bets: [1, 5, 25], color: '#c8452f' },
  { id: 'vlt:1', kind: 'slots', name: 'High Roller Slots', bets: [25, 100, 500], color: '#b58a1d' },
  { id: 'vlt:2', kind: 'poker', name: 'Video Poker', bets: [5, 25, 100], color: '#2f6a8a' },
  { id: 'vlt:3', kind: 'poker', name: 'High Stakes Poker', bets: [100, 250, 1000], color: '#5a3a8a' },
];
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const SYM: Record<SlotSym, string> = { cherry: '🍒', lemon: '🍋', bell: '🔔', flag: '⛳', seven: '7', gem: '💎' };
const STOOL_Z = 0.95, // the stool stands this far in front of the cabinet's middle
  SEAT_H = 0.74,
  SCREEN_Y = 1.42,
  DECK_Y = 1.07;

// ------------------------------------------------------------------ a machine in the room
interface Machine {
  def: MachineDef;
  x: number;
  z: number;
  cv: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  marquee: THREE.MeshBasicMaterial;
  marqueeCol: THREE.Color;
  lever: THREE.Group | null;
  spinBtn: THREE.Mesh;
  /** flashing until this clock time (a win) */
  flashTo: number;
}
const machines: Machine[] = [];

function drawFrame(m: Machine) {
  const x = m.g,
    g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#16233a');
  g.addColorStop(1, '#0a0f1c');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  x.fillStyle = m.def.color;
  x.fillRect(0, 0, 512, 62);
  x.fillStyle = '#fff7e0';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = '800 34px Inter, sans-serif';
  x.fillText(m.def.name.toUpperCase(), 256, 33);
}
function sym(x: CanvasRenderingContext2D, s: SlotSym, cx: number, cy: number, size: number) {
  if (s === 'seven') {
    x.font = `900 ${size * 1.15}px Georgia, serif`;
    x.fillStyle = '#c8452f';
    x.fillText('7', cx, cy + size * 0.04);
  } else {
    x.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif`;
    x.fillStyle = '#1d1d1f';
    x.fillText(SYM[s], cx, cy + size * 0.06);
  }
}
/** What an empty machine shows. */
function drawAttract(m: Machine, taken = false) {
  drawFrame(m);
  const x = m.g;
  if (m.def.kind === 'slots') {
    (['seven', 'seven', 'seven'] as SlotSym[]).forEach((s, i) => {
      x.fillStyle = '#f6f1e2';
      x.fillRect(46 + i * 146, 130, 128, 200);
      sym(x, s, 110 + i * 146, 230, 120);
    });
  } else {
    ['10', 'J', 'Q', 'K', 'A'].forEach((r, i) => card(x, 8 + i * 4, 22 + i * 96, 160, 84, 124, false, r));
    x.fillStyle = '#ffd27a';
    x.font = '800 32px Inter, sans-serif';
    x.fillText('ROYAL FLUSH  ×800', 256, 340);
  }
  x.fillStyle = taken ? '#ff9a8a' : '#9fb4c8';
  x.font = '700 30px Inter, sans-serif';
  x.fillText(taken ? 'IN USE' : `PLAY FROM ${money(m.def.bets[0])}`, 256, 440);
  m.tex.needsUpdate = true;
}
function card(x: CanvasRenderingContext2D, c: number, px: number, py: number, w: number, h: number, held: boolean, rankOverride?: string) {
  const r = rankOverride || ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'][c % 13],
    s = Math.floor(c / 13),
    red = s === 1 || s === 2;
  x.fillStyle = '#f6f1e2';
  x.beginPath();
  x.roundRect(px, py - (held ? 10 : 0), w, h, 8);
  x.fill();
  if (held) {
    x.lineWidth = 5;
    x.strokeStyle = '#e2b23a';
    x.stroke();
  }
  x.fillStyle = red ? '#c8452f' : '#1d1d1f';
  x.font = `800 ${w * 0.42}px Georgia, serif`;
  x.fillText(r, px + w / 2, py + h * 0.3 - (held ? 10 : 0));
  x.font = `${w * 0.5}px serif`;
  x.fillText('♠♥♦♣'[s], px + w / 2, py + h * 0.7 - (held ? 10 : 0));
}

/** Build the four cabinets with their stools. They stand at `xs` along the wall at z, facing +z. */
export function buildMachines(G: THREE.Group, xs: number[], z: number): VltSpot[] {
  const mat = (color: string, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }),
    dark = mat('#17161a', 0.5, 0.2),
    chrome = mat('#b9b4a8', 0.25, 0.8),
    seat = mat('#6a1f2a', 0.7),
    add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, zz: number, rx = 0) => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, zz);
      o.rotation.x = rx;
      parent.add(o);
      return o;
    };
  return MACHINES.map((def, i) => {
    const x = xs[i],
      body = mat(def.color, 0.45, 0.1);
    add(G, new THREE.BoxGeometry(0.78, 0.12, 0.7), dark, x, 0.12, z); // plinth
    add(G, new THREE.BoxGeometry(0.72, 0.8, 0.62), body, x, 0.58, z); // belly
    add(G, new THREE.BoxGeometry(0.76, 0.07, 0.78), dark, x, 1.0, z + 0.08); // button deck
    add(G, new THREE.BoxGeometry(0.72, 0.78, 0.5), body, x, 1.42, z - 0.06); // head
    add(G, new THREE.BoxGeometry(0.8, 0.3, 0.56), dark, x, 1.95, z - 0.04); // marquee box
    // a dark bezel round the screen, so it reads as a monitor set into the cabinet
    add(G, new THREE.BoxGeometry(0.68, 0.7, 0.03), dark, x, SCREEN_Y, z + 0.185, -0.12);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const scr = add(
      G,
      new THREE.PlaneGeometry(0.6, 0.6),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
      x,
      SCREEN_Y,
      z + 0.203,
      -0.12,
    );
    scr.userData.noBatch = true;
    const marqueeCol = new THREE.Color(i % 2 ? '#ffd27a' : '#ff8a6a'),
      marquee = new THREE.MeshBasicMaterial({ color: marqueeCol.clone(), toneMapped: false }),
      glow = add(G, new THREE.PlaneGeometry(0.72, 0.22), marquee, x, 1.95, z + 0.245);
    glow.userData.noBatch = true;
    // the deck: bet −, bet +, max, and the big spin / deal button on the right
    const btnCols = ['#e9e4d4', '#e9e4d4', '#e2b23a'];
    for (let b = 0; b < 3; b++) add(G, new THREE.CylinderGeometry(0.032, 0.032, 0.03, 10), mat(btnCols[b], 0.3), x - 0.26 + b * 0.11, 1.05, z + 0.3);
    const spinBtn = add(G, new THREE.CylinderGeometry(0.055, 0.055, 0.04, 14), mat('#c8452f', 0.3), x + 0.2, 1.055, z + 0.3);
    spinBtn.userData.noBatch = true;
    add(G, new THREE.BoxGeometry(0.3, 0.1, 0.04), chrome, x, 0.5, z + 0.32); // coin tray
    // a lever on the right-hand side of the slot machines
    let lever: THREE.Group | null = null;
    if (def.kind === 'slots') {
      lever = new THREE.Group();
      lever.position.set(x + 0.43, 1.12, z + 0.05);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.42, 8), chrome),
        knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), mat('#c8452f', 0.3));
      arm.position.y = 0.21;
      knob.position.y = 0.44;
      lever.add(arm, knob);
      lever.traverse(o => (o.userData.noBatch = true));
      G.add(lever);
      add(G, new THREE.BoxGeometry(0.08, 0.16, 0.14), dark, x + 0.4, 1.12, z + 0.05);
    }
    // a stool
    add(G, new THREE.CylinderGeometry(0.19, 0.19, 0.08, 14), seat, x, 0.7, z + STOOL_Z);
    add(G, new THREE.CylinderGeometry(0.03, 0.03, 0.62, 8), chrome, x, 0.36, z + STOOL_Z);
    add(G, new THREE.CylinderGeometry(0.2, 0.22, 0.04, 14), chrome, x, 0.08, z + STOOL_Z);
    const m: Machine = { def, x, z, cv, g: cv.getContext('2d')!, tex, marquee, marqueeCol, lever, spinBtn, flashTo: 0 };
    machines.push(m);
    drawAttract(m);
    return { id: def.id, x, z: z + STOOL_Z + 0.35, r: 0.95, label: `Sit · ${def.name}` };
  });
}

// ------------------------------------------------------------------ playing one
export interface VltHost {
  toast(h: string): void;
  /** Stood up: back to walking. */
  onClose(): void;
  sendPres(): void;
  myGolfer(): Golfer;
}
export function createVlt(host: VltHost) {
  let mine = -1,
    cam: 'first' | 'over' = 'first',
    lookYaw = 0,
    lookPitch = 0,
    cash = 0,
    shown = 0, // the credits on the screen (they catch up with `cash` when a spin ends)
    bet = 0,
    msg = '',
    win = 0,
    clock = 0,
    taken = new Set<number>();
  // slots
  const reel = [0, 1, 2].map(() => ({ pos: Math.random() * 30, sym: 'seven' as SlotSym, stopAt: 0, spinning: false }));
  let pendingWin = 0,
    spinT0 = -1,
    stops: SlotSym[] = ['seven', 'seven', 'seven'],
    tickAt = 0;
  // poker
  let deck: number[] = [],
    hand: number[] = [],
    held = [false, false, false, false, false],
    phase: 'bet' | 'hold' = 'bet',
    result: PokerHand = 'none';
  // what the hands are doing: reaching for the spin button, the lever or a bet button
  let act: { kind: 'spin' | 'lever' | 'bet'; t0: number; fire: boolean } | null = null;

  const M = () => machines[mine],
    busy = () => spinT0 >= 0 || !!act;
  const pay = (d: number) => {
    cash += d;
    void addCash(d);
  };

  // ---- the bar of buttons (no key legends: the controls panel lists the keys)
  const ui = document.createElement('div');
  ui.id = 'lvlt';
  ui.className = 'hidden';
  (document.getElementById('lobbyui') || document.body).appendChild(ui);
  function renderBar() {
    if (mine < 0) return;
    const slots = M().def.kind === 'slots';
    ui.innerHTML = `<button data-a="betdn">Bet −</button><b>${money(bet)}</b><button data-a="betup">Bet +</button><button data-a="max">Max bet</button>
      <button data-a="go" class="primary">${slots ? 'Spin' : phase === 'bet' ? 'Deal' : 'Draw'}</button>${slots ? '<button data-a="lever">Pull the lever</button>' : ''}
      <button data-a="view">View</button><button data-a="leave">Stand up</button>`;
    ui.querySelectorAll<HTMLButtonElement>('[data-a]').forEach(
      b =>
        (b.onclick = () => {
          const a = b.dataset.a!;
          if (a === 'betdn') stepBet(-1);
          else if (a === 'betup') stepBet(1);
          else if (a === 'max') stepBet(9);
          else if (a === 'go') press('spin');
          else if (a === 'lever') press('lever');
          else if (a === 'view') cam = cam === 'first' ? 'over' : 'first';
          else leave();
          b.blur();
        }),
    );
  }

  // ---- the screen
  function drawSlots(t: number) {
    const m = M(),
      x = m.g;
    drawFrame(m);
    const flash = win > 0 && spinT0 < 0 && t < m.flashTo;
    for (let i = 0; i < 3; i++) {
      const r = reel[i],
        px = 46 + i * 146;
      x.save();
      x.beginPath();
      x.rect(px, 110, 128, 216);
      x.clip();
      x.fillStyle = flash && Math.sin(t * 22) > 0 ? '#fff3b8' : '#f6f1e2';
      x.fillRect(px, 110, 128, 216);
      if (r.spinning) {
        const f = r.pos % 1;
        for (let k = -1; k <= 2; k++)
          sym(x, slotStop((Math.abs(Math.sin((Math.floor(r.pos) + k) * 12.9898 + i * 78.233)) * 43758.5453) % 1), px + 64, 218 + (k - f) * 120, 96);
      } else {
        const bounce = Math.max(0, 1 - (t - r.stopAt) / 0.18);
        sym(x, r.sym, px + 64, 218 + Math.sin(bounce * Math.PI) * 14, 104);
      }
      // the window's shading, top and bottom
      const sh = x.createLinearGradient(0, 110, 0, 326);
      sh.addColorStop(0, 'rgba(0,0,0,.45)');
      sh.addColorStop(0.22, 'rgba(0,0,0,0)');
      sh.addColorStop(0.78, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(0,0,0,.45)');
      x.fillStyle = sh;
      x.fillRect(px, 110, 128, 216);
      x.restore();
    }
    x.fillStyle = flash ? '#ffd27a' : 'rgba(255,210,122,.55)';
    x.fillRect(30, 215, 452, 5);
    // the message line
    x.textAlign = 'center';
    if (flash || (win > 0 && spinT0 < 0)) {
      x.fillStyle = '#ffd27a';
      x.font = `900 ${44 + (flash ? 6 * Math.sin(t * 14) : 0)}px Inter, sans-serif`;
      x.fillText(`WIN ${money(win)}`, 256, 368);
    } else {
      x.fillStyle = '#c9d6e4';
      x.font = '700 26px Inter, sans-serif';
      x.fillText(msg, 256, 368);
    }
    footer(x);
    // the pay table, small, along the bottom
    x.font = '600 17px Inter, sans-serif';
    x.fillStyle = '#8fa3b8';
    x.fillText(
      `💎×${SLOT_THREE.gem}  7×${SLOT_THREE.seven}  ⛳×${SLOT_THREE.flag}  🔔×${SLOT_THREE.bell}  🍋×${SLOT_THREE.lemon}  🍒×${SLOT_THREE.cherry}  🍒🍒×${SLOT_TWO_CHERRIES}`,
      256,
      488,
    );
    m.tex.needsUpdate = true;
  }
  function footer(x: CanvasRenderingContext2D) {
    x.fillStyle = 'rgba(255,255,255,.07)';
    x.fillRect(20, 400, 472, 62);
    x.font = '600 18px Inter, sans-serif';
    x.fillStyle = '#8fa3b8';
    x.textAlign = 'left';
    x.fillText('BET', 36, 418);
    x.textAlign = 'right';
    x.fillText('CREDITS', 476, 418);
    x.font = '800 30px Inter, sans-serif';
    x.fillStyle = '#ffd27a';
    x.textAlign = 'left';
    x.fillText(money(bet), 36, 444);
    x.fillStyle = '#9fdc8a';
    x.textAlign = 'right';
    x.fillText(money(shown), 476, 444);
    x.textAlign = 'center';
  }
  function drawPoker(t: number) {
    const m = M(),
      x = m.g;
    drawFrame(m);
    // the pay table: three columns, the made hand lit
    x.font = '600 17px Inter, sans-serif';
    POKER_PAYS.forEach((p, i) => {
      const cx = 22 + (i % 3) * 160,
        cy = 86 + Math.floor(i / 3) * 26,
        on = p[0] === result && (phase === 'hold' || t < m.flashTo + 4);
      if (on) {
        x.fillStyle = '#e2b23a';
        x.fillRect(cx - 4, cy - 12, 152, 24);
      }
      x.fillStyle = on ? '#2a1a08' : '#c9d6e4';
      x.textAlign = 'left';
      x.fillText(p[1], cx, cy);
      x.textAlign = 'right';
      x.fillStyle = on ? '#2a1a08' : '#ffd27a';
      x.fillText('×' + p[2], cx + 144, cy);
    });
    x.textAlign = 'center';
    for (let i = 0; i < 5; i++) {
      const px = 22 + i * 96;
      if (hand.length) card(x, hand[i], px, 186, 84, 124, held[i]);
      else {
        x.fillStyle = '#7a2430';
        x.beginPath();
        x.roundRect(px, 186, 84, 124, 8);
        x.fill();
        x.strokeStyle = '#f6f1e2';
        x.lineWidth = 3;
        x.stroke();
      }
      if (held[i]) {
        x.fillStyle = '#e2b23a';
        x.fillRect(px + 12, 316, 60, 22);
        x.fillStyle = '#2a1a08';
        x.font = '800 15px Inter, sans-serif';
        x.fillText('HELD', px + 42, 328);
      } else if (phase === 'hold') {
        x.fillStyle = '#8fa3b8';
        x.font = '700 16px Inter, sans-serif';
        x.fillText(String(i + 1), px + 42, 328);
      }
    }
    const flash = win > 0 && t < m.flashTo;
    if (win > 0 && phase === 'bet') {
      x.fillStyle = '#ffd27a';
      x.font = `900 ${40 + (flash ? 5 * Math.sin(t * 14) : 0)}px Inter, sans-serif`;
      x.fillText(`WIN ${money(win)}`, 256, 372);
    } else {
      x.fillStyle = '#c9d6e4';
      x.font = '700 24px Inter, sans-serif';
      x.fillText(msg, 256, 372);
    }
    footer(x);
    x.font = '600 17px Inter, sans-serif';
    x.fillStyle = '#8fa3b8';
    x.fillText('JACKS OR BETTER · ONE DRAW', 256, 488);
    m.tex.needsUpdate = true;
  }

  // ---- the games
  function stepBet(d: number) {
    if (mine < 0 || busy() || (M().def.kind === 'poker' && phase === 'hold')) return;
    const bets = M().def.bets,
      i = clamp(d === 9 ? bets.length - 1 : bets.indexOf(bet) + d, 0, bets.length - 1);
    if (bets[i] === bet) return;
    bet = bets[i];
    act = { kind: 'bet', t0: clock, fire: true };
    playSample('click', 0.45);
    renderBar();
  }
  /** Reach for the spin button or the lever; the game acts when the hand gets there. */
  function press(kind: 'spin' | 'lever') {
    if (mine < 0 || busy()) return;
    if (kind === 'lever' && !M().lever) kind = 'spin';
    if ((M().def.kind === 'slots' || phase === 'bet') && cash < bet) {
      msg = "YOU CAN'T COVER THAT BET";
      playSample('error', 0.5);
      return;
    }
    act = { kind, t0: clock, fire: false };
  }
  function go() {
    const m = M();
    if (m.def.kind === 'slots') {
      stops = [slotStop(Math.random()), slotStop(Math.random()), slotStop(Math.random())];
      win = 0;
      const w = slotPay(stops[0], stops[1], stops[2]) * bet;
      pay(w - bet); // settled now, so walking away mid-spin changes nothing
      shown -= bet;
      spinT0 = clock;
      msg = '';
      reel.forEach(r => (r.spinning = true));
      pendingWin = w;
      return;
    }
    if (phase === 'bet') {
      pay(-bet);
      shown = cash;
      deck = pokerDeck(Math.random);
      hand = deck.splice(0, 5);
      held = [false, false, false, false, false];
      phase = 'hold';
      win = 0;
      result = pokerHand(hand);
      msg = 'PICK THE CARDS TO KEEP, THEN DRAW';
      playSample('drop', 0.5);
    } else {
      hand = hand.map((c, i) => (held[i] ? c : deck.shift()!));
      held = [false, false, false, false, false];
      settlePoker();
      playSample('drop', 0.5);
    }
    renderBar();
  }
  function settlePoker() {
    result = pokerHand(hand);
    win = pokerPay(result) * bet;
    phase = 'bet';
    if (win) {
      pay(win);
      celebrate(win >= bet * 9);
    } else msg = 'NOTHING THIS TIME';
    shown = cash;
  }
  function celebrate(big: boolean) {
    const m = M();
    m.flashTo = clock + (big ? 3.2 : 1.4);
    playSample(big ? 'win' : 'confirm', 0.6);
    // coins rattling out
    for (let k = 0; k < (big ? 10 : 4); k++) setTimeout(() => playSample('tick', 0.35, 1.5 + Math.random() * 0.5), 120 + k * 70);
  }
  function hold(i: number) {
    if (mine < 0 || M().def.kind !== 'poker' || phase !== 'hold' || act) return;
    held[i] = !held[i];
    playSample('select', 0.4);
  }

  // ---- sitting down and standing up
  async function sit(i: number) {
    if (mine >= 0 || taken.has(i) || !machines[i]) return false;
    mine = i;
    cam = 'first';
    lookYaw = lookPitch = 0;
    bet = machines[i].def.bets[0];
    win = 0;
    spinT0 = -1;
    act = null;
    hand = [];
    held = [false, false, false, false, false];
    phase = 'bet';
    result = 'none';
    msg = machines[i].def.kind === 'slots' ? 'PRESS SPIN OR PULL THE LEVER' : 'PRESS DEAL';
    reel.forEach(r => (r.spinning = false));
    ui.classList.remove('hidden');
    renderBar();
    host.sendPres();
    cash = shown = (await loadProgress()).cash;
    return true;
  }
  function leave() {
    if (mine < 0) return;
    if (M().def.kind === 'poker' && phase === 'hold') settlePoker(); // walked away mid-hand: the cards on the table stand
    const m = M();
    mine = -1;
    spinT0 = -1;
    act = null;
    m.marquee.color.copy(m.marqueeCol);
    if (m.lever) m.lever.rotation.x = 0;
    drawAttract(m);
    ui.classList.add('hidden');
    host.onClose();
  }
  function key(e: KeyboardEvent) {
    if (mine < 0 || e.repeat) return;
    const c = e.code;
    if (c === 'Escape' || c === 'KeyE') leave();
    else if (c === 'Space' || c === 'Enter') press('spin');
    else if (c === 'KeyL' || c === 'ArrowDown' || c === 'KeyS') press('lever');
    else if (c === 'KeyA' || c === 'ArrowLeft') stepBet(-1);
    else if (c === 'KeyD' || c === 'ArrowRight') stepBet(1);
    else if (c === 'KeyM') stepBet(9);
    else if (c === 'KeyV') cam = cam === 'first' ? 'over' : 'first';
    else if (/^Digit[1-5]$/.test(c)) hold(+c[5] - 1);
    e.preventDefault();
  }
  addEventListener('pointermove', e => {
    if (mine < 0 || cam !== 'first' || !(e.buttons & 1)) return;
    lookYaw = clamp(lookYaw - e.movementX * 0.004, -0.8, 0.8);
    lookPitch = clamp(lookPitch - e.movementY * 0.004, -0.55, 0.45);
  });

  // ---- bodies
  const _v = new THREE.Vector3();
  /** Sit a golfer at machine i. reach: where the right hand is, between its rest on the deck (0) and a target (1). */
  function seatGolfer(g: Golfer, i: number, t: number, reach?: { to: THREE.Vector3; k: number }) {
    const m = machines[i];
    if (!m) return;
    g.root.position.set(m.x, 0, m.z + STOOL_Z);
    g.root.rotation.set(0, Math.PI, 0);
    const right = new THREE.Vector3(m.x + 0.17, DECK_Y + 0.05, m.z + 0.36),
      left = new THREE.Vector3(m.x - 0.17, DECK_Y + 0.05, m.z + 0.36);
    if (reach) right.lerp(reach.to, reach.k);
    const feet: [THREE.Vector3, THREE.Vector3] = [
      new THREE.Vector3(m.x + 0.12, 0.3, m.z + STOOL_Z - 0.22),
      new THREE.Vector3(m.x - 0.12, 0.3, m.z + STOOL_Z - 0.22),
    ];
    if (g.root.userData.hipOff === undefined) {
      g.update({ mode: 'sit', s: 0, club: 'iron', time: t, turn: 0 } as any);
      const hb = (g as any).by?.Hips as THREE.Bone | undefined;
      g.root.userData.hipOff = hb ? hb.getWorldPosition(_v).y - g.root.position.y : 0.95;
    }
    g.root.position.y = 0.085 + SEAT_H + 0.06 - g.root.userData.hipOff; // (the lounge carpet is the floor)
    g.update({ mode: 'sit', s: 0, club: 'iron', time: t, turn: 0, ik: { hands: [right, left], feet } } as any);
  }
  function seatMe(g: Golfer, t: number) {
    if (mine < 0) return;
    const m = M();
    let reach: { to: THREE.Vector3; k: number } | undefined;
    if (act) {
      const u = (clock - act.t0) / (act.kind === 'lever' ? 0.9 : act.kind === 'spin' ? 0.42 : 0.3),
        k = Math.sin(clamp(u, 0, 1) * Math.PI); // out and back
      const to =
        act.kind === 'lever'
          ? m.lever!.localToWorld(new THREE.Vector3(0, 0.44, 0))
          : act.kind === 'spin'
            ? new THREE.Vector3(m.x + 0.2, DECK_Y + 0.03, m.z + 0.31)
            : new THREE.Vector3(m.x - 0.05, DECK_Y + 0.03, m.z + 0.31);
      reach = { to, k: act.kind === 'lever' ? clamp(u * 3, 0, 1) * (u > 0.8 ? clamp((1 - u) * 5, 0, 1) : 1) : k };
    }
    seatGolfer(g, mine, t, reach);
  }
  /** Where the camera goes: your own eyes on the screen, or pulled back over the shoulder. */
  function camTargets(camV: THREE.Vector3, look: THREE.Vector3) {
    if (mine < 0) return;
    const m = M();
    if (cam === 'over') {
      camV.set(m.x + 0.95, 1.85, m.z + 2.5);
      look.set(m.x, 1.3, m.z);
      return;
    }
    const head = (host.myGolfer() as any).by?.Head as THREE.Bone | undefined,
      eye = head ? head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(m.x, 1.42, m.z + STOOL_Z - 0.05),
      bob = Math.sin(clock * 1.3) * 0.004;
    // a little in front of the face, so no hair or nose is in shot; looking at the middle of the screen
    camV.set(m.x + (eye.x - m.x) * 0.5, eye.y + 0.08 + bob, eye.z - 0.15);
    const to = new THREE.Vector3(m.x, SCREEN_Y - 0.1, m.z + 0.2).sub(camV),
      yaw = Math.atan2(to.x, to.z) + lookYaw,
      pitch = Math.atan2(to.y, Math.hypot(to.x, to.z)) + lookPitch;
    look.set(camV.x + Math.sin(yaw) * Math.cos(pitch), camV.y + Math.sin(pitch), camV.z + Math.cos(yaw) * Math.cos(pitch));
  }

  function update(dt: number, t: number) {
    clock = t;
    if (mine < 0) return;
    const m = M();
    // the hand arrives: the button goes down or the lever comes forward, and the machine starts
    if (act) {
      const dur = act.kind === 'lever' ? 0.9 : act.kind === 'spin' ? 0.42 : 0.3,
        u = (clock - act.t0) / dur;
      if (act.kind === 'lever' && m.lever) m.lever.rotation.x = 1.15 * Math.sin(clamp((u - 0.3) / 0.55, 0, 1) * Math.PI);
      if (act.kind === 'spin') m.spinBtn.position.y = 1.055 - 0.018 * Math.sin(clamp(u, 0, 1) * Math.PI);
      if (!act.fire && u >= (act.kind === 'lever' ? 0.55 : 0.5)) {
        act.fire = true;
        playSample(act.kind === 'lever' ? 'toggle' : 'click', 0.6, act.kind === 'lever' ? 0.7 : 1);
        go();
      }
      if (u >= 1) {
        act = null;
        if (m.lever) m.lever.rotation.x = 0;
        m.spinBtn.position.y = 1.055;
      }
    }
    if (spinT0 >= 0) {
      const el = clock - spinT0;
      reel.forEach((r, i) => {
        if (!r.spinning) return;
        r.pos += dt * (17 - i * 1.5);
        if (el > 0.9 + i * 0.45) {
          r.spinning = false;
          r.sym = stops[i];
          r.stopAt = clock;
          playSample('drop', 0.45, 1.1 + i * 0.12);
        }
      });
      if (clock > tickAt && reel.some(r => r.spinning)) {
        tickAt = clock + 0.07;
        playSample('tick', 0.12, 1.8);
      }
      if (!reel.some(r => r.spinning)) {
        spinT0 = -1;
        shown = cash;
        win = pendingWin;
        if (win > bet) celebrate(win >= bet * 18);
        else {
          msg = win ? 'CHERRY · BET BACK' : 'NO LUCK · SPIN AGAIN';
          win = 0;
        }
        renderBar();
      }
    }
    // the sign over the machine flashes on a win
    if (clock < m.flashTo) m.marquee.color.set(Math.sin(clock * 20) > 0 ? '#ffffff' : m.def.color);
    else m.marquee.color.copy(m.marqueeCol);
    if (m.def.kind === 'slots') drawSlots(clock);
    else drawPoker(clock);
  }

  return {
    sit,
    leave,
    key,
    update,
    seatMe,
    seatGolfer,
    camTargets,
    isOpen: () => mine >= 0,
    /** A wide lens up close (the screen and your hands both in frame), a normal one pulled back. */
    fov: () => (cam === 'first' ? 68 : 50),
    kind: () => (mine >= 0 ? M().def.kind : null),
    /** My machine, for presence (others see me sitting there and can't take it). */
    pres: () => (mine >= 0 ? mine : undefined),
    /** Which machines other players are at. */
    setTaken(list: number[]) {
      const next = new Set(list.filter(i => i >= 0 && i < machines.length));
      for (let i = 0; i < machines.length; i++) if (i !== mine && next.has(i) !== taken.has(i)) drawAttract(machines[i], next.has(i));
      taken = next;
    },
    isTaken: (i: number) => taken.has(i),
  };
}
