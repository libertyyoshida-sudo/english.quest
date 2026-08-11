import { Router } from 'express';
import { prisma } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { ITEM_DB, EXP_BASE, GOLD_BASE, TITLE_DEFS, comboMult, getLvRow } from '../../../shared/gameData.js';

const router = Router();

// プロフィール更新後の値を元に称号を判定し、未獲得のものを付与する
async function checkAndAwardTitles(userId, snapshot) {
  const owned = await prisma.userTitle.findMany({
    where: { userId },
    select: { titleId: true },
  });
  const ownedIds = new Set(owned.map(t => t.titleId));

  const newlyUnlocked = TITLE_DEFS.filter(def => !ownedIds.has(def.id) && def.check(snapshot));
  if (newlyUnlocked.length === 0) return [];

  await prisma.userTitle.createMany({
    data: newlyUnlocked.map(def => ({ userId, titleId: def.id })),
    skipDuplicates: true,
  });

  return newlyUnlocked.map(def => ({ id: def.id, icon: def.icon, name: def.name }));
}

// 回答の記録・判定・進捗更新
router.post('/answer', authenticateToken, async (req, res) => {
  try {
    const { questionId, isCorrect, mode, userAnswer, language } = req.body;
    const userId = req.user.userId;
    const lang = language || 'en';

    const profile = await prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) return res.status(404).json({ error: 'プロファイルが見つかりません。' });

    const langProfile = await prisma.languageProfile.upsert({
      where: { userId_language: { userId, language: lang } },
      create: { userId, language: lang },
      update: {},
    });

    await prisma.answerLog.create({
      data: {
        userId,
        questionId,
        mode: mode || 'vocab',
        isCorrect: !!isCorrect,
        userAnswer: userAnswer || '',
      },
    });

    let { gold, maxCombo, currentCombo, totalAnswers, totalCorrect, listenCorrect, speakCorrect } = profile;
    let { totalExp, currentHp } = langProfile;
    let expGain = 0;
    let goldGain = 0;
    let hpChange = 0;

    totalAnswers += 1;
    const beforeMaxHp = getLvRow(totalExp).hp;

    if (isCorrect) {
      totalCorrect += 1;
      currentCombo += 1;
      if (currentCombo > maxCombo) maxCombo = currentCombo;
      if (mode === 'listening') listenCorrect += 1;
      if (mode === 'speaking') speakCorrect += 1;

      const weapon = ITEM_DB[profile.equippedWeaponId];
      const armor = ITEM_DB[profile.equippedArmorId];
      const combMul = comboMult(currentCombo);

      expGain = Math.round((EXP_BASE[mode] || 10) * combMul * (weapon?.expMult ?? 1));
      goldGain = Math.round((GOLD_BASE[mode] || 2) * combMul * (armor?.goldMult ?? 1));
      totalExp += expGain;
      gold += goldGain;
    } else {
      currentCombo = 0;
      const damage = Math.max(5, Math.round(beforeMaxHp * 0.2));
      currentHp = Math.max(0, currentHp - damage);
      hpChange = -damage;
    }

    const newLevel = getLvRow(totalExp).lv;
    const leveledUp = newLevel > langProfile.level;
    // レベルアップした瞬間はHPを新レベルの最大値まで回復する（フロントの演出と一致させる）
    if (leveledUp) currentHp = getLvRow(totalExp).hp;

    const updatedLangProfile = await prisma.languageProfile.update({
      where: { userId_language: { userId, language: lang } },
      data: { totalExp, level: newLevel, currentHp },
    });

    const updatedProfile = await prisma.playerProfile.update({
      where: { userId },
      data: {
        gold,
        maxCombo,
        currentCombo,
        totalAnswers,
        totalCorrect,
        listenCorrect,
        speakCorrect,
      },
    });

    const unlockedTitles = await checkAndAwardTitles(userId, {
      totalAnswers,
      totalCorrect,
      listenCorrect,
      speakCorrect,
      maxCombo,
      hasPerfect: updatedProfile.hasPerfect,
      lv: newLevel,
      gold,
    });

    res.json({
      isCorrect,
      expGain,
      goldGain,
      hpChange,
      leveledUp,
      combo: currentCombo,
      unlockedTitles,
      profile: updatedProfile,
      languageProfile: updatedLangProfile,
    });
  } catch (error) {
    console.error('Battle answer error:', error);
    res.status(500).json({ error: '回答処理に失敗しました。' });
  }
});

// バトル終了時の処理（全問正解フラグの反映と称号判定）
router.post('/finish', authenticateToken, async (req, res) => {
  try {
    const { isPerfect } = req.body;
    const userId = req.user.userId;

    const profile = await prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) return res.status(404).json({ error: 'プロファイルが見つかりません。' });

    const updatedProfile = await prisma.playerProfile.update({
      where: { userId },
      data: {
        hasPerfect: profile.hasPerfect || !!isPerfect,
        currentCombo: 0, // バトル終了でコンボはリセット
      },
    });

    const unlockedTitles = await checkAndAwardTitles(userId, {
      totalAnswers: updatedProfile.totalAnswers,
      totalCorrect: updatedProfile.totalCorrect,
      listenCorrect: updatedProfile.listenCorrect,
      speakCorrect: updatedProfile.speakCorrect,
      maxCombo: updatedProfile.maxCombo,
      hasPerfect: updatedProfile.hasPerfect,
      lv: updatedProfile.level,
      gold: updatedProfile.gold,
    });

    res.json({ profile: updatedProfile, unlockedTitles });
  } catch (error) {
    console.error('Battle finish error:', error);
    res.status(500).json({ error: 'バトル終了処理に失敗しました。' });
  }
});

export default router;
