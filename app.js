/* =====================================================
   えいごドラクエ — app.js   完全版
   単語/文法/タイピング/リスニング/スピーキング
   EXP・レベル・称号・コンボ・敵撃破演出
===================================================== */
'use strict';

import {
  ITEM_DB, LEVEL_TABLE, TITLE_DEFS, EXP_BASE, GOLD_BASE,
  comboMult, getLvRow, getNextLvRow,
} from './shared/gameData.js';
import { VOCAB_DB, GRAMMAR_DB } from './shared/questionData.js';

/* ══════════════════════════════════════════════════
   0. バックエンドAPI（ログイン時のみ使用。未ログインはゲストモードでローカル動作）
══════════════════════════════════════════════════ */
const API_BASE = import.meta.env.DEV
  ? 'http://localhost:3001/api'
  : 'https://english-quest-26nu.onrender.com/api';
let authToken = localStorage.getItem('eigoDQ_token') || null;

async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `通信エラー (${res.status})`);
  return data;
}

// サーバーから受け取った PlayerProfile を P に反映
function applyProfile(profile) {
  P.totalExp      = profile.totalExp;
  P.gold          = profile.gold;
  P.lv            = profile.level;
  P.currentHp     = profile.currentHp;
  P.maxCombo      = profile.maxCombo;
  P.hasPerfect    = profile.hasPerfect;
  P.totalAnswers  = profile.totalAnswers;
  P.totalCorrect  = profile.totalCorrect;
  P.listenCorrect = profile.listenCorrect;
  P.speakCorrect  = profile.speakCorrect;
  P.equipment.weapon = ITEM_DB[profile.equippedWeaponId] || ITEM_DB.w1;
  P.equipment.armor  = ITEM_DB[profile.equippedArmorId]  || ITEM_DB.a1;
}

// ログイン直後・再開時にプロファイル全体（称号・回答統計を含む）を取得して反映
async function loadFullProfile() {
  const data = await apiFetch('/player/profile');
  applyProfile(data.profile);
  P.titles = new Set((data.titles || []).map(t => t.titleId));
  for (const k in answerStats) delete answerStats[k];
  Object.assign(answerStats, data.answerStats || {});
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
  totalExp: 0, gold: 0,
  totalAnswers: 0, totalCorrect: 0,
  listenCorrect: 0, speakCorrect: 0,
  maxCombo: 0, hasPerfect: false, lv: 1,
  currentHp: 20,
  titles: new Set(),
  inventory: [],
  equipment: { weapon: ITEM_DB.w1, armor: ITEM_DB.a1 },
  activeEffects: [],
};
const answerStats = {};  // id → {attempts, correct}

