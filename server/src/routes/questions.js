import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

// 問題一覧・難易度指定検索
router.get('/', async (req, res) => {
  try {
    const { level, category, count } = req.query;
    const where = {};
    if (level && level !== 'all') where.level = level;
    if (category) where.category = category;

    let questions = await prisma.question.findMany({ where });

    // シャッフル
    questions = questions.sort(() => Math.random() - 0.5);

    const limit = count ? parseInt(count, 10) : 10;
    res.json(questions.slice(0, limit));
  } catch (error) {
    console.error('Questions fetch error:', error);
    res.status(500).json({ error: '問題データの取得に失敗しました。' });
  }
});

export default router;
