import { createEmptyPrivateStateV2, createEmptySessionV2 } from './builders';
import { migrateSessionV1ToV2, toPlayerKey } from './migrateV1ToV2';
import { isV1SessionDoc, isV2SessionDoc } from './schemaV2';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeUiPrefs(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    handTrayOpen: Boolean(source.handTrayOpen),
    toolboxOpen: Boolean(source.toolboxOpen),
  };
}

function normalizePrivateState(privateStateDoc, ownerPlayerId) {
  const fallback = createEmptyPrivateStateV2({
    ownerPlayerId,
    updatedBy: ownerPlayerId,
  });
  if (!privateStateDoc || typeof privateStateDoc !== 'object') {
    return fallback;
  }

  return {
    ...fallback,
    ...privateStateDoc,
    ownerPlayerId,
    zones: {
      deck: asArray(privateStateDoc?.zones?.deck),
      hand: asArray(privateStateDoc?.zones?.hand),
      deckPeek: asArray(privateStateDoc?.zones?.deckPeek),
    },
    cardCatalog:
      privateStateDoc?.cardCatalog && typeof privateStateDoc.cardCatalog === 'object'
        ? privateStateDoc.cardCatalog
        : {},
    uiPrefs: normalizeUiPrefs(privateStateDoc?.uiPrefs),
  };
}

export function adaptSessionForClient({ sessionDoc, privateStateDoc, playerId }) {
  const ownerPlayerId = toPlayerKey(playerId);
  if (isV2SessionDoc(sessionDoc)) {
    return {
      ownerPlayerId,
      sessionDoc,
      privateStateDoc: normalizePrivateState(privateStateDoc, ownerPlayerId),
      privateStatesByPlayer: {
        [ownerPlayerId]: normalizePrivateState(privateStateDoc, ownerPlayerId),
      },
      wasMigratedFromV1: false,
    };
  }

  if (isV1SessionDoc(sessionDoc)) {
    const migrated = migrateSessionV1ToV2(sessionDoc, {
      createdBy: 'compat-read',
      updatedBy: 'compat-read',
    });
    return {
      ownerPlayerId,
      sessionDoc: migrated.session,
      privateStateDoc: migrated.privateStatesByPlayer[ownerPlayerId],
      privateStatesByPlayer: migrated.privateStatesByPlayer,
      wasMigratedFromV1: true,
    };
  }

  const emptySession = createEmptySessionV2({
    createdBy: 'compat-read',
  });
  return {
    ownerPlayerId,
    sessionDoc: emptySession,
    privateStateDoc: normalizePrivateState(null, ownerPlayerId),
    privateStatesByPlayer: {
      [ownerPlayerId]: normalizePrivateState(null, ownerPlayerId),
    },
    wasMigratedFromV1: false,
  };
}

export function hasDeckConfigured({ sessionDoc, privateStateDoc, playerId }) {
  const ownerPlayerId = toPlayerKey(playerId);
  if (isV2SessionDoc(sessionDoc)) {
    return Object.keys(privateStateDoc?.cardCatalog || {}).length > 0;
  }
  if (isV1SessionDoc(sessionDoc)) {
    return asArray(sessionDoc?.[ownerPlayerId]?.all).length > 0;
  }
  return false;
}

export function resolveCardRefsToImageUrls(cardRefs, privateStateDoc) {
  const cardCatalog = privateStateDoc?.cardCatalog || {};
  return asArray(cardRefs)
    .map((ref) => cardCatalog?.[ref?.cardId]?.imageUrl || null)
    .filter(Boolean);
}
