import {
  BENCH_SLOT_COUNT,
  DRAG_TYPES,
  DROP_TYPES,
  INTENT_ACTIONS,
  REJECT_REASONS,
  STACK_KINDS,
  ZONE_KINDS,
} from './constants';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function reject(reason) {
  return {
    accepted: false,
    reason,
    action: null,
    highlightTarget: null,
  };
}

function accept({ action, highlightTarget }) {
  return {
    accepted: true,
    reason: null,
    action,
    highlightTarget,
  };
}

function isBenchIndexValid(value) {
  return Number.isInteger(value) && value >= 0 && value < BENCH_SLOT_COUNT;
}

function hasStack(boardSnapshot, playerId, stackKind, benchIndex) {
  const playerSnapshot = boardSnapshot?.players?.[playerId];
  if (!playerSnapshot) {
    return false;
  }
  if (stackKind === STACK_KINDS.ACTIVE) {
    return Boolean(playerSnapshot.activeExists);
  }
  if (stackKind === STACK_KINDS.BENCH && isBenchIndexValid(benchIndex)) {
    return Boolean(playerSnapshot.benchOccupied?.[benchIndex]);
  }
  return false;
}

function isZoneOccupied(boardSnapshot, playerId, zoneKind, benchIndex) {
  const playerSnapshot = boardSnapshot?.players?.[playerId];
  if (!playerSnapshot) {
    return true;
  }
  if (zoneKind === ZONE_KINDS.ACTIVE) {
    return Boolean(playerSnapshot.activeExists);
  }
  if (zoneKind === ZONE_KINDS.BENCH && isBenchIndexValid(benchIndex)) {
    return Boolean(playerSnapshot.benchOccupied?.[benchIndex]);
  }
  return false;
}

function isSupportedCardSourceZone(sourceZone) {
  return sourceZone === 'player-hand' || sourceZone === 'player-reveal';
}

export function createBoardSnapshot(sessionDoc) {
  const players = sessionDoc?.publicState?.players || {};

  const toPlayerSnapshot = (playerKey) => {
    const board = players?.[playerKey]?.board || {};
    const bench = asArray(board.bench);
    return {
      activeExists: Boolean(board.active),
      benchOccupied: Array.from({ length: BENCH_SLOT_COUNT }, (_, index) => Boolean(bench[index])),
    };
  };

  return {
    players: {
      player1: toPlayerSnapshot('player1'),
      player2: toPlayerSnapshot('player2'),
    },
  };
}

