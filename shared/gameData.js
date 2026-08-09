/* ══════════════════════════════════════════════════
   ゲームバランス定義（フロントエンド／バックエンド共通）
   このファイルを唯一の情報源とし、両方から import すること
══════════════════════════════════════════════════ */

export const ITEM_DB = {
  w1: { type: 'weapon', id: 'w1', name: 'ひのきのぼう', icon: '🪵', atk: 0, expMult: 1.0 },
  w2: { type: 'weapon', id: 'w2', name: 'どうのつるぎ', icon: '⚔️', atk: 1, expMult: 1.1 },
  w3: { type: 'weapon', id: 'w3', name: 'てつのつるぎ', icon: '🗡️', atk: 2, expMult: 1.2 },
  w4: { type: 'weapon', id: 'w4', name: 'はがねのつるぎ', icon: '💎', atk: 3, expMult: 1.3 },
  w5: { type: 'weapon', id: 'w5', name: 'ロトのつるぎ', icon: '👑', atk: 5, expMult: 1.5 },
  a1: { type: 'armor', id: 'a1', name: 'ぬののふく', icon: '👘', def: 0, goldMult: 1.0 },
  a2: { type: 'armor', id: 'a2', name: 'かわのよろい', icon: '🛡️', def: 1, goldMult: 1.1 },
  a3: { type: 'armor', id: 'a3', name: 'くさりかたびら', icon: '⛓️', def: 2, goldMult: 1.2 },
  a4: { type: 'armor', id: 'a4', name: 'てつのよろい', icon: '🔩', def: 3, goldMult: 1.3 },
  a5: { type: 'armor', id: 'a5', name: 'ロトのよろい', icon: '👑', def: 5, goldMult: 1.5 },
  c1: { type: 'consumable', id: 'c1', name: 'やくそう', icon: '🌿', effect: 'expBoost', value: 1.5 },
  c2: { type: 'consumable', id: 'c2', name: 'まほうのほん', icon: '📖', effect: 'expBoost', value: 1.3 },
  c3: { type: 'consumable', id: 'c3', name: 'エリクサー', icon: '🧪', effect: 'comboShield', value: 1 },
};

export const LEVEL_TABLE = [
  { lv: 1, exp: 0, hero: '🧙', name: 'みならいまほうつかい', hp: 20, mp: 5 },
  { lv: 2, exp: 80, hero: '🧙', name: 'まほうつかいのたまご', hp: 24, mp: 7 },
  { lv: 3, exp: 200, hero: '🧝', name: 'エルフのせんし', hp: 30, mp: 10 },
  { lv: 4, exp: 380, hero: '🧝', name: 'つよいエルフ', hp: 38, mp: 14 },
  { lv: 5, exp: 620, hero: '⚔️', name: 'けんしのたまご', hp: 48, mp: 18 },
  { lv: 6, exp: 920, hero: '⚔️', name: 'えいごのけんし', hp: 60, mp: 24 },
  { lv: 7, exp: 1300, hero: '🛡️', name: 'えいごのパラディン', hp: 75, mp: 30 },
  { lv: 8, exp: 1800, hero: '🧙‍♂️', name: 'だいまどうし', hp: 90, mp: 40 },
  { lv: 9, exp: 2500, hero: '🦸', name: 'えいごのヒーロー', hp: 110, mp: 52 },
  { lv: 10, exp: 3500, hero: '👑', name: 'えいごのおうさま', hp: 140, mp: 68 },
];

export const TITLE_DEFS = [
  { id: 'first', icon: '🎖️', name: 'はじめての勇者', check: p => p.totalAnswers >= 1 },
  { id: 'correct10', icon: '⭐', name: '10問せいかいし', check: p => p.totalCorrect >= 10 },
  { id: 'correct50', icon: '🌟', name: '50問せいかいし', check: p => p.totalCorrect >= 50 },
  { id: 'perfect', icon: '👑', name: 'かんぺき勇者', check: p => p.hasPerfect },
  { id: 'combo5', icon: '⚡', name: '5コンボ達人', check: p => p.maxCombo >= 5 },
  { id: 'combo10', icon: '🌪️', name: '10コンボ伝説', check: p => p.maxCombo >= 10 },
  { id: 'listen5', icon: '👂', name: 'ちょうりょく5', check: p => p.listenCorrect >= 5 },
  { id: 'speak5', icon: '🎤', name: 'はっわ5', check: p => p.speakCorrect >= 5 },
  { id: 'lv5', icon: '🦸', name: 'レベル5達成', check: p => p.lv >= 5 },
  { id: 'lv10', icon: '🐉', name: 'まおうをたおした', check: p => p.lv >= 10 },
  { id: 'gold100', icon: '💰', name: 'ゴールド100G', check: p => p.gold >= 100 },
];

export const EXP_BASE = { vocab: 10, grammar: 15, typing: 12, listening: 18, speaking: 20, weak: 25 };
export const GOLD_BASE = { vocab: 2, grammar: 3, typing: 2, listening: 4, speaking: 5, weak: 6 };

export function comboMult(combo) {
  if (combo >= 10) return 3;
  if (combo >= 5) return 2;
  if (combo >= 3) return 1.5;
  return 1;
}

export function getLvRow(totalExp) {
  let row = LEVEL_TABLE[0];
  for (const r of LEVEL_TABLE) {
    if (totalExp >= r.exp) row = r;
    else break;
  }
  return row;
}

export function getNextLvRow(lv) {
  return LEVEL_TABLE.find(r => r.lv === lv + 1) || null;
}
