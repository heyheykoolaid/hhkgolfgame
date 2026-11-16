#!/usr/bin/env python3
"""Pack downloaded prop models (.glb) for the game: each becomes public/packs/<name>.json holding the file as base64
(the artifact host serves .json but not .glb/.bin). Credits go in docs/credits.md.

  python3 tools/props/pack.py industrial=/path/to/psx_industrial_pack.glb [more=...]
"""
import sys, base64, json, os
out = os.path.join(os.path.dirname(__file__), '..', '..', 'packages', 'client', 'public', 'packs')
for arg in sys.argv[1:]:
    name, path = arg.split('=', 1)
    b = open(path, 'rb').read()
    json.dump({'glb': base64.b64encode(b).decode()}, open(os.path.join(out, name + '.json'), 'w'))
    print(name, len(b) // 1024, 'KB')
