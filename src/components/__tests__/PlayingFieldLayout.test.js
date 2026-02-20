import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  expect(screen.getByRole('button', { name: /山札を閲覧する/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /サイドから1枚取る/i })).toBeInTheDocument();
});

test('opens deck peek count config modal from deck quick action', async () => {
  renderPlayingField();

  fireEvent.click(screen.getByRole('button', { name: '山札を閲覧する' }));
  const modal = await screen.findByRole('dialog');
  expect(within(modal).getByText('山札を閲覧')).toBeInTheDocument();
  expect(within(modal).getByText('1 枚')).toBeInTheDocument();

  fireEvent.click(within(modal).getByRole('button', { name: '閲覧枚数を1枚増やす' }));
  await waitFor(() => {
    expect(within(modal).getByText('2 枚')).toBeInTheDocument();
  });

  const selectAllCheckbox = within(modal).getByRole('checkbox', { name: '閲覧枚数を全て選択' });
  fireEvent.click(selectAllCheckbox);
  await waitFor(() => {
    expect(within(modal).getByText('53 枚')).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: '閲覧枚数を1枚減らす' })).toBeDisabled();
    expect(within(modal).getByRole('button', { name: '閲覧枚数を1枚増やす' })).toBeDisabled();
  });

  fireEvent.click(selectAllCheckbox);
  await waitFor(() => {
    expect(within(modal).getByRole('button', { name: '閲覧枚数を1枚減らす' })).not.toBeDisabled();
  });

  fireEvent.click(within(modal).getByRole('button', { name: 'キャンセル' }));
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

test('renders shared notes panel with existing shared notes', () => {
  renderPlayingField({
    sessionOverrides: {
      publicState: {
        sharedNotes: [
          {
            noteId: 'note_001',
            text: '次のターンはコイン判定をメモする',
            createdBy: 'player1',
            createdAt: '2026-02-20T00:00:00.000Z',
            updatedBy: 'player1',
            updatedAt: '2026-02-20T00:00:00.000Z',
          },
        ],
      },
    },
  });

  expect(screen.getByLabelText('共有ノート入力')).toBeInTheDocument();
  expect(screen.getByText('次のターンはコイン判定をメモする')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'ノートを編集' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'ノートを削除' })).toBeInTheDocument();
});

test('shows opponent hand count pill and removes dedicated player hand count zone', () => {
  renderPlayingField();

  expect(screen.getByLabelText('相手手札（6枚）')).toBeInTheDocument();
  expect(screen.queryByText('手札枚数')).not.toBeInTheDocument();
});

test('opens opponent hand action menu from fixed button', async () => {
  renderPlayingField();

  fireEvent.click(screen.getByRole('button', { name: '相手手札（6枚）' }));

  await waitFor(() => {
    expect(screen.getByRole('button', { name: '手札の公開を要求' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '手札のランダム破壊を要求' })).toBeInTheDocument();
  });
});

test('opens random discard request modal and allows count adjustment', async () => {
  renderPlayingField();

  fireEvent.click(screen.getByRole('button', { name: '相手手札（6枚）' }));
  await waitFor(() => {
    expect(screen.getByRole('button', { name: '手札のランダム破壊を要求' })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: '手札のランダム破壊を要求' }));

  const modal = await screen.findByRole('dialog');
  await waitFor(() => {
    expect(within(modal).getByText('手札のランダム破壊を要求')).toBeInTheDocument();
    expect(within(modal).getByText('1 枚')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: '要求枚数を1枚増やす' }));
  await waitFor(() => {
    expect(within(modal).getByText('2 枚')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: '要求枚数を1枚減らす' }));
  await waitFor(() => {
    expect(within(modal).getByText('1 枚')).toBeInTheDocument();
  });
});

test('shows opponent hand reveal modal when a new reveal request is approved', async () => {
  const privateStateDoc = createPrivateStateDoc();
  const { rerender } = render(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc()}
      privateStateDoc={privateStateDoc}
    />
  );

  rerender(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc({
        publicState: {
          publicCardCatalog: {
            c_player2_hand_001: 'https://example.com/p2_hand_001.jpg',
            c_player2_hand_002: 'https://example.com/p2_hand_002.jpg',
          },
          operationRequests: [
            {
              requestId: 'req_reveal_001',
              opId: 'OP-A03',
              requestType: 'opponent-reveal-hand',
              status: 'completed',
              actorPlayerId: 'player1',
              targetPlayerId: 'player2',
              payload: { count: 1 },
              result: {
                revealedCardIds: ['c_player2_hand_001', 'c_player2_hand_002'],
              },
            },
          ],
        },
      })}
      privateStateDoc={privateStateDoc}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('相手の手札（2枚）')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '公開手札 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument();
  });
});

