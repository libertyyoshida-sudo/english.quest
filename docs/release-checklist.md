# Release Checklist

リリース、push、deploy前に確認するチェックリストです。

## 通常変更

- [ ] 関連する `docs/` を確認した
- [ ] 仕様変更がある場合、`docs/requirements.md` を更新した
- [ ] 設計変更がある場合、`docs/architecture.md` を更新した
- [ ] ゲームバランス変更がある場合、`docs/game-design.md` を更新した
- [ ] `node --check app.js` を実行した
- [ ] `npm audit --audit-level=moderate` を実行した
- [ ] `npm run build` を実行した
- [ ] 主要画面を手動確認した
- [ ] commitした
- [ ] pushした
- [ ] UI変更の場合、deployした

## コンテンツ追加

- [ ] `docs/content-expansion-plan.md` を確認した
- [ ] `docs/content-guidelines.md` を確認した
- [ ] 言語・カテゴリ・レベルの偏りを確認した
- [ ] 問題ID重複を確認した
- [ ] `answer` と `choices` の整合を確認した
- [ ] Neon Databaseへseedした
- [ ] seed後の件数を確認した
- [ ] fallbackデータとの整合を確認した
- [ ] commit、push、deployした

## DB変更

- [ ] `docs/data-and-neon.md` を確認した
- [ ] schema変更の影響範囲を確認した
- [ ] 既存データを削除しない方針を確認した
- [ ] migrationまたはdb pushを実行した
- [ ] seedを実行した
- [ ] API取得とfallbackを確認した

