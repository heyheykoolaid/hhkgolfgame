// The controls panel: a card down the right-hand side that always shows what the keys and mouse do *right now*
// (walking, driving, Build Mode, the blackjack table, each step of rolling, addressing the ball, putting…).
// Whoever owns the current situation calls `controls.set(id, title, rows)` every frame; the panel only redraws when
// the id or its rows change. Rows are [keys, what it does]; a key written 'mouse:…' draws a mouse instead of a keycap.
// The tab at the top folds it away (remembered).
import { opts } from './options';
export type ControlRow = [keys: string | string[], label: string, hot?: boolean];

const KEY = 'gh_controls';
let el: HTMLElement | null = null,
  body: HTMLElement | null = null,
  shown = '',
  open = true;

function ensure() {
  if (el || typeof document === 'undefined') return;
  try {
    open = localStorage.getItem(KEY) !== 'closed';
  } catch {}
  el = document.createElement('div');
  el.id = 'controls';
  el.innerHTML = '<button class="ctab" title="Show or hide the controls"></button><div class="cbody"></div>';
  document.body.appendChild(el);
  body = el.querySelector('.cbody');
  const tab = el.querySelector<HTMLButtonElement>('.ctab')!;
  const paint = () => {
    el!.classList.toggle('closed', !open);
    tab.textContent = open ? 'Controls · C ▸' : '◂ Controls · C';
  };
  const flip = () => {
    open = !open;
    try {
      localStorage.setItem(KEY, open ? 'open' : 'closed');
    } catch {}
    paint();
  };
  tab.onclick = e => {
    e.stopPropagation();
    flip();
    tab.blur();
  };
  // C shows or hides the panel anywhere in the game (not while typing). Registered early and in the capture phase,
  // so modes that swallow the keyboard (mini putt, blackjack) don't swallow this.
  addEventListener(
    'keydown',
    e => {
      const t = e.target as HTMLElement | null;
      if (e.code !== 'KeyC' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
      flip();
    },
    true,
  );
  paint();
}
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
function keycap(k: string) {
  if (k.startsWith('mouse:')) return `<span class="cmouse ${esc(k.slice(6))}"><i></i></span>`;
  return `<kbd>${esc(k)}</kbd>`;
}

export const controls = {
  /** Show these controls. Call every frame from whoever owns the situation; cheap when nothing changed. */
  set(id: string, title: string, rows: ControlRow[]) {
    ensure();
    if (!el || !body) return;
    const sig = id + '|' + title + '|' + rows.map(r => (Array.isArray(r[0]) ? r[0].join('+') : r[0]) + ':' + r[1] + (r[2] ? '!' : '')).join('|');
    if (sig === shown) return;
    shown = sig;
    body.innerHTML =
      `<h4>${esc(title)}</h4>` +
      rows
        .map(([keys, label, hot]) => {
          const ks = (Array.isArray(keys) ? keys : [keys]).map(keycap).join('');
          return `<div class="crow${hot ? ' hot' : ''}"><span class="ckeys">${ks}</span><span class="clabel">${esc(label)}</span></div>`;
        })
        .join('');
    el.classList.remove('empty');
    el.classList.toggle('off', !opts.panel);
    el.classList.toggle('low', id.startsWith('g')); // on the course it sits low, clear of the swing meter
  },
  /** Nothing to show (a loading screen, a results card). */
  clear() {
    ensure();
    if (!el || shown === '') return;
    shown = '';
    el.classList.add('empty');
  },
};
