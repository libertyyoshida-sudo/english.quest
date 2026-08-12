/* =====================================================
   LANGUAGE QUEST — app.js   完全版
   単語/文法/タイピング/リスニング/スピーキング
   EXP・レベル・称号・コンボ・敵撃破演出
===================================================== */
'use strict';

import {
  ITEM_DB, SHOP_ITEM_IDS, LEVEL_TABLE, TITLE_DEFS, EXP_BASE, GOLD_BASE,
  comboMult, getLvRow, getNextLvRow, toeicLabel, retentionScore,
} from './shared/gameData.js';
import {
  LANGUAGE_OPTIONS, LANGUAGE_PROFILES, PHRASE_CATEGORIES,
} from './shared/languageMeta.js';

/* ══════════════════════════════════════════════════
   0. バックエンドAPI（ログイン時のみ使用。未ログインはゲストモードでローカル動作）
══════════════════════════════════════════════════ */
const API_BASE = import.meta.env.DEV
  ? 'http://localhost:3001/api'
  : 'https://english-quest-26nu.onrender.com/api';
let authToken = localStorage.getItem('eigoDQ_token') || null;
let selectedLanguage = localStorage.getItem('languageQuest_language') || 'en';
let uiLang = localStorage.getItem('languageQuest_uiLang') || 'ja';
const questionDataCache = {};
const questionDataLoading = {};
let localQuestionDataLoading = null;
let localQuestionDataLoaded = false;
let VOCAB_DB = [];
let GRAMMAR_DB = [];
let MULTI_GRAMMAR_DB = {};
let MULTI_VOCAB_DB = {};
let PHRASE_DB = [];
let MULTI_PHRASE_DB = {};
let MULTI_CULTURE_DB = {};

async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `通信エラー (${res.status})`);
  return data;
}

// サーバーから受け取った PlayerProfile（アカウント全体で共有の項目）を P に反映
function applyProfile(profile) {
  P.gold          = profile.gold;
  P.maxCombo      = profile.maxCombo;
  P.hasPerfect    = profile.hasPerfect;
  P.totalAnswers  = profile.totalAnswers;
  P.totalCorrect  = profile.totalCorrect;
  P.listenCorrect = profile.listenCorrect;
  P.speakCorrect  = profile.speakCorrect;
  P.equipment.weapon = ITEM_DB[profile.equippedWeaponId] || ITEM_DB.w1;
  P.equipment.armor  = ITEM_DB[profile.equippedArmorId]  || ITEM_DB.a1;
  P.equipment.title  = profile.equippedTitleId ? (TITLE_DEFS.find(t => t.id === profile.equippedTitleId) || null) : null;
}

// サーバーから受け取った LanguageProfile（言語ごとのレベル/EXP/HP）を P.languages に反映
function applyLanguageProfile(language, lp) {
  const prev = P.languages[language];
  P.languages[language] = { totalExp: lp.totalExp, level: lp.level, currentHp: lp.currentHp, currentMp: prev?.currentMp };
}

function applyInventoryItems(items = []) {
  const owned = items
    .map(row => ITEM_DB[row.itemId])
    .filter(Boolean)
    .map(item => ({ ...item }));
  P.inventory = owned;
  if (!P.inventory.some(item => item.id === 'w1')) P.inventory.unshift({ ...ITEM_DB.w1 });
  if (!P.inventory.some(item => item.id === 'a1')) P.inventory.unshift({ ...ITEM_DB.a1 });
}

// 未初期化の言語は初回アクセス時にデフォルト値で作成して返す
function langState(code = selectedLanguage) {
  if (!P.languages[code]) {
    P.languages[code] = { totalExp: 0, level: 1, currentHp: getLvRow(0).hp, currentMp: getLvRow(0).mp };
  }
  return P.languages[code];
}

// ログイン直後・再開時にプロファイル全体（称号・回答統計・言語別レベルを含む）を取得して反映
async function loadFullProfile() {
  const data = await apiFetch('/player/profile');
  applyProfile(data.profile);
  applyInventoryItems(data.items || []);
  P.titles = new Set((data.titles || []).map(t => t.titleId));
  for (const k in answerStats) delete answerStats[k];
  Object.assign(answerStats, data.answerStats || {});
  for (const k in languageHistory) delete languageHistory[k];
  Object.assign(languageHistory, data.languageHistory || {});
  (data.languageProfiles || []).forEach(lp => applyLanguageProfile(lp.language, lp));
}

async function tryRestoreSession() {
  if (!authToken) return false;
  try {
    await loadFullProfile();
    return true;
  } catch (err) {
    authToken = null;
    localStorage.removeItem('eigoDQ_token');
    return false;
  }
}

async function handleAuthSuccess(token) {
  authToken = token;
  localStorage.setItem('eigoDQ_token', token);
  await loadFullProfile();
  $('logout-btn')?.classList.remove('hidden');
  goToField();
}

function logout() {
  authToken = null;
  localStorage.removeItem('eigoDQ_token');
  $('logout-btn')?.classList.add('hidden');
  location.reload();
}

function showLoginError(msg, type = 'error') {
  const el = $('login-error');
  if (el) {
    el.textContent = msg || '';
    el.classList.toggle('success', Boolean(msg) && type === 'success');
  }
}

// ログイン/登録中のローディング表示。Renderの無料プランはスリープからの復帰に
// 数十秒かかることがあるため、経過時間に応じてメッセージを切り替えて不安を減らす
let loginLoadingTimers = [];
function setLoginLoading(isLoading) {
  loginLoadingTimers.forEach(clearTimeout);
  loginLoadingTimers = [];

  const loadingEl = $('login-loading');
  const textEl = $('login-loading-text');
  const controls = [
    $('login-btn'), $('register-btn'), $('forgot-password-btn'), $('reset-password-btn'),
    $('reset-cancel-btn'), $('login-username'), $('login-email'), $('login-password'),
    $('reset-new-password'),
  ];

  controls.forEach(el => { if (el) el.disabled = isLoading; });

  if (isLoading) {
    loadingEl?.classList.remove('hidden');
    const messages = [
      { delay: 0,     text: tr('loading0') },
      { delay: 4000,  text: tr('loading1') },
      { delay: 12000, text: tr('loading2') },
      { delay: 30000, text: tr('loading3') },
    ];
    if (textEl) textEl.textContent = messages[0].text;
    messages.slice(1).forEach(({ delay, text }) => {
      loginLoadingTimers.push(setTimeout(() => { if (textEl) textEl.textContent = text; }, delay));
    });
  } else {
    loadingEl?.classList.add('hidden');
  }
}

/* ══════════════════════════════════════════════════
   1. Web Audio API で BGM・効果音生成
══════════════════════════════════════════════════ */
let audioCtx = null;
let bgmGainNode = null;
let currentBGM = null;
let bgmEnabled = true;

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (!bgmGainNode) {
    bgmGainNode = audioCtx.createGain();
    bgmGainNode.connect(audioCtx.destination);
  }
}

function toggleBGM() {
  bgmEnabled = !bgmEnabled;
  const btn = document.getElementById('bgm-toggle');
  if (btn) btn.textContent = bgmEnabled ? '🔔' : '🔕';
  if (bgmEnabled && currentBGM === null) playFieldBGM();
  else if (!bgmEnabled) stopBGM();
}

function stopBGM() {
  if (currentBGM) {
    currentBGM.stop();
    currentBGM = null;
  }
}

function playFieldBGM() {
  if (!bgmEnabled) return;
  initAudio();
  stopBGM();
  const melody = [523,587,659,698,784,698,659,587];
  currentBGM = loopMelody(melody, 0.15, 400);
}

function playBattleBGM() {
  if (!bgmEnabled) return;
  initAudio();
  stopBGM();
  const melody = [392,440,494,523,587,523,494,440];
  currentBGM = loopMelody(melody, 0.18, 300);
}

function loopMelody(notes, vol, interval) {
  let idx = 0;
  const play = () => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(bgmGainNode);
    osc.frequency.value = notes[idx % notes.length];
    osc.type = 'square';
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
    idx++;
  };
  const timer = setInterval(play, interval);
  return { stop: () => clearInterval(timer) };
}

function playSoundCorrect() {
  if (!bgmEnabled) return;
  initAudio();
  const freqs = [523,659,784,1047];
  freqs.forEach((f,i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = f;
    osc.type = 'sine';
    const t = audioCtx.currentTime + i*0.08;
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t+0.15);
    osc.start(t);
    osc.stop(t+0.2);
  });
}

function playSoundWrong() {
  if (!bgmEnabled) return;
  initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.value = 200;
  osc.type = 'sawtooth';
  gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+0.3);
  osc.start();
  osc.stop(audioCtx.currentTime+0.35);
}

function playSoundLevelUp() {
  if (!bgmEnabled) return;
  initAudio();
  const freqs = [523,659,784,1047,1319];
  freqs.forEach((f,i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = f;
    osc.type = 'triangle';
    const t = audioCtx.currentTime + i*0.12;
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t+0.25);
    osc.start(t);
    osc.stop(t+0.3);
  });
}

function playSoundItem() {
  if (!bgmEnabled) return;
  initAudio();
  const freqs = [1047,1319,1568];
  freqs.forEach((f,i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = f;
    osc.type = 'sine';
    const t = audioCtx.currentTime + i*0.06;
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t+0.2);
    osc.start(t);
    osc.stop(t+0.25);
  });
}

/* ══════════════════════════════════════════════════
   2〜3. アイテム・レベル・称号テーブルは shared/gameData.js に集約
══════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   4. プレイヤー状態
══════════════════════════════════════════════════ */
const P = {
  gold: 0,
  totalAnswers: 0, totalCorrect: 0,
  listenCorrect: 0, speakCorrect: 0,
  maxCombo: 0, hasPerfect: false,
  titles: new Set(),
  inventory: [],
  equipment: { weapon: ITEM_DB.w1, armor: ITEM_DB.a1, title: null },
  activeEffects: [],
  languages: {},  // 言語コード → {totalExp, level, currentHp}
};
const answerStats = {};  // id → {attempts, correct, lastAnsweredAt}
const languageHistory = {};  // 言語コード → {totalAnswers, totalCorrect}（サーバー集計、ログイン時のみ。にがて等の内訳はclassifyItem()でクライアント側集計）

function getRecord(id) {
  if (!answerStats[id]) answerStats[id] = { attempts:0, correct:0, lastAnsweredAt: null };
  return answerStats[id];
}
function recordStat(id, ok) {
  const r = getRecord(id);
  r.attempts++;
  if (ok) r.correct++;
  r.lastAnsweredAt = Date.now();
}

/* ══════════════════════════════════════════════════
   5. 敵データ
══════════════════════════════════════════════════ */
const ENEMIES = [
  { name:'モジぷるん',       sprite:'🔷', lv:1, expRate:1.0 },
  { name:'コトバット',       sprite:'🦇', lv:2, expRate:1.1 },
  { name:'ノートスニーカー', sprite:'🪽', lv:3, expRate:1.2 },
  { name:'ミミックエコー',   sprite:'👻', lv:4, expRate:1.3 },
  { name:'ブンセキ石像',     sprite:'🗿', lv:5, expRate:1.5 },
  { name:'アクセントホーク', sprite:'🪶', lv:6, expRate:1.7 },
  { name:'ミスリード番長',   sprite:'👺', lv:7, expRate:2.0 },
  { name:'シンタックス竜',   sprite:'🐲', lv:8, expRate:2.5 },
  { name:'ノイズ伯爵',       sprite:'😈', lv:9, expRate:3.0 },
  { name:'忘却のアーカイブ', sprite:'💀', lv:10,expRate:4.0 },
];

// 学習言語ごとに、その地域の神話・民話にちなんだ名前で敵を表示する（スプライト・強さはENEMIESを流用）
const REGION_ENEMY_NAMES = {
  en: ['ピクシー','レプラコーン','森の盗賊','ブラックドッグ','ゴブリンの頭領','バンシー','円卓の異端騎士','ワイバーン','グレンデル','湖上の魔女モルガン'],
  fr: ['ルタン(森の妖精)','ガーゴイル','人狼ルー・ガルー','黒衣の騎士','ノートルダムの怪物','ドラゴン・タラスク','鉄仮面の亡霊','ヴェルサイユの影武者','カタコンブの番人','ノルマンディーの竜'],
  es: ['エル・クコ','チュパカブラ','泣き女ラ・ヨローナ','闘牛の亡霊','山賊の頭目','コンキスタドールの亡霊','エル・ドラドの番人','アステカの戦士','アンデスのコンドル神','ケツァルコアトル'],
  pt: ['クリキ(森の精)','サシ・ペレレ','ボイタタ(火の蛇)','クルピラ(森の守護者)','幽霊船の船長','アマゾンの守護獣','ジャガーの戦士','ピンクドルフィンの精霊','大西洋の海竜','リオの謝肉祭の悪魔'],
  ru: ['ドモボイ(家の精)','森の主レーシー','化け物ヴィイ','バーバ・ヤーガ','氷の巨人モロース','双頭の鷲の化身','不死の魔王カスチェイ','熊の戦士','シベリアの雪女','竜ズメイ'],
  de: ['コボルト','水の精ネック','黒い森の狼男','ラインの黄金の番人','ニーベルングの小人','ローレライ','ヴァルプルギスの魔女','鉄の騎士','グリム童話の魔王','竜ファフニール'],
  ar: ['ジン(精霊)','グール(食屍鬼)','イフリート','砂漠のサソリ王','千夜一夜の盗賊','魔法のランプの守護者','空飛ぶ絨毯の賊','怪鳥ロック','バグダッドの魔術師','砂漠の大魔王'],
  tr: ['火の精アル','トルコ石の魔人','近衛兵長イェニチェリ','カッパドキアの洞窟竜','ボスポラスの人魚','バザールの盗賊王','大宰相の影','アナトリアの狼','イスタンブールの獅子像','オスマン帝国の亡霊皇帝'],
  th: ['精霊ピー','蛇神ナーガ','門番鬼ヤック','森の虎霊','魔王トッサカン','黄金の仏塔の番人','ムエタイの亡霊戦士','メコン川の竜','象の戦士','タイ王朝の守護竜'],
  zh: ['妖狐','山の妖怪シャンシャオ','龍の子','兵馬俑の戦士','白蛇の精','孫悟空の分身','麒麟','牛魔王','万里の長城の守護竜','玉皇大帝の使者'],
  yue: ['キョンシー','山海経の異獣','九龍城の影','茶楼の妖怪','龍舟の守護竜','獅子舞の精霊','ビクトリア港の海竜','武術家の幽霊','珠江の水神','香港島の大魔王'],
  ko: ['鬼神トッケビ','九尾狐クミホ','山神ホランイ','龍宮の使者','花郎の亡霊戦士','済州島の石の守護者','高麗の武士','朝鮮王朝の守護竜','白頭山の神霊','檀君の化身'],
  pl: ['森の精レシー','水の精ヴォドニク','竜ヴァヴェル','ポズナンの妖精','ポーランド騎士団','冬の魔女マルズァナ','タトラ山脈の巨人','ワルシャワの人魚','リトアニア大公の亡霊','ポーランドの黒騎士'],
  nl: ['小人カボウター','風車の番人','チューリップの精','デルフト焼きの人形','海の巨人','堤防の守護竜','幻の画家の亡霊','アムステルダムの海賊','黄金時代の提督','北海の大竜'],
  el: ['サテュロス','ケンタウロス','ハルピュイア','ミノタウロス','メデューサ','キマイラ','サイクロプス','ヒュドラ','タイタン','ゼウスの雷神'],
  tl: ['アスワン','小人ドゥエンデ','マナナンガル','馬人ティクバラン','巨人カプレ','月食の竜バコナワ','聖エルモの火','英雄の亡霊','七千の島の守護竜','バタラの化身'],
  id: ['クンティラナック','ポチョン','獅子の精霊バロン','コモドの竜神','ワヤン人形の影武者','ボロブドゥールの守護者','神鳥ガルーダ','ジャワの王の亡霊','スマトラの虎霊','インドラの使者'],
  it: ['ローマ軍団の亡霊兵','ベネチアの仮面の怪人','ポンペイの灰の亡霊','剣闘士の幽霊','トスカーナの狼男','堕天使の残影','錬金術師','シチリアの海竜','ヴェスヴィオの火竜','ローマ皇帝の亡霊'],
  vi: ['幽霊マー','竜神ロン','ホアンキエム湖の亀神','フエ王朝の武将幽霊','メコンデルタの精霊','山の神ソンティン','竹の妖精','戦象の亡霊','龍の子孫の戦士','ベトナムの竜王'],
  bn: ['妖鳥ションカチル','森の精ベヘトゥ','ベンガルタイガーの霊','ガンジス川の女神','古城の亡霊','スンダルバンスの守護獣','詩人の魂','ベンガルの竜','モンスーンの化身','ベンガル王朝の守護神'],
  my: ['精霊ナッ','守護獅子チンテー','イラワジ川の竜神','バガン遺跡の亡霊','タナカの精','ビルマの虎霊','黄金の仏塔の番人','シャン高原の魔女','マンダレー王の亡霊','ミャンマーの竜王'],
  si: ['悪霊ヤカー','蛇神ナーガ','シーギリヤの獅子像','キャンディ王朝の亡霊','象霊','紅茶畑の精','仏歯寺の守護者','インド洋の海竜','シンハラ王朝の守護獣','スリランカの竜王'],
  ta: ['精霊ヤクシー','守護神ムニーシュワラン','象神ガネーシャの使い','タミル王朝の武将幽霊','チョーラ朝の亡霊戦士','寺院の石像の守護者','ベンガル湾の海竜','タンジャーヴールの竜','ムルガン神の化身','タミルの竜王'],
  hi: ['羅刹ラークシャサ','夜叉ヤクシャ','蛇神ナーガ','ハヌマーンの化身','神鳥ガルーダ','タージマハルの守護霊','ヒマラヤの雪男','ガンジス川の女神','デリー王朝の亡霊皇帝','インドラの雷竜'],
  ne: ['雪豹の霊','雪男イエティ','エベレストの守護竜','寺院の石像','シェルパの亡霊案内人','女神クマリの化身','ポカラ湖の精霊','ゴルカ兵の亡霊戦士','ヒマラヤの雷鳥','ネパール王国の守護竜'],
};

// tier: 'all' か 1〜10。問題のティア（TOEICレベル）と同じ数値で敵の強さを決める
// langCode を指定すると、その言語・地域にちなんだ名前の敵になる（省略時は現在の学習言語）
function pickEnemy(tier, langCode = selectedLanguage) {
  const baseTier = tier === 'all' ? languageMasteryState(langCode).effectiveLv : tier;
  const spread = Math.floor(Math.random() * 3) - 1; // -1〜+1でばらつきを持たせる
  const idx = Math.min(9, Math.max(0, baseTier - 1 + spread));
  const base = ENEMIES[idx];
  return base;
}


