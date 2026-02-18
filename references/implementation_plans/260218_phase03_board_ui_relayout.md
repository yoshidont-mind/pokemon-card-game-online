# Phase 03 実装手順書: 盤面UI再設計（紙寄せ）

作成日: 2026-02-18（JST）  
対象リポジトリ: `pokemon-card-game-online`  
対象フェーズ: `references/documents/260218_4_full_implementation_roadmap.md` の Phase 03  
ステータス: Draft（実装前）

---

## 1. 背景/目的

Phase 03 の目的は、現行の「機能はあるが紙対戦の体験と乖離が大きい盤面UI」を、紙のポケカに慣れたプレイヤーが迷わず使える配置へ再設計すること。

このフェーズで達成すること:

- 盤面ゾーンを紙プレイに近い視覚配置へ再編する
- カード裏面画像を `card-back.jpg` に統一する
- 手札を「画面上で浮く」トグル型UIへ変更する
- 小道具BOX（ダメカン・状態異常バッヂ）を折りたたみ/展開可能にする

ロードマップにおける Exit Criteria（Phase 03）:

- [ ] ゾーン配置が参照画像に概ね整合（レビュー合意あり）
- [ ] 裏面画像が `card-back.jpg` へ統一されている
- [ ] 手札トグルと小道具BOXトグルが安定動作する

参照画像:

- `references/images/placement.png`
- `references/images/placement_2.jpeg`

---

## 2. 公式一次情報（2026-02-18確認）

本手順書は以下の公式情報を基準とする（実装時は再確認すること）。

1. React docs: Conditional Rendering  
   https://react.dev/learn/conditional-rendering
2. React docs: Render and Commit（状態更新タイミング）  
   https://react.dev/learn/render-and-commit
3. MDN: CSS Grid Layout guide  
   https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout
4. MDN: `position`  
   https://developer.mozilla.org/en-US/docs/Web/CSS/position
5. MDN: `z-index`  
   https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/z-index
6. MDN: `aspect-ratio`  
   https://developer.mozilla.org/en-US/docs/Web/CSS/aspect-ratio
7. MDN: `clamp()`  
   https://developer.mozilla.org/en-US/docs/Web/CSS/clamp
8. MDN: accessibility向け media queries（`prefers-reduced-motion`）  
   https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Using_for_accessibility
9. WAI-ARIA APG: Disclosure pattern（開閉UIのアクセシビリティ）  
   https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
10. React-Bootstrap: Offcanvas（代替案として使用時のみ）  
    https://react-bootstrap.netlify.app/docs/components/offcanvas/

備考:

- 本プロジェクトは CRA + React 18 系で運用中。React 19 機能には移行しない（Phase 03 では不要）。
- Phase 03 の要件達成には Firebase Console でのGUI作業は不要。

---

## 3. スコープ

### 3.1 In Scope

- `PlayingField` のDOM構造再設計（紙プレイ寄せレイアウト）
- 盤面ゾーンの見た目・配置・余白・視線誘導の改善
- 手札の浮遊パネル化 + トグル（最小化/展開）
- 小道具BOXの折りたたみUI
- カード裏面アセット参照の統一確認
- 上記UIに対する最低限の自動テスト/手動テスト

### 3.2 Out of Scope

- DnD実装（Phase 04で実施）
- 81操作実装（Phase 05/06で実施）
- 盤面操作ロジックの大規模変更
- モバイル最適化の完成（将来対応。Phase 03はPC優先）

---

## 4. 実装方針（固定）

### 4.1 レイアウト方針

- PCファーストで `PlayingField` を再構築する
- 盤面は CSS Grid を主軸にする（ゾーンの相対位置を明示化）
- 参照画像の「上:相手領域 / 中央:バトル場 / 下:自分領域」を維持する

### 4.2 UI制御方針

- 手札と小道具BOXは Disclosure パターンに従う
- 開閉ボタンに `aria-expanded`, `aria-controls` を付与する
- トグル状態は React state で管理し、URLやDBには保存しない

### 4.3 視覚設計方針

- CSSカスタムプロパティ（デザイントークン）でサイズ・色・z-indexを統一管理する
- `aspect-ratio` でカード縦横比を固定し、`clamp()` で可変サイズ化する
- 動きは必要最低限。`prefers-reduced-motion` に対応する

---

## 5. 変更対象ファイル一覧（予定）

## 5.1 新規作成（予定）

- `src/components/HandTray.js`
- `src/components/ToolboxPanel.js`
- `src/components/__tests__/PlayingFieldLayout.test.js`
- `src/css/boardLayout.tokens.css`

## 5.2 既存更新（予定）

