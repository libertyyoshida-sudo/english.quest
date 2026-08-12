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
