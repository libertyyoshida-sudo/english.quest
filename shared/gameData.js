/* ══════════════════════════════════════════════════
   ゲームバランス定義（フロントエンド／バックエンド共通）
   このファイルを唯一の情報源とし、両方から import すること
══════════════════════════════════════════════════ */

export const ITEM_DB = {
  w1: { type: 'weapon', id: 'w1', name: 'ことばの小枝', icon: '🪵', atk: 0, expMult: 1.0, price: 0 },
  w2: { type: 'weapon', id: 'w2', name: 'ひらめきペン', icon: '✒️', atk: 1, expMult: 1.1, price: 35 },
  w3: { type: 'weapon', id: 'w3', name: '星読みのペン', icon: '🖋️', atk: 2, expMult: 1.2, price: 80 },
  w4: { type: 'weapon', id: 'w4', name: 'オーロラ辞書', icon: '📘', atk: 3, expMult: 1.3, price: 140 },
  w5: { type: 'weapon', id: 'w5', name: 'ことば灯台', icon: '🏮', atk: 5, expMult: 1.5, price: 240 },
  a1: { type: 'armor', id: 'a1', name: '旅人のケープ', icon: '🧣', def: 0, goldMult: 1.0, price: 0 },
  a2: { type: 'armor', id: 'a2', name: '集音マント', icon: '🧥', def: 1, goldMult: 1.1, price: 40 },
  a3: { type: 'armor', id: 'a3', name: '記憶のベスト', icon: '🎽', def: 2, goldMult: 1.2, price: 90 },
  a4: { type: 'armor', id: 'a4', name: '航海ジャケット', icon: '🦺', def: 3, goldMult: 1.3, price: 150 },
  a5: { type: 'armor', id: 'a5', name: '暁のローブ', icon: '🥻', def: 5, goldMult: 1.5, price: 260 },
  c1: { type: 'consumable', id: 'c1', name: '集中ミント', icon: '🌿', effect: 'expBoost', value: 1.5, price: 18 },
  c2: { type: 'consumable', id: 'c2', name: '復習しおり', icon: '🔖', effect: 'expBoost', value: 1.3, price: 15 },
  c3: { type: 'consumable', id: 'c3', name: 'コンボのお守り', icon: '🪬', effect: 'comboShield', value: 1, price: 25 },
  c4: { type: 'consumable', id: 'c4', name: 'ぬくもり茶', icon: '🍵', effect: 'healHp', value: 18, price: 20 },
  c5: { type: 'consumable', id: 'c5', name: '迷い消しカード', icon: '🃏', effect: 'choiceCut', value: 2, price: 24 },
  p_smart: { type: 'permit', id: 'p_smart', name: 'スマート学習免許', icon: '🧠', price: 60, desc: 'スマート学習を開放' },
  p_world: { type: 'permit', id: 'p_world', name: '世界地図通行証', icon: '🗺️', price: 80, desc: 'まちの外へ出られる' },
  p_desert: { type: 'permit', id: 'p_desert', name: '砂風のコンパス', icon: '🧭', price: 70, desc: '中東・南アジア方面へ入れる' },
  p_snow: { type: 'permit', id: 'p_snow', name: '雪明かりランタン', icon: '🏮', price: 70, desc: '寒い地域へ入れる' },
  p_ocean: { type: 'permit', id: 'p_ocean', name: '潮読みチケット', icon: '🎫', price: 70, desc: '島しょ・海路の地域へ入れる' },
};

