import { describe, it, expect } from 'vitest';
import { tournamentHoles, tournamentIdFor, parseTournament, cupFor, holeIdea } from './index';
describe('tournaments', () => {
  it('ids round-trip and fit the 12-char group id', () => {
    const id = tournamentIdFor(9, 123456, 'ab3de');
    expect(id.length).toBeLessThanOrEqual(12);
    expect(parseTournament(id)).toMatchObject({ n: 9, seed: 123456 });
    expect(parseTournament('rabcdeqwert')).toBeNull();
  });
  it('9 holes: par 36, fresh idea each hole, easy opener, hard finisher, deterministic', () => {
    for (const seed of [1, 777, 31337, 99999, 4242424]) {
      const h = tournamentHoles(seed, 9),
        ideas = h.map(holeIdea);
      expect(h).toEqual(tournamentHoles(seed, 9));
      expect(ideas.reduce((t, i) => t + i.par, 0)).toBe(36);
      expect(new Set(ideas.map(i => i.kind)).size).toBe(9);
      expect(['corner', 'ridge', 'valley', 'reachable', 'stamp']).toContain(ideas[0].kind);
      expect(['cape', 'split', 'carry', 'redan', 'double', 'driveable']).toContain(ideas[8].kind);
    }
  });
  it('cups have names', () => {
    for (const s of [1, 2, 3, 4, 5, 6]) {
      const c = cupFor(s, 3);
      expect(c.title.length).toBeGreaterThan(8);
    }
    console.log([1, 2, 3, 4, 5, 6, 7, 8].map(s => cupFor(s, s % 2 ? 3 : 9).title).join(' | '));
  });
});
