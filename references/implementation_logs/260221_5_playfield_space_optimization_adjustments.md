# Playfield Space Optimization Adjustments

## 0. Metadata
- Date: 2026-02-21
- Scope: Move count labels for deck/discard/lost/prize from below card images to center overlays on card images.

## 1. Work Log
### 2026-02-21 16:50:27 JST
- Confirmed clean baseline (`main...origin/main`) and identified target files:
  - `src/components/PlayingField.js`
  - `src/css/playingField.module.css`
- Confirmed current implementations:
  - `DeckPile`: count text rendered under image (`deckPileCount`).
  - `PublicPilePreview`: count text rendered under image (`publicPileCount`).
  - `PrizeFan`: count text rendered under fan image group (`prizeFanCount`).
- Planned change:
  - Introduce count overlay rendered on top of card image area.
  - Remove under-image count rendering for the three targets above.

### 2026-02-21 16:52-16:55 JST
- Implemented UI updates in `src/components/PlayingField.js`:
  - Added reusable `CardCountOverlay` component.
  - `DeckPile`: moved count label from below image to centered overlay on card image.
  - `PublicPilePreview` (trash/lost): moved count label from below image to centered overlay on top-card image.
  - `PrizeFan` (prize): moved count label from below fan to centered overlay.
- Implemented styling updates in `src/css/playingField.module.css`:
  - Added `.pileCardFrame`, `.pileCountOverlay`, `.prizeFanCountOverlay`.
  - Removed unused under-image count styles (`.deckPileCount`, `.publicPileCount`, `.prizeFanCount`).

### 2026-02-21 16:56 JST (First test run / failure)
- Command:
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldLayout.test.js`
- Result:
  - Failed with runtime reference error.
- Error excerpt:
```text
ReferenceError: PropTypes is not defined
at Object.<anonymous> (src/components/PlayingField.js:550:10)
```
- Cause:
  - Added `CardCountOverlay.propTypes` without importing `PropTypes` in this file.
- Fix:
  - Removed `CardCountOverlay.propTypes` block (this file does not currently use PropTypes declarations).

### 2026-02-21 16:57-17:00 JST (Re-test)
- Command:
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldLayout.test.js`
- Result:
  - PASS (`30 passed, 30 total`)

### 2026-02-21 17:00 JST (DnD regression check)
- Command:
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldDnd.test.js`
- Result:
  - PASS (`2 passed, 2 total`)

### 2026-02-21 17:03-17:11 JST (Deck peek trigger UX update)
- Requirement:
  - Remove dedicated `閲覧` button under deck card.
  - Open deck peek count selection modal by clicking the deck back card image directly.
- Implemented updates:
  - `src/components/PlayingField.js`
    - `DeckPile` now supports interactive mode via `onActivate`.
    - Added keyboard activation support (`Enter` / `Space`) for accessibility.
    - Removed deck quick-action `閲覧` button.
    - Wired player deck pile to `handleOpenDeckPeekConfig` (`onActivate`) when interaction is allowed.
  - `src/css/playingField.module.css`
    - Added `.deckPileInteractive` and focus-visible style.
  - `src/components/__tests__/PlayingFieldLayout.test.js`
    - Updated deck peek modal test to click deck image (`alt="Player Deck"`) instead of old `閲覧` button.
    - Updated test title accordingly.

### 2026-02-21 17:11 JST (Validation after deck peek trigger update)
- Commands:
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldLayout.test.js`
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldDnd.test.js`
- Results:
  - Layout test: PASS (`30 passed, 30 total`)
  - DnD test: PASS (`2 passed, 2 total`)

### 2026-02-21 17:20-17:24 JST (Battle/Reveal width tuning)
- Requirement:
  1. Reduce battle active zone width to be close to deck zone width.
  2. Expand reveal zone width and support max 2 cards per row, wrapping from the 3rd card.
  3. In reveal zone, rows with one card should be horizontally centered.
- Implemented updates in `src/css/playingField.module.css`:
  - `.battleLineRow`
    - `--active-zone-width`: `min(var(--side-column-size), 100%)`
    - `--reveal-line-width`: `clamp(176px, 18.5vw, 212px)`
  - `.revealZoneValue`
    - `justify-content: center;`
  - `.revealCards`
    - `width: min(100%, calc((var(--card-w) * 2) + 6px));`
    - `justify-content: center;`
    - `align-content: flex-start;`
    - `margin-inline: auto;`
- Notes:
  - Flex-wrap remains enabled; width constraint limits each row to 2 cards.
  - Centered justification ensures single-card rows are centered.

### 2026-02-21 17:24-17:30 JST (Validation after width tuning)
- Command:
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldLayout.test.js`
- Result:
  - PASS (`30 passed, 30 total`)

