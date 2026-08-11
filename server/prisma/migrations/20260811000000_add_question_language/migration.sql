ALTER TABLE "Question" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "Question" ADD COLUMN "pronunciation" TEXT;

CREATE INDEX "Question_language_category_level_idx" ON "Question"("language", "category", "level");
