# English Quest 要件定義書

## Introduction

「English Quest」は、RPG 風のゲーム演出を通じて複数言語を楽しく学習できる Web アプリである。
本要件定義書は、現行機能と今後の開発方針を整理するものである。

現状の課題として、プレイヤーの進捗データ（EXP・レベル・ゴールド・回答統計・称号など）はページリロード時にすべてリセットされる。
セーブ機能を追加することで、ユーザーは次回起動時も学習の続きから再開できるようになり、学習継続性が大幅に向上する。

---

## Glossary

- **App**: English Quest 全体のシステム

### 多言語コンテンツ方針

- 英語以外の語彙も `Question` テーブルへ seed し、ログイン時の回答履歴と外部キーで接続する
- 各言語は段階的に 2,000語規模まで拡張できる構成とする
- 翻訳品質が学習成果に直結するため、大量語彙は機械生成のみで確定せず、検証済みデータセットまたはレビュー済みCSVから投入する
- 英語はTOEIC L&Rスコア帯、英語以外は日本で参照されやすい検定（JLPT、HSK、TOPIK、DELF/DALF、DELE、Goethe等）またはCEFRへ対応する難易度タグを表示する
- 単語、文法、フレーズ、文化問題は `lv` に加え、表示・分類用の検定レベルラベルを生成できること
- **Player**: アプリを使用する学習者
- **Progress**: EXP・レベル・ゴールド・称号・回答統計・コンボ実績を含むプレイヤーの進捗データ
- **SaveManager**: localStorage への Progress の読み書きを担当するモジュール
- **AnswerStats**: 各問題 ID に対する回答回数と正解回数を記録したオブジェクト（`{id: {attempts, correct}}`）
- **BattleSession**: 1 回のバトル（クイズセッション）の状態（問題リスト・現在問題番号・コンボ等）
- **TitleSet**: プレイヤーが獲得した称号 ID の集合
- **SAVE_KEY**: localStorage に使用するキー名（`eigoDQ_progress`）

---

## Requirements

---

### Requirement 1: たんごバトル（語彙 4 択）

**User Story:** 英語学習者として、日本語の意味から英単語を 4 択で選択する練習がしたい。そうすることで、英単語の意味を効率よく覚えられる。

#### Acceptance Criteria

1. WHEN ユーザーがフィールド画面で「たんごバトル」コマンドを選択したとき、THE App SHALL 選択された難易度・問題数の設定に従って VOCAB_DB から問題を生成し、バトル画面に遷移する。
2. WHEN 問題が表示されるとき、THE App SHALL 正解の日本語訳 1 択と無関係な語から選んだダミー 3 択の合計 4 択を画面に表示する。
3. WHEN ユーザーが選択肢を選択したとき、THE App SHALL 正解・不正解を判定し、正解選択肢を緑色・不正解選択肢を赤色でハイライトする。
4. WHEN 正解したとき、THE App SHALL EXP とゴールドをプレイヤーに付与し、コンボカウンターを 1 増加させる。
5. IF 不正解だったとき、THEN THE App SHALL コンボカウンターを 0 にリセットし、正解を表示する。
6. THE App SHALL 問題ごとに回答結果を AnswerStats に記録する。

---

### Requirement 2: まほうぶんぽう（文法 4 択）

**User Story:** 英語学習者として、英文法の穴埋め問題を 4 択で解きたい。そうすることで、ビジネス英語の文法知識を向上させられる。

#### Acceptance Criteria

1. WHEN ユーザーが「まほうぶんぽう」を選択したとき、THE App SHALL GRAMMAR_DB から難易度・問題数に従って問題を生成し、バトル画面に遷移する。
2. WHEN 問題が表示されるとき、THE App SHALL 穴埋め形式の英文と 4 択の選択肢を表示する。
3. WHEN ユーザーが選択肢を選択したとき、THE App SHALL 正解・不正解を判定し、解説テキストを表示する。
4. WHEN 正解したとき、THE App SHALL EXP（+15）とゴールド（+3）を基本値としてプレイヤーに付与する。
5. THE App SHALL 問題ごとに回答結果を AnswerStats に記録する。

