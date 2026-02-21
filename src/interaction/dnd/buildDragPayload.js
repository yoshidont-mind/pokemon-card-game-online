import { DRAG_TYPES, DROP_TYPES, STACK_KINDS, ZONE_KINDS } from './constants';

function asBenchIndex(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function buildCardDragPayload({
  cardId,
  sourceZone = 'player-hand',
  sourceStackKind = null,
  sourceBenchIndex = null,
}) {
  if (!cardId || typeof cardId !== 'string') {
    return null;
  }

  const normalizedSourceStackKind =
    sourceZone === 'player-stack'
      ? sourceStackKind === STACK_KINDS.BENCH
        ? STACK_KINDS.BENCH
        : STACK_KINDS.ACTIVE
      : null;

  const normalizedSourceBenchIndex =
    sourceZone === 'player-stack' && normalizedSourceStackKind === STACK_KINDS.BENCH
      ? asBenchIndex(sourceBenchIndex)
      : null;

  return {
    dragType: DRAG_TYPES.CARD,
    cardId,
    sourceZone,
    sourceStackKind: normalizedSourceStackKind,
    sourceBenchIndex: normalizedSourceBenchIndex,
  };
}

export function buildStackDragPayload({
  sourceZone = 'player-stack',
  sourceStackKind = STACK_KINDS.ACTIVE,
  sourceBenchIndex = null,
  previewCardId = '',
  previewCardIds = [],
}) {
  if (sourceZone !== 'player-stack') {
    return null;
  }

  const normalizedSourceStackKind =
    sourceStackKind === STACK_KINDS.BENCH ? STACK_KINDS.BENCH : STACK_KINDS.ACTIVE;
  const normalizedSourceBenchIndex =
    normalizedSourceStackKind === STACK_KINDS.BENCH ? asBenchIndex(sourceBenchIndex) : null;

  return {
    dragType: DRAG_TYPES.STACK,
    sourceZone,
    sourceStackKind: normalizedSourceStackKind,
    sourceBenchIndex: normalizedSourceBenchIndex,
    previewCardId: typeof previewCardId === 'string' ? previewCardId : '',
    previewCardIds: Array.isArray(previewCardIds)
      ? previewCardIds.filter((cardId) => typeof cardId === 'string' && cardId.trim() !== '')
      : [],
  };
}

export function buildPileCardDragPayload({
  sourceZone,
  availableCount = 0,
}) {
  if (!sourceZone || typeof sourceZone !== 'string') {
    return null;
  }

  return {
    dragType: DRAG_TYPES.PILE_CARD,
    sourceZone,
    availableCount: Number.isFinite(availableCount) ? Math.max(0, Number(availableCount)) : 0,
  };
}

export function buildDamageCounterDragPayload({ value }) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return {
    dragType: DRAG_TYPES.DAMAGE_COUNTER,
    toolValue: String(numeric),
  };
}

export function buildStatusBadgeDragPayload({ value }) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  return {
    dragType: DRAG_TYPES.STATUS_BADGE,
    toolValue: value,
  };
}

export function buildZoneDropPayload({
  zoneId,
  targetPlayerId,
  zoneKind,
  benchIndex = null,
  edge = '',
}) {
  if (!zoneId || !targetPlayerId || !zoneKind) {
    return null;
  }

  return {
    dropType: DROP_TYPES.ZONE,
    zoneId,
    targetPlayerId,
    zoneKind,
    benchIndex: zoneKind === ZONE_KINDS.BENCH ? asBenchIndex(benchIndex) : null,
    edge: typeof edge === 'string' ? edge : '',
  };
}

export function buildStackDropPayload({
  zoneId,
  targetPlayerId,
  stackKind,
  benchIndex = null,
}) {
  if (!zoneId || !targetPlayerId || !stackKind) {
    return null;
  }

  return {
    dropType: DROP_TYPES.STACK,
    zoneId,
    targetPlayerId,
    stackKind: stackKind === STACK_KINDS.BENCH ? STACK_KINDS.BENCH : STACK_KINDS.ACTIVE,
    benchIndex: stackKind === STACK_KINDS.BENCH ? asBenchIndex(benchIndex) : null,
  };
}
