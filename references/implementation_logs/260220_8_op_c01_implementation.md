# OP-C01 実装ログ

作成日: 2026-02-20
対象: `references/documents/260220_1_notes_on_how_each_operation_should_be_implemented.md`

## 0. 目的
- OP-C01（バトル場/ベンチでのカード重ね）を、直感的なGUI操作で実現する。
- 要件メモに沿って以下を成立させる。
  - 既存スタックへの「上に重ねる / 下に重ねる」DnD
  - スタックの見た目（下カードほど左下、上カードほど右上）
  - 複数枚スタック時の「展開」ボタンと展開モーダル
  - 展開モーダルから他ゾーンへのドラッグ移動
  - 単枚スタック時のホバー拡大（枠外表示）

## 1. 実装方針
- 既存データ構造 `stack.cardIds` をそのまま利用。
- 並び規約を明示:
  - `cardIds` の末尾を「上（top）」
  - `cardIds` の先頭を「下（bottom）」
- DnDの意図解決とmutationを拡張し、`edge` 指定でスタック上下へ挿入。
- UIは既存の山札挿入UI/手札ホバー拡大の実装パターンを再利用。

## 2. 変更ファイル
- `src/interaction/dnd/buildDragPayload.js`
- `src/interaction/dnd/constants.js`
- `src/interaction/dnd/resolveDropIntent.js`
- `src/interaction/dnd/applyDropMutation.js`
- `src/interaction/dnd/__tests__/resolveDropIntent.test.js`
- `src/interaction/dnd/__tests__/applyDropMutation.test.js`
- `src/components/PlayingField.js`
- `src/components/Pokemon.js`
- `src/css/playingField.module.css`
- `src/components/__tests__/PlayingFieldLayout.test.js`

## 3. 実装内容

### 3.1 DnD payload / action拡張
- `buildCardDragPayload()` に `sourceStackKind` / `sourceBenchIndex` を追加。
- 新アクションを追加:
  - `move-card-to-stack-edge`
- `resolveDropIntent()` 拡張:
  - `sourceZone: player-stack` を許可。
  - `zoneKind: active|bench` かつ `edge: top|bottom` のドロップを受理。
  - 受理時に `move-card-to-stack-edge` を返す。

### 3.2 mutation拡張
- `takeCardRefFromSource()` に `player-stack` 由来取り出しを追加。
  - 指定スタックから `cardId` を除去。
  - スタックが空になったら `active=null` または `bench[index]=null`。
- `moveCardToStackEdge()` 新規追加。
  - target stack の `top` は `push`, `bottom` は `unshift`。
- 既存フロー（`move-card-from-hand-to-zone`, `move-card-to-deck-edge`）に
  `sourceStackKind/sourceBenchIndex` を伝搬。

### 3.3 UI拡張（PlayingField）
- バトル場/ベンチの occupied stack に、ドラッグ中のみ
  2分割ドロップターゲットを表示。
  - 左: `下に重ねる`（青系）
  - 右: `上に重ねる`（赤系）
- 複数枚 stack に `展開` ボタンを追加。
- `StackCardsModal` を新規追加。
  - ドラッグ移動可能（位置リセットあり）
  - 1行10枚で折返し
  - カードホバー拡大
  - 自分側 stack はドラッグ移動可、相手側 stack は閲覧のみ
- 単枚 stack にホバー拡大スタイルを追加。

### 3.4 スタック見た目（Pokemon）
- スタック描画のずらし方を変更。
  - 下カードほど左下、上カードほど右上
  - 上カードが前面になる `z-index` に調整

## 4. テスト追加/更新
- `resolveDropIntent.test.js`
  - occupied active/bench への stack edge drop 受理
  - 存在しないstackへの edge drop 拒否
  - `player-stack` source の受理
- `applyDropMutation.test.js`
  - active/bench の top/bottom への挿入
  - `player-stack` 由来カードを discard へ移動
- `PlayingFieldLayout.test.js`
  - 複数枚activeで `展開` ボタン表示
  - 展開モーダル表示
  - top-first順表示の確認

## 5. 実行コマンドと結果

### 5.1 初回検証
```bash
npm test -- --watch=false --runInBand src/interaction/dnd/__tests__/resolveDropIntent.test.js
```
- PASS（18 tests）

```bash
npm test -- --watch=false --runInBand src/interaction/dnd/__tests__/applyDropMutation.test.js
```
- FAIL
- 原因: `moveCardFromSourceToZone` で `sourceCardRef` 参照前に代入が欠落