---

### Requirement 3: タイピング修行（英語タイピング）

**User Story:** 英語学習者として、日本語を見て英語をタイピングする練習がしたい。そうすることで、英単語のスペルを正確に習得できる。

#### Acceptance Criteria

1. WHEN ユーザーが「タイピング修行」を選択したとき、THE App SHALL バトル画面にテキスト入力フィールドを表示する。
2. WHEN ユーザーが回答を送信したとき、THE App SHALL 入力文字列と正解単語を大文字・小文字を区別せずに比較して正誤を判定する。
3. WHEN Enter キーが押されたとき、THE App SHALL 未回答状態であれば回答を送信し、回答済み状態であれば次の問題に進む。
4. WHEN 正解したとき、THE App SHALL EXP（+12）とゴールド（+2）を基本値としてプレイヤーに付与する。
5. THE App SHALL 問題ごとに回答結果を AnswerStats に記録する。

---

### Requirement 4: リスニング訓練（音声聞き取り 4 択）

**User Story:** 英語学習者として、読み上げられた英単語を 4 択で聞き取る練習がしたい。そうすることで、英語のリスニング力を養える。

#### Acceptance Criteria

1. WHEN 問題が表示されるとき、THE App SHALL Web Speech API を使用して対象英単語を英語音声で自動再生する。
2. WHEN ユーザーが「もう一度きく」ボタンを押したとき、THE App SHALL 対象英単語の音声を再度再生する。
3. WHEN ユーザーが選択肢を選択したとき、THE App SHALL 正解・不正解を判定する。
4. WHEN 正解したとき、THE App SHALL EXP（+18）とゴールド（+4）を基本値としてプレイヤーに付与し、listenCorrect カウンターを 1 増加させる。
5. IF Web Speech API がブラウザでサポートされていないとき、THEN THE App SHALL 音声再生をスキップして問題を表示し続ける。
6. THE App SHALL 問題ごとに回答結果を AnswerStats に記録する。

---

### Requirement 5: スピーキング道場（音声発音認識）

**User Story:** 英語学習者として、画面に表示された英単語を声に出して発音する練習がしたい。そうすることで、英語の発音を向上させられる。

#### Acceptance Criteria

1. WHEN 問題が表示されるとき、THE App SHALL 発音対象の英単語を画面に表示し、手本として音声を再生する。
2. WHEN ユーザーが「はなす！」ボタンを押したとき、THE App SHALL 音声認識を開始し、認識結果を正解単語と比較する。
3. WHEN 音声認識結果が正解単語と一致するとき（完全一致・前方一致・レーベンシュタイン距離 1 以内を含む）、THE App SHALL 正解と判定する。
4. WHEN 正解したとき、THE App SHALL EXP（+20）とゴールド（+5）を基本値としてプレイヤーに付与し、speakCorrect カウンターを 1 増加させる。
5. IF 音声が認識されなかったとき、THEN THE App SHALL 「きこえなかった…もう一度！」と表示し、再試行を可能にする。
6. IF Web Speech Recognition API がブラウザでサポートされていないとき、THEN THE App SHALL 「このブラウザは音声認識に対応していません」と表示する。
7. THE App SHALL 問題ごとに回答結果を AnswerStats に記録する。

---

### Requirement 6: よわてき集中（弱点問題重点出題）

**User Story:** 英語学習者として、正答率の低い問題を重点的に練習したい。そうすることで、弱点を効率的に克服できる。

#### Acceptance Criteria

1. WHEN ユーザーが「よわてき集中」を選択したとき、THE App SHALL AnswerStats を参照し、回答済み問題のうち正答率 60% 未満かつ 2 回以上回答した問題を優先的に出題する。
2. IF 弱点問題が設定問題数に満たないとき、THEN THE App SHALL 未回答問題を補完して出題する。
3. WHEN 正解したとき、THE App SHALL EXP（+25）とゴールド（+6）を基本値としてプレイヤーに付与する。
4. THE App SHALL 問題ごとに回答結果を AnswerStats に記録する。

