'use strict';
// ---------- terrain ----------
const C1 = { foot: 1, horse: 1, armor: 1 };
const NOPE = { foot: 99, horse: 99, armor: 99 };
const TERRAIN = {
  '.': { id: 'plain', name: '平地', def: 0, avo: 0, cost: C1, mat: 0 },
  'r': { id: 'road', name: '街道', def: 0, avo: 0, cost: C1, mat: 2 },
  'f': { id: 'forest', name: '林', def: 1, avo: 20, cost: { foot: 2, horse: 3, armor: 2 }, mat: 1 },
  'm': { id: 'hill', name: '山', def: 2, avo: 30, cost: { foot: 3, horse: 99, armor: 99 }, mat: 3 },
  'M': { id: 'peak', name: '高山', def: 3, avo: 40, cost: NOPE, mat: 4 },
  '~': { id: 'water', name: '川', def: 0, avo: 0, cost: NOPE, mat: 5 },
  '=': { id: 'bridge', name: '橋', def: 0, avo: 0, cost: C1, mat: 5 },
  'h': { id: 'village', name: '村', def: 0, avo: 10, cost: C1, mat: 2 },
  'F': { id: 'fort', name: '砦', def: 2, avo: 20, cost: { foot: 2, horse: 2, armor: 2 }, mat: 2, heal: true },
  'W': { id: 'wall', name: '城壁', def: 0, avo: 0, cost: NOPE, mat: 6 },
  'C': { id: 'floor', name: '石床', def: 0, avo: 0, cost: C1, mat: 6 },
  'k': { id: 'carpet', name: '絨毯', def: 0, avo: 0, cost: C1, mat: 6 },
  'T': { id: 'throne', name: '玉座', def: 3, avo: 30, cost: C1, mat: 6, heal: true },
  'P': { id: 'pillar', name: '柱', def: 0, avo: 0, cost: NOPE, mat: 6 },
  'D': { id: 'gate', name: '城門', def: 1, avo: 10, cost: C1, mat: 6 },
  'B': { id: 'rubble', name: '瓦礫', def: 1, avo: 10, cost: { foot: 2, horse: 3, armor: 2 }, mat: 2 },
};

// ---------- weapons & items ----------
const WEAPONS = {
  rapier:   { name: 'レイピア', type: 'sword', mt: 7, hit: 95, crit: 10, rng: [1, 1] },
  ironSword:{ name: '鉄の剣', type: 'sword', mt: 5, hit: 90, crit: 0, rng: [1, 1] },
  steelSword:{ name: '鋼の剣', type: 'sword', mt: 8, hit: 75, crit: 0, rng: [1, 1] },
  killEdge: { name: 'キルソード', type: 'sword', mt: 9, hit: 75, crit: 30, rng: [1, 1] },
  ironLance:{ name: '鉄の槍', type: 'lance', mt: 7, hit: 80, crit: 0, rng: [1, 1] },
  steelLance:{ name: '鋼の槍', type: 'lance', mt: 10, hit: 70, crit: 0, rng: [1, 1] },
  javelin:  { name: '手槍', type: 'lance', mt: 6, hit: 65, crit: 0, rng: [1, 2] },
  ironAxe:  { name: '鉄の斧', type: 'axe', mt: 8, hit: 75, crit: 0, rng: [1, 1] },
  handAxe:  { name: '手斧', type: 'axe', mt: 7, hit: 60, crit: 0, rng: [1, 2] },
  steelAxe: { name: '鋼の斧', type: 'axe', mt: 11, hit: 65, crit: 0, rng: [1, 1] },
  greatAxe: { name: '黒鉄の大斧', type: 'axe', mt: 14, hit: 75, crit: 10, rng: [1, 1] },
  ironBow:  { name: '鉄の弓', type: 'bow', mt: 6, hit: 85, crit: 0, rng: [2, 2] },
  steelBow: { name: '鋼の弓', type: 'bow', mt: 9, hit: 75, crit: 0, rng: [2, 2] },
  fire:     { name: 'ファイアー', type: 'anima', elem: 'fire', mt: 5, hit: 90, crit: 0, rng: [1, 2], magic: true },
  thunder:  { name: 'サンダー', type: 'anima', elem: 'thunder', mt: 8, hit: 80, crit: 5, rng: [1, 2], magic: true },
  flux:     { name: 'ミィル', type: 'dark', elem: 'dark', mt: 7, hit: 80, crit: 0, rng: [1, 2], magic: true },
  heal:     { name: 'ライブ', type: 'staff', heal: 10, rng: [1, 1], staff: true },
};
const ITEMS = {
  vulnerary: { name: '傷薬', heal: 10, uses: 3, desc: 'HPを10回復する' },
  elixir:    { name: 'エリクサー', heal: 99, uses: 1, desc: 'HPを全回復する' },
  talisman:  { name: '守りの護符', boost: { def: 2 }, uses: 1, desc: '守備が永続的に+2' },
  energy:    { name: 'エナジーリング', boost: { str: 2, mag: 2 }, uses: 1, desc: '力・魔力が永続的に+2' },
};
const WTYPE_JP = { sword: '剣', lance: '槍', axe: '斧', bow: '弓', anima: '理', dark: '闇', staff: '杖' };

