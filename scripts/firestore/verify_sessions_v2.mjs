#!/usr/bin/env node
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { isV2SessionDoc, validateV2Invariants } from './lib/v1_to_v2.mjs';

function parseArgs(argv) {
  const options = {
    project: null,
    sessionId: null,
    limit: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--project':
        options.project = argv[i + 1] || null;
        i += 1;
        break;
      case '--session-id':
        options.sessionId = argv[i + 1] || null;
        i += 1;
        break;
      case '--limit': {
        const value = Number(argv[i + 1]);
        options.limit = Number.isFinite(value) && value > 0 ? value : null;
        i += 1;
        break;
      }
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown option: ${arg}`);
        }
    }
  }

  if (!options.project) {
    throw new Error('Missing required option: --project <projectId>');
  }

  return options;
}

function missingRootFields(sessionDoc) {
  const requiredPaths = [
    'version',
    'status',
    'createdAt',
    'createdBy',
    'updatedAt',
    'updatedBy',
    'revision',
    'participants.player1',
    'participants.player2',
    'publicState.turnContext',
    'publicState.players.player1.board',
    'publicState.players.player2.board',
    'publicState.stadium',
  ];
  return requiredPaths.filter((path) => getPath(sessionDoc, path) === undefined);
}

function missingBoardFields(sessionDoc, playerId) {
  const board = getPath(sessionDoc, `publicState.players.${playerId}.board`) || {};
  const required = ['active', 'bench', 'discard', 'lostZone', 'prize', 'markers'];
  return required
    .filter((field) => board[field] === undefined)
    .map((field) => `publicState.players.${playerId}.board.${field}`);
}

function missingPrivateFields(privateStateDoc, playerId) {
  const requiredPaths = [
    'ownerPlayerId',
    'updatedAt',
    'updatedBy',
    'revision',
    'zones.deck',
    'zones.hand',
    'cardCatalog',
  ];
  return requiredPaths
    .filter((path) => getPath(privateStateDoc, path) === undefined)
    .map((path) => `privateState.${playerId}.${path}`);
}

function getPath(obj, path) {
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    return current[key];
  }, obj);
}

async function fetchTargetSessions(db, options) {
  if (options.sessionId) {
    const snapshot = await db.collection('sessions').doc(options.sessionId).get();
    return snapshot.exists ? [snapshot] : [];
  }
  let query = db.collection('sessions');
  if (options.limit) {
    query = query.limit(options.limit);
  }
  const snapshots = await query.get();
  return snapshots.docs;
}

async function fetchPrivateStates(sessionRef) {
  const snapshots = await sessionRef.collection('privateState').get();
  const privateStatesByPlayer = {};
  snapshots.docs.forEach((snapshot) => {
    privateStatesByPlayer[snapshot.id] = snapshot.data();
  });
  return privateStatesByPlayer;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initializeApp({ projectId: options.project });
  const db = getFirestore();
  const docs = await fetchTargetSessions(db, options);

  const summary = {
    scanned: docs.length,
    v2Sessions: 0,
    nonV2Sessions: 0,
    missingFieldSessions: 0,
    invariantFailedSessions: 0,
    passedSessions: 0,
    details: [],
  };

  for (const snapshot of docs) {
    const sessionDoc = snapshot.data();
    const sessionId = snapshot.id;
    if (!isV2SessionDoc(sessionDoc)) {
      summary.nonV2Sessions += 1;
      summary.details.push({
        sessionId,
        status: 'not-v2',
      });
      continue;
    }

    summary.v2Sessions += 1;
    const privateStatesByPlayer = await fetchPrivateStates(snapshot.ref);
    const missingFields = [
      ...missingRootFields(sessionDoc),
      ...missingBoardFields(sessionDoc, 'player1'),
      ...missingBoardFields(sessionDoc, 'player2'),
      ...missingPrivateFields(privateStatesByPlayer.player1 || {}, 'player1'),
      ...missingPrivateFields(privateStatesByPlayer.player2 || {}, 'player2'),
    ];
    const invariantErrors = validateV2Invariants(sessionDoc, privateStatesByPlayer);

    if (missingFields.length > 0) {
      summary.missingFieldSessions += 1;
    }
    if (invariantErrors.length > 0) {
      summary.invariantFailedSessions += 1;
    }
    if (missingFields.length === 0 && invariantErrors.length === 0) {
      summary.passedSessions += 1;
    }

    summary.details.push({
      sessionId,
      status:
        missingFields.length === 0 && invariantErrors.length === 0
          ? 'pass'
          : 'fail',
      missingFields,
      invariantErrors,
    });
  }

  console.log(JSON.stringify(summary, null, 2));

  if (summary.missingFieldSessions > 0 || summary.invariantFailedSessions > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[verify_sessions_v2] fatal:', error);
  process.exit(1);
});
