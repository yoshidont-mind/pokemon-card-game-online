# 実装ログ: Phase 03 盤面UI再設計（紙寄せ）

作成日: 2026-02-18（JST）
対象手順書: `references/implementation_plans/260218_phase03_board_ui_relayout.md`

> ルール:
> - 秘匿情報は記録しない
> - ターミナル出力は本ファイル内に直接記録する
> - 失敗した試行も省略しない

## 進捗サマリ

- [x] 事前準備（環境確認・ブランチ作成・ベースライン）
- [x] Step 1: 現行UI棚卸しとギャップ定義
- [x] Step 2: レイアウト骨格の再設計（DOM構造）
- [x] Step 3: デザイントークン導入
- [x] Step 4: 盤面ゾーン配置（紙寄せ）
- [x] Step 5: 手札トレイ（浮遊 + トグル）
- [x] Step 6: 小道具BOX（折りたたみ）
- [x] Step 7: カード裏面アセット統一検証
- [x] Step 8: アクセシビリティ最終化
- [x] Step 9: 自動テスト追加
- [x] Step 10: 手動検証
- [x] Step 11: ドキュメント更新

---

## 1. 事前準備

### 実行コマンド/出力

```bash
$ git status --short && git branch --show-current
?? references/implementation_logs/260218_phase03_board_ui_relayout.md
?? references/implementation_plans/260218_phase03_board_ui_relayout.md
main

$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && node -v && npm -v && command -v git rg node npm
v20.19.6
10.8.2
/usr/bin/git
/Users/yoshidont_mind/.nvm/versions/node/v18.20.7/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/path/rg
/Users/yoshidont_mind/.nvm/versions/node/v20.19.6/bin/node
/Users/yoshidont_mind/.nvm/versions/node/v20.19.6/bin/npm

$ git checkout -b feature/260218-phase03-board-ui-relayout
Switched to a new branch 'feature/260218-phase03-board-ui-relayout'

$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && CI=true npm test -- --watch=false
> pokemon_card_game_online@0.1.0 test
> react-scripts test --watch=false
PASS src/game-state/__tests__/migrateV1ToV2.test.js
PASS src/game-state/__tests__/invariants.test.js
PASS src/App.test.js
Test Suites: 3 passed, 3 total
Tests:       7 passed, 7 total

$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && npm run build
> pokemon_card_game_online@0.1.0 build
> react-scripts build
Compiled successfully.
```

### 既知warning（失敗ではない）

- CRA 由来 warning
  - `@babel/plugin-proposal-private-property-in-object` notice
  - `caniuse-lite` outdated notice

判定: Pass

---

## 2. 次ステップ

- Step 1: 現行 `PlayingField` のゾーン棚卸しと参照画像との対応表を作成する

## 3. Step 1 実施（現行UI棚卸しとギャップ定義）

### 実行コマンド/出力

```bash
$ rg -n "トラッシュ|山札|ベンチ|バトルポケモン|サイド|ロスト|スタジアム|手札" src/components/PlayingField.js
58:トラッシュ（相手）
63:山札（相手）
67:ベンチ（相手）
73:バトルポケモン（相手）
77:サイド（相手）
93:手札
130:サイド
138:バトルポケモン（自分）
166:トラッシュ
169:ロスト

$ rg -n "\\.deck|\\.discardPile|\\.stadium|\\.prizeCards|\\.activeSpot|\\.bench|\\.hand|grid|z-index|position" src/css/playingField.module.css src/css/style.css src/css/pokemon.css
src/css/playingField.module.css:11:.deck, .discardPile, .stadium, .prizeCards, .activeSpot, .bench, .hand, .message {
src/css/playingField.module.css:24:.activeSpot { position: relative; }
src/css/style.css:7:    z-index: 1;
src/css/pokemon.css:22:    z-index: 10;
```

### 棚卸し結果（要約）

- 現行は Bootstrap の `row/col` ベースで、紙プレイのゾーン相対位置を厳密に表現しづらい構造
- 手札は左カラムに常時表示で、要件「浮遊 + トグル」と不一致
- 小道具BOXは未実装
- 裏面画像は `card-back.jpg` 参照済み（`PlayingField` 単体では要件適合）
- `data-zone` / `data-drop-group` がなく、次Phase（DnD）向けのフックが未整備

### 参照画像との主なギャップ

1. 相手/自分のゾーン塊は存在するが、中央の主戦場導線が弱い
2. 手札が「手に持つ」見た目になっていない
3. 盤面外周の補助UI（小道具）が存在しない

判定: Pass（ギャップ定義完了）

## 4. Step 2〜4 実施（DOM再設計 + トークン導入 + 盤面グリッド化）

### 変更内容

