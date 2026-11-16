// Life in the sky (world-feel.md §3): small flocks of birds crossing in the distance, dark against the sunset, and
// now and then a far-off jet with blinking lights trailing a contrail that spreads and fades.
// Like the clouds, it ticks itself from onBeforeRender, so game modes don't call anything. It is decoration only and
// isn't synced: each player sees their own birds. `SKY_NOW` tells the ambience (audio/ambience.ts) what's up there.
import * as THREE from 'three';

/** What's in the sky right now, for sound: flocks near enough to hear, and the jet. Positions are world space. */
export const SKY_NOW = {
  flocks: [] as { pos: THREE.Vector3; n: number }[],
  plane: null as THREE.Vector3 | null,
};

const FLOCKS = 3,
  PER = 11,
  BIRDS = FLOCKS * PER;
type Flock = { pos: THREE.Vector3; dir: THREE.Vector3; spd: number; n: number; wait: number; live: boolean; seed: number };

function birdGeometry() {
  // a shallow "M": body at the centre, two wings of two segments each. uv.x = how far out along the wing (0…1).
  const span = 0.62,
    chord = 0.2,
    P: number[] = [],
    W: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => {
    for (const v of [a, b, c]) {
      P.push(v[0], 0, v[1]);
      W.push(Math.abs(v[0]) / span, 0);
    }
  };
  for (const s of [-1, 1]) {
    tri([0, chord * 0.7], [0, -chord * 0.6], [s * span * 0.5, 0.02]);
    tri([0, -chord * 0.6], [s * span * 0.5, -chord * 0.55], [s * span * 0.5, 0.02]);
    tri([s * span * 0.5, 0.02], [s * span * 0.5, -chord * 0.55], [s * span, -chord * 0.5]);
  }
  tri([-0.05, chord * 0.7], [0.05, chord * 0.7], [0, chord * 1.5]); // head
  tri([-0.06, -chord * 0.6], [0.06, -chord * 0.6], [0, -chord * 1.6]); // tail
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(W, 2));
  return g;
}

function planeModel() {
  const g = new THREE.Group(),
    m = new THREE.MeshBasicMaterial({ color: '#f3d9bd', fog: false }),
    d = new THREE.MeshBasicMaterial({ color: '#8d7a70', fog: false });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 36, 8).rotateX(Math.PI / 2), m);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(2.1, 5, 8).rotateX(Math.PI / 2), m);
  nose.position.z = 20.5;
  const tailc = new THREE.Mesh(new THREE.ConeGeometry(2.1, 8, 8).rotateX(-Math.PI / 2), m);
  tailc.position.z = -22;
  g.add(body, nose, tailc);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(19, 0.5, 5.5), d);
    wing.position.set(s * 10, -0.6, -1);
    wing.rotation.y = s * -0.42;
    const stab = new THREE.Mesh(new THREE.BoxGeometry(7, 0.35, 2.6), d);
    stab.position.set(s * 3.8, 0.6, -21);
    stab.rotation.y = s * -0.4;
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 4.4, 8).rotateX(Math.PI / 2), d);
    eng.position.set(s * 7, -1.9, 1.5);
    g.add(wing, stab, eng);
  }
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 5), m);
  fin.position.set(0, 4, -21.5);
  fin.rotation.x = -0.5;
  g.add(fin);
  return g;
}
function glowTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d')!,
    gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

const TRAIL = 150; // contrail samples, one every 0.4 s: a minute of trail

