import { PrismaClient } from '@prisma/client';
import {
  LANGUAGE_OPTIONS, MULTI_GRAMMAR_DB, MULTI_VOCAB_DB, VOCAB_DB, GRAMMAR_DB,
} from '../../shared/questionData.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with questions...');

  for (const item of VOCAB_DB) {
    await prisma.question.upsert({
      where: { id: item.id },
      update: {
        category: 'vocab',
        level: String(item.lv),
        word: item.word,
        japanese: item.jp,
        exampleSentence: item.ex,
      },
      create: {
        id: item.id,
        category: 'vocab',
        level: String(item.lv),
        word: item.word,
        japanese: item.jp,
        exampleSentence: item.ex,
      },
    });
  }

  let multiVocabCount = 0;
  for (const lang of LANGUAGE_OPTIONS.filter(lang => lang.code !== 'en')) {
    const items = MULTI_VOCAB_DB[lang.code] || [];
    for (const item of items) {
      multiVocabCount++;
      await prisma.question.upsert({
        where: { id: item.id },
        update: {
          category: 'vocab',
          level: String(item.lv),
          word: item.word,
          japanese: item.jp,
          exampleSentence: item.ex,
        },
        create: {
          id: item.id,
          category: 'vocab',
          level: String(item.lv),
          word: item.word,
          japanese: item.jp,
          exampleSentence: item.ex,
        },
      });
    }
  }

  for (const item of GRAMMAR_DB) {
    const choicesJson = JSON.stringify({ choices: item.choices, ans: item.ans, exp: item.exp });
    await prisma.question.upsert({
      where: { id: item.id },
      update: {
        category: 'grammar',
        level: String(item.lv),
        word: item.q,
        japanese: item.choices[item.ans],
        choicesJson,
      },
      create: {
        id: item.id,
        category: 'grammar',
        level: String(item.lv),
        word: item.q,
        japanese: item.choices[item.ans],
        choicesJson,
      },
    });
  }

  let multiGrammarCount = 0;
  for (const lang of LANGUAGE_OPTIONS.filter(lang => lang.code !== 'en')) {
    const items = MULTI_GRAMMAR_DB[lang.code] || [];
    for (const item of items) {
      multiGrammarCount++;
      const choicesJson = JSON.stringify({ choices: item.choices, ans: item.ans, exp: item.exp });
      await prisma.question.upsert({
        where: { id: item.id },
        update: {
          category: 'grammar',
          level: String(item.lv),
          word: item.q,
          japanese: item.choices[item.ans],
          choicesJson,
        },
        create: {
          id: item.id,
          category: 'grammar',
          level: String(item.lv),
          word: item.q,
          japanese: item.choices[item.ans],
          choicesJson,
        },
      });
    }
  }

  console.log(`Successfully seeded ${VOCAB_DB.length} English vocab + ${GRAMMAR_DB.length} English grammar + ${multiVocabCount} multilingual vocab + ${multiGrammarCount} multilingual grammar questions into Database.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
