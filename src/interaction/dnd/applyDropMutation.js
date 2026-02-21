import { createCardRef, createStackRef } from '../../game-state/builders';
import { ERROR_CODES, GameStateError } from '../../game-state/errors';
import { applySessionMutation } from '../../game-state/transactionRunner';
import { ORIENTATION, SESSION_STATUS, VISIBILITY } from '../../game-state/schemaV2';
import { BENCH_SLOT_COUNT, DRAG_TYPES, INTENT_ACTIONS, STACK_KINDS, ZONE_KINDS } from './constants';

const STATUS_BADGE_TO_CONDITION_KEY = Object.freeze({
  poison: 'poisoned',
  burn: 'burned',
  asleep: 'asleep',
  paralyzed: 'paralyzed',
  confused: 'confused',
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeBenchSlots(benchValue) {
  const slots = Array.from({ length: BENCH_SLOT_COUNT }, () => null);
  asArray(benchValue)
    .slice(0, BENCH_SLOT_COUNT)
    .forEach((entry, index) => {
      slots[index] = entry || null;
    });
  return slots;
}

function createPublicCardRef(cardId, overrides = {}) {
  const ref = createCardRef({
    cardId,
    orientation: overrides.orientation || ORIENTATION.VERTICAL,
    isFaceDown: Boolean(overrides.isFaceDown),
    visibility: overrides.visibility || VISIBILITY.PUBLIC,
  });
  if (typeof overrides.imageUrl === 'string' && overrides.imageUrl.trim() !== '') {
    ref.imageUrl = overrides.imageUrl;
  }
  return ref;
}

function createOwnerVisibleCardRef(cardId) {
  return createCardRef({
    cardId,
    orientation: ORIENTATION.VERTICAL,
    isFaceDown: false,
    visibility: VISIBILITY.OWNER_ONLY,
  });
}

function resolvePlayerBoard(sessionDoc, playerId) {
  const board = sessionDoc?.publicState?.players?.[playerId]?.board;
  if (!board || typeof board !== 'object') {
    throw new GameStateError(
      ERROR_CODES.INVALID_STATE,
      `Missing board container for ${playerId}.`
    );
  }
  return board;
}

function resolvePlayerCounters(sessionDoc, playerId) {
  const counters = sessionDoc?.publicState?.players?.[playerId]?.counters;
  if (!counters || typeof counters !== 'object') {
    throw new GameStateError(
      ERROR_CODES.INVALID_STATE,
      `Missing counters container for ${playerId}.`
    );
  }
  return counters;
}

function ensureRevealZone(board) {
  if (!Array.isArray(board?.reveal)) {
    board.reveal = [];
  }
  return board.reveal;
}

function ensureTurnContext(sessionDoc) {
  if (!sessionDoc?.publicState || typeof sessionDoc.publicState !== 'object') {
    sessionDoc.publicState = {};
  }
  if (!sessionDoc.publicState.turnContext || typeof sessionDoc.publicState.turnContext !== 'object') {
    sessionDoc.publicState.turnContext = {};
  }
  return sessionDoc.publicState.turnContext;
}

function consumeDeckPeekCount(sessionDoc, playerId, consumedCount = 1) {
  const turnContext = ensureTurnContext(sessionDoc);
  const state = turnContext?.deckPeekState;
  if (!state || state.byPlayerId !== playerId || state.isOpen !== true) {
    return;
  }
  const safeConsumed = Math.max(0, Number(consumedCount) || 0);
  const currentCount = Math.max(0, Number(state.count) || 0);
  const nextCount = Math.max(0, currentCount - safeConsumed);
  turnContext.deckPeekState = {
    ...state,
    isOpen: nextCount > 0,
    count: nextCount,
    updatedAt: new Date().toISOString(),
  };
}

function resolveImageUrlFromPrivateState(privateStateDoc, cardId) {
  return privateStateDoc?.cardCatalog?.[cardId]?.imageUrl || null;
}

function takeCardRefFromSource({
  sessionDoc,
  privateStateDoc,
  playerId,
  sourceZone,
  cardId,
  sourceStackKind = null,
  sourceBenchIndex = null,
}) {
  const publicBoard = resolvePlayerBoard(sessionDoc, playerId);
  const playerCounters = resolvePlayerCounters(sessionDoc, playerId);

  if (sourceZone === 'player-hand') {
    const hand = asArray(privateStateDoc?.zones?.hand);
    const handIndex = hand.findIndex((ref) => ref?.cardId === cardId);
    if (handIndex < 0) {
      throw new GameStateError(
        ERROR_CODES.INVARIANT_VIOLATION,
        `Card ${cardId} is not in hand.`
      );
    }
    const [sourceCardRef] = hand.splice(handIndex, 1);
    privateStateDoc.zones.hand = hand;
    playerCounters.handCount = hand.length;
    return sourceCardRef;
  }

  if (sourceZone === 'player-reveal') {
    const reveal = ensureRevealZone(publicBoard);
    const revealIndex = reveal.findIndex((ref) => ref?.cardId === cardId);
    if (revealIndex < 0) {
      throw new GameStateError(
        ERROR_CODES.INVARIANT_VIOLATION,
        `Card ${cardId} is not in reveal zone.`
      );
    }
    const [sourceCardRef] = reveal.splice(revealIndex, 1);
    return sourceCardRef;
  }

  if (sourceZone === 'player-deck') {
    const deck = asArray(privateStateDoc?.zones?.deck);
    const deckIndex = deck.findIndex((ref) => ref?.cardId === cardId);
    if (deckIndex < 0) {
      throw new GameStateError(
        ERROR_CODES.INVARIANT_VIOLATION,
        `Card ${cardId} is not in deck.`
      );
    }
    const [sourceCardRef] = deck.splice(deckIndex, 1);
    privateStateDoc.zones.deck = deck;
    playerCounters.deckCount = deck.length;
    return sourceCardRef;
  }

  if (sourceZone === 'player-deck-peek') {
    const deckPeek = asArray(privateStateDoc?.zones?.deckPeek);
    const deckPeekIndex = deckPeek.findIndex((ref) => ref?.cardId === cardId);
    if (deckPeekIndex < 0) {
      throw new GameStateError(
        ERROR_CODES.INVARIANT_VIOLATION,
        `Card ${cardId} is not in deck peek zone.`
      );
    }
    const [sourceCardRef] = deckPeek.splice(deckPeekIndex, 1);
    privateStateDoc.zones.deckPeek = deckPeek;
    return sourceCardRef;
  }

  if (sourceZone === 'player-stack') {
    const normalizedStackKind =
      sourceStackKind === STACK_KINDS.BENCH ? STACK_KINDS.BENCH : STACK_KINDS.ACTIVE;

    let stack = null;
    let bench = null;
    let benchIndex = null;

    if (normalizedStackKind === STACK_KINDS.ACTIVE) {
      stack = publicBoard.active || null;
    } else {
      benchIndex = Number(sourceBenchIndex);
      if (!Number.isInteger(benchIndex) || benchIndex < 0 || benchIndex >= BENCH_SLOT_COUNT) {
        throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Invalid source bench index.');
      }
      bench = normalizeBenchSlots(publicBoard.bench);
      stack = bench[benchIndex] || null;
    }

    if (!stack || !Array.isArray(stack.cardIds)) {
      throw new GameStateError(ERROR_CODES.INVARIANT_VIOLATION, 'Source stack is missing.');
    }

    const cardIndex = stack.cardIds.findIndex((entryCardId) => entryCardId === cardId);
    if (cardIndex < 0) {
      throw new GameStateError(
        ERROR_CODES.INVARIANT_VIOLATION,
        `Card ${cardId} is not in source stack.`
      );
    }

    stack.cardIds.splice(cardIndex, 1);

    if (stack.cardIds.length <= 0) {
      if (normalizedStackKind === STACK_KINDS.ACTIVE) {
        publicBoard.active = null;
      } else {
        bench[benchIndex] = null;
        publicBoard.bench = bench;
      }
    } else if (normalizedStackKind === STACK_KINDS.BENCH) {
      bench[benchIndex] = stack;
      publicBoard.bench = bench;
    } else {
      publicBoard.active = stack;
    }

    return createCardRef({
      cardId,
      orientation: stack?.orientation || ORIENTATION.VERTICAL,
      isFaceDown: false,
      visibility: VISIBILITY.OWNER_ONLY,
    });
  }

  throw new GameStateError(
    ERROR_CODES.INVALID_STATE,
    `Unsupported source zone: ${String(sourceZone)}`
  );
}

function moveCardFromSourceToZone({ sessionDoc, privateStateDoc, playerId, action }) {
  const cardId = action?.cardId;
  if (!cardId) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'cardId is required.');
  }

  const sourceZone = action?.sourceZone || 'player-hand';
  const publicBoard = resolvePlayerBoard(sessionDoc, playerId);
  const playerCounters = resolvePlayerCounters(sessionDoc, playerId);
  const sourceCardRef = takeCardRefFromSource({
    sessionDoc,
    privateStateDoc,
    playerId,
    sourceZone,
    cardId,
    sourceStackKind: action?.sourceStackKind || null,
    sourceBenchIndex: action?.sourceBenchIndex ?? null,
  });

  const sourceImageUrl = sourceCardRef?.imageUrl || resolveImageUrlFromPrivateState(privateStateDoc, cardId);
  const targetZoneKind = action.targetZoneKind;
  const consumesDeckPeekCard = sourceZone === 'player-deck-peek';

  if (targetZoneKind === ZONE_KINDS.ACTIVE) {
    if (publicBoard.active) {
      throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Active slot is already occupied.');
    }
    publicBoard.active = createStackRef({
      stackId: `s_${playerId}_active`,
      cardIds: [cardId],
      orientation: sourceCardRef?.orientation || ORIENTATION.VERTICAL,
      isFaceDown: false,
    });
  } else if (targetZoneKind === ZONE_KINDS.BENCH) {
    const bench = normalizeBenchSlots(publicBoard.bench);
    const benchIndex = Number(action.targetBenchIndex);
    if (!Number.isInteger(benchIndex) || benchIndex < 0 || benchIndex >= BENCH_SLOT_COUNT) {
      throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Invalid bench index.');
    }
    if (bench[benchIndex]) {
      throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Target bench slot is occupied.');
    }

    bench[benchIndex] = createStackRef({
      stackId: `s_${playerId}_bench_${benchIndex + 1}`,
      cardIds: [cardId],
      orientation: sourceCardRef?.orientation || ORIENTATION.VERTICAL,
      isFaceDown: false,
    });
    publicBoard.bench = bench;
  } else if (targetZoneKind === ZONE_KINDS.REVEAL) {
    const reveal = ensureRevealZone(publicBoard);
    reveal.push(createPublicCardRef(cardId, { imageUrl: sourceImageUrl }));
  } else if (targetZoneKind === ZONE_KINDS.DISCARD) {
    publicBoard.discard = [
      ...asArray(publicBoard.discard),
      createPublicCardRef(cardId, {
        imageUrl: sourceImageUrl,
      }),
    ];
  } else if (targetZoneKind === ZONE_KINDS.LOST) {
    publicBoard.lostZone = [
      ...asArray(publicBoard.lostZone),
      createPublicCardRef(cardId, {
        imageUrl: sourceImageUrl,
      }),
    ];
  } else if (targetZoneKind === ZONE_KINDS.PRIZE) {
    publicBoard.prize = [
      ...asArray(publicBoard.prize),
      createPublicCardRef(cardId, {
        isFaceDown: true,
      }),
    ];
  } else if (targetZoneKind === ZONE_KINDS.HAND) {
    const hand = asArray(privateStateDoc?.zones?.hand);
    hand.push(createOwnerVisibleCardRef(cardId));
    privateStateDoc.zones.hand = hand;
    playerCounters.handCount = hand.length;
  } else if (targetZoneKind === ZONE_KINDS.STADIUM) {
    sessionDoc.publicState.stadium = {
      cardId,
      ownerPlayerId: playerId,
      placedVia: 'dnd',
    };
  } else {
    throw new GameStateError(
      ERROR_CODES.INVALID_STATE,
      `Unsupported targetZoneKind: ${String(targetZoneKind)}`
    );
  }

  if (
    sessionDoc.status === SESSION_STATUS.WAITING ||
    sessionDoc.status === SESSION_STATUS.READY
  ) {
    sessionDoc.status = SESSION_STATUS.PLAYING;
  }

  if (consumesDeckPeekCard) {
    consumeDeckPeekCount(sessionDoc, playerId, 1);
  }

  return {
    sessionDoc,
    privateStateDoc,
  };
}

