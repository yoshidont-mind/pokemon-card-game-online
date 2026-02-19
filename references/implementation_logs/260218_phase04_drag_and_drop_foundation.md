# 実装ログ: Phase 04 インタラクション基盤（Drag and Drop Foundation）

作成日: 2026-02-18（JST）
対象手順書: `references/implementation_plans/260218_phase04_drag_and_drop_foundation.md`

> ルール:
> - 秘匿情報は記録しない
> - ターミナル出力は本ファイル内に直接記録する
> - 失敗した試行/警告も省略しない

## 進捗サマリ

- [x] 事前準備（ブランチ作成・ベースライン）
- [x] Step 1: 現行UIの DnD 適用ポイントを棚卸し
- [x] Step 2: DnD 依存導入（CLI）
- [x] Step 3: DnD 型定義と純関数レイヤー実装
- [x] Step 4: `useBoardDnd` フック実装
- [x] Step 5: DnD UIコンポーネント作成
- [x] Step 6: `PlayingField` へ DnD 統合
- [x] Step 7: drop→mutation の最小実装（基盤）
- [x] Step 8: スタイル実装（赤ハイライト + overlay）
- [x] Step 9: 自動テスト追加
- [ ] Step 10: 手動検証（ユーザー確認待ち）
- [ ] Step 11: ドキュメント更新（手動検証後に実施）

---

## 1. 事前準備

### 実行コマンド/出力

```bash
$ git status --short && git branch --show-current
?? references/implementation_logs/260218_phase04_drag_and_drop_foundation.md
?? references/implementation_plans/260218_phase04_drag_and_drop_foundation.md
main

$ git checkout -b feature/260218-phase04-dnd-foundation
Switched to a new branch 'feature/260218-phase04-dnd-foundation'

$ CI=true npm test -- --watch=false
PASS src/game-state/__tests__/invariants.test.js
PASS src/game-state/__tests__/migrateV1ToV2.test.js
PASS src/App.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
Test Suites: 4 passed, 4 total
Tests:       11 passed, 11 total

$ npm run build
Compiled successfully.
```

補足:
- 既知 warning（失敗ではない）
  - React Testing Library / React18 の `act` deprecation warning
  - `browserslist` outdated warning
  - CRA 由来 `@babel/plugin-proposal-private-property-in-object` warning

判定: Pass

---

## 2. Step 1 実施（DnD 適用ポイント棚卸し）

### 実行コマンド/出力

```bash
$ rg -n "data-zone|data-drop-group|HandTray|ToolboxPanel|Pokemon" src/components
src/components/PlayingField.js:37:    <div className={styles.zoneTile} data-zone={zone} data-drop-group={dropGroup}>
src/components/PlayingField.js:48:    <div className={styles.benchRow} data-zone={`${owner}-bench`} data-drop-group="bench">
src/components/PlayingField.js:53:          data-zone={`${owner}-bench-${index + 1}`}
src/components/PlayingField.js:54:          data-drop-group="bench-slot"
...（省略）
```

### 棚卸し結果（要約）

- drag source 候補
  - 手札カード（`HandTray`）
  - 小道具（`ToolboxPanel` のダメカン/状態異常）
- drop target 候補
  - ゾーン（`player-active`, `player-bench-N`, `player-discard`, `player-lost`）
  - スタック（active / bench のカード）
- Phase 03 で `data-zone` / `data-drop-group` が付与済みのため、DnD 導入足場は十分

判定: Pass

---

## 3. Step 2 実施（DnD依存導入）

### 事前確認

```bash
$ npm ls @dnd-kit/core @dnd-kit/modifiers @dnd-kit/utilities
pokemon_card_game_online@0.1.0 ...
└── (empty)
```

### 実行コマンド/出力

```bash
$ npm install @dnd-kit/core @dnd-kit/modifiers @dnd-kit/utilities
npm warn EBADENGINE Unsupported engine ... current: { node: 'v18.20.7' ... }
...（Firebase系パッケージで同様warning多数）
added 4 packages, and audited 1770 packages in 12s
```

### フォローアップ（Nodeバージョン是正）

```bash
$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && node -v && npm -v
v20.19.6
10.8.2

$ npm ls @dnd-kit/core @dnd-kit/modifiers @dnd-kit/utilities
pokemon_card_game_online@0.1.0 ...
├─┬ @dnd-kit/core@6.3.1
├─┬ @dnd-kit/modifiers@9.0.0
└── @dnd-kit/utilities@3.2.2
```

