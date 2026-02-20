# Phase 05 実装手順書: 操作実装 Wave1（主要）

作成日: 2026-02-19（JST）  
対象リポジトリ: `pokemon-card-game-online`  
対象フェーズ: `references/documents/260218_4_full_implementation_roadmap.md` の Phase 05  
ステータス: In Progress（実装・検証進行中）

---

## 1. 背景/目的

Phase 04 で DnD の基礎（ハイライト、ドロップ判定、確定時 mutation）が揃ったため、Phase 05 では「実際に対戦で多用する操作」をまとめて実装し、友人同士で 1 ゲームを通せる最低限の操作網羅を達成する。

本フェーズの目的:

- `references/documents/260218_2_card_effect_operation_matrix.md` の Wave1 対象 OP を画面上で再現可能にする
- ルール自動判定なし（手動運用前提）でも、操作そのものは漏れなく実行できる状態にする
- すべての確定操作を transaction + `revision` 管理で保存し、再読み込み/別端末再開で復元できる状態を維持する

ロードマップ Exit Criteria（Phase 05）:

- [ ] `260218_2` の優先実装群（セクション6）を全て再現可能
- [ ] 2人対戦で1ゲーム通しの基本進行が破綻しない
- [ ] 競合時の再試行導線が操作フローに統合される

---

## 2. 公式一次情報（2026-02-19 確認）

実装時は以下の一次情報を再確認すること（UI 仕様や API の更新に追随するため）。

1. Firebase Firestore Transactions  
   https://firebase.google.com/docs/firestore/manage-data/transactions
2. Firestore Security Rules: Structuring rules  
   https://firebase.google.com/docs/firestore/security/rules-structure
3. Firestore Security Rules: Conditions  
   https://firebase.google.com/docs/firestore/security/rules-conditions
4. React docs（Hooks / state updates）  
   https://react.dev/reference/react/hooks
5. `@dnd-kit` DndContext  
   https://docs.dndkit.com/api-documentation/context-provider
6. `@dnd-kit` Sortable Context（必要時）  
   https://docs.dndkit.com/presets/sortable/sortable-context
7. MDN Pointer Events  
   https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
8. MDN Dialog element（モーダル採用時）  
   https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog

npm レジストリ最新（2026-02-19 確認値）:

- `firebase`: `12.9.0`
- `@dnd-kit/core`: `6.3.1`
- `@dnd-kit/modifiers`: `9.0.0`
- `@dnd-kit/utilities`: `3.2.2`

補足:

- Phase 05 は Firebase Console の GUI 設定変更を前提としない（コード変更 + ローカル検証中心）。
- Firestore Rules の変更は原則不要（必要が出た場合は Phase 02 の方針に従い別PRで実施）。

---

## 3. スコープ

### 3.1 In Scope（Phase 05 で実装）

- Wave1 対象 OP（47項目）を、手動操作ベースで再現できる UI/状態更新 API を実装
- `applySessionMutation` を通した確定操作の永続化
- 競合時エラー導線の操作UI統合
- OP単位のユニットテスト・統合テスト・手動検証手順の整備
- カバレッジ台帳更新（`master_operation_coverage_tracker`）

### 3.2 Out of Scope（Phase 06 以降）

- Wave2 対象 OP（低頻度・高度制御）
- カード文言の自動解釈/自動裁定
- 厳密なターン強制/ルール違反ブロック
- E2E 基盤の新規導入（既存のユニット/手動中心）

---

## 4. Wave1 対象 OP 一覧（実装必須）

本フェーズで完了させる OP ID（ロードマップ定義と一致）:

- A系: `OP-A01`, `OP-A02`, `OP-A03`, `OP-A04`, `OP-A05`, `OP-A06`
- B系: `OP-B01`, `OP-B02`, `OP-B03`, `OP-B04`, `OP-B05`, `OP-B07`, `OP-B09`, `OP-B10`, `OP-B11`, `OP-B12`
- C系: `OP-C02`, `OP-C03`, `OP-C04`, `OP-C05`
- D系: `OP-D01`, `OP-D02`, `OP-D03`, `OP-D04`, `OP-D05`, `OP-D06`, `OP-D07`, `OP-D08`
- E系: `OP-E01`, `OP-E02`, `OP-E04`, `OP-E05`, `OP-E06`, `OP-E07`
- F系: `OP-F01`, `OP-F02`, `OP-F03`, `OP-F04`, `OP-F05`, `OP-F06`, `OP-F07`, `OP-F08`
- G系: `OP-G02`, `OP-G03`, `OP-G04`
- I系: `OP-I01`, `OP-I03`

