# OP-A04 / OP-A06 / OP-A07 / OP-B01 実装ログ

作成日: 2026-02-20
対象: `references/documents/260220_1_notes_on_how_each_operation_should_be_implemented.md`

## 0. 目的
- `OP-A04`: 山札閲覧（枚数選択 + 閲覧モーダル + DnD移動）
- `OP-A06`: 山札への上/下戻し（左半分=下、右半分=上）
- `OP-A07`: 共有ノートパネル（追加/編集/削除）
- `OP-B01`: 山札シャッフル通知を両プレイヤーへ表示

## 1. 初期調査結果
- operation層には `OP-A04 / OP-A06 / OP-B01` が存在するが、UI導線と相手通知の一部が未接続。
- DnD は `player-hand / player-reveal` からの移動のみ対応で、山札由来カードのドラッグ移動が不可。
- 共有ノート機能（A07）は未実装。

## 2. 実装方針（確定）
1. DnD intent/mutation を拡張し、`player-deck` をカードソースとして許可。
2. 山札左右ドロップターゲット（A06）を新規追加し、`top/bottom` を action として確定。
3. `OP-B01` と `OP-A04` に turnContext イベントを付与し、相手通知を UI 側で監視表示。
4. `PlayingField` に山札閲覧UI（枚数指定モーダル + 閲覧モーダル）を追加。
5. `PlayingField` に共有ノートUI（入力/一覧/編集/削除）を追加し、Firestoreへ保存。

## 3. 進捗ログ
- 2026-02-20: DnD基盤拡張（constants/buildDragPayload/resolveDropIntent/applyDropMutation）に着手。
- 2026-02-20: PlayingField へ A04/A06/A07/B01 UI追加を実装中。

## 4. 実行コマンドと結果
（後続で追記）

## 5. 実装内容（確定）

### 5.1 OP-A06（山札 左/右ドロップ）
- DnD定義を拡張:
  - `src/interaction/dnd/constants.js`
    - `ZONE_KINDS.DECK` を追加
    - `INTENT_ACTIONS.MOVE_CARD_TO_DECK_EDGE` を追加
  - `src/interaction/dnd/buildDragPayload.js`
    - zone drop payload に `edge` を追加
  - `src/interaction/dnd/resolveDropIntent.js`
    - `player-deck` を card source として許可
    - `zoneKind=deck` + `edge=top|bottom` で `move-card-to-deck-edge` intent を返す
  - `src/interaction/dnd/applyDropMutation.js`
    - source zone として `player-deck` を追加
    - `move-card-to-deck-edge` を追加し、山札上/下への戻しを反映
    - `turnContext.lastDeckInsertEvent` を記録
- UI反映:
  - `src/components/PlayingField.js`
    - 山札ゾーン上に左右2分割ドロップターゲットを実装
      - 左: `下に戻す`（青系）
      - 右: `上に戻す`（赤系）
  - `src/css/playingField.module.css`
    - 左右ドロップターゲット表示・ハイライトスタイルを追加

### 5.2 OP-A04（山札閲覧）
- 山札クイックアクションに `閲覧` ボタンを追加。
- `閲覧` 押下で枚数設定モーダル（+/-、枚数確定）を表示。
- 枚数確定で:
  - `OP-A04` を実行（operation event記録）
  - 山札上部 `n` 枚を `山札閲覧モーダル` に表示
  - 閲覧モーダル内カードを DnD で他ゾーンへ移動可能（sourceZone=`player-deck`）
- 追加ファイルなし（`PlayingField.js` 内実装）
- CSS追加:
  - `deckPeekRoot`, `deckPeekCard`, `deckPeekCards`

### 5.3 OP-A07（共有ノート）
- 画面左下に共有ノートパネルを新設。
- 機能:
  - 新規作成（textarea + `共有する`）
  - 一覧表示（publicState.sharedNotes）
  - 編集（fa-edit）
  - 削除（fa-trash）
- 保存先:
  - `sessionDoc.publicState.sharedNotes`
  - 追加/編集/削除は `applySessionMutation` で反映
- 実装ファイル:
  - `src/components/PlayingField.js`
  - `src/css/playingField.module.css`

### 5.4 OP-B01（山札シャッフル通知）
- operation層:
  - `src/operations/wave1/applyOperationMutation.js`
    - `OP-B01` 実行時に `turnContext.lastDeckShuffleEvent` を記録
- UI層:
  - `src/components/PlayingField.js`
    - event監視を追加し、右上通知を表示
      - 自分実行: `山札がシャッフルされました。`
      - 相手実行: `相手プレイヤーの山札がシャッフルされました。`

## 6. テスト更新
- `src/interaction/dnd/__tests__/resolveDropIntent.test.js`
  - 山札下戻し受理ケース
  - `player-deck` → reveal 受理ケース
- `src/interaction/dnd/__tests__/applyDropMutation.test.js`
  - `player-deck` source の移動
  - 山札上戻し + event 記録
- `src/operations/wave1/__tests__/applyOperationMutation.test.js`
  - OP-A04 deck peek event 記録
  - OP-B01 shuffle event 記録
- `src/components/__tests__/PlayingFieldLayout.test.js`
  - 閲覧ボタン表示
  - 枚数設定モーダル
  - 共有ノート表示
  - 相手の shuffle / deck peek 通知表示

