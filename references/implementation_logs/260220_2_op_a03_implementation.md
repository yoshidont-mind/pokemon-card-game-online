# 260220_2_op_a03_implementation

## 0. 作業開始
- 目的: `OP-A03` をユーザー要望メモ（`references/documents/260220_1_notes_on_how_each_operation_should_be_implemented.md`）に合わせて実装する。
- 対象要件（要約）:
  - 「相手手札（n枚）」ボタン起点で「手札の公開を要求」を送信。
  - 相手側は中央ブロッキングモーダルで承認/拒否。
  - 拒否時は右上ポップアップ通知。
  - 承認時は依頼者側に相手手札一覧モーダルを中央最前面で表示し、閉じるまで他操作を止める。

## 1. 現状調査
- 既存実装確認:
  - `PlayingField` には承認待ちの中央ブロッキングモーダルが既に存在。
  - `OP-B12` が `requestType: opponent-reveal-hand` として実装済み。
  - `OP-A03` は現状 direct 操作で、手札1枚の `visibility` を変更する旧実装。
- 方針:
  - `OP-A03` を request モードへ切替。
  - `PlayingField` に「相手手札ボタン + クイックメニュー + 承認後閲覧モーダル」を追加。
  - 既存 request 基盤（承認/拒否）を再利用。

## 2. 実装内容

### 2.1 OP-A03 を request 操作へ切替
- 変更ファイル:
  - `src/operations/wave1/operationCatalog.js`
  - `src/operations/wave1/resolveOperationIntent.js`
  - `src/operations/wave1/applyOperationMutation.js`
  - `src/components/operation/OperationPanel.js`
- 変更要点:
  - `OP-A03` の catalog mode を `direct` から `request` に変更。
  - `requestType` を `opponent-reveal-hand` に紐付け。
  - resolve 時の request 系バリデーション対象に `OP-A03` を追加。
  - request 書き込み時の `requestType` 解決に `OP-A03` を追加。
  - 旧 `OP-A03 direct`（手札カードの visibility を直接更新）処理は削除。
  - `OperationPanel` から `OP-A03` を実行する場合も `targetPlayerId` が相手になるよう補正。

### 2.2 PlayingField に OP-A03 専用UIを追加
- 変更ファイル:
  - `src/components/PlayingField.js`
  - `src/css/playingField.module.css`
- 変更要点:
  - 固定表示「相手手札（n枚）」をクリック可能ボタンに変更。
  - ボタン押下でアクションメニュー（`手札の公開を要求`）を表示。
  - `手札の公開を要求` 押下で `OP-A03` request を送信。
  - request 承認/拒否の反映監視を追加:
    - 拒否時: 右上ポップアップ（`mutationBanner`）に拒否メッセージ表示。
    - 承認時: 中央最前面モーダルに相手手札一覧を表示。
  - 手札一覧モーダル表示中は他操作をブロック（DnD lock + overlay でUI操作遮断）。
  - モーダル下部の `閉じる` ボタンで解除。

## 3. テスト更新
- `src/operations/wave1/__tests__/resolveOperationIntent.test.js`
  - `OP-A03` が request として受理されるケースを追加。
- `src/operations/wave1/__tests__/applyOperationMutation.test.js`
  - 旧 `OP-A03 direct` 前提テストを削除。
- `src/components/__tests__/PlayingFieldLayout.test.js`
  - 相手手札ボタンのアクションメニュー表示テスト追加。
  - 新規 approved request 到着時に相手手札モーダルが表示されるテスト追加。
  - 新規 rejected request 到着時に拒否バナー表示されるテスト追加。

## 4. 実行コマンドと結果

### 4.1 単体テスト
```bash
npm test -- --watchAll=false --runTestsByPath src/operations/wave1/__tests__/resolveOperationIntent.test.js
```
- 結果: PASS（11 tests passed）

```bash
npm test -- --watchAll=false --runTestsByPath src/operations/wave1/__tests__/applyOperationMutation.test.js
```
- 結果: PASS（53 tests passed）