/* ══════════════════════════════════════════════════
   6〜7. 単語・文法データは shared/questionData.js に集約
══════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════
   8. ユーティリティ
══════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const I18N = {
  ja: {
    appSub: 'ことばの冒険',
    appCopy: '言語習得への旅',
    usernamePh: 'なまえ / メールアドレス',
    emailPh: 'メールアドレス（とうろく・再設定に必要）',
    passwordPh: 'ひみつのコード（4文字以上）',
    newPasswordPh: '新しいひみつのコード（4文字以上）',
    login: 'つづきから',
    register: 'はじめから とうろく',
    forgot: 'ひみつのコードを忘れた',
    googleMissing: 'Googleログインは現在準備中です。',
    googleFailed: 'Googleログインに失敗しました。',
    resetPassword: '再設定する',
    cancel: 'もどる',
    guest: 'ゲストであそぶ（セーブされません）',
    or: '▼ または',
    backTown: '◀ まちへもどる',
    backTownShort: '◀ まちへ',
    backField: '◀ フィールドへもどる',
    backWorld: '◀ せかいマップへ',
    keepLearning: '🧠 学びを続ける',
    listenAgain: '🔊 もう一度きく',
    listenShort: '🔊 きく',
    speak: '🎤 はなす！',
    hintMagic: '💙 ヒント 3MP',
    cutMagic: '💙 へらす 5MP',
    healMagic: '💙 回復 4MP',
    next: '▶ つぎへ',
    goInn: '▶ 宿屋へ',
    retry: 'もう一度',
    retryIcon: '🔁 もういちど',
    field: 'フィールドへ',
    close: 'とじる',
    ok: 'よし！',
    stageSelect: '◀ ステージ選択へ',
    pcMode: 'PC配列',
    mobileMode: 'スマホ入力',
    learningLanguage: '学習言語',
    difficulty: '難易度',
    questionCount: '問題数',
    searchLanguage: '言語を検索',
    command: '▶ コマンド',
    countSuffix: '問',
    noLanguage: '該当する言語がありません',
    shopUnlock: 'Shopで解放',
    owned: '所持済み',
    buy: '買う',
    equip: 'そうびする',
    use: 'つかう',
    loginRequired: 'なまえ/メールアドレスとひみつのコードを入力してください',
    registerRequired: 'なまえ、メールアドレス、ひみつのコードを入力してください',
    passwordShort: 'ひみつのコードは4文字以上にしてください',
    emailInvalid: 'メールアドレスの形式を確認してください',
    resetRequired: 'なまえ、登録メールアドレス、新しいひみつのコードを入力してください',
    resetDone: 'ひみつのコードを再設定しました。新しいコードでログインしてください。',
    loading0: '🔮 つうしんちゅう…',
    loading1: '⏳ サーバーがねむっているようです…おこしています',
    loading2: '🌙 はじめてのアクセスは めざめに1分ほどかかることがあります。もう少しお待ちください…',
    loading3: 'もうすぐです！このままお待ちください…',
    fieldMessage: lang => `どこへ　むかうか？　${lang.label}をマスターすると、その国でエンディングが見られる！`,
    typingPh: lang => `${lang.label}でうってね（Enterでかいとう）`,
    kbTypingPh: lang => `${lang.label}でうってね`,
    lockedLanguage: lang => `${lang?.label || 'この言語'}はまだ学べません。Shopで入門書を購入してください。`,
    commandLock: req => `${req.label}が必要です。Shopで購入できます。`,
    commandLabels: {
      vocab: ['たんごバトル', '+10EXP'],
      grammar: ['まほうぶんぽう', '+15EXP'],
      typing: ['タイピング修行', '+12EXP'],
      listening: ['リスニング訓練', '+18EXP'],
      speaking: ['スピーキング道場', '+20EXP'],
      smart: ['スマート学習', '効率学習'],
      weak: ['よわてき集中', '+25EXP'],
      phrase: ['フレーズ練習', '+16EXP'],
      culture: ['文化・地理クイズ', '+18EXP'],
      review: ['まなびの図書館', 'よみ返し'],
      inn: ['やどや', 'HP回復'],
      keyboard: ['キーボードどうじょう', 'タイピング基礎'],
      shop: ['Shop', 'Goldで購入'],
      world: ['まちの外へ（せかいマップ）', 'ランダムせんとう'],
    },
    filterLabels: {
      all: 'すべて',
      vocab: 'たんご',
      grammar: 'ぶんぽう',
      phrase: '💬 フレーズ',
      culture: '🏛️ 文化',
      new: '🆕 未学習',
      low: '📖 練習不足',
      weak: '🔥 にがて',
      mastered: '✅ マスター',
    },
  },
  en: {
    appSub: 'Word Adventure',
    appCopy: 'Your language mastery journey',
    usernamePh: 'Name or email',
    emailPh: 'Email for signup and password reset',
    passwordPh: 'Password (4+ characters)',
    newPasswordPh: 'New password (4+ characters)',
    login: 'Continue',
    register: 'Create account',
    forgot: 'Forgot password?',
    googleMissing: 'Google sign-in is not configured yet.',
    googleFailed: 'Google sign-in failed.',
    resetPassword: 'Reset password',
    cancel: 'Back',
    guest: 'Play as guest (not saved)',
    or: '▼ or',
    backTown: '◀ Back to town',
    backTownShort: '◀ Town',
    backField: '◀ Back to field',
    backWorld: '◀ World map',
    keepLearning: '🧠 Keep learning',
    listenAgain: '🔊 Listen again',
    listenShort: '🔊 Listen',
    speak: '🎤 Speak',
    hintMagic: '💙 Hint 3MP',
    cutMagic: '💙 Reduce 5MP',
    healMagic: '💙 Heal 4MP',
    next: '▶ Next',
    goInn: '▶ Inn',
    retry: 'Try again',
    retryIcon: '🔁 Try again',
    field: 'Field',
    close: 'Close',
    ok: 'OK',
    stageSelect: '◀ Stage select',
    pcMode: 'PC layout',
    mobileMode: 'Mobile input',
    learningLanguage: 'Learning language',
    difficulty: 'Difficulty',
    questionCount: 'Questions',
    searchLanguage: 'Search languages',
    command: '▶ Commands',
    countSuffix: ' questions',
    noLanguage: 'No matching language',
    shopUnlock: 'Unlock in Shop',
    owned: 'Owned',
    buy: 'Buy',
    equip: 'Equip',
    use: 'Use',
    loginRequired: 'Enter your name/email and password.',
    registerRequired: 'Enter your name, email, and password.',
    passwordShort: 'Password must be at least 4 characters.',
    emailInvalid: 'Check the email address format.',
    resetRequired: 'Enter your name, registered email, and new password.',
    resetDone: 'Password reset. Log in with your new password.',
    loading0: '🔮 Connecting...',
    loading1: '⏳ The server may be waking up...',
    loading2: '🌙 First access can take about a minute. Please wait a little longer...',
    loading3: 'Almost there. Please keep this page open...',
    fieldMessage: lang => `Where will you go? Master ${lang.label} to see that country ending.`,
    typingPh: lang => `Type in ${lang.label} (Enter to answer)`,
    kbTypingPh: lang => `Type in ${lang.label}`,
    lockedLanguage: lang => `${lang?.label || 'This language'} is locked. Buy its starter book in the Shop.`,
    commandLock: req => `${req.label} is required. You can buy it in the Shop.`,
    commandLabels: {
      vocab: ['Vocabulary Battle', '+10EXP'],
      grammar: ['Grammar Magic', '+15EXP'],
      typing: ['Typing Training', '+12EXP'],
      listening: ['Listening Drill', '+18EXP'],
      speaking: ['Speaking Dojo', '+20EXP'],
      smart: ['Smart Learning', 'Efficient'],
      weak: ['Weak Spot Focus', '+25EXP'],
      phrase: ['Phrase Practice', '+16EXP'],
      culture: ['Culture & Geography', '+18EXP'],
      review: ['Learning Library', 'Review'],
      inn: ['Inn', 'Recover HP'],
      keyboard: ['Keyboard Dojo', 'Typing basics'],
      shop: ['Shop', 'Spend Gold'],
      world: ['Outside Town (World Map)', 'Random battle'],
    },
    filterLabels: {
      all: 'All',
      vocab: 'Words',
      grammar: 'Grammar',
      phrase: '💬 Phrases',
      culture: '🏛️ Culture',
      new: '🆕 New',
      low: '📖 Needs practice',
      weak: '🔥 Weak spots',
      mastered: '✅ Mastered',
    },
  },
};

function tr(key, ...args) {
  const value = I18N[uiLang]?.[key] ?? I18N.ja[key] ?? key;
  return typeof value === 'function' ? value(...args) : value;
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function setPlaceholder(id, text) {
  const el = $(id);
  if (el) el.placeholder = text;
}

function setUiLanguage(lang) {
  uiLang = lang === 'en' ? 'en' : 'ja';
  localStorage.setItem('languageQuest_uiLang', uiLang);
  applyUiLanguage();
  refreshLanguageText();
  renderGoogleButton();
}

function applyUiLanguage() {
  document.documentElement.lang = uiLang === 'en' ? 'en' : 'ja';
  document.querySelectorAll('.ui-lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === `ui-lang-${uiLang}`);
  });
  const titleSubs = document.querySelectorAll('.title-logo-sub');
  if (titleSubs[0]) titleSubs[0].textContent = tr('appSub');
  setText('title-language-copy', tr('appCopy'));
  setPlaceholder('login-username', tr('usernamePh'));
  setPlaceholder('login-email', tr('emailPh'));
  setPlaceholder('login-password', tr('passwordPh'));
  setPlaceholder('reset-new-password', tr('newPasswordPh'));
  setPlaceholder('language-search', tr('searchLanguage'));
  setText('login-btn', tr('login'));
  setText('register-btn', tr('register'));
  setText('forgot-password-btn', tr('forgot'));
  setText('reset-password-btn', tr('resetPassword'));
  setText('reset-cancel-btn', tr('cancel'));
  setText('title-start', tr('guest'));
  const orText = document.querySelector('.title-copy');
  if (orText) orText.textContent = tr('or');
  setText('shop-back-btn', tr('backTown'));
  setText('status-back-btn', tr('backTown'));
  setText('keyboard-back-btn', tr('backTownShort'));
  setText('inn-flee-btn', tr('backTownShort'));
  setText('world-back-btn', tr('backTown'));
  setText('battle-flee-btn', tr('backField'));
  setText('ending-keep-learning-btn', tr('keepLearning'));
  setText('ending-world-btn', tr('backWorld'));
  setText('listen-play-btn', tr('listenAgain'));
  setText('question-speak-btn', tr('listenShort'));
  setText('speak-btn', tr('speak'));
  setText('magic-hint-btn', tr('hintMagic'));
  setText('magic-cut-btn', tr('cutMagic'));
  setText('magic-heal-btn', tr('healMagic'));
  setText('next-btn', tr('next'));
  setText('retry-btn', tr('retry'));
  setText('field-btn', tr('field'));
  setText('item-drop-close', tr('close'));
  setText('lu-close', tr('close'));
  setText('ti-close', tr('ok'));
  setText('kb-mode-pc', tr('pcMode'));
  setText('kb-mode-mobile', tr('mobileMode'));
  setText('kb-retry-btn', tr('retryIcon'));
  setText('kb-back-to-stages-btn', tr('stageSelect'));
  const commandTitle = $('command-page-btn')?.querySelector('span:first-child');
  if (commandTitle) commandTitle.textContent = tr('command');
  const labels = document.querySelectorAll('.setting-row-item .dq-label');
  if (labels[0]) labels[0].textContent = tr('learningLanguage');
  if (labels[1]) labels[1].textContent = tr('difficulty');
  if (labels[2]) labels[2].textContent = tr('questionCount');
  updateCommandButtonLabels();
  updateFilterButtonLabels();
  refreshCountOptions();
  const note = $('google-login-note');
  if (note && !note.classList.contains('hidden') && !note.dataset.configured) {
    note.textContent = tr('googleMissing');
  }
}

function updateCommandButtonLabels() {
  document.querySelectorAll('.dq-cmd-btn').forEach(btn => {
    const labels = tr('commandLabels');
    const pair = labels?.[btn.dataset.mode];
    if (!pair) return;
    const icon = btn.querySelector('.cmd-icon')?.textContent || '';
    btn.innerHTML = `<span class="cmd-icon">${icon}</span> ${pair[0]}<span class="cmd-exp">${pair[1]}</span>`;
  });
}

function refreshCountOptions() {
  const select = $('count-select');
  if (!select) return;
  const value = select.value || '5';
  [3, 5, 10].forEach(count => {
    const opt = select.querySelector(`option[value="${count}"]`);
    if (opt) opt.textContent = uiLang === 'en' ? `${count}${tr('countSuffix')}` : `${count}${tr('countSuffix')}`;
  });
  select.value = value;
}

function updateFilterButtonLabels() {
  const labels = tr('filterLabels');
  document.querySelectorAll('.inn-filter-btn').forEach(btn => {
    const label = labels?.[btn.dataset.filter];
    if (label) btn.textContent = label;
  });
}

let googleClientId = null;
let googleButtonRenderedFor = '';
let googleScriptWaits = 0;

async function initGoogleLogin() {
  const wrap = $('google-login-wrap');
  const note = $('google-login-note');
  try {
    const config = await apiFetch('/auth/config');
    googleClientId = config.googleClientId || null;
  } catch (err) {
    googleClientId = null;
  }

  if (!googleClientId) {
    wrap?.classList.add('hidden');
    if (note) {
      note.dataset.configured = '';
      note.textContent = tr('googleMissing');
      note.classList.remove('hidden');
    }
    return;
  }

  if (note) {
    note.dataset.configured = 'true';
    note.classList.add('hidden');
  }
  wrap?.classList.remove('hidden');
  renderGoogleButton();
}

function renderGoogleButton() {
  const buttonEl = $('google-signin-button');
  if (!buttonEl || !googleClientId) return;
  if (!window.google?.accounts?.id) {
    if (googleScriptWaits < 40) {
      googleScriptWaits++;
      setTimeout(renderGoogleButton, 250);
    }
    return;
  }
  googleScriptWaits = 0;
  const renderKey = `${googleClientId}:${uiLang}`;
  if (googleButtonRenderedFor === renderKey) return;
  googleButtonRenderedFor = renderKey;
  buttonEl.innerHTML = '';
  window.google.accounts.id.initialize({
    client_id: googleClientId,
    callback: handleGoogleCredential,
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  window.google.accounts.id.renderButton(buttonEl, {
    theme: 'filled_blue',
    size: 'large',
    type: 'standard',
    text: 'signin_with',
    shape: 'rectangular',
    logo_alignment: 'left',
    locale: uiLang === 'en' ? 'en' : 'ja',
    width: 280,
  });
}

async function handleGoogleCredential(response) {
  if (!response?.credential) {
    showLoginError(tr('googleFailed'));
    return;
  }
  showLoginError('');
  setLoginLoading(true);
  try {
    const data = await apiFetch('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential: response.credential }),
    });
    await handleAuthSuccess(data.token);
  } catch (err) {
    showLoginError(err.message || tr('googleFailed'));
  } finally {
    setLoginLoading(false);
  }
}

const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
};

function currentLanguage() {
  return LANGUAGE_OPTIONS.find(lang => lang.code === selectedLanguage) || LANGUAGE_OPTIONS[0];
}

function levelRowByLv(lv) {
  return LEVEL_TABLE.find(row => row.lv === lv) || LEVEL_TABLE[0];
}

const FREE_LANGUAGE_CODES = ['ja', 'en'];
const FREE_COMMAND_MODES = ['vocab', 'grammar', 'typing', 'keyboard', 'inn', 'review', 'shop', 'status'];
const MASTER_LEVEL = 10;
const MASTER_RETENTION_THRESHOLD = 85;
const MASTER_COVERAGE_THRESHOLD = 70;
const COMMAND_REQUIREMENTS = {
  smart: { itemId: 'p_smart', label: 'スマート学習免許' },
  weak: { itemId: 'p_smart', label: 'スマート学習免許' },
  phrase: { itemId: 'p_smart', label: 'スマート学習免許' },
  culture: { itemId: 'p_smart', label: 'スマート学習免許' },
  listening: { itemId: 'p_smart', label: 'スマート学習免許' },
  speaking: { itemId: 'p_smart', label: 'スマート学習免許' },
  world: { itemId: 'p_world', label: '世界地図通行証' },
};
const LANGUAGE_ENTRY_REQUIREMENTS = {
  ar: 'p_desert', tr: 'p_desert', hi: 'p_desert', bn: 'p_desert', ne: 'p_desert', ta: 'p_desert', si: 'p_desert',
  ru: 'p_snow', pl: 'p_snow',
  yue: 'p_ocean', tl: 'p_ocean', id: 'p_ocean', my: 'p_ocean', vi: 'p_ocean',
};

function hasItem(itemId) {
  return P.inventory.some(item => item.id === itemId);
}

function languagePermitId(code) {
  return `lang_${code}`;
}

function isLanguageUnlocked(code) {
  return FREE_LANGUAGE_CODES.includes(code) || hasItem(languagePermitId(code));
}

function canUseCommand(mode) {
  if (FREE_COMMAND_MODES.includes(mode)) return true;
  const req = COMMAND_REQUIREMENTS[mode];
  return !req || hasItem(req.itemId);
}

function commandLockMessage(mode) {
  const req = COMMAND_REQUIREMENTS[mode];
  return req ? tr('commandLock', req) : '';
}

function canEnterLanguageArea(code) {
  const req = LANGUAGE_ENTRY_REQUIREMENTS[code];
  return !req || hasItem(req);
}

function currentVocabDB() {
  return questionDataCache[selectedLanguage]?.vocab
    || (selectedLanguage === 'en' ? VOCAB_DB : (MULTI_VOCAB_DB[selectedLanguage] || VOCAB_DB));
}

function currentGrammarDB() {
  return questionDataCache[selectedLanguage]?.grammar
    || (selectedLanguage === 'en' ? GRAMMAR_DB : (MULTI_GRAMMAR_DB[selectedLanguage] || []));
}

function currentPhraseDB() {
  return questionDataCache[selectedLanguage]?.phrase
    || (selectedLanguage === 'en' ? PHRASE_DB : (MULTI_PHRASE_DB[selectedLanguage] || PHRASE_DB));
}

// 文化・名産品・歴史クイズ（せかいマップの地域ゾーン探索で出題）
function currentCultureDB() {
  return questionDataCache[selectedLanguage]?.culture || MULTI_CULTURE_DB[selectedLanguage] || [];
}

async function ensureLocalQuestionData() {
  if (localQuestionDataLoaded) return;
  if (!localQuestionDataLoading) {
    localQuestionDataLoading = import('./shared/questionData.js').then(module => {
      VOCAB_DB = module.VOCAB_DB || [];
      GRAMMAR_DB = module.GRAMMAR_DB || [];
      MULTI_GRAMMAR_DB = module.MULTI_GRAMMAR_DB || {};
      MULTI_VOCAB_DB = module.MULTI_VOCAB_DB || {};
      PHRASE_DB = module.PHRASE_DB || [];
      MULTI_PHRASE_DB = module.MULTI_PHRASE_DB || {};
      MULTI_CULTURE_DB = module.MULTI_CULTURE_DB || {};
      localQuestionDataLoaded = true;
    });
  }
  return localQuestionDataLoading;
}

function cacheLocalQuestionData(language) {
  questionDataCache[language] = {
    vocab: language === 'en' ? VOCAB_DB : (MULTI_VOCAB_DB[language] || VOCAB_DB),
    grammar: language === 'en' ? GRAMMAR_DB : (MULTI_GRAMMAR_DB[language] || []),
    phrase: language === 'en' ? PHRASE_DB : (MULTI_PHRASE_DB[language] || PHRASE_DB),
    culture: MULTI_CULTURE_DB[language] || [],
  };
}

function cacheQuestionData(language, questions) {
  questionDataCache[language] = {
    vocab: questions.filter(q => q.category === 'vocab'),
    grammar: questions.filter(q => q.category === 'grammar'),
    phrase: questions.filter(q => q.category === 'phrase'),
    culture: questions.filter(q => q.category === 'culture'),
  };
}

async function ensureLanguageQuestionData(language = selectedLanguage) {
  if (questionDataCache[language]) return questionDataCache[language];
  if (questionDataLoading[language]) return questionDataLoading[language];

  questionDataLoading[language] = apiFetch(`/questions?language=${encodeURIComponent(language)}&count=all`)
    .then(questions => {
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('empty question dataset');
      }
      cacheQuestionData(language, questions);
      return questionDataCache[language];
    })
    .catch(err => {
      console.warn('DB問題データの取得に失敗したため、ローカルデータを使用します。', err);
      return ensureLocalQuestionData().then(() => {
        cacheLocalQuestionData(language);
        return questionDataCache[language];
      });
    })
    .finally(() => {
      delete questionDataLoading[language];
    });

  return questionDataLoading[language];
}

function languageWordLabel() {
  return currentLanguage().label;
}

function wordWithPron(item) {
  return item.pron && selectedLanguage !== 'en' ? `${item.word}（${item.pron}）` : item.word;
}

function difficultyLabel(lv) {
  return selectedLanguage === 'en' ? toeicLabel(lv) : `Lv.${lv}`;
}

// やどやの言語紹介カードは既定で折りたたみ、開閉状態はセッション中は維持する
let languageProfileExpanded = false;

function renderLanguageProfile() {
  const el = $('language-profile');
  if (!el) return;
  const lang = currentLanguage();
  const profile = LANGUAGE_PROFILES[lang.code];
  if (!profile) {
    el.innerHTML = '';
    return;
  }
  const mastery = languageMasteryState(lang.code);
  const retText = mastery.retentionPercent === null ? '未計測' : `${mastery.retentionPercent}%`;
  el.innerHTML = `
    <button type="button" class="language-profile-toggle">
      <span class="language-profile-title">📚 ${lang.label}（${lang.native}） 現在Lv.${mastery.effectiveLv}${mastery.mastered ? ' 👑 マスター' : ''}</span>
      <span class="language-profile-toggle-icon">${languageProfileExpanded ? '▲ 閉じる' : '▼ くわしく'}</span>
    </button>
    <div class="language-profile-detail${languageProfileExpanded ? '' : ' hidden'}">
      <div class="language-profile-grid">
        <div>
          <span class="language-profile-label">使われる国・地域</span>
          <p>${profile.countries}</p>
        </div>
        <div>
          <span class="language-profile-label">話者数</span>
          <p>${profile.speakers}</p>
        </div>
      </div>
      <p class="language-profile-note">現在レベルは忘却曲線と追加問題の習得状況で変動します。定着度: ${retText} / カバー率: ${mastery.coveragePercent}%</p>
      <p class="language-profile-note">${profile.note}</p>
    </div>
  `;
  el.querySelector('.language-profile-toggle')?.addEventListener('click', () => {
    languageProfileExpanded = !languageProfileExpanded;
    renderLanguageProfile();
  });
}

function populateLanguageSelect() {
  const select = $('language-select');
  if (!select) return;
  const search = $('language-search');
  const query = search?.value.trim().toLowerCase() || '';
  select.innerHTML = '';
  const languages = LANGUAGE_OPTIONS.filter(lang => {
    if (!query) return true;
    return [lang.code, lang.label, lang.native, lang.status, ...(lang.aliases || [])]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(query));
  });

  languages.forEach(lang => {
    const opt = document.createElement('option');
    opt.value = lang.code;
    const locked = !isLanguageUnlocked(lang.code);
    opt.textContent = `${locked ? '🔒 ' : ''}${lang.label}（${lang.native}）${lang.status ? ` - ${lang.status}` : ''}${locked ? ` - ${tr('shopUnlock')}` : ''}`;
    select.appendChild(opt);
  });
  if (languages.some(lang => lang.code === selectedLanguage)) {
    select.value = selectedLanguage;
  } else if (languages.length > 0) {
    select.value = languages[0].code;
  } else {
    const opt = document.createElement('option');
    opt.value = selectedLanguage;
    opt.textContent = tr('noLanguage');
    opt.disabled = true;
    select.appendChild(opt);
  }
}

function refreshLanguageText() {
  const lang = currentLanguage();
  if ($('title-language-copy')) $('title-language-copy').textContent = tr('appCopy');
  if ($('field-msg-text')) {
    $('field-msg-text').textContent = tr('fieldMessage', lang);
  }
  if ($('typing-input')) $('typing-input').placeholder = tr('typingPh', lang);
  refreshLevelOptions();
  refreshCommandLocks();
  applyUiLanguage();
}

function refreshLevelOptions() {
  const select = $('level-select');
  if (!select) return;
  const options = [
    ['auto', 'Auto (matches hero level)', 'おまかせ（ゆうしゃレベルに連動）'],
    ['1', 'Lv.1（TOEIC300）', 'Lv.1（入門）'],
    ['2', 'Lv.2（TOEIC400）', 'Lv.2（基礎）'],
    ['3', 'Lv.3（TOEIC500）', 'Lv.3（初級）'],
    ['4', 'Lv.4（TOEIC600）', 'Lv.4（初中級）'],
    ['5', 'Lv.5（TOEIC700）', 'Lv.5（中級）'],
    ['6', 'Lv.6（TOEIC730）', 'Lv.6（中上級）'],
    ['7', 'Lv.7（TOEIC800）', 'Lv.7（上級）'],
    ['8', 'Lv.8（TOEIC860）', 'Lv.8（実践）'],
    ['9', 'Lv.9（TOEIC900）', 'Lv.9（熟練）'],
    ['10', 'Lv.10（TOEIC990）', 'Lv.10（達人）'],
    ['all', 'All levels (random)', 'ぜんぶ（ランダム混合）'],
  ];
  const currentValue = select.value || 'auto';
  select.innerHTML = '';
  options.forEach(([value, enText, otherText]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = uiLang === 'en' ? enText : otherText;
    select.appendChild(opt);
  });
  select.value = currentValue;
}

function setLanguage(code) {
  selectedLanguage = LANGUAGE_OPTIONS.some(lang => lang.code === code) ? code : 'en';
  localStorage.setItem('languageQuest_language', selectedLanguage);
  refreshLanguageText();
  populateLanguageSelect();
  refreshHeader();
  refreshExpBar();
  refreshCommandLocks();
}

function refreshCommandLocks() {
  document.querySelectorAll('.dq-cmd-btn').forEach(btn => {
    const mode = btn.dataset.mode;
    const locked = !canUseCommand(mode);
    btn.classList.toggle('cmd-locked', locked);
    btn.title = locked ? commandLockMessage(mode) : '';
  });
}

// level-select の値（'auto' | 'all' | '1'〜'10'）を実際のティア（'all' か 1〜10の数値）に解決する
// 'auto' は勇者の現在レベルに連動させる（敵の強さ・問題レベルが自動で上がる）
function resolveLevelSelection(rawValue) {
  if (rawValue === 'all') return 'all';
  if (rawValue === 'auto') return languageMasteryState().effectiveLv;
  return parseInt(rawValue, 10);
}

function filterLevel(pool, level) {
  if (level === 'all') return pool;
  return pool.filter(x => x.lv === level);
}

function expandPoolForCount(pool, level, count) {
  const filtered = filterLevel(pool, level);
  if (level === 'all' || filtered.length >= count) return filtered;
  const seen = new Set(filtered.map(item => item.id));
  const nearby = [...pool]
    .filter(item => !seen.has(item.id))
    .sort((a, b) => Math.abs(a.lv - level) - Math.abs(b.lv - level));
  return [...filtered, ...nearby];
}

// 弱点重み付きシャッフル
function weightedPool(pool) {
  return shuffle(pool.flatMap(item => {
    const r = answerStats[item.id];
    if (!r || r.attempts === 0) return [item, item];
    const acc = r.correct / r.attempts;
    if (acc < 0.5) return [item,item,item,item];
    if (acc < 0.7) return [item,item];
    return [item];
  }));
}

// 科学的な学習分類：未学習→練習不足→にがて→ふつう→マスター済み の5段階
// （新しい項目を優先し、複数回の正解を経てはじめて「習得」とみなす間隔反復の考え方にもとづく）
function classifyItem(item) {
  const r = answerStats[item.id];
  if (!r || r.attempts === 0) return 'new';
  if (r.attempts < 3) return 'low';
  const rawAcc = r.correct / r.attempts;
  // 忘却曲線による定着度で正答率を割り引く。前回学習から時間が経つほど「マスター済み」から外れやすくなる
  const decay = retentionScore(r) ?? 1;
  const acc = rawAcc * decay;
  if (acc < 0.6) return 'weak';
  if (acc >= 0.85) return 'mastered';
  return 'mid';
}

// 表示用：0〜100の定着度（%）。未学習はnull
function retentionPct(item) {
  const r = answerStats[item.id];
  const score = retentionScore(r);
  return score === null ? null : Math.round(score * 100);
}

// 言語全体の総合定着度（%）：学習済み項目の定着度スコアの平均。学習済み項目が無ければnull
function languageRetention(code) {
  const pool = [...vocabDBFor(code), ...grammarDBFor(code), ...phraseDBFor(code), ...cultureDBFor(code)];
  const scores = pool
    .map(it => retentionScore(answerStats[it.id]))
    .filter(s => s !== null);
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100);
}

function languageProgressCounts(code) {
  const pool = [...vocabDBFor(code), ...grammarDBFor(code), ...phraseDBFor(code), ...cultureDBFor(code)];
  const counts = { new: 0, low: 0, weak: 0, mid: 0, mastered: 0, total: pool.length };
  pool.forEach(it => { counts[classifyItem(it)]++; });
  return counts;
}

function masteryCoveragePct(code) {
  const counts = languageProgressCounts(code);
  if (counts.total === 0) return 0;
  return Math.round(counts.mastered / counts.total * 100);
}

function decayPenaltyFromRetention(retentionPercent) {
  if (retentionPercent === null) return 0;
  if (retentionPercent >= MASTER_RETENTION_THRESHOLD) return 0;
  if (retentionPercent >= 70) return 1;
  if (retentionPercent >= 50) return 2;
  if (retentionPercent >= 30) return 3;
  return 4;
}

function decayPenaltyFromCoverage(coveragePercent) {
  if (coveragePercent >= MASTER_COVERAGE_THRESHOLD) return 0;
  if (coveragePercent >= 50) return 1;
  if (coveragePercent >= 30) return 2;
  if (coveragePercent >= 15) return 3;
  return 4;
}

function languageMasteryState(code = selectedLanguage) {
  const lp = langState(code);
  const reachedRow = getLvRow(lp.totalExp);
  const retentionPercent = languageRetention(code);
  const coveragePercent = masteryCoveragePct(code);
  const penalty = Math.max(
    decayPenaltyFromRetention(retentionPercent),
    decayPenaltyFromCoverage(coveragePercent),
  );
  const effectiveLv = Math.max(1, reachedRow.lv - penalty);
  const effectiveRow = levelRowByLv(effectiveLv);
  const mastered = reachedRow.lv >= MASTER_LEVEL
    && effectiveLv >= MASTER_LEVEL
    && retentionPercent !== null
    && retentionPercent >= MASTER_RETENTION_THRESHOLD
    && coveragePercent >= MASTER_COVERAGE_THRESHOLD;

  return { reachedRow, effectiveRow, effectiveLv, retentionPercent, coveragePercent, mastered };
}

function weakItems(pool) {
  return pool.filter(item => classifyItem(item) === 'weak');
}

// スマート学習：未学習・練習不足・にがてな項目を優先的に出題する重み付きシャッフル
// （マスター済みの項目もごく低頻度で混ぜ、間隔反復による定着を図る）
function smartPool(pool) {
  return shuffle(pool.flatMap(item => {
    switch (classifyItem(item)) {
      case 'new':      return [item,item,item,item,item];
      case 'low':      return [item,item,item,item];
      case 'weak':     return [item,item,item];
      case 'mid':      return [item,item];
      default:         return [item];
    }
  }));
}

// 言語コードを指定して単語/文法/フレーズDBを取得（ステータス画面で選択中以外の言語も集計するため、
// currentXxxDB() と違い selectedLanguage やサーバーキャッシュに依存しない）
function vocabDBFor(code) {
  return questionDataCache[code]?.vocab || (code === 'en' ? VOCAB_DB : (MULTI_VOCAB_DB[code] || VOCAB_DB));
}
function grammarDBFor(code) {
  return questionDataCache[code]?.grammar || (code === 'en' ? GRAMMAR_DB : (MULTI_GRAMMAR_DB[code] || []));
}
function phraseDBFor(code) {
  return questionDataCache[code]?.phrase || (code === 'en' ? PHRASE_DB : (MULTI_PHRASE_DB[code] || PHRASE_DB));
}
function cultureDBFor(code) {
  return questionDataCache[code]?.culture || MULTI_CULTURE_DB[code] || [];
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
}

/* ══════════════════════════════════════════════════
   9. EXP・ゴールド・レベルアップ（EXP_BASE等は shared/gameData.js）
══════════════════════════════════════════════════ */
function gainExp(mode, combo) {
  const base    = EXP_BASE[mode] || 10;
  const combMul = comboMult(combo);
  // 武器EXP倍率
  const weapMul = P.equipment.weapon ? P.equipment.weapon.expMult : 1.0;
  // 消耗品 expBoost
  let consumMul = 1.0;
  const expEff = P.activeEffects.find(e => e.effect === 'expBoost');
  if (expEff) consumMul = expEff.value;
  const gained  = Math.round(base * combMul * weapMul * consumMul);
  const lang    = langState();
  const prevRow = getLvRow(lang.totalExp);
  lang.totalExp += gained;
  const newRow  = getLvRow(lang.totalExp);
  lang.level     = newRow.lv;
  if (newRow.lv > prevRow.lv) {
    setTimeout(() => triggerLevelUp(newRow), 500);
    playSoundLevelUp();
  }
  refreshExpBar();
  refreshHeader();
  return gained;
}