判定: Pass（依存導入完了）

---

## 4. Step 3〜8 実施（実装）

### 追加した主な新規ファイル

- `src/interaction/dnd/constants.js`
- `src/interaction/dnd/types.js`
- `src/interaction/dnd/buildDragPayload.js`
- `src/interaction/dnd/resolveDropIntent.js`
- `src/interaction/dnd/applyDropMutation.js`
- `src/interaction/dnd/useBoardDnd.js`
- `src/components/dnd/DraggableCard.js`
- `src/components/dnd/DraggableToolItem.js`
- `src/components/dnd/DroppableZone.js`
- `src/components/dnd/DroppableStack.js`
- `src/components/dnd/BoardDragOverlay.js`

### 更新した主な既存ファイル

- `src/components/PlayingField.js`
- `src/components/HandTray.js`
- `src/components/ToolboxPanel.js`
- `src/css/playingField.module.css`
- `package.json`
- `package-lock.json`

### 実装内容（要点）

1. DnD payload / intent 判定の純関数化
- `resolveDropIntent` を導入し、UIから独立した accept/reject 判定を実装
- reject reason を定数化（`invalid-payload`, `target-occupied` など）

2. DnDフック（`useBoardDnd`）
- `onDragStart/Over/End/Cancel` を一元管理
- highlight state（zone/stack）をフック内で管理
- ドロップ確定時のみ `applyDropMutation` 呼び出し

3. 永続化（transaction経由）
- `applyDropMutation` -> `applySessionMutation` 連携
- 最小対応操作:
  - 手札カード: `hand -> active|bench|discard|lost`
  - ダメカン: stack の `damage` 加算
  - 状態異常: stack の `specialConditions` 更新

4. UI統合
- `PlayingField` を `DndContext` でラップ
- zone/stack へ `DroppableZone` / `DroppableStack` を導入
- `HandTray` カードを `DraggableCard` 化
- `ToolboxPanel` 小道具を `DraggableToolItem` 化
- DragOverlay 追加

5. 赤ハイライト実装
- `.dropZoneActive` / `.dropStackActive` を追加
- 有効ターゲット上のみ赤ハイライト表示

判定: Pass

---

## 5. Step 9 実施（自動テスト）

### 追加テスト

- `src/interaction/dnd/__tests__/resolveDropIntent.test.js`
- `src/interaction/dnd/__tests__/applyDropMutation.test.js`
- `src/components/__tests__/PlayingFieldDnd.test.js`

### 実行コマンド/出力

```bash
$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && CI=true npm test -- --watch=false
PASS src/game-state/__tests__/invariants.test.js
PASS src/game-state/__tests__/migrateV1ToV2.test.js
PASS src/App.test.js
PASS src/interaction/dnd/__tests__/resolveDropIntent.test.js
PASS src/interaction/dnd/__tests__/applyDropMutation.test.js
PASS src/components/__tests__/PlayingFieldDnd.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
Test Suites: 7 passed, 7 total
Tests:       20 passed, 20 total

$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && npm run build
Compiled successfully.
```

既知warning（失敗ではない）:
- `browserslist` outdated warning
- CRA 由来 `@babel/plugin-proposal-private-property-in-object` warning
- React Testing Library / React18 の `act` warning

判定: Pass

---

## 6. 現在の変更差分（Step 10 前）

### 実行コマンド/出力

```bash
$ git status --short
 M package-lock.json
 M package.json
 M src/components/HandTray.js
 M src/components/PlayingField.js
 M src/components/ToolboxPanel.js
 M src/css/playingField.module.css
?? references/implementation_logs/260218_phase04_drag_and_drop_foundation.md
?? references/implementation_plans/260218_phase04_drag_and_drop_foundation.md
?? src/components/__tests__/PlayingFieldDnd.test.js
?? src/components/dnd/
?? src/interaction/

$ git diff --stat
 package-lock.json               |  56 +++++++++++++++++
 package.json                    |   3 +
 src/components/HandTray.js      |  88 +++++++++++++++++++-------
 src/components/PlayingField.js  | 416 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-------------------------------
 src/components/ToolboxPanel.js  |  48 ++++++++++-----
 src/css/playingField.module.css |  64 ++++++++++++++++++-
 6 files changed, 533 insertions(+), 142 deletions(-)
```

