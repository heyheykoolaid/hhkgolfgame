// The tee board (lobby): choose a hole or a tournament, play solo, or queue up for a group round. The first player in
// the queue is the host and starts the round; everyone else in the group follows when they see the host's start.
import { loadCourses, searchCourses, cardPars, type RealCourse } from '../golf/homeCourse';
import {
  useHole,
  codeSeed,
  matchIdFor,
  randomHoleSeed,
  HOLE_LEN,
  tournamentIdFor,
  courseIdFor,
  randomTourSeed,
  cupFor,
  tournamentHoles,
  holeIdea,
  type TourSize,
} from '@gh/shared';
import { trophyImage } from '../world/trophy';
import { colorFor } from '../avatar/colors';

export const GROUP_MAX = 4;
export interface TeePeer {
  by: string;
  q?: number;
  away: boolean;
  go?: { id: string; at: number; m: string[]; bb?: 1 } | null;
}
export interface TeeHost {
  uid(): string;
  online(): boolean;
  nameOf(uid: string, fallback?: string): string;
  q(): number;
  setQ(at: number): void; // my place in the queue (0 = not queued); publishes it
  setGo(go: { id: string; at: number; m: string[]; bb?: 1 }): void; // host: announce the start to the group (bb: the Bad Batch)
  peers(): TeePeer[];
  openModal(title: string, html: string): void;
  closeModal(): void;
  toast(html: string, ms?: number): void;
  start(matchId: string, group: boolean, order: string[]): void; // leave the lobby for the round
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

import { LOCALES, withLocale, type LocaleId } from '../world/locale';

/** The Moon's postcard: black sky and stars, the Earth, grey dunes with a crater, a buggy, and the flag on its pad. */
function moonPic(c: HTMLCanvasElement, x: CanvasRenderingContext2D) {
  x.fillStyle = '#07080d';
  x.fillRect(0, 0, 320, 180);
  let sd = 77;
  const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 160; i++) {
    x.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
    x.fillRect(r() * 320, r() * 120, r() < 0.15 ? 2 : 1, r() < 0.15 ? 2 : 1);
  }
  // the Earth, lit from the left (where the low sun is)
  x.fillStyle = '#1f4f8f';
  x.beginPath();
  x.arc(226, 52, 24, 0, 7);
  x.fill();
  x.fillStyle = '#4f7a3a';
  for (const [ex, ey, ew, eh] of [
    [218, 44, 9, 6],
    [232, 58, 7, 9],
    [212, 62, 6, 4],
  ]) {
    x.beginPath();
    x.ellipse(ex, ey, ew, eh, 0.4, 0, 7);
    x.fill();
  }
  x.fillStyle = 'rgba(7,8,13,0.78)';
  x.beginPath();
  x.arc(236, 52, 24, -Math.PI / 2, Math.PI / 2);
  x.ellipse(236, 52, 12, 24, 0, Math.PI / 2, -Math.PI / 2, true);
  x.fill();
  // grey ground, lit gold from the low sun
  const gr = x.createLinearGradient(0, 110, 0, 180);
  gr.addColorStop(0, '#a49d90');
  gr.addColorStop(1, '#6e6a63');
  x.fillStyle = gr;
  x.beginPath();
  x.moveTo(0, 124);
  x.bezierCurveTo(70, 108, 170, 130, 320, 114);
  x.lineTo(320, 180);
  x.lineTo(0, 180);
  x.fill();
  // a crater with a lit rim
  x.fillStyle = '#5d5952';
  x.beginPath();
  x.ellipse(84, 156, 34, 9, 0, 0, 7);
  x.fill();
  x.strokeStyle = '#c9bea8';
  x.lineWidth = 2;
  x.beginPath();
  x.ellipse(84, 155, 36, 10, 0, Math.PI, 2 * Math.PI);
  x.stroke();
  // the green: a landing pad, with the flag
  x.fillStyle = '#86a24c';
  x.beginPath();
  x.ellipse(196, 132, 30, 6, 0, 0, 7);
  x.fill();
  x.fillStyle = '#f1eee6';
  x.fillRect(196, 104, 1.6, 28);
  x.fillStyle = '#e2574c';
  x.beginPath();
  x.moveTo(198, 104);
  x.lineTo(211, 108);
  x.lineTo(198, 112);
  x.fill();
  // a moon buggy
  x.fillStyle = '#c8582e';
  x.fillRect(250, 146, 30, 6);
  x.fillStyle = '#d8a23a';
  x.fillRect(252, 140, 10, 6);
  x.fillStyle = '#2b2b2d';
  for (const wx of [255, 276]) {
    x.beginPath();
    x.arc(wx, 154, 4.5, 0, 7);
    x.fill();
  }
  x.fillStyle = '#eceff1';
  x.beginPath();
  x.arc(270, 140, 4, 0, 7);
  x.fill();
  return c.toDataURL('image/jpeg', 0.85);
}
/** The Old Estate's postcard: a blood-orange sky, the manor on its rise, dead trees, fog over the moat. */
function hauntPic(c: HTMLCanvasElement, x: CanvasRenderingContext2D) {
  const sky = x.createLinearGradient(0, 0, 0, 130);
  sky.addColorStop(0, '#2a1630');
  sky.addColorStop(0.6, '#7a2a2a');
  sky.addColorStop(1, '#d0602e');
  x.fillStyle = sky;
  x.fillRect(0, 0, 320, 180);
  x.fillStyle = '#ff8a40';
  x.beginPath();
  x.arc(240, 104, 22, 0, 7);
  x.fill();
  // the manor
  x.fillStyle = '#1c1418';
  x.fillRect(110, 62, 100, 52);
  x.fillRect(92, 50, 22, 64);
  x.fillRect(206, 56, 22, 58);
  for (const [tx, h] of [
    [103, 38],
    [217, 44],
    [160, 30],
  ]) {
    x.beginPath();
    x.moveTo(tx - 9, h + 14);
    x.lineTo(tx, h - 10);
    x.lineTo(tx + 9, h + 14);
    x.fill();
  }
  x.beginPath();
  x.moveTo(106, 62);
  x.lineTo(160, 36);
  x.lineTo(214, 62);
  x.fill();
  x.fillStyle = '#ffb35a';
  for (const [wx, wy] of [
    [124, 74],
    [150, 90],
    [186, 74],
    [100, 66],
  ])
    x.fillRect(wx, wy, 5, 10);
  // the lawn and the moat
  x.fillStyle = '#323820';
  x.fillRect(0, 114, 320, 66);
  x.fillStyle = '#1f2a26';
  x.beginPath();
  x.ellipse(170, 146, 70, 14, 0, 0, 7);
  x.fill();
  x.fillStyle = '#4f5f36';
  x.beginPath();
  x.ellipse(170, 146, 52, 9, 0, 0, 7);
  x.fill();
  x.fillStyle = '#5a3e28';
  x.fillRect(164, 152, 12, 18);
  // dead trees
  x.strokeStyle = '#140e10';
  for (const tx of [26, 56, 280, 300]) {
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(tx, 170);
    x.lineTo(tx + 2, 112);
    x.stroke();
    x.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      x.beginPath();
      x.moveTo(tx + 1, 140 - k * 7);
      x.lineTo(tx + (k % 2 ? 16 : -16), 126 - k * 9);
      x.stroke();
    }
  }
  // fog
  const fog = x.createLinearGradient(0, 110, 0, 180);
  fog.addColorStop(0, 'rgba(200,110,80,0.0)');
  fog.addColorStop(1, 'rgba(200,110,80,0.45)');
  x.fillStyle = fog;
  x.fillRect(0, 100, 320, 80);
  return c.toDataURL('image/jpeg', 0.85);
}
/** A small painted postcard of each course, for the tee board's cards. */
const pics = new Map<string, string>();
function localePic(id: LocaleId) {
  let u = pics.get(id);
  if (u) return u;
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 180;
  const x = c.getContext('2d')!,
    sky = x.createLinearGradient(0, 0, 0, 120),
    peak = id === 'peak';
  if (id === 'moon') {
    pics.set(id, (u = moonPic(c, x)));
    return u;
  }
  if (id === 'haunt' || id === 'trip') {
    pics.set(id, (u = id === 'haunt' ? hauntPic(c, x) : moonPic(c, x)));
    return u;
  }
  sky.addColorStop(0, peak ? '#8fb0c8' : '#c9a98c');
  sky.addColorStop(1, peak ? '#f2d7b0' : '#f6cf8e');
  x.fillStyle = sky;
  x.fillRect(0, 0, 320, 180);
  x.fillStyle = '#fff3cf';
  x.beginPath();
  x.arc(peak ? 250 : 236, peak ? 66 : 84, 15, 0, 7);
  x.fill();
  let sd = peak ? 11 : 5;
  const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  if (peak) {
    // two ranges of snow peaks
    for (const [base, hi, col] of [
      [116, 78, '#7f8794'],
      [128, 54, '#646c70'],
    ] as [number, number, string][]) {
      for (let i = 0; i < 6; i++) {
        const px = -20 + i * 68 + r() * 30,
          h = hi * (0.7 + r() * 0.5),
          w = 60 + r() * 30;
        x.fillStyle = col;
        x.beginPath();
        x.moveTo(px - w, base);
        x.lineTo(px, base - h);
        x.lineTo(px + w, base);
        x.fill();
        x.fillStyle = '#f4f1ea';
        x.beginPath();
        x.moveTo(px - w * 0.3, base - h * 0.7);
        x.lineTo(px, base - h);
        x.lineTo(px + w * 0.3, base - h * 0.7);
        x.lineTo(px + w * 0.12, base - h * 0.62);
        x.lineTo(px, base - h * 0.72);
        x.lineTo(px - w * 0.14, base - h * 0.6);
        x.fill();
      }
    }
  } else {
    // the city on the horizon
    for (let i = 0; i < 26; i++) {
      const w = 8 + r() * 10,
        h = 18 + r() * 46;
      x.fillStyle = `rgba(${170 + r() * 30},${130 + r() * 25},${95 + r() * 20},.9)`;
      x.fillRect(i * 12.5 + r() * 4, 118 - h, w, h);
    }
  }
  // rolling ground and a ribbon of fairway to a flag
  x.fillStyle = peak ? '#4b6b44' : '#61793a';
  x.beginPath();
  x.moveTo(0, 122);
  x.bezierCurveTo(80, 104, 200, 132, 320, 112);
  x.lineTo(320, 180);
  x.lineTo(0, 180);
  x.fill();
  x.fillStyle = peak ? '#6d9a56' : '#86a24c';
  x.beginPath();
  x.moveTo(110, 180);
  x.bezierCurveTo(150, 150, 120, 134, 190, 124);
  x.bezierCurveTo(215, 128, 205, 150, 230, 180);
  x.fill();
  x.fillStyle = '#f1eee6';
  x.fillRect(188, 100, 1.6, 24);
  x.fillStyle = '#e2574c';
  x.beginPath();
  x.moveTo(190, 100);
  x.lineTo(203, 104);
  x.lineTo(190, 108);
  x.fill();
  // trees: pines, or oaks and a palm
  for (let i = 0; i < 9; i++) {
    const tx = i < 5 ? 8 + i * 22 + r() * 8 : 232 + (i - 5) * 22 + r() * 8,
      ty = 128 + r() * 34,
      s = 0.7 + (ty - 128) / 40;
    if (peak) {
      x.fillStyle = '#2f4a2c';
      for (let k = 0; k < 3; k++) {
        x.beginPath();
        x.moveTo(tx - (11 - k * 3) * s, ty - k * 9 * s);
        x.lineTo(tx, ty - (20 + k * 9) * s);
        x.lineTo(tx + (11 - k * 3) * s, ty - k * 9 * s);
        x.fill();
      }
      x.fillStyle = '#4a3a2a';
      x.fillRect(tx - 1.2 * s, ty, 2.4 * s, 5 * s);
    } else {
      x.fillStyle = '#4a3a2a';
      x.fillRect(tx - 1.5 * s, ty - 8 * s, 3 * s, 10 * s);
      x.fillStyle = '#4f6a30';
      x.beginPath();
      x.ellipse(tx, ty - 14 * s, 15 * s, 9 * s, 0, 0, 7);
      x.fill();
    }
  }
  if (peak) {
    // a couple of boulders
    x.fillStyle = '#8f8a82';
    for (const [bx, by, bs] of [
      [70, 160, 13],
      [262, 166, 10],
      [96, 168, 7],
    ]) {
      x.beginPath();
      x.ellipse(bx, by, bs, bs * 0.7, 0, 0, 7);
      x.fill();
    }
  }
  pics.set(id, (u = c.toDataURL('image/jpeg', 0.85)));
  return u;
}