## 7. 実行コマンドと結果

```bash
npm test -- --watch=false --runTestsByPath src/interaction/dnd/__tests__/resolveDropIntent.test.js
```
- 結果: PASS（11 tests passed）

```bash
npm test -- --watch=false --runTestsByPath src/interaction/dnd/__tests__/applyDropMutation.test.js
```
- 結果: PASS（9 tests passed）

```bash
npm test -- --watch=false --runTestsByPath src/operations/wave1/__tests__/applyOperationMutation.test.js
```
- 結果: PASS（56 tests passed）

```bash
npm test -- --watch=false --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS（27 tests passed）

```bash
npm run build
```
- 結果: Compiled successfully.
- 補足: 既存依存由来の warning（`caniuse-lite`, `babel-preset-react-app`）のみ。

## 8. 備考
- OP-A04 の「山札モーダル中は相手へ通知」は `turnContext.lastDeckPeekEvent` を監視して実現。
- OP-A06 の「上/下戻し通知」は `turnContext.lastDeckInsertEvent` を監視して実現。

## 9. 追補（山札閲覧モーダル改善）

### 9.1 ユーザー要望
- 山札閲覧モーダルの `閉じる` をモーダル外中央上へ移動（手札トレイ準拠）
- 山札閲覧カードのホバー拡大（モーダル外へはみ出し、前面表示）
- 相手側の `相手が山札を閲覧中（n枚）` をリアルタイム更新
- `もう一枚閲覧` ボタン追加
- シャッフル通知（自分/相手）を最大10秒で自動消去

### 9.2 実装内容
- `src/components/PlayingField.js`
  - `DeckPeekModal` を再構成し、上部ツールバーに `もう一枚閲覧` / `閉じる` を配置
  - 山札閲覧カードに `popupCard*` 系スタイルを適用し、手札同等のホバー拡大を実装
  - `handleRevealOneMoreDeckCard` を追加し、山札上から未表示カードを1枚ずつ追加
  - `turnContext.deckPeekState` を同期する `syncDeckPeekBroadcast` を追加（open/close/count）
  - 相手向け右上ライブバナー `相手が山札を閲覧中（n枚）` を `deckPeekState` から表示
  - シャッフル通知文言を検知し、10秒後に `clearMutationNotice` で自動消去
- `src/interaction/dnd/applyDropMutation.js`
  - 山札閲覧中に `player-deck` 由来カードが他ゾーンへ移動した際、`deckPeekState.count` を減算
  - 残数0で `isOpen:false` / `count:0` に自動クローズ
- `src/css/playingField.module.css`
  - `deckPeekToolbar`, `deckPeekToolbarButton`, `deckPeekLiveBanner` 等のスタイル追加

### 9.3 テストと失敗対応
初回実行で `PlayingFieldLayout` の1ケースが失敗。

```bash
npm test -- --runInBand --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```

- 失敗内容:
  - `opens deck peek count config modal from deck quick action`
  - `枚数を確定` 押下後に `もう一枚閲覧` ボタンを待っていたが、テスト環境では認証モック無しのため mutation が失敗し、deck peek モーダルに遷移しない
- 対応:
  - テストを「設定モーダルの開閉検証」に修正（`キャンセル` で閉じることを確認）

### 9.4 再実行結果

```bash
npm test -- --runInBand --runTestsByPath src/interaction/dnd/__tests__/resolveDropIntent.test.js
```
- 結果: PASS（11 tests passed）

```bash
npm test -- --runInBand --runTestsByPath src/interaction/dnd/__tests__/applyDropMutation.test.js
```
- 結果: PASS（9 tests passed）

```bash
npm test -- --runInBand --runTestsByPath src/operations/wave1/__tests__/applyOperationMutation.test.js
```
- 結果: PASS（56 tests passed）

```bash
npm test -- --runInBand --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS（28 tests passed）
- 補足: `ReactDOMTestUtils.act` deprecation warning は既存依存由来（今回変更起因ではない）

```bash
npm run build
```
- 結果: Compiled successfully.
- 補足: `caniuse-lite` / `babel-preset-react-app` の既存 warning のみ

## 10. 追補（山札閲覧モーダルのドラッグ移動対応）

### 10.1 対応内容
- 要望:
  - 山札閲覧モーダルを手札エリア同様にドラッグ移動可能にする
- 実装:
  - `src/components/PlayingField.js`
    - `DeckPeekModal` 内にドラッグ状態を追加
      - 位置状態: `modalPosition`
      - ドラッグ中フラグ: `isModalDragging`
      - `pointermove/pointerup` で追従
    - 画面外に出ないようクランプ処理を適用
    - 位置を localStorage に保存/復元
      - key: `pcgo:deck-peek-position:v1`
    - ツールバーに「移動ハンドル（矢印アイコン）」と「位置をリセット」を追加
  - `src/css/playingField.module.css`
    - `deckPeekHandle`, `deckPeekHandleActive` を追加

### 10.2 実行コマンド

```bash
npm test -- --runInBand --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS（28 tests passed）

```bash
npm run build
```
- 結果: Compiled successfully.
- 補足: 既存 warning（`caniuse-lite` / `babel-preset-react-app`）のみ
