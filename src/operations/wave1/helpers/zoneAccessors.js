import { createCardRef, createStackRef } from '../../../game-state/builders';
import { ERROR_CODES, GameStateError } from '../../../game-state/errors';
import { ORIENTATION, VISIBILITY } from '../../../game-state/schemaV2';

export const STACK_KIND = Object.freeze({
  ACTIVE: 'active',
  BENCH: 'bench',
});

export const PRIVATE_ZONE = Object.freeze({
  HAND: 'hand',
  DECK: 'deck',
  DECK_PEEK: 'deckPeek',
});

export const PUBLIC_ZONE = Object.freeze({
  DISCARD: 'discard',
  LOST: 'lostZone',
  PRIZE: 'prize',
});

export const BENCH_SLOT_COUNT = 5;

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function ensureBoard(sessionDoc, playerId) {
  const board = sessionDoc?.publicState?.players?.[playerId]?.board;
  if (!board || typeof board !== 'object') {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, `Board is missing for ${playerId}.`);
  }
  return board;
}

export function ensureCounters(sessionDoc, playerId) {
  const counters = sessionDoc?.publicState?.players?.[playerId]?.counters;
  if (!counters || typeof counters !== 'object') {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, `Counters are missing for ${playerId}.`);
  }
  return counters;
}

export function normalizeBenchSlots(benchValue) {
  const slots = Array.from({ length: BENCH_SLOT_COUNT }, () => null);
  asArray(benchValue)
    .slice(0, BENCH_SLOT_COUNT)
    .forEach((value, index) => {
      slots[index] = value || null;
    });
  return slots;
}

export function getBenchStack(board, benchIndex) {
  if (!Number.isInteger(benchIndex) || benchIndex < 0 || benchIndex >= BENCH_SLOT_COUNT) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, `Invalid bench index: ${String(benchIndex)}`);
  }
  const bench = normalizeBenchSlots(board.bench);
  return bench[benchIndex] || null;
}

export function setBenchStack(board, benchIndex, stack) {
  if (!Number.isInteger(benchIndex) || benchIndex < 0 || benchIndex >= BENCH_SLOT_COUNT) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, `Invalid bench index: ${String(benchIndex)}`);
  }
  const bench = normalizeBenchSlots(board.bench);
  bench[benchIndex] = stack || null;
  board.bench = bench;
}

export function getStack(board, stackKind, benchIndex = null) {
  if (stackKind === STACK_KIND.ACTIVE) {
    return board.active || null;
  }
  if (stackKind === STACK_KIND.BENCH) {
    return getBenchStack(board, benchIndex);
  }
  throw new GameStateError(ERROR_CODES.INVALID_STATE, `Unsupported stackKind: ${String(stackKind)}`);
}

export function setStack(board, stackKind, stack, benchIndex = null) {
  if (stackKind === STACK_KIND.ACTIVE) {
    board.active = stack || null;
    return;
  }
  if (stackKind === STACK_KIND.BENCH) {
    setBenchStack(board, benchIndex, stack);
    return;
  }
  throw new GameStateError(ERROR_CODES.INVALID_STATE, `Unsupported stackKind: ${String(stackKind)}`);
}

export function resolvePrivateZone(privateStateDoc, zoneName) {
  if (!privateStateDoc?.zones || typeof privateStateDoc.zones !== 'object') {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'privateStateDoc.zones is missing.');
  }

  if (
    zoneName !== PRIVATE_ZONE.HAND &&
    zoneName !== PRIVATE_ZONE.DECK &&
    zoneName !== PRIVATE_ZONE.DECK_PEEK
  ) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, `Unsupported private zone: ${String(zoneName)}`);
  }

  const zone = privateStateDoc.zones[zoneName];
  if (!Array.isArray(zone)) {
    privateStateDoc.zones[zoneName] = [];
  }
  return privateStateDoc.zones[zoneName];
}

