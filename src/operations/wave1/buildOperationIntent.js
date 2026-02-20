import { getOperationMeta } from './operationCatalog';

function asFiniteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toCardIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

function toStringValue(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function buildOperationIntent({ opId, payload = {}, actorPlayerId }) {
  const meta = getOperationMeta(opId);
  if (!meta) {
    return null;
  }

  const now = new Date().toISOString();

  return {
    opId,
    actorPlayerId,
    mode: meta.mode,
    createdAt: now,
    payload: {
      ...payload,
      count: asFiniteNumber(payload.count, null),
      value: asFiniteNumber(payload.value, null),
      benchIndex: asFiniteNumber(payload.benchIndex, null),
      targetBenchIndex: asFiniteNumber(payload.targetBenchIndex, null),
      sourceBenchIndex: asFiniteNumber(payload.sourceBenchIndex, null),
      cardId: toStringValue(payload.cardId, ''),
      sourceZone: toStringValue(payload.sourceZone, ''),
      targetZone: toStringValue(payload.targetZone, ''),
      sourceStackKind: toStringValue(payload.sourceStackKind, ''),
      targetStackKind: toStringValue(payload.targetStackKind, ''),
      targetPlayerId: toStringValue(payload.targetPlayerId, ''),
      condition: toStringValue(payload.condition, ''),
      note: toStringValue(payload.note, ''),
      mode: toStringValue(payload.mode, ''),
      requestId: toStringValue(payload.requestId, ''),
      action: toStringValue(payload.action, ''),
      cardIds: toCardIds(payload.cardIds),
      orderCardIds: toCardIds(payload.orderCardIds),
    },
  };
}
