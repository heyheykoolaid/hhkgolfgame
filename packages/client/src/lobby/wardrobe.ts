// The wardrobe (C anywhere, or E at the pro shop): body and face paint, hair and hat, top and jacket, legs and feet, extras.
// The lobby owns the golfer and the saved look; this is the panel and the pose the camera takes in front of them.
import { progress, loadProgress, addToCloset } from '../avatar/progress';
import { SWATCH, sanitizeLook, lookKey } from '../avatar/outfit';
import { TATTOOS, type Outfit } from '../characters/golfer';

export interface WardrobeHost {
  /** The lobby's player state: where they stand and which mode they're in. */
  P: { x: number; z: number; yaw: number; vx: number; vz: number; mode: string };
  look(): Outfit;
  setLook(o: Outfit): void; // change the look and rebuild the golfer (not saved yet)
  saveLook(): void; // keep it: this browser, the account, and tell everyone
  blocked(x: number, z: number, r?: number): boolean;
  clearKeys(): void;
  easeCamera(secs: number): void;
  toast(html: string): void;
}
const $ = (id: string) => document.getElementById(id)!;

/** Where you're changing: each shop offers its own part of the look. The mirror (in your RV) is body and skin, free. */
export type Shop = 'clothes' | 'barber' | 'tattoo' | 'mirror';
const SHOP: Record<Shop, [string, string]> = {
  clothes: ['Threads', 'Clothes and accessories. Colours are free; a new piece is yours for good once bought.'],
  barber: ['The Clip Joint', 'Hair, stubble and face paint.'],
  tattoo: ['Ink Spot', 'Tattoos show wherever your clothes leave skin bare.'],
  mirror: ['Mirror', 'Your build and skin.'],
};
const KEYS: Record<Exclude<Shop, 'clothes'>, string[]> = {
  barber: ['hair', 'hairStyle', 'stubble', 'paint', 'paintColor'],
  tattoo: ['tatChest', 'tatBack', 'tatArmL', 'tatArmR', 'tatCalf', 'tatInk'],
  mirror: ['body', 'skin'],
};
/** What a style costs the first time, by the part it's for (colours, "none" and your build are free). */
const PRICE: Record<string, number> = {
  top: 120,
  jacket: 260,
  pantsStyle: 150,
  shoeStyle: 140,
  capStyle: 80,
  glasses: 90,
  chain: 400,
  watch: 600,
  earring: 200,
  hairStyle: 60,
  paint: 30,
  tatChest: 180,
  tatBack: 220,
  tatArmL: 150,
  tatArmR: 150,
  tatCalf: 120,
};
const FREE = new Set(['none', 'false', '', 'undefined', 'bald', 'bare']);
const priceOf = (key: string) => {
  const [k, v] = key.split(':');
  return FREE.has(v) ? 0 : PRICE[k] || 0;
};
/** What each part is when a look doesn't say (an untouched golfer wears these): filled in from the wardrobe's own rows. */
const DEF: Record<string, string> = {};
/** The priced things in a look, as closet keys. */
const itemsOf = (o: Outfit) =>
  Object.keys(PRICE)
    .map(k => `${k}:${String((o as any)[k] ?? DEF[k])}`)
    .filter(k => priceOf(k) > 0);
const unowned = (o: Outfit) => {
  const own = new Set(progress().closet);
  return itemsOf(o).filter(k => !own.has(k));
};
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

