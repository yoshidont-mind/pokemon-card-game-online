import { createCardRef, createEmptyPrivateStateV2 } from '../builders';
import {
  INITIAL_PRIZE_COUNT_DEFAULT,
  normalizeInitialPrizeCount,
  takeInitialPrizeRefsFromDeck,
} from '../setupUtils';

function createPrivateStateWithDeck(cardIds) {
  const privateState = createEmptyPrivateStateV2({
    ownerPlayerId: 'player1',
    updatedBy: 'test',
    now: '2026-02-19T00:00:00.000Z',
  });
  privateState.zones.deck = cardIds.map((cardId) =>
    createCardRef({
      cardId,
      isFaceDown: true,
      visibility: 'ownerOnly',
    })
  );
  return privateState;
}

describe('setupUtils', () => {
  test('normalizeInitialPrizeCount keeps valid values and falls back for invalid values', () => {
    expect(normalizeInitialPrizeCount(3)).toBe(3);
    expect(normalizeInitialPrizeCount(6)).toBe(6);
    expect(normalizeInitialPrizeCount('5')).toBe(5);
    expect(normalizeInitialPrizeCount(2)).toBe(INITIAL_PRIZE_COUNT_DEFAULT);
    expect(normalizeInitialPrizeCount(7)).toBe(INITIAL_PRIZE_COUNT_DEFAULT);
    expect(normalizeInitialPrizeCount('abc')).toBe(INITIAL_PRIZE_COUNT_DEFAULT);
  });

  test('takeInitialPrizeRefsFromDeck takes configured count from top of deck', () => {
    const privateState = createPrivateStateWithDeck([
      'c_player1_001',
      'c_player1_002',
      'c_player1_003',
      'c_player1_004',
      'c_player1_005',
      'c_player1_006',
      'c_player1_007',
    ]);

    const prizeRefs = takeInitialPrizeRefsFromDeck(privateState, 4);
    expect(prizeRefs.map((ref) => ref.cardId)).toEqual([
      'c_player1_001',
      'c_player1_002',
      'c_player1_003',
      'c_player1_004',
    ]);
    expect(prizeRefs.every((ref) => ref.isFaceDown)).toBe(true);
    expect(prizeRefs.every((ref) => ref.visibility === 'public')).toBe(true);
    expect(privateState.zones.deck.map((ref) => ref.cardId)).toEqual([
      'c_player1_005',
      'c_player1_006',
      'c_player1_007',
    ]);
  });

  test('takeInitialPrizeRefsFromDeck uses available deck length as upper bound', () => {
    const privateState = createPrivateStateWithDeck(['c_player1_001', 'c_player1_002']);
    const prizeRefs = takeInitialPrizeRefsFromDeck(privateState, 6);

    expect(prizeRefs).toHaveLength(2);
    expect(privateState.zones.deck).toHaveLength(0);
  });
});
