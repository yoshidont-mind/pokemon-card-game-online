import { createMarker, shuffleArray } from '../../game-state/builders';
import { ERROR_CODES, GameStateError } from '../../game-state/errors';
import { applySessionMutation } from '../../game-state/transactionRunner';
import {
  PRIVATE_ZONE,
  PUBLIC_ZONE,
  STACK_KIND,
  addCardIdsToStack,
  asArray,
  createDeckCardRef,
  createOwnerVisibleCardRef,
  createPublicCardRef as createPublicCardRefFromHelper,
  ensureBoard,
  ensureCounters,
  ensureStack,
  getStack,
  normalizeBenchSlots,
  removeCardIdsFromStack,
  removeCardRefByCardId,
  resolvePrivateZone,
  resolvePublicZone,
  setStack,
} from './helpers/zoneAccessors';
import { attachCardIdsToStack } from './helpers/cardMovement';
import {
  clearAllStatusConditions,
  healDamageFromStack,
  knockoutStackToDiscard,
  moveDamageBetweenStacks,
  setStatusCondition,
} from './helpers/stackEditing';
import { INTERNAL_OPERATION_IDS, OPERATION_IDS } from './operationIds';

const OPERATION_REQUEST_STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
});

function resolveOpponentPlayerId(playerId) {
  return playerId === 'player1' ? 'player2' : 'player1';
}

function normalizeCount(value, fallback = 1) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) {
    return numeric;
  }
  return fallback;
}

function ensureTurnContext(sessionDoc) {
  if (!sessionDoc.publicState.turnContext || typeof sessionDoc.publicState.turnContext !== 'object') {
    sessionDoc.publicState.turnContext = {
      turnNumber: 1,
      currentPlayer: null,
    };
  }
  return sessionDoc.publicState.turnContext;
}

function ensureOperationRequests(sessionDoc) {
  if (!Array.isArray(sessionDoc?.publicState?.operationRequests)) {
    sessionDoc.publicState.operationRequests = [];
  }
  return sessionDoc.publicState.operationRequests;
}

function syncPrivateCounters(sessionDoc, privateStateDoc, playerId) {
  const counters = ensureCounters(sessionDoc, playerId);
  const hand = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.HAND);
  const deck = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.DECK);
  counters.handCount = hand.length;
  counters.deckCount = deck.length;
}

function touchPlayingStatus(sessionDoc) {
  if (sessionDoc.status === 'waiting' || sessionDoc.status === 'ready') {
    sessionDoc.status = 'playing';
  }
}

function resolveTargetStack(board, payload, {
  targetPrefix = 'target',
} = {}) {
  const stackKind = payload?.[`${targetPrefix}StackKind`] === STACK_KIND.BENCH ? STACK_KIND.BENCH : STACK_KIND.ACTIVE;
  const benchIndex = stackKind === STACK_KIND.BENCH
    ? Number(payload?.[`${targetPrefix}BenchIndex`])
    : null;
  const stack = getStack(board, stackKind, benchIndex);
  return {
    stack,
    stackKind,
    benchIndex,
  };
}

function takeCardRefsByIds(zone, cardIds = []) {
  const removed = [];
  for (const cardId of asArray(cardIds)) {
    const hit = removeCardRefByCardId(zone, cardId);
    if (hit) {
      removed.push(hit);
    }
  }
  return removed;
}

function takeTopCardRefs(zone, count = 1) {
  const safeCount = normalizeCount(count, 1);
  const removed = [];
  for (let i = 0; i < safeCount && zone.length > 0; i += 1) {
    const next = zone.shift();
    if (next) {
      removed.push(next);
    }
  }
  return removed;
}

function toCardIdsFromRefs(refs) {
  return asArray(refs)
    .map((ref) => ref?.cardId)
    .filter(Boolean);
}

