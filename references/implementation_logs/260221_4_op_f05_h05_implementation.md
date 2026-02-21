# OP-F05 / OP-H05 実装ログ

- 日付: 2026-02-21
- 担当: Codex
- 対象要件:
  - `OP-F05`: バトル場/ベンチのダブルクリック起点で、ダメージ調整(+/-)と状態異常解除(DnDで小道具BOXへ戻す)を行える吹き出しUI
  - `OP-H05`: ダメージ値の負値対応（負ダメージ時は青バッヂ表示）

## 1. 実装方針
1. 既存DnDに「スタック由来の状態異常バッヂを小道具BOXにドロップして解除する」ルートを追加。
2. バトル場/ベンチのカードをダブルクリックで、吹き出しポップアップ（調整UI）を表示。
3. ポップアップ内の `+/-` ボタンでダメージを 10 単位で増減。
4. ダメージ値は負値を許可し、カード上バッヂを正は赤/負は青で表示。

## 2. 変更ファイル

### 2.1 DnD仕様拡張
- `src/interaction/dnd/constants.js`
  - `ZONE_KINDS.TOOLBOX` を追加
  - `INTENT_ACTIONS.REMOVE_STATUS_FROM_STACK` を追加

- `src/interaction/dnd/buildDragPayload.js`
  - `buildStackStatusBadgeDragPayload()` を追加
  - スタック由来ステータスバッヂの drag payload（source player / stack kind / bench index）を構築

- `src/interaction/dnd/resolveDropIntent.js`
  - `dragType=status-badge` + `zoneKind=toolbox` の intent 解決を追加
  - stack source かつ source stack が存在する場合に `REMOVE_STATUS_FROM_STACK` を accept
  - toolbox への他drag typeは reject

- `src/interaction/dnd/applyDropMutation.js`
  - `removeStatusFromStack()` を追加
  - `REMOVE_STATUS_FROM_STACK` action を処理
  - 対象 stack の `specialConditions` から該当状態を `false` に変更

### 2.2 UI実装（OP-F05）
- `src/components/PlayingField.js`
  - バトル場/ベンチカードの `onDoubleClick` で調整ポップアップを開く導線を追加
  - `StackAdjustPopover` コンポーネントを追加
    - ダメージ `+/-` ボタン
    - 現在付与されている状態異常バッヂ一覧（小道具BOXと同一見た目）
    - バッヂをドラッグして小道具BOXへドロップで解除
  - `ToolboxPanel` を DnD drop target として扱うための payload 連携を追加

- `src/components/ToolboxPanel.js`
  - `useDroppable` を追加し、小道具BOX自体を `zone-toolbox-panel` のドロップ受けに拡張
  - drop時のハイライトクラス適用を追加

- `src/css/playingField.module.css`
  - `stackAdjustPopover` 一式（吹き出しUI）を追加
  - toolbox drop時ハイライト（`toolboxRootDropActive`）を追加

### 2.3 負ダメージ表示（OP-H05）
- `src/components/Pokemon.js`
  - ダメージバッヂ表示条件を `damage !== 0` に変更
  - `damage < 0` のとき `bg-primary`（青）、それ以外は `bg-danger`（赤）

- `src/components/__tests__/PokemonDamageBadge.test.js`（新規）
  - 正ダメージ=赤、負ダメージ=青、0ダメージ=非表示をテスト

### 2.4 テスト更新
- `src/interaction/dnd/__tests__/resolveDropIntent.test.js`
  - stack status badge -> toolbox drop accepted を追加
  - 不正sourceからの toolbox drop reject を追加

- `src/interaction/dnd/__tests__/applyDropMutation.test.js`
  - `REMOVE_STATUS_FROM_STACK` で状態異常解除できることを追加

## 3. 実行コマンドと結果

### 3.1 DnD + PlayingField 回帰
```bash
npm test -- --watch=false --runInBand \
  src/interaction/dnd/__tests__/resolveDropIntent.test.js \
  src/interaction/dnd/__tests__/applyDropMutation.test.js \
  src/components/__tests__/PlayingFieldDnd.test.js \
  src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS
- Test Suites: 4 passed
- Tests: 91 passed

### 3.2 追加回帰
```bash
npm test -- --watch=false --runInBand \
  src/interaction/dnd/__tests__/useBoardDnd.test.js \
  src/components/dnd/__tests__/BoardDragOverlay.test.js
```
- 結果: PASS
- Test Suites: 2 passed
- Tests: 8 passed

### 3.3 OP-H05専用（負ダメージ表示）
```bash
npm test -- --watch=false --runInBand \
  src/components/__tests__/PokemonDamageBadge.test.js \
  src/interaction/dnd/__tests__/resolveDropIntent.test.js \
  src/interaction/dnd/__tests__/applyDropMutation.test.js
```
- 結果: PASS
- Test Suites: 3 passed
- Tests: 62 passed

## 4. 備考
- 既知警告（`ReactDOMTestUtils.act` deprecation / `babel-preset-react-app` warning）は既存で、本対応起因ではありません。
- OP-F05の「状態異常解除」は、対象カードを含む stack が存在する場合のみ有効です（欠落時は reject）。
