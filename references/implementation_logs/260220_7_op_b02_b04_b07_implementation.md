# OP-B02 / OP-B04 / OP-B07 実装ログ

作成日: 2026-02-20
対象: `references/documents/260220_1_notes_on_how_each_operation_should_be_implemented.md`

## 0. 目的
- OP-B02: 山札閲覧枚数モーダルに「全て」選択を追加し、最大枚数をワンクリック指定できるようにする
- OP-B04: 山札（束）からトラッシュへの直接ドラッグ&ドロップを可能にする
- OP-B07: 山札モーダル起点でも山札上/下戻し（OP-A06相当）が成立することを保証する

## 1. 実装方針
- 既存のOP-A04/A06実装を活かし、不足しているUIとDnD意図解決のみ差分実装する
- OP-B07は既存挙動（`sourceZone: player-deck` + `zoneKind: deck` + `edge`）をテストで明示し担保する

## 2. 進捗メモ
- 2026-02-20: 仕様確認、既存コード調査（PlayingField / resolveDropIntent / applyDropMutation / tests）
- 2026-02-20: 実装開始（B02 UI, B04 DnD, B07担保テスト）

## 3. 実行コマンド
```bash
npm test -- --runInBand --runTestsByPath src/interaction/dnd/__tests__/resolveDropIntent.test.js
```
- 結果: PASS（14 tests passed）

```bash
npm test -- --runInBand --runTestsByPath src/interaction/dnd/__tests__/applyDropMutation.test.js
```
- 結果: PASS（11 tests passed）

```bash
npm test -- --runInBand --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS（28 tests passed）
- 補足: `ReactDOMTestUtils.act` deprecation warning は既存依存由来

```bash
npm run build
```
- 結果: Compiled successfully.
- 補足: `caniuse-lite` / `babel-preset-react-app` の既存 warning のみ

## 4. 結果

### 4.1 OP-B02（山札閲覧モーダルの「全て」選択）
- 変更ファイル:
  - `src/components/PlayingField.js`
  - `src/css/playingField.module.css`
  - `src/components/__tests__/PlayingFieldLayout.test.js`
- 実装内容:
  - 山札閲覧枚数設定モーダルに「全て（n枚）」チェックボックスを追加
  - チェックON時は閲覧枚数を山札最大枚数に固定
  - チェックON時は `+/-` ボタンを disabled
  - チェックOFFで `+/-` 操作へ復帰
- テスト担保:
  - `opens deck peek count config modal from deck quick action` で
    - チェックON時の最大枚数表示
    - `+/-` disabled
    - チェックOFFで `-` 再有効化
    を確認

### 4.2 OP-B04（山札 → トラッシュの直接DnD）
- 変更ファイル:
  - `src/interaction/dnd/resolveDropIntent.js`
  - `src/interaction/dnd/applyDropMutation.js`
  - `src/interaction/dnd/__tests__/resolveDropIntent.test.js`
  - `src/interaction/dnd/__tests__/applyDropMutation.test.js`
- 実装内容:
  - `pile-card` ソース（`player-deck`）から `discard` ゾーンへのドロップを許可
  - ドロップ時に山札先頭1枚を取り出してトラッシュへ移動
  - deckCount を減算、deckPeekState 連動時は count を減算
  - `player-prize` の `discard` 直ドロップは引き続き拒否（意図しない拡張防止）
- テスト担保:
  - intent解決の許可/拒否ケース追加
  - mutation適用で deck→discard の枚数変化を確認

### 4.3 OP-B07（山札モーダル起点の上/下戻し）
- 変更ファイル:
  - `src/interaction/dnd/__tests__/resolveDropIntent.test.js`
  - `src/interaction/dnd/__tests__/applyDropMutation.test.js`
- 実装内容:
  - 実装自体は既存の OP-A06 基盤で成立していたため、挙動保証をテストで補強
  - `sourceZone: player-deck` から `zoneKind: deck` `edge: top/bottom` が受理されることを確認
  - deck内カードを上/下へ戻して deck枚数が維持されることを確認

## 5. 変更ファイル一覧
- `src/components/PlayingField.js`
- `src/components/__tests__/PlayingFieldLayout.test.js`
- `src/css/playingField.module.css`
- `src/interaction/dnd/resolveDropIntent.js`
- `src/interaction/dnd/applyDropMutation.js`
- `src/interaction/dnd/__tests__/resolveDropIntent.test.js`
- `src/interaction/dnd/__tests__/applyDropMutation.test.js`

## 6. 追加修正（OP-B07期待差分への対応）

### 6.1 問題
- 山札閲覧モーダル内カードが「山札に残ったまま（参照のみ）」だったため、
  - 山札枚数が閲覧中に減らない
  - 閉じる時に「モーダル→山札へ戻す」挙動が成立しない
  - OP-B07（山札モーダル起点で上/下戻し）の意味付けが弱い

### 6.2 原因
- OP-A04実行時に `privateStateDoc.zones.deck` からカードを実際には移しておらず、UIローカル状態（`deckPeekCardIds`）で表示だけ作っていた。

### 6.3 対応方針
- 山札閲覧を「実体移動」に変更:
  - 閲覧開始時: `deck -> deckPeek` へ移動
  - 閲覧中: `deckPeek` をモーダル表示
  - 閉じる時: `deckPeek -> deck(top)` へ戻す
- DnDのソースを `player-deck-peek` として明示化。

### 6.4 実装内容
- `src/operations/wave1/helpers/zoneAccessors.js`
  - `PRIVATE_ZONE.DECK_PEEK` を追加
  - `resolvePrivateZone` が `deckPeek` を扱えるよう拡張
- `src/operations/wave1/applyOperationMutation.js`
  - OP-A04で `deck` 先頭 `count` 枚を `deckPeek` へ移動
  - `turnContext.deckPeekState.count/isOpen` を移動結果ベースで更新
- `src/components/PlayingField.js`
  - 山札閲覧モーダル表示カードを `privateStateDoc.zones.deckPeek` から生成
  - 閉じる時に `deckPeek` 残カードを山札上に戻す mutation を追加
  - 「もう一枚閲覧」で `deck -> deckPeek` を1枚移動する mutation を追加
  - モーダルカードの drag source を `player-deck-peek` に変更
  - ローカル仮想配列 `deckPeekCardIds` を廃止
- `src/interaction/dnd/resolveDropIntent.js`
  - `player-deck-peek` を card source として許可
- `src/interaction/dnd/applyDropMutation.js`
  - `player-deck-peek` からのカード取り出しを追加
  - `player-deck-peek` から他ゾーンへ移動時に `deckPeekState` を減算
  - `player-deck-peek` から山札上/下へ戻す時も `deckPeekState` を減算
  - `player-deck`（束）→discard の操作では `deckPeekState` を減算しないよう調整

### 6.5 追加テスト
- `src/operations/wave1/__tests__/applyOperationMutation.test.js`
  - OP-A04で `deck` 減少 / `deckPeek` 増加 / counter更新を検証
- `src/interaction/dnd/__tests__/resolveDropIntent.test.js`
  - `player-deck-peek` の deck-top edge 受理ケースを追加
- `src/interaction/dnd/__tests__/applyDropMutation.test.js`
  - `player-deck-peek -> reveal`
  - `player-deck-peek -> deck-bottom`
  - `player-deck`（束）->discard 時に `deckPeekState` は維持

### 6.6 追加実行コマンド結果
```bash
npm test -- --runInBand --runTestsByPath src/interaction/dnd/__tests__/resolveDropIntent.test.js
```
- PASS（14 tests）

```bash
npm test -- --runInBand --runTestsByPath src/interaction/dnd/__tests__/applyDropMutation.test.js
```
- PASS（11 tests）

```bash
npm test -- --runInBand --runTestsByPath src/operations/wave1/__tests__/applyOperationMutation.test.js
```
- PASS（56 tests）

```bash
npm test -- --runInBand --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- PASS（28 tests）

