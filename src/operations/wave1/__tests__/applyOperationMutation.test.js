import { mutateDocsForOperationIntent } from '../applyOperationMutation';
import { INTERNAL_OPERATION_IDS, OPERATION_IDS } from '../operationIds';

function createSessionDoc() {
  return {
    version: 2,
    status: 'ready',
    revision: 1,
    participants: {
      player1: { uid: 'uid-player1' },
      player2: { uid: 'uid-player2' },
    },
    publicState: {
      turnContext: {
        turnNumber: 1,
        currentPlayer: 'player1',
      },
      players: {
        player1: {
          counters: { deckCount: 3, handCount: 2 },
          board: {
            active: {
              stackId: 's_player1_active',
              cardIds: ['c_player1_active_001'],
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
            bench: [
              {
                stackId: 's_player1_bench_1',
                cardIds: ['c_player1_bench_001'],
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
            ],
            discard: [],
            lostZone: [],
            prize: [],
            markers: [],
          },
        },
        player2: {
          counters: { deckCount: 3, handCount: 2 },
          board: {
            active: null,
            bench: [],
            discard: [],
            lostZone: [],
            prize: [],
            markers: [],
          },
        },
      },
      stadium: null,
      operationRequests: [],
    },
  };
}

function createPrivateStateDoc({
  ownerPlayerId = 'player1',
  handCardIds = ['c_player1_hand_001', 'c_player1_hand_002'],
} = {}) {
  const deckPrefix = ownerPlayerId === 'player2' ? 'c_player2_deck_' : 'c_player1_deck_';
  const handPrefix = ownerPlayerId === 'player2' ? 'c_player2_hand_' : 'c_player1_hand_';
  const activeCardId = ownerPlayerId === 'player2' ? 'c_player2_active_001' : 'c_player1_active_001';
  const benchCardId = ownerPlayerId === 'player2' ? 'c_player2_bench_001' : 'c_player1_bench_001';
  const ownerDeckIds = [`${deckPrefix}001`, `${deckPrefix}002`, `${deckPrefix}003`];
  const ownerHandIds = handCardIds.length
    ? handCardIds
    : [`${handPrefix}001`, `${handPrefix}002`];

  const cardCatalog = {};
  const allCardIds = [...ownerDeckIds, ...ownerHandIds, activeCardId, benchCardId];
  allCardIds.forEach((cardId, index) => {
    cardCatalog[cardId] = {
      cardId,
      imageUrl: `https://example.com/${ownerPlayerId}_${index + 1}.jpg`,
      ownerPlayerId,
    };
  });

  return {
    ownerPlayerId,
    revision: 0,
    zones: {
      deck: ownerDeckIds.map((cardId) => ({
        cardId,
        orientation: 'vertical',
        isFaceDown: true,
        visibility: 'ownerOnly',
      })),
      hand: ownerHandIds.map((cardId) => ({
        cardId,
        orientation: 'vertical',
        isFaceDown: false,
        visibility: 'ownerOnly',
      })),
    },
    cardCatalog,
  };
}

describe('mutateDocsForOperationIntent', () => {
  test('draw operation moves cards from deck to hand and syncs counters', () => {
    const sessionDoc = createSessionDoc();
    const privateStateDoc = createPrivateStateDoc();

    const result = mutateDocsForOperationIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        action: {
          opId: OPERATION_IDS.OP_B03,
          mode: 'direct',
          payload: {
            count: 2,
          },
        },
      },
      now: '2026-02-19T03:00:00.000Z',
    });

    expect(result.privateStateDoc.zones.deck).toHaveLength(1);
    expect(result.privateStateDoc.zones.hand).toHaveLength(4);
    expect(result.sessionDoc.publicState.players.player1.counters.deckCount).toBe(1);
    expect(result.sessionDoc.publicState.players.player1.counters.handCount).toBe(4);
    expect(result.sessionDoc.status).toBe('playing');
  });

  test('switch operation swaps active and bench stack', () => {
    const sessionDoc = createSessionDoc();
    const privateStateDoc = createPrivateStateDoc();

    mutateDocsForOperationIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        action: {
          opId: OPERATION_IDS.OP_C02,
          mode: 'direct',
          payload: {
            benchIndex: 0,
          },
        },
      },
      now: '2026-02-19T03:00:00.000Z',
    });

    expect(sessionDoc.publicState.players.player1.board.active.cardIds).toEqual(['c_player1_bench_001']);
    expect(sessionDoc.publicState.players.player1.board.bench[0].cardIds).toEqual(['c_player1_active_001']);
  });

  test('request approve resolves pending discard request for target player', () => {
    const sessionDoc = createSessionDoc();
    sessionDoc.publicState.operationRequests = [
      {
        requestId: 'req_001',
        opId: OPERATION_IDS.OP_B11,
        requestType: 'opponent-discard-random-hand',
        status: 'pending',
        actorPlayerId: 'player2',
        targetPlayerId: 'player1',
        payload: { count: 1 },
        createdAt: '2026-02-19T02:59:00.000Z',
        resolvedAt: null,
        resolvedByPlayerId: null,
        result: null,
      },
    ];

    const privateStateDoc = createPrivateStateDoc();

    mutateDocsForOperationIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        action: {
          opId: INTERNAL_OPERATION_IDS.REQUEST_APPROVE,
          mode: 'request-resolution',
          payload: {
            requestId: 'req_001',
            action: 'approve',
          },
        },
      },
      now: '2026-02-19T03:10:00.000Z',
    });

    expect(privateStateDoc.zones.hand).toHaveLength(1);
    expect(sessionDoc.publicState.players.player1.board.discard).toHaveLength(1);
    expect(sessionDoc.publicState.operationRequests[0].status).toBe('completed');
    expect(sessionDoc.publicState.operationRequests[0].resolvedByPlayerId).toBe('player1');
  });

  test('request approve resolves reveal-hand request and stores revealed ids', () => {
    const sessionDoc = createSessionDoc();
    sessionDoc.publicState.operationRequests = [
      {
        requestId: 'req_002',
        opId: OPERATION_IDS.OP_A03,
        requestType: 'opponent-reveal-hand',
        status: 'pending',
        actorPlayerId: 'player1',
        targetPlayerId: 'player2',
        payload: { count: 2 },
        createdAt: '2026-02-19T03:00:00.000Z',
        resolvedAt: null,
        resolvedByPlayerId: null,
        result: null,
      },
    ];

    const privateStateDoc = createPrivateStateDoc({
      ownerPlayerId: 'player2',
      handCardIds: ['c_player2_hand_001', 'c_player2_hand_002', 'c_player2_hand_003'],
    });

    mutateDocsForOperationIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player2',
      intent: {
        action: {
          opId: INTERNAL_OPERATION_IDS.REQUEST_APPROVE,
          mode: 'request-resolution',
          payload: {
            requestId: 'req_002',
            action: 'approve',
          },
        },
      },
      now: '2026-02-19T03:11:00.000Z',
    });

    expect(sessionDoc.publicState.operationRequests[0].status).toBe('completed');
    expect(sessionDoc.publicState.operationRequests[0].resolvedByPlayerId).toBe('player2');
    expect(sessionDoc.publicState.operationRequests[0].result.revealedCardIds).toEqual([
      'c_player2_hand_001',
      'c_player2_hand_002',
      'c_player2_hand_003',
    ]);
    expect(privateStateDoc.zones.hand).toHaveLength(3);
  });

  test('request approve resolves OP-B12 selected discard request', () => {
    const sessionDoc = createSessionDoc();
    sessionDoc.publicState.operationRequests = [
      {
        requestId: 'req_002_b12',
        opId: OPERATION_IDS.OP_B12,
        requestType: 'opponent-discard-selected-hand',
        status: 'pending',
        actorPlayerId: 'player1',
        targetPlayerId: 'player2',
        payload: {
          cardId: 'c_player2_hand_002',
        },
        createdAt: '2026-02-19T03:00:00.000Z',
        resolvedAt: null,
        resolvedByPlayerId: null,
        result: null,
      },
    ];

    const privateStateDoc = createPrivateStateDoc({
      ownerPlayerId: 'player2',
      handCardIds: ['c_player2_hand_001', 'c_player2_hand_002', 'c_player2_hand_003'],
    });

    mutateDocsForOperationIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player2',
      intent: {
        action: {
          opId: INTERNAL_OPERATION_IDS.REQUEST_APPROVE,
          mode: 'request-resolution',
          payload: {
            requestId: 'req_002_b12',
            action: 'approve',
          },
        },
      },
      now: '2026-02-19T03:11:30.000Z',
    });

    expect(sessionDoc.publicState.operationRequests[0].status).toBe('completed');
    expect(sessionDoc.publicState.operationRequests[0].resolvedByPlayerId).toBe('player2');
    expect(sessionDoc.publicState.operationRequests[0].result.discardedCardIds).toEqual([
      'c_player2_hand_002',
    ]);
    expect(privateStateDoc.zones.hand.map((ref) => ref.cardId)).toEqual([
      'c_player2_hand_001',
      'c_player2_hand_003',
    ]);
    expect(
      sessionDoc.publicState.players.player2.board.discard.some(
        (ref) => ref.cardId === 'c_player2_hand_002'
      )
    ).toBe(true);
  });

  test('request approve resolves OP-B12 selected discard request for multiple cards', () => {
    const sessionDoc = createSessionDoc();
    sessionDoc.publicState.operationRequests = [
      {
        requestId: 'req_002_b12_multi',
        opId: OPERATION_IDS.OP_B12,
        requestType: 'opponent-discard-selected-hand',
        status: 'pending',
        actorPlayerId: 'player1',
        targetPlayerId: 'player2',
        payload: {
          cardIds: ['c_player2_hand_001', 'c_player2_hand_003'],
        },
        createdAt: '2026-02-19T03:00:00.000Z',
        resolvedAt: null,
        resolvedByPlayerId: null,
        result: null,
      },
    ];

    const privateStateDoc = createPrivateStateDoc({
      ownerPlayerId: 'player2',
      handCardIds: ['c_player2_hand_001', 'c_player2_hand_002', 'c_player2_hand_003'],
    });

    mutateDocsForOperationIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player2',
      intent: {
        action: {
          opId: INTERNAL_OPERATION_IDS.REQUEST_APPROVE,
          mode: 'request-resolution',
          payload: {
            requestId: 'req_002_b12_multi',
            action: 'approve',
          },
        },
      },
      now: '2026-02-19T03:11:45.000Z',
    });

    expect(sessionDoc.publicState.operationRequests[0].status).toBe('completed');
    expect(sessionDoc.publicState.operationRequests[0].result.discardedCardIds).toEqual([
      'c_player2_hand_001',
      'c_player2_hand_003',
    ]);
    expect(privateStateDoc.zones.hand.map((ref) => ref.cardId)).toEqual([
      'c_player2_hand_002',
    ]);
  });

  test('request reject marks pending request as rejected', () => {
    const sessionDoc = createSessionDoc();
    sessionDoc.publicState.operationRequests = [
      {
        requestId: 'req_003',
        opId: OPERATION_IDS.OP_B11,
        requestType: 'opponent-discard-random-hand',
        status: 'pending',
        actorPlayerId: 'player2',
        targetPlayerId: 'player1',
        payload: { count: 1 },
        createdAt: '2026-02-19T03:00:00.000Z',
        resolvedAt: null,
        resolvedByPlayerId: null,
        result: null,
      },
    ];

    const privateStateDoc = createPrivateStateDoc();

    mutateDocsForOperationIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        action: {
          opId: INTERNAL_OPERATION_IDS.REQUEST_REJECT,
          mode: 'request-resolution',
          payload: {
            requestId: 'req_003',
            action: 'reject',
          },
        },
      },
      now: '2026-02-19T03:12:00.000Z',
    });

    expect(sessionDoc.publicState.operationRequests[0].status).toBe('rejected');
    expect(sessionDoc.publicState.operationRequests[0].resolvedByPlayerId).toBe('player1');
    expect(sessionDoc.publicState.operationRequests[0].result.reason).toBe('rejected-by-target-player');
  });

  test('request resolution denies non-target player', () => {
    const sessionDoc = createSessionDoc();
    sessionDoc.publicState.operationRequests = [
      {
        requestId: 'req_004',
        opId: OPERATION_IDS.OP_B11,
        requestType: 'opponent-discard-random-hand',
        status: 'pending',
        actorPlayerId: 'player1',
        targetPlayerId: 'player2',
        payload: { count: 1 },
        createdAt: '2026-02-19T03:00:00.000Z',
        resolvedAt: null,
        resolvedByPlayerId: null,
        result: null,
      },
    ];

    const privateStateDoc = createPrivateStateDoc({
      ownerPlayerId: 'player1',
    });

    expect(() =>
      mutateDocsForOperationIntent({
        sessionDoc,
        privateStateDoc,
        playerId: 'player1',
        intent: {
          action: {
            opId: INTERNAL_OPERATION_IDS.REQUEST_APPROVE,
            mode: 'request-resolution',
            payload: {
              requestId: 'req_004',
              action: 'approve',
            },
          },
        },
        now: '2026-02-19T03:13:00.000Z',
      })
    ).toThrow(/Only target player can resolve this request/i);
    expect(sessionDoc.publicState.operationRequests[0].status).toBe('pending');
  });

  test('request resolution rejects already resolved request', () => {
    const sessionDoc = createSessionDoc();
    sessionDoc.publicState.operationRequests = [
      {
        requestId: 'req_005',
        opId: OPERATION_IDS.OP_B12,
        requestType: 'opponent-discard-selected-hand',
        status: 'completed',
        actorPlayerId: 'player1',
        targetPlayerId: 'player2',
        payload: { cardId: 'c_player2_hand_001' },
        createdAt: '2026-02-19T03:00:00.000Z',
        resolvedAt: '2026-02-19T03:10:00.000Z',
        resolvedByPlayerId: 'player2',
        result: {
          discardedCount: 1,
          discardedCardId: 'c_player2_hand_001',
          discardedCardIds: ['c_player2_hand_001'],
        },
      },
    ];

    const privateStateDoc = createPrivateStateDoc({
      ownerPlayerId: 'player2',
      handCardIds: ['c_player2_hand_001', 'c_player2_hand_002'],
    });

    expect(() =>
      mutateDocsForOperationIntent({
        sessionDoc,
        privateStateDoc,
        playerId: 'player2',
        intent: {
          action: {
            opId: INTERNAL_OPERATION_IDS.REQUEST_APPROVE,
            mode: 'request-resolution',
            payload: {
              requestId: 'req_005',
              action: 'approve',
            },
          },
        },
        now: '2026-02-19T03:14:00.000Z',
      })
    ).toThrow(/already resolved/i);
  });

  test('damage counter move transfers damage between stacks', () => {
    const sessionDoc = createSessionDoc();
    const privateStateDoc = createPrivateStateDoc();

    sessionDoc.publicState.players.player1.board.active.damage = 60;
    sessionDoc.publicState.players.player1.board.bench[0].damage = 0;

    mutateDocsForOperationIntent({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
      intent: {
        action: {
          opId: OPERATION_IDS.OP_F08,
          mode: 'direct',
          payload: {
            value: 20,
            sourceStackKind: 'active',
            targetStackKind: 'bench',
            targetBenchIndex: 0,
          },
        },
      },
      now: '2026-02-19T03:20:00.000Z',
    });

    expect(sessionDoc.publicState.players.player1.board.active.damage).toBe(40);
    expect(sessionDoc.publicState.players.player1.board.bench[0].damage).toBe(20);
  });
});

