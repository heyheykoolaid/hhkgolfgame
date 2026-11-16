import { describe, it, expect } from 'vitest';
import { slotReturn, slotPay, slotStop, pokerHand, pokerDeck, pokerPay } from './vlt';

const C = (s: string) =>
  s.split(' ').map(c => {
    const r = '23456789TJQKA'.indexOf(c[0]),
      su = 'shdc'.indexOf(c[1]);
    return su * 13 + r;
  });
describe('slots', () => {
  it('keeps a house edge of 3 to 7%', () => {
    const r = slotReturn();
    expect(r).toBeGreaterThan(0.93);
    expect(r).toBeLessThan(0.97);
  });
  it('pays lines', () => {
    expect(slotPay('gem', 'gem', 'gem')).toBe(500);
    expect(slotPay('cherry', 'cherry', 'bell')).toBe(2);
    expect(slotPay('cherry', 'bell', 'cherry')).toBe(1);
    expect(slotPay('bell', 'cherry', 'cherry')).toBe(0);
    expect(slotStop(0)).toBe('cherry');
    expect(slotStop(0.9999)).toBe('gem');
  });
});
describe('video poker', () => {
  it('names hands', () => {
    expect(pokerHand(C('Ts Js Qs Ks As'))).toBe('royal');
    expect(pokerHand(C('9h Th Jh Qh Kh'))).toBe('straightflush');
    expect(pokerHand(C('As 2s 3s 4s 5s'))).toBe('straightflush');
    expect(pokerHand(C('7s 7h 7d 7c 2s'))).toBe('four');
    expect(pokerHand(C('7s 7h 7d 2c 2s'))).toBe('fullhouse');
    expect(pokerHand(C('2s 9s Js Ks 4s'))).toBe('flush');
    expect(pokerHand(C('As 2h 3s 4d 5s'))).toBe('straight');
    expect(pokerHand(C('Ts Jh Qs Kd As'))).toBe('straight');
    expect(pokerHand(C('Qs Kh As 2d 3s'))).toBe('none');
    expect(pokerHand(C('7s 7h 7d 3c 2s'))).toBe('three');
    expect(pokerHand(C('7s 7h 3d 3c 2s'))).toBe('twopair');
    expect(pokerHand(C('Js Jh 3d 4c 2s'))).toBe('jacks');
    expect(pokerHand(C('Ts Th 3d 4c 2s'))).toBe('none');
    expect(pokerPay('fullhouse')).toBe(9);
  });
  it('shuffles a whole deck', () => {
    let s = 7;
    const d = pokerDeck(() => ((s = (s * 16807) % 2147483647) - 1) / 2147483646);
    expect(new Set(d).size).toBe(52);
  });
});
