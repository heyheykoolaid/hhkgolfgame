"""Minimal MakeHuman data reader: base mesh, targets, proxies/clothes fitting, skeleton joints and weights."""
import json, os, re
import numpy as np

class Obj:
    def __init__(self, path):
        V, VT, F, FT, groups, g = [], [], [], [], {}, None
        for line in open(path, encoding='utf-8', errors='ignore'):
            if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('vt '): VT.append([float(x) for x in line.split()[1:3]])
            elif line.startswith('g '): g = line.split()[1] if len(line.split()) > 1 else None
            elif line.startswith('f '):
                vs, ts = [], []
                for tok in line.split()[1:]:
                    p = tok.split('/'); vs.append(int(p[0]) - 1); ts.append(int(p[1]) - 1 if len(p) > 1 and p[1] else -1)
                F.append(vs); FT.append(ts)
                if g is not None: groups.setdefault(g, []).append(len(F) - 1)
        self.v = np.array(V, dtype=np.float64); self.vt = np.array(VT, dtype=np.float64) if VT else np.zeros((0, 2)); self.f = F; self.ft = FT; self.groups = groups

def load_target(path):
    idx, d = [], []
    for line in open(path):
        if not line.strip() or line[0] == '#': continue
        p = line.split(); idx.append(int(p[0])); d.append([float(p[1]), float(p[2]), float(p[3])])
    return np.array(idx, dtype=np.int64), np.array(d).reshape(-1, 3)

class Proxy:
    """.proxy / .mhclo: each vertex = weighted refs into the base mesh + scaled offset."""
    def __init__(self, path):
        self.dir = os.path.dirname(path); self.refs, self.w, self.off, self.scale, self.delete, self.obj, self.material = [], [], [], {}, set(), None, None
        sec = None
        for line in open(path, encoding='utf-8', errors='ignore'):
            s = line.strip()
            if not s or s.startswith('#'): continue
            p = s.split()
            if p[0] in ('verts', 'weights', 'delete_verts'): sec = p[0]; continue
            if sec == 'verts' and re.match(r'^-?\d', p[0]):
                if len(p) == 1: self.refs.append([int(p[0])] * 3); self.w.append([1, 0, 0]); self.off.append([0, 0, 0])
                else: self.refs.append([int(x) for x in p[0:3]]); self.w.append([float(x) for x in p[3:6]]); self.off.append([float(x) for x in p[6:9]])
                continue
            if sec == 'delete_verts' and re.match(r'^\d', p[0]):
                i = 0
                while i < len(p):
                    if i + 2 < len(p) and p[i + 1] == '-': self.delete.update(range(int(p[i]), int(p[i + 2]) + 1)); i += 3
                    else: self.delete.add(int(p[i])); i += 1
                continue
            # keyword lines can sit anywhere, even inside the vertex list: they don't end a section
            if p[0] in ('x_scale', 'y_scale', 'z_scale'): self.scale[p[0][0]] = (int(p[1]), int(p[2]), float(p[3]))
            elif p[0] == 'obj_file': self.obj = os.path.join(self.dir, p[1])
            elif p[0] == 'material': self.material = os.path.join(self.dir, p[1])
        self.refs = np.array(self.refs); self.w = np.array(self.w); self.off = np.array(self.off)
    def fit(self, base):
        s = np.ones(3)
        for k, ax in (('x', 0), ('y', 1), ('z', 2)):
            if k in self.scale: a, b, den = self.scale[k]; s[ax] = abs(base[a, ax] - base[b, ax]) / den
        return np.einsum('ij,ijk->ik', self.w, base[self.refs]) + self.off * s

def read_mhmat(path):
    out = {}
    for line in open(path, encoding='utf-8', errors='ignore'):
        p = line.split()
        if len(p) >= 2 and not p[0].startswith('#'): out[p[0]] = ' '.join(p[1:])
    return out
