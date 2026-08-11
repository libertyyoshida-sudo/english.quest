/* =====================================================
   LANGUAGE QUEST — app.js   完全版
   単語/文法/タイピング/リスニング/スピーキング
   EXP・レベル・称号・コンボ・敵撃破演出
===================================================== */
'use strict';

import {
  ITEM_DB, LEVEL_TABLE, TITLE_DEFS, EXP_BASE, GOLD_BASE,
  comboMult, getLvRow, getNextLvRow, toeicLabel, retentionScore,
} from './shared/gameData.js';
import {
  VOCAB_DB, GRAMMAR_DB, LANGUAGE_OPTIONS, LANGUAGE_PROFILES, MULTI_GRAMMAR_DB, MULTI_VOCAB_DB,
  PHRASE_DB, MULTI_PHRASE_DB, PHRASE_CATEGORIES,
} from './shared/questionData.js';

/* ══════════════════════════════════════════════════
   0. バックエンドAPI（ログイン時のみ使用。未ログインはゲストモードでローカル動作）
══════════════════════════════════════════════════ */
const API_BASE = import.meta.env.DEV
  ? 'http://localhost:3001/api'
  : 'https://english-quest-26nu.onrender.com/api';
let authToken = localStorage.getItem('eigoDQ_token') || null;
let selectedLanguage = localStorage.getItem('languageQuest_language') || 'en';
const questionDataCache = {};
const questionDataLoading = {};

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
}

// サーバーから受け取った LanguageProfile（言語ごとのレベル/EXP/HP）を P.languages に反映
function applyLanguageProfile(language, lp) {
  P.languages[language] = { totalExp: lp.totalExp, level: lp.level, currentHp: lp.currentHp };
}

// 未初期化の言語は初回アクセス時にデフォルト値で作成して返す
function langState(code = selectedLanguage) {
  if (!P.languages[code]) {
    P.languages[code] = { totalExp: 0, level: 1, currentHp: getLvRow(0).hp };
  }
  return P.languages[code];
}

