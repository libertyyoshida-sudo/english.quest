import { PrismaClient } from '@prisma/client';
import {
  LANGUAGE_OPTIONS, MULTI_GRAMMAR_DB, MULTI_VOCAB_DB, VOCAB_DB, GRAMMAR_DB,
  PHRASE_DB, MULTI_PHRASE_DB,
} from '../../shared/questionData.js';

const prisma = new PrismaClient();

async function upsertVocab(item, language) {
  await prisma.question.upsert({
    where: { id: item.id },
    update: {
      language,
      category: 'vocab',
      level: String(item.lv),
      word: item.word,
      japanese: item.jp,
      pronunciation: item.pron || null,
      exampleSentence: item.ex,
      choicesJson: null,
    },
    create: {
      id: item.id,
      language,
      category: 'vocab',
      level: String(item.lv),
      word: item.word,
      japanese: item.jp,
      pronunciation: item.pron || null,
      exampleSentence: item.ex,
      choicesJson: null,
    },
  });
}

async function upsertGrammar(item, language) {
  const choicesJson = JSON.stringify({ choices: item.choices, ans: item.ans, exp: item.exp });

  await prisma.question.upsert({
    where: { id: item.id },
    update: {
      language,
      category: 'grammar',
      level: String(item.lv),
      word: item.q,
      japanese: item.choices[item.ans],
      pronunciation: null,
      exampleSentence: null,
      choicesJson,
    },
    create: {
      id: item.id,
      language,
      category: 'grammar',
      level: String(item.lv),
      word: item.q,
      japanese: item.choices[item.ans],
      pronunciation: null,
      exampleSentence: null,
      choicesJson,
    },
  });
}

async function upsertPhrase(item, language) {
  const choicesJson = JSON.stringify({ situation: item.situation });

  await prisma.question.upsert({
    where: { id: item.id },
    update: {
      language,
      category: 'phrase',
      level: String(item.lv),
      word: item.phrase,
      japanese: item.jp,
      pronunciation: item.pron || null,
      exampleSentence: null,
      choicesJson,
    },
    create: {
      id: item.id,
      language,
      category: 'phrase',
      level: String(item.lv),
      word: item.phrase,
      japanese: item.jp,
      pronunciation: item.pron || null,
      exampleSentence: null,
      choicesJson,
    },
  });
}

async function main() {
  console.log('Seeding database with questions...');

  for (const item of VOCAB_DB) {
    await upsertVocab(item, 'en');
  }

  let multiVocabCount = 0;
  for (const lang of LANGUAGE_OPTIONS.filter(lang => lang.code !== 'en')) {
    const items = MULTI_VOCAB_DB[lang.code] || [];
    for (const item of items) {
      multiVocabCount++;
      await upsertVocab(item, lang.code);
    }
  }

  for (const item of GRAMMAR_DB) {
    await upsertGrammar(item, 'en');
  }

  let multiGrammarCount = 0;
  for (const lang of LANGUAGE_OPTIONS.filter(lang => lang.code !== 'en')) {
    const items = MULTI_GRAMMAR_DB[lang.code] || [];
    for (const item of items) {
      multiGrammarCount++;
      await upsertGrammar(item, lang.code);
    }
  }

  let phraseCount = 0;
  for (const item of PHRASE_DB) {
    phraseCount++;
    await upsertPhrase(item, 'en');
  }
  for (const lang of LANGUAGE_OPTIONS) {
    const items = MULTI_PHRASE_DB[lang.code] || [];
    for (const item of items) {
      phraseCount++;
      await upsertPhrase(item, lang.code);
    }
  }

  console.log(`Successfully seeded ${VOCAB_DB.length} English vocab + ${GRAMMAR_DB.length} English grammar + ${multiVocabCount} multilingual vocab + ${multiGrammarCount} multilingual grammar + ${phraseCount} phrase questions into Database.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
