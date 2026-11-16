#!/usr/bin/env python3
"""Lift one set piece out of a whole scene: writes a small new .glb holding only the meshes whose middle lies inside a
rectangle of the scene (x0,z0,x1,z1 in the scene's own metres), each with its place in the scene baked in.
Nodes whose own or parents' names match skipRegex are left out. Textures are scaled to at most N pixels, and old
specular-glossiness materials are turned into standard ones (three.js no longer reads them).

  python3 -I tools/packs/lift.py scene.glb out.glb x0,z0,x1,z1 [N=512] [skipRegex]
"""
import sys, json, struct, io, re
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
src, dst = sys.argv[1:3]
box = [float(v) for v in sys.argv[3].split(',')]
N = int(sys.argv[4]) if len(sys.argv) > 4 else 512
skip = re.compile(sys.argv[5]) if len(sys.argv) > 5 else None
f = open(src, 'rb'); f.read(12)
clen, _ = struct.unpack('<II', f.read(8)); j = json.loads(f.read(clen))
blen, _ = struct.unpack('<II', f.read(8)); bin_ = f.read(blen)
V = j['bufferViews']; A = j['accessors']

def local(n):
    if 'matrix' in n: return np.array(n['matrix'], float).reshape(4, 4).T
    t = n.get('translation', [0, 0, 0]); x, y, z, w = n.get('rotation', [0, 0, 0, 1]); sc = n.get('scale', [1, 1, 1])
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4); M[:3, :3] = R * np.array(sc); M[:3, 3] = t
    return M
chosen = []  # (node index, world matrix)
def walk(i, M, bad):
    n = j['nodes'][i]; W = M @ local(n); bad = bad or bool(skip and skip.search(n.get('name', '')))
    if 'mesh' in n and not bad:
        lo = np.full(3, 1e30); hi = -lo
        for pr in j['meshes'][n['mesh']]['primitives']:
            a = A[pr['attributes']['POSITION']]
            for cx in (a['min'][0], a['max'][0]):
                for cy in (a['min'][1], a['max'][1]):
                    for cz in (a['min'][2], a['max'][2]):
                        p = (W @ np.array([cx, cy, cz, 1]))[:3]; lo = np.minimum(lo, p); hi = np.maximum(hi, p)
        c = (lo + hi) / 2
        fits = lo[0] > box[0] - 4 and hi[0] < box[2] + 4 and lo[2] > box[1] - 4 and hi[2] < box[3] + 4  # (not the ground slabs and cables that run across the whole park)
        if fits and box[0] <= c[0] <= box[2] and box[1] <= c[2] <= box[3]: chosen.append((i, W))
    for ch in n.get('children', []): walk(ch, W, bad)
for r in j['scenes'][j.get('scene', 0)]['nodes']: walk(r, np.eye(4), False)

