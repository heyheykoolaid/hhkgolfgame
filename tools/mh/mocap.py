"""Motion capture → the game's rig.

Reads BVH clips (CMU golf captures, Bandai Namco locomotion), maps each source bone onto the game's 22-bone rig
and writes local bone rotations per frame (30 fps) to packages/client/public/golfer/anims.json.

Retarget: BVH rest pose has no rotations, so a source bone's world rotation S(t) is also its rotation away from rest.
Our bones have no rest rotation either. For each target bone, A rotates our rest bone direction onto the source rest
bone direction; then T(t) = Y · S(t) · A puts our bone along the captured bone (with its twist), Y turning the whole
capture to face +Z. Local rotations follow from T_parent⁻¹ · T.

    python3 tools/mh/mocap.py      (run after build.py: it reads our bind pose from golfer.json)
"""
import json, math, os, sys
import numpy as np

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, '../../packages/client/public/golfer')
CMU = os.environ.get('CMU_BVH', '/home/claude/mocap/una-dinosauria_cmu-mocap/data')
BNR = os.environ.get('BANDAI', '/home/claude/mocap/bandai/dataset')

# ---------------------------------------------------------------- BVH
class BVH:
    def __init__(self, path):
        tok = open(path).read().split(); i = 0
        self.names, self.parent, self.offset, self.chans, self.end = [], [], [], [], {}
        stack = []
        while tok[i] != 'MOTION':
            t = tok[i]
            if t in ('ROOT', 'JOINT'):
                self.names.append(tok[i + 1]); self.parent.append(stack[-1] if stack else -1); stack.append(len(self.names) - 1); i += 2
            elif t == 'End':
                j = stack[-1]; i += 2   # End Site {
                assert tok[i] == '{'; assert tok[i + 1] == 'OFFSET'
                self.end[j] = np.array([float(x) for x in tok[i + 2:i + 5]]); i += 6   # skip '}'
                continue
            elif t == 'OFFSET': self.offset.append(np.array([float(x) for x in tok[i + 1:i + 4]])); i += 4
            elif t == 'CHANNELS':
                n = int(tok[i + 1]); self.chans.append(tok[i + 2:i + 2 + n]); i += 2 + n
            elif t == '}': stack.pop(); i += 1
            else: i += 1
        i += 1; assert tok[i] == 'Frames:'; self.n = int(tok[i + 1]); assert tok[i + 2] == 'Frame' and tok[i + 3] == 'Time:'
        self.dt = float(tok[i + 4]); vals = np.array(tok[i + 5:], dtype=float)
        nc = sum(len(c) for c in self.chans); self.data = vals[:self.n * nc].reshape(self.n, nc)
        self.idx = {n: k for k, n in enumerate(self.names)}
    def world(self):
        """world rotation matrices (n, J, 3, 3) and joint positions (n, J, 3)"""
        n, J = self.n, len(self.names); R = np.zeros((n, J, 3, 3)); P = np.zeros((n, J, 3)); c = 0
        def rot(axis, deg):
            a = np.radians(deg); ca, sa = np.cos(a), np.sin(a); M = np.zeros((len(a), 3, 3))
            if axis == 'X': M[:, 0, 0] = 1; M[:, 1, 1] = ca; M[:, 1, 2] = -sa; M[:, 2, 1] = sa; M[:, 2, 2] = ca
            if axis == 'Y': M[:, 1, 1] = 1; M[:, 0, 0] = ca; M[:, 0, 2] = sa; M[:, 2, 0] = -sa; M[:, 2, 2] = ca
            if axis == 'Z': M[:, 2, 2] = 1; M[:, 0, 0] = ca; M[:, 0, 1] = -sa; M[:, 1, 0] = sa; M[:, 1, 1] = ca
            return M
        for j in range(J):
            L = np.tile(np.eye(3), (n, 1, 1)); pos = np.tile(self.offset[j], (n, 1))
            for ch in self.chans[j]:
                v = self.data[:, c]; c += 1
                if ch.endswith('position'): pos[:, 'XYZ'.index(ch[0])] = v
                else: L = L @ rot(ch[0], v)
            p = self.parent[j]
            if p < 0: R[:, j] = L; P[:, j] = pos
            else: R[:, j] = R[:, p] @ L; P[:, j] = P[:, p] + np.einsum('nij,nj->ni', R[:, p], pos if self.chans[j][0].endswith('position') else np.tile(self.offset[j], (n, 1)))
        return R, P
    def rest_pos(self):
        P = []
        for j in range(len(self.names)):
            p = self.parent[j]; P.append(self.offset[j] if p < 0 else P[p] + self.offset[j])
        return np.array(P)

