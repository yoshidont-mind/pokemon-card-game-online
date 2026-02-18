export const CURRENT_SESSION_SCHEMA_VERSION = 2;

export const PLAYER_IDS = ['player1', 'player2'];

export const SESSION_STATUS = {
  WAITING: 'waiting',
  READY: 'ready',
  PLAYING: 'playing',
  FINISHED: 'finished',
  ARCHIVED: 'archived',
};

export const CONNECTION_STATE = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  UNKNOWN: 'unknown',
};

export const ORIENTATION = {
  VERTICAL: 'vertical',
  HORIZONTAL: 'horizontal',
};

export const VISIBILITY = {
  PUBLIC: 'public',
  OWNER_ONLY: 'ownerOnly',
  TEMPORARILY_REVEALED: 'temporarilyRevealed',
};

export const REVEALED_TO = {
  NONE: 'none',
  OWNER: 'owner',
  BOTH: 'both',
};

export const STATUS_CONDITIONS_DEFAULT = {
  poisoned: false,
  burned: false,
  asleep: false,
  paralyzed: false,
  confused: false,
};

/**
 * @param {unknown} value
 * @returns {value is 'vertical' | 'horizontal'}
 */
export function isValidOrientation(value) {
  return value === ORIENTATION.VERTICAL || value === ORIENTATION.HORIZONTAL;
}

/**
 * @param {unknown} value
 * @returns {value is 'public' | 'ownerOnly' | 'temporarilyRevealed'}
 */
export function isValidVisibility(value) {
  return (
    value === VISIBILITY.PUBLIC ||
    value === VISIBILITY.OWNER_ONLY ||
    value === VISIBILITY.TEMPORARILY_REVEALED
  );
}

/**
 * @param {unknown} value
 * @returns {value is 'player1' | 'player2'}
 */
export function isValidPlayerId(value) {
  return PLAYER_IDS.includes(value);
}

export function isV2SessionDoc(doc) {
  return (
    Boolean(doc) &&
    doc.version === CURRENT_SESSION_SCHEMA_VERSION &&
    typeof doc.publicState === 'object' &&
    doc.publicState !== null &&
    typeof doc.participants === 'object' &&
    doc.participants !== null
  );
}

export function isV1SessionDoc(doc) {
  if (!doc || typeof doc !== 'object') {
    return false;
  }
  if (isV2SessionDoc(doc)) {
    return false;
  }
  return Boolean(doc.player1 || doc.player2);
}
