// Golden Hills — app shell: one renderer, two modes (the lobby and a round of golf). A #golf-<id> link drops you
// straight into that round (rejoin); finishing a round brings you back to the lobby.
import { perfFrame, perfReset } from './ui/perf';
import * as THREE from 'three';
import { createLobby } from './lobby/lobby';
import { createGolf } from './golf/golfMode';
import { platform } from './platform';
import { Golfer } from './characters/golfer';
import { options, opts, onOptions } from './ui/options';
import { showWelcome } from './ui/welcome';

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.localClippingEnabled = true; // (the lounge's borrowed bar room is cut off at the lounge's own walls)
// sharpness comes from the options menu: soft 0.75×, normal up to 1.5× (retina at 2× costs ~78% more pixels), sharp up to 2×
onOptions(() => {
  renderer.setPixelRatio(Math.min(devicePixelRatio, [0.75, 1.5, 2][opts.sharp] ?? 1.5));
  renderer.setSize(innerWidth, innerHeight, false);
});
options.init();
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const resize = () => renderer.setSize(innerWidth, innerHeight, false);
addEventListener('resize', resize);
resize();

const setHash = (h: string) => {
  try {
    if (h) {
      if (location.hash !== '#' + h) location.hash = h;
    } else if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  } catch {}
};
// the MakeHuman golfer loads before anyone is built (falls back to the procedural one if it can't)
await Golfer.load(new URL('golfer/', document.baseURI).href);
const lobby = createLobby({ renderer, startGolf: o => enterGolf(o.matchId, o.group, o.order) });
const golf = createGolf({
  renderer,
  onExit: () => {
    golf.stop();
    setHash('');
    lobby.setAway(null);
    lobby.start({ returning: true });
  },
});

async function enterGolf(matchId: string, group: boolean, order: string[] = []) {
  const pf = await platform();
  lobby.stop();
  lobby.setAway(matchId);
  setHash('golf-' + matchId);
  golf.start({ matchId, group, look: lobby.look, name: pf.name, uid: pf.uid, order });
}
const m = /^#golf-([a-z0-9]{4,16})$/.exec(location.hash || '');
if (m) lobby.ready.then(() => enterGolf(m[1], true));
else {
  lobby.start();
  showWelcome();
}

// the loading screen (index.html) goes once the town is built, you're checked in and a frame has been drawn
lobby.ready.then(() =>
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const L = (window as any).__loader;
      if (L) L.built();
      else document.getElementById('loader')?.remove(); // (a host that blocked its script: never leave the screen covering the game)
    }),
  ),
);
// One bad frame must never stop the game: the next frame is always scheduled, and an error is reported once.
const seenErr = new Set<string>();
function frame(now: number) {
  requestAnimationFrame(frame);
  try {
    perfReset();
    if (golf.active) golf.tick(now);
    else lobby.tick(now);
    perfFrame(now, renderer);
  } catch (e: any) {
    const k = String(e?.message || e);
    if (!seenErr.has(k)) {
      seenErr.add(k);
      console.error('[frame]', e);
    }
  }
}
requestAnimationFrame(frame);