- `src/components/PlayingField.js`
- `src/components/Pokemon.js`（必要最小限、見た目調整のみ）
- `src/css/playingField.module.css`
- `src/css/pokemon.css`（重なりや表示優先度の微調整）
- `src/components/PlayingFieldTest.js`
- `README.md`（Phase 03 完了後にUI仕様追記）

## 5.3 現状確認対象（参照のみ）

- `public/card-back.jpg`
- `public/card-back.svg`
- `references/images/placement.png`
- `references/images/placement_2.jpeg`

---

## 6. 事前準備

## 6.1 コマンド前提確認

```bash
command -v git rg node npm
node -v
npm -v
```

確認基準:

- Node.js は `.nvmrc` 準拠（現在 `20.19.6`）
- `rg` が利用可能

## 6.2 作業ブランチ作成

```bash
git checkout -b feature/260218-phase03-board-ui-relayout
```

## 6.3 ベースライン検証

```bash
CI=true npm test -- --watch=false
npm run build
```

## 6.4 参照画像の現状確認

```bash
ls -la references/images/placement.png references/images/placement_2.jpeg
```

補足:

- 画像は実装中も常に参照し、ゾーン配置差分を目視確認する

---

## 7. Step by Step 実装手順

## Step 1. 現行UIの棚卸しとギャップ定義

### 目的

実装前に「何をどこまで変えるか」を定量化し、デザイン変更の迷走を防ぐ。

### 実施内容

1. `PlayingField.js` の現行DOM構造を読み、ゾーン一覧を抽出
2. 参照画像との対応表を作成（相手山札/サイド/トラッシュ/ベンチ/バトル場/自分各ゾーン）
3. 既存のUI課題を明文化
   - 手札が左下固定で「手持ち感」が弱い
   - 小道具BOXが未実装
   - セル配置が紙プレイの視線導線と一致しない

### 実行コマンド

```bash
rg -n "deck|discard|prize|bench|active|hand|lost|stadium" src/components/PlayingField.js
```

### 期待結果

- ゾーン対応表が作れる
- Phase 03 で触る範囲が明確になる

---

## Step 2. レイアウト骨格の再設計（DOM構造）

### 目的

CSSだけで無理に寄せるのではなく、DOM構造を「盤面意図」に合わせて整理する。

### 実施内容

1. `PlayingField` を以下ブロックで再構成
   - `boardRoot`
   - `opponentArea`
   - `centerArea`（中央ライン/バトル場）
   - `playerArea`
   - `floatingLayer`（手札トレイ + 小道具BOX）
2. 各ゾーンに `data-zone` を付与
   - 例: `data-zone="player-deck"`, `data-zone="opponent-prize"`
3. 後続Phase（DnD）を見据えて `data-drop-group` の土台属性を付与（実際のDnD実装はしない）

### 実行コマンド

```bash
rg -n "data-zone|data-drop-group" src/components/PlayingField.js
```

### 期待結果

- DOMがゾーン意味に沿った構造になる
- CSS Grid定義が単純化する

---

## Step 3. デザイントークン導入

### 目的

盤面サイズ・カードサイズ・z-index・色を一元管理し、UI調整のコストを下げる。

### 実施内容

1. `src/css/boardLayout.tokens.css` を作成
2. 以下トークンを定義
   - サイズ系: `--board-max-width`, `--card-w`, `--card-gap`, `--zone-padding`
   - レイヤー系: `--z-board`, `--z-hand`, `--z-toolbox`, `--z-overlay`
   - 色系: `--zone-bg`, `--zone-border`, `--accent-safe`, `--accent-danger`
3. `playingField.module.css` からハードコード値を置換
4. カード比率は `aspect-ratio`、サイズは `clamp()` で制御

### 実行コマンド

```bash
rg -n "--board|--card|--z-|clamp\(|aspect-ratio" src/css
```

### 期待結果

- サイズ調整がトークン変更だけで可能になる
- 画面解像度差での崩れが減る

---

## Step 4. 盤面ゾーン配置（紙寄せ）

### 目的

参照画像に近い配置へ合わせ、対戦時の認知負荷を下げる。

### 実施内容

1. `playingField.module.css` を CSS Grid 中心へ更新
2. 相手領域（上段）
   - 左: 山札/トラッシュ
   - 中央: ベンチ + バトル場
   - 右: サイド
3. 自分領域（下段）
   - 左: 山札/トラッシュ/ロスト
   - 中央: ベンチ + バトル場
   - 右: サイド/補助表示
4. ゾーン枠の見た目を統一（背景/枠線/角丸/内側余白）
5. `PlayingFieldTest` で構造確認しやすいプレースホルダを更新

### 実行コマンド

```bash
rg -n "grid-template|grid-area|opponentArea|playerArea|centerArea" src/css/playingField.module.css src/components/PlayingField.js
```

