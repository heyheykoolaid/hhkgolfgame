"""Bundle the Kenney (CC0) models Fun Land uses into public/funland/kit.json: { name: base64 GLB }.
The models have flat-colour materials and no textures. Source: github.com/ETdoFresh/kenney.nl (kits: minigolf-kit-2.0,
kenney_racingkit2, foodKit_v1.2), downloaded to KN (default /home/claude/ext/kn).   python3 tools/funland/pack.py"""
import base64, json, os
KN = os.environ.get('KN', '/home/claude/ext/kn')
PICK = {
    'minigolf-kit-2.0': 'straight end holeSquare holeRound corner squareCornerA bumpWalls hillRound hillSquare narrowBlock narrowRound narrowSquare obstacleBlock tunnelDouble tunnelNarrow tunnelWide windmill castle split flag_red club_red ball_red'.split(),
    'kenney_racingkit2': 'grandStandCovered grandStand overheadRoundColored bannerTowerRed bannerTowerGreen pylon barrierRed barrierWhite tentLong tentRoof flagCheckers flagGreen lightPostLarge billboard billboardLow raceCarRed raceCarGreen pitsGarage pitsOffice fenceStraight'.split(),
    'foodKit_v1.2': 'burgerCheeseDouble fries soda hotDog iceCreamCone donutSprinkles'.split(),
}
out = {}
for kit, names in PICK.items():
    for n in names: out[n] = base64.b64encode(open(f'{KN}/{kit}/{n}.glb', 'rb').read()).decode()
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../packages/client/public/funland/kit.json')
json.dump(out, open(dst, 'w')); print(len(out), 'models', os.path.getsize(dst) // 1024, 'KB')
