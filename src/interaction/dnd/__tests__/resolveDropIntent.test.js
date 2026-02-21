import {
  buildCardDragPayload,
  buildDamageCounterDragPayload,
  buildPileCardDragPayload,
  buildStackDragPayload,
  buildStackDropPayload,
  buildZoneDropPayload,
} from '../buildDragPayload';
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

  test('accepts moving a hand card to prize zone', () => {
    const boardSnapshot = createBoardSnapshot(createSessionDoc());
    const dragPayload = buildCardDragPayload({ cardId: 'c_player1_001', sourceZone: 'player-hand' });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'player-prize',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.PRIZE,
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.targetZoneKind).toBe(ZONE_KINDS.PRIZE);
  });

  test('accepts moving a hand card to stadium zone', () => {
    const boardSnapshot = createBoardSnapshot(createSessionDoc());
    const dragPayload = buildCardDragPayload({ cardId: 'c_player1_001', sourceZone: 'player-hand' });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'center-stadium',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.STADIUM,
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.targetZoneKind).toBe(ZONE_KINDS.STADIUM);
  });

  test('accepts moving a hand card to reveal zone', () => {
    const boardSnapshot = createBoardSnapshot(createSessionDoc());
    const dragPayload = buildCardDragPayload({ cardId: 'c_player1_001', sourceZone: 'player-hand' });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'player-reveal',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.REVEAL,
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.targetZoneKind).toBe(ZONE_KINDS.REVEAL);
  });

  test('accepts moving a reveal card to discard zone', () => {
    const boardSnapshot = createBoardSnapshot(createSessionDoc());
    const dragPayload = buildCardDragPayload({ cardId: 'c_player1_001', sourceZone: 'player-reveal' });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'player-discard',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.DISCARD,
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.sourceZone).toBe('player-reveal');
    expect(result.action.targetZoneKind).toBe(ZONE_KINDS.DISCARD);
  });

  test('accepts moving a hand card to deck-bottom edge drop zone', () => {
    const boardSnapshot = createBoardSnapshot(createSessionDoc());
    const dragPayload = buildCardDragPayload({ cardId: 'c_player1_001', sourceZone: 'player-hand' });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'player-deck-insert-bottom',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.DECK,
      edge: 'bottom',
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.kind).toBe('move-card-to-deck-edge');
    expect(result.action.targetDeckEdge).toBe('bottom');
  });

  test('accepts moving a deck card to reveal zone', () => {
    const boardSnapshot = createBoardSnapshot(createSessionDoc());
    const dragPayload = buildCardDragPayload({ cardId: 'c_player1_099', sourceZone: 'player-deck' });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'player-reveal',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.REVEAL,
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.sourceZone).toBe('player-deck');
    expect(result.action.targetZoneKind).toBe(ZONE_KINDS.REVEAL);
  });

  test('accepts moving top card from deck pile to discard zone', () => {
    const boardSnapshot = createBoardSnapshot(createSessionDoc());
    const dragPayload = buildPileCardDragPayload({
      sourceZone: 'player-deck',
      availableCount: 3,
    });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'player-discard',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.DISCARD,
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.kind).toBe('move-top-card-from-source-to-hand');
    expect(result.action.sourceZone).toBe('player-deck');
    expect(result.action.targetZoneKind).toBe(ZONE_KINDS.DISCARD);
  });

  test('rejects moving top card from prize pile to discard zone', () => {
    const boardSnapshot = createBoardSnapshot(createSessionDoc());
    const dragPayload = buildPileCardDragPayload({
      sourceZone: 'player-prize',
      availableCount: 3,
    });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'player-discard',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.DISCARD,
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe(REJECT_REASONS.UNSUPPORTED_TARGET);
  });

  test('accepts moving a deck peek card to deck-top edge drop zone', () => {
    const boardSnapshot = createBoardSnapshot(createSessionDoc());
    const dragPayload = buildCardDragPayload({ cardId: 'c_player1_099', sourceZone: 'player-deck-peek' });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'player-deck-insert-top',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.DECK,
      edge: 'top',
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.kind).toBe('move-card-to-deck-edge');
    expect(result.action.sourceZone).toBe('player-deck-peek');
    expect(result.action.targetDeckEdge).toBe('top');
  });

  test('accepts moving a card to top edge of occupied active stack', () => {
    const boardSnapshot = createBoardSnapshot(
      createSessionDoc({
        playerActive: { stackId: 's_player1_active', cardIds: ['c_player1_010'] },
      })
    );
    const dragPayload = buildCardDragPayload({ cardId: 'c_player1_001', sourceZone: 'player-hand' });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'player-active-insert-top',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.ACTIVE,
      edge: 'top',
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.kind).toBe('move-card-to-stack-edge');
    expect(result.action.targetZoneKind).toBe(ZONE_KINDS.ACTIVE);
    expect(result.action.targetStackEdge).toBe('top');
  });

  test('accepts moving a card to bottom edge of occupied bench stack', () => {
    const boardSnapshot = createBoardSnapshot(
      createSessionDoc({
        playerBench: [
          { stackId: 's_player1_bench_1', cardIds: ['c_player1_020'] },
        ],
      })
    );
    const dragPayload = buildCardDragPayload({ cardId: 'c_player1_001', sourceZone: 'player-hand' });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'player-bench-1-insert-bottom',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.BENCH,
      benchIndex: 0,
      edge: 'bottom',
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.kind).toBe('move-card-to-stack-edge');
    expect(result.action.targetZoneKind).toBe(ZONE_KINDS.BENCH);
    expect(result.action.targetBenchIndex).toBe(0);
    expect(result.action.targetStackEdge).toBe('bottom');
  });

  test('rejects stack-edge drop when target bench stack does not exist', () => {
    const boardSnapshot = createBoardSnapshot(createSessionDoc());
    const dragPayload = buildCardDragPayload({ cardId: 'c_player1_001', sourceZone: 'player-hand' });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'player-bench-1-insert-top',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.BENCH,
      benchIndex: 0,
      edge: 'top',
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

  test('accepts moving a card from player stack source zone to hand', () => {
    const boardSnapshot = createBoardSnapshot(createSessionDoc());
    const dragPayload = buildCardDragPayload({
      cardId: 'c_player1_020',
      sourceZone: 'player-stack',
      sourceStackKind: STACK_KINDS.BENCH,
      sourceBenchIndex: 0,
    });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'player-hand',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.HAND,
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.kind).toBe('move-card-from-hand-to-zone');
    expect(result.action.sourceZone).toBe('player-stack');
    expect(result.action.sourceStackKind).toBe(STACK_KINDS.BENCH);
    expect(result.action.sourceBenchIndex).toBe(0);
  });

  test('accepts swapping occupied stacks via stack drag payload', () => {
    const boardSnapshot = createBoardSnapshot(
      createSessionDoc({
        playerActive: { stackId: 's_player1_active', cardIds: ['c_player1_010'] },
        playerBench: [{ stackId: 's_player1_bench_1', cardIds: ['c_player1_020', 'c_player1_021'] }],
      })
    );
    const dragPayload = buildStackDragPayload({
      sourceStackKind: STACK_KINDS.BENCH,
      sourceBenchIndex: 0,
      previewCardId: 'c_player1_021',
    });
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
    expect(result.action.kind).toBe('swap-stacks-between-zones');
    expect(result.action.sourceStackKind).toBe(STACK_KINDS.BENCH);
    expect(result.action.sourceBenchIndex).toBe(0);
    expect(result.action.targetZoneKind).toBe(ZONE_KINDS.ACTIVE);
  });

  test('accepts swapping occupied stacks via stack drop target payload', () => {
    const boardSnapshot = createBoardSnapshot(
      createSessionDoc({
        playerActive: { stackId: 's_player1_active', cardIds: ['c_player1_010'] },
        playerBench: [{ stackId: 's_player1_bench_1', cardIds: ['c_player1_020', 'c_player1_021'] }],
      })
    );
    const dragPayload = buildStackDragPayload({
      sourceStackKind: STACK_KINDS.BENCH,
      sourceBenchIndex: 0,
      previewCardId: 'c_player1_021',
    });
    const dropPayload = buildStackDropPayload({
      zoneId: 'player-active',
      targetPlayerId: 'player1',
      stackKind: STACK_KINDS.ACTIVE,
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.kind).toBe('swap-stacks-between-zones');
    expect(result.action.sourceStackKind).toBe(STACK_KINDS.BENCH);
    expect(result.action.sourceBenchIndex).toBe(0);
    expect(result.action.targetZoneKind).toBe(ZONE_KINDS.ACTIVE);
  });

  test('accepts swapping occupied stacks when directly dragging a single-card stack', () => {
    const boardSnapshot = createBoardSnapshot(
      createSessionDoc({
        playerActive: { stackId: 's_player1_active', cardIds: ['c_player1_010'] },
        playerBench: [{ stackId: 's_player1_bench_1', cardIds: ['c_player1_020', 'c_player1_021'] }],
      })
    );
    const dragPayload = buildCardDragPayload({
      cardId: 'c_player1_010',
      sourceZone: 'player-stack',
      sourceStackKind: STACK_KINDS.ACTIVE,
    });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'player-bench-1',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.BENCH,
      benchIndex: 0,
    });

    const result = resolveDropIntent({
      dragPayload,
      dropPayload,
      boardSnapshot,
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.kind).toBe('swap-stacks-between-zones');
    expect(result.action.sourceStackKind).toBe(STACK_KINDS.ACTIVE);
    expect(result.action.targetZoneKind).toBe(ZONE_KINDS.BENCH);
    expect(result.action.targetBenchIndex).toBe(0);
  });

  test('accepts single-card stack swap via stack drop target payload', () => {
    const boardSnapshot = createBoardSnapshot(
      createSessionDoc({
        playerActive: { stackId: 's_player1_active', cardIds: ['c_player1_010'] },
        playerBench: [{ stackId: 's_player1_bench_1', cardIds: ['c_player1_020', 'c_player1_021'] }],
      })
    );
    const dragPayload = buildCardDragPayload({
      cardId: 'c_player1_010',
      sourceZone: 'player-stack',
      sourceStackKind: STACK_KINDS.ACTIVE,
    });
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

    expect(result.accepted).toBe(true);
    expect(result.action.kind).toBe('swap-stacks-between-zones');
    expect(result.action.sourceStackKind).toBe(STACK_KINDS.ACTIVE);
    expect(result.action.targetZoneKind).toBe(ZONE_KINDS.BENCH);
    expect(result.action.targetBenchIndex).toBe(0);
  });

  test('keeps target-occupied rejection when source stack has multiple cards', () => {
    const boardSnapshot = createBoardSnapshot(
      createSessionDoc({
        playerActive: { stackId: 's_player1_active', cardIds: ['c_player1_010', 'c_player1_011'] },
        playerBench: [{ stackId: 's_player1_bench_1', cardIds: ['c_player1_020'] }],
      })
    );
    const dragPayload = buildCardDragPayload({
      cardId: 'c_player1_010',
      sourceZone: 'player-stack',
      sourceStackKind: STACK_KINDS.ACTIVE,
    });
    const dropPayload = buildZoneDropPayload({
      zoneId: 'player-bench-1',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.BENCH,
      benchIndex: 0,
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
});
