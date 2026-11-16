// Dev-only turntable for the golfer rig: ?pose=idle|0..3&club=iron&yaw=0.6&zoom=1
import * as THREE from 'three';
import { GESTURES, Golfer, type ClubKind } from '../characters/golfer';
import { loadBody } from '../characters/mhGolfer';
const q = new URLSearchParams(location.search);
if (!q.has('proc')) await Golfer.load(new URL('golfer/', document.baseURI).href);
const r = new THREE.WebGLRenderer({ canvas: document.getElementById('c') as HTMLCanvasElement, antialias: true });
r.setSize(innerWidth, innerHeight);
r.setPixelRatio(1);
r.shadowMap.enabled = true;
r.toneMapping = THREE.ACESFilmicToneMapping;
r.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#c9a47c');
scene.fog = new THREE.Fog('#c9a47c', 8, 30);
scene.add(new THREE.HemisphereLight('#f6d3a4', '#4a3c26', 0.9));
const sun = new THREE.DirectionalLight('#ffbf78', 3.2);
sun.position.set(-3, 4, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2 });
scene.add(sun);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: '#6f8a40', roughness: 1 }),
);
ground.receiveShadow = true;
scene.add(ground);
const look = q.get('look');
if (look) await loadBody(JSON.parse(decodeURIComponent(look)).body);
const g = new Golfer(
  look
    ? JSON.parse(decodeURIComponent(look))
    : q.has('nocap')
      ? {
          skin: '#55331e',
          hair: '#c03a2a',
          shirt: '#f1eee6',
          print: '#1d1d1f',
          pants: '#3a3f4a',
          shoes: '#7a2626',
          sole: '#e8e2d4',
          cap: '#c8452f',
          capStyle: 'none',
          stubble: true,
        }
      : undefined,
);
scene.add(g.root);
(window as any).G = g;
q.forEach((v, k) => {
  if (k.startsWith('t_')) (g.tune as any)[k.slice(2)] = +v;
});
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.021, 12, 8), new THREE.MeshStandardMaterial({ color: '#fff' }));
scene.add(ball);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 100);
const st = {
  pose: q.get('pose') || '0',
  club: (q.get('club') || 'iron') as ClubKind,
  yaw: +(q.get('yaw') || 0.6),
  pitch: +(q.get('pitch') || 0.15),
  zoom: +(q.get('zoom') || 1),
  ty: +(q.get('ty') || 1.0),
  anim: q.has('anim'),
};
(window as any).ST = st;
function frame(t: number) {
  const tm = t / 1000;
  const pose = st.anim ? String((tm * 0.6) % 3.4) : st.pose;
  if (q.get('clip')) {
    g.playRaw(q.get('clip')!, +(q.get('ct') || 0));
  } else
    g.update(
      pose === 'walk' || pose === 'run'
        ? {
            mode: 'walk',
            speed: pose === 'run' ? 4.6 : 1.9,
            phase: +(q.get('ph') || 0) + (st.anim ? tm * 4 : 0),
            time: tm,
            s: 0,
            club: st.club,
            showClub: false,
          }
        : pose === 'idle'
          ? { mode: 'idle', s: 0, club: st.club, time: tm }
          : {
              mode: st.club === 'putter' ? 'putt' : 'swing',
              s: Math.min(3.2, +pose),
              s2: (st as any).s2,
              blend: (st as any).blend,
              club: st.club,
              time: tm,
              power: 0.7,
            },
    );
  if (q.get('gr')) GESTURES[(q.get('g') || 'thumb') as 'thumb'].rot = q.get('gr')!.split(',').map(Number);
  if (q.get('g')) g.gesture(q.get('g') as any, +(q.get('gk') || 1), +(q.get('gt') || 0.2));
  ball.position.copy(g.ballLocal);
  ball.visible = pose !== 'idle';
  const d = 3.6 / st.zoom;
  cam.position.set(
    +(q.get('tx') || 0) + Math.sin(st.yaw) * d * Math.cos(st.pitch),
    st.ty + Math.sin(st.pitch) * d,
    +(q.get('tz') || 0.2) + Math.cos(st.yaw) * d * Math.cos(st.pitch),
  );
  cam.lookAt(+(q.get('tx') || 0), st.ty, +(q.get('tz') || 0.2));
  r.render(scene, cam);
  requestAnimationFrame(frame);
}
if (q.has('catalog')) {
  // dev: every Build Mode item in rows (?catalog=1&row=0)
  const { ITEMS } = await import('../lobby/catalog');
  g.root.visible = false;
  ball.visible = false;
  const list = ITEMS.slice(+(q.get('from') || 0), +(q.get('to') || 99));
  let x = 0;
  const { loadProp } = await import('../world/props');
  await Promise.all(list.filter(i => i.model).map(i => loadProp(i.model!)));
  for (const it of list) {
    const o = it.make('#c8452f');
    o.position.set(x + it.w / 2, 0, 0);
    o.traverse((m: any) => {
      if (m.isMesh) m.castShadow = true;
    });
    scene.add(o);
    x += it.w + 0.5;
  }
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
  sun.shadow.camera.updateProjectionMatrix();
  const cx = x / 2;
  const f2 = () => {
    cam.position.set(cx, +(q.get('ty') || 3), +(q.get('d') || 7));
    cam.lookAt(cx, 0.6, 0);
    r.render(scene, cam);
    requestAnimationFrame(f2);
  };
  requestAnimationFrame(f2);
  (window as any).ready = true;
} else if (q.has('trophies')) {
  // dev: a row of generated trophies (?trophies=startSeed&n=3|9)
  const { buildTrophy } = await import('../world/trophy');
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
  const pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  g.root.visible = false;
  ball.visible = false;
  const s0 = +(q.get('trophies') || 1),
    n = +(q.get('n') || 9) as 3 | 9;
  for (let i = 0; i < 6; i++) {
    const t = buildTrophy(s0 + i, n, 'Chris · −3');
    t.position.set((i - 2.5) * 0.42, 0, 0);
    t.rotation.y = -0.35;
    scene.add(t);
  }
  st.ty = 0.35;
  st.zoom = 1.5;
  st.yaw = 0;
  st.pitch = 0.08;
  const f2 = () => {
    const d = 3.6 / st.zoom;
    cam.position.set(0, st.ty + Math.sin(st.pitch) * d, Math.cos(st.pitch) * d);
    cam.lookAt(0, st.ty, 0);
    r.render(scene, cam);
    requestAnimationFrame(f2);
  };
  requestAnimationFrame(f2);
  (window as any).ready = true;
} else {
  requestAnimationFrame(frame);
  (window as any).ready = true;
}
