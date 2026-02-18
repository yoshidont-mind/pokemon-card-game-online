#!/usr/bin/env node
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { isV1SessionDoc, isV2SessionDoc, migrateSessionV1ToV2 } from './lib/v1_to_v2.mjs';

function parseArgs(argv) {
  const options = {
    project: null,
    dryRun: true,
    write: false,
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
      case '--dry-run':
        options.dryRun = true;
        options.write = false;
        break;
      case '--write':
        options.write = true;
        options.dryRun = false;
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

function summarizeMigrationTarget(migrated) {
  return {
    sessionVersion: migrated.session.version,
    player1: {
      deck: migrated.privateStatesByPlayer.player1?.zones?.deck?.length || 0,
      hand: migrated.privateStatesByPlayer.player1?.zones?.hand?.length || 0,
      catalog: Object.keys(migrated.privateStatesByPlayer.player1?.cardCatalog || {}).length,
    },
    player2: {
      deck: migrated.privateStatesByPlayer.player2?.zones?.deck?.length || 0,
      hand: migrated.privateStatesByPlayer.player2?.zones?.hand?.length || 0,
      catalog: Object.keys(migrated.privateStatesByPlayer.player2?.cardCatalog || {}).length,
    },
  };
}

async function writeMigratedSession(db, sessionRef, migrated) {
  const batch = db.batch();
  batch.set(sessionRef, migrated.session);

  Object.entries(migrated.privateStatesByPlayer).forEach(([playerId, privateState]) => {
    const privateRef = sessionRef.collection('privateState').doc(playerId);
    batch.set(privateRef, privateState);
  });

  await batch.commit();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initializeApp({ projectId: options.project });
  const db = getFirestore();

  const docs = await fetchTargetSessions(db, options);
  const summary = {
    scanned: docs.length,
    migratedCandidates: 0,
    written: 0,
    skippedV2: 0,
    skippedUnknown: 0,
    failed: 0,
    failures: [],
    previews: [],
    mode: options.write ? 'write' : 'dry-run',
  };

  for (const snapshot of docs) {
    const sessionId = snapshot.id;
    const sessionDoc = snapshot.data();

    if (isV2SessionDoc(sessionDoc)) {
      summary.skippedV2 += 1;
      continue;
    }
    if (!isV1SessionDoc(sessionDoc)) {
      summary.skippedUnknown += 1;
      continue;
    }

    try {
      const migrated = migrateSessionV1ToV2(sessionDoc, {
        now: new Date().toISOString(),
        updatedBy: 'migration-cli',
      });
      summary.migratedCandidates += 1;
      summary.previews.push({
        sessionId,
        ...summarizeMigrationTarget(migrated),
      });

      if (options.write) {
        await writeMigratedSession(db, snapshot.ref, migrated);
        summary.written += 1;
      }
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify(summary, null, 2));

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[migrate_sessions_v1_to_v2] fatal:', error);
  process.exit(1);
});
