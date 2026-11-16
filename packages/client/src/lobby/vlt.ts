// The lounge's machines: two slot machines and two video poker cabinets along the back wall. The cabinets are built
// here in code; the games are plain panels in the lobby's modal. Rules and odds are in shared/src/vlt.ts.
import * as THREE from 'three';
import { SLOT_SYMS, SLOT_THREE, SLOT_TWO_CHERRIES, slotStop, slotPay, POKER_PAYS, pokerHand, pokerPay, pokerDeck, type SlotSym } from '@gh/shared';
import { loadProgress, addCash } from '../avatar/progress';
import { playSample } from '../audio/samples';

export interface VltSpot {
  id: string;
  x: number;
  z: number;
  r: number;
  label: string;
}
export const MACHINES: { id: string; kind: 'slots' | 'poker'; name: string; bets: number[]; color: string }[] = [
  { id: 'vlt:0', kind: 'slots', name: 'Lucky Lie Slots', bets: [1, 5, 25], color: '#c8452f' },
  { id: 'vlt:1', kind: 'slots', name: 'High Roller Slots', bets: [25, 100, 500], color: '#b58a1d' },
  { id: 'vlt:2', kind: 'poker', name: 'Video Poker', bets: [5, 25, 100], color: '#2f6a8a' },
  { id: 'vlt:3', kind: 'poker', name: 'High Stakes Poker', bets: [100, 250, 1000], color: '#5a3a8a' },
];
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// ------------------------------------------------------------------ the cabinets
function screenTex(kind: 'slots' | 'poker', name: string, color: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#16233a');
  g.addColorStop(1, '#0a0f1c');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  if (kind === 'slots') {
    for (let i = 0; i < 3; i++) {
      x.fillStyle = '#f6f1e2';
      x.fillRect(22 + i * 74, 70, 64, 110);
      x.fillStyle = i === 1 ? '#c8452f' : '#1d1d1f';
      x.font = '900 84px Georgia, serif';
      x.fillText(i === 1 ? '7' : i ? '$' : '7', 54 + i * 74, 128);
    }
    x.strokeStyle = '#ffd27a';
    x.lineWidth = 3;
    x.strokeRect(14, 122, 228, 6);
  } else {
    const r = ['10', 'J', 'Q', 'K', 'A'];
    for (let i = 0; i < 5; i++) {
      x.fillStyle = '#f6f1e2';
      x.fillRect(10 + i * 48, 82, 42, 62);
      x.fillStyle = '#c8452f';
      x.font = '800 24px Georgia, serif';
      x.fillText(r[i], 31 + i * 48, 102);
      x.font = '26px serif';
      x.fillText('♥', 31 + i * 48, 128);
    }
    x.fillStyle = '#ffd27a';
    x.font = '800 20px Inter, sans-serif';
    x.fillText('ROYAL FLUSH  ×800', 128, 176);
  }
  x.fillStyle = color;
  x.fillRect(0, 0, 256, 44);
  x.fillStyle = '#fff7e0';
  x.font = '800 22px Inter, sans-serif';
  x.fillText(name.toUpperCase(), 128, 23);
  x.fillStyle = '#9fb4c8';
  x.font = '600 17px Inter, sans-serif';
  x.fillText('PRESS E TO PLAY', 128, 222);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Build the four cabinets with their stools. They stand at `xs` along the wall at z, facing +z. */
export function buildMachines(G: THREE.Group, xs: number[], z: number): VltSpot[] {
  const mat = (color: string, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }),
    dark = mat('#17161a', 0.5, 0.2),
    chrome = mat('#b9b4a8', 0.25, 0.8),
    seat = mat('#6a1f2a', 0.7),
    add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, zz: number, rx = 0) => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, zz);
      o.rotation.x = rx;
      o.castShadow = false;
      G.add(o);
      return o;
    };
  return MACHINES.map((mc, i) => {
    const x = xs[i],
      body = mat(mc.color, 0.45, 0.1);
    add(new THREE.BoxGeometry(0.78, 0.12, 0.7), dark, x, 0.12, z); // plinth
    add(new THREE.BoxGeometry(0.72, 0.8, 0.62), body, x, 0.58, z); // belly
    add(new THREE.BoxGeometry(0.76, 0.07, 0.78), dark, x, 1.0, z + 0.08); // button deck
    add(new THREE.BoxGeometry(0.72, 0.78, 0.5), body, x, 1.42, z - 0.06); // head
    add(new THREE.BoxGeometry(0.8, 0.3, 0.56), dark, x, 1.95, z - 0.04); // marquee box
    const scr = add(
      new THREE.PlaneGeometry(0.6, 0.6),
      new THREE.MeshBasicMaterial({ map: screenTex(mc.kind, mc.name, mc.color), toneMapped: false }),
      x,
      1.42,
      z + 0.2,
      -0.12,
    );
    scr.userData.noBatch = true;
    const glow = add(
      new THREE.PlaneGeometry(0.72, 0.22),
      new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffd27a' : '#ff8a6a', toneMapped: false }),
      x,
      1.95,
      z + 0.245,
    );
    glow.userData.noBatch = true;
    for (let b = 0; b < 4; b++)
      add(
        new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10),
        mat(['#e2b23a', '#e9e4d4', '#e9e4d4', '#c8452f'][b], 0.3),
        x - 0.24 + b * 0.16,
        1.05,
        z + 0.3,
      );
    add(new THREE.BoxGeometry(0.3, 0.1, 0.04), chrome, x, 0.5, z + 0.32); // coin tray
    // a stool
    add(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 14), seat, x, 0.7, z + 0.95);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.62, 8), chrome, x, 0.36, z + 0.95);
    add(new THREE.CylinderGeometry(0.2, 0.22, 0.04, 14), chrome, x, 0.08, z + 0.95);
    return { id: mc.id, x, z: z + 1.25, r: 0.95, label: `${mc.name} · ${money(mc.bets[0])} a ${mc.kind === 'slots' ? 'spin' : 'hand'}` };
  });
}

