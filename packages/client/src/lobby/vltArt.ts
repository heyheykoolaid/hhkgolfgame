// Printed artwork for the lounge's machines (lobby/vlt.ts), drawn on canvases: the lit marquee, the backlit belly glass
// and service door, the cabinet's painted sides, the lacquered body and the labelled button deck.
import * as THREE from 'three';

interface Art {
  kind: 'slots' | 'poker';
  name: string;
  bets: number[];
  color: string;
}
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
function tex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  draw(x);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const shade = (c: string, k: number) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
const lift = (c: string, k: number) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString();
function rays(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, n: number, a: string, b: string) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = i % 2 ? a : b;
    x.beginPath();
    x.moveTo(cx, cy);
    x.arc(cx, cy, r, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
    x.fill();
  }
}
function bulbs(x: CanvasRenderingContext2D, w: number, h: number, inset: number, step: number) {
  const dot = (px: number, py: number, i: number) => {
    x.fillStyle = i % 2 ? '#fff6d0' : '#ffc94a';
    x.beginPath();
    x.arc(px, py, step * 0.2, 0, 7);
    x.fill();
  };
  let i = 0;
  for (let px = inset; px <= w - inset + 1; px += step) (dot(px, inset, i), dot(px, h - inset, i++));
  for (let py = inset + step; py < h - inset; py += step) (dot(inset, py, i), dot(w - inset, py, i++));
}
function outlined(x: CanvasRenderingContext2D, t: string, px: number, py: number, fill: string, edge: string, lw: number) {
  x.lineJoin = 'round';
  x.lineWidth = lw;
  x.strokeStyle = edge;
  x.strokeText(t, px, py);
  x.fillStyle = fill;
  x.fillText(t, px, py);
}
function fit(x: CanvasRenderingContext2D, t: string, font: (px: number) => string, px: number, maxW: number) {
  x.font = font(px);
  const w = x.measureText(t).width;
  if (w > maxW) x.font = font(Math.floor((px * maxW) / w));
}
function playingCard(x: CanvasRenderingContext2D, r: string, suit: string, px: number, py: number, w: number, rot: number) {
  const h = w * 1.4;
  x.save();
  x.translate(px, py);
  x.rotate(rot);
  x.fillStyle = '#f8f3e4';
  x.strokeStyle = '#1d1d1f';
  x.lineWidth = 3;
  x.beginPath();
  x.roundRect(-w / 2, -h, w, h, w * 0.1);
  x.fill();
  x.stroke();
  x.fillStyle = suit === '♥' || suit === '♦' ? '#c8322c' : '#1d1d1f';
  x.font = `800 ${w * 0.42}px Georgia, serif`;
  x.fillText(r, 0, -h * 0.68);
  x.font = `${w * 0.5}px serif`;
  x.fillText(suit, 0, -h * 0.32);
  x.restore();
}

/** The lit sign over the machine: its name in show lettering inside a ring of bulbs. */
export const marqueeArt = (d: Art) =>
  tex(768, 240, x => {
    const g = x.createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, lift(d.color, 0.25));
    g.addColorStop(1, shade(d.color, 0.45));
    x.fillStyle = g;
    x.fillRect(0, 0, 768, 240);
    x.save();
    x.globalAlpha = 0.22;
    rays(x, 384, 300, 620, 28, '#ffffff', 'rgba(0,0,0,0)');
    x.restore();
    x.strokeStyle = '#f3d37a';
    x.lineWidth = 6;
    x.strokeRect(34, 34, 700, 172);
    bulbs(x, 768, 240, 17, 30.6);
    const font = (px: number) => `900 italic ${px}px Georgia, "Times New Roman", serif`;
    fit(x, d.name.toUpperCase(), font, 86, 640);
    outlined(x, d.name.toUpperCase(), 388, 112, '#1a0f0a', '#1a0f0a', 16);
    outlined(x, d.name.toUpperCase(), 384, 106, '#fff3c4', '#7a2a12', 7);
    x.font = '800 30px Inter, system-ui, sans-serif';
    x.fillStyle = '#ffe9a8';
    x.fillText(d.bets.map(money).join('   ·   '), 384, 176);
  });

