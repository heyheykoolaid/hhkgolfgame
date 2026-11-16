import subprocess, urllib.parse, json, os, re
ALL=[l.rstrip('\n') for l in open('/tmp/ss.txt')]
P='freepd.com/'; F='freemusicarchive.org/'
BANDS=[
 ('TIKI FM','Exotica & island lounge',[F+'Hawaiian Trio - Hawaiian Twilight',F+'Johnny Nobles Hawaiians - Johnny Nobles Hawaiians - Hawaiian Hula Melody',P+'Pina Colada',P+'Martini Sunset',P+'The Lagoon',P+'Cha-Cha Ender']),
 ('YACHT','Smooth & easy',[F+'TRG Banks - Smooth jacket',F+'TRG Banks - Into the sunset',F+'Malaventura - Breeze Funk',F+'John Bartmann - Mellow Cafe Vibe',F+'Monplaisir - Sunset Pink Clouds']),
 ('HANG TEN','Surf & twang',[F+'Komiku - Surfing',F+'John Bartmann - Secret Agent Rock',F+'Loyalty Freak Music - Beach',F+'SUPERARE - Beach Babes']),
 ('ITALO','Synths & neon',[F+'HoliznaCC0 - Back In The 80s',F+'HoliznaCC0 - Retro Synths',F+'SUPERARE - Neon',F+'HoliznaCC0 - Retro Soundtrack',P+'Soundtrack From the Starcourt Mall',P+'Shenzhen Nightlife']),
 ('CITY POP','Funk-pop & city nights',[F+'HoliznaCC0 - City Lights',F+'Komiku - Pop City',F+'HoliznaCC0 - Make Funk',F+'SUPERARE - Funky Fresh',P+'City Sunshine',P+'Funkeriffic',P+'Groovin']),
 ('OUTLAW','Banjos & honky-tonk',[P+'Hillbilly Swing',P+'Lukewarm Banjo',P+'Still Pickin',P+'Jethro on the Run',P+'Barnville',P+'Del Rio Bravo',F+'HoliznaCC0 - Western ShowDown']),
 ('DUB','Reggae & dub',[P+'Sunday Dub',P+'Sunny Rasta',P+'Be Jammin',P+'Be Chillin']),
 ('SPACE','Drifting ambient',[P+'Space Ambience',F+'John Bartmann - Interstellar Space',F+'John Bartmann - nebulae-master',F+'HoliznaCC0 - An Ocean in Outer Space',P+'Mothership',P+'Neptunian Princess']),
 ('BIG BAND','Hot jazz off the gramophone',[F+'Friars Society Orchestra - Tiger Rag',F+"Europe's Society Orchestra - Castle House Rag",F+"Eddie Elkins' Orchestra - April Showers",F+'Clyde Doerr and His Orchestra - Swanee Smiles',P+'BeBop for Joey',P+'Downtown Boogie',P+'Vintage Party']),
 ('THE STATIC','Weird & wonderful',[P+'Improved Ice Cream Truck',P+'Llama in Pajama',P+'Dance of the Tuba Plum Fairy',P+'Circus of Freaks',F+'Great White Way Orchestra - Yes! We Have No Bananas',F+'Edison Symphony Orchestra - Frolicks In A Hencoop',F+'Frederic Lardon - Kaotik ice cream truck reggae',P+'Wakka Wakka']),
]
out=[]
for bi,(tag,genre,tracks) in enumerate(BANDS):
    got=[]
    for ti,t in enumerate(tracks):
        path=t+'.mp3'
        if path not in ALL: print('MISSING',path); continue
        src=f'src/{bi}_{ti}.mp3'
        if not os.path.exists(src) or os.path.getsize(src)<20000:
            url='https://raw.githubusercontent.com/SoundSafari/CC0-1.0-Music/main/'+urllib.parse.quote(path)
            subprocess.run(['curl','-sL','-m','120','-o',src,url])
        try: dur=float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',src],capture_output=True,text=True).stdout.strip())
        except: print('BAD',path, os.path.getsize(src) if os.path.exists(src) else 0); continue
        name=t.split('/',1)[1]
        artist,title=(name.split(' - ',1)+[''])[:2] if ' - ' in name else ('',name)
        if title.startswith(artist+' - '): title=title[len(artist)+3:]
        title=re.sub(r'-master$','',title).replace('-',' ').strip().title() if title.islower() or title.endswith('-master') else title
        got.append(dict(src=src,dur=dur,title=title,artist=artist,site='FreePD' if t.startswith(P) else 'Free Music Archive'))
    out.append(dict(tag=tag,genre=genre,tracks=got)); print(tag,[(g['title'],round(g['dur'])) for g in got])
json.dump(out,open('picked.json','w'),indent=1)