// ------------------------------------------------------------------ the games
export interface VltHost {
  /** Open the lobby's modal with this title and body; returns the body element. */
  open(title: string, html: string): HTMLElement;
  /** Keys while the panel is up (Esc always closes), and what to do when it closes. */
  hooks(keys: ((e: KeyboardEvent) => void) | null, closed: (() => void) | null): void;
}
const SYM: Record<SlotSym, string> = { cherry: '🍒', lemon: '🍋', bell: '🔔', flag: '⛳', seven: '<b class="seven">7</b>', gem: '💎' };

export async function openMachine(host: VltHost, id: string) {
  const mc = MACHINES.find(m => m.id === id);
  if (!mc) return;
  let cash = (await loadProgress()).cash,
    bet = mc.bets[0];
  const pay = (d: number) => {
    cash += d;
    void addCash(d);
  };
  const betRow = () =>
    `<div class="vbets">${mc.bets.map((b, i) => `<button data-bet="${b}" class="${b === bet ? 'on' : ''}">${money(b)}<kbd>${i + 1}</kbd></button>`).join('')}</div>`;
  if (mc.kind === 'slots') {
    const body = host.open(
      mc.name,
      `<div class="vlt"><div class="vcash"></div>
        <div class="reels"><div class="reel"></div><div class="reel"></div><div class="reel"></div></div>
        <div class="vmsg">Three of a kind wins. Cherries from the left always pay.</div>
        ${betRow()}
        <button class="vgo primary">Spin <kbd>Space</kbd></button>
        <div class="vpays">${[...SLOT_SYMS]
          .reverse()
          .map(s => `<span>${SYM[s]}${SYM[s]}${SYM[s]} <b>×${SLOT_THREE[s]}</b></span>`)
          .join('')}<span>🍒🍒 <b>×${SLOT_TWO_CHERRIES}</b></span><span>🍒 <b>bet back</b></span></div></div>`,
    );
    const reels = [...body.querySelectorAll<HTMLElement>('.reel')],
      msg = body.querySelector<HTMLElement>('.vmsg')!,
      go = body.querySelector<HTMLButtonElement>('.vgo')!,
      cashEl = body.querySelector<HTMLElement>('.vcash')!;
    let busy = false,
      shown = cash,
      timer = 0;
    const draw = () => {
      cashEl.textContent = `Cash ${money(shown)}`;
      body.querySelectorAll<HTMLButtonElement>('[data-bet]').forEach(b => b.classList.toggle('on', +b.dataset.bet! === bet));
      go.disabled = busy;
    };
    const rndSym = () => slotStop(Math.random());
    reels.forEach(r => (r.innerHTML = SYM[rndSym()]));
    const spin = () => {
      if (busy) return;
      if (cash < bet) {
        msg.textContent = "You can't cover that bet.";
        playSample('error', 0.5);
        return;
      }
      const stops = [rndSym(), rndSym(), rndSym()] as [SlotSym, SlotSym, SlotSym],
        win = slotPay(...stops) * bet;
      pay(win - bet); // settled now, so closing the panel mid-spin changes nothing
      busy = true;
      shown -= bet;
      msg.textContent = '…';
      msg.className = 'vmsg';
      draw();
      const t0 = performance.now(),
        done = [false, false, false];
      reels.forEach(r => r.classList.add('spin'));
      timer = window.setInterval(() => {
        const t = performance.now() - t0;
        reels.forEach((r, i) => {
          if (done[i]) return;
          if (t > 650 + i * 420) {
            done[i] = true;
            r.innerHTML = SYM[stops[i]];
            r.classList.remove('spin');
            playSample('tick', 0.5);
          } else r.innerHTML = SYM[rndSym()];
        });
        if (done[2]) {
          clearInterval(timer);
          busy = false;
          shown = cash;
          if (win > bet) {
            msg.textContent = `${money(win)}!`;
            msg.className = 'vmsg win';
            playSample(win >= bet * 18 ? 'win' : 'confirm', 0.6);
          } else msg.textContent = win ? 'Cherry. Bet back.' : 'No luck.';
          draw();
        }
      }, 70);
    };
    go.onclick = spin;
    body.querySelectorAll<HTMLButtonElement>('[data-bet]').forEach(
      b =>
        (b.onclick = () => {
          if (!busy) bet = +b.dataset.bet!;
          draw();
        }),
    );
    host.hooks(
      e => {
        if (e.code === 'Space' || e.code === 'Enter') spin();
        const n = +e.key - 1;
        if (!busy && mc.bets[n]) {
          bet = mc.bets[n];
          draw();
        }
      },
      () => clearInterval(timer),
    );
    draw();
    return;
  }
  // ---- video poker
  const body = host.open(
    mc.name,
    `<div class="vlt"><div class="vcash"></div>
      <div class="vpays poker">${POKER_PAYS.map(p => `<span data-h="${p[0]}">${p[1]} <b>×${p[2]}</b></span>`).join('')}</div>
      <div class="vcards"></div>
      <div class="vmsg">Jacks or better. Deal, keep what you like, draw once.</div>
      ${betRow()}
      <button class="vgo primary">Deal <kbd>Space</kbd></button></div>`,
  );
  const cardsEl = body.querySelector<HTMLElement>('.vcards')!,
    msg = body.querySelector<HTMLElement>('.vmsg')!,
    go = body.querySelector<HTMLButtonElement>('.vgo')!,
    cashEl = body.querySelector<HTMLElement>('.vcash')!;
  let deck: number[] = [],
    hand: number[] = [],
    held = [false, false, false, false, false],
    phase: 'bet' | 'hold' = 'bet';
  const card = (c: number, i: number) => {
    const r = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'][c % 13],
      s = Math.floor(c / 13);
    return `<button class="vcard ${s === 1 || s === 2 ? 'red' : ''} ${held[i] ? 'held' : ''}" data-i="${i}"><i>${r}</i><u>${'♠♥♦♣'[s]}</u><em>HELD</em><kbd>${i + 1}</kbd></button>`;
  };
  const draw = (result = '') => {
    cashEl.textContent = `Cash ${money(cash)}`;
    cardsEl.innerHTML = hand.length ? hand.map(card).join('') : Array(5).fill('<div class="vcard back"></div>').join('');
    cardsEl.querySelectorAll<HTMLButtonElement>('[data-i]').forEach(b => (b.onclick = () => hold(+b.dataset.i!)));
    body.querySelectorAll<HTMLButtonElement>('[data-bet]').forEach(b => {
      b.classList.toggle('on', +b.dataset.bet! === bet);
      b.disabled = phase === 'hold';
    });
    body.querySelectorAll<HTMLElement>('[data-h]').forEach(s => s.classList.toggle('on', s.dataset.h === result));
    go.innerHTML = `${phase === 'bet' ? 'Deal' : 'Draw'} <kbd>Space</kbd>`;
  };
  const hold = (i: number) => {
    if (phase !== 'hold') return;
    held[i] = !held[i];
    playSample('select', 0.4);
    draw(pokerHand(hand));
  };
  const settle = () => {
    const h = pokerHand(hand),
      win = pokerPay(h) * bet;
    phase = 'bet';
    if (win) pay(win);
    return { h, win };
  };
  const act = () => {
    if (phase === 'bet') {
      if (cash < bet) {
        msg.textContent = "You can't cover that bet.";
        playSample('error', 0.5);
        return;
      }
      pay(-bet);
      deck = pokerDeck(Math.random);
      hand = deck.splice(0, 5);
      held = [false, false, false, false, false];
      phase = 'hold';
      msg.className = 'vmsg';
      msg.textContent = 'Click the cards to keep (or press 1–5), then draw.';
      playSample('drop', 0.5);
      draw(pokerHand(hand));
    } else {
      hand = hand.map((c, i) => (held[i] ? c : deck.shift()!));
      held = [false, false, false, false, false];
      const { h, win } = settle();
      const name = POKER_PAYS.find(p => p[0] === h)?.[1];
      msg.textContent = win ? `${name}: ${money(win)}!` : 'Nothing this time.';
      msg.className = win > bet ? 'vmsg win' : 'vmsg';
      if (win) playSample(win >= bet * 9 ? 'win' : 'confirm', 0.6);
      draw(h);
    }
  };
  go.onclick = act;
  body.querySelectorAll<HTMLButtonElement>('[data-bet]').forEach(
    b =>
      (b.onclick = () => {
        if (phase === 'bet') bet = +b.dataset.bet!;
        draw();
      }),
  );
  host.hooks(
    e => {
      if (e.code === 'Space' || e.code === 'Enter') act();
      const n = +e.key - 1;
      if (n >= 0 && n < 5 && phase === 'hold') hold(n);
      else if (phase === 'bet' && mc.bets[n]) {
        bet = mc.bets[n];
        draw();
      }
    },
    () => {
      if (phase === 'hold') settle(); // walked away mid-hand: the cards on the table stand
    },
  );
  draw();
}