function placeCardIdsToDestination({
  sessionDoc,
  privateStateDoc,
  playerId,
  destination,
  cardIds,
  payload,
}) {
  const normalizedCardIds = asArray(cardIds).filter(Boolean);
  if (!normalizedCardIds.length) {
    return;
  }

  const board = ensureBoard(sessionDoc, playerId);

  if (destination === 'hand') {
    const hand = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.HAND);
    hand.push(...normalizedCardIds.map((cardId) => createOwnerVisibleCardRef(cardId)));
    return;
  }

  if (destination === 'deck-top') {
    const deck = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.DECK);
    deck.unshift(...normalizedCardIds.map((cardId) => createDeckCardRef(cardId)));
    return;
  }

  if (destination === 'deck-bottom' || destination === 'deck') {
    const deck = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.DECK);
    deck.push(...normalizedCardIds.map((cardId) => createDeckCardRef(cardId)));
    return;
  }

  if (destination === 'discard') {
    const discard = resolvePublicZone(board, PUBLIC_ZONE.DISCARD);
    discard.push(...normalizedCardIds.map((cardId) => createPublicCardRefFromHelper(cardId)));
    return;
  }

  if (destination === 'lost' || destination === 'lostZone') {
    const lostZone = resolvePublicZone(board, PUBLIC_ZONE.LOST);
    lostZone.push(...normalizedCardIds.map((cardId) => createPublicCardRefFromHelper(cardId)));
    return;
  }

  if (destination === 'prize') {
    const prize = resolvePublicZone(board, PUBLIC_ZONE.PRIZE);
    prize.push(...normalizedCardIds.map((cardId) => createPublicCardRefFromHelper(cardId, { isFaceDown: true })));
    return;
  }

  if (destination === 'active' || destination === 'bench') {
    const stackKind = destination === 'bench' ? STACK_KIND.BENCH : STACK_KIND.ACTIVE;
    const benchIndex = stackKind === STACK_KIND.BENCH ? Number(payload?.targetBenchIndex) : null;
    const stack = ensureStack(board, stackKind, {
      playerId,
      benchIndex,
    });
    addCardIdsToStack(stack, normalizedCardIds);
  }
}

function takeCardIdsFromSource({
  sessionDoc,
  privateStateDoc,
  playerId,
  source,
  payload,
}) {
  const board = ensureBoard(sessionDoc, playerId);

  if (source === 'hand') {
    const hand = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.HAND);
    if (asArray(payload.cardIds).length > 0) {
      return toCardIdsFromRefs(takeCardRefsByIds(hand, payload.cardIds));
    }
    if (payload.cardId) {
      return toCardIdsFromRefs(takeCardRefsByIds(hand, [payload.cardId]));
    }
    return toCardIdsFromRefs(takeTopCardRefs(hand, payload.count));
  }

  if (source === 'deck') {
    const deck = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.DECK);
    if (asArray(payload.cardIds).length > 0) {
      return toCardIdsFromRefs(takeCardRefsByIds(deck, payload.cardIds));
    }
    if (payload.cardId) {
      return toCardIdsFromRefs(takeCardRefsByIds(deck, [payload.cardId]));
    }
    return toCardIdsFromRefs(takeTopCardRefs(deck, payload.count));
  }

  if (source === 'discard') {
    const discard = resolvePublicZone(board, PUBLIC_ZONE.DISCARD);
    if (asArray(payload.cardIds).length > 0) {
      return toCardIdsFromRefs(takeCardRefsByIds(discard, payload.cardIds));
    }
    return toCardIdsFromRefs(takeTopCardRefs(discard, payload.count));
  }

  if (source === 'lost' || source === 'lostZone') {
    const lostZone = resolvePublicZone(board, PUBLIC_ZONE.LOST);
    if (asArray(payload.cardIds).length > 0) {
      return toCardIdsFromRefs(takeCardRefsByIds(lostZone, payload.cardIds));
    }
    return toCardIdsFromRefs(takeTopCardRefs(lostZone, payload.count));
  }

  if (source === 'prize') {
    const prize = resolvePublicZone(board, PUBLIC_ZONE.PRIZE);
    if (asArray(payload.cardIds).length > 0) {
      return toCardIdsFromRefs(takeCardRefsByIds(prize, payload.cardIds));
    }
    return toCardIdsFromRefs(takeTopCardRefs(prize, payload.count));
  }

  if (source === 'active' || source === 'bench') {
    const stackKind = source === 'bench' ? STACK_KIND.BENCH : STACK_KIND.ACTIVE;
    const benchIndex = stackKind === STACK_KIND.BENCH ? Number(payload.sourceBenchIndex) : null;
    const stack = getStack(board, stackKind, benchIndex);
    if (!stack) {
      return [];
    }
    return removeCardIdsFromStack(stack, {
      cardIds: asArray(payload.cardIds),
      count: payload.count,
    });
  }

  return [];
}

