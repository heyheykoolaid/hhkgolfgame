import { describe, it, expect } from 'vitest';
import { handValue, newTable, deal, hit, stand, double, split, canSplit, totalPayout, newShoe, type BJState } from './blackjack';
// card helpers: rank index 0=A..12=K, clubs
const c = (r: string) => ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].indexOf(r);
/** A table whose shoe deals exactly these cards in order (the shoe pops from the end). */
const rig = (...cards: string[]): BJState => {
  const t = newTable();
  t.shoe = [...newShoe().slice(0, 100), ...cards.map(c).reverse()];
  return t;
};
describe('blackjack', () => {
  it('hand values and soft aces', () => {
    expect(handValue([c('A'), c('6')])).toEqual({ total: 17, soft: true });
    expect(handValue([c('A'), c('6'), c('K')])).toEqual({ total: 17, soft: false });
    expect(handValue([c('A'), c('A'), c('9')])).toEqual({ total: 21, soft: true });
    expect(handValue([c('K'), c('Q'), c('2')]).total).toBe(22);
  });
  it('blackjack pays 3:2', () => {
    const t = deal(rig('A', '9', 'K', '7'), 100);
    expect(t.phase).toBe('done');
    expect(t.results[0].outcome).toBe('blackjack');
    expect(totalPayout(t)).toBe(250);
  });
  it('both blackjack pushes', () => {
    const t = deal(rig('A', 'A', 'K', 'Q'), 100);
    expect(t.results[0].outcome).toBe('push');
    expect(totalPayout(t)).toBe(100);
  });
  it('dealer blackjack beats 20', () => {
    const t = deal(rig('K', 'A', 'Q', 'J'), 100);
    expect(t.results[0].outcome).toBe('lose');
  });
  it('dealer stands on soft 17 and player 18 wins', () => {
    let t = deal(rig('10', 'A', '8', '6'), 50);
    t = stand(t);
    expect(t.dealer.length).toBe(2);
    expect(t.results[0].outcome).toBe('win');
    expect(totalPayout(t)).toBe(100);
  });
  it('bust loses without the dealer drawing', () => {
    let t = deal(rig('10', '6', '6', '10', 'K'), 50);
    t = hit(t);
    expect(t.results[0].outcome).toBe('bust');
    expect(t.dealer.length).toBe(2);
  });
  it('dealer draws to 17 and busts', () => {
    let t = deal(rig('10', '6', '8', '10', 'K'), 50);
    t = stand(t);
    expect(t.results[0].outcome).toBe('win');
    expect(t.dealer.length).toBe(3);
  });
  it('double takes one card and doubles the bet', () => {
    let t = deal(rig('5', '9', '6', '8', 'K'), 40);
    t = double(t);
    expect(t.hands[0].cards.length).toBe(3);
    expect(t.hands[0].bet).toBe(80);
    expect(t.results[0].outcome).toBe('win');
    expect(totalPayout(t)).toBe(160);
  });
  it('split plays two hands', () => {
    let t = deal(rig('8', '10', '8', '7', '3', '10', 'K'), 20);
    expect(canSplit(t)).toBe(true);
    t = split(t);
    expect(t.hands.length).toBe(2);
    expect(t.hands[0].cards.length).toBe(2); // 8+3
    t = hit(t);
    t = stand(t); // 8+3+10 = 21 auto-stands; then hand 2 = 8+K, stand
    expect(t.phase).toBe('done');
    expect(t.results.map(r => r.outcome)).toEqual(['win', 'win']);
    expect(totalPayout(t)).toBe(80);
  });
  it('split aces get one card each and 21 is not a blackjack', () => {
    let t = deal(rig('A', '9', 'A', '8', 'K', '5'), 10);
    t = split(t);
    expect(t.phase).toBe('done');
    expect(t.results.map(r => r.outcome)).toEqual(['win', 'lose']);
    expect(totalPayout(t)).toBe(20);
  });
});