---

## 5. 実装方針（固定）

### 5.1 大原則

- 「自動判定しない」方針を守る。
- ただし「操作を選択・適用・保存する仕組み」は OP 単位で明示的に提供する。
- 曖昧な自由操作ではなく、操作名が UI 上に見える状態にする（何を実行したか追跡しやすくするため）。

### 5.2 操作アーキテクチャ

- `Operation Intent`（UI入力）→ `Operation Resolver`（検証）→ `Mutation`（Firestore transaction）へ統一する。
- DnD は「直感的移動」を担い、ボタン/ダイアログ操作は「DnD で表しにくい操作」を担う。
- すべての確定処理は `applySessionMutation` 1回で完結させる。

### 5.3 データ整合性

- 1カード多重所属を禁止（既存 invariant を維持/拡張）。
- `deckCount` / `handCount` を mutation 内で常に再計算。
- `updatedAt` / `updatedBy` / `revision` は既存 transactionRunner に一任し、個別実装で上書きしない。

### 5.4 UI方針

- 直感GUIを第一優先とする（DnD / 盤面クリック / ゾーン固定ボタン / モーダル）。
- **cardId 手入力をプレイヤー操作の前提にしない。**
- `OperationPanel` は「直感GUIで表現できない操作の補助」「開発・検証補助」に限定する。
- 危険操作（大量移動/ランダム破棄/サイド操作）は確認ダイアログを出す。
- 相手承認が必要な操作は、中央モーダルで承認/拒否まで他操作をロックする。
- 操作失敗時は既存 mutationBanner を使い、原因を日本語で明示。

### 5.5 テスト方針

- 先に純関数（resolver/mutation helper）を固め、UI テストは最小限に絞る。
- OPごとに最低1ケースの再現テストを持つ（Wave1 対象全件）。
- 競合/権限エラー時の UI メッセージ回帰を追加する。

---

## 6. 変更対象ファイル一覧（予定）

### 6.1 新規作成（予定）

- `src/operations/wave1/operationIds.js`
- `src/operations/wave1/operationCatalog.js`
- `src/operations/wave1/buildOperationIntent.js`
- `src/operations/wave1/resolveOperationIntent.js`
- `src/operations/wave1/applyOperationMutation.js`
- `src/operations/wave1/helpers/cardMovement.js`
- `src/operations/wave1/helpers/zoneAccessors.js`
- `src/operations/wave1/helpers/stackEditing.js`
- `src/operations/wave1/__tests__/resolveOperationIntent.test.js`
- `src/operations/wave1/__tests__/applyOperationMutation.test.js`
- `src/components/operation/OperationPanel.js`
- `src/components/operation/OperationDialogs.js`
- `src/components/__tests__/OperationPanel.test.js`

### 6.2 既存更新（予定）

- `src/components/PlayingField.js`
- `src/components/HandTray.js`
- `src/components/Pokemon.js`
- `src/interaction/dnd/constants.js`
- `src/interaction/dnd/resolveDropIntent.js`
- `src/interaction/dnd/applyDropMutation.js`
- `src/interaction/dnd/useBoardDnd.js`
- `src/css/playingField.module.css`
- `src/game-state/invariants.js`
- `src/game-state/__tests__/invariants.test.js`
- `references/implementation_plans/260218_master_operation_coverage_tracker.md`
- `README.md`

### 6.3 参照のみ

- `references/documents/260218_2_card_effect_operation_matrix.md`
- `references/documents/260218_3_db_session_requirements_spec.md`
- `references/documents/260218_4_full_implementation_roadmap.md`

---

## 7. 事前準備

### 7.1 環境確認

```bash
command -v git rg node npm
node -v
npm -v
```

確認基準:

