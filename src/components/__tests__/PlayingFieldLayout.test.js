import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PlayingField from '../PlayingField';

function createSessionDoc(overrides = {}) {
  const base = {
    version: 2,
    status: 'ready',
    revision: 3,
    publicState: {
      stadium: null,
      operationRequests: [],
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

  const overridePublicState = overrides.publicState || {};
  const overridePlayers = overridePublicState.players || {};
  const mergedPlayers = {
    ...base.publicState.players,
  };

  Object.entries(overridePlayers).forEach(([playerKey, playerValue]) => {
    const basePlayer = base.publicState.players[playerKey] || {};
    mergedPlayers[playerKey] = {
      ...basePlayer,
      ...playerValue,
      counters: {
        ...basePlayer.counters,
        ...(playerValue?.counters || {}),
      },
      board: {
        ...basePlayer.board,
        ...(playerValue?.board || {}),
      },
    };
  });

  return {
    ...base,
    ...overrides,
    publicState: {
      ...base.publicState,
      ...overridePublicState,
      players: mergedPlayers,
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
      sessionDoc={createSessionDoc(options.sessionOverrides)}
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

test('hand tray caps columns at 10 and uses wrapped layout metadata', async () => {
  const hand = Array.from({ length: 12 }, (_, index) => ({
    cardId: `c_player1_${String(index + 1).padStart(3, '0')}`,
    orientation: 'vertical',
    isFaceDown: false,
    visibility: 'ownerOnly',
  }));

  const cardCatalog = hand.reduce((accumulator, cardRef, index) => {
    accumulator[cardRef.cardId] = {
      cardId: cardRef.cardId,
      imageUrl:
        index % 2 === 0
          ? 'https://www.pokemon-card.com/assets/images/card_images/large/SV1a/043816_P_FUDEDEXYU.jpg'
          : 'https://www.pokemon-card.com/assets/images/card_images/large/SV2a/043988_P_KIYUAWA.jpg',
      ownerPlayerId: 'player1',
    };
    return accumulator;
  }, {});

  const { container } = renderPlayingField({
    privateStateOverrides: {
      zones: {
        hand,
      },
      cardCatalog,
      uiPrefs: {
        handTrayOpen: true,
      },
    },
  });

  await waitFor(() => {
    expect(screen.getAllByRole('img', { name: /Hand Card/i })).toHaveLength(12);
  });

  const handGrid = container.querySelector('[data-zone="player-hand-cards-grid"]');
  expect(handGrid).toBeInTheDocument();
  expect(handGrid.style.getPropertyValue('--hand-columns')).toBe('10');
});

test('deck back image uses card-back.jpg', () => {
  renderPlayingField();

  const playerDeckImage = screen.getByRole('img', { name: /Player Deck/i });
  expect(playerDeckImage.getAttribute('src')).toContain('card-back.jpg');
});

test('deck zones show count text even when deck has cards', () => {
  renderPlayingField();

  expect(screen.getByText('53 枚')).toBeInTheDocument();
  expect(screen.getByText('54 枚')).toBeInTheDocument();
});

test('shows quick action buttons for deck draw, shuffle, and prize take', () => {
  renderPlayingField();

  expect(screen.getByRole('button', { name: /山札から1枚引く/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /山札をシャッフルする/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /サイドから1枚取る/i })).toBeInTheDocument();
});

test('shows opponent hand count pill and removes dedicated player hand count zone', () => {
  renderPlayingField();

  expect(screen.getByLabelText('相手手札（6枚）')).toBeInTheDocument();
  expect(screen.queryByText('手札枚数')).not.toBeInTheDocument();
});

test('opponent side column is ordered lost -> discard -> deck for point symmetry', () => {
  const { container } = renderPlayingField();
  const opponentArea = container.querySelector('[data-zone="opponent-area"]');
  expect(opponentArea).toBeInTheDocument();

  const firstSideColumn = opponentArea.querySelector('[class*="sideColumn"]');
  expect(firstSideColumn).toBeInTheDocument();

  const zoneOrder = Array.from(firstSideColumn.querySelectorAll('[data-zone]')).map((node) =>
    node.getAttribute('data-zone')
  );

  expect(zoneOrder.slice(0, 3)).toEqual(['opponent-lost', 'opponent-discard', 'opponent-deck']);
});

test('shows blocking request modal when pending approval exists for current player', () => {
  renderPlayingField({
    sessionOverrides: {
      publicState: {
        operationRequests: [
          {
            requestId: 'req_101',
            opId: 'OP-B12',
            requestType: 'opponent-reveal-hand',
            status: 'pending',
            actorPlayerId: 'player2',
            targetPlayerId: 'player1',
            payload: {
              count: 1,
            },
          },
        ],
      },
    },
  });

  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('相手から確認依頼があります')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /承認して実行/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^拒否$/i })).toBeInTheDocument();
});

test('shows turn info and marker notes from turnContext and player markers', () => {
  renderPlayingField({
    sessionOverrides: {
      publicState: {
        turnContext: {
          turnNumber: 5,
          currentPlayer: 'player2',
          supportUsed: true,
          goodsUsedCount: 2,
          lastRandomSelection: {
            zone: 'hand',
            cardIds: ['c_player1_001', 'c_player1_002'],
          },
        },
        players: {
          player1: {
            board: {
              markers: [
                {
                  markerId: 'm_001',
                  label: 'OP-G03: ワザロック',
                },
              ],
            },
          },
        },
      },
    },
  });

  expect(screen.getByText('ターン情報')).toBeInTheDocument();
  expect(screen.getByText('ターン: 5')).toBeInTheDocument();
  expect(screen.getByText('現在手番: 相手')).toBeInTheDocument();
  expect(screen.getByText('サポート使用: 済み')).toBeInTheDocument();
  expect(screen.getByText('グッズ使用回数: 2')).toBeInTheDocument();
  expect(screen.getByText('直近ランダム選択: 手札 から 2 枚')).toBeInTheDocument();
  expect(screen.getByText('OP-G03: ワザロック')).toBeInTheDocument();
});

test('renders active/bench/discard/lost as face-up on both sides when card images are resolvable', () => {
  const { container } = renderPlayingField({
    sessionOverrides: {
      publicState: {
        publicCardCatalog: {
          c_player2_active_001: 'https://example.com/p2_active_001.jpg',
          c_player2_bench_001: 'https://example.com/p2_bench_001.jpg',
          c_player2_discard_001: 'https://example.com/p2_discard_001.jpg',
          c_player2_lost_001: 'https://example.com/p2_lost_001.jpg',
        },
        players: {
          player1: {
            board: {
              active: {
                stackId: 's_player1_active',
                cardIds: ['c_player1_001'],
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
                  cardIds: ['c_player1_002'],
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
              discard: [{ cardId: 'c_player1_001' }],
              lostZone: [{ cardId: 'c_player1_002' }],
            },
          },
          player2: {
            board: {
              active: {
                stackId: 's_player2_active',
                cardIds: ['c_player2_active_001'],
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
                  stackId: 's_player2_bench_1',
                  cardIds: ['c_player2_bench_001'],
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
              discard: [{ cardId: 'c_player2_discard_001' }],
              lostZone: [{ cardId: 'c_player2_lost_001' }],
            },
          },
        },
      },
    },
  });

  const opponentActiveImage = container.querySelector('[data-zone="opponent-active-stack"] img');
  const opponentBenchImage = container.querySelector('[data-zone="opponent-bench-1-stack"] img');
  expect(opponentActiveImage).toBeInTheDocument();
  expect(opponentActiveImage.getAttribute('src')).toContain('p2_active_001.jpg');
  expect(opponentBenchImage).toBeInTheDocument();
  expect(opponentBenchImage.getAttribute('src')).toContain('p2_bench_001.jpg');

  expect(screen.getByRole('img', { name: 'トラッシュ（相手）上のカード' }).getAttribute('src')).toContain(
    'p2_discard_001.jpg'
  );
  expect(screen.getByRole('img', { name: 'ロスト（相手）上のカード' }).getAttribute('src')).toContain(
    'p2_lost_001.jpg'
  );
  expect(screen.getByRole('img', { name: 'トラッシュ（自分）上のカード' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'ロスト（自分）上のカード' })).toBeInTheDocument();
});