---

### Requirement 7: 難易度・問題数設定

**User Story:** 英語学習者として、自分のレベルに合わせた難易度と問題数を選択したい。そうすることで、適切な難易度で学習できる。

#### Acceptance Criteria

1. THE App SHALL フィールド画面にレベル選択（自動 / Lv.1-Lv.10 / ぜんぶ）と問題数選択（3問 / 5問 / 10問）のセレクトボックスを表示する。
2. WHEN 難易度が「ぜんぶ」のとき、THE App SHALL 全難易度の問題プールから出題する。
3. WHEN 特定の難易度が選択されているとき、THE App SHALL 当該難易度の問題のみを出題する。
4. WHEN 出題可能な問題数が設定問題数に満たないとき、THE App SHALL 近いレベルの問題から補充してバトルを開始する。

---

### Requirement 8: EXP・レベルシステム

**User Story:** 英語学習者として、正解によって経験値を獲得しレベルアップする成長感を得たい。そうすることで、学習モチベーションを維持できる。

#### Acceptance Criteria

1. WHEN 正解したとき、THE App SHALL モード基本 EXP にコンボ倍率（3 コンボ: ×1.5 / 5 コンボ: ×2.0 / 10 コンボ: ×3.0）を乗算した EXP をプレイヤーに付与する。
2. WHEN 累積 EXP が次レベルの閾値を超えたとき、THE App SHALL レベルアップ演出を表示する。
3. THE App SHALL Lv.1（EXP 0）から Lv.10（EXP 3500）までの 10 段階レベルテーブルを保持し、レベルに応じてキャラクターアイコン・HP・MP を更新する。
4. THE App SHALL EXP バーに現在レベル内の進捗を数値とバーグラフで表示する。

---

### Requirement 9: ゴールドシステム

**User Story:** 英語学習者として、正解によってゴールドを獲得したい。そうすることで、ゲーム的な達成感を得られる。

#### Acceptance Criteria

1. WHEN 正解したとき、THE App SHALL モード基本ゴールドにコンボ倍率を乗算したゴールドをプレイヤーに付与する。
2. THE App SHALL ヘッダーにプレイヤーの累計ゴールドを表示する。

---

### Requirement 10: 称号システム

**User Story:** 英語学習者として、条件を達成したときに称号を獲得したい。そうすることで、達成感と学習継続意欲が高まる。

#### Acceptance Criteria

1. WHEN 回答・レベルアップ・ゴールド獲得後に称号獲得条件を満たしたとき、THE App SHALL 称号獲得ダイアログを表示する。
2. THE App SHALL 同一称号を重複して付与しない。
3. THE App SHALL フィールド画面の称号一覧に獲得済み称号をバッジとして表示する。
4. THE App SHALL 11 種類の称号（はじめての勇者・10問せいかいし・50問せいかいし・かんぺき勇者・5コンボ達人・10コンボ伝説・ちょうりょく5・はっわ5・レベル5達成・まおうをたおした・ゴールド100G）の獲得条件を保持する。

---

### Requirement 11: バトル演出

**User Story:** 英語学習者として、敵キャラクターとのバトル演出の中で問題を解きたい。そうすることで、RPG ゲームを遊んでいるような没入感を得られる。

#### Acceptance Criteria

1. WHEN バトルが開始されるとき、THE App SHALL 難易度に連動した敵キャラクター（Lv.1〜10 の 10 種）を表示する。
2. WHEN 正解したとき、THE App SHALL 敵のダメージアニメーションとエフェクトパーティクルを表示する。
3. WHEN 全問題を解き終えたとき、THE App SHALL 敵の撃破アニメーションを表示する。
4. THE App SHALL バトル進捗バー（問題番号 / 総問題数）と敵 HP バーを表示し、回答のたびに更新する。
5. WHEN コンボが 3 以上継続するとき、THE App SHALL コンボ数をバトル画面に表示する。