### 5.2 修正後検証
```bash
npm test -- --watch=false --runInBand src/interaction/dnd/__tests__/resolveDropIntent.test.js src/interaction/dnd/__tests__/applyDropMutation.test.js src/components/__tests__/PlayingFieldLayout.test.js
```
- PASS（3 suites / 61 tests）

```bash
npm run build
```
- PASS（Compiled successfully）
- 既知warningのみ:
  - `caniuse-lite is outdated`
  - `babel-preset-react-app` 依存warning

## 6. 失敗と是正（抜粋）
- 失敗1: `sourceCardRef is not defined` が複数ケースで発生。
  - 対応: `moveCardFromSourceToZone` と `moveCardToDeckEdge` で
    `const sourceCardRef = takeCardRefFromSource(...)` を保持。
- 失敗2: `moveCardToStackEdge` 内で `sourceCardRef` 未使用 warning。
  - 対応: 代入を除去して `takeCardRefFromSource(...)` 呼び出しのみへ修正。

## 7. 完了判定
- OP-C01 実装要件（重ねる、上下挿入、見た目、展開モーダル、展開モーダル経由移動）を満たす実装を反映。
- 追加/更新テストおよび対象ビルドは通過。

## 8. 追補実装（UI改善）

### 8.1 対応背景
- 追加要望として以下を反映。
  - 「下に重ねる / 上に重ねる」ドロップゾーンの当たり判定横幅を拡張。
  - スタック表示のずらし幅を拡大。
  - 「展開」モーダルの初期表示位置を、対象スタック直上（一部重なる位置）へ寄せる。
  - プレイマット上ベンチ表記を `ベンチ1..5` に統一。
  - 単枚スタック（自分側バトル場/ベンチ）でも、ホバー拡大を維持しつつ緑枠表示でドラッグ可能にする。

### 8.2 変更内容
- `src/css/playingField.module.css`
  - `.stackInsertTargets` を左右へ拡張（`inset-inline: -22px`）し、カード外側まで当たり判定を広げた。
  - 単枚スタック用に `.stackSingleCardDraggable` / `.stackSingleCardButton` を追加。
    - ホバー・フォーカス時に緑枠を表示。
    - 既存のホバー拡大（scale=5）と併用可能な z-index を付与。
- `src/components/Pokemon.js`
  - 重なりオフセットを `5px -> 10px` へ拡張し、スタックのずらし幅を増加。
- `src/components/PlayingField.js`
  - スタック展開モーダル `StackCardsModal` に `initialAnchorRect` を導入。
  - 初回表示時は `sourceZoneId` から取得した矩形を基準に、スタック直上へ自動配置。
  - ユーザーがモーダルをドラッグ移動した後は手動位置を優先。
  - 「位置をリセット」で再度アンカー位置へ戻る挙動に変更。
  - ベンチ空スロット文言を `ベンチ{index+1}` で表示。

### 8.3 実行コマンド
```bash
npm test -- --watch=false --runInBand src/interaction/dnd/__tests__/resolveDropIntent.test.js src/interaction/dnd/__tests__/applyDropMutation.test.js src/components/__tests__/PlayingFieldLayout.test.js
```
- PASS（3 suites / 61 tests）

```bash
npm run build
```
- PASS（Compiled successfully）
- 既知warning:
  - `caniuse-lite is outdated`
  - CRA系 `babel-preset-react-app` 依存warning


## 9. 追加バグ修正（単枚スタックの右ズレ）

### 9.1 事象
- ベンチ/バトル場でカードが1枚のとき、カード表示が右方向へ大きくずれる。
- 同条件でホバー拡大時の表示位置も破綻する。

### 9.2 原因
- 単枚ドラッグ対応で `Pokemon` コンポーネント（内部が `div` 構造）を `button` でラップしていた。
- `button` の内容モデルと相性の悪いネストになり、ブラウザ補正によりレイアウトが不安定化していた。

### 9.3 対応
- `src/components/PlayingField.js`
  - 単枚スタック描画のラッパーを `button` から `div` に変更。
  - ドラッグ可能性は `DraggableCard` 側で維持。
- `src/css/playingField.module.css`
  - 単枚スタックの緑枠表示トリガーを `DraggableCard` の hover/focus-within ベースへ移行。
  - `.stackSingleCardDraggable` を `inline-grid` + `cursor: grab` とし、カード本体の幅で安定表示するよう修正。

### 9.4 検証
```bash
npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
```
- PASS（1 suite / 29 tests）

