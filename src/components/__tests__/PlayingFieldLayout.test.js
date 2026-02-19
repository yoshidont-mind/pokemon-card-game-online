import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PlayingField from '../PlayingField';

function createSessionDoc() {
  return {
    version: 2,
    status: 'ready',
    revision: 3,
    publicState: {
      stadium: null,
      players: {
        player1: {
          counters: { deckCount: 53, handCount: 7 },
          board: {
            active: null,
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
}

function createPrivateStateDoc(overrides = {}) {
  const base = {
    ownerPlayerId: 'player1',
    zones: {
      deck: [],
      hand: [
        { cardId: 'c_player1_001', orientation: 'vertical', isFaceDown: false, visibility: 'ownerOnly' },
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
    uiPrefs: {
      handTrayOpen: false,
      toolboxOpen: false,
    },
  };

  return {
    ...base,
    ...overrides,
    zones: {
      ...base.zones,
      ...(overrides.zones || {}),
    },
    cardCatalog: {
      ...base.cardCatalog,
      ...(overrides.cardCatalog || {}),
    },
    uiPrefs: {
      ...base.uiPrefs,
      ...(overrides.uiPrefs || {}),
    },
  };
}

function renderPlayingField(options = {}) {
  return render(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc()}
      privateStateDoc={createPrivateStateDoc(options.privateStateOverrides)}
    />
  );
}

test('hand tray toggle updates aria-expanded and panel visibility', async () => {
  renderPlayingField();

  const handToggleButton = screen.getByRole('button', { name: /手札を開く/i });
  expect(handToggleButton).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('手札はありません')).not.toBeInTheDocument();

  fireEvent.click(handToggleButton);

  await waitFor(() => {
    const openedButton = screen.getByRole('button', { name: /手札を閉じる/i });
    expect(openedButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('img', { name: /Hand Card 1/i })).toBeInTheDocument();
  });
});

test('hand card click toggles pinned state without separate preview pane', async () => {
  renderPlayingField();

  fireEvent.click(screen.getByRole('button', { name: /手札を開く/i }));

  await waitFor(() => {
    expect(screen.getByRole('img', { name: /Hand Card 1/i })).toBeInTheDocument();
  });
  expect(screen.queryByText(/拡大表示されます/)).not.toBeInTheDocument();

  const firstHandCardButton = screen.getByRole('button', { name: /手札 1 を拡大表示/i });
  fireEvent.click(firstHandCardButton);
  expect(firstHandCardButton).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(firstHandCardButton);
  expect(firstHandCardButton).toHaveAttribute('aria-pressed', 'false');
});

test('toolbox toggle updates aria-expanded and renders tool items', async () => {
  renderPlayingField();

  const toolboxToggleButton = screen.getByRole('button', { name: /小道具を開く/i });
  expect(toolboxToggleButton).toHaveAttribute('aria-expanded', 'false');

  fireEvent.click(toolboxToggleButton);

  await waitFor(() => {
    const openedButton = screen.getByRole('button', { name: /小道具を閉じる/i });
    expect(openedButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^ダメカン 10$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^ダメカン 50$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^ダメカン 100$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ダメカン 20$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^状態異常 どく$/i })).toBeInTheDocument();
  });
});

test('panel open states are restored from private uiPrefs', async () => {
  renderPlayingField({
    privateStateOverrides: {
      uiPrefs: {
        handTrayOpen: true,
        toolboxOpen: true,
      },
    },
  });

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /手札を閉じる/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /小道具を閉じる/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^ダメカン 10$/i })).toBeInTheDocument();
  });
});

test('deck back image uses card-back.jpg', () => {
  renderPlayingField();

  const playerDeckImage = screen.getByRole('img', { name: /Player Deck/i });
  expect(playerDeckImage.getAttribute('src')).toContain('card-back.jpg');
});
