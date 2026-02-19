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

function createPublicCardRef(cardId) {
  return createCardRef({
    cardId,
    orientation: ORIENTATION.VERTICAL,
    isFaceDown: false,
    visibility: VISIBILITY.PUBLIC,
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

function moveCardFromHandToZone({ sessionDoc, privateStateDoc, playerId, action }) {
  const cardId = action?.cardId;
  if (!cardId) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'cardId is required.');
  }

  const hand = asArray(privateStateDoc?.zones?.hand);
  const handIndex = hand.findIndex((ref) => ref?.cardId === cardId);
  if (handIndex < 0) {
    throw new GameStateError(
      ERROR_CODES.INVARIANT_VIOLATION,
      `Card ${cardId} is not in hand.`
    );
  }

  const [cardRef] = hand.splice(handIndex, 1);
  const publicBoard = resolvePlayerBoard(sessionDoc, playerId);
  const playerCounters = resolvePlayerCounters(sessionDoc, playerId);
  const targetZoneKind = action.targetZoneKind;

  if (targetZoneKind === ZONE_KINDS.ACTIVE) {
    if (publicBoard.active) {
      throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Active slot is already occupied.');
    }
    publicBoard.active = createStackRef({
      stackId: `s_${playerId}_active`,
      cardIds: [cardId],
      orientation: cardRef?.orientation || ORIENTATION.VERTICAL,
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
      orientation: cardRef?.orientation || ORIENTATION.VERTICAL,
      isFaceDown: false,
    });
    publicBoard.bench = bench;
  } else if (targetZoneKind === ZONE_KINDS.DISCARD) {
    publicBoard.discard = [...asArray(publicBoard.discard), createPublicCardRef(cardId)];
  } else if (targetZoneKind === ZONE_KINDS.LOST) {
    publicBoard.lostZone = [...asArray(publicBoard.lostZone), createPublicCardRef(cardId)];
  } else {
    throw new GameStateError(
      ERROR_CODES.INVALID_STATE,
      `Unsupported targetZoneKind: ${String(targetZoneKind)}`
    );
  }

  privateStateDoc.zones.hand = hand;
  playerCounters.handCount = hand.length;
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
    return moveCardFromHandToZone({
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
