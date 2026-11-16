// The wardrobe (C anywhere, or E at the pro shop): body and face paint, hair and hat, top and jacket, legs and feet, extras.
// The lobby owns the golfer and the saved look; this is the panel and the pose the camera takes in front of them.
import { SWATCH, sanitizeLook, lookKey, randomLook } from '../avatar/outfit';
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

export function createWardrobe(host: WardrobeHost) {
  const P = host.P;
  let preLook: Outfit = host.look(),
    wardCam = 0;
  /** The wardrobe camera stands in front of the golfer. At the shop: step up to the mirror, back to the shop, facing out.
   *  Anywhere else: face whichever way leaves the camera a clear view (not inside a wall). */
  function openWardrobe(atShop = false) {
    if (atShop) {
      P.x = -5.35;
      P.z = 0.8;
      P.yaw = Math.PI / 2;
    } else {
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
    P.mode = 'wardrobe';
    host.clearKeys();
    $('lward').classList.remove('hidden');
    document.body.classList.add('warding'); // the controls card steps aside
    renderWardrobe();
  }
  function closeWardrobe(save: boolean) {
    $('lward').classList.add('hidden');
    document.body.classList.remove('warding');
    P.mode = 'walk';
    host.easeCamera(0.7);
    if (!save) {
      if (lookKey(host.look()) !== lookKey(preLook)) host.setLook(preLook);
      return;
    }
    host.saveLook();
    host.toast('Looking sharp. Your new look is saved.');
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
  let tab = 'body';
  function renderWardrobe() {
    const look = host.look() as any,
      T = TABS.find(t => t.id === tab)!;
    const rows = T.rows(look)
      .map(r => {
        let inner: string;
        if ('tats' in r)
          inner = `<div class="tt"><button class="tb none${look[r.k] ? '' : ' on'}" data-tat="${r.k}" data-v="">None</button>${TATTOOS.map(
            (t, i) =>
              `<button class="tb${look[r.k] === t.id ? ' on' : ''}" data-tat="${r.k}" data-v="${t.id}" title="${t.name}" style="background-image:url(${tatURL});background-position:${(i % 6) * 20}% ${Math.floor(i / 6) * 50}%"></button>`,
          ).join('')}</div>`;
        else if ('colours' in r)
          inner = `<div class="sw">${r.colours.map(c => `<button class="c${look[r.k] === c ? ' on' : ''}" data-k="${r.k}" data-v="${c}" style="background:${c}"></button>`).join('')}</div>`;
        else if ('styles' in r)
          inner = `<div class="tg">${r.styles
            .filter(([v]) => !(r.k === 'top' && v === 'none' && (look.body === 'female' || look.body === 'fmuscle'))) // the female bodies always wear a top
            .map(([v, l]) => `<button class="t${String(look[r.k] ?? r.def) === v ? ' on' : ''}" data-k="${r.k}" data-v="${v}">${l}</button>`)
            .join('')}</div>`;
        else
          inner = `<div class="tg">${r.flags.map(([k, l]) => `<button class="t${look[k] ? ' on' : ''}" data-flag="${k}">${l}</button>`).join('')}</div>`;
        return `<div class="sec"><div class="lbl">${r.label}</div>${inner}</div>`;
      })
      .join('');
    const note = T.note?.(look);
    $('lward').innerHTML =
      `<div class="panel"><h2>Wardrobe</h2><p class="muted">Your golfer, in the lobby and on the course. Everyone sees your look.</p>
      <div class="tabs">${TABS.map(t => `<button class="tab${t.id === tab ? ' on' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}</div>
      ${note ? `<p class="muted note">${note}</p>` : ''}${rows}
      <div class="btns"><button id="w-rand">Shuffle</button><button id="w-turn">Turn ⟳</button><button id="w-cancel">Cancel</button><button id="w-done" class="primary">Done</button></div></div>`;
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
    $('w-rand').onclick = () => set(randomLook(Math.random().toString(36)));
    $('w-turn').onclick = () => {
      P.yaw += Math.PI / 2;
    }; // turn the golfer, not the camera (which could end up inside the shop)
    $('w-cancel').onclick = () => closeWardrobe(false);
    $('w-done').onclick = () => closeWardrobe(true);
  }

  return {
    open: openWardrobe,
    close: closeWardrobe,
    /** Which way the golfer faced when it opened: the camera stands in front. */ cam: () => wardCam,
  };
}
