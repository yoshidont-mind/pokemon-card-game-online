import {
  createCardEntity,
  createCardInstanceId,
  createCardRef,
  createEmptyPrivateStateV2,
  createEmptySessionV2,
  createPrizeCardRef,
  createStackRef,
  extractOriginalCardCodeFromImageUrl,
} from './builders';
import { ORIENTATION, REVEALED_TO, SESSION_STATUS, VISIBILITY, isV1SessionDoc } from './schemaV2';

function nowIso() {
  return new Date().toISOString();
}

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

function normalizeNumeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOrientation(value) {
  return value === ORIENTATION.HORIZONTAL ? ORIENTATION.HORIZONTAL : ORIENTATION.VERTICAL;
}

function normalizePlayerId(playerId) {
  if (playerId === '1' || playerId === 1 || playerId === 'player1') {
    return 'player1';
  }
  if (playerId === '2' || playerId === 2 || playerId === 'player2') {
    return 'player2';
  }
  throw new Error(`Unsupported playerId: ${String(playerId)}`);
}

function createAllocator({ ownerPlayerId, cardCatalog, now }) {
  let seedIndex = 1;
  const queueByImageUrl = new Map();

  const createCard = (imageUrl) => {
    const normalized = normalizeUrl(imageUrl);
    if (!normalized) {
      return null;
    }
    const cardId = createCardInstanceId({ ownerPlayerId, seedIndex });
    seedIndex += 1;
    cardCatalog[cardId] = createCardEntity({
      cardId,
      imageUrl: normalized,
      ownerPlayerId,
      originalCardCode: extractOriginalCardCodeFromImageUrl(normalized),
      createdAt: now,
    });
    return cardId;
  };

  const seedFromUrls = (urls) => {
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
  };

  const consumeCardId = (imageUrl) => {
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
  };

  return {
    seedFromUrls,
    consumeCardId,
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

function toSpecialConditions(legacyStack) {
  return {
    poisoned: Boolean(legacyStack?.isPoisoned),
    burned: Boolean(legacyStack?.isBurned),
    asleep: Boolean(legacyStack?.isAsleep),
    paralyzed: Boolean(legacyStack?.isParalyzed),
    confused: Boolean(legacyStack?.isConfused),
  };
}

function migrateLegacyStack(legacyStack, { stackId, allocator }) {
  if (legacyStack === null || legacyStack === undefined) {
    return null;
  }
  const imageUrls = extractImageUrlsFromLegacyStack(legacyStack)
    .map((value) => normalizeUrl(value))
    .filter(Boolean);
  if (imageUrls.length === 0) {
    return null;
  }
  const cardIds = imageUrls.map((imageUrl) => allocator.consumeCardId(imageUrl)).filter(Boolean);
  if (cardIds.length === 0) {
    return null;
  }

  return createStackRef({
    stackId,
    cardIds,
    damage: normalizeNumeric(legacyStack?.damage, 0),
    specialConditions: toSpecialConditions(legacyStack),
    orientation: normalizeOrientation(legacyStack?.orientation),
    isFaceDown: Boolean(legacyStack?.isFaceDown),
  });
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

  const stadium = normalizeUrl(legacyPlayer?.stadium);
  if (stadium) {
    urls.push(stadium);
  }

  return urls.map((value) => normalizeUrl(value)).filter(Boolean);
}

function migrateLegacyPlayer(legacyPlayer, ownerPlayerId, now) {
  const privateState = createEmptyPrivateStateV2({
    ownerPlayerId,
    updatedBy: ownerPlayerId,
    now,
  });
  const allocator = createAllocator({
    ownerPlayerId,
    cardCatalog: privateState.cardCatalog,
    now,
  });

  const sourceUrls = collectSourceUrls(legacyPlayer);
  allocator.seedFromUrls(sourceUrls);

  const deck = asArray(legacyPlayer?.deck)
    .map((imageUrl) => allocator.consumeCardId(imageUrl))
    .filter(Boolean)
    .map((cardId) =>
      createCardRef({
        cardId,
        orientation: ORIENTATION.VERTICAL,
        isFaceDown: true,
        visibility: VISIBILITY.OWNER_ONLY,
      })
    );

  const hand = asArray(legacyPlayer?.hand)
    .map((imageUrl) => allocator.consumeCardId(imageUrl))
    .filter(Boolean)
    .map((cardId) =>
      createCardRef({
        cardId,
        orientation: ORIENTATION.VERTICAL,
        isFaceDown: false,
        visibility: VISIBILITY.OWNER_ONLY,
      })
    );

  privateState.zones.deck = deck;
  privateState.zones.hand = hand;
  privateState.initialDeckCardIds = Object.keys(privateState.cardCatalog);

  const discard = asArray(legacyPlayer?.discardPile)
    .map((imageUrl) => allocator.consumeCardId(imageUrl))
    .filter(Boolean)
    .map((cardId) =>
      createCardRef({
        cardId,
        orientation: ORIENTATION.VERTICAL,
        isFaceDown: false,
        visibility: VISIBILITY.PUBLIC,
      })
    );

  const lostZone = asArray(legacyPlayer?.lostZone)
    .map((imageUrl) => allocator.consumeCardId(imageUrl))
    .filter(Boolean)
    .map((cardId) =>
      createCardRef({
        cardId,
        orientation: ORIENTATION.VERTICAL,
        isFaceDown: false,
        visibility: VISIBILITY.PUBLIC,
      })
    );

  const prize = asArray(legacyPlayer?.prizeCards)
    .map((imageUrl) => allocator.consumeCardId(imageUrl))
    .filter(Boolean)
    .map((cardId) =>
      createPrizeCardRef({
        cardId,
        isFaceDown: true,
        revealedTo: REVEALED_TO.OWNER,
      })
    );

  const bench = asArray(legacyPlayer?.bench)
    .map((legacyStack, index) =>
      migrateLegacyStack(legacyStack, {
        stackId: `s_${ownerPlayerId}_bench_${index + 1}`,
        allocator,
      })
    )
    .filter(Boolean);

  const activeRaw = legacyPlayer?.activeSpot;
  const active = Array.isArray(activeRaw)
    ? null
    : migrateLegacyStack(activeRaw, {
        stackId: `s_${ownerPlayerId}_active`,
        allocator,
      });

  return {
    privateState,
    board: {
      active,
      bench,
      reveal: [],
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
      asArray(board.reveal).length > 0 ||
      asArray(board.discard).length > 0 ||
      asArray(board.lostZone).length > 0 ||
      asArray(board.prize).length > 0
  );
}

export function migrateSessionV1ToV2(v1SessionDoc, options = {}) {
  if (!isV1SessionDoc(v1SessionDoc)) {
    throw new Error('migrateSessionV1ToV2 requires a V1 session document.');
  }

  const now = options.now || nowIso();
  const createdBy = options.createdBy || 'migration';
  const updatedBy = options.updatedBy || createdBy;

  const migrated = createEmptySessionV2({ createdBy, now });
  migrated.createdAt = v1SessionDoc.createdAt || now;
  migrated.updatedAt = v1SessionDoc.updatedAt || now;
  migrated.updatedBy = v1SessionDoc.updatedBy || updatedBy;
  migrated.revision = Number.isFinite(v1SessionDoc.revision) ? v1SessionDoc.revision : 0;
  migrated.status = SESSION_STATUS.WAITING;

  const privateStatesByPlayer = {};

  ['player1', 'player2'].forEach((playerId) => {
    const legacyPlayer = v1SessionDoc[playerId] || {};
    const playerMigration = migrateLegacyPlayer(legacyPlayer, playerId, now);
    migrated.publicState.players[playerId] = {
      board: playerMigration.board,
      counters: playerMigration.counters,
    };
    privateStatesByPlayer[playerId] = playerMigration.privateState;
  });

  const publicCardCatalog = {};
  ['player1', 'player2'].forEach((playerId) => {
    const cardCatalog = privateStatesByPlayer?.[playerId]?.cardCatalog || {};
    Object.values(cardCatalog).forEach((cardEntity) => {
      const cardId = cardEntity?.cardId;
      const imageUrl =
        typeof cardEntity?.imageUrl === 'string' ? cardEntity.imageUrl.trim() : '';
      if (cardId && imageUrl) {
        publicCardCatalog[cardId] = imageUrl;
      }
    });
  });
  migrated.publicState.publicCardCatalog = publicCardCatalog;

  const player1HasCards = Object.keys(privateStatesByPlayer.player1.cardCatalog).length > 0;
  const player2HasCards = Object.keys(privateStatesByPlayer.player2.cardCatalog).length > 0;
  const boardHasAnyActivity =
    hasBoardActivity(migrated.publicState.players.player1.board) ||
    hasBoardActivity(migrated.publicState.players.player2.board);

  if (boardHasAnyActivity) {
    migrated.status = SESSION_STATUS.PLAYING;
  } else if (player1HasCards && player2HasCards) {
    migrated.status = SESSION_STATUS.READY;
  } else if (player1HasCards || player2HasCards) {
    migrated.status = SESSION_STATUS.WAITING;
  }

  return {
    session: migrated,
    privateStatesByPlayer,
  };
}

export function isV1Session(sessionDoc) {
  return isV1SessionDoc(sessionDoc);
}

export function toPlayerKey(playerId) {
  return normalizePlayerId(playerId);
}
