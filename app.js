/* =====================================================
   えいごドラクエ — app.js   完全版
   単語/文法/タイピング/リスニング/スピーキング
   EXP・レベル・称号・コンボ・敵撃破演出
===================================================== */
'use strict';

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
   2. アイテムデータベース
══════════════════════════════════════════════════ */
const ITEM_DB = {
  w1: { type:'weapon', id:'w1', name:'ひのきのぼう', icon:'🪵', atk:0, expMult:1.0 },
  w2: { type:'weapon', id:'w2', name:'どうのつるぎ',   icon:'⚔️', atk:1, expMult:1.1 },
  w3: { type:'weapon', id:'w3', name:'てつのつるぎ',   icon:'🗡️', atk:2, expMult:1.2 },
  w4: { type:'weapon', id:'w4', name:'はがねのつるぎ', icon:'💎', atk:3, expMult:1.3 },
  w5: { type:'weapon', id:'w5', name:'ロトのつるぎ',   icon:'👑', atk:5, expMult:1.5 },
  a1: { type:'armor',  id:'a1', name:'ぬののふく',     icon:'👘', def:0, goldMult:1.0 },
  a2: { type:'armor',  id:'a2', name:'かわのよろい',   icon:'🛡️', def:1, goldMult:1.1 },
  a3: { type:'armor',  id:'a3', name:'くさりかたびら', icon:'⛓️', def:2, goldMult:1.2 },
  a4: { type:'armor',  id:'a4', name:'てつのよろい',   icon:'🔩', def:3, goldMult:1.3 },
  a5: { type:'armor',  id:'a5', name:'ロトのよろい',   icon:'👑', def:5, goldMult:1.5 },
  c1: { type:'consumable', id:'c1', name:'やくそう',     icon:'🌿', effect:'expBoost',   value:1.5 },
  c2: { type:'consumable', id:'c2', name:'まほうのほん', icon:'📖', effect:'expBoost',   value:1.3 },
  c3: { type:'consumable', id:'c3', name:'エリクサー',   icon:'🧪', effect:'comboShield', value:1 },
};

/* ══════════════════════════════════════════════════
   3. レベル & 称号テーブル
══════════════════════════════════════════════════ */
const LEVEL_TABLE = [
  { lv:1,  exp:0,    hero:'🧙', name:'みならいまほうつかい',  hp:20,  mp:5  },
  { lv:2,  exp:80,   hero:'🧙', name:'まほうつかいのたまご',  hp:24,  mp:7  },
  { lv:3,  exp:200,  hero:'🧝', name:'エルフのせんし',        hp:30,  mp:10 },
  { lv:4,  exp:380,  hero:'🧝', name:'つよいエルフ',          hp:38,  mp:14 },
  { lv:5,  exp:620,  hero:'⚔️', name:'けんしのたまご',        hp:48,  mp:18 },
  { lv:6,  exp:920,  hero:'⚔️', name:'えいごのけんし',        hp:60,  mp:24 },
  { lv:7,  exp:1300, hero:'🛡️', name:'えいごのパラディン',    hp:75,  mp:30 },
  { lv:8,  exp:1800, hero:'🧙‍♂️', name:'だいまどうし',       hp:90,  mp:40 },
  { lv:9,  exp:2500, hero:'🦸', name:'えいごのヒーロー',      hp:110, mp:52 },
  { lv:10, exp:3500, hero:'👑', name:'えいごのおうさま',      hp:140, mp:68 },
];

const TITLE_DEFS = [
  { id:'first',    icon:'🎖️', name:'はじめての勇者',   check: p => p.totalAnswers >= 1 },
  { id:'correct10',icon:'⭐',  name:'10問せいかいし',  check: p => p.totalCorrect >= 10 },
  { id:'correct50',icon:'🌟',  name:'50問せいかいし',  check: p => p.totalCorrect >= 50 },
  { id:'perfect',  icon:'👑',  name:'かんぺき勇者',    check: p => p.hasPerfect },
  { id:'combo5',   icon:'⚡',  name:'5コンボ達人',     check: p => p.maxCombo >= 5 },
  { id:'combo10',  icon:'🌪️',  name:'10コンボ伝説',    check: p => p.maxCombo >= 10 },
  { id:'listen5',  icon:'👂',  name:'ちょうりょく5',   check: p => p.listenCorrect >= 5 },
  { id:'speak5',   icon:'🎤',  name:'はっわ5',         check: p => p.speakCorrect >= 5 },
  { id:'lv5',      icon:'🦸',  name:'レベル5達成',     check: p => p.lv >= 5 },
  { id:'lv10',     icon:'🐉',  name:'まおうをたおした', check: p => p.lv >= 10 },
  { id:'gold100',  icon:'💰',  name:'ゴールド100G',    check: p => p.gold >= 100 },
];

