import React from 'react';
import PlayingField from './PlayingField';

const sampleSessionDoc = {
  version: 2,
  status: 'ready',
  revision: 1,
  publicState: {
    stadium: null,
    players: {
      player1: {
        counters: { deckCount: 53, handCount: 7 },
        board: {
          active: {
            stackId: 's_player1_active',
            cardIds: ['c_player1_001'],
            damage: 20,
            specialConditions: { poisoned: false, burned: false, asleep: false, paralyzed: false, confused: false },
            orientation: 'vertical',
            isFaceDown: false,
          },
          bench: [],
          discard: [],
          lostZone: [],
          prize: [{ cardId: null, isFaceDown: true, revealedTo: 'none' }],
          markers: [],
        },
      },
      player2: {
        counters: { deckCount: 54, handCount: 6 },
        board: {
          active: null,
          bench: [],
          discard: [],
          lostZone: [],
          prize: [{ cardId: null, isFaceDown: true, revealedTo: 'none' }],
          markers: [],
        },
      },
    },
  },
};

const samplePrivateState = {
  ownerPlayerId: 'player1',
  zones: {
    deck: [],
    hand: [
      { cardId: 'c_player1_001', orientation: 'vertical', isFaceDown: false, visibility: 'ownerOnly' },
      { cardId: 'c_player1_002', orientation: 'vertical', isFaceDown: false, visibility: 'ownerOnly' },
      { cardId: 'c_player1_003', orientation: 'vertical', isFaceDown: false, visibility: 'ownerOnly' },
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
      imageUrl: 'https://www.pokemon-card.com/assets/images/card_images/large/SV1a/043769_T_HYPABORU.jpg',
      ownerPlayerId: 'player1',
    },
    c_player1_003: {
      cardId: 'c_player1_003',
      imageUrl: 'https://www.pokemon-card.com/assets/images/card_images/large/SV2a/043988_P_KIYUAWA.jpg',
      ownerPlayerId: 'player1',
    },
  },
};

const PlayingFieldTest = () => {
  return (
    <div className="mt-3">
      <PlayingField
        sessionId="playing-field-test"
        playerId="player1"
        sessionDoc={sampleSessionDoc}
        privateStateDoc={samplePrivateState}
      />
    </div>
  );
};

export default PlayingFieldTest;