function moveCardToDeckEdge({ sessionDoc, privateStateDoc, playerId, action }) {
  const cardId = action?.cardId;
  const targetDeckEdge = action?.targetDeckEdge;
  if (!cardId) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'cardId is required.');
  }
  if (targetDeckEdge !== 'top' && targetDeckEdge !== 'bottom') {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'targetDeckEdge must be top or bottom.');
  }

  const sourceZone = action?.sourceZone || 'player-hand';
  const sourceCardRef = takeCardRefFromSource({
    sessionDoc,
    privateStateDoc,
    playerId,
    sourceZone,
    cardId,
    sourceStackKind: action?.sourceStackKind || null,
    sourceBenchIndex: action?.sourceBenchIndex ?? null,
  });

  const deck = asArray(privateStateDoc?.zones?.deck);
  const counters = resolvePlayerCounters(sessionDoc, playerId);
  const cardRefForDeck = createCardRef({
    cardId,
    orientation: sourceCardRef?.orientation || ORIENTATION.VERTICAL,
    isFaceDown: true,
    visibility: VISIBILITY.OWNER_ONLY,
  });

  if (targetDeckEdge === 'top') {
    deck.unshift(cardRefForDeck);
  } else {
    deck.push(cardRefForDeck);
  }
  privateStateDoc.zones.deck = deck;
  counters.deckCount = deck.length;

  const turnContext = ensureTurnContext(sessionDoc);
  turnContext.lastDeckInsertEvent = {
    byPlayerId: playerId,
    position: targetDeckEdge,
    at: new Date().toISOString(),
  };

  if (sourceZone === 'player-deck-peek') {
    consumeDeckPeekCount(sessionDoc, playerId, 1);
  }

  if (
    sessionDoc.status === SESSION_STATUS.WAITING ||
    sessionDoc.status === SESSION_STATUS.READY
  ) {
    sessionDoc.status = SESSION_STATUS.PLAYING;
  }

  return {
    sessionDoc,
    privateStateDoc,
  };
}