function createConditions(overrides = {}) {
  return {
    poisoned: false,
    burned: false,
    asleep: false,
    paralyzed: false,
    confused: false,
    ...overrides,
  };
}

function createStack(stackId, cardIds, {
  damage = 0,
  specialConditions = createConditions(),
} = {}) {
  return {
    stackId,
    cardIds: [...cardIds],
    damage,
    specialConditions: createConditions(specialConditions),
    orientation: 'vertical',
    isFaceDown: false,
  };
}

function createCardRef(cardId, { isFaceDown = false, visibility = 'public' } = {}) {
  return {
    cardId,
    orientation: 'vertical',
    isFaceDown,
    visibility,
  };
}

function createRichSessionDoc() {
  return {
    version: 2,
    status: 'ready',
    revision: 1,
    participants: {
      player1: { uid: 'uid-player1' },
      player2: { uid: 'uid-player2' },
    },
    publicState: {
      turnContext: {
        turnNumber: 1,
        currentPlayer: 'player1',
      },
      players: {
        player1: {
          counters: { deckCount: 5, handCount: 4 },
          board: {
            active: createStack('s_player1_active', ['p1_active_base', 'p1_active_energy'], {
              damage: 30,
            }),
            bench: [
              createStack('s_player1_bench_1', ['p1_bench0_base', 'p1_bench0_energy'], { damage: 10 }),
              createStack('s_player1_bench_2', ['p1_bench1_base']),
            ],
            discard: [
              createCardRef('p1_discard_001'),
              createCardRef('p1_discard_002'),
            ],
            lostZone: [
              createCardRef('p1_lost_001'),
            ],
            prize: [
              createCardRef('p1_prize_001', { isFaceDown: true }),
              createCardRef('p1_prize_002', { isFaceDown: true }),
            ],
            markers: [],
          },
        },
        player2: {
          counters: { deckCount: 4, handCount: 3 },
          board: {
            active: createStack('s_player2_active', ['p2_active_base']),
            bench: [
              createStack('s_player2_bench_1', ['p2_bench0_base']),
            ],
            discard: [],
            lostZone: [],
            prize: [],
            markers: [],
          },
        },
      },
      stadium: null,
      operationRequests: [],
    },
  };
}

