"""Build the golfer from MakeHuman CC0 data.

Shapes the base mesh with macro targets, fits the body topology, clothes, shoes, hair, brows, lashes and eyes,
maps MakeHuman's skin weights onto the game's 22-bone Mixamo-style rig and bends everything onto that rig's
bind pose (so every existing animation, IK and the ragdoll keep working). Writes packages/client/public/golfer/.

    python3 tools/mh/build.py            (needs numpy + Pillow; data paths below)
"""
import json, os, sys, math, struct
from collections import defaultdict
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(__file__))
from mhlib import Obj, Proxy, load_target, read_mhmat

MH = os.environ.get('MH_DATA', '/home/claude/mh/mh/makehuman/data')          # github.com/makehumancommunity/makehuman
SA = os.environ.get('MH_ASSETS', '/home/claude/mhassets')                     # "MakeHuman system assets" pack
OUT = os.path.join(os.path.dirname(__file__), '../../packages/client/public/golfer')
# Body types: the default build is the male body and writes golfer.json and every texture. MH_BODY=female|muscle|fmuscle
# builds another body with ITS OWN skeleton proportions (same bones, its own joint positions, saved as that file's bind
# pose) with every garment refitted to it, and writes only golfer_<body>.json (textures and uv layouts are shared).
BODY = os.environ.get('MH_BODY', '')
GENDER = 'female' if BODY in ('female', 'fmuscle') else 'male'
PROXY = {'': 'male_generic/male_generic', 'female': 'female_generic/female_generic', 'muscle': 'male_muscle_13290/male_muscle_13290', 'fmuscle': 'female_muscle_13442/female_muscle_13442'}[BODY]
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- the game's rig (must match golfer.ts BIND)
ARM_TILT = 0.21
def armDir(s): return np.array([s * math.sin(ARM_TILT), -math.cos(ARM_TILT), 0.0])
BIND = [('Hips', None, (0, 0.98, 0)), ('Spine', 'Hips', (0, 1.07, 0)), ('Spine1', 'Spine', (0, 1.19, 0)), ('Spine2', 'Spine1', (0, 1.31, 0)),
        ('Neck', 'Spine2', (0, 1.5, -0.01)), ('Head', 'Neck', (0, 1.6, 0))]
for s, n in ((1, 'Left'), (-1, 'Right')):
    arm = np.array([0.174 * s, 1.408, -0.02]); fore = arm + armDir(s) * 0.3; hand = fore + armDir(s) * 0.268
    BIND += [(n + 'Shoulder', 'Spine2', (0.035 * s, 1.44, -0.01)), (n + 'Arm', n + 'Shoulder', tuple(arm)), (n + 'ForeArm', n + 'Arm', tuple(fore)), (n + 'Hand', n + 'ForeArm', tuple(hand)),
             (n + 'UpLeg', 'Hips', (0.095 * s, 0.92, 0)), (n + 'Leg', n + 'UpLeg', (0.105 * s, 0.5, 0.005)), (n + 'Foot', n + 'Leg', (0.11 * s, 0.085, -0.02)), (n + 'ToeBase', n + 'Foot', (0.11 * s, 0.02, 0.12))]
FINGERS = [('Thumb', 1), ('Index', 2), ('Middle', 3), ('Ring', 4), ('Pinky', 5)]   # our name, MakeHuman finger number
for s, n in ((1, 'Left'), (-1, 'Right')):
    for fn, _ in FINGERS:
        for j in (1, 2, 3): BIND.append((f'{n}Hand{fn}{j}', f'{n}Hand' if j == 1 else f'{n}Hand{fn}{j - 1}', (0, 0, 0)))
BI = {n: i for i, (n, _, _) in enumerate(BIND)}
BP = {n: np.array(p, dtype=float) for n, _, p in BIND}
HTOP = 1.778

# ---------------------------------------------------------------- 1. shape the base mesh
base = Obj(MH + '/3dobjs/base.obj')
V = base.v.copy()
T = MH + '/targets/macrodetails/'
def addt(name, w):
    if w > 1e-4: i, d = load_target(T + name); V[i] += d * w
AGE = {'young': 0.82, 'old': 0.18}; MUS = {'averagemuscle': 0.78, 'maxmuscle': 0.22}; WT = {'averageweight': 0.92, 'minweight': 0.08}
if BODY in ('muscle', 'fmuscle'): MUS = {'averagemuscle': 0.05, 'maxmuscle': 0.95}; WT = {'averageweight': 1.0}
if BODY == 'female': AGE = {'young': 1.0}; MUS = {'averagemuscle': 1.0}; WT = {'averageweight': 0.8, 'minweight': 0.2}
for a, wa in AGE.items():
    for m, wm in MUS.items():
        for k, wk in WT.items(): addt(f'universal-{GENDER}-{a}-{m}-{k}.target', wa * wm * wk)
    for race in ('caucasian', 'african', 'asian'): addt(f'{race}-{GENDER}-{a}.target', wa / 3)   # an even mix: the wardrobe picks the skin tone

# ---------------------------------------------------------------- 2. MakeHuman skeleton joints + weights, mapped to ours
sk = json.load(open(MH + '/rigs/default.mhskel'))
J = {k: V[v].mean(0) for k, v in sk['joints'].items()}
mhhead = lambda b: J[sk['bones'][b]['head']]
mhtail = lambda b: J[sk['bones'][b]['tail']]
def ours(b):
    """MakeHuman bone → (our bone, share) list."""
    s = 'Left' if b.endswith('.L') else 'Right' if b.endswith('.R') else ''
    n = b[:-2] if s else b
    if n in ('root', 'pelvis', 'spine05'): return [('Hips', 1)]
    if n in ('spine04', 'spine03'): return [('Spine', 1)]
    if n == 'spine02': return [('Spine1', 1)]
    if n in ('spine01', 'breast'): return [('Spine2', 1)]
    if n.startswith('neck'): return [('Neck', 1)]
    if n == 'clavicle': return [(s + 'Shoulder', 1)]
    if n == 'shoulder01': return [(s + 'Shoulder', 0.45), (s + 'Arm', 0.55)]
    if n.startswith('upperarm'): return [(s + 'Arm', 1)]
    if n.startswith('lowerarm'): return [(s + 'ForeArm', 1)]
    if n.startswith('finger'):
        k, j = n[6:].split('-'); return [(f'{s}Hand{dict((v, f) for f, v in FINGERS)[int(k)]}{j}', 1)]
    if n in ('wrist',) or n.startswith('metacarpal'): return [(s + 'Hand', 1)]
    if n.startswith('upperleg'): return [(s + 'UpLeg', 1)]
    if n.startswith('lowerleg'): return [(s + 'Leg', 1)]
    if n == 'foot': return [(s + 'Foot', 1)]
    if n.startswith('toe'): return [(s + 'ToeBase', 1)]
    return [('Head', 1)]   # head, jaw, eyes, tongue and all the face bones