function gainGold(mode, combo) {
  const armorMul = P.equipment.armor ? P.equipment.armor.goldMult : 1.0;
  const gained = Math.round((GOLD_BASE[mode]||2) * comboMult(combo) * armorMul);
  P.gold += gained;
  return gained;
}

function triggerLevelUp(row) {
  langState().currentHp = row.hp;
  langState().currentMp = row.mp;
  const next = getNextLvRow(row.lv);
  updateHeroSprite('lu-hero', row);
  $('lu-lv').textContent   = `Lv. ${row.lv}`;
  $('lu-name').textContent = row.name;
  $('lu-stats').textContent =
    `ちから　あがった！\nHP ${row.hp}  MP ${row.mp}`;
  $('levelup-overlay').classList.remove('hidden');
  spawnEffects(['✨','⭐','🌟','💥'], 16);
}

/* ══════════════════════════════════════════════════
   10. UI更新
══════════════════════════════════════════════════ */
function refreshExpBar() {
  const row  = getLvRow(langState().totalExp);
  const next = getNextLvRow(row.lv);
  const cur  = langState().totalExp - row.exp;
  const need = next ? next.exp - row.exp : 9999;
  const pct  = next ? Math.min(100, Math.round(cur/need*100)) : 100;
  const fill = $('exp-fill');
  const text = $('exp-text');
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = next ? `${cur}/${need}` : 'MAX';
}

// レベル（見た目のベース絵文字）に、装備中の武器・防具・称号のアイコンを重ねて
// キャラクターの見た目を合成する。ヘッダー・フィールド・せかいマップ・レベルアップ・
// リザルトの全ての勇者スプライトで共通利用する
function updateHeroSprite(elId, row) {
  const el = $(elId);
  if (!el) return;
  const { weapon, armor, title } = P.equipment;
  el.innerHTML =
    `<span class="hero-sprite-base">${row.hero}</span>` +
    (title  ? `<span class="hero-sprite-badge hero-sprite-title" title="${title.name}">${title.icon}</span>` : '') +
    (weapon ? `<span class="hero-sprite-badge hero-sprite-weapon" title="${weapon.name}">${weapon.icon}</span>` : '') +
    (armor  ? `<span class="hero-sprite-badge hero-sprite-armor" title="${armor.name}">${armor.icon}</span>` : '');
}

function refreshHeader() {
  const lang = langState();
  const { reachedRow, effectiveRow, effectiveLv, mastered } = languageMasteryState();
  const row = effectiveRow;
  const maxHp = row.hp;
  const maxMp = row.mp;
  if (lang.currentHp === undefined || lang.currentHp > maxHp) {
    lang.currentHp = maxHp;
  }
  if (lang.currentMp === undefined || lang.currentMp > maxMp) {
    lang.currentMp = maxMp;
  }
  updateHeroSprite('hdr-hero', row);
  updateHeroSprite('field-hero', row);
  updateHeroSprite('world-hero', row);
  if ($('hdr-lv'))    $('hdr-lv').textContent    = effectiveLv;
  if ($('hdr-title')) $('hdr-title').textContent = mastered ? `${row.name}・マスター` : (reachedRow.lv > effectiveLv ? `${row.name}（復習中）` : row.name);
  if ($('hdr-hp'))    $('hdr-hp').textContent    = `${lang.currentHp}/${maxHp}`;
  if ($('hdr-mp'))    $('hdr-mp').textContent    = `${lang.currentMp}/${maxMp}`;
  if ($('hdr-gold'))  $('hdr-gold').textContent  = P.gold;
}

function refreshField() {
  let total=0, correct=0;
  Object.values(answerStats).forEach(r => { total+=r.attempts; correct+=r.correct; });
  if ($('st-answers')) $('st-answers').textContent = total;
  if ($('st-correct')) $('st-correct').textContent = correct;
  if ($('st-rate'))    $('st-rate').textContent    = total>0 ? Math.round(correct/total*100)+'%' : '―';
  if ($('st-gold'))    $('st-gold').textContent    = P.gold;
  document.querySelectorAll('#field-canvas .field-icon').forEach(icon => {
    const mode = icon.dataset.mode;
    const locked = mode && !canUseCommand(mode);
    icon.classList.toggle('field-icon-locked', locked);
    const label = icon.querySelector('.field-icon-label');
    if (label && locked && !label.textContent.startsWith('🔒')) label.textContent = `🔒 ${label.textContent}`;
    if (label && !locked) label.textContent = label.textContent.replace(/^🔒\s*/, '');
  });
  refreshCommandLocks();
  renderTitleBadges();
}

function renderTitleBadges() {
  const container = $('title-badges');
  if (!container) return;
  if (P.titles.size === 0) {
    container.innerHTML = '<span class="no-badge-msg">まだ称号をかくとくしていない</span>';
    return;
  }
  container.innerHTML = '';
  for (const tid of P.titles) {
    const def = TITLE_DEFS.find(t => t.id === tid);
    if (!def) continue;
    const equipped = P.equipment.title?.id === tid;
    const chip = document.createElement('span');
    chip.className   = 'badge-chip' + (equipped ? ' badge-equipped' : '');
    chip.title        = 'タップして見た目に反映（もう一度タップで解除）';
    chip.textContent = `${def.icon} ${def.name}`;
    if (equipped) chip.insertAdjacentHTML('beforeend', '<span class="badge-equipped-mark">✓装備中</span>');
    chip.addEventListener('click', () => equipTitle(tid));
    container.appendChild(chip);
  }
}

// 称号タップで見た目に反映／もう一度タップで解除
async function equipTitle(titleId) {
  const alreadyEquipped = P.equipment.title?.id === titleId;
  const newId = alreadyEquipped ? null : titleId;
  P.equipment.title = newId ? TITLE_DEFS.find(t => t.id === newId) || null : null;
  renderTitleBadges();
  refreshHeader();
  if (authToken) {
    try {
      await apiFetch('/player/equip', { method: 'POST', body: JSON.stringify({ type: 'title', itemId: newId }) });
    } catch (err) {
      console.error('称号の同期に失敗しました:', err);
    }
  }
}

/* ══════════════════════════════════════════════════
   11. 称号チェック
══════════════════════════════════════════════════ */
function checkTitles() {
  const snapshot = { ...P, lv: langState().level };
  for (const def of TITLE_DEFS) {
    if (!P.titles.has(def.id) && def.check(snapshot)) {
      setTimeout(() => showUnlockedTitle(def), 800);
      break;
    }
  }
}

// サーバー応答／ローカル判定のどちらからも呼ばれる称号獲得演出
function showUnlockedTitle(def) {
  if (P.titles.has(def.id)) return;
  P.titles.add(def.id);
  $('ti-icon').textContent = def.icon;
  $('ti-name').textContent = def.name;
  $('ti-desc').textContent = def.id;
  $('title-overlay').classList.remove('hidden');
  renderTitleBadges();
}

/* ══════════════════════════════════════════════════
   12. エフェクト
══════════════════════════════════════════════════ */
function spawnEffects(emojis, count) {
  const layer = $('effect-layer');
  if (!layer) return;
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className   = 'effect-particle';
      p.textContent = emojis[Math.floor(Math.random()*emojis.length)];
      p.style.left  = `${5 + Math.random()*90}%`;
      p.style.top   = `${20 + Math.random()*60}%`;
      p.style.animationDelay = `${Math.random()*0.3}s`;
      p.style.animationDuration = `${0.8 + Math.random()*0.5}s`;
      layer.appendChild(p);
      setTimeout(() => p.remove(), 1500);
    }, i * 50);
  }
}

/* ══════════════════════════════════════════════════
   13. 問題生成
══════════════════════════════════════════════════ */
function buildVocabQ(item, pool) {
  const dummies = shuffle(pool.filter(p=>p.id!==item.id)).slice(0,3).map(p=>p.jp);
  const all = shuffle([item.jp, ...dummies]);
  return {
    id: item.id, type:'vocab',
    qText: `「 ${wordWithPron(item)} 」の いみは？`,
    choices: all, ans: all.indexOf(item.jp),
    detail: item.ex ? `例: ${item.ex}` : `正解: ${item.word}（${item.jp}）`,
    speakWord: item.word,
  };
}

function buildPhraseQ(item, pool) {
  const dummies = shuffle(pool.filter(p=>p.id!==item.id)).slice(0,3).map(p=>p.jp);
  const all = shuffle([item.jp, ...dummies]);
  const situationLabel = PHRASE_CATEGORIES.find(c => c.code === item.situation)?.label || '';
  const phraseText = item.pron ? `${item.phrase}（${item.pron}）` : item.phrase;
  return {
    id: item.id, type:'phrase',
    qText: `${situationLabel ? `【${situationLabel}】` : ''}「${phraseText}」の いみは？`,
    choices: all, ans: all.indexOf(item.jp),
    detail: `正解: ${phraseText} = ${item.jp}`,
    speakWord: item.phrase,
  };
}

function buildGrammarQ(item) {
  return {
    id: item.id, type:'grammar',
    qText: item.q,
    choices: item.choices, ans: item.ans,
    detail: `解説: ${item.exp}`,
  };
}

function buildCultureQ(item) {
  return {
    id: item.id, type:'culture',
    qText: item.q,
    choices: item.choices, ans: item.ans,
    detail: `解説: ${item.exp}`,
  };
}

function buildTypingQ(item) {
  return {
    id: item.id, type:'typing',
    qText: `「${item.jp}」を ${languageWordLabel()}で うとう！`,
    ans: item.word.toLowerCase(),
    detail: item.ex ? `例: ${item.ex}` : `正解: ${item.word}`,
    speakWord: item.word,
  };
}

// リスニング用（読み上げて聞き取り4択）
function buildListeningQ(item, pool) {
  const dummies = shuffle(pool.filter(p=>p.id!==item.id)).slice(0,3).map(p=>p.word);
  const all = shuffle([item.word, ...dummies]);
  return {
    id: item.id, type:'listening',
    qText: `🔊 きこえた ${languageWordLabel()}の ことばは どれ？`,
    speakWord: item.word,
    choices: all, ans: all.indexOf(item.word),
    detail: `正解: ${wordWithPron(item)}（${item.jp}）`,
  };
}

// スピーキング用（日本語を見て学習中の言語を発音）
function buildSpeakingQ(item) {
  return {
    id: item.id, type:'speaking',
    qText: `次の ${languageWordLabel()}を はつおんしよう`,
    speakWord: item.word,
    targetText: wordWithPron(item),
    ans: item.word.toLowerCase(),
    detail: `正解: ${wordWithPron(item)}（${item.jp}）`,
  };
}

