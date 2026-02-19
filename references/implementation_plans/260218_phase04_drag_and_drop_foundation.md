# Phase 04 実装手順書: インタラクション基盤（Drag and Drop Foundation）

作成日: 2026-02-18（JST）
対象リポジトリ: `pokemon-card-game-online`
対象フェーズ: `references/documents/260218_4_full_implementation_roadmap.md` の Phase 04
ステータス: Draft（実装前）

---

## 1. 背景/目的

Phase 03 で盤面配置（紙寄せ）は成立したが、カード移動・ダメカン付与・状態異常バッヂ付与はまだ「操作基盤」が未実装。
本フェーズ（Phase 04）の目的は、以降の Wave1/Wave2 操作実装の前提となる **共通 DnD 基盤**を先に完成させること。

このフェーズで達成すること:

- カード/ダメカン/状態異常バッヂをドラッグ可能にする
- ドロップ可能なゾーン・カードに重なった際に赤ハイライトを表示する
- ドロップ確定時のみ状態更新する（ドラッグ中は永続状態を更新しない）
- Firestore 更新は既存の `applySessionMutation`（transaction + revision）を経由する

ロードマップにおける Exit Criteria（Phase 04）:

- [ ] ゾーン移動時のハイライト挙動が仕様通り
- [ ] カード付与時のハイライト挙動が仕様通り
- [ ] DnD 失敗時に状態が破壊されない

---

## 2. 公式一次情報（2026-02-18 確認）

実装時は以下の一次情報に従う。再実装時は日付付きで再確認すること。

1. `@dnd-kit` 公式ドキュメント
- https://docs.dndkit.com/
- DndContext / Sensors / collision detection / modifiers / DragOverlay

2. `@dnd-kit` パッケージ最新確認（npmレジストリ）
- `@dnd-kit/core` latest: `6.3.1`
- `@dnd-kit/sortable` latest: `10.0.0`
- `@dnd-kit/modifiers` latest: `9.0.0`
- React peer dependency: `react >=16.8.0`

3. React 公式
- State as a Snapshot: https://react.dev/learn/state-as-a-snapshot
- Queueing a Series of State Updates: https://react.dev/learn/queueing-a-series-of-state-updates

4. Firebase 公式
- Firestore transactions: https://firebase.google.com/docs/firestore/manage-data/transactions
- Web SDK references (`runTransaction`): https://firebase.google.com/docs/reference/js/firestore

5. MDN
- Pointer events: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- Drag and Drop API（比較用、今回は `@dnd-kit` 優先）:
  https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API

補足:
- 本フェーズは Firebase Console の GUI 操作を必須としない（コード変更 + ローカル検証中心）。
- 認可/競合制御は Phase 02 で導入済みの `applySessionMutation` を再利用し、独自の直書き `updateDoc` を増やさない。

---

## 3. スコープ

### 3.1 In Scope

- DnD ランタイム基盤（Context / sensors / overlay / collision）
- ドラッグ対象の型定義（`card`, `damage-counter`, `status-badge`）
- ドロップ対象の型定義（`zone`, `stack`）
- 赤ハイライト制御（ゾーン/カード）
- ドロップ解決ロジック（有効/無効判定）
- ドロップ確定時の mutation 呼び出し（transaction 経由）
- 最小限の自動テスト（純関数 + コンポーネント）

### 3.2 Out of Scope

- 81操作の個別実装完了（Phase 05/06 で実施）
- 自動ルール判定（ターン強制、ダメージ計算自動化など）
- モバイル操作最適化の完成（PC優先）
- 盤面見た目の大幅再設計（Phase 03 完了済みを維持）

---

## 4. 実装方針（固定）

### 4.1 DnD ライブラリ方針

- 採用: `@dnd-kit/core`（必要に応じて `@dnd-kit/modifiers`, `@dnd-kit/utilities`）
- 非採用: HTML5 native DnD 直実装