out = bytearray(); views = []; accs = {}; mats = {}; texs = {}; imgs = {}
o = {'asset': j['asset'], 'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'accessors': [], 'materials': [], 'textures': [], 'images': [], 'samplers': j.get('samplers', [])}
CS = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def put(data, target=None):
    while len(out) % 4: out.append(0)
    v = {'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)}
    if target: v['target'] = target
    out.extend(data); views.append(v); return len(views) - 1
def acc(a):
    if a in accs: return accs[a]
    x = dict(A[a]); v = V[x['bufferView']]; size = CS[x['componentType']] * NC[x['type']]
    stride = v.get('byteStride', size); base = v.get('byteOffset', 0) + x.get('byteOffset', 0)
    x['bufferView'] = put(b''.join(bin_[base + i * stride: base + i * stride + size] for i in range(x['count'])), v.get('target')); x['byteOffset'] = 0
    x.pop('sparse', None); o['accessors'].append(x); accs[a] = len(o['accessors']) - 1; return accs[a]
def img(i):
    if i in imgs: return imgs[i]
    im0 = j['images'][i]; v = V[im0['bufferView']]; data = bin_[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]
    im = Image.open(io.BytesIO(data)); w, h = im.size
    if max(w, h) > N: im = im.resize((max(1, w * N // max(w, h)), max(1, h * N // max(w, h))), Image.LANCZOS)
    buf = io.BytesIO(); alpha = im.mode in ('RGBA', 'LA', 'P') and im.convert('RGBA').getextrema()[3][0] < 255
    if alpha: im.save(buf, 'PNG', optimize=True); mime = 'image/png'
    else: im.convert('RGB').save(buf, 'JPEG', quality=86); mime = 'image/jpeg'
    o['images'].append({'bufferView': put(buf.getvalue()), 'mimeType': mime}); imgs[i] = len(o['images']) - 1; return imgs[i]
def tex(t):
    if t not in texs:
        x = dict(j['textures'][t]); x.pop('extensions', None)
        if 'source' in x: x['source'] = img(x['source'])
        o['textures'].append(x); texs[t] = len(o['textures']) - 1
    return texs[t]
def retex(d):
    if isinstance(d, dict):
        if isinstance(d.get('index'), int) and len(d) <= 4 and all(k in ('index', 'texCoord', 'scale', 'strength') for k in d): return {**d, 'index': tex(d['index'])}
        return {k: retex(v) for k, v in d.items()}
    return d
def mat(m):
    if m in mats: return mats[m]
    x = json.loads(json.dumps(j['materials'][m])); sg = x.get('extensions', {}).pop('KHR_materials_pbrSpecularGlossiness', None)
    if sg:
        pbr = x.setdefault('pbrMetallicRoughness', {})
        if 'diffuseFactor' in sg: pbr['baseColorFactor'] = sg['diffuseFactor']
        if 'diffuseTexture' in sg: pbr['baseColorTexture'] = sg['diffuseTexture']
        pbr['metallicFactor'] = 0; pbr['roughnessFactor'] = 1 - sg.get('glossinessFactor', 0.2) * 0.5
    ext = x.pop('extensions', {})
    if 'KHR_materials_emissive_strength' in ext: x['emissiveFactor'] = [min(1, c * ext['KHR_materials_emissive_strength'].get('emissiveStrength', 1)) for c in x.get('emissiveFactor', [0, 0, 0])]
    x = retex(x); o['materials'].append(x); mats[m] = len(o['materials']) - 1; return mats[m]
for ni, W in chosen:
    n = j['nodes'][ni]; prims = []
    for pr in j['meshes'][n['mesh']]['primitives']:
        q = {'attributes': {k: acc(a) for k, a in pr['attributes'].items() if k in ('POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0')}, 'mode': pr.get('mode', 4)}
        if 'indices' in pr: q['indices'] = acc(pr['indices'])
        if 'material' in pr: q['material'] = mat(pr['material'])
        prims.append(q)
    o['meshes'].append({'primitives': prims})
    o['nodes'].append({'name': n.get('name', 'part'), 'mesh': len(o['meshes']) - 1, 'matrix': [float(v) for v in W.T.flatten()]})
    o['scenes'][0]['nodes'].append(len(o['nodes']) - 1)
while len(out) % 4: out.append(0)
o['bufferViews'] = views; o['buffers'] = [{'byteLength': len(out)}]
for k in ('textures', 'images', 'samplers', 'materials'):
    if not o[k]: del o[k]
js = json.dumps(o, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
with open(dst, 'wb') as w:
    w.write(struct.pack('<4sII', b'glTF', 2, 28 + len(js) + len(out)))
    w.write(struct.pack('<II', len(js), 0x4E4F534A)); w.write(js)
    w.write(struct.pack('<II', len(out), 0x004E4942)); w.write(out)
tris = sum(o['accessors'][p['indices']]['count'] // 3 for m in o['meshes'] for p in m['primitives'] if 'indices' in p)
print(dst, len(chosen), 'meshes', tris, 'tris', (28 + len(js) + len(out)) // 1024, 'KB')
