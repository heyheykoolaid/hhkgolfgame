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

describe('a real course card', () => {
  it('travels inside the match id and comes back the same, with a casual c in front too', async () => {
    const { courseIdFor, parseTournament, cardFromDigits, tournamentHoles } = await import('./tournament');
    const { holeIdea } = await import('./holegen');
    const digits = '342003225', // Pebble Beach's front nine as packed: par 4,5,4,3,3,4,4,4,5 with its hard holes marked
      id = courseIdFor(9, digits, 4321);
    expect(id.length).toBe(11);
    for (const mid of [id, id.slice(0, 2) + '1' + id.slice(3)]) {
      const t = parseTournament(mid)!;
      expect(t.n).toBe(9);
      expect(t.course).toBe(4321);
      expect(t.card).toEqual(cardFromDigits(digits, 9));
      const holes = tournamentHoles(t.seed, t.n, t.card);
      expect(holes.map(s => holeIdea(s).par)).toEqual(t.card!.pars);
      expect(tournamentHoles(t.seed, t.n, t.card)).toEqual(holes); // everyone in the group gets the same holes
    }
    const three = parseTournament(courseIdFor(3, digits, 7))!;
    expect(three.card!.pars).toEqual([4, 5, 4]);
    // a random tail makes the round its own without changing the course, the card or the holes
    const tailed = courseIdFor(9, digits, 4321, 'Zq7!x9');
    expect(tailed).toBe(id + 'zq7x');
    expect(parseTournament(tailed)).toEqual(parseTournament(id));
    expect(parseTournament('t9abcde0xxxxx')!.card).toBeUndefined();
  });
});