理由:
- React との整合が高く、ドラッグ状態・ハイライト状態の同期が容易
- Touch/Pointer/Keyboard 拡張に備えやすい
- 判定ロジックを純関数化しやすい

### 4.2 状態更新方針

- ドラッグ中: React ローカル state のみ更新（ハイライト等）
- ドロップ確定時: `applySessionMutation` を 1 回呼ぶ
- 無効ドロップ/キャンセル時: 永続状態を変更しない

### 4.3 UIハイライト方針

- ドロップ可能候補に重なった対象のみ `isDropTarget=true`
- ハイライト色は `--accent-danger` 系（赤）で統一
- ゾーンハイライトとカードハイライトを別クラスで明示

### 4.4 型/識別子方針

- drag payload は共通 envelope を使用
- 例:
  - `dragType`: `card | damage-counter | status-badge`
  - `sourceZone`: `player-hand | player-bench-1 | toolbox` など
  - `entityId`: `cardId` または `tool:<kind>:<value>`

- drop payload は共通 envelope
  - `dropType`: `zone | stack`
  - `targetZone`: `player-active` 等
  - `targetStackId`: `s_player1_active` 等（カード対象時）

---

## 5. 変更対象ファイル一覧（予定）

## 5.1 新規作成（予定）

- `src/interaction/dnd/constants.js`
- `src/interaction/dnd/types.js`
- `src/interaction/dnd/buildDragPayload.js`
- `src/interaction/dnd/resolveDropIntent.js`
- `src/interaction/dnd/useBoardDnd.js`
- `src/interaction/dnd/applyDropMutation.js`
- `src/interaction/dnd/__tests__/resolveDropIntent.test.js`
- `src/components/dnd/DraggableCard.js`
- `src/components/dnd/DraggableToolItem.js`
- `src/components/dnd/DroppableZone.js`
- `src/components/dnd/DroppableStack.js`
- `src/components/dnd/BoardDragOverlay.js`
- `src/components/__tests__/PlayingFieldDnd.test.js`

## 5.2 既存更新（予定）

- `src/components/PlayingField.js`
- `src/components/HandTray.js`
- `src/components/ToolboxPanel.js`
- `src/css/playingField.module.css`
- `src/components/Session.js`（mutation 呼び出し受け渡しが必要な場合）
- `README.md`（Phase 04 完了後に DnD 仕様追記）

## 5.3 参照のみ

- `references/documents/260218_2_card_effect_operation_matrix.md`
- `references/documents/260218_3_db_session_requirements_spec.md`
- `references/implementation_plans/260218_phase03_board_ui_relayout.md`

---

## 6. 事前準備

## 6.1 環境確認

```bash
command -v git rg node npm
node -v
npm -v
```

確認基準:
- Node.js は `.nvmrc` 準拠（20系）
- `npm ci` 済み

## 6.2 作業ブランチ作成

```bash
git checkout -b feature/260218-phase04-dnd-foundation
```

## 6.3 ベースライン検証

```bash
CI=true npm test -- --watch=false
npm run build
```

## 6.4 依存導入前確認

```bash
npm ls @dnd-kit/core @dnd-kit/modifiers @dnd-kit/utilities
```

---

## 7. Step by Step 実装手順

## Step 1. 現行UIの DnD 適用ポイントを棚卸し

### 目的

DnD を差し込む DOM ノード（drag source / drop target）を確定し、後戻りを防ぐ。

### 実施内容

1. `PlayingField` の `data-zone` / `data-drop-group` を一覧化
2. `HandTray` / `ToolboxPanel` の draggable 候補を整理
3. drop 対象を「ゾーン」「カード（stack）」に分離

### 実行コマンド

```bash
rg -n "data-zone|data-drop-group|HandTray|ToolboxPanel|Pokemon" src/components
```

### 期待結果

- DnD 対象マトリクス（source→target）が作成される

---

