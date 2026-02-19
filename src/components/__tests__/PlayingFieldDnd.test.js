import React from 'react';
import { render } from '@testing-library/react';
import PlayingField from '../PlayingField';
import { useBoardDnd } from '../../interaction/dnd/useBoardDnd';

jest.mock('../../interaction/dnd/useBoardDnd', () => ({
  useBoardDnd: jest.fn(),
}));

function createSessionDoc() {
  return {
    version: 2,
    status: 'playing',
    revision: 5,
    publicState: {
      stadium: null,
      players: {
        player1: {
          counters: { deckCount: 53, handCount: 7 },
          board: {
            active: {
              stackId: 's_player1_active',
              cardIds: ['c_player1_001'],
              damage: 10,
              specialConditions: { poisoned: false, burned: false, asleep: false, paralyzed: false, confused: false },
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
        player2: {
          counters: { deckCount: 54, handCount: 6 },
          board: {
            active: {
              stackId: 's_player2_active',
              cardIds: ['c_player2_001'],
              damage: 0,
              specialConditions: { poisoned: false, burned: false, asleep: false, paralyzed: false, confused: false },
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
  };
}

function createPrivateStateDoc() {
  return {
    ownerPlayerId: 'player1',
    zones: {
      deck: [],
      hand: [
        { cardId: 'c_player1_002', orientation: 'vertical', isFaceDown: false, visibility: 'ownerOnly' },
      ],
    },
    cardCatalog: {
      c_player1_001: {
        cardId: 'c_player1_001',
        imageUrl: 'https://www.pokemon-card.com/assets/images/card_images/large/SV1a/043816_P_FUDEDEXYU.jpg',
        ownerPlayerId: 'player1',
      },
      c_player1_002: {
        cardId: 'c_player1_002',
        imageUrl: 'https://www.pokemon-card.com/assets/images/card_images/large/SV2a/043988_P_KIYUAWA.jpg',
        ownerPlayerId: 'player1',
      },
    },
  };
}

function renderPlayingField() {
  return render(
    <PlayingField
      sessionId="session-dnd-test"
      playerId="player1"
      sessionDoc={createSessionDoc()}
      privateStateDoc={createPrivateStateDoc()}
    />
  );
}

beforeEach(() => {
  useBoardDnd.mockReturnValue({
    sensors: [],
    activeDragPayload: null,
    isMutating: false,
    isZoneHighlighted: () => false,
    isStackHighlighted: () => false,
    handleDragStart: jest.fn(),
    handleDragMove: jest.fn(),
    handleDragOver: jest.fn(),
    handleDragEnd: jest.fn(),
    handleDragCancel: jest.fn(),
  });
});

test('applies zone highlight class when hook marks a zone as highlighted', () => {
  useBoardDnd.mockReturnValue({
    sensors: [],
    activeDragPayload: null,
    isMutating: false,
    isZoneHighlighted: (zoneId) => zoneId === 'player-discard',
    isStackHighlighted: () => false,
    handleDragStart: jest.fn(),
    handleDragMove: jest.fn(),
    handleDragOver: jest.fn(),
    handleDragEnd: jest.fn(),
    handleDragCancel: jest.fn(),
  });

  const { container } = renderPlayingField();
  const discardZone = container.querySelector('[data-zone=\"player-discard\"]');
  expect(discardZone).toBeInTheDocument();
  expect(discardZone.className).toContain('dropZoneActive');
});

test('applies stack highlight class when hook marks a stack as highlighted', () => {
  useBoardDnd.mockReturnValue({
    sensors: [],
    activeDragPayload: null,
    isMutating: false,
    isZoneHighlighted: () => false,
    isStackHighlighted: (zoneId) => zoneId === 'player-active',
    handleDragStart: jest.fn(),
    handleDragMove: jest.fn(),
    handleDragOver: jest.fn(),
    handleDragEnd: jest.fn(),
    handleDragCancel: jest.fn(),
  });

  const { container } = renderPlayingField();
  const activeStack = container.querySelector('[data-zone=\"player-active-stack\"]');
  expect(activeStack).toBeInTheDocument();
  expect(activeStack.className).toContain('dropStackActive');
});
