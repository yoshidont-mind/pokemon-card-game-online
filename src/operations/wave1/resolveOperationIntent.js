import { ERROR_CODES } from '../../game-state/errors';
import { PLAYER_IDS } from '../../game-state/schemaV2';
import { getOperationMeta } from './operationCatalog';
import { INTERNAL_OPERATION_IDS } from './operationIds';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function reject(code, message) {
  return {
    accepted: false,
    code,
    message,
    action: null,
  };
}

function accept(action) {
  return {
    accepted: true,
    code: null,
    message: '',
    action,
  };
}

function isValidPlayerId(playerId) {
  return PLAYER_IDS.includes(playerId);
}

function hasParticipantBinding(sessionDoc, actorPlayerId) {
  const participant = sessionDoc?.participants?.[actorPlayerId];
  return Boolean(participant?.uid);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function doesActorOwnCard(privateStateDoc, cardId) {
  if (!cardId) {
    return false;
  }
  const cardCatalog = privateStateDoc?.cardCatalog || {};
  return Boolean(cardCatalog[cardId]);
}

function validateRequestResolutionPayload(payload) {
  if (!payload?.requestId) {
    return 'requestId is required.';
  }
  if (!payload?.action || (payload.action !== 'approve' && payload.action !== 'reject')) {
    return 'action must be approve or reject.';
  }
  return null;
}

function findOperationRequestById(sessionDoc, requestId) {
  const requests = asArray(sessionDoc?.publicState?.operationRequests);
  return requests.find((entry) => entry?.requestId === requestId) || null;
}

function validateStackTargetPayload(payload) {
  if (!payload?.targetPlayerId || !isValidPlayerId(payload.targetPlayerId)) {
    return 'targetPlayerId is required.';
  }
  if (payload?.targetStackKind !== 'active' && payload?.targetStackKind !== 'bench') {
    return 'targetStackKind must be active or bench.';
  }
  if (payload.targetStackKind === 'bench' && !isNonNegativeInteger(payload.targetBenchIndex)) {
    return 'targetBenchIndex is required for bench target.';
  }
  return null;
}

function validateCorePayload(opId, payload, privateStateDoc) {
  if (opId === 'OP-B03' || opId === 'OP-B04') {
    const requestedCount = payload.count ?? 1;
    if (!isPositiveInteger(requestedCount)) {
      return 'count must be positive integer.';
    }
  }

  if (opId === 'OP-B09' || opId === 'OP-D04' || opId === 'OP-D06' || opId === 'OP-D07') {
    if (!asArray(payload.cardIds).length && !isPositiveInteger(payload.count)) {
      return 'cardIds or count is required.';
    }
  }

  if (opId === 'OP-C03' || opId === 'OP-D03' || opId === 'OP-E02' || opId === 'OP-E06') {
    if (!payload.cardId && !asArray(payload.cardIds).length) {
      return 'cardId or cardIds is required.';
    }

    if (payload.cardId && !doesActorOwnCard(privateStateDoc, payload.cardId)) {
      return `cardId ${payload.cardId} is not available in your cardCatalog.`;
    }
  }

  if (opId === 'OP-F01' || opId === 'OP-F04' || opId === 'OP-F05' || opId === 'OP-F08') {
    if (!isPositiveInteger(payload.value)) {
      return 'value must be positive integer.';
    }
  }

  if (opId === 'OP-F01' || opId === 'OP-F02' || opId === 'OP-F04' || opId === 'OP-F05') {
    const stackError = validateStackTargetPayload(payload);
    if (stackError) {
      return stackError;
    }
  }

  if (opId === 'OP-C02' || opId === 'OP-C05') {
    if (!isNonNegativeInteger(payload.benchIndex)) {
      return 'benchIndex is required.';
    }
  }

  if (opId === 'OP-C04') {
    if (!isNonNegativeInteger(payload.benchIndex)) {
      return 'benchIndex is required for opponent bench target.';
    }
    if (!payload.targetPlayerId || !isValidPlayerId(payload.targetPlayerId)) {
      return 'targetPlayerId is required.';
    }
  }

  if (opId === 'OP-B11' || opId === 'OP-B12') {
    if (!payload.targetPlayerId || !isValidPlayerId(payload.targetPlayerId)) {
      return 'targetPlayerId is required for request operation.';
    }
    if (payload.targetPlayerId === payload.actorPlayerId) {
      return 'targetPlayerId must be opponent for request operation.';
    }
  }

  return null;
}

export function resolveOperationIntent({
  intent,
  sessionDoc,
  privateStateDoc,
  actorPlayerId,
}) {
  if (!intent || typeof intent !== 'object') {
    return reject(ERROR_CODES.INVALID_STATE, 'Operation intent is required.');
  }

  if (!actorPlayerId || !isValidPlayerId(actorPlayerId)) {
    return reject(ERROR_CODES.INVALID_STATE, 'Invalid actorPlayerId.');
  }

  if (!sessionDoc || typeof sessionDoc !== 'object') {
    return reject(ERROR_CODES.INVALID_STATE, 'Session document is missing.');
  }

  if (!hasParticipantBinding(sessionDoc, actorPlayerId)) {
    return reject(ERROR_CODES.PERMISSION_DENIED, 'Actor is not joined to this session slot.');
  }

  const opId = intent.opId;
  const meta = getOperationMeta(opId);
  if (!meta) {
    return reject(ERROR_CODES.INVALID_STATE, `Unsupported operation: ${String(opId)}`);
  }

  const payload = {
    ...(intent.payload || {}),
    actorPlayerId,
  };

  if (meta.mode === 'request-resolution') {
    const validationError = validateRequestResolutionPayload(payload);
    if (validationError) {
      return reject(ERROR_CODES.INVALID_STATE, validationError);
    }

    const request = findOperationRequestById(sessionDoc, payload.requestId);
    if (!request) {
      return reject(ERROR_CODES.NOT_FOUND, `Operation request not found: ${payload.requestId}`);
    }
    if (request.targetPlayerId !== actorPlayerId) {
      return reject(ERROR_CODES.PERMISSION_DENIED, 'Only target player can resolve this request.');
    }
    if (request.status !== 'pending') {
      return reject(ERROR_CODES.INVALID_STATE, 'Request is already resolved.');
    }
    if (
      intent.opId === INTERNAL_OPERATION_IDS.REQUEST_APPROVE &&
      payload.action !== 'approve'
    ) {
      return reject(ERROR_CODES.INVALID_STATE, 'approve operation requires action=approve.');
    }
    if (
      intent.opId === INTERNAL_OPERATION_IDS.REQUEST_REJECT &&
      payload.action !== 'reject'
    ) {
      return reject(ERROR_CODES.INVALID_STATE, 'reject operation requires action=reject.');
    }

    return accept({
      opId,
      mode: meta.mode,
      actorPlayerId,
      payload,
    });
  }

  const validationError = validateCorePayload(opId, payload, privateStateDoc);
  if (validationError) {
    return reject(ERROR_CODES.INVALID_STATE, validationError);
  }

  return accept({
    opId,
    mode: meta.mode,
    actorPlayerId,
    payload,
  });
}
