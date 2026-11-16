// Real courses' scorecards for "Home course" rounds (public/data/courses.json, packed by tools/courses/pack.py from
// OpenGolfAPI's open dataset, Open Database License; see docs/credits.md). The list is fetched the first time it is
// needed. A course's place in the list is its number inside match ids (shared tournament.ts courseIdFor).
export interface RealCourse {
  i: number;
  name: string;
  state: string;
  city: string;
  yards: number;
  /** nine digits, one per hole: (par − 3) × 2 + (1 if one of the course's six hardest) */
  card: string;
}
let all: Promise<RealCourse[]> | null = null;
export function loadCourses() {
  all ??= fetch(new URL('data/courses.json', document.baseURI).href)
    .then(r => r.json())
    .then((rows: [string, string, string, number, string][]) =>
      rows.map(([name, state, city, yards, card], i) => ({ i, name, state, city, yards, card })),
    )
    .catch(() => {
      all = null;
      return [];
    });
  return all;
}
export const courseAt = async (i: number) => (await loadCourses())[i] || null;
/** Courses whose name, city or state match every word typed, best first (names that start with the text lead). */
export async function searchCourses(q: string, max = 8) {
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 1 || /^[a-z]{2}$/.test(w));
  if (!words.length) return [];
  const list = await loadCourses(),
    hits: [number, RealCourse][] = [];
  for (const c of list) {
    const hay = `${c.name} ${c.city} ${c.state}`.toLowerCase();
    if (!words.every(w => hay.includes(w))) continue;
    const n = c.name.toLowerCase();
    hits.push([(n.startsWith(words[0]) ? 0 : n.includes(words[0]) ? 1 : 2) * 1000 + c.name.length, c]);
  }
  return hits
    .sort((a, b) => a[0] - b[0])
    .slice(0, max)
    .map(h => h[1]);
}
export const cardPars = (card: string, n: number) => [...card].slice(0, n).map(d => 3 + (+d >> 1));