---

### Requirement 12: リザルト画面

**User Story:** 英語学習者として、バトル終了後に結果を確認したい。そうすることで、自分の正答率と弱点問題を把握できる。

#### Acceptance Criteria

1. WHEN 全問題を解き終えたとき、THE App SHALL リザルト画面に正解数・総問題数・正答率・獲得 EXP・獲得ゴールドを表示する。
2. THE App SHALL リザルト画面に不正解だった問題の一覧（問題文・正解・自分の回答）を表示する。
3. WHEN 正答率が 100% のとき、THE App SHALL hasPerfect フラグを true に設定する。
4. THE App SHALL「もう一度」ボタンと「フィールドへ」ボタンを提供する。

---

### Requirement 13: 進捗の自動保存（新機能）

**User Story:** 英語学習者として、アプリを閉じても学習進捗が保存されるようにしたい。そうすることで、次回起動時も同じ状態から続きを学習できる。

#### Acceptance Criteria

1. WHEN バトルセッションが終了したとき、THE SaveManager SHALL プレイヤーの Progress（totalExp・gold・lv・totalAnswers・totalCorrect・listenCorrect・speakCorrect・maxCombo・hasPerfect・titles・AnswerStats）を SAVE_KEY（`eigoDQ_progress`）をキーとして localStorage に JSON 形式で保存する。
2. THE SaveManager SHALL 保存する JSON に schemaVersion フィールド（初期値: `1`）を含める。
3. WHEN App が起動したとき、THE SaveManager SHALL localStorage から SAVE_KEY のデータを読み込む。
4. WHEN 有効なセーブデータが存在するとき、THE App SHALL セーブデータの値でプレイヤー状態を復元し、ヘッダー・EXP バー・フィールド画面を更新する。
5. IF localStorage からのデータ読み込み中に JSON パースエラーが発生したとき、THEN THE SaveManager SHALL セーブデータを削除し、初期状態で起動する。
6. IF localStorage からのデータ読み込み中に schemaVersion が不一致だったとき、THEN THE SaveManager SHALL セーブデータを削除し、初期状態で起動する。
7. THE App SHALL ページリロード後にプレイヤーが同一の EXP・レベル・ゴールド・称号数・AnswerStats を保持していることを保証する。

---

### Requirement 14: 手動セーブ・リセット操作（新機能）

**User Story:** 英語学習者として、進捗を意図的にリセットしたい。そうすることで、最初からやり直すことができる。

#### Acceptance Criteria

1. THE App SHALL フィールド画面にリセットボタンを提供する。
2. WHEN リセットボタンが押されたとき、THE App SHALL 確認ダイアログを表示し、ユーザーの明示的な承認を求める。
3. WHEN ユーザーがリセットを承認したとき、THE SaveManager SHALL SAVE_KEY のデータを localStorage から削除し、プレイヤー状態を初期値に戻す。
4. WHEN ユーザーがリセットをキャンセルしたとき、THE App SHALL データを変更せずにダイアログを閉じる。

---

### Requirement 15: セーブデータの整合性（新機能）

**User Story:** 英語学習者として、正しいデータがロードされることを確認したい。そうすることで、不整合なデータによる動作異常を回避できる。

#### Acceptance Criteria

1. THE SaveManager SHALL セーブデータを保存するとき、totalExp が 0 以上の整数であることを保証する。
2. THE SaveManager SHALL セーブデータを保存するとき、lv が 1 以上 10 以下の整数であることを保証する。
3. THE SaveManager SHALL セーブデータを保存するとき、gold が 0 以上の整数であることを保証する。
4. IF ロードしたセーブデータの lv が totalExp から算出されるレベルと異なるとき、THEN THE SaveManager SHALL totalExp から lv を再計算して上書きする。
5. THE SaveManager SHALL AnswerStats に含まれる各エントリについて、`correct <= attempts` が成立することを保証する。
6. FOR ALL 有効な Progress オブジェクト p に対して、SaveManager が `save(p)` を実行し、その後 `load()` を実行したとき、`load()` の結果は p と等価でなければならない（ラウンドトリップ性質）。

