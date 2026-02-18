const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');

const DEFAULT_PROJECT_ID = 'demo-pokemon-card-game-online';

function resolveFirestoreHostAndPort() {
  const fallback = { host: '127.0.0.1', port: 8080 };
  const raw = process.env.FIRESTORE_EMULATOR_HOST;
  if (!raw) {
    return fallback;
  }

  const [host, portText] = raw.split(':');
  const parsedPort = Number(portText);
  if (!host || !Number.isFinite(parsedPort)) {
    return fallback;
  }

  return {
    host,
    port: parsedPort,
  };
}

function loadFirestoreRules() {
  const rulesPath = path.resolve(__dirname, '../../../firestore.rules');
  return fs.readFileSync(rulesPath, 'utf8');
}

async function createRulesTestEnvironment() {
  const { host, port } = resolveFirestoreHostAndPort();
  return initializeTestEnvironment({
    projectId: DEFAULT_PROJECT_ID,
    firestore: {
      host,
      port,
      rules: loadFirestoreRules(),
    },
  });
}

function createSessionDoc({
  player1Uid = 'uid-player1',
  player2Uid = 'uid-player2',
  revision = 0,
  status = 'ready',
  updatedBy = player1Uid || 'system',
  now = '2026-02-18T00:00:00.000Z',
} = {}) {
  return {
    version: 2,
    status,
    createdAt: now,
    createdBy: player1Uid || 'system',
    updatedAt: now,
    updatedBy,
    revision,
    participants: {
      player1: {
        uid: player1Uid,
        displayName: null,
        joinedAt: now,
        lastSeenAt: now,
        connectionState: player1Uid ? 'online' : 'unknown',
      },
      player2: {
        uid: player2Uid,
        displayName: null,
        joinedAt: player2Uid ? now : null,
        lastSeenAt: player2Uid ? now : null,
        connectionState: player2Uid ? 'online' : 'unknown',
      },
    },
    publicState: {
      turnContext: {
        turnNumber: null,
        currentPlayer: null,
      },
      players: {
        player1: {
          board: {
            active: null,
            bench: [],
            discard: [],
            lostZone: [],
            prize: [],
            markers: [],
          },
          counters: {
            deckCount: 0,
            handCount: 0,
          },
        },
        player2: {
          board: {
            active: null,
            bench: [],
            discard: [],
            lostZone: [],
            prize: [],
            markers: [],
          },
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

function createPrivateStateDoc({
  ownerPlayerId,
  updatedBy,
  revision = 0,
  now = '2026-02-18T00:00:00.000Z',
} = {}) {
  return {
    ownerPlayerId,
    updatedAt: now,
    updatedBy,
    revision,
    zones: {
      deck: [],
      hand: [],
    },
    cardCatalog: {},
  };
}

async function seedSession({
  testEnv,
  sessionId,
  player1Uid = 'uid-player1',
  player2Uid = 'uid-player2',
  includePlayer1Private = true,
  includePlayer2Private = true,
  revision = 0,
  status = 'ready',
  now = '2026-02-18T00:00:00.000Z',
} = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const sessionDoc = createSessionDoc({
      player1Uid,
      player2Uid,
      revision,
      status,
      updatedBy: player1Uid || 'system',
      now,
    });

    await db.doc(`sessions/${sessionId}`).set(sessionDoc);

    if (includePlayer1Private) {
      await db.doc(`sessions/${sessionId}/privateState/player1`).set(
        createPrivateStateDoc({
          ownerPlayerId: 'player1',
          updatedBy: player1Uid || 'system',
          revision,
          now,
        })
      );
    }

    if (includePlayer2Private) {
      await db.doc(`sessions/${sessionId}/privateState/player2`).set(
        createPrivateStateDoc({
          ownerPlayerId: 'player2',
          updatedBy: player2Uid || player1Uid || 'system',
          revision,
          now,
        })
      );
    }
  });
}

module.exports = {
  createRulesTestEnvironment,
  seedSession,
};
