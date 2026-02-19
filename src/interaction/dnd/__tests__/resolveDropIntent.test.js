import { buildCardDragPayload, buildDamageCounterDragPayload, buildStackDropPayload, buildZoneDropPayload } from '../buildDragPayload';
import { REJECT_REASONS, STACK_KINDS, ZONE_KINDS } from '../constants';
import { createBoardSnapshot, resolveDropIntent } from '../resolveDropIntent';

function createSessionDoc({ playerActive = null, opponentActive = null, playerBench = [], opponentBench = [] } = {}) {
  return {
    version: 2,
    publicState: {
      players: {
        player1: {
          board: {
            active: playerActive,
            bench: playerBench,
            discard: [],
            lostZone: [],
            prize: [],
            markers: [],
          },
        },
        player2: {
          board: {
            active: opponentActive,
            bench: opponentBench,
            discard: [],
            lostZone: [],
            prize: [],
            markers: [],
          },
        },
      },
    },
  };
}

describe('resolveDropIntent', () => {
  test('accepts moving a hand card to an empty active zone', () => {
    const boardSnapshot = createBoardSnapshot(createSessionDoc());
    const dragPayload = buildCardDragPayload({ cardId: 'c_player1_001', sourceZone: 'player-hand' });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'player-active',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.ACTIVE,
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.kind).toBe('move-card-from-hand-to-zone');
    expect(result.action.targetZoneKind).toBe(ZONE_KINDS.ACTIVE);
  });

  test('rejects moving a card to an occupied active zone', () => {
    const boardSnapshot = createBoardSnapshot(
      createSessionDoc({
        playerActive: { stackId: 's_player1_active', cardIds: ['c_player1_010'] },
      })
    );

    const dragPayload = buildCardDragPayload({ cardId: 'c_player1_001', sourceZone: 'player-hand' });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'player-active',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.ACTIVE,
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe(REJECT_REASONS.TARGET_OCCUPIED);
  });

  test('accepts dropping a damage counter onto an opponent active stack', () => {
    const boardSnapshot = createBoardSnapshot(
      createSessionDoc({
        opponentActive: { stackId: 's_player2_active', cardIds: ['c_player2_001'] },
      })
    );

    const dragPayload = buildDamageCounterDragPayload({ value: 50 });
    const dropPayload = buildStackDropPayload({
      zoneId: 'opponent-active',
      targetPlayerId: 'player2',
      stackKind: STACK_KINDS.ACTIVE,
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.kind).toBe('apply-tool-to-stack');
    expect(result.action.targetPlayerId).toBe('player2');
  });

  test('rejects dropping a tool onto a missing bench stack', () => {
    const boardSnapshot = createBoardSnapshot(createSessionDoc());
    const dragPayload = buildDamageCounterDragPayload({ value: 10 });
    const dropPayload = buildStackDropPayload({
      zoneId: 'player-bench-1',
      targetPlayerId: 'player1',
      stackKind: STACK_KINDS.BENCH,
      benchIndex: 0,
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe(REJECT_REASONS.TARGET_NOT_FOUND);
  });

  test('rejects moving hand card to opponent owned zone', () => {
    const boardSnapshot = createBoardSnapshot(createSessionDoc());
    const dragPayload = buildCardDragPayload({ cardId: 'c_player1_001', sourceZone: 'player-hand' });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'opponent-discard',
      targetPlayerId: 'player2',
      zoneKind: ZONE_KINDS.DISCARD,
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe(REJECT_REASONS.PERMISSION_DENIED);
  });
});
