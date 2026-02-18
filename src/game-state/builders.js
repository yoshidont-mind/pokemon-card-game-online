import {
  CONNECTION_STATE,
  CURRENT_SESSION_SCHEMA_VERSION,
  ORIENTATION,
  PLAYER_IDS,
  REVEALED_TO,
  SESSION_STATUS,
  STATUS_CONDITIONS_DEFAULT,
  VISIBILITY,
  isValidOrientation,
  isValidPlayerId,
  isValidVisibility,
} from './schemaV2';

function nowIso() {
  return new Date().toISOString();
}

function ensurePlayerId(playerId) {
  if (!isValidPlayerId(playerId)) {
    throw new Error(`Invalid playerId: ${playerId}`);
  }
}

function createParticipant() {
  return {
    uid: null,
    displayName: null,
    joinedAt: null,
    lastSeenAt: null,
    connectionState: CONNECTION_STATE.UNKNOWN,
  };
}

export function createEmptyBoard() {
  return {
    active: null,
    bench: [],
    discard: [],
    lostZone: [],
    prize: [],
    markers: [],
  };
}

export function createEmptySessionV2({ createdBy = 'system', now = nowIso() } = {}) {
  return {
    version: CURRENT_SESSION_SCHEMA_VERSION,
    status: SESSION_STATUS.WAITING,
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy,
    revision: 0,
    participants: {
      player1: createParticipant(),
      player2: createParticipant(),
    },
    publicState: {
      turnContext: {
        turnNumber: null,
        currentPlayer: null,
      },
      players: {
        player1: {
          board: createEmptyBoard(),
          counters: {
            deckCount: 0,
            handCount: 0,
          },
        },
        player2: {
          board: createEmptyBoard(),
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

export function createCardEntity({
  cardId,
  imageUrl,
  ownerPlayerId,
  originalCardCode = null,
  createdAt = nowIso(),
}) {
  ensurePlayerId(ownerPlayerId);
  if (!cardId || !imageUrl) {
    throw new Error('cardId and imageUrl are required for CardEntity');
  }
  return {
    cardId,
    imageUrl,
    originalCardCode,
    ownerPlayerId,
    createdAt,
  };
}

export function createCardRef({
  cardId,
  orientation = ORIENTATION.VERTICAL,
  isFaceDown = false,
  visibility = VISIBILITY.OWNER_ONLY,
}) {
  if (!cardId) {
    throw new Error('cardId is required for CardRef');
  }
  if (!isValidOrientation(orientation)) {
    throw new Error(`Invalid orientation for CardRef: ${orientation}`);
  }
  if (!isValidVisibility(visibility)) {
    throw new Error(`Invalid visibility for CardRef: ${visibility}`);
  }
  return {
    cardId,
    orientation,
    isFaceDown,
    visibility,
  };
}

export function createPrizeCardRef({
  cardId = null,
  isFaceDown = true,
  revealedTo = REVEALED_TO.NONE,
}) {
  return {
    cardId,
    isFaceDown,
    revealedTo,
  };
}

export function createStackRef({
  stackId,
  cardIds = [],
  damage = 0,
  specialConditions = STATUS_CONDITIONS_DEFAULT,
  orientation = ORIENTATION.VERTICAL,
  isFaceDown = false,
}) {
  if (!stackId) {
    throw new Error('stackId is required for StackRef');
  }
  if (!isValidOrientation(orientation)) {
    throw new Error(`Invalid orientation for StackRef: ${orientation}`);
  }
  return {
    stackId,
    cardIds,
    damage,
    specialConditions: {
      ...STATUS_CONDITIONS_DEFAULT,
      ...specialConditions,
    },
    orientation,
    isFaceDown,
  };
}

export function createEmptyPrivateStateV2({ ownerPlayerId, updatedBy = 'system', now = nowIso() }) {
  ensurePlayerId(ownerPlayerId);
  return {
    ownerPlayerId,
    updatedAt: now,
    updatedBy,
    revision: 0,
    zones: {
      deck: [],
      hand: [],
    },
    cardCatalog: {},
  };
}

export function createCardInstanceId({ ownerPlayerId, seedIndex, nonce = '' }) {
  ensurePlayerId(ownerPlayerId);
  const padded = String(seedIndex).padStart(3, '0');
  const noncePart = nonce ? `_${nonce}` : '';
  return `c_${ownerPlayerId}${noncePart}_${padded}`;
}

export function extractOriginalCardCodeFromImageUrl(imageUrl) {
  if (typeof imageUrl !== 'string') {
    return null;
  }
  const match = imageUrl.match(/\/([0-9]{6})_[^/]+$/);
  return match ? match[1] : null;
}

export function shuffleArray(items) {
  const copied = [...items];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

export function createPrivateStateFromDeckImageUrls({
  ownerPlayerId,
  imageUrls = [],
  initialHandSize = 7,
  updatedBy = 'system',
  now = nowIso(),
  shuffle = true,
}) {
  ensurePlayerId(ownerPlayerId);

  const privateState = createEmptyPrivateStateV2({ ownerPlayerId, updatedBy, now });
  const refs = [];
  const nonce = String(now).replace(/[^0-9]/g, '').slice(-12);

  imageUrls
    .filter((url) => typeof url === 'string' && url.trim() !== '')
    .forEach((imageUrl, index) => {
      const cardId = createCardInstanceId({
        ownerPlayerId,
        seedIndex: index + 1,
        nonce,
      });
      privateState.cardCatalog[cardId] = createCardEntity({
        cardId,
        imageUrl,
        ownerPlayerId,
        originalCardCode: extractOriginalCardCodeFromImageUrl(imageUrl),
        createdAt: now,
      });
      refs.push(createCardRef({ cardId, isFaceDown: true, visibility: VISIBILITY.OWNER_ONLY }));
    });

  const orderedRefs = shuffle ? shuffleArray(refs) : refs;
  const hand = orderedRefs.slice(0, initialHandSize).map((ref) => ({
    ...ref,
    isFaceDown: false,
    visibility: VISIBILITY.OWNER_ONLY,
  }));
  const deck = orderedRefs.slice(initialHandSize).map((ref) => ({
    ...ref,
    isFaceDown: true,
    visibility: VISIBILITY.OWNER_ONLY,
  }));

  privateState.zones.hand = hand;
  privateState.zones.deck = deck;
  privateState.initialDeckCardIds = refs.map((ref) => ref.cardId);

  return privateState;
}

export function createMarker({
  markerId,
  targetType = 'stack',
  targetId = null,
  label,
  expiresHint = null,
  createdBy = 'system',
  createdAt = nowIso(),
}) {
  if (!markerId) {
    throw new Error('markerId is required for Marker');
  }
  if (!label) {
    throw new Error('label is required for Marker');
  }
  return {
    markerId,
    targetType,
    targetId,
    label,
    expiresHint,
    createdBy,
    createdAt,
  };
}

export function ensurePlayerContainers(privateStatesByPlayer) {
  const result = { ...privateStatesByPlayer };
  for (const playerId of PLAYER_IDS) {
    if (!result[playerId]) {
      result[playerId] = createEmptyPrivateStateV2({ ownerPlayerId: playerId });
    }
  }
  return result;
}