// ---------- classes ----------
const CLASSES = {
  lord:      { name: 'ロード', mov: 5, move: 'foot', body: 'human' },
  cavalier:  { name: 'ソシアルナイト', mov: 7, move: 'horse', body: 'human', mount: 'horse' },
  knight:    { name: 'アーマーナイト', mov: 4, move: 'armor', body: 'armor' },
  archer:    { name: 'アーチャー', mov: 5, move: 'foot', body: 'human' },
  mage:      { name: '魔道士', mov: 5, move: 'foot', body: 'robe' },
  cleric:    { name: 'シスター', mov: 5, move: 'foot', body: 'robe' },
  brigand:   { name: '山賊', mov: 5, move: 'foot', body: 'human' },
  chief:     { name: '山賊頭', mov: 5, move: 'foot', body: 'human' },
  soldier:   { name: '兵士', mov: 5, move: 'foot', body: 'human' },
  mercenary: { name: '傭兵', mov: 5, move: 'foot', body: 'human' },
  shaman:    { name: 'シャーマン', mov: 5, move: 'foot', body: 'robe' },
  general:   { name: 'ジェネラル', mov: 4, move: 'armor', body: 'armor' },
  eknight:   { name: 'アーマーナイト', mov: 4, move: 'armor', body: 'armor' },
  ecav:      { name: 'ソシアルナイト', mov: 7, move: 'horse', body: 'human', mount: 'horse' },
  earcher:   { name: 'アーチャー', mov: 5, move: 'foot', body: 'human' },
};
const STAT_KEYS = ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res'];
const STAT_JP = { hp: 'HP', str: '力', mag: '魔力', skl: '技', spd: '速さ', lck: '幸運', def: '守備', res: '魔防' };