function createRichPrivateStateDoc() {
  const deckIds = ['p1_deck_001', 'p1_deck_002', 'p1_deck_003', 'p1_deck_004', 'p1_deck_005'];
  const handIds = ['p1_hand_001', 'p1_hand_002', 'p1_hand_003', 'p1_hand_004'];
  const cardCatalog = {};

  [
    ...deckIds,
    ...handIds,
    'p1_active_base',
    'p1_active_energy',
    'p1_bench0_base',
    'p1_bench0_energy',
    'p1_bench1_base',
    'p1_discard_001',
    'p1_discard_002',
    'p1_lost_001',
    'p1_prize_001',
    'p1_prize_002',
  ].forEach((cardId, index) => {
    cardCatalog[cardId] = {
      cardId,
      imageUrl: `https://example.com/rich_${index + 1}.jpg`,
      ownerPlayerId: 'player1',
    };
  });

  return {
    ownerPlayerId: 'player1',
    revision: 0,
    zones: {
      deck: deckIds.map((cardId) => createCardRef(cardId, { isFaceDown: true, visibility: 'ownerOnly' })),
      hand: handIds.map((cardId) => createCardRef(cardId, { visibility: 'ownerOnly' })),
    },
    cardCatalog,
  };
}

function executeRichOperation({
  opId,
  payload = {},
  playerId = 'player1',
  sessionDoc = createRichSessionDoc(),
  privateStateDoc = createRichPrivateStateDoc(),
}) {
  mutateDocsForOperationIntent({
    sessionDoc,
    privateStateDoc,
    playerId,
    intent: {
      action: {
        opId,
        mode: 'direct',
        payload,
      },
    },
    now: '2026-02-19T04:00:00.000Z',
  });

  return {
    sessionDoc,
    privateStateDoc,
  };
}

