#!/usr/bin/env python3
"""Pack real courses' scorecards for "Home course" rounds: public/data/courses.json.

Source: OpenGolfAPI's open dataset (https://github.com/opengolfapi/data, opengolfapi-us.ndjson), Open Database License 1.0.
Credit: "source=OpenGolf" (docs/credits.md). Only facts are kept: name, state, city, total yards, and for the first nine
holes on the card their par and whether the hole is one of the six hardest (handicap index 1-6).

  python3 -I tools/courses/pack.py /path/to/opengolfapi-us.ndjson

Each course is [name, state, city, yards, card] where card is nine digits, one per hole: (par - 3) * 2 + (1 if hard).
A course's place in the list is its number inside match ids, so the list is sorted by the dataset's own ids and must
only ever be appended to.
"""
import sys, json, os, re
out = os.path.join(os.path.dirname(__file__), '..', '..', 'packages', 'client', 'public', 'data', 'courses.json')
rows = []
for line in open(sys.argv[1], encoding='utf-8'):
    p = json.loads(line)['properties']
    card = sorted((h for h in (p.get('scorecard') or []) if isinstance(h.get('par'), int) and 3 <= h['par'] <= 5), key=lambda h: h.get('hole') or 0)
    if len(card) < 9 or not p.get('name'): continue
    nine = card[:9]
    digits = ''.join(str((h['par'] - 3) * 2 + (1 if 1 <= (h.get('handicap_index') or 99) <= 6 else 0)) for h in nine)
    name = re.sub(r'([a-z])tm\b', r'\1', p['name'].strip())  # ('Linkstm': a trademark sign that lost its way)
    rows.append((p['id'], [name[:60], p.get('state') or '', (p.get('city') or '').strip()[:30], int(p.get('total_yardage') or 0), digits]))
rows.sort(key=lambda r: r[0])
json.dump([r[1] for r in rows], open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(rows), 'courses', os.path.getsize(out) // 1024, 'KB')
