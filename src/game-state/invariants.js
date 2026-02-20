import { ORIENTATION, PLAYER_IDS, isValidOrientation } from './schemaV2';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function collectIdsFromStack(stack) {
  if (!stack || typeof stack !== 'object') {
    return [];
  }
  return asArray(stack.cardIds).filter(Boolean);
}

function collectIdsFromCardRefs(refs) {
  return asArray(refs)
    .map((ref) => (ref && typeof ref === 'object' ? ref.cardId : null))
    .filter(Boolean);
}

function collectBoardCardIds(board) {
  if (!board || typeof board !== 'object') {
    return [];
  }

  const ids = [];
  ids.push(...collectIdsFromStack(board.active));

  for (const stack of asArray(board.bench)) {
    ids.push(...collectIdsFromStack(stack));
  }

  ids.push(...collectIdsFromCardRefs(board.discard));
  ids.push(...collectIdsFromCardRefs(board.lostZone));
  ids.push(...collectIdsFromCardRefs(board.prize));
  ids.push(...collectIdsFromCardRefs(board.reveal));

  return ids;
}

function collectPrivateZoneCardIds(privateState) {
  if (!privateState || typeof privateState !== 'object') {
    return [];
  }
  const zones = privateState.zones || {};
  const ids = [];
  ids.push(...collectIdsFromCardRefs(zones.deck));
  ids.push(...collectIdsFromCardRefs(zones.hand));
  return ids;
}

export function assertActiveShape(sessionDoc) {
  for (const playerId of PLAYER_IDS) {
    const active = sessionDoc?.publicState?.players?.[playerId]?.board?.active;
    if (Array.isArray(active)) {
      throw new Error(`Invariant violation: active for ${playerId} must not be an array.`);
    }
    if (active !== null && active !== undefined && typeof active !== 'object') {
      throw new Error(`Invariant violation: active for ${playerId} must be object|null.`);
    }
  }
}

export function assertOrientation(sessionDoc, privateStatesByPlayer = {}) {
  const invalidPaths = [];

  const checkOrientation = (value, path) => {
    if (!isValidOrientation(value)) {
      invalidPaths.push(`${path}=${String(value)}`);
    }
  };

  for (const playerId of PLAYER_IDS) {
    const board = sessionDoc?.publicState?.players?.[playerId]?.board || {};

    const active = board.active;
    if (active) {
      checkOrientation(active.orientation, `${playerId}.board.active.orientation`);
    }

    asArray(board.bench).forEach((stack, idx) => {
      checkOrientation(stack?.orientation, `${playerId}.board.bench[${idx}].orientation`);
    });

    const refs = [
      ...asArray(board.discard),
      ...asArray(board.lostZone),
      ...asArray(board.prize),
      ...asArray(board.reveal),
    ];

    refs.forEach((ref, idx) => {
      if (ref && ref.orientation !== undefined) {
        checkOrientation(ref.orientation, `${playerId}.board.refs[${idx}].orientation`);
      }
    });

    const privateState = privateStatesByPlayer[playerId] || {};
    const zones = privateState.zones || {};
    [...asArray(zones.deck), ...asArray(zones.hand)].forEach((ref, idx) => {
      checkOrientation(ref?.orientation, `${playerId}.private.zones[${idx}].orientation`);
    });
  }

  if (invalidPaths.length > 0) {
    throw new Error(`Invariant violation: invalid orientation values: ${invalidPaths.join(', ')}`);
  }
}

export function assertUniqueCardOwnership(sessionDoc, privateStatesByPlayer = {}) {
  const seen = new Map();

  const mark = (cardId, zonePath) => {
    if (!cardId) {
      return;
    }
    if (seen.has(cardId)) {
      const prev = seen.get(cardId);
      throw new Error(`Invariant violation: cardId ${cardId} appears in multiple zones: ${prev} and ${zonePath}`);
    }
    seen.set(cardId, zonePath);
  };

  for (const playerId of PLAYER_IDS) {
    const board = sessionDoc?.publicState?.players?.[playerId]?.board;
    const boardCardIds = collectBoardCardIds(board);
    boardCardIds.forEach((cardId, idx) => mark(cardId, `${playerId}.public.board[${idx}]`));

    const privateState = privateStatesByPlayer[playerId];
    const privateCardIds = collectPrivateZoneCardIds(privateState);
    privateCardIds.forEach((cardId, idx) => mark(cardId, `${playerId}.private.zones[${idx}]`));
  }

  for (const playerId of PLAYER_IDS) {
    const privateState = privateStatesByPlayer[playerId];
    if (!privateState || !privateState.cardCatalog) {
      continue;
    }

    for (const [cardId, entity] of Object.entries(privateState.cardCatalog)) {
      if (entity?.cardId && entity.cardId !== cardId) {
        throw new Error(
          `Invariant violation: cardCatalog key/id mismatch for ${cardId}. entity.cardId=${entity.cardId}`
        );
      }
      if (entity?.ownerPlayerId && entity.ownerPlayerId !== playerId) {
        throw new Error(
          `Invariant violation: cardCatalog owner mismatch for ${cardId}. expected=${playerId} actual=${entity.ownerPlayerId}`
        );
      }
    }
  }

  for (const playerId of PLAYER_IDS) {
    const board = sessionDoc?.publicState?.players?.[playerId]?.board;
    const boardCardIds = collectBoardCardIds(board);
    const catalog = privateStatesByPlayer[playerId]?.cardCatalog || {};
    for (const cardId of boardCardIds) {
      if (!catalog[cardId]) {
        throw new Error(
          `Invariant violation: public board references ${cardId} but ${playerId}.cardCatalog does not contain it.`
        );
      }
    }
  }

  for (const playerId of PLAYER_IDS) {
    const privateState = privateStatesByPlayer[playerId];
    const catalog = privateState?.cardCatalog || {};
    const zoneCardIds = collectPrivateZoneCardIds(privateState);
    for (const cardId of zoneCardIds) {
      if (!catalog[cardId]) {
        throw new Error(
          `Invariant violation: private zones reference ${cardId} but ${playerId}.cardCatalog does not contain it.`
        );
      }
    }
  }
}

export function validateSessionInvariants(sessionDoc, privateStatesByPlayer = {}) {
  assertActiveShape(sessionDoc);
  assertOrientation(sessionDoc, privateStatesByPlayer);
  assertUniqueCardOwnership(sessionDoc, privateStatesByPlayer);
}

export function normalizeOrientation(value) {
  return value === ORIENTATION.HORIZONTAL ? ORIENTATION.HORIZONTAL : ORIENTATION.VERTICAL;
}