describe('mutateDocsForOperationIntent wave1 direct operations', () => {
  test('OP-A01 sets last coin result', () => {
    const { sessionDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_A01,
    });
    expect(['heads', 'tails']).toContain(sessionDoc.publicState.turnContext.lastCoinResult);
    expect(sessionDoc.publicState.turnContext.lastCoinAt).toBeTruthy();
  });

  test.each([
    OPERATION_IDS.OP_A02,
    OPERATION_IDS.OP_A04,
    OPERATION_IDS.OP_G03,
    OPERATION_IDS.OP_G04,
    OPERATION_IDS.OP_I01,
  ])('%s stores operation marker on player board', (opId) => {
    const { sessionDoc } = executeRichOperation({
      opId,
      payload: {
        note: 'marker-test',
      },
    });
    const markers = sessionDoc.publicState.players.player1.board.markers;
    expect(markers).toHaveLength(1);
    expect(markers[0].label).toContain(opId);
  });

  test('OP-A05 records random selection without mutating source zone', () => {
    const sessionDoc = createRichSessionDoc();
    const privateStateDoc = createRichPrivateStateDoc();
    const beforeHand = privateStateDoc.zones.hand.map((ref) => ref.cardId);

    executeRichOperation({
      opId: OPERATION_IDS.OP_A05,
      payload: {
        sourceZone: 'hand',
        count: 2,
      },
      sessionDoc,
      privateStateDoc,
    });

    const selection = sessionDoc.publicState.turnContext.lastRandomSelection;
    expect(selection.zone).toBe('hand');
    expect(selection.cardIds).toHaveLength(2);
    expect(selection.cardIds.every((cardId) => beforeHand.includes(cardId))).toBe(true);
    expect(privateStateDoc.zones.hand.map((ref) => ref.cardId)).toEqual(beforeHand);
  });

  test.each([
    OPERATION_IDS.OP_A06,
    OPERATION_IDS.OP_B07,
  ])('%s reorders deck top by orderCardIds', (opId) => {
    const { privateStateDoc } = executeRichOperation({
      opId,
      payload: {
        orderCardIds: ['p1_deck_002', 'p1_deck_001', 'p1_deck_003'],
      },
    });
    expect(privateStateDoc.zones.deck[0].cardId).toBe('p1_deck_002');
    expect(privateStateDoc.zones.deck[1].cardId).toBe('p1_deck_001');
    expect(privateStateDoc.zones.deck[2].cardId).toBe('p1_deck_003');
  });

  test('OP-B01 shuffles deck while preserving members', () => {
    const { privateStateDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_B01,
    });
    const ids = privateStateDoc.zones.deck.map((ref) => ref.cardId).sort();
    expect(ids).toEqual(['p1_deck_001', 'p1_deck_002', 'p1_deck_003', 'p1_deck_004', 'p1_deck_005']);
  });

  test.each([
    [OPERATION_IDS.OP_B02, 'hand'],
    [OPERATION_IDS.OP_D05, 'deck-bottom'],
  ])('%s moves selected card from source to destination', (opId, targetZone) => {
    const { sessionDoc, privateStateDoc } = executeRichOperation({
      opId,
      payload: {
        sourceZone: 'discard',
        targetZone,
        cardIds: ['p1_discard_001'],
      },
    });

    expect(sessionDoc.publicState.players.player1.board.discard.some((ref) => ref.cardId === 'p1_discard_001')).toBe(false);
    if (targetZone === 'hand') {
      expect(privateStateDoc.zones.hand.some((ref) => ref.cardId === 'p1_discard_001')).toBe(true);
    } else {
      expect(privateStateDoc.zones.deck.some((ref) => ref.cardId === 'p1_discard_001')).toBe(true);
    }
  });

  test('OP-B03 draws cards', () => {
    const { privateStateDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_B03,
      payload: {
        count: 2,
      },
    });
    expect(privateStateDoc.zones.deck).toHaveLength(3);
    expect(privateStateDoc.zones.hand).toHaveLength(6);
  });

  test('OP-B04 mills cards to discard', () => {
    const { sessionDoc, privateStateDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_B04,
      payload: {
        count: 2,
      },
    });
    expect(privateStateDoc.zones.deck).toHaveLength(3);
    expect(sessionDoc.publicState.players.player1.board.discard).toHaveLength(4);
  });

  test('OP-B05 places chosen hand card on top of deck', () => {
    const { privateStateDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_B05,
      payload: {
        sourceZone: 'hand',
        targetZone: 'deck-top',
        cardIds: ['p1_hand_001'],
      },
    });
    expect(privateStateDoc.zones.hand.some((ref) => ref.cardId === 'p1_hand_001')).toBe(false);
    expect(privateStateDoc.zones.deck[0].cardId).toBe('p1_hand_001');
  });

  test('OP-B09 discards hand card', () => {
    const { sessionDoc, privateStateDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_B09,
      payload: {
        cardIds: ['p1_hand_002'],
      },
    });
    expect(privateStateDoc.zones.hand.some((ref) => ref.cardId === 'p1_hand_002')).toBe(false);
    expect(sessionDoc.publicState.players.player1.board.discard.some((ref) => ref.cardId === 'p1_hand_002')).toBe(true);
  });

  test('OP-B10 returns all hand cards to deck', () => {
    const { privateStateDoc, sessionDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_B10,
    });
    expect(privateStateDoc.zones.hand).toHaveLength(0);
    expect(privateStateDoc.zones.deck).toHaveLength(9);
    expect(sessionDoc.publicState.players.player1.counters.handCount).toBe(0);
    expect(sessionDoc.publicState.players.player1.counters.deckCount).toBe(9);
  });

  test.each([
    OPERATION_IDS.OP_C02,
    OPERATION_IDS.OP_C05,
  ])('%s swaps active and selected bench stack', (opId) => {
    const { sessionDoc } = executeRichOperation({
      opId,
      payload: {
        benchIndex: 0,
      },
    });
    expect(sessionDoc.publicState.players.player1.board.active.cardIds[0]).toBe('p1_bench0_base');
    expect(sessionDoc.publicState.players.player1.board.bench[0].cardIds[0]).toBe('p1_active_base');
  });

  test('OP-C03 deploys hand card to bench slot', () => {
    const { sessionDoc, privateStateDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_C03,
      payload: {
        cardId: 'p1_hand_003',
        benchIndex: 2,
      },
    });
    expect(privateStateDoc.zones.hand.some((ref) => ref.cardId === 'p1_hand_003')).toBe(false);
    expect(sessionDoc.publicState.players.player1.board.bench[2].cardIds).toContain('p1_hand_003');
  });

  test('OP-C04 calls opponent bench pokemon to active', () => {
    const { sessionDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_C04,
      payload: {
        targetPlayerId: 'player2',
        benchIndex: 0,
      },
    });
    expect(sessionDoc.publicState.players.player2.board.active.cardIds[0]).toBe('p2_bench0_base');
    expect(sessionDoc.publicState.players.player2.board.bench[0].cardIds[0]).toBe('p2_active_base');
  });

  test('OP-D01 set-from-hand adds facedown prize', () => {
    const { sessionDoc, privateStateDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_D01,
      payload: {
        mode: 'set-from-hand',
        cardIds: ['p1_hand_001'],
      },
    });
    expect(privateStateDoc.zones.hand.some((ref) => ref.cardId === 'p1_hand_001')).toBe(false);
    const placed = sessionDoc.publicState.players.player1.board.prize.find((ref) => ref.cardId === 'p1_hand_001');
    expect(placed?.isFaceDown).toBe(true);
  });

  test('OP-D01 take moves prize card to hand', () => {
    const { sessionDoc, privateStateDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_D01,
      payload: {
        mode: 'take',
        cardIds: ['p1_prize_001'],
      },
    });
    expect(sessionDoc.publicState.players.player1.board.prize.some((ref) => ref.cardId === 'p1_prize_001')).toBe(false);
    expect(privateStateDoc.zones.hand.some((ref) => ref.cardId === 'p1_prize_001')).toBe(true);
  });

  test.each([
    [OPERATION_IDS.OP_D02, 'discard'],
    [OPERATION_IDS.OP_D06, 'lostZone'],
  ])('%s moves hand card to destination zone', (opId, zoneKey) => {
    const { sessionDoc, privateStateDoc } = executeRichOperation({
      opId,
      payload: {
        sourceZone: 'hand',
        cardIds: ['p1_hand_001'],
      },
    });
    expect(privateStateDoc.zones.hand.some((ref) => ref.cardId === 'p1_hand_001')).toBe(false);
    expect(sessionDoc.publicState.players.player1.board[zoneKey].some((ref) => ref.cardId === 'p1_hand_001')).toBe(true);
  });

  test('OP-D03 evolves and devolves stack', () => {
    const sessionDoc = createRichSessionDoc();
    const privateStateDoc = createRichPrivateStateDoc();

    executeRichOperation({
      opId: OPERATION_IDS.OP_D03,
      payload: {
        mode: 'evolve',
        targetStackKind: 'active',
        cardId: 'p1_hand_004',
      },
      sessionDoc,
      privateStateDoc,
    });
    expect(sessionDoc.publicState.players.player1.board.active.cardIds).toContain('p1_hand_004');
    expect(privateStateDoc.zones.hand.some((ref) => ref.cardId === 'p1_hand_004')).toBe(false);

    executeRichOperation({
      opId: OPERATION_IDS.OP_D03,
      payload: {
        mode: 'devolve',
        targetStackKind: 'active',
        targetZone: 'hand',
      },
      sessionDoc,
      privateStateDoc,
    });
    expect(privateStateDoc.zones.hand.some((ref) => ref.cardId === 'p1_hand_004')).toBe(true);
  });

  test.each([
    [OPERATION_IDS.OP_D04, 'discard', 'hand'],
    [OPERATION_IDS.OP_D07, 'discard', 'hand'],
  ])('%s returns discard card to hand', (opId) => {
    const { sessionDoc, privateStateDoc } = executeRichOperation({
      opId,
      payload: {
        sourceZone: 'discard',
        cardIds: ['p1_discard_002'],
      },
    });
    expect(sessionDoc.publicState.players.player1.board.discard.some((ref) => ref.cardId === 'p1_discard_002')).toBe(false);
    expect(privateStateDoc.zones.hand.some((ref) => ref.cardId === 'p1_discard_002')).toBe(true);
  });

  test('OP-D08 removes active stack and moves cards to hand', () => {
    const { sessionDoc, privateStateDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_D08,
      payload: {
        targetZone: 'hand',
      },
    });
    expect(sessionDoc.publicState.players.player1.board.active).toBeNull();
    expect(privateStateDoc.zones.hand.some((ref) => ref.cardId === 'p1_active_base')).toBe(true);
    expect(privateStateDoc.zones.hand.some((ref) => ref.cardId === 'p1_active_energy')).toBe(true);
  });

  test('OP-E01 discards attached card from target stack', () => {
    const { sessionDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_E01,
      payload: {
        targetStackKind: 'active',
        count: 1,
      },
    });
    expect(sessionDoc.publicState.players.player1.board.active.cardIds).toEqual(['p1_active_base']);
    expect(sessionDoc.publicState.players.player1.board.discard.some((ref) => ref.cardId === 'p1_active_energy')).toBe(true);
  });

  test.each([
    OPERATION_IDS.OP_E02,
    OPERATION_IDS.OP_E06,
  ])('%s attaches hand card to target stack', (opId) => {
    const { sessionDoc, privateStateDoc } = executeRichOperation({
      opId,
      payload: {
        sourceZone: 'hand',
        cardIds: ['p1_hand_001'],
        targetStackKind: 'bench',
        targetBenchIndex: 1,
      },
    });
    expect(privateStateDoc.zones.hand.some((ref) => ref.cardId === 'p1_hand_001')).toBe(false);
    expect(sessionDoc.publicState.players.player1.board.bench[1].cardIds).toContain('p1_hand_001');
  });

  test('OP-E04 clears stadium and can discard stack cards', () => {
    const sessionDoc = createRichSessionDoc();
    sessionDoc.publicState.stadium = {
      cardId: 'stadium_old',
      ownerPlayerId: 'player2',
      placedAt: '2026-02-18T00:00:00.000Z',
    };
    const privateStateDoc = createRichPrivateStateDoc();

    executeRichOperation({
      opId: OPERATION_IDS.OP_E04,
      payload: {
        mode: 'stadium',
      },
      sessionDoc,
      privateStateDoc,
    });
    expect(sessionDoc.publicState.stadium).toBeNull();

    executeRichOperation({
      opId: OPERATION_IDS.OP_E04,
      payload: {
        targetStackKind: 'bench',
        targetBenchIndex: 0,
        count: 1,
      },
      sessionDoc,
      privateStateDoc,
    });
    expect(sessionDoc.publicState.players.player1.board.discard.some((ref) => ref.cardId === 'p1_bench0_energy')).toBe(true);
  });

  test('OP-E05 moves attached card between stacks', () => {
    const { sessionDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_E05,
      payload: {
        sourceStackKind: 'active',
        targetStackKind: 'bench',
        targetBenchIndex: 1,
        count: 1,
      },
    });
    expect(sessionDoc.publicState.players.player1.board.active.cardIds).toEqual(['p1_active_base']);
    expect(sessionDoc.publicState.players.player1.board.bench[1].cardIds).toContain('p1_active_energy');
  });

  test('OP-E07 sets and clears stadium', () => {
    const sessionDoc = createRichSessionDoc();
    const privateStateDoc = createRichPrivateStateDoc();

    executeRichOperation({
      opId: OPERATION_IDS.OP_E07,
      payload: {
        sourceZone: 'hand',
        cardIds: ['p1_hand_002'],
        mode: 'set',
      },
      sessionDoc,
      privateStateDoc,
    });
    expect(sessionDoc.publicState.stadium?.cardId).toBe('p1_hand_002');

    executeRichOperation({
      opId: OPERATION_IDS.OP_E07,
      payload: {
        mode: 'clear',
      },
      sessionDoc,
      privateStateDoc,
    });
    expect(sessionDoc.publicState.stadium).toBeNull();
  });

  test.each([
    OPERATION_IDS.OP_F01,
    OPERATION_IDS.OP_F04,
  ])('%s adds damage to target stack', (opId) => {
    const { sessionDoc } = executeRichOperation({
      opId,
      payload: {
        targetStackKind: 'active',
        value: 20,
      },
    });
    expect(sessionDoc.publicState.players.player1.board.active.damage).toBe(50);
  });

  test('OP-F02 applies status condition', () => {
    const { sessionDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_F02,
      payload: {
        targetStackKind: 'active',
        condition: 'poison',
      },
    });
    expect(sessionDoc.publicState.players.player1.board.active.specialConditions.poisoned).toBe(true);
  });

  test('OP-F03 knocks out target bench stack to discard', () => {
    const { sessionDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_F03,
      payload: {
        targetStackKind: 'bench',
        targetBenchIndex: 1,
      },
    });
    expect(sessionDoc.publicState.players.player1.board.bench[1]).toBeNull();
    expect(sessionDoc.publicState.players.player1.board.discard.some((ref) => ref.cardId === 'p1_bench1_base')).toBe(true);
  });

  test('OP-F05 heals damage', () => {
    const { sessionDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_F05,
      payload: {
        targetStackKind: 'active',
        value: 20,
      },
    });
    expect(sessionDoc.publicState.players.player1.board.active.damage).toBe(10);
  });

  test('OP-F06 applies recoil to own active', () => {
    const { sessionDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_F06,
      payload: {
        value: 20,
      },
    });
    expect(sessionDoc.publicState.players.player1.board.active.damage).toBe(50);
  });

  test('OP-F07 clears status or records marker', () => {
    const sessionDoc = createRichSessionDoc();
    sessionDoc.publicState.players.player1.board.active.specialConditions = createConditions({
      poisoned: true,
      burned: true,
    });
    const privateStateDoc = createRichPrivateStateDoc();

    executeRichOperation({
      opId: OPERATION_IDS.OP_F07,
      payload: {
        mode: 'clear-status',
        targetStackKind: 'active',
      },
      sessionDoc,
      privateStateDoc,
    });
    expect(sessionDoc.publicState.players.player1.board.active.specialConditions).toEqual(createConditions());

    executeRichOperation({
      opId: OPERATION_IDS.OP_F07,
      payload: {
        mode: 'resistance-lock',
        targetStackKind: 'active',
        note: 'resistance',
      },
      sessionDoc,
      privateStateDoc,
    });
    expect(sessionDoc.publicState.players.player1.board.markers.length).toBeGreaterThan(0);
  });

  test('OP-F08 moves damage between stacks', () => {
    const { sessionDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_F08,
      payload: {
        sourceStackKind: 'active',
        targetStackKind: 'bench',
        targetBenchIndex: 0,
        value: 20,
      },
    });
    expect(sessionDoc.publicState.players.player1.board.active.damage).toBe(10);
    expect(sessionDoc.publicState.players.player1.board.bench[0].damage).toBe(30);
  });

  test('OP-G02 records turn usage counters and marker', () => {
    const { sessionDoc } = executeRichOperation({
      opId: OPERATION_IDS.OP_G02,
      payload: {
        supportUsed: true,
        count: 2,
        note: 'turn-constraint',
      },
    });
    expect(sessionDoc.publicState.turnContext.supportUsed).toBe(true);
    expect(sessionDoc.publicState.turnContext.goodsUsedCount).toBe(2);
    expect(sessionDoc.publicState.players.player1.board.markers).toHaveLength(1);
  });

  test('OP-I03 updates turn context (end turn / extra turn)', () => {
    const sessionDoc = createRichSessionDoc();
    const privateStateDoc = createRichPrivateStateDoc();

    executeRichOperation({
      opId: OPERATION_IDS.OP_I03,
      payload: {
        mode: 'end-turn',
      },
      sessionDoc,
      privateStateDoc,
    });
    expect(sessionDoc.publicState.turnContext.currentPlayer).toBe('player2');
    expect(sessionDoc.publicState.turnContext.turnNumber).toBe(2);

    executeRichOperation({
      opId: OPERATION_IDS.OP_I03,
      payload: {
        mode: 'extra-turn',
      },
      sessionDoc,
      privateStateDoc,
    });
    expect(sessionDoc.publicState.turnContext.currentPlayer).toBe('player2');
    expect(sessionDoc.publicState.turnContext.turnNumber).toBe(3);
  });
});
