import legacySample from '../../../public/sample_gamedata.json';
import { migrateSessionV1ToV2 } from '../migrateV1ToV2';
import { validateSessionInvariants } from '../invariants';

describe('migrateSessionV1ToV2', () => {
  test('migrates legacy sample data to V2 and satisfies invariants', () => {
    const { session, privateStatesByPlayer } = migrateSessionV1ToV2(legacySample, {
      now: '2026-02-18T00:00:00.000Z',
      createdBy: 'test',
      updatedBy: 'test',
    });

    expect(session.version).toBe(2);
    expect(session.publicState.players.player1.board).toHaveProperty('lostZone');
    expect(session.publicState.players.player2.board).toHaveProperty('lostZone');
    expect(Array.isArray(session.publicState.players.player1.board.bench)).toBe(true);
    expect(Array.isArray(privateStatesByPlayer.player1.zones.deck)).toBe(true);
    expect(Array.isArray(privateStatesByPlayer.player1.zones.hand)).toBe(true);
    expect(Object.keys(privateStatesByPlayer.player1.cardCatalog).length).toBeGreaterThan(0);

    expect(() => validateSessionInvariants(session, privateStatesByPlayer)).not.toThrow();
  });

  test('normalizes activeSpot array into active null', () => {
    const legacy = {
      player1: {
        all: [],
        deck: [],
        hand: [],
        bench: [],
        activeSpot: [],
        stadium: '',
        discardPile: [],
        prizeCards: [],
      },
      player2: {
        all: [],
        deck: [],
        hand: [],
        bench: [],
        activeSpot: [],
        stadium: '',
        discardPile: [],
        prizeCards: [],
      },
    };

    const { session } = migrateSessionV1ToV2(legacy, {
      now: '2026-02-18T00:00:00.000Z',
      createdBy: 'test',
      updatedBy: 'test',
    });

    expect(session.publicState.players.player1.board.active).toBeNull();
    expect(session.publicState.players.player2.board.active).toBeNull();
  });
});