function buildQuestions(mode, level, count) {
  const vocabDB = currentVocabDB();
  const grammarDB = currentGrammarDB();
  const activeVPool = expandPoolForCount(vocabDB, level, count);
  const activeGPool = expandPoolForCount(grammarDB, level, count);
  let questions = [];

  if (mode === 'vocab') {
    const pool = weightedPool(activeVPool);
    const seen = new Set();
    for (const item of pool) {
      if (!seen.has(item.id)) { seen.add(item.id); questions.push(buildVocabQ(item, activeVPool)); }
      if (questions.length >= count) break;
    }
  } else if (mode === 'grammar') {
    if (activeGPool.length) {
      const pool = weightedPool(activeGPool);
      const seen = new Set();
      for (const item of pool) {
        if (!seen.has(item.id)) { seen.add(item.id); questions.push(buildGrammarQ(item)); }
        if (questions.length >= count) break;
      }
    } else {
      return buildQuestions('vocab', level, count);
    }
  } else if (mode === 'typing') {
    const pool = weightedPool(activeVPool);
    const seen = new Set();
    for (const item of pool) {
      if (!seen.has(item.id)) { seen.add(item.id); questions.push(buildTypingQ(item)); }
      if (questions.length >= count) break;
    }
  } else if (mode === 'listening') {
    const pool = weightedPool(activeVPool);
    const seen = new Set();
    for (const item of pool) {
      if (!seen.has(item.id)) { seen.add(item.id); questions.push(buildListeningQ(item, activeVPool)); }
      if (questions.length >= count) break;
    }
  } else if (mode === 'speaking') {
    const pool = weightedPool(activeVPool);
    const seen = new Set();
    for (const item of pool) {
      if (!seen.has(item.id)) { seen.add(item.id); questions.push(buildSpeakingQ(item)); }
      if (questions.length >= count) break;
    }
  } else if (mode === 'phrase') {
    const phraseDB = currentPhraseDB();
    const activePPool = expandPoolForCount(phraseDB, level, count);
    const pool = weightedPool(activePPool);
    const seen = new Set();
    for (const item of pool) {
      if (!seen.has(item.id)) { seen.add(item.id); questions.push(buildPhraseQ(item, activePPool)); }
      if (questions.length >= count) break;
    }
  } else if (mode === 'culture') {
    const cultureDB = currentCultureDB();
    const activeCPool = expandPoolForCount(cultureDB, level, count);
    const pool = weightedPool(activeCPool);
    const seen = new Set();
    for (const item of pool) {
      if (!seen.has(item.id)) { seen.add(item.id); questions.push(buildCultureQ(item)); }
      if (questions.length >= count) break;
    }
  } else if (mode === 'weak') {
    const allPool = [...vocabDB, ...grammarDB];
    const activeFiltered = expandPoolForCount(allPool, level, count);
    let weak = weakItems(activeFiltered);
    if (weak.length < count) {
      const extra = shuffle(activeFiltered.filter(i => !answerStats[i.id]?.attempts));
      weak = [...weak, ...extra];
    }
    const seen = new Set();
    for (const item of weak) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      if (item.choices) questions.push(buildGrammarQ(item));
      else questions.push(buildVocabQ(item, activeVPool));
      if (questions.length >= count) break;
    }
  } else if (mode === 'smart') {
    const phraseDB = currentPhraseDB();
    const cultureDB = currentCultureDB();
    const allPool = [...vocabDB, ...grammarDB, ...phraseDB, ...cultureDB];
    const activeFiltered = expandPoolForCount(allPool, level, count);
    const pool = smartPool(activeFiltered);
    const cultureIds = new Set(cultureDB.map(c => c.id));
    const seen = new Set();
    for (const item of pool) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      if (item.situation) questions.push(buildPhraseQ(item, phraseDB));
      else if (cultureIds.has(item.id)) questions.push(buildCultureQ(item));
      else if (item.choices) questions.push(buildGrammarQ(item));
      else questions.push(buildVocabQ(item, activeVPool));
      if (questions.length >= count) break;
    }
  }
  return questions;
}

/* ══════════════════════════════════════════════════
   14. 音声合成（リスニング用）
══════════════════════════════════════════════════ */
let pendingSpeechTimeouts = [];
let cachedSpeechVoices = [];
function scheduleSpeech(fn, delay) {
  const id = setTimeout(() => {
    pendingSpeechTimeouts = pendingSpeechTimeouts.filter(t => t !== id);
    fn();
  }, delay);
  pendingSpeechTimeouts.push(id);
  return id;
}
function clearPendingSpeech() {
  pendingSpeechTimeouts.forEach(id => clearTimeout(id));
  pendingSpeechTimeouts = [];
}

function refreshSpeechVoices() {
  if (!window.speechSynthesis) return [];
  cachedSpeechVoices = window.speechSynthesis.getVoices?.() || [];
  return cachedSpeechVoices;
}

function pickSpeechVoice(langCode = selectedLanguage) {
  if (!window.speechSynthesis) return null;
  const lang = LANGUAGE_OPTIONS.find(l => l.code === langCode) || currentLanguage();
  const voices = cachedSpeechVoices.length ? cachedSpeechVoices : refreshSpeechVoices();
  const wanted = (lang.speechLang || '').toLowerCase();
  const base = wanted.split('-')[0];
  return voices.find(v => v.lang?.toLowerCase() === wanted)
    || voices.find(v => v.lang?.toLowerCase().startsWith(`${base}-`))
    || null;
}

function speechFallbackText(text) {
  const vocab = currentVocabDB().find(item => item.word === text);
  if (vocab?.pron && vocab.pron !== vocab.word) return vocab.pron;
  const phrase = currentPhraseDB().find(item => item.phrase === text);
  if (phrase?.pron && phrase.pron !== phrase.phrase) return phrase.pron;
  return text;
}

function speak(text, onEnd) {
  if (!window.speechSynthesis) { if (onEnd) onEnd(); return; }
  window.speechSynthesis.cancel();
  const voice = pickSpeechVoice();
  const fallback = !voice && selectedLanguage !== 'en';
  const utter = new SpeechSynthesisUtterance(fallback ? speechFallbackText(text) : text);
  utter.lang  = fallback ? 'en-US' : currentLanguage().speechLang;
  if (voice) utter.voice = voice;
  utter.rate  = 0.85;
  utter.pitch = 1.0;
  if (onEnd) utter.onend = onEnd;
  // 少し遅らせて確実に再生
  scheduleSpeech(() => {
    if (!cachedSpeechVoices.length) refreshSpeechVoices();
    window.speechSynthesis.speak(utter);
  }, 120);
}

/* ══════════════════════════════════════════════════
   15. 音声認識（スピーキング用）
══════════════════════════════════════════════════ */
let recognition = null;

function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang        = currentLanguage().speechLang;
  r.interimResults = false;
  r.maxAlternatives = 3;
  return r;
}

function startSpeaking(targetWord, onResult) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    onResult(null, '⚠ このブラウザは音声認識に対応していません。\nChrome を使ってください。');
    return;
  }
  if (recognition) { try { recognition.abort(); } catch(e){} }
  recognition = initRecognition();
  recognition.onstart  = () => {
    $('speak-status').textContent = '🎤 はなしてください...';
    $('speak-btn').disabled = true;
  };
  recognition.onresult = e => {
    const alts = Array.from(e.results[0]).map(r => r.transcript.trim().toLowerCase());
    const target = targetWord.toLowerCase();
    const ok = alts.some(a => {
      // 完全一致 or 前方一致（1文字違いは許容）
      if (a === target) return true;
      if (a.startsWith(target) || target.startsWith(a)) return true;
      return levenshtein(a, target) <= 1;
    });
    onResult(ok, alts[0]);
  };
  recognition.onerror  = e => {
    $('speak-status').textContent = '';
    $('speak-btn').disabled = false;
    if (e.error === 'no-speech') onResult(null, '(きこえなかった…もう一度！)');
    else onResult(null, `エラー: ${e.error}`);
  };
  recognition.onend = () => {
    $('speak-status').textContent = '';
    $('speak-btn').disabled = false;
  };
  recognition.start();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1}, (_,i) => Array.from({length:n+1}, (_,j) => i===0?j:j===0?i:0));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++) {
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  }
  return dp[m][n];
}

/* ══════════════════════════════════════════════════
   16. バトル状態
══════════════════════════════════════════════════ */
let battle = {
  mode: '', questions: [], cur: 0,
  correct: 0, wrongItems: [],
  combo: 0, expGained: 0, goldGained: 0,
  answered: false, enemy: null,
  defeated: false,
};

/* ══════════════════════════════════════════════════
   17. バトル開始 & レンダリング
══════════════════════════════════════════════════ */
async function startBattle(mode) {
  await ensureLanguageQuestionData();
  const level = resolveLevelSelection($('level-select').value);
  const count = parseInt($('count-select').value, 10);
  const qs    = buildQuestions(mode, level, count);

  if (qs.length === 0) {
    alert('このレベルでは出題できる問題がありません。\nレベルや弱点問題を増やしてください。');
    return;
  }

  const enemy = pickEnemy(level);

  // 消耗品を消費（バトル開始時）
  const activeEffectsThisBattle = [...P.activeEffects];
  P.activeEffects = [];

  battle = {
    mode, questions: qs, cur: 0,
    correct: 0, wrongItems: [],
    combo: 0, expGained: 0, goldGained: 0,
    answered: false, enemy,
    activeEffects: activeEffectsThisBattle,
    comboShield: activeEffectsThisBattle.some(e => e.effect === 'comboShield'),
    comboShieldUsed: false,
    choiceCutUsed: false,
    defeated: false,
  };

  setupBattleScreenUI(enemy);
  showScreen('screen-battle');
  renderQuestion();
}

function setupBattleScreenUI(enemy) {
  playBattleBGM();
  $('enemy-sprite').textContent   = enemy.sprite;
  $('enemy-sprite').className     = 'enemy-sprite';
  $('enemy-name').textContent     = enemy.name;
  $('enemy-lv').textContent       = `Lv.${enemy.lv}`;
  $('enemy-hp-bar').style.width   = '100%';
}

// やどやの「とっくん」ボタンから、にがてな1問だけを集中して練習する
function startFocusedBattle(item) {
  stopSpeechAll();
  const mode = item.category === 'grammar' ? 'grammar'
             : item.category === 'phrase'  ? 'phrase'
             : item.category === 'culture' ? 'culture'
             : 'vocab';
  const q     = item.category === 'grammar' ? buildGrammarQ(item)
              : item.category === 'phrase'  ? buildPhraseQ(item, currentPhraseDB())
              : item.category === 'culture' ? buildCultureQ(item)
              : buildVocabQ(item, currentVocabDB());
  const enemy = pickEnemy(item.lv);

  battle = {
    mode, questions: [q], cur: 0,
    correct: 0, wrongItems: [],
    combo: 0, expGained: 0, goldGained: 0,
    answered: false, enemy,
    activeEffects: [], comboShield: false, comboShieldUsed: false, choiceCutUsed: false, defeated: false,
  };

  setupBattleScreenUI(enemy);
  showScreen('screen-battle');
  renderQuestion();
}

function renderQuestion() {
  const q     = battle.questions[battle.cur];
  const total = battle.questions.length;

  // 進捗
  $('b-current').textContent = battle.cur + 1;
  $('b-total').textContent   = total;
  $('b-progress-fill').style.width = `${((battle.cur+1)/total)*100}%`;
  $('combo-text').textContent = battle.combo >= 3 ? `🔥 ${battle.combo}コンボ！` : '';

  // 問題文
  $('question-text').textContent = q.qText;

  // 全ラップを隠す
  $('choices-wrap').classList.add('hidden');
  $('typing-wrap').classList.add('hidden');
  $('listening-wrap').classList.add('hidden');
  $('speaking-wrap').classList.add('hidden');
  $('battle-msg').classList.add('hidden');
  if ($('battle-magic-note')) $('battle-magic-note').textContent = '';
  if ($('next-btn')) $('next-btn').textContent = tr('next');

  if (q.type === 'typing') {
    $('typing-wrap').classList.remove('hidden');
    $('typing-input').value = '';
    setTimeout(() => $('typing-input').focus(), 100);

  } else if (q.type === 'listening') {
    $('choices-wrap').classList.remove('hidden');
    $('listening-wrap').classList.remove('hidden');
    renderChoices(q);
    applyQueuedChoiceCut();
    // 自動再生
    scheduleSpeech(() => speak(q.speakWord), 400);

  } else if (q.type === 'speaking') {
    $('speaking-wrap').classList.remove('hidden');
    $('speaking-target').textContent = q.speakWord;
    $('speak-status').textContent    = '';
    $('speak-result').textContent    = '';
    $('speak-btn').disabled          = false;
    // 手本を読み上げ
    scheduleSpeech(() => speak(q.speakWord), 400);

  } else {
    // vocab / grammar / weak / phrase(4択)
    $('choices-wrap').classList.remove('hidden');
    renderChoices(q);
    applyQueuedChoiceCut();
  }

  // 単語・フレーズ・タイピングは手動読み上げボタンを表示（正解を声で確認したいときに使う）
  const speakBtn = $('question-speak-btn');
  if (speakBtn) {
    speakBtn.classList.toggle('hidden', !q.speakWord);
  }

  battle.answered = false;
}

function renderChoices(q) {
  const btns = document.querySelectorAll('.dq-choice');
  btns.forEach((btn, i) => {
    const txt = q.choices?.[i];
    btn.textContent = txt !== undefined ? txt : '';
    btn.className   = 'dq-choice';
    btn.disabled    = false;
    btn.style.display = txt !== undefined ? '' : 'none';
  });
}

/* ══════════════════════════════════════════════════
   18. 回答処理
══════════════════════════════════════════════════ */
// ゲストモード（未ログイン）専用：ローカルのみでEXP/GOLD/HPを計算
function localAnswerUpdate(q, ok) {
  P.totalAnswers++;
  let expGot = 0, goldGot = 0, damage = 0, defeated = false;

  if (ok) {
    P.totalCorrect++;
    battle.combo++;
    if (battle.combo > P.maxCombo) P.maxCombo = battle.combo;
    if (q.type === 'listening') P.listenCorrect++;
    if (q.type === 'speaking')  P.speakCorrect++;
    expGot  = gainExp(battle.mode, battle.combo);
    goldGot = gainGold(battle.mode, battle.combo);
  } else {
    if (battle.comboShield && !battle.comboShieldUsed) {
      battle.comboShieldUsed = true;
    } else {
      battle.combo = 0;
    }
    const lang = langState();
    const maxHp = maxHpForCurrentLanguage();
    damage = Math.max(5, Math.round(maxHp * 0.2));
    if (lang.currentHp === undefined) lang.currentHp = maxHp;
    lang.currentHp = Math.max(0, lang.currentHp - damage);
    if (lang.currentHp <= 0) {
      defeated = true;
      P.gold = Math.floor(P.gold / 2);
      lang.currentHp = maxHp;
      lang.currentMp = maxMpForCurrentLanguage();
    }
    refreshHeader();
  }

  setTimeout(checkTitles, 600);
  return { expGot, goldGot, damage, defeated };
}

async function handleAnswer(userAns, userText) {
  if (battle.answered) return;
  battle.answered = true;

  const q  = battle.questions[battle.cur];
  let ok   = false;

  if (q.type === 'typing') {
    ok = (userAns || '').trim().toLowerCase() === q.ans.toLowerCase();
  } else if (q.type === 'speaking') {
    // speaking は startSpeaking コールバックから ok/null が来る
    ok = userAns === true;
  } else {
    ok = userAns === q.ans;
  }

  // 統計更新（弱点重み付けなどの出題ロジック用ローカルキャッシュ）
  recordStat(q.id, ok);
  if (ok) {
    battle.correct++;
    playSoundCorrect();
  } else {
    playSoundWrong();
    battle.wrongItems.push({
      question: q.qText,
      correct:  q.type === 'typing' || q.type === 'speaking'
                  ? q.ans
                  : q.choices[q.ans],
      yours:    q.type === 'typing'
                  ? (userAns || '（未入力）')
                  : q.type === 'speaking'
                    ? (userText || '（みとめられなかった）')
                    : (q.choices?.[userAns] ?? '？'),
    });
  }

  // EXP・GOLD・HP・コンボはログイン時サーバー権威、ゲスト時ローカル計算
  let expGot = 0, goldGot = 0, damage = 0, defeated = false;
  if (authToken) {
    try {
      const answerPayload = q.type === 'typing' ? (userAns || '')
        : q.type === 'speaking' ? (userText || '')
        : String(q.choices?.[userAns] ?? '');
      const result = await apiFetch('/battle/answer', {
        method: 'POST',
        body: JSON.stringify({ questionId: q.id, isCorrect: ok, mode: battle.mode, userAnswer: answerPayload, language: selectedLanguage }),
      });
      applyProfile(result.profile);
      applyLanguageProfile(selectedLanguage, result.languageProfile);
      battle.combo = result.combo;
      expGot  = result.expGain;
      goldGot = result.goldGain;
      damage  = -result.hpChange;
      defeated = !!result.defeated;
      refreshHeader();
      refreshExpBar();
      if (result.leveledUp) {
        setTimeout(() => triggerLevelUp(getLvRow(langState().totalExp)), 500);
        playSoundLevelUp();
      }
      if (result.unlockedTitles?.length) {
        setTimeout(() => showUnlockedTitle(result.unlockedTitles[0]), 800);
      }
    } catch (err) {
      console.error('サーバーとの通信に失敗しました。ローカル計算にフォールバックします:', err);
      ({ expGot, goldGot, damage, defeated } = localAnswerUpdate(q, ok));
    }
  } else {
    ({ expGot, goldGot, damage, defeated } = localAnswerUpdate(q, ok));
  }

  battle.expGained  += expGot;
  battle.goldGained += goldGot;

  // 選択肢の色付け
  if (q.type !== 'typing' && q.type !== 'speaking') {
    document.querySelectorAll('.dq-choice').forEach((btn, i) => {
      btn.disabled = true;
      if (i === q.ans)                    btn.classList.add('correct');
      else if (i === userAns && !ok)      btn.classList.add('wrong');
    });
  }

  // 敵HPバーを削る
  const hpPct = Math.max(0, 100 - Math.round((battle.cur+1)/battle.questions.length*100));
  $('enemy-hp-bar').style.width = hpPct + '%';
  if (ok) {
    const sprite = $('enemy-sprite');
    sprite.classList.remove('damage');
    void sprite.offsetWidth;
    sprite.classList.add('damage');
    setTimeout(() => sprite.classList.remove('damage'), 500);
    spawnEffects(['💥','⚔️','✨'], 6);
  }

  // バトルメッセージ
  let msg = '';
  if (ok) {
    const combos = battle.combo >= 10 ? '🌪️ 10コンボ！！！伝説！！'
                 : battle.combo >= 5  ? '⚡ 5コンボ！！すごい！'
                 : battle.combo >= 3  ? '🔥 コンボ継続！'
                 : '';
    msg = `${q.type==='speaking' ? '🎤 うまく はっわできた！' : '⚔️ せいかい！　モンスターにダメージ！'}${combos ? '\n' + combos : ''}`;
  } else {
    const row = languageMasteryState().effectiveRow;
    msg = `💀 まちがい… プレイヤーに ${damage} ダメージ！ (HP:${langState().currentHp}/${row.hp})\nせいかいは「${q.type==='typing'||q.type==='speaking' ? q.ans : q.choices[q.ans]}」`;
    if (defeated) {
      battle.defeated = true;
      msg += '\nHPが0になった… Goldが半分になり、宿屋へ運ばれた。';
      if ($('next-btn')) $('next-btn').textContent = tr('goInn');
    }
  }

  $('battle-msg-text').innerHTML  = msg.replace(/\n/g,'<br>');
  $('battle-exp-gain').textContent = ok
    ? `EXP +${expGot}　GOLD +${goldGot}` + (comboMult(battle.combo)>1 ? `　(×${comboMult(battle.combo)} コンボボーナス!)` : '')
    : q.detail;
  $('battle-msg').classList.remove('hidden');

  // 敵撃破演出
  if (hpPct <= 0) {
    setTimeout(() => {
      const s = $('enemy-sprite');
      s.classList.add('defeat');
    }, 300);
  }
}

/* ══════════════════════════════════════════════════
   19. 次の問題 / リザルト
══════════════════════════════════════════════════ */
function nextQuestion() {
  if (battle.defeated) {
    goToInn({ charge: false });
    return;
  }
  battle.cur++;
  if (battle.cur >= battle.questions.length) {
    showResult();
  } else {
    renderQuestion();
  }
}

// バトル終了をサーバーに通知（全問正解フラグの反映・称号判定）。ゲスト時は呼ばれない
async function finishBattleOnServer(isPerfect) {
  try {
    const result = await apiFetch('/battle/finish', {
      method: 'POST',
      body: JSON.stringify({ isPerfect }),
    });
    applyProfile(result.profile);
    refreshField();
    if (result.unlockedTitles?.length) {
      setTimeout(() => showUnlockedTitle(result.unlockedTitles[0]), 500);
    }
  } catch (err) {
    console.error('バトル終了処理のサーバー同期に失敗しました:', err);
  }
}

function showResult() {
  const total   = battle.questions.length;
  const correct = battle.correct;
  const rate    = total > 0 ? Math.round(correct/total*100) : 0;
  const isPerfect = rate === 100;

  if (authToken) {
    finishBattleOnServer(isPerfect);
  } else {
    if (isPerfect) P.hasPerfect = true;
    checkTitles();
  }

  $('res-correct').textContent = correct;
  $('res-total').textContent   = total;
  $('res-rate').textContent    = `${rate}%`;
  $('res-exp').textContent     = `+${battle.expGained}`;
  $('res-gold').textContent    = `+${battle.goldGained}`;

  const row = languageMasteryState().effectiveRow;
  updateHeroSprite('result-hero', row);

  let title = '', msg = '';
  if (rate === 100) { title='かんぺきしょうり！'; msg='すべてのもんだいをせいかい！言語マスターへ大きく近づいた！'; }
  else if (rate >= 80) { title='だいしょうり！'; msg=`すばらしい！${languageWordLabel()}のちからがぐんぐんのびている！`; }
  else if (rate >= 60) { title='しょうり！'; msg='よくたたかった！にがてなもんだいをもう一度れんしゅうしよう！'; }
  else if (rate >= 40) { title='ひきわけ…'; msg='もう少し！あきらめずにもう一度ちょうせん！'; }
  else { title='ざんねん…'; msg='じゅんびがたりなかった…よわてき集中でれんしゅうしよう！'; }

  $('result-title').textContent = title;
  $('result-msg').textContent   = msg;

  // 間違い一覧
  const list = $('wrong-list');
  list.innerHTML = '';
  if (battle.wrongItems.length === 0) {
    $('wrong-wrap').style.display = 'none';
  } else {
    $('wrong-wrap').style.display = '';
    battle.wrongItems.forEach(w => {
      const li = document.createElement('li');
      li.innerHTML = `<div class="wl-q">Q: ${w.question}</div>
                      <div class="wl-a">正解: ${w.correct}</div>
                      <div class="wl-ua">あなた: ${w.yours}</div>`;
      list.appendChild(li);
    });
  }

  refreshField();
  showScreen('screen-result');

  // アイテムドロップ判定（正解率40%以上、30%の確率）
  if (rate >= 40 && Math.random() < 0.3) {
    const level = $('level-select')?.value || 'all';
    const droppedItem = rollItemDrop(level);
    if (droppedItem) {
      setTimeout(() => showItemDropOverlay(droppedItem), 600);
    }
  }

  // フィールドBGMに戻す
  setTimeout(() => playFieldBGM(), 800);
}