test('opponent hand reveal modal caps columns at 10 and wraps beyond 10 cards', async () => {
  const privateStateDoc = createPrivateStateDoc();
  const revealCardIds = Array.from({ length: 12 }, (_, index) =>
    `c_player2_hand_${String(index + 1).padStart(3, '0')}`
  );
  const publicCardCatalog = revealCardIds.reduce((acc, cardId) => {
    acc[cardId] = `https://example.com/${cardId}.jpg`;
    return acc;
  }, {});

  const { rerender, container } = render(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc()}
      privateStateDoc={privateStateDoc}
    />
  );

  rerender(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc({
        publicState: {
          publicCardCatalog,
          operationRequests: [
            {
              requestId: 'req_reveal_010',
              opId: 'OP-A03',
              requestType: 'opponent-reveal-hand',
              status: 'completed',
              actorPlayerId: 'player1',
              targetPlayerId: 'player2',
              payload: { count: 1 },
              result: {
                revealedCardIds: revealCardIds,
              },
            },
          ],
        },
      })}
      privateStateDoc={privateStateDoc}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('相手の手札（12枚）')).toBeInTheDocument();
  });

  const revealModal = container.querySelector('[class*="opponentRevealCard"]');
  expect(revealModal).toBeInTheDocument();
  expect(revealModal.style.getPropertyValue('--opponent-reveal-columns')).toBe('10');
  expect(screen.getByRole('button', { name: '公開手札 1 を拡大表示' })).toBeInTheDocument();
});

test('opponent hand reveal modal supports selecting a card for OP-B12 discard request', async () => {
  const privateStateDoc = createPrivateStateDoc();
  const { rerender } = render(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc()}
      privateStateDoc={privateStateDoc}
    />
  );

  rerender(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc({
        publicState: {
          publicCardCatalog: {
            c_player2_hand_001: 'https://example.com/p2_hand_001.jpg',
          },
          operationRequests: [
            {
              requestId: 'req_reveal_b12',
              opId: 'OP-A03',
              requestType: 'opponent-reveal-hand',
              status: 'completed',
              actorPlayerId: 'player1',
              targetPlayerId: 'player2',
              payload: { count: 1 },
              result: {
                revealedCardIds: ['c_player2_hand_001'],
              },
            },
          ],
        },
      })}
      privateStateDoc={privateStateDoc}
    />
  );

  await waitFor(() => {
    expect(screen.getByRole('button', { name: '公開手札 1 を拡大表示' })).toBeInTheDocument();
  });

  const requestDiscardButton = screen.getByRole('button', { name: '選択されたカードの破壊を要求' });
  expect(requestDiscardButton).toBeDisabled();

  fireEvent.doubleClick(screen.getByRole('button', { name: '公開手札 1 を拡大表示' }));

  await waitFor(() => {
    expect(requestDiscardButton).not.toBeDisabled();
  });
});

test('shows rejection banner when opponent rejects reveal request', async () => {
  const privateStateDoc = createPrivateStateDoc();
  const { rerender } = render(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc()}
      privateStateDoc={privateStateDoc}
    />
  );

  rerender(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc({
        publicState: {
          operationRequests: [
            {
              requestId: 'req_reveal_002',
              opId: 'OP-A03',
              requestType: 'opponent-reveal-hand',
              status: 'rejected',
              actorPlayerId: 'player1',
              targetPlayerId: 'player2',
              payload: { count: 1 },
              result: { reason: 'rejected-by-target-player' },
            },
          ],
        },
      })}
      privateStateDoc={privateStateDoc}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('相手が手札公開リクエストを拒否しました。')).toBeInTheDocument();
  });
});