---

## 7. Step 10（手動検証）

状態: Pending（ユーザー実機確認待ち）

依頼予定の確認項目:
1. 手札カードを `active/bench/discard/lost` へドラッグし、ゾーンが赤ハイライトされる
2. ダメカンを任意の場のカードへドラッグし、対象カードが赤ハイライトされる
3. 状態異常バッヂを任意の場のカードへドラッグし、対象カードが赤ハイライトされる
4. 盤面外ドロップで状態が変化しない
5. リロード後に確定操作結果が再現される

---

## 8. Step 11（ドキュメント更新）

状態: Pending（Step 10 完了後に実施）

予定:
- `README.md` へ DnD 操作仕様を追記
- 本ログへ手動検証結果を追記


---

## 9. 追加意思決定（ユーザー選択）

Decision A: DnD の collision strategy
- ユーザー選択: `1. closestCenter`
- 反映内容:
  - `src/components/PlayingField.js` の `DndContext` に `collisionDetection={closestCenter}` を設定

### 実行コマンド/出力

```bash
$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && CI=true npm test -- --watch=false
PASS ...
Test Suites: 7 passed, 7 total
Tests:       20 passed, 20 total

$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && npm run build
Compiled successfully.
```

判定: Pass


---

## 10. UIフィードバック対応（Q1/Q2/Q3 選択反映）

ユーザー回答（2026-02-19）:
- Q1: A（手札拡大をインライン化）
- Q2: A（手札パネル被覆領域はドロップ不可）
- Q3: A（ドラッグ中はOverlayのみ強調）

### 反映内容

1. Q1:A 手札プレビュー方式の変更（別枠廃止）
- `src/components/HandTray.js`
  - 別枠プレビュー表示を削除
  - ホバー/クリック時に対象カード自体を強調表示する方式へ統一
- `src/css/playingField.module.css`
  - 手札パネル内レイアウトを簡素化
  - `handCardButton` / `handCardButtonActive` の重なり順を調整

2. Q2:A 誤ドロップ防止ガード
- 追加: `src/interaction/dnd/dropGuards.js`
  - ドロップ座標の抽出 (`getClientPointFromDragEndEvent`)
  - セレクタ領域内判定 (`isDropBlockedBySelectors`)
- 更新: `src/interaction/dnd/useBoardDnd.js`
  - `onDragEnd` で `#hand-tray-panel` と `[data-zone="player-hand-tray"]` を判定
  - 手札被覆領域でドロップされた場合は mutation を行わずキャンセル
  - キャンセルメッセージを表示

3. Q3:A ドラッグ中表示の一本化
- `src/components/dnd/DraggableCard.js`
- `src/components/dnd/DraggableToolItem.js`
  - source要素の transform追従を削除
- `src/css/playingField.module.css`
  - `.draggingSource { opacity: 0; }` を適用
  - `BoardDragOverlay` の見た目を主表示として統一

4. 関連テスト
- 追加: `src/interaction/dnd/__tests__/dropGuards.test.js`
- 更新: `src/components/__tests__/PlayingFieldLayout.test.js`
  - 別枠プレビュー非依存の期待値へ変更

### 実行コマンド/出力

```bash
$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && CI=true npm test -- --watch=false
PASS src/interaction/dnd/__tests__/dropGuards.test.js
PASS src/game-state/__tests__/migrateV1ToV2.test.js
PASS src/game-state/__tests__/invariants.test.js
PASS src/interaction/dnd/__tests__/resolveDropIntent.test.js
PASS src/interaction/dnd/__tests__/applyDropMutation.test.js
PASS src/App.test.js
PASS src/components/__tests__/PlayingFieldDnd.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
Test Suites: 8 passed, 8 total
Tests:       22 passed, 22 total

$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && npm run build
Creating an optimized production build...
Compiled successfully.
```

既知warning（失敗ではない）:
- React18 + Testing Library の `act` deprecation warning
- `No routes matched location "/"`（`App.test.js` の既存警告）
- Browserslist `caniuse-lite` outdated warning

判定: Pass

### 備考
- Phase 04 の完了判定は未実施（ユーザー再確認待ち）。


---

## 11. ユーザー再フィードバック反映（2026-02-19）