### 2026-02-21 17:47-17:51 JST (Stack direction and insert-side inversion)
- Requirement:
  1. In active/bench stacked cards, reverse offset direction:
     - bottom cards: right + down
     - top cards: left + up
  2. Increase stack offset amount by ~1.5x.
  3. For deck/active/bench insert targets, invert left/right placement:
     - left: top-insert (red)
     - right: bottom-insert (blue)
- Implemented updates:
  - `src/components/Pokemon.js`
    - `STACK_CARD_OFFSET_PX`: `10 -> 15` (1.5x).
    - Horizontal offset formula reversed:
      - from `index * offset - spread/2`
      - to `spread/2 - index * offset`
  - `src/components/PlayingField.js`
    - Reordered insert target rendering blocks so left/right visual placement becomes:
      - left: `上に重ねる / 上に戻す`
      - right: `下に重ねる / 下に戻す`
    - Applied consistently for:
      - bench stack insert targets
      - player active stack insert targets
      - player deck insert targets

### 2026-02-21 17:51-17:53 JST (Validation after stack direction/inversion update)
- Commands:
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldLayout.test.js`
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldDnd.test.js`
- Results:
  - Layout test: PASS (`30 passed, 30 total`)
  - DnD test: PASS (`2 passed, 2 total`)

### 2026-02-21 18:10 JST (Stadium/Coin floating position fix)
- Issue:
  - `スタジアム+コイン` が意図しない左上位置へ飛ぶケースを確認。
- Cause:
  - `left` 計算式で参照していた `--active-zone-width` が `.opponentArea` 側では未定義で、`calc()` が崩れていた。
- Fix (`src/css/playingField.module.css`):
  - `.opponentArea` に `--active-zone-width: min(var(--side-column-size), 100%);` を追加。
  - `.stadiumCoinFloating` の式をフォールバック付きに変更:
    - `var(--active-zone-width, 180px)`

### 2026-02-21 18:16 JST (Stadium/Coin placement model change)
- User feedback:
  - Stadium/Coin should not float above other zones.
  - It must sit between **player-side Prize** and **player-side Active** at same plane (no overlay).
- Fix strategy:
  - Removed absolute/floating placement model.
  - Moved Stadium/Coin into normal flow as a dedicated grid column inside `playerArea`.
- Applied changes:
  - `src/components/PlayingField.js`
    - Removed Stadium/Coin block from `opponentArea`.
    - Inserted Stadium/Coin block between `playerArea` side column (prize) and main column (active/bench).
  - `src/css/playingField.module.css`
    - `playerArea` columns changed to: `var(--side-column-size) auto 1fr var(--side-column-size)`
    - Replaced `.stadiumCoinFloating` with `.stadiumCoinColumn` (non-absolute, normal-flow grid).
    - Kept `.stadiumCoinRow` gap (`10px`) unchanged.