## Step 2. DnD 依存導入（CLI）

### 目的

`@dnd-kit` ベースの実装基盤を追加する。

### 実施内容

```bash
npm install @dnd-kit/core @dnd-kit/modifiers @dnd-kit/utilities
```

補足:
- `@dnd-kit/sortable` は本フェーズで必須ではない（並べ替え要件が未定義のため）。
- 依存追加後は lockfile 変更を必ず commit 対象に含める。

### 検証

```bash
npm ls @dnd-kit/core @dnd-kit/modifiers @dnd-kit/utilities
```

---

## Step 3. DnD 型定義と純関数レイヤーを先に実装

### 目的

UI と判定ロジックを分離し、テストしやすい構造にする。

### 実施内容

1. `src/interaction/dnd/constants.js`
- drag type / drop type / highlight type / reject reason を定数化

2. `src/interaction/dnd/buildDragPayload.js`
- UIイベントから共通 payload を生成

3. `src/interaction/dnd/resolveDropIntent.js`
- 入力: `dragPayload`, `dropPayload`, `boardSnapshot`
- 出力:
  - `{ accepted: true, action: ..., highlightTarget: ... }`
  - `{ accepted: false, reason: ... }`

4. `src/interaction/dnd/applyDropMutation.js`
- `resolveDropIntent` の結果を `applySessionMutation` へ変換
- ドロップ無効時は mutation を呼ばない

### 実行コマンド

```bash
rg -n "resolveDropIntent|buildDragPayload|applyDropMutation|accepted|reason" src/interaction/dnd
```

### 期待結果

- UI 非依存で drop 判定をテスト可能になる

---

## Step 4. `useBoardDnd` フック実装

### 目的

DnD イベント管理（start/over/end/cancel）を 1 箇所に集約する。

### 実施内容

1. `useBoardDnd.js` を作成し、以下 state を管理
- `activeDragPayload`
- `activeDropPayload`
- `highlightedZoneId`
- `highlightedStackId`

2. `@dnd-kit/core` の `DndContext` でイベントを受ける
- `onDragStart`
- `onDragOver`
- `onDragEnd`
- `onDragCancel`

3. `onDragEnd` でのみ `applyDropMutation` を呼ぶ
- 中断・無効ドロップ時は no-op

4. pending 状態を保持して多重ドロップを防止

### 実行コマンド

```bash
rg -n "onDragStart|onDragOver|onDragEnd|onDragCancel|DndContext|useSensor|useSensors" src
```

### 期待結果

- DnD の制御フローが PlayingField 本体から分離される

---

## Step 5. DnD UIコンポーネント作成

### 目的

Draggable/Droppable の責務を分割し、再利用可能にする。

### 実施内容

1. `DraggableCard.js`
- cardId を持つカードをドラッグ可能に
- `aria-label` で対象を識別可能に

2. `DraggableToolItem.js`
- ダメカン/状態異常バッヂをドラッグ可能に
- `data-tool-type`, `data-tool-value` を payload に埋め込む

3. `DroppableZone.js`
- `zoneId` と `acceptTypes` を props で受ける
- `isOver` 時に赤ハイライトクラスを付与

4. `DroppableStack.js`
- 特定カード（stack）対象へのドロップ受け口
- `isOver` 時にカード枠を赤ハイライト

5. `BoardDragOverlay.js`
- ドラッグ中の視覚フィードバック（半透明カード/チップ）

### 実行コマンド

```bash
rg -n "DraggableCard|DraggableToolItem|DroppableZone|DroppableStack|BoardDragOverlay" src/components
```

### 期待結果

- 盤面全体を大改修せずに DnD を段階導入できる

---

## Step 6. `PlayingField` へ DnD 統合

### 目的

Phase 03 のレイアウトを壊さず DnD を適用する。

### 実施内容