受領内容（抜粋）:
- OK: 点線プレビュー領域の削除
- NG: 手札カードの拡大が弱く、手札エリア外は見切れる
- NG: 手札トレイと被っている盤面がドラッグ中に赤ハイライトされる
- OK: ドラッグ中二重表示の解消
- NG: 小道具BOXの要素間隔が詰まっていない

### 実施した修正

1. 手札の拡大表示を視認しやすく調整（NG対応）
- `src/components/HandTray.js`
  - `handCardsScroller` を新設（横スクロール用）
  - `handCards` をトラック化し、カード列の上側余白を拡大確保
- `src/css/playingField.module.css`
  - 手札トレイ幅を拡大: `min(92vw, 880px)`
  - 手札パネル高さ上限を拡大: `min(34vh, 260px)`
  - ホバー/ピン時拡大を強化: `scale(1.55)`
  - 影を強化し、最前面判別を明確化

2. 手札トレイ被覆時のハイライト抑止（NG対応）
- `src/interaction/dnd/dropGuards.js`
  - `getTranslatedRectFromDragEvent`
  - `doesRectIntersectElement`
  - `isDragBlockedBySelectors`
  を追加
- `src/interaction/dnd/useBoardDnd.js`
  - `onDragOver` で「ドラッグ中カード矩形が手札トレイに重なる場合」は `resetHighlights()` して終了
  - `onDragEnd` でも同判定で mutation をキャンセル

3. 小道具BOXの密度を調整（NG対応）
- `src/css/playingField.module.css`
  - パネル幅を縮小: `300px -> 280px`
  - `toolboxGrid` を `3列 -> 4列`
  - gap を縮小: `4px -> 2px`
  - ボタン余白/高さ/フォントを縮小 (`min-height: 32px`)

4. 追加テスト
- `src/interaction/dnd/__tests__/dropGuards.test.js`
  - `doesRectIntersectElement` の判定テスト
  - `isDragBlockedBySelectors` の translated rect ベース判定テスト

### 実行コマンド/出力

```bash
$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && CI=true npm test -- --watch=false
PASS src/game-state/__tests__/migrateV1ToV2.test.js
PASS src/game-state/__tests__/invariants.test.js
PASS src/interaction/dnd/__tests__/applyDropMutation.test.js
PASS src/interaction/dnd/__tests__/resolveDropIntent.test.js
PASS src/App.test.js
PASS src/interaction/dnd/__tests__/dropGuards.test.js
PASS src/components/__tests__/PlayingFieldDnd.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
Test Suites: 8 passed, 8 total
Tests:       24 passed, 24 total

$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && npm run build
Creating an optimized production build...
Compiled successfully.
```

既知warning（失敗ではない）:
- React18 + Testing Library の `act` deprecation warning
- `App.test.js` 実行時の `No routes matched location "/"`
- CRA/babel preset の private-property-in-object warning
- Browserslist `caniuse-lite` outdated warning

判定: Pass

### 現在ステータス
- Phase 04 は引き続き未完了（ユーザー再確認待ち）


---

## 12. ユーザー再フィードバック反映（第2ラウンド / 2026-02-19）

受領内容（抜粋）:
- 手札拡大はまだ小さく、文字判読が困難
- 手札トレイが再び大きくなりすぎている
- 手札トレイ被覆時にハイライト抑止は概ねOKだが、
  - ブロック時メッセージは不要
  - 手札外へ出た直後の最初の対象で赤枠が出ないことがある
- 小道具BOXは gap ではなく要素サイズが縮んだため意図と違う

### 実施した修正

1. 手札トレイを「最小可変サイズ」に再調整
- `src/css/playingField.module.css`
  - `handTrayRoot` を `width: fit-content; max-width: 92vw` に変更
  - `handTrayPanel` を `width: fit-content; max-width: min(92vw, 760px)` に変更
  - 横スクロールは維持しつつ、固定で広すぎる幅を廃止

2. 手札拡大を「トレイ外・最前面プレビュー」に変更
- `src/components/HandTray.js`
  - ホバー/ピン対象カードの中心座標を算出
  - 手札トレイ外（上方向）に `handHoverPreview` を表示
- `src/css/playingField.module.css`
  - `handHoverPreview` / `handHoverPreviewImage` を追加
  - プレビューサイズを `clamp(250px, 30vw, 420px)` へ拡大
  - 既存カード本体は軽い持ち上げ演出（`scale(1.08)`）のみに抑制