### 期待結果

- 上下対戦構図が紙プレイに近づく
- 主要ゾーンの位置が直感的になる

---

## Step 5. 手札トレイ（浮遊 + トグル）の実装

### 目的

「手に持っている」感覚をUIで再現し、盤面視認性を阻害しない手札表示にする。

### 実施内容

1. `HandTray` コンポーネント新規作成
2. 表示モード
   - `collapsed`: 小さなバー（手札枚数のみ）
   - `expanded`: カード一覧（重なり/扇型は簡易実装で可）
3. アクセシビリティ
   - トグルボタンに `type="button"`
   - `aria-expanded`, `aria-controls` を設定
   - キーボード操作（Enter/Space）で開閉可能
4. `z-index` は盤面より上だが通知より下を基本とする
5. PC前提で `position: fixed; bottom: ...;` を採用

### 実行コマンド

```bash
rg -n "HandTray|aria-expanded|aria-controls|isHandCollapsed" src/components
```

### 期待結果

- 手札の常時占有面積が減る
- いつでも1クリックで手札確認できる

---

## Step 6. 小道具BOX（折りたたみ）の実装

### 目的

ダメカン・状態異常バッヂを取り出すためのUI土台を提供する。

### 実施内容

1. `ToolboxPanel` コンポーネント新規作成
2. 表示内容（Phase 03では静的UIで可）
   - ダメカン候補（10/50/100等）
   - 状態異常バッヂ（どく/やけど/ねむり/マヒ/こんらん）
3. トグル開閉
   - 右側または左側にドッキング
   - 折りたたみ時は最小タブのみ表示
4. 将来Phase 04に備え、各アイテムに `data-tool-type` を付与

### 実行コマンド

```bash
rg -n "ToolboxPanel|data-tool-type|isToolboxOpen|status" src/components src/css
```

### 期待結果

- 小道具BOXが盤面外周で開閉できる
- 盤面の中心視認を妨げない

---

## Step 7. カード裏面アセット統一の検証

### 目的

`card-back.jpg` への統一を確実にし、画像混在による見た目差をなくす。

### 実施内容

1. `card-back.svg` 参照箇所を全検索
2. 参照があれば `card-back.jpg` へ置換
3. 実表示を確認（山札/サイドなど裏向きカードが該当）

### 実行コマンド

```bash
rg -n "card-back\.svg|card-back\.jpg" src public
```

### 期待結果

- `src` 配下で `card-back.svg` 参照が0件
- `card-back.jpg` 参照のみ残る

---

## Step 8. 視覚ノイズ制御とアクセシビリティ最終化

### 目的

使いやすさを落とさず、操作時の迷いを減らす。

### 実施内容

1. フォーカス可視化（`:focus-visible`）を追加
2. `prefers-reduced-motion` 時はアニメーションを抑制
3. 開閉コンポーネントがスクリーンリーダーで状態把握できるか確認
4. コントラストが低すぎる配色を回避

### 実行コマンド

```bash
rg -n "focus-visible|prefers-reduced-motion|aria-expanded|aria-controls" src/css src/components
```

### 期待結果

- キーボード操作が可能
- 開閉状態が属性で明示される

---

## Step 9. 自動テスト追加

### 目的

トグルUI回りの退行を防止する。

### 実施内容

1. `PlayingFieldLayout.test.js` を追加
2. 検証観点
   - 手札トレイの開閉で `aria-expanded` が切り替わる
   - 小道具BOXの開閉が機能する
   - カード裏面画像パスが `card-back.jpg` である
3. 既存テストと合わせて実行

### 実行コマンド

```bash
CI=true npm test -- --watch=false
npm run build
```

### 期待結果

- テストが通る
- ビルドが通る

---

## Step 10. 手動検証（UIレビュー）

### 目的

参照画像との整合・実プレイの直感性を最終確認する。

### 実施内容

1. `npm start` でローカル起動
2. セッション作成→デッキ保存→盤面表示
3. 以下を確認
   - ゾーン配置が参照画像に概ね一致
   - 手札トレイが浮遊表示/最小化できる
   - 小道具BOXが開閉できる
   - 盤面中心（バトル場）が視線の主点になる

### 実行コマンド

```bash
npm start
```

### 期待結果

- Phase 03の3つの Exit Criteria を満たす

---

## Step 11. ドキュメント更新

### 目的

実装と仕様・運用情報を一致させる。

### 実施内容

1. `README.md` に盤面UI変更点を反映
2. 必要に応じてロードマップの進捗注記を更新
3. 実装ログにコマンド/結果/失敗試行を記録

### 実行コマンド

```bash
git status --short
```

### 期待結果

- 実装内容と文書が一致
- 次フェーズ（Phase 04）に渡せる