mhw = json.load(open(MH + '/rigs/default_weights.mhw'))['weights']
W = np.zeros((len(V), len(BIND)))
for b, lst in mhw.items():
    for ob, share in ours(b):
        for vi, w in lst: W[vi, BI[ob]] += w * share
W /= np.maximum(W.sum(1, keepdims=True), 1e-9)

# MakeHuman joint (bone head) for each of our bones, in MakeHuman units
MJ = {'Hips': mhhead('spine05'), 'Spine': mhhead('spine04'), 'Spine1': mhhead('spine02'), 'Spine2': mhhead('spine01'), 'Neck': mhhead('neck01'), 'Head': mhhead('head')}
for s, n in (('L', 'Left'), ('R', 'Right')):
    MJ.update({n + 'Shoulder': mhhead('clavicle.' + s), n + 'Arm': mhhead('upperarm01.' + s), n + 'ForeArm': mhhead('lowerarm01.' + s), n + 'Hand': mhhead('wrist.' + s),
               n + 'UpLeg': mhhead('upperleg01.' + s), n + 'Leg': mhhead('lowerleg01.' + s), n + 'Foot': mhhead('foot.' + s),
               n + 'ToeBase': np.mean([mhhead(f'toe{k}-1.{s}') for k in range(1, 6)], 0)})
for s_, n in (('L', 'Left'), ('R', 'Right')):
    for fn, k in FINGERS:
        for j in (1, 2, 3): MJ[f'{n}Hand{fn}{j}'] = mhhead(f'finger{k}-{j}.{s_}')
        MJ[f'{n}Hand{fn}Tip'] = mhtail(f'finger{k}-3.{s_}')