- Validation:
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldLayout.test.js src/components/__tests__/PlayingFieldDnd.test.js`
  - Result: PASS (`32 passed, 32 total`)

### 2026-02-21 18:26 JST (Player-side layout compression fix for Stadium/Coin)
- User-observed issue:
  - Player-side layout still collapsed horizontally.
  - Root cause: adding a dedicated `auto` column in `playerArea` reduced width available to `mainColumn` (active/reveal/bench).
- Fix strategy:
  - Restore 3-column `playerArea` grid.
  - Keep Stadium/Coin in player side, but place as an auxiliary block inside player `battleLineRow` (absolute within row), so it no longer consumes grid width.
- Applied changes:
  - `src/components/PlayingField.js`
    - Removed standalone `stadiumCoinColumn` block between side/main columns.
    - Added Stadium/Coin block as `playerBattleAux` inside player active row.
  - `src/css/playingField.module.css`
    - `playerArea` grid restored to `var(--side-column-size) 1fr var(--side-column-size)`.
    - Added `.playerBattleAux` absolute anchor:
      - `left: calc(25% - (var(--active-zone-width) / 4));`
      - `top: 0`, `transform: translateX(-50%)`.
    - Tuned `.inlineStadiumZone` size smaller (width/min-height) to avoid occupying side-column-scale footprint.
- Validation:
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldLayout.test.js src/components/__tests__/PlayingFieldDnd.test.js`
  - Result: PASS (`32 passed, 32 total`)

### 2026-02-21 17:59 JST (Stack offset fine-tuning)
- Requirement:
  - Adjust `STACK_CARD_OFFSET_PX` from `15` to `12`.
- Update:
  - `src/components/Pokemon.js`
    - `STACK_CARD_OFFSET_PX: 15 -> 12`
- Notes:
  - No other stack-direction logic was changed.

### 2026-02-21 18:30 JST (Stadium/Coin non-floating alignment fix)
- User-observed issue:
  - `スタジアム+コイン` が「浮いて見える」配置になり、プレイマット上の通常枠と同一平面に見えない。
  - 自分側レイアウトが圧迫されて見える状態が発生。
- Root cause:
  - `playerBattleAux` を `absolute` で配置していたため、通常フロー外に出て「浮いている」見え方になっていた。
  - 位置は確保できても、プレイマット枠と同一面で整列している印象になりにくかった。
- Fix strategy:
  - `スタジアム+コイン` をプレイヤー側 `battleLineRow` の通常レイアウト内へ戻し、非浮遊（non-floating）で扱う。
  - 既存の 3 カラム構成（`side / main / side`）は維持し、`playerArea` の横幅圧迫を再発させない。
- Applied changes:
  - `src/components/PlayingField.js`
    - プレイヤー側の active 行に `battleLineRowWithAux` クラスを追加。
  - `src/css/playingField.module.css`
    - `.playerBattleAux` から absolute 位置指定を除去し、通常フロー配置に変更。
    - `.battleLineRowWithAux` を追加し、プレイヤー側の active 行を 3 カラムで整列:
      - `max-content`（スタジアム+コイン） / `var(--active-zone-width)`（バトル場） / `var(--reveal-line-width)`（公開エリア）
    - `.battleLineRowWithAux .battleLineRevealPlayer` を `position: static` 化し、同一平面で整列。
- Validation:
  - Command:
    - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldLayout.test.js src/components/__tests__/PlayingFieldDnd.test.js`
  - Result:
    - PASS (`32 passed, 32 total`)

### 2026-02-21 18:33 JST (Class assignment correction)
- Issue found during verification:
  - `battleLineRowWithAux` の付与先が相手側 active 行になっていた。
- Fix:
  - `src/components/PlayingField.js`
    - `battleLineRowWithAux` を相手側行から外し、自分側 active 行へ付け替え。
- Re-validation:
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldLayout.test.js src/components/__tests__/PlayingFieldDnd.test.js`
  - PASS (`32 passed, 32 total`)

### 2026-02-21 18:38 JST (Player-side horizontal spacing equalization)
- Requirement:
  - `スタジアム+コイン` と `バトル場` の間隔を、`スタジアム+コイン` と `サイド（自分）` の間隔に一致させる。
  - `公開エリア（自分）` と `バトル場` の間隔を、`公開エリア（自分）` と `山札（自分）` の間隔に一致させる。
