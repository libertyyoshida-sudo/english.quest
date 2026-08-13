import { Router } from 'express';
import { prisma } from '../db.js';
import { examLevelLabel } from '../../../shared/gameData.js';

const router = Router();

function examMeta(language, level) {
  return {
    label: examLevelLabel(language, Number(level)),
  };
}

function toClientQuestion(question) {
  if (question.category === 'grammar') {
    const meta = question.choicesJson ? JSON.parse(question.choicesJson) : {};
    return {
      id: question.id,
      category: 'grammar',
      lv: Number(question.level),
      q: question.word,
      choices: meta.choices || [],
      ans: meta.ans ?? 0,
      exp: meta.exp || question.exampleSentence || '',
      exam: examMeta(question.language, question.level),
    };
  }

  if (question.category === 'culture') {
    const meta = question.choicesJson ? JSON.parse(question.choicesJson) : {};
    return {
      id: question.id,
      category: 'culture',
      lv: Number(question.level),
      q: question.word,
      choices: meta.choices || [],
      ans: meta.ans ?? 0,
      exp: meta.exp || question.exampleSentence || '',
      exam: examMeta(question.language, question.level),
    };
  }

  if (question.category === 'business') {
    const meta = question.choicesJson ? JSON.parse(question.choicesJson) : {};
    return {
      id: question.id,
      category: 'business',
      lv: Number(question.level),
      q: question.word,
      choices: meta.choices || [],
      ans: meta.ans ?? 0,
      exp: meta.exp || question.exampleSentence || '',
      exam: examMeta(question.language, question.level),
    };
  }

  if (question.category === 'phrase') {
    const meta = question.choicesJson ? JSON.parse(question.choicesJson) : {};
    return {
      id: question.id,
      category: 'phrase',
      lv: Number(question.level),
      situation: meta.situation || 'greeting',
      phrase: question.word,
      pron: question.pronunciation || undefined,
      jp: question.japanese,
      en: meta.en || undefined,
      exam: examMeta(question.language, question.level),
    };
  }

  const meta = question.choicesJson ? JSON.parse(question.choicesJson) : {};
  return {
    id: question.id,
    category: 'vocab',
    lv: Number(question.level),
    word: question.word,
    pron: question.pronunciation || undefined,
    jp: question.japanese,
    en: meta.en || undefined,
    ex: question.exampleSentence || '',
    exam: examMeta(question.language, question.level),
  };
}

router.get('/', async (req, res) => {
  try {
    const { language = 'en', level, category, count } = req.query;
    const where = { language: String(language) };
    if (level && level !== 'all') where.level = String(level);
    if (category) where.category = String(category);

    let questions = await prisma.question.findMany({ where });
    questions = questions.sort(() => Math.random() - 0.5);

    const limit = count === 'all' ? questions.length : (count ? parseInt(count, 10) : 10);
    res.json(questions.slice(0, limit).map(toClientQuestion));
  } catch (error) {
    console.error('Questions fetch error:', error);
    res.status(500).json({ error: '問題データの取得に失敗しました。' });
  }
});

export default router;
