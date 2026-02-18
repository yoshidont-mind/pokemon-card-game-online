const ORIENTATION = {
  VERTICAL: 'vertical',
  HORIZONTAL: 'horizontal',
};

const VISIBILITY = {
  PUBLIC: 'public',
  OWNER_ONLY: 'ownerOnly',
};

const REVEALED_TO = {
  OWNER: 'owner',
};

const SESSION_STATUS = {
  WAITING: 'waiting',
  READY: 'ready',
  PLAYING: 'playing',
};

const STATUS_CONDITIONS_DEFAULT = {
  poisoned: false,
  burned: false,
  asleep: false,
  paralyzed: false,
  confused: false,
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeUrl(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOrientation(value) {
  return value === ORIENTATION.HORIZONTAL ? ORIENTATION.HORIZONTAL : ORIENTATION.VERTICAL;
}

function extractOriginalCardCodeFromImageUrl(imageUrl) {
  if (typeof imageUrl !== 'string') {
    return null;
  }
  const match = imageUrl.match(/\/([0-9]{6})_[^/]+$/);
  return match ? match[1] : null;
}

function createCardInstanceId(ownerPlayerId, seedIndex) {
  return `c_${ownerPlayerId}_${String(seedIndex).padStart(3, '0')}`;
}

function createEmptySessionV2({ now, createdBy }) {
  return {
    version: 2,
    status: SESSION_STATUS.WAITING,
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy,
    revision: 0,
    participants: {
      player1: {
        uid: null,
        displayName: null,
        joinedAt: null,
        lastSeenAt: null,
        connectionState: 'unknown',
      },
      player2: {
        uid: null,
        displayName: null,
        joinedAt: null,
        lastSeenAt: null,
        connectionState: 'unknown',
      },
    },
    publicState: {
      turnContext: {
        turnNumber: null,
        currentPlayer: null,
      },
      players: {
        player1: {
          board: {
            active: null,
            bench: [],
            discard: [],
            lostZone: [],
            prize: [],
            markers: [],
          },
          counters: {
            deckCount: 0,
            handCount: 0,
          },
        },
        player2: {
          board: {
            active: null,
            bench: [],
            discard: [],
            lostZone: [],
            prize: [],
            markers: [],
          },
          counters: {
            deckCount: 0,
            handCount: 0,
          },
        },
      },
      stadium: null,
    },
  };
}

function createEmptyPrivateStateV2(ownerPlayerId, now) {
  return {
    ownerPlayerId,
    updatedAt: now,
    updatedBy: ownerPlayerId,
    revision: 0,
    zones: {
      deck: [],
      hand: [],
    },
    cardCatalog: {},
  };
}

function createAllocator(ownerPlayerId, cardCatalog, now) {
  const queueByImageUrl = new Map();
  let seedIndex = 1;

  function createCard(imageUrl) {
    const normalized = normalizeUrl(imageUrl);
    if (!normalized) {
      return null;
    }
    const cardId = createCardInstanceId(ownerPlayerId, seedIndex);
    seedIndex += 1;
    cardCatalog[cardId] = {
      cardId,
      imageUrl: normalized,
      originalCardCode: extractOriginalCardCodeFromImageUrl(normalized),
      ownerPlayerId,
      createdAt: now,
    };
    return cardId;
  }

  return {
    seedFromUrls(urls) {
      asArray(urls).forEach((url) => {
        const normalized = normalizeUrl(url);
        if (!normalized) {
          return;
        }
        const cardId = createCard(normalized);
        if (!cardId) {
          return;
        }
        const queue = queueByImageUrl.get(normalized) || [];
        queue.push(cardId);
        queueByImageUrl.set(normalized, queue);
      });
    },
    consumeCardId(imageUrl) {
      const normalized = normalizeUrl(imageUrl);
      if (!normalized) {
        return null;
      }
      const queue = queueByImageUrl.get(normalized);
      if (queue && queue.length > 0) {
        const cardId = queue.shift();
        queueByImageUrl.set(normalized, queue);
        return cardId;
      }
      return createCard(normalized);
    },
  };
}

function extractImageUrlsFromLegacyStack(legacyStack) {
  if (typeof legacyStack === 'string') {
    return [legacyStack];
  }
  if (Array.isArray(legacyStack)) {
    return legacyStack.filter((value) => typeof value === 'string');
  }
  if (!legacyStack || typeof legacyStack !== 'object') {
    return [];
  }
  if (Array.isArray(legacyStack.images)) {
    return legacyStack.images.filter((value) => typeof value === 'string');
  }
  if (typeof legacyStack.image === 'string') {
    return [legacyStack.image];
  }
  return [];
}

function collectSourceUrls(legacyPlayer) {
  const fromAll = asArray(legacyPlayer?.all).map((value) => normalizeUrl(value)).filter(Boolean);
  if (fromAll.length > 0) {
    return fromAll;
  }
  const urls = [];
  urls.push(...asArray(legacyPlayer?.deck));
  urls.push(...asArray(legacyPlayer?.hand));
  urls.push(...asArray(legacyPlayer?.discardPile));
  urls.push(...asArray(legacyPlayer?.prizeCards));
  urls.push(...asArray(legacyPlayer?.lostZone));
  urls.push(...extractImageUrlsFromLegacyStack(legacyPlayer?.activeSpot));
  asArray(legacyPlayer?.bench).forEach((stack) => {
    urls.push(...extractImageUrlsFromLegacyStack(stack));
  });
  return urls.map((value) => normalizeUrl(value)).filter(Boolean);
}

function createCardRef(cardId, options = {}) {
  return {
    cardId,
    orientation: options.orientation || ORIENTATION.VERTICAL,
    isFaceDown: Boolean(options.isFaceDown),
    visibility: options.visibility || VISIBILITY.OWNER_ONLY,
  };
}

function createPrizeCardRef(cardId) {
  return {
    cardId,
    isFaceDown: true,
    revealedTo: REVEALED_TO.OWNER,
  };
}

function createStackRef(stackId, cardIds, legacyStack) {
  return {
    stackId,
    cardIds,
    damage: normalizeNumber(legacyStack?.damage, 0),
    specialConditions: {
      ...STATUS_CONDITIONS_DEFAULT,
      poisoned: Boolean(legacyStack?.isPoisoned),
      burned: Boolean(legacyStack?.isBurned),
      asleep: Boolean(legacyStack?.isAsleep),
      paralyzed: Boolean(legacyStack?.isParalyzed),
      confused: Boolean(legacyStack?.isConfused),
    },
    orientation: normalizeOrientation(legacyStack?.orientation),
    isFaceDown: Boolean(legacyStack?.isFaceDown),
  };
}

function migrateLegacyStack(legacyStack, stackId, allocator) {
  if (legacyStack === null || legacyStack === undefined) {
    return null;
  }
  const cardIds = extractImageUrlsFromLegacyStack(legacyStack)
    .map((url) => allocator.consumeCardId(url))
    .filter(Boolean);
  if (cardIds.length === 0) {
    return null;
  }
  return createStackRef(stackId, cardIds, legacyStack);
}

function migrateLegacyPlayer(legacyPlayer, ownerPlayerId, now) {
  const privateState = createEmptyPrivateStateV2(ownerPlayerId, now);
  const allocator = createAllocator(ownerPlayerId, privateState.cardCatalog, now);
  allocator.seedFromUrls(collectSourceUrls(legacyPlayer));

  const deck = asArray(legacyPlayer?.deck)
    .map((url) => allocator.consumeCardId(url))
    .filter(Boolean)
    .map((cardId) =>
      createCardRef(cardId, {
        isFaceDown: true,
        visibility: VISIBILITY.OWNER_ONLY,
      })
    );
  const hand = asArray(legacyPlayer?.hand)
    .map((url) => allocator.consumeCardId(url))
    .filter(Boolean)
    .map((cardId) =>
      createCardRef(cardId, {
        isFaceDown: false,
        visibility: VISIBILITY.OWNER_ONLY,
      })
    );

  privateState.zones.deck = deck;
  privateState.zones.hand = hand;
  privateState.initialDeckCardIds = Object.keys(privateState.cardCatalog);

  const discard = asArray(legacyPlayer?.discardPile)
    .map((url) => allocator.consumeCardId(url))
    .filter(Boolean)
    .map((cardId) =>
      createCardRef(cardId, {
        isFaceDown: false,
        visibility: VISIBILITY.PUBLIC,
      })
    );

  const lostZone = asArray(legacyPlayer?.lostZone)
    .map((url) => allocator.consumeCardId(url))
    .filter(Boolean)
    .map((cardId) =>
      createCardRef(cardId, {
        isFaceDown: false,
        visibility: VISIBILITY.PUBLIC,
      })
    );

  const prize = asArray(legacyPlayer?.prizeCards)
    .map((url) => allocator.consumeCardId(url))
    .filter(Boolean)
    .map((cardId) => createPrizeCardRef(cardId));

  const bench = asArray(legacyPlayer?.bench)
    .map((legacyStack, index) =>
      migrateLegacyStack(legacyStack, `s_${ownerPlayerId}_bench_${index + 1}`, allocator)
    )
    .filter(Boolean);

  const activeRaw = legacyPlayer?.activeSpot;
  const active = Array.isArray(activeRaw)
    ? null
    : migrateLegacyStack(activeRaw, `s_${ownerPlayerId}_active`, allocator);

  return {
    privateState,
    board: {
      active,
      bench,
      discard,
      lostZone,
      prize,
      markers: [],
    },
    counters: {
      deckCount: deck.length,
      handCount: hand.length,
    },
  };
}

function hasBoardActivity(board) {
  if (!board) {
    return false;
  }
  return Boolean(
    board.active ||
      asArray(board.bench).length > 0 ||
      asArray(board.discard).length > 0 ||
      asArray(board.lostZone).length > 0 ||
      asArray(board.prize).length > 0
  );
}

export function isV2SessionDoc(sessionDoc) {
  return (
    Boolean(sessionDoc) &&
    sessionDoc.version === 2 &&
    typeof sessionDoc.publicState === 'object' &&
    sessionDoc.publicState !== null
  );
}

export function isV1SessionDoc(sessionDoc) {
  if (!sessionDoc || typeof sessionDoc !== 'object') {
    return false;
  }
  if (isV2SessionDoc(sessionDoc)) {
    return false;
  }
  return Boolean(sessionDoc.player1 || sessionDoc.player2);
}

export function migrateSessionV1ToV2(v1SessionDoc, { now, updatedBy } = {}) {
  if (!isV1SessionDoc(v1SessionDoc)) {
    throw new Error('Input document is not V1 schema.');
  }

  const nowValue = now || new Date().toISOString();
  const actor = updatedBy || 'migration-script';
  const session = createEmptySessionV2({ now: nowValue, createdBy: actor });
  session.createdAt = v1SessionDoc.createdAt || nowValue;
  session.updatedAt = nowValue;
  session.updatedBy = actor;
  session.revision = Number.isFinite(v1SessionDoc.revision) ? v1SessionDoc.revision : 0;

  const privateStatesByPlayer = {};

  ['player1', 'player2'].forEach((playerId) => {
    const migrated = migrateLegacyPlayer(v1SessionDoc[playerId] || {}, playerId, nowValue);
    session.publicState.players[playerId] = {
      board: migrated.board,
      counters: migrated.counters,
    };
    privateStatesByPlayer[playerId] = migrated.privateState;
  });

  const p1HasCards = Object.keys(privateStatesByPlayer.player1.cardCatalog).length > 0;
  const p2HasCards = Object.keys(privateStatesByPlayer.player2.cardCatalog).length > 0;
  const boardActive =
    hasBoardActivity(session.publicState.players.player1.board) ||
    hasBoardActivity(session.publicState.players.player2.board);

  if (boardActive) {
    session.status = SESSION_STATUS.PLAYING;
  } else if (p1HasCards && p2HasCards) {
    session.status = SESSION_STATUS.READY;
  } else {
    session.status = SESSION_STATUS.WAITING;
  }

  return {
    session,
    privateStatesByPlayer,
  };
}

function collectCardIdsFromCardRefs(items) {
  return asArray(items)
    .map((item) => item?.cardId)
    .filter(Boolean);
}

function collectCardIdsFromStack(stack) {
  return asArray(stack?.cardIds).filter(Boolean);
}

function collectBoardIds(board) {
  const ids = [];
  ids.push(...collectCardIdsFromStack(board?.active));
  asArray(board?.bench).forEach((stack) => {
    ids.push(...collectCardIdsFromStack(stack));
  });
  ids.push(...collectCardIdsFromCardRefs(board?.discard));
  ids.push(...collectCardIdsFromCardRefs(board?.lostZone));
  ids.push(...collectCardIdsFromCardRefs(board?.prize));
  return ids;
}

function collectPrivateZoneIds(privateState) {
  const ids = [];
  ids.push(...collectCardIdsFromCardRefs(privateState?.zones?.deck));
  ids.push(...collectCardIdsFromCardRefs(privateState?.zones?.hand));
  return ids;
}

export function validateV2Invariants(sessionDoc, privateStatesByPlayer) {
  const errors = [];

  if (!isV2SessionDoc(sessionDoc)) {
    errors.push('session.version must be 2 and publicState must exist');
    return errors;
  }

  ['player1', 'player2'].forEach((playerId) => {
    const active = sessionDoc?.publicState?.players?.[playerId]?.board?.active;
    if (Array.isArray(active)) {
      errors.push(`${playerId}.board.active must not be array`);
    } else if (active && typeof active !== 'object') {
      errors.push(`${playerId}.board.active must be object|null`);
    }
  });

  const seen = new Map();
  const markSeen = (cardId, path) => {
    if (!cardId) {
      return;
    }
    if (seen.has(cardId)) {
      errors.push(`duplicate cardId ${cardId}: ${seen.get(cardId)} and ${path}`);
      return;
    }
    seen.set(cardId, path);
  };

  ['player1', 'player2'].forEach((playerId) => {
    const board = sessionDoc?.publicState?.players?.[playerId]?.board || {};
    collectBoardIds(board).forEach((cardId, index) => {
      markSeen(cardId, `${playerId}.public[${index}]`);
    });

    const privateState = privateStatesByPlayer?.[playerId] || {};
    collectPrivateZoneIds(privateState).forEach((cardId, index) => {
      markSeen(cardId, `${playerId}.private[${index}]`);
    });

    const catalog = privateState.cardCatalog || {};
    collectBoardIds(board).forEach((cardId) => {
      if (!catalog[cardId]) {
        errors.push(`${playerId}.public references ${cardId} but cardCatalog is missing`);
      }
    });
    collectPrivateZoneIds(privateState).forEach((cardId) => {
      if (!catalog[cardId]) {
        errors.push(`${playerId}.private references ${cardId} but cardCatalog is missing`);
      }
    });
    Object.entries(catalog).forEach(([cardId, entity]) => {
      if (entity?.ownerPlayerId && entity.ownerPlayerId !== playerId) {
        errors.push(`cardCatalog owner mismatch for ${cardId}: ${entity.ownerPlayerId}`);
      }
      if (entity?.cardId && entity.cardId !== cardId) {
        errors.push(`cardCatalog id mismatch for key=${cardId}: entity.cardId=${entity.cardId}`);
      }
    });
  });

  return errors;
}
