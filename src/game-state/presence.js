import { ERROR_CODES, GameStateError } from './errors';
import { applySessionMutation } from './transactionRunner';

export const CONNECTION_STATES = {
  ONLINE: 'online',
  OFFLINE: 'offline',
};

export async function touchSessionPresence({
  sessionId,
  playerId,
  actorUid,
  expectedRevision = null,
  connectionState = CONNECTION_STATES.ONLINE,
}) {
  if (!sessionId || !playerId || !actorUid) {
    throw new GameStateError(
      ERROR_CODES.INVALID_STATE,
      'touchSessionPresence requires sessionId, playerId, actorUid.'
    );
  }

  return applySessionMutation({
    sessionId,
    playerId,
    actorUid,
    expectedRevision,
    touchPrivateState: false,
    mutate: ({ sessionDoc, now }) => {
      const participant = sessionDoc?.participants?.[playerId];
      if (!participant) {
        throw new GameStateError(
          ERROR_CODES.INVALID_STATE,
          `participants.${playerId} is missing in session document.`
        );
      }

      sessionDoc.participants[playerId] = {
        ...participant,
        lastSeenAt: now,
        connectionState,
      };

      return { sessionDoc };
    },
  });
}