/* ══════════════════════════════════════════════════
   20. アイテムシステム
══════════════════════════════════════════════════ */
function rollItemDrop(level) {
  const pools = {
    beginner:     ['w1','w2','a1','a2','c1','c2','c3','c4','c5'],
    intermediate: ['w2','w3','a2','a3','c1','c2','c3','c4','c5'],
    advanced:     ['w3','w4','w5','a3','a4','a5','c1','c2','c3','c4','c5'],
    all:          ['w1','w2','a1','a2','c1','c2','c3','c4','c5'],
  };
  const pool = pools[level] || pools.all;
  const id = pool[Math.floor(Math.random() * pool.length)];
  return ITEM_DB[id] || null;
}

function addToInventory(item) {
  if (P.inventory.length >= 20) {
    return false; // インベントリいっぱい
  }
  P.inventory.push({ ...item });
  return true;
}

function showItemDropOverlay(item) {
  const overlay = $('item-drop-overlay');
  if (!overlay) return;
  const iconEl = $('item-drop-icon');
  const nameEl = $('item-drop-name');
  const typeEl = $('item-drop-type');
  const statEl = $('item-drop-stat');

  if (iconEl) iconEl.textContent = item.icon;
  if (nameEl) nameEl.textContent = item.name;
  const typeLabel = item.type === 'weapon' ? '武器' : item.type === 'armor' ? '防具' : '消耗品';
  if (typeEl) typeEl.textContent = typeLabel;
  let stat = '';
  if (item.type === 'weapon') stat = `ATK+${item.atk}  EXP×${item.expMult}`;
  else if (item.type === 'armor') stat = `DEF+${item.def}  GOLD×${item.goldMult}`;
  else if (item.effect === 'expBoost') stat = `次バトルEXP×${item.value}`;
  else if (item.effect === 'comboShield') stat = `次バトル1回ミスをカバー`;
  else if (item.effect === 'healHp') stat = `HP+${item.value}`;
  else if (item.effect === 'choiceCut') stat = `次バトル選択肢-${item.value}`;
  if (statEl) statEl.textContent = stat;

  const ok = addToInventory(item);
  const msgEl = $('item-drop-msg');
  if (msgEl) msgEl.textContent = ok ? 'インベントリに追加した！' : 'インベントリがいっぱいだ！';

  playSoundItem();
  spawnEffects(['✨','⭐','💫'], 10);
  overlay.classList.remove('hidden');
}

async function equipItem(itemIdx) {
  const item = P.inventory[itemIdx];
  if (!item) return;
  if (item.type === 'weapon') {
    P.equipment.weapon = item;
  } else if (item.type === 'armor') {
    P.equipment.armor = item;
  } else {
    return;
  }
  refreshEquipmentDisplay();
  renderInventoryWindow();
  refreshHeader();
  if (authToken) {
    try {
      await apiFetch('/player/equip', { method: 'POST', body: JSON.stringify({ type: item.type, itemId: item.id }) });
    } catch (err) {
      console.error('装備の同期に失敗しました:', err);
    }
  }
}

function useItem(itemIdx) {
  const item = P.inventory[itemIdx];
  if (!item || item.type !== 'consumable') return;
  if (item.effect === 'healHp') {
    const healed = healHp(item.value || 0);
    alert(healed > 0 ? `${item.name}を使った！ HPが${healed}回復した。` : 'HPはすでに まんたんです。');
  } else {
    P.activeEffects.push({ ...item });
  }
  P.inventory.splice(itemIdx, 1);
  refreshEquipmentDisplay();
  renderInventoryWindow();
}

function refreshEquipmentDisplay() {
  const weapEl = $('equip-weapon-name');
  const armEl  = $('equip-armor-name');
  if (weapEl) weapEl.textContent = P.equipment.weapon ? `${P.equipment.weapon.icon} ${P.equipment.weapon.name}` : 'なし';
  if (armEl)  armEl.textContent  = P.equipment.armor  ? `${P.equipment.armor.icon} ${P.equipment.armor.name}`   : 'なし';

  const effEl = $('active-effects-display');
  if (effEl) {
    if (P.activeEffects.length === 0) {
      effEl.textContent = 'なし';
    } else {
      effEl.textContent = P.activeEffects.map(e => `${e.icon}${e.name}`).join('、');
    }
  }
}

function renderInventoryWindow() {
  const container = $('inventory-list');
  if (!container) return;
  refreshEquipmentDisplay();

  if (P.inventory.length === 0) {
    container.innerHTML = '<div class="inv-empty">アイテムをもっていない</div>';
    return;
  }

  container.innerHTML = '';
  P.inventory.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'inv-row';

    let stat = '';
    if (item.type === 'weapon') stat = `EXP×${item.expMult}`;
    else if (item.type === 'armor') stat = `GOLD×${item.goldMult}`;
    else if (item.effect === 'expBoost') stat = `EXP×${item.value}`;
    else if (item.effect === 'comboShield') stat = `コンボ保護`;
    else if (item.effect === 'healHp') stat = `HP+${item.value}`;
    else if (item.effect === 'choiceCut') stat = `選択肢-${item.value}`;
    else if (item.type === 'permit') stat = '解放済み';

    const isEquipped =
      (item.type === 'weapon' && P.equipment.weapon?.id === item.id) ||
      (item.type === 'armor'  && P.equipment.armor?.id  === item.id);

    row.innerHTML = `
      <span class="inv-icon">${item.icon}</span>
      <span class="inv-name">${item.name}${isEquipped ? ' <span class="inv-equipped">★装備</span>' : ''}</span>
      <span class="inv-stat">${stat}</span>
    `;

    if (item.type === 'weapon' || item.type === 'armor') {
      const btn = document.createElement('button');
      btn.className   = 'dq-btn dq-btn-blue inv-btn';
      btn.textContent = tr('equip');
      btn.addEventListener('click', () => equipItem(idx));
      row.appendChild(btn);
    } else if (item.type === 'consumable') {
      const btn = document.createElement('button');
      btn.className   = 'dq-btn dq-btn-green inv-btn';
      btn.textContent = tr('use');
      btn.addEventListener('click', () => useItem(idx));
      row.appendChild(btn);
    } else {
      const badge = document.createElement('span');
      badge.className = 'inv-equipped';
      badge.textContent = tr('owned');
      row.appendChild(badge);
    }

    container.appendChild(row);
  });
}

/* ══════════════════════════════════════════════════
   21. フィールド探索（勇者の移動・アイコン接触）
══════════════════════════════════════════════════ */
const FIELD_ICON_TOUCH_RATIO = 0.10; // キャンバス短辺に対する接触判定の割合
const FIELD_ICON_LEAVE_RATIO = FIELD_ICON_TOUCH_RATIO * 1.6;
const FIELD_MOVE_SPEED = 130; // px/秒（キャンバス実寸換算）

// 「歩ける画面」の定義。まち（フィールド）とせかいマップの両方で同じ移動システムを使い回す
const WALKABLE_SCREENS = {
  'screen-field': { canvasId: 'field-canvas', heroId: 'field-hero', onTouch: mode => enterCommand(mode) },
  'screen-world': { canvasId: 'world-canvas', heroId: 'world-hero', onTouch: handleWorldZoneTouch },
};
// 画面ごとの勇者位置（%）。画面を切り替えるたびに入り口の位置へリセットする
const heroPositions = {
  'screen-field': { x: 50, y: 68 },
  'screen-world': { x: 50, y: 92 },
};
const moveKeys = new Set();
const touchedFieldIcons = new Set();
let fieldLastTime = null;
let worldEncounterTimer = 0;
let nextEncounterAt = randomEncounterThreshold();
let currentWorldRegion = null;

const WORLD_REGIONS = [
  { id: 'north-america', label: '北アメリカ大陸', icon: '🌎', left: 88, top: 20, hero: { x: 50, y: 84 }, langs: [
    { code: 'en', flag: '🇺🇸', label: 'English', left: 46, top: 34 },
  ] },
  { id: 'south-america', label: '南アメリカ大陸', icon: '🌎', left: 91, top: 58, hero: { x: 50, y: 84 }, langs: [
    { code: 'es', flag: '🇲🇽', label: 'Español', left: 42, top: 42 },
    { code: 'pt', flag: '🇧🇷', label: 'Português', left: 58, top: 62 },
  ] },
  { id: 'eurasia', label: 'ユーラシア大陸', icon: '🌏', left: 44, top: 22, hero: { x: 50, y: 84 }, children: ['europe', 'middle-east', 'east-asia'] },
  { id: 'africa', label: 'アフリカ大陸', icon: '🌍', left: 22, top: 61, hero: { x: 50, y: 84 }, langs: [
    { code: 'ar', flag: '🇸🇦', label: 'العربية', left: 50, top: 38 },
  ] },
  { id: 'oceania', label: 'オセアニア大陸', icon: '🌏', left: 62, top: 76, hero: { x: 50, y: 84 }, langs: [
    { code: 'en', flag: '🇦🇺', label: 'English', left: 50, top: 48 },
  ] },
  { id: 'europe', parent: 'eurasia', label: 'ヨーロッパ', icon: '🏰', left: 30, top: 36, hero: { x: 50, y: 82 }, color: '#ef8fa0', langs: [
    { code: 'fr', flag: '🇫🇷', label: 'Français', left: 24, top: 40 },
    { code: 'de', flag: '🇩🇪', label: 'Deutsch', left: 38, top: 32 },
    { code: 'nl', flag: '🇳🇱', label: 'Nederlands', left: 28, top: 26 },
    { code: 'pl', flag: '🇵🇱', label: 'Polski', left: 52, top: 28 },
    { code: 'it', flag: '🇮🇹', label: 'Italiano', left: 34, top: 56 },
    { code: 'el', flag: '🇬🇷', label: 'Ελληνικά', left: 54, top: 62 },
    { code: 'ru', flag: '🇷🇺', label: 'Русский', left: 72, top: 22 },
  ] },
  { id: 'middle-east', parent: 'eurasia', label: '中東・南アジア', icon: '🕌', left: 50, top: 52, hero: { x: 50, y: 82 }, color: '#f0c16e', langs: [
    { code: 'ar', flag: '🇸🇦', label: 'العربية', left: 24, top: 34 },
    { code: 'tr', flag: '🇹🇷', label: 'Türkçe', left: 42, top: 28 },
    { code: 'hi', flag: '🇮🇳', label: 'हिन्दी', left: 36, top: 38 },
    { code: 'bn', flag: '🇧🇩', label: 'বাংলা', left: 58, top: 36 },
    { code: 'ne', flag: '🇳🇵', label: 'नेपाली', left: 48, top: 24 },
    { code: 'ta', flag: '🇮🇳', label: 'தமிழ்', left: 36, top: 60 },
    { code: 'si', flag: '🇱🇰', label: 'සිංහල', left: 54, top: 70 },
  ] },
  { id: 'east-asia', parent: 'eurasia', label: '東アジア', icon: '⛩️', left: 70, top: 40, hero: { x: 50, y: 84 }, color: '#7398cf', langs: [
    { code: 'ja', flag: '🇯🇵', label: '日本語', left: 70, top: 24 },
    { code: 'zh', flag: '🇨🇳', label: '中文', left: 40, top: 26 },
    { code: 'yue', flag: '🇭🇰', label: '粵語', left: 50, top: 40 },
    { code: 'ko', flag: '🇰🇷', label: '한국어', left: 62, top: 30 },
    { code: 'my', flag: '🇲🇲', label: 'မြန်မာ', left: 34, top: 52 },
    { code: 'th', flag: '🇹🇭', label: 'ไทย', left: 48, top: 58 },
    { code: 'vi', flag: '🇻🇳', label: 'Tiếng Việt', left: 62, top: 56 },
    { code: 'tl', flag: '🇵🇭', label: 'Tagalog', left: 72, top: 62 },
    { code: 'id', flag: '🇮🇩', label: 'Bahasa Indonesia', left: 52, top: 76 },
  ] },
];

const WORLD_MAP_BASE = `
  <rect x="0" y="0" width="100" height="100" fill="#bfe3f2"/>
  <polygon points="14,18 22,10 32,8 42,10 50,7 58,9 64,14 68,22 70,30 72,38 70,46 72,52 66,56 60,58 54,52 50,56 44,52 40,56 34,50 28,54 22,48 16,42 12,34 10,26" fill="#ef8fa0"/>
  <polygon points="20,40 26,38 30,44 29,54 32,62 30,72 26,84 20,88 15,80 13,68 12,56 14,46" fill="#f6d76e"/>
  <polygon points="78,14 86,8 94,12 97,20 96,30 90,36 92,42 84,44 78,38 76,26 77,18" fill="#f2ab6c"/>
  <polygon points="80,42 86,44 90,54 91,64 89,74 86,84 82,86 78,78 77,64 76,52" fill="#7398cf"/>
  <polygon points="54,66 64,63 73,68 75,76 68,83 57,81 51,74" fill="#8ec570"/>
  <polygon points="0,92 15,90 30,94 45,91 60,95 75,90 90,94 100,91 100,100 0,100" fill="#c3c9cf"/>
`;

const WORLD_MAP_FOCUSED = {
  'north-america': `<rect x="0" y="0" width="100" height="100" fill="#bfe3f2"/><polygon points="16,20 30,10 50,8 70,16 82,30 78,48 62,58 50,72 34,66 24,50 12,42" fill="#f2ab6c"/>`,
  'south-america': `<rect x="0" y="0" width="100" height="100" fill="#bfe3f2"/><polygon points="42,12 60,16 72,32 70,48 62,68 52,88 42,78 36,58 32,38" fill="#7398cf"/>`,
  eurasia: `<rect x="0" y="0" width="100" height="100" fill="#bfe3f2"/><polygon points="8,28 20,16 38,12 54,16 72,14 88,24 94,40 88,58 70,66 54,58 42,68 30,56 18,60 8,46" fill="#ef8fa0"/>`,
  africa: `<rect x="0" y="0" width="100" height="100" fill="#bfe3f2"/><polygon points="42,10 60,16 70,34 66,54 58,78 42,90 28,76 24,54 28,30" fill="#f6d76e"/>`,
  oceania: `<rect x="0" y="0" width="100" height="100" fill="#bfe3f2"/><polygon points="22,48 40,38 62,42 78,56 74,72 54,82 32,76 18,62" fill="#8ec570"/>`,
  europe: `<rect x="0" y="0" width="100" height="100" fill="#bfe3f2"/><polygon points="16,22 34,12 56,16 70,30 64,48 76,62 58,72 42,60 28,68 16,52" fill="#ef8fa0"/>`,
  'middle-east': `<rect x="0" y="0" width="100" height="100" fill="#bfe3f2"/><polygon points="16,24 36,16 58,22 76,36 70,54 82,68 60,78 42,68 28,78 18,58" fill="#f0c16e"/>`,
  'east-asia': `<rect x="0" y="0" width="100" height="100" fill="#bfe3f2"/><polygon points="18,20 38,12 62,18 78,34 72,52 84,66 66,80 46,70 30,78 18,58" fill="#7398cf"/>`,
};

function getActiveWalkable() {
  for (const [screenId, cfg] of Object.entries(WALKABLE_SCREENS)) {
    const scr = $(screenId);
    if (scr && scr.classList.contains('active')) {
      return { screenId, ...cfg, pos: heroPositions[screenId] };
    }
  }
  return null;
}

function resetHeroPosition(screenId) {
  const region = currentWorldRegion ? WORLD_REGIONS.find(r => r.id === currentWorldRegion) : null;
  const start = screenId === 'screen-world' ? (region?.hero || { x: 50, y: 92 }) : { x: 50, y: 68 };
  heroPositions[screenId] = { ...start };
  touchedFieldIcons.clear();
  const cfg = WALKABLE_SCREENS[screenId];
  const hero = cfg && $(cfg.heroId);
  if (hero) {
    hero.style.left = start.x + '%';
    hero.style.top  = start.y + '%';
  }
}

function randomEncounterThreshold() {
  return 3500 + Math.random() * 3500; // 3.5〜7秒うごき続けるとエンカウント（連続エンカウントで詰まないよう余裕を持たせる）
}

function keyToDir(key) {
  switch (key) {
    case 'ArrowUp':    case 'w': case 'W': return 'up';
    case 'ArrowDown':  case 's': case 'S': return 'down';
    case 'ArrowLeft':  case 'a': case 'A': return 'left';
    case 'ArrowRight': case 'd': case 'D': return 'right';
    default: return null;
  }
}

