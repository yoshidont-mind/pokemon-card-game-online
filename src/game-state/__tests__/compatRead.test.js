import { createCardRef, createEmptyPrivateStateV2, createEmptySessionV2 } from '../builders';
import { adaptSessionForClient } from '../compatRead';

describe('compatRead adaptSessionForClient', () => {
  test('keeps deckPeek zone card refs for V2 privateState', () => {
    const now = '2026-02-20T00:00:00.000Z';
    const sessionDoc = createEmptySessionV2({ createdBy: 'test', now });
    const privateStateDoc = createEmptyPrivateStateV2({
      ownerPlayerId: 'player1',
      updatedBy: 'test',
      now,
    });
    privateStateDoc.zones.deckPeek = [
      createCardRef({
        cardId: 'c_player1_001',
        isFaceDown: false,
        visibility: 'ownerOnly',
      }),
    ];

    const adapted = adaptSessionForClient({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
    });

    expect(adapted.privateStateDoc.zones.deckPeek).toHaveLength(1);
    expect(adapted.privateStateDoc.zones.deckPeek[0].cardId).toBe('c_player1_001');
  });

  test('normalizes missing deckPeek zone to empty array', () => {
    const now = '2026-02-20T00:00:00.000Z';
    const sessionDoc = createEmptySessionV2({ createdBy: 'test', now });
    const privateStateDoc = createEmptyPrivateStateV2({
      ownerPlayerId: 'player1',
      updatedBy: 'test',
      now,
    });

    delete privateStateDoc.zones.deckPeek;

    const adapted = adaptSessionForClient({
      sessionDoc,
      privateStateDoc,
      playerId: 'player1',
    });

    expect(Array.isArray(adapted.privateStateDoc.zones.deckPeek)).toBe(true);
    expect(adapted.privateStateDoc.zones.deckPeek).toHaveLength(0);
  });
});