- Root cause:
  - `battleLineRowWithAux` が中央寄せだったため、行の左右に余白が発生し、内側ギャップと外側ギャップが一致しなかった。
- Fix:
  - `src/css/playingField.module.css`
    - `battleLineRowWithAux` に動的ギャップ計算を導入。
      - `--player-line-inner-gap`（内側ギャップ）
      - `--player-line-outer-gap`（左右外側ギャップ）
    - 7カラム構成に変更し、`playerBattleAux / active / reveal` を固定カラムへ配置。
    - `inlineStadiumZone` と `coinWidget` の幅を変数連携し、レイアウト計算の前提を固定化。
    - `playerBattleAux` を `grid-column: 2` へ固定。
- Validation:
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldLayout.test.js src/components/__tests__/PlayingFieldDnd.test.js`
  - PASS (`32 passed, 32 total`)

### 2026-02-21 18:55 JST (Playmat compactness follow-up UI adjustments)
- Requirement:
  1. `サイド（自分）` の縦方向余白を `サイド（相手）` に近づける。
  2. 自分側ベンチ（1〜5）の縦方向余白を相手側に近づける。
  3. 自分側と相手側の境界を、少しの隙間 + 白い横線で明確化する。
  4. 右上の `状態: ... / Rev: ...` 表示を削除する。
- Applied changes:
  - `src/components/PlayingField.js`
    - 右上ステータスバー (`状態 / Rev`) の描画を削除。
    - `opponentArea` と `playerArea` の間に境界用 `areaDivider` を追加。
    - `サイド（自分）` に `playerPrizeZoneTile`、`サイド（相手）` に `opponentPrizeZoneTile` の識別クラスを追加。
    - 自分側 `mainColumn` に `playerMainColumn` クラスを追加。
  - `src/css/playingField.module.css`
    - `.areaDivider` を追加（小さな縦余白 + 白の横線）。
    - `.playerMainColumn` で行間ギャップをやや縮小。
    - `.playerMainColumn .benchRow` と `.playerArea .benchSlot` で自分側ベンチの縦余白を縮小。
    - `.playerPrizeZoneTile` の `zoneWithActions / prizeFanRows / prizeFanRow / zoneQuickActions` を調整し、`サイド（自分）` の縦方向余白を縮小。
- Validation:
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldLayout.test.js src/components/__tests__/PlayingFieldDnd.test.js`
  - PASS (`32 passed, 32 total`)

### 2026-02-21 19:36 JST (Bench height regression rollback)
- Issue:
  - ベンチ枠に固定 `height` を入れたことで、縦幅が詰まりすぎ、カードがはみ出して見える回帰が発生。
  - 相手側ベンチまで変更される副作用が出た。
- Fix:
  - `src/css/playingField.module.css`
    - `.benchSlot` の固定 `height` を削除し、`min-height` のみに戻した。
- Validation:
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldLayout.test.js src/components/__tests__/PlayingFieldDnd.test.js`
  - PASS (`32 passed, 32 total`)

### 2026-02-21 19:40 JST (Player-only parity adjustment for bench/prize)
- Requirement:
  - 相手側の見た目は変更せず、自分側のベンチ/サイド枠の縦方向サイズ・余白を相手側と同一化。
- Applied changes:
  - `src/components/PlayingField.js`
    - 相手サイド枠の余分な識別クラス（`opponentPrizeZoneTile`）を除去し、相手側は既存基準のまま固定。
  - `src/css/playingField.module.css`
    - 自分側ベンチに、相手側と同一値の `min-height` を明示指定（同値固定）。
    - 自分側サイドの `zoneWithActions` から `min-height: 100%` を削除し、相手側と同等の高さ計算に戻した。
    - 自分側サイドの `1枚取る` ボタン配置（absolute）は維持し、相手側枠には影響しないようにした。
- Validation:
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldLayout.test.js src/components/__tests__/PlayingFieldDnd.test.js`
  - PASS (`32 passed, 32 total`)