// ---------- heroes ----------
const HEROES = {
  lionel: {
    name: 'リオネル', cls: 'lord', lv: 1, lord: true,
    stats: { hp: 20, str: 6, mag: 1, skl: 7, spd: 8, lck: 7, def: 5, res: 2 },
    growth: { hp: 80, str: 50, mag: 10, skl: 55, spd: 55, lck: 50, def: 35, res: 25 },
    weapons: ['rapier'], items: ['vulnerary'],
    look: { skin: '#f0c9a6', hair: '#2c3f66', hairStyle: 'short', eye: '#3d7fd6', cloth: '#2f5fa8', cloth2: '#e9dfc4', metal: '#c8ced8', cape: '#1d3a78', helm: 'circlet', horseCol: null },
    bio: 'エルセリア辺境騎士団の若き団長。王家の傍流に連なる。'
  },
  gareth: {
    name: 'ガレス', cls: 'cavalier', lv: 3,
    stats: { hp: 24, str: 8, mag: 0, skl: 6, spd: 6, lck: 4, def: 7, res: 1 },
    growth: { hp: 85, str: 45, mag: 5, skl: 40, spd: 40, lck: 30, def: 35, res: 15 },
    weapons: ['ironLance', 'ironSword'], items: ['vulnerary'],
    look: { skin: '#e2b48f', hair: '#8c3b26', hairStyle: 'short', eye: '#5a3a22', cloth: '#2a5d9e', cloth2: '#c9b48a', metal: '#b9c0ca', cape: null, helm: 'open', beard: false, horseCol: '#7a4a2c' },
    bio: '先代から仕える忠義の騎士。槍と馬術に優れる。'
  },
  borg: {
    name: 'ボルグ', cls: 'knight', lv: 4,
    stats: { hp: 27, str: 9, mag: 0, skl: 5, spd: 2, lck: 3, def: 12, res: 0 },
    growth: { hp: 90, str: 45, mag: 0, skl: 35, spd: 20, lck: 25, def: 50, res: 10 },
    weapons: ['ironLance', 'javelin'], items: [],
    look: { skin: '#d9a77f', hair: '#55504a', hairStyle: 'short', eye: '#4a4038', cloth: '#26508f', cloth2: '#a89b80', metal: '#8f99a8', cape: null, helm: 'full', beard: true },
    bio: '寡黙な重騎士。その鎧は城壁より固いと噂される。'
  },
  rou: {
    name: 'ロウ', cls: 'archer', lv: 2,
    stats: { hp: 19, str: 6, mag: 0, skl: 8, spd: 7, lck: 5, def: 4, res: 1 },
    growth: { hp: 70, str: 45, mag: 5, skl: 55, spd: 50, lck: 40, def: 20, res: 15 },
    weapons: ['ironBow'], items: [],
    look: { skin: '#eac09b', hair: '#d2a64a', hairStyle: 'spiky', eye: '#3f7a3a', cloth: '#355f8e', cloth2: '#6f5a3c', metal: '#a8afb8', cape: null, helm: null },
    bio: '流れ者の狩人。口は悪いが腕は確か。'
  },
  erna: {
    name: 'エルナ', cls: 'mage', lv: 1, female: true,
    stats: { hp: 16, str: 0, mag: 7, skl: 6, spd: 7, lck: 5, def: 2, res: 6 },
    growth: { hp: 55, str: 5, mag: 60, skl: 45, spd: 50, lck: 40, def: 15, res: 40 },
    weapons: ['fire'], items: [],
    look: { skin: '#f3d0b0', hair: '#c2552e', hairStyle: 'long', eye: '#7a3fb0', cloth: '#3a4fa0', cloth2: '#d8c38a', metal: '#c9a45c', cape: null, helm: null, female: true },
    bio: '王立魔道院の才媛。好奇心が強すぎるのが玉に瑕。'
  },
  miria: {
    name: 'ミリア', cls: 'cleric', lv: 1, female: true,
    stats: { hp: 15, str: 0, mag: 5, skl: 4, spd: 6, lck: 9, def: 1, res: 7 },
    growth: { hp: 50, str: 5, mag: 50, skl: 35, spd: 45, lck: 60, def: 10, res: 50 },
    weapons: ['heal'], items: ['vulnerary'],
    look: { skin: '#f6d9c0', hair: '#efd99a', hairStyle: 'long', eye: '#3f6fb8', cloth: '#ece6da', cloth2: '#2f5aa6', metal: '#d6b56a', cape: null, helm: 'veil', female: true },
    bio: '修道院のシスター。争いを嫌うが、仲間のためなら戦場へ赴く。'
  },
};