```bash
npm run build
```
- PASS（Compiled successfully）


## 10. 追加バグ修正（バトル場右寄り / 単枚ベンチ拡大時の白縁）

### 10.1 事象
- バトル場（単枚・複数枚とも）で、カード表示が横方向中央から右へ寄って見える。
- ベンチ単枚時のみ、ホバー拡大したカードに白い縁取りのような見え方が出る。

### 10.2 原因
- スタック描画オフセットが「右上方向への加算のみ」だったため、スタック全体の重心が右へ偏っていた。
- 単枚ベンチの緑枠表現で使っていたラッパーの境界/余白が、拡大表示時に視覚ノイズとして出ていた。

### 10.3 対応
- `src/components/Pokemon.js`
  - スタック横方向オフセットを中心補正付きへ変更。
  - 変更前: `x = index * offset`
  - 変更後: `x = index * offset - ((images.length - 1) * offset) / 2`
  - これにより、上に重なるほど右上へ寄る見た目を維持しつつ、スタック全体は中央配置される。
- `src/css/playingField.module.css`
  - `.stackSingleCardButton` の border/padding を撤廃し、`outline` ベースの緑枠に変更。
  - 単枚時の拡大表示に干渉する余白/境界の描画を除去。

### 10.4 検証
```bash
npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
```
- PASS（1 suite / 29 tests）

```bash
npm run build
```
- PASS（Compiled successfully）


## 11. 追加バグ修正（バトル場単枚ホバー時の左側空白 / 右寄り残り）

### 11.1 事象
- バトル場で単枚カードをホバー拡大すると、左側に透明な四角い空間が見える。
- バトル場で単枚/複数枚とも右寄りに見えるケースが残る。
- ベンチ単枚ホバー時にも同系統の白背景ノイズが残る。

### 11.2 原因
- `src/css/pokemon.css` の `.pokemon-image` が `position: absolute` だが、`top/left` 未指定だった。
- そのため絶対配置の起点が文脈依存となり、環境によって画像が右へオフセットされ、拡大時に左側空白（背景透過部）が見えていた。

### 11.3 対応
- `src/css/pokemon.css`
  - `.pokemon-image` に `top: 0; left: 0; display: block;` を追加。
  - 画像の配置起点を固定し、単枚/複数枚/拡大時で同一基準に統一。

### 11.4 検証
```bash
npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
```
- PASS（1 suite / 29 tests）

```bash
npm run build
```
- PASS（Compiled successfully）


## 12. 追加バグ修正（単枚ホバー時の白背景ノイズ / 公開エリアより背面）

### 12.1 事象
- ベンチ/バトル場で単枚カードをホバー拡大したとき、白い四角背景が見える。
- バトル場単枚の拡大画像が「公開エリア（自分）」より背面に回る。

### 12.2 原因
- 単枚ホバー時の拡大対象が `.pokemon-card`（コンテナ）だったため、周辺レイヤーと干渉しやすかった。
- さらに、バトル場/ベンチ側と公開エリア側の stacking order の関係で、拡大時に公開エリアが前面になっていた。

### 12.3 対応
- `src/css/playingField.module.css`
  - 単枚ホバー時の拡大対象を `.pokemon-card` から `.pokemon-image:last-child` に変更。
  - ホバー中の拡大画像に高い `z-index` を付与。
  - `.battleLineActive:hover` / `.battleLineActive:focus-within` を前面化。
  - `.benchSlot` を `position: relative` 化し、ホバー/フォーカス中に前面化。

### 12.4 検証
```bash
npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
```
- PASS（1 suite / 29 tests）

```bash
npm run build
```
- PASS（Compiled successfully）


## 13. 追加バグ修正（単枚ホバー拡大が効かない）

### 13.1 事象
- ベンチ/バトル場で単枚カードにホバーしても拡大表示されない。

### 13.2 原因
- 単枚ホバー拡大対象を `.pokemon-image` に変更した後、`Pokemon.js` 側で画像に `transform` をインライン指定していた。
- インライン `transform` が CSS 側のホバー `transform` を上書きし、拡大が無効化されていた。

### 13.3 対応
- `src/components/Pokemon.js`
  - 画像位置指定を `transform` 直指定から CSS変数（`--pokemon-image-shift-x/y`）へ変更。
- `src/css/pokemon.css`
  - `.pokemon-image` の `transform` を CSS変数合成方式へ変更。
  - `--pokemon-image-hover-lift` / `--pokemon-image-scale` を導入。
