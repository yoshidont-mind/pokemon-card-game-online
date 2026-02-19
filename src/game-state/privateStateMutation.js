import { doc, runTransaction } from 'firebase/firestore';
import db from '../firebase';
import { createEmptyPrivateStateV2 } from './builders';
import { ERROR_CODES, GameStateError } from './errors';
import { isValidPlayerId } from './schemaV2';

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

export async function applyPrivateStateMutation({
  sessionId,
  playerId,
  actorUid,
  mutate,
}) {
  if (!sessionId || !playerId || !actorUid) {
    throw new GameStateError(
      ERROR_CODES.INVALID_STATE,
      'sessionId, playerId, actorUid are required.'
    );
  }
  if (!isValidPlayerId(playerId)) {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, `Invalid playerId: ${playerId}`);
  }
  if (typeof mutate !== 'function') {
    throw new GameStateError(ERROR_CODES.INVALID_STATE, 'mutate callback is required.');
  }

  const privateRef = doc(db, 'sessions', sessionId, 'privateState', playerId);

  try {
    return await runTransaction(db, async (transaction) => {
      const privateSnapshot = await transaction.get(privateRef);
      const exists = privateSnapshot.exists();

      const currentPrivateDoc = exists
        ? privateSnapshot.data()
        : createEmptyPrivateStateV2({
            ownerPlayerId: playerId,
            updatedBy: actorUid,
          });

      if (currentPrivateDoc?.ownerPlayerId && currentPrivateDoc.ownerPlayerId !== playerId) {
        throw new GameStateError(
          ERROR_CODES.INVARIANT_VIOLATION,
          'ownerPlayerId mismatch in current private state.'
        );
      }

      const draftPrivateDoc = deepClone(currentPrivateDoc);
      const now = new Date().toISOString();

      const mutationResult = await mutate({
        privateStateDoc: draftPrivateDoc,
        now,
      });

      const nextPrivateDoc = mutationResult?.privateStateDoc || draftPrivateDoc;
      if (nextPrivateDoc?.ownerPlayerId !== playerId) {
        throw new GameStateError(
          ERROR_CODES.INVARIANT_VIOLATION,
          'mutate() returned privateStateDoc with mismatched ownerPlayerId.'
        );
      }

      nextPrivateDoc.updatedAt = now;
      nextPrivateDoc.updatedBy = actorUid;
      nextPrivateDoc.revision = exists ? asRevision(currentPrivateDoc.revision) + 1 : 0;

      transaction.set(privateRef, nextPrivateDoc);

      return {
        privateStateDoc: nextPrivateDoc,
        revision: nextPrivateDoc.revision,
      };
    });
  } catch (error) {
    throw toMutationError(error, 'Failed to apply private state mutation.', {
      sessionId,
      playerId,
      actorUid,
      reason: error?.message || String(error),
    });
  }
}

