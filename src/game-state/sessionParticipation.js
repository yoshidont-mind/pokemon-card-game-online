import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import db from '../firebase';
import { createEmptyPrivateStateV2 } from './builders';
import { GameStateError, ERROR_CODES } from './errors';
import { SESSION_STATUS, isV2SessionDoc } from './schemaV2';

function ensureParticipantStructure(sessionDoc, playerId) {
  if (!sessionDoc?.participants || !sessionDoc.participants[playerId]) {
    throw new GameStateError(
      ERROR_CODES.INVALID_STATE,
      `participants.${playerId} is missing in session document.`
    );
  }
}

function nextSessionStatus(sessionDoc) {
  if (sessionDoc.status === SESSION_STATUS.PLAYING || sessionDoc.status === SESSION_STATUS.FINISHED) {
    return sessionDoc.status;
  }
  if (sessionDoc.status === SESSION_STATUS.ARCHIVED) {
    return SESSION_STATUS.ARCHIVED;
  }
  const p1Uid = sessionDoc?.participants?.player1?.uid;
  const p2Uid = sessionDoc?.participants?.player2?.uid;
  return p1Uid && p2Uid ? SESSION_STATUS.READY : SESSION_STATUS.WAITING;
}

export async function claimPlayerSlot({ sessionId, playerId, uid }) {
  if (!sessionId || !playerId || !uid) {
    throw new GameStateError(
      ERROR_CODES.INVALID_STATE,
      'claimPlayerSlot requires sessionId, playerId and uid.'
    );
  }

  const sessionRef = doc(db, 'sessions', sessionId);
  const privateStateRef = doc(db, 'sessions', sessionId, 'privateState', playerId);
  const now = new Date().toISOString();

  try {
    const result = await runTransaction(db, async (transaction) => {
      const sessionSnapshot = await transaction.get(sessionRef);
      if (!sessionSnapshot.exists()) {
        throw new GameStateError(ERROR_CODES.NOT_FOUND, `Session not found: ${sessionId}`);
      }
      const sessionDoc = sessionSnapshot.data();
      if (!isV2SessionDoc(sessionDoc)) {
        throw new GameStateError(
          ERROR_CODES.INVALID_STATE,
          'claimPlayerSlot only supports V2 sessions.'
        );
      }

      ensureParticipantStructure(sessionDoc, playerId);
      const participant = sessionDoc.participants[playerId];
      if (participant.uid && participant.uid !== uid) {
        throw new GameStateError(
          ERROR_CODES.PERMISSION_DENIED,
          `player slot ${playerId} is already owned by another uid.`
        );
      }

      const nextRevision = Number.isFinite(sessionDoc.revision) ? sessionDoc.revision + 1 : 1;
      const nextParticipants = {
        ...sessionDoc.participants,
        [playerId]: {
          ...participant,
          uid,
          joinedAt: participant.joinedAt || now,
          lastSeenAt: now,
          connectionState: 'online',
        },
      };

      const nextStatus = nextSessionStatus({
        ...sessionDoc,
        participants: nextParticipants,
      });

      transaction.update(sessionRef, {
        participants: nextParticipants,
        status: nextStatus,
        updatedAt: now,
        updatedBy: uid,
        revision: nextRevision,
      });

      return {
        revision: nextRevision,
        status: nextStatus,
      };
    });

    const privateStateSnapshot = await getDoc(privateStateRef);
    if (!privateStateSnapshot.exists()) {
      await setDoc(
        privateStateRef,
        createEmptyPrivateStateV2({
          ownerPlayerId: playerId,
          updatedBy: uid,
          now,
        })
      );
    }

    return result;
  } catch (error) {
    if (error instanceof GameStateError) {
      throw error;
    }
    if (error?.code === 'permission-denied') {
      throw new GameStateError(ERROR_CODES.PERMISSION_DENIED, 'Permission denied while claiming slot.', {
        sessionId,
        playerId,
      });
    }
    if (error?.code === 'not-found') {
      throw new GameStateError(ERROR_CODES.NOT_FOUND, `Session not found: ${sessionId}`);
    }
    throw new GameStateError(ERROR_CODES.UNKNOWN, 'Failed to claim player slot.', {
      sessionId,
      playerId,
      reason: error?.message || String(error),
    });
  }
}