// ---------- enemy templates ----------
const FOES = {
  brigand: { cls: 'brigand', stats: { hp: 20, str: 5, mag: 0, skl: 1, spd: 3, lck: 0, def: 2, res: 0 }, growth: { hp: 80, str: 45, mag: 0, skl: 20, spd: 25, lck: 10, def: 15, res: 5 }, weapons: ['ironAxe'],
    look: { skin: '#d49c74', hair: '#3d2a1c', hairStyle: 'short', eye: '#2a1d14', cloth: '#7a3a28', cloth2: '#5a4630', metal: '#8a8f96', helm: 'bandana', beard: true } },
  soldier: { cls: 'soldier', stats: { hp: 18, str: 4, mag: 0, skl: 3, spd: 3, lck: 1, def: 4, res: 0 }, growth: { hp: 70, str: 40, mag: 0, skl: 35, spd: 30, lck: 15, def: 25, res: 10 }, weapons: ['ironLance'],
    look: { skin: '#e3b28c', hair: '#4a3626', hairStyle: 'short', eye: '#2a1d14', cloth: '#8e2f2a', cloth2: '#5c4b3a', metal: '#9aa1aa', helm: 'open' } },
  jsoldier: { cls: 'soldier', stats: { hp: 18, str: 4, mag: 0, skl: 3, spd: 3, lck: 1, def: 4, res: 0 }, growth: { hp: 70, str: 40, mag: 0, skl: 35, spd: 30, lck: 15, def: 25, res: 10 }, weapons: ['javelin'],
    look: { skin: '#e3b28c', hair: '#4a3626', hairStyle: 'short', eye: '#2a1d14', cloth: '#8e2f2a', cloth2: '#5c4b3a', metal: '#9aa1aa', helm: 'open' } },
  earcher: { cls: 'earcher', stats: { hp: 17, str: 4, mag: 0, skl: 4, spd: 3, lck: 1, def: 3, res: 0 }, growth: { hp: 65, str: 40, mag: 0, skl: 40, spd: 35, lck: 15, def: 15, res: 10 }, weapons: ['ironBow'],
    look: { skin: '#e0ae88', hair: '#6a4a2a', hairStyle: 'short', eye: '#2a1d14', cloth: '#7c2f33', cloth2: '#4e3f2c', metal: '#9aa1aa', helm: 'hood' } },
  mercenary: { cls: 'mercenary', stats: { hp: 19, str: 5, mag: 0, skl: 7, spd: 7, lck: 2, def: 3, res: 0 }, growth: { hp: 75, str: 40, mag: 0, skl: 45, spd: 45, lck: 20, def: 20, res: 10 }, weapons: ['ironSword'],
    look: { skin: '#e8b994', hair: '#1f1f24', hairStyle: 'spiky', eye: '#2a1d14', cloth: '#7d2b2b', cloth2: '#3b3530', metal: '#a0a6ae', helm: null } },
  kmercenary: { cls: 'mercenary', stats: { hp: 20, str: 6, mag: 0, skl: 9, spd: 8, lck: 3, def: 4, res: 0 }, growth: { hp: 75, str: 40, mag: 0, skl: 45, spd: 45, lck: 20, def: 20, res: 10 }, weapons: ['killEdge'],
    look: { skin: '#e8b994', hair: '#d8d4cc', hairStyle: 'long', eye: '#8a2a2a', cloth: '#5a1f2a', cloth2: '#2b2626', metal: '#b0b6be', helm: null } },
  shaman: { cls: 'shaman', stats: { hp: 16, str: 0, mag: 5, skl: 3, spd: 3, lck: 1, def: 1, res: 5 }, growth: { hp: 60, str: 0, mag: 50, skl: 35, spd: 35, lck: 15, def: 10, res: 40 }, weapons: ['flux'],
    look: { skin: '#cfb7a6', hair: '#2a2030', hairStyle: 'short', eye: '#b03aa0', cloth: '#3a1a3e', cloth2: '#8a2a3a', metal: '#7a6a8a', helm: 'hood' } },
  eknight: { cls: 'eknight', stats: { hp: 22, str: 7, mag: 0, skl: 3, spd: 1, lck: 0, def: 10, res: 0 }, growth: { hp: 80, str: 40, mag: 0, skl: 30, spd: 15, lck: 10, def: 40, res: 5 }, weapons: ['ironLance'],
    look: { skin: '#d9a77f', hair: '#3a3a3a', hairStyle: 'short', eye: '#2a1d14', cloth: '#7e2626', cloth2: '#4a3a30', metal: '#6f7480', helm: 'full' } },
  ecav: { cls: 'ecav', stats: { hp: 20, str: 6, mag: 0, skl: 5, spd: 5, lck: 2, def: 5, res: 0 }, growth: { hp: 75, str: 40, mag: 0, skl: 35, spd: 35, lck: 15, def: 25, res: 10 }, weapons: ['ironSword'],
    look: { skin: '#e3b28c', hair: '#2a2a2a', hairStyle: 'short', eye: '#2a1d14', cloth: '#8a2a26', cloth2: '#4a3a2a', metal: '#8f969f', helm: 'open', horseCol: '#2e2622' } },
  chief: { cls: 'chief', boss: true, name: 'ゴドウィン', stats: { hp: 30, str: 9, mag: 0, skl: 4, spd: 5, lck: 2, def: 5, res: 1 }, growth: {}, weapons: ['steelAxe', 'handAxe'],
    look: { skin: '#c98f66', hair: '#5a2a18', hairStyle: 'short', eye: '#2a1d14', cloth: '#6a2a20', cloth2: '#3a2a1c', metal: '#7b8088', helm: 'horned', beard: true, cape: '#3a1810' } },
  general: { cls: 'general', boss: true, name: 'ヴァルガス', stats: { hp: 38, str: 13, mag: 1, skl: 8, spd: 4, lck: 4, def: 14, res: 4 }, growth: {}, weapons: ['greatAxe', 'javelin'],
    look: { skin: '#c99a7a', hair: '#1c1c22', hairStyle: 'short', eye: '#9a1a1a', cloth: '#5a1418', cloth2: '#c9a45c', metal: '#3e4150', helm: 'horned', beard: true, cape: '#6a0f16' } },
};