function getLvRow(totalExp) {
  let row = LEVEL_TABLE[0];
  for (const r of LEVEL_TABLE) { if (totalExp >= r.exp) row = r; else break; }
  return row;
}
function getNextLvRow(lv) { return LEVEL_TABLE.find(r => r.lv === lv + 1) || null; }

/* ══════════════════════════════════════════════════
   4. プレイヤー状態
══════════════════════════════════════════════════ */
const P = {
  totalExp: 0, gold: 0,
  totalAnswers: 0, totalCorrect: 0,
  listenCorrect: 0, speakCorrect: 0,
  maxCombo: 0, hasPerfect: false, lv: 1,
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
   6. 単語データ（90語）
══════════════════════════════════════════════════ */
const VOCAB_DB = [
  {id:'v01',lv:'beginner',    word:'apply',       jp:'おうぼする・つかう',       ex:'I will apply for the job.'},
  {id:'v02',lv:'beginner',    word:'arrange',     jp:'てはいする・せいりする',    ex:'Please arrange the meeting.'},
  {id:'v03',lv:'beginner',    word:'attend',      jp:'しゅっせきする',           ex:'She will attend the conference.'},
  {id:'v04',lv:'beginner',    word:'budget',      jp:'よさん',                  ex:'We need to cut the budget.'},
  {id:'v05',lv:'beginner',    word:'cancel',      jp:'とりけす',                ex:'They canceled the order.'},
  {id:'v06',lv:'beginner',    word:'confirm',     jp:'かくにんする',             ex:'Please confirm your reservation.'},
  {id:'v07',lv:'beginner',    word:'contact',     jp:'れんらくする',             ex:'Contact us by email.'},
  {id:'v08',lv:'beginner',    word:'deliver',     jp:'はいたつする',             ex:'The package will be delivered tomorrow.'},
  {id:'v09',lv:'beginner',    word:'discount',    jp:'わりびき',                ex:'There is a 20% discount.'},
  {id:'v10',lv:'beginner',    word:'document',    jp:'しょるい・ぶんしょ',       ex:'Sign the document, please.'},
  {id:'v11',lv:'beginner',    word:'employee',    jp:'じゅうぎょういん',         ex:'All employees must attend.'},
  {id:'v12',lv:'beginner',    word:'equipment',   jp:'せつび・きき',             ex:'Check the equipment before use.'},
  {id:'v13',lv:'beginner',    word:'estimate',    jp:'みつもる',                ex:'Please estimate the cost.'},
  {id:'v14',lv:'beginner',    word:'expand',      jp:'かくだいする',             ex:'The company will expand overseas.'},
  {id:'v15',lv:'beginner',    word:'extend',      jp:'えんちょうする',           ex:'They extended the deadline.'},
  {id:'v16',lv:'beginner',    word:'flexible',    jp:'じゅうなんな',             ex:'We offer flexible working hours.'},
  {id:'v17',lv:'beginner',    word:'hire',        jp:'やとう',                  ex:'We plan to hire new staff.'},
  {id:'v18',lv:'beginner',    word:'improve',     jp:'かいぜんする',             ex:'We need to improve service.'},
  {id:'v19',lv:'beginner',    word:'increase',    jp:'ふやす・ぞうかする',        ex:'Sales increased last quarter.'},
  {id:'v20',lv:'beginner',    word:'interview',   jp:'めんせつ',                ex:'He passed the interview.'},
  {id:'v21',lv:'beginner',    word:'invoice',     jp:'せいきゅうしょ',           ex:'Send the invoice by Friday.'},
  {id:'v22',lv:'beginner',    word:'manage',      jp:'かんりする',               ex:'She manages a team of ten.'},
  {id:'v23',lv:'beginner',    word:'meeting',     jp:'かいぎ',                  ex:'The meeting starts at 9 AM.'},
  {id:'v24',lv:'beginner',    word:'notify',      jp:'つうちする',               ex:'Please notify us in advance.'},
  {id:'v25',lv:'beginner',    word:'offer',       jp:'ていあんする',             ex:'They offered a good price.'},
  {id:'v26',lv:'beginner',    word:'order',       jp:'ちゅうもんする',           ex:'Place your order online.'},
  {id:'v27',lv:'beginner',    word:'pay',         jp:'はらう',                  ex:'Pay by credit card.'},
  {id:'v28',lv:'beginner',    word:'policy',      jp:'ほうしん・きそく',          ex:'Read the company policy.'},
  {id:'v29',lv:'beginner',    word:'provide',     jp:'ていきょうする',           ex:'We provide free support.'},
  {id:'v30',lv:'beginner',    word:'receive',     jp:'うけとる',                ex:'Did you receive my email?'},
  {id:'v31',lv:'intermediate',word:'accomplish',  jp:'たっせいする',             ex:'He accomplished his goal.'},
  {id:'v32',lv:'intermediate',word:'adequate',    jp:'じゅうぶんな',             ex:'The budget is adequate.'},
  {id:'v33',lv:'intermediate',word:'announce',    jp:'はっぴょうする',           ex:'The CEO will announce the plan.'},
  {id:'v34',lv:'intermediate',word:'authorize',   jp:'しょうにんする',           ex:'I authorized the purchase.'},
  {id:'v35',lv:'intermediate',word:'collaborate', jp:'きょうりょくする',         ex:'Let\'s collaborate on this project.'},
  {id:'v36',lv:'intermediate',word:'compensate',  jp:'ほしょうする',             ex:'We will compensate for the delay.'},
  {id:'v37',lv:'intermediate',word:'comply',      jp:'じゅんしゅする',           ex:'You must comply with the rules.'},
  {id:'v38',lv:'intermediate',word:'conduct',     jp:'じっしする',               ex:'They conducted a survey.'},
  {id:'v39',lv:'intermediate',word:'deadline',    jp:'しめきり',                ex:'Meet the deadline on time.'},
  {id:'v40',lv:'intermediate',word:'decline',     jp:'ことわる・へる',           ex:'Sales declined this month.'},
  {id:'v41',lv:'intermediate',word:'efficient',   jp:'こうりつてきな',           ex:'Find a more efficient method.'},
  {id:'v42',lv:'intermediate',word:'evaluate',    jp:'ひょうかする',             ex:'Evaluate the performance quarterly.'},
  {id:'v43',lv:'intermediate',word:'generate',    jp:'うみだす',                ex:'Generate more revenue.'},
  {id:'v44',lv:'intermediate',word:'implement',   jp:'じっしする',               ex:'Implement the new system.'},
  {id:'v45',lv:'intermediate',word:'negotiate',   jp:'こうしょうする',           ex:'Negotiate a better deal.'},
  {id:'v46',lv:'intermediate',word:'objective',   jp:'もくひょう',               ex:'Set clear objectives.'},
  {id:'v47',lv:'intermediate',word:'opportunity', jp:'きかい',                  ex:'This is a great opportunity.'},
  {id:'v48',lv:'intermediate',word:'postpone',    jp:'えんきする',               ex:'Postpone the launch event.'},
  {id:'v49',lv:'intermediate',word:'priority',    jp:'ゆうせんじこう',           ex:'Set your priorities clearly.'},
  {id:'v50',lv:'intermediate',word:'promote',     jp:'しょうしんさせる',         ex:'She was promoted to manager.'},
  {id:'v51',lv:'intermediate',word:'proposal',    jp:'ていあんしょ',             ex:'Submit the proposal by Monday.'},
  {id:'v52',lv:'intermediate',word:'require',     jp:'ひつようとする',           ex:'The job requires experience.'},
  {id:'v53',lv:'intermediate',word:'revenue',     jp:'しゅうえき',               ex:'Annual revenue increased.'},
  {id:'v54',lv:'intermediate',word:'productive',  jp:'せいさんてきな',           ex:'Have a productive meeting.'},
  {id:'v55',lv:'intermediate',word:'contribute',  jp:'こうけんする',             ex:'She contributed to the project.'},
  {id:'v56',lv:'intermediate',word:'outsource',   jp:'がいぶにいたくする',        ex:'They outsourced IT support.'},
  {id:'v57',lv:'intermediate',word:'inventory',   jp:'ざいこ',                  ex:'Check the inventory levels.'},
  {id:'v58',lv:'intermediate',word:'consequence', jp:'けっか・えいきょう',        ex:'Consider the consequences.'},
  {id:'v59',lv:'intermediate',word:'approach',    jp:'ちかづく・アプローチ',      ex:'We need a new approach.'},
  {id:'v60',lv:'intermediate',word:'complaint',   jp:'くじょう',                ex:'We received a complaint.'},
  {id:'v61',lv:'advanced',    word:'acquisition', jp:'ばいしゅう',               ex:'The acquisition was completed.'},
  {id:'v62',lv:'advanced',    word:'allocate',    jp:'わりあてる',               ex:'Allocate resources wisely.'},
  {id:'v63',lv:'advanced',    word:'ambiguous',   jp:'あいまいな',               ex:'The instructions are ambiguous.'},
  {id:'v64',lv:'advanced',    word:'benchmark',   jp:'きじゅん・ひょうじゅん',    ex:'Set a performance benchmark.'},
  {id:'v65',lv:'advanced',    word:'contingency', jp:'ふそくのじたい',           ex:'Prepare a contingency plan.'},
  {id:'v66',lv:'advanced',    word:'deplete',     jp:'こかつさせる',             ex:'Resources are being depleted.'},
  {id:'v67',lv:'advanced',    word:'discrepancy', jp:'そうい・むじゅん',          ex:'There is a discrepancy in the report.'},
  {id:'v68',lv:'advanced',    word:'fiscal',      jp:'ざいせいの',               ex:'The fiscal year ends in March.'},
  {id:'v69',lv:'advanced',    word:'fluctuate',   jp:'へんどうする',             ex:'Prices fluctuate daily.'},
  {id:'v70',lv:'advanced',    word:'leverage',    jp:'かつようする',             ex:'Leverage your network.'},
  {id:'v71',lv:'advanced',    word:'mitigate',    jp:'かんわする',               ex:'Mitigate the financial risk.'},
  {id:'v72',lv:'advanced',    word:'obsolete',    jp:'じだいおくれの',           ex:'This technology is obsolete.'},
  {id:'v73',lv:'advanced',    word:'paradigm',    jp:'パラダイム',               ex:'A paradigm shift in business.'},
  {id:'v74',lv:'advanced',    word:'procurement', jp:'ちょうたつ',               ex:'Procurement costs rose.'},
  {id:'v75',lv:'advanced',    word:'reconcile',   jp:'てらしあわせる',           ex:'Reconcile the accounts.'},
  {id:'v76',lv:'advanced',    word:'restructure', jp:'さいへんする',             ex:'The company will restructure.'},
  {id:'v77',lv:'advanced',    word:'scrutinize',  jp:'せいさする',               ex:'Scrutinize the contract carefully.'},
  {id:'v78',lv:'advanced',    word:'stipulate',   jp:'きていする',               ex:'The contract stipulates the terms.'},
  {id:'v79',lv:'advanced',    word:'subsidiary',  jp:'こがいしゃ',               ex:'A wholly owned subsidiary.'},
  {id:'v80',lv:'advanced',    word:'viable',      jp:'じっこうかのうな',         ex:'A viable business model.'},
  {id:'v81',lv:'advanced',    word:'amalgamate',  jp:'がっぺいする',             ex:'The two firms will amalgamate.'},
  {id:'v82',lv:'advanced',    word:'arbitrate',   jp:'ちゅうさいする',           ex:'A third party will arbitrate.'},
  {id:'v83',lv:'advanced',    word:'bureaucracy', jp:'かんりょうしゅぎ',         ex:'Cut through the bureaucracy.'},
  {id:'v84',lv:'advanced',    word:'capitalize',  jp:'かつようする',             ex:'Capitalize on the opportunity.'},
  {id:'v85',lv:'advanced',    word:'enumerate',   jp:'れっきょする',             ex:'Enumerate the key findings.'},
  {id:'v86',lv:'advanced',    word:'inaugurate',  jp:'しゅうにんさせる',         ex:'The president was inaugurated.'},
  {id:'v87',lv:'advanced',    word:'tangible',    jp:'ゆうけいの・ぐたいてきな',  ex:'Show tangible results.'},
  {id:'v88',lv:'advanced',    word:'trajectory',  jp:'きせき・しんろ',           ex:'The growth trajectory is positive.'},
  {id:'v89',lv:'advanced',    word:'unanimous',   jp:'ぜんいんいっちの',         ex:'A unanimous decision was reached.'},
  {id:'v90',lv:'advanced',    word:'commensurate',jp:'つりあった',               ex:'Salary commensurate with experience.'},
];

/* ══════════════════════════════════════════════════
   7. 文法データ（22問）
══════════════════════════════════════════════════ */
const GRAMMAR_DB = [
  {id:'g01',lv:'beginner',
   q:'The meeting _____ at 9 AM tomorrow.',
   choices:['start','starts','starting','started'], ans:1,
   exp:'3人称単数現在形 → starts'},
  {id:'g02',lv:'beginner',
   q:'Please send the report _____ Friday.',
   choices:['in','on','at','by'], ans:3,
   exp:'by = 〜までに（期限）'},
  {id:'g03',lv:'beginner',
   q:'She has worked here _____ five years.',
   choices:['since','for','during','from'], ans:1,
   exp:'for = 期間の長さ'},
  {id:'g04',lv:'beginner',
   q:'The package _____ delivered yesterday.',
   choices:['is','was','were','be'], ans:1,
   exp:'過去の受動態 → was + 過去分詞'},
  {id:'g05',lv:'beginner',
   q:'We need _____ the budget before Friday.',
   choices:['approve','approves','approved','to approve'], ans:3,
   exp:'need to do → to + 動詞原形'},
  {id:'g06',lv:'beginner',
   q:'_____ of the employees attended the seminar.',
   choices:['Much','Every','All','Each'], ans:2,
   exp:'All of the employees = 全従業員'},
  {id:'g07',lv:'beginner',
   q:'Could you _____ me with this task?',
   choices:['help','helping','helped','to help'], ans:0,
   exp:'Could you + 動詞原形（助動詞の後は原形）'},
  {id:'g08',lv:'beginner',
   q:'The new product will be launched _____ next month.',
   choices:['in','on','at','（不要）'], ans:3,
   exp:'next month などには前置詞不要'},
  {id:'g09',lv:'intermediate',
   q:'The manager suggested _____ the deadline.',
   choices:['extend','to extend','extending','extended'], ans:2,
   exp:'suggest + 動名詞（〜ing）'},
  {id:'g10',lv:'intermediate',
   q:'_____ the heavy traffic, she arrived on time.',
   choices:['Despite','Although','Because','Since'], ans:0,
   exp:'Despite + 名詞句（前置詞）'},
  {id:'g11',lv:'intermediate',
   q:'The report _____ by the time the boss arrived.',
   choices:['has been completed','was completing','had been completed','completed'], ans:2,
   exp:'過去完了受動態 → had been done'},
  {id:'g12',lv:'intermediate',
   q:'We are considering _____ a new office in Tokyo.',
   choices:['open','to open','opening','opened'], ans:2,
   exp:'consider + 動名詞（〜ing）'},
  {id:'g13',lv:'intermediate',
   q:'_____ the project is approved, we will begin immediately.',
   choices:['Once','Until','Unless','Though'], ans:0,
   exp:'Once = 〜したらすぐに'},
  {id:'g14',lv:'intermediate',
   q:'Sales have increased _____ 15% compared to last year.',
   choices:['by','at','in','for'], ans:0,
   exp:'変化の幅には by（by 15% = 15%増）'},
  {id:'g15',lv:'intermediate',
   q:'Employees are required _____ safety regulations.',
   choices:['follow','follows','following','to follow'], ans:3,
   exp:'be required to do = 〜することが求められる'},
  {id:'g16',lv:'intermediate',
   q:'The CEO, _____ speech inspired everyone, retired last year.',
   choices:['who','whose','whom','which'], ans:1,
   exp:'whose + 名詞 = 〜の（関係代名詞所有格）'},
  {id:'g17',lv:'advanced',
   q:'Had the contract _____ earlier, we would have saved costs.',
   choices:['reviewed','been reviewed','review','reviewing'], ans:1,
   exp:'仮定法過去完了受動態 → Had S been done'},
  {id:'g18',lv:'advanced',
   q:'_____ to attend the conference, the director sent a representative.',
   choices:['Unable','Being unable','Not able','Inability'], ans:0,
   exp:'分詞構文の形容詞型 → Unable to do'},
  {id:'g19',lv:'advanced',
   q:'The acquisition deal is contingent _____ board approval.',
   choices:['for','on','with','at'], ans:1,
   exp:'be contingent on〜 = 〜次第である'},
  {id:'g20',lv:'advanced',
   q:'No sooner _____ the meeting ended than the phone rang.',
   choices:['had','has','have','did'], ans:0,
   exp:'No sooner had S done... than〜（倒置形）'},
  {id:'g21',lv:'advanced',
   q:'The new policy, _____ effective next month, will affect all staff.',
   choices:['becomes','becoming','to become','become'], ans:1,
   exp:'分詞構文（現在分詞）→ becoming'},
  {id:'g22',lv:'advanced',
   q:'It is imperative that the data _____ backed up daily.',
   choices:['is','was','be','being'], ans:2,
   exp:'imperative 後の that節 → 仮定法現在（動詞原形）'},
];

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
   9. EXP・ゴールド・レベルアップ
══════════════════════════════════════════════════ */
const EXP_BASE = { vocab:10, grammar:15, typing:12, listening:18, speaking:20, weak:25 };
const GOLD_BASE = { vocab:2,  grammar:3,  typing:2,  listening:4,  speaking:5,  weak:6  };

function comboMult(combo) {
  if (combo >= 10) return 3;
  if (combo >= 5)  return 2;
  if (combo >= 3)  return 1.5;
  return 1;
}

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
  if ($('hdr-hero'))  $('hdr-hero').textContent  = row.hero;
  if ($('hdr-lv'))    $('hdr-lv').textContent    = row.lv;
  if ($('hdr-title')) $('hdr-title').textContent = row.name;
  if ($('hdr-hp'))    $('hdr-hp').textContent    = row.hp;
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
      P.titles.add(def.id);
      setTimeout(() => {
        $('ti-icon').textContent = def.icon;
        $('ti-name').textContent = def.name;
        $('ti-desc').textContent = def.id;
        $('title-overlay').classList.remove('hidden');
      }, 800);
      break;
    }
  }
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
function handleAnswer(userAns, userText) {
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

  // 統計更新
  recordStat(q.id, ok);
  P.totalAnswers++;
  if (ok) {
    P.totalCorrect++;
    battle.correct++;
    battle.combo++;
    if (battle.combo > P.maxCombo) P.maxCombo = battle.combo;
    if (q.type === 'listening') P.listenCorrect++;
    if (q.type === 'speaking')  P.speakCorrect++;
    playSoundCorrect();
  } else {
    // エリクサーのコンボシールド効果
    if (battle.comboShield && !battle.comboShieldUsed) {
      battle.comboShieldUsed = true;
      // コンボは維持
    } else {
      battle.combo = 0;
    }
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

  // EXP & GOLD
  const expGot  = ok ? gainExp(battle.mode, battle.combo)  : 0;
  const goldGot = ok ? gainGold(battle.mode, battle.combo) : 0;
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
    msg = `💀 まちがい…　せいかいは「${q.type==='typing'||q.type==='speaking' ? q.ans : q.choices[q.ans]}」`;
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

  // 称号チェック
  setTimeout(checkTitles, 600);
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

function showResult() {
  const total   = battle.questions.length;
  const correct = battle.correct;
  const rate    = total > 0 ? Math.round(correct/total*100) : 0;

  if (rate === 100) P.hasPerfect = true;

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
  checkTitles();
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

  /* ── タイトル → フィールド ── */
  $('title-start')?.addEventListener('click', goToField);

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