function listCardIdsFromSourceZone({
  sessionDoc,
  privateStateDoc,
  playerId,
  source,
  payload,
}) {
  const board = ensureBoard(sessionDoc, playerId);

  if (source === 'hand') {
    const hand = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.HAND);
    return hand.map((ref) => ref?.cardId).filter(Boolean);
  }

  if (source === 'deck') {
    const deck = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.DECK);
    return deck.map((ref) => ref?.cardId).filter(Boolean);
  }

  if (source === 'discard') {
    const discard = resolvePublicZone(board, PUBLIC_ZONE.DISCARD);
    return discard.map((ref) => ref?.cardId).filter(Boolean);
  }

  if (source === 'lost' || source === 'lostZone') {
    const lostZone = resolvePublicZone(board, PUBLIC_ZONE.LOST);
    return lostZone.map((ref) => ref?.cardId).filter(Boolean);
  }

  if (source === 'prize') {
    const prize = resolvePublicZone(board, PUBLIC_ZONE.PRIZE);
    return prize.map((ref) => ref?.cardId).filter(Boolean);
  }

  if (source === 'active') {
    const stack = getStack(board, STACK_KIND.ACTIVE);
    return asArray(stack?.cardIds).filter(Boolean);
  }

  if (source === 'bench') {
    const benchIndex = Number(payload?.sourceBenchIndex);
    if (Number.isInteger(benchIndex) && benchIndex >= 0) {
      const benchStack = getStack(board, STACK_KIND.BENCH, benchIndex);
      return asArray(benchStack?.cardIds).filter(Boolean);
    }
    return normalizeBenchSlots(board.bench)
      .flatMap((stack) => asArray(stack?.cardIds))
      .filter(Boolean);
  }

  return [];
}

function createOperationMarker({
  playerId,
  opId,
  note,
  now,
}) {
  return createMarker({
    markerId: `op_${playerId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    targetType: 'session',
    targetId: opId,
    label: `${opId}: ${note || '実行'}`,
    expiresHint: 'manual-clear',
    createdBy: playerId,
    createdAt: now,
  });
}

function addMarkerToPlayerBoard(sessionDoc, playerId, marker) {
  const board = ensureBoard(sessionDoc, playerId);
  if (!Array.isArray(board.markers)) {
    board.markers = [];
  }
  board.markers.push(marker);
}

function createOperationRequest({
  sessionDoc,
  opId,
  requestType,
  actorPlayerId,
  targetPlayerId,
  payload,
  now,
}) {
  const requests = ensureOperationRequests(sessionDoc);
  const request = {
    requestId: `req_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    opId,
    requestType,
    status: OPERATION_REQUEST_STATUS.PENDING,
    actorPlayerId,
    targetPlayerId,
    payload: {
      count: normalizeCount(payload?.count, 1),
      note: payload?.note || '',
    },
    createdAt: now,
    resolvedAt: null,
    resolvedByPlayerId: null,
    result: null,
  };
  requests.push(request);
  return request;
}

function resolveRequestById(sessionDoc, requestId) {
  const requests = ensureOperationRequests(sessionDoc);
  const index = requests.findIndex((entry) => entry?.requestId === requestId);
  if (index < 0) {
    throw new GameStateError(ERROR_CODES.NOT_FOUND, `Operation request not found: ${requestId}`);
  }
  return {
    requests,
    request: requests[index],
  };
}

function applyRequestApproval({
  sessionDoc,
  privateStateDoc,
  playerId,
  request,
  now,
}) {
  if (request.status !== OPERATION_REQUEST_STATUS.PENDING) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Request is already resolved.');
  }

  if (request.targetPlayerId !== playerId) {
    throw new GameStateError(ERROR_CODES.PERMISSION_DENIED, 'Only target player can resolve this request.');
  }

  const board = ensureBoard(sessionDoc, playerId);
  const hand = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.HAND);

  if (request.requestType === 'opponent-discard-random-hand') {
    const count = normalizeCount(request?.payload?.count, 1);
    const removing = Math.min(hand.length, count);
    const discarded = [];

    for (let i = 0; i < removing; i += 1) {
      const randomIndex = Math.floor(Math.random() * hand.length);
      const [picked] = hand.splice(randomIndex, 1);
      if (picked?.cardId) {
        discarded.push(picked.cardId);
      }
    }

    const discard = resolvePublicZone(board, PUBLIC_ZONE.DISCARD);
    discard.push(...discarded.map((cardId) => createPublicCardRefFromHelper(cardId)));

    request.status = OPERATION_REQUEST_STATUS.COMPLETED;
    request.resolvedAt = now;
    request.resolvedByPlayerId = playerId;
    request.result = {
      discardedCount: discarded.length,
      discardedCardIds: discarded,
    };
    return;
  }

  if (request.requestType === 'opponent-reveal-hand') {
    request.status = OPERATION_REQUEST_STATUS.COMPLETED;
    request.resolvedAt = now;
    request.resolvedByPlayerId = playerId;
    request.result = {
      revealedCount: hand.length,
      revealedCardIds: hand.map((ref) => ref?.cardId).filter(Boolean),
    };
    return;
  }

  throw new GameStateError(
    ERROR_CODES.INVALID_STATE,
    `Unsupported request type: ${String(request.requestType)}`
  );
}