/** The cabinet's whole front below the deck: backlit glass with the game's art, the coin tray's recess, the service door. */
export const bellyArt = (d: Art) =>
  tex(512, 568, x => {
    x.fillStyle = '#141216';
    x.fillRect(0, 0, 512, 568);
    // the glass
    x.save();
    x.beginPath();
    x.roundRect(26, 22, 460, 250, 14);
    x.clip();
    rays(x, 256, 150, 420, 24, lift(d.color, 0.18), shade(d.color, 0.62));
    const v = x.createRadialGradient(256, 150, 30, 256, 150, 300);
    v.addColorStop(0, 'rgba(255,244,200,.55)');
    v.addColorStop(1, 'rgba(0,0,0,.35)');
    x.fillStyle = v;
    x.fillRect(0, 0, 512, 300);
    if (d.kind === 'slots') {
      x.font = '900 150px Georgia, serif';
      for (const [dx, rot] of [
        [-118, -0.12],
        [0, 0],
        [118, 0.12],
      ]) {
        x.save();
        x.translate(256 + dx, 132);
        x.rotate(rot);
        outlined(x, '7', 0, 0, '#e2332b', '#fff3c4', 12);
        x.restore();
      }
      x.font = '900 34px Inter, system-ui, sans-serif';
      outlined(x, 'TRIPLE SEVENS PAY ×100', 256, 236, '#fff3c4', '#3a1408', 7);
    } else {
      const hand: [string, string][] = [
        ['10', '♠'],
        ['J', '♠'],
        ['Q', '♠'],
        ['K', '♠'],
        ['A', '♠'],
      ];
      hand.forEach(([r, s], i) => playingCard(x, r, s, 256 + (i - 2) * 16, 262, 92, (i - 2) * 0.24));
      x.font = '900 32px Inter, system-ui, sans-serif';
      outlined(x, 'JACKS OR BETTER', 256, 244, '#fff3c4', '#10202c', 7);
    }
    x.restore();
    x.strokeStyle = '#c9c4b6';
    x.lineWidth = 6;
    x.beginPath();
    x.roundRect(26, 22, 460, 250, 14);
    x.stroke();
    // the tray's recess (the chrome tray itself is a real part in front of it)
    x.fillStyle = '#050506';
    x.beginPath();
    x.roundRect(120, 300, 272, 78, 10);
    x.fill();
    x.strokeStyle = '#6a665e';
    x.lineWidth = 4;
    x.stroke();
    // the service door: a panel line, a lock, a bill slot with its green lamp, a vent
    x.strokeStyle = '#2c2a30';
    x.lineWidth = 4;
    x.strokeRect(40, 402, 432, 146);
    x.fillStyle = '#c9c4b6';
    x.beginPath();
    x.arc(430, 475, 13, 0, 7);
    x.fill();
    x.fillStyle = '#1d1d1f';
    x.fillRect(427, 466, 6, 18);
    x.fillStyle = '#0a0a0c';
    x.beginPath();
    x.roundRect(72, 432, 150, 22, 6);
    x.fill();
    x.fillStyle = '#58e08a';
    x.fillRect(80, 440, 134, 6);
    x.font = '700 15px Inter, system-ui, sans-serif';
    x.fillStyle = '#9a968c';
    x.fillText('INSERT BILLS', 147, 474);
    x.fillStyle = '#0a0a0c';
    for (let i = 0; i < 7; i++) x.fillRect(250 + i * 20, 430, 10, 96);
    x.fillStyle = shade(d.color, 0.9);
    x.fillRect(40, 388, 432, 6);
  });

/** A painted side: pinstripes, a big emblem, the game's name running up it. */
export const sideArt = (d: Art) =>
  tex(256, 832, x => {
    const g = x.createLinearGradient(0, 0, 0, 832);
    g.addColorStop(0, lift(d.color, 0.08));
    g.addColorStop(1, shade(d.color, 0.5));
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 832);
    x.save();
    x.globalAlpha = 0.16;
    x.strokeStyle = '#000';
    x.lineWidth = 14;
    for (let i = -900; i < 400; i += 44) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i + 832, 832);
      x.stroke();
    }
    x.restore();
    x.strokeStyle = '#f3d37a';
    x.lineWidth = 5;
    x.strokeRect(16, 16, 224, 800);
    x.lineWidth = 2;
    x.strokeRect(26, 26, 204, 780);
    // the emblem
    x.save();
    x.translate(128, 200);
    x.fillStyle = '#f3d37a';
    x.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 ? 44 : 84,
        a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    x.fill();
    x.fillStyle = shade(d.color, 0.55);
    x.beginPath();
    x.arc(0, 0, 50, 0, 7);
    x.fill();
    x.font = d.kind === 'slots' ? '900 74px Georgia, serif' : '64px serif';
    outlined(x, d.kind === 'slots' ? '7' : '♠', 0, 4, '#fff3c4', '#1a0f0a', 6);
    x.restore();
    x.save();
    x.translate(128, 560);
    x.rotate(-Math.PI / 2);
    const font = (px: number) => `900 italic ${px}px Georgia, serif`;
    fit(x, d.name.toUpperCase(), font, 64, 440);
    outlined(x, d.name.toUpperCase(), 0, 0, '#fff3c4', '#1a0f0a', 8);
    x.restore();
    // scuffs along the bottom, where shoes and trolleys catch it
    x.globalAlpha = 0.25;
    x.fillStyle = '#000';
    for (let i = 0; i < 40; i++) x.fillRect((i * 97) % 256, 760 + ((i * 53) % 70), 14 + ((i * 31) % 30), 2);
    x.globalAlpha = 1;
  });

