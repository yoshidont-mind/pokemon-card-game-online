import { mutateDocsForDropIntent } from '../applyDropMutation';

function createDocs() {
  return {
    sessionDoc: {
      version: 2,
      status: 'ready',
      revision: 1,
      publicState: {
        players: {
          player1: {
            counters: { deckCount: 53, handCount: 2 },
            board: {
              active: null,
              bench: [],
              reveal: [],
              discard: [],
              lostZone: [],
              prize: [],
              markers: [],
            },
          },
          player2: {
            counters: { deckCount: 53, handCount: 2 },
            board: {
              active: {
                stackId: 's_player2_active',
                cardIds: ['c_player2_001'],
                damage: 0,
                specialConditions: {
                  poisoned: false,
                  burned: false,
                  asleep: false,
                  paralyzed: false,
                  confused: false,
                },
                orientation: 'vertical',
                isFaceDown: false,
              },
              bench: [],
              reveal: [],
              discard: [],
              lostZone: [],
              prize: [],
              markers: [],
            },
          },
        },
      },
    },
    privateStateDoc: {
      ownerPlayerId: 'player1',
      revision: 1,
      zones: {
        deck: [
          { cardId: 'c_player1_099', orientation: 'vertical', isFaceDown: true, visibility: 'ownerOnly' },
        ],
        hand: [
          { cardId: 'c_player1_001', orientation: 'vertical', isFaceDown: false, visibility: 'ownerOnly' },
          { cardId: 'c_player1_002', orientation: 'vertical', isFaceDown: false, visibility: 'ownerOnly' },
        ],
      },
      cardCatalog: {
        c_player1_001: { cardId: 'c_player1_001', imageUrl: 'https://example.com/1.jpg', ownerPlayerId: 'player1' },
        c_player1_002: { cardId: 'c_player1_002', imageUrl: 'https://example.com/2.jpg', ownerPlayerId: 'player1' },
        c_player1_099: { cardId: 'c_player1_099', imageUrl: 'https://example.com/99.jpg', ownerPlayerId: 'player1' },
      },
    },
  };
}

