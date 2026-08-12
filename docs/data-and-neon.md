# Data and Neon Database

## 方針

問題データは Neon Database を正とし、`shared/questionData.js` を fallback として維持します。

GitHub PagesなどAPIが使えない環境でも最低限遊べるようにするため、コンテンツ追加時はDBとfallbackの両方を意識します。

## データ構成

| 領域 | 内容 |
| --- | --- |
| Prisma schema | `server/prisma/schema.prisma` |
| seed | `server/prisma/seed.js` |
| fallback | `shared/questionData.js` |
| lightweight metadata | `shared/languageMeta.js` |
| API | `server/src/routes/questions.js` |
| 接続情報 | `.env` の `DATABASE_URL` / `DIRECT_URL` |

## 認証データ

| テーブル | 主な項目 | 方針 |
| --- | --- | --- |
| `User` | `username`, `email`, `passwordHash` | `username` はPrisma上で一意。`email` は既存ユーザー保護のため nullable、新規登録では必須、DB側の部分unique indexでNULL以外を一意化 |
| `PlayerProfile` | EXP、Gold、HP、称号・装備参照 | アカウント全体の進捗 |
| `LanguageProfile` | 言語別EXP、Lv、HP | 言語ごとの習熟状態 |

## 運用ルール

| 操作 | 方針 |
| --- | --- |
| 追加 | upsertで安全に投入する |
| 修正 | IDを維持し、正解・選択肢・解説を更新する |
| 削除 | 原則禁止。必要な場合は影響確認後に実施する |
| 大量追加 | 100問または100言語など区切りごとに実施する |
| 検証 | 件数、言語別件数、カテゴリ別件数を確認する |

## よく使うコマンド

```bash
npm run db:push
npm run db:seed
npm run build
```

## seed後の確認

seed後は最低限、以下を確認します。

- 総問題数
- 言語別問題数
- カテゴリ別問題数
- 文法問題の `answer` と `choices` の整合
- API取得が失敗した場合のfallback動作

## 注意事項

- `.env` はコミットしない
- Neonの接続URL、JWT秘密鍵などは外部に出さない
- 公開IssueやREADMEに秘密情報を記載しない
- DB変更を伴う場合は、作業ログにseed結果を残す
- 問題データ本体は初期JSサイズを抑えるため、フロントエンドで必要時に動的importする
- 初期表示に必要な言語メタデータは `shared/languageMeta.js` に分離する
- `User.email` のように既存データをnullableで拡張する場合は、Prisma schema更新と明示SQLを併用し、必要に応じてPrisma Clientを再生成する