---

## 8. テスト手順（詳細）

## 8.1 自動テスト

実行:

```bash
CI=true npm test -- --watch=false
npm run build
```

判定:

- `PASS` で終了
- ビルドエラーなし

## 8.2 手動テスト（必須）

テスト環境:

- Chrome 最新版（macOS）
- 画面幅: 1366px, 1920px

シナリオ:

1. セッションを作成し、盤面表示まで進む
2. 手札トグルを開閉する（3回）
3. 小道具BOXを開閉する（3回）
4. 開閉中に盤面の主要ゾーンが隠れすぎないことを確認
5. 裏向きカードが `card-back.jpg` で描画されることを確認

判定:

- UI崩れ、重なり競合、クリック不能がない

## 8.3 異常系テスト

- 手札0枚時でも手札トレイが開閉可能
- 小道具BOXが閉じた状態で再描画しても開閉不能にならない
- 低解像度幅で最低限の可読性（横スクロール許容）を維持

---

## 9. ロールバック方針

1. レイアウト崩壊時
- `PlayingField.js` と `playingField.module.css` を直前コミットに戻す

2. トグルUIが不安定な場合
- `HandTray` / `ToolboxPanel` の導入を feature flag 相当で一時無効化
- 先に静的配置のみ残す

3. 画像参照不整合時
- `CARD_BACK_IMAGE` 定数の一元化へ戻し、参照パスを固定

---

## 10. 実装中に停止してユーザー確認する意思決定ポイント

## Decision A: 手札/小道具の実装方式

選択肢1. 独自コンポーネント + CSS固定配置（推奨）

- メリット: 盤面専用のz-index制御がしやすい
- メリット: 依存追加なし、Phase 03の範囲で完結
- デメリット: 開閉アニメーションや細かな挙動を自前実装する必要

選択肢2. React-Bootstrap `Offcanvas` 利用

- メリット: 既存UIコンポーネントで実装が速い
- メリット: アクセシビリティの初期コストが低い
- デメリット: 盤面上のレイヤー制御と視覚統一に調整が必要

推奨: 選択肢1

## Decision B: 手札の展開レイアウト

選択肢1. 横スクロール列（推奨）

- メリット: 実装容易で崩れにくい
- デメリット: 紙の「扇形」らしさは弱い

選択肢2. 扇形レイアウト

- メリット: 紙プレイ体験に近い
- デメリット: カード枚数増加時の重なり制御が難しい

推奨: 選択肢1（Phase 03）

## Decision C: 小道具BOXの配置

選択肢1. 右下ドッキング（推奨）

- メリット: 多くの右利きユーザーが操作しやすい
- デメリット: 右側ゾーンと一部重なる可能性

選択肢2. 左下ドッキング

- メリット: 右側ゾーンとの干渉を減らしやすい
- デメリット: 手札トレイとの配置設計が難しくなる

推奨: 選択肢1

---

## 11. Exit Criteria（完了判定）

- [ ] ゾーン配置が `placement.png` / `placement_2.jpeg` に概ね整合
- [ ] `card-back.jpg` が裏面画像として統一されている
- [ ] 手札トグル（最小化/展開）が安定動作する
- [ ] 小道具BOXトグル（折りたたみ/展開）が安定動作する
- [ ] `CI=true npm test -- --watch=false` と `npm run build` が通る
- [ ] 実装ログが `references/implementation_logs/260218_phase03_board_ui_relayout.md` に記録される

---

## 12. リスク/懸念点

- 盤面再設計により既存の操作ボタン配置が一時的に悪化する可能性
- CSS Grid再編時に `Pokemon` コンポーネントの高さが崩れる可能性
- Phase 04（DnD）で再度DOM調整が必要になる可能性

対策:

- Phase 03では「見た目と配置」に責務を限定し、DnD対応用属性だけ先行追加
- 1ステップごとに `npm run build` を実行して小さく検証する

---

## 13. 実装ログ記録欄

本手順の実施ログは以下に記録する:

- `references/implementation_logs/260218_phase03_board_ui_relayout.md`

記録必須項目:

- 実施日時
- 実行コマンド
- コマンド出力（失敗含む）
- 変更ファイル
- 判定（Pass/Fail）
- 残課題

---

## 14. 参考コマンド集（コピペ用）

```bash
# ブランチ作成
git checkout -b feature/260218-phase03-board-ui-relayout

# ベースライン
CI=true npm test -- --watch=false
npm run build

# 実装中確認
rg -n "card-back\\.svg|card-back\\.jpg" src public
rg -n "aria-expanded|aria-controls|HandTray|ToolboxPanel" src/components

# 最終確認
CI=true npm test -- --watch=false
npm run build
git status --short
```