# global scale + ground: MakeHuman units are decimetres-ish; fit the body's height to our rig, soles on y = 0
bodyV = sorted({i for f in base.groups['body'] for i in base.f[f]})
y0, y1 = V[bodyV, 1].min(), V[bodyV, 1].max()
S = HTOP / (y1 - y0)
def to_m(p): q = np.array(p, dtype=float) * S; q[..., 1] -= y0 * S; return q
for k in MJ: MJ[k] = to_m(MJ[k])
print('scale', S, 'MH joints (m):'); [print(f'  {k:14s} mh {np.round(MJ[k], 3)}  ours {np.round(BP[k], 3)}') for k in ('Hips', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot')]

# ---------------------------------------------------------------- 2b. the rig's bind pose = MakeHuman's joints
# Trunk, neck, head, shoulders, hips, knees, ankles and toes sit where MakeHuman puts them (left/right mirrored);
# the arms keep the game's rest direction (every swing pose and the grip are authored against it) with MakeHuman's lengths.
def sym(a, b): m = (a + b * np.array([-1, 1, 1])) / 2; return m, m * np.array([-1, 1, 1])
for n in ('Shoulder', 'Arm', 'UpLeg', 'Leg', 'Foot', 'ToeBase'):
    MJ['Left' + n], MJ['Right' + n] = sym(MJ['Left' + n], MJ['Right' + n])
for n in ('Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'): MJ[n] = MJ[n] * np.array([0, 1, 1])

L_UP = np.linalg.norm(MJ['LeftForeArm'] - MJ['LeftArm']); L_FORE = np.linalg.norm(MJ['LeftHand'] - MJ['LeftForeArm'])
for s_, n in ((1, 'Left'), (-1, 'Right')):
    MJ[n + 'ForeArm_rest'] = MJ[n + 'Arm'] + armDir(s_) * L_UP; MJ[n + 'Hand_rest'] = MJ[n + 'ForeArm_rest'] + armDir(s_) * L_FORE
BP = {}
for name, _, _ in BIND:
    BP[name] = (MJ[name + '_rest'] if name + '_rest' in MJ else MJ[name]).copy()
# MakeHuman stands with its feet 40 cm apart; the bind brings knees and feet in to a natural stance (heights and
# depths kept) and the legs are bent to match (MJ stays MakeHuman's own, it's the source of that bend)
for s_, n in ((1, 'Left'), (-1, 'Right')):
    hx = BP[n + 'UpLeg'][0]
    BP[n + 'Leg'][0] = hx + s_ * 0.008; BP[n + 'Foot'][0] = hx + s_ * 0.016; BP[n + 'ToeBase'][0] = hx + s_ * 0.03
print('arm lengths', round(L_UP, 3), round(L_FORE, 3))
# ---------------------------------------------------------------- 3. per-bone bind retarget (MakeHuman rest → our bind)
CHILD = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head'}
for n in ('Left', 'Right'):
    CHILD.update({n + 'Shoulder': n + 'Arm', n + 'Arm': n + 'ForeArm', n + 'ForeArm': n + 'Hand', n + 'UpLeg': n + 'Leg', n + 'Leg': n + 'Foot', n + 'Foot': n + 'ToeBase'})
def rot_between(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); v = np.cross(a, b); c = float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-9: return np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); return np.eye(3) + vx + vx @ vx * (1 / (1 + c))
XF = {}
for name, _, _ in BIND:
    h_m, h_o = MJ[name], BP[name]
    if name in CHILD:
        d_m, d_o = MJ[CHILD[name]] - h_m, BP[CHILD[name]] - h_o
        R = rot_between(d_m, d_o); k = np.clip(np.linalg.norm(d_o) / np.linalg.norm(d_m), 0.85, 1.2)   # identity except the arms
        u = d_o / np.linalg.norm(d_o)
    else:   # end bones: follow the parent's rotation, no stretch
        par = [p for n2, p, _ in BIND if n2 == name][0]; R = XF[par][0]; k = 1.0; u = np.array([0, 1.0, 0])
    XF[name] = (R, k, u, h_m, h_o)
def palm(n):
    # palm normal (out of the palm) and hand direction, from MakeHuman's own finger joints
    K = [MJ[f'{n}Hand{f}1'] for f in ('Index', 'Middle', 'Ring', 'Pinky')]; wr = MJ[n + 'Hand']
    hd = np.mean(K, 0) - wr; hd /= np.linalg.norm(hd)
    across = K[0] - K[3]; nrm = np.cross(hd, across); nrm /= np.linalg.norm(nrm)
    tips = np.mean([MJ[f'{n}Hand{f}Tip'] for f in ('Index', 'Middle', 'Ring', 'Pinky')], 0) - np.mean(K, 0)
    if np.dot(nrm, tips) < 0: nrm = -nrm        # the fingers rest curled a little toward the palm
    return hd, nrm
CURL = {}
for s_, n in ((1, 'Left'), (-1, 'Right')):
    R, k, u, h_m, h_o = XF[n + 'Hand']
    hd, nrm = palm(n); hd_b = R @ hd; nrm_b = R @ nrm
    ad = armDir(s_); nin = np.array([-s_ * math.cos(ARM_TILT), -math.sin(ARM_TILT), 0.0])
    # first point the hand along the forearm (the bone direction), then twist about it so the palm faces in
    R1 = rot_between(hd_b, ad); n1 = R1 @ nrm_b; n1 -= ad * np.dot(n1, ad); n1 /= np.linalg.norm(n1)
    ang = math.atan2(np.dot(np.cross(n1, nin), ad), np.dot(n1, nin)); c, sn = math.cos(ang), math.sin(ang)
    K_ = np.array([[0, -ad[2], ad[1]], [ad[2], 0, -ad[0]], [-ad[1], ad[0], 0]]); R2 = np.eye(3) + sn * K_ + (1 - c) * K_ @ K_
    Rh = R2 @ R1 @ R
    XF[n + 'Hand'] = (Rh, 1.0, u, h_m, h_o)
    T = lambda p: (p - h_m) @ Rh.T + h_o
    for fn, _ in FINGERS:
        for j in (1, 2, 3):
            XF[f'{n}Hand{fn}{j}'] = (Rh, 1.0, u, h_m, h_o); BP[f'{n}Hand{fn}{j}'] = T(MJ[f'{n}Hand{fn}{j}'])
        # curl axis of each segment, in the bind frame (bones have no rest rotation, so it is also their local axis)
        for j in (1, 2, 3):
            a0 = T(MJ[f'{n}Hand{fn}{j}']); a1 = T(MJ[f'{n}Hand{fn}{j + 1}'] if j < 3 else MJ[f'{n}Hand{fn}Tip'])
            d = a1 - a0; d /= np.linalg.norm(d); ax = np.cross(d, nin); ax /= np.linalg.norm(ax)
            CURL[f'{n}Hand{fn}{j}'] = [round(float(v), 5) for v in ax]
def retarget(P, Wv):
    """Linear-blend the per-bone transforms (positions already in metres)."""
    out = np.zeros_like(P)
    for name, (R, k, u, h_m, h_o) in XF.items():
        b = BI[name]; w = Wv[:, b]
        if not w.any(): continue
        q = (P - h_m) @ R.T; q = q + np.outer(q @ u, u) * (k - 1)
        out += w[:, None] * (q + h_o)
    return out

# ---------------------------------------------------------------- 4. fit pieces
# Clothes cut for a man hang off a woman's chest like a tent. On the female builds every garment is pulled in toward
# the skin (its distance from the body is scaled by SNUG), so tops follow the figure instead.
SNUG = 0.6 if GENDER == 'female' else 1.0
def fit_piece(proxy_path):
    px = Proxy(proxy_path); P = px.fit(V)
    if SNUG < 1 and '/clothes/' in proxy_path and 'shoes' not in proxy_path and 'fedora' not in proxy_path:
        skin = np.einsum('ij,ijk->ik', px.w, V[px.refs]); P = skin + (P - skin) * SNUG
    Wp = np.einsum('ij,ijk->ik', px.w, W[px.refs]); Wp /= np.maximum(Wp.sum(1, keepdims=True), 1e-9)
    ob = Obj(px.obj)
    return px, ob, to_m(P), Wp
pieces = {}
def add(key, path): pieces[key] = fit_piece(path)
add('body', SA + '/proxymeshes/' + PROXY + '.proxy')
add('brows', SA + '/eyebrows/eyebrow001/eyebrow001.mhclo')
add('lashes', SA + '/eyelashes/eyelashes02/eyelashes02.mhclo')
add('eyes', SA + '/eyes/low-poly/low-poly.mhclo')
bpx, bob, bP, bW = pieces['body']
badj = defaultdict(set)
for fv in bob.f:
    for a_ in fv:
        for b_ in fv: badj[a_].add(b_)
def cover(D):
    """Body vertices a garment hides (it deletes base vertices D): (hidden, tucked). Two rings of skin are kept under
    every cloth edge so no gap opens at a collar, cuff or hem; that kept skin is tucked in a little at run time."""
    isin = np.zeros(len(V), bool); isin[[d for d in D if d < len(V)]] = True
    d0 = (bpx.w * isin[bpx.refs]).sum(1) > 0.5; dm = d0.copy()
    for _ in range(2):
        grow = ~dm
        for v in np.where(~dm)[0]:
            for u in badj[v]: grow[u] = True
        dm = ~grow
    return dm, d0 & ~dm

def tri_mesh(ob, P, Wp, keep_face=None):
    """OBJ faces → unique (v, vt) vertices, triangles; returns dict of arrays."""
    key, verts, uvs, tris, src, tface = {}, [], [], [], [], []
    for fi, (fv, ft) in enumerate(zip(ob.f, ob.ft)):
        if keep_face and not keep_face(fi, fv): continue
        ids = []
        for v, t in zip(fv, ft):
            kk = (v, t)
            if kk not in key: key[kk] = len(src); src.append(v); uvs.append(ob.vt[t] if t >= 0 else (0, 0))
            ids.append(key[kk])
        for j in range(1, len(ids) - 1): tris.append((ids[0], ids[j], ids[j + 1])); tface.append(fi)
    src = np.array(src); return {'src': src, 'pos': P[src], 'w': Wp[src], 'uv': np.array(uvs), 'tri': np.array(tris, dtype=np.int64), 'tface': np.array(tface)}

parts = {}
parts['body'] = tri_mesh(bob, bP, bW)   # the whole body: what each garment hides is chosen at run time (COVER)
for k in ('brows', 'lashes', 'eyes'):
    _, ob, P, Wp = pieces[k]; parts[k] = tri_mesh(ob, P, Wp)

# ---------------------------------------------------------------- 4b. the wardrobe: garments cut out of MakeHuman's outfits
TEE_V = 0.585   # suit06's atlas: the tee is the top band, the jeans below
COVER, TEXOF = {}, {}          # part → (hidden body verts, tucked body verts);  part → (texture file, source outfit)
def load_rgb(path, size=1024): return np.asarray(Image.open(path).convert('RGB').resize((size, size), Image.LANCZOS))
class Suit:
    def __init__(self, name):
        self.name = name; d = SA + '/clothes/' + name
        self.px, self.ob, self.P, self.W = fit_piece([d + '/' + f for f in os.listdir(d) if f.endswith('.mhclo')][0])
        n = len(self.P); par = list(range(n))
        def f(x):
            while par[x] != x: par[x] = par[par[x]]; x = par[x]
            return x
        for fv in self.ob.f:
            for a_ in fv[1:]: par[f(a_)] = f(fv[0])
        c = np.array([f(i) for i in range(n)]); ids = sorted(set(c), key=lambda k: -(c == k).sum())
        rank = {k: i for i, k in enumerate(ids)}; self.comp = np.array([rank[k] for k in c])   # 0 = the biggest connected piece
        self.dif = [d + '/' + f for f in os.listdir(d) if f.endswith('diffuse.png')][0]
        self.tex = load_rgb(self.dif); self.taken = []
    def face_rgb(self, fi):
        uv = np.mean([self.ob.vt[t] for t in self.ob.ft[fi]], axis=0)
        return self.tex[min(1023, int((1 - uv[1]) * 1024)), min(1023, int(uv[0] * 1024))].astype(float)
    def take(self, key, ok):
        """One garment: the faces ok(fi, fv) keeps."""
        parts[key] = tri_mesh(self.ob, self.P, self.W, ok); vm = np.zeros(len(self.P), bool); vm[parts[key]['src']] = True
        self.taken.append((key, vm)); TEXOF[key] = self.name; return parts[key]
    def done(self):
        """Share out the body vertices this outfit hides: each goes to the garment whose cloth lies nearest."""
        D = np.array(sorted(d for d in self.px.delete if d < len(V))); 
        if not len(D): 
            for key, vm in self.taken: COVER[key] = cover(set())
            return
        B = to_m(V[D]); near = np.empty(len(D), int)
        for i in range(0, len(D), 500): near[i:i + 500] = np.argmin(((B[i:i + 500, None, :] - self.P[None]) ** 2).sum(2), axis=1)
        for key, vm in self.taken: COVER[key] = cover(set(D[vm[near]].tolist()))
def comp_is(S, *ranks): return lambda fi, fv: S.comp[fv[0]] in ranks
lum = lambda c: c.mean() / 255
sat = lambda c: (c.max() - c.min()) / max(c.max(), 1)

S6 = Suit('male_casualsuit06')
S6.take('shirt', comp_is(S6, 0)); S6.take('pants', comp_is(S6, 1)); S6.done()
# shorts: the same jeans, cut off just above the knee (their own body cover, so the shins show)
S6b = Suit('male_casualsuit06'); KNEE = 0.56   # the hem: just above the knee (the joint is at 0.52 in MakeHuman's rest pose)
# keep every face that reaches above the hem, then pull what hangs below it up to the hem, so the edge is level
S6b.P = S6b.P.copy(); _low = (S6b.comp == 1) & (S6b.P[:, 1] < KNEE)
S6b.take('pants_shorts', lambda fi, fv: S6b.comp[fv[0]] == 1 and max(S6b.P[v][1] for v in fv) > KNEE + 0.004); S6b.done()   # body cover from the true shape
S6b.P[_low, 1] = KNEE; parts['pants_shorts'] = tri_mesh(S6b.ob, S6b.P, S6b.W, lambda fi, fv: S6b.comp[fv[0]] == 1 and max(S6b.P[v][1] for v in fv) > KNEE + 0.004)
S2 = Suit('male_casualsuit02'); S2.take('top_long', comp_is(S2, 0)); S2.done()
S3 = Suit('male_casualsuit03'); S3.take('top_button', comp_is(S3, 0)); S3.done()
S5 = Suit('male_casualsuit05'); S5.take('jk_padded', comp_is(S5, 0)); S5.take('jk_padded_in', comp_is(S5, 2, 3)); S5.done()
SE = Suit('male_elegantsuit01')
def blazer_kind(fi):
    c = SE.face_rgb(fi)
    return 'tie' if (sat(c) > 0.25 and lum(c) > 0.2 and lum(c) < 0.75) else 'in' if lum(c) > 0.45 else 'jk'
bk = {fi: blazer_kind(fi) for fi, fv in enumerate(SE.ob.f) if SE.comp[fv[0]] == 0}
SE.take('jk_blazer', lambda fi, fv: bk.get(fi) == 'jk'); SE.take('jk_blazer_in', lambda fi, fv: bk.get(fi) == 'in'); SE.take('jk_blazer_tie', lambda fi, fv: bk.get(fi) == 'tie')
SE.take('pants_slacks', comp_is(SE, 1)); SE.done()
SW = Suit('male_worksuit01')
SW.take('pants_overalls', lambda fi, fv: SW.comp[fv[0]] != 1); SW.take('top_overalls', comp_is(SW, 1)); SW.done()
print('wardrobe:', {k: len(p['pos']) for k, p in parts.items()})

SHOES = {'shoes': 'shoes05', 'shoes_trainers': 'shoes06', 'shoes_loafers': 'shoes01', 'shoes_hikers': 'shoes02', 'shoes_boots': 'shoes03', 'shoes_dress': 'shoes04'}
SOCK = lambda key: 'sock' + key[5:]
for key, nm in SHOES.items():
    px, ob, P, Wp = fit_piece(SA + '/clothes/%s/%s.mhclo' % (nm, nm)); COVER[key] = cover(px.delete)
    # the socks are their own pieces of the mesh, textured from a small lilac patch: split them off so they stay white
    tex = load_rgb(SA + '/clothes/%s/%s_diffuse.png' % (nm, nm), 512).astype(float); par = list(range(len(P)))
    def f(x):
        while par[x] != x: par[x] = par[par[x]]; x = par[x]
        return x
    for fv in ob.f:
        for a_ in fv[1:]: par[f(a_)] = f(fv[0])
    votes = defaultdict(list)
    for fv, ft in zip(ob.f, ob.ft):
        uv = np.mean([ob.vt[t] for t in ft], axis=0); c = tex[min(511, int((1 - uv[1]) * 512)), min(511, int(uv[0] * 512))]
        votes[f(fv[0])].append(c[2] > c[0] + 4 and c.mean() > 90 and (c.max() - c.min()) < 60)
    socky = {k for k, v in votes.items() if np.mean(v) > 0.7}; print(key, 'sock pieces', len(socky), 'of', len(votes))
    parts[key] = tri_mesh(ob, P, Wp, lambda fi, fv: f(fv[0]) not in socky)
    if socky: parts[SOCK(key)] = tri_mesh(ob, P, Wp, lambda fi, fv: f(fv[0]) in socky)
HAIRS = {'hair': 'short02', 'hair_short1': 'short01', 'hair_short3': 'short03', 'hair_short4': 'short04', 'hair_afro': 'afro01', 'hair_bob': 'bob01', 'hair_bob2': 'bob02',
         'hair_braid': 'braid01', 'hair_long': 'long01', 'hair_pony': 'ponytail01'}
for key, nm in HAIRS.items():
    px, ob, P, Wp = fit_piece(SA + '/hair/%s/%s.mhclo' % (nm, nm)); parts[key] = tri_mesh(ob, P, Wp)
px, ob, P, Wp = fit_piece(SA + '/clothes/fedora01/fedora01.mhclo'); parts['fedora'] = tri_mesh(ob, P, Wp); FEDORA_OBJ = px.obj

def normals(p):
    P, Tr = p['pos'], p['tri']; n = np.zeros_like(P)
    fn = np.cross(P[Tr[:, 1]] - P[Tr[:, 0]], P[Tr[:, 2]] - P[Tr[:, 0]])
    for j in range(3): np.add.at(n, Tr[:, j], fn)
    # weld by source vertex (uv seams share a position)
    acc = defaultdict(lambda: np.zeros(3))
    for i, s in enumerate(p['src']): acc[s] += n[i]
    n = np.array([acc[s] for s in p['src']]); return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
# ---------------------------------------------------------------- 5. onto our bind pose
HEADRIGID = ('hair', 'brows', 'lashes', 'eyes', 'fedora')
for k, p in parts.items():
    w = p['w']
    if k.startswith(HEADRIGID): w = np.zeros_like(w); w[:, BI['Head']] = 1; p['w'] = w   # rigid with the head
    p['pos'] = retarget(p['pos'], w)
# soles on the ground: our feet sit where the rig's foot bones are; drop everything so the shoe soles touch y = 0
ground = parts['shoes']['pos'][:, 1].min()
for p in parts.values(): p['pos'][:, 1] -= ground
for k_ in BP: BP[k_] = BP[k_] - np.array([0, ground, 0])
for k in SHOES:   # every pair stands on the same ground
    dy = parts[k]['pos'][:, 1].min(); parts[k]['pos'][:, 1] -= dy
    if SOCK(k) in parts: parts[SOCK(k)]['pos'][:, 1] -= dy
feet = parts['body']['pos'][:, 1].min(); print('bare feet hover', feet)
# clothes sit a few millimetres proud of the skin: bending the arms onto our rig squeezes the armpits
PROUD = {'shirt': 0.0045, 'pants': 0.003, 'pants_shorts': 0.003, 'top_long': 0.0045, 'top_button': 0.0045, 'jk_padded': 0.006, 'jk_padded_in': 0.004,
         'jk_blazer': 0.005, 'jk_blazer_in': 0.005, 'jk_blazer_tie': 0.005, 'pants_slacks': 0.003, 'pants_overalls': 0.004, 'top_overalls': 0.002}
for k, d in PROUD.items():
    p = parts[k]; p['pos'] = p['pos'] + normals(p) * d
print('after retarget: top', max(p['pos'][:, 1].max() for p in parts.values()), 'shoe sole', parts['shoes']['pos'][:, 1].min())

# ---------------------------------------------------------------- 6. normals (welded across uv seams), skin weights (top 4)
def top4(w):
    idx = np.argsort(-w, axis=1)[:, :4]; val = np.take_along_axis(w, idx, 1); val /= np.maximum(val.sum(1, keepdims=True), 1e-9)
    return idx.astype(np.uint8), np.round(val * 255).astype(np.uint8)

# ---------------------------------------------------------------- 7. cap (fitted to this head) + hair that fits under it
# head frame in our bind space: centre of the skull, measured from the body's head vertices
hp = parts['body']['pos'][parts['body']['w'][:, BI['Head']] > 0.9]
hc = np.array([0, hp[:, 1].max() - 0.105, (hp[:, 2].max() + hp[:, 2].min()) / 2 - 0.004])
HD = hp - hc; HR = np.linalg.norm(HD, axis=1); HU = HD / HR[:, None]
def extent(theta, phi):
    # furthest skull point in a narrow cone round this direction (a thin ray can slip between sparse vertices)
    d = np.array([math.sin(phi) * math.sin(theta), math.cos(phi), math.sin(phi) * math.cos(theta)])
    for cone in (0.14, 0.22, 0.35):
        sel = HU @ d > math.cos(cone)
        if sel.any(): return float((HR[sel] * (HU[sel] @ d)).max())
    return 0.1
def band(theta): return 1.06 + 0.36 * (1 - math.cos(theta)) / 2      # radians down from the crown: high over the brow, low at the back
NT, NP_ = 36, 10
cpos, cuv, ctri = [], [], []
for j in range(NP_ + 1):
    for i in range(NT + 1):
        th = 2 * math.pi * i / NT; phi = band(th) * j / NP_
        if j == 0: r = extent(0, 0.0)
        else:   # a cap is a smooth shell: take the skull's extent over a small neighbourhood of directions, not every bump
            r = max(extent(th + dt, phi + dp) for dt in (-0.18, 0, 0.18) for dp in (-0.12, 0, 0.12) if phi + dp > 0.02)
        r = r + 0.011 + 0.003 * (j / NP_)   # cloth thickness + a little room for squashed hair
        d = np.array([math.sin(phi) * math.sin(th), math.cos(phi), math.sin(phi) * math.cos(th)])
        cpos.append(hc + d * r); cuv.append((i / NT, j / NP_))
for j in range(NP_):
    for i in range(NT):
        a = j * (NT + 1) + i; b = a + NT + 1; ctri += [(a, b, a + 1), (b, b + 1, a + 1)]
dome_pos, dome_uv, dome_tri = list(cpos), list(cuv), list(ctri)
def with_visor(th0):
    # visor: a rounded tongue out from the band, about 7.5 cm deep and 19 cm across, curving down at its sides
    pos, uv, tri = list(dome_pos), list(dome_uv), list(dome_tri)
    f = np.array([math.sin(th0), 0, math.cos(th0)]); r = np.array([math.cos(th0), 0, -math.sin(th0)])
    def band_pt(a):   # point on the cap's band edge at angle a
        j = NP_; i = (a % (2 * math.pi)) / (2 * math.pi) * NT; i0 = int(math.floor(i)) % NT; t = i - math.floor(i)
        p0 = np.array(dome_pos[j * (NT + 1) + i0]); p1 = np.array(dome_pos[j * (NT + 1) + i0 + 1]); return p0 * (1 - t) + p1 * t
    NS, NR = 14, 4; bb = len(pos); span = 1.05
    for a_ in range(NS + 1):
        sx = -1 + 2 * a_ / NS; inner = band_pt(th0 + sx * span)
        depth = 0.075 * math.sqrt(max(0.0, 1 - sx * sx)) + 0.004
        for k in range(NR + 1):
            t = k / NR
            p = inner + f * depth * t + r * (sx * 0.012 * t)
            p = p + np.array([0, -0.006 * t - 0.016 * (sx * sx) * t - 0.004 * t * t, 0])   # tipped down a little, sides curved down
            pos.append(p); uv.append((0.02 + 0.1 * t, 0.97 - 0.02 * sx))
    for a_ in range(NS):
        for k in range(NR):
            i0 = bb + a_ * (NR + 1) + k; i1 = i0 + NR + 1
            tri += [(i0, i1, i0 + 1), (i1, i1 + 1, i0 + 1)]
    return pos, uv, tri
def cap_part(th0):
    pos, uv, tri = with_visor(th0)
    c = {'pos': np.array(pos), 'uv': np.array(uv), 'tri': np.array(tri), 'src': np.arange(len(pos))}
    c['w'] = np.zeros((len(pos), len(BIND))); c['w'][:, BI['Head']] = 1; return c
cpos, cuv, ctri = with_visor(0)
cap = {'pos': np.array(cpos), 'uv': np.array(cuv), 'tri': np.array(ctri), 'src': np.arange(len(cpos))}
cap['w'] = np.zeros((len(cpos), len(BIND))); cap['w'][:, BI['Head']] = 1
# hair under the cap: drop hair triangles whose centre lies inside the cap's dome above the band
def inside_cap(pt):
    rel = pt - hc; r = np.linalg.norm(rel); phi = math.acos(np.clip(rel[1] / max(r, 1e-9), -1, 1)); th = math.atan2(rel[0], rel[2])
    return phi < band(th) - 0.06
for hk in HAIRS:
    H = parts[hk]; cent = H['pos'][H['tri']].mean(1)
    H['tri_capped'] = H['tri'][[not inside_cap(c) for c in cent]]
parts['cap'] = cap_part(0); parts['capBack'] = cap_part(math.pi)

# ---------------------------------------------------------------- 8. pack
meta, blobs, off = {'bones': [n for n, _, _ in BIND], 'parts': {}}, [], 0
def put(arr, dtype):
    global off
    b = np.ascontiguousarray(arr, dtype=dtype).tobytes(); pad = (-len(b)) % 4; blobs.append(b + b'\0' * pad)
    r = [off, len(b)]; off += len(b) + pad; return r
for k, p in parts.items():
    n = normals(p) if not k.startswith('cap') else None
    si, sw = top4(p['w'])
    assert np.abs(p['pos']).max() < 2, k
    tiled = p['uv'].min() < -0.001 or p['uv'].max() > 1.001
    e = {'count': len(p['pos']), 'pos': put(np.round(p['pos'] / 2 * 32767), '<i2'), ('uvf' if tiled else 'uv'): put(p['uv'], '<f4') if tiled else put(np.round(np.clip(p['uv'], 0, 1) * 65535), '<u2'), 'skinIndex': put(si, 'u1'), 'skinWeight': put(sw, 'u1'),
         'index': put(p['tri'].reshape(-1), '<u2' if len(p['pos']) < 65536 else '<u4')}
    if n is not None: e['normal'] = put(np.round(n * 127), 'i1')
    if 'tri_capped' in p: e['indexCapped'] = put(p['tri_capped'].reshape(-1), '<u2')
    meta['parts'][k] = e
B = parts['body']; meta['hide'], meta['tuck'] = {}, {}
bfaces = [set(fv) for fv in bob.f]
for k, (dm, tk) in COVER.items():
    fhid = np.array([all(dm[v] for v in fv) for fv in bob.f])
    meta['hide'][k] = put(np.where(fhid[B['tface']])[0], '<u2' if len(B['tri']) < 65536 else '<u4')
    meta['tuck'][k] = put(np.where(tk[B['src']])[0], '<u2')
meta['feet'] = float(feet)
_h = (B['w'][:, BI['Head']] > 0.9) & (np.abs(B['pos'][:, 1] - (parts['eyes']['pos'][:, 1].mean() - 0.03)) < 0.012)
_e = B['pos'][_h][np.argmax(B['pos'][_h][:, 0])]; meta['ear'] = [float(v) for v in _e]
ey = parts['eyes']['pos']; meta['eyes'] = [float(np.abs(ey[:, 0]).mean()), float(ey[:, 1].mean()), float(ey[:, 2].max())]
import base64
binary = b''.join(blobs)
if os.path.exists(OUT + '/golfer.bin'): os.remove(OUT + '/golfer.bin')   # the artifact host serves json, not .bin: geometry rides inside golfer.json

# ---------------------------------------------------------------- 9. textures
def save(im, name, q=88):
    if BODY: return   # textures belong to the default build
    im.save(OUT + '/' + name, quality=q) if name.endswith('.jpg') else im.save(OUT + '/' + name, optimize=True)
def neutral(im, mask=None, target=0.82):
    """Divide out the average colour so a material colour can tint it: keeps the relative detail."""
    a = np.asarray(im.convert('RGB'), dtype=np.float32) / 255
    m = a[mask] if mask is not None else a.reshape(-1, 3)
    mean = m.mean(0); out = np.clip(a / mean * target, 0, 1)
    return Image.fromarray((out * 255).astype(np.uint8))
skin = Image.open(SA + '/skins/young_caucasian_male/young_lightskinned_male_diffuse.png').convert('RGB')
sa = np.asarray(skin, dtype=np.float32); smask = (sa.sum(2) > 60)
skinN = neutral(skin, smask, 0.93).resize((1024, 1024), Image.LANCZOS); save(skinN, 'skin.jpg')
# stubble mask (beard area on the face, in the body uv layout): body faces on the lower face below the nose
B = parts['body']; up = B['pos']; uvb = B['uv']
mask = Image.new('L', (1024, 1024), 0); md = ImageDraw.Draw(mask)
nose_y = hc[1] - 0.02
for t in B['tri']:
    c = up[t].mean(0)
    if B['w'][t[0], BI['Head']] > 0.5 and c[2] > hc[2] + 0.02 and c[1] < nose_y and c[1] > hc[1] - 0.15:
        md.polygon([(uvb[i][0] * 1024, (1 - uvb[i][1]) * 1024) for i in t], fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(6)); save(mask, 'stubble.png')
suit = Image.open(SA + '/clothes/male_casualsuit06/male_casualsuit06_diffuse.png').convert('RGB')
ao = Image.open(SA + '/clothes/male_casualsuit06/male_casualsuit06_ao.png').convert('L').resize(suit.size)
suitA = np.asarray(suit, dtype=np.float32) * (0.35 + 0.65 * np.asarray(ao, dtype=np.float32)[..., None] / 255)
# grey cloth: luminance only (the wardrobe colours both the tee and the jeans)
import cv2
sa8 = np.asarray(suit, dtype=np.uint8); hsv = cv2.cvtColor(sa8, cv2.COLOR_RGB2HSV); Hh = sa8.shape[0]
tee_rows = int(Hh * (1 - TEE_V))
g = sa8.mean(2); local = cv2.GaussianBlur(g, (0, 0), 25)
logo = ((hsv[..., 1] > 40) | (g < local * 0.82)) & (np.arange(Hh)[:, None] < tee_rows) & (g > 20)
logo = cv2.dilate(logo.astype(np.uint8) * 255, np.ones((9, 9), np.uint8))
clean = cv2.inpaint(np.ascontiguousarray(suitA.clip(0, 255).astype(np.uint8)), logo, 12, cv2.INPAINT_TELEA).astype(np.float32)
# the corner credit text on the unused part of the atlas too
clean[int(Hh * 0.94):, int(Hh * 0.82):] = clean[int(Hh * 0.94):, int(Hh * 0.82):].mean((0, 1))
lum = clean.mean(2); tee = lum[:tee_rows]; jeans = lum[tee_rows:]
lum[:tee_rows] = np.clip(tee / np.percentile(tee[tee > 8], 60) * 0.97, 0.66, 1.0)   # white cloth: never darker than a deep fold          # white tee → near-white grey, keeps the folds
denim = hsv[tee_rows:, :, 1] > 45                                         # the blue cloth itself, not the atlas background
jm = jeans[denim].mean(); lum[tee_rows:] = np.clip(0.9 + (jeans - jm) / jm * 0.55, 0.35, 1.0)   # denim → light grey weave, faded patches toned down
save(Image.fromarray((np.clip(lum, 0, 1) * 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS), 'suit.jpg')
save(Image.open(SA + '/clothes/male_casualsuit06/male_casualsuit06_normal.png').convert('RGB').resize((1024, 1024), Image.LANCZOS), 'suit_n.jpg', 92)
sh = Image.open(SA + '/clothes/shoes05/shoes05_diffuse.png').convert('RGB')
sl = np.asarray(sh, dtype=np.float32).mean(2); sl = sl / np.percentile(sl, 80) * 0.95
save(Image.fromarray((np.clip(sl, 0, 1) * 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS), 'shoes.jpg')
hr = Image.open(SA + '/hair/short02/short02_diffuse.png').convert('RGBA')
ha = np.asarray(hr, dtype=np.float32); hl = ha[..., :3].mean(2); vis = ha[..., 3] > 100
hl = hl / max(1, np.percentile(hl[vis], 60)) * 0.88
hout = np.dstack([np.clip(hl, 0, 1) * 255] * 3 + [ha[..., 3]]).astype(np.uint8)
save(Image.fromarray(hout, 'RGBA').resize((1024, 1024), Image.LANCZOS), 'hair.png')
save(Image.open(SA + '/hair/short02/short02_normal.png').convert('RGB').resize((1024, 1024), Image.LANCZOS), 'hair_n.jpg')
for k, src in (('brows', SA + '/eyebrows/eyebrow001/eyebrow001.png'), ('lashes', SA + '/eyelashes/eyelashes02/eyelashes02.png')):
    im = Image.open(src).convert('RGBA'); a = np.asarray(im, dtype=np.float32); l = a[..., :3].mean(2)
    l = l / max(1, np.percentile(l[a[..., 3] > 100], 60)) * 0.6
    save(Image.fromarray(np.dstack([np.clip(l, 0, 1) * 255] * 3 + [a[..., 3]]).astype(np.uint8), 'RGBA').resize((256, 256), Image.LANCZOS), k + '.png')
save(Image.open(SA + '/eyes/materials/brown_eye.png').convert('RGB').resize((256, 256), Image.LANCZOS), 'eyes.jpg')
# ---------------------------------------------------------------- 9b. wardrobe textures: grey cloth the outfit colours tint
def uv_mask(p, size=1024, grow=7):
    m = np.zeros((size, size), np.uint8); pts = np.stack([p['uv'][:, 0] * size, (1 - p['uv'][:, 1]) * size], -1)
    for t in p['tri']: cv2.fillConvexPoly(m, np.round(pts[t]).astype(np.int32), 255)
    return cv2.dilate(m, np.ones((grow, grow), np.uint8)) > 0
def grey_atlas(S, keys, solid=()):
    d = os.path.dirname(S.dif); L = S.tex.astype(np.float32).mean(2)
    ao = [f for f in os.listdir(d) if f.endswith('_ao.png')]
    if ao: L = L * (0.35 + 0.65 * np.asarray(Image.open(d + '/' + ao[0]).convert('L').resize((1024, 1024)), dtype=np.float32) / 255)
    hsv = cv2.cvtColor(S.tex, cv2.COLOR_RGB2HSV); out = np.full((1024, 1024), 0.85, np.float32)
    for k in keys:
        m = uv_mask(parts[k]); l = L
        if k in solid:   # one plain colour: paint out the logo and the trim stripes
            hd = np.median(hsv[..., 0][m]); odd = (m & (np.abs(hsv[..., 0].astype(int) - hd) > 14)).astype(np.uint8) * 255
            l = cv2.inpaint(np.clip(L, 0, 255).astype(np.uint8), cv2.dilate(odd, np.ones((9, 9), np.uint8)), 9, cv2.INPAINT_TELEA).astype(np.float32)
        med = np.percentile(l[m], 60); out[m] = np.clip(0.9 + (l[m] - med) / max(med, 60) * 0.5, 0.4, 1.0)
    save(Image.fromarray((out * 255).astype(np.uint8)), 'g_' + S.name + '.jpg')
    for k in keys: meta.setdefault('tex', {})[k] = 'g_' + S.name + '.jpg'
grey_atlas(S6b, ['pants_shorts']); meta['tex']['pants_shorts'] = 'suit.jpg'; (os.path.exists(OUT + '/g_male_casualsuit06.jpg') and os.remove(OUT + '/g_male_casualsuit06.jpg'))
grey_atlas(S2, ['top_long'], solid=('top_long',)); grey_atlas(S3, ['top_button']); grey_atlas(S5, ['jk_padded', 'jk_padded_in'])
grey_atlas(SE, ['jk_blazer', 'jk_blazer_in', 'jk_blazer_tie', 'pants_slacks']); grey_atlas(SW, ['pants_overalls', 'top_overalls'])
for key, nm in SHOES.items():
    if key == 'shoes': continue
    im = np.asarray(Image.open(SA + '/clothes/%s/%s_diffuse.png' % (nm, nm)).convert('RGB').resize((512, 512), Image.LANCZOS), dtype=np.float32).mean(2)
    m = uv_mask(parts[key], 512, 3); im = im / max(40, np.percentile(im[m], 75)) * 0.92
    save(Image.fromarray((np.clip(im, 0, 1) * 255).astype(np.uint8)), 's_' + key[6:] + '.jpg'); meta['tex'][key] = 's_' + key[6:] + '.jpg'; meta['tex'][SOCK(key)] = 's_' + key[6:] + '.jpg'
for key, nm in HAIRS.items():
    if key == 'hair': continue
    a = np.asarray(Image.open([SA + '/hair/' + nm + '/' + f for f in sorted(os.listdir(SA + '/hair/' + nm)) if 'diffuse' in f and f.endswith('.png')][0]).convert('RGBA').resize((512, 512), Image.LANCZOS), dtype=np.float32)
    l = a[..., :3].mean(2); vis = a[..., 3] > 100; l = l / max(1, np.percentile(l[vis], 60)) * 0.88
    save(Image.fromarray(np.dstack([np.clip(l, 0, 1) * 255] * 3 + [a[..., 3]]).astype(np.uint8), 'RGBA'), 'h_' + key[5:] + '.png'); meta['tex'][key] = 'h_' + key[5:] + '.png'
fd = os.path.dirname(FEDORA_OBJ); im = np.asarray(Image.open(fd + '/fedora_diffuse.png').convert('RGB').resize((512, 512), Image.LANCZOS), dtype=np.float32).mean(2)
save(Image.fromarray((np.clip(im / np.percentile(im, 70) * 0.9, 0, 1) * 255).astype(np.uint8)), 'fedora.jpg'); meta['tex']['fedora'] = 'fedora.jpg'
# where the prints go on the tee: the uv at a point on the chest / upper back, and how uv changes per metre there
Sh = parts['shirt']; P, UV = Sh['pos'], Sh['uv']
def uv_at(target, normal_sign):
    cand = np.where(np.sign(P[:, 2]) == normal_sign)[0]
    d = np.linalg.norm(P[cand] - target, axis=1); near = cand[np.argsort(d)[:24]]
    # least-squares uv ≈ uv0 + J · (x, y) over the nearby vertices
    X = np.c_[np.ones(len(near)), P[near, 0] - target[0], P[near, 1] - target[1]]
    coef, *_ = np.linalg.lstsq(X, UV[near], rcond=None)
    return [float(v) for v in coef[0]] + [float(v) for v in coef[1]] + [float(v) for v in coef[2]]   # u0 v0, du/dx dv/dx, du/dy dv/dy
zf = P[(np.abs(P[:, 0]) < 0.03) & (np.abs(P[:, 1] - 1.33) < 0.03) & (P[:, 2] > 0), 2].max()
zb = P[(np.abs(P[:, 0]) < 0.03) & (np.abs(P[:, 1] - 1.30) < 0.03) & (P[:, 2] < 0), 2].min()
meta['print'] = uv_at(np.array([0, 1.33, zf]), 1)
meta['printBack'] = uv_at(np.array([0, 1.30, zb]), -1)
meta['soleY'] = 0.028
meta['bind'] = {k: [round(float(v), 5) for v in BP[k]] for k, _, _ in BIND}
meta['htop'] = float(parts['body']['pos'][:, 1].max())
meta['curl'] = CURL
meta['headCentre'] = hc.tolist()
meta['bin'] = base64.b64encode(binary).decode('ascii')
json.dump(meta, open(OUT + ('/golfer_%s.json' % BODY if BODY else '/golfer.json'), 'w'))
tot = sum(os.path.getsize(OUT + '/' + f) for f in os.listdir(OUT))
print({k: (v['count'], len(np.frombuffer(b'', dtype=np.uint8))) for k, v in meta['parts'].items()}, 'files', sorted(os.listdir(OUT)), 'total KB', tot // 1024)
