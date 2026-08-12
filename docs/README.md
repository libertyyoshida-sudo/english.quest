# English Quest Documentation

この `docs/` は English Quest の開発・運用・コンテンツ拡充に関する正本です。

今後の開発では、実装前に関連ドキュメントを確認し、仕様・設計・運用方針が変わった場合は、コード変更と同じコミットで該当ドキュメントも更新します。

## ドキュメント一覧

| ドキュメント | 目的 |
| --- | --- |
| [requirements.md](requirements.md) | 機能要件、受入条件、正しさの性質 |
| [architecture.md](architecture.md) | 全体構成、主要ファイル、責務分担 |
| [game-design.md](game-design.md) | RPG要素、学習ループ、Shop、Gold、忘却曲線 |
| [content-expansion-plan.md](content-expansion-plan.md) | 問題・言語コンテンツ拡充計画 |
| [content-guidelines.md](content-guidelines.md) | 問題データ作成ルール、品質基準、権利配慮 |
| [data-and-neon.md](data-and-neon.md) | Neon Database、Prisma、seed、fallback方針 |
| [development-workflow.md](development-workflow.md) | 開発手順、検証、commit、push、deploy |
| [testing-and-quality.md](testing-and-quality.md) | テスト観点、手動確認、セキュリティ確認 |
| [security-and-disclaimer.md](security-and-disclaimer.md) | セキュリティ、秘密情報、免責、OSS運用 |
| [release-checklist.md](release-checklist.md) | リリース前チェックリスト |
| [decision-log.md](decision-log.md) | 重要な設計判断の記録 |

## ドキュメント更新ルール

- 仕様を変える場合は `requirements.md` を更新する
- 画面・状態管理・API・DB構成を変える場合は `architecture.md` または `data-and-neon.md` を更新する
- 問題、言語、Shop、敵、アイテムを増やす場合は `content-expansion-plan.md` と `content-guidelines.md` を確認する
- デプロイやDB反映を伴う場合は `development-workflow.md` と `release-checklist.md` を確認する
- 重要な判断をした場合は `decision-log.md` に追記する

