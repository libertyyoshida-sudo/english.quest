# Architecture

## 概要

English Quest は、Vite の静的フロントエンドを中心に、Express + Prisma + Neon Database を組み合わせた学習ゲームです。

GitHub Pages では静的ファイルを配信し、API利用環境では Express サーバーから問題データ、ユーザー、バトル履歴を扱います。APIに接続できない場合でも、`shared/questionData.js` の fallback データで学習を継続できる構成です。

## 主要構成

| 領域 | ファイル | 役割 |
| --- | --- | --- |
| フロントエンド | `index.html` | 画面構造、主要UI |
| フロントエンド | `style.css` | RPG風UI、マップ、バトル、Shop等の見た目 |
| フロントエンド | `app.js` | ゲーム状態、学習モード、出題、バトル、Shop、マップ |
| 共有データ | `shared/questionData.js` | 問題データ、言語データ、fallback |
| 共有データ | `shared/gameData.js` | ゲーム内データ |
| API | `server/src/index.js` | Expressサーバー起動 |
| API | `server/src/routes/*.js` | auth、player、questions、battle のAPI |
| DB | `server/prisma/schema.prisma` | Prisma schema |
| DB | `server/prisma/seed.js` | Neon Database への問題seed |

## 状態管理

現状は `app.js` 内のクライアント状態と `localStorage` を中心に進捗を保持します。

| 状態 | 主な内容 |
| --- | --- |
| Player | HP、MP、EXP、Gold、レベル、称号 |
| Language Mastery | 言語別の熟達度、忘却曲線、マスター判定 |
| Inventory | Shopで購入したアイテム、解放済み機能 |
| Battle Session | 出題リスト、現在問、コンボ、報酬 |
| Answer Stats | 問題ID別の回答数、正解数、苦手判定 |

## 出題設計

問題は選択言語、学習モード、レベル、問題数に応じて生成します。

レベル内の問題が不足する場合は、近いレベルの問題から補充します。これにより、文法・単語・タイピング・リスニング・スピーキング・会話・文化・スマート学習で、3問、5問、10問の選択に対応します。

## APIとfallback

| 優先順位 | データ取得元 |
| --- | --- |
| 1 | Express API 経由の Neon Database |
| 2 | `shared/questionData.js` のローカルfallback |

コンテンツ追加時は Neon と fallback の不整合を避けるため、seed結果とローカルデータを確認します。

## 今後の設計方針

- `app.js` が肥大化しているため、将来的に出題、Shop、マップ、保存、音声をモジュール分割する
- Shop商品、解放条件、地域条件はデータ駆動に寄せる
- 問題データは重複検査と件数集計をスクリプト化する
- Neonを正としつつ、GitHub Pages単体でも最低限遊べるfallbackを維持する

