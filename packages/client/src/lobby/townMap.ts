// The town map (M): a drawn plan of the whole place with a dot where you are.
// Split out of lobby/lobby.ts.
import { $ } from '../ui/dom';
import { LOTS, HALF, BOUND, FUN, WEST, SHADY, type Plot } from './world';
import { STREETS } from './roads';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** What the lobby lends: its modal, your lot (if you have one) and where you are standing. */
export interface MapCtx {
  openModal: (title: string, html: string) => void;
  my: () => Plot | null;
  where: () => { x: number; z: number };
}
export function createTownMap(ctx: MapCtx) {
  const { openModal } = ctx;
  // ---------------- the town map (M) ----------------
  function openMap() {
    const MY = ctx.my(),
      P = ctx.where();
    const c = document.createElement('canvas'),
      S = 3.1, // pixels per metre
      X0 = -156,
      Z0 = -96,
      W = 336,
      Hh = 158;
    c.width = Math.round(W * S);
    c.height = Math.round(Hh * S);
    const x = c.getContext('2d')!,
      px = (wx: number) => (wx - X0) * S,
      pz = (wz: number) => (wz - Z0) * S,
      rect = (x0: number, z0: number, x1: number, z1: number, fill: string) => {
        x.fillStyle = fill;
        x.fillRect(px(x0), pz(z0), (x1 - x0) * S, (z1 - z0) * S);
      },
      label = (t: string, wx: number, wz: number, size = 15, col = '#fff7e0') => {
        x.font = `800 ${size}px "Barlow Condensed", Inter, sans-serif`;
        x.textAlign = 'center';
        x.lineJoin = 'round';
        x.lineWidth = 4;
        x.strokeStyle = 'rgba(20,14,8,.85)';
        x.strokeText(t, px(wx), pz(wz));
        x.fillStyle = col;
        x.fillText(t, px(wx), pz(wz));
      };
    rect(X0, Z0, X0 + W, Z0 + Hh, '#6f7a45'); // meadow
    rect(-BOUND, -BOUND, BOUND, BOUND, '#7f8a52'); // the town
    rect(BOUND, -FUN.z, FUN.x1, FUN.z, '#86905a'); // Fun Land
    rect(WEST.x0, WEST.z0, WEST.x1, WEST.z1, '#86905a'); // the West Side, up its rise
    rect(WEST.x1, 8, -BOUND, 20, '#86905a');
    // streets
    rect(BOUND, -17, 104, -10.5, '#55524c');
    rect(-140, 10.5, -BOUND, 17.5, '#55524c');
    rect(-124, 20, -78, 35, '#4c4a45');
    rect(-9.5, -9.5, 9.5, 9.5, '#c9bca4'); // plaza
    for (const l of LOTS) rect(l.cx - HALF, l.cz - HALF, l.cx + HALF, l.cz + HALF, '#a79a7c');
    if (MY) rect(MY.cx - HALF, MY.cz - HALF, MY.cx + HALF, MY.cz + HALF, '#e2b23a');
    // places
    rect(54, -4, 64, 4, '#c8452f');
    rect(73.5, -47.6, 104, -17.4, '#2f8a5a');
    rect(76, 13, 81, 45, '#3a5a6a');
    rect(81, 13, 172, 45, '#7c9a45');
    x.strokeStyle = '#3a3835';
    x.lineWidth = 7 * S * 0.5;
    x.beginPath();
    x.roundRect(px(109), pz(-43), (166 - 109) * S, 35 * S, 20);
    x.stroke();
    rect(-92, -5, -76, 8, '#ece6d8');
    // Shady Lane: its ground, the lane, the road through it, and the pawn shop, Grow Supply and the lounge
    rect(SHADY.x0, SHADY.z0, SHADY.x1, SHADY.z1, '#86905a');
    for (const t of STREETS) {
      const a = Math.max(t.a, t.v ? Z0 : X0);
      if (t.v) rect(t.c - t.hw, a, t.c + t.hw, t.b, '#55524c');
      else rect(a, t.c - t.hw, t.b, t.c + t.hw, '#55524c');
    }
    rect(-15.6, -86.5, -6, -74.4, '#6d5a3c');
    rect(6, -86.5, 20, -74.4, '#4f7a4a');
    rect(24, -90.4, 36.2, -74.4, '#5a3a30');
    x.fillStyle = '#d8d2c4';
    x.beginPath();
    x.arc(px(-136), pz(-1), 2.8 * S, 0, 7);
    x.fill();
    label('PLAZA', 0, 1.5, 16);
    label('tee times · pro shop', 0, 7, 11, '#f1e6c8');
    label('▲ TO THE COURSE', 0, -92, 13, '#cfe8b0');
    label('Fairway Loop', -27, 40.8, 10, '#d8d2c4');
    label('FUN LAND', 110, 6, 20, '#ffd27a');
    label('Birdie Burger', 59, -6.5, 12);
    label('Mini putt', 89, -31, 13);
    label('Go-karts', 138, -22, 13);
    label('Driving range', 122, 30, 13);
    label('WEST SIDE', -101, 29.5, 20, '#ffd27a');
    label('Clubhouse', -79, -7, 13);
    label('SHADY LANE', 8, -55.5, 17, '#ffd27a');
    label('Pawn', -11, -89, 12);
    label('Grow Supply', 13, -89, 12);
    label('Lounge', 31, -93, 12);
    label('Dealer', 22, -78, 10, '#f1e6c8');
    if (MY) label('YOUR LOT', MY.cx, MY.cz + HALF + 4.5, 12, '#ffe9a8');
    // you
    x.fillStyle = '#ff5a4a';
    x.strokeStyle = '#fff';
    x.lineWidth = 3;
    x.beginPath();
    x.arc(px(clamp(P.x, X0 + 3, X0 + W - 3)), pz(clamp(P.z, Z0 + 3, Z0 + Hh - 3)), 7, 0, 7);
    x.fill();
    x.stroke();
    openModal(
      'Town map',
      `<img src="${c.toDataURL('image/jpeg', 0.9)}" alt="" style="width:100%;border-radius:12px;display:block"><p class="muted" style="margin-top:8px">The red dot is you. North is up.</p>`,
    );
    $('lmodal').querySelector('.card')?.classList.add('mapcard');
  }
  return { openMap };
}