export function createWardrobe(host: WardrobeHost) {
  const P = host.P;
  let preLook: Outfit = host.look(),
    wardCam = 0,
    shop: Shop = 'clothes';
  /** Is this row sold where we are? */
  const inShop = (r: Row) => {
    const k = 'k' in r ? String(r.k) : 'chain';
    for (const s of ['barber', 'tattoo', 'mirror'] as const) if (KEYS[s].includes(k)) return shop === s;
    return shop === 'clothes';
  };
  /** The wardrobe camera stands in front of the golfer. At the shop: step up to the mirror, back to the shop, facing out.
   *  Anywhere else: face whichever way leaves the camera a clear view (not inside a wall). */
  /** Ink Spot's "take clothes off": what you had on, put back before paying or leaving (null = dressed) */
  let dressed: Record<string, unknown> | null = null;
  const CLOTHES = ['top', 'jacket', 'pantsStyle', 'shoeStyle', 'capStyle', 'glasses', 'sleeves', 'socks'] as const;
  /** the look with your clothes on, whatever the preview shows */
  const withClothes = (o: Outfit) => (dressed ? sanitizeLook({ ...o, ...dressed } as Outfit) : o);
  function redress() {
    if (!dressed) return;
    host.setLook(withClothes(host.look()));
    dressed = null;
  }
  async function openWardrobe(where: Shop = 'clothes') {
    shop = where;
    dressed = null;
    if (where !== 'mirror')
      P.yaw = Math.PI; // back to the shopfront, facing the camera out on the car park
    else {
      const clear = (a: number) => {
        for (let d = 0.6; d <= 3.1; d += 0.5) if (host.blocked(P.x + Math.sin(a) * d, P.z + Math.cos(a) * d, 0.2)) return false;
        return true;
      };
      for (const o of [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, -Math.PI / 4])
        if (clear(P.yaw + o)) {
          P.yaw += o;
          break;
        }
    }
    P.vx = P.vz = 0;
    wardCam = P.yaw;
    if (document.pointerLockElement) document.exitPointerLock();
    preLook = { ...host.look() };
    // what you were already wearing before shops charged for anything is yours
    const pr = await loadProgress();
    if (!pr.closetInit) await addToCloset(itemsOf(preLook), 0, true);
    tab = '';
    P.mode = 'wardrobe';
    host.clearKeys();
    $('lward').classList.remove('hidden');
    document.body.classList.add('warding'); // the controls card steps aside
    renderWardrobe();
  }
  /** Done: pay for anything in the look you don't own yet (once; it's then in your closet for good), and keep it on. */
  async function checkout() {
    const need = unowned(withClothes(host.look())),
      cost = need.reduce((a, k) => a + priceOf(k), 0);
    if (cost > progress().cash) {
      host.toast(`That comes to ${money(cost)} and you have ${money(progress().cash)}.`);
      return;
    }
    if (need.length) await addToCloset(need, cost);
    redress();
    closeWardrobe(true);
  }
  function closeWardrobe(save: boolean) {
    redress();
    $('lward').classList.add('hidden');
    document.body.classList.remove('warding');
    P.mode = 'walk';
    host.easeCamera(0.7);
    if (!save) {
      if (lookKey(host.look()) !== lookKey(preLook)) host.setLook(preLook);
      return;
    }
    host.saveLook();
    host.toast(shop === 'mirror' ? 'Saved.' : 'Looking sharp. Your new look is saved.');
  }
  // One tab per part of the body. Each row is either a set of styles (text buttons) or a set of colours (swatches).
  type Row =
    | { k: keyof Outfit; label: string; styles: [string, string][]; def: string }
    | { k: keyof Outfit; label: string; colours: string[] }
    | { label: string; flags: [keyof Outfit, string][] }
    | { k: keyof Outfit; label: string; tats: true };
  const TABS: { id: string; label: string; rows: (o: Outfit) => Row[]; note?: (o: Outfit) => string }[] = [
    {
      id: 'body',
      label: 'Body',
      rows: o => [
        {
          k: 'body',
          label: 'Build',
          styles: [
            ['male', 'Male'],
            ['female', 'Female'],
            ['muscle', 'Muscular male'],
            ['fmuscle', 'Muscular female'],
          ],
          def: 'male',
        },
        { k: 'skin', label: 'Skin', colours: SWATCH.skin },
        {
          k: 'stubble',
          label: 'Face',
          styles: [
            ['true', 'Stubble'],
            ['false', 'Clean-shaven'],
          ],
          def: 'true',
        },
        {
          k: 'paint',
          label: 'Face paint',
          styles: [
            ['none', 'None'],
            ['eyeblack', 'Eye black'],
            ['stripes', 'War stripes'],
            ['band', 'Bandit'],
            ['star', 'Star'],
            ['whiskers', 'Whiskers'],
            ['half', 'Half face'],
            ['clown', 'Clown'],
          ],
          def: 'none',
        },
        ...(o.paint && o.paint !== 'none' ? [{ k: 'paintColor', label: 'Paint colour', colours: SWATCH.paint } as Row] : []),
      ],
    },
    {
      id: 'head',
      label: 'Hair & hat',
      rows: o => [
        {
          k: 'hairStyle',
          label: 'Hair',
          styles: [
            ['short', 'Short'],
            ['short1', 'Crop'],
            ['short4', 'Side part'],
            ['short3', 'Fringe'],
            ['afro', 'Afro'],
            ['bob2', 'Bob'],
            ['bob', 'Swept bob'],
            ['pony', 'Ponytail'],
            ['braid', 'Braid'],
            ['long', 'Long'],
            ['bald', 'Bald'],
          ],
          def: 'short',
        },
        ...(o.hairStyle !== 'bald'
          ? [{ k: 'hair', label: 'Hair colour', colours: SWATCH.hair } as Row]
          : [{ k: 'hair', label: 'Brow colour', colours: SWATCH.hair } as Row]),
        {
          k: 'capStyle',
          label: 'Hat',
          styles: [
            ['back', 'Cap, backwards'],
            ['front', 'Cap, forwards'],
            ['fedora', 'Fedora'],
            ['none', 'No hat'],
          ],
          def: 'back',
        },
        ...(o.capStyle !== 'none' ? [{ k: 'cap', label: 'Hat colour', colours: SWATCH.cap } as Row] : []),
      ],
    },
    {
      id: 'top',
      label: 'Top',
      note: o => (o.pantsStyle === 'overalls' ? 'Overalls come with their own tee (or none), and no jacket fits over the bib.' : ''),
      rows: o => {
        const ov = o.pantsStyle === 'overalls',
          jk = !ov && o.jacket && o.jacket !== 'none';
        return [
          ov
            ? {
                k: 'top',
                label: 'Under the bib',
                styles: [
                  ['tee', 'Tee'],
                  ['none', 'Bare chest'],
                ],
                def: 'tee',
              }
            : {
                k: 'top',
                label: 'Shirt',
                styles: [
                  ['tee', 'Tee'],
                  ['long', 'Long sleeve'],
                  ['button', 'Button-up'],
                  ['none', 'Bare chest'],
                ],
                def: 'tee',
              },
          ...(o.top !== 'none' || jk ? [{ k: 'shirt', label: 'Shirt colour', colours: SWATCH.shirt } as Row] : []),
          ...(!ov && (jk ? o.jacket === 'blazer' : (o.top || 'tee') === 'tee')
            ? [{ k: 'print', label: jk ? 'Tie colour' : 'Print colour', colours: SWATCH.print } as Row]
            : []),
          ...(ov
            ? []
            : [
                {
                  k: 'jacket',
                  label: 'Jacket',
                  styles: [
                    ['none', 'None'],
                    ['padded', 'Field jacket'],
                    ['blazer', 'Blazer & tie'],
                  ],
                  def: 'none',
                } as Row,
              ]),
          ...(jk ? [{ k: 'jacketColor', label: 'Jacket colour', colours: SWATCH.jacket } as Row] : []),
        ];
      },
    },
    {
      id: 'legs',
      label: 'Legs & feet',
      rows: o => [
        {
          k: 'pantsStyle',
          label: 'Bottoms',
          styles: [
            ['jeans', 'Jeans'],
            ['slacks', 'Slacks'],
            ['shorts', 'Shorts'],
            ['overalls', 'Overalls'],
          ],
          def: 'jeans',
        },
        { k: 'pants', label: 'Colour', colours: SWATCH.pants },
        {
          k: 'shoeStyle',
          label: 'Footwear',
          styles: [
            ['sneakers', 'Sneakers'],
            ['trainers', 'Trainers'],
            ['loafers', 'Loafers'],
            ['dress', 'Dress shoes'],
            ['hikers', 'Hikers'],
            ['boots', 'Boots'],
            ['bare', 'Bare feet'],
          ],
          def: 'sneakers',
        },
        ...(o.shoeStyle !== 'bare' ? [{ k: 'shoes', label: 'Shoe colour', colours: SWATCH.shoes } as Row] : []),
      ],
    },
    {
      id: 'extras',
      label: 'Extras',
      rows: () => [
        {
          k: 'glasses',
          label: 'Glasses',
          styles: [
            ['none', 'None'],
            ['shades', 'Shades'],
            ['aviators', 'Aviators'],
            ['round', 'Round specs'],
          ],
          def: 'none',
        },
        {
          label: 'Jewellery',
          flags: [
            ['chain', 'Gold chain'],
            ['watch', 'Watch'],
            ['earring', 'Earring'],
          ],
        },
      ],
    },
  ];
  TABS.push({
    id: 'tats',
    label: 'Tattoos',
    note: () => 'Tattoos show wherever your clothes leave skin bare.',
    rows: o => [
      { k: 'tatChest', label: 'Chest', tats: true },
      { k: 'tatBack', label: 'Back', tats: true },
      { k: 'tatArmL', label: 'Left arm', tats: true },
      { k: 'tatArmR', label: 'Right arm', tats: true },
      { k: 'tatCalf', label: 'Left calf', tats: true },
      ...(o.tatChest || o.tatBack || o.tatArmL || o.tatArmR || o.tatCalf ? [{ k: 'tatInk', label: 'Ink', colours: SWATCH.ink } as Row] : []),
    ],
  });
  const tatURL = new URL('golfer/tattoos.png', document.baseURI).href;
  for (const t of TABS) for (const r of t.rows(host.look())) if ('styles' in r) DEF[String(r.k)] = r.def;
  let tab = '',
    tatPart = '';
  function renderWardrobe() {
    const look = host.look() as any,
      tabs = TABS.filter(t => t.rows(look).some(inShop));
    if (!tabs.some(t => t.id === tab)) tab = tabs[0].id;
    const T = tabs.find(t => t.id === tab)!,
      own = new Set(progress().closet),
      tag = (k: string, v: string) => {
        const key = `${k}:${v}`,
          pr = priceOf(key);
        return pr && !own.has(key) ? ` <i class="pr">${money(pr)}</i>` : '';
      },
      need = unowned(withClothes(look)),
      cost = need.reduce((a, k) => a + priceOf(k), 0);
    // the tattoo parlour: pick where it goes first, then choose from the designs for that one place
    const parts = shop === 'tattoo' ? (T.rows(look).filter(r => 'tats' in r) as { k: keyof Outfit; label: string }[]) : [];
    if (parts.length && !parts.some(p => p.k === tatPart)) tatPart = String(parts[0].k);
    const partBar = parts.length
      ? `<div class="sec"><div class="lbl">Where</div><div class="tg">${parts.map(p => `<button class="t${p.k === tatPart ? ' on' : ''}" data-part="${String(p.k)}">${p.label}${look[p.k] ? ' ●' : ''}</button>`).join('')}</div></div>`
      : '';
    const rows = T.rows(look)
      .filter(inShop)
      .filter(r => !('tats' in r) || r.k === tatPart)
      .map(r => {
        let inner: string;
        if ('tats' in r)
          inner = `<div class="tt"><button class="tb none${look[r.k] ? '' : ' on'}" data-tat="${r.k}" data-v="">None</button>${TATTOOS.map(
            (t, i) =>
              `<button class="tb${look[r.k] === t.id ? ' on' : ''}${own.has(`${r.k}:${t.id}`) ? '' : ' buy'}" data-tat="${r.k}" data-v="${t.id}" title="${t.name}${own.has(`${r.k}:${t.id}`) ? '' : ' · ' + money(priceOf(`${r.k}:${t.id}`))}" style="background-image:url(${tatURL});background-position:${(i % 6) * 20}% ${Math.floor(i / 6) * 50}%"></button>`,
          ).join('')}</div>`;
        else if ('colours' in r)
          inner = `<div class="sw">${r.colours.map(c => `<button class="c${look[r.k] === c ? ' on' : ''}" data-k="${r.k}" data-v="${c}" style="background:${c}"></button>`).join('')}</div>`;
        else if ('styles' in r)
          inner = `<div class="tg">${r.styles
            .filter(([v]) => !(r.k === 'top' && v === 'none' && (look.body === 'female' || look.body === 'fmuscle'))) // the female bodies always wear a top
            .map(
              ([v, l]) =>
                `<button class="t${String(look[r.k] ?? r.def) === v ? ' on' : ''}" data-k="${r.k}" data-v="${v}">${l}${tag(String(r.k), v)}</button>`,
            )
            .join('')}</div>`;
        else
          inner = `<div class="tg">${r.flags.map(([k, l]) => `<button class="t${look[k] ? ' on' : ''}" data-flag="${k}">${l}${tag(String(k), 'true')}</button>`).join('')}</div>`;
        return `<div class="sec"><div class="lbl">${r.label}</div>${inner}</div>`;
      })
      .join('');
    const note = T.note?.(look);
    $('lward').innerHTML = `<div class="panel"><h2>${SHOP[shop][0]}</h2><p class="muted">${SHOP[shop][1]} Cash <b>${money(progress().cash)}</b></p>
      <div class="tabs">${tabs.length > 1 ? tabs.map(t => `<button class="tab${t.id === tab ? ' on' : ''}" data-tab="${t.id}">${t.label}</button>`).join('') : ''}</div>
      ${note ? `<p class="muted note">${note}</p>` : ''}${partBar}${rows}
      <div class="btns">${shop === 'tattoo' ? `<button id="w-strip">${dressed ? 'Clothes back on' : 'Take clothes off'}</button>` : ''}<button id="w-turn">Turn ⟳</button><button id="w-cancel">Cancel</button><button id="w-done" class="primary">${cost ? `Buy and wear · ${money(cost)}` : 'Done'}</button></div></div>`;
    const set = (patch: Partial<Outfit>) => {
      host.setLook(sanitizeLook({ ...host.look(), ...patch }));
      renderWardrobe();
    };
    const el = $('lward');
    el.querySelectorAll<HTMLButtonElement>('button[data-tab]').forEach(
      b =>
        (b.onclick = () => {
          tab = b.dataset.tab!;
          renderWardrobe();
        }),
    );
    el.querySelectorAll<HTMLButtonElement>('button[data-part]').forEach(
      b =>
        (b.onclick = () => {
          tatPart = b.dataset.part!;
          // turn the golfer so the place being inked faces the camera
          P.yaw =
            wardCam +
            (tatPart === 'tatBack' || tatPart === 'tatCalf'
              ? Math.PI
              : tatPart === 'tatArmL'
                ? -Math.PI / 2
                : tatPart === 'tatArmR'
                  ? Math.PI / 2
                  : 0);
          renderWardrobe();
        }),
    );
    el.querySelectorAll<HTMLButtonElement>('button[data-k]').forEach(
      b =>
        (b.onclick = () => {
          const k = b.dataset.k!,
            v = b.dataset.v!;
          set({ [k]: k === 'stubble' ? v === 'true' : v } as any);
        }),
    );
    el.querySelectorAll<HTMLButtonElement>('button[data-tat]').forEach(
      b => (b.onclick = () => set({ [b.dataset.tat!]: b.dataset.v || undefined } as any)),
    );
    el.querySelectorAll<HTMLButtonElement>('button[data-flag]').forEach(
      b => (b.onclick = () => set({ [b.dataset.flag!]: !(host.look() as any)[b.dataset.flag!] } as any)),
    );
    const strip = document.getElementById('w-strip');
    if (strip)
      strip.onclick = () => {
        if (dressed) redress();
        else {
          // down to shorts and bare feet so every tattoo shows (the female bodies keep a tee: the wardrobe never takes theirs off)
          const o = host.look() as any,
            fem = o.body === 'female' || o.body === 'fmuscle',
            off: Record<string, unknown> = {
              top: fem ? 'tee' : 'none',
              jacket: 'none',
              pantsStyle: 'shorts',
              shoeStyle: 'bare',
              capStyle: 'none',
              glasses: 'none',
            };
          dressed = {};
          for (const k of CLOTHES) if (k in o) dressed[k] = o[k];
          host.setLook(sanitizeLook({ ...o, ...Object.fromEntries(Object.entries(off).filter(([k]) => k in o || k === 'top')) }));
        }
        renderWardrobe();
      };
    $('w-turn').onclick = () => {
      P.yaw += Math.PI / 2;
    }; // turn the golfer, not the camera (which could end up inside the shop)
    $('w-cancel').onclick = () => closeWardrobe(false);
    $('w-done').onclick = () => void checkout();
  }

  /** Put on or take off a piece from your closet ("top:tee"), from the inventory. Taking everything off leaves you
   *  in shorts and bare feet. Returns whether it is now on. */
  function wear(key: string) {
    const [k, v] = key.split(':'),
      o = host.look() as any,
      flag = v === 'true',
      on = flag ? !!o[k] : String(o[k] ?? DEF[k]) === v,
      off: Record<string, unknown> = { top: 'none', jacket: 'none', pantsStyle: 'shorts', shoeStyle: 'bare', capStyle: 'none', glasses: 'none' };
    host.setLook(sanitizeLook({ ...o, [k]: on ? (flag ? false : off[k]) : flag ? true : v }));
    host.saveLook();
    return !on;
  }
  return {
    wear,
    /** The closet keys of what's on right now. */
    worn: () => new Set(itemsOf(host.look())),
    /** What you were wearing before shops charged for anything is yours: put it in the closet, once. */
    async seed() {
      if (!(await loadProgress()).closetInit) await addToCloset(itemsOf(host.look()), 0, true);
    },
    open: openWardrobe,
    close: closeWardrobe,
    /** Which way the golfer faced when it opened: the camera stands in front. */ cam: () => wardCam,
  };
}
