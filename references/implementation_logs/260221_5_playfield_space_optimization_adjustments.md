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