test('shows opponent shuffle notice when lastDeckShuffleEvent is updated', async () => {
  const privateStateDoc = createPrivateStateDoc();
  const { rerender } = render(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc()}
      privateStateDoc={privateStateDoc}
    />
  );

  rerender(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc({
        publicState: {
          turnContext: {
            lastDeckShuffleEvent: {
              byPlayerId: 'player2',
              at: '2026-02-20T10:00:00.000Z',
            },
          },
        },
      })}
      privateStateDoc={privateStateDoc}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('相手プレイヤーの山札がシャッフルされました。')).toBeInTheDocument();
  });
});

test('shuffle notice auto clears within 10 seconds', async () => {
  jest.useFakeTimers();

  const privateStateDoc = createPrivateStateDoc();
  const { rerender } = render(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc()}
      privateStateDoc={privateStateDoc}
    />
  );

  rerender(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc({
        publicState: {
          turnContext: {
            lastDeckShuffleEvent: {
              byPlayerId: 'player2',
              at: '2026-02-20T10:00:00.000Z',
            },
          },
        },
      })}
      privateStateDoc={privateStateDoc}
    />
  );

  expect(await screen.findByText('相手プレイヤーの山札がシャッフルされました。')).toBeInTheDocument();

  act(() => {
    jest.advanceTimersByTime(10001);
  });

  await waitFor(() => {
    expect(screen.queryByText('相手プレイヤーの山札がシャッフルされました。')).not.toBeInTheDocument();
  });

  jest.useRealTimers();
});

test('shows opponent deck peek live banner while opponent is viewing deck', async () => {
  const privateStateDoc = createPrivateStateDoc();
  const { rerender } = render(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc()}
      privateStateDoc={privateStateDoc}
    />
  );

  rerender(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc({
        publicState: {
          turnContext: {
            deckPeekState: {
              byPlayerId: 'player2',
              count: 4,
              isOpen: true,
              updatedAt: '2026-02-20T10:00:01.000Z',
            },
          },
        },
      })}
      privateStateDoc={privateStateDoc}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('相手が山札を閲覧中（4枚）')).toBeInTheDocument();
  });

  rerender(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc({
        publicState: {
          turnContext: {
            deckPeekState: {
              byPlayerId: 'player2',
              count: 2,
              isOpen: true,
              updatedAt: '2026-02-20T10:00:02.000Z',
            },
          },
        },
      })}
      privateStateDoc={privateStateDoc}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('相手が山札を閲覧中（2枚）')).toBeInTheDocument();
  });
});

test('shows completion banner when OP-B12 selected discard request is resolved', async () => {
  const privateStateDoc = createPrivateStateDoc();
  const { rerender } = render(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc()}
      privateStateDoc={privateStateDoc}
    />
  );

  rerender(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc({
        publicState: {
          operationRequests: [
            {
              requestId: 'req_b12_completed',
              opId: 'OP-B12',
              requestType: 'opponent-discard-selected-hand',
              status: 'completed',
              actorPlayerId: 'player1',
              targetPlayerId: 'player2',
              payload: { cardId: 'c_player2_hand_001' },
              result: { discardedCardIds: ['c_player2_hand_001'] },
            },
          ],
        },
      })}
      privateStateDoc={privateStateDoc}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('相手手札の指定カードをトラッシュしました。')).toBeInTheDocument();
  });
});

test('shows rejection banner when OP-B12 selected discard request is rejected', async () => {
  const privateStateDoc = createPrivateStateDoc();
  const { rerender } = render(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc()}
      privateStateDoc={privateStateDoc}
    />
  );

  rerender(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc({
        publicState: {
          operationRequests: [
            {
              requestId: 'req_b12_rejected',
              opId: 'OP-B12',
              requestType: 'opponent-discard-selected-hand',
              status: 'rejected',
              actorPlayerId: 'player1',
              targetPlayerId: 'player2',
              payload: { cardId: 'c_player2_hand_001' },
              result: { reason: 'rejected-by-target-player' },
            },
          ],
        },
      })}
      privateStateDoc={privateStateDoc}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('相手がカード破壊リクエストを拒否しました。')).toBeInTheDocument();
  });
});

