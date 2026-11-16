#!/usr/bin/env python3
"""Rewrite a .glb with its textures scaled down to at most N pixels a side (downloads matter more than 4K labels).
Colour textures with no transparency become JPEG; the rest stay PNG.

  python3 -I tools/packs/shrink.py in.glb out.glb [N=1024]
"""
import sys, json, struct, io
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
src, dst = sys.argv[1:3]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
f = open(src, 'rb'); f.read(12)
clen, _ = struct.unpack('<II', f.read(8)); j = json.loads(f.read(clen))
blen, _ = struct.unpack('<II', f.read(8)); bin_ = f.read(blen)
views = j['bufferViews']
img_view = {im['bufferView']: i for i, im in enumerate(j.get('images', [])) if 'bufferView' in im}
out = bytearray(); new_views = []
for vi, v in enumerate(views):
    data = bin_[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]
    if vi in img_view:
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
while len(out) % 4: out.append(0)
j['bufferViews'] = new_views; j['buffers'] = [{'byteLength': len(out)}]
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
with open(dst, 'wb') as o:
    o.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(out)))
    o.write(struct.pack('<II', len(js), 0x4E4F534A)); o.write(js)
    o.write(struct.pack('<II', len(out), 0x004E4942)); o.write(out)
print(dst, (12 + 16 + len(js) + len(out)) // 1024, 'KB')
