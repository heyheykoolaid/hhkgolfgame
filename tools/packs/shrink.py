#!/usr/bin/env python3
"""Rewrite a .glb with its textures scaled down to at most N pixels a side (downloads matter more than 4K labels).
Colour textures with no transparency become JPEG; the rest stay PNG.

  python3 -I tools/packs/shrink.py in.glb out.glb [N=1024] [keep=Name1,Name2,...]

keep: only these mesh nodes stay (a pack of 54 vehicles when the game uses nine); the rest lose their geometry and
textures, so the file shrinks to what is used.
"""
import sys, json, struct, io
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
src, dst = sys.argv[1:3]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
keep = set(sys.argv[4].split('=', 1)[1].split(',')) if len(sys.argv) > 4 else None
f = open(src, 'rb'); f.read(12)
clen, _ = struct.unpack('<II', f.read(8)); j = json.loads(f.read(clen))
blen, _ = struct.unpack('<II', f.read(8)); bin_ = f.read(blen)
views = j['bufferViews']
# three.js no longer reads the old specular-glossiness materials: carry their colour and texture over to the standard ones
for m in j.get('materials', []):
    sg = m.get('extensions', {}).pop('KHR_materials_pbrSpecularGlossiness', None)
    if sg:
        pbr = m.setdefault('pbrMetallicRoughness', {})
        if 'diffuseFactor' in sg: pbr['baseColorFactor'] = sg['diffuseFactor']
        if 'diffuseTexture' in sg: pbr['baseColorTexture'] = sg['diffuseTexture']
        pbr['metallicFactor'] = 0; pbr['roughnessFactor'] = 1 - sg.get('glossinessFactor', 0.2) * 0.5
    if 'extensions' in m and not m['extensions']: del m['extensions']
for k in ('extensionsUsed', 'extensionsRequired'):
    if k in j:
        j[k] = [e for e in j[k] if e != 'KHR_materials_pbrSpecularGlossiness']
        if not j[k]: del j[k]
used = None
if keep:
    used = set(); mats = set(); keep_acc = set()
    for n in j['nodes']:
        if 'mesh' in n and n.get('name') not in keep: del n['mesh']
        elif 'mesh' in n:
            for pr in j['meshes'][n['mesh']]['primitives']:
                for a in list(pr['attributes'].values()) + ([pr['indices']] if 'indices' in pr else []): keep_acc.add(a)
                if 'material' in pr: mats.add(pr['material'])
    def texs(o):
        if isinstance(o, dict):
            if 'index' in o and len(o) <= 4 and isinstance(o['index'], int): yield o['index']
            for v in o.values(): yield from texs(v)
    for m in mats:
        for t in texs(j['materials'][m]):
            im = j['textures'][t].get('source')
            if im is not None and 'bufferView' in j['images'][im]: used.add(j['images'][im]['bufferView'])
img_view = {im['bufferView']: i for i, im in enumerate(j.get('images', [])) if 'bufferView' in im}
extra = []  # (accessor index, bytes): each kept accessor gets a buffer view of its own, so shared geometry buffers can go
if keep:
    CS = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
    for a in sorted(keep_acc):
        acc = j['accessors'][a]; v = views[acc['bufferView']]; size = CS[acc['componentType']] * NC[acc['type']]
        stride = v.get('byteStride', size); base = v.get('byteOffset', 0) + acc.get('byteOffset', 0)
        extra.append((a, b''.join(bin_[base + i * stride: base + i * stride + size] for i in range(acc['count'])), v.get('target')))
_t = io.BytesIO(); Image.new('RGB', (1, 1)).save(_t, 'PNG'); TINY = _t.getvalue()
out = bytearray(); new_views = []
for vi, v in enumerate(views):
    data = bin_[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]
    if used is not None and vi not in used:
        data = TINY if vi in img_view else b'\0\0\0\0'
        if vi in img_view: j['images'][img_view[vi]]['mimeType'] = 'image/png'
    elif vi in img_view:
        im = Image.open(io.BytesIO(data)); w, h = im.size
        if max(w, h) > N: im = im.resize((max(1, w * N // max(w, h)), max(1, h * N // max(w, h))), Image.LANCZOS)
        buf = io.BytesIO()
        alpha = im.mode in ('RGBA', 'LA', 'P') and im.convert('RGBA').getextrema()[3][0] < 255
        if alpha: im.save(buf, 'PNG', optimize=True); mime = 'image/png'
        else: im.convert('RGB').save(buf, 'JPEG', quality=86); mime = 'image/jpeg'
        if len(buf.getvalue()) < len(data) or max(w, h) > N:
            data = buf.getvalue(); j['images'][img_view[vi]]['mimeType'] = mime
        print('  image', img_view[vi], (w, h), '->', im.size, len(data) // 1024, 'KB')
    while len(out) % 4: out.append(0)
    nv = dict(v); nv['byteOffset'] = len(out); nv['byteLength'] = len(data); new_views.append(nv); out += data
for a, data, target in extra:
    while len(out) % 4: out.append(0)
    nv = {'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)}
    if target: nv['target'] = target
    j['accessors'][a]['bufferView'] = len(new_views); j['accessors'][a]['byteOffset'] = 0
    new_views.append(nv); out += data
while len(out) % 4: out.append(0)
j['bufferViews'] = new_views; j['buffers'] = [{'byteLength': len(out)}]
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
with open(dst, 'wb') as o:
    o.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(out)))
    o.write(struct.pack('<II', len(js), 0x4E4F534A)); o.write(js)
    o.write(struct.pack('<II', len(out), 0x004E4942)); o.write(out)
print(dst, (12 + 16 + len(js) + len(out)) // 1024, 'KB')