const LANGUAGE_PERMIT_ITEMS = {
  lang_fr: { type: 'permit', id: 'lang_fr', name: 'フランス語入門書', icon: '📗', price: 35, desc: 'フランス語を学べる' },
  lang_es: { type: 'permit', id: 'lang_es', name: 'スペイン語入門書', icon: '📗', price: 35, desc: 'スペイン語を学べる' },
  lang_pt: { type: 'permit', id: 'lang_pt', name: 'ポルトガル語入門書', icon: '📗', price: 35, desc: 'ポルトガル語を学べる' },
  lang_de: { type: 'permit', id: 'lang_de', name: 'ドイツ語入門書', icon: '📗', price: 40, desc: 'ドイツ語を学べる' },
  lang_it: { type: 'permit', id: 'lang_it', name: 'イタリア語入門書', icon: '📗', price: 40, desc: 'イタリア語を学べる' },
  lang_nl: { type: 'permit', id: 'lang_nl', name: 'オランダ語入門書', icon: '📗', price: 45, desc: 'オランダ語を学べる' },
  lang_pl: { type: 'permit', id: 'lang_pl', name: 'ポーランド語入門書', icon: '📗', price: 50, desc: 'ポーランド語を学べる' },
  lang_el: { type: 'permit', id: 'lang_el', name: 'ギリシャ語入門書', icon: '📗', price: 50, desc: 'ギリシャ語を学べる' },
  lang_ru: { type: 'permit', id: 'lang_ru', name: 'ロシア語入門書', icon: '📗', price: 55, desc: 'ロシア語を学べる' },
  lang_ar: { type: 'permit', id: 'lang_ar', name: 'アラビア語入門書', icon: '📗', price: 55, desc: 'アラビア語を学べる' },
  lang_tr: { type: 'permit', id: 'lang_tr', name: 'トルコ語入門書', icon: '📗', price: 50, desc: 'トルコ語を学べる' },
  lang_hi: { type: 'permit', id: 'lang_hi', name: 'ヒンディー語入門書', icon: '📗', price: 55, desc: 'ヒンディー語を学べる' },
  lang_bn: { type: 'permit', id: 'lang_bn', name: 'ベンガル語入門書', icon: '📗', price: 60, desc: 'ベンガル語を学べる' },
  lang_ne: { type: 'permit', id: 'lang_ne', name: 'ネパール語入門書', icon: '📗', price: 60, desc: 'ネパール語を学べる' },
  lang_ta: { type: 'permit', id: 'lang_ta', name: 'タミル語入門書', icon: '📗', price: 60, desc: 'タミル語を学べる' },
  lang_si: { type: 'permit', id: 'lang_si', name: 'シンハラ語入門書', icon: '📗', price: 60, desc: 'シンハラ語を学べる' },
  lang_ur: { type: 'permit', id: 'lang_ur', name: 'ウルドゥー語入門書', icon: '📗', price: 60, desc: 'ウルドゥー語を学べる' },
  lang_zh: { type: 'permit', id: 'lang_zh', name: '中国語入門書', icon: '📗', price: 55, desc: '中国語を学べる' },
  lang_yue: { type: 'permit', id: 'lang_yue', name: '広東語入門書', icon: '📗', price: 60, desc: '広東語を学べる' },
  lang_ko: { type: 'permit', id: 'lang_ko', name: '韓国語入門書', icon: '📗', price: 55, desc: '韓国語を学べる' },
  lang_th: { type: 'permit', id: 'lang_th', name: 'タイ語入門書', icon: '📗', price: 60, desc: 'タイ語を学べる' },
  lang_vi: { type: 'permit', id: 'lang_vi', name: 'ベトナム語入門書', icon: '📗', price: 60, desc: 'ベトナム語を学べる' },
  lang_tl: { type: 'permit', id: 'lang_tl', name: 'タガログ語入門書', icon: '📗', price: 60, desc: 'タガログ語を学べる' },
  lang_id: { type: 'permit', id: 'lang_id', name: 'インドネシア語入門書', icon: '📗', price: 60, desc: 'インドネシア語を学べる' },
  lang_my: { type: 'permit', id: 'lang_my', name: 'ミャンマー語入門書', icon: '📗', price: 65, desc: 'ミャンマー語を学べる' },
};

Object.assign(ITEM_DB, LANGUAGE_PERMIT_ITEMS);

export const SHOP_ITEM_IDS = [
  'p_smart','p_world','p_desert','p_snow','p_ocean',
  ...Object.keys(LANGUAGE_PERMIT_ITEMS),
  'w2','w3','w4','a2','a3','a4','c1','c2','c3','c4','c5',
];

export const LEVEL_TABLE = [
  { lv: 1, exp: 0, hero: '🧙', name: 'みならいまほうつかい', hp: 20, mp: 5 },
  { lv: 2, exp: 80, hero: '🧙', name: 'まほうつかいのたまご', hp: 24, mp: 7 },
  { lv: 3, exp: 200, hero: '🧝', name: 'エルフのせんし', hp: 30, mp: 10 },
  { lv: 4, exp: 380, hero: '🧝', name: 'つよいエルフ', hp: 38, mp: 14 },
  { lv: 5, exp: 620, hero: '⚔️', name: 'けんしのたまご', hp: 48, mp: 18 },
  { lv: 6, exp: 920, hero: '⚔️', name: 'ことばのけんし', hp: 60, mp: 24 },
  { lv: 7, exp: 1300, hero: '🛡️', name: 'ことばのパラディン', hp: 75, mp: 30 },
  { lv: 8, exp: 1800, hero: '🧙‍♂️', name: 'だいまどうし', hp: 90, mp: 40 },
  { lv: 9, exp: 2500, hero: '🦸', name: 'ことばのヒーロー', hp: 110, mp: 52 },
  { lv: 10, exp: 3500, hero: '👑', name: 'ことばのおうさま', hp: 140, mp: 68 },
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
  { id: 'lv10', icon: '👑', name: '言語マスター', check: p => p.lv >= 10 },
  { id: 'gold100', icon: '💰', name: 'ゴールド100G', check: p => p.gold >= 100 },
];

// 問題の難易度階層（1=TOEIC300 〜 10=TOEIC990）。勇者のレベルと同じ1-10スケールで対応させている
export const TOEIC_TIERS = [
  { tier: 1,  toeic: 300 },
  { tier: 2,  toeic: 400 },
  { tier: 3,  toeic: 500 },
  { tier: 4,  toeic: 600 },
  { tier: 5,  toeic: 700 },
  { tier: 6,  toeic: 730 },
  { tier: 7,  toeic: 800 },
  { tier: 8,  toeic: 860 },
  { tier: 9,  toeic: 900 },
  { tier: 10, toeic: 990 },
];
export function toeicLabel(tier) {
  const row = TOEIC_TIERS.find(t => t.tier === tier);
  return row ? `TOEIC${row.toeic}` : '';
}