3. 手札被覆判定を pointer 基準へ変更（初回ハイライト欠落対策）
- `src/interaction/dnd/useBoardDnd.js`
  - drag開始時の pointer 座標を `dragStartPointRef` へ保存
  - `onDragOver` / `onDragEnd` の被覆判定へ drag開始座標を渡す
  - ブロック時メッセージを削除（`onMutationMessage('')`）
- `src/interaction/dnd/dropGuards.js`
  - `event.delta + dragStartPoint` から現在pointer座標を算出
  - `isDragBlockedBySelectors` は pointer 座標による判定へ統一

4. 小道具BOXは「サイズを戻して gap だけ縮小」
- `src/css/playingField.module.css`
  - パネル幅を `300px` に戻す
  - `toolboxGrid` を `3列` に戻す
  - `toolboxItem` の `padding` / `min-height` / フォントを元サイズへ戻す
  - gap は `2px` のまま維持

5. テスト更新
- `src/interaction/dnd/__tests__/dropGuards.test.js`
  - `getClientPointFromDragEvent` の delta計算テスト追加
  - `isDragBlockedBySelectors` の pointer判定テストへ更新

### 実行コマンド/出力

```bash
$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && CI=true npm test -- --watch=false
PASS src/interaction/dnd/__tests__/applyDropMutation.test.js
PASS src/game-state/__tests__/migrateV1ToV2.test.js
PASS src/game-state/__tests__/invariants.test.js
PASS src/interaction/dnd/__tests__/resolveDropIntent.test.js
PASS src/App.test.js
PASS src/interaction/dnd/__tests__/dropGuards.test.js
PASS src/components/__tests__/PlayingFieldDnd.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
Test Suites: 8 passed, 8 total
Tests:       25 passed, 25 total

$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && npm run build
Creating an optimized production build...
Compiled successfully.
```

既知warning（失敗ではない）:
- React18 + Testing Library の `act` deprecation warning
- `App.test.js` 実行時の `No routes matched location "/"`
- CRA/babel preset の private-property-in-object warning
- Browserslist `caniuse-lite` outdated warning

判定: Pass

### 現在ステータス
- Phase 04 は未完了（引き続きユーザー再確認待ち）


---

## 13. ユーザーフィードバック反映（第3ラウンド / 2026-02-19）

受領内容（抜粋）:
- 手札トレイと被覆時の初回ハイライト欠落が継続
- 小道具BOXの gap が詰まったように見えない

### 原因分析

1. 初回ハイライト欠落の主因
- 被覆ブロック判定に `#hand-tray-panel` に加えて `player-hand-tray` ルート要素を含めていた時点の名残で、
  手札パネルを出た直後でも「まだトレイ上」と判定されるケースが残りやすかった。
- 特にトレイ上部（トグルボタン付近）や境界近傍では、ユーザー視点で手札外でもブロックに入りやすい。

2. 小道具 gap 見え方の主因
- `grid` 3列レイアウトのセル幅が固定で、実際のボタン幅よりセルが広く見える。
- そのため `gap` 値を詰めても、体感の空白があまり減らない。

### 実施した修正

1. 被覆ブロック範囲の見直し
- `src/interaction/dnd/useBoardDnd.js`
  - ブロック対象セレクタを `#hand-tray-panel` のみに限定
  - （トレイ全体ではなく、実際の手札パネル上のみをブロック）

2. 小道具BOXレイアウトの見直し
- `src/css/playingField.module.css`
  - `.toolboxGrid` を `grid` から `flex + wrap` に変更
  - `.toolboxDraggable` を `width:auto; flex:0 0 auto;` へ変更
  - ボタンサイズは維持しつつ、要素間の体感余白を最小化

### 実行コマンド/出力

```bash
$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && CI=true npm test -- --watch=false
PASS src/game-state/__tests__/invariants.test.js
PASS src/game-state/__tests__/migrateV1ToV2.test.js
PASS src/interaction/dnd/__tests__/resolveDropIntent.test.js
PASS src/interaction/dnd/__tests__/dropGuards.test.js
PASS src/interaction/dnd/__tests__/applyDropMutation.test.js
PASS src/App.test.js
PASS src/components/__tests__/PlayingFieldDnd.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
Test Suites: 8 passed, 8 total
Tests:       25 passed, 25 total

$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && npm run build
Creating an optimized production build...
Compiled successfully.
```

