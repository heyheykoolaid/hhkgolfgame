// The credits: everyone whose work is in the game. Keep in step with docs/credits.md (the packs marked CC BY must be
// credited by name; the rest are thanks).
const ROWS: [string, [string, string, string][]][] = [
  ['Golden Hills', [['Made by', 'heyheykoolaid', 'with Claude (Anthropic)']]],
  [
    'Models',
    [
      ['Shopfronts and apartment blocks', 'McPato', '"Buildings | PS1 Asset Pack" · CC BY 4.0'],
      ["The Lucky Lie Lounge's bar room, the diner booth and bar stool", 'McPato', '"Barranco Bar | PS1 Environment" · CC BY 4.0'],
      ['Home furniture at Homestead', 'McPato', '"House Interior | PS1 Asset Pack" · CC BY 4.0'],
      ['Storage shelves and boxes', 'teacherap123', '"PSX Storage Shelves & Cardboard Boxs" · CC BY 4.0'],
      ['Cars and the delivery van', 'PorscheAaron', '"54 Vehicle Pack" · CC BY 4.0'],
      ['Alley props', 'Tomitos', '"PSX Industrial Pack" · CC BY 4.0'],
      ['Car handling, gearbox and engine-sound model (adapted)', 'OpenUG2 contributors', 'OpenUG2 · MIT License'],
      ['Pictures in the lounge', 'Melon Polygons', '"Paintings and Posters Collection" · CC BY 4.0'],
      ['Golfers, clothes and hair', 'MakeHuman community', 'CC0'],
      ['Lot furniture, textures, sky', 'Poly Haven', 'CC0'],
      ['Mini putt course, cards, chips, sounds', 'Kenney', 'CC0'],
    ],
  ],
  [
    'Motion',
    [
      ['Walk, run and cheer', 'Bandai Namco Research Inc.', 'Bandai-Namco-Research-Motiondataset · CC BY-NC 4.0'],
      ['Golf swing, putt, tee-up', 'Carnegie Mellon University', 'CMU Graphics Lab Motion Capture Database'],
    ],
  ],
  [
    'Pictures and music',
    [
      ['Tattoo designs', 'Openclipart contributors', 'CC0'],
      ['Paintings and landmarks on ball skins', 'Wikimedia Commons', 'public domain'],
      ['Cart radio', 'SoundSafari CC0 collection', 'FreePD and Free Music Archive artists · CC0'],
    ],
  ],
  [
    'Built with',
    [
      ['3D', 'three.js', 'MIT'],
      ['Physics', 'Rapier (Dimforge)', 'Apache 2.0'],
      ['Mesh simplifier', 'meshoptimizer', 'MIT'],
    ],
  ],
];
export const creditsHTML = () =>
  ROWS.map(
    ([h, rows]) =>
      `<h3>${h}</h3>${rows.map(([what, who, how]) => `<div class="crow"><span>${what}</span><b>${who}</b><small>${how}</small></div>`).join('')}`,
  ).join('') + '<p class="cnote">A fan-made, non-commercial game. Thank you to everyone who shares their work freely.</p>';
