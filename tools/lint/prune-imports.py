#!/usr/bin/env python3
"""Remove unused import names that `tsc --noUnusedLocals` reports (run from game/). Leaves unused locals for a person."""
import re, collections, subprocess
out = subprocess.run(['npx', 'tsc', '-p', 'packages/client', '--noEmit', '--noUnusedLocals'], capture_output=True, text=True).stdout
errs = collections.defaultdict(list)
for l in out.split('\n'):
    m = re.match(r"(packages/client/src/[^()]+)\((\d+),(\d+)\): error TS(6133|6192)", l)
    if not m: continue
    n = re.search(r"'([^']+)' is declared", l)
    errs[m[1]].append((int(m[2]), n[1] if n else None))
for f, es in errs.items():
    lines = open(f).read().split('\n')
    imp, i = [], 0
    while i < len(lines):
        if lines[i].startswith('import '):
            j = i
            while not re.search(r"from '[^']+';\s*$|^import '[^']+';", lines[j]): j += 1
            imp.append((i, j)); i = j + 1
        else: i += 1
    for ln, name in sorted(es, reverse=True):
        r = next(((a, b) for a, b in imp if a <= ln - 1 <= b), None)
        if not r: print('left for you:', f, ln, name); continue
        a, b = r
        if name is None:  # the whole declaration is unused
            for k in range(a, b + 1): lines[k] = None
        elif a == b:
            L = lines[a]
            L2 = re.sub(r"(\{[^}]*?)\b(type )?" + re.escape(name) + r"\b,?\s*", r"\1", L)
            L2 = re.sub(r",\s*\}", " }", L2)
            if re.search(r"\{\s*\}", L2): L2 = None
            lines[a] = L2
        elif lines[ln - 1] is not None and re.match(r"\s*(type )?" + re.escape(name) + r",?\s*$", lines[ln - 1]):
            lines[ln - 1] = None
    open(f, 'w').write('\n'.join(l for l in lines if l is not None))