```bash
npm run build
```
- Compiled successfully.

## 7. 回帰修正（山札閲覧モーダルが表示されない）

### 7.1 事象
- 山札下の「閲覧」ボタンで枚数確定しても「山札を閲覧中」モーダルが開かない。

### 7.2 原因
- `OP-A04` で `privateStateDoc.zones.deckPeek` にカードを移していたが、
  `adaptSessionForClient` 内 `normalizePrivateState()` が `zones.deck` / `zones.hand` しか通しておらず、
  `zones.deckPeek` を毎回捨てていた。
- 結果、UI側の `deckPeekCards` が常に空配列になってモーダルが非表示になっていた。

### 7.3 対応
- `src/game-state/compatRead.js`
  - `normalizePrivateState()` の `zones` 正規化に `deckPeek` を追加。
- `src/game-state/builders.js`
  - `createEmptyPrivateStateV2()` の初期 `zones` に `deckPeek: []` を追加。
- `src/game-state/invariants.js`
  - private zone 検証対象に `deckPeek` を追加（orientation / unique ownership）。
- `src/game-state/__tests__/compatRead.test.js`（新規）
  - `deckPeek` が `adaptSessionForClient` 後も保持されることを検証。
  - `deckPeek` 欠落時に空配列へ正規化されることを検証。

### 7.4 検証コマンド
```bash
npm test -- --watch=false --runInBand src/game-state/__tests__/compatRead.test.js src/game-state/__tests__/invariants.test.js
```
- 結果: PASS（2 suites / 6 tests）

```bash
npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS（1 suite / 28 tests）

## 8. UI文言微修正（山札閲覧モーダル）

### 8.1 変更内容
- 「山札を閲覧中」モーダル右上ボタン文言を `閉じる` から `山札に戻す` へ変更。

### 8.2 目的
- 操作結果（閲覧中カードを山札へ戻す）を文言で明確化し、誤解を防ぐ。