```bash
npm test -- --watchAll=false --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS（16 tests passed）
- 補足: `ReactDOMTestUtils.act` deprecation warning は既存由来で、今回変更箇所の失敗ではない。

### 4.2 ビルド
```bash
npm run build
```
- 結果: Compiled successfully.
- 出力差分（gzip）:
  - `build/static/js/main.24802974.js` (+734 B)
  - `build/static/css/main.6ea72a11.css` (+271 B)

## 5. 既知の注意
- CRA 由来の警告（`babel-preset-react-app` / `caniuse-lite outdated`）は今回変更に起因しない既存警告。

### 4.3 追加回帰確認（OperationPanel）
```bash
npm test -- --watchAll=false --runTestsByPath src/components/__tests__/OperationPanel.test.js
```
- 結果: PASS（5 tests passed）
- 目的: `OP-A03` request化に伴う `OperationPanel` の `targetPlayerId` 補正変更の回帰確認。

## 6. 追加対応: プレイマット上部の「ターン情報」欄を削除
- 要望: プレイマット上部の「ターン情報」欄は不要のため非表示化。

### 6.1 実装
- `src/components/PlayingField.js`
  - `turnInfoPanel` の描画ブロックを削除。
  - それに伴い未使用化した補助関数/計算値を削除:
    - `formatZoneLabel`
    - `turnNumber`, `currentTurnOwnerLabel`, `supportUsed`, `goodsUsedCount`, `lastRandomSelection`, `randomSelectionCardCount`, `playerMarkers`
- `src/css/playingField.module.css`
  - 未使用になったスタイルを削除:
    - `.turnInfoPanel`, `.turnInfoTitle`, `.turnInfoList`, `.turnInfoMarkers`, `.turnInfoEmpty`

### 6.2 テスト更新
- `src/components/__tests__/PlayingFieldLayout.test.js`
  - 旧テスト `shows turn info and marker notes from turnContext and player markers` を差し替え。
  - 新テスト `does not render turn info panel` を追加して、ターン情報欄が表示されないことを検証。

### 6.3 検証
```bash
npm test -- --watchAll=false --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS（16 tests passed）

```bash
npm run build
```
- 結果: Compiled successfully.

## 7. 追加対応: 相手手札モーダルのサイズ最適化（枚数連動）
- 要望: 相手手札モーダルの表示サイズを、手札エリア同様にカード枚数へ追従させる。
  - 1行あたり最大10枚
  - 11枚目以降は改行

### 7.1 実装
- `src/components/PlayingField.js`
  - `opponentRevealColumnCount` を追加（`max(1, min(10, cardCount))`）。
  - 相手手札モーダル（`.opponentRevealCard`）へ CSS 変数 `--opponent-reveal-columns` を inline style で渡す。
- `src/css/playingField.module.css`
  - `.opponentRevealCard` を `fit-content` ベースへ変更（`max-width` は viewport 制約）。
  - `.opponentRevealCards` を固定列グリッド化:
    - `grid-template-columns: repeat(var(--opponent-reveal-columns), var(--card-w))`
    - 幅は `max-content`、超過時は `overflow: auto`

### 7.2 テスト
- `src/components/__tests__/PlayingFieldLayout.test.js`
  - `opponent hand reveal modal caps columns at 10 and wraps beyond 10 cards` を追加。
  - 12枚公開時に `--opponent-reveal-columns` が `10` になることを検証。

### 7.3 検証
```bash
npm test -- --watchAll=false --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS（17 tests passed）

```bash
npm run build
```
- 結果: Compiled successfully.

## 8. 追加対応: 手札カードの拡大表示を「その場前面表示」へ変更
- 要望: 手札カードの拡大を、手札エリア上部の別プレビューではなく、カード自体をその場で前面に拡大表示する方式へ変更。

### 8.1 実装
- `src/components/HandTray.js`
  - 旧方式のプレビュー状態とDOMを削除:
    - `previewCenterX` state
    - `cardButtonRefs` ref
    - プレビュー位置計算 `useEffect`
    - `handHoverPreview` 描画ブロック
  - `activeIndex`（hover/pin）で、対象カードの `DraggableCard` に `handCardDraggableActive` クラスを付与。
- `src/css/playingField.module.css`
  - `handCardDraggableActive` を追加し、前面表示の z-index を強化。
  - ホバー/フォーカス/ピン時の拡大を強化:
    - `translateY(-26px) scale(1.55)`
  - 旧方式のプレビュー用スタイルを削除:
    - `.handHoverPreview`
    - `.handHoverPreviewImage`

### 8.2 検証
```bash
npm test -- --watchAll=false --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS（17 tests passed）

```bash
npm run build
```
- 結果: Compiled successfully.

## 9. 微調整: 手札カード拡大率を 7.75x → 5x へ調整
- 理由: 7.75x は過剰だったため、実効 5x へ調整。

### 9.1 実装
- `src/css/playingField.module.css`
  - 手札カード拡大時の transform を変更:
    - `translateY(-54px) scale(7.75)` → `translateY(-40px) scale(5)`
  - シャドウ強度を微調整:
    - `0 28px 44px rgba(0,0,0,0.44)` → `0 24px 38px rgba(0,0,0,0.42)`

