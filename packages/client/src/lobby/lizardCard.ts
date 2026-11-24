// The 1st Edition Holographic Lizard: the card Mom sold (her letter, lobby/mail.ts), behind the glass at Lucky Pawn for
// $100,000. An invented card, drawn here: a little green lizard on a sunburst, a rainbow foil that shifts as you move,
// "1ST EDITION" and a made-up attack. Bought back, it stands on your lot in a display case on a stand.
import * as THREE from 'three';

let tex: THREE.CanvasTexture | null = null;
export function lizardCardCanvas(px = 256) {
  const W = px,
    H = Math.round(px * 1.4),
    c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!,
    s = W / 256;
  // gold border, then the card face
  g.fillStyle = '#e9c34a';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#f7efd8';
  g.fillRect(10 * s, 10 * s, W - 20 * s, H - 20 * s);
  // name bar
  g.fillStyle = '#2a2a2a';
  g.font = `bold ${17 * s}px Georgia, serif`;
  g.fillText('Holo Lizard', 18 * s, 30 * s);
  g.fillStyle = '#c0392b';
  g.font = `bold ${13 * s}px Georgia, serif`;
  g.textAlign = 'right';
  g.fillText('120 HP 🔥', W - 18 * s, 30 * s);
  g.textAlign = 'left';
  // the picture: a holographic sunburst with a small lizard on a rock
  const px0 = 18 * s,
    py0 = 40 * s,
    pw = W - 36 * s,
    ph = 150 * s;
  const rb = g.createLinearGradient(px0, py0, px0 + pw, py0 + ph);
  ['#ff6b6b', '#ffd24a', '#7cff6a', '#3fd6c1', '#7f8cff', '#ff6bd6', '#ff6b6b'].forEach((col, i, a) => rb.addColorStop(i / (a.length - 1), col));
  g.fillStyle = rb;
  g.fillRect(px0, py0, pw, ph);
  g.save();
  g.translate(px0 + pw / 2, py0 + ph * 0.55);
  for (let i = 0; i < 24; i++) {
    g.rotate((Math.PI * 2) / 24);
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.05)';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-12 * s, -160 * s);
    g.lineTo(12 * s, -160 * s);
    g.fill();
  }
  g.restore();
  // rock
  g.fillStyle = '#7a6a55';
  g.beginPath();
  g.ellipse(px0 + pw / 2, py0 + ph - 18 * s, 70 * s, 18 * s, 0, 0, Math.PI * 2);
  g.fill();
  // lizard: body, tail curl, head, legs, eye
  const lx = px0 + pw / 2,
    ly = py0 + ph - 40 * s;
  g.fillStyle = '#3f9a3a';
  g.strokeStyle = '#1e4d1c';
  g.lineWidth = 2 * s;
  g.beginPath();
  g.ellipse(lx, ly, 42 * s, 13 * s, -0.08, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(lx - 38 * s, ly + 2 * s);
  g.quadraticCurveTo(lx - 80 * s, ly + 10 * s, lx - 70 * s, ly - 18 * s);
  g.quadraticCurveTo(lx - 62 * s, ly - 32 * s, lx - 52 * s, ly - 20 * s);
  g.lineWidth = 7 * s;
  g.strokeStyle = '#3f9a3a';
  g.stroke();
  g.lineWidth = 2 * s;
  g.strokeStyle = '#1e4d1c';
  g.beginPath();
  g.ellipse(lx + 46 * s, ly - 8 * s, 17 * s, 11 * s, -0.25, 0, Math.PI * 2);
  g.fillStyle = '#4fb046';
  g.fill();
  g.stroke();
  for (const [dx, dy] of [
    [-22, 10],
    [-12, 12],
    [16, 11],
    [26, 9],
  ]) {
    g.beginPath();
    g.moveTo(lx + dx * s, ly + dy * s);
    g.lineTo(lx + (dx + (dx < 0 ? -6 : 6)) * s, ly + (dy + 9) * s);
    g.lineWidth = 4 * s;
    g.strokeStyle = '#3f9a3a';
    g.stroke();
  }
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(lx + 52 * s, ly - 11 * s, 4 * s, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#111';
  g.beginPath();
  g.arc(lx + 53 * s, ly - 11 * s, 2 * s, 0, Math.PI * 2);
  g.fill();
  // spots
  g.fillStyle = '#ffd24a';
  for (const [dx, dy] of [
    [-16, -4],
    [0, -6],
    [16, -3],
  ]) {
    g.beginPath();
    g.arc(lx + dx * s, ly + dy * s, 3 * s, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#b8902a';
  g.lineWidth = 3 * s;
  g.strokeRect(px0, py0, pw, ph);
  // 1st edition stamp
  g.fillStyle = '#111';
  g.beginPath();
  g.arc(px0 + 4 * s, py0 + ph + 12 * s, 9 * s, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = `bold ${8 * s}px sans-serif`;
  g.textAlign = 'center';
  g.fillText('1st', px0 + 4 * s, py0 + ph + 15 * s);
  g.textAlign = 'left';
  g.fillStyle = '#555';
  g.font = `italic ${9 * s}px Georgia, serif`;
  g.fillText('1ST EDITION · Rock Lizard · Length 0\'7"', px0 + 18 * s, py0 + ph + 15 * s);
  // the attacks
  g.fillStyle = '#2a2a2a';
  g.font = `bold ${13 * s}px Georgia, serif`;
  g.fillText('Sunbathe', 22 * s, py0 + ph + 42 * s);
  g.fillText('Tail Whip', 22 * s, py0 + ph + 78 * s);
  g.textAlign = 'right';
  g.fillText('10', W - 22 * s, py0 + ph + 42 * s);
  g.fillText('60', W - 22 * s, py0 + ph + 78 * s);
  g.textAlign = 'left';
  g.font = `${9 * s}px Georgia, serif`;
  g.fillStyle = '#444';
  g.fillText('Heal 20 damage. Does nothing else, but feels great.', 22 * s, py0 + ph + 55 * s);
  g.fillText('Flip a coin. If heads, your opponent loses their lie.', 22 * s, py0 + ph + 91 * s);
  g.font = `italic ${8 * s}px Georgia, serif`;
  g.fillStyle = '#777';
  g.fillText('Illus. Mom never forgave herself.  ★ Holo · 4/102', 22 * s, H - 18 * s);
  return c;
}
export function lizardCardTex() {
  if (!tex) {
    tex = new THREE.CanvasTexture(lizardCardCanvas(512));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
  }
  return tex;
}
/** The card in a glass display case on a little brass stand (about knee height, so it reads from the street). */
export function lizardCardModel() {
  const gr = new THREE.Group(),
    brass = new THREE.MeshStandardMaterial({ color: '#c9a45a', metalness: 0.8, roughness: 0.3 }),
    wood = new THREE.MeshStandardMaterial({ color: '#3d2716', roughness: 0.6 }),
    glass = new THREE.MeshStandardMaterial({
      color: '#dff4ff',
      transparent: true,
      opacity: 0.22,
      roughness: 0.05,
      metalness: 0.1,
      depthWrite: false,
    });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.75, 12), brass);
  post.position.y = 0.375;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 20), wood);
  foot.position.y = 0.03;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.05), wood);
  back.position.set(0, 1.0, -0.01);
  back.rotation.x = -0.25;
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.42),
    new THREE.MeshStandardMaterial({
      map: lizardCardTex(),
      roughness: 0.35,
      metalness: 0.15,
      emissive: '#ffffff',
      emissiveMap: lizardCardTex(),
      emissiveIntensity: 0.25,
    }),
  );
  card.position.set(0, 0.002, 0.027);
  back.add(card);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.52, 0.08), glass);
  lid.position.set(0, 0, 0.03);
  back.add(lid);
  for (const m of [post, foot, back]) m.castShadow = true;
  gr.add(foot, post, back);
  return gr;
}
