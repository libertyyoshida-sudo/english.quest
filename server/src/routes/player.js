import { Router } from 'express';
import { prisma } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { ITEM_DB, SHOP_ITEM_IDS, getLvRow } from '../../../shared/gameData.js';

const router = Router();

// プレイヤー詳細プロファイル＆回答統計の取得
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: {
        profile: true,
        userItems: true,
        userTitles: true,
        languageProfiles: true,
        answerLogs: {
          select: {
            questionId: true,
            isCorrect: true,
            createdAt: true,
            question: { select: { language: true } },
          },
        },
      },
    });

    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません。' });

    // 回答統計の計算 (questionId -> { attempts, correct, lastAnsweredAt })
    // lastAnsweredAtは忘却曲線による定着度の推定にクライアント側で使用する
    const answerStats = {};
    for (const log of user.answerLogs) {
      if (!answerStats[log.questionId]) {
        answerStats[log.questionId] = { attempts: 0, correct: 0, lastAnsweredAt: 0 };
      }
      const stat = answerStats[log.questionId];
      stat.attempts++;
      if (log.isCorrect) stat.correct++;
      const t = new Date(log.createdAt).getTime();
      if (t > stat.lastAnsweredAt) stat.lastAnsweredAt = t;
    }

    // 言語ごとの学習履歴（出題数・正答数）。にがて等の内訳はクライアント側でclassifyItem()により算出する
    const languageHistory = {};
    for (const log of user.answerLogs) {
      const lang = log.question?.language || 'en';
      if (!languageHistory[lang]) languageHistory[lang] = { totalAnswers: 0, totalCorrect: 0 };
      languageHistory[lang].totalAnswers++;
      if (log.isCorrect) languageHistory[lang].totalCorrect++;
    }

    res.json({
      profile: user.profile,
      items: user.userItems,
      titles: user.userTitles,
      languageProfiles: user.languageProfiles,
      languageHistory,
      answerStats,
    });
  } catch (error) {
    console.error('Player profile fetch error:', error);
    res.status(500).json({ error: 'プロファイル取得に失敗しました。' });
  }
});

// 装備変更（見た目に反映される武器・防具・称号）
router.post('/equip', authenticateToken, async (req, res) => {
  try {
    const { itemId, type } = req.body; // type: 'weapon' | 'armor' | 'title'
    const profile = await prisma.playerProfile.findUnique({ where: { userId: req.user.userId } });

    if (!profile) return res.status(404).json({ error: 'プロファイルが見つかりません。' });

    const data = {};
    if (type === 'weapon') data.equippedWeaponId = itemId;
    if (type === 'armor') data.equippedArmorId = itemId;
    if (type === 'title') {
      // itemId が null なら称号を外す。null 以外は未獲得の称号を装備できないよう所持確認する
      if (itemId) {
        const owned = await prisma.userTitle.findUnique({
          where: { userId_titleId: { userId: req.user.userId, titleId: itemId } },
        });
        if (!owned) return res.status(400).json({ error: 'まだ獲得していない称号です。' });
      }
      data.equippedTitleId = itemId || null;
    }

    const updated = await prisma.playerProfile.update({
      where: { userId: req.user.userId },
      data,
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: '装備変更に失敗しました。' });
  }
});

// やどやで休憩：HPを現在レベルの最大値まで全回復
router.post('/rest', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const lang = req.body.language || 'en';

    const langProfile = await prisma.languageProfile.upsert({
      where: { userId_language: { userId, language: lang } },
      create: { userId, language: lang },
      update: {},
    });

    const maxHp = getLvRow(langProfile.totalExp).hp;
    const updatedLangProfile = await prisma.languageProfile.update({
      where: { userId_language: { userId, language: lang } },
      data: { currentHp: maxHp },
    });

    res.json({ languageProfile: updatedLangProfile });
  } catch (error) {
    console.error('Rest error:', error);
    res.status(500).json({ error: '休憩処理に失敗しました。' });
  }
});

// Shop購入：Goldを消費して装備・消耗品・通行証を入手する
router.post('/shop/buy', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { itemId } = req.body;
    const item = ITEM_DB[itemId];
    if (!item || !SHOP_ITEM_IDS.includes(itemId)) {
      return res.status(400).json({ error: 'このアイテムは購入できません。' });
    }

    const profile = await prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) return res.status(404).json({ error: 'プロファイルが見つかりません。' });
    if (profile.gold < item.price) return res.status(400).json({ error: 'Goldが足りません。' });

    const owned = await prisma.userItem.findUnique({
      where: { userId_itemId: { userId, itemId } },
    });
    if (owned && item.type !== 'consumable') {
      return res.status(400).json({ error: 'すでに持っています。' });
    }

    const updatedProfile = await prisma.playerProfile.update({
      where: { userId },
      data: { gold: profile.gold - item.price },
    });

    await prisma.userItem.upsert({
      where: { userId_itemId: { userId, itemId } },
      create: { userId, itemId },
      update: { acquiredAt: new Date() },
    });

    const items = await prisma.userItem.findMany({ where: { userId } });
    res.json({ profile: updatedProfile, items });
  } catch (error) {
    console.error('Shop buy error:', error);
    res.status(500).json({ error: '購入処理に失敗しました。' });
  }
});

// 無料練習の報酬付与（キーボード道場など）
router.post('/reward', authenticateToken, async (req, res) => {
  try {
    const amount = Math.max(0, Math.min(50, Number(req.body.amount) || 0));
    const userId = req.user.userId;
    const profile = await prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) return res.status(404).json({ error: 'プロファイルが見つかりません。' });

    const updatedProfile = await prisma.playerProfile.update({
      where: { userId },
      data: { gold: profile.gold + amount },
    });
    res.json({ profile: updatedProfile });
  } catch (error) {
    console.error('Reward error:', error);
    res.status(500).json({ error: '報酬付与に失敗しました。' });
  }
});

export default router;
