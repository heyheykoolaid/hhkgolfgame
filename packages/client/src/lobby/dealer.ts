// The Street Dealer (design/street-dealer-economy.md): leans on a crate at the plaza's south-east corner until Dealer
// Alley exists. E opens the sell menu: your stash by strain + quality, a quantity, the full price breakdown, and a
// hold-to-confirm sale. Prices are shared/src/grow.ts (Option B: the 55–175% clamp applies to the market part only;
// quality multiplies on top). Supply pressure is fixed at "normal" until the lobby has shared market state.
import * as THREE from 'three';
import { STRAIN, QUALITY, unitPrice, preferredStrain } from '@gh/shared';
import { Golfer } from '../characters/golfer';
import { sanitizeLook } from '../avatar/outfit';
import { progress, sellProduct, loadProgress, buySupply } from '../avatar/progress';
export const PAPERS_PRICE = 15,
  GRINDER_PRICE = 120;
import { M, box, groundY } from './world';

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** In the alley on the West Side, between the Lucky Lie Lounge and Grow Supply (lobby/westside.ts). He buys; the
 *  store next door sells. */
export const DEALER_POS = new THREE.Vector3(-88.5, 0, 6.2),
  DEALER_YAW = 0.25;

export function createDealer(scene: THREE.Scene, host: { toast(html: string, ms?: number): void; onClose(): void; sfx?: (n: string) => void }) {
  // the man himself: hoodie, dark cap, leaning by a crate
  const look = sanitizeLook({
    skin: '#7a4e32',
    hair: '#141010',
    shirt: '#3a3f47',
    print: '#3a3f47',
    pants: '#26282c',
    shoes: '#e8e2d4',
    sole: '#e8e2d4',
    cap: '#151517',
    capStyle: 'front',
    stubble: true,
    ball: 'white',
  } as any);
  const npc = new Golfer(look);
  npc.root.position.copy(DEALER_POS).setY(groundY(DEALER_POS.x, DEALER_POS.z));
  npc.root.rotation.y = DEALER_YAW;
  scene.add(npc.root);
  const crate = new THREE.Group();
  crate.add(box(0.7, 0.55, 0.55, M('#7a5a36', 0.9), 0, 0.275, 0), box(0.72, 0.05, 0.57, M('#5a4026', 0.9), 0, 0.3, 0));
  crate.position.set(DEALER_POS.x + 0.55, groundY(DEALER_POS.x, DEALER_POS.z), DEALER_POS.z + 0.35);
  crate.rotation.y = 0.5;
  scene.add(crate);
  const tag = document.createElement('div');
  tag.className = 'ntag dealer';
  tag.textContent = 'Street Dealer';
  (document.getElementById('ltags') || document.body).appendChild(tag);

  // ---- sell menu
  const ui = document.createElement('div');
  ui.id = 'ldealer';
  ui.className = 'hidden';
  (document.getElementById('lobbyui') || document.body).appendChild(ui);
  let sel = 0,
    qty = 0,
    holding = 0,
    holdT = 0,
    openNow = false,
    html = '';
  const stacks = () =>
    progress()
      .product.slice()
      .sort((a, b) => a.s.localeCompare(b.s) || b.q - a.q);
  function render() {
    const list = stacks(),
      pref = preferredStrain(),
      pn = STRAIN.get(pref)?.name || '';
    if (sel >= list.length) sel = 0;
    const st = list[sel];
    if (st) qty = Math.max(1, Math.min(st.n, qty || st.n));
    let h = `<div class="card"><button class="x" data-close>✕</button><h2>Street Dealer</h2><div class="sub">"What you got for me?" · Today he wants <b>${esc(pn)}</b> <span class="pref">+22%</span></div>`;
    if (!list.length)
      h += `<div class="dl-empty">"Nothing? Come back when you've harvested something."<br><span>Grow gear is in Build Mode (<kbd>B</kbd> on your lot) under <b>Grow</b>.</span></div>`;
    else {
      h += `<div class="dl-list">${list
        .map((x, i) => {
          const u = unitPrice(x.s, x.q, 1);
          return `<button class="dl-row${i === sel ? ' on' : ''}" data-sel="${i}"><b>${esc(STRAIN.get(x.s)?.name || x.s)}</b><span class="q q${x.q}">${QUALITY[x.q]}</span><span>${x.n} units</span><em>${money(u.unit)} each</em></button>`;
        })
        .join('')}</div>`;
      const u = unitPrice(st.s, st.q, qty),
        total = Math.round(u.unit * qty);
      h += `<div class="dl-qty"><label>Sell <b>${qty}</b> of ${st.n}</label><input type="range" min="1" max="${st.n}" value="${qty}" data-qty><button data-all>All</button></div>
        <div class="dl-break">
          <div><span>Base price (${STRAIN.get(st.s)!.tier})</span><b>${money(u.base)}</b></div>
          <div><span>Quality: ${QUALITY[st.q]}</span><b>×${u.quality.toFixed(2)}</b></div>
          <div><span>Market${u.pref > 1 ? ' · preferred ×1.22' : ''}${u.bulk > 1 ? ` · bulk ×${u.bulk.toFixed(2)}` : ''}${u.clamped ? ' · capped' : ''}</span><b>×${u.market.toFixed(2)}</b></div>
          <div class="tot"><span>${money(u.unit)} per unit × ${qty}</span><b>${money(total)}</b></div></div>
        <button class="primary dl-sell" data-hold><i></i><span>Hold to sell for ${money(total)}</span> <kbd>E</kbd></button>`;
    }
    {
      const pr = progress();
      h += `<div class="dl-sup"><span>Papers and grinders are at Grow Supply, next door.</span></div>`;
    }
    h += `<div class="gfoot">Cash ${money(progress().cash)}<span>Close <kbd>Esc</kbd></span></div></div>`;
    if (h === html) return;
    html = h;
    ui.innerHTML = h;
    ui.querySelector('[data-close]')?.addEventListener('click', close);
    ui.querySelectorAll<HTMLButtonElement>('[data-sel]').forEach(
      b =>
        (b.onclick = () => {
          sel = +b.dataset.sel!;
          qty = 0;
          render();
        }),
    );
    const r = ui.querySelector<HTMLInputElement>('[data-qty]');
    if (r)
      r.oninput = () => {
        qty = +r.value;
        render();
      };
    ui.querySelector<HTMLButtonElement>('[data-all]')?.addEventListener('click', () => {
      qty = stacks()[sel]?.n || 0;
      render();
    });
    ui.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(
      b =>
        (b.onclick = async () => {
          const k = b.dataset.buy as 'papers' | 'grinder',
            ok = await buySupply(k, k === 'papers' ? PAPERS_PRICE : GRINDER_PRICE);
          host.toast(
            ok
              ? k === 'papers'
                ? '📜 20 rolling papers. "Roll responsibly." Press <kbd>J</kbd> for your stash.'
                : '⚙️ A grinder. "Smoother rolls, my friend."'
              : 'Not enough cash.',
            2600,
          );
          html = '';
          render();
        }),
    );
    const hb = ui.querySelector<HTMLButtonElement>('[data-hold]');
    if (hb) {
      hb.onpointerdown = () => {
        holding = 1;
      };
      hb.onpointerup = hb.onpointerleave = () => {
        holding = 0;
      };
    }
  }
  async function sell() {
    const st = stacks()[sel];
    if (!st || qty < 1) return;
    const n = Math.min(qty, st.n),
      total = Math.round(unitPrice(st.s, st.q, n).unit * n);
    if (!(await sellProduct(st.s, st.q, n, total))) return;
    host.sfx?.('chipsHandle');
    const line =
      st.q >= 3
        ? '"Now THAT is the good stuff."'
        : st.q === 0
          ? '"This is mid… I\'ll take it. Don\'t make it a habit."'
          : n >= 30
            ? '"You been busy, huh?"'
            : '"Pleasure doing business."';
    host.toast(`💵 Sold ${n} × ${esc(STRAIN.get(st.s)!.name)} for <b>${money(total)}</b>. ${line}`, 3500);
    qty = 0;
    html = '';
    render();
  }
  async function open() {
    openNow = true;
    ui.classList.remove('hidden');
    html = '';
    sel = 0;
    qty = 0;
    await loadProgress();
    render();
  }
  function close() {
    openNow = false;
    holding = 0;
    holdT = 0;
    ui.classList.add('hidden');
    host.onClose();
  }
  function key(e: KeyboardEvent, down: boolean) {
    if (!down) {
      if (e.code === 'KeyE' || e.code === 'Space') holding = 0;
      return;
    }
    if (e.code === 'Escape') return close();
    if ((e.code === 'KeyE' || e.code === 'Space') && !e.repeat) {
      e.preventDefault();
      holding = 1;
    }
    if (e.code === 'ArrowLeft') {
      qty = Math.max(1, qty - 1);
      render();
    }
    if (e.code === 'ArrowRight') {
      qty = qty + 1;
      render();
    }
  }
  const _v = new THREE.Vector3();
  function update(dt: number, clock: number, camera: THREE.Camera) {
    npc.update({ mode: 'walk', speed: 0, phase: 0, time: clock, s: 0, club: 'iron', showClub: false } as any);
    _v.set(DEALER_POS.x, 2.05, DEALER_POS.z).project(camera);
    const vis = _v.z < 1 && Math.hypot(camera.position.x - DEALER_POS.x, camera.position.z - DEALER_POS.z) < 11; // close enough to be in his yard: the tag used to show through the building
    tag.style.display = vis ? '' : 'none';
    if (vis)
      tag.style.transform = `translate(${(((_v.x + 1) / 2) * innerWidth).toFixed(0)}px,${(((1 - _v.y) / 2) * innerHeight).toFixed(0)}px) translate(-50%,-100%)`;
    if (!openNow) return;
    if (holding) {
      holdT += dt;
      if (holdT >= 0.8) {
        holding = 0;
        holdT = 0;
        sell();
      }
    } else holdT = Math.max(0, holdT - dt * 3);
    const fill = ui.querySelector<HTMLElement>('.dl-sell i');
    if (fill) fill.style.width = `${Math.min(100, (holdT / 0.8) * 100)}%`;
    render();
  }
  return {
    open,
    close,
    key,
    update,
    isOpen: () => openNow,
    setVisible: (v: boolean) => {
      tag.style.display = v ? '' : 'none';
    },
  };
}
