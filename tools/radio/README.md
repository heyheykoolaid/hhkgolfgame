# Cart radio music

The published game can't play outside streams, so the radio's ten bands are playlists of public-domain (CC0) tracks
shipped in `packages/client/public/radio/`.

- Source: the `SoundSafari/CC0-1.0-Music` collection on GitHub (FreePD and Free Music Archive CC0 tracks).
- `get.py` holds the band list and downloads the candidates (needs the collection's file list at `/tmp/ss.txt`,
  from a blob-less clone: `git clone --filter=blob:none --no-checkout --depth 1 …` then `git ls-tree -r --name-only HEAD`).
- `enc.py` keeps the first four tracks of at least 45 s per band, trims to 3:15 with a fade, levels them
  (loudnorm −16 LUFS) and writes mono 72 kbps mp3s plus `radio.json` (band tags, titles, artists, lengths).

Tracks were chosen by title and artist, not by ear. To drop one, remove it from `get.py` and run both scripts again.