function applyRequestRejection({ request, playerId, now }) {
  if (request.status !== OPERATION_REQUEST_STATUS.PENDING) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Request is already resolved.');
  }

  if (request.targetPlayerId !== playerId) {
    throw new GameStateError(ERROR_CODES.PERMISSION_DENIED, 'Only target player can resolve this request.');
  }

  request.status = OPERATION_REQUEST_STATUS.REJECTED;
  request.resolvedAt = now;
  request.resolvedByPlayerId = playerId;
  request.result = {
    reason: 'rejected-by-target-player',
  };
}

function runDirectOperation({
  sessionDoc,
  privateStateDoc,
  playerId,
  opId,
  payload,
  now,
}) {
  const board = ensureBoard(sessionDoc, playerId);
  const turnContext = ensureTurnContext(sessionDoc);

  if (opId === OPERATION_IDS.OP_A01) {
    turnContext.lastCoinResult = Math.random() < 0.5 ? 'heads' : 'tails';
    turnContext.lastCoinAt = now;
    return;
  }

  if (opId === OPERATION_IDS.OP_A02 || opId === OPERATION_IDS.OP_A04) {
    addMarkerToPlayerBoard(
      sessionDoc,
      playerId,
      createOperationMarker({
        playerId,
        opId,
        note: payload.note || '記録',
        now,
      })
    );
    return;
  }

  if (opId === OPERATION_IDS.OP_A05) {
    const sourceZone = payload.sourceZone || 'hand';
    const candidateCardIds = listCardIdsFromSourceZone({
      sessionDoc,
      privateStateDoc,
      playerId,
      source: sourceZone,
      payload,
    });

    const requestedCount = normalizeCount(payload.count, 1);
    const selectedCardIds = shuffleArray(candidateCardIds).slice(
      0,
      Math.max(0, Math.min(requestedCount, candidateCardIds.length))
    );

    turnContext.lastRandomSelection = {
      zone: sourceZone,
      cardIds: selectedCardIds,
      at: now,
    };
    return;
  }

  if (opId === OPERATION_IDS.OP_A06 || opId === OPERATION_IDS.OP_B07) {
    const deck = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.DECK);
    const orderCardIds = asArray(payload.orderCardIds);
    if (!orderCardIds.length) {
      return;
    }

    const currentTop = deck.slice(0, orderCardIds.length);
    const topById = new Map(currentTop.map((ref) => [ref?.cardId, ref]));
    const reorderedTop = orderCardIds
      .map((cardId) => topById.get(cardId))
      .filter(Boolean);

    if (reorderedTop.length === currentTop.length) {
      deck.splice(0, reorderedTop.length, ...reorderedTop);
    }
    return;
  }

  if (opId === OPERATION_IDS.OP_B01) {
    const deck = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.DECK);
    const shuffled = shuffleArray(deck);
    deck.splice(0, deck.length, ...shuffled);
    return;
  }

  if (opId === OPERATION_IDS.OP_B03) {
    const deck = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.DECK);
    const hand = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.HAND);
    const drawn = takeTopCardRefs(deck, payload.count || 1).map((ref) => ({
      ...ref,
      isFaceDown: false,
      visibility: 'ownerOnly',
    }));
    hand.push(...drawn);
    return;
  }

  if (opId === OPERATION_IDS.OP_B04) {
    const deck = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.DECK);
    const discard = resolvePublicZone(board, PUBLIC_ZONE.DISCARD);
    const milled = takeTopCardRefs(deck, payload.count || 1);
    discard.push(...milled.map((ref) => createPublicCardRefFromHelper(ref.cardId)));
    return;
  }

  if (opId === OPERATION_IDS.OP_B09) {
    const hand = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.HAND);
    const discard = resolvePublicZone(board, PUBLIC_ZONE.DISCARD);
    const toDiscard = asArray(payload.cardIds).length > 0
      ? takeCardRefsByIds(hand, payload.cardIds)
      : takeTopCardRefs(hand, payload.count || 1);
    discard.push(...toDiscard.map((ref) => createPublicCardRefFromHelper(ref.cardId)));
    return;
  }

  if (opId === OPERATION_IDS.OP_B10) {
    const hand = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.HAND);
    const deck = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.DECK);
    const handToDeck = hand.map((ref) => createDeckCardRef(ref.cardId));
    hand.splice(0, hand.length);
    deck.push(...shuffleArray(handToDeck));
    return;
  }

  if (opId === OPERATION_IDS.OP_B02 || opId === OPERATION_IDS.OP_B05 || opId === OPERATION_IDS.OP_D05) {
    const source = payload.sourceZone || 'deck';
    const destination = payload.targetZone || (opId === OPERATION_IDS.OP_B02 ? 'hand' : 'deck-bottom');
    const cardIds = takeCardIdsFromSource({
      sessionDoc,
      privateStateDoc,
      playerId,
      source,
      payload,
    });

    placeCardIdsToDestination({
      sessionDoc,
      privateStateDoc,
      playerId,
      destination,
      cardIds,
      payload,
    });

    if (payload.shuffle === true && destination === 'deck-bottom') {
      const deck = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.DECK);
      const shuffled = shuffleArray(deck);
      deck.splice(0, deck.length, ...shuffled);
    }
    return;
  }

  if (opId === OPERATION_IDS.OP_C02 || opId === OPERATION_IDS.OP_C05) {
    const benchIndex = Number(payload.benchIndex);
    const bench = normalizeBenchSlots(board.bench);
    const benchStack = bench[benchIndex] || null;
    if (!benchStack) {
      return;
    }

    const active = board.active || null;
    board.active = benchStack;
    bench[benchIndex] = active;
    board.bench = bench;
    return;
  }

  if (opId === OPERATION_IDS.OP_C03) {
    const hand = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.HAND);
    const benchIndex = Number(payload.benchIndex);
    const cardId = payload.cardId || asArray(payload.cardIds)[0];
    const cardRef = removeCardRefByCardId(hand, cardId);
    if (!cardRef) {
      return;
    }

    const stack = ensureStack(board, STACK_KIND.BENCH, {
      playerId,
      benchIndex,
    });
    addCardIdsToStack(stack, [cardRef.cardId]);
    return;
  }

  if (opId === OPERATION_IDS.OP_C04) {
    const targetPlayerId = payload.targetPlayerId || resolveOpponentPlayerId(playerId);
    const targetBoard = ensureBoard(sessionDoc, targetPlayerId);
    const bench = normalizeBenchSlots(targetBoard.bench);
    const benchIndex = Number(payload.benchIndex);
    const benchStack = bench[benchIndex] || null;
    if (!benchStack) {
      return;
    }

    const active = targetBoard.active || null;
    targetBoard.active = benchStack;
    bench[benchIndex] = active;
    targetBoard.bench = bench;
    return;
  }

  if (opId === OPERATION_IDS.OP_D01) {
    const mode = payload.mode || 'take';
    if (mode === 'set-from-hand') {
      const hand = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.HAND);
      const prize = resolvePublicZone(board, PUBLIC_ZONE.PRIZE);
      const moving = asArray(payload.cardIds).length
        ? takeCardRefsByIds(hand, payload.cardIds)
        : takeTopCardRefs(hand, payload.count || 1);
      prize.push(...moving.map((ref) => createPublicCardRefFromHelper(ref.cardId, { isFaceDown: true })));
      return;
    }

    const prize = resolvePublicZone(board, PUBLIC_ZONE.PRIZE);
    const hand = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.HAND);
    const moving = asArray(payload.cardIds).length
      ? takeCardRefsByIds(prize, payload.cardIds)
      : takeTopCardRefs(prize, payload.count || 1);
    hand.push(...moving.map((ref) => createOwnerVisibleCardRef(ref.cardId)));
    return;
  }

  if (opId === OPERATION_IDS.OP_D02 || opId === OPERATION_IDS.OP_D06 || opId === OPERATION_IDS.OP_D07) {
    const source = payload.sourceZone || 'hand';
    const destination =
      opId === OPERATION_IDS.OP_D02
        ? 'discard'
        : opId === OPERATION_IDS.OP_D06
          ? 'lost'
          : 'hand';

    const cardIds = takeCardIdsFromSource({
      sessionDoc,
      privateStateDoc,
      playerId,
      source,
      payload,
    });

    placeCardIdsToDestination({
      sessionDoc,
      privateStateDoc,
      playerId,
      destination,
      cardIds,
      payload,
    });
    return;
  }

  if (opId === OPERATION_IDS.OP_D03) {
    const mode = payload.mode || 'evolve';
    const targetStackInfo = resolveTargetStack(board, payload);
    if (!targetStackInfo.stack) {
      return;
    }

    if (mode === 'devolve') {
      const removed = removeCardIdsFromStack(targetStackInfo.stack, {
        count: 1,
      });
      placeCardIdsToDestination({
        sessionDoc,
        privateStateDoc,
        playerId,
        destination: payload.targetZone || 'hand',
        cardIds: removed,
        payload,
      });
      return;
    }

    const hand = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.HAND);
    const cardId = payload.cardId || asArray(payload.cardIds)[0];
    const cardRef = removeCardRefByCardId(hand, cardId);
    if (!cardRef) {
      return;
    }
    addCardIdsToStack(targetStackInfo.stack, [cardRef.cardId]);
    return;
  }

  if (opId === OPERATION_IDS.OP_D04) {
    const discard = resolvePublicZone(board, PUBLIC_ZONE.DISCARD);
    const hand = resolvePrivateZone(privateStateDoc, PRIVATE_ZONE.HAND);
    const moving = asArray(payload.cardIds).length
      ? takeCardRefsByIds(discard, payload.cardIds)
      : takeTopCardRefs(discard, payload.count || 1);
    hand.push(...moving.map((ref) => createOwnerVisibleCardRef(ref.cardId)));
    return;
  }

  if (opId === OPERATION_IDS.OP_D08) {
    const active = getStack(board, STACK_KIND.ACTIVE);
    if (!active) {
      return;
    }
    const removedCardIds = asArray(active.cardIds);
    setStack(board, STACK_KIND.ACTIVE, null);
    placeCardIdsToDestination({
      sessionDoc,
      privateStateDoc,
      playerId,
      destination: payload.targetZone || 'hand',
      cardIds: removedCardIds,
      payload,
    });
    return;
  }

  if (opId === OPERATION_IDS.OP_E02 || opId === OPERATION_IDS.OP_E06) {
    const source = payload.sourceZone || 'hand';
    const target = resolveTargetStack(board, payload);
    if (!target.stack) {
      return;
    }

    const cardIds = takeCardIdsFromSource({
      sessionDoc,
      privateStateDoc,
      playerId,
      source,
      payload,
    });
    attachCardIdsToStack(target.stack, cardIds);
    return;
  }

  if (opId === OPERATION_IDS.OP_E01 || opId === OPERATION_IDS.OP_E04) {
    if (opId === OPERATION_IDS.OP_E04 && (payload.mode || '').toLowerCase() === 'stadium') {
      sessionDoc.publicState.stadium = null;
      return;
    }

    const target = resolveTargetStack(board, payload);
    if (!target.stack) {
      return;
    }
    const removed = removeCardIdsFromStack(target.stack, {
      cardIds: asArray(payload.cardIds),
      count: payload.count || 1,
    });
    const discard = resolvePublicZone(board, PUBLIC_ZONE.DISCARD);
    discard.push(...removed.map((cardId) => createPublicCardRefFromHelper(cardId)));
    return;
  }

  if (opId === OPERATION_IDS.OP_E05) {
    const source = resolveTargetStack(board, payload, { targetPrefix: 'source' });
    const target = resolveTargetStack(board, payload);
    if (!source.stack || !target.stack) {
      return;
    }

    const moving = removeCardIdsFromStack(source.stack, {
      cardIds: asArray(payload.cardIds),
      count: payload.count || 1,
    });
    attachCardIdsToStack(target.stack, moving);
    return;
  }

  if (opId === OPERATION_IDS.OP_E07) {
    const mode = payload.mode || 'set';
    if (mode === 'clear') {
      sessionDoc.publicState.stadium = null;
      return;
    }

    const source = payload.sourceZone || 'hand';
    const moving = takeCardIdsFromSource({
      sessionDoc,
      privateStateDoc,
      playerId,
      source,
      payload,
    });

    if (!moving.length) {
      return;
    }

    sessionDoc.publicState.stadium = {
      cardId: moving[0],
      ownerPlayerId: playerId,
      placedAt: now,
    };
    return;
  }

  if (opId === OPERATION_IDS.OP_F01 || opId === OPERATION_IDS.OP_F04) {
    const target = resolveTargetStack(board, payload);
    if (!target.stack) {
      return;
    }
    target.stack.damage = Math.max(0, Number(target.stack.damage || 0) + Number(payload.value || 0));
    return;
  }

  if (opId === OPERATION_IDS.OP_F05) {
    const target = resolveTargetStack(board, payload);
    healDamageFromStack(target.stack, payload.value || 0);
    return;
  }

  if (opId === OPERATION_IDS.OP_F02) {
    const target = resolveTargetStack(board, payload);
    const statusMap = {
      poison: 'poisoned',
      burn: 'burned',
      asleep: 'asleep',
      paralyzed: 'paralyzed',
      confused: 'confused',
    };
    setStatusCondition(target.stack, statusMap[payload.condition] || payload.condition, true);
    return;
  }

  if (opId === OPERATION_IDS.OP_F03) {
    const target = resolveTargetStack(board, payload);
    if (!target.stack) {
      return;
    }

    knockoutStackToDiscard(board, target.stackKind, target.benchIndex);
    return;
  }

  if (opId === OPERATION_IDS.OP_F06) {
    const active = getStack(board, STACK_KIND.ACTIVE);
    if (!active) {
      return;
    }
    active.damage = Math.max(0, Number(active.damage || 0) + Number(payload.value || 0));
    return;
  }

  if (opId === OPERATION_IDS.OP_F07) {
    const mode = payload.mode || 'clear-status';
    const target = resolveTargetStack(board, payload);
    if (!target.stack) {
      return;
    }

    if (mode === 'clear-status') {
      clearAllStatusConditions(target.stack);
      return;
    }

    addMarkerToPlayerBoard(
      sessionDoc,
      playerId,
      createOperationMarker({
        playerId,
        opId,
        note: payload.note || mode,
        now,
      })
    );
    return;
  }

  if (opId === OPERATION_IDS.OP_F08) {
    const source = resolveTargetStack(board, payload, { targetPrefix: 'source' });
    const target = resolveTargetStack(board, payload);
    if (!source.stack || !target.stack) {
      return;
    }
    moveDamageBetweenStacks(source.stack, target.stack, payload.value || 0);
    return;
  }

  if (
    opId === OPERATION_IDS.OP_G02 ||
    opId === OPERATION_IDS.OP_G03 ||
    opId === OPERATION_IDS.OP_G04 ||
    opId === OPERATION_IDS.OP_I01
  ) {
    addMarkerToPlayerBoard(
      sessionDoc,
      playerId,
      createOperationMarker({
        playerId,
        opId,
        note: payload.note || '継続効果',
        now,
      })
    );

    if (opId === OPERATION_IDS.OP_G02) {
      turnContext.supportUsed = Boolean(payload.supportUsed);
      turnContext.goodsUsedCount = Number.isInteger(payload.count) ? payload.count : turnContext.goodsUsedCount || 0;
    }
    return;
  }

  if (opId === OPERATION_IDS.OP_I03) {
    const mode = payload.mode || 'end-turn';
    const currentPlayer = turnContext.currentPlayer || playerId;
    const turnNumber = Number.isInteger(turnContext.turnNumber) ? turnContext.turnNumber : 1;

    if (mode === 'extra-turn') {
      turnContext.currentPlayer = currentPlayer;
      turnContext.turnNumber = turnNumber + 1;
      return;
    }

    turnContext.currentPlayer = currentPlayer === 'player1' ? 'player2' : 'player1';
    turnContext.turnNumber = turnNumber + 1;
    return;
  }

  throw new GameStateError(ERROR_CODES.INVALID_STATE, `Unsupported operation: ${String(opId)}`);
}

