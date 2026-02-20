import { ERROR_CODES, GameStateError } from '../../../game-state/errors';
import {
  PRIVATE_ZONE,
  PUBLIC_ZONE,
  addCardIdsToStack,
  asArray,
  createDeckCardRef,
  createOwnerVisibleCardRef,
  createPublicCardRef,
  pullTopCardRefs,
  pushCardRefs,
  removeCardIdsFromStack,
  removeCardRefByCardId,
  resolvePrivateZone,
  resolvePublicZone,
} from './zoneAccessors';

function normalizeCount(value, fallback = 1) {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }
  return fallback;
}

export function takeCardRefsFromPrivateZoneByIds(privateStateDoc, zoneName, cardIds = []) {
  const zone = resolvePrivateZone(privateStateDoc, zoneName);
  const removed = [];

  for (const cardId of asArray(cardIds)) {
    const hit = removeCardRefByCardId(zone, cardId);
    if (hit) {
      removed.push(hit);
    }
  }

  return removed;
}

export function takeTopCardRefsFromPrivateDeck(privateStateDoc, count = 1) {
  const deck = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.DECK);
  return pullTopCardRefs(deck, normalizeCount(count));
}

export function takeRandomCardRefsFromPrivateHand(privateStateDoc, count = 1) {
  const hand = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.HAND);
  const safeCount = Math.min(hand.length, normalizeCount(count));
  const removed = [];

  for (let i = 0; i < safeCount; i += 1) {
    const pickedIndex = Math.floor(Math.random() * hand.length);
    const [picked] = hand.splice(pickedIndex, 1);
    if (picked) {
      removed.push(picked);
    }
  }

  return removed;
}

export function placeCardRefsIntoPrivateZone(privateStateDoc, zoneName, refs, { top = false } = {}) {
  const zone = resolvePrivateZone(privateStateDoc, zoneName);
  pushCardRefs(zone, refs, { top });
}

export function placeCardIdsIntoPublicZone(board, zoneName, cardIds, { faceDown = false } = {}) {
  const zone = resolvePublicZone(board, zoneName);
  const refs = asArray(cardIds).map((cardId) => createPublicCardRef(cardId, { isFaceDown: faceDown }));
  pushCardRefs(zone, refs);
}

export function convertToHandRefs(cardRefs) {
  return asArray(cardRefs)
    .map((ref) => ref?.cardId)
    .filter(Boolean)
    .map((cardId) => createOwnerVisibleCardRef(cardId));
}

export function convertToDeckRefs(cardRefs) {
  return asArray(cardRefs)
    .map((ref) => ref?.cardId)
    .filter(Boolean)
    .map((cardId) => createDeckCardRef(cardId));
}

export function discardCardIdsFromStack(board, stack, cardIds, {
  fallbackCount = null,
} = {}) {
  if (!stack) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Stack is required.');
  }
  const removedCardIds = removeCardIdsFromStack(stack, {
    cardIds,
    count: fallbackCount,
  });
  placeCardIdsIntoPublicZone(board, PUBLIC_ZONE.DISCARD, removedCardIds, { faceDown: false });
  return removedCardIds;
}

export function attachCardIdsToStack(stack, cardIds) {
  addCardIdsToStack(stack, asArray(cardIds));
}

export function takeCardRefsFromPublicZoneByIds(board, zoneName, cardIds) {
  const zone = resolvePublicZone(board, zoneName);
  const removed = [];

  for (const cardId of asArray(cardIds)) {
    const hit = removeCardRefByCardId(zone, cardId);
    if (hit) {
      removed.push(hit);
    }
  }

  return removed;
}

export function takeTopCardRefsFromPublicZone(board, zoneName, count = 1) {
  const zone = resolvePublicZone(board, zoneName);
  return pullTopCardRefs(zone, normalizeCount(count));
}
