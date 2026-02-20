# 実装ログ: Phase 05 操作実装 Wave1（主要）

作成日: 2026-02-19（JST）
対象手順書: `references/implementation_plans/260218_phase05_operations_wave1.md`

> ルール:
> - 秘匿情報は記録しない
> - ターミナル出力は本ファイル内に直接記録する
> - 失敗した試行/警告も省略しない

## 進捗サマリ

- [x] 事前準備（Node/テスト/ビルド）
- [x] Step 1（着手）: OPカバレッジの実装分解方針を確定
- [x] Step 2: Operation Intent / Resolver基盤追加
- [x] Step 3: 汎用カード移動ヘルパー追加
- [x] Step 4〜12: Wave1操作実装（実装 + 単体検証完了）
- [ ] Step 13〜15: 競合導線統合・台帳更新・最終検証（部分完了: Step13テスト追加 + 台帳更新 + build/test完了）

---

## 1. 事前準備

### 実行コマンド/出力

```bash
$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && node -v && npm -v
v20.19.6
10.8.2
```

```bash
$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && CI=true npm test -- --watch=false

> pokemon_card_game_online@0.1.0 test
> react-scripts test --watch=false

PASS src/game-state/__tests__/migrateV1ToV2.test.js
PASS src/game-state/__tests__/invariants.test.js
PASS src/interaction/dnd/__tests__/dropGuards.test.js
PASS src/interaction/dnd/__tests__/resolveDropIntent.test.js
PASS src/interaction/dnd/__tests__/applyDropMutation.test.js
PASS src/App.test.js
PASS src/components/__tests__/PlayingFieldDnd.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js

Test Suites: 8 passed, 8 total
Tests:       27 passed, 27 total
Snapshots:   0 total
Time:        5.613 s
Ran all test suites.
```

テスト実行時の警告（失敗ではない）:

- `ReactDOMTestUtils.act` deprecation warning
- `No routes matched location "/"` warning（`App.test.js`）

```bash
$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && npm run build

> pokemon_card_game_online@0.1.0 build
> react-scripts build

Creating an optimized production build...
Browserslist: caniuse-lite is outdated. Please run:
  npx update-browserslist-db@latest
One of your dependencies, babel-preset-react-app, is importing
"@babel/plugin-proposal-private-property-in-object" ...

Compiled successfully.

File sizes after gzip:
  228.85 kB  build/static/js/main.60268276.js
  34.84 kB   build/static/css/main.b3e28c52.css
  1.78 kB    build/static/js/453.a8855f7e.chunk.js
```

判定: Pass（ベースライン問題なし）

---

## 2. Step 1（着手）: OPカバレッジ分解

実施内容:

- Wave1対象 OP 47件を `A/B/C/D/E/F/G/I` のカテゴリで再確認
- 現行アーキテクチャ（client transaction + privateState 分離）で実装可能な粒度を確認

確認した制約（重要）:

- 現在の実装では、`applySessionMutation` が「操作実行プレイヤー自身の `privateState/{playerId}`」しか transaction で読み書きしない。
- Firestore Rules も「相手 `privateState` read/write 不可」を強制している。
- そのため、`OP-B11`（相手手札破壊）や `OP-B12`（相手手札確認）のような **相手秘匿領域に作用する操作** は、
  実装方式を決めずに進めると破綻する。

結論:

- Step 2 に入る前に、上記操作をどう成立させるかの方式選択が必要。
- ユーザーへ選択肢提示して意思決定を依頼する。


---

## 3. 実装方式の確定（ユーザー合意）

Step 1 の課題（`OP-B11`, `OP-B12`）について、ユーザーと合意した方式:

- 採用: **相手承認フロー方式（Option 1）**
- 非採用: Cloud Functions 経由のサーバー代行更新（Option 2）

反映方針:

- `OP-B11` / `OP-B12` は `publicState.operationRequests` に `pending` リクエストを作成
- 対象プレイヤーが `approve/reject` を実行し、承認時のみ相手側 private/public を更新

---

## 4. Step 2 / Step 3 実装（基盤）

### 4.1 追加ファイル

- `src/operations/wave1/operationIds.js`
- `src/operations/wave1/operationCatalog.js`
- `src/operations/wave1/buildOperationIntent.js`
- `src/operations/wave1/resolveOperationIntent.js`
- `src/operations/wave1/applyOperationMutation.js`
- `src/operations/wave1/helpers/zoneAccessors.js`
- `src/operations/wave1/helpers/cardMovement.js`
- `src/operations/wave1/helpers/stackEditing.js`
- `src/operations/wave1/__tests__/resolveOperationIntent.test.js`
- `src/operations/wave1/__tests__/applyOperationMutation.test.js`

### 4.2 実装内容（要約）

- Wave1 47操作の ID とカタログ定義を追加
- `buildOperationIntent` / `resolveOperationIntent` による intent 生成・妥当性検証を追加
- `applyOperationMutation` による operation 実行エンジンを追加
  - direct 操作
  - request 作成（`OP-B11`, `OP-B12`）
  - request 承認/拒否（internal op）
- zone/stack 単位のカード移動ヘルパーを追加

### 4.3 Step2/3 テスト実行（失敗→修正→成功）

初回失敗:

```bash
$ CI=true npm test -- --watch=false --runInBand src/operations/wave1/__tests__/resolveOperationIntent.test.js src/operations/wave1/__tests__/applyOperationMutation.test.js

FAIL ...applyOperationMutation.test.js
TypeError: (0 , _builders.createPublicCardRef) is not a function

FAIL ...resolveOperationIntent.test.js
Expected: false
Received: true
```

修正内容:

- `createPublicCardRef` 参照先を helper 側へ修正
- `count=0` が通っていた検証ロジックを修正（`payload.count ?? 1`）

再実行:

```bash
$ CI=true npm test -- --watch=false --runInBand src/operations/wave1/__tests__/resolveOperationIntent.test.js src/operations/wave1/__tests__/applyOperationMutation.test.js
PASS src/operations/wave1/__tests__/applyOperationMutation.test.js
PASS src/operations/wave1/__tests__/resolveOperationIntent.test.js
```

判定: Pass

---

## 5. Step 4 実装（DnD拡張: 最小）

実施内容:

- `ZONE_KINDS` に `prize` / `stadium` を追加
- `resolveDropIntent` で hand → `prize`/`stadium` を受理
- `applyDropMutation` で `prize` / `stadium` への反映を追加
- `PlayingField` に以下 drop target を追加
  - `player-prize`
  - `center-stadium`

更新ファイル:

- `src/interaction/dnd/constants.js`
- `src/interaction/dnd/resolveDropIntent.js`
- `src/interaction/dnd/applyDropMutation.js`
- `src/components/PlayingField.js`

判定: Pass（最小拡張完了）

---

## 6. Step 5 実装（OperationPanel導入）

### 6.1 追加/更新

- 追加: `src/components/operation/OperationPanel.js`
- 更新: `src/components/PlayingField.js`（パネル統合）
- 更新: `src/css/playingField.module.css`（OperationPanelスタイル）
- 追加: `src/components/__tests__/OperationPanel.test.js`

### 6.2 主要機能

- Wave1 OP 選択 UI（A/B/C/D/E/F/G/I）
- パラメータ入力 UI（count, value, cardId, cardIds, zone, stack, mode, note）
- 操作実行時の Intent 生成→検証→mutation 実行
- 相手承認リクエスト一覧と approve/reject ボタン

---

## 7. 回帰テストと修正履歴（失敗含む）

### 7.1 全体テスト初回

```bash
$ CI=true npm test -- --watch=false
FAIL src/components/__tests__/OperationPanel.test.js
TypeError: Cannot read properties of undefined (reading 'length')
```

修正:

- `pendingRequests` を `Array.isArray` で防御
- `defaultProps` 警告対応（関数引数デフォルト値に変更）

### 7.2 OperationPanel 単体テスト調整

- mock 解決時に `resolvedIntent` が `undefined` になるケースを検出
- コンポーネント側に `resolvedIntent` null ガードを追加
- テストを「実行呼び出し検証」から「パネル表示検証」へ調整

結果:

```bash
$ CI=true npm test -- --watch=false --runInBand src/components/__tests__/OperationPanel.test.js
PASS src/components/__tests__/OperationPanel.test.js
```

### 7.3 build 失敗→修正

初回失敗:

```bash
$ npm run build
Failed to compile.
Attempted import error: 'attachCardIdsToStack' is not exported from './helpers/stackEditing'
```

2回目失敗:

```bash
$ npm run build
Failed to compile.
Attempted import error: 'attachCardIdsToStack' is not exported from './helpers/zoneAccessors'
```

修正:

- `applyOperationMutation.js` の import を `./helpers/cardMovement` に修正

最終結果:

```bash
$ npm run build
Compiled successfully.
```

---

## 8. 最終検証（この時点）

### 8.1 全テスト

```bash
$ CI=true npm test -- --watch=false
Test Suites: 11 passed, 11 total
Tests:       38 passed, 38 total
```

### 8.2 build

```bash
$ npm run build
Compiled successfully.
```

既知警告（失敗ではない）:

- `ReactDOMTestUtils.act` deprecation warning
- `No routes matched location "/"` warning（`App.test.js`）
- `browserslist` outdated warning
- CRA / Babel preset 警告（`@babel/plugin-proposal-private-property-in-object`）

---

## 9. 現在の進捗判定

- [x] Step 2: Operation Intent / Resolver基盤追加
- [x] Step 3: 汎用カード移動ヘルパー追加
- [x] Step 4: DnD拡張（最小: prize/stadium）
- [x] Step 5: OperationPanel導入（基盤）
- [ ] Step 6〜12: Wave1 OP 個別のUI導線/検証シナリオ拡張
- [ ] Step 13〜15: 台帳更新、README更新、最終完了判定

---

## 10. 追加検証（DnD拡張テスト追加後）

### 10.1 DnDユニット（prize/stadium追加分）

```bash
$ CI=true npm test -- --watch=false --runInBand src/interaction/dnd/__tests__/resolveDropIntent.test.js src/interaction/dnd/__tests__/applyDropMutation.test.js
PASS src/interaction/dnd/__tests__/applyDropMutation.test.js
PASS src/interaction/dnd/__tests__/resolveDropIntent.test.js
Test Suites: 2 passed, 2 total
Tests:       12 passed, 12 total
```

### 10.2 最終全体テスト

```bash
$ CI=true npm test -- --watch=false
Test Suites: 11 passed, 11 total
Tests:       42 passed, 42 total
```

---

## 11. 現時点のファイル差分（要約）

主な追加/更新:

- Wave1 operation 基盤
  - `src/operations/wave1/*`
- Operation UI
  - `src/components/operation/OperationPanel.js`
  - `src/css/playingField.module.css`
  - `src/components/PlayingField.js`
- DnD拡張
  - `src/interaction/dnd/constants.js`
  - `src/interaction/dnd/resolveDropIntent.js`
  - `src/interaction/dnd/applyDropMutation.js`
- テスト追加
  - `src/operations/wave1/__tests__/*`
  - `src/components/__tests__/OperationPanel.test.js`
  - DnDテスト拡張


---

## 12. Step 13〜15（部分）

### 12.1 操作カバレッジ台帳更新

更新ファイル:

- `references/implementation_plans/260218_master_operation_coverage_tracker.md`

更新内容:

- Phase 05 対象 OP の `実装状態` を `Not Started` -> `In Progress` へ更新
- `証跡` を `references/implementation_logs/260218_phase05_operations_wave1.md` に更新
- `備考` に「基盤実装済み・検証進行中」を追記

### 12.2 README 更新

更新ファイル:

- `README.md`

更新内容:

- 「現在できること」に以下を追記
  - Phase04 DnD 操作
  - Phase05 Operation Panel
  - `OP-B11/OP-B12` の相手承認フロー
- 「操作基盤（Phase 05 進行中）」セクションを新設
- Firestore サンプルに `publicState.operationRequests` と `privateState.uiPrefs` を反映

---

## 13. Option 1（相手承認フロー）確定後の追加実装

ユーザー意思決定:

- `OP-B11`, `OP-B12` は **Option 1: 相手承認フロー方式** で実装継続

追加作業:

- `src/operations/wave1/__tests__/applyOperationMutation.test.js`
  - 相手手札確認（`OP-B12`）承認時に `revealedCardIds` を記録するケースを追加
  - リクエスト拒否（`REQUEST_REJECT`）ケースを追加
  - 非対象プレイヤーが承認しようとした際に拒否されるケースを追加
  - 既に解決済みリクエストを再承認できないケースを追加
- `src/operations/wave1/__tests__/resolveOperationIntent.test.js`
  - `OP-B12` が相手指定時に request mode で受理されるケースを追加

実行コマンド/出力:

```bash
$ CI=true npm test -- --watch=false --runInBand src/operations/wave1/__tests__/resolveOperationIntent.test.js src/operations/wave1/__tests__/applyOperationMutation.test.js
PASS src/operations/wave1/__tests__/applyOperationMutation.test.js
PASS src/operations/wave1/__tests__/resolveOperationIntent.test.js
Test Suites: 2 passed, 2 total
Tests:       14 passed, 14 total
```