1. `PlayingField` 上位を `DndContext` でラップ
2. 主要ゾーン（deck/discard/lost/prize/active/bench/stadium）を `DroppableZone` 化
3. 場のカード表示部分を `DroppableStack` 化
4. 手札カードを `DraggableCard` で包む
5. 小道具BOXアイテムを `DraggableToolItem` で包む
6. ハイライトクラスを `playingField.module.css` に追加

### 実行コマンド

```bash
rg -n "DndContext|DroppableZone|DroppableStack|DraggableCard|DraggableToolItem|dropHighlight" src/components src/css
```

### 期待結果

- 赤ハイライトが仕様通り表示される

---

## Step 7. drop→mutation の最小実装（基盤）

### 目的

「DnD が見た目だけ」にならないよう、最小限の永続更新経路を実装する。

### 実施内容

1. 最初に対象を限定（段階導入）
- `card`: `hand -> active|bench|discard|lost`
- `damage-counter`: `toolbox -> stack`
- `status-badge`: `toolbox -> stack`

2. `applyDropMutation` で `applySessionMutation` を呼ぶ
- 成功時: revision 増加
- 失敗時: エラー表示 + UIリセット

3. mutation 内で invariants を守る
- 同一 cardId の多重所属を防止
- 不正 target は reject

4. 失敗時のユーザー通知を `Session` に統一

### 実行コマンド

```bash
rg -n "applySessionMutation|revision|error|conflict|invariant" src/components src/interaction src/game-state
```

### 期待結果

- ドロップ確定時のみ Firestore 更新される
- 無効ドロップでは永続状態が変化しない

---

## Step 8. スタイル実装（赤ハイライト + overlay）

### 目的

要件「重なった対象が赤くなる」を明確に満たす。

### 実施内容

1. `playingField.module.css` に以下を追加
- `.dropZoneActive`
- `.dropStackActive`
- `.draggingSource`
- `.dragOverlayCard`

2. アクセシビリティ
- `prefers-reduced-motion` で過剰アニメーション停止
- `:focus-visible` を維持

3. z-index 調整
- 手札・小道具・ドラッグオーバーレイの重なり順を明示

### 実行コマンド

```bash
rg -n "dropZoneActive|dropStackActive|dragOverlay|prefers-reduced-motion|focus-visible" src/css
```

### 期待結果

- 盤面視認性を維持しつつ、ターゲットが明確になる

---

## Step 9. 自動テスト追加（純関数 + UI）

### 目的

DnD 基盤の退行を早期検出する。

### 実施内容

1. `resolveDropIntent` の unit test
- 有効/無効判定
- target 種別ごとの分岐
- reject reason の妥当性

2. `PlayingFieldDnd.test.js`
- ドラッグ中 `isOver` で対象が赤ハイライトされる
- 無効ドロップ時に mutation が呼ばれない
- 有効ドロップ時に mutation が1回だけ呼ばれる

3. 既存テスト回帰

### 実行コマンド

```bash
CI=true npm test -- --watch=false
npm run build
```

### 期待結果

- テスト成功
- ビルド成功

---

## Step 10. 手動検証（必須）

### 目的

実操作で UX と永続化挙動を確認する。

### 実施内容

1. 起動
```bash
node proxy-server.js
npm start
```

2. シナリオA: カード移動
- 手札カードを `player-active` へドラッグ
- ターゲットが赤くなる
- ドロップで配置される

3. シナリオB: ベンチ移動
- 手札カードを `player-bench-1` へドラッグ
- ドロップで配置される

4. シナリオC: ダメカン付与
- `10/50/100` を任意カードにドラッグ
- カードが赤ハイライト
- ドロップでダメージ値更新

5. シナリオD: 状態異常付与
- `どく` バッヂを任意カードにドラッグ
- ドロップで状態が反映

6. シナリオE: 無効ドロップ
- 盤面外にドロップ
- 永続状態が変化しない

7. シナリオF: 競合耐性（任意）
- 2ブラウザ同時操作で衝突時メッセージが出る