// ---------- chapters ----------
const CHAPTERS = [
  {
    id: 1, num: '第一章', name: '灰色の谷', sub: 'Chapter I — The Ashen Vale', time: 'day', seed: 1337,
    goal: 'boss', goalText: '敵将ゴドウィンを撃破',
    map: [
      'MMMmmmff....~~..ffmmMM',
      'MMmmf...h...~~...f..mM',
      'Mmmf.rrrrrrr==rrrrF.mM',
      'mf..r....ff.~~..ffr.fm',
      'f...r..fff..~~.f..r..f',
      '....r.ff...~~..ff.r.mm',
      '.h..r.....f~~...f.rFmm',
      '....r..ff.~~......r...',
      'f...r.....~~.mm.ffr.ff',
      'ff..r..f.~~.mMm.f.r...',
      '.ff.r...~~..mmf...r.ff',
      '....r..~~...mff...r...',
      '.f..r.~~...f......r.h.',
      '....rr==rrrrrrrrrrr...',
      'mm....~~.....ff.....mm',
    ],
    players: [['lionel', 3, 12], ['gareth', 2, 13], ['borg', 3, 13], ['rou', 1, 13], ['erna', 2, 12], ['miria', 0, 13]],
    enemies: [
      { t: 'chief', lv: 4, x: 18, y: 2, ai: 'hold' },
      { t: 'brigand', lv: 2, x: 6, y: 5, ai: 'aggro' },
      { t: 'brigand', lv: 2, x: 9, y: 7, ai: 'aggro' },
      { t: 'brigand', lv: 1, x: 7, y: 1, ai: 'aggro' },
      { t: 'soldier', lv: 2, x: 14, y: 2, ai: 'guard' },
      { t: 'earcher', lv: 2, x: 16, y: 3, ai: 'guard' },
      { t: 'jsoldier', lv: 2, x: 13, y: 13, ai: 'guard' },
      { t: 'mercenary', lv: 3, x: 16, y: 11, ai: 'guard' },
      { t: 'earcher', lv: 2, x: 14, y: 9, ai: 'guard' },
      { t: 'soldier', lv: 3, x: 19, y: 6, ai: 'guard' },
      { t: 'brigand', lv: 3, x: 19, y: 9, ai: 'guard' },
    ],
    villages: {
      '8,1': { reward: 'thunder', to: 'erna', text: '「旅の方、どうかこれを。古い魔道書です。きっとお役に立ちましょう」' },
      '1,6': { reward: 'vulnerary', text: '「騎士様、ありがとう！ せめてこの薬を持っていって」' },
      '20,12': { reward: 'talisman', text: '「父の形見の護符です。…あなたを守ってくれますように」' },
    },
    lights: [],
    intro: [
      { who: null, text: '大陸暦七八四年。北の帝国ヴァルガードは盟約を破り、蒼の王国エルセリアへと侵攻した。' },
      { who: null, text: '王都陥落の報を受け、辺境騎士団を率いる若き騎士リオネルは、わずかな仲間と共に灰色の谷へ向かう――' },
      { who: 'gareth', text: 'リオネル様、谷の村々が山賊に襲われております。帝国の手引きがあると見て間違いないかと。' },
      { who: 'lionel', text: '見過ごすわけにはいかない。村を守りながら谷を抜けよう。ガレス、先陣を頼む。' },
      { who: 'erna', text: '北の村に古い魔道書が眠ってるって噂よ。寄り道する価値はあるわね。' },
      { who: 'miria', text: '傷ついた方は私のもとへ。…どうか、無茶だけはなさらないでくださいね。' },
    ],
    bossTalk: [{ who: 'chief', text: 'へっ、王国の騎士様が何人来ようが同じことよ！ その鎧ごと叩き割ってやらぁ！' }],
    outro: [
      { who: 'lionel', text: '…終わったか。皆、よくやってくれた。' },
      { who: 'gareth', text: '山賊の頭が帝国の紋章入りの命令書を持っていました。黒幕は――アルド城塞に陣取る将軍ヴァルガス。' },
      { who: 'lionel', text: 'ならば次は城塞だ。日が沈む前に、奪われたものを取り戻そう。' },
    ],
  },
  {
    id: 2, num: '第二章', name: '黄昏の城塞', sub: 'Chapter II — Citadel at Dusk', time: 'dusk', seed: 4242,
    goal: 'seize', goalText: '玉座を制圧（リオネル）',
    map: [
      'WWWWWWWWWWWWWWWWWWWWWW',
      'WCCCCCCWCCCTCCCWCCCCCW',
      'WCCCCCCWPCCkCCPWCCCCCW',
      'WCCCCCCWCCCkCCCWCCCCCW',
      'WCCPCCCWPCCkCCPWCCPCCW',
      'WCCCCCCWWWCkCWWWCCCCCW',
      'WWWCWWWCCCCkCCCCWWWCWW',
      'W..CC...f.CkC.f...CC.W',
      'W.f.CCCCCCCkCCCCCCC.fW',
      'W....ff...CkC..ff....W',
      'WWWBWWWWWWDDDWWWWWBWWW',
      '.f...m.....r.....f..m.',
      'ff..F....f.r....h..ff.',
      '.m....ff...r...ff....m',
      '...f.......r.....f....',
      '..h........r....f.....',
    ],
    players: [['lionel', 11, 14], ['gareth', 10, 15], ['borg', 11, 13], ['rou', 9, 14], ['erna', 12, 15], ['miria', 11, 15]],
    enemies: [
      { t: 'general', lv: 8, x: 11, y: 1, ai: 'hold' },
      { t: 'eknight', lv: 4, x: 11, y: 4, ai: 'guard' },
      { t: 'shaman', lv: 4, x: 9, y: 3, ai: 'guard' },
      { t: 'shaman', lv: 4, x: 13, y: 3, ai: 'guard' },
      { t: 'eknight', lv: 3, x: 3, y: 3, ai: 'guard' },
      { t: 'shaman', lv: 3, x: 18, y: 2, ai: 'guard' },
      { t: 'kmercenary', lv: 5, x: 8, y: 7, ai: 'guard' },
      { t: 'earcher', lv: 4, x: 5, y: 8, ai: 'guard' },
      { t: 'earcher', lv: 4, x: 17, y: 8, ai: 'guard' },
      { t: 'soldier', lv: 4, x: 10, y: 8, ai: 'guard' },
      { t: 'soldier', lv: 4, x: 12, y: 8, ai: 'guard' },
      { t: 'jsoldier', lv: 4, x: 11, y: 10, ai: 'guard' },
      { t: 'ecav', lv: 4, x: 17, y: 4, ai: 'aggro' },
      { t: 'brigand', lv: 4, x: 5, y: 11, ai: 'aggro' },
      { t: 'brigand', lv: 4, x: 17, y: 11, ai: 'aggro' },
      { t: 'earcher', lv: 3, x: 20, y: 11, ai: 'aggro' },
    ],
    villages: {
      '16,12': { reward: 'steelSword', to: 'lionel', text: '「若様、これは城の鍛冶が鍛えた剣。どうか城を…！」' },
      '2,15': { reward: 'elixir', text: '「城の者たちは皆、あなた方を待っておりました。これをお使いください」' },
    },
    lights: [[7, 7], [14, 7], [3, 9], [18, 9], [9, 6], [13, 6], [9, 1], [13, 1]],
    intro: [
      { who: null, text: '黄昏。帝国軍に奪われたアルド城塞は、紅い残光の中に沈んでいた。' },
      { who: 'borg', text: '正門の守りは固い。だが東西の城壁は先の戦で崩れたままだ。そこを突ける。' },
      { who: 'rou', text: '中庭の弓兵は俺が引き受ける。…ああいう手合いは先に黙らせるに限る。' },
      { who: 'general', text: '王国の残党が嗅ぎつけたか。よかろう。玉座の重み、その身で味わうがいい。' },
      { who: 'lionel', text: '玉座を取り戻す。――全軍、前へ！' },
    ],
    bossTalk: [{ who: 'general', text: '小僧、その細剣で我が鎧を貫けると思うな。来い！' }],
    outro: [
      { who: 'lionel', text: 'アルド城塞は、取り戻した。' },
      { who: 'miria', text: '城の皆さんも無事です。…本当に、よかった。' },
      { who: null, text: '蒼き焔は再び王国に灯った。だが帝国の影はなお深い。リオネルたちの戦いは、まだ始まったばかりである――' },
    ],
  },
];
