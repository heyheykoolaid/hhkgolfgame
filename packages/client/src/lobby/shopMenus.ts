// The shops' counters: what opens when you press E at Grow Supply, the Pro Shop, Lucky Pawn, Wrench & Ride Auto and
// Homestead Furniture. Each is a panel in the lobby's modal; all spending goes through avatar/progress.ts.
// Split out of lobby/lobby.ts, which lends it the modal and a few helpers.
import { $, esc, money } from '../ui/dom';
import { playSample } from '../audio/samples';
import { invIcon } from './invIcons';
import {
  loadProgress,
  progress,
  buyItem,
  setTrail,
  setCar,
  paintCar,
  fitPart,
  sellTrophy,
  isPlaced,
  addItem,
  repairCar,
  payImpound,
} from '../avatar/progress';
import { repairPrice } from '../vehicles/wear';
import { DECKS, BOARD_PRICE } from '../vehicles/skateboard';
import { NOVELTY } from '../golf/novelty';
import { lizardCardCanvas } from './lizardCard';
import type { Outfit } from '../characters/golfer';
/** Vanity club sets (Pro Shop): owned as items, worn in your look so everyone sees them. */
export const CLUB_SET_SHOP = [
  {
    id: 'gold',
    item: 'cgold',
    name: 'Solid gold set',
    price: 25000,
    desc: 'Every club in polished gold. Glints in the evening sun, and rings like a bell on a PERFECT strike.',
    sw: 'linear-gradient(135deg,#fff1b0,#d9a93a 45%,#8a5d10)',
  },
  {
    id: 'diamond',
    item: 'cdiamond',
    name: 'Diamond set',
    price: 60000,
    desc: 'Heads and shafts cut from something that is definitely diamond. Same ring on a PERFECT strike, higher.',
    sw: 'linear-gradient(135deg,#ffffff,#bfe9ff 45%,#6fb4e0)',
  },
];
import { objectImage } from '../world/trophy';
import { TRAILS } from '../avatar/trails';
import { ITEMS, loadItemModels } from './catalog';
import { thumb } from './build';
import { PAPERS_PRICE, GRINDER_PRICE } from './dealer';
import { cartModel, CARS, CAR, CAR_PAINTS, CAR_PARTS, CAR_RIMS, carModel, loadCarKit } from '../vehicles/vehicles';