/** Birds and the jet. Add the returned group to the scene once. */
export function skyLife(sunDir: THREE.Vector3, haze: THREE.Color) {
  const root = new THREE.Group();
  root.name = 'skyLife';
  let seed = (Math.random() * 1e9) | 0;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) & 0xffffff) / 0xffffff;

  // ---------------- birds
  const bg = birdGeometry(),
    ph = new Float32Array(BIRDS);
  for (let i = 0; i < BIRDS; i++) ph[i] = rnd() * 6.283;
  bg.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1));
  const uB = { uT: { value: 0 }, uHaze: { value: haze.clone() } };
  const birds = new THREE.InstancedMesh(
    bg,
    new THREE.ShaderMaterial({
      uniforms: uB,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
      vertexShader: `attribute float aPh; uniform float uT; varying float vD;
        void main(){ vec3 p = position;
          float glide = smoothstep(.55, .8, sin(uT * .31 + aPh * 3.7));          // now and then they stop flapping and glide
          float f = sin(uT * 9.5 + aPh) * (1. - glide) + .25 * glide;
          p.y += uv.x * uv.x * f * .26 + uv.x * .05;
          vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.);
          vD = length(w.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uHaze; varying float vD;
        void main(){ vec3 c = mix(vec3(.012, .01, .01), uHaze, smoothstep(80., 640., vD) * .7); gl_FragColor = vec4(c, 1.);
          #include <colorspace_fragment>
        }`,
    }),
    BIRDS,
  );
  birds.frustumCulled = false;
  birds.count = 0;
  root.add(birds);
  const flocks: Flock[] = [];
  for (let i = 0; i < FLOCKS; i++)
    flocks.push({
      pos: new THREE.Vector3(),
      dir: new THREE.Vector3(1, 0, 0),
      spd: 10,
      n: 0,
      wait: 2 + i * 9 + rnd() * 6,
      live: false,
      seed: rnd() * 100,
    });
  const launch = (f: Flock, cam: THREE.Vector3) => {
    // cross the view on a chord that passes 50–190 m from the camera, 22–65 m up
    const a = rnd() * Math.PI * 2,
      R = 420,
      miss = 50 + rnd() * 140,
      side = rnd() < 0.5 ? -1 : 1;
    f.dir.set(-Math.cos(a), 0, -Math.sin(a));
    f.pos.set(cam.x + Math.cos(a) * R - Math.sin(a) * miss * side, 22 + rnd() * 43, cam.z + Math.sin(a) * R + Math.cos(a) * miss * side);
    f.spd = 9 + rnd() * 5;
    f.n = 4 + Math.floor(rnd() * (PER - 3));
    f.seed = rnd() * 100;
    f.live = true;
  };

  // ---------------- the jet and its contrail
  const jet = planeModel();
  jet.visible = false;
  root.add(jet);
  const gt = glowTex();
  const lamp = (color: string, x: number, y: number, z: number, s: number) => {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: gt, color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }),
    );
    sp.position.set(x, y, z);
    sp.scale.setScalar(s);
    jet.add(sp);
    return sp;
  };
  const red = lamp('#ff3b2a', -19, 0, -4, 8),
    green = lamp('#3bff6a', 19, 0, -4, 8),
    strobe = lamp('#ffffff', 0, -2.4, 0, 12);
  const tp = new Float32Array(TRAIL * 2 * 3),
    ta = new Float32Array(TRAIL * 2 * 2), // age (s), side (−1 / +1)
    idx: number[] = [];
  for (let i = 0; i < TRAIL - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  tg.setAttribute('uv', new THREE.BufferAttribute(ta, 2));
  tg.setIndex(idx);
  const trail = new THREE.Mesh(
    tg,
    new THREE.ShaderMaterial({
      uniforms: { uSun: { value: sunDir.clone() } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `varying vec2 vU;
        void main(){ float age = vU.x, e = 1. - abs(vU.y);
          float a = smoothstep(0., .6, e) * smoothstep(.6, 5., age) * (1. - smoothstep(22., 58., age)) * .8;   // a gap behind the engines, then a long fade
          a *= .75 + .25 * sin(age * 2.3 + vU.y * 3.);                                                         // it breaks up as it ages
          gl_FragColor = vec4(mix(vec3(1., .9, .78), vec3(1., .78, .66), smoothstep(0., 40., age)), a);
          #include <colorspace_fragment>
        }`,
    }),
  );
  trail.frustumCulled = false;
  trail.visible = false;
  root.add(trail);
  const pts: { p: THREE.Vector3; t: number }[] = [];
  const J = { live: false, wait: 25 + rnd() * 50, pos: new THREE.Vector3(), dir: new THREE.Vector3(), t: 0, drop: 0, end: 0 };
  const side = new THREE.Vector3();

  // ---------------- a pale moon, already up in the east (opposite the sun)
  const mc = document.createElement('canvas');
  mc.width = mc.height = 128;
  {
    const x = mc.getContext('2d')!,
      g = x.createRadialGradient(64, 64, 0, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,250,240,1)');
    g.addColorStop(0.72, 'rgba(250,244,232,1)');
    g.addColorStop(0.8, 'rgba(250,244,232,.25)');
    g.addColorStop(1, 'rgba(250,244,232,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    x.globalCompositeOperation = 'source-atop';
    for (const [mx, my, mr] of [
      [50, 44, 13],
      [72, 56, 9],
      [58, 76, 11],
      [80, 36, 6],
      [40, 66, 6],
    ]) {
      x.fillStyle = 'rgba(176,170,172,.42)'; // the seas
      x.beginPath();
      x.ellipse(mx, my, mr, mr * 0.8, 0.4, 0, 7);
      x.fill();
    }
    x.fillStyle = 'rgba(235,160,110,.2)'; // a little of the sunset's colour
    x.fillRect(0, 0, 128, 128);
  }
  const moonTex = new THREE.CanvasTexture(mc);
  moonTex.colorSpace = THREE.SRGBColorSpace;
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, transparent: true, opacity: 0.72, depthWrite: false }));
  moon.scale.setScalar(95);
  moon.renderOrder = -2;
  root.add(moon);
  const moonDir = new THREE.Vector3(-sunDir.x, 0, -sunDir.z)
    .normalize()
    .multiplyScalar(Math.cos(0.5))
    .setY(Math.sin(0.5))
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
  let last = 0;
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    v = new THREE.Vector3(),
    one = new THREE.Vector3(1, 1, 1);
  // a tiny invisible mesh carries the per-frame tick (Groups don't get onBeforeRender)
  const tick = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  tick.geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  tick.frustumCulled = false;
  tick.onBeforeRender = (_r, _s, cam) => {
    const now = performance.now() / 1000,
      dt = Math.min(0.25, last ? now - last : 0);
    last = now;
    uB.uT.value = now;
    const C = cam.position;
    moon.position.copy(C).addScaledVector(moonDir, 1350);
    // birds
    let n = 0;
    SKY_NOW.flocks.length = 0;
    for (const f of flocks) {
      if (!f.live) {
        if ((f.wait -= dt) <= 0) launch(f, C);
        continue;
      }
      f.pos.addScaledVector(f.dir, f.spd * dt);
      f.pos.y += Math.sin(now * 0.23 + f.seed) * 0.6 * dt;
      if (Math.hypot(f.pos.x - C.x, f.pos.z - C.z) > 470) {
        f.live = false;
        f.wait = 14 + rnd() * 40;
        continue;
      }
      const yaw = Math.atan2(f.dir.x, f.dir.z);
      for (let i = 0; i < f.n; i++) {
        // a loose V that breathes: each bird trails back and out from the leader, wandering a little
        const row = Math.ceil(i / 2),
          sd = i % 2 ? 1 : -1,
          k = f.seed + i * 1.7;
        const back = row * 1.5 + Math.sin(now * 0.5 + k) * 0.5,
          out = sd * row * 1.25 + Math.sin(now * 0.37 + k * 2.1) * 0.5,
          up = Math.sin(now * 0.6 + k * 1.3) * 0.45;
        v.set(f.pos.x - f.dir.x * back + f.dir.z * out, f.pos.y + up, f.pos.z - f.dir.z * back - f.dir.x * out);
        e.set(0, yaw, Math.sin(now * 0.37 + k * 2.1) * 0.25);
        m4.compose(v, q.setFromEuler(e), one);
        birds.setMatrixAt(n++, m4);
      }
      SKY_NOW.flocks.push({ pos: f.pos, n: f.n });
    }
    birds.count = n;
    birds.instanceMatrix.needsUpdate = true;
    // the jet
    if (!J.live) {
      if ((J.wait -= dt) <= 0) {
        const a = rnd() * Math.PI * 2,
          miss = 500 + rnd() * 900,
          sgn = rnd() < 0.5 ? -1 : 1,
          R = 2300;
        J.dir.set(-Math.cos(a), 0, -Math.sin(a));
        J.pos.set(C.x + Math.cos(a) * R - Math.sin(a) * miss * sgn, 620 + rnd() * 260, C.z + Math.sin(a) * R + Math.cos(a) * miss * sgn);
        J.live = true;
        J.t = 0;
        J.drop = 0;
        J.end = (R * 2) / 78 + 60; // fly across, then let the trail fade
        pts.length = 0;
        jet.rotation.y = Math.atan2(J.dir.x, J.dir.z);
        side.set(J.dir.z, 0, -J.dir.x);
      }
    } else {
      J.t += dt;
      const flying = J.t < J.end - 60;
      if (flying) {
        J.pos.addScaledVector(J.dir, 78 * dt);
        if ((J.drop -= dt) <= 0) {
          J.drop = 0.4;
          pts.push({ p: J.pos.clone().addScaledVector(J.dir, -22), t: now });
          if (pts.length > TRAIL - 1) pts.shift();
        }
      }
      jet.visible = flying;
      jet.position.copy(J.pos);
      const b = now % 1.4;
      strobe.material.opacity = b < 0.07 || (b > 0.2 && b < 0.27) ? 1 : 0;
      red.material.opacity = green.material.opacity = 0.5;
      // rebuild the ribbon: newest sample at the jet, widening with age
      const N = pts.length + (flying ? 1 : 0);
      for (let i = 0; i < N; i++) {
        const live = i === pts.length,
          P = live ? v.copy(J.pos).addScaledVector(J.dir, -22) : pts[i].p,
          age = live ? 0 : now - pts[i].t,
          w = 7 + age * 0.9; // never a thin bright line: close behind the jet it read as a beam
        const o = i * 6;
        tp[o] = P.x - side.x * w;
        tp[o + 1] = P.y;
        tp[o + 2] = P.z - side.z * w;
        tp[o + 3] = P.x + side.x * w;
        tp[o + 4] = P.y;
        tp[o + 5] = P.z + side.z * w;
        ta[i * 4] = ta[i * 4 + 2] = age;
        ta[i * 4 + 1] = -1;
        ta[i * 4 + 3] = 1;
      }
      // Anything past the newest sample sits on it (no stale vertex can ever be drawn), and a sample that somehow lies
      // far from its neighbour is aged out so no long sliver joins them.
      for (let i = 1; i < N; i++) {
        const a = (i - 1) * 6,
          b = i * 6;
        if (Math.hypot(tp[b] - tp[a], tp[b + 2] - tp[a + 2]) > 400) ta[(i - 1) * 4] = ta[(i - 1) * 4 + 2] = ta[i * 4] = ta[i * 4 + 2] = 999;
      }
      if (N > 0) for (let i = N; i < TRAIL; i++) tp.copyWithin(i * 6, (N - 1) * 6, N * 6);
      tg.setDrawRange(0, Math.max(0, N - 1) * 6);
      tg.attributes.position.needsUpdate = true;
      tg.attributes.uv.needsUpdate = true;
      trail.visible = N > 1;
      if (J.t > J.end) {
        J.live = false;
        J.wait = 70 + rnd() * 110;
        jet.visible = trail.visible = false;
      }
    }
    SKY_NOW.plane = J.live && jet.visible ? J.pos : null;
  };
  root.add(tick);
  // dev: __skyLife.launch() sends the birds and the jet up now (in every scene: the lobby and the course each have their own)
  const hook = ((window as any).__skyLife ??= { all: [] as any[], launch: () => hook.all.forEach((h: any) => h.launch()) });
  hook.all.push({ flocks, J, launch: () => ((J.wait = 0), flocks.forEach(f => ((f.live = false), (f.wait = 0)))) });
  return root;
}
