# OP-E07 実装ログ

- 日付: 2026-02-21
- 担当: Codex
- 対象要件: `references/documents/260220_1_notes_on_how_each_operation_should_be_implemented.md` の `OP-E07`

## 1. 要件の再確認
`OP-E07` の要件:
- スタジアムエリアに置けるカードは 1 枚のみ
- スタジアムカードは自分/相手の両方に見える
- スタジアムカードについて、どちらが出したかを追跡する
- スタジアムカードを他エリアへ移動する場合、元の配置プレイヤー側の場にしか移動できない

## 2. 実装方針
1. DnD の source zone に `player-stadium` を追加。
2. `resolveDropIntent` でスタジアム由来カードの権限制御を追加。
   - 所有者以外の操作を reject
   - 非所有者側 field への移動を reject
3. スタジアムが埋まっている状態での `targetZoneKind=stadium` を reject し、同時存在を防止。
4. `applyDropMutation` で `sourceZone=player-stadium` を実装し、取り出し時に stadium を `null` 化。
5. スタジアム配置時に `imageUrl` を保持し、双方 UI で同一表示できるようにする。
6. `PlayingField` でスタジアム実カードを描画し、所有者のみドラッグ可能にする。

## 3. 変更ファイル
- `src/interaction/dnd/resolveDropIntent.js`
  - `player-stadium` を有効 source zone に追加
  - board snapshot に `stadium.exists/cardId/ownerPlayerId` を追加
  - `player-stadium` 起点の権限制御を追加
  - occupied な stadium へのドロップを `TARGET_OCCUPIED` で reject

- `src/interaction/dnd/applyDropMutation.js`
  - `takeCardRefFromSource()` に `sourceZone=player-stadium` を追加
    - stadium card の一致検証
    - 所有者検証（非所有者は `PERMISSION_DENIED`）
    - 取り出し後 `sessionDoc.publicState.stadium = null`
  - `targetZoneKind=stadium` 時に occupied チェックを追加
  - stadium へ置く際 `imageUrl` を保存

- `src/components/PlayingField.js`
  - stadium state (`cardId/ownerPlayerId/imageUrl`) を導出
  - stadium の drop payload を「空のときのみ」有効化
  - スタジアムカード画像を中央ゾーンに表示
  - 所有者のみ draggable (`sourceZone=player-stadium`)
  - 所有者ラベル（`自分が配置` / `相手が配置`）を表示

- `src/css/playingField.module.css`
  - stadium カード表示/ドラッグ用スタイルを追加
  - centerZone をカード表示可能な最小高さへ調整

- `src/interaction/dnd/__tests__/resolveDropIntent.test.js`
  - stadium occupied 時の reject 追加
  - stadium owner による移動 accept 追加
  - 非所有者移動 reject 追加

- `src/interaction/dnd/__tests__/applyDropMutation.test.js`
  - stadium 配置時 owner/imageUrl 保存を検証
  - stadium -> discard 移動で stadium clear を検証
  - 非所有者移動で throw を検証

## 4. 実行コマンドと結果
```bash
npm test -- --watch=false --runInBand src/interaction/dnd/__tests__/resolveDropIntent.test.js src/interaction/dnd/__tests__/applyDropMutation.test.js src/components/__tests__/PlayingFieldDnd.test.js src/components/__tests__/PlayingFieldLayout.test.js
```
- 結果: PASS
- Test Suites: 4 passed
- Tests: 88 passed
- 備考: `ReactDOMTestUtils.act` deprecation warning は既知の既存警告

## 5. 実装上の注意点
- 本対応は「スタジアムの所有者拘束」を DnD レイヤーと mutation レイヤーの両方で実施。
- UI 側でも非所有者はドラッグ開始できないようにしており、誤操作を抑制。
- 既存の `OP-E04`（スタジアム除去系）や operation panel 系処理とは独立に、DnD ルートで `OP-E07` を満たす。

## 6. 追加バグ修正（ベンチ隣接枠の z-index 競合）
- 事象:
  - 右側ベンチ（複数枚）で `展開 -> 展開を閉じる` 後、左側ベンチ（単枚）をホバーすると、拡大カードが右側枠の背面に回る。
- 原因:
  - `.benchSlot:hover, .benchSlot:focus-within` が同じ `z-index` を持ち、右側の `focus-within` が残ると隣接枠間の重なり順が DOM 順に依存して逆転する。
- 対応:
  - `src/css/playingField.module.css`
    - `.benchSlot:hover` を `z-index: 8`
    - `.benchSlot:focus-within` を `z-index: 6`
  - これにより、実際にホバー中の枠が常に前面になる。

### 6.1 再検証
```bash
npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldDnd.test.js src/components/__tests__/PlayingFieldLayout.test.js
```
- PASS（2 suites / 32 tests）
