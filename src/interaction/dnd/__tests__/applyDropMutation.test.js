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
        deck: [],
        hand: [
          { cardId: 'c_player1_001', orientation: 'vertical', isFaceDown: false, visibility: 'ownerOnly' },
          { cardId: 'c_player1_002', orientation: 'vertical', isFaceDown: false, visibility: 'ownerOnly' },
        ],
      },
      cardCatalog: {
        c_player1_001: { cardId: 'c_player1_001', imageUrl: 'https://example.com/1.jpg', ownerPlayerId: 'player1' },
        c_player1_002: { cardId: 'c_player1_002', imageUrl: 'https://example.com/2.jpg', ownerPlayerId: 'player1' },
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
});
