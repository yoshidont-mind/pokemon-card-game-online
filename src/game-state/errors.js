export const ERROR_CODES = {
  NOT_FOUND: 'NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INVALID_STATE: 'INVALID_STATE',
  REVISION_CONFLICT: 'REVISION_CONFLICT',
  INVARIANT_VIOLATION: 'INVARIANT_VIOLATION',
  UNKNOWN: 'UNKNOWN',
};

export class GameStateError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'GameStateError';
    this.code = code || ERROR_CODES.UNKNOWN;
    this.details = details;
  }
}

export function isGameStateError(error, code = null) {
  if (!(error instanceof GameStateError)) {
    return false;
  }
  if (!code) {
    return true;
  }
  return error.code === code;
}