function moveCardToStackEdge({ sessionDoc, privateStateDoc, playerId, action }) {
  const cardId = action?.cardId;
  const targetZoneKind = action?.targetZoneKind;
  const targetStackEdge = action?.targetStackEdge;

  if (!cardId) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'cardId is required.');
  }
  if (targetZoneKind !== ZONE_KINDS.ACTIVE && targetZoneKind !== ZONE_KINDS.BENCH) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'targetZoneKind must be active or bench.');
  }
  if (targetStackEdge !== 'top' && targetStackEdge !== 'bottom') {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'targetStackEdge must be top or bottom.');
  }

  const sourceZone = action?.sourceZone || 'player-hand';
  takeCardRefFromSource({
    sessionDoc,
    privateStateDoc,
    playerId,
    sourceZone,
    cardId,
    sourceStackKind: action?.sourceStackKind || null,
    sourceBenchIndex: action?.sourceBenchIndex ?? null,
  });
  const board = resolvePlayerBoard(sessionDoc, playerId);

  let targetStack = null;
  if (targetZoneKind === ZONE_KINDS.ACTIVE) {
    targetStack = board.active || null;
  } else {
    const benchIndex = Number(action?.targetBenchIndex);
    if (!Number.isInteger(benchIndex) || benchIndex < 0 || benchIndex >= BENCH_SLOT_COUNT) {
      throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Invalid target bench index.');
    }
    const bench = normalizeBenchSlots(board.bench);
    targetStack = bench[benchIndex] || null;
  }

  if (!targetStack || !Array.isArray(targetStack.cardIds)) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Target stack does not exist.');
  }

  if (targetStackEdge === 'top') {
    targetStack.cardIds.push(cardId);
  } else {
    targetStack.cardIds.unshift(cardId);
  }

  if (sourceZone === 'player-deck-peek') {
    consumeDeckPeekCount(sessionDoc, playerId, 1);
  }

  if (
    sessionDoc.status === SESSION_STATUS.WAITING ||
    sessionDoc.status === SESSION_STATUS.READY
  ) {
    sessionDoc.status = SESSION_STATUS.PLAYING;
  }

  return {
    sessionDoc,
    privateStateDoc,
  };
}

