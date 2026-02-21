# OP-D01 / OP-D04 / OP-F03 実装ログ

## 1. 着手
- 日時: 2026-02-21 JST
- 対象:
  - `OP-D01`: 山札からサイドへ直接ドラッグ&ドロップ
  - `OP-D04`: トラッシュ/ロストをクリック展開し、モーダルからドラッグ移動
  - `OP-F03`: バトル場/ベンチのカード(群)を直接トラッシュ/ロストへ移動

## 2. 要件整理
- `references/documents/260220_1_notes_on_how_each_operation_should_be_implemented.md` の記載を確認。
- 実装要点:
  - D01: 山札束(`pile-card`)のドロップ先に `prize` を追加。
  - D04: トラッシュ/ロストを「展開モーダル」で top-first 表示。自分側はモーダル内カードをドラッグ可能、相手側は閲覧のみ。
  - F03: ベンチ/バトル場の複数枚スタックを直接ドラッグしてトラッシュ/ロストへ移動した際、スタック全体を移動。

## 3. 実装内容

### 3.1 DnD Intent / Mutation
- `src/interaction/dnd/constants.js`
  - `INTENT_ACTIONS.MOVE_STACK_FROM_STACK_TO_ZONE` を追加。

- `src/interaction/dnd/resolveDropIntent.js`
  - `dragType=stack` + `dropType=zone` の対象を拡張:
    - 既存: `active` / `bench`（swap）
    - 追加: `discard` / `lost`（スタック丸ごと移動）
  - 新規ヘルパー `buildMoveStackToZoneIntent` を追加。
  - `dragType=pile-card` の `player-deck` について、ドロップ先 `prize` を許可。

- `src/interaction/dnd/applyDropMutation.js`
  - 新規 `moveStackFromStackToZone()` を追加。
    - source stack(Active/Bench) を解体せずカードID列をまとめて取り出し。
    - target `discard` or `lost` に順序を保持して追加。
    - source 側は Active なら `null`、Bench なら該当スロットを `null` 化。
  - `moveTopCardFromSourceToZone()` に `targetZoneKind=prize` を追加。
  - `mutateDocsForDropIntent()` に `MOVE_STACK_FROM_STACK_TO_ZONE` 分岐を追加。

### 3.2 UI（D04）
- `src/components/PlayingField.js`
  - 新規ヘルパー:
    - `toZoneCards()`（トラッシュ/ロストの top-first 表示）
    - `formatZoneModalTitle()`
  - `StackCardsModal` を拡張:
    - `dragSourceZone` を追加（`player-stack` 以外の zone ソースにも対応）
    - `modalAriaLabel` / `modalDataZone` を追加（モーダル種別ごとに識別）
  - 新規状態 `pileModalState` を追加。
  - 新規ハンドラ `handleOpen/Close/TogglePileCards` を追加。
  - トラッシュ/ロスト（自分/相手）に展開用クリックボタンを追加。
    - 自分側: モーダル内カードをドラッグ可
    - 相手側: モーダル内カードは閲覧のみ
  - `zone-cards-root` のモーダル描画を追加。

- `src/css/playingField.module.css`
  - `zonePreviewButton` を追加（トラッシュ/ロスト展開クリック用）。

### 3.3 テスト追加・更新
- `src/interaction/dnd/__tests__/resolveDropIntent.test.js`
  - deck pile -> prize 受理テストを追加。
  - stack drag -> discard/lost 受理テストを追加。

- `src/interaction/dnd/__tests__/applyDropMutation.test.js`
  - deck top -> prize 反映テストを追加。
  - active stack 全体 -> discard 反映テストを追加。
  - bench stack 全体 -> lost 反映テストを追加。

- `src/components/__tests__/PlayingFieldLayout.test.js`
  - トラッシュ/ロスト展開モーダルの表示と top-first 並び順テストを追加。

## 4. 実行コマンドと結果

### 4.1 DnDロジック
```bash
npm test -- --watch=false --runInBand src/interaction/dnd/__tests__/resolveDropIntent.test.js src/interaction/dnd/__tests__/applyDropMutation.test.js
```
- 結果: PASS
- Test Suites: 2 passed
- Tests: 45 passed

### 4.2 UI/回帰
```bash
npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js src/components/__tests__/PlayingFieldDnd.test.js src/interaction/dnd/__tests__/useBoardDnd.test.js src/components/dnd/__tests__/BoardDragOverlay.test.js
```
- 結果: PASS
- Test Suites: 4 passed
- Tests: 40 passed
- 備考: `ReactDOMTestUtils.act` deprecation warning のみ出力（既知）

### 4.3 Build
```bash
npm run build
```
- 結果: PASS (`Compiled successfully`)
- 備考: `caniuse-lite outdated` / `babel-preset-react-app` warning のみ出力（既知）

## 5. 変更ファイル
- `src/components/PlayingField.js`
- `src/components/__tests__/PlayingFieldLayout.test.js`
- `src/css/playingField.module.css`
- `src/interaction/dnd/constants.js`
- `src/interaction/dnd/resolveDropIntent.js`
- `src/interaction/dnd/applyDropMutation.js`
- `src/interaction/dnd/__tests__/resolveDropIntent.test.js`
- `src/interaction/dnd/__tests__/applyDropMutation.test.js`

## 6. 補足
- D04 モーダルは既存の stack 展開モーダルを拡張して再利用し、ホバー拡大・ドラッグ移動・カードドラッグの一貫性を維持。
- F03 の「複数枚スタックをまとめて移動」は `dragType=stack` を明示的にハンドリングすることで実現。

## 7. 追加修正（OP-D04: 展開モーダルから他エリア移動不可の不具合対応）
- 事象:
  - トラッシュ/ロスト展開モーダルは表示されるが、モーダル内カードを他エリアへドラッグ&ドロップしても移動できない。
- 原因:
  - 展開モーダル内カードの drag payload は `sourceZone=player-discard` / `player-lost` になるが、
    - `resolveDropIntent.isSupportedCardSourceZone()` が未対応
    - `applyDropMutation.takeCardRefFromSource()` が未対応
  - このため `UNSUPPORTED_SOURCE` / `Unsupported source zone` で操作が成立しなかった。
- 対応:
  - `src/interaction/dnd/resolveDropIntent.js`
    - `player-discard` / `player-lost` を有効なソースとして追加。
    - 同一ゾーンへのドロップ（discard->discard, lost->lost）は `UNSUPPORTED_TARGET` として拒否。
  - `src/interaction/dnd/applyDropMutation.js`
    - `takeCardRefFromSource()` に `player-discard` / `player-lost` からの取り出し処理を追加。
- 追加テスト:
  - `resolveDropIntent`:
    - discard -> hand が accepted
    - discard -> discard が reject
  - `applyDropMutation`:
    - discard -> hand
    - lost -> reveal

## 8. 追加検証
```bash
npm test -- --watch=false --runInBand src/interaction/dnd/__tests__/resolveDropIntent.test.js src/interaction/dnd/__tests__/applyDropMutation.test.js
```
- PASS（2 suites / 49 tests）

```bash
npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js src/components/__tests__/PlayingFieldDnd.test.js src/interaction/dnd/__tests__/useBoardDnd.test.js src/components/dnd/__tests__/BoardDragOverlay.test.js
```
- PASS（4 suites / 40 tests）

```bash
npm run build
```
- PASS（Compiled successfully）