/** The picture on the "real course" card: a scorecard on a clipboard and a pin. */
function realPic() {
  let u = pics.get('real' as any);
  if (u) return u;
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 180;
  const x = c.getContext('2d')!,
    g = x.createLinearGradient(0, 0, 0, 180);
  g.addColorStop(0, '#2f6a4a');
  g.addColorStop(1, '#1f4a34');
  x.fillStyle = g;
  x.fillRect(0, 0, 320, 180);
  x.save();
  x.translate(128, 96);
  x.rotate(-0.07);
  x.fillStyle = '#8a5f38';
  x.fillRect(-98, -72, 196, 144);
  x.fillStyle = '#f6efdc';
  x.fillRect(-88, -58, 176, 122);
  x.fillStyle = '#c9ccd0';
  x.fillRect(-26, -80, 52, 18);
  x.strokeStyle = '#3a2a1c';
  x.lineWidth = 1.5;
  x.font = '700 13px Inter, system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  ['HOLE', 'PAR', 'YOU'].forEach((t, r) => {
    x.fillStyle = r === 0 ? '#2f6a4a' : '#3a2a1c';
    x.textAlign = 'left';
    x.fillText(t, -82, -36 + r * 30);
    x.textAlign = 'center';
    for (let k = 0; k < 6; k++) {
      x.strokeRect(-40 + k * 21, -50 + r * 30, 21, 28);
      x.fillText(r === 0 ? String(k + 1) : r === 1 ? '454344'[k] : ['4', '6', '3', '', '', ''][k], -29.5 + k * 21, -36 + r * 30);
    }
  });
  x.restore();
  // a pin beside it
  x.fillStyle = '#f1ede4';
  x.fillRect(262, 40, 4, 110);
  x.fillStyle = '#e2332b';
  x.beginPath();
  x.moveTo(266, 42);
  x.lineTo(304, 56);
  x.lineTo(266, 70);
  x.fill();
  x.fillStyle = '#1a3a28';
  x.beginPath();
  x.ellipse(264, 152, 22, 6, 0, 0, 7);
  x.fill();
  pics.set('real' as any, (u = c.toDataURL('image/jpeg', 0.85)));
  return u;
}
/** A few courses at random (ones with a known length first, as their cards tend to be the complete ones). */
function someCourses(list: RealCourse[], n: number) {
  const out: RealCourse[] = [];
  for (let t = 0; t < 400 && out.length < n; t++) {
    const c = list[Math.floor(Math.random() * list.length)];
    if (c && !out.includes(c) && (c.yards > 0 || t > 200)) out.push(c);
  }
  return out;
}

