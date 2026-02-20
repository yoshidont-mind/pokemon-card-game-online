import { resolveOperationIntent } from '../resolveOperationIntent';
import { buildOperationIntent } from '../buildOperationIntent';
import { INTERNAL_OPERATION_IDS, OPERATION_IDS } from '../operationIds';

function createSessionDoc({
  operationRequests = [],
} = {}) {
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
          counters: { deckCount: 53, handCount: 7 },
          board: {
            active: null,
            bench: [],
            discard: [],
            lostZone: [],
            prize: [],
            markers: [],
          },
        },
        player2: {
          counters: { deckCount: 53, handCount: 7 },
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
      operationRequests,
    },
  };
}

function createPrivateStateDoc() {
  return {
    ownerPlayerId: 'player1',
    revision: 0,
    zones: {
      deck: [],
      hand: [{ cardId: 'c_player1_001' }],
    },
    cardCatalog: {
      c_player1_001: {
        cardId: 'c_player1_001',
        imageUrl: 'https://example.com/1.jpg',
        ownerPlayerId: 'player1',
      },
    },
  };
}

describe('resolveOperationIntent', () => {
  test('accepts valid draw operation intent', () => {
    const intent = buildOperationIntent({
      opId: OPERATION_IDS.OP_B03,
      actorPlayerId: 'player1',
      payload: { count: 2 },
    });

    const result = resolveOperationIntent({
      intent,
      sessionDoc: createSessionDoc(),
      privateStateDoc: createPrivateStateDoc(),
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.opId).toBe(OPERATION_IDS.OP_B03);
    expect(result.action.payload.count).toBe(2);
  });

  test('rejects draw operation when count is invalid', () => {
    const intent = buildOperationIntent({
      opId: OPERATION_IDS.OP_B03,
      actorPlayerId: 'player1',
      payload: { count: 0 },
    });

    const result = resolveOperationIntent({
      intent,
      sessionDoc: createSessionDoc(),
      privateStateDoc: createPrivateStateDoc(),
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(false);
    expect(result.message).toMatch(/count/i);
  });

  test('rejects opponent request operation when target is actor', () => {
    const intent = buildOperationIntent({
      opId: OPERATION_IDS.OP_B11,
      actorPlayerId: 'player1',
      payload: {
        targetPlayerId: 'player1',
      },
    });

    const result = resolveOperationIntent({
      intent,
      sessionDoc: createSessionDoc(),
      privateStateDoc: createPrivateStateDoc(),
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(false);
    expect(result.message).toMatch(/opponent/i);
  });

  test('accepts OP-B12 selected discard request when target and cardId are valid', () => {
    const intent = buildOperationIntent({
      opId: OPERATION_IDS.OP_B12,
      actorPlayerId: 'player1',
      payload: {
        targetPlayerId: 'player2',
        cardId: 'c_player2_hand_001',
      },
    });

    const result = resolveOperationIntent({
      intent,
      sessionDoc: createSessionDoc(),
      privateStateDoc: createPrivateStateDoc(),
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.mode).toBe('request');
    expect(result.action.payload.targetPlayerId).toBe('player2');
    expect(result.action.payload.cardId).toBe('c_player2_hand_001');
  });

  test('accepts OP-B12 selected discard request when cardIds are provided', () => {
    const intent = buildOperationIntent({
      opId: OPERATION_IDS.OP_B12,
      actorPlayerId: 'player1',
      payload: {
        targetPlayerId: 'player2',
        cardIds: ['c_player2_hand_001', 'c_player2_hand_002'],
      },
    });

    const result = resolveOperationIntent({
      intent,
      sessionDoc: createSessionDoc(),
      privateStateDoc: createPrivateStateDoc(),
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.payload.cardIds).toEqual([
      'c_player2_hand_001',
      'c_player2_hand_002',
    ]);
    expect(result.action.payload.cardId).toBe('c_player2_hand_001');
  });

  test('rejects OP-B12 request when cardId is missing', () => {
    const intent = buildOperationIntent({
      opId: OPERATION_IDS.OP_B12,
      actorPlayerId: 'player1',
      payload: {
        targetPlayerId: 'player2',
      },
    });

    const result = resolveOperationIntent({
      intent,
      sessionDoc: createSessionDoc(),
      privateStateDoc: createPrivateStateDoc(),
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(false);
    expect(result.message).toMatch(/cardId/i);
  });

  test('accepts OP-A03 reveal request when target is opponent', () => {
    const intent = buildOperationIntent({
      opId: OPERATION_IDS.OP_A03,
      actorPlayerId: 'player1',
      payload: {
        targetPlayerId: 'player2',
      },
    });

    const result = resolveOperationIntent({
      intent,
      sessionDoc: createSessionDoc(),
      privateStateDoc: createPrivateStateDoc(),
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.mode).toBe('request');
    expect(result.action.payload.targetPlayerId).toBe('player2');
  });

  test('accepts request resolution intent with requestId and action', () => {
    const intent = buildOperationIntent({
      opId: INTERNAL_OPERATION_IDS.REQUEST_APPROVE,
      actorPlayerId: 'player1',
      payload: {
        requestId: 'req_001',
        action: 'approve',
      },
    });

    const result = resolveOperationIntent({
      intent,
      sessionDoc: createSessionDoc({
        operationRequests: [
          {
            requestId: 'req_001',
            status: 'pending',
            actorPlayerId: 'player2',
            targetPlayerId: 'player1',
          },
        ],
      }),
      privateStateDoc: createPrivateStateDoc(),
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(true);
    expect(result.action.opId).toBe(INTERNAL_OPERATION_IDS.REQUEST_APPROVE);
  });

  test('rejects request resolution intent without requestId', () => {
    const intent = buildOperationIntent({
      opId: INTERNAL_OPERATION_IDS.REQUEST_APPROVE,
      actorPlayerId: 'player1',
      payload: {
        action: 'approve',
      },
    });

    const result = resolveOperationIntent({
      intent,
      sessionDoc: createSessionDoc(),
      privateStateDoc: createPrivateStateDoc(),
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(false);
    expect(result.message).toMatch(/requestId/i);
  });

  test('rejects request resolution when request is not found', () => {
    const intent = buildOperationIntent({
      opId: INTERNAL_OPERATION_IDS.REQUEST_APPROVE,
      actorPlayerId: 'player1',
      payload: {
        requestId: 'req_missing',
        action: 'approve',
      },
    });

    const result = resolveOperationIntent({
      intent,
      sessionDoc: createSessionDoc(),
      privateStateDoc: createPrivateStateDoc(),
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });

  test('rejects request resolution when actor is not target player', () => {
    const intent = buildOperationIntent({
      opId: INTERNAL_OPERATION_IDS.REQUEST_APPROVE,
      actorPlayerId: 'player1',
      payload: {
        requestId: 'req_002',
        action: 'approve',
      },
    });

    const result = resolveOperationIntent({
      intent,
      sessionDoc: createSessionDoc({
        operationRequests: [
          {
            requestId: 'req_002',
            status: 'pending',
            actorPlayerId: 'player1',
            targetPlayerId: 'player2',
          },
        ],
      }),
      privateStateDoc: createPrivateStateDoc(),
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(false);
    expect(result.message).toMatch(/Only target player/i);
  });

  test('rejects request resolution when request status is not pending', () => {
    const intent = buildOperationIntent({
      opId: INTERNAL_OPERATION_IDS.REQUEST_APPROVE,
      actorPlayerId: 'player1',
      payload: {
        requestId: 'req_003',
        action: 'approve',
      },
    });

    const result = resolveOperationIntent({
      intent,
      sessionDoc: createSessionDoc({
        operationRequests: [
          {
            requestId: 'req_003',
            status: 'completed',
            actorPlayerId: 'player2',
            targetPlayerId: 'player1',
          },
        ],
      }),
      privateStateDoc: createPrivateStateDoc(),
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(false);
    expect(result.message).toMatch(/already resolved/i);
  });

  test('rejects approve operation with mismatched action', () => {
    const intent = buildOperationIntent({
      opId: INTERNAL_OPERATION_IDS.REQUEST_APPROVE,
      actorPlayerId: 'player1',
      payload: {
        requestId: 'req_004',
        action: 'reject',
      },
    });

    const result = resolveOperationIntent({
      intent,
      sessionDoc: createSessionDoc({
        operationRequests: [
          {
            requestId: 'req_004',
            status: 'pending',
            actorPlayerId: 'player2',
            targetPlayerId: 'player1',
          },
        ],
      }),
      privateStateDoc: createPrivateStateDoc(),
      actorPlayerId: 'player1',
    });

    expect(result.accepted).toBe(false);
    expect(result.message).toMatch(/action=approve/i);
  });
});