export function resolveDropIntent({
  dragPayload,
  dropPayload,
  boardSnapshot,
  actorPlayerId,
}) {
  if (!dragPayload || !dropPayload || !actorPlayerId) {
    return reject(REJECT_REASONS.INVALID_PAYLOAD);
  }

  if (dropPayload.dropType === DROP_TYPES.ZONE) {
    if (dragPayload.dragType === DRAG_TYPES.PILE_CARD) {
      if (
        dragPayload.sourceZone !== 'player-deck' &&
        dragPayload.sourceZone !== 'player-prize'
      ) {
        return reject(REJECT_REASONS.UNSUPPORTED_SOURCE);
      }
      if (dropPayload.targetPlayerId !== actorPlayerId) {
        return reject(REJECT_REASONS.PERMISSION_DENIED);
      }
      if (dropPayload.zoneKind !== ZONE_KINDS.HAND) {
        return reject(REJECT_REASONS.UNSUPPORTED_TARGET);
      }
      if (!Number.isFinite(dragPayload.availableCount) || Number(dragPayload.availableCount) <= 0) {
        return reject(REJECT_REASONS.TARGET_NOT_FOUND);
      }

      return accept({
        action: {
          kind: INTENT_ACTIONS.MOVE_TOP_CARD_FROM_SOURCE_TO_HAND,
          sourceZone: dragPayload.sourceZone,
          targetPlayerId: actorPlayerId,
          targetZoneKind: ZONE_KINDS.HAND,
          targetZoneId: dropPayload.zoneId,
        },
        highlightTarget: {
          type: DROP_TYPES.ZONE,
          zoneId: dropPayload.zoneId,
        },
      });
    }

    if (dragPayload.dragType !== DRAG_TYPES.CARD) {
      return reject(REJECT_REASONS.UNSUPPORTED_TARGET);
    }
    if (!isSupportedCardSourceZone(dragPayload.sourceZone)) {
      return reject(REJECT_REASONS.UNSUPPORTED_SOURCE);
    }
    if (dropPayload.targetPlayerId !== actorPlayerId) {
      return reject(REJECT_REASONS.PERMISSION_DENIED);
    }

    if (
      dropPayload.zoneKind !== ZONE_KINDS.HAND &&
      dropPayload.zoneKind !== ZONE_KINDS.ACTIVE &&
      dropPayload.zoneKind !== ZONE_KINDS.BENCH &&
      dropPayload.zoneKind !== ZONE_KINDS.REVEAL &&
      dropPayload.zoneKind !== ZONE_KINDS.DISCARD &&
      dropPayload.zoneKind !== ZONE_KINDS.LOST &&
      dropPayload.zoneKind !== ZONE_KINDS.PRIZE &&
      dropPayload.zoneKind !== ZONE_KINDS.STADIUM
    ) {
      return reject(REJECT_REASONS.UNSUPPORTED_TARGET);
    }

    if (dragPayload.sourceZone === 'player-hand' && dropPayload.zoneKind === ZONE_KINDS.HAND) {
      return reject(REJECT_REASONS.UNSUPPORTED_TARGET);
    }

    if (dragPayload.sourceZone === 'player-reveal' && dropPayload.zoneKind === ZONE_KINDS.REVEAL) {
      return reject(REJECT_REASONS.UNSUPPORTED_TARGET);
    }

    if (
      (dropPayload.zoneKind === ZONE_KINDS.ACTIVE || dropPayload.zoneKind === ZONE_KINDS.BENCH) &&
      isZoneOccupied(boardSnapshot, actorPlayerId, dropPayload.zoneKind, dropPayload.benchIndex)
    ) {
      return reject(REJECT_REASONS.TARGET_OCCUPIED);
    }

    if (
      dropPayload.zoneKind === ZONE_KINDS.BENCH &&
      !isBenchIndexValid(dropPayload.benchIndex)
    ) {
      return reject(REJECT_REASONS.INVALID_PAYLOAD);
    }

    return accept({
      action: {
        kind: INTENT_ACTIONS.MOVE_CARD_FROM_HAND_TO_ZONE,
        cardId: dragPayload.cardId,
        sourceZone: dragPayload.sourceZone,
        targetPlayerId: dropPayload.targetPlayerId,
        targetZoneKind: dropPayload.zoneKind,
        targetZoneId: dropPayload.zoneId,
        targetBenchIndex:
          dropPayload.zoneKind === ZONE_KINDS.BENCH ? dropPayload.benchIndex : null,
      },
      highlightTarget: {
        type: DROP_TYPES.ZONE,
        zoneId: dropPayload.zoneId,
      },
    });
  }

  if (dropPayload.dropType === DROP_TYPES.STACK) {
    if (
      dragPayload.dragType !== DRAG_TYPES.DAMAGE_COUNTER &&
      dragPayload.dragType !== DRAG_TYPES.STATUS_BADGE
    ) {
      return reject(REJECT_REASONS.UNSUPPORTED_TARGET);
    }

    if (
      !hasStack(
        boardSnapshot,
        dropPayload.targetPlayerId,
        dropPayload.stackKind,
        dropPayload.benchIndex
      )
    ) {
      return reject(REJECT_REASONS.TARGET_NOT_FOUND);
    }

    if (
      dropPayload.stackKind === STACK_KINDS.BENCH &&
      !isBenchIndexValid(dropPayload.benchIndex)
    ) {
      return reject(REJECT_REASONS.INVALID_PAYLOAD);
    }

    return accept({
      action: {
        kind: INTENT_ACTIONS.APPLY_TOOL_TO_STACK,
        dragType: dragPayload.dragType,
        toolValue: dragPayload.toolValue,
        targetPlayerId: dropPayload.targetPlayerId,
        targetZoneId: dropPayload.zoneId,
        targetStackKind: dropPayload.stackKind,
        targetBenchIndex:
          dropPayload.stackKind === STACK_KINDS.BENCH ? dropPayload.benchIndex : null,
      },
      highlightTarget: {
        type: DROP_TYPES.STACK,
        zoneId: dropPayload.zoneId,
      },
    });
  }

  return reject(REJECT_REASONS.UNSUPPORTED_TARGET);
}
