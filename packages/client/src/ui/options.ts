// Options: one menu for the whole game (sound, display, controls), opened with Esc or the gear in the corner, plus
// whatever the current situation adds (on the course: "Leave the round"). Settings are remembered in this browser.
// Other modules read `opts` directly each frame, or subscribe with `onOptions` when they need to react to a change.
import { creditsHTML } from './credits';
import { accountHTML, wireAccount } from './signup';
export const opts = {
  /** volumes, 0–1 */
  master: 0.8,
  ambience: 0.7,
  effects: 1,
  /** the cart radio: your own and everyone's */
  radio: 0.8,
  /** other players' cart radios, on top of that */
  radioOthers: 0.8,
  /** cast shadows from the sun (the most expensive thing the game draws) */
  shadows: true,
  /** how sharp the picture is: 0 soft (fastest) · 1 normal · 2 sharp */
  sharp: 1,
  /** mouse look speed, 0.4–2 */
  look: 1,
  /** show the controls panel down the side */
  panel: true,
};
type Opts = typeof opts;
const KEY = 'gh_options';
const subs = new Set<() => void>();
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  for (const k of Object.keys(opts) as (keyof Opts)[]) if (typeof saved[k] === typeof opts[k]) (opts as any)[k] = saved[k];
  if (localStorage.getItem('gh_sound') === 'off' && saved.ambience === undefined) opts.ambience = 0; // the old speaker button
} catch {}
export function onOptions(fn: () => void) {
  subs.add(fn);
  fn();
}
function set<K extends keyof Opts>(k: K, v: Opts[K]) {
  opts[k] = v;
  try {
    localStorage.setItem(KEY, JSON.stringify(opts));
  } catch {}
  subs.forEach(f => f());
}

export type MenuAction = { label: string; run(): void; danger?: boolean };
let el: HTMLElement | null = null,
  gear: HTMLButtonElement | null = null,
  isOpen = false,
  actions: () => MenuAction[] = () => [],
  where = '';

function build() {
  if (el || typeof document === 'undefined') return;
  gear = document.createElement('button');
  gear.id = 'gear';
  gear.title = 'Options (Esc)';
  gear.textContent = '⚙';
  gear.onclick = e => {
    e.stopPropagation();
    gear!.blur();
    options.toggle();
  };
  document.body.appendChild(gear);
  el = document.createElement('div');
  el.id = 'options';
  el.className = 'hidden';
  document.body.appendChild(el);
  el.addEventListener('pointerdown', e => {
    if (e.target === el) options.close(); // a click on the dimmed background
  });
  // while the menu is open it owns the keyboard: nothing reaches the game underneath
  addEventListener(
    'keydown',
    e => {
      if (!isOpen) return;
      if ((e.target as HTMLElement)?.tagName !== 'INPUT' || e.code === 'Escape') {
        e.stopImmediatePropagation();
        if (e.code === 'Escape') {
          e.preventDefault();
          options.close();
        }
      }
    },
    true,
  );
  addEventListener('keyup', e => isOpen && e.stopImmediatePropagation(), true);
}
let showCredits = false,
  showCode = false;
function render() {
  if (!el) return;
  const slider = (k: keyof Opts, label: string, min = 0, max = 1) =>
    `<label class="orow"><span>${label}</span><input type="range" min="${min}" max="${max}" step="0.05" value="${opts[k]}" data-k="${k}"><b>${Math.round((opts[k] as number) * 100)}%</b></label>`;
  const toggle = (k: keyof Opts, label: string, hint = '') =>
    `<label class="orow"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><button class="otog${opts[k] ? ' on' : ''}" data-t="${k}">${opts[k] ? 'On' : 'Off'}</button></label>`;
  const acts = actions();
  if (showCredits) {
    el.innerHTML = `<div class="ocard"><div class="ohead"><h2>Credits</h2><span>Golden Hills</span></div><div class="credits">${creditsHTML()}</div>
      <div class="oacts"><button class="primary" data-back>Back</button></div></div>`;
    el.querySelector<HTMLButtonElement>('[data-back]')!.onclick = () => {
      showCredits = false;
      render();
    };
    return;
  }
  el.innerHTML = `<div class="ocard">
    <div class="ohead"><h2>Options</h2><span>${where}</span></div>
    <h3>Sound</h3>
    ${slider('master', 'Everything')}
    ${slider('ambience', 'Ambience<small>wind, crickets, traffic, birds</small>')}
    ${slider('effects', 'Game sounds<small>swings, footsteps, cards</small>')}
    ${slider('radio', 'Cart radio')}
    ${slider('radioOthers', "Other carts' radios<small>0% mutes them all</small>")}
    <h3>Picture</h3>
    ${toggle('shadows', 'Shadows', 'turn off if the game runs slowly')}
    <label class="orow"><span>Sharpness</span><span class="oseg">${['Soft', 'Normal', 'Sharp'].map((n, i) => `<button class="${opts.sharp === i ? 'on' : ''}" data-s="${i}">${n}</button>`).join('')}</span></label>
    <h3>Controls</h3>
    ${slider('look', 'Mouse look speed', 0.4, 2)}
    ${toggle('panel', 'Controls panel', 'the key guide down the right-hand side')}
    ${accountHTML(showCode)}
    <div class="oacts"><button data-credits>Credits</button>${acts.map((a, i) => `<button class="${a.danger ? 'danger' : ''}" data-a="${i}">${a.label}</button>`).join('')}<button class="primary" data-a="-1">Back to the game <kbd>Esc</kbd></button></div>
  </div>`;
  el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(i => {
    i.oninput = () => {
      set(i.dataset.k as any, +i.value as any);
      i.nextElementSibling!.textContent = Math.round(+i.value * 100) + '%';
    };
  });
  el.querySelectorAll<HTMLButtonElement>('[data-t]').forEach(b => {
    b.onclick = () => {
      set(b.dataset.t as any, !opts[b.dataset.t as keyof Opts] as any);
      render();
    };
  });
  el.querySelectorAll<HTMLButtonElement>('[data-s]').forEach(b => {
    b.onclick = () => {
      set('sharp', +b.dataset.s!);
      render();
    };
  });
  wireAccount(el, showCode, sh => {
    showCode = sh;
    render();
  });
  el.querySelector<HTMLButtonElement>('[data-credits]')!.onclick = () => {
    showCredits = true;
    render();
  };
  el.querySelectorAll<HTMLButtonElement>('[data-a]').forEach(b => {
    b.onclick = () => {
      const i = +b.dataset.a!;
      options.close();
      if (i >= 0) acts[i]?.run();
    };
  });
}

export const options = {
  /** Call once at start-up so the gear shows. */
  init: build,
  /** What the menu offers besides settings right now (the course adds "Leave the round"), and where you are. */
  context(place: string, list: () => MenuAction[]) {
    where = place;
    actions = list;
  },
  open() {
    build();
    if (!el || isOpen) return;
    isOpen = true;
    try {
      document.exitPointerLock?.();
    } catch {}
    render();
    el.classList.remove('hidden');
  },
  close() {
    if (!el || !isOpen) return;
    isOpen = false;
    showCode = false;
    el.classList.add('hidden');
  },
  toggle() {
    isOpen ? options.close() : options.open();
  },
  isOpen: () => isOpen,
};
