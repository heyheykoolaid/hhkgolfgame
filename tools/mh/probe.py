import sys, json, os, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from mhlib import *
MH = '/home/claude/mh/mh/makehuman/data'
base = Obj(MH + '/3dobjs/base.obj'); print('base', base.v.shape)
T = MH + '/targets/macrodetails/'
def tw(name, w, V):
    if w <= 1e-4: return
    i, d = load_target(T + name); V[i] += d * w
V = base.v.copy()
ages = {'young': 0.85, 'old': 0.15}; mus = {'averagemuscle': 0.55, 'maxmuscle': 0.45}; wts = {'averageweight': 0.85, 'maxweight': 0.15}
for a, wa in ages.items():
    for m, wm in mus.items():
        for k, wk in wts.items(): tw(f'universal-male-{a}-{m}-{k}.target', wa * wm * wk, V)
    for race in ('caucasian', 'african', 'asian'): tw(f'{race}-male-{a}.target', wa / 3, V)
print([f for f in os.listdir(T) if 'height' in f or 'proportion' in f][:6])
sk = json.load(open(MH + '/rigs/default.mhskel'))
J = {k: V[v].mean(0) for k, v in sk['joints'].items()}
head = lambda b: J[sk['bones'][b]['head']]
for b in ['root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck03', 'head', 'clavicle.L', 'shoulder01.L', 'upperarm01.L', 'lowerarm01.L', 'wrist.L', 'pelvis.L', 'upperleg01.L', 'lowerleg01.L', 'foot.L', 'toe1-1.L']:
    print(f'{b:14s}', np.round(head(b), 3))
body = base.groups['body']; bv = sorted({i for f in body for i in base.f[f]}); print('body verts', len(bv), 'y range', V[bv, 1].min(), V[bv, 1].max(), 'x', V[bv,0].min(), V[bv,0].max(), 'z', V[bv,2].min(), V[bv,2].max())
np.save('/tmp/mhV.npy', V)