export function resolvePublicZone(board, zoneName) {
  if (zoneName !== PUBLIC_ZONE.DISCARD && zoneName !== PUBLIC_ZONE.LOST && zoneName !== PUBLIC_ZONE.PRIZE) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, `Unsupported public zone: ${String(zoneName)}`);
  }

  const zone = board[zoneName];
  if (!Array.isArray(zone)) {
    board[zoneName] = [];
  }
  return board[zoneName];
}

export function createOwnerVisibleCardRef(cardId) {
  return createCardRef({
    cardId,
    orientation: ORIENTATION.VERTICAL,
    isFaceDown: false,
    visibility: VISIBILITY.OWNER_ONLY,
  });
}

export function createDeckCardRef(cardId) {
  return createCardRef({
    cardId,
    orientation: ORIENTATION.VERTICAL,
    isFaceDown: true,
    visibility: VISIBILITY.OWNER_ONLY,
  });
}

export function createPublicCardRef(cardId, overrides = {}) {
  return createCardRef({
    cardId,
    orientation: overrides.orientation || ORIENTATION.VERTICAL,
    isFaceDown: Boolean(overrides.isFaceDown),
    visibility: overrides.visibility || VISIBILITY.PUBLIC,
  });
}

export function ensureStack(board, stackKind, {
  playerId,
  benchIndex = null,
  stackId = null,
} = {}) {
  const existing = getStack(board, stackKind, benchIndex);
  if (existing) {
    return existing;
  }

  const resolvedStackId = stackId ||
    (stackKind === STACK_KIND.ACTIVE
      ? `s_${playerId}_active`
      : `s_${playerId}_bench_${Number(benchIndex) + 1}`);

  const created = createStackRef({
    stackId: resolvedStackId,
    cardIds: [],
    damage: 0,
    orientation: ORIENTATION.VERTICAL,
    isFaceDown: false,
  });
  setStack(board, stackKind, created, benchIndex);
  return created;
}

export function removeCardRefByCardId(zone, cardId) {
  const index = asArray(zone).findIndex((ref) => ref?.cardId === cardId);
  if (index < 0) {
    return null;
  }
  const [removed] = zone.splice(index, 1);
  return removed || null;
}

export function pullTopCardRefs(zone, count = 1) {
  const safeCount = Number.isInteger(count) && count > 0 ? count : 1;
  const removed = [];

  for (let i = 0; i < safeCount && zone.length > 0; i += 1) {
    const next = zone.shift();
    if (next) {
      removed.push(next);
    }
  }

  return removed;
}

export function pushCardRefs(zone, refs, { top = false } = {}) {
  const normalized = asArray(refs).filter(Boolean);
  if (!normalized.length) {
    return;
  }

  if (top) {
    zone.unshift(...normalized);
    return;
  }

  zone.push(...normalized);
}

export function removeCardIdsFromStack(stack, {
  cardIds = [],
  count = null,
} = {}) {
  if (!stack || !Array.isArray(stack.cardIds)) {
    return [];
  }

  if (Array.isArray(cardIds) && cardIds.length > 0) {
    const idSet = new Set(cardIds);
    const kept = [];
    const removed = [];

    for (const cardId of stack.cardIds) {
      if (idSet.has(cardId)) {
        removed.push(cardId);
      } else {
        kept.push(cardId);
      }
    }

    stack.cardIds = kept;
    return removed;
  }

  const safeCount = Number.isInteger(count) && count > 0 ? count : 1;
  const removed = stack.cardIds.slice(-safeCount);
  stack.cardIds = stack.cardIds.slice(0, Math.max(0, stack.cardIds.length - safeCount));
  return removed;
}

export function addCardIdsToStack(stack, cardIds = []) {
  const normalized = asArray(cardIds).filter(Boolean);
  if (!normalized.length) {
    return;
  }
  if (!Array.isArray(stack.cardIds)) {
    stack.cardIds = [];
  }
  stack.cardIds.push(...normalized);
}
