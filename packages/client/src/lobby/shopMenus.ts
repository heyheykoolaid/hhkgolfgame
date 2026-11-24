// The shops' counters: what opens when you press E at Grow Supply, the Pro Shop, Lucky Pawn, Wrench & Ride Auto and
// Homestead Furniture. Each is a panel in the lobby's modal; all spending goes through avatar/progress.ts.
// Split out of lobby/lobby.ts, which lends it the modal and a few helpers.
import { $, esc, money } from '../ui/dom';
import { playSample } from '../audio/samples';
import { invIcon } from './invIcons';
import { loadProgress, progress, buyItem, setTrail, setCar, paintCar, fitPart, sellTrophy, isPlaced } from '../avatar/progress';
import { objectImage } from '../world/trophy';
import { TRAILS } from '../avatar/trails';
import { ITEMS, loadItemModels } from './catalog';
import { thumb } from './build';
import { PAPERS_PRICE, GRINDER_PRICE } from './dealer';
import { cartModel, CARS, CAR, CAR_PAINTS, CAR_PARTS, CAR_RIMS, carModel, loadCarKit } from '../vehicles/vehicles';

/** What the lobby lends: its message line, its modal, and the picture of a trophy. */
export interface ShopCtx {
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
              r = await buyItem(g.id, g.price);
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
  async function openProShop() {
    const pr = await loadProgress();
    openModal(
      'Pro Shop',
      `<div class="shop"><div class="shophead"><p class="muted">"Everything for the golfer who has everything. Trails today; club skins and effects are on order."</p><div class="shopcash">Cash <b>${money(pr.cash)}</b></div></div>
       <h3>Ball trails</h3><div class="goods">${TRAILS.map(t => {
         const own = !t.id || pr.trails.includes(t.id),
           on = pr.trail === t.id;
         return `<div class="good"><div class="gi"><span class="trail" style="background:${t.color === 'rainbow' ? 'linear-gradient(90deg,#ff4f4f,#ffd24a,#9cff3a,#8fe3ff,#ff4fc3)' : t.color}"></span></div><div class="gt"><b>${t.name}</b><p>${t.desc}</p><em>${on ? 'In use' : own ? 'Owned' : ''}</em></div>
           <button data-trail="${t.id}" ${on || (!own && pr.cash < t.price) ? 'disabled' : ''}>${on ? 'In use' : own ? 'Use' : money(t.price)}</button></div>`;
       }).join('')}</div>
       <p class="muted" style="margin-top:10px">A trail is the line your ball draws through the air on every course. Others don't see yours yet.</p></div>`,
    );
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
       <p class="muted" style="margin-top:10px">A sold trophy is gone for good, on every device. Click a price once to be asked, again to sell.</p></div>`,
    );
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
       <h3>On the lot</h3><div class="cars">
         <div class="carcard${pr.car ? '' : ' on'}"><img class="carpic" src="${carPics.get('cart') || (carPics.set('cart', objectImage(cartModel('#c8452f').root, 220)), carPics.get('cart'))}" alt=""><b>Golf cart</b><p>The one that came with the place.</p>
           <button data-car="" ${pr.car ? '' : 'disabled'}>${pr.car ? 'Drive this' : 'Driving'}</button></div>
         ${CARS.map(c => {
           const own = pr.cars.includes(c.id),
             on = pr.car === c.id;
           return `<div class="carcard${on ? ' on' : ''}"><img class="carpic" src="${pic(c.id)}" alt=""><b>${c.name}</b><p>${c.blurb}</p>
             <button data-car="${c.id}" ${on || (!own && pr.cash < c.price) ? 'disabled' : ''}>${on ? 'Driving' : own ? 'Drive this' : money(c.price)}</button></div>`;
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
        ITEMS.filter(i => i.cat === 'furniture' || i.cat === 'decor' || i.cat === 'garage')
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
