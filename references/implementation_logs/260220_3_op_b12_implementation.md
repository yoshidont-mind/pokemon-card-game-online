# OP-B12 実装ログ

作成日: 2026-02-20
対象: `references/documents/260220_1_notes_on_how_each_operation_should_be_implemented.md` の `OP-B12`

## 0. 目的
- 既存の「相手手札公開（OP-A03）」とは別に、`OP-B12` を「公開後に指定した1枚の破壊を相手承認で実行」できる仕様として実装する。

## 1. 初期調査
- 参照ファイル:
  - `references/documents/260220_1_notes_on_how_each_operation_should_be_implemented.md`
  - `src/components/PlayingField.js`
  - `src/operations/wave1/applyOperationMutation.js`
  - `src/operations/wave1/resolveOperationIntent.js`
  - `src/components/operation/OperationPanel.js`
- 調査結果:
  - 既存 `OP-B12` は `OP-A03` と同じ `requestType=opponent-reveal-hand` になっており、指定カード破壊は未実装。
  - 承認モーダルは `requestType` ごとの文言切替のみで、カード画像付き表示は未実装。

## 2. 実装方針（確定）
1. `OP-B12` を専用 requestType（`opponent-discard-selected-hand`）へ分離する。
2. `OP-B12` payload に `cardId` を必須化する（`resolveOperationIntent` で検証）。
3. 承認時は対象プレイヤー手札から `cardId` 1枚のみをトラッシュへ移動する。
4. `PlayingField` の相手手札公開モーダルで「ダブルクリックでカード選択」→「このカードの破壊を要求」ボタンを追加する。
5. 相手側の承認モーダルに「要求カード画像 + 文言」を表示する。
6. 完了/拒否時に右上通知（緑/赤）を表示する。

## 3. 実装内容

### 3.1 operation層: OP-B12 を専用リクエストへ分離
- `src/operations/wave1/operationCatalog.js`
  - `OP-B12` を `requestType: opponent-discard-selected-hand` に変更。
  - ラベルを `相手手札指定破壊（相手承認）` に変更。

- `src/operations/wave1/resolveOperationIntent.js`
  - `OP-B12` の payload 検証を強化。
  - `targetPlayerId` に加えて `cardId` を必須化。

- `src/operations/wave1/applyOperationMutation.js`
  - request作成時 payload に `cardId` を保持。
  - `applyOperationMutation` 内 requestType 解決ロジックを分離:
    - `OP-A03` => `opponent-reveal-hand`
    - `OP-B11` => `opponent-discard-random-hand`
    - `OP-B12` => `opponent-discard-selected-hand`
  - `applyRequestApproval` に `opponent-discard-selected-hand` 処理を追加。
    - 対象手札 `cardId` を1枚除去
    - 対象プレイヤーのトラッシュへ移動
    - `result.discardedCardId(s)` を保存

### 3.2 UI層: PlayingField に OP-B12 実行導線を追加
- `src/components/PlayingField.js`
  - 相手手札公開モーダルでカードをダブルクリック選択できる state を追加。
  - 選択中カードを表示し、`このカードの破壊を要求` ボタンを追加。
  - 上記ボタン押下で `OP-B12` request を送信（payload に `targetPlayerId` と `cardId`）。
  - 承認待ちモーダル（相手側）で、`opponent-discard-selected-hand` の場合に対象カード画像を表示。
  - `OP-B12` リクエストの完了/拒否を監視し、右上通知を表示。
    - 完了: `相手手札の指定カードをトラッシュしました。`（緑）
    - 拒否: `相手がカード破壊リクエストを拒否しました。`（赤）

- `src/css/playingField.module.css`
  - ダブルクリック選択カードのハイライトスタイルを追加。
  - 選択カード行・承認モーダルのカードプレビュー用スタイルを追加。

### 3.3 OperationPanel 表示文言の整合
- `src/components/operation/OperationPanel.js`
  - `opponent-discard-selected-hand` の解決済みサマリー（`指定破棄カード:`）を追加。

## 4. テスト修正
- `src/operations/wave1/__tests__/resolveOperationIntent.test.js`
  - `OP-B12` 成功ケースを `cardId` 付きに更新。
  - `cardId` 欠落時の reject ケースを追加。

- `src/operations/wave1/__tests__/applyOperationMutation.test.js`
  - 既存 reveal-hand 承認ケースを `OP-A03` 前提に調整。
  - `OP-B12` 指定破壊承認ケースを新規追加。
  - 「既に解決済み」ケースを `opponent-discard-selected-hand` に調整。

- `src/components/__tests__/PlayingFieldLayout.test.js`
  - 相手手札公開モーダルで「ダブルクリック選択 -> 破壊要求ボタン有効化」ケースを追加。
  - `OP-B12` 完了/拒否通知の表示ケースを追加。
  - `OP-B12` 承認モーダルで対象カード画像が表示されるケースを追加。