export function mutateDocsForOperationIntent({
  sessionDoc,
  privateStateDoc,
  playerId,
  intent,
  now,
}) {
  const action = intent?.action || intent;
  const opId = action?.opId;
  if (!opId) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Operation opId is required.');
  }

  if (opId === INTERNAL_OPERATION_IDS.REQUEST_APPROVE || opId === INTERNAL_OPERATION_IDS.REQUEST_REJECT) {
    const { request } = resolveRequestById(sessionDoc, action?.payload?.requestId);
    if (opId === INTERNAL_OPERATION_IDS.REQUEST_APPROVE) {
      applyRequestApproval({
        sessionDoc,
        privateStateDoc,
        playerId,
        request,
        now,
      });
    } else {
      applyRequestRejection({
        request,
        playerId,
        now,
      });
    }

    syncPrivateCounters(sessionDoc, privateStateDoc, playerId);
    touchPlayingStatus(sessionDoc);
    return {
      sessionDoc,
      privateStateDoc,
    };
  }

  runDirectOperation({
    sessionDoc,
    privateStateDoc,
    playerId,
    opId,
    payload: action?.payload || {},
    now,
  });

  syncPrivateCounters(sessionDoc, privateStateDoc, playerId);
  touchPlayingStatus(sessionDoc);

  return {
    sessionDoc,
    privateStateDoc,
  };
}

