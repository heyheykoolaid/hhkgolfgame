import json, subprocess, os
picked=json.load(open('picked.json'))
PUB='/home/claude/game/packages/client/public/radio'; os.makedirs(PUB,exist_ok=True)
for f in os.listdir(PUB): os.remove(os.path.join(PUB,f))
bands=[]; total=0
for bi,b in enumerate(picked):
    ts=[t for t in b['tracks'] if t['dur']>=45][:4]
    outt=[]
    for n,t in enumerate(ts):
        d=min(t['dur'],195); name=f'b{bi}_{n}.mp3'; dst=os.path.join(PUB,name)
        af=f"loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.4,afade=t=out:st={d-3.5:.2f}:d=3.5"
        subprocess.run(['ffmpeg','-y','-v','error','-i',t['src'],'-t',f'{d:.2f}','-vn','-map_metadata','-1','-ac','1','-ar','44100','-af',af,'-c:a','libmp3lame','-b:a','72k',dst],check=True)
        dur=float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',dst],capture_output=True,text=True).stdout.strip())
        vol=subprocess.run(['ffmpeg','-i',dst,'-af','volumedetect','-f','null','-'],capture_output=True,text=True).stderr
        mean=[l for l in vol.split('\n') if 'mean_volume' in l][0].split(':')[1].strip()
        total+=os.path.getsize(dst)
        outt.append(dict(f=name,d=round(dur,2),t=t['title'],a=t['artist'],s=t['site'])); print(b['tag'],t['title'],round(dur),mean,os.path.getsize(dst)//1024,'KB')
    bands.append(dict(tag=b['tag'],genre=b['genre'],tracks=outt))
json.dump(dict(bands=bands),open(os.path.join(PUB,'radio.json'),'w'))
print('total MB',total/1e6)
