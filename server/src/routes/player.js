import { Router } from 'express';
import { prisma } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { getLvRow } from '../../../shared/gameData.js';

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
        answerLogs: {
          select: {
            questionId: true,
            isCorrect: true,
          },
        },
      },
    });

    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません。' });

    // 回答統計の計算 (questionId -> { attempts, correct })
    const answerStats = {};
    for (const log of user.answerLogs) {
      if (!answerStats[log.questionId]) {
        answerStats[log.questionId] = { attempts: 0, correct: 0 };
      }
      answerStats[log.questionId].attempts++;
      if (log.isCorrect) answerStats[log.questionId].correct++;
    }

    res.json({
      profile: user.profile,
      items: user.userItems,
      titles: user.userTitles,
      answerStats,
    });
  } catch (error) {
    console.error('Player profile fetch error:', error);
    res.status(500).json({ error: 'プロファイル取得に失敗しました。' });
  }
});

// 装備変更
router.post('/equip', authenticateToken, async (req, res) => {
  try {
    const { itemId, type } = req.body; // type: 'weapon' | 'armor'
    const profile = await prisma.playerProfile.findUnique({ where: { userId: req.user.userId } });

    if (!profile) return res.status(404).json({ error: 'プロファイルが見つかりません。' });

    const data = {};
    if (type === 'weapon') data.equippedWeaponId = itemId;
    if (type === 'armor') data.equippedArmorId = itemId;

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
    const profile = await prisma.playerProfile.findUnique({ where: { userId: req.user.userId } });
    if (!profile) return res.status(404).json({ error: 'プロファイルが見つかりません。' });

    const maxHp = getLvRow(profile.totalExp).hp;
    const updated = await prisma.playerProfile.update({
      where: { userId: req.user.userId },
      data: { currentHp: maxHp },
    });

    res.json({ profile: updated });
  } catch (error) {
    console.error('Rest error:', error);
    res.status(500).json({ error: '休憩処理に失敗しました。' });
  }
});

export default router;