// ログイン直後・再開時にプロファイル全体（称号・回答統計・言語別レベルを含む）を取得して反映
async function loadFullProfile() {
  const data = await apiFetch('/player/profile');
  applyProfile(data.profile);
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

function showLoginError(msg) {
  const el = $('login-error');
  if (el) el.textContent = msg || '';
}

// ログイン/登録中のローディング表示。Renderの無料プランはスリープからの復帰に
// 数十秒かかることがあるため、経過時間に応じてメッセージを切り替えて不安を減らす
let loginLoadingTimers = [];
function setLoginLoading(isLoading) {
  loginLoadingTimers.forEach(clearTimeout);
  loginLoadingTimers = [];

  const loadingEl = $('login-loading');
  const textEl = $('login-loading-text');
  const controls = [$('login-btn'), $('register-btn'), $('login-username'), $('login-password')];

  controls.forEach(el => { if (el) el.disabled = isLoading; });

  if (isLoading) {
    loadingEl?.classList.remove('hidden');
    const messages = [
      { delay: 0,     text: '🔮 つうしんちゅう…' },
      { delay: 4000,  text: '⏳ サーバーがねむっているようです…おこしています' },
      { delay: 12000, text: '🌙 はじめてのアクセスは めざめに1分ほどかかることがあります。もう少しお待ちください…' },
      { delay: 30000, text: '🐢 もうすぐです！このままお待ちください…' },
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
  equipment: { weapon: ITEM_DB.w1, armor: ITEM_DB.a1 },
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
  { name:'スライム',     sprite:'🟦', lv:1, expRate:1.0 },
  { name:'ドラキー',     sprite:'🦇', lv:2, expRate:1.1 },
  { name:'おおガラス',   sprite:'🐦', lv:3, expRate:1.2 },
  { name:'メラゴースト', sprite:'👻', lv:4, expRate:1.3 },
  { name:'ゴーレム',     sprite:'🗿', lv:5, expRate:1.5 },
  { name:'キメラ',       sprite:'🦅', lv:6, expRate:1.7 },
  { name:'バーサーカー', sprite:'👹', lv:7, expRate:2.0 },
  { name:'ドラゴン',     sprite:'🐉', lv:8, expRate:2.5 },
  { name:'まおうのてさき',sprite:'😈', lv:9, expRate:3.0 },
  { name:'だいまおう',   sprite:'💀', lv:10,expRate:4.0 },
];
// tier: 'all' か 1〜10。問題のティア（TOEICレベル）と同じ数値で敵の強さを決める
function pickEnemy(tier) {
  const baseTier = tier === 'all' ? getLvRow(langState().totalExp).lv : tier;
  const spread = Math.floor(Math.random() * 3) - 1; // -1〜+1でばらつきを持たせる
  const idx = Math.min(9, Math.max(0, baseTier - 1 + spread));
  return ENEMIES[idx];
}


/* ══════════════════════════════════════════════════
   6〜7. 単語・文法データは shared/questionData.js に集約
══════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════
   8. ユーティリティ
══════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
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

function cacheQuestionData(language, questions) {
  questionDataCache[language] = {
    vocab: questions.filter(q => q.category === 'vocab'),
    grammar: questions.filter(q => q.category === 'grammar'),
    phrase: questions.filter(q => q.category === 'phrase'),
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
      return null;
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
  el.innerHTML = `
    <button type="button" class="language-profile-toggle">
      <span class="language-profile-title">📚 ${lang.label}（${lang.native}）</span>
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
    opt.textContent = `${lang.label}（${lang.native}）${lang.status ? ` - ${lang.status}` : ''}`;
    select.appendChild(opt);
  });
  if (languages.some(lang => lang.code === selectedLanguage)) {
    select.value = selectedLanguage;
  } else if (languages.length > 0) {
    select.value = languages[0].code;
  } else {
    const opt = document.createElement('option');
    opt.value = selectedLanguage;
    opt.textContent = '該当する言語がありません';
    opt.disabled = true;
    select.appendChild(opt);
  }
}

function refreshLanguageText() {
  const lang = currentLanguage();
  if ($('title-language-copy')) $('title-language-copy').textContent = '言語習得への旅';
  if ($('field-msg-text')) {
    $('field-msg-text').textContent = `どこへ　むかうか？　まおうをたおすには　${lang.label}のちからが　ひつようだ！`;
  }
  if ($('typing-input')) $('typing-input').placeholder = `${lang.label}でうってね（Enterでかいとう）`;
  refreshLevelOptions();
}

function refreshLevelOptions() {
  const select = $('level-select');
  if (!select) return;
  const options = [
    ['auto', 'おまかせ（勇者レベルに連動）', 'おまかせ（ゆうしゃレベルに連動）'],
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
    ['all', 'ぜんぶ（ランダム混合）', 'ぜんぶ（ランダム混合）'],
  ];
  const currentValue = select.value || 'auto';
  select.innerHTML = '';
  options.forEach(([value, enText, otherText]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = selectedLanguage === 'en' ? enText : otherText;
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
}

// level-select の値（'auto' | 'all' | '1'〜'10'）を実際のティア（'all' か 1〜10の数値）に解決する
// 'auto' は勇者の現在レベルに連動させる（敵の強さ・問題レベルが自動で上がる）
function resolveLevelSelection(rawValue) {
  if (rawValue === 'all') return 'all';
  if (rawValue === 'auto') return getLvRow(langState().totalExp).lv;
  return parseInt(rawValue, 10);
}

function filterLevel(pool, level) {
  if (level === 'all') return pool;
  return pool.filter(x => x.lv === level);
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
  const pool = [...vocabDBFor(code), ...grammarDBFor(code), ...phraseDBFor(code)];
  const scores = pool
    .map(it => retentionScore(answerStats[it.id]))
    .filter(s => s !== null);
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100);
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
  return code === 'en' ? VOCAB_DB : (MULTI_VOCAB_DB[code] || VOCAB_DB);
}
function grammarDBFor(code) {
  return code === 'en' ? GRAMMAR_DB : (MULTI_GRAMMAR_DB[code] || []);
}
function phraseDBFor(code) {
  return code === 'en' ? PHRASE_DB : (MULTI_PHRASE_DB[code] || PHRASE_DB);
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
  const next = getNextLvRow(row.lv);
  $('lu-hero').textContent = row.hero;
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

function refreshHeader() {
  const lang = langState();
  const row = getLvRow(lang.totalExp);
  const maxHp = row.hp;
  if (lang.currentHp === undefined || lang.currentHp > maxHp) {
    lang.currentHp = maxHp;
  }
  if ($('hdr-hero'))  $('hdr-hero').textContent  = row.hero;
  if ($('hdr-lv'))    $('hdr-lv').textContent    = row.lv;
  if ($('hdr-title')) $('hdr-title').textContent = row.name;
  if ($('hdr-hp'))    $('hdr-hp').textContent    = `${lang.currentHp}/${maxHp}`;
  if ($('hdr-mp'))    $('hdr-mp').textContent    = row.mp;
  if ($('hdr-gold'))  $('hdr-gold').textContent  = P.gold;
}

function refreshField() {
  let total=0, correct=0;
  Object.values(answerStats).forEach(r => { total+=r.attempts; correct+=r.correct; });
  if ($('st-answers')) $('st-answers').textContent = total;
  if ($('st-correct')) $('st-correct').textContent = correct;
  if ($('st-rate'))    $('st-rate').textContent    = total>0 ? Math.round(correct/total*100)+'%' : '―';
  if ($('st-gold'))    $('st-gold').textContent    = P.gold;
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
    const chip = document.createElement('span');
    chip.className   = 'badge-chip';
    chip.textContent = `${def.icon} ${def.name}`;
    container.appendChild(chip);
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
  const vPool = filterLevel(vocabDB, level);
  const gPool = filterLevel(grammarDB, level);
  const activeVPool = vPool.length ? vPool : vocabDB;
  let questions = [];

  if (mode === 'vocab') {
    const pool = weightedPool(activeVPool);
    const seen = new Set();
    for (const item of pool) {
      if (!seen.has(item.id)) { seen.add(item.id); questions.push(buildVocabQ(item, activeVPool)); }
      if (questions.length >= count) break;
    }
  } else if (mode === 'grammar') {
    if (gPool.length) {
      const pool = weightedPool(gPool);
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
    const pPool = filterLevel(phraseDB, level);
    const activePPool = pPool.length ? pPool : phraseDB;
    const pool = weightedPool(activePPool);
    const seen = new Set();
    for (const item of pool) {
      if (!seen.has(item.id)) { seen.add(item.id); questions.push(buildPhraseQ(item, activePPool)); }
      if (questions.length >= count) break;
    }
  } else if (mode === 'weak') {
    const allPool = [...vocabDB, ...grammarDB];
    const filtered = filterLevel(allPool, level);
    const activeFiltered = filtered.length ? filtered : allPool;
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
    const allPool = [...vocabDB, ...grammarDB, ...phraseDB];
    const filtered = filterLevel(allPool, level);
    const activeFiltered = filtered.length ? filtered : allPool;
    const pool = smartPool(activeFiltered);
    const seen = new Set();
    for (const item of pool) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      if (item.situation) questions.push(buildPhraseQ(item, phraseDB));
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

function speak(text, onEnd) {
  if (!window.speechSynthesis) { if (onEnd) onEnd(); return; }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang  = currentLanguage().speechLang;
  utter.rate  = 0.85;
  utter.pitch = 1.0;
  if (onEnd) utter.onend = onEnd;
  // 少し遅らせて確実に再生
  scheduleSpeech(() => window.speechSynthesis.speak(utter), 120);
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
  const mode = item.category === 'grammar' ? 'grammar' : item.category === 'phrase' ? 'phrase' : 'vocab';
  const q     = item.category === 'grammar' ? buildGrammarQ(item)
              : item.category === 'phrase'  ? buildPhraseQ(item, currentPhraseDB())
              : buildVocabQ(item, currentVocabDB());
  const enemy = pickEnemy(item.lv);

  battle = {
    mode, questions: [q], cur: 0,
    correct: 0, wrongItems: [],
    combo: 0, expGained: 0, goldGained: 0,
    answered: false, enemy,
    activeEffects: [], comboShield: false, comboShieldUsed: false,
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

  if (q.type === 'typing') {
    $('typing-wrap').classList.remove('hidden');
    $('typing-input').value = '';
    setTimeout(() => $('typing-input').focus(), 100);

  } else if (q.type === 'listening') {
    $('choices-wrap').classList.remove('hidden');
    $('listening-wrap').classList.remove('hidden');
    renderChoices(q);
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
  let expGot = 0, goldGot = 0, damage = 0;

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
    const maxHp = getLvRow(lang.totalExp).hp;
    damage = Math.max(5, Math.round(maxHp * 0.2));
    if (lang.currentHp === undefined) lang.currentHp = maxHp;
    lang.currentHp = Math.max(0, lang.currentHp - damage);
    refreshHeader();
  }

  setTimeout(checkTitles, 600);
  return { expGot, goldGot, damage };
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
  let expGot = 0, goldGot = 0, damage = 0;
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
      ({ expGot, goldGot, damage } = localAnswerUpdate(q, ok));
    }
  } else {
    ({ expGot, goldGot, damage } = localAnswerUpdate(q, ok));
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
    const row = getLvRow(langState().totalExp);
    msg = `💀 まちがい… プレイヤーに ${damage} ダメージ！ (HP:${langState().currentHp}/${row.hp})\nせいかいは「${q.type==='typing'||q.type==='speaking' ? q.ans : q.choices[q.ans]}」`;
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

  const row = getLvRow(langState().totalExp);
  $('result-hero').textContent = row.hero;

  let title = '', msg = '';
  if (rate === 100) { title='かんぺきしょうり！'; msg='まおうもたじたじ！すべてのもんだいをせいかい！'; }
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
    beginner:     ['w1','w2','a1','a2','c1','c2','c3'],
    intermediate: ['w2','w3','a2','a3','c1','c2','c3'],
    advanced:     ['w3','w4','w5','a3','a4','a5','c1','c2','c3'],
    all:          ['w1','w2','a1','a2','c1','c2','c3'],
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
  if (statEl) statEl.textContent = stat;

  const ok = addToInventory(item);
  const msgEl = $('item-drop-msg');
  if (msgEl) msgEl.textContent = ok ? 'インベントリに追加した！' : 'インベントリがいっぱいだ！';

  playSoundItem();
  spawnEffects(['✨','⭐','💫'], 10);
  overlay.classList.remove('hidden');
}

function equipItem(itemIdx) {
  const item = P.inventory[itemIdx];
  if (!item) return;
  if (item.type === 'weapon') {
    P.equipment.weapon = item;
  } else if (item.type === 'armor') {
    P.equipment.armor = item;
  }
  refreshEquipmentDisplay();
  renderInventoryWindow();
}

function useItem(itemIdx) {
  const item = P.inventory[itemIdx];
  if (!item || item.type !== 'consumable') return;
  P.activeEffects.push({ ...item });
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
      btn.textContent = 'そうびする';
      btn.addEventListener('click', () => equipItem(idx));
      row.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.className   = 'dq-btn dq-btn-green inv-btn';
      btn.textContent = 'つかう';
      btn.addEventListener('click', () => useItem(idx));
      row.appendChild(btn);
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
  'screen-world': { canvasId: 'world-canvas', heroId: 'world-hero', onTouch: bossId => enterBossZone(bossId) },
};
// 画面ごとの勇者位置（%）。画面を切り替えるたびに入り口の位置へリセットする
const heroPositions = {
  'screen-field': { x: 50, y: 50 },
  'screen-world': { x: 50, y: 92 },
};
const moveKeys = new Set();
const touchedFieldIcons = new Set();
let fieldLastTime = null;
let worldEncounterTimer = 0;
let nextEncounterAt = randomEncounterThreshold();

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
  const start = screenId === 'screen-world' ? { x: 50, y: 92 } : { x: 50, y: 50 };
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
    const key   = iconEl.dataset.mode || iconEl.dataset.boss;
    const iRect = iconEl.getBoundingClientRect();
    const iCx = iRect.left + iRect.width / 2;
    const iCy = iRect.top  + iRect.height / 2;
    const dist = Math.hypot(heroCx - iCx, heroCy - iCy);

    if (dist < touchDist) {
      if (!touchedFieldIcons.has(key)) {
        touchedFieldIcons.add(key);
        active.onTouch(key);
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
  const row = getLvRow(lang.totalExp);
  if (lang.currentHp === undefined || lang.currentHp <= 0) {
    lang.currentHp = row.hp; // 宿屋でHP全回復
  }
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
  if (mode === 'inn' || mode === 'review') goToInn();
  else if (mode === 'world') goToWorld();
  else if (mode === 'status') goToStatus();
  else startBattle(mode);
}

let commandPage = 1;
const COMMAND_PAGE_MAX = 2;

function showCommandPage(page) {
  commandPage = page < 1 ? COMMAND_PAGE_MAX : page > COMMAND_PAGE_MAX ? 1 : page;
  const commandWindow = $('command-window');
  const pageIndicator = $('command-page-indicator');
  if (commandWindow) commandWindow.dataset.page = String(commandPage);
  if (pageIndicator) pageIndicator.textContent = `${commandPage}/${COMMAND_PAGE_MAX}`;
}

function nextCommandPage() {
  showCommandPage(commandPage + 1);
}

/* ══════════════════════════════════════════════════
   せかいマップ：まちの外・ランダムせんとう・ボス戦
══════════════════════════════════════════════════ */
const WORLD_BOSSES = {
  forest:   { tier: 3,  count: 10, title: 'もりの ぬし' },
  cave:     { tier: 6,  count: 12, title: 'どうくつの ぬし' },
  mountain: { tier: 8,  count: 14, title: 'やまの ドラゴン' },
  castle:   { tier: 10, count: 16, title: 'まおうのしろ の あるじ' },
};

function goToWorld() {
  stopSpeechAll();
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
// ※「にげる」ボタンは常にまちへ確実に戻す（下のイベントリスナー参照）。
//   せかいマップに戻す仕様だと、ランダムエンカウントが連続してまちに戻れなくなる問題があったため。
function returnFromBattle() {
  if (battle && battle.returnTo === 'screen-world') goToWorld();
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
  const tier  = getLvRow(langState().totalExp).lv;
  const qs    = buildQuestions(mode, tier, 4);
  if (qs.length === 0) return;

  const enemy = pickEnemy(tier);
  battle = {
    mode, questions: qs, cur: 0,
    correct: 0, wrongItems: [],
    combo: 0, expGained: 0, goldGained: 0,
    answered: false, enemy,
    activeEffects: [], comboShield: false, comboShieldUsed: false,
    returnTo: 'screen-world', isRandomEncounter: true,
  };

  const msgEl = $('world-msg-text');
  if (msgEl) msgEl.textContent = `${enemy.sprite} ${enemy.name}が とびだしてきた！`;

  setupBattleScreenUI(enemy);
  showScreen('screen-battle');
  renderQuestion();
}

// 単語＋文法を混ぜたボス戦用の問題セットを作る
function buildBossQuestions(tier, count) {
  const vocabCount   = Math.ceil(count * 0.7);
  const grammarCount = count - vocabCount;
  const qs = [
    ...buildQuestions('vocab', tier, vocabCount),
    ...buildQuestions('grammar', tier, grammarCount),
  ];
  return shuffle(qs);
}

async function enterBossZone(bossId) {
  const boss = WORLD_BOSSES[bossId];
  if (!boss) return;
  stopSpeechAll();
  await ensureLanguageQuestionData();

  const qs = buildBossQuestions(boss.tier, boss.count);
  if (qs.length === 0) {
    alert('このボスに ちょうせんするには もんだいが たりません。');
    return;
  }

  const enemy = { ...ENEMIES[boss.tier - 1], name: boss.title };

  battle = {
    mode: 'boss', questions: qs, cur: 0,
    correct: 0, wrongItems: [],
    combo: 0, expGained: 0, goldGained: 0,
    answered: false, enemy,
    activeEffects: [], comboShield: false, comboShieldUsed: false,
    returnTo: 'screen-world', isBoss: true, bossId,
  };

  setupBattleScreenUI(enemy);
  showScreen('screen-battle');
  renderQuestion();
}

/* ══════════════════════════════════════════════════
   やどや：単語・文法の読み返し／HP回復／にがて特訓の入り口
══════════════════════════════════════════════════ */
let currentInnFilter = 'all';

async function goToInn() {
  stopSpeechAll();
  showScreen('screen-inn');
  playFieldBGM();
  await ensureLanguageQuestionData();
  renderLanguageProfile();
  renderInnList(currentInnFilter);

  // 休憩してHPを全回復
  if (authToken) {
    try {
      const result = await apiFetch('/player/rest', {
        method: 'POST',
        body: JSON.stringify({ language: selectedLanguage }),
      });
      applyLanguageProfile(selectedLanguage, result.languageProfile);
    } catch (err) {
      console.error('休憩の同期に失敗しました。ローカルのみ回復します:', err);
      langState().currentHp = getLvRow(langState().totalExp).hp;
    }
  } else {
    langState().currentHp = getLvRow(langState().totalExp).hp;
  }
  refreshHeader();

  const msgEl = $('inn-msg-text');
  if (msgEl) {
    msgEl.textContent = 'やどやの おばあさんが うたを うたってくれた。HPが ぜんかいふく した！';
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
  ];

  if (filter === 'vocab')        items = items.filter(it => it.category === 'vocab');
  else if (filter === 'grammar') items = items.filter(it => it.category === 'grammar');
  else if (filter === 'phrase')  items = items.filter(it => it.category === 'phrase');
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
    const row = getLvRow(lp.totalExp);
    const next = getNextLvRow(row.lv);
    const cur = lp.totalExp - row.exp;
    const need = next ? next.exp - row.exp : 9999;
    const pct = next ? Math.min(100, Math.round(cur / need * 100)) : 100;

    // 出題数・正答率（サーバー集計があればそれを、ゲストはローカルのanswerStatsから算出）
    const hist = authToken ? (languageHistory[code] || { totalAnswers: 0, totalCorrect: 0 }) : (() => {
      const pool = [...vocabDBFor(code), ...grammarDBFor(code), ...phraseDBFor(code)];
      let total = 0, correct = 0;
      pool.forEach(it => { const r = answerStats[it.id]; if (r) { total += r.attempts; correct += r.correct; } });
      return { totalAnswers: total, totalCorrect: correct };
    })();
    const rate = hist.totalAnswers > 0 ? Math.round(hist.totalCorrect / hist.totalAnswers * 100) : null;

    // 未学習・練習不足・にがて・マスター済みの内訳（全言語共通・selectedLanguageに依存しない集計）
    const pool = [...vocabDBFor(code), ...grammarDBFor(code), ...phraseDBFor(code)];
    const counts = { new: 0, low: 0, weak: 0, mid: 0, mastered: 0 };
    pool.forEach(it => { counts[classifyItem(it)]++; });
    const retentionPercent = languageRetention(code);

    const mastered = row.lv >= 10;
    return { code, lang, row, pct, cur, need, next, hist, rate, counts, retentionPercent, mastered };
  }).sort((a, b) => b.row.lv - a.row.lv || b.cur - a.cur);

  if (summaryEl) {
    const masteredCount = rows.filter(r => r.mastered).length;
    summaryEl.innerHTML = `▶ マスターした言語: <b>${masteredCount}</b> / 学習中の言語: <b>${rows.length}</b>`;
  }

  if (rows.length === 0) {
    listEl.innerHTML = '<p class="status-lang-empty">まだ ぼうけんの きろくが ない。フィールドで たたかって みよう！</p>';
    return;
  }

  listEl.innerHTML = '';
  rows.forEach(({ code, lang, row, pct, hist, rate, counts, retentionPercent, mastered }) => {
    const card = document.createElement('div');
    card.className = 'status-lang-card' + (mastered ? ' status-lang-mastered' : '');
    const rateText = rate === null ? 'みがくしゅう' : `${rate}%`;
    const retText  = retentionPercent === null ? '―' : `${retentionPercent}%`;
    const retClass = retentionPercent === null ? '' : retentionPercent >= 80 ? 'status-lang-ret-good' : retentionPercent >= 50 ? 'status-lang-ret-mid' : 'status-lang-ret-bad';
    card.innerHTML = `
      <div class="status-lang-head">
        <span class="status-lang-hero">${row.hero}</span>
        <span class="status-lang-name">${lang ? `${lang.label}（${lang.native}）` : code}</span>
        <span class="status-lang-lv">Lv.${row.lv} ${row.name}</span>
        ${mastered ? '<span class="status-lang-master-badge">👑 マスター</span>' : ''}
      </div>
      <div class="status-lang-expbar-track"><div class="status-lang-expbar-fill" style="width:${pct}%;"></div></div>
      <div class="status-lang-retention ${retClass}">🧠 総合定着度: <b>${retText}</b>${retentionPercent !== null ? '（忘却曲線で時間とともに低下します）' : ''}</div>
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
      setLanguage(code);
      goToInn();
    });
    card.querySelector('.status-lang-train-btn')?.addEventListener('click', async ev => {
      ev.stopPropagation();
      setLanguage(code);
      await ensureLanguageQuestionData();
      startBattle('smart');
    });
    card.addEventListener('click', () => { setLanguage(code); goToInn(); });
    listEl.appendChild(card);
  });

  if (!authToken) {
    listEl.insertAdjacentHTML('beforeend', '<p class="status-lang-note">ログインすると すべての言語の学習履歴が きろくされ、ここに表示されるようになる。</p>');
  }
}

/* ══════════════════════════════════════════════════
   23. イベントリスナー
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  populateLanguageSelect();
  refreshLanguageText();

  $('language-select')?.addEventListener('change', e => {
    if (e.target.selectedOptions[0]?.disabled) return;
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
    if (!username || !password) { showLoginError('なまえとひみつのコードを入力してください'); return; }
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
    const password = $('login-password').value;
    if (!username || !password) { showLoginError('なまえとひみつのコードを入力してください'); return; }
    if (password.length < 4) { showLoginError('ひみつのコードは4文字以上にしてください'); return; }
    showLoginError('');
    setLoginLoading(true);
    try {
      const data = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
      await handleAuthSuccess(data.token);
    } catch (err) {
      showLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  });

  $('logout-btn')?.addEventListener('click', logout);

  /* ── コマンドボタン（モード選択） ── */
  $('command-page-btn')?.addEventListener('click', nextCommandPage);
  showCommandPage(1);

  document.querySelectorAll('.dq-cmd-btn').forEach(btn => {
    btn.addEventListener('click', () => enterCommand(btn.dataset.mode));
  });

  /* ── フィールド探索の初期化 ── */
  setupFieldControls();
  requestAnimationFrame(fieldLoop);

  /* ── フィールドへもどる（バトル中断） ── */
  // 「にげる」は必ずまちへ戻す（せかいマップへ戻すと連続エンカウントで詰むため、確実な避難先として固定）
  $('battle-flee-btn')?.addEventListener('click', goToField);
  $('inn-flee-btn')?.addEventListener('click', goToField);
  $('world-back-btn')?.addEventListener('click', goToField);
  $('status-back-btn')?.addEventListener('click', goToField);

  /* ── やどやフィルタータブ ── */
  document.querySelectorAll('.inn-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => renderInnList(btn.dataset.filter));
  });
  $('inn-msg-close')?.addEventListener('click', () => $('inn-msg')?.classList.add('hidden'));
  $('field-msg-close')?.addEventListener('click', () => $('field-msg')?.classList.add('hidden'));
  $('world-msg-close')?.addEventListener('click', () => $('world-msg')?.classList.add('hidden'));
  $('status-msg-close')?.addEventListener('click', () => $('status-msg')?.classList.add('hidden'));

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