/** Lacquered cabinet paint for the body's other faces: the colour, a soft sheen and a fine speckle. */
export const bodyArt = (d: Art) =>
  tex(128, 128, x => {
    const g = x.createLinearGradient(0, 0, 128, 128);
    g.addColorStop(0, lift(d.color, 0.1));
    g.addColorStop(0.5, d.color);
    g.addColorStop(1, shade(d.color, 0.7));
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) {
      x.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.07)';
      x.fillRect((i * 73) % 128, (i * 41) % 128, 1.5, 1.5);
    }
  });

/** The button deck seen from above: brushed metal, a label by every button, a coin slot, the house's small print.
 *  (The canvas's top edge is the back of the deck; the buttons stand 0.22 m forward of its middle.) */
export const deckArt = (d: Art) =>
  tex(512, 512, x => {
    x.fillStyle = '#1b1a1e';
    x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 512; i += 2) {
      x.fillStyle = `rgba(255,255,255,${0.012 + ((i * 37) % 9) * 0.004})`;
      x.fillRect(0, i, 512, 1);
    }
    x.strokeStyle = '#c9c4b6';
    x.lineWidth = 5;
    x.strokeRect(10, 150, 492, 352);
    x.strokeStyle = shade(d.color, 1);
    x.lineWidth = 3;
    x.strokeRect(20, 160, 472, 332);
    const ring = (px: number, r: number, c: string) => {
      x.strokeStyle = c;
      x.lineWidth = 4;
      x.beginPath();
      x.arc(px, 404, r, 0, 7);
      x.stroke();
    };
    x.font = '800 19px Inter, system-ui, sans-serif';
    x.fillStyle = '#e9e4d4';
    [
      ['BET −', 76],
      ['BET +', 152],
      ['MAX', 228],
    ].forEach(([t, px]) => {
      ring(px as number, 31, '#8a867c');
      x.fillText(t as string, px as number, 352);
    });
    if (d.kind === 'poker') {
      ring(394, 50, '#c8452f');
      x.font = '900 22px Inter, system-ui, sans-serif';
      x.fillStyle = '#ffd27a';
      x.fillText('DEAL · DRAW', 394, 336);
    } else {
      x.font = '900 24px Inter, system-ui, sans-serif';
      x.fillStyle = '#ffd27a';
      x.fillText('PULL THE LEVER  ➜', 380, 404);
    }
    // the plate behind the buttons
    x.font = '900 italic 30px Georgia, serif';
    x.fillStyle = lift(d.color, 0.45);
    x.fillText(d.name.toUpperCase(), 256, 205);
    x.font = '700 17px Inter, system-ui, sans-serif';
    x.fillStyle = '#9a968c';
    x.fillText(
      d.kind === 'slots' ? '💎 ×500   7 ×100   ⛳ ×35   🔔 ×18   🍋 ×10   🍒 ×6' : 'ROYAL ×800 · STR FLUSH ×50 · FOUR ×25 · FULL HOUSE ×9 · FLUSH ×6',
      256,
      250,
    );
    x.fillText(`BETS ${d.bets.map(money).join(' / ')}  ·  THE LUCKY LIE LOUNGE`, 256, 284);
  });

/** A stool's seat: buttoned oxblood leather with piping. */
export const seatArt = () =>
  tex(128, 128, x => {
    const g = x.createRadialGradient(64, 64, 6, 64, 64, 64);
    g.addColorStop(0, '#8a2a36');
    g.addColorStop(1, '#4e141d');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(0,0,0,.35)';
    x.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      x.beginPath();
      x.moveTo(64, 64);
      x.lineTo(64 + Math.cos((i / 8) * 6.283) * 64, 64 + Math.sin((i / 8) * 6.283) * 64);
      x.stroke();
    }
    x.fillStyle = '#d9b45a';
    x.beginPath();
    x.arc(64, 64, 7, 0, 7);
    x.fill();
    x.strokeStyle = '#d9b45a';
    x.lineWidth = 4;
    x.beginPath();
    x.arc(64, 64, 58, 0, 7);
    x.stroke();
  });