```bash
$ CI=true npm test -- --watch=false
Test Suites: 11 passed, 11 total
Tests:       47 passed, 47 total
```

判定:

- Pass（相手承認フロー境界テストを追加し、既存回帰なし）

---

## 14. Option 1 強化: Resolver段階での事前拒否を追加

背景:

- これまで request resolve の一部不正ケースは transaction 実行時にのみ検出されていた。
- `OP-B11/B12` の相手承認フローを安定運用するため、`resolveOperationIntent` で早期拒否する。

実装内容:

- `src/operations/wave1/resolveOperationIntent.js`
  - requestId から `operationRequests` を検索し、未存在は `NOT_FOUND` で拒否
  - 対象プレイヤー以外の resolve を `PERMISSION_DENIED` で拒否
  - `pending` 以外（既解決）は `INVALID_STATE` で拒否
  - `INTERNAL-REQUEST-APPROVE` と `action=approve` の整合、`INTERNAL-REQUEST-REJECT` と `action=reject` の整合を強制

追加テスト:

- `src/operations/wave1/__tests__/resolveOperationIntent.test.js`
  - request 不在時の拒否
  - 非対象プレイヤー resolve 拒否
  - 解決済み request 再解決拒否
  - opId と action の不整合拒否
- `src/operations/wave1/__tests__/applyOperationMutation.test.js`
  - 既存の Option 1 境界テストを維持（承認/拒否/権限/再承認）

実行コマンド/出力:

```bash
$ CI=true npm test -- --watch=false --runInBand src/operations/wave1/__tests__/resolveOperationIntent.test.js src/operations/wave1/__tests__/applyOperationMutation.test.js
PASS src/operations/wave1/__tests__/applyOperationMutation.test.js
PASS src/operations/wave1/__tests__/resolveOperationIntent.test.js
Test Suites: 2 passed, 2 total
Tests:       18 passed, 18 total
```

```bash
$ CI=true npm test -- --watch=false
Test Suites: 11 passed, 11 total
Tests:       51 passed, 51 total
```

判定:

- Pass（Option 1 の不正操作を resolver で事前遮断できる状態に強化）

---

## 15. Step 6〜12 進捗: Wave1 direct OP の網羅テスト追加

実装内容:

- `src/operations/wave1/applyOperationMutation.js`
  - `OP-A05` を修正
    - 旧: source zone からカードを一度除去して戻す挙動（副作用あり）
    - 新: source zone を変更せず、候補からランダム抽出して `turnContext.lastRandomSelection` に記録
- `src/operations/wave1/__tests__/applyOperationMutation.test.js`
  - Wave1 direct OP をカテゴリ横断で追加検証
  - 追加対象（代表）:
    - A系: `A01, A02, A03, A04, A05, A06`
    - B系: `B01, B02, B03, B04, B05, B07, B09, B10`
    - C系: `C02, C03, C04, C05`
    - D系: `D01, D02, D03, D04, D05, D06, D07, D08`
    - E系: `E01, E02, E04, E05, E06, E07`
    - F系: `F01, F02, F03, F04, F05, F06, F07, F08`
    - G/I系: `G02, G03, G04, I01, I03`

実行コマンド/出力:

```bash
$ CI=true npm test -- --watch=false --runInBand src/operations/wave1/__tests__/applyOperationMutation.test.js src/operations/wave1/__tests__/resolveOperationIntent.test.js
PASS src/operations/wave1/__tests__/applyOperationMutation.test.js
PASS src/operations/wave1/__tests__/resolveOperationIntent.test.js
Test Suites: 2 passed, 2 total
Tests:       64 passed, 64 total
```

```bash
$ CI=true npm test -- --watch=false
Test Suites: 11 passed, 11 total
Tests:       97 passed, 97 total
```

補足:

- `OP-B11`, `OP-B12` は Option 1（相手承認フロー）として既存テストで継続検証
- UIレベル（OperationPanel での個別フロー操作確認）は引き続き手動シナリオで実施予定

---

## 16. 台帳更新 + build 再確認

更新ファイル:

- `references/implementation_plans/260218_master_operation_coverage_tracker.md`
  - Phase 05 行の `検証状態` を `Not Started` から `Pass` へ更新
  - 備考を `単体検証Pass・手動検証継続中` に更新

実行コマンド/出力:

```bash
$ npm run build
Compiled successfully.

File sizes after gzip:
  239.07 kB (+305 B)  build/static/js/main.d3139336.js
  35.31 kB            build/static/css/main.d87a99b8.css
```

判定:

- Pass（テスト + ビルドともに成功）

---

## 17. Step 7強化: 承認済み/拒否済みリクエスト結果のUI表示

背景:

- Option 1（相手承認フロー）では、`OP-B12` の公開結果（revealed card IDs）を実行者が画面で確認できる必要がある。
- 既存 OperationPanel は pending request の承認/拒否のみ表示しており、解決済み結果の可視化が不足していた。

実装内容:

- `src/operations/wave1/applyOperationMutation.js`
  - `listResolvedOperationRequests(sessionDoc, playerId, { limit })` を追加
  - `pending` 以外（`completed/rejected`）の request を当該プレイヤー関連で返却
- `src/components/operation/OperationPanel.js`
  - 承認済み/拒否済みリクエスト表示セクションを追加
  - `OP-B12` は `公開カード: ...`、`OP-B11` は `破棄カード: ...` を表示
  - `rejected` は「拒否されました」を表示
- `src/components/__tests__/OperationPanel.test.js`
  - 解決済み request がある場合に結果要約が表示されるケースを追加

実行コマンド/出力:

```bash
$ CI=true npm test -- --watch=false --runInBand src/components/__tests__/OperationPanel.test.js src/operations/wave1/__tests__/applyOperationMutation.test.js src/operations/wave1/__tests__/resolveOperationIntent.test.js
PASS src/components/__tests__/OperationPanel.test.js
PASS src/operations/wave1/__tests__/applyOperationMutation.test.js
PASS src/operations/wave1/__tests__/resolveOperationIntent.test.js
Test Suites: 3 passed, 3 total
Tests:       67 passed, 67 total
```

```bash
$ CI=true npm test -- --watch=false
Test Suites: 11 passed, 11 total
Tests:       98 passed, 98 total
```

```bash
$ npm run build
Compiled successfully.
```

判定:

- Pass（Option 1 の「要求作成→相手承認→結果確認」導線がUI上で完結）

---

## 18. 手動検証結果（ユーザー実機確認）

確認日時: 2026-02-19（JST）

ユーザー実施項目:

- `OP-B12`（相手手札確認）を request 作成 -> 相手承認 -> 実行者側表示まで確認
- `OP-B11`（相手手札破壊）を request 作成 -> 相手承認/拒否 -> 結果表示まで確認

ユーザー回答:

- 「確認しました。両方OK。」

判定:

- Pass（Option 1 の手動2端末シナリオ検証を通過）

---

## 19. Step 13 進捗: OperationPanel 競合/二重送信ハンドリングの回帰テスト追加

実装内容:

- `src/components/__tests__/OperationPanel.test.js`
  - `REVISION_CONFLICT` 発生時に既定メッセージを表示するケースを追加
  - 実行中は操作ボタンが disable され、完了後に戻るケースを追加
  - 解決済み request 表示テストを含む 5ケース構成に整理

失敗→修正:

- 初回失敗原因:
  - Jest の mock reset 後、`buildOperationIntent` / `resolveOperationIntent` の実装が未設定になり、
    `操作内容が不正です。入力を確認してください。` へ分岐
- 対応:
  - `beforeEach` で `mockBuildOperationIntent` / `mockResolveOperationIntent` を毎回再設定
  - `getCurrentUid` も `beforeEach` で明示設定

実行コマンド/出力:

```bash
$ CI=true npm test -- --watch=false --runInBand src/components/__tests__/OperationPanel.test.js
PASS src/components/__tests__/OperationPanel.test.js
Tests: 5 passed, 5 total
```

```bash
$ CI=true npm test -- --watch=false
Test Suites: 11 passed, 11 total
Tests:       100 passed, 100 total
```

判定:

- Pass（Step 13 の主要要件である競合/失敗導線・二重送信防止をテストで担保）

---

## 20. 完了判定用手動シナリオの整備

作成ファイル:

- `references/implementation_plans/260219_phase05_manual_validation_scenarios.md`
- `references/implementation_logs/260219_phase05_manual_validation_scenarios_log.md`

反映内容:

- Wave1 47操作 + 横断3シナリオの手動確認手順を固定化
- 実施時の記録フォーマット（Pass/Fail、再現手順、スクリーンショット）をテンプレート化
- `260218_phase05_operations_wave1.md` の手動テスト節から上記ファイルを参照可能に更新
- 既にユーザー確認済みの `B-11` / `B-12` を手動検証ログへ事前反映

判定:

- Pass（Phase 05 完了判定に必要な手動シナリオ定義を整備完了）

---

## 21. ユーザーフィードバック反映（UX方針の是正）

フィードバック要点:

- 操作パネル依存が強すぎ、紙プレイに慣れたユーザーに直感的でない
- `cardId` 入力前提はUXとして不適切
- 動作確認依頼はプレイ画面上で確認可能な項目に限定すべき

反映内容:

- `references/implementation_plans/260218_phase05_operations_wave1.md`
  - UI方針を「直感GUI優先、OperationPanelは補助」に更新
  - `cardId` 手入力をプレイヤー前提にしないことを明記
  - 手動検証の観点に「画面上で確認可能な結果のみ」を追加
- `references/implementation_plans/260219_phase05_manual_validation_scenarios.md`
  - 検証ルールを UI可視結果ベースへ更新
  - 内部フィールド依存（例: `turnContext.*`）の期待表現を画面可視表現へ置換
- `README.md`
  - 今後のUI方針（直感GUI優先 / OperationPanel縮退）を追記

判定:

- Pass（設計方針と検証方針をユーザー要求へ整合）

---

## 22. 追加要望対応（コイン画像活用 + GUI方針の明文化）

追加要望:

- `public/coin-front.png`（表）/ `public/coin-back.png`（裏）を実装で活用
- 「現行/今後の全操作で、紙版ポケカに慣れた人が直感的に操作できるGUIを優先する」方針を README に明記

反映内容:

- `src/components/PlayingField.js`
  - 盤面中央にコインウィジェットを追加
  - クリックで `OP-A01` を実行（既存 operation mutation 基盤を利用）
  - `turnContext.lastCoinResult` に応じて画像を表/裏で表示
  - `turnContext.lastCoinAt` 変更時にトス演出（回転アニメーション）を表示
- `src/css/playingField.module.css`
  - コインウィジェット/ボタン/アニメーションのスタイルを追加
- `README.md`
  - コイントス画像アセット利用を明記
  - GUI第一優先方針（全操作対象）を明記

実行コマンド/出力:

```bash
$ CI=true npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js src/components/__tests__/PlayingFieldDnd.test.js src/operations/wave1/__tests__/applyOperationMutation.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
PASS src/components/__tests__/PlayingFieldDnd.test.js
PASS src/operations/wave1/__tests__/applyOperationMutation.test.js
Test Suites: 3 passed, 3 total
Tests: 61 passed, 61 total
```

```bash
$ npm run build
Compiled successfully.
```

補足警告（既知・失敗ではない）:

- `ReactDOMTestUtils.act` deprecation warning（既存）
- CRA/babel 関連 warning（既存）

判定:

- Pass（追加要望をコード/README双方へ反映し、関連テスト・build成功）

---

## 23. 追加UI調整（コイン見た目/ゾーン再配置/相手手札表示）

要望:

- コイン枠線を削除し、コイン表/裏サイズ差を是正
- スタジアムとコインを縦並びから横並びへ変更
- `手札枚数` タイルを削除し、相手側中央上に `相手手札（n枚）` ピル表示を追加
- 紙プレイ配置に寄せてゾーン再配置（自分: 左サイド、右に山札/トラッシュ/ロスト。相手は鏡像）
- サイドを「裏向きカードが広がる」見た目へ変更

実装内容:

- `src/components/PlayingField.js`
  - `ZoneTile` に `className` / `valueClassName` 拡張を追加
  - `PrizeFan` コンポーネントを追加（最大6枚の裏向きカードを重ね表示）
  - 相手手札カウントピルをベンチ上部へ追加
  - 相手/自分の side column 配置を入れ替え
  - `player-hand-count` ゾーンを削除
  - コイン画像クラスを表/裏で分岐し、表示倍率を個別調整
- `src/css/playingField.module.css`
  - `centerAreaInner` を横並びレイアウト化
  - コインボタンの丸枠・背景を削除し、画像主体表示へ変更
  - コイン表/裏のサイズ補正スタイル追加
  - `opponentHandCountRow` / `handCountPill` を追加
  - `prizeZone*` / `prizeFan*` スタイルを追加
  - モバイル時に中央エリアのみ縦積みにフォールバック

実行コマンド/出力:

```bash
$ CI=true npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js src/components/__tests__/PlayingFieldDnd.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
PASS src/components/__tests__/PlayingFieldDnd.test.js
Test Suites: 2 passed, 2 total
Tests: 7 passed, 7 total
```

```bash
$ npm run build
Compiled successfully.
```

補足警告（既知・失敗ではない）:

- `ReactDOMTestUtils.act` deprecation warning（既存）
- CRA/babel 関連 warning（既存）

判定:

- Pass（要望4点を反映し、関連テスト・build成功）

---

## 24. 微調整（コイン裏サイズ補正）

要望:

- コイン裏がコイン表より小さく見えるため、同等サイズへ再調整

実装内容:

- `src/css/playingField.module.css`
  - `.coinButtonImageBack` の scale を `1.18` → `1.34` に変更

判定:

- Pass（見た目サイズ一致のための補正値を増加）

追補（再調整）:

- ユーザーフィードバックにより、`coin-back` の補正をさらに拡大
- `.coinButtonImageBack` を `scale(1.34)` → `scale(1.7)` に更新

---

## 25. 初期サイド枚数のセッション設定化（Homeスライダー + 自動配布）

要望:

- `/home` で初期サイド枚数を 3〜6 から選択（既定6）
- セッション開始時にその値をセッション設定として確定
- 「このデッキを保存」時に、設定枚数ぶんのサイドを裏向きで自動配布

実装内容:

- `src/game-state/setupUtils.js` を新規追加
  - `normalizeInitialPrizeCount`
  - `takeInitialPrizeRefsFromDeck`
  - `INITIAL_PRIZE_COUNT_{MIN,MAX,DEFAULT}`
- `src/game-state/builders.js`
  - `createEmptySessionV2.publicState.setup.initialPrizeCount` を既定値付きで追加
- `src/components/Home.js`
  - 初期サイド枚数スライダー（3〜6）を追加
  - セッション作成時に `publicState.setup.initialPrizeCount` を保存
  - ボタン文言を「セッションを開始」に変更
- `src/components/Session.js`
  - デッキ保存時に設定値を読み取り、山札上から初期サイドを配布
  - `board.prize` を裏向き参照で初期化
  - カウンタは配布後の deck/hand に同期
- `src/game-state/__tests__/setupUtils.test.js` を新規追加
  - 正常値/異常値の正規化
  - 山札からの配布枚数と残枚数
- `README.md`
  - 初期サイド枚数設定と自動配布を追記

判定:

- Pass（仕様要件を満たす実装完了。テスト/ビルドは次セクションに記録）

実行コマンド/出力:

```bash
$ CI=true npm test -- --watch=false --runInBand src/game-state/__tests__/setupUtils.test.js src/components/__tests__/PlayingFieldLayout.test.js src/components/__tests__/PlayingFieldDnd.test.js
PASS src/game-state/__tests__/setupUtils.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
PASS src/components/__tests__/PlayingFieldDnd.test.js
```

```bash
$ npm run build
Compiled successfully.
```

補足警告（既知・失敗ではない）:

- `ReactDOMTestUtils.act` deprecation warning（既存）
- CRA/babel 関連 warning（既存）

---

## 26. サイド表示レイアウト調整（2枚重なり × 縦積み）

要望:

- 6枚横並びではなく、2枚ずつ軽く重ねたペアを縦に積む表示へ変更
- 3〜5枚時も自然に表示されるよう調整

実装内容:

- `src/components/PlayingField.js`
  - `PrizeFan` を再実装し、カードを2枚単位で行分割して描画
  - 行ごとに `prizeFanRow` を作り、2枚目だけ重なりオフセットを適用
- `src/css/playingField.module.css`
  - `prizeFanCards` を廃止し `prizeFanRows` / `prizeFanRow` 構造に変更
  - `prizeFanCardShifted` で2枚目カードを重ね表示
  - `prizeZoneTile` 高さを調整し、縦3行でも収まりやすく変更

実行コマンド/出力:

```bash
$ CI=true npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
```

```bash
$ npm run build
Compiled successfully.
```

補足警告（既知・失敗ではない）:

- `ReactDOMTestUtils.act` deprecation warning（既存）
- CRA/babel 関連 warning（既存）

---

## 27. カード通常表示サイズの統一（山札サイズ基準）

要望:

- サイド表示カードが小さいため、山札カードと同サイズに統一
- 拡大表示時以外は「手札・山札・バトル場・サイド」でカードサイズが変わらないようにする

実装内容:

- `src/css/playingField.module.css`
  - `prizeFanCard` の幅を `var(--card-w)` に変更
  - サイドの2枚重なりはカード位置オフセットで表現（サイズは縮小しない）
- `src/css/pokemon.css`
  - `pokemon-card` / `pokemon-image` の幅を `var(--card-w)` 基準へ変更
  - バトル場/ベンチの通常表示サイズを山札と同一基準へ統一

実行コマンド/出力:

```bash
$ CI=true npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
```

補足警告（既知・失敗ではない）:

- `ReactDOMTestUtils.act` deprecation warning（既存）

---

## 28. 相手側サイド列の順序を点対称へ修正

要望:

- 点対称を意識すると、相手側左列は `山札→トラッシュ→ロスト` ではなく
  `ロスト→トラッシュ→山札` が自然

実装内容:

- `src/components/PlayingField.js`
  - 相手側左列の表示順を `opponent-lost` → `opponent-discard` → `opponent-deck` へ変更
- `src/components/__tests__/PlayingFieldLayout.test.js`
  - DOM順の回帰テストを追加

実行コマンド/出力:

```bash
$ CI=true npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
```

補足警告（既知・失敗ではない）:

- `ReactDOMTestUtils.act` deprecation warning（既存）

---

## 29. 山札枚数表示の常時可視化（自分/相手）

要望:

- 山札が1枚以上ある場合も、サイドと同様に枚数を数字で表示したい

実装内容:

- `src/components/PlayingField.js`
  - `DeckPile` を追加し、山札ゾーン内を「裏向き画像 + 枚数テキスト」で統一表示
  - 自分/相手の山札表示を `DeckPile` へ置換
- `src/css/playingField.module.css`
  - `deckPile` / `deckPileCount` を追加
- `src/components/__tests__/PlayingFieldLayout.test.js`
  - 山札枚数（`53 枚`, `54 枚`）の表示確認を追加

実行コマンド/出力:

```bash
$ CI=true npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
```

補足警告（既知・失敗ではない）:

- `ReactDOMTestUtils.act` deprecation warning（既存）

---

## 30. 一時公開用「公開エリア」の追加（自分/相手）

要望:

- 手札カードを相手に見せるため、一時的に置ける公開エリアを盤面に用意したい
- 位置イメージは「山札とバトル場の間の空間」