test('shows completion banner when OP-B11 random discard request is resolved', async () => {
  const privateStateDoc = createPrivateStateDoc();
  const { rerender } = render(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc()}
      privateStateDoc={privateStateDoc}
    />
  );

  rerender(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc({
        publicState: {
          operationRequests: [
            {
              requestId: 'req_b11_completed',
              opId: 'OP-B11',
              requestType: 'opponent-discard-random-hand',
              status: 'completed',
              actorPlayerId: 'player1',
              targetPlayerId: 'player2',
              payload: { count: 2 },
              result: { discardedCount: 2 },
            },
          ],
        },
      })}
      privateStateDoc={privateStateDoc}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('相手手札からランダムに2枚トラッシュしました。')).toBeInTheDocument();
  });
});

test('shows rejection banner when OP-B11 random discard request is rejected', async () => {
  const privateStateDoc = createPrivateStateDoc();
  const { rerender } = render(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc()}
      privateStateDoc={privateStateDoc}
    />
  );

  rerender(
    <PlayingField
      sessionId="session-layout-test"
      playerId="player1"
      sessionDoc={createSessionDoc({
        publicState: {
          operationRequests: [
            {
              requestId: 'req_b11_rejected',
              opId: 'OP-B11',
              requestType: 'opponent-discard-random-hand',
              status: 'rejected',
              actorPlayerId: 'player1',
              targetPlayerId: 'player2',
              payload: { count: 1 },
              result: { reason: 'rejected-by-target-player' },
            },
          ],
        },
      })}
      privateStateDoc={privateStateDoc}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('相手が手札ランダム破壊リクエストを拒否しました。')).toBeInTheDocument();
  });
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
        publicCardCatalog: {
          c_player1_001: 'https://example.com/p1_hand_001.jpg',
        },
        operationRequests: [
          {
            requestId: 'req_101',
            opId: 'OP-B12',
            requestType: 'opponent-discard-selected-hand',
            status: 'pending',
            actorPlayerId: 'player2',
            targetPlayerId: 'player1',
            payload: {
              cardId: 'c_player1_001',
            },
          },
        ],
      },
    },
  });

  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('相手から確認依頼があります')).toBeInTheDocument();
  expect(screen.getByAltText('相手が破壊を要求しているカード 1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /承認して実行/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^拒否$/i })).toBeInTheDocument();
});

test('does not render turn info panel', () => {
  renderPlayingField({
    sessionOverrides: {
      publicState: {
        turnContext: {
          turnNumber: 5,
          currentPlayer: 'player2',
          supportUsed: true,
          goodsUsedCount: 2,
        },
      },
    },
  });

  expect(screen.queryByText('ターン情報')).not.toBeInTheDocument();
  expect(screen.queryByText('ターン: 5')).not.toBeInTheDocument();
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

test('opens stack expansion modal for multi-card active stack and shows cards in top-first order', async () => {
  const { container } = renderPlayingField({
    sessionOverrides: {
      publicState: {
        players: {
          player1: {
            board: {
              active: {
                stackId: 's_player1_active',
                cardIds: ['c_player1_001', 'c_player1_002'],
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
            },
          },
        },
      },
    },
    privateStateOverrides: {
      cardCatalog: {
        c_player1_001: {
          cardId: 'c_player1_001',
          imageUrl: 'https://example.com/p1_active_base.jpg',
          ownerPlayerId: 'player1',
        },
        c_player1_002: {
          cardId: 'c_player1_002',
          imageUrl: 'https://example.com/p1_active_energy.jpg',
          ownerPlayerId: 'player1',
        },
      },
    },
  });

  fireEvent.click(screen.getByRole('button', { name: '自分バトル場を展開' }));

  const modal = await screen.findByLabelText('スタック展開モーダル');
  expect(within(modal).getByText('バトル場（自分）を展開（2枚）')).toBeInTheDocument();
  expect(within(modal).getByRole('img', { name: '展開カード 1' })).toBeInTheDocument();
  expect(within(modal).getByRole('img', { name: '展開カード 2' })).toBeInTheDocument();

  const cardImages = within(modal).getAllByRole('img', { name: /展開カード/i });
  expect(cardImages[0].getAttribute('src')).toContain('p1_active_energy.jpg');
  expect(cardImages[1].getAttribute('src')).toContain('p1_active_base.jpg');

  fireEvent.click(within(modal).getByRole('button', { name: '閉じる' }));
  await waitFor(() => {
    expect(container.querySelector('[data-zone="stack-cards-root"]')).not.toBeInTheDocument();
  });
});