function swapStacksBetweenZones({ sessionDoc, privateStateDoc, playerId, action }) {
  const sourceStackKind =
    action?.sourceStackKind === STACK_KINDS.BENCH ? STACK_KINDS.BENCH : STACK_KINDS.ACTIVE;
  const targetZoneKind =
    action?.targetZoneKind === ZONE_KINDS.BENCH ? ZONE_KINDS.BENCH : ZONE_KINDS.ACTIVE;

  const board = resolvePlayerBoard(sessionDoc, playerId);
  const bench = normalizeBenchSlots(board.bench);

  const sourceBenchIndex =
    sourceStackKind === STACK_KINDS.BENCH ? Number(action?.sourceBenchIndex) : null;
  const targetBenchIndex =
    targetZoneKind === ZONE_KINDS.BENCH ? Number(action?.targetBenchIndex) : null;

  if (
    sourceStackKind === STACK_KINDS.BENCH &&
    (!Number.isInteger(sourceBenchIndex) || sourceBenchIndex < 0 || sourceBenchIndex >= BENCH_SLOT_COUNT)
  ) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Invalid source bench index.');
  }

  if (
    targetZoneKind === ZONE_KINDS.BENCH &&
    (!Number.isInteger(targetBenchIndex) || targetBenchIndex < 0 || targetBenchIndex >= BENCH_SLOT_COUNT)
  ) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Invalid target bench index.');
  }

  const sourceStack =
    sourceStackKind === STACK_KINDS.ACTIVE ? board.active || null : bench[sourceBenchIndex] || null;
  const targetStack =
    targetZoneKind === ZONE_KINDS.ACTIVE ? board.active || null : bench[targetBenchIndex] || null;

  if (!sourceStack || !Array.isArray(sourceStack.cardIds) || sourceStack.cardIds.length <= 0) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Source stack does not exist.');
  }
  if (!targetStack || !Array.isArray(targetStack.cardIds) || targetStack.cardIds.length <= 0) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Target stack does not exist.');
  }

  const isSameStackLocation =
    sourceStackKind === STACK_KINDS.ACTIVE &&
    targetZoneKind === ZONE_KINDS.ACTIVE
      ? true
      : sourceStackKind === STACK_KINDS.BENCH &&
          targetZoneKind === ZONE_KINDS.BENCH &&
          sourceBenchIndex === targetBenchIndex;

  if (isSameStackLocation) {
    return {
      sessionDoc,
      privateStateDoc,
    };
  }

  if (sourceStackKind === STACK_KINDS.ACTIVE) {
    board.active = targetStack;
  } else {
    bench[sourceBenchIndex] = targetStack;
  }

  if (targetZoneKind === ZONE_KINDS.ACTIVE) {
    board.active = sourceStack;
  } else {
    bench[targetBenchIndex] = sourceStack;
  }
  board.bench = bench;

  if (
    sessionDoc.status === SESSION_STATUS.WAITING ||
    sessionDoc.status === SESSION_STATUS.READY
  ) {
    sessionDoc.status = SESSION_STATUS.PLAYING;
  }

  return {
    sessionDoc,
    privateStateDoc,
  };
}