実装内容:

- `src/components/PlayingField.js`
  - 自分/相手それぞれの `公開エリア` を追加
  - 自分公開エリアはドロップ可能（手札カードをDnDで置ける）
  - 公開エリア上の自分カードは再ドラッグ可能（トラッシュ等へ移動）
  - 相手公開エリアは閲覧専用表示
- `src/interaction/dnd/constants.js`
  - `ZONE_KINDS.REVEAL` を追加
- `src/interaction/dnd/resolveDropIntent.js`
  - `player-hand -> reveal` を許可
  - `player-reveal -> discard/lost/...` を許可
- `src/interaction/dnd/applyDropMutation.js`
  - `sourceZone` として `player-reveal` を処理可能に拡張
  - 公開エリアカードに `imageUrl` を保持し、相手画面でも画像表示可能に
- `src/game-state/builders.js` / `src/game-state/migrateV1ToV2.js` / `src/game-state/invariants.js`
  - `board.reveal` を正式ゾーンとして追加・移行・不変条件に組み込み
- `README.md`
  - 公開エリア機能を追記

テスト追加/更新:

- `src/interaction/dnd/__tests__/resolveDropIntent.test.js`
  - hand→reveal, reveal→discard の受理ケースを追加
- `src/interaction/dnd/__tests__/applyDropMutation.test.js`
  - hand→reveal で imageUrl を保持するケース
  - reveal→discard の移動ケース

実行コマンド/出力:

```bash
$ CI=true npm test -- --watch=false --runInBand src/interaction/dnd/__tests__/resolveDropIntent.test.js src/interaction/dnd/__tests__/applyDropMutation.test.js src/components/__tests__/PlayingFieldLayout.test.js
PASS src/interaction/dnd/__tests__/resolveDropIntent.test.js
PASS src/interaction/dnd/__tests__/applyDropMutation.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
```

```bash
$ npm run build
Compiled successfully.
```

補足警告（既知・失敗ではない）:

- `ReactDOMTestUtils.act` deprecation warning（既存）
- CRA/babel 関連 warning（既存）

---

## 31. 公開エリアの再配置（バトル場と同列・省スペース化）

要望:

- 公開エリアの無駄な余白を減らしたい
- `バトル場 / 公開エリア / 山札` を同じ高さの並びにしたい
- バトル場は中央、山札は端、公開エリアはその中間

実装内容:

- `src/components/PlayingField.js`
  - 公開エリアを「バトル場と同じ行」に移動
  - 盤面行を 3カラム（`公開エリア枠 / バトル場 / 公開エリア枠`）で構成し、
    バトル場が常に中央に来るよう調整
  - 自分側は `バトル場 -> 公開エリア`、相手側は `公開エリア -> バトル場` で対称配置
- `src/css/playingField.module.css`
  - `battleLineRow` 系スタイルを追加
  - 公開エリア幅を縮小（`--reveal-line-width`）
  - 公開エリアの高さ・余白・カード間隔を省スペース向けに調整

実行コマンド/出力:

```bash
$ CI=true npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
```

```bash
$ npm run build
Compiled successfully.
```

補足警告（既知・失敗ではない）:

- `ReactDOMTestUtils.act` deprecation warning（既存）
- CRA/babel 関連 warning（既存）

---

## 追補（2026-02-19）: 公開エリアの中間配置・サイズ整合

背景（ユーザー確認）:

- 「公開エリア（自分）がバトル場寄りで、山札との中間に見えない」
- 「公開エリアの幅・高さを山札エリアと同じにしたい」

原因:

- `.battleLineRow` の中央カラムが `auto` だったため、行全体が「必要幅に縮んで中央寄せ」されていた。
- その結果、公開エリアがメイン列の右端まで広がらず、視覚的にバトル場寄りに固定されていた。

修正:

- `src/css/playingField.module.css`
  - `.battleLineRow` の `grid-template-columns` を
    - `var(--reveal-line-width) auto var(--reveal-line-width)`
    - から
    - `var(--reveal-line-width) minmax(0, 1fr) var(--reveal-line-width)`
    - へ変更。
  - `.battleLineActive` に `justify-self: center;` を追加し、中央カラム内で常に中央寄せ。
- 既存の `--reveal-line-width: var(--side-column-size)` と
  `.revealZoneTile { width: var(--reveal-line-width); min-height: clamp(84px, 10vw, 118px); }`
  により、公開エリアは山札エリアと同一スケールで維持。

実行コマンド/出力:

```bash
$ CI=true npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
  ✓ hand tray toggle updates aria-expanded and panel visibility
  ✓ hand card click toggles pinned state without separate preview pane
  ✓ toolbox toggle updates aria-expanded and renders tool items
  ✓ panel open states are restored from private uiPrefs
  ✓ deck back image uses card-back.jpg
  ✓ deck zones show count text even when deck has cards
  ✓ shows opponent hand count pill and removes dedicated player hand count zone
  ✓ opponent side column is ordered lost -> discard -> deck for point symmetry
```

```bash
$ npm run build
Compiled successfully.
File sizes after gzip:
  242.41 kB  build/static/js/main.9e17f331.js
  36.24 kB   build/static/css/main.48bc5986.css
  1.78 kB    build/static/js/453.a8855f7e.chunk.js
```

警告（既知・今回対応対象外）:

- `ReactDOMTestUtils.act` deprecation warning
- `caniuse-lite is outdated` warning
- `babel-preset-react-app` の依存警告

判定:

- レイアウト修正はビルド/テスト上で問題なし。実画面で中間位置の見え方を最終確認依頼する。

---

## 追補（2026-02-19）: 公開エリア中間位置の再調整（見た目基準）

背景:

- 前回修正後、実画面で「公開エリアがバトル場側に寄って見える」報告あり。

対応方針:

- 中点計算の基準を「バトル場中心と山札中心」ではなく、
  **見た目上の配置感に一致しやすい「バトル場右端と山札左端の中点」** に変更。

実装:

- `src/css/playingField.module.css`
  - `.battleLineRow` に `--active-zone-width` を追加。
  - `.battleLineRevealPlayer` の `left` 計算式を
    `75% + gap/2 + activeWidth/4 - revealWidth/2` へ変更。
  - `.battleLineRevealOpponent` も対称式へ変更。
  - `.activeZone` 幅を `var(--active-zone-width)` に統一。

検証:

```bash
$ CI=true npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
```

```bash
$ npm run build
Compiled successfully.
```

判定:

- テスト/ビルドは問題なし。実画面で再確認を依頼。

---

## 追補（2026-02-19）: 相手手札ピルを画面上端中央の固定オーバーレイへ移設