- Node.js は `.nvmrc` 準拠（20系）
- 依存が解決済み（`npm ci` 完了）

### 7.2 作業ブランチ作成

```bash
git checkout -b feature/260219-phase05-operations-wave1
```

### 7.3 ベースライン検証

```bash
CI=true npm test -- --watch=false
npm run build
```

### 7.4 現行機能の操作確認（回帰基準）

確認する項目:

- 手札→ベンチ/アクティブ/トラッシュ/ロストの DnD
- ダメカン/状態異常の付与
- 手札トレイ位置移動・開閉・復元
- 小道具BOX開閉・復元

---

## 8. Step by Step 実装手順

## Step 1. OP カバレッジを実装タスクへ分解する

### 目的

47 OP を「UI機能単位」に再編し、実装順序と検証順序を固定する。

### 作業

1. `operationCatalog` に Wave1 対象 OP を全登録
2. 各 OP に以下メタを付与
- `group`（A〜I）
- `uiEntry`（DnD / Panel / Dialog）
- `mutationKind`
- `verificationCaseId`
3. `master_operation_coverage_tracker` の Wave1 行を `In Progress` に更新（着手時のみ）

### 検証

- OP の欠番/重複がない（47件一致）

---

## Step 2. 操作 Intent 基盤を追加する

### 目的

DnD 以外の操作（コイン、ランダム、順序、サイド操作等）を同一プロトコルで扱う。

### 作業

1. `buildOperationIntent` を追加
2. `resolveOperationIntent` を追加
- 入力妥当性
- actor 権限
- zone/stack 参照存在
- 操作固有パラメータ（枚数、対象、ランダム対象）
3. 失敗理由コードを定義
- `invalid-intent`
- `permission-denied`
- `target-not-found`
- `constraint-violation`

### 検証

```bash
CI=true npm test -- --watch=false --runInBand src/operations/wave1/__tests__/resolveOperationIntent.test.js
```

---

## Step 3. 汎用カード移動ヘルパーを実装する

### 目的

Wave1 の大半を占める「ゾーン間移動」を1つの安全な実装へ寄せる。

### 作業

1. `zoneAccessors` を実装
- private zones: `deck`, `hand`
- public zones: `active`, `bench[n]`, `discard`, `lostZone`, `prize`, `stadium`
2. `cardMovement` を実装
- from source で cardId を除去
- to target へ cardRef/stack 追加
- 面向き/公開状態の更新
3. `stackEditing` を実装
- 進化/退化の重なり操作
- 付与カードの移動

### 検証

- 1カード多重所属が起きない
- 移動後に `handCount` / `deckCount` が一致

---

## Step 4. DnD 対応範囲を Wave1 要件まで拡張する

### 目的

Phase 04 の DnD を「手札→4ゾーン」から「主要ゾーン全体」へ広げる。

### 作業

1. `ZONE_KINDS` / `INTENT_ACTIONS` を拡張
2. `resolveDropIntent` で以下を追加
- デッキ上/下への戻し
- サイドへの移動
- スタジアム配置
- どうぐ/エネルギー付与（stack への card 付与）
3. `applyDropMutation` で新 intent を処理
4. 既存 DnD 挙動を壊さない回帰テストを追加

### 検証

```bash
CI=true npm test -- --watch=false --runInBand src/interaction/dnd/__tests__/resolveDropIntent.test.js src/interaction/dnd/__tests__/applyDropMutation.test.js
```

---

## Step 5. 直感GUI操作の骨格を実装する（OperationPanel は補助）

### 目的

紙プレイ感に寄せた操作導線を優先し、操作パネル依存を最小化する。

### 作業

1. 盤面上で直接操作できる UI を先に配置
- 山札/サイド: クリックメニュー（引く, 見る, シャッフル）
- カード/stack: クリックメニュー（移動, 進化, 回復, 状態解除）
- 小道具: クリック/ドラッグで付与・除去
2. DnD を主導線として拡張（場移動・付与・回収）
3. 承認必須操作は中央モーダルで request 承認/拒否導線を提供
4. `OperationPanel` は「直感GUI未対応項目」のみ実行可能に縮退

### 検証