export const EXAM_LEVEL_SYSTEMS = {
  en: {
    name: 'TOEIC L&R',
    labels: ['TOEIC 300','TOEIC 400','TOEIC 500','TOEIC 600','TOEIC 700','TOEIC 730','TOEIC 800','TOEIC 860','TOEIC 900','TOEIC 990'],
  },
  ja: {
    name: 'JLPT',
    labels: ['JLPT N5 入門','JLPT N5 基礎','JLPT N4 基礎','JLPT N4 応用','JLPT N3 入門','JLPT N3 実用','JLPT N2 入門','JLPT N2 実用','JLPT N1 入門','JLPT N1 上級'],
  },
  zh: {
    name: 'HSK',
    labels: ['HSK 1','HSK 1-2','HSK 2','HSK 3','HSK 3-4','HSK 4','HSK 5','HSK 5','HSK 6','HSK 6+'],
  },
  ko: {
    name: 'TOPIK',
    labels: ['TOPIK I 1級','TOPIK I 1級','TOPIK I 2級','TOPIK I 2級','TOPIK II 3級','TOPIK II 4級','TOPIK II 4級','TOPIK II 5級','TOPIK II 6級','TOPIK II 6級+'],
  },
  fr: {
    name: 'DELF/DALF',
    labels: ['DELF A1','DELF A1','DELF A2','DELF A2','DELF B1','DELF B1','DELF B2','DELF B2','DALF C1','DALF C2'],
  },
  es: {
    name: 'DELE',
    labels: ['DELE A1','DELE A1','DELE A2','DELE A2','DELE B1','DELE B1','DELE B2','DELE B2','DELE C1','DELE C2'],
  },
  de: {
    name: 'Goethe',
    labels: ['A1','A1','A2','A2','B1','B1','B2','B2','C1','C2'],
  },
  it: {
    name: 'CILS/CELI',
    labels: ['A1','A1','A2','A2','B1','B1','B2','B2','C1','C2'],
  },
  pt: {
    name: 'CAPLE',
    labels: ['A1','A1','A2','A2','B1','B1','B2','B2','C1','C2'],
  },
  ru: {
    name: 'TORFL',
    labels: ['A1','A1','A2','A2','B1','B1','B2','B2','C1','C2'],
  },
  ar: {
    name: 'ALPT/CEFR',
    labels: ['A1','A1','A2','A2','B1','B1','B2','B2','C1','C2'],
  },
};

const CEFR_DEFAULT_LABELS = ['CEFR A1','CEFR A1','CEFR A2','CEFR A2','CEFR B1','CEFR B1','CEFR B2','CEFR B2','CEFR C1','CEFR C2'];

export function examLevelLabel(language, tier) {
  const lv = Math.max(1, Math.min(10, Number(tier) || 1));
  const system = EXAM_LEVEL_SYSTEMS[language];
  if (system) return system.labels[lv - 1] || `Lv.${lv}`;
  return CEFR_DEFAULT_LABELS[lv - 1] || `Lv.${lv}`;
}

export const EXP_BASE = { vocab: 10, grammar: 15, typing: 12, listening: 18, speaking: 20, weak: 25, boss: 35, phrase: 16, smart: 22, culture: 18 };
export const GOLD_BASE = { vocab: 2, grammar: 3, typing: 2, listening: 4, speaking: 5, weak: 6, boss: 10, phrase: 3, smart: 5, culture: 4 };

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

/* ══════════════════════════════════════════════════
   忘却曲線（エビングハウス）にもとづく定着度の推定
   R(t) = e^(-t/S)  … t=最終回答からの経過日数、S=記憶の安定度（日）
   Lv・EXPはゲームの累積実績として増える一方のまま保つが、
   「定着度」はこの式で時間経過とともに下がる別指標として扱う
══════════════════════════════════════════════════ */
// 安定度Sは正解回数が増えるほど指数的に伸び、誤答が多いほど割り引かれる簡易モデル
// （厳密な間隔反復アルゴリズムではなく、体感に合わせた近似値）
export function estimateStability(r) {
  if (!r || r.attempts === 0) return 0;
  const acc = r.correct / r.attempts;
  const n = r.correct;
  const stability = 1 * Math.pow(2, Math.max(0, n - 1)) * (0.4 + 0.6 * acc);
  return Math.min(stability, 60); // 上限60日
}

// 0〜1の定着度スコア。未学習・最終回答日時が不明な場合はnull
export function retentionScore(r, now = Date.now()) {
  if (!r || r.attempts === 0 || !r.lastAnsweredAt) return null;
  const stability = estimateStability(r);
  if (stability <= 0) return 0;
  const daysSince = Math.max(0, (now - r.lastAnsweredAt) / 86400000);
  return Math.exp(-daysSince / stability);
}