function resolveTargetStack(board, stackKind, benchIndex) {
  if (stackKind === STACK_KINDS.ACTIVE) {
    return board.active || null;
  }
  if (stackKind === STACK_KINDS.BENCH) {
    const index = Number(benchIndex);
    if (!Number.isInteger(index) || index < 0) {
      return null;
    }
    return asArray(board.bench)[index] || null;
  }
  return null;
}

function moveTopCardFromSourceToZone({
  sessionDoc,
  privateStateDoc,
  playerId,
  action,
}) {
  const sourceZone = action?.sourceZone;
  const targetZoneKind = action?.targetZoneKind || ZONE_KINDS.HAND;
  const hand = asArray(privateStateDoc?.zones?.hand);
  const board = resolvePlayerBoard(sessionDoc, playerId);
  const counters = resolvePlayerCounters(sessionDoc, playerId);
  let movingCardId = null;

  if (sourceZone === 'player-deck') {
    const deck = asArray(privateStateDoc?.zones?.deck);
    const [topCardRef] = deck.splice(0, 1);
    privateStateDoc.zones.deck = deck;
    movingCardId = topCardRef?.cardId || null;
    counters.deckCount = deck.length;
  } else if (sourceZone === 'player-prize') {
    if (targetZoneKind !== ZONE_KINDS.HAND) {
      throw new GameStateError(
        ERROR_CODES.INVALID_STATE,
        `Unsupported targetZoneKind for source ${sourceZone}: ${String(targetZoneKind)}`
      );
    }
    const prize = asArray(board.prize);
    if (prize.length > 0) {
      const randomIndex = Math.floor(Math.random() * prize.length);
      const [picked] = prize.splice(randomIndex, 1);
      board.prize = prize;
      movingCardId = picked?.cardId || null;
    }
  } else {
    throw new GameStateError(
      ERROR_CODES.INVALID_STATE,
      `Unsupported sourceZone for pile move: ${String(sourceZone)}`
    );
  }

  if (!movingCardId) {
    throw new GameStateError(ERROR_CODES.NOT_FOUND, 'No card available to move from source zone.');
  }

  if (targetZoneKind === ZONE_KINDS.HAND) {
    hand.push(createOwnerVisibleCardRef(movingCardId));
    privateStateDoc.zones.hand = hand;
    counters.handCount = hand.length;
  } else if (targetZoneKind === ZONE_KINDS.DISCARD) {
    const imageUrl = resolveImageUrlFromPrivateState(privateStateDoc, movingCardId);
    board.discard = [
      ...asArray(board.discard),
      createPublicCardRef(movingCardId, {
        imageUrl,
      }),
    ];
  } else {
    throw new GameStateError(
      ERROR_CODES.INVALID_STATE,
      `Unsupported targetZoneKind: ${String(targetZoneKind)}`
    );
  }

  if (
    sessionDoc.status === SESSION_STATUS.WAITING ||
    sessionDoc.status === SESSION_STATUS.READY
  ) {
    sessionDoc.status = SESSION_STATUS.PLAYING;
  }

  return {
    sessionDoc,
    privateStateDoc,
  };
}

