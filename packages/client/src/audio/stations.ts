// Live stations for the cart radio's ten bands (audio/radio.ts). Each band tries its stations in order and keeps the
// first that plays; a band with none that work (or none listed) plays its shipped public-domain tracks instead.
// Only used off the Claude artifact page, which can't play sound from other websites.
//
// Picked for a mixed lobby: listener-supported, ad-free stations, mostly SomaFM. Stream addresses as published by
// the stations (Nov 2026); they can't be tested from where the game is built, so check them in the game: the stereo
// says "LIVE" with the station's name when one plays. To change a band, edit its list. Key = the band's tag.
export interface Station {
  name: string;
  url: string;
}
const soma = (id: string, name: string): Station[] => [
  { name: `SomaFM ${name}`, url: `https://ice1.somafm.com/${id}-128-mp3` },
  { name: `SomaFM ${name}`, url: `https://ice2.somafm.com/${id}-128-mp3` }, // (a second server, if the first is busy)
];
export const STATIONS: Record<string, Station[]> = {
  'TIKI FM': [...soma('illstreet', 'Illinois Street Lounge'), ...soma('secretagent', 'Secret Agent')],
  YACHT: soma('seventies', 'Left Coast 70s'),
  'HANG TEN': [], // (no surf station found with a published address that could be trusted: the shipped surf tracks play)
  ITALO: [...soma('u80s', 'Underground 80s'), ...soma('poptron', 'PopTron')],
  'CITY POP': soma('vaporwaves', 'Vaporwaves'),
  OUTLAW: soma('bootliquor', 'Boot Liquor'),
  DUB: soma('reggae', 'Heavyweight Reggae'),
  SPACE: [...soma('dronezone', 'Drone Zone'), ...soma('spacestation', 'Space Station Soma'), ...soma('deepspaceone', 'Deep Space One')],
  'BIG BAND': [{ name: 'Swing FM', url: 'https://swingfm.ice.infomaniak.ch/swingfm-128.mp3' }],
  'THE STATIC': [{ name: 'WFMU Freeform', url: 'https://stream0.wfmu.org/freeform-128k' }, ...soma('sf1033', 'SF 10-33')],
};
/** Live radio is possible here: not on the artifact page (it blocks other websites' sound). */
export const LIVE_OK = typeof window !== 'undefined' && !(window as any).claude && /^https?:$/.test(location.protocol);
