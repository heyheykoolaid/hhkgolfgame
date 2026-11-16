// Ball trails: the line your ball draws through the air. Sold at the pro shop (West Side); worn on every course.
export const TRAILS: { id: string; name: string; desc: string; price: number; color: string }[] = [
  { id: '', name: 'Classic', desc: 'The plain white line.', price: 0, color: '#ffffff' },
  { id: 'gold', name: 'Gold leaf', desc: 'Warm gold, for the modest winner.', price: 400, color: '#ffd24a' },
  { id: 'flame', name: 'Flame', desc: 'Orange-red. Looks fast.', price: 600, color: '#ff5a1e' },
  { id: 'ice', name: 'Ice', desc: 'Pale blue. Looks calm.', price: 600, color: '#8fe3ff' },
  { id: 'lime', name: 'Lime', desc: 'Loud green.', price: 600, color: '#9cff3a' },
  { id: 'pink', name: 'Neon pink', desc: 'You will be noticed.', price: 900, color: '#ff4fc3' },
  { id: 'rainbow', name: 'Rainbow', desc: 'Cycles through every colour as it flies.', price: 2500, color: 'rainbow' },
];
/** The colour to draw a trail in right now (the rainbow one moves with time). */
export function trailColor(id: string, t: number) {
  const c = TRAILS.find(x => x.id === id)?.color || '#ffffff';
  return c === 'rainbow' ? `hsl(${Math.round((t * 140) % 360)},100%,62%)` : c;
}