- `src/css/playingField.module.css`
  - 単枚ホバー時は `transform` を直接指定せず、上記変数を更新する方式へ変更。

### 13.4 検証
```bash
npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
```
- PASS（1 suite / 29 tests）

```bash
npm run build
```
- PASS（Compiled successfully）


## 14. 追加バグ修正（単枚ホバー時の白背景枠が残る）

### 14.1 事象
- ベンチ/バトル場の単枚ホバー拡大で、白い四角背景が残る。

### 14.2 原因
- ポケモン公式画像（JPG）には外周に白マージンが含まれている。
- 手札/モーダル系は背景が白系のため目立ちにくいが、プレイマット上（緑背景）では単枚拡大時に白枠として顕在化していた。

### 14.3 対応
- `src/css/pokemon.css`
  - `.pokemon-image` に外周トリム用 `clip-path` を追加。
  - `--pokemon-image-trim-y: 1.2%`, `--pokemon-image-trim-x: 1.6%` を導入し、画像外周の白マージンを軽くカット。

### 14.4 検証
```bash
npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
```
- PASS（1 suite / 29 tests）

```bash
npm run build
```
- PASS（Compiled successfully）


## 15. 追加調整（トリム過多の是正）

### 15.1 事象
- 白背景枠対策のトリムを常時適用した結果、通常表示/重ね表示まで外周が削れ、不自然になった。

### 15.2 原因
- `clip-path` の inset トリムが全状態で有効だったため、ホバー拡大以外にも影響していた。

### 15.3 対応
- `src/css/pokemon.css`
  - 通常状態はトリムなし（`--pokemon-image-clip: inset(0 0 0 0 round ...)`）へ戻した。
  - 角丸は維持。
- `src/css/playingField.module.css`
  - 単枚ホバー拡大時のみ、軽微なトリムを適用するよう変更。
  - `--pokemon-image-clip: inset(0.35% 0.55% 0.35% 0.55% round ...)`

### 15.4 検証
```bash
npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
```
- PASS（1 suite / 29 tests）

```bash
npm run build
```
- PASS（Compiled successfully）


## 16. 方針修正（トリム依存の撤廃）

### 16.1 背景
- 「外周トリムで白枠を抑える」方式は、通常表示の見た目劣化を招くため不適切。
- 本質対処として、単枚拡大の描画をトリムなし前提へ戻し、手札/モーダルと同じ原則（画像そのものの transform）に統一する。

### 16.2 対応
- `src/css/pokemon.css`
  - `--pokemon-image-clip` と `clip-path` を削除。
  - 画像外周の強制トリムを廃止。
- `src/css/playingField.module.css`
  - 単枚ホバー時の `--pokemon-image-clip` 指定を削除。
  - 単枚拡大は `--pokemon-image-hover-lift` / `--pokemon-image-scale` のみで制御。

### 16.3 検証
```bash
npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
```
- PASS（1 suite / 29 tests）

```bash
npm run build
```
- PASS（Compiled successfully）


## 17. 追加UI修正（手札重なり時のz-index / 展開ボタンUX）

### 17.1 対応内容
- 手札トレイとベンチが重なる場合に、ベンチホバーが手札より前に出ないよう z-index を調整。
  - `.benchSlot:hover` を `z-index: 5` に変更（手札トレイ `--z-hand=30` より下）。
- バトル場ホバー前面化も過剰だったため、必要十分な値へ調整。
  - `.battleLineActive:hover` を `z-index: 6` に変更。
- `展開` ボタンの視認性改善。
  - `.stackExpandButton` に `margin-top: 4px` を追加し、カードとの間隔を確保。
- `展開` ボタンをトグル化。
  - モーダル表示中は該当ゾーンのボタン文言を `展開を閉じる` に変更。
  - 同ボタン押下でモーダルを閉じられるよう実装。
  - 対象: 自分/相手のバトル場、ベンチ各枠。

### 17.2 実装詳細
- `src/components/PlayingField.js`
  - `BenchRow` に `isStackModalForZone` / `onToggleStackCards` を追加。
  - `isStackModalForZone()` で「現在開いているモーダルがどのゾーンか」を判定。
  - `handleToggleStackCards()` で開閉をトグル。
  - バトル場/ベンチの `展開` ボタンをトグル文言・トグル動作へ変更。
- `src/css/playingField.module.css`
  - z-index 調整と `stackExpandButton` マージン追加。
- `src/components/__tests__/PlayingFieldLayout.test.js`
  - 既存スタック展開テストに、`展開を閉じる` トグル挙動の確認を追加。

