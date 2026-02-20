import { ORIENTATION, VISIBILITY } from './schemaV2';

export const INITIAL_PRIZE_COUNT_MIN = 3;
export const INITIAL_PRIZE_COUNT_MAX = 6;
export const INITIAL_PRIZE_COUNT_DEFAULT = 6;

export function normalizeInitialPrizeCount(value, fallback = INITIAL_PRIZE_COUNT_DEFAULT) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  if (parsed < INITIAL_PRIZE_COUNT_MIN || parsed > INITIAL_PRIZE_COUNT_MAX) {
    return fallback;
  }
  return parsed;
}

export function takeInitialPrizeRefsFromDeck(privateStateDoc, requestedPrizeCount) {
  const safePrizeCount = normalizeInitialPrizeCount(requestedPrizeCount);
  const deckRefs = Array.isArray(privateStateDoc?.zones?.deck) ? privateStateDoc.zones.deck : [];
  const takeCount = Math.min(safePrizeCount, deckRefs.length);
  const takenRefs = deckRefs.splice(0, takeCount);
  privateStateDoc.zones.deck = deckRefs;

  return takenRefs
    .map((ref) => ref?.cardId)
    .filter(Boolean)
    .map((cardId) => ({
      cardId,
      orientation: ORIENTATION.VERTICAL,
      isFaceDown: true,
      visibility: VISIBILITY.PUBLIC,
    }));
}