- 主要操作が cardId 入力なしで実行できる
- モーダル承認中は他操作がロックされる
- `OperationPanel` を閉じたままでも基本プレイが進行できる

---

## Step 6. A系（判定・選択・公開）を実装する

対象: `OP-A01`〜`OP-A06`

### 作業

- `OP-A01` コイン判定
  - 盤面上コインオブジェクトをクリックで実行
  - 画像アセットは `public/coin-front.png`（表）/ `public/coin-back.png`（裏）を使用
  - トス演出後、表/裏の見た目を両端末で同期表示
- `OP-A02` 対象選択
  - 単数/複数選択 UI
- `OP-A03` 公開
  - 指定カードを両者公開状態へ
- `OP-A04` 閲覧
  - 自分の非公開ゾーン閲覧 UI
- `OP-A05` ランダム選択
  - 指定ゾーンからランダム抽出（seed不要）
- `OP-A06` 順序選択
  - 複数カードの並べ替え後に確定

### 検証

- 各 OP 1 ケース以上のユニットテスト
- 画面上で結果が即時反映され、リロード後も一致

---

## Step 7. B系（山札・手札）を実装する

対象: `OP-B01`, `B02`, `B03`, `B04`, `B05`, `B07`, `B09`, `B10`, `B11`, `B12`

### 作業

- `B01` 山札シャッフル
- `B02` 山札サーチ（条件判定は人間、選択UIはシステム）
- `B03` ドロー（n枚）
- `B04` 山札上破棄
- `B05` 山札上/下置き
- `B07` 山札上並べ替え
- `B09` 手札トラッシュ
- `B10` 手札山札戻し
- `B11` 相手手札破壊（**相手承認フロー方式**）
  - 実行プレイヤーは `publicState.operationRequests` に `pending` request を作成
  - 対象プレイヤーのみが `approve/reject` でき、`approve` 時のみ対象 hand を更新
- `B12` 相手手札確認（**相手承認フロー方式**）
  - 実行プレイヤーは request を作成し、対象プレイヤー承認時に `revealedCardIds` を結果へ記録
  - 相手 privateState は対象プレイヤー自身の transaction でのみ参照/更新する

### 検証

- deck/hand/discard の枚数整合
- private/public 境界を壊さない（相手 privateState の直接参照なし）
- 非対象プレイヤーが request resolve できない
- 解決済み request の再承認/再拒否は拒否される
- OperationPanel 上で request の解決結果（公開/破棄内容）が確認できる

---

## Step 8. C系（場の配置・入れ替え）を実装する

対象: `OP-C02`, `C03`, `C04`, `C05`

### 作業

- `C02` 自分/相手のバトル場入替
- `C03` ベンチ展開
- `C04` 相手呼び出し
- `C05` バトル場配置

### 検証

- active は常に 0 or 1 stack
- bench index の範囲外操作を拒否

---

## Step 9. D系（ゾーン移動）を実装する

対象: `OP-D01`〜`D08`

### 作業

- `D01` サイド操作（取得/設置/公開）
- `D02` トラッシュ移動
- `D03` 進化/退化
- `D04` トラッシュ回収
- `D05` 山札戻し
- `D06` ロスト送り
- `D07` 手札戻し
- `D08` 自己離脱

### 検証

- サイド枚数の増減が正しい
- 進化重なり順が保持される

---

## Step 10. E系（エネルギー/どうぐ/スタジアム）を実装する

対象: `OP-E01`, `E02`, `E04`, `E05`, `E06`, `E07`

### 作業

- `E01` エネルギー破棄
- `E02` エネルギー付与
- `E04` どうぐ/スタジアム破棄
- `E05` エネルギー移動
- `E06` どうぐ装備
- `E07` スタジアム設置/置換

### 検証

- stack 付随カードの移動が欠損しない
- stadium は単一領域で置換される

---

## Step 11. F系（ダメージ・状態異常）を実装する

対象: `OP-F01`〜`F08`

### 作業

- `F01` ダメージ適用
- `F02` 特殊状態付与
- `F03` きぜつ処理
- `F04` ダメカン配置
- `F05` 回復
- `F06` 反動
- `F07` 特殊状態解除/耐性（耐性は marker として保存）
- `F08` ダメカン移動