---

### Requirement 16: ログイン・登録・表示言語切替

**User Story:** 学習者として、ログインページから日本語/英語のUIを選択し、必要に応じてパスワードを再設定したい。そうすることで、英語UIでの利用とアカウント復旧ができる。

#### Acceptance Criteria

1. THE App SHALL ログインページに日本語/Englishの表示言語切替を提供する。
2. WHEN 表示言語が English に設定されているとき、THE App SHALL ログインページおよび主要操作ボタンを英語表示にする。
3. THE App SHALL 表示言語と学習言語を別状態として保持し、学習言語の変更だけでUI表示言語を変更しない。
4. THE App SHALL 新規登録時にユーザー名、メールアドレス、パスワードを必須とする。
5. THE App SHALL パスワード再設定時にユーザー名、登録メールアドレス、新しいパスワードを照合・更新する。
6. IF メールアドレスの形式が不正なとき、THEN THE App SHALL 登録または再設定を拒否する。
7. IF パスワードが4文字未満のとき、THEN THE App SHALL 登録または再設定を拒否する。
8. THE App SHALL Googleアカウントによるログインを提供できる。
9. WHEN Googleログインが成功したとき、THE App SHALL Googleの確認済みメールアドレスを利用して既存アカウントへ紐づけ、該当アカウントがなければ新規ユーザーを作成する。
10. IF `GOOGLE_CLIENT_ID` が未設定のとき、THEN THE App SHALL Googleログインボタンを表示せず、準備中メッセージを表示する。
11. THE App SHALL ログインユーザーが勇者名を20文字以内で変更できるようにする。
12. WHEN Google新規ログイン時にGoogle表示名が取得できるとき、THE App SHALL その表示名を初期勇者名として使用する。

---

## 正しさの性質（Correctness Properties）

### CP-1: セーブ/ロードのラウンドトリップ（不変条件）

> FOR ALL 有効な Progress オブジェクト p に対して、`JSON.parse(JSON.stringify(p))` は p と等価でなければならない。  
> すなわち、`SaveManager.save(p)` → `SaveManager.load()` の結果が p と等価であること。

- **性質の種類**: ラウンドトリップ
- **テスト方法**: プロパティベーステスト（任意の Progress オブジェクトを生成し、保存→読み込みを実施）

### CP-2: AnswerStats の不変条件

> FOR ALL AnswerStats の全エントリ r に対して、`r.correct <= r.attempts` かつ `r.attempts >= 0` が成立すること。

- **性質の種類**: 不変条件（Invariant）
- **テスト方法**: プロパティベーステスト（任意の回答シーケンスを生成して適用）

### CP-3: EXP とレベルの整合性

> FOR ALL totalExp の値 e に対して、`getLvRow(e).lv` は `LEVEL_TABLE` の対応するエントリの lv と等しいこと。

- **性質の種類**: 不変条件
- **テスト方法**: 全 EXP 境界値を網羅するユニットテスト

### CP-4: コンボ倍率の単調性

> FOR ALL コンボ値 c1 <= c2 に対して、`comboMult(c1) <= comboMult(c2)` が成立すること。

- **性質の種類**: 単調性（メタモルフィック性質）
- **テスト方法**: プロパティベーステスト

### CP-5: 称号の重複なし不変条件

> FOR ALL 称号付与操作の後、TitleSet に同一称号 ID が 2 つ以上含まれないこと。

- **性質の種類**: 不変条件
- **テスト方法**: 同一称号付与を複数回実行してサイズを確認

### CP-6: セーブデータの冪等性

> SaveManager が同一の Progress を 2 回連続して保存したとき、localStorage の値は 1 回保存したときと同一であること。  
> すなわち、`save(p)` の後に再度 `save(p)` を実行しても、`load()` の結果は変わらない。

- **性質の種類**: 冪等性（Idempotence）
- **テスト方法**: 保存を 2 回実行し、読み込み結果が一致することを検証
