const { after, afterEach, before, test } = require('node:test');
const { assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { createRulesTestEnvironment, seedSession } = require('./helpers/testEnv.cjs');

let testEnv = null;

before(async () => {
  testEnv = await createRulesTestEnvironment();
});

afterEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

test('participant can read occupied session', async () => {
  const sessionId = 'session-participant-read-ok';
  await seedSession({
    testEnv,
    sessionId,
    player1Uid: 'uid-player1',
    player2Uid: 'uid-player2',
  });

  const player1Db = testEnv.authenticatedContext('uid-player1').firestore();
  await assertSucceeds(player1Db.doc(`sessions/${sessionId}`).get());
});

test('non-participant cannot read occupied session', async () => {
  const sessionId = 'session-non-participant-read-ng';
  await seedSession({
    testEnv,
    sessionId,
    player1Uid: 'uid-player1',
    player2Uid: 'uid-player2',
  });

  const outsiderDb = testEnv.authenticatedContext('uid-outsider').firestore();
  await assertFails(outsiderDb.doc(`sessions/${sessionId}`).get());
});

test('non-participant can claim open player2 slot', async () => {
  const sessionId = 'session-claim-open-slot';
  await seedSession({
    testEnv,
    sessionId,
    player1Uid: 'uid-player1',
    player2Uid: null,
    includePlayer2Private: false,
    status: 'waiting',
    revision: 0,
  });

  const claimerDb = testEnv.authenticatedContext('uid-player2').firestore();
  await assertSucceeds(
    claimerDb.doc(`sessions/${sessionId}`).update({
      'participants.player2.uid': 'uid-player2',
      'participants.player2.joinedAt': '2026-02-18T01:00:00.000Z',
      'participants.player2.lastSeenAt': '2026-02-18T01:00:00.000Z',
      'participants.player2.connectionState': 'online',
      updatedAt: '2026-02-18T01:00:00.000Z',
      updatedBy: 'uid-player2',
      revision: 1,
      status: 'ready',
    })
  );
});

test('cannot overwrite already claimed player2 slot', async () => {
  const sessionId = 'session-claim-occupied-slot-ng';
  await seedSession({
    testEnv,
    sessionId,
    player1Uid: 'uid-player1',
    player2Uid: 'uid-player2',
    status: 'ready',
    revision: 2,
  });

  const outsiderDb = testEnv.authenticatedContext('uid-outsider').firestore();
  await assertFails(
    outsiderDb.doc(`sessions/${sessionId}`).update({
      'participants.player2.uid': 'uid-outsider',
      'participants.player2.lastSeenAt': '2026-02-18T02:00:00.000Z',
      updatedAt: '2026-02-18T02:00:00.000Z',
      updatedBy: 'uid-outsider',
      revision: 3,
      status: 'ready',
    })
  );
});

test('owner can read and update own privateState', async () => {
  const sessionId = 'session-private-own-ok';
  await seedSession({
    testEnv,
    sessionId,
    player1Uid: 'uid-player1',
    player2Uid: 'uid-player2',
    revision: 0,
  });

  const player1Db = testEnv.authenticatedContext('uid-player1').firestore();
  await assertSucceeds(player1Db.doc(`sessions/${sessionId}/privateState/player1`).get());
  await assertSucceeds(
    player1Db.doc(`sessions/${sessionId}/privateState/player1`).update({
      updatedAt: '2026-02-18T03:00:00.000Z',
      updatedBy: 'uid-player1',
      revision: 1,
    })
  );
});

test('owner cannot read or write opponent privateState', async () => {
  const sessionId = 'session-private-opponent-ng';
  await seedSession({
    testEnv,
    sessionId,
    player1Uid: 'uid-player1',
    player2Uid: 'uid-player2',
    revision: 0,
  });

  const player1Db = testEnv.authenticatedContext('uid-player1').firestore();
  await assertFails(player1Db.doc(`sessions/${sessionId}/privateState/player2`).get());
  await assertFails(
    player1Db.doc(`sessions/${sessionId}/privateState/player2`).update({
      updatedAt: '2026-02-18T03:10:00.000Z',
      updatedBy: 'uid-player1',
      revision: 1,
    })
  );
});

test('session update is denied when updatedBy does not match auth uid', async () => {
  const sessionId = 'session-updatedBy-mismatch-ng';
  await seedSession({
    testEnv,
    sessionId,
    player1Uid: 'uid-player1',
    player2Uid: 'uid-player2',
    revision: 5,
  });

  const player1Db = testEnv.authenticatedContext('uid-player1').firestore();
  await assertFails(
    player1Db.doc(`sessions/${sessionId}`).update({
      updatedAt: '2026-02-18T04:00:00.000Z',
      updatedBy: 'uid-player2',
      revision: 6,
    })
  );
});