- 追加: `src/css/boardLayout.tokens.css`
  - 盤面サイズ、カードサイズ、z-index、配色のトークンを定義
- 更新: `src/components/PlayingField.js`
  - `row/col` 主体から、ゾーン意図主体の構造へ変更
  - `data-zone` / `data-drop-group` を全主要ゾーンに付与
  - 相手/自分/中央（スタジアム）を明確分離
  - ベンチ5スロット固定表示（空スロットはプレースホルダ）
- 更新: `src/css/playingField.module.css`
  - CSS Grid ベースの盤面配置
  - ゾーンタイル共通スタイル化
  - 手札インラインパネル（暫定）を追加
- 更新: `src/components/PlayingFieldTest.js`
  - プレースホルダ文言から、実コンポーネント表示へ変更

### 実行コマンド/出力

```bash
$ source ~/.nvm/nvm.sh && nvm use 20.19.6 >/dev/null && CI=true npm test -- --watch=false && npm run build
PASS src/game-state/__tests__/invariants.test.js
PASS src/game-state/__tests__/migrateV1ToV2.test.js
PASS src/App.test.js
Test Suites: 3 passed, 3 total
Tests:       7 passed, 7 total
Compiled successfully.
```

### 既知warning（失敗ではない）

- CRA 由来 warning
  - `@babel/plugin-proposal-private-property-in-object` notice
  - `caniuse-lite` outdated notice

判定: Pass

## 5. Step 5〜6 実施（手札トレイ + 小道具BOX）

### 変更内容

- 追加: `src/components/HandTray.js`
  - 浮遊手札トレイを実装
  - `aria-expanded` / `aria-controls` を付与したトグル
  - 折りたたみ時は「手札を開く（n枚）」、展開時は画像一覧を水平スクロール表示
- 追加: `src/components/ToolboxPanel.js`
  - 右下ドッキングの折りたたみパネルを実装
  - ダメカン（10/20/30/50/100）と状態異常（どく/やけど/ねむり/マヒ/こんらん）を静的表示
  - 各アイテムに `data-tool-type` / `data-tool-value` を付与
- 更新: `src/components/PlayingField.js`
  - `HandTray` / `ToolboxPanel` を組み込み
  - 開閉状態を `useState` で管理
- 更新: `src/css/playingField.module.css`
  - 手札トレイ、小道具BOX、トグルボタンのスタイルを追加

### 実行コマンド/出力

```bash
$ rg -n "HandTray|ToolboxPanel|aria-expanded|aria-controls|data-tool-type" src/components src/css
src/components/HandTray.js:... (該当あり)
src/components/ToolboxPanel.js:... (該当あり)
src/components/PlayingField.js:... (該当あり)
src/css/playingField.module.css:... (該当あり)
```

判定: Pass

---

## 6. Step 7 実施（カード裏面アセット統一）

### 実行コマンド/出力

```bash
$ rg -n "card-back\.svg|card-back\.jpg" src public
src/components/__tests__/PlayingFieldLayout.test.js:108:test('deck back image uses card-back.jpg', () => {
src/components/__tests__/PlayingFieldLayout.test.js:112:  expect(playerDeckImage.getAttribute('src')).toContain('card-back.jpg');
src/components/PlayingField.js:10:const CARD_BACK_IMAGE = '/card-back.jpg';
```

結果:
- `src` 配下の `card-back.svg` 参照は 0 件
- `card-back.jpg` 参照のみ

判定: Pass

---

## 7. Step 8 実施（アクセシビリティ最終化）

### 実行コマンド/出力

```bash
$ rg -n "focus-visible|prefers-reduced-motion|aria-expanded|aria-controls" src/css src/components
src/css/playingField.module.css:153:.panelToggle:focus-visible {
src/css/playingField.module.css:250:.toolboxItem:focus-visible {
src/css/playingField.module.css:261:@media (prefers-reduced-motion: reduce) {
src/components/HandTray.js:15:        aria-expanded={isOpen}
src/components/HandTray.js:16:        aria-controls={HAND_TRAY_PANEL_ID}
src/components/ToolboxPanel.js:21:        aria-expanded={isOpen}
src/components/ToolboxPanel.js:22:        aria-controls={TOOLBOX_PANEL_ID}
```

判定: Pass

---

## 8. Step 9 実施（自動テスト追加 + 修正履歴）

### 追加/更新

- 追加: `src/components/__tests__/PlayingFieldLayout.test.js`
  - 手札トグル開閉 (`aria-expanded` 切替)
  - 小道具BOX開閉 (`aria-expanded` 切替 + アイテム表示)
  - 裏面画像が `card-back.jpg` であること

### 失敗試行 1

```bash
$ CI=true npm test -- --watch=false
FAIL src/components/__tests__/PlayingFieldLayout.test.js
TypeError: _userEvent.default.setup is not a function
```

