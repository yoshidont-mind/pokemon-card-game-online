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
  return getStackCardCount(boardSnapshot, playerId, stackKind, benchIndex) > 0;
}

function getStackCardCount(boardSnapshot, playerId, stackKind, benchIndex) {
  const playerSnapshot = boardSnapshot?.players?.[playerId];
  if (!playerSnapshot) {
    return 0;
  }
  if (stackKind === STACK_KINDS.ACTIVE) {
    return Math.max(0, Number(playerSnapshot.activeCardCount) || 0);
  }
  if (stackKind === STACK_KINDS.BENCH && isBenchIndexValid(benchIndex)) {
    return Math.max(0, Number(playerSnapshot.benchCardCounts?.[benchIndex]) || 0);
  }
  return 0;
}

function normalizeStackKind(value) {
  return value === STACK_KINDS.BENCH ? STACK_KINDS.BENCH : STACK_KINDS.ACTIVE;
}

function isSameStackLocation({
  sourceStackKind,
  sourceBenchIndex = null,
  targetZoneKind,
  targetBenchIndex = null,
}) {
  const normalizedSourceKind = normalizeStackKind(sourceStackKind);
  const normalizedTargetKind = targetZoneKind === ZONE_KINDS.BENCH ? STACK_KINDS.BENCH : STACK_KINDS.ACTIVE;
  if (normalizedSourceKind !== normalizedTargetKind) {
    return false;
  }
  if (normalizedSourceKind === STACK_KINDS.BENCH) {
    return Number(sourceBenchIndex) === Number(targetBenchIndex);
  }
  return true;
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

function buildSwapStacksIntent({
  actorPlayerId,
  sourceStackKind,
  sourceBenchIndex = null,
  targetZoneKind,
  targetZoneId,
  targetBenchIndex = null,
}) {
  return accept({
    action: {
      kind: INTENT_ACTIONS.SWAP_STACKS,
      targetPlayerId: actorPlayerId,
      sourceStackKind,
      sourceBenchIndex: sourceStackKind === STACK_KINDS.BENCH ? sourceBenchIndex : null,
      targetZoneKind,
      targetZoneId,
      targetBenchIndex: targetZoneKind === ZONE_KINDS.BENCH ? targetBenchIndex : null,
    },
    highlightTarget: {
      type: DROP_TYPES.ZONE,
      zoneId: targetZoneId,
    },
  });
}

function buildMoveStackToZoneIntent({
  actorPlayerId,
  sourceStackKind,
  sourceBenchIndex = null,
  targetZoneKind,
  targetZoneId,
}) {
  return accept({
    action: {
      kind: INTENT_ACTIONS.MOVE_STACK_FROM_STACK_TO_ZONE,
      targetPlayerId: actorPlayerId,
      sourceStackKind,
      sourceBenchIndex: sourceStackKind === STACK_KINDS.BENCH ? sourceBenchIndex : null,
      targetZoneKind,
      targetZoneId,
    },
    highlightTarget: {
      type: DROP_TYPES.ZONE,
      zoneId: targetZoneId,
    },
  });
}

function isSupportedCardSourceZone(sourceZone) {
  return (
    sourceZone === 'player-hand' ||
    sourceZone === 'player-reveal' ||
    sourceZone === 'player-deck' ||
    sourceZone === 'player-deck-peek' ||
    sourceZone === 'player-discard' ||
    sourceZone === 'player-lost' ||
    sourceZone === 'player-stack'
  );
}

export function createBoardSnapshot(sessionDoc) {
  const players = sessionDoc?.publicState?.players || {};

  const toPlayerSnapshot = (playerKey) => {
    const board = players?.[playerKey]?.board || {};
    const bench = asArray(board.bench);
    const activeCardCount = Array.isArray(board?.active?.cardIds) ? board.active.cardIds.length : 0;
    return {
      activeExists: activeCardCount > 0,
      activeCardCount,
      benchOccupied: Array.from({ length: BENCH_SLOT_COUNT }, (_, index) => {
        const cardIds = asArray(bench[index]?.cardIds);
        return cardIds.length > 0;
      }),
      benchCardCounts: Array.from({ length: BENCH_SLOT_COUNT }, (_, index) =>
        asArray(bench[index]?.cardIds).length
      ),
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
    if (dragPayload.dragType === DRAG_TYPES.STACK) {
      if (dragPayload.sourceZone !== 'player-stack') {
        return reject(REJECT_REASONS.UNSUPPORTED_SOURCE);
      }
      if (dropPayload.targetPlayerId !== actorPlayerId) {
        return reject(REJECT_REASONS.PERMISSION_DENIED);
      }
      const supportsStackTargetZone =
        dropPayload.zoneKind === ZONE_KINDS.ACTIVE ||
        dropPayload.zoneKind === ZONE_KINDS.BENCH ||
        dropPayload.zoneKind === ZONE_KINDS.DISCARD ||
        dropPayload.zoneKind === ZONE_KINDS.LOST;
      if (!supportsStackTargetZone) {
        return reject(REJECT_REASONS.UNSUPPORTED_TARGET);
      }
      if (dropPayload.zoneKind === ZONE_KINDS.BENCH && !isBenchIndexValid(dropPayload.benchIndex)) {
        return reject(REJECT_REASONS.INVALID_PAYLOAD);
      }

      const sourceStackKind = normalizeStackKind(dragPayload.sourceStackKind);
      if (sourceStackKind === STACK_KINDS.BENCH && !isBenchIndexValid(dragPayload.sourceBenchIndex)) {
        return reject(REJECT_REASONS.INVALID_PAYLOAD);
      }

      if (
        !hasStack(
          boardSnapshot,
          actorPlayerId,
          sourceStackKind,
          sourceStackKind === STACK_KINDS.BENCH ? dragPayload.sourceBenchIndex : null
        )
      ) {
        return reject(REJECT_REASONS.TARGET_NOT_FOUND);
      }

      if (dropPayload.zoneKind === ZONE_KINDS.DISCARD || dropPayload.zoneKind === ZONE_KINDS.LOST) {
        return buildMoveStackToZoneIntent({
          actorPlayerId,
          sourceStackKind,
          sourceBenchIndex: dragPayload.sourceBenchIndex,
          targetZoneKind: dropPayload.zoneKind,
          targetZoneId: dropPayload.zoneId,
        });
      }

      if (
        isSameStackLocation({
          sourceStackKind,
          sourceBenchIndex: dragPayload.sourceBenchIndex,
          targetZoneKind: dropPayload.zoneKind,
          targetBenchIndex: dropPayload.benchIndex,
        })
      ) {
        return reject(REJECT_REASONS.UNSUPPORTED_TARGET);
      }

      return buildSwapStacksIntent({
        actorPlayerId,
        sourceStackKind,
        sourceBenchIndex: dragPayload.sourceBenchIndex,
        targetZoneKind: dropPayload.zoneKind,
        targetZoneId: dropPayload.zoneId,
        targetBenchIndex: dropPayload.benchIndex,
      });
    }

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
      if (
        dragPayload.sourceZone === 'player-prize' &&
        dropPayload.zoneKind !== ZONE_KINDS.HAND
      ) {
        return reject(REJECT_REASONS.UNSUPPORTED_TARGET);
      }
      if (
        dragPayload.sourceZone === 'player-deck' &&
        dropPayload.zoneKind !== ZONE_KINDS.HAND &&
        dropPayload.zoneKind !== ZONE_KINDS.DISCARD &&
        dropPayload.zoneKind !== ZONE_KINDS.PRIZE
      ) {
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
          targetZoneKind: dropPayload.zoneKind,
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

    if (dropPayload.zoneKind === ZONE_KINDS.DECK) {
      const edge = dropPayload.edge === 'bottom' ? 'bottom' : dropPayload.edge === 'top' ? 'top' : null;
      if (!edge) {
        return reject(REJECT_REASONS.INVALID_PAYLOAD);
      }

      return accept({
        action: {
          kind: INTENT_ACTIONS.MOVE_CARD_TO_DECK_EDGE,
          cardId: dragPayload.cardId,
          sourceZone: dragPayload.sourceZone,
          sourceStackKind: dragPayload.sourceStackKind || null,
          sourceBenchIndex:
            dragPayload.sourceStackKind === STACK_KINDS.BENCH
              ? dragPayload.sourceBenchIndex
              : null,
          targetPlayerId: actorPlayerId,
          targetZoneKind: ZONE_KINDS.DECK,
          targetZoneId: dropPayload.zoneId,
          targetDeckEdge: edge,
        },
        highlightTarget: {
          type: DROP_TYPES.ZONE,
          zoneId: dropPayload.zoneId,
        },
      });
    }

    if (
      (dropPayload.zoneKind === ZONE_KINDS.ACTIVE || dropPayload.zoneKind === ZONE_KINDS.BENCH) &&
      (dropPayload.edge === 'bottom' || dropPayload.edge === 'top')
    ) {
      const edge = dropPayload.edge === 'bottom' ? 'bottom' : 'top';
      if (
        dropPayload.zoneKind === ZONE_KINDS.BENCH &&
        !isBenchIndexValid(dropPayload.benchIndex)
      ) {
        return reject(REJECT_REASONS.INVALID_PAYLOAD);
      }
      if (!isZoneOccupied(boardSnapshot, actorPlayerId, dropPayload.zoneKind, dropPayload.benchIndex)) {
        return reject(REJECT_REASONS.TARGET_NOT_FOUND);
      }

      return accept({
        action: {
          kind: INTENT_ACTIONS.MOVE_CARD_TO_STACK_EDGE,
          cardId: dragPayload.cardId,
          sourceZone: dragPayload.sourceZone,
          sourceStackKind: dragPayload.sourceStackKind || null,
          sourceBenchIndex:
            dragPayload.sourceStackKind === STACK_KINDS.BENCH
              ? dragPayload.sourceBenchIndex
              : null,
          targetPlayerId: actorPlayerId,
          targetZoneKind: dropPayload.zoneKind,
          targetZoneId: dropPayload.zoneId,
          targetBenchIndex:
            dropPayload.zoneKind === ZONE_KINDS.BENCH ? dropPayload.benchIndex : null,
          targetStackEdge: edge,
        },
        highlightTarget: {
          type: DROP_TYPES.ZONE,
          zoneId: dropPayload.zoneId,
        },
      });
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

    if (dragPayload.sourceZone === 'player-discard' && dropPayload.zoneKind === ZONE_KINDS.DISCARD) {
      return reject(REJECT_REASONS.UNSUPPORTED_TARGET);
    }

    if (dragPayload.sourceZone === 'player-lost' && dropPayload.zoneKind === ZONE_KINDS.LOST) {
      return reject(REJECT_REASONS.UNSUPPORTED_TARGET);
    }

    if (
      (dropPayload.zoneKind === ZONE_KINDS.ACTIVE || dropPayload.zoneKind === ZONE_KINDS.BENCH) &&
      isZoneOccupied(boardSnapshot, actorPlayerId, dropPayload.zoneKind, dropPayload.benchIndex)
    ) {
      const sourceStackKind = normalizeStackKind(dragPayload.sourceStackKind);
      const sourceStackCardCount =
        dragPayload.sourceZone === 'player-stack'
          ? getStackCardCount(
              boardSnapshot,
              actorPlayerId,
              sourceStackKind,
              sourceStackKind === STACK_KINDS.BENCH ? dragPayload.sourceBenchIndex : null
            )
          : 0;

      if (
        dragPayload.sourceZone === 'player-stack' &&
        sourceStackCardCount === 1 &&
        !isSameStackLocation({
          sourceStackKind,
          sourceBenchIndex: dragPayload.sourceBenchIndex,
          targetZoneKind: dropPayload.zoneKind,
          targetBenchIndex: dropPayload.benchIndex,
        })
      ) {
        return buildSwapStacksIntent({
          actorPlayerId,
          sourceStackKind,
          sourceBenchIndex: dragPayload.sourceBenchIndex,
          targetZoneKind: dropPayload.zoneKind,
          targetZoneId: dropPayload.zoneId,
          targetBenchIndex: dropPayload.benchIndex,
        });
      }
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
        sourceStackKind: dragPayload.sourceStackKind || null,
        sourceBenchIndex:
          dragPayload.sourceStackKind === STACK_KINDS.BENCH
            ? dragPayload.sourceBenchIndex
            : null,
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
    const targetZoneKind =
      dropPayload.stackKind === STACK_KINDS.BENCH ? ZONE_KINDS.BENCH : ZONE_KINDS.ACTIVE;
    const targetBenchIndex =
      targetZoneKind === ZONE_KINDS.BENCH ? dropPayload.benchIndex : null;

    if (dragPayload.dragType === DRAG_TYPES.STACK) {
      if (dragPayload.sourceZone !== 'player-stack') {
        return reject(REJECT_REASONS.UNSUPPORTED_SOURCE);
      }
      if (dropPayload.targetPlayerId !== actorPlayerId) {
        return reject(REJECT_REASONS.PERMISSION_DENIED);
      }
      if (targetZoneKind === ZONE_KINDS.BENCH && !isBenchIndexValid(targetBenchIndex)) {
        return reject(REJECT_REASONS.INVALID_PAYLOAD);
      }

      const sourceStackKind = normalizeStackKind(dragPayload.sourceStackKind);
      if (sourceStackKind === STACK_KINDS.BENCH && !isBenchIndexValid(dragPayload.sourceBenchIndex)) {
        return reject(REJECT_REASONS.INVALID_PAYLOAD);
      }

      if (
        isSameStackLocation({
          sourceStackKind,
          sourceBenchIndex: dragPayload.sourceBenchIndex,
          targetZoneKind,
          targetBenchIndex,
        })
      ) {
        return reject(REJECT_REASONS.UNSUPPORTED_TARGET);
      }

      if (
        !hasStack(
          boardSnapshot,
          actorPlayerId,
          sourceStackKind,
          sourceStackKind === STACK_KINDS.BENCH ? dragPayload.sourceBenchIndex : null
        )
      ) {
        return reject(REJECT_REASONS.TARGET_NOT_FOUND);
      }

      if (!hasStack(boardSnapshot, actorPlayerId, targetZoneKind, targetBenchIndex)) {
        return reject(REJECT_REASONS.TARGET_NOT_FOUND);
      }

      return buildSwapStacksIntent({
        actorPlayerId,
        sourceStackKind,
        sourceBenchIndex: dragPayload.sourceBenchIndex,
        targetZoneKind,
        targetZoneId: dropPayload.zoneId,
        targetBenchIndex,
      });
    }

    if (dragPayload.dragType === DRAG_TYPES.CARD) {
      if (dragPayload.sourceZone !== 'player-stack') {
        return reject(REJECT_REASONS.UNSUPPORTED_TARGET);
      }
      if (dropPayload.targetPlayerId !== actorPlayerId) {
        return reject(REJECT_REASONS.PERMISSION_DENIED);
      }
      if (targetZoneKind === ZONE_KINDS.BENCH && !isBenchIndexValid(targetBenchIndex)) {
        return reject(REJECT_REASONS.INVALID_PAYLOAD);
      }

      const sourceStackKind = normalizeStackKind(dragPayload.sourceStackKind);
      if (sourceStackKind === STACK_KINDS.BENCH && !isBenchIndexValid(dragPayload.sourceBenchIndex)) {
        return reject(REJECT_REASONS.INVALID_PAYLOAD);
      }

      const sourceStackCardCount = getStackCardCount(
        boardSnapshot,
        actorPlayerId,
        sourceStackKind,
        sourceStackKind === STACK_KINDS.BENCH ? dragPayload.sourceBenchIndex : null
      );

      if (sourceStackCardCount !== 1) {
        return reject(REJECT_REASONS.TARGET_OCCUPIED);
      }

      if (
        isSameStackLocation({
          sourceStackKind,
          sourceBenchIndex: dragPayload.sourceBenchIndex,
          targetZoneKind,
          targetBenchIndex,
        })
      ) {
        return reject(REJECT_REASONS.UNSUPPORTED_TARGET);
      }

      if (!hasStack(boardSnapshot, actorPlayerId, targetZoneKind, targetBenchIndex)) {
        return reject(REJECT_REASONS.TARGET_NOT_FOUND);
      }

      return buildSwapStacksIntent({
        actorPlayerId,
        sourceStackKind,
        sourceBenchIndex: dragPayload.sourceBenchIndex,
        targetZoneKind,
        targetZoneId: dropPayload.zoneId,
        targetBenchIndex,
      });
    }

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
