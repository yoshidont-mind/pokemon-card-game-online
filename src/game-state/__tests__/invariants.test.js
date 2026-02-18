import {
  createCardEntity,
  createCardRef,
  createEmptyPrivateStateV2,
  createEmptySessionV2,
  createStackRef,
} from '../builders';
import {
  assertActiveShape,
  assertOrientation,
  assertUniqueCardOwnership,
  validateSessionInvariants,
} from '../invariants';

function createValidFixture() {
  const now = '2026-02-18T00:00:00.000Z';
  const session = createEmptySessionV2({ createdBy: 'test', now });

  const privatePlayer1 = createEmptyPrivateStateV2({
    ownerPlayerId: 'player1',
    updatedBy: 'player1',
    now,
  });
  const privatePlayer2 = createEmptyPrivateStateV2({
    ownerPlayerId: 'player2',
    updatedBy: 'player2',
    now,
  });

  const p1ActiveCardId = 'c_player1_001';
  const p1DeckCardId = 'c_player1_002';
  privatePlayer1.cardCatalog[p1ActiveCardId] = createCardEntity({
    cardId: p1ActiveCardId,
    imageUrl:
      'https://www.pokemon-card.com/assets/images/card_images/large/SVI/045466_P_RAPURASU.jpg',
    ownerPlayerId: 'player1',
    createdAt: now,
  });
  privatePlayer1.cardCatalog[p1DeckCardId] = createCardEntity({
    cardId: p1DeckCardId,
    imageUrl:
      'https://www.pokemon-card.com/assets/images/card_images/large/SVI/045467_P_MARIRU.jpg',
    ownerPlayerId: 'player1',
    createdAt: now,
  });

  session.publicState.players.player1.board.active = createStackRef({
    stackId: 's_player1_active',
    cardIds: [p1ActiveCardId],
    orientation: 'vertical',
  });
  privatePlayer1.zones.deck = [
    createCardRef({
      cardId: p1DeckCardId,
      orientation: 'vertical',
      isFaceDown: true,
      visibility: 'ownerOnly',
    }),
  ];

  return {
    session,
    privateStatesByPlayer: {
      player1: privatePlayer1,
      player2: privatePlayer2,
    },
  };
}

describe('game-state invariants', () => {
  test('valid fixture passes all invariants', () => {
    const { session, privateStatesByPlayer } = createValidFixture();
    expect(() => validateSessionInvariants(session, privateStatesByPlayer)).not.toThrow();
  });

  test('detects invalid active type', () => {
    const { session } = createValidFixture();
    session.publicState.players.player1.board.active = [];
    expect(() => assertActiveShape(session)).toThrow(/must not be an array/);
  });

  test('detects invalid orientation', () => {
    const { session, privateStatesByPlayer } = createValidFixture();
    session.publicState.players.player1.board.active.orientation = 'diagonal';
    expect(() => assertOrientation(session, privateStatesByPlayer)).toThrow(/invalid orientation/i);
  });

  test('detects duplicated card ownership across zones', () => {
    const { session, privateStatesByPlayer } = createValidFixture();
    privateStatesByPlayer.player1.zones.hand = [
      createCardRef({
        cardId: 'c_player1_002',
        orientation: 'vertical',
        isFaceDown: false,
        visibility: 'ownerOnly',
      }),
    ];
    expect(() => assertUniqueCardOwnership(session, privateStatesByPlayer)).toThrow(
      /multiple zones/
    );
  });
});
