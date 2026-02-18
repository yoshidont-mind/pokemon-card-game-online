import { doc, runTransaction } from 'firebase/firestore';
import db from '../firebase';
import { createEmptyPrivateStateV2 } from './builders';
import { ERROR_CODES, GameStateError } from './errors';
import { isV2SessionDoc, isValidPlayerId } from './schemaV2';

function deepClone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function asRevision(value) {
  return Number.isFinite(value) ? value : 0;
}

function toMutationError(error, message, details = null) {
  if (error instanceof GameStateError) {
    return error;
  }
  if (error?.code === 'permission-denied') {
    return new GameStateError(ERROR_CODES.PERMISSION_DENIED, message, details);
  }
  if (error?.code === 'not-found') {
    return new GameStateError(ERROR_CODES.NOT_FOUND, message, details);
  }
  if (error?.code === 'aborted') {
    return new GameStateError(ERROR_CODES.REVISION_CONFLICT, message, details);
  }
  return new GameStateError(ERROR_CODES.UNKNOWN, message, details);
}

export async function applySessionMutation({
  sessionId,
  playerId,
  actorUid,
  expectedRevision = null,
  mutate,
  touchPrivateState = true,
}) {
  if (!sessionId || !playerId || !actorUid) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'sessionId, playerId, actorUid are required.');
  }
  if (!isValidPlayerId(playerId)) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, `Invalid playerId: ${playerId}`);
  }
  if (typeof mutate !== 'function') {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'mutate callback is required.');
  }

  const sessionRef = doc(db, 'sessions', sessionId);
  const privateRef = doc(db, 'sessions', sessionId, 'privateState', playerId);

  try {
    return await runTransaction(db, async (transaction) => {
      const sessionSnapshot = await transaction.get(sessionRef);
      if (!sessionSnapshot.exists()) {
        throw new GameStateError(ERROR_CODES.NOT_FOUND, `Session not found: ${sessionId}`);
      }

      const currentSessionDoc = sessionSnapshot.data();
      if (!isV2SessionDoc(currentSessionDoc)) {
        throw new GameStateError(ERROR_CODES.INVALID_STATE, 'Only V2 session documents are supported.');
      }

      const participant = currentSessionDoc?.participants?.[playerId];
      if (!participant?.uid || participant.uid !== actorUid) {
        throw new GameStateError(
          ERROR_CODES.PERMISSION_DENIED,
          `Actor ${actorUid} is not bound to ${playerId} in session ${sessionId}.`
        );
      }

      const currentRevision = asRevision(currentSessionDoc.revision);
      if (Number.isFinite(expectedRevision) && expectedRevision !== currentRevision) {
        throw new GameStateError(
          ERROR_CODES.REVISION_CONFLICT,
          `Revision conflict detected. expected=${expectedRevision}, actual=${currentRevision}`,
          {
            expectedRevision,
            actualRevision: currentRevision,
          }
        );
      }

      const privateSnapshot = touchPrivateState ? await transaction.get(privateRef) : null;
      const currentPrivateDoc = touchPrivateState
        ? privateSnapshot.exists()
          ? privateSnapshot.data()
          : createEmptyPrivateStateV2({
              ownerPlayerId: playerId,
              updatedBy: actorUid,
            })
        : null;

      const draftSessionDoc = deepClone(currentSessionDoc);
      const draftPrivateDoc = touchPrivateState ? deepClone(currentPrivateDoc) : null;
      const now = new Date().toISOString();

      const mutationResult = await mutate({
        sessionDoc: draftSessionDoc,
        privateStateDoc: draftPrivateDoc,
        now,
      });

      const nextSessionDoc = mutationResult?.sessionDoc || draftSessionDoc;
      const nextPrivateDoc = touchPrivateState
        ? mutationResult?.privateStateDoc || draftPrivateDoc
        : null;

      if (!isV2SessionDoc(nextSessionDoc)) {
        throw new GameStateError(ERROR_CODES.INVARIANT_VIOLATION, 'mutate() returned invalid sessionDoc.');
      }
      nextSessionDoc.updatedAt = now;
      nextSessionDoc.updatedBy = actorUid;
      nextSessionDoc.revision = currentRevision + 1;

      if (touchPrivateState) {
        if (nextPrivateDoc?.ownerPlayerId !== playerId) {
          throw new GameStateError(
            ERROR_CODES.INVARIANT_VIOLATION,
            'mutate() returned privateStateDoc with mismatched ownerPlayerId.'
          );
        }

        nextPrivateDoc.updatedAt = now;
        nextPrivateDoc.updatedBy = actorUid;
        nextPrivateDoc.revision = asRevision(currentPrivateDoc.revision) + 1;
      }

      transaction.set(sessionRef, nextSessionDoc);
      if (touchPrivateState) {
        transaction.set(privateRef, nextPrivateDoc);
      }

      return {
        sessionDoc: nextSessionDoc,
        privateStateDoc: nextPrivateDoc,
        revision: nextSessionDoc.revision,
      };
    });
  } catch (error) {
    throw toMutationError(error, 'Failed to apply session mutation.', {
      sessionId,
      playerId,
      actorUid,
      expectedRevision,
      reason: error?.message || String(error),
    });
  }
}