function applyToolToStack({ sessionDoc, action }) {
  const targetPlayerId = action?.targetPlayerId;
  const targetBoard = resolvePlayerBoard(sessionDoc, targetPlayerId);
  const targetStack = resolveTargetStack(
    targetBoard,
    action?.targetStackKind,
    action?.targetBenchIndex
  );

  if (!targetStack) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Drop target stack does not exist.');
  }

  if (action.dragType === DRAG_TYPES.DAMAGE_COUNTER) {
    const increment = Number(action.toolValue);
    if (!Number.isFinite(increment) || increment <= 0) {
      throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Invalid damage counter value.');
    }
    targetStack.damage = Number(targetStack.damage || 0) + increment;
    return {
      sessionDoc,
    };
  }

  if (action.dragType === DRAG_TYPES.STATUS_BADGE) {
    const conditionKey = STATUS_BADGE_TO_CONDITION_KEY[action.toolValue];
    if (!conditionKey) {
      throw new GameStateError(
        ERROR_CODES.INVALID_STATE,
        `Unsupported status badge: ${String(action.toolValue)}`
      );
    }

    targetStack.specialConditions = {
      poisoned: Boolean(targetStack?.specialConditions?.poisoned),
      burned: Boolean(targetStack?.specialConditions?.burned),
      asleep: Boolean(targetStack?.specialConditions?.asleep),
      paralyzed: Boolean(targetStack?.specialConditions?.paralyzed),
      confused: Boolean(targetStack?.specialConditions?.confused),
    };
    targetStack.specialConditions[conditionKey] = true;
    return {
      sessionDoc,
    };
  }

  throw new GameStateError(
    ERROR_CODES.INVALID_STATE,
    `Unsupported dragType for tool application: ${String(action.dragType)}`
  );
}