export function listPendingOperationRequests(sessionDoc, targetPlayerId) {
  return ensureOperationRequests(sessionDoc).filter(
    (request) =>
      request?.status === OPERATION_REQUEST_STATUS.PENDING &&
      (!targetPlayerId || request?.targetPlayerId === targetPlayerId)
  );
}

export function listResolvedOperationRequests(sessionDoc, playerId, {
  limit = 10,
} = {}) {
  const numericLimit = Number.isInteger(limit) && limit > 0 ? limit : 10;
  return ensureOperationRequests(sessionDoc)
    .filter((request) => request?.status && request.status !== OPERATION_REQUEST_STATUS.PENDING)
    .filter((request) =>
      !playerId ||
      request?.actorPlayerId === playerId ||
      request?.targetPlayerId === playerId
    )
    .sort((left, right) => {
      const leftKey = String(left?.resolvedAt || left?.createdAt || '');
      const rightKey = String(right?.resolvedAt || right?.createdAt || '');
      return rightKey.localeCompare(leftKey);
    })
    .slice(0, numericLimit);
}

export async function applyOperationMutation({
  sessionId,
  playerId,
  actorUid,
  expectedRevision,
  intent,
}) {
  if (!intent?.accepted || !intent?.action) {
    return {
      skipped: true,
      reason: intent?.message || 'intent-not-accepted',
    };
  }

  const action = intent.action;

  if (action.mode === 'request') {
    const requestType =
      action.opId === OPERATION_IDS.OP_B11
        ? 'opponent-discard-random-hand'
        : action.opId === OPERATION_IDS.OP_A03 || action.opId === OPERATION_IDS.OP_B12
          ? 'opponent-reveal-hand'
          : null;

    if (!requestType) {
      throw new GameStateError(ERROR_CODES.INVALID_STATE, `Unsupported request opId: ${action.opId}`);
    }

    return applySessionMutation({
      sessionId,
      playerId,
      actorUid,
      expectedRevision,
      touchPrivateState: false,
      mutate: ({ sessionDoc, now }) => {
        createOperationRequest({
          sessionDoc,
          opId: action.opId,
          requestType,
          actorPlayerId: playerId,
          targetPlayerId: action.payload.targetPlayerId,
          payload: action.payload,
          now,
        });

        if (sessionDoc.status === 'waiting' || sessionDoc.status === 'ready') {
          sessionDoc.status = 'playing';
        }

        return { sessionDoc };
      },
    });
  }

  return applySessionMutation({
    sessionId,
    playerId,
    actorUid,
    expectedRevision,
    mutate: ({ sessionDoc, privateStateDoc, now }) =>
      mutateDocsForOperationIntent({
        sessionDoc,
        privateStateDoc,
        playerId,
        intent,
        now,
      }),
  });
}