既知warning（失敗ではない）:
- React18 + Testing Library の `act` deprecation warning
- `App.test.js` 実行時の `No routes matched location "/"`
- CRA/babel preset の private-property-in-object warning
- Browserslist `caniuse-lite` outdated warning

判定: Pass

### 現在ステータス
- Phase 04 は未完了（引き続きユーザー再確認待ち）


---

## 14. ユーザーフィードバック反映（第4ラウンド / 2026-02-19）

受領内容:
- 初回対象で赤枠が出ない問題が継続
- 小道具BOXは少し間隔が欲しい（ゼロは不自然）

### 原因と対応

1. 初回対象の赤枠欠落
- 原因: `onDragOver` 依存だと、同一 droppable 上を移動していてもイベントが発火しない区間があり、
  手札パネル外へ出た直後の再評価が遅れる。
- 対応:
  - `src/interaction/dnd/useBoardDnd.js`
    - `handleDragMove` を追加し、移動中も毎回ハイライト判定
  - `src/components/PlayingField.js`
    - `DndContext` に `onDragMove={handleDragMove}` を追加

2. 小道具BOX間隔
- 対応:
  - `src/css/playingField.module.css`
    - `.toolboxGrid` の `gap` を `6px` に変更

3. テスト整合
- `src/components/__tests__/PlayingFieldDnd.test.js`
  - `useBoardDnd` mock に `handleDragMove` を追加

### 実行コマンド/出力

```bash
$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && CI=true npm test -- --watch=false
PASS src/game-state/__tests__/invariants.test.js
PASS src/interaction/dnd/__tests__/dropGuards.test.js
PASS src/game-state/__tests__/migrateV1ToV2.test.js
PASS src/interaction/dnd/__tests__/resolveDropIntent.test.js
PASS src/interaction/dnd/__tests__/applyDropMutation.test.js
PASS src/App.test.js
PASS src/components/__tests__/PlayingFieldDnd.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
Test Suites: 8 passed, 8 total
Tests:       25 passed, 25 total

$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && npm run build
Creating an optimized production build...
Compiled successfully.
```

既知warning（失敗ではない）:
- React18 + Testing Library の `act` deprecation warning
- `App.test.js` 実行時の `No routes matched location "/"`
- CRA/babel preset の private-property-in-object warning
- Browserslist `caniuse-lite` outdated warning

判定: Pass

### 現在ステータス
- Phase 04 は未完了（引き続きユーザー再確認待ち）


---

## 15. ユーザー最終確認（2026-02-19）

ユーザー確認結果:
- 手札外に出た直後の最初の対象で赤枠が出るか: OK
- 小道具BOXの間隔が適切か: OK

判定:
- Phase 04 の本件UI修正（追加フィードバック対応分）は受け入れ完了。
- ただし、フェーズ全体完了宣言・コミット/PRは未実施（次指示待ち）。


---

## 16. 追加不具合対応（手札と重なるベンチへのドロップ失敗 / 2026-02-19）

現象:
- 手札エリアと少し重なるベンチ枠へ、手札からカードをドロップすると
  `操作の確定に失敗しました。再試行してください。` が表示される場合がある。

原因分析:
- 空のベンチ配列 `[]` に対して、先頭以外のスロット（例: index=3）へ直接代入すると
  JavaScript の疎配列（hole/undefined）になり得る。
- Firestore 書き込み時に配列内 `undefined` を含むと `invalid-argument` 相当で失敗し、
  既存エラーハンドリングでは generic failure として表示される。

修正:
- `src/interaction/dnd/applyDropMutation.js`
  - `BENCH_SLOT_COUNT` を利用し、ベンチ配列を常に `null` 埋めの固定長へ正規化する
    `normalizeBenchSlots()` を追加
  - ベンチ配置時はこの正規化済み配列へ書き込み
  - `benchIndex` の上限チェック（`< BENCH_SLOT_COUNT`）を追加

回帰テスト:
- `src/interaction/dnd/__tests__/applyDropMutation.test.js`
  - 「空ベンチの後方スロット（index=3）へ配置しても疎配列にならない」ケースを追加

### 実行コマンド/出力

```bash
$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && CI=true npm test -- --watch=false
PASS ...
Test Suites: 8 passed, 8 total
Tests:       26 passed, 26 total

$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && npm run build
Creating an optimized production build...
Compiled successfully.
```

判定: Pass