### 判定基準

- ハイライトが誤爆しない
- ドロップ確定時以外に状態が変わらない
- セッション再読込後も同状態が再現される

---

## Step 11. ドキュメント更新

### 実施内容

1. `README.md` に DnD 操作仕様を追記
2. `references/implementation_logs/260218_phase04_drag_and_drop_foundation.md` に実行ログを記録
3. 必要に応じてロードマップ進捗注記を更新

### 実行コマンド

```bash
git status --short
```

---

## 8. 実装時の意思決定ポイント（必ず停止して確認）

## Decision A: DnD の collision strategy

選択肢1. `closestCenter`（推奨）
- メリット: 実装が単純で誤判定が少ない
- デメリット: 大きいゾーンと小さいカードが混在すると意図とズレる場合がある

選択肢2. `pointerWithin`
- メリット: ポインタ位置ベースで直感に近い
- デメリット: センサー差異・スクロール時挙動の調整が必要

推奨: 選択肢1で開始し、必要なら局所的に `pointerWithin` へ変更。

## Decision B: mutation 適用粒度

選択肢1. 1ドロップ=1transaction（推奨）
- メリット: 競合時の再試行が容易
- デメリット: 高頻度操作で transaction 回数が増える

選択肢2. 短時間バッファリングしてまとめて更新
- メリット: 書き込み回数を減らせる
- デメリット: 「確定状態のみ保存」の原則と整合しづらい

推奨: 選択肢1。

## Decision C: DragOverlay の情報量

選択肢1. 最小表示（カード/チップのみ）（推奨）
- メリット: 実装が安定し描画負荷が低い
- デメリット: 情報量は少ない

選択肢2. 詳細表示（名称/値/補足文を含む）
- メリット: 視認性が高い
- デメリット: UIノイズと実装コストが増える

推奨: 選択肢1。

---

## 9. テスト手順（詳細）

## 9.1 自動テスト

```bash
CI=true npm test -- --watch=false
npm run build
```

合格条件:
- テスト失敗 0
- ビルド失敗 0

## 9.2 追加検証（任意だが推奨）

```bash
npm run test:rules
```

目的:
- DnD 統合によるルール逸脱（privateState 不正参照等）の副作用がないことを確認

## 9.3 手動テスト

- 1366px / 1920px の2解像度
- 2ブラウザ同時接続
- 正常/異常ドロップ双方を確認

---

## 10. ロールバック方針

1. DnD導入で重大不具合が出た場合
- `PlayingField` から DndContext を外し、Phase 03 UIへ戻す

2. mutation 系不具合の場合
- `applyDropMutation` を no-op に切替（UIだけ維持）
- 永続更新を無効化してリリースを継続可能にする

3. 依存起因の問題
- `@dnd-kit` 導入コミットを revert
- 既存操作（クリックUI）に退避

---

## 11. Exit Criteria（完了判定）

- [ ] カード/ダメカン/状態異常バッヂをドラッグ可能
- [ ] ゾーン重なり時に対象ゾーンが赤ハイライト
- [ ] カード重なり時に対象カードが赤ハイライト
- [ ] ドロップ確定時のみ状態更新（途中更新なし）
- [ ] 無効ドロップ/キャンセル時に状態破壊なし
- [ ] `CI=true npm test -- --watch=false` と `npm run build` が通る
- [ ] 実装ログが `references/implementation_logs/260218_phase04_drag_and_drop_foundation.md` に記録される

---

## 12. 参考コマンド集

```bash
# ブランチ作成
git checkout -b feature/260218-phase04-dnd-foundation

# 依存追加
npm install @dnd-kit/core @dnd-kit/modifiers @dnd-kit/utilities

# 実装中確認
rg -n "DndContext|Draggable|Droppable|resolveDropIntent|applyDropMutation" src

# 最終確認
CI=true npm test -- --watch=false
npm run build
git status --short
```