describe('mutateDocsForDropIntent', () => {
  test('moves a card from hand to discard and updates hand counter', () => {
    const { sessionDoc, privateStateDoc } = createDocs();

    const result = mutateDocsForDropIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        accepted: true,
        action: {
          kind: 'move-card-from-hand-to-zone',
          cardId: 'c_player1_001',
          targetZoneKind: 'discard',
        },
      },
    });

    expect(result.privateStateDoc.zones.hand).toHaveLength(1);
    expect(result.sessionDoc.publicState.players.player1.board.discard).toHaveLength(1);
    expect(result.sessionDoc.publicState.players.player1.counters.handCount).toBe(1);
    expect(result.sessionDoc.status).toBe('playing');
  });

  test('applies damage counter to target active stack', () => {
    const { sessionDoc, privateStateDoc } = createDocs();

    const result = mutateDocsForDropIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        accepted: true,
        action: {
          kind: 'apply-tool-to-stack',
          dragType: 'damage-counter',
          toolValue: '50',
          targetPlayerId: 'player2',
          targetStackKind: 'active',
        },
      },
    });

    expect(result.sessionDoc.publicState.players.player2.board.active.damage).toBe(50);
  });

  test('moves a hand card to a later bench slot without sparse undefined entries', () => {
    const { sessionDoc, privateStateDoc } = createDocs();

    const result = mutateDocsForDropIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        accepted: true,
        action: {
          kind: 'move-card-from-hand-to-zone',
          cardId: 'c_player1_001',
          targetZoneKind: 'bench',
          targetBenchIndex: 3,
        },
      },
    });

    const nextBench = result.sessionDoc.publicState.players.player1.board.bench;
    expect(nextBench).toHaveLength(5);
    expect(nextBench[0]).toBeNull();
    expect(nextBench[1]).toBeNull();
    expect(nextBench[2]).toBeNull();
    expect(nextBench[3]).toBeTruthy();
    expect(nextBench[3].cardIds).toEqual(['c_player1_001']);
    expect(nextBench[4]).toBeNull();
  });

  test('moves a hand card to prize zone as face-down', () => {
    const { sessionDoc, privateStateDoc } = createDocs();

    const result = mutateDocsForDropIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        accepted: true,
        action: {
          kind: 'move-card-from-hand-to-zone',
          cardId: 'c_player1_001',
          targetZoneKind: 'prize',
        },
      },
    });

    expect(result.privateStateDoc.zones.hand).toHaveLength(1);
    expect(result.sessionDoc.publicState.players.player1.board.prize).toHaveLength(1);
    expect(result.sessionDoc.publicState.players.player1.board.prize[0].isFaceDown).toBe(true);
  });

  test('moves a hand card to stadium zone', () => {
    const { sessionDoc, privateStateDoc } = createDocs();

    const result = mutateDocsForDropIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        accepted: true,
        action: {
          kind: 'move-card-from-hand-to-zone',
          cardId: 'c_player1_001',
          targetZoneKind: 'stadium',
        },
      },
    });

    expect(result.privateStateDoc.zones.hand).toHaveLength(1);
    expect(result.sessionDoc.publicState.stadium).toBeTruthy();
    expect(result.sessionDoc.publicState.stadium.cardId).toBe('c_player1_001');
  });

  test('moves a hand card to reveal zone and keeps imageUrl for opponent display', () => {
    const { sessionDoc, privateStateDoc } = createDocs();

    const result = mutateDocsForDropIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        accepted: true,
        action: {
          kind: 'move-card-from-hand-to-zone',
          cardId: 'c_player1_001',
          sourceZone: 'player-hand',
          targetZoneKind: 'reveal',
        },
      },
    });

    expect(result.privateStateDoc.zones.hand).toHaveLength(1);
    expect(result.sessionDoc.publicState.players.player1.board.reveal).toHaveLength(1);
    expect(result.sessionDoc.publicState.players.player1.board.reveal[0].imageUrl).toBe(
      'https://example.com/1.jpg'
    );
  });

  test('moves a card from reveal zone to discard', () => {
    const { sessionDoc, privateStateDoc } = createDocs();
    sessionDoc.publicState.players.player1.board.reveal = [
      {
        cardId: 'c_player1_001',
        orientation: 'vertical',
        isFaceDown: false,
        visibility: 'public',
        imageUrl: 'https://example.com/1.jpg',
      },
    ];
    privateStateDoc.zones.hand = [
      { cardId: 'c_player1_002', orientation: 'vertical', isFaceDown: false, visibility: 'ownerOnly' },
    ];
    sessionDoc.publicState.players.player1.counters.handCount = 1;

    const result = mutateDocsForDropIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        accepted: true,
        action: {
          kind: 'move-card-from-hand-to-zone',
          cardId: 'c_player1_001',
          sourceZone: 'player-reveal',
          targetZoneKind: 'discard',
        },
      },
    });

    expect(result.sessionDoc.publicState.players.player1.board.reveal).toHaveLength(0);
    expect(result.sessionDoc.publicState.players.player1.board.discard).toHaveLength(1);
    expect(result.sessionDoc.publicState.players.player1.board.discard[0].cardId).toBe('c_player1_001');
    expect(result.sessionDoc.publicState.players.player1.counters.handCount).toBe(1);
  });

  test('moves a card from deck peek zone to reveal zone', () => {
    const { sessionDoc, privateStateDoc } = createDocs();
    privateStateDoc.zones.deck = [];
    privateStateDoc.zones.deckPeek = [
      { cardId: 'c_player1_099', orientation: 'vertical', isFaceDown: false, visibility: 'ownerOnly' },
    ];
    sessionDoc.publicState.players.player1.counters.deckCount = 0;
    sessionDoc.publicState.turnContext = {
      deckPeekState: {
        byPlayerId: 'player1',
        isOpen: true,
        count: 1,
        updatedAt: '2026-02-20T10:00:00.000Z',
      },
    };

    const result = mutateDocsForDropIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        accepted: true,
        action: {
          kind: 'move-card-from-hand-to-zone',
          cardId: 'c_player1_099',
          sourceZone: 'player-deck-peek',
          targetZoneKind: 'reveal',
        },
      },
    });

    expect(result.privateStateDoc.zones.deck).toHaveLength(0);
    expect(result.privateStateDoc.zones.deckPeek).toHaveLength(0);
    expect(result.sessionDoc.publicState.players.player1.counters.deckCount).toBe(0);
    expect(result.sessionDoc.publicState.players.player1.board.reveal).toHaveLength(1);
    expect(result.sessionDoc.publicState.players.player1.board.reveal[0].cardId).toBe('c_player1_099');
    expect(result.sessionDoc.publicState.turnContext.deckPeekState.count).toBe(0);
    expect(result.sessionDoc.publicState.turnContext.deckPeekState.isOpen).toBe(false);
  });

  test('moves top card from deck pile to discard zone', () => {
    const { sessionDoc, privateStateDoc } = createDocs();
    sessionDoc.publicState.turnContext = {
      deckPeekState: {
        byPlayerId: 'player1',
        isOpen: true,
        count: 1,
        updatedAt: '2026-02-20T10:00:00.000Z',
      },
    };

    const result = mutateDocsForDropIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        accepted: true,
        action: {
          kind: 'move-top-card-from-source-to-hand',
          sourceZone: 'player-deck',
          targetZoneKind: 'discard',
        },
      },
    });

    expect(result.privateStateDoc.zones.deck).toHaveLength(0);
    expect(result.sessionDoc.publicState.players.player1.counters.deckCount).toBe(0);
    expect(result.sessionDoc.publicState.players.player1.board.discard).toHaveLength(1);
    expect(result.sessionDoc.publicState.players.player1.board.discard[0].cardId).toBe('c_player1_099');
    expect(result.sessionDoc.publicState.turnContext.deckPeekState.count).toBe(1);
    expect(result.sessionDoc.publicState.turnContext.deckPeekState.isOpen).toBe(true);
  });

  test('moves a hand card to deck top edge and records deck insert event', () => {
    const { sessionDoc, privateStateDoc } = createDocs();

    const result = mutateDocsForDropIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        accepted: true,
        action: {
          kind: 'move-card-to-deck-edge',
          cardId: 'c_player1_001',
          sourceZone: 'player-hand',
          targetDeckEdge: 'top',
        },
      },
    });

    expect(result.privateStateDoc.zones.hand).toHaveLength(1);
    expect(result.privateStateDoc.zones.deck[0].cardId).toBe('c_player1_001');
    expect(result.sessionDoc.publicState.players.player1.counters.deckCount).toBe(2);
    expect(result.sessionDoc.publicState.turnContext.lastDeckInsertEvent.position).toBe('top');
  });

  test('moves a deck peek card to deck bottom edge and keeps deck size', () => {
    const { sessionDoc, privateStateDoc } = createDocs();
    privateStateDoc.zones.deck = [
      { cardId: 'c_player1_098', orientation: 'vertical', isFaceDown: true, visibility: 'ownerOnly' },
    ];
    privateStateDoc.zones.deckPeek = [
      { cardId: 'c_player1_099', orientation: 'vertical', isFaceDown: false, visibility: 'ownerOnly' },
    ];
    sessionDoc.publicState.players.player1.counters.deckCount = 1;
    sessionDoc.publicState.turnContext = {
      deckPeekState: {
        byPlayerId: 'player1',
        isOpen: true,
        count: 1,
        updatedAt: '2026-02-20T10:00:00.000Z',
      },
    };

    const result = mutateDocsForDropIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        accepted: true,
        action: {
          kind: 'move-card-to-deck-edge',
          cardId: 'c_player1_099',
          sourceZone: 'player-deck-peek',
          targetDeckEdge: 'bottom',
        },
      },
    });

    expect(result.privateStateDoc.zones.deck).toHaveLength(2);
    expect(result.privateStateDoc.zones.deck[0].cardId).toBe('c_player1_098');
    expect(result.privateStateDoc.zones.deck[1].cardId).toBe('c_player1_099');
    expect(result.privateStateDoc.zones.deckPeek).toHaveLength(0);
    expect(result.sessionDoc.publicState.players.player1.counters.deckCount).toBe(2);
    expect(result.sessionDoc.publicState.turnContext.deckPeekState.count).toBe(0);
    expect(result.sessionDoc.publicState.turnContext.deckPeekState.isOpen).toBe(false);
    expect(result.sessionDoc.publicState.turnContext.lastDeckInsertEvent.position).toBe('bottom');
  });

  test('moves a hand card to top edge of occupied active stack', () => {
    const { sessionDoc, privateStateDoc } = createDocs();
    sessionDoc.publicState.players.player1.board.active = {
      stackId: 's_player1_active',
      cardIds: ['c_player1_050'],
      damage: 10,
      specialConditions: {
        poisoned: false,
        burned: false,
        asleep: false,
        paralyzed: false,
        confused: false,
      },
      orientation: 'vertical',
      isFaceDown: false,
    };
    privateStateDoc.cardCatalog.c_player1_050 = {
      cardId: 'c_player1_050',
      imageUrl: 'https://example.com/50.jpg',
      ownerPlayerId: 'player1',
    };

    const result = mutateDocsForDropIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        accepted: true,
        action: {
          kind: 'move-card-to-stack-edge',
          cardId: 'c_player1_001',
          sourceZone: 'player-hand',
          targetZoneKind: 'active',
          targetStackEdge: 'top',
        },
      },
    });

    expect(result.privateStateDoc.zones.hand).toHaveLength(1);
    expect(result.sessionDoc.publicState.players.player1.board.active.cardIds).toEqual([
      'c_player1_050',
      'c_player1_001',
    ]);
    expect(result.sessionDoc.status).toBe('playing');
  });

  test('moves a hand card to bottom edge of occupied bench stack', () => {
    const { sessionDoc, privateStateDoc } = createDocs();
    sessionDoc.publicState.players.player1.board.bench = [
      {
        stackId: 's_player1_bench_1',
        cardIds: ['c_player1_060'],
        damage: 0,
        specialConditions: {
          poisoned: false,
          burned: false,
          asleep: false,
          paralyzed: false,
          confused: false,
        },
        orientation: 'vertical',
        isFaceDown: false,
      },
    ];
    privateStateDoc.cardCatalog.c_player1_060 = {
      cardId: 'c_player1_060',
      imageUrl: 'https://example.com/60.jpg',
      ownerPlayerId: 'player1',
    };

    const result = mutateDocsForDropIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        accepted: true,
        action: {
          kind: 'move-card-to-stack-edge',
          cardId: 'c_player1_001',
          sourceZone: 'player-hand',
          targetZoneKind: 'bench',
          targetBenchIndex: 0,
          targetStackEdge: 'bottom',
        },
      },
    });

    expect(result.privateStateDoc.zones.hand).toHaveLength(1);
    expect(result.sessionDoc.publicState.players.player1.board.bench[0].cardIds).toEqual([
      'c_player1_001',
      'c_player1_060',
    ]);
  });

  test('moves a card from player stack source zone to discard', () => {
    const { sessionDoc, privateStateDoc } = createDocs();
    sessionDoc.publicState.players.player1.board.bench = [
      {
        stackId: 's_player1_bench_1',
        cardIds: ['c_player1_001', 'c_player1_060'],
        damage: 0,
        specialConditions: {
          poisoned: false,
          burned: false,
          asleep: false,
          paralyzed: false,
          confused: false,
        },
        orientation: 'vertical',
        isFaceDown: false,
      },
    ];
    privateStateDoc.cardCatalog.c_player1_060 = {
      cardId: 'c_player1_060',
      imageUrl: 'https://example.com/60.jpg',
      ownerPlayerId: 'player1',
    };
    privateStateDoc.zones.hand = [
      { cardId: 'c_player1_002', orientation: 'vertical', isFaceDown: false, visibility: 'ownerOnly' },
    ];
    sessionDoc.publicState.players.player1.counters.handCount = 1;

    const result = mutateDocsForDropIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        accepted: true,
        action: {
          kind: 'move-card-from-hand-to-zone',
          cardId: 'c_player1_060',
          sourceZone: 'player-stack',
          sourceStackKind: 'bench',
          sourceBenchIndex: 0,
          targetZoneKind: 'discard',
        },
      },
    });

    expect(result.sessionDoc.publicState.players.player1.board.bench[0].cardIds).toEqual(['c_player1_001']);
    expect(result.sessionDoc.publicState.players.player1.board.discard).toHaveLength(1);
    expect(result.sessionDoc.publicState.players.player1.board.discard[0].cardId).toBe('c_player1_060');
    expect(result.sessionDoc.publicState.players.player1.counters.handCount).toBe(1);
  });

  test('swaps occupied active and bench stacks', () => {
    const { sessionDoc, privateStateDoc } = createDocs();
    sessionDoc.publicState.players.player1.board.active = {
      stackId: 's_player1_active',
      cardIds: ['c_player1_010'],
      damage: 20,
      specialConditions: {
        poisoned: true,
        burned: false,
        asleep: false,
        paralyzed: false,
        confused: false,
      },
      orientation: 'vertical',
      isFaceDown: false,
    };
    sessionDoc.publicState.players.player1.board.bench = [
      {
        stackId: 's_player1_bench_1',
        cardIds: ['c_player1_020', 'c_player1_021'],
        damage: 0,
        specialConditions: {
          poisoned: false,
          burned: false,
          asleep: false,
          paralyzed: false,
          confused: false,
        },
        orientation: 'vertical',
        isFaceDown: false,
      },
    ];

    const result = mutateDocsForDropIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        accepted: true,
        action: {
          kind: 'swap-stacks-between-zones',
          sourceStackKind: 'active',
          targetZoneKind: 'bench',
          targetBenchIndex: 0,
        },
      },
    });

    expect(result.sessionDoc.publicState.players.player1.board.active.cardIds).toEqual([
      'c_player1_020',
      'c_player1_021',
    ]);
    expect(result.sessionDoc.publicState.players.player1.board.bench[0].cardIds).toEqual([
      'c_player1_010',
    ]);
    expect(result.sessionDoc.status).toBe('playing');
  });

  test('swaps occupied bench stacks between slots', () => {
    const { sessionDoc, privateStateDoc } = createDocs();
    sessionDoc.publicState.players.player1.board.bench = [
      {
        stackId: 's_player1_bench_1',
        cardIds: ['c_player1_110'],
        damage: 0,
        specialConditions: {
          poisoned: false,
          burned: false,
          asleep: false,
          paralyzed: false,
          confused: false,
        },
        orientation: 'vertical',
        isFaceDown: false,
      },
      {
        stackId: 's_player1_bench_2',
        cardIds: ['c_player1_120', 'c_player1_121'],
        damage: 30,
        specialConditions: {
          poisoned: false,
          burned: false,
          asleep: true,
          paralyzed: false,
          confused: false,
        },
        orientation: 'vertical',
        isFaceDown: false,
      },
    ];

    const result = mutateDocsForDropIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        accepted: true,
        action: {
          kind: 'swap-stacks-between-zones',
          sourceStackKind: 'bench',
          sourceBenchIndex: 0,
          targetZoneKind: 'bench',
          targetBenchIndex: 1,
        },
      },
    });

    expect(result.sessionDoc.publicState.players.player1.board.bench[0].cardIds).toEqual([
      'c_player1_120',
      'c_player1_121',
    ]);
    expect(result.sessionDoc.publicState.players.player1.board.bench[1].cardIds).toEqual([
      'c_player1_110',
    ]);
  });
});