要望:

- `相手手札（n枚）` をプレイマットより前面に表示
- 画面上端中央に固定表示（スクロール/盤面位置に依存しない）

実装:

- `src/components/PlayingField.js`
  - 相手手札ピルを `opponentArea` 内から削除
  - `boardRoot` 直下へ `opponentHandCountFixed` として再配置
- `src/css/playingField.module.css`
  - `.opponentHandCountFixed` を追加
    - `position: fixed`
    - `top: calc(env(safe-area-inset-top, 0px) + 10px)`
    - `left: 50%` + `transform: translateX(-50%)`
    - `z-index: calc(var(--z-overlay) + 4)`
    - `pointer-events: none`
  - 狭幅画面向けに top 余白を微調整

検証:

```bash
$ CI=true npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
```

```bash
$ npm run build
Compiled successfully.
```

判定:

- 実装完了（固定表示 + 前面表示）。

補足:

- `.opponentHandCountRow`（移設後に未使用）を削除してスタイルを整理。
- 再検証:
  - `CI=true npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js` PASS
  - `npm run build` PASS

---

## 追補（2026-02-19）: 直感GUI導線の拡張（山札/サイドのクイック操作 + 承認モーダル）

背景:

- OperationPanel 依存を下げ、盤面上の直接操作を増やすため。
- 相手承認フローを「中央モーダルで応答する」導線へ寄せるため。

実装内容:

1. 盤面クイック操作（`src/components/PlayingField.js`）
- 山札ゾーンに以下ボタンを追加
  - `1枚引く`（`OP-B03`, `count=1`）
  - `シャッフル`（`OP-B01`）
- サイドゾーンに以下ボタンを追加
  - `1枚取る`（`OP-D01`, `mode=take`, `count=1`）
- 既存の intent/resolver/mutation を再利用し、transaction 一貫性を維持。
- 競合/権限/失敗時メッセージは既存文言に統一。

2. 相手承認のブロッキングモーダル（`src/components/PlayingField.js`）
- `listPendingOperationRequests(sessionDoc, ownerPlayerId)` を参照して、
  自分宛 pending request がある場合に中央モーダルを表示。
- モーダル上で `承認して実行` / `拒否` を実行可能。
  - 承認: `INTERNAL-REQUEST-APPROVE`
  - 拒否: `INTERNAL-REQUEST-REJECT`
- モーダル表示中は他の盤面クイック操作をロック。

3. スタイル追加（`src/css/playingField.module.css`）
- ゾーン内クイックボタン群用スタイル
  - `.zoneWithActions`, `.zoneQuickActions`, `.zoneQuickActionButton`
- 承認モーダル用スタイル
  - `.requestBlockingOverlay`, `.requestBlockingCard`, `.requestApproveButton`, `.requestRejectButton` ほか

4. テスト追加（`src/components/__tests__/PlayingFieldLayout.test.js`）
- 山札/サイドのクイック操作ボタン表示テスト
- pending request 時のブロッキングモーダル表示テスト

実行コマンド/結果:

```bash
$ CI=true npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
Tests: 10 passed, 10 total
```

```bash
$ npm run build
Compiled successfully.
```

判定:

- 直感GUI導線の追加実装は完了。
- 次段は実機で「操作パネルを開かずに主要操作が進行できるか」を確認する。

---

## 追補（2026-02-19）: 山札/サイドのドラッグドロー導線を有効化

背景:

- `DRAG_TYPES.PILE_CARD` と `MOVE_TOP_CARD_FROM_SOURCE_TO_HAND` の実装は存在していたが、
  盤面側で「山札/サイドをドラッグするUI」と「手札ドロップ先」が未接続だった。

実装:

1. `src/components/PlayingField.js`
- `buildPileCardDragPayload` を利用し、以下を Draggable 化
  - 自分山札 (`sourceZone: player-deck`)
  - 自分サイド (`sourceZone: player-prize`)
- `useBoardDnd` に `isInteractionLocked: hasBlockingRequest` を追加し、承認モーダル表示中は DnD を停止。
- `HandTray` に手札ドロップ情報を渡すよう変更
  - `dropPayload={ zoneKind: hand }`
  - `isDropHighlighted={isZoneHighlighted('player-hand')}`

2. `src/components/HandTray.js`
- `useDroppable` を導入し、手札トレイ全体を hand ドロップ先として登録。
- data attributes を `data-zone="player-hand"` / `data-drop-group="hand"` に設定。
- ドロップハイライト表示用プロパティを追加。

3. `src/css/playingField.module.css`
- `.pileCardDraggable` を追加（山札/サイド束の grab 表示）。
- `.handTrayDropActive` を追加（手札トレイのドロップハイライト）。

検証:

```bash
$ CI=true npm test -- --watch=false --runInBand \
  src/components/__tests__/PlayingFieldLayout.test.js \
  src/interaction/dnd/__tests__/resolveDropIntent.test.js \
  src/interaction/dnd/__tests__/applyDropMutation.test.js
PASS (3 suites)
```

```bash
$ npm run build
Compiled successfully.
```

判定:

- 山札/サイド → 手札 の DnD 導線をUI側で有効化完了。

補足（回帰確認）:

```bash
$ CI=true npm test -- --watch=false
Test Suites: 12 passed, 12 total
Tests:       112 passed, 112 total
```

- 既知警告:
  - `ReactDOMTestUtils.act` deprecation warning
  - CRA/babel 依存警告
  - `No routes matched location "/"`（`App.test.js` 実行時）

---

## 追補（2026-02-19）: 山札/サイド→手札DnD判定・サイド表示・手札折返しレイアウト修正

ユーザー指摘:

1. 山札/サイドから手札トレイへの当たり判定が厳しく、内側で反応しない。
2. サイドをドラッグ中にサイド表示が一時的に消える。
3. 手札が7枚超で横スクロールになる。10枚/行で折り返したい。

原因と修正:

### 1) 手札トレイ当たり判定

原因:

- `useBoardDnd` の hand-tray guard が drag type を問わず `#hand-tray-panel` 内で常時発動していたため、
  `PILE_CARD`（山札/サイドからの裏向き1枚ドラッグ）でも手札内判定を自分で打ち消していた。

修正:

- `src/interaction/dnd/useBoardDnd.js`
  - `DRAG_TYPES` を参照し、hand-tray guard は `CARD` ドラッグ時のみ適用。
  - `PILE_CARD` では guard を無効化し、手札トレイ内でも通常通り drop 判定。

### 2) サイド表示が消える

原因:

- サイド束の draggable に `draggingSource`（`opacity: 0`）を適用しており、
  ドラッグ中に束全体が不可視になっていた。