### 検証

- ダメージ値の加減算が再読み込み後も一致
- 特殊状態フラグが対象 stack のみ更新される

---

## Step 12. G/I系（制約・ターン）を実装する

対象: `OP-G02`, `G03`, `G04`, `OP-I01`, `I03`

### 作業

- `G02` サポート/グッズ基本制約（手動カウント補助）
- `G03` ワザロック
- `G04` 使用禁止一般
- `I01` 回数制限管理（turn local counter + marker）
- `I03` ターン終了/延長（turnContext 更新）

### 検証

- 制約は「判定強制」ではなく「状態記録」として保持される
- turnContext が2端末で一致

---

## Step 13. 競合・失敗ハンドリングを統合する

### 目的

操作パネル経由でも Phase 02 の競合導線を統一する。

### 作業

1. `REVISION_CONFLICT` メッセージを操作パネル経由処理にも適用
2. 無効 intent 時のメッセージ統一
3. mutation 中の二重送信防止（ボタン disable）

### 検証

- 2ブラウザ同時操作で片側に再試行導線が出る

---

## Step 14. 台帳/README更新

### 作業

1. `master_operation_coverage_tracker` を更新
- Wave1 対象 OP を `Done/Pass` へ反映
- 証跡に Phase 05 実装ログを記載
2. README に Wave1 新操作を追記
- 操作パネル使用方法
- 制約（自動裁定しない）を明記

### 検証

- 台帳と実装内容の齟齬がない

---

## Step 15. 最終テスト実行

```bash
CI=true npm test -- --watch=false
npm run build
```

追加（必要時）:

```bash
npm run test:rules
```

合格基準:

- 既存テスト + 追加テストが全通過
- ビルド成功
- 手動シナリオ（2端末）で基本1ゲーム進行が可能

---

## 9. 検証プロセス（必須）

### 9.1 自動テスト

- `resolveOperationIntent`：不正入力・権限・対象欠損
- `applyOperationMutation`：OP別の状態遷移
- DnD回帰：既存 `resolveDropIntent` / `applyDropMutation`
- UI：`OperationPanel` の有効/無効・エラーメッセージ

### 9.2 手動テスト（2端末）

実施条件:

- 同一 sessionId
- `player1` と `player2` で同時接続

詳細シナリオ:

- `references/implementation_plans/260219_phase05_manual_validation_scenarios.md`
- 実施ログ: `references/implementation_logs/260219_phase05_manual_validation_scenarios_log.md`

検証観点:

1. Wave1 全 OP を最低1回再現
2. 操作後にリロードして状態一致
3. 競合時の再試行導線確認
4. 相手 private 情報が露出しない
5. 検証項目は「プレイ画面上で確認可能な結果」に限定する（内部フィールド参照を完了条件にしない）

### 9.3 証跡記録

- 実施コマンド、失敗ログ、修正内容を `references/implementation_logs/260218_phase05_operations_wave1.md` に記録
- 失敗ケースを省略しない

---

## 10. ロールバック方針

- 操作基盤導入で不具合が出た場合は、次の単位で戻せるように commit を分割する。
- ロールバック単位:
  1. 操作パネル UI のみ
  2. mutation helper レイヤー
  3. DnD 拡張
- Firestore スキーマ破壊は行わないため、データ移行ロールバックは不要。

---

## 11. Exit Criteria チェックリスト（Phase 05 完了判定）

- [x] Wave1 対象 OP 47件が実装済み
- [ ] Wave1 対象 OP 47件が手動検証で再現成功
- [x] 既存 DnD 操作の退行がない
- [x] 競合時に UI が再試行導線を提示する
- [ ] 2人対戦で1ゲーム通しの基本進行が成立する
- [x] `master_operation_coverage_tracker` が更新されている
- [x] README の操作説明が最新化されている
- [x] 完了判定用の手動シナリオ手順書/ログ雛形が整備されている

---

## 12. 実装時の禁止事項（再掲）

- `main` 直push禁止（必ず branch → PR → merge）
- transaction を経由しない状態更新の追加禁止
- 相手 `privateState` 参照・更新ロジックの追加禁止
- 秘密情報のログ貼り付け禁止