# ---------------------------------------------------------------- our rig
meta = json.load(open(OUT + '/golfer.json'))
BONES = [b for b in meta['bones'] if 'Hand' not in b or b.endswith('Hand')]   # the 22 body bones (fingers are posed separately)
BIND = {k: np.array(v) for k, v in meta['bind'].items()}
PARENT = {'Hips': None, 'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', 'Neck': 'Spine2', 'Head': 'Neck'}
CHILD = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head'}
for s in ('Left', 'Right'):
    PARENT.update({s + 'Shoulder': 'Spine2', s + 'Arm': s + 'Shoulder', s + 'ForeArm': s + 'Arm', s + 'Hand': s + 'ForeArm',
                   s + 'UpLeg': 'Hips', s + 'Leg': s + 'UpLeg', s + 'Foot': s + 'Leg', s + 'ToeBase': s + 'Foot'})
    CHILD.update({s + 'Shoulder': s + 'Arm', s + 'Arm': s + 'ForeArm', s + 'ForeArm': s + 'Hand', s + 'UpLeg': s + 'Leg', s + 'Leg': s + 'Foot', s + 'Foot': s + 'ToeBase'})
ARM_TILT = 0.21
def tdir(b):
    if b in CHILD: d = BIND[CHILD[b]] - BIND[b]
    elif b == 'Head': d = np.array([0, 1.0, 0])
    elif b.endswith('Hand'): s = 1 if b.startswith('Left') else -1; d = np.array([s * math.sin(ARM_TILT), -math.cos(ARM_TILT), 0])
    else: d = np.array([0, 0, 1.0])   # toes
    return d / np.linalg.norm(d)

def rot_between(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); v = np.cross(a, b); c = float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-9: return np.eye(3) if c > 0 else -np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); return np.eye(3) + vx + vx @ vx / (1 + c)
def qmul(a, b):   # x, y, z, w (three.js order)
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return np.array([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz])
def qinv(a): return np.array([-a[0], -a[1], -a[2], a[3]]) / np.dot(a, a)
def qnorm(a): return a / np.linalg.norm(a)
def qslerp(a, b, t):
    d = np.dot(a, b)
    if d < 0: b, d = -b, -d
    if d > 0.9995: return qnorm(a + (b - a) * t)
    th = math.acos(d); return (a * math.sin((1 - t) * th) + b * math.sin(t * th)) / math.sin(th)