function setupFieldControls() {
  window.addEventListener('keydown', e => {
    if (!getActiveWalkable()) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const dir = keyToDir(e.key);
    if (dir) { moveKeys.add(dir); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => {
    const dir = keyToDir(e.key);
    if (dir) moveKeys.delete(dir);
  });

  document.querySelectorAll('.dpad-btn').forEach(btn => {
    const dir     = btn.dataset.dir;
    const press   = ev => { ev.preventDefault(); moveKeys.add(dir); };
    const release = () => moveKeys.delete(dir);
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
  });

  /* ── スマホ用フリック・スワイプ移動（フィールド／せかいマップ共通） ── */
  Object.values(WALKABLE_SCREENS).forEach(cfg => setupFlickForCanvas(cfg.canvasId));
}

function setupFlickForCanvas(canvasId) {
  const canvas = $(canvasId);
  if (!canvas) return;

  let flickStartX = 0;
  let flickStartY = 0;
  let isFlicking = false;
  let flickTimer = null;
  const MIN_FLICK_DIST = 15;

  const clearFlickKeys = () => {
    moveKeys.delete('up');
    moveKeys.delete('down');
    moveKeys.delete('left');
    moveKeys.delete('right');
  };

  const handleFlickStart = ev => {
    if (!getActiveWalkable()) return;
    const touch = ev.touches ? ev.touches[0] : ev;
    flickStartX = touch.clientX;
    flickStartY = touch.clientY;
    isFlicking = true;
    if (flickTimer) { clearTimeout(flickTimer); flickTimer = null; }
  };

  const handleFlickMove = ev => {
    if (!isFlicking || !getActiveWalkable()) return;
    const touch = ev.touches ? ev.touches[0] : ev;
    const dx = touch.clientX - flickStartX;
    const dy = touch.clientY - flickStartY;
    const dist = Math.hypot(dx, dy);

    if (dist >= MIN_FLICK_DIST) {
      clearFlickKeys();
      if (Math.abs(dx) > Math.abs(dy)) {
        moveKeys.add(dx > 0 ? 'right' : 'left');
      } else {
        moveKeys.add(dy > 0 ? 'down' : 'up');
      }
    }
  };

  const handleFlickEnd = () => {
    if (!isFlicking) return;
    isFlicking = false;
    flickTimer = setTimeout(() => {
      clearFlickKeys();
      flickTimer = null;
    }, 350);
  };

  canvas.addEventListener('touchstart', handleFlickStart, { passive: true });
  canvas.addEventListener('touchmove', handleFlickMove, { passive: true });
  canvas.addEventListener('touchend', handleFlickEnd, { passive: true });
  canvas.addEventListener('touchcancel', handleFlickEnd, { passive: true });
}

function updateHeroMovement(dt, active) {
  let dx = 0, dy = 0;
  if (moveKeys.has('up'))    dy -= 1;
  if (moveKeys.has('down'))  dy += 1;
  if (moveKeys.has('left'))  dx -= 1;
  if (moveKeys.has('right')) dx += 1;
  if (dx === 0 && dy === 0) return false;

  const canvas = $(active.canvasId);
  const hero   = $(active.heroId);
  if (!canvas || !hero) return false;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;

  const len = Math.hypot(dx, dy);
  dx /= len; dy /= len;

  const heroHalfWPct = (hero.offsetWidth  / 2 / rect.width)  * 100;
  const heroHalfHPct = (hero.offsetHeight / 2 / rect.height) * 100;

  const pos = active.pos;
  pos.x += (dx * FIELD_MOVE_SPEED * dt / rect.width)  * 100;
  pos.y += (dy * FIELD_MOVE_SPEED * dt / rect.height) * 100;
  pos.x = Math.min(100 - heroHalfWPct, Math.max(heroHalfWPct, pos.x));
  pos.y = Math.min(100 - heroHalfHPct, Math.max(heroHalfHPct, pos.y));

  hero.style.left = pos.x + '%';
  hero.style.top  = pos.y + '%';
  hero.classList.toggle('facing-left', dx < 0);
  return true;
}

function checkFieldIconContacts(active) {
  const canvas = $(active.canvasId);
  const hero   = $(active.heroId);
  if (!canvas || !hero) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const heroRect = hero.getBoundingClientRect();
  const heroCx = heroRect.left + heroRect.width / 2;
  const heroCy = heroRect.top  + heroRect.height / 2;
  const short  = Math.min(rect.width, rect.height);
  const touchDist = short * FIELD_ICON_TOUCH_RATIO;
  const leaveDist = short * FIELD_ICON_LEAVE_RATIO;

  canvas.querySelectorAll('.field-icon').forEach(iconEl => {
    const key   = iconEl.dataset.mode || iconEl.dataset.lang || iconEl.dataset.region;
    const iRect = iconEl.getBoundingClientRect();
    const iCx = iRect.left + iRect.width / 2;
    const iCy = iRect.top  + iRect.height / 2;
    const dist = Math.hypot(heroCx - iCx, heroCy - iCy);

    if (dist < touchDist) {
      if (!touchedFieldIcons.has(key)) {
        touchedFieldIcons.add(key);
        active.onTouch(key, iconEl);
      }
    } else if (dist > leaveDist) {
      touchedFieldIcons.delete(key);
    }
  });
}

function fieldLoop(ts) {
  requestAnimationFrame(fieldLoop);
  const active = getActiveWalkable();
  if (!active) { fieldLastTime = null; return; }
  if (fieldLastTime === null) { fieldLastTime = ts; return; }
  const dt = Math.min(0.05, (ts - fieldLastTime) / 1000);
  fieldLastTime = ts;
  const moved = updateHeroMovement(dt, active);
  checkFieldIconContacts(active);

  // せかいマップではうろついているとランダムにモンスターが出現する
  if (active.screenId === 'screen-world' && moved) {
    worldEncounterTimer += dt * 1000;
    if (worldEncounterTimer >= nextEncounterAt) {
      worldEncounterTimer = 0;
      nextEncounterAt = randomEncounterThreshold();
      triggerRandomEncounter();
    }
  }
}

/* ══════════════════════════════════════════════════
   22. フィールドへ戻る（バトル中断・音声停止）
══════════════════════════════════════════════════ */
function stopSpeechAll() {
  clearPendingSpeech();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (recognition) {
    try { recognition.abort(); } catch (e) { /* noop */ }
    recognition = null;
  }
}

function goToField() {
  stopSpeechAll();
  const lang = langState();
  const row = languageMasteryState().effectiveRow;
  if (lang.currentHp === undefined) lang.currentHp = row.hp;
  if (lang.currentMp === undefined) lang.currentMp = row.mp;
  resetHeroPosition('screen-field');
  showScreen('screen-field');
  refreshHeader();
  refreshExpBar();
  refreshField();
  refreshEquipmentDisplay();
  renderInventoryWindow();
  playFieldBGM();
}

// フィールドのコマンド選択（アイコン接触／ボタンクリック共通の入り口）
function enterCommand(mode) {
  if (!canUseCommand(mode)) {
    alert(commandLockMessage(mode));
    goToShop();
    return;
  }
  if (mode === 'inn' || mode === 'review') goToInn();
  else if (mode === 'world') goToWorld();
  else if (mode === 'status') goToStatus();
  else if (mode === 'keyboard') goToKeyboard();
  else if (mode === 'shop') goToShop();
  else startBattle(mode);
}

let commandPage = 1;
let commandPageMax = 1;
const COMMANDS_PER_PAGE = 6;

function setupCommandPagination() {
  const buttons = Array.from(document.querySelectorAll('.dq-cmd-btn'));
  commandPageMax = Math.max(1, Math.ceil(buttons.length / COMMANDS_PER_PAGE));
  buttons.forEach((btn, idx) => {
    btn.dataset.commandPage = String(Math.floor(idx / COMMANDS_PER_PAGE) + 1);
  });
}

function showMagicNote(text) {
  const el = $('battle-magic-note');
  if (el) el.textContent = text;
}

function maxHpForCurrentLanguage() {
  return languageMasteryState().effectiveRow.hp;
}

function maxMpForCurrentLanguage() {
  return languageMasteryState().effectiveRow.mp;
}

function spendMp(cost) {
  const lang = langState();
  if (lang.currentMp === undefined) lang.currentMp = maxMpForCurrentLanguage();
  if (lang.currentMp < cost) {
    showMagicNote(`MPがたりない！ あと${cost - lang.currentMp}MPひつよう。`);
    return false;
  }
  lang.currentMp -= cost;
  refreshHeader();
  return true;
}

function healHp(amount) {
  const lang = langState();
  const maxHp = maxHpForCurrentLanguage();
  if (lang.currentHp === undefined) lang.currentHp = maxHp;
  const before = lang.currentHp;
  lang.currentHp = Math.min(maxHp, lang.currentHp + amount);
  refreshHeader();
  return lang.currentHp - before;
}

function cutWrongChoices(count = 2) {
  const q = battle.questions[battle.cur];
  if (!q || !q.choices || battle.answered) return 0;
  const btns = Array.from(document.querySelectorAll('.dq-choice'));
  const candidates = btns
    .map((btn, i) => ({ btn, i }))
    .filter(({ btn, i }) => i !== q.ans && btn.style.display !== 'none' && !btn.disabled);
  shuffle(candidates);
  const picked = candidates.slice(0, Math.min(count, candidates.length));
  picked.forEach(({ btn }) => {
    btn.disabled = true;
    btn.classList.add('choice-cut');
    btn.textContent = 'ー';
  });
  return picked.length;
}

function applyQueuedChoiceCut() {
  if (battle.choiceCutUsed) return;
  const effect = battle.activeEffects?.find(e => e.effect === 'choiceCut');
  if (!effect) return;
  const cut = cutWrongChoices(effect.value || 2);
  if (cut > 0) {
    battle.choiceCutUsed = true;
    showMagicNote(`${effect.icon} ${effect.name}で まよいを${cut}つ 消した！`);
  }
}

function useHintMagic() {
  if (battle.answered) return;
  const q = battle.questions[battle.cur];
  if (!q || !spendMp(3)) return;
  if (q.choices) {
    const wrong = q.choices.find((choice, i) => i !== q.ans && choice);
    showMagicNote(wrong ? `ヒント: 「${wrong}」ではない。` : 'ヒント: 正解をよく見きわめよう。');
  } else {
    const ans = String(q.ans || '');
    showMagicNote(ans ? `ヒント: はじめの文字は「${ans[0]}」。` : 'ヒント: 音とつづりを思い出そう。');
  }
}

function useChoiceCutMagic() {
  if (battle.answered) return;
  const q = battle.questions[battle.cur];
  if (!q?.choices) {
    showMagicNote('この問題では せんたくしをへらせない。');
    return;
  }
  if (!spendMp(5)) return;
  const cut = cutWrongChoices(2);
  showMagicNote(cut > 0 ? `まほうで まちがいを${cut}つ 消した！` : 'もう消せる選択肢がない。');
}

function useHealMagic() {
  if (battle.answered) return;
  if (!spendMp(4)) return;
  const amount = Math.max(10, Math.round(maxHpForCurrentLanguage() * 0.35));
  const healed = healHp(amount);
  showMagicNote(healed > 0 ? `回復まほう！ HPが${healed}回復した。` : 'HPはすでに まんたんだ。');
}

function shopItems() {
  return SHOP_ITEM_IDS.map(id => ITEM_DB[id]).filter(Boolean);
}

function itemStatText(item) {
  if (item.type === 'weapon') return `EXP倍率 ${item.expMult}`;
  if (item.type === 'armor') return `Gold倍率 ${item.goldMult}`;
  if (item.type === 'consumable' && item.effect === 'expBoost') return `次バトルEXP x${item.value}`;
  if (item.type === 'consumable' && item.effect === 'comboShield') return '次バトルのミス1回を保護';
  if (item.type === 'consumable' && item.effect === 'healHp') return `HPを${item.value}回復`;
  if (item.type === 'consumable' && item.effect === 'choiceCut') return `次バトルの選択肢を${item.value}つ減らす`;
  return item.desc || '学びの道をひらく';
}

function goToShop() {
  stopSpeechAll();
  showScreen('screen-shop');
  playFieldBGM();
  renderShop();
}

async function buyShopItem(itemId) {
  const item = ITEM_DB[itemId];
  if (!item) return;
  if (hasItem(itemId) && item.type !== 'consumable') {
    alert('すでに持っています。');
    return;
  }
  if (P.gold < item.price) {
    alert(`Goldが足りません。必要Gold: ${item.price}`);
    return;
  }

  if (authToken) {
    try {
      const result = await apiFetch('/player/shop/buy', {
        method: 'POST',
        body: JSON.stringify({ itemId }),
      });
      applyProfile(result.profile);
      applyInventoryItems(result.items || []);
    } catch (err) {
      alert(err.message);
      return;
    }
  } else {
    P.gold -= item.price;
    addToInventory(item);
  }

  refreshHeader();
  refreshField();
  populateLanguageSelect();
  refreshCommandLocks();
  renderInventoryWindow();
  renderShop();
  playSoundItem();
}

function renderShop() {
  const list = $('shop-list');
  if (!list) return;
  if ($('shop-gold')) $('shop-gold').textContent = P.gold;
  list.innerHTML = '';

  shopItems().forEach(item => {
    const owned = hasItem(item.id) && item.type !== 'consumable';
    const row = document.createElement('div');
    row.className = `shop-row${owned ? ' shop-row-owned' : ''}`;
    row.innerHTML = `
      <span class="shop-icon">${item.icon}</span>
      <span class="shop-main">
        <span class="shop-name">${item.name}</span>
        <span class="shop-desc">${itemStatText(item)}</span>
      </span>
      <span class="shop-price">${owned ? tr('owned') : `${item.price}G`}</span>
    `;
    const btn = document.createElement('button');
    btn.className = 'dq-btn dq-btn-gold shop-buy-btn';
    btn.textContent = owned ? 'OK' : tr('buy');
    btn.disabled = owned || P.gold < item.price;
    btn.addEventListener('click', () => buyShopItem(item.id));
    row.appendChild(btn);
    list.appendChild(row);
  });
}

function showCommandPage(page) {
  commandPage = page < 1 ? commandPageMax : page > commandPageMax ? 1 : page;
  const commandWindow = $('command-window');
  const pageIndicator = $('command-page-indicator');
  if (commandWindow) commandWindow.dataset.page = String(commandPage);
  if (pageIndicator) pageIndicator.textContent = `${commandPage}/${commandPageMax}`;
}

function nextCommandPage() {
  showCommandPage(commandPage + 1);
}

/* ══════════════════════════════════════════════════
   せかいマップ：まちの外・ランダムせんとう・ボス戦
══════════════════════════════════════════════════ */
function renderWorldMap() {
  const canvas = $('world-canvas');
  const layer = $('world-zone-layer');
  if (!canvas || !layer) return;
  const mapSvg = canvas.querySelector('.world-map-svg');

  const region = currentWorldRegion ? WORLD_REGIONS.find(r => r.id === currentWorldRegion) : null;
  canvas.classList.toggle('world-area-mode', Boolean(region));
  canvas.dataset.region = region?.id || 'global';
  if (mapSvg) mapSvg.innerHTML = region ? (WORLD_MAP_FOCUSED[region.id] || WORLD_MAP_BASE) : WORLD_MAP_BASE;
  layer.innerHTML = '';

  if (!region) {
    WORLD_REGIONS.filter(r => !r.parent).forEach(r => {
      const el = document.createElement('div');
      el.className = 'field-icon world-region-gate';
      el.dataset.region = r.id;
      el.style.left = `${r.left}%`;
      el.style.top = `${r.top}%`;
      el.innerHTML = `<span class="world-region-emoji">${r.icon}</span><span class="world-region-label">${r.label}</span>`;
      layer.appendChild(el);
    });
    if ($('world-msg-text')) {
      $('world-msg-text').textContent = 'せかいちずが ひろがった！ まずは5大陸からえらぼう。大陸マップに入ると、主要なことばの国旗が見えるぞ。';
    }
    if ($('world-back-btn')) $('world-back-btn').textContent = tr('backTown');
    return;
  }

  const title = document.createElement('div');
  title.className = 'world-area-title';
  title.textContent = region.label;
  layer.appendChild(title);

  if (region.children?.length) {
    region.children
      .map(id => WORLD_REGIONS.find(r => r.id === id))
      .filter(Boolean)
      .forEach(child => {
        const el = document.createElement('div');
        el.className = 'field-icon world-region-gate world-subregion-gate';
        el.dataset.region = child.id;
        el.style.left = `${child.left}%`;
        el.style.top = `${child.top}%`;
        el.innerHTML = `<span class="world-region-emoji">${child.icon}</span><span class="world-region-label">${child.label}</span>`;
        layer.appendChild(el);
      });

    if ($('world-msg-text')) {
      $('world-msg-text').textContent = `${region.label}は大きい！ ヨーロッパ・中東・東アジアから行き先をえらぼう。`;
    }
    if ($('world-back-btn')) $('world-back-btn').textContent = uiLang === 'en' ? '◀ World map' : '◀ せかいちずへ';
    return;
  }

  region.langs.forEach(lang => {
    const locked = !isLanguageUnlocked(lang.code) || !canEnterLanguageArea(lang.code);
    const mastered = !locked && languageMasteryState(lang.code).mastered;
    const el = document.createElement('div');
    el.className = `field-icon world-zone-icon${locked ? ' field-icon-locked' : ''}`;
    el.dataset.lang = lang.code;
    el.style.left = `${lang.left}%`;
    el.style.top = `${lang.top}%`;
    el.innerHTML = `<span class="field-icon-emoji">${mastered ? '👑' : lang.flag}</span><span class="field-icon-label">${locked ? '🔒 ' : mastered ? '👑 ' : ''}${lang.label}</span>`;
    layer.appendChild(el);
  });

  if ($('world-msg-text')) {
    $('world-msg-text').textContent = `${region.label}のマップに入った！ 国旗の場所へ行くと、そのことばの てきが あらわれる。`;
  }
  if ($('world-back-btn')) $('world-back-btn').textContent = region.parent ? '◀ ユーラシアへ' : '◀ せかいちずへ';
}

function enterWorldRegion(regionId) {
  if (!WORLD_REGIONS.some(r => r.id === regionId)) return;
  currentWorldRegion = regionId;
  renderWorldMap();
  resetHeroPosition('screen-world');
  worldEncounterTimer = 0;
  nextEncounterAt = randomEncounterThreshold();
}

function leaveWorldRegion() {
  const region = currentWorldRegion ? WORLD_REGIONS.find(r => r.id === currentWorldRegion) : null;
  currentWorldRegion = region?.parent || null;
  renderWorldMap();
  resetHeroPosition('screen-world');
  worldEncounterTimer = 0;
  nextEncounterAt = randomEncounterThreshold();
}

function handleWorldZoneTouch(key, iconEl) {
  if (iconEl?.dataset.region) enterWorldRegion(iconEl.dataset.region);
  else if (iconEl?.dataset.lang) enterLanguageZone(iconEl.dataset.lang);
}

function goToWorld(regionId = null) {
  stopSpeechAll();
  currentWorldRegion = regionId;
  renderWorldMap();
  resetHeroPosition('screen-world');
  worldEncounterTimer = 0;
  nextEncounterAt = randomEncounterThreshold();
  showScreen('screen-world');
  playFieldBGM();
  refreshHeader();
}

// リザルト画面「フィールドへ」の戻り先判定：
// せかいマップ発のバトルに勝利／終了したときだけ、続けて探索できるようせかいマップへ戻す。
// それ以外（通常のコマンドバトル）はまちへ戻る。
function returnFromBattle() {
  if (battle && battle.returnTo === 'screen-world') goToWorld(battle.returnRegion || null);
  else goToField();
}

function randomEncounterMode() {
  const modes = ['vocab', 'grammar', 'typing', 'listening', 'speaking'];
  return modes[Math.floor(Math.random() * modes.length)];
}

// せかいマップをうろついていると発生するランダムせんとう。難易度は勇者のレベルに自動連動する
async function triggerRandomEncounter() {
  await ensureLanguageQuestionData();
  const mode  = randomEncounterMode();
  const tier  = languageMasteryState().effectiveLv;
  const qs    = buildQuestions(mode, tier, 4);
  if (qs.length === 0) return;

  const enemy = pickEnemy(tier);
  battle = {
    mode, questions: qs, cur: 0,
    correct: 0, wrongItems: [],
    combo: 0, expGained: 0, goldGained: 0,
    answered: false, enemy,
    activeEffects: [], comboShield: false, comboShieldUsed: false, choiceCutUsed: false, defeated: false,
    returnTo: 'screen-world', returnRegion: currentWorldRegion,
    isRandomEncounter: true,
  };

  const msgEl = $('world-msg-text');
  if (msgEl) msgEl.textContent = `${enemy.sprite} ${enemy.name}が とびだしてきた！`;

  setupBattleScreenUI(enemy);
  showScreen('screen-battle');
  renderQuestion();
}

// せかいマップの地域ゾーンに触れると、その言語・地域にちなんだ敵が現れる
// （単語・文法・フレーズ・文化を横断する「スマート学習」の出題ロジックを流用）
let enteringZone = false; // ゾーンが密集しているため、遷移中に別ゾーンへ二重突入するのを防ぐ
async function enterLanguageZone(langCode) {
  if (enteringZone) return;
  if (!LANGUAGE_OPTIONS.some(l => l.code === langCode)) return;
  const lang = LANGUAGE_OPTIONS.find(l => l.code === langCode);
  if (!isLanguageUnlocked(langCode)) {
    alert(`${lang?.label || 'この言語'}に入るには、Shopで入門書を購入してください。`);
    goToShop();
    return;
  }
  if (!canEnterLanguageArea(langCode)) {
    const req = ITEM_DB[LANGUAGE_ENTRY_REQUIREMENTS[langCode]];
    alert(`${lang?.label || 'この地域'}へ行くには「${req?.name || '通行アイテム'}」が必要です。Shopで購入できます。`);
    goToShop();
    return;
  }
  enteringZone = true;
  stopSpeechAll();
  setLanguage(langCode);
  await ensureLanguageQuestionData();

  if (languageMasteryState(langCode).mastered) {
    showLanguageEnding(langCode);
    enteringZone = false;
    return;
  }

  const tier = languageMasteryState(langCode).effectiveLv;
  const qs = buildQuestions('smart', tier, 8);
  if (qs.length === 0) {
    alert('この地域では まだ もんだいが たりません。');
    enteringZone = false;
    return;
  }

  const enemy = pickEnemy(tier, langCode);

  battle = {
    mode: 'smart', questions: qs, cur: 0,
    correct: 0, wrongItems: [],
    combo: 0, expGained: 0, goldGained: 0,
    answered: false, enemy,
    activeEffects: [], comboShield: false, comboShieldUsed: false, choiceCutUsed: false, defeated: false,
    returnTo: 'screen-world', returnRegion: currentWorldRegion,
    isRegionZone: true, zoneLang: langCode,
  };

  const currentLang = currentLanguage();
  const msgEl = $('world-msg-text');
  if (msgEl) msgEl.textContent = `${currentLang.label}の ちいきに とうちゃく！ ${enemy.sprite} ${enemy.name}が あらわれた！`;
  $('world-msg')?.classList.remove('hidden');

  setupBattleScreenUI(enemy);
  showScreen('screen-battle');
  renderQuestion();
  enteringZone = false;
}

function showLanguageEnding(langCode = selectedLanguage) {
  stopSpeechAll();
  const lang = LANGUAGE_OPTIONS.find(l => l.code === langCode) || currentLanguage();
  const mastery = languageMasteryState(langCode);
  updateHeroSprite('ending-hero', mastery.effectiveRow);
  if ($('ending-title')) $('ending-title').textContent = `${lang.label} マスター！`;
  if ($('ending-lang')) $('ending-lang').textContent = `${lang.native} のことばが きみの中にひびいている。`;
  if ($('ending-text')) {
    $('ending-text').textContent = `この国の人々は、きみを「ことばの旅人」としてむかえた。けれど言葉は生きている。新しい問題が増え、時間がたてば記憶はうすれる。学びを続けるかぎり、このエンディングは何度でも輝き続ける。`;
  }
  if ($('ending-stats')) {
    $('ending-stats').innerHTML = `
      <span>現在Lv.${mastery.effectiveLv}</span>
      <span>定着度 ${mastery.retentionPercent}%</span>
      <span>カバー率 ${mastery.coveragePercent}%</span>
    `;
  }
  showScreen('screen-ending');
  playFieldBGM();
  spawnEffects(['✨','⭐','🌟'], 18);
}

/* ══════════════════════════════════════════════════
   やどや：単語・文法の読み返し／HP回復／にがて特訓の入り口
══════════════════════════════════════════════════ */
let currentInnFilter = 'all';

async function goToInn(opts = {}) {
  stopSpeechAll();
  showScreen('screen-inn');
  playFieldBGM();
  await ensureLanguageQuestionData();
  renderLanguageProfile();
  renderInnList(currentInnFilter);

  const lang = langState();
  const row = languageMasteryState().effectiveRow;
  if (lang.currentHp === undefined) lang.currentHp = row.hp;
  if (lang.currentMp === undefined) lang.currentMp = row.mp;
  const needsRest = lang.currentHp < row.hp || lang.currentMp < row.mp;
  const shouldCharge = opts.charge !== false && needsRest;

  if (shouldCharge && P.gold < 10) {
    alert('宿屋に泊まるには10G必要です。無料練習でGoldをためましょう。');
    return;
  }

  // 休憩してHP/MPを全回復
  if (authToken) {
    try {
      const result = await apiFetch('/player/rest', {
        method: 'POST',
        body: JSON.stringify({ language: selectedLanguage, charge: shouldCharge }),
      });
      applyProfile(result.profile);
      applyLanguageProfile(selectedLanguage, result.languageProfile);
      langState().currentMp = row.mp;
    } catch (err) {
      console.error('休憩の同期に失敗しました。ローカルのみ回復します:', err);
      if (shouldCharge) P.gold = Math.max(0, P.gold - 10);
      lang.currentHp = row.hp;
      lang.currentMp = row.mp;
    }
  } else {
    if (shouldCharge) P.gold = Math.max(0, P.gold - 10);
    lang.currentHp = row.hp;
    lang.currentMp = row.mp;
  }
  refreshHeader();
  refreshField();

  const msgEl = $('inn-msg-text');
  if (msgEl) {
    msgEl.textContent = needsRest
      ? `やどやで ひとやすみ。${shouldCharge ? '10Gを はらって ' : ''}HPとMPが ぜんかいふく した！`
      : 'やどやの おばあさんが ほほえんだ。HPもMPも まんたんだ！';
  }
  $('inn-msg')?.classList.remove('hidden');
}

function renderInnList(filter) {
  currentInnFilter = filter;
  document.querySelectorAll('.inn-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });

  const container = $('inn-list');
  if (!container) return;

  let items = [
    ...currentVocabDB().map(it => ({ ...it, category: 'vocab' })),
    ...currentGrammarDB().map(it => ({ ...it, category: 'grammar' })),
    ...currentPhraseDB().map(it => ({ ...it, category: 'phrase' })),
    ...currentCultureDB().map(it => ({ ...it, category: 'culture' })),
  ];

  if (filter === 'vocab')        items = items.filter(it => it.category === 'vocab');
  else if (filter === 'grammar') items = items.filter(it => it.category === 'grammar');
  else if (filter === 'phrase')  items = items.filter(it => it.category === 'phrase');
  else if (filter === 'culture') items = items.filter(it => it.category === 'culture');
  else if (['new','low','weak','mastered'].includes(filter)) items = items.filter(it => classifyItem(it) === filter);

  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = '<p class="inn-empty">このカテゴリーには まだ もんだいが ありません。</p>';
    return;
  }

  const CLASS_BADGE = {
    new:      '<span class="inn-status-badge inn-status-new">🆕 未学習</span>',
    low:      '<span class="inn-status-badge inn-status-low">📖 練習不足</span>',
    weak:     '<span class="inn-weak-badge">🔥 にがて</span>',
    mastered: '<span class="inn-status-badge inn-status-mastered">✅ マスター</span>',
  };

  items.forEach(item => {
    const r = answerStats[item.id];
    const rate = r && r.attempts > 0 ? Math.round((r.correct / r.attempts) * 100) : null;
    const cls = classifyItem(item);
    const weak = cls === 'weak';
    const trainable = cls === 'new' || cls === 'low' || cls === 'weak';

    const row = document.createElement('div');
    row.className = 'inn-item' + (weak ? ' inn-item-weak' : '');

    let mainHtml;
    let speakText = null;
    if (item.category === 'vocab') {
      speakText = item.word;
      mainHtml = `<div class="inn-item-word">${item.word} <button type="button" class="inn-speak-btn" aria-label="読み上げ">🔊</button></div>
         ${item.pron && selectedLanguage !== 'en' ? `<div class="inn-item-pron">${item.pron}</div>` : ''}
         <div class="inn-item-jp">${item.jp}</div>
         <div class="inn-item-ex">${item.ex}</div>`;
    } else if (item.category === 'phrase') {
      speakText = item.phrase;
      const situationLabel = PHRASE_CATEGORIES.find(c => c.code === item.situation);
      mainHtml = `${situationLabel ? `<div class="inn-item-situation">${situationLabel.icon} ${situationLabel.label}</div>` : ''}
         <div class="inn-item-word">${item.phrase} <button type="button" class="inn-speak-btn" aria-label="読み上げ">🔊</button></div>
         ${item.pron ? `<div class="inn-item-pron">${item.pron}</div>` : ''}
         <div class="inn-item-jp">${item.jp}</div>`;
    } else {
      mainHtml = `<div class="inn-item-q">${item.q}</div>
         <div class="inn-item-jp">こたえ: ${item.choices[item.ans]}</div>
         <div class="inn-item-ex">${item.exp}</div>`;
    }

    const rateText  = rate === null ? 'みがくしゅう' : `${rate}%（${r.correct}/${r.attempts}）`;
    const rateClass = rate === null ? 'inn-rate-none' : rate >= 80 ? 'inn-rate-good' : rate >= 50 ? 'inn-rate-mid' : 'inn-rate-bad';
    const retPct = retentionPct(item);
    const retClass = retPct === null ? '' : retPct >= 80 ? 'inn-rate-good' : retPct >= 50 ? 'inn-rate-mid' : 'inn-rate-bad';

    row.innerHTML = `
      <div class="inn-item-main">${mainHtml}</div>
      <div class="inn-item-side">
        <span class="inn-tier-badge">${difficultyLabel(item.lv)}</span>
        <span class="inn-rate ${rateClass}">${rateText}</span>
        ${retPct !== null ? `<span class="inn-retention ${retClass}">🧠 定着度${retPct}%</span>` : ''}
        ${cls !== 'mid' ? CLASS_BADGE[cls] : ''}
        ${trainable ? '<button type="button" class="dq-btn dq-btn-blue inn-train-btn">とっくん</button>' : ''}
      </div>
    `;

    if (trainable) {
      row.querySelector('.inn-train-btn')?.addEventListener('click', () => startFocusedBattle(item));
    }

    if (speakText) {
      row.querySelector('.inn-speak-btn')?.addEventListener('click', ev => {
        ev.stopPropagation();
        speak(speakText);
      });
    }

    container.appendChild(row);
  });
}

/* ══════════════════════════════════════════════════
   ステータス：言語ごとの学習履歴・レベル・マスター状況
══════════════════════════════════════════════════ */
async function goToStatus() {
  stopSpeechAll();
  showScreen('screen-status');
  playFieldBGM();
  if (authToken) {
    try { await loadFullProfile(); } catch (err) { console.error('ステータスの最新化に失敗しました:', err); }
  }
  renderStatusScreen();
}

function renderStatusScreen() {
  const summaryEl = $('status-summary');
  const listEl = $('status-lang-list');
  if (!listEl) return;

  let codes;
  if (authToken) {
    codes = Array.from(new Set([
      ...Object.keys(languageHistory),
      ...Object.keys(P.languages).filter(c => P.languages[c].totalExp > 0),
      selectedLanguage,
    ]));
  } else {
    codes = [selectedLanguage];
  }

  const rows = codes.map(code => {
    const lang = LANGUAGE_OPTIONS.find(l => l.code === code);
    const lp = langState(code);
    const mastery = languageMasteryState(code);
    const row = mastery.effectiveRow;
    const reachedRow = mastery.reachedRow;
    const next = getNextLvRow(reachedRow.lv);
    const cur = lp.totalExp - reachedRow.exp;
    const need = next ? next.exp - reachedRow.exp : 9999;
    const pct = next ? Math.min(100, Math.round(cur / need * 100)) : 100;

    // 出題数・正答率（サーバー集計があればそれを、ゲストはローカルのanswerStatsから算出）
    const hist = authToken ? (languageHistory[code] || { totalAnswers: 0, totalCorrect: 0 }) : (() => {
      const pool = [...vocabDBFor(code), ...grammarDBFor(code), ...phraseDBFor(code), ...cultureDBFor(code)];
      let total = 0, correct = 0;
      pool.forEach(it => { const r = answerStats[it.id]; if (r) { total += r.attempts; correct += r.correct; } });
      return { totalAnswers: total, totalCorrect: correct };
    })();
    const rate = hist.totalAnswers > 0 ? Math.round(hist.totalCorrect / hist.totalAnswers * 100) : null;

    // 未学習・練習不足・にがて・マスター済みの内訳（全言語共通・selectedLanguageに依存しない集計）
    const counts = languageProgressCounts(code);
    const { retentionPercent, coveragePercent, mastered, effectiveLv } = mastery;
    return { code, lang, row, reachedRow, effectiveLv, pct, cur, need, next, hist, rate, counts, retentionPercent, coveragePercent, mastered };
  }).sort((a, b) => b.effectiveLv - a.effectiveLv || b.cur - a.cur);

  if (summaryEl) {
    const masteredCount = rows.filter(r => r.mastered).length;
    summaryEl.innerHTML = `▶ マスターした言語: <b>${masteredCount}</b> / 学習中の言語: <b>${rows.length}</b>`;
  }

  if (rows.length === 0) {
    listEl.innerHTML = '<p class="status-lang-empty">まだ ぼうけんの きろくが ない。フィールドで たたかって みよう！</p>';
    return;
  }

  listEl.innerHTML = '';
  rows.forEach(({ code, lang, row, reachedRow, effectiveLv, pct, hist, rate, counts, retentionPercent, coveragePercent, mastered }) => {
    const card = document.createElement('div');
    card.className = 'status-lang-card' + (mastered ? ' status-lang-mastered' : '');
    const rateText = rate === null ? 'みがくしゅう' : `${rate}%`;
    const retText  = retentionPercent === null ? '―' : `${retentionPercent}%`;
    const retClass = retentionPercent === null ? '' : retentionPercent >= 80 ? 'status-lang-ret-good' : retentionPercent >= 50 ? 'status-lang-ret-mid' : 'status-lang-ret-bad';
    card.innerHTML = `
      <div class="status-lang-head">
        <span class="status-lang-hero">${row.hero}</span>
        <span class="status-lang-name">${lang ? `${lang.label}（${lang.native}）` : code}</span>
        <span class="status-lang-lv">現在Lv.${effectiveLv} ${row.name}</span>
        <span class="status-lang-reached">到達Lv.${reachedRow.lv}</span>
        ${mastered ? '<span class="status-lang-master-badge">👑 エンディング解放</span>' : ''}
      </div>
      <div class="status-lang-expbar-track"><div class="status-lang-expbar-fill" style="width:${pct}%;"></div></div>
      <div class="status-lang-retention ${retClass}">🧠 総合定着度: <b>${retText}</b>${retentionPercent !== null ? '（忘却曲線で時間とともに低下します）' : ''}</div>
      <div class="status-lang-retention">📌 マスター条件: 現在Lv.10 / 定着度${MASTER_RETENTION_THRESHOLD}%以上 / 既存問題カバー率${MASTER_COVERAGE_THRESHOLD}%以上　現在カバー率: <b>${coveragePercent}%</b></div>
      <div class="status-lang-stats">
        <div class="status-lang-stat"><span class="status-lang-stat-val">${hist.totalAnswers}</span><span class="status-lang-stat-lbl">出題数</span></div>
        <div class="status-lang-stat"><span class="status-lang-stat-val">${rateText}</span><span class="status-lang-stat-lbl">正答率</span></div>
        <div class="status-lang-stat"><span class="status-lang-stat-val">${counts.weak}</span><span class="status-lang-stat-lbl">🔥 にがて</span></div>
        <div class="status-lang-stat"><span class="status-lang-stat-val">${counts.new}</span><span class="status-lang-stat-lbl">🆕 未学習</span></div>
        <div class="status-lang-stat"><span class="status-lang-stat-val">${counts.low}</span><span class="status-lang-stat-lbl">📖 練習不足</span></div>
        <div class="status-lang-stat"><span class="status-lang-stat-val">${counts.mastered}</span><span class="status-lang-stat-lbl">✅ マスター単語</span></div>
      </div>
      <div class="status-lang-actions">
        <button type="button" class="dq-btn status-lang-detail-btn">📖 くわしく見る</button>
        <button type="button" class="dq-btn dq-btn-gold status-lang-train-btn">🧠 スマート学習</button>
      </div>
    `;
    card.querySelector('.status-lang-detail-btn')?.addEventListener('click', ev => {
      ev.stopPropagation();
      if (!isLanguageUnlocked(code)) {
        alert(`${lang.label}はまだ学べません。Shopで入門書を購入してください。`);
        goToShop();
        return;
      }
      setLanguage(code);
      goToInn();
    });
    card.querySelector('.status-lang-train-btn')?.addEventListener('click', async ev => {
      ev.stopPropagation();
      if (!isLanguageUnlocked(code)) {
        alert(`${lang.label}はまだ学べません。Shopで入門書を購入してください。`);
        goToShop();
        return;
      }
      if (!canUseCommand('smart')) {
        alert(commandLockMessage('smart'));
        goToShop();
        return;
      }
      setLanguage(code);
      await ensureLanguageQuestionData();
      startBattle('smart');
    });
    card.addEventListener('click', () => {
      if (!isLanguageUnlocked(code)) {
        alert(`${lang.label}はまだ学べません。Shopで入門書を購入してください。`);
        goToShop();
        return;
      }
      setLanguage(code);
      goToInn();
    });
    listEl.appendChild(card);
  });

  if (!authToken) {
    listEl.insertAdjacentHTML('beforeend', '<p class="status-lang-note">ログインすると すべての言語の学習履歴が きろくされ、ここに表示されるようになる。</p>');
  }
}

/* ══════════════════════════════════════════════════
   キーボードどうじょう：選択言語のアルファベット・文字タイピング練習
   （RPGのレベル/EXPとは無関係の独立した練習コーナー。成績はブラウザに保存）
══════════════════════════════════════════════════ */
const LANGUAGE_ALPHABETS = {
  ja: 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'.split(''),
  en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  fr: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ'.split(''),
  es: 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZÁÉÍÓÚÜ'.split(''),
  pt: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÂÃÀÇÉÊÍÓÔÕÚ'.split(''),
  ru: 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'.split(''),
  de: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜẞ'.split(''),
  ar: 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split(''),
  tr: 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'.split(''),
  th: 'กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮะาิีึืุูเแโใไ'.split(''),
  zh: '的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方'.split(''),
  yue: '嘅一係咗唔有我你佢哋呢個人中大上國要時嚟用生到做地出就分對成會可講食飲去返睇聽'.split(''),
  ko: '가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초코토포호구누두루무부수우주추쿠투푸후'.split(''),
  pl: 'AĄBCĆDEĘFGHIJKLŁMNŃOÓPRSŚTUWYZŹŻ'.split(''),
  nl: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  el: 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ'.split(''),
  tl: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  id: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  it: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÀÈÉÌÍÎÒÓÙÚ'.split(''),
  vi: 'AĂÂBCDĐEÊGHIKLMNOÔƠPQRSTUƯVXYÁÀẢÃẠẤẦẨẪẬẮẰẲẴẶÉÈẺẼẸẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌỐỒỔỖỘỚỜỞỠỢÚÙỦŨỤỨỪỬỮỰÝỲỶỸỴ'.split(''),
  bn: 'অআইঈউঊঋএঐওঔকখগঘঙচছজঝঞটঠডঢণতথদধনপফবভমযরলশষসহড়ঢ়য়'.split(''),
  my: 'ကခဂဃငစဆဇဈညဋဌဍဎဏတထဒဓနပဖဗဘမယရလဝသဟအဣဤဥဦဧဩဪ'.split(''),
  si: 'අආඇඈඉඊඋඌඑඒඓඔඕඖකඛගඝචඡජඣටඨඩඪණතථදධනපඵබභමයරලවශෂසහළෆ'.split(''),
  ta: 'அஆஇஈஉஊஎஏஐஒஓஔகஙசஜஞடணதநனபமயரலவழளறனஷஸஹ'.split(''),
  hi: 'अआइईउऊऋएऐओऔकखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह'.split(''),
  ne: 'अआइईउऊऋएऐओऔकखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह'.split(''),
};

const KEYBOARD_LAYOUTS = {
  en: [['Q','W','E','R','T','Y','U','I','O','P'], ['A','S','D','F','G','H','J','K','L'], ['Z','X','C','V','B','N','M']],
  ja: [['Q','W','E','R','T','Y','U','I','O','P'], ['A','S','D','F','G','H','J','K','L'], ['Z','X','C','V','B','N','M']],
  fr: [['A','Z','E','R','T','Y','U','I','O','P'], ['Q','S','D','F','G','H','J','K','L','M'], ['W','X','C','V','B','N']],
  de: [['Q','W','E','R','T','Z','U','I','O','P','Ü'], ['A','S','D','F','G','H','J','K','L','Ö','Ä'], ['Y','X','C','V','B','N','M']],
  pl: [['Q','W','E','R','T','Y','U','I','O','P'], ['A','S','D','F','G','H','J','K','L','Ł'], ['Z','X','C','V','B','N','M']],
  tr: [['F','G','Ğ','I','O','D','R','N','H','P'], ['U','İ','E','A','Ü','T','K','M','L','Y'], ['J','Ö','V','C','Ç','Z','S','B']],
  ru: [['Й','Ц','У','К','Е','Н','Г','Ш','Щ','З','Х','Ъ'], ['Ф','Ы','В','А','П','Р','О','Л','Д','Ж','Э'], ['Я','Ч','С','М','И','Т','Ь','Б','Ю']],
  el: [[';','Σ','Ε','Ρ','Τ','Υ','Θ','Ι','Ο','Π'], ['Α','Σ','Δ','Φ','Γ','Η','Ξ','Κ','Λ'], ['Ζ','Χ','Ψ','Ω','Β','Ν','Μ']],
  ar: [['ض','ص','ث','ق','ف','غ','ع','ه','خ','ح','ج','د'], ['ش','س','ي','ب','ل','ا','ت','ن','م','ك','ط'], ['ئ','ء','ؤ','ر','ى','ة','و','ز','ظ']],
  th: [['ๆ','ไ','ำ','พ','ะ','ั','ี','ร','น','ย','บ','ล'], ['ฟ','ห','ก','ด','เ','้','่','า','ส','ว','ง'], ['ผ','ป','แ','อ','ิ','ื','ท','ม','ใ','ฝ']],
  ko: [['ㅂ','ㅈ','ㄷ','ㄱ','ㅅ','ㅛ','ㅕ','ㅑ','ㅐ','ㅔ'], ['ㅁ','ㄴ','ㅇ','ㄹ','ㅎ','ㅗ','ㅓ','ㅏ','ㅣ'], ['ㅋ','ㅌ','ㅊ','ㅍ','ㅠ','ㅜ','ㅡ']],
  zh: [['Q','W','E','R','T','Y','U','I','O','P'], ['A','S','D','F','G','H','J','K','L'], ['Z','X','C','V','B','N','M']],
  yue: [['Q','W','E','R','T','Y','U','I','O','P'], ['A','S','D','F','G','H','J','K','L'], ['Z','X','C','V','B','N','M']],
  hi: [['ौ','ै','ा','ी','ू','ब','ह','ग','द','ज','ड'], ['ो','े','्','ि','ु','प','र','क','त','च','ट'], ['ॉ','ं','म','न','व','ल','स',',','.']],
  ne: [['ौ','ै','ा','ी','ू','ब','ह','ग','द','ज','ड'], ['ो','े','्','ि','ु','प','र','क','त','च','ट'], ['ॉ','ं','म','न','व','ल','स',',','.']],
  bn: [['ৌ','ৈ','া','ী','ূ','ব','হ','গ','দ','জ','ড'], ['ো','ে','্','ি','ু','প','র','ক','ত','চ','ট'], ['ং','ম','ন','ব','ল','স',',','.']],
  ta: [['ஆ','ஈ','ஊ','ஐ','ஏ','ள','ற','ன','ட','ண'], ['அ','இ','உ','எ','ஒ','ப','ர','க','த','ச'], ['ம','ந','வ','ல','ஸ','ய']],
  my: [['ဆ','တ','န','မ','အ','ပ','က','င','သ','စ','ဟ'], ['ေ','ျ','ိ','်','ါ','့','ြ','ု','ူ','း','ဒ'], ['ဖ','ထ','ခ','လ','ဘ','ညာ','ယ']],
  si: [['ෞ','ැ','ෑ','ි','ී','ු','ූ','බ','ග','ද','ජ'], ['ෝ','ේ','්','ා','ෙ','ට','ය','ව','න','ක','ත'], ['ො','ං','ම','ල','ස','.']],
};

const LATIN_QWERTY_LANGS = ['es','pt','nl','tl','id','it','vi'];
LATIN_QWERTY_LANGS.forEach(code => { KEYBOARD_LAYOUTS[code] = KEYBOARD_LAYOUTS.en; });

let keyboardState = null; // {stage, sequence, idx, correct, mistakes, startTime}
let keyboardComposing = false;
let keyboardInputMode = localStorage.getItem('languageQuest_keyboardMode') || 'pc';

function currentKeyboardAlphabet() {
  return LANGUAGE_ALPHABETS[selectedLanguage] || LANGUAGE_ALPHABETS.en;
}

function keyboardCharLabel() {
  return ['zh', 'yue', 'ja', 'ko'].includes(selectedLanguage) ? '文字' : 'アルファベット';
}

function chunkArray(arr, size) {
  const rows = [];
  for (let i = 0; i < arr.length; i += size) rows.push(arr.slice(i, i + size));
  return rows;
}

function keyboardStagesForCurrentLanguage() {
  const chars = currentKeyboardAlphabet();
  const label = keyboardCharLabel();
  const stages = [
    { id: 'alphabet', label: `${currentLanguage().label}の${label}`, desc: `${chars.length}文字を順番にれんしゅう`, keys: chars, ordered: true },
    { id: 'random', label: 'ランダム練習', desc: `${currentLanguage().label}の文字をランダムに`, keys: chars },
  ];
  if (chars.length > 16) {
    const split = Math.ceil(chars.length / 2);
    stages.splice(1, 0,
      { id: 'first-half', label: '前半の文字', desc: `最初の${split}文字を集中れんしゅう`, keys: chars.slice(0, split) },
      { id: 'second-half', label: '後半の文字', desc: `後半の${chars.length - split}文字を集中れんしゅう`, keys: chars.slice(split) },
    );
  }
  return stages;
}

function keyboardBestKey(stageId) {
  return `kbDojo_best_${selectedLanguage}_${stageId}`;
}

function keyboardLayoutName(code = selectedLanguage) {
  const names = {
    en: 'US QWERTY', ja: '日本語ローマ字入力 / JIS', fr: 'フランス語 AZERTY',
    de: 'ドイツ語 QWERTZ', tr: 'トルコ語 F配列', ru: 'ロシア語 ЙЦУКЕН',
    el: 'ギリシャ語', ar: 'アラビア語', th: 'タイ語 Kedmanee', ko: '韓国語 2-Set',
    zh: '中国語 Pinyin IME', yue: '広東語 Jyutping/Cangjie IME',
    hi: 'ヒンディー語 InScript', ne: 'ネパール語 InScript', bn: 'ベンガル語 InScript',
    ta: 'タミル語 Tamil99/InScript', my: 'ミャンマー語', si: 'シンハラ語',
  };
  return names[code] || 'QWERTY';
}

function keyboardSetupGuideText() {
  const lang = currentLanguage();
  const layout = keyboardLayoutName(lang.code);
  if (uiLang === 'en') {
    if (keyboardInputMode === 'mobile') {
      return `${lang.label} mobile input mode. Tap the on-screen keys to practice without changing your device settings. On a real phone, add ${lang.label} from your OS keyboard settings.`;
    }
    return `PC layout mode: ${layout}. Browsers cannot change your OS keyboard automatically, so this dojo treats it as configured and lets you practice with physical keys or the on-screen keyboard. For real input, add ${lang.label} / ${layout} in your OS input settings.`;
  }
  if (keyboardInputMode === 'mobile') {
    return `${lang.label}のスマホ入力モード。下の画面キーをタップすれば、端末のキーボード設定なしで練習できます。実機では多くの言語でOSの「キーボード追加」から ${lang.label} を追加して入力します。`;
  }
  return `PC配列モード: ${layout}。ブラウザからOSのキーボード設定は自動変更できないため、アプリ内では設定済み扱いにして、実キー入力または下の画面キークリックで練習できます。実機で入力する場合はOSの入力設定に ${lang.label} / ${layout} を追加してください。`;
}

function renderKeyboardAssist() {
  document.querySelectorAll('.kb-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === `kb-mode-${keyboardInputMode}`);
  });
  if ($('keyboard-setup-title')) $('keyboard-setup-title').textContent = `⌨️ ${keyboardLayoutName()} / ${keyboardInputMode === 'mobile' ? tr('mobileMode') : tr('pcMode')}`;
  if ($('keyboard-setup-text')) $('keyboard-setup-text').textContent = keyboardSetupGuideText();
  if ($('kb-layout-hint')) {
    $('kb-layout-hint').textContent = uiLang === 'en'
      ? (keyboardInputMode === 'mobile'
        ? 'Tap the blue key to practice. Mobile mode also helps you learn the PC key positions.'
        : 'The blue key is the next target. Use your physical keyboard or click the keys below.')
      : (keyboardInputMode === 'mobile'
        ? '青いキーをタップして練習。スマホでもPC配列の位置感を覚えられます。'
        : '青いキーが次に打つ文字。実キー入力でも、下のキーをクリックしても練習できます。');
  }
}

function setKeyboardInputMode(mode) {
  keyboardInputMode = mode === 'mobile' ? 'mobile' : 'pc';
  localStorage.setItem('languageQuest_keyboardMode', keyboardInputMode);
  renderKeyboardAssist();
  renderVirtualKeyboard(keyboardState?.sequence?.[keyboardState.idx] || null);
}

function normalizeKeyboardChar(value) {
  return String(value || '').trim().toLocaleUpperCase(currentLanguage().speechLang || undefined);
}

function goToKeyboard() {
  stopSpeechAll();
  showScreen('screen-keyboard');
  playFieldBGM();
  keyboardState = null;
  if ($('keyboard-msg-text')) {
    $('keyboard-msg-text').textContent = uiLang === 'en'
      ? `Welcome to the Keyboard Dojo. Practice ${currentLanguage().label} ${keyboardCharLabel()} and typing. You can use the on-screen keys even without changing OS settings.`
      : `キーボードどうじょうへ ようこそ！ ${currentLanguage().label}の${keyboardCharLabel()}と タイピングを れんしゅうしよう。設定していなくても画面キーで入力できる。`;
  }
  $('keyboard-stage-select')?.classList.remove('hidden');
  $('keyboard-practice')?.classList.add('hidden');
  $('keyboard-result')?.classList.add('hidden');
  renderKeyboardStageList();
  renderKeyboardAssist();
  renderVirtualKeyboard(null);
}

function renderKeyboardStageList() {
  const container = $('keyboard-stage-list');
  if (!container) return;
  container.innerHTML = '';
  keyboardStagesForCurrentLanguage().forEach(stage => {
    const best = Number(localStorage.getItem(keyboardBestKey(stage.id)) || 0);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dq-btn kb-stage-btn';
    btn.innerHTML = `
      <span class="kb-stage-label">${stage.label}</span>
      <span class="kb-stage-desc">${stage.desc}</span>
      ${best > 0 ? `<span class="kb-stage-best">🏆 ベスト正答率 ${best}%</span>` : ''}
    `;
    btn.addEventListener('click', () => startKeyboardStage(stage.id));
    container.appendChild(btn);
  });
}

function buildKeySequence(keys, count) {
  const seq = [];
  for (let i = 0; i < count; i++) seq.push(keys[Math.floor(Math.random() * keys.length)]);
  return seq;
}

function startKeyboardStage(stageId) {
  const stage = keyboardStagesForCurrentLanguage().find(s => s.id === stageId);
  if (!stage) return;
  const sequence = stage.ordered
    ? stage.keys.slice()
    : buildKeySequence(stage.keys, Math.min(30, Math.max(20, stage.keys.length)));
  keyboardState = {
    stage, sequence,
    idx: 0, correct: 0, mistakes: 0, startTime: Date.now(),
  };
  if ($('kb-typing-input')) {
    $('kb-typing-input').value = '';
    $('kb-typing-input').placeholder = tr('kbTypingPh', currentLanguage());
  }
  $('keyboard-stage-select')?.classList.add('hidden');
  $('keyboard-result')?.classList.add('hidden');
  $('keyboard-practice')?.classList.remove('hidden');
  updateKeyboardPracticeUI();
  setTimeout(() => $('kb-typing-input')?.focus(), 50);
}

function updateKeyboardPracticeUI() {
  if (!keyboardState) return;
  const { sequence, idx, correct, mistakes } = keyboardState;
  const target = sequence[idx];
  if ($('kb-target-char'))     $('kb-target-char').textContent = target;
  if ($('kb-progress-text'))   $('kb-progress-text').textContent = `${idx}/${sequence.length}`;
  if ($('kb-progress-fill'))   $('kb-progress-fill').style.width = `${Math.round(idx / sequence.length * 100)}%`;
  if ($('kb-correct-count'))   $('kb-correct-count').textContent = correct;
  if ($('kb-miss-count'))      $('kb-miss-count').textContent = mistakes;
  renderVirtualKeyboard(target);
}

function renderVirtualKeyboard(targetKey) {
  const container = $('virtual-keyboard');
  if (!container) return;
  const rows = keyboardInputMode === 'mobile'
    ? chunkArray(currentKeyboardAlphabet(), 8)
    : (KEYBOARD_LAYOUTS[selectedLanguage] || KEYBOARD_LAYOUTS.en);
  const visibleRows = rows.some(row => row.some(k => normalizeKeyboardChar(k) === normalizeKeyboardChar(targetKey)))
    || !targetKey
    ? rows
    : [[targetKey], ...rows];
  container.innerHTML = visibleRows.map(row => `
    <div class="kb-row">
      ${row.map(k => {
        const cls = ['kb-key'];
        if (normalizeKeyboardChar(k) === normalizeKeyboardChar(targetKey)) cls.push('kb-key-target');
        return `<button type="button" class="${cls.join(' ')}" data-key="${k}">${k}</button>`;
      }).join('')}
    </div>
  `).join('');
  container.querySelectorAll('.kb-key').forEach(keyEl => {
    keyEl.addEventListener('click', () => processKeyboardInput(keyEl.dataset.key));
  });
}

function processKeyboardInput(rawKey) {
  if (!keyboardState) return;
  const screenEl = $('screen-keyboard');
  if (!screenEl || !screenEl.classList.contains('active')) return;
  const key = normalizeKeyboardChar(rawKey);
  if (!key) return;

  const target = keyboardState.sequence[keyboardState.idx];
  const normalizedTarget = normalizeKeyboardChar(target);
  const keyEl = Array.from(document.querySelectorAll('.kb-key')).find(el => normalizeKeyboardChar(el.dataset.key) === key);

  if (key === normalizedTarget) {
    keyboardState.correct++;
    keyEl?.classList.add('kb-key-correct');
    setTimeout(() => keyEl?.classList.remove('kb-key-correct'), 150);
    keyboardState.idx++;
    if (keyboardState.idx >= keyboardState.sequence.length) {
      finishKeyboardStage();
      return;
    }
    updateKeyboardPracticeUI();
  } else {
    keyboardState.mistakes++;
    keyEl?.classList.add('kb-key-wrong');
    setTimeout(() => keyEl?.classList.remove('kb-key-wrong'), 150);
  }
}

function handleKeyboardKeydown(e) {
  if (e.target?.id === 'kb-typing-input' || e.isComposing) return;
  if (!keyboardState) return;
  if (e.key.length !== 1) return; // Shift・Enterなどの装飾キーは無視
  e.preventDefault();
  processKeyboardInput(e.key);
}

function handleKeyboardTextInput(e) {
  if (!keyboardState || keyboardComposing || e.isComposing) return;
  const value = e.target.value;
  if (!value) return;
  processKeyboardInput(Array.from(value).at(-1));
  e.target.value = '';
}

function finishKeyboardStage() {
  const { stage, correct, mistakes, startTime } = keyboardState;
  const elapsedSec = Math.max(1, (Date.now() - startTime) / 1000);
  const total = correct + mistakes;
  const accuracy = total > 0 ? Math.round(correct / total * 100) : 100;
  const cpm = Math.round(correct / elapsedSec * 60);
  const goldReward = Math.max(1, Math.round(accuracy / 12));
  P.gold += goldReward;

  const bestKey = keyboardBestKey(stage.id);
  const prevBest = Number(localStorage.getItem(bestKey) || 0);
  if (accuracy > prevBest) localStorage.setItem(bestKey, String(accuracy));

  if (authToken) {
    apiFetch('/player/reward', {
      method: 'POST',
      body: JSON.stringify({ amount: goldReward, reason: 'keyboard' }),
    })
      .then(result => applyProfile(result.profile))
      .catch(err => console.error('キーボード道場報酬の同期に失敗しました:', err))
      .finally(() => {
        refreshHeader();
        refreshField();
      });
  } else {
    refreshHeader();
    refreshField();
  }

  $('keyboard-practice')?.classList.add('hidden');
  $('keyboard-result')?.classList.remove('hidden');
  if ($('kb-result-title'))     $('kb-result-title').textContent = `${stage.label} クリア！`;
  if ($('kb-result-accuracy'))  $('kb-result-accuracy').textContent = `${accuracy}%`;
  if ($('kb-result-cpm'))       $('kb-result-cpm').textContent = `${cpm}`;
  if ($('kb-result-mistakes'))  $('kb-result-mistakes').textContent = `${mistakes} / +${goldReward}G`;

  keyboardState.finishedStageId = stage.id;
}

function showPasswordResetPanel(show) {
  $('password-reset-panel')?.classList.toggle('hidden', !show);
  showLoginError('');
  if (show) setTimeout(() => $('reset-new-password')?.focus(), 50);
}

/* ══════════════════════════════════════════════════
   23. イベントリスナー
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  refreshSpeechVoices();
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = refreshSpeechVoices;
  applyUiLanguage();
  populateLanguageSelect();
  refreshLanguageText();
  initGoogleLogin();

  $('ui-lang-ja')?.addEventListener('click', () => {
    setUiLanguage('ja');
    populateLanguageSelect();
    renderShop();
    renderKeyboardAssist();
  });
  $('ui-lang-en')?.addEventListener('click', () => {
    setUiLanguage('en');
    populateLanguageSelect();
    renderShop();
    renderKeyboardAssist();
  });

  $('language-select')?.addEventListener('change', e => {
    if (e.target.selectedOptions[0]?.disabled) return;
    if (!isLanguageUnlocked(e.target.value)) {
      const lang = LANGUAGE_OPTIONS.find(l => l.code === e.target.value);
      alert(tr('lockedLanguage', lang));
      populateLanguageSelect();
      return;
    }
    setLanguage(e.target.value);
    ensureLanguageQuestionData().then(() => {
      renderLanguageProfile();
      renderInnList(currentInnFilter);
    });
  });

  $('language-search')?.addEventListener('input', () => {
    populateLanguageSelect();
  });

  /* ── セッション復元（トークンがあれば自動ログイン） ── */
  tryRestoreSession().then(restored => {
    if (restored) {
      $('logout-btn')?.classList.remove('hidden');
      goToField();
    }
  });

  /* ── タイトル → フィールド（ゲスト・セーブなし） ── */
  $('title-start')?.addEventListener('click', goToField);

  /* ── ログイン／新規登録 ── */
  $('login-btn')?.addEventListener('click', async () => {
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    if (!username || !password) { showLoginError(tr('loginRequired')); return; }
    showLoginError('');
    setLoginLoading(true);
    try {
      const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      await handleAuthSuccess(data.token);
    } catch (err) {
      showLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  });

  $('register-btn')?.addEventListener('click', async () => {
    const username = $('login-username').value.trim();
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    if (!username || !email || !password) { showLoginError(tr('registerRequired')); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showLoginError(tr('emailInvalid')); return; }
    if (password.length < 4) { showLoginError(tr('passwordShort')); return; }
    showLoginError('');
    setLoginLoading(true);
    try {
      const data = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) });
      await handleAuthSuccess(data.token);
    } catch (err) {
      showLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  });

  $('forgot-password-btn')?.addEventListener('click', () => showPasswordResetPanel(true));
  $('reset-cancel-btn')?.addEventListener('click', () => showPasswordResetPanel(false));
  $('reset-password-btn')?.addEventListener('click', async () => {
    const username = $('login-username').value.trim();
    const email = $('login-email').value.trim();
    const newPassword = $('reset-new-password').value;
    if (!username || !email || !newPassword) { showLoginError(tr('resetRequired')); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showLoginError(tr('emailInvalid')); return; }
    if (newPassword.length < 4) { showLoginError(tr('passwordShort')); return; }
    showLoginError('');
    setLoginLoading(true);
    try {
      await apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ username, email, newPassword }) });
      $('login-password').value = '';
      $('reset-new-password').value = '';
      showPasswordResetPanel(false);
      showLoginError(tr('resetDone'), 'success');
    } catch (err) {
      showLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  });

  $('logout-btn')?.addEventListener('click', logout);

  /* ── コマンドボタン（モード選択） ── */
  $('command-page-btn')?.addEventListener('click', nextCommandPage);
  setupCommandPagination();
  showCommandPage(1);

  document.querySelectorAll('.dq-cmd-btn').forEach(btn => {
    btn.addEventListener('click', () => enterCommand(btn.dataset.mode));
  });

  /* ── フィールド探索の初期化 ── */
  setupFieldControls();
  requestAnimationFrame(fieldLoop);

  /* ── フィールドへもどる（バトル中断） ── */
  $('battle-flee-btn')?.addEventListener('click', returnFromBattle);
  $('inn-flee-btn')?.addEventListener('click', goToField);
  $('world-back-btn')?.addEventListener('click', () => {
    if (currentWorldRegion) leaveWorldRegion();
    else goToField();
  });
  $('ending-world-btn')?.addEventListener('click', () => {
    showScreen('screen-world');
    renderWorldMap();
    resetHeroPosition('screen-world');
  });
  $('ending-keep-learning-btn')?.addEventListener('click', () => goToInn());
  $('shop-back-btn')?.addEventListener('click', goToField);
  $('status-back-btn')?.addEventListener('click', goToField);
  $('keyboard-back-btn')?.addEventListener('click', goToField);

  /* ── やどやフィルタータブ ── */
  document.querySelectorAll('.inn-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => renderInnList(btn.dataset.filter));
  });
  $('inn-msg-close')?.addEventListener('click', () => $('inn-msg')?.classList.add('hidden'));
  $('field-msg-close')?.addEventListener('click', () => $('field-msg')?.classList.add('hidden'));
  $('world-msg-close')?.addEventListener('click', () => $('world-msg')?.classList.add('hidden'));
  $('status-msg-close')?.addEventListener('click', () => $('status-msg')?.classList.add('hidden'));
  $('keyboard-msg-close')?.addEventListener('click', () => $('keyboard-msg')?.classList.add('hidden'));

  /* ── キーボードどうじょう ── */
  $('kb-mode-pc')?.addEventListener('click', () => setKeyboardInputMode('pc'));
  $('kb-mode-mobile')?.addEventListener('click', () => setKeyboardInputMode('mobile'));
  document.addEventListener('keydown', handleKeyboardKeydown);
  $('kb-typing-input')?.addEventListener('input', handleKeyboardTextInput);
  $('kb-typing-input')?.addEventListener('compositionstart', () => {
    keyboardComposing = true;
  });
  $('kb-typing-input')?.addEventListener('compositionend', e => {
    keyboardComposing = false;
    handleKeyboardTextInput(e);
  });
  $('kb-retry-btn')?.addEventListener('click', () => {
    if (keyboardState?.stage) startKeyboardStage(keyboardState.stage.id);
  });
  $('kb-back-to-stages-btn')?.addEventListener('click', () => {
    keyboardState = null;
    $('keyboard-result')?.classList.add('hidden');
    $('keyboard-stage-select')?.classList.remove('hidden');
    renderKeyboardStageList();
  });

  /* ── 「ぼうけんのきろく」ボックスをタップでステータス画面へ ── */
  $('status-window-btn')?.addEventListener('click', goToStatus);
  $('status-window-btn')?.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); goToStatus(); }
  });

  /* ── 選択肢ボタン ── */
  document.querySelectorAll('.dq-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      handleAnswer(parseInt(btn.dataset.idx, 10));
    });
  });
  $('magic-hint-btn')?.addEventListener('click', useHintMagic);
  $('magic-cut-btn')?.addEventListener('click', useChoiceCutMagic);
  $('magic-heal-btn')?.addEventListener('click', useHealMagic);

  /* ── タイピング送信（Enterで回答／回答後Enterで次へ） ── */
  $('typing-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (battle.answered) nextQuestion();
      else handleAnswer($('typing-input').value);
    }
  });

  /* ── リスニング：もう一度きく ── */
  $('listen-play-btn')?.addEventListener('click', () => {
    const q = battle.questions[battle.cur];
    if (q?.speakWord) speak(q.speakWord);
  });

  /* ── たんご／フレーズ／タイピング：🔊きく ── */
  $('question-speak-btn')?.addEventListener('click', () => {
    const q = battle.questions[battle.cur];
    if (q?.speakWord) speak(q.speakWord);
  });

  /* ── スピーキング：はなす！ ── */
  $('speak-btn')?.addEventListener('click', () => {
    if (battle.answered) return;
    const q = battle.questions[battle.cur];
    if (!q) return;
    startSpeaking(q.speakWord, (ok, heard) => {
      if (ok === null) {
        // エラー・聞き取れなかった（再試行可）
        $('speak-result').textContent = heard || '';
        return;
      }
      $('speak-result').textContent =
        ok ? `✅ 認識: "${heard}"` : `❌ 認識: "${heard}" → 正解は "${q.speakWord}"`;
      handleAnswer(ok, heard);
    });
  });

  /* ── 次へボタン ── */
  $('next-btn')?.addEventListener('click', nextQuestion);

  /* ── リザルト：もう一度 ── */
  $('retry-btn')?.addEventListener('click', () => {
    if (battle.isBoss) enterBossZone(battle.bossId);
    else if (battle.isRandomEncounter) triggerRandomEncounter();
    else startBattle(battle.mode);
  });

  /* ── リザルト：フィールド／せかいマップへ ── */
  $('field-btn')?.addEventListener('click', returnFromBattle);

  /* ── レベルアップダイアログを閉じる ── */
  $('lu-close')?.addEventListener('click', () => {
    $('levelup-overlay').classList.add('hidden');
  });

  /* ── 称号ダイアログを閉じる ── */
  $('ti-close')?.addEventListener('click', () => {
    $('title-overlay').classList.add('hidden');
  });

  /* ── BGMトグルボタン ── */
  $('bgm-toggle')?.addEventListener('click', () => {
    initAudio();
    toggleBGM();
  });

  /* ── アイテムゲットオーバーレイを閉じる ── */
  $('item-drop-close')?.addEventListener('click', () => {
    $('item-drop-overlay').classList.add('hidden');
    renderInventoryWindow();
  });

  /* ── 初期状態 ── */
  refreshHeader();
  refreshExpBar();
  refreshEquipmentDisplay();
});