- `src/components/__tests__/OperationPanel.test.js`
  - `OP-B12` の解決済み表示文言を `指定破棄カード` に更新。

## 5. 実行コマンドと結果
```bash
npm test -- --watch=false --runTestsByPath src/operations/wave1/__tests__/resolveOperationIntent.test.js
```
- 結果: PASS（12 tests passed）

```bash
npm test -- --watch=false --runTestsByPath src/operations/wave1/__tests__/applyOperationMutation.test.js
```
- 結果: PASS（54 tests passed）

```bash
npm test -- --watch=false --runTestsByPath src/components/__tests__/OperationPanel.test.js
```
- 結果: PASS（5 tests passed）

```bash
npm test -- --watch=false --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS（20 tests passed）

```bash
npm run build
```
- 結果: Compiled successfully.

## 6. 補足
- `ReactDOMTestUtils.act` deprecation warning と CRA/Babel 警告は既存依存由来で、今回差分による新規エラーではないことを確認。

## 7. 追加UI調整（2026-02-20 追記）

ユーザー追加要望に対応:
1. 選択中カードの下部詳細（`選択中: cardId`）は表示しない。
2. 選択中カードの見た目を強調（太い赤枠 + 薄赤オーバーレイ + 少し上へ移動）。
3. ボタン文言を `このカードの破壊を要求` から `選択されたカードの破壊を要求` に変更。
4. 複数カードを同時選択してまとめて破壊要求できるようにする。

### 7.1 実装
- `src/components/PlayingField.js`
  - 選択stateを単一indexから複数cardId配列へ変更。
    - `opponentRevealSelectedCardIds: string[]`
  - ダブルクリックで個別トグル選択（複数選択可）。
  - `OP-B12` リクエスト送信payloadを `cardId` 単数から `cardIds` 複数へ対応。
  - 送信成功時の通知文を選択枚数に応じて切り替え。
  - 完了通知も `discardedCardIds` 件数に応じて表示。
  - 承認待ちモーダルの対象カード表示を複数画像対応に変更。
  - `選択中: cardId` 表示ブロックを削除。

- `src/css/playingField.module.css`
  - `.popupCardButtonSelected` を強調仕様へ更新。
    - 太い赤枠
    - 薄赤オーバーレイ (`::after`)
    - 上方向シフト
  - 承認待ちモーダルの複数対象カード表示レイアウトを追加。

- `src/operations/wave1/resolveOperationIntent.js`
  - `OP-B12` は `cardId` 単数または `cardIds` 複数を受け入れ。
  - 正規化後、`payload.cardIds` / `payload.cardId` を補完。

- `src/operations/wave1/applyOperationMutation.js`
  - リクエストpayloadへ `cardIds` を保存。
  - 承認処理で `cardIds` 複数を手札から除去してトラッシュへ移動。

### 7.2 テスト更新
- `src/components/__tests__/PlayingFieldLayout.test.js`
  - ボタン文言変更に追従。
  - 下部詳細表示削除に伴うアサーション更新。
  - 承認待ちモーダル画像alt名（複数表示）へ追従。

- `src/operations/wave1/__tests__/resolveOperationIntent.test.js`
  - `cardIds` 指定成功ケースを追加。

- `src/operations/wave1/__tests__/applyOperationMutation.test.js`
  - `OP-B12` 複数cardIds承認で複数破棄されるケースを追加。

### 7.3 実行コマンドと結果
```bash
npm test -- --watch=false --runTestsByPath src/operations/wave1/__tests__/resolveOperationIntent.test.js
```
- 結果: PASS（13 tests passed）

```bash
npm test -- --watch=false --runTestsByPath src/operations/wave1/__tests__/applyOperationMutation.test.js
```
- 結果: PASS（55 tests passed）

```bash
npm test -- --watch=false --runTestsByPath src/components/__tests__/OperationPanel.test.js
```
- 結果: PASS（5 tests passed）

```bash
npm test -- --watch=false --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS（20 tests passed）

```bash
npm run build
```
- 結果: Compiled successfully.

## 8. 不具合修正: 相手手札モーダルの拡大表示がクリップされる
- 症状:
  - 相手手札モーダル上でホバー拡大したカードが、モーダル外にはみ出さず切り抜かれたように見える。
- 原因:
  - `.popupCardButton` に追加した `overflow: hidden` が、拡大画像のはみ出し領域をクリップしていた。
  - 併せて `.popupCardButtonSelected::after` の重ねが視覚的に「穴抜け」感を強めていた。
- 対応:
  - `overflow: hidden` を削除し、拡大カードのオーバーフロー表示を復旧。
  - 選択赤みは `::after` オーバーレイではなく画像フィルタ中心へ変更。
- 変更ファイル:
  - `src/css/playingField.module.css`

### 検証
```bash
npm test -- --watch=false --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS（20 tests passed）