def mat2quat(M):
    q = np.zeros((len(M), 4)); t = M[:, 0, 0] + M[:, 1, 1] + M[:, 2, 2]
    for i in range(len(M)):
        m = M[i]
        if t[i] > 0: s = math.sqrt(t[i] + 1) * 2; q[i] = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, 0.25 * s]
        elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]: s = math.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2; q[i] = [0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
        elif m[1, 1] > m[2, 2]: s = math.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2; q[i] = [(m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
        else: s = math.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2; q[i] = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s, (m[1, 0] - m[0, 1]) / s]
    # keep successive frames on the same hemisphere (no sudden sign flips when interpolating)
    for i in range(1, len(q)):
        if np.dot(q[i], q[i - 1]) < 0: q[i] = -q[i]
    return q

def retarget(bvh, MAP, src_dir_child, face_frame=0, up_axis=None):
    """MAP: our bone → source joint whose rotation drives it; src_dir_child: our bone → (source joint a, source joint b or 'end') giving the source bone direction."""
    R, P = bvh.world(); rest = bvh.rest_pos(); n = bvh.n
    # facing: turn the capture so the hips face +Z at face_frame
    hj = bvh.idx[MAP['Hips']]; f = R[face_frame, hj] @ np.array([0, 0, 1.0]); yaw = math.atan2(f[0], f[2])
    c, s = math.cos(-yaw), math.sin(-yaw); Y = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    T = {}
    for b in BONES:
        if b not in MAP: continue
        a, bb = src_dir_child[b]; ja = bvh.idx[a]
        sd = (bvh.end[ja] if bb == 'end' else rest[bvh.idx[bb]] - rest[ja])
        A = rot_between(tdir(b), sd)
        T[b] = np.einsum('ij,njk->nik', Y, R[:, bvh.idx[MAP[b]]]) @ A
    Lq = {}
    for b in BONES:
        if b not in T: continue
        p = PARENT[b]; Tp = T[p] if p else np.tile(np.eye(3), (n, 1, 1))
        Lq[b] = mat2quat(np.einsum('nji,njk->nik', Tp, T[b]))
    hips = np.einsum('ij,nj->ni', Y, P[:, hj])
    return Lq, hips, R, P, Y

def retarget_ref(bvh, MAP, DIRS, t0, fwd_dir, flat=None):
    """Like retarget(), but aligned on frame t0 of the capture itself (a neutral standing frame): at t0 each of our
    bones lies along the captured bone with no extra twist; afterwards it follows the capture's rotation since t0.
    fwd_dir: the direction (world, capture) that should become +Z."""
    R, P = bvh.world(); n = bvh.n
    yaw = math.atan2(fwd_dir[0], fwd_dir[2]); c, s = math.cos(-yaw), math.sin(-yaw); Y = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    T = {}
    for b in BONES:
        if b not in MAP: continue
        a_, bb = DIRS[b]; ja = bvh.idx[a_]
        d0 = (R[t0, ja] @ bvh.end[ja]) if bb == 'end' else (P[t0, bvh.idx[bb]] - P[t0, ja])
        if np.linalg.norm(d0) < 1e-6:   # zero-length end site: carry on along the bone that leads into this joint
            d0 = P[t0, ja] - P[t0, bvh.parent[ja]]
        Rmin = rot_between(tdir(b), Y @ d0)
        Sj = np.einsum('ij,njk->nik', Y, R[:, bvh.idx[MAP[b]]]); S0inv = Sj[t0].T
        if flat and b in flat:   # feet: at the frame the captured foot is flat on the ground, ours is flat too (its rest pose)
            Rmin = np.eye(3); S0inv = Sj[flat[b]].T
        T[b] = np.einsum('nij,jk->nik', Sj, S0inv @ Rmin)
    Lq = {}
    for b in BONES:
        if b not in T: continue
        p = PARENT[b]; Tp = T[p] if p else np.tile(np.eye(3), (n, 1, 1))
        Lq[b] = mat2quat(np.einsum('nji,njk->nik', Tp, T[b]))
    hips = np.einsum('ij,nj->ni', Y, P[:, bvh.idx[MAP['Hips']]])
    return Lq, hips, R, P, Y

BN_MAP = {'Hips': 'Hips', 'Spine': 'Spine', 'Spine1': 'Chest', 'Spine2': 'Chest', 'Neck': 'Neck', 'Head': 'Head'}
BN_DIR = {'Hips': ('Hips', 'Spine'), 'Spine': ('Spine', 'Chest'), 'Spine1': ('Chest', 'Neck'), 'Spine2': ('Chest', 'Neck'), 'Neck': ('Neck', 'Head'), 'Head': ('Head', 'end')}
for s_, c in (('Left', 'L'), ('Right', 'R')):
    BN_MAP.update({s_ + 'Shoulder': 'Shoulder_' + c, s_ + 'Arm': 'UpperArm_' + c, s_ + 'ForeArm': 'LowerArm_' + c, s_ + 'Hand': 'Hand_' + c,
                   s_ + 'UpLeg': 'UpperLeg_' + c, s_ + 'Leg': 'LowerLeg_' + c, s_ + 'Foot': 'Foot_' + c, s_ + 'ToeBase': 'Toes_' + c})
    BN_DIR.update({s_ + 'Shoulder': ('Shoulder_' + c, 'UpperArm_' + c), s_ + 'Arm': ('UpperArm_' + c, 'LowerArm_' + c), s_ + 'ForeArm': ('LowerArm_' + c, 'Hand_' + c), s_ + 'Hand': ('Hand_' + c, 'end'),
                   s_ + 'UpLeg': ('UpperLeg_' + c, 'LowerLeg_' + c), s_ + 'Leg': ('LowerLeg_' + c, 'Foot_' + c), s_ + 'Foot': ('Foot_' + c, 'Toes_' + c), s_ + 'ToeBase': ('Toes_' + c, 'end')})

def flat_frames(b, lo=0, hi=None):
    """per foot, the frame in [lo, hi) where it's planted: low and nearly still (mid-stance)"""
    R, P = b.world(); hi = hi or b.n; out = {}
    for s_, c in (('Left', 'L'), ('Right', 'R')):
        y = P[lo:hi, b.idx['Foot_' + c], 1]; v = np.r_[0, np.linalg.norm(np.diff(P[lo:hi, b.idx['Foot_' + c]], axis=0), axis=1)]
        score = (y - y.min()) / max(np.ptp(y), 1e-6) + v / max(v.max(), 1e-6); out[s_ + 'Foot'] = lo + int(np.argmin(score))
    return out

def bandai_loop(path, name):
    """one clean stride from a locomotion clip, in place, as a 32-frame loop sampled by cycle fraction"""
    b = BVH(path); R, P = b.world(); dt = b.dt
    lf = P[:, b.idx['Foot_L']]; hips = P[:, b.idx['Hips']]
    # left-foot contacts: the foot low and nearly still
    v = np.r_[0, np.linalg.norm(np.diff(lf, axis=0), axis=1) / dt]; low = lf[:, 1] < lf[:, 1].min() + 3
    contact = low & (v < np.percentile(v, 35)); starts = [i for i in range(1, b.n) if contact[i] and not contact[i - 1]]
    mid = [i for i in starts if b.n * 0.15 < i < b.n * 0.85]
    if len(mid) < 2: mid = starts[-3:-1] if len(starts) >= 3 else starts[:2]
    c0, c1 = mid[0], mid[1]
    travel = hips[c1] - hips[c0]; travel[1] = 0
    Lq, hp, _, _, Y = retarget_ref(b, BN_MAP, BN_DIR, t0=c0, fwd_dir=travel, flat=flat_frames(b, c0, c1 + 1))
    leg_src = np.linalg.norm(P[c0, b.idx['UpperLeg_L']] - P[c0, b.idx['LowerLeg_L']]) + np.linalg.norm(P[c0, b.idx['LowerLeg_L']] - P[c0, b.idx['Foot_L']])
    leg_ours = np.linalg.norm(BIND['LeftUpLeg'] - BIND['LeftLeg']) + np.linalg.norm(BIND['LeftLeg'] - BIND['LeftFoot']); sc = leg_ours / leg_src
    # resample one cycle to 32 frames (the 33rd = the first, for a seamless loop)
    N = 32; x = c0 + (c1 - c0) * np.arange(N + 1) / N; i0 = np.floor(x).astype(int); w = (x - i0)[:, None]   # N+1: the last = the next cycle's start
    bones = [bb for bb in BONES if bb in Lq]
    def samp(arr):
        out = arr[i0] * (1 - w) + arr[np.minimum(i0 + 1, b.n - 1)] * w
        if arr.shape[1] == 4: out /= np.linalg.norm(out, axis=1, keepdims=True)
        return out
    q = np.stack([samp(Lq[bb]) for bb in bones], 1)
    for k in range(len(bones)):   # same hemisphere frame to frame
        for f in range(1, N + 1):
            if np.dot(q[f, k], q[f - 1, k]) < 0: q[f, k] = -q[f, k]
    # a real stride never ends exactly where it began: spread the mismatch over the cycle so the loop closes without a hitch
    for k in range(len(bones)):
        corr = qmul(q[0, k], qinv(q[N, k]))   # takes the cycle's end onto its start
        for f in range(N + 1): q[f, k] = qnorm(qmul(qslerp(np.array([0, 0, 0, 1.0]), corr, f / N), q[f, k]))
    q = q[:N]
    # an even gait: each step is blended with the mirror of the other step (Left↔Right swapped, reflected across the
    # body's mid-plane), so the two strides match and there's no limp. Our bones rest unrotated and the rig is
    # left/right symmetric, so a mirrored local rotation is (x, -y, -z, w).
    H = N // 2; mir = lambda v: np.array([v[0], -v[1], -v[2], v[3]])
    q2 = q.copy()
    for k, bn in enumerate(bones):
        other = bn.replace('Left', '#').replace('Right', 'Left').replace('#', 'Right'); ko = bones.index(other) if other in bones else k
        for f in range(N):
            m = mir(q[(f + H) % N, ko])
            if np.dot(m, q[f, k]) < 0: m = -m
            q2[f, k] = qnorm(qslerp(q[f, k], m, 0.5))
    q = q2
    h = samp(hp) * sc; h = h - np.outer(np.arange(N + 1) / N, h[N] - h[0])   # removes the travel and closes the hips too
    h = h[:N]; h[:, [0, 2]] -= h[:, [0, 2]].mean(0); h[:, 1] -= h[:, 1].mean()   # in place, centred
    hm = h[(np.arange(N) + H) % N] * np.array([-1, 1, 1]); h = (h + hm) / 2   # the hips' sway and bob made even too
    drift = (np.einsum('ij,j->i', Y, hips[c1] - hips[c0]) * sc)
    stride = float(np.linalg.norm(drift[[0, 2]])); period = (c1 - c0) * dt
    print(f'  {name}: stride {stride:.2f} m in {period:.2f} s = {stride / period:.2f} m/s, scale {sc:.4f}')
    return {'loop': True, 'fps': 0, 'n': N, 'bones': bones, 'q': np.round(q.reshape(N, -1), 4).tolist(), 'hips': np.round(h, 4).tolist(), 'stride': round(stride, 3), 'period': round(period, 3), 'src': 'Bandai Namco ' + os.path.basename(path)}

def bandai_once(path, name, t0=0):
    """a one-shot clip (celebration etc.), facing +Z at its first frame"""
    b = BVH(path); R, P = b.world()
    left = P[t0, b.idx['UpperLeg_L']] - P[t0, b.idx['UpperLeg_R']]; fwd = np.cross(left, [0, 1.0, 0])
    Lq, hp, _, _, Y = retarget_ref(b, BN_MAP, BN_DIR, t0=t0, fwd_dir=fwd, flat={'LeftFoot': t0, 'RightFoot': t0})
    leg_src = np.linalg.norm(P[t0, b.idx['UpperLeg_L']] - P[t0, b.idx['LowerLeg_L']]) + np.linalg.norm(P[t0, b.idx['LowerLeg_L']] - P[t0, b.idx['Foot_L']])
    leg_ours = np.linalg.norm(BIND['LeftUpLeg'] - BIND['LeftLeg']) + np.linalg.norm(BIND['LeftLeg'] - BIND['LeftFoot'])
    clip = pack(Lq, hp, leg_ours / leg_src, b.dt, extra={'src': 'Bandai Namco ' + os.path.basename(path), 'ev': {'from': 0, 'to': round(b.n * b.dt, 3)}})
    print(f'  {name}: {b.n * b.dt:.2f} s'); return clip

# ---------------------------------------------------------------- CMU skeleton → ours
CMU_MAP = {'Hips': 'Hips', 'Spine': 'LowerBack', 'Spine1': 'Spine', 'Spine2': 'Spine1', 'Neck': 'Neck1', 'Head': 'Head'}
CMU_DIR = {'Hips': ('LowerBack', 'Spine'), 'Spine': ('LowerBack', 'Spine'), 'Spine1': ('Spine', 'Spine1'), 'Spine2': ('Spine1', 'Neck1'), 'Neck': ('Neck', 'Head'), 'Head': ('Head', 'end')}
for s, c in (('Left', 'Left'), ('Right', 'Right')):
    CMU_MAP.update({s + 'Shoulder': c + 'Shoulder', s + 'Arm': c + 'Arm', s + 'ForeArm': c + 'ForeArm', s + 'Hand': c + 'Hand',
                    s + 'UpLeg': c + 'UpLeg', s + 'Leg': c + 'Leg', s + 'Foot': c + 'Foot', s + 'ToeBase': c + 'ToeBase'})
    CMU_DIR.update({s + 'Shoulder': (c + 'Shoulder', c + 'Arm'), s + 'Arm': (c + 'Arm', c + 'ForeArm'), s + 'ForeArm': (c + 'ForeArm', c + 'Hand'), s + 'Hand': (c + 'Hand', c + 'HandIndex1'),
                    s + 'UpLeg': (c + 'UpLeg', c + 'Leg'), s + 'Leg': (c + 'Leg', c + 'Foot'), s + 'Foot': (c + 'Foot', c + 'ToeBase'), s + 'ToeBase': (c + 'ToeBase', 'end')})

def resample(arr, src_dt, fps=30):
    n = len(arr); T = (n - 1) * src_dt; m = int(T * fps) + 1; t = np.arange(m) / fps; x = t / src_dt
    i0 = np.clip(np.floor(x).astype(int), 0, n - 1); i1 = np.clip(i0 + 1, 0, n - 1); w = (x - i0)[:, None]
    out = arr[i0] * (1 - w) + arr[i1] * w
    if arr.shape[1] == 4: out /= np.linalg.norm(out, axis=1, keepdims=True)
    return out

def pack(Lq, hips, scale, dt, fps=30, extra=None):
    bones = [b for b in BONES if b in Lq]
    q = np.stack([resample(Lq[b], dt, fps) for b in bones], 1)   # (m, B, 4)
    h = resample(hips * scale, dt, fps)
    clip = {'fps': fps, 'n': len(q), 'bones': bones, 'q': np.round(q.reshape(len(q), -1), 4).tolist(), 'hips': np.round(h, 4).tolist()}
    if extra: clip.update(extra)
    return clip

if __name__ == '__main__':
    clips = {}
    # CMU: one swing and one putt to start (scale: the capture is in its own units; legs → our leg length)
    for name, f in (('swing', '64_01'), ('putt', '64_12')):
        b = BVH(f'{CMU}/064/{f}.bvh')
        # the first frames of every CMU file are a calibration pose: drop them, face the golfer using address
        cut = int(0.15 / b.dt); b.data = b.data[cut:]; b.n -= cut
        Lq, hips, R, P, Y = retarget(b, CMU_MAP, CMU_DIR, face_frame=int(0.3 / b.dt))
        rest = b.rest_pos(); leg_src = abs(rest[b.idx['LeftUpLeg'], 1] - rest[b.idx['LeftFoot'], 1]); leg_ours = BIND['LeftUpLeg'][1] - BIND['LeftFoot'][1]
        sc = leg_ours / leg_src
        # key moments (seconds), from the lead hand: still at address → highest at the top → lowest/fastest at impact → finish
        hand = np.einsum('ij,nj->ni', Y, P[:, b.idx['LeftHand']]); dt = b.dt; v = np.r_[0, np.linalg.norm(np.diff(hand, axis=0), axis=1) / dt]
        vs = np.convolve(v, np.ones(9) / 9, 'same'); moving = np.where(vs > vs.max() * 0.06)[0]; start = moving[0]
        if name == 'swing':
            top = start + int(np.argmax(hand[start:, 1][: int(1.6 / dt)]))
            imp = top + int(np.argmin(hand[top:top + int(0.9 / dt), 1]))
        else:   # putt: back = furthest from the target (−x), impact = back through the address spot
            seg = hand[start:start + int(1.5 / dt), 0]; top = start + int(np.argmin(seg))
            x0 = hand[start, 0]; after = np.where(hand[top:, 0] >= x0)[0]; imp = top + (int(after[0]) if len(after) else int(0.3 / dt))
        still = np.where(vs[imp:] < vs.max() * 0.05)[0]; fin = imp + (int(still[0]) if len(still) else int(0.8 / dt))
        if name == 'putt': start = max(0, top - int(0.7 / dt))
        ev = {'address': round(float(max(0, start - 3) * dt), 3), 'top': round(float(top * dt), 3), 'impact': round(float(imp * dt), 3), 'finish': round(float(fin * dt), 3)}
        # shoulder / hip turn (yaw of the chest and pelvis, relative to address) for the club path that rides on them
        def yaw(j):
            fwd = np.einsum('ij,njk,k->ni', Y, R[:, b.idx[j]], np.array([0, 0, 1.0])); return np.unwrap(np.arctan2(fwd[:, 0], fwd[:, 2]))
        a0 = int(ev['address'] / dt); ty = yaw('Spine1') - yaw('Spine1')[a0]; hy = yaw('Hips') - yaw('Hips')[a0]
        curves = {'ty': np.round(resample(ty[:, None], dt)[:, 0], 4).tolist(), 'hy': np.round(resample(hy[:, None], dt)[:, 0], 4).tolist()}
        clips[name] = pack(Lq, hips, sc, b.dt, extra={'src': f'CMU {f}', 'ev': ev, **curves})
        print('  events', ev, 'turn at top', round(float(np.degrees(ty[top])), 1), 'at finish', round(float(np.degrees(ty[fin])), 1))
        print(name, b.n, 'frames', round(b.n * b.dt, 2), 's, scale', round(sc, 4))
    D1 = f'{BNR}/Bandai-Namco-Research-Motiondataset-1/data'; D2 = f'{BNR}/Bandai-Namco-Research-Motiondataset-2/data'
    clips['walk'] = bandai_loop(f'{D2}/dataset-2_walk_normal_001.bvh', 'walk')
    clips['run'] = bandai_loop(f'{D2}/dataset-2_run_normal_001.bvh', 'run')
    # (the dash clip is too short for a whole stride: the run covers sprinting)
    clips['cheer'] = bandai_once(f'{D2}/dataset-2_raise-up-both-hands_active_001.bvh', 'cheer')
    # CMU extras: teeing up and taking the ball out of the cup (whole body, played once)
    for name, f in (('teeup', '64_16'), ('pickup', '64_26')):
        b = BVH(f'{CMU}/064/{f}.bvh'); cut = int(0.15 / b.dt); b.data = b.data[cut:]; b.n -= cut
        Lq, hips, R, P, Y = retarget(b, CMU_MAP, CMU_DIR, face_frame=int(0.3 / b.dt))
        rest = b.rest_pos(); sc = (BIND['LeftUpLeg'][1] - BIND['LeftFoot'][1]) / abs(rest[b.idx['LeftUpLeg'], 1] - rest[b.idx['LeftFoot'], 1])
        # the action: centred on the moment the hands are lowest (reaching the ground / into the cup)
        hand = np.minimum(P[:, b.idx['LeftHand'], 1], P[:, b.idx['RightHand'], 1]); low = int(np.argmin(hand)) * b.dt
        ev = {'from': round(max(0.0, low - 1.15), 3), 'to': round(min(b.n * b.dt, low + 1.25), 3), 'low': round(low, 3)}
        clips[name] = pack(Lq, hips, sc, b.dt, extra={'src': f'CMU {f}', 'ev': ev}); print(f'  {name}: {b.n * b.dt:.2f} s, action', ev)
    for c_ in clips.values():   # shoes are stiff: the toe joint stays put (a bending toe folds the sneaker)
        for tb in ('LeftToeBase', 'RightToeBase'):
            if tb in c_['bones']:
                k = c_['bones'].index(tb)
                for row in c_['q']: row[k * 4:k * 4 + 4] = [0, 0, 0, 1]
    json.dump(clips, open(OUT + '/anims.json', 'w'), separators=(',', ':'), allow_nan=False)   # a NaN would break the whole file in the browser
    print('anims.json KB', os.path.getsize(OUT + '/anims.json') // 1024)
