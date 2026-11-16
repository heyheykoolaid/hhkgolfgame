"""Cut the tattoo designs out of the saved screenshots in src/ into public/golfer/tattoos.png (see README.md)."""
import os, numpy as np, cv2
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
ITEMS = [('dragon', 0), ('lion', 0), ('bull', 0), ('wings', 0), ('heart', 0), ('star', 0), ('wolf', 0), ('butterfly', 0), ('serpent', 0), ('lionface', 0),
         ('dolphin', 0), ('rose', 1), ('sun', 0), ('skull', 1), ('skullrose', 0), ('sugar', 1), ('anchor', 0), ('swallow', 0)]   # 1 = keeps its colours
C = 256; sheet = np.zeros((C * 3, C * 6, 4), np.uint8)
for i, (name, col) in enumerate(ITEMS):
    a = np.asarray(Image.open(f'{HERE}/src/{name}.png').convert('RGB')).astype(np.float32)
    page = np.abs(a - 14).max(2) < 6                      # the browser's dark page round the image
    rows = np.where((~page).mean(1) > 0.3)[0]; cols = np.where((~page).mean(0) > 0.3)[0]
    a = a[rows.min():rows.max() + 1, cols.min():cols.max() + 1]
    if col: al = np.clip((np.abs(a - 229).max(2) - 14) / 36, 0, 1); rgb = a      # 229 = the grey shown behind a transparent image
    else: al = np.clip((225 - a.mean(2)) / 170, 0, 1); rgb = np.zeros_like(a)
    if name == 'sun': al = cv2.dilate(al, np.ones((5, 5), np.uint8))               # a hairline drawing: thicken it
    ys, xs = np.where(al > 0.15); im = np.dstack([rgb, al * 255])[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.uint8)
    h, w = im.shape[:2]; s = (C - 8) / max(h, w); im = cv2.resize(im, (max(1, int(w * s)), max(1, int(h * s))), interpolation=cv2.INTER_AREA); h, w = im.shape[:2]
    oy = (i // 6) * C + (C - h) // 2; ox = (i % 6) * C + (C - w) // 2; sheet[oy:oy + h, ox:ox + w] = im
Image.fromarray(sheet, 'RGBA').save(f'{HERE}/../../packages/client/public/golfer/tattoos.png', optimize=True)
