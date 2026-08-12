# Development Workflow

## 基本方針

今後の開発は `docs/` を参照し、必要に応じてドキュメントも同じ作業単位で更新します。

## 作業開始時

1. `docs/README.md` で関連ドキュメントを確認する
2. 仕様変更なら `docs/requirements.md` を確認する
3. コンテンツ追加なら `docs/content-expansion-plan.md` と `docs/content-guidelines.md` を確認する
4. DB反映なら `docs/data-and-neon.md` を確認する
5. リリース前に `docs/release-checklist.md` を確認する

## 実装の流れ

1. 現状確認
2. 影響範囲の特定
3. 小さく実装
4. 必要なドキュメント更新
5. 検証
6. commit
7. push
8. deploy

## 検証コマンド

```bash
node --check app.js
npm audit --audit-level=moderate
npm run build
```

DB変更を伴う場合:

```bash
npm run db:seed
```

## commit方針

- 1コミット1目的を基本にする
- コード変更と関連ドキュメント更新は同じコミットに含める
- コンテンツ大量追加は区切りのよい単位でコミットする

## deploy方針

- UIやゲーム挙動を変更した場合は `npm run deploy` まで実施する
- ドキュメントのみの場合、GitHub Pagesへの再デプロイは原則不要
- ユーザーが明示した場合はドキュメントのみでもdeployする

