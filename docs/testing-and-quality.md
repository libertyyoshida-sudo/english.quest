# Testing and Quality

## 基本方針

English Quest は学習アプリのため、表示崩れやゲーム進行不具合だけでなく、問題データの品質も重要です。

## 自動確認

| 確認 | コマンド |
| --- | --- |
| JS構文 | `node --check app.js` |
| 依存関係脆弱性 | `npm audit --audit-level=moderate` |
| 本番ビルド | `npm run build` |
| DB seed | `npm run db:seed` |

## 手動確認

| 領域 | 観点 |
| --- | --- |
| フィールド | 初期表示、コマンド、Shop遷移、町の外への遷移 |
| バトル | 正誤判定、次へボタン、報酬、HP/MP |
| 問題数 | 3問、5問、10問が各モードで動く |
| Shop | 価格、購入可否、Gold不足時、フィールドへ戻る |
| マップ | 大陸アイコン重なり、地域切替、該当大陸のみ表示 |
| キーボード道場 | 言語別配列、スマホ入力、PC入力案内 |
| 音声 | 対応言語で再生、未対応言語の案内 |

## データ品質

| 項目 | 確認 |
| --- | --- |
| ID | 重複なし |
| answer | choicesに含まれる |
| choices | 重複なし、4択 |
| level | 1-10 |
| language | 対応言語コードと一致 |
| category | vocab、grammar、phrase、culture等と一致 |

## リスクが高い変更

- `app.js` のグローバル状態変更
- ShopやInventoryの保存形式変更
- Neon schema変更
- 問題IDの変更
- localStorage schemaVersion変更
- マップ座標や画面遷移の変更

これらは手動確認を広げ、必要ならDB件数確認も実施します。

