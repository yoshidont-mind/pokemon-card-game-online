import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OperationPanel from '../operation/OperationPanel';
import { ERROR_CODES, GameStateError } from '../../game-state/errors';

jest.mock('../../auth/authClient', () => ({
  getCurrentUid: jest.fn(() => 'uid-player1'),
}));

jest.mock('../../operations/wave1/buildOperationIntent', () => ({
  buildOperationIntent: jest.fn((value) => value),
}));

jest.mock('../../operations/wave1/resolveOperationIntent', () => ({
  resolveOperationIntent: jest.fn(() => ({
    accepted: true,
    action: {
      opId: 'OP-B03',
      mode: 'direct',
      actorPlayerId: 'player1',
      payload: {
        count: 1,
      },
    },
  })),
}));

jest.mock('../../operations/wave1/applyOperationMutation', () => ({
  applyOperationMutation: jest.fn(() => Promise.resolve({ revision: 2 })),
  listPendingOperationRequests: jest.fn(() => []),
  listResolvedOperationRequests: jest.fn(() => []),
}));

const {
  applyOperationMutation: mockApplyOperationMutation,
  listPendingOperationRequests: mockListPendingOperationRequests,
  listResolvedOperationRequests: mockListResolvedOperationRequests,
} = require('../../operations/wave1/applyOperationMutation');
const { getCurrentUid: mockGetCurrentUid } = require('../../auth/authClient');
const { buildOperationIntent: mockBuildOperationIntent } = require('../../operations/wave1/buildOperationIntent');
const { resolveOperationIntent: mockResolveOperationIntent } = require('../../operations/wave1/resolveOperationIntent');

function createSessionDoc() {
  return {
    revision: 1,
    participants: {
      player1: { uid: 'uid-player1' },
      player2: { uid: 'uid-player2' },
    },
  };
}

function createPrivateStateDoc() {
  return {
    ownerPlayerId: 'player1',
    zones: {
      hand: [],
      deck: [],
    },
    cardCatalog: {},
  };
}

describe('OperationPanel', () => {
  beforeEach(() => {
    mockApplyOperationMutation.mockClear();
    mockListPendingOperationRequests.mockClear();
    mockListResolvedOperationRequests.mockClear();
    mockGetCurrentUid.mockReturnValue('uid-player1');
    mockBuildOperationIntent.mockImplementation((value) => value);
    mockResolveOperationIntent.mockImplementation(() => ({
      accepted: true,
      action: {
        opId: 'OP-B03',
        mode: 'direct',
        actorPlayerId: 'player1',
        payload: {
          count: 1,
        },
      },
    }));
  });

  test('opens panel and displays operation controls', () => {
    render(
      <OperationPanel
        sessionId="session-001"
        playerId="player1"
        sessionDoc={createSessionDoc()}
        privateStateDoc={createPrivateStateDoc()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /操作パネルを開く/i }));

    expect(screen.getByLabelText('操作')).toBeInTheDocument();
    expect(screen.getByLabelText('移動元')).toBeInTheDocument();
    expect(screen.getByLabelText('移動先')).toBeInTheDocument();
  });

  test('shows pending request actions when request exists', () => {
    mockListPendingOperationRequests.mockReturnValue([
      {
        requestId: 'req_001',
        opId: 'OP-B11',
        requestType: 'opponent-discard-random-hand',
        actorPlayerId: 'player2',
        payload: { count: 1 },
      },
    ]);

    render(
      <OperationPanel
        sessionId="session-001"
        playerId="player1"
        sessionDoc={createSessionDoc()}
        privateStateDoc={createPrivateStateDoc()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /操作パネルを開く/i }));

    expect(screen.getByRole('button', { name: /承認して実行/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /拒否/i })).toBeInTheDocument();
  });

  test('shows resolved request summary when recent requests exist', () => {
    mockListResolvedOperationRequests.mockReturnValue([
      {
        requestId: 'req_200',
        opId: 'OP-B12',
        status: 'completed',
        resolvedByPlayerId: 'player2',
        requestType: 'opponent-reveal-hand',
        result: {
          revealedCardIds: ['c_player2_hand_001', 'c_player2_hand_002'],
        },
      },
    ]);

    render(
      <OperationPanel
        sessionId="session-001"
        playerId="player1"
        sessionDoc={createSessionDoc()}
        privateStateDoc={createPrivateStateDoc()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /操作パネルを開く/i }));

    expect(screen.getByText(/承認済み\/拒否済みリクエスト/i)).toBeInTheDocument();
    expect(screen.getByText(/公開カード:/i)).toBeInTheDocument();
    expect(screen.getByText(/c_player2_hand_001/i)).toBeInTheDocument();
  });

  test('shows revision conflict message when operation mutation conflicts', async () => {
    mockApplyOperationMutation.mockRejectedValueOnce(
      new GameStateError(ERROR_CODES.REVISION_CONFLICT, 'conflict')
    );
    const onMutationMessage = jest.fn();

    render(
      <OperationPanel
        sessionId="session-001"
        playerId="player1"
        sessionDoc={createSessionDoc()}
        privateStateDoc={createPrivateStateDoc()}
        onMutationMessage={onMutationMessage}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /操作パネルを開く/i }));
    fireEvent.click(screen.getByRole('button', { name: /OP-B03 を実行/i }));

    await waitFor(() =>
      expect(onMutationMessage).toHaveBeenCalledWith(
        '他端末の更新と競合しました。最新状態で再実行してください。'
      )
    );
  });

  test('disables execute button while submitting', async () => {
    let resolveMutation;
    const pendingPromise = new Promise((resolve) => {
      resolveMutation = resolve;
    });
    mockApplyOperationMutation.mockReturnValueOnce(pendingPromise);

    render(
      <OperationPanel
        sessionId="session-001"
        playerId="player1"
        sessionDoc={createSessionDoc()}
        privateStateDoc={createPrivateStateDoc()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /操作パネルを開く/i }));
    const executeButton = screen.getByRole('button', { name: /OP-B03 を実行/i });
    fireEvent.click(executeButton);

    await waitFor(() => expect(screen.getByRole('button', { name: /実行中.../i })).toBeDisabled());
    resolveMutation({ revision: 2 });

    await waitFor(() => expect(screen.getByRole('button', { name: /OP-B03 を実行/i })).not.toBeDisabled());
  });
});