### 2026-02-21 19:48 JST (Shared-area emphasis for Stadium/Coin)
- Requirement:
  - `スタジアム＋コイン` を少し上にずらし、相手/自分エリア境界の白線を約 1/3 高さだけまたがせることで、共有エリア感を明確化。
- Applied change:
  - `src/css/playingField.module.css`
    - `.battleLineRowWithAux .playerBattleAux` に上方向オフセットを追加:
      - `--shared-center-overlap: clamp(28px, 3.2vw, 40px)`
      - `transform: translateY(calc(-1 * var(--shared-center-overlap)))`
    - 重なり順を安定させるため `position: relative; z-index: 3;` を追加。
- Validation:
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldLayout.test.js src/components/__tests__/PlayingFieldDnd.test.js`
  - PASS (`32 passed, 32 total`)

### 2026-02-21 19:55 JST (Player active alignment with Bench-3 axis)
- Requirement:
  - 相手側は変更せず、自分側バトル場の横方向中心軸を「自分側ベンチ3」の中心軸に一致させる。
- Applied change:
  - `src/css/playingField.module.css`
    - `.battleLineRowWithAux .battleLineActive` に横オフセットを追加:
      - `transform: translateX(calc((var(--reveal-line-width) - var(--aux-line-width)) / 2));`
    - これにより、自分側バトル場のみが左方向へ補正され、中央軸がベンチ3と一致するよう調整。
- Validation:
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldLayout.test.js src/components/__tests__/PlayingFieldDnd.test.js`
  - PASS (`32 passed, 32 total`)

### 2026-02-21 19:59 JST (Gap parity re-tuning after active-axis shift)
- Background:
  - バトル場を左補正した結果、以下2条件が崩れた:
    1. `スタジアム＋コイン` ↔ `バトル場` の間隔 = `スタジアム＋コイン` ↔ `サイド` の間隔
    2. `公開エリア` ↔ `バトル場` の間隔 = `公開エリア` ↔ `山札（自分）` の間隔
- Constraint:
  - 見た目調整は `スタジアム＋コイン` と `公開エリア` のみに限定し、他枠のサイズ・見た目は変更しない。
- Applied change:
  - `src/css/playingField.module.css`
    - `battleLineRowWithAux` に `--player-active-axis-shift` を追加（既存バトル場補正量を変数化）。
    - バトル場補正はそのまま維持しつつ、
      - `playerBattleAux` に `translateX(calc(var(--player-active-axis-shift) / 2))`
      - `battleLineRevealPlayer` に `translateX(calc(var(--player-active-axis-shift) / 2))`
      を適用。
    - これにより、バトル場補正後も左右ギャップが再び等しくなるよう再整列。
- Validation:
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldLayout.test.js src/components/__tests__/PlayingFieldDnd.test.js`
  - PASS (`32 passed, 32 total`)

### 2026-02-21 20:05 JST (Reveal-area hover zoom for both players)
- Requirement:
  - 公開エリアのカードも、手札等と同様にホバーで拡大表示できるようにする（自分側/相手側）。
- Applied changes:
  - `src/components/PlayingField.js`
    - 相手側公開カードを `revealCardItem` ラッパーで描画し、ホバー前面化スタイルを適用可能にした。
  - `src/css/playingField.module.css`
    - 公開カード用ホバー拡大スタイルを追加:
      - `.revealCardDraggable`, `.revealCardItem` に `position`/`z-index` 管理
      - ホバー/フォーカス時に `z-index` を上げる
      - `.revealCardImage` に拡大トランジション（`scale(4)`, `translateY(-40px)`）を追加
- Validation:
  - `CI=true npm test -- --runInBand src/components/__tests__/PlayingFieldLayout.test.js src/components/__tests__/PlayingFieldDnd.test.js`
  - PASS (`32 passed, 32 total`)