export function createTeeBoard(host: TeeHost) {
  let teeOpen = false,
    teeHTML = '',
    started = '';
  // which hole: Hole 1, a fresh random layout each round, or a specific hole code (replay one you liked)
  let teeHole: 'rand' | 'code' = 'rand',
    teeLoc: LocaleId = 'hills',
    teeCode = '',
    codeInfo = '';
  // format: one hole, or a tournament (a mini cup of 3 holes or a 9-hole championship) with its own cup and trophy
  let teeFmt: 'one' | 3 | 9 = 'one',
    tourSeed = randomTourSeed(),
    teeCasual = false,
    // a round on a real course's card (golf/homeCourse.ts): the course picked, and how much of its front nine to play
    homeOn = false,
    home: RealCourse | null = null,
    homeN: TourSize = 9,
    ideas: RealCourse[] = []; // a few courses offered to try
  const trophyPics = new Map<string, string>();
  const trophyPic = (seed: number, n: TourSize, sub = '', px = 160) => {
    const k = `${seed}:${n}:${sub}:${px}`;
    let u = trophyPics.get(k);
    if (!u) {
      u = trophyImage(seed, n, sub, px);
      trophyPics.set(k, u);
    }
    return u;
  };
  function cupPreview(n: TourSize) {
    const cup = cupFor(tourSeed, n),
      par = tournamentHoles(tourSeed, n).reduce((t, x) => t + holeIdea(x).par, 0);
    return `<div class="cupprev"><img src="${trophyPic(tourSeed, n)}" alt=""><div><div class="cupname">${esc(cup.title)}</div><div class="muted">${n} holes · par ${par} · winner takes the trophy${n === 3 ? '' : ' home'}</div>
      <p class="muted" style="margin:6px 0 0">${n === 3 ? 'A quick three-hole cup.' : 'A full nine-hole championship.'} Lowest total wins; playing solo, finish at par or better to take it.</p><button id="t-reroll" class="mini">🎲 Another cup</button></div></div>`;
  }
  function describeCode(code: string) {
    const c = code
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '')
      .slice(0, 5);
    if (c.length < 5) return '';
    const h = useHole(codeSeed(c) || 1, teeLoc);
    const kind = h.plan?.kind ? ' · ' + h.plan.kind[0].toUpperCase() + h.plan.kind.slice(1) : '';
    return `${h.name} · par ${h.par}${kind} · ${Math.round(HOLE_LEN * 1.0936)} yd${h.pond ? (teeLoc === 'peak' ? ' · ravine' : ' · water') : ''}${h.buggies?.length ? ' · moon buggies' : ''}`;
  }
  /** The match id for the chosen hole (the hole travels inside the id, so everyone in the group gets the same one). */
  function teeMatchId() {
    if (homeOn && home) return withLocale(courseIdFor(homeN, home.card, home.i, newId()), teeLoc);
    if (teeFmt !== 'one') {
      const id = tournamentIdFor(teeFmt, tourSeed, newId());
      tourSeed = randomTourSeed();
      return withLocale(id, teeLoc);
    }
    const seed = teeHole === 'rand' ? randomHoleSeed() : codeSeed(teeCode) || 1;
    return withLocale(matchIdFor(seed, newId()), teeLoc);
  }
  const queue = () => {
    const q: { uid: string; at: number; name: string; me: boolean; color: string }[] = [];
    const mine = host.q();
    if (mine) q.push({ uid: host.uid(), at: mine, name: 'You', me: true, color: colorFor(host.uid()) });
    for (const r of host.peers()) if (r.q && !r.away) q.push({ uid: r.by, at: r.q, name: host.nameOf(r.by), me: false, color: colorFor(r.by) });
    return q.sort((a, b) => a.at - b.at || (a.uid < b.uid ? -1 : 1));
  };
  /** Open the tee times; `loc` picks the course first (the Rusty Rocket at Fun Land opens it on the Moon). */
  function openTee(loc?: LocaleId) {
    if (typeof loc === 'string' && LOCALES.some(l => l.id === loc)) {
      teeLoc = loc;
      homeOn = false;
    }
    teeOpen = true;
    teeHTML = '';
    host.openModal('Tee times', '<div id="tee-body"></div>');
    renderTee();
  }
  function renderTee() {
    if (!teeOpen) return;
    const q = queue(),
      first = q[0],
      amHost = !!first?.me,
      n = Math.min(GROUP_MAX, q.length),
      online = host.online();
    const rows = q.length
      ? q
          .slice(0, 8)
          .map(
            (x, i) =>
              `<div class="qrow"><i style="background:${x.color}"></i><span>${esc(x.name)}</span>${i === 0 ? '<em>host</em>' : i >= GROUP_MAX ? '<em>next group</em>' : ''}</div>`,
          )
          .join('')
      : '<div class="muted">Nobody is waiting yet.</div>';
    // 1 · where: a picture card per course
    // 1 · where: a picture card per course of ours, and one for playing a real course's card
    const sel = homeOn ? 'real' : teeLoc,
      where = `<h3 style="margin-top:0">Course</h3><div class="tlocs">${LOCALES.filter(l => !('hidden' in l))
        .map(
          l =>
            `<button class="tloc${sel === l.id ? ' on' : ''}" data-loc="${l.id}"><img src="${localePic(l.id)}" alt=""><b>${l.name}</b><small>${l.blurb}</small></button>`,
        )
        .join(
          '',
        )}<button class="tloc${sel === 'real' ? ' on' : ''}" data-loc="real"><img src="${realPic()}" alt=""><b>A real course</b><small>Play the scorecard of one of 10,000 US courses.</small></button></div>`;
    // 2 · what: for our own courses, one random hole (or one by its code) or a tournament; for a real course, which
    //     one, how much of it, and which of our landscapes to play it across
    const pick = teeFmt === 'one' ? teeHole : String(teeFmt),
      chip = (k: string, t: string) => `<button class="t${pick === k ? ' on' : ''}" data-play="${k}">${t}</button>`,
      holeInfo =
        teeHole === 'rand'
          ? 'A brand-new layout every round: par 3, 4 or 5, doglegs, water, bunkers. Every hole gets a code, so you can play a good one again.'
          : `<input id="t-code" maxlength="5" placeholder="Hole code, e.g. 4KQ2B" autocomplete="off" spellcheck="false"><br><span id="t-codeinfo"></span>`,
      place = (c: RealCourse) => esc([c.city, c.state].filter(Boolean).join(', ')),
      realPanel = () => {
        const pars = home ? cardPars(home.card, homeN) : [];
        return `<h3>Which course</h3>
          <div class="btns" style="margin:0 0 6px"><button id="t-lucky" class="primary">🎲 Surprise me</button><span class="muted" style="align-self:center">or search, or try one of the ideas below</span></div>
          <input id="t-home" placeholder="Search by name, city or state" autocomplete="off" spellcheck="false" style="width:100%"><div id="t-homeres" class="homeres"></div>
          ${
            ideas.length
              ? `<div class="homeres">${ideas.map(c => `<button data-idea="${c.i}"${home?.i === c.i ? ' class="on"' : ''}><b>${esc(c.name)}</b><small>${place(c)}</small></button>`).join('')}</div>
                 <button id="t-ideas" class="mini">Other ideas</button>`
              : '<p class="muted">Fetching the course list…</p>'
          }
          ${
            home
              ? `<h3>${esc(home.name)}</h3><div class="cupprev"><div><div class="muted">${place(home)}${home.yards ? ` · ${home.yards.toLocaleString('en-US')} yd` : ''}</div>
                 <p style="margin:6px 0 0;font-variant-numeric:tabular-nums">Par ${pars.join(' · ')} <span class="muted">= ${pars.reduce((a, b) => a + b, 0)}</span></p>
                 <p class="muted" style="margin:6px 0 0">Its pars in order, and its hardest holes get our hardest ideas. The holes themselves are ours.</p></div></div>
                 <h3>How much of it</h3><div class="tg"><button class="t${homeN === 3 ? ' on' : ''}" data-homen="3">First 3 holes</button><button class="t${homeN === 9 ? ' on' : ''}" data-homen="9">Front nine</button></div>
                 <h3>Played across</h3><div class="tg">${LOCALES.filter(l => !('hidden' in l))
                   .map(l => `<button class="t${teeLoc === l.id ? ' on' : ''}" data-scn="${l.id}">${l.name}</button>`)
                   .join('')}</div>`
              : ''
          }<p class="muted" style="font-size:11px;margin-top:8px">Course names and scorecards: OpenGolfAPI, Open Database License.</p>`;
      },
      fmt = homeOn
        ? where
        : `${where}<h3>Play</h3><div class="tg holes">${chip('rand', 'Random hole')}${chip('code', 'Hole code')}${chip('3', 'Mini cup · 3 holes')}${chip('9', 'Championship · 9 holes')}</div>`,
      course = homeOn ? realPanel() : teeFmt === 'one' ? `<p class="muted">${holeInfo}</p>` : cupPreview(teeFmt);
    const html = `${fmt}${course}
      <div class="btns"><button id="t-solo" class="primary">Play solo now</button></div>
      <h3>Group round</h3><p class="muted">${online ? 'Join the queue; the first player in line starts the round for up to 4 golfers. Players take turns (walk and drive any time; only hitting waits for your turn).' : 'Group rounds need other players: this copy of the game is running on its own.'}</p>
      ${online ? `<div class="queue">${rows}</div><div class="btns">${host.q() ? '<button id="t-leave">Leave the queue</button>' : '<button id="t-join">Join the queue</button>'}${amHost && n >= 2 ? `<button id="t-go" class="primary">Start the round (${n})</button>` : amHost ? '<span class="muted">Waiting for at least one more golfer…</span>' : ''}</div>${amHost ? `<label class="casual"><input type="checkbox" id="t-casual"${teeCasual ? ' checked' : ''}> Casual: everyone plays at once (no turns, no betting)</label>` : ''}` : ''}`;
    if (html === teeHTML) return;
    teeHTML = html;
    const body = document.getElementById('tee-body');
    if (!body) return;
    body.innerHTML = html;
    const b = (id: string) => document.getElementById(id);
    document.querySelectorAll<HTMLButtonElement>('#tee-body button[data-loc]').forEach(
      x =>
        (x.onclick = () => {
          homeOn = x.dataset.loc === 'real';
          if (homeOn) {
            // the list arrives once; then a few ideas are on the table straight away
            void loadCourses().then(list => {
              if (!ideas.length && list.length) ideas = someCourses(list, 3);
              renderTee();
            });
          } else teeLoc = x.dataset.loc as LocaleId;
          renderTee();
        }),
    );
    document.querySelectorAll<HTMLButtonElement>('#tee-body button[data-play]').forEach(
      x =>
        (x.onclick = () => {
          const k = x.dataset.play!;
          if (k === 'rand' || k === 'code') {
            teeFmt = 'one';
            teeHole = k;
          } else teeFmt = +k as TourSize;
          renderTee();
        }),
    );
    document.querySelectorAll<HTMLButtonElement>('#tee-body button[data-homen]').forEach(
      x =>
        (x.onclick = () => {
          homeN = +x.dataset.homen! as TourSize;
          renderTee();
        }),
    );
    document.querySelectorAll<HTMLButtonElement>('#tee-body button[data-scn]').forEach(
      x =>
        (x.onclick = () => {
          teeLoc = x.dataset.scn as LocaleId;
          renderTee();
        }),
    );
    document.querySelectorAll<HTMLButtonElement>('#tee-body button[data-idea]').forEach(
      x =>
        (x.onclick = () => {
          home = ideas.find(c => c.i === +x.dataset.idea!) || home;
          renderTee();
        }),
    );
    if (b('t-lucky'))
      b('t-lucky')!.onclick = async () => {
        const list = await loadCourses();
        if (list.length) home = someCourses(list, 1)[0];
        renderTee();
      };
    if (b('t-ideas'))
      b('t-ideas')!.onclick = async () => {
        ideas = someCourses(await loadCourses(), 3);
        renderTee();
      };
    const hi = b('t-home') as HTMLInputElement | null;
    if (hi) {
      // results are written straight into their own box, so typing never loses the cursor to a redraw
      let turn = 0;
      hi.oninput = async () => {
        const mine = ++turn,
          found = await searchCourses(hi.value),
          box = b('t-homeres');
        if (mine !== turn || !box) return;
        box.innerHTML = found.length
          ? found
              .map(
                c => `<button data-home="${c.i}"><b>${esc(c.name)}</b><small>${esc([c.city, c.state].filter(Boolean).join(', '))}</small></button>`,
              )
              .join('')
          : hi.value.trim().length > 1
            ? '<span class="muted">No course by that name in the list.</span>'
            : '';
        box.querySelectorAll<HTMLButtonElement>('button[data-home]').forEach(
          x =>
            (x.onclick = () => {
              home = found.find(c => c.i === +x.dataset.home!) || null;
              renderTee();
            }),
        );
      };
    }
    if (b('t-reroll'))
      b('t-reroll')!.onclick = () => {
        tourSeed = randomTourSeed();
        renderTee();
      };
    const ci = b('t-code') as HTMLInputElement | null,
      showInfo = () => {
        const info = b('t-codeinfo');
        if (info) info.textContent = codeInfo || 'Enter the 5-character code from a scorecard.';
      };
    if (ci) {
      ci.value = teeCode;
      showInfo();
      ci.oninput = () => {
        teeCode = ci.value
          .toUpperCase()
          .replace(/[^0-9A-Z]/g, '')
          .slice(0, 5);
        codeInfo = describeCode(teeCode);
        showInfo();
      };
      ci.onkeydown = e => e.stopPropagation();
    }
    const okCode = () => teeFmt !== 'one' || teeHole !== 'code' || teeCode.length === 5;
    b('t-solo')!.onclick = () => {
      if (homeOn && !home) return host.toast('Pick a course first: Surprise me, or search for one.');
      if (!okCode()) return host.toast('Enter a 5-character hole code first.');
      host.closeModal();
      host.setQ(0);
      go(teeMatchId(), false);
    };
    if (b('t-join'))
      b('t-join')!.onclick = () => {
        host.setQ(Date.now());
        renderTee();
      };
    const cb = b('t-casual') as HTMLInputElement | null;
    if (cb)
      cb.onchange = () => {
        teeCasual = cb.checked;
      };
    if (b('t-leave'))
      b('t-leave')!.onclick = () => {
        host.setQ(0);
        renderTee();
      };
    if (b('t-go'))
      b('t-go')!.onclick = () => {
        if (homeOn && !home) return host.toast('Pick a course first: Surprise me, or search for one.');
        if (!okCode()) return host.toast('Enter a 5-character hole code first.');
        const members = queue()
            .slice(0, GROUP_MAX)
            .map(x => x.uid),
          id0 = teeMatchId(),
          id = teeCasual ? 'c' + id0.slice(0, 15) : id0; // 'c…' = casual: everyone plays at once
        host.setGo({ id, at: Date.now(), m: members });
        host.closeModal();
        setTimeout(() => go(id, true, members), 900);
      };
  }
  const newId = () =>
    Math.random()
      .toString(36)
      .slice(2, 9)
      .replace(/[^a-z0-9]/g, 'x');
  function go(id: string, group: boolean, order: string[] = [host.uid()]) {
    if (started === id) return;
    started = id;
    host.start(id, group, order);
  }
  const goSeen = new Map<string, number>();
  function checkGroupStart() {
    // somebody (the host) started a round that includes me: one I queued for, or a Bad Batch I was standing near
    if (!host.online()) return;
    /* freshness is judged by when WE first saw the start, never by the host's clock (clocks differ between machines) */
    for (const r of host.peers()) {
      const g = r.go;
      if (!g || typeof g !== 'object' || (!host.q() && !g.bb)) continue;
      const gk = r.by + ':' + g.id;
      if (!goSeen.has(gk)) goSeen.set(gk, performance.now());
      if (performance.now() - goSeen.get(gk)! < 30000 && Array.isArray(g.m) && g.m.includes(host.uid())) {
        host.toast(
          g.bb
            ? `${esc(host.nameOf(r.by, 'Somebody'))} shared a rainbow joint with a gnome. The colours start to <i>melt</i>…`
            : `${esc(host.nameOf(r.by, 'The host'))} is starting the round…`,
          g.bb ? 3500 : 1500,
        );
        host.closeModal();
        go(
          String(g.id)
            .replace(/[^a-z0-9]/g, '')
            .slice(0, 16),
          true,
          g.m.map((x: any) => String(x)).slice(0, 8),
        );
        return;
      }
    }
  }

  /** The Bad Batch: a three-hole cup on the trip course for me and whoever was standing close (lobby.ts picks them). */
  function startBatch(members: string[]) {
    const id = withLocale(tournamentIdFor(3, randomTourSeed(), newId()), 'trip');
    host.setGo({ id, at: Date.now(), m: members, bb: 1 });
    host.closeModal();
    setTimeout(() => go(id, members.length > 1, members), 2500);
  }

  return {
    open: openTee,
    startBatch,
    render: renderTee,
    checkGroupStart,
    trophyPic,
    isOpen: () => teeOpen,
    queue,
    closed() {
      teeOpen = false;
    },
    /** Back in the lobby: the same match id may be started again. */
    reset() {
      started = '';
    },
  };
}