/** What the lobby lends: its message line, its modal, and the picture of a trophy. */
export interface ShopCtx {
  /** what you're wearing, and a way to change part of it (vanity club sets) */
  look: () => Outfit;
  patchLook: (p: Partial<Outfit>) => void;
  toast: (html: string, ms?: number) => void;
  openModal: (title: string, html: string) => void;
  trophyPic: (seed: number, n: 3 | 9, sub?: string, px?: number) => string;
}
export function createShopMenus(ctx: ShopCtx) {
  const { toast, openModal, trophyPic } = ctx;
  // ---------------- Grow Supply (Shady Lane): the shop counter ----------------
  /** A shop counter: goods as cards with a picture, what they do, the price and how many you have. */
  interface Good {
    id: string;
    icon: string;
    name: string;
    desc: string;
    price: number;
    have: string;
    sold?: boolean;
    group: string;
    /** sold as counted items (progress().items) instead of gear: how many come for the price */
    item?: number;
  }
  async function openShop(title: string, keeper: string, goods: (pr: Awaited<ReturnType<typeof loadProgress>>) => Good[], note = '') {
    const pr = await loadProgress(),
      list = goods(pr),
      groups = [...new Set(list.map(g => g.group))];
    openModal(
      title,
      `<div class="shop"><div class="shophead"><p class="muted">${keeper}</p><div class="shopcash">Cash <b>${money(pr.cash)}</b></div></div>
       ${groups.length > 4 ? `<div class="aisles" style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 2px">${groups.map((gr, i) => `<button class="chip" data-aisle="${i}">${gr}</button>`).join('')}</div>` : ''}
       ${groups
         .map(
           (gr, gi) =>
             `<h3 data-aisle-h="${gi}">${gr}</h3><div class="goods">${list
               .filter(g => g.group === gr)
               .map(
                 g => `<div class="good"><div class="gi">${g.icon}</div><div class="gt"><b>${g.name}</b><p>${g.desc}</p><em>${g.have}</em></div>
                 <button data-buy="${g.id}" ${g.sold || pr.cash < g.price ? 'disabled' : ''}>${g.sold ? 'Owned' : money(g.price)}</button></div>`,
               )
               .join('')}</div>`,
         )
         .join('')}
       ${note ? `<p class="muted" style="margin-top:10px">${note}</p>` : ''}</div>`,
    );
    $('lmodal').querySelector('.card')?.classList.add('wide');
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-aisle]')
      .forEach(
        b =>
          (b.onclick = () =>
            $('lmodal').querySelector(`[data-aisle-h="${b.dataset.aisle}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })),
      );
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-buy]')
      .forEach(
        b =>
          (b.onclick = async () => {
            const g = list.find(x => x.id === b.dataset.buy)!,
              r = g.item ? await addItem(g.id, g.item, g.price) : await buyItem(g.id, g.price);
            playSample(r === 'ok' ? 'confirm' : 'error', 0.5);
            if (r !== 'ok')
              toast(
                r === 'full' ? 'Your inventory is full (32 slots).' : r === 'have' ? 'You already have one.' : "You can't afford that right now.",
              );
            else {
              const sc = $('lmodal').querySelector('.card')?.scrollTop || 0;
              await openShop(title, keeper, goods, note);
              const c = $('lmodal').querySelector('.card');
              if (c) c.scrollTop = sc;
            }
          }),
      );
  }
  /** The pro shop (West Side): ball trails for now. Club skins and club effects are to come. */
  const curDeck = () => {
    try {
      return localStorage.getItem('gh.deck') || 'natural';
    } catch {
      return 'natural';
    }
  };
  let armedSet = '';
  async function openProShop() {
    const pr = await loadProgress(),
      wearing = ctx.look().clubs || '';
    openModal(
      'Pro Shop',
      `<div class="shop"><div class="shophead"><p class="muted">"Everything for the golfer who has everything, and a few things for the golfer who doesn't."</p><div class="shopcash">Cash <b>${money(pr.cash)}</b></div></div>
       <h3>Ball trails</h3><div class="goods">${TRAILS.map(t => {
         const own = !t.id || pr.trails.includes(t.id),
           on = pr.trail === t.id;
         return `<div class="good"><div class="gi"><span class="trail" style="background:${t.color === 'rainbow' ? 'linear-gradient(90deg,#ff4f4f,#ffd24a,#9cff3a,#8fe3ff,#ff4fc3)' : t.color}"></span></div><div class="gt"><b>${t.name}</b><p>${t.desc}</p><em>${on ? 'In use' : own ? 'Owned' : ''}</em></div>
           <button data-trail="${t.id}" ${on || (!own && pr.cash < t.price) ? 'disabled' : ''}>${on ? 'In use' : own ? 'Use' : money(t.price)}</button></div>`;
       }).join('')}</div>
       <p class="muted" style="margin-top:10px">A trail is the line your ball draws through the air on every course. Others don't see yours yet.</p>
       <h3>Novelty balls</h3><div class="goods">${NOVELTY.map(
         n => `<div class="good"><div class="gi" style="font-size:30px">${n.icon}</div><div class="gt"><b>${n.name}</b><p>${n.desc} One shot each: on the course, <kbd>X</kbd> picks it for your next shot.</p><em>${pr.items[n.item] ? `You have ${pr.items[n.item]}` : ''}</em></div>
           <button data-nov="${n.k}" ${pr.cash < n.price ? 'disabled' : ''}>3 for ${money(n.price)}</button></div>`,
       ).join('')}</div>
       <h3>Club sets</h3><div class="goods">
         <div class="good"><div class="gi"><span class="trail" style="background:linear-gradient(135deg,#eef0f2,#aeb3b9)"></span></div><div class="gt"><b>Steel</b><p>The clubs you started with. Honest.</p><em>${wearing ? '' : 'In use'}</em></div>
           <button data-set="" ${wearing ? '' : 'disabled'}>${wearing ? 'Use' : 'In use'}</button></div>
         ${CLUB_SET_SHOP.map(c => {
           const own = (pr.items[c.item] || 0) > 0,
             on = wearing === c.id;
           return `<div class="good"><div class="gi"><span class="trail" style="background:${c.sw}"></span></div><div class="gt"><b>${c.name}</b><p>${c.desc}</p><em>${on ? 'In use' : own ? 'Owned' : ''}</em></div>
             <button data-set="${c.id}" ${on || (!own && pr.cash < c.price) ? 'disabled' : ''}>${on ? 'In use' : own ? 'Use' : armedSet === c.id ? `Buy for ${money(c.price)}?` : money(c.price)}</button></div>`;
         }).join('')}</div>
       <h3>Skateboard</h3>${
         pr.items.board
           ? `<p class="muted">Yours. Press <kbd>K</kbd> anywhere to hop on (in town and on the course). Pick a deck:</p><div class="tg">${DECKS.map(
               d =>
                 `<button class="t${curDeck() === d.id ? ' on' : ''}" data-deck="${d.id}"><i class="sw" style="background:linear-gradient(90deg,${d.c} 60%,${d.c2} 60%)"></i>${d.name}</button>`,
             ).join('')}</div>`
           : `<div class="goods"><div class="good"><div class="gi">🛹</div><div class="gt"><b>Skateboard</b><p>Maple deck, street wheels. Push, carve, ollie, flip and grind your way round town and down the fairway. Six decks to pick from, free.</p></div>
             <button data-board ${pr.cash < BOARD_PRICE ? 'disabled' : ''}>${money(BOARD_PRICE)}</button></div></div>`
       }</div>`,
    );
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-deck]')
      .forEach(
        b =>
          (b.onclick = () => {
            try {
              localStorage.setItem('gh.deck', b.dataset.deck!);
            } catch {}
            playSample('confirm', 0.4);
            void openProShop();
          }),
      );
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-nov]')
      .forEach(
        b =>
          (b.onclick = async () => {
            const n = NOVELTY.find(x => x.k === b.dataset.nov)!,
              r = await addItem(n.item, 3, n.price);
            playSample(r === 'ok' ? 'confirm' : 'error', 0.45);
            toast(
              r === 'ok'
                ? `Three ${n.name.toLowerCase()}s. Press <kbd>X</kbd> on the course to use one.`
                : r === 'full'
                  ? 'Your inventory is full.'
                  : "You can't afford those.",
            );
            const sc = $('lmodal').querySelector('.card')?.scrollTop || 0;
            await openProShop();
            const c = $('lmodal').querySelector('.card');
            if (c) c.scrollTop = sc;
          }),
      );
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-set]')
      .forEach(
        b =>
          (b.onclick = async () => {
            const id = b.dataset.set || '',
              c = CLUB_SET_SHOP.find(x => x.id === id),
              sc = $('lmodal').querySelector('.card')?.scrollTop || 0;
            if (c && !(progress().items[c.item] > 0)) {
              if (armedSet !== id)
                armedSet = id; // (big money: click once to be asked, again to buy)
              else {
                armedSet = '';
                const r = await addItem(c.item, 1, c.price);
                playSample(r === 'ok' ? 'win' : 'error', 0.5);
                if (r !== 'ok') toast("You can't afford that set.");
                else {
                  ctx.patchLook({ clubs: id });
                  toast(`The ${c.name.toLowerCase()} is in your bag. Everyone on the course will see it.`, 3500);
                }
              }
            } else {
              ctx.patchLook({ clubs: id || undefined });
              playSample('confirm', 0.4);
            }
            await openProShop();
            const cd = $('lmodal').querySelector('.card');
            if (cd) cd.scrollTop = sc;
          }),
      );
    const bb = $('lmodal').querySelector<HTMLButtonElement>('[data-board]');
    if (bb)
      bb.onclick = async () => {
        const r = await addItem('board', 1, BOARD_PRICE);
        playSample(r === 'ok' ? 'confirm' : 'error', 0.5);
        if (r === 'ok') {
          toast('A skateboard! Press <kbd>K</kbd> to hop on. There’s a skate spot in the south meadow, inside the dirt trail.', 5000);
          void openProShop();
        } else toast("You can't afford that right now.");
      };
    $('lmodal').querySelector('.card')?.classList.add('wide');
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-trail]')
      .forEach(
        b =>
          (b.onclick = async () => {
            const t = TRAILS.find(x => x.id === b.dataset.trail)!,
              ok = await setTrail(t.id, t.price);
            playSample(ok ? 'confirm' : 'error', 0.5);
            if (ok) void openProShop();
            else toast("You can't afford that right now.");
          }),
      );
  }
  /** Homestead Furniture (West Side): everything for your lot. Bought pieces go to the lot's storage (Build Mode). */
  /** What the pawnbroker pays for a trophy: more for a championship, a bigger field and a score under par, and then
   *  his mood about that particular cup (fixed by the trophy, so it can't be re-rolled). */
  const pawnOffer = (t: { seed: number; n: number; toPar: number; field: number }) => {
    const big = t.n === 9,
      base = (big ? 6000 : 2000) * (1 + 0.25 * Math.max(0, Math.min(3, (t.field || 1) - 1))),
      under = Math.max(0, -t.toPar) * (big ? 250 : 150),
      mood = 0.88 + ((t.seed >>> 0) % 25) / 100;
    return Math.max(500, Math.round(((base + under) * mood) / 50) * 50);
  };
  /** Lucky Pawn (Shady Lane): sell trophies from your case for cash. Gone for good; not while one stands on your lot. */
  const LIZARD_PRICE = 100000;
  let lizardImg = '';
  const lizardPic = () => (lizardImg ||= lizardCardCanvas(140).toDataURL());
  async function openPawn(armed = '') {
    const pr = await loadProgress(),
      tp = (n: number) => (n === 0 ? 'even par' : n > 0 ? `+${n}` : `${n}`),
      list = [...pr.trophies].sort((a, b) => pawnOffer(b) - pawnOffer(a));
    openModal(
      'Lucky Pawn',
      `<div class="shop"><div class="shophead"><p class="muted">${
        list.length
          ? "\"Let's see what you've got. I pay cash, and I don't sell them back.\""
          : '"Nothing to sell? Go and win something. I\'ll be here."'
      }</p><div class="shopcash">Cash <b>${money(pr.cash)}</b></div></div>
       ${
         list.length
           ? `<h3>Your trophies</h3><div class="goods">${list
               .map(t => {
                 const out = isPlaced('trophy:' + t.id),
                   offer = pawnOffer(t);
                 return `<div class="good"><div class="gi"><img src="${trophyPic(t.seed, t.n, '', 96)}" alt=""></div><div class="gt"><b>${esc(t.title)}</b>
                   <p>${t.n === 9 ? 'Championship' : 'Mini cup'} · ${tp(t.toPar)}${t.field > 1 ? ` · beat ${t.field - 1}` : ''}</p><em>${out ? 'On your lot: take it down in Build Mode first' : ''}</em></div>
                   <button data-pawn="${esc(t.id)}" ${out ? 'disabled' : ''}>${armed === t.id ? `Sell for ${money(offer)}?` : money(offer)}</button></div>`;
               })
               .join('')}</div>`
           : ''
       }
       <p class="muted" style="margin-top:10px">A sold trophy is gone for good, on every device. Click a price once to be asked, again to sell.</p>
       <h3>Behind the glass</h3><div class="goods"><div class="good"><div class="gi"><img src="${lizardPic()}" alt="" style="height:96px;width:auto"></div><div class="gt"><b>1st Edition Holographic Lizard</b>
         <p>"A lady sold me a whole box of these cards a while back. This one's the jewel. Mint. Not for sale... unless it is."</p><em>${(pr.gear.lizardcard || 0) > 0 ? 'Yours: it stands on your lot (Build Mode, Decoration)' : ''}</em></div>
         ${
           (pr.gear.lizardcard || 0) > 0
             ? '<button disabled>Bought back</button>'
             : `<button data-lizard ${pr.cash < LIZARD_PRICE ? 'disabled' : ''}>${armed === 'lizard' ? `Buy it back for ${money(LIZARD_PRICE)}?` : money(LIZARD_PRICE)}</button>`
         }</div></div></div>`,
    );
    $('lmodal')
      .querySelector<HTMLButtonElement>('[data-lizard]')
      ?.addEventListener('click', async () => {
        if (armed !== 'lizard') return openPawn('lizard');
        const r = await buyItem('lizardcard', LIZARD_PRICE);
        playSample(r === 'ok' ? 'win' : 'error', 0.55);
        toast(
          r === 'ok'
            ? 'The lizard is home. Mom would cry. Place it on your lot in Build Mode (Decoration): everyone will see it.'
            : "You can't afford it. He's not surprised.",
          5000,
        );
        await openPawn();
      });
    const card = $('lmodal').querySelector('.card');
    card?.classList.add('wide');
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-pawn]')
      .forEach(
        b =>
          (b.onclick = async () => {
            const id = b.dataset.pawn!,
              t = pr.trophies.find(x => x.id === id),
              sc = card?.scrollTop || 0;
            if (!t) return;
            if (armed !== id) await openPawn(id);
            else {
              const ok = await sellTrophy(id, pawnOffer(t));
              playSample(ok ? 'confirm' : 'error', 0.5);
              toast(ok ? `Sold: ${esc(t.title)} for ${money(pawnOffer(t))}.` : "He won't take that one.");
              await openPawn();
            }
            const c = $('lmodal').querySelector('.card');
            if (c) c.scrollTop = sc;
          }),
      );
  }
  /** Wrench & Ride (West Side): buy a car, choose the one you drive, repaint it. Your car replaces the golf cart in town
   *  and on the course; it still comes out of your lot's garage. */
  const carPics = new Map<string, string>();
  async function openAuto() {
    await loadCarKit().catch(() => 0); // (the pictures are drawn from the models)
    const pr = await loadProgress(),
      look = (id: string) => (pr.carLook[id] || ':').split(':') as [string, string],
      pic = (id: string) => {
        const k = id + (pr.carLook[id] || ''),
          spec = CAR.get(id)!;
        if (!carPics.has(k)) carPics.set(k, objectImage(carModel(spec, ...look(id)).root, 220));
        return carPics.get(k)!;
      },
      cur = CAR.get(pr.car),
      PAINT = 150,
      sw = (kind: 'paint' | 'rim', list: string[], on: string) =>
        list
          .map(
            c =>
              `<button class="swatch${c === on ? ' on' : ''}" data-${kind}="${c}" title="${c ? '#' + c : 'Factory finish'}" style="background:${c ? '#' + c : 'repeating-linear-gradient(45deg,#d8d2c2 0 5px,#8a867c 5px 10px)'}"></button>`,
          )
          .join('');
    openModal(
      'Wrench & Ride Auto',
      `<div class="shop"><div class="shophead"><p class="muted">"Whatever you pick drives out of your garage, here and up at the course."</p><div class="shopcash">Cash <b>${money(pr.cash)}</b></div></div>
       ${
         cur
           ? `<h3>Your ${cur.name}</h3><div class="carpaint"><img src="${pic(cur.id)}" alt=""><div>
               <p><b>Paint</b> <span class="muted">${money(PAINT)} a respray, factory finish free</span></p><div class="swatches">${sw('paint', CAR_PAINTS, look(cur.id)[0])}</div>
               <p><b>Rims</b> <span class="muted">${money(PAINT)}</span></p><div class="swatches">${sw('rim', CAR_RIMS, look(cur.id)[1] || CAR_RIMS[0])}</div></div></div>
               <div class="carparts">${CAR_PARTS.map((p, i) => {
                 const lv = +(pr.carParts[cur.id] || '000')[i];
                 return `<div class="part"><b>${p.name}</b> <span class="pips">${[1, 2, 3].map(n => `<i class="${n <= lv ? 'on' : ''}"></i>`).join('')}</span>
                   <p class="muted">${p.what}<br>Fitted: ${p.stages[lv]}</p>
                   ${lv < 3 ? `<button data-part="${i}" ${pr.cash < p.price[lv + 1] ? 'disabled' : ''}>${p.stages[lv + 1]} · ${money(p.price[lv + 1])}</button>` : '<em>Fully fitted</em>'}</div>`;
               }).join('')}</div>`
           : ''
       }
       ${(() => {
         // repairs (crash wear) and the impound lot (cars the tow truck took): vehicles/wear.ts
         const worn = pr.cars.filter(id => (pr.carWear[id] || 0) > 0 && !pr.impound[id]),
           held = Object.keys(pr.impound).filter(id => CAR.has(id));
         return worn.length || held.length
           ? `<h3>Service bay</h3><div class="goods">${worn
               .map(id => {
                 const w = pr.carWear[id] || 0,
                   price = repairPrice(id, w);
                 return `<div class="good"><div class="gi"><img src="${pic(id)}" alt="" style="width:84px;height:auto;object-fit:contain"></div><div class="gt"><b>${CAR.get(id)!.name}</b><p>${w >= 60 ? 'Smoking, backfiring and down on power.' : w >= 30 ? 'Backfires when you lift off; down on power.' : 'A few knocks: a little down on power.'}</p><em>Wear ${w}%</em></div>
                   <button data-fix="${id}" ${pr.cash < price ? 'disabled' : ''}>Fix it · ${money(price)}</button></div>`;
               })
               .join('')}${held
               .map(
                 id => `<div class="good"><div class="gi"><img src="${pic(id)}" alt="" style="width:84px;height:auto;object-fit:contain"></div><div class="gt"><b>${CAR.get(id)!.name}</b><p>In the impound lot round the back, still dripping pond water.</p><em>Towed</em></div>
                   <button data-impound="${id}" ${pr.cash < pr.impound[id] ? 'disabled' : ''}>Get it back · ${money(pr.impound[id])}</button></div>`,
               )
               .join('')}</div>`
           : '';
       })()}
       <h3>On the lot</h3><div class="cars">
         <div class="carcard${pr.car ? '' : ' on'}"><img class="carpic" src="${carPics.get('cart') || (carPics.set('cart', objectImage(cartModel('#c8452f').root, 220)), carPics.get('cart'))}" alt=""><b>Golf cart</b><p>The one that came with the place.</p>
           <button data-car="" ${pr.car ? '' : 'disabled'}>${pr.car ? 'Drive this' : 'Driving'}</button></div>
         ${CARS.map(c => {
           const own = pr.cars.includes(c.id),
             on = pr.car === c.id;
           return `<div class="carcard${on ? ' on' : ''}"><img class="carpic" src="${pic(c.id)}" alt=""><b>${c.name}</b><p>${c.blurb}</p>
             <button data-car="${c.id}" ${on || pr.impound[c.id] || (!own && pr.cash < c.price) ? 'disabled' : ''}>${pr.impound[c.id] ? 'Impounded' : on ? 'Driving' : own ? 'Drive this' : money(c.price)}</button></div>`;
         }).join('')}</div>
       <p class="muted" style="margin-top:10px">Your car comes out of the cart garage on your lot (<kbd>E</kbd> at the garage) and waits behind the tee on the course.</p></div>`,
    );
    const card = $('lmodal').querySelector('.card');
    card?.classList.add('wide');
    const again = async () => {
      const sc = card?.scrollTop || 0;
      await openAuto();
      const c = $('lmodal').querySelector('.card');
      if (c) c.scrollTop = sc;
    };
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-car]')
      .forEach(
        b =>
          (b.onclick = async () => {
            const id = b.dataset.car || '';
            // buying (not switching) asks first: a car is the dearest thing in town and one stray click shouldn't buy it
            if (id && !progress().cars.includes(id) && b.dataset.sure !== '1') {
              b.dataset.sure = '1';
              b.textContent = `Buy for ${money(CAR.get(id)?.price || 0)}?`;
              playSample('select', 0.4);
              setTimeout(() => {
                if (b.isConnected && b.dataset.sure === '1') {
                  b.dataset.sure = '';
                  b.textContent = money(CAR.get(id)?.price || 0);
                }
              }, 4000);
              return;
            }
            const ok = await setCar(id, CAR.get(id)?.price || 0);
            playSample(ok ? 'confirm' : 'error', 0.5);
            if (!ok) toast("You can't afford that right now.");
            else toast(id ? `${CAR.get(id)!.name}: it's in your garage.` : 'Back to the golf cart.');
            await again();
          }),
      );
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-fix]')
      .forEach(
        b =>
          (b.onclick = async () => {
            const id = b.dataset.fix!,
              ok = await repairCar(id, repairPrice(id, progress().carWear[id] || 0));
            playSample(ok ? 'confirm' : 'error', 0.5);
            toast(ok ? `Good as new. Take it out of the garage again to feel it.` : "You can't afford the repair.");
            await again();
          }),
      );
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-impound]')
      .forEach(
        b =>
          (b.onclick = async () => {
            const id = b.dataset.impound!,
              ok = await payImpound(id);
            playSample(ok ? 'confirm' : 'error', 0.5);
            toast(ok ? `Your ${CAR.get(id)!.name.toLowerCase()} is back in your garage. Maybe stay out of the ponds.` : "You can't afford the fee.");
            await again();
          }),
      );
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-part]')
      .forEach(
        b =>
          (b.onclick = async () => {
            if (!cur) return;
            const i = +b.dataset.part!,
              part = CAR_PARTS[i],
              stage = +(progress().carParts[cur.id] || '000')[i] + 1,
              ok = await fitPart(cur.id, i, stage, part.price[stage]);
            playSample(ok ? 'confirm' : 'error', 0.5);
            toast(
              ok
                ? `${part.stages[stage]} fitted to your ${cur.name}. Take it out of the garage again to feel it.`
                : "You can't afford that right now.",
              3200,
            );
            await again();
          }),
      );
    const respray = async (paint: string, rim: string) => {
      if (!cur) return;
      const [p0, r0] = look(cur.id),
        free = (paint === p0 && rim === r0) || (!paint && rim === r0),
        ok = await paintCar(cur.id, paint, rim, free ? 0 : PAINT);
      playSample(ok ? 'confirm' : 'error', 0.5);
      if (!ok) toast("You can't afford that right now.");
      await again();
    };
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-paint]')
      .forEach(b => (b.onclick = () => respray(b.dataset.paint || '', look(cur!.id)[1])));
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-rim]')
      .forEach(b => (b.onclick = () => respray(look(cur!.id)[0], b.dataset.rim || '')));
  }
  /** Which aisle of the furniture store a piece is in (by what it is called; the first match wins). */
  const AISLES: [string, RegExp][] = [
    ['For the cart', /garage/i],
    ['Floors, fences and screens', /rug|deck|stepping|gravel|fence|screen|putting green/i],
    ['Plants', /plant|palm|cactus|agave|fern|succulent|planter/i],
    ['Lighting', /lamp|lights|torch|lantern|neon/i],
    ['Seating', /chair|bench|sofa|stool|booth|hammock/i],
    ['Tables and desks', /table|desk/i],
    ['Bedroom and storage', /bed|wardrobe|cupboard|bookcase|shelves|coat|crate|box|basket/i],
    ['Kitchen and appliances', /fridge|stove|washing|grill|cooler|television|fish tank|fan|bin|propane/i],
    ['Yard fun', /jukebox|cornhole|horseshoe|pool|umbrella|fire pit|windmill|bird bath|flamingo|gnome|flag|statue|guitar|sign/i],
  ];
  const AISLE_ORDER = [
    'Seating',
    'Tables and desks',
    'Bedroom and storage',
    'Kitchen and appliances',
    'Lighting',
    'Plants',
    'Yard fun',
    'Floors, fences and screens',
    'Odds and ends',
    'For the cart',
  ];
  const aisle = (def: { name: string; cat: string }) =>
    def.cat === 'garage' ? 'For the cart' : AISLES.find(a => a[1].test(def.name))?.[0] || 'Odds and ends';
  const openFurniture = async () => {
    await loadItemModels().catch(() => 0); // (the pictures are drawn from the models)
    return openShop(
      'Homestead Furniture',
      '"Take your time. It all goes home with you: we deliver to your lot\'s storage."',
      pr =>
        ITEMS.filter(i => !i.notSold && (i.cat === 'furniture' || i.cat === 'decor' || i.cat === 'garage'))
          .sort((a, b) => AISLE_ORDER.indexOf(aisle(a)) - AISLE_ORDER.indexOf(aisle(b)))
          .map(def => {
            const own = pr.gear[def.id] || 0;
            return {
              id: def.id,
              icon: `<img src="${thumb(def, '#c8452f')}" alt="">`,
              name: def.name,
              desc: def.cat === 'garage' ? 'Keeps your cart at home. One per lot.' : def.cat === 'furniture' ? 'Furniture' : 'Decoration',
              price: def.price,
              have: own ? `You own ${own}` : '',
              sold: !!def.max && own >= def.max,
              group: aisle(def),
            };
          }),
      "Bought pieces wait in your lot's storage. Press <kbd>B</kbd> on your own lot to place them; taking one off the lot puts it back in storage.",
    );
  };
  const openGrowShop = () =>
    openShop(
      'Grow Supply',
      '"Afternoon. Everything for the garden, and a few things for after."',
      pr => {
        const gear = (id: string, icon: string, desc: string): Good => {
          const def = ITEMS.find(i => i.id === id)!,
            own = pr.gear[id] || 0;
          return {
            id,
            icon,
            name: def.name.replace(/ \(.*/, ''),
            desc,
            price: def.price,
            have: own ? `You own ${own}` : '',
            group: 'For the garden',
          };
        };
        return [
          gear('growpot', invIcon('growpot'), 'One plant. Goes anywhere on your lot.'),
          gear('growbed', invIcon('growbed'), 'Three plants, and they grow a little faster.'),
          gear('sprinkler', invIcon('sprinkler'), 'Waters every plant within 2.6 m for you.'),
          {
            id: 'ggseed',
            icon: '<span style="font-size:34px">🌟</span>',
            name: 'Golden Hills Gold seed',
            desc: 'Premium and volatile. Sells for a fortune, but it wilts and dies without a UV lamp beside it and premium nutrients. One seed.',
            price: 2500,
            have: pr.items.ggseed ? `${pr.items.ggseed} in your pocket` : '',
            group: 'Premium',
            item: 1,
          },
          {
            ...gear('uvlamp', '<span style="font-size:34px">💡</span>', 'Keeps volatile plants within 2.2 m alive. Place it beside the pot.'),
            group: 'Premium',
          },
          {
            id: 'nutri',
            icon: '<span style="font-size:34px">🧪</span>',
            name: 'Premium nutrients',
            desc: 'Three doses. A volatile plant needs one every six minutes or it starts to wilt.',
            price: 450,
            have: pr.items.nutri ? `${pr.items.nutri} doses` : '',
            group: 'Premium',
            item: 3,
          },
          {
            id: 'fert',
            icon: invIcon('fert'),
            name: 'Fertilizer',
            desc: 'Three doses. Hungry plants lose quality.',
            price: 25,
            have: pr.fert ? `${pr.fert} doses` : '',
            group: 'For the garden',
          },
          {
            id: 'papers',
            icon: invIcon('papers'),
            name: 'Rolling papers',
            desc: 'A pack of 20. One per joint.',
            price: PAPERS_PRICE,
            have: pr.papers ? `${pr.papers} left` : '',
            group: 'For after',
          },
          {
            id: 'grinder',
            icon: invIcon('grinder'),
            name: 'Grinder',
            desc: 'Quicker, cleaner grinding when you roll.',
            price: GRINDER_PRICE,
            have: '',
            sold: pr.grinder,
            group: 'For after',
          },
        ];
      },
      'Gear goes into your inventory (<kbd>I</kbd>). Place it in Build Mode on your own lot, under Grow. Seeds are bought when you plant.',
    );

  return { openProShop, openPawn, openAuto, openFurniture, openGrowShop };
}