export function mutateDocsForDropIntent({ sessionDoc, privateStateDoc, playerId, intent }) {
  if (!intent?.accepted || !intent?.action) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Accepted intent with action is required.');
  }

  if (intent.action.kind === INTENT_ACTIONS.MOVE_CARD_FROM_HAND_TO_ZONE) {
    return moveCardFromSourceToZone({
      sessionDoc,
      privateStateDoc,
      playerId,
      action: intent.action,
    });
  }

  if (intent.action.kind === INTENT_ACTIONS.MOVE_TOP_CARD_FROM_SOURCE_TO_HAND) {
    return moveTopCardFromSourceToZone({
      sessionDoc,
      privateStateDoc,
      playerId,
      action: intent.action,
    });
  }

  if (intent.action.kind === INTENT_ACTIONS.MOVE_CARD_TO_DECK_EDGE) {
    return moveCardToDeckEdge({
      sessionDoc,
      privateStateDoc,
      playerId,
      action: intent.action,
    });
  }

  if (intent.action.kind === INTENT_ACTIONS.MOVE_CARD_TO_STACK_EDGE) {
    return moveCardToStackEdge({
      sessionDoc,
      privateStateDoc,
      playerId,
      action: intent.action,
    });
  }

  if (intent.action.kind === INTENT_ACTIONS.SWAP_STACKS) {
    return swapStacksBetweenZones({
      sessionDoc,
      privateStateDoc,
      playerId,
      action: intent.action,
    });
  }

  if (intent.action.kind === INTENT_ACTIONS.APPLY_TOOL_TO_STACK) {
    return applyToolToStack({
      sessionDoc,
      action: intent.action,
    });
  }

  throw new GameStateError(
    ERROR_CODES.INVALID_STATE,
    `Unsupported intent action kind: ${String(intent.action.kind)}`
  );
}

export async function applyDropMutation({
  sessionId,
  playerId,
  actorUid,
  expectedRevision,
  intent,
}) {
  if (!intent?.accepted) {
    return {
      skipped: true,
      reason: intent?.reason || 'intent-not-accepted',
    };
  }

  return applySessionMutation({
    sessionId,
    playerId,
    actorUid,
    expectedRevision,
    mutate: ({ sessionDoc, privateStateDoc }) =>
      mutateDocsForDropIntent({
        sessionDoc,
        privateStateDoc,
        playerId,
        intent,
      }),
  });
}
