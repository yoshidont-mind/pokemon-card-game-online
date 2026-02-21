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
