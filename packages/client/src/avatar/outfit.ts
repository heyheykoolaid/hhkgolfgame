// The player's look: one Outfit, edited in the wardrobe, saved per account, sent to other players in presence,
// and used for the same golfer in the lobby and on the course.
import {
  TOPS,
  JACKETS,
  PANTS,
  SHOES,
  HAIRS,
  PAINTS,
  GLASSES,
  TATTOOS,
  TAT_SPOTS,
  BODIES,
  PUTTERS,
  CLUB_SETS,
  type Outfit,
} from '../characters/golfer';
import { BALL } from './balls';
import { bodyReady } from '../characters/mhGolfer';

export const SWATCH = {
  skin: ['#f1c9a5', '#d8a47f', '#b9825b', '#a06a45', '#8d5a3b', '#6e4429', '#55331e'],
  hair: ['#1b1310', '#2a1c12', '#4a2f1c', '#7a4e2a', '#b8854a', '#d8b878', '#8a8a86', '#c03a2a'],
  shirt: [
    '#2f3a44',
    '#1d1d1f',
    '#f1eee6',
    '#6a2b26',
    '#c8452f',
    '#e9b23a',
    '#3b4a2e',
    '#4f6b3a',
    '#2b4a52',
    '#3f6fa8',
    '#4a3a5e',
    '#d98aa8',
    '#8a6a45',
    '#5a4a30',
  ],
  print: ['#e9b23a', '#f1eee6', '#1d1d1f', '#c8452f', '#4fb0c6', '#8fd36a'],
  pants: ['#6b6447', '#5a5a52', '#3a3f4a', '#2b3550', '#1d1d1f', '#8a7a5a', '#a8956e', '#4a5a3a', '#6a4632'],
  shoes: ['#30302e', '#f1eee6', '#7a2626', '#2b3a5a', '#4a6a3a', '#c8a050'],
  jacket: ['#3b4a2e', '#1d1d1f', '#2b3550', '#5a4a30', '#6a2b26', '#8a8a86', '#f1eee6', '#c8452f', '#2b4a52', '#e9b23a'],
  ink: ['#1c2430', '#0e0e10', '#2b3f5a', '#3b4a2e', '#6a2b26', '#4a3a5e'],
  paint: ['#1d1d1f', '#f1eee6', '#c8452f', '#e9b23a', '#3f6fa8', '#2f7a4b', '#7a5bd0', '#d98aa8'],
  cap: ['#8a2f28', '#c8452f', '#1d1d1f', '#f1eee6', '#2f7a4b', '#3f6fa8', '#e9b23a', '#5a4a30', '#7a5bd0', '#2eaa8a'],
};
export const DEFAULT_LOOK: Outfit = {
  skin: '#b9825b',
  hair: '#2a1c12',
  shirt: '#2f3a44',
  print: '#e9b23a',
  pants: '#6b6447',
  shoes: '#30302e',
  sole: '#e8e2d4',
  cap: '#8a2f28',
  capStyle: 'back',
  stubble: true,
  top: 'tee',
  jacket: 'none',
  jacketColor: '#3b4a2e',
  pantsStyle: 'jeans',
  shoeStyle: 'sneakers',
  hairStyle: 'short',
  paint: 'none',
  paintColor: '#1d1d1f',
  glasses: 'none',
  chain: false,
  watch: false,
  earring: false,
};

const HEX = /^#[0-9a-f]{6}$/i;
/** Accept only known-shaped values (looks arrive from other players and from storage). */
export function sanitizeLook(x: any): Outfit {
  const o = { ...DEFAULT_LOOK };
  if (!x || typeof x !== 'object') return o;
  for (const k of ['skin', 'hair', 'shirt', 'print', 'pants', 'shoes', 'cap', 'sole', 'jacketColor', 'paintColor', 'tatInk'] as const)
    if (typeof x[k] === 'string' && HEX.test(x[k])) (o as any)[k] = x[k];
  if (x.capStyle === 'back' || x.capStyle === 'front' || x.capStyle === 'none' || x.capStyle === 'fedora') o.capStyle = x.capStyle;
  const pick = (k: keyof Outfit, list: readonly string[]) => {
    if (typeof x[k] === 'string' && list.includes(x[k])) (o as any)[k] = x[k];
  };
  pick('body', BODIES);
  pick('top', TOPS);
  pick('jacket', JACKETS);
  pick('pantsStyle', PANTS);
  pick('shoeStyle', SHOES);
  pick('hairStyle', HAIRS);
  pick('paint', PAINTS);
  pick('glasses', GLASSES);
  for (const k of TAT_SPOTS) if (typeof x[k] === 'string' && TATTOOS.some(t => t.id === x[k])) o[k] = x[k];
  if ((o.body === 'female' || o.body === 'fmuscle') && o.top === 'none') o.top = 'tee'; // the female bodies always wear a top
  for (const k of ['chain', 'watch', 'earring'] as const) if (typeof x[k] === 'boolean') o[k] = x[k];
  if (typeof x.stubble === 'boolean') o.stubble = x.stubble;
  if (typeof x.ball === 'string' && BALL.has(x.ball)) o.ball = x.ball;
  if (typeof x.putter === 'string' && (PUTTERS as readonly string[]).includes(x.putter)) o.putter = x.putter;
  if (typeof x.clubs === 'string' && (CLUB_SETS as readonly string[]).includes(x.clubs)) o.clubs = x.clubs;
  return o;
}
export const lookKey = (o: Outfit) => {
  const { ball: _b, ...rest } = sanitizeLook(o);
  return JSON.stringify(rest) + (bodyReady(rest.body) ? '' : '~'); // changes when a body type finishes loading, so the golfer is rebuilt
}; // the ball skin doesn't change the golfer model
/** A different starting look per player, so a new group doesn't all look the same. */
export function randomLook(seed: string): Outfit {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const pick = <T>(a: T[], k: number) => a[((h >>> k) & 0xffff) % a.length];
  return {
    ...DEFAULT_LOOK,
    skin: pick(SWATCH.skin, 0),
    hair: pick(SWATCH.hair, 3),
    shirt: pick(SWATCH.shirt, 6),
    pants: pick(SWATCH.pants, 9),
    cap: pick(SWATCH.cap, 12),
    shoes: pick(SWATCH.shoes, 15),
    capStyle: (['back', 'front', 'back', 'none'] as const)[(h >>> 18) & 3],
    stubble: ((h >>> 21) & 1) === 1,
    top: (['tee', 'tee', 'long', 'button'] as const)[(h >>> 4) & 3],
    pantsStyle: (['jeans', 'jeans', 'shorts', 'slacks'] as const)[(h >>> 10) & 3],
    shoeStyle: (['sneakers', 'trainers', 'sneakers', 'loafers'] as const)[(h >>> 14) & 3],
    hairStyle: (['short', 'short1', 'short4', 'short', 'afro', 'short3', 'bob2', 'pony'] as const)[(h >>> 23) & 7],
  };
}
const LS = 'gh.look.v1';
export function loadLocalLook(): Outfit | null {
  try {
    const s = localStorage.getItem(LS);
    return s ? sanitizeLook(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}
export function saveLocalLook(o: Outfit) {
  try {
    localStorage.setItem(LS, JSON.stringify(sanitizeLook(o)));
  } catch {}
}