### 9.2 検証
```bash
npm test -- --watchAll=false --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS（17 tests passed）

```bash
npm run build
```
- 結果: Compiled successfully.

## 10. 追加対応: 手札拡大カードの画面内自動補正
- 要望: 手札エリアの位置によって拡大カードが画面外に見切れる場合、見切れないよう表示位置を自動調整。

### 10.1 実装
- `src/components/HandTray.js`
  - 追加定数:
    - `HAND_CARD_HOVER_SCALE = 5`
    - `HAND_CARD_BASE_SHIFT = { x: 0, y: -40 }`
    - `HAND_CARD_VIEWPORT_MARGIN_PX = 6`
  - 追加関数:
    - `resolveHandCardHoverShift(...)`
      - アクティブカードの実座標（拡大後想定）を元に、viewport内へ収まる `translateX/translateY` を算出。
  - 追加state/ref:
    - `activeCardShift`
    - `cardButtonRefs`
  - 追加処理:
    - activeカード変更・手札トレイ移動・リサイズ時に `activeCardShift` を再計算。
  - ボタン要素へCSS変数をinline付与:
    - `--hand-card-shift-x`
    - `--hand-card-shift-y`
- `src/css/playingField.module.css`
  - `handCardButton` に拡大用CSS変数を追加。
  - 拡大transformを固定値から変数参照へ変更。

### 10.2 検証
```bash
npm test -- --watchAll=false --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS（17 tests passed）

```bash
npm run build
```
- 結果: Compiled successfully.

## 11. 追加対応: 相手手札ポップアップでの「その場前面拡大」実装
- 要望: 相手手札モーダルでも、手札エリアと同様にホバー時にカードがその場で前面拡大し、モーダルをはみ出して重なる挙動にする。
- 追加方針: 将来の山札/バトル場/ベンチ展開ポップアップでも再利用できるよう、拡大表示用の共通クラス群を追加。

### 11.1 実装
- `src/components/PlayingField.js`
  - ポップアップカード拡大向け定数を追加:
    - `POPUP_CARD_HOVER_SCALE = 5`
    - `POPUP_CARD_BASE_SHIFT = { x: 0, y: -40 }`
  - 画面内に収める補正関数を追加:
    - `resolvePopupCardHoverShift(...)`
  - 相手手札モーダル内カードを `button` 化し、hover/focus時の active 管理を追加。
  - activeカードの `translateX/Y` を動的補正して、見切れを軽減。
- `src/css/playingField.module.css`
  - `opponentRevealCards` を `overflow: visible` に変更（モーダル外への拡大表示を許可）。
  - 共通拡大クラスを追加（今後の各種ポップアップ再利用向け）:
    - `.popupCardItem`, `.popupCardItemActive`
    - `.popupCardButton`, `.popupCardButtonActive`
    - `.popupCardImage`

### 11.2 テスト
- `src/components/__tests__/PlayingFieldLayout.test.js`
  - 相手手札モーダルで、拡大用ボタンが出ることを確認するアサーションを追加。

### 11.3 検証
```bash
npm test -- --watchAll=false --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS（17 tests passed）

```bash
npm run build
```
- 結果: Compiled successfully.

## 12. 追加対応: 右上通知ポップアップのトーン分離（通常=緑 / 拒否・異常=赤）
- 要望:
  - 右上最前面ポップアップ通知を、内容に応じて色分けする。
  - 拒否・失敗・権限不足など通常フロー逸脱メッセージは赤系。
  - それ以外の通常通知（例: リクエスト送信、承認）は緑系。
  - 今後追加するメッセージでも同方針を適用し、READMEに明記する。

### 12.1 実装
- `src/components/PlayingField.js`
  - 通知stateを `mutationNotice: { text, tone }` へ拡張。
  - 追加:
    - `MUTATION_NOTICE_TONE`（`success` / `alert`）
    - `ALERT_MESSAGE_PATTERN`
    - `pushMutationNotice`, `pushSuccessNotice`, `pushAlertNotice`, `clearMutationNotice`
  - 既存 `setMutationMessage(...)` を上記APIへ置換。
  - `useBoardDnd` / `OperationPanel` の `onMutationMessage` には `handleExternalMutationMessage` を渡し、外部由来メッセージも同じ判定ルールで色分け。
  - 右上通知描画を tone に応じたクラス付与に変更。
- `src/css/playingField.module.css`
  - `mutationBanner` を共通土台へ整理。
  - 追加:
    - `.mutationBannerSuccess`（緑系）
    - `.mutationBannerAlert`（赤系）
- `README.md`
  - 「今後のUI方針」に通知色分けルール（通常=緑 / 逸脱系=赤、今後の全メッセージへ適用）を追記。

### 12.2 検証
```bash
npm test -- --watch=false --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS（17 tests passed）

```bash
npm test -- --watch=false --runTestsByPath src/components/operation/__tests__/OperationPanel.test.js
```
- 結果: FAIL（テストファイルパス誤り: ENOENT）

```bash
npm test -- --watch=false --runTestsByPath src/components/__tests__/OperationPanel.test.js
```
- 結果: PASS（5 tests passed）

```bash
npm run build
```
- 結果: Compiled successfully.
