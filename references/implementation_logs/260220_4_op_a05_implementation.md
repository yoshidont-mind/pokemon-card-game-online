# OP-A05 実装ログ

作成日: 2026-02-20
対象: `references/documents/260220_1_notes_on_how_each_operation_should_be_implemented.md` の `OP-A05`

## 0. 目的
- 「相手手札（n枚）」メニューから、枚数を指定したランダム破壊要求を送信できるUIを追加する。
- 相手承認モーダル（操作ブロック）との接続を確認し、承認/拒否結果を双方の右上ポップアップ通知として表示する。

## 1. 実装前確認
- 参照ファイル:
  - `src/components/PlayingField.js`
  - `src/css/playingField.module.css`
  - `src/components/__tests__/PlayingFieldLayout.test.js`
- 既存状況:
  - OP-B11 (`opponent-discard-random-hand`) の request/approve 実行基盤は存在。
  - UI導線（相手手札メニュー内のOP-A05導線、枚数選択モーダル）が未接続。
  - Actor側の完了/拒否通知監視は追加途中状態。

## 2. 実装内容（作業中）
- `PlayingField.js`
  - 相手手札メニューに「手札のランダム破壊を要求」を追加。
  - 枚数指定モーダル（デフォルト1、+/-、枚数確定）を追加。
  - モーダル表示中は盤面操作をブロック。
  - OP-B11 完了/拒否時の actor 通知を有効化。
  - 相手側の承認成功メッセージをランダム破壊の枚数ベースに最適化。
- `playingField.module.css`
  - 枚数指定モーダルと + / - コントロールのスタイルを追加。
- `PlayingFieldLayout.test.js`
  - 相手手札メニューに新アクションが表示されることを検証。
  - 枚数指定モーダルの表示と + / - 調整を検証。
  - OP-B11 完了/拒否通知の表示を検証。

## 3. 実行コマンドと結果

### 3.1 実装中テスト（1回目）
```bash
npm test -- --watch=false --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: FAIL（23 tests中 1件失敗）
- 失敗内容:
  - `opens random discard request modal and allows count adjustment`
  - `getByText('1 枚')` が `PrizeFan` 表示と重複し曖昧一致。
- 対応:
  - テストを `within(modal)` スコープに変更し、モーダル内要素だけを検証するよう修正。

### 3.2 実装中テスト（2回目）
```bash
npm test -- --watch=false --runTestsByPath src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS（23 tests passed）

### 3.3 ビルド確認
```bash
npm run build
```
- 結果: Compiled successfully.
- 補足: 既存依存由来の警告（`caniuse-lite` と `babel-preset-react-app`）のみ表示。今回差分によるビルドエラーなし。

## 4. 実装完了内容（確定）
- OP-A05 導線:
  - `相手手札（n枚）` ボタンのメニューに `手札のランダム破壊を要求` を追加。
- OP-A05 入力UI:
  - 中央モーダルで枚数選択（デフォルト1、+/-、`枚数を確定`）。
  - 相手手札0枚時は確定不可。
- 実行フロー:
  - 確定時に `OP-B11` リクエスト（`targetPlayerId`, `count`）を送信。
  - モーダル表示中は盤面操作をブロック。
- 通知:
  - Actor側: 承認時 `相手手札からランダムにn枚トラッシュしました。`、拒否時 `相手が手札ランダム破壊リクエストを拒否しました。`
  - Target側: 承認ボタン押下時の成功文言を `自分の手札からランダムにn枚トラッシュしました。` に最適化。
- テスト:
  - メニュー表示、枚数モーダル操作、OP-B11 完了/拒否通知の表示ケースを `PlayingFieldLayout.test.js` に追加。