function getRecord(id) {
  if (!answerStats[id]) answerStats[id] = { attempts:0, correct:0 };
  return answerStats[id];
}
function recordStat(id, ok) {
  const r = getRecord(id);
  r.attempts++;
  if (ok) r.correct++;
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
function pickEnemy(level) {
  // 難易度連動：advanced=強敵、intermediate=中級、beginner=弱敵
  let range;
  if (level === 'advanced') range = [6, 9]; // Lv7-10
  else if (level === 'intermediate') range = [3, 6]; // Lv4-7
  else if (level === 'beginner') range = [0, 3]; // Lv1-4
  else range = [Math.max(0, Math.floor(P.lv/1.5)-1), Math.min(9, Math.floor(P.lv/1.5)+1)];

  const idx = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
  return ENEMIES[Math.min(idx, ENEMIES.length - 1)];
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

function filterLevel(pool, level) {
  if (level === 'all') return pool;
  const map = { beginner:'beginner', intermediate:'intermediate', advanced:'advanced' };
  return pool.filter(x => (x.lv || x.level) === (map[level] || level));
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

function weakItems(pool) {
  return pool.filter(item => {
    const r = answerStats[item.id];
    return r && r.attempts >= 2 && r.correct/r.attempts < 0.6;
  });
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
  const prevRow = getLvRow(P.totalExp);
  P.totalExp   += gained;
  const newRow  = getLvRow(P.totalExp);
  P.lv          = newRow.lv;
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
  P.currentHp = row.hp;
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
  const row  = getLvRow(P.totalExp);
  const next = getNextLvRow(row.lv);
  const cur  = P.totalExp - row.exp;
  const need = next ? next.exp - row.exp : 9999;
  const pct  = next ? Math.min(100, Math.round(cur/need*100)) : 100;
  const fill = $('exp-fill');
  const text = $('exp-text');
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = next ? `${cur}/${need}` : 'MAX';
}

function refreshHeader() {
  const row = getLvRow(P.totalExp);
  const maxHp = row.hp;
  if (P.currentHp === undefined || P.currentHp > maxHp) {
    P.currentHp = maxHp;
  }
  if ($('hdr-hero'))  $('hdr-hero').textContent  = row.hero;
  if ($('hdr-lv'))    $('hdr-lv').textContent    = row.lv;
  if ($('hdr-title')) $('hdr-title').textContent = row.name;
  if ($('hdr-hp'))    $('hdr-hp').textContent    = `${P.currentHp}/${maxHp}`;
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
  for (const def of TITLE_DEFS) {
    if (!P.titles.has(def.id) && def.check(P)) {
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
    qText: `「 ${item.word} 」の いみは？`,
    choices: all, ans: all.indexOf(item.jp),
    detail: `例文: ${item.ex}`,
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
    qText: `「${item.jp}」を えいごで うとう！`,
    ans: item.word.toLowerCase(),
    detail: `例文: ${item.ex}`,
  };
}

// リスニング用（読み上げて聞き取り4択）
function buildListeningQ(item, pool) {
  const dummies = shuffle(pool.filter(p=>p.id!==item.id)).slice(0,3).map(p=>p.word);
  const all = shuffle([item.word, ...dummies]);
  return {
    id: item.id, type:'listening',
    qText: '🔊 きこえた えいごの たんごは どれ？',
    speakWord: item.word,
    choices: all, ans: all.indexOf(item.word),
    detail: `正解: ${item.word}（${item.jp}）`,
  };
}

// スピーキング用（日本語を見て英語を発音）
function buildSpeakingQ(item) {
  return {
    id: item.id, type:'speaking',
    qText: `次の えいごを はっわしよう`,
    speakWord: item.word,
    targetText: item.word,
    ans: item.word.toLowerCase(),
    detail: `正解: ${item.word}（${item.jp}）`,
  };
}

function buildQuestions(mode, level, count) {
  const vPool = filterLevel(VOCAB_DB, level);
  const gPool = filterLevel(GRAMMAR_DB, level);
  let questions = [];

  if (mode === 'vocab') {
    const pool = weightedPool(vPool);
    const seen = new Set();
    for (const item of pool) {
      if (!seen.has(item.id)) { seen.add(item.id); questions.push(buildVocabQ(item, vPool)); }
      if (questions.length >= count) break;
    }
  } else if (mode === 'grammar') {
    const pool = weightedPool(gPool);
    const seen = new Set();
    for (const item of pool) {
      if (!seen.has(item.id)) { seen.add(item.id); questions.push(buildGrammarQ(item)); }
      if (questions.length >= count) break;
    }
  } else if (mode === 'typing') {
    const pool = weightedPool(vPool);
    const seen = new Set();
    for (const item of pool) {
      if (!seen.has(item.id)) { seen.add(item.id); questions.push(buildTypingQ(item)); }
      if (questions.length >= count) break;
    }
  } else if (mode === 'listening') {
    const pool = weightedPool(vPool);
    const seen = new Set();
    for (const item of pool) {
      if (!seen.has(item.id)) { seen.add(item.id); questions.push(buildListeningQ(item, vPool)); }
      if (questions.length >= count) break;
    }
  } else if (mode === 'speaking') {
    const pool = weightedPool(vPool);
    const seen = new Set();
    for (const item of pool) {
      if (!seen.has(item.id)) { seen.add(item.id); questions.push(buildSpeakingQ(item)); }
      if (questions.length >= count) break;
    }
  } else if (mode === 'weak') {
    const allPool = [...VOCAB_DB, ...GRAMMAR_DB];
    const filtered = filterLevel(allPool, level);
    let weak = weakItems(filtered);
    if (weak.length < count) {
      const extra = shuffle(filtered.filter(i => !answerStats[i.id]?.attempts));
      weak = [...weak, ...extra];
    }
    const seen = new Set();
    for (const item of weak) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      if (item.choices) questions.push(buildGrammarQ(item));
      else questions.push(buildVocabQ(item, vPool.length ? vPool : VOCAB_DB));
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
  utter.lang  = 'en-US';
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
  r.lang        = 'en-US';
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
function startBattle(mode) {
  const level = $('level-select').value;
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

  // BGMをバトル曲に切り替え
  playBattleBGM();

  // 敵セット
  $('enemy-sprite').textContent   = enemy.sprite;
  $('enemy-sprite').className     = 'enemy-sprite';
  $('enemy-name').textContent     = enemy.name;
  $('enemy-lv').textContent       = `Lv.${enemy.lv}`;
  $('enemy-hp-bar').style.width   = '100%';

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
    // vocab / grammar / weak(4択)
    $('choices-wrap').classList.remove('hidden');
    renderChoices(q);
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
    const maxHp = getLvRow(P.totalExp).hp;
    damage = Math.max(5, Math.round(maxHp * 0.2));
    if (P.currentHp === undefined) P.currentHp = maxHp;
    P.currentHp = Math.max(0, P.currentHp - damage);
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
        body: JSON.stringify({ questionId: q.id, isCorrect: ok, mode: battle.mode, userAnswer: answerPayload }),
      });
      applyProfile(result.profile);
      battle.combo = result.combo;
      expGot  = result.expGain;
      goldGot = result.goldGain;
      damage  = -result.hpChange;
      refreshHeader();
      refreshExpBar();
      if (result.leveledUp) {
        setTimeout(() => triggerLevelUp(getLvRow(P.totalExp)), 500);
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
    const row = getLvRow(P.totalExp);
    msg = `💀 まちがい… プレイヤーに ${damage} ダメージ！ (HP:${P.currentHp}/${row.hp})\nせいかいは「${q.type==='typing'||q.type==='speaking' ? q.ans : q.choices[q.ans]}」`;
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

  const row = getLvRow(P.totalExp);
  $('result-hero').textContent = row.hero;

  let title = '', msg = '';
  if (rate === 100) { title='かんぺきしょうり！'; msg='まおうもたじたじ！すべてのもんだいをせいかい！'; }
  else if (rate >= 80) { title='だいしょうり！'; msg='すばらしい！えいごのちからがぐんぐんのびている！'; }
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

const heroPos = { x: 50, y: 50 }; // フィールド上の勇者位置（%）
const moveKeys = new Set();
const touchedFieldIcons = new Set();
let fieldLastTime = null;

function isFieldScreenActive() {
  const scr = $('screen-field');
  return !!scr && scr.classList.contains('active');
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
    if (!isFieldScreenActive()) return;
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

  /* ── スマホ用フリック・スワイプ移動 ── */
  const canvas = $('field-canvas');
  if (canvas) {
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
      if (!isFieldScreenActive()) return;
      const touch = ev.touches ? ev.touches[0] : ev;
      flickStartX = touch.clientX;
      flickStartY = touch.clientY;
      isFlicking = true;
      if (flickTimer) { clearTimeout(flickTimer); flickTimer = null; }
    };

    const handleFlickMove = ev => {
      if (!isFlicking || !isFieldScreenActive()) return;
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
}

function updateHeroMovement(dt) {
  let dx = 0, dy = 0;
  if (moveKeys.has('up'))    dy -= 1;
  if (moveKeys.has('down'))  dy += 1;
  if (moveKeys.has('left'))  dx -= 1;
  if (moveKeys.has('right')) dx += 1;
  if (dx === 0 && dy === 0) return;

  const canvas = $('field-canvas');
  const hero   = $('field-hero');
  if (!canvas || !hero) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const len = Math.hypot(dx, dy);
  dx /= len; dy /= len;

  const heroHalfWPct = (hero.offsetWidth  / 2 / rect.width)  * 100;
  const heroHalfHPct = (hero.offsetHeight / 2 / rect.height) * 100;

  heroPos.x += (dx * FIELD_MOVE_SPEED * dt / rect.width)  * 100;
  heroPos.y += (dy * FIELD_MOVE_SPEED * dt / rect.height) * 100;
  heroPos.x = Math.min(100 - heroHalfWPct, Math.max(heroHalfWPct, heroPos.x));
  heroPos.y = Math.min(100 - heroHalfHPct, Math.max(heroHalfHPct, heroPos.y));

  hero.style.left = heroPos.x + '%';
  hero.style.top  = heroPos.y + '%';
  hero.classList.toggle('facing-left', dx < 0);
}

function checkFieldIconContacts() {
  const canvas = $('field-canvas');
  const hero   = $('field-hero');
  if (!canvas || !hero) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const heroRect = hero.getBoundingClientRect();
  const heroCx = heroRect.left + heroRect.width / 2;
  const heroCy = heroRect.top  + heroRect.height / 2;
  const short  = Math.min(rect.width, rect.height);
  const touchDist = short * FIELD_ICON_TOUCH_RATIO;
  const leaveDist = short * FIELD_ICON_LEAVE_RATIO;

  document.querySelectorAll('.field-icon').forEach(iconEl => {
    const mode  = iconEl.dataset.mode;
    const iRect = iconEl.getBoundingClientRect();
    const iCx = iRect.left + iRect.width / 2;
    const iCy = iRect.top  + iRect.height / 2;
    const dist = Math.hypot(heroCx - iCx, heroCy - iCy);

    if (dist < touchDist) {
      if (!touchedFieldIcons.has(mode)) {
        touchedFieldIcons.add(mode);
        startBattle(mode);
      }
    } else if (dist > leaveDist) {
      touchedFieldIcons.delete(mode);
    }
  });
}

function fieldLoop(ts) {
  requestAnimationFrame(fieldLoop);
  if (!isFieldScreenActive()) { fieldLastTime = null; return; }
  if (fieldLastTime === null) { fieldLastTime = ts; return; }
  const dt = Math.min(0.05, (ts - fieldLastTime) / 1000);
  fieldLastTime = ts;
  updateHeroMovement(dt);
  checkFieldIconContacts();
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
  const row = getLvRow(P.totalExp);
  if (P.currentHp === undefined || P.currentHp <= 0) {
    P.currentHp = row.hp; // 宿屋でHP全回復
  }
  showScreen('screen-field');
  refreshHeader();
  refreshExpBar();
  refreshField();
  refreshEquipmentDisplay();
  renderInventoryWindow();
  playFieldBGM();
}

/* ══════════════════════════════════════════════════
   23. イベントリスナー
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

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
    try {
      const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      await handleAuthSuccess(data.token);
    } catch (err) {
      showLoginError(err.message);
    }
  });

  $('register-btn')?.addEventListener('click', async () => {
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    if (!username || !password) { showLoginError('なまえとひみつのコードを入力してください'); return; }
    if (password.length < 4) { showLoginError('ひみつのコードは4文字以上にしてください'); return; }
    showLoginError('');
    try {
      const data = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
      await handleAuthSuccess(data.token);
    } catch (err) {
      showLoginError(err.message);
    }
  });

  $('logout-btn')?.addEventListener('click', logout);

  /* ── コマンドボタン（モード選択） ── */
  document.querySelectorAll('.dq-cmd-btn').forEach(btn => {
    btn.addEventListener('click', () => startBattle(btn.dataset.mode));
  });

  /* ── フィールド探索の初期化 ── */
  setupFieldControls();
  requestAnimationFrame(fieldLoop);

  /* ── フィールドへもどる（バトル中断） ── */
  $('battle-flee-btn')?.addEventListener('click', goToField);

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
  $('retry-btn')?.addEventListener('click', () => startBattle(battle.mode));

  /* ── リザルト：フィールドへ ── */
  $('field-btn')?.addEventListener('click', goToField);

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
