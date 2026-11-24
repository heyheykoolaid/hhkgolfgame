// Where a round is played. The hole generator makes the same holes everywhere; a locale changes how they are dressed
// (turf colours, trees, rocks, what stands on the horizon). The locale travels inside the match id, like the hole does,
// so everyone in a group gets the same one.
export const LOCALES = [
  { id: 'hills', name: 'Golden Hills', ch: '0', blurb: 'Live oaks, fan palms and the city skyline at golden hour.' },
  { id: 'peak', name: 'Boulder Peak', ch: '1', blurb: 'Pine forest, granite boulders and snow on the peaks all round.' },
  { id: 'moon', name: 'The Moon', ch: '2', blurb: 'Low gravity, no roll, craters and moon buggies. The Earth hangs in a black sky.' },
] as const;
export type LocaleId = (typeof LOCALES)[number]['id'];
/** The locale of the round being played (set by the golf mode when a round starts). */
export const locale = { id: 'hills' as LocaleId };
export const localeName = (id: LocaleId = locale.id) => LOCALES.find(l => l.id === id)!.name;

/** Which character of a match id holds the locale: the first one after the hole or tournament code. */
function slot(id: string) {
  const c = /^c[rtk]/.test(id) ? 1 : 0; // 'c' in front = a casual round
  if (id[c] === 'k') return c + 2; // a real course's card (shared tournament.ts courseIdFor)
  if (id[c] === 'r') return c + 6;
  if (id[c] === 't') return c + 7;
  return -1;
}
export function localeFromMatch(id: string): LocaleId {
  const i = slot(String(id || ''));
  return (i >= 0 && LOCALES.find(l => l.ch === id[i])?.id) || 'hills';
}
/** Write a locale into a freshly made match id (before any 'c' is put in front). */
export function withLocale(id: string, loc: LocaleId) {
  const i = slot(id);
  if (i < 0 || i >= id.length) return id;
  return id.slice(0, i) + LOCALES.find(l => l.id === loc)!.ch + id.slice(i + 1);
}