### 17.3 検証
```bash
npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
```
- PASS（1 suite / 29 tests）

```bash
npm run build
```
- PASS（Compiled successfully）


## 18. 微調整（展開ボタンのカード間隔）

### 対応
- `src/css/playingField.module.css`
  - `.stackExpandButton` の `margin-top` を `4px -> 8px` に調整。
  - カード画像と展開ボタンの間隔を、山札アクションボタン群に近い体感へ寄せた。

### 検証
```bash
npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
```
- PASS（1 suite / 29 tests）


## 19. 追加修正（手札エリアへのドロップ当たり判定）

### 19.1 事象
- 他エリアから手札エリアへカードをドラッグした際、手札エリアの内部では赤ハイライト/ドロップが発生せず、外枠付近のみ反応する。

### 19.2 原因
- `useBoardDnd` の手札パネル遮蔽ガードが、`#hand-tray-panel` 内にポインタが入った時点で一律にドロップ判定をブロックしていた。
- その結果、手札エリア内部にカードが完全に入っているケースほど `resolveDropIntent` が走らず、赤ハイライトが消える状態になっていた。

### 19.3 対応
- `src/interaction/dnd/useBoardDnd.js`
  - 手札パネル内でカードドラッグ中は、`player-hand` へのドロップペイロードを優先解決する補正を追加。
  - 新規ヘルパーを追加:
    - `isHandZoneDropPayload(dropPayload)`
    - `resolveDropPayloadForHandTray({ dragPayload, dropPayload, isPointerInsideHandTray, playerId })`
  - `handleDragOver` / `handleDragMove` / `handleDragEnd` で共通に、イベントから補正済み `dropPayload` を解決するよう変更。
  - これにより、手札パネル内部では手札エリアが正しくハイライトされ、ドロップ可能になる。
- `src/interaction/dnd/__tests__/useBoardDnd.test.js`（新規）
  - 手札パネル補正ヘルパーのユニットテストを追加（強制 hand 解決、非カード時の据え置き、通常時の据え置き）。

### 19.4 検証
```bash
npm test -- --watch=false --runInBand src/interaction/dnd/__tests__/useBoardDnd.test.js src/interaction/dnd/__tests__/dropGuards.test.js
```
- PASS（2 suites / 10 tests）

```bash
npm test -- --watch=false --runInBand src/components/__tests__/PlayingFieldLayout.test.js
```
- PASS（1 suite / 29 tests）

```bash
npm run build
```
- PASS（Compiled successfully）


## 20. 追加UI修正（小道具ドラッグ中の見た目統一）

### 20.1 事象
- ダメカン / 状態異常バッヂをドラッグ中、小道具BOX内表示と比べて文言・配色・形状が別デザイン（赤ピル）になっていた。

### 20.2 原因
- `BoardDragOverlay` が小道具ドラッグ時に `dragOverlayTool`（専用赤スタイル）を描画しており、`toolboxItem` を再利用していなかった。

### 20.3 対応
- `src/components/dnd/BoardDragOverlay.js`
  - ダメカン/状態異常のドラッグオーバーレイを `toolboxItem` ベースに変更。
  - `data-tool-type` / `data-tool-value` を付与し、小道具BOXと同じ色分けルールを適用。
  - 状態異常の表示文言を小道具BOXと同じ日本語ラベル（どく/やけど/ねむり/マヒ/こんらん）に統一。
- `src/css/playingField.module.css`
  - オーバーレイ用補助クラス `dragOverlayToolboxItem` を追加（掴み中カーソル + 影）。
- `src/components/dnd/__tests__/BoardDragOverlay.test.js`（新規）
  - ダメカン/状態異常のドラッグ表示が `toolboxItem` を利用し、期待ラベル/属性を持つことを検証。

### 20.4 検証
```bash
npm test -- --watch=false --runInBand src/components/dnd/__tests__/BoardDragOverlay.test.js src/components/__tests__/PlayingFieldLayout.test.js
```
- PASS

```bash
npm run build
```
- PASS（Compiled successfully）

### 20.5 途中失敗と是正
- 初回の `BoardDragOverlay.test.js` 実行時、`DragOverlay` がテスト環境で空描画となり要素取得に失敗（FAIL）。
- `src/components/dnd/__tests__/BoardDragOverlay.test.js` で `@dnd-kit/core` の `DragOverlay` を passthrough モック化して再実行。
- 再実行後は PASS（2 suites / 31 tests）。