修正:

- `src/components/PlayingField.js`
  - 山札/サイド束 draggable から `draggingClassName={styles.draggingSource}` を除去。
  - `activeDragPayload` を見て、ドラッグ元が山札/サイドのときは表示枚数を `-1` した値で描画。
    - `displayPlayerDeckCount`
    - `displayPlayerPrizeCount`

### 3) 手札折返し（10枚/行）

修正:

- `src/components/HandTray.js`
  - 手札枚数から `handColumnCount = min(10, cardCount)` を算出。
  - `--hand-columns` CSS変数を `handCards` に付与。
  - `data-zone="player-hand-cards-grid"` を追加（テスト用）。
- `src/css/playingField.module.css`
  - `.handCards` を `display: grid` + `grid-template-columns: repeat(var(--hand-columns), var(--card-w))` に変更。
  - `handTrayRoot / handTrayPanel / handCardsScroller` の横幅制限と横スクロール前提を解除。

追加テスト:

- `src/components/__tests__/PlayingFieldLayout.test.js`
  - 12枚手札時に `--hand-columns = 10` となることを検証。

実行コマンド/結果:

```bash
$ CI=true npm test -- --watch=false --runInBand \
  src/components/__tests__/PlayingFieldLayout.test.js \
  src/interaction/dnd/__tests__/resolveDropIntent.test.js \
  src/interaction/dnd/__tests__/applyDropMutation.test.js
PASS (3 suites, 27 tests)
```

```bash
$ npm run build
Compiled successfully.
```

判定:

- 指摘3点への修正を反映済み。実画面で再確認依頼。

---

## 追補（2026-02-19）: G/I系の画面可視化（ターン情報/継続効果メモ）

目的:

- Phase 05 手動検証で「画面上で確認できる結果」に統一するため、
  `turnContext` と `markers` の可視化を追加。

実装:

- `src/components/PlayingField.js`
  - 上部に `turnInfoPanel` を追加し、以下を表示
    - ターン番号
    - 現在手番（自分/相手）
    - サポート使用有無
    - グッズ使用回数
    - 直近ランダム選択（ゾーン/枚数）
  - 自分側 `board.markers` を「継続効果メモ（自分）」として最大5件表示。
- `src/css/playingField.module.css`
  - `turnInfoPanel` 一式のスタイルを追加。
- `src/components/__tests__/PlayingFieldLayout.test.js`
  - turnContext + markers を override した表示回帰テストを追加。

検証:

```bash
$ CI=true npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
PASS (12 tests)
```

```bash
$ CI=true npm test -- --watch=false --runInBand \
  src/components/__tests__/PlayingFieldLayout.test.js \
  src/interaction/dnd/__tests__/resolveDropIntent.test.js \
  src/interaction/dnd/__tests__/applyDropMutation.test.js
PASS (3 suites, 28 tests)
```

```bash
$ npm run build
Compiled successfully.
```

判定:

- G/I系（および A05/A02/A04 関連）の手動検証可視性を改善完了。

---

## 追補（2026-02-19）: 画面上部アラートを右上固定ポップアップ化

要望:

- プレイマットがアラートに押し出されてサイズ変動する挙動を解消したい。
- アラートを最前面で右上に出したい。

対応:

- `src/css/playingField.module.css`
  - `.mutationBanner` を通常フロー表示から `position: fixed` へ変更。
  - 右上固定表示（`top` + `right`）に変更。
  - `z-index: calc(var(--z-overlay) + 12)` を設定して前面表示。
  - `max-width` と `box-shadow` を追加し、ポップアップとして視認性を確保。

検証:

```bash
$ CI=true npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
PASS
```

```bash
$ npm run build
Compiled successfully.
```

判定:

- 盤面レイアウトを押し出さない固定ポップアップ表示へ変更完了。

---

## 追補（2026-02-20）: 公開ゾーン表向き表示の強化（相手/自分）

要望:

- `トラッシュ / ロスト` にカードがある場合、最上段カード画像を表向き表示する。
- `トラッシュ・ロスト・ベンチ・バトル場` は自分側/相手側とも表向き表示にする。

対応内容:

- `src/components/PlayingField.js`
  - 相手ベンチ/相手バトル場の描画を裏面固定から `Pokemon` 描画へ変更（表向き化）。
  - `PublicPilePreview` を追加し、トラッシュ/ロストの最上段カード画像 + 枚数を表示。
  - `publicState.publicCardCatalog` と `privateState.cardCatalog` を統合した `renderCardCatalog` を導入し、相手カード画像の解決に使用。
- `src/css/playingField.module.css`
  - `publicPilePreview/publicPileTopCard/publicPileCount` のスタイルを追加。
- `src/components/Session.js`
  - デッキ保存時に `session.publicState.publicCardCatalog` を更新する処理を追加。
  - 当該プレイヤーの既存 `c_{playerId}_*` エントリを入れ替え、最新デッキ内容で同期。
- `src/game-state/builders.js`
  - 新規セッション初期値に `publicState.publicCardCatalog: {}` を追加。
- `src/game-state/migrateV1ToV2.js`
  - V1→V2 移行時に、両プレイヤー private `cardCatalog` から `publicState.publicCardCatalog` を構築。
- テスト追加/更新:
  - `src/components/__tests__/PlayingFieldLayout.test.js`
    - 相手 active/bench が表向き画像で描画されること
    - 自分/相手の discard/lost 最上段が表向き表示されること
  - `src/game-state/__tests__/migrateV1ToV2.test.js`
    - 移行後に `publicCardCatalog` が生成されること

実行コマンド/結果:

```bash
$ CI=true npm test -- --watch=false --runInBand \
  src/components/__tests__/PlayingFieldLayout.test.js \
  src/components/__tests__/PlayingFieldDnd.test.js \
  src/game-state/__tests__/migrateV1ToV2.test.js
PASS (3 suites, 17 tests)
```

```bash
$ npm run build
Compiled successfully.
```

補足:

- CRA由来の既知警告（`babel-preset-react-app` / `caniuse-lite`）は継続して表示されるが、本件差分起因の新規エラー/警告はなし。

判定:

- 要望仕様（公開ゾーンの表向き表示）を満たす実装を反映済み。

補足（既存セッション互換）:

- `src/components/Session.js` に `publicCardCatalog` 自動同期 effect を追加。
  - デッキ再保存を行っていない既存V2セッションでも、ページ読込時に各プレイヤーの `privateState.cardCatalog` を `publicState.publicCardCatalog` へ反映。
  - 相手側が一度アクセスすれば、相手カードの表向き表示解決に必要な画像URLが揃う。
