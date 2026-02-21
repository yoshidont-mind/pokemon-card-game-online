# OP-C02 実装ログ

## 1. 着手
- 日時: 2026-02-21 JST
- 対象: `references/documents/260220_1_notes_on_how_each_operation_should_be_implemented.md` の OP-C02
- 要件: バトル場/ベンチの occupied 同士を直接ドラッグ&ドロップした際、カード(群)を丸ごと入れ替える。

## 2. 事前調査
- `resolveDropIntent` は occupied への通常 drop を `TARGET_OCCUPIED` で拒否。
- `applyDropMutation` には stack swap 用アクション未実装。
- UI は単枚スタックのみ直接ドラッグ可能。複数枚スタックは展開モーダル経由のみ。

## 3. 実装方針
- DnD の新規 drag/action を導入し、occupied スロット同士の drop を `swap` として扱う。
- 既存の「上に重ねる / 下に重ねる」は維持しつつ、**直ドラッグ由来の swap 候補時のみ** occupied ゾーン本体を drop 対象化する。
- 単枚直ドラッグ（既存 `card`）と複数枚直ドラッグ（新規 `stack`）の両方で OP-C02 を成立させる。

## 4. 変更内容
- `src/interaction/dnd/constants.js`
  - `DRAG_TYPES.STACK` を追加。
  - `INTENT_ACTIONS.SWAP_STACKS`（`swap-stacks-between-zones`）を追加。
- `src/interaction/dnd/buildDragPayload.js`
  - `buildStackDragPayload()` を追加（`sourceStackKind/sourceBenchIndex/previewCardId` を保持）。
- `src/interaction/dnd/resolveDropIntent.js`
  - `createBoardSnapshot` に stack 枚数（`activeCardCount/benchCardCounts`）を追加。
  - occupied 同士の drop を swap として受理する分岐を追加。
    - `dragType=stack` で occupied 同士 → swap。
    - `dragType=card` かつ `sourceZone=player-stack` かつ source stack が1枚の直ドラッグ → swap。
    - source stack が複数枚の `card` drag は従来どおり `TARGET_OCCUPIED`。
- `src/interaction/dnd/applyDropMutation.js`
  - `swapStacksBetweenZones()` を追加。
  - `mutateDocsForDropIntent` に `SWAP_STACKS` を追加。
- `src/components/PlayingField.js`
  - stack直ドラッグ状態を判定するフラグを追加。
  - swap 候補時のみ occupied の active/bench を zone drop 有効化。
  - `card` 挿入ターゲット（上/下に重ねる）は swap 候補時に非表示化。
  - 複数枚 stack にも直ドラッグを追加（`buildStackDragPayload`）。
- `src/components/dnd/BoardDragOverlay.js`
  - `dragType=stack` のオーバーレイ表示を追加（top card画像優先）。
- `src/css/playingField.module.css`
  - 複数枚 stack 直ドラッグ用 `stackGroupDraggable` スタイルを追加。
- テスト更新
  - `src/interaction/dnd/__tests__/resolveDropIntent.test.js`
    - occupied swap 受理ケース（stack drag / 単枚直drag）を追加。
    - 複数枚 `card` drag では `TARGET_OCCUPIED` 維持を追加。
  - `src/interaction/dnd/__tests__/applyDropMutation.test.js`
    - active↔bench swap、bench↔bench swap を追加。

## 5. 検証
```bash
npm test -- --watch=false --runInBand src/interaction/dnd/__tests__/resolveDropIntent.test.js src/interaction/dnd/__tests__/applyDropMutation.test.js
```
- PASS（2 suites / 37 tests）

```bash
npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js src/components/dnd/__tests__/BoardDragOverlay.test.js
```
- PASS（2 suites / 31 tests）

```bash
npm run build
```
- PASS（Compiled successfully）

## 6. 追加回帰確認
```bash
npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldDnd.test.js src/interaction/dnd/__tests__/useBoardDnd.test.js
```
- PASS（2 suites / 7 tests）

## 7. ユーザー確認後の追加修正（スワップ不発 / オーバーレイ改善）
- 事象:
  - occupied スタック同士へドロップしても swap されない。
  - 複数枚 stack ドラッグ中、最上段1枚のみのオーバーレイ表示になる。
- 原因:
  - occupied 枠上では `dropType=stack` が優先され、`resolveDropIntent` が `dragType=stack/card` を受理せず `unsupported` 扱いになっていた。
  - stack drag payload が top card のみをプレビュー保持していた。
- 対応:
  - `src/interaction/dnd/resolveDropIntent.js`
    - `dropType=stack` でも、以下条件なら swap を受理する分岐を追加。
      - `dragType=stack`（source が `player-stack`）
      - `dragType=card` + `sourceZone=player-stack` + source stack枚数が1
    - swap アクション組み立てを `buildSwapStacksIntent()` に共通化。
  - `src/interaction/dnd/buildDragPayload.js`
    - `buildStackDragPayload()` に `previewCardIds` を追加。
  - `src/components/PlayingField.js`
    - ベンチ/バトル場の stack drag payload 作成時に `previewCardIds` を設定。
  - `src/components/dnd/BoardDragOverlay.js`
    - stack drag 時、`previewCardIds` から画像配列を組み立てて `Pokemon` コンポーネントで重なり表示。
  - `src/css/playingField.module.css`
    - stack オーバーレイ用 `dragOverlayStack` を追加。
  - テスト追加:
    - `src/interaction/dnd/__tests__/resolveDropIntent.test.js`
      - `dropType=stack` での swap 受理（stack drag / 単枚直ドラッグ）を追加。
    - `src/components/dnd/__tests__/BoardDragOverlay.test.js`
      - stack drag 時に重なり画像が2枚表示されることを追加。

## 8. 追加検証結果
```bash
npm test -- --watch=false --runInBand src/interaction/dnd/__tests__/resolveDropIntent.test.js src/interaction/dnd/__tests__/applyDropMutation.test.js
```
- PASS（2 suites / 39 tests）

```bash
npm test -- --watch=false --runInBand src/components/dnd/__tests__/BoardDragOverlay.test.js src/components/__tests__/PlayingFieldDnd.test.js src/interaction/dnd/__tests__/useBoardDnd.test.js
```
- PASS（3 suites / 10 tests）

```bash
npm run build
```
- PASS（Compiled successfully）
