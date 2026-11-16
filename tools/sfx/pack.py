"""Pack the recorded interface sounds and jingles (Kenney, CC0) into public/sfx/ui.json: { name: base64 mp3 }.
Source: github.com/ETdoFresh/kenney.nl (kenney_interfacesounds, kenney_musicjingles). Chosen by name, not by ear;
swap a file here and run again.   python3 tools/sfx/pack.py"""
import subprocess, base64, json, os, urllib.parse
SRC = {
    'click': 'kenney_interfacesounds/Audio/click_002.ogg',
    'select': 'kenney_interfacesounds/Audio/select_003.ogg',
    'open': 'kenney_interfacesounds/Audio/open_001.ogg',
    'close': 'kenney_interfacesounds/Audio/close_002.ogg',
    'toggle': 'kenney_interfacesounds/Audio/switch_002.ogg',
    'confirm': 'kenney_interfacesounds/Audio/confirmation_002.ogg',
    'error': 'kenney_interfacesounds/Audio/error_004.ogg',
    'tick': 'kenney_interfacesounds/Audio/tick_002.ogg',
    'drop': 'kenney_interfacesounds/Audio/drop_002.ogg',
    'back': 'kenney_interfacesounds/Audio/back_001.ogg',
    'win': 'kenney_musicjingles/Audio/Pizzicato jingles/jingles_PIZZI00.ogg',
    'lap': 'kenney_musicjingles/Audio/Pizzicato jingles/jingles_PIZZI07.ogg',
    'best': 'kenney_musicjingles/Audio/Steel jingles/jingles_STEEL03.ogg',
    'sunk': 'kenney_musicjingles/Audio/Steel jingles/jingles_STEEL10.ogg',
    'trophy': 'kenney_musicjingles/Audio/Sax jingles/jingles_SAX05.ogg',
    'lose': 'kenney_musicjingles/Audio/Pizzicato jingles/jingles_PIZZI12.ogg',
}
D = '/home/claude/ext/sfx'
out = {}
for k, path in SRC.items():
    ogg = f'{D}/{k}.ogg'
    if not os.path.exists(ogg) or os.path.getsize(ogg) < 500:
        for br in ('master', 'main'):
            subprocess.run(['curl', '-sfL', '-m', '60', '-o', ogg, f'https://raw.githubusercontent.com/ETdoFresh/kenney.nl/{br}/' + urllib.parse.quote(path)])
            if os.path.exists(ogg) and os.path.getsize(ogg) > 500: break
    mp3 = f'{D}/{k}.mp3'
    r = subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', ogg, '-ac', '1', '-ar', '44100', '-b:a', '96k', mp3])
    if r.returncode: print('FAILED', k); continue
    dur = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3], capture_output=True, text=True).stdout.strip()
    out[k] = base64.b64encode(open(mp3, 'rb').read()).decode()
    print(k, dur, os.path.getsize(mp3))
os.makedirs('packages/client/public/sfx', exist_ok=True)
json.dump(out, open('packages/client/public/sfx/ui.json', 'w'))
print(len(out), 'sounds', os.path.getsize('packages/client/public/sfx/ui.json') // 1024, 'KB')