原因:
- `@testing-library/user-event` v13 環境で `userEvent.setup()` を使用していた。

修正:
- `userEvent.setup()` をやめ、`fireEvent` / `waitFor` ベースへ変更。

### 失敗試行 2

```bash
$ CI=true npm test -- --watch=false
FAIL src/components/__tests__/PlayingFieldLayout.test.js
Found multiple elements with the role "button" and name `/ダメカン 10/i`
```

原因:
- 正規表現 `/ダメカン 10/i` が `ダメカン 100` も部分一致した。

修正:
- 完全一致 `^ダメカン 10$` / `^状態異常 どく$` に変更。

### 最終再検証

```bash
$ CI=true npm test -- --watch=false
PASS src/game-state/__tests__/migrateV1ToV2.test.js
PASS src/game-state/__tests__/invariants.test.js
PASS src/App.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
Test Suites: 4 passed, 4 total
Tests:       10 passed, 10 total

$ npm run build
Compiled successfully.
```

既知warning（失敗ではない）:
- CRA 由来 warning
  - `@babel/plugin-proposal-private-property-in-object` notice
  - `caniuse-lite` outdated notice
- React Testing Library / React 18 の `act` deprecation warning（既存依存由来）

判定: Pass

---

## 9. Step 11 実施（ドキュメント更新）

### 変更内容

- 更新: `README.md`
  - `盤面UI（Phase 03 時点）` セクションを追加
  - 盤面構成、手札トレイ、小道具BOX、`card-back.jpg` 統一を明記
  - TODO の `PlayingFieldTest` 記述を現状に合わせて更新

### 実行コマンド/出力

```bash
$ git status --short
M README.md
M src/components/PlayingField.js
M src/components/PlayingFieldTest.js
M src/css/playingField.module.css
M references/implementation_logs/260218_phase03_board_ui_relayout.md
?? src/components/HandTray.js
?? src/components/ToolboxPanel.js
?? src/components/__tests__/PlayingFieldLayout.test.js
?? src/css/boardLayout.tokens.css
```

判定: Pass

---

## 10. Step 10（手動検証）

状態: Pending（ユーザー実機確認待ち）

ユーザーに依頼する確認項目:
1. `/home` からセッション作成し盤面表示まで進める
2. 手札トレイの開閉を3回実施
3. 小道具BOXの開閉を3回実施
4. 盤面中心（バトル場）の視認性が維持されること
5. 裏向きカードが `card-back.jpg` で表示されること


---

## 11. Step 10 更新（ユーザー手動検証結果）

ユーザー確認結果:
- 「全て基本的にはOK」
- 追加要望:
  1. 手札カードが小さく文言が読みにくいので、ホバー/クリック等で拡大表示したい
  2. ダメカン種類は `10/50/100` を標準採用したい
  3. ダメカン・状態異常バッヂを色分けしたい（紙版標準寄せ）

判定:
- Step 10 は一旦 Pass（基礎UIは要求を満たす）
- 追加要望を同フェーズ内の改善として即時実装

---

## 12. 追加改善（ユーザーフィードバック反映）

### 変更内容

- 更新: `src/components/HandTray.js`
  - ホバー/フォーカスで拡大プレビューを表示
  - クリックで拡大カードを固定（再クリックで解除）
  - `aria-pressed` を付与しキーボード操作時の状態を明示
- 更新: `src/components/ToolboxPanel.js`
  - ダメカン種類を `10/50/100` の3種に変更
- 更新: `src/css/playingField.module.css`
  - 手札プレビュー領域とカード強調スタイルを追加
  - 小道具アイテムを色分け
    - ダメカン: 10=黄, 50=橙, 100=赤
    - 状態異常: どく=紫, やけど=赤, ねむり=水色, マヒ=黄, こんらん=青紫
- 更新: `src/components/__tests__/PlayingFieldLayout.test.js`
  - 手札拡大プレビュー表示のテストを追加
  - ダメカン `10/50/100` 存在、および `20` 非存在を検証

### 実行コマンド/出力

```bash
$ CI=true npm test -- --watch=false
PASS src/game-state/__tests__/migrateV1ToV2.test.js
PASS src/game-state/__tests__/invariants.test.js
PASS src/App.test.js
PASS src/components/__tests__/PlayingFieldLayout.test.js
Test Suites: 4 passed, 4 total
Tests:       11 passed, 11 total

$ npm run build
Compiled successfully.
```

既知warning（失敗ではない）:
- CRA 由来 warning
  - `@babel/plugin-proposal-private-property-in-object` notice
  - `caniuse-lite` outdated notice
- React Testing Library / React 18 の `act` deprecation warning（既存依存由来）

判定: Pass
