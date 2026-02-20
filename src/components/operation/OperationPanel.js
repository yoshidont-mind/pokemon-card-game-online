import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { getCurrentUid } from '../../auth/authClient';
import { ERROR_CODES, isGameStateError } from '../../game-state/errors';
import { buildOperationIntent } from '../../operations/wave1/buildOperationIntent';
import { listWave1OperationsByGroup } from '../../operations/wave1/operationCatalog';
import {
  applyOperationMutation,
  listPendingOperationRequests,
  listResolvedOperationRequests,
} from '../../operations/wave1/applyOperationMutation';
import { resolveOperationIntent } from '../../operations/wave1/resolveOperationIntent';
import { INTERNAL_OPERATION_IDS, OPERATION_IDS } from '../../operations/wave1/operationIds';
import styles from '../../css/playingField.module.css';

const SOURCE_ZONE_OPTIONS = [
  { value: 'hand', label: '手札' },
  { value: 'deck', label: '山札' },
  { value: 'discard', label: 'トラッシュ' },
  { value: 'lost', label: 'ロスト' },
  { value: 'prize', label: 'サイド' },
  { value: 'active', label: 'バトル場' },
  { value: 'bench', label: 'ベンチ' },
];

const TARGET_ZONE_OPTIONS = [
  { value: 'hand', label: '手札' },
  { value: 'deck-top', label: '山札上' },
  { value: 'deck-bottom', label: '山札下' },
  { value: 'discard', label: 'トラッシュ' },
  { value: 'lost', label: 'ロスト' },
  { value: 'prize', label: 'サイド' },
  { value: 'active', label: 'バトル場' },
  { value: 'bench', label: 'ベンチ' },
];

const CONDITION_OPTIONS = [
  { value: 'poison', label: 'どく' },
  { value: 'burn', label: 'やけど' },
  { value: 'asleep', label: 'ねむり' },
  { value: 'paralyzed', label: 'マヒ' },
  { value: 'confused', label: 'こんらん' },
];

const MODE_OPTIONS = [
  { value: '', label: '指定なし' },
  { value: 'set-from-hand', label: '手札からセット' },
  { value: 'take', label: '取得' },
  { value: 'evolve', label: '進化' },
  { value: 'devolve', label: '退化' },
  { value: 'set', label: '設置' },
  { value: 'clear', label: '解除' },
  { value: 'clear-status', label: '状態異常解除' },
  { value: 'stadium', label: 'スタジアム操作' },
  { value: 'end-turn', label: 'ターン終了' },
  { value: 'extra-turn', label: '追加ターン' },
];

function parseCsvCardIds(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') {
    return [];
  }
  return rawValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function toOptionalInteger(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function createDefaultPayload(playerId) {
  return {
    count: 1,
    value: 10,
    cardId: '',
    cardIdsText: '',
    orderCardIdsText: '',
    sourceZone: 'hand',
    targetZone: 'discard',
    benchIndex: 0,
    sourceBenchIndex: 0,
    targetBenchIndex: 0,
    sourceStackKind: 'active',
    targetStackKind: 'active',
    targetPlayerId: playerId,
    condition: 'poison',
    mode: '',
    note: '',
  };
}

function operationLabelById(groupedCatalog) {
  const map = new Map();
  Object.values(groupedCatalog).forEach((groupEntries) => {
    groupEntries.forEach((entry) => {
      map.set(entry.opId, entry.label);
    });
  });
  return map;
}

function formatResolvedRequestSummary(request) {
  if (!request || typeof request !== 'object') {
    return '';
  }

  if (request.status === 'rejected') {
    return '拒否されました';
  }

  if (request.requestType === 'opponent-reveal-hand') {
    const ids = Array.isArray(request?.result?.revealedCardIds)
      ? request.result.revealedCardIds
      : [];
    return ids.length
      ? `公開カード: ${ids.join(', ')}`
      : '公開カード: なし';
  }

  if (request.requestType === 'opponent-discard-random-hand') {
    const ids = Array.isArray(request?.result?.discardedCardIds)
      ? request.result.discardedCardIds
      : [];
    return ids.length
      ? `破棄カード: ${ids.join(', ')}`
      : '破棄カード: なし';
  }

  return request?.result ? JSON.stringify(request.result) : '';
}

const OperationPanel = ({
  sessionId,
  playerId,
  sessionDoc,
  privateStateDoc,
  onMutationMessage = () => {},
}) => {
  const groupedCatalog = useMemo(() => listWave1OperationsByGroup(), []);
  const labelMap = useMemo(() => operationLabelById(groupedCatalog), [groupedCatalog]);

  const [isOpen, setIsOpen] = useState(false);
  const [selectedOpId, setSelectedOpId] = useState(OPERATION_IDS.OP_B03);
  const [payloadState, setPayloadState] = useState(() => createDefaultPayload(playerId));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pendingRequests = useMemo(() => {
    const result = listPendingOperationRequests(sessionDoc, playerId);
    return Array.isArray(result) ? result : [];
  }, [playerId, sessionDoc]);
  const resolvedRequests = useMemo(() => {
    const result = listResolvedOperationRequests(sessionDoc, playerId, { limit: 5 });
    return Array.isArray(result) ? result : [];
  }, [playerId, sessionDoc]);

  const opponentPlayerId = playerId === 'player1' ? 'player2' : 'player1';

  const handlePayloadChange = (key, value) => {
    setPayloadState((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  async function submitIntent(opId, partialPayload = null) {
    const actorUid = getCurrentUid();
    if (!actorUid) {
      onMutationMessage('認証情報を取得できませんでした。ページを再読み込みしてください。');
      return;
    }

    const resolvedPayload = partialPayload || {
      count: toOptionalInteger(payloadState.count),
      value: toOptionalInteger(payloadState.value),
      cardId: payloadState.cardId,
      cardIds: parseCsvCardIds(payloadState.cardIdsText),
      orderCardIds: parseCsvCardIds(payloadState.orderCardIdsText),
      sourceZone: payloadState.sourceZone,
      targetZone: payloadState.targetZone,
      benchIndex: toOptionalInteger(payloadState.benchIndex),
      sourceBenchIndex: toOptionalInteger(payloadState.sourceBenchIndex),
      targetBenchIndex: toOptionalInteger(payloadState.targetBenchIndex),
      sourceStackKind: payloadState.sourceStackKind,
      targetStackKind: payloadState.targetStackKind,
      targetPlayerId: payloadState.targetPlayerId,
      condition: payloadState.condition,
      mode: payloadState.mode,
      note: payloadState.note,
    };

    const intentDraft = buildOperationIntent({
      opId,
      actorPlayerId: playerId,
      payload: resolvedPayload,
    });

    const resolvedIntent = resolveOperationIntent({
      intent: intentDraft,
      sessionDoc,
      privateStateDoc,
      actorPlayerId: playerId,
    });

    if (!resolvedIntent || !resolvedIntent.accepted) {
      onMutationMessage(
        resolvedIntent?.message || '操作内容が不正です。入力を確認してください。'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await applyOperationMutation({
        sessionId,
        playerId,
        actorUid,
        expectedRevision: Number.isFinite(sessionDoc?.revision) ? sessionDoc.revision : 0,
        intent: resolvedIntent,
      });
      onMutationMessage('');
    } catch (error) {
      if (isGameStateError(error, ERROR_CODES.REVISION_CONFLICT)) {
        onMutationMessage('他端末の更新と競合しました。最新状態で再実行してください。');
      } else if (isGameStateError(error, ERROR_CODES.PERMISSION_DENIED)) {
        onMutationMessage('操作権限がありません。セッション参加状態を確認してください。');
      } else if (isGameStateError(error, ERROR_CODES.NOT_FOUND)) {
        onMutationMessage('対象のリクエストまたはカードが見つかりません。');
      } else {
        onMutationMessage('操作の確定に失敗しました。再試行してください。');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const executeSelectedOperation = async () => {
    const payloadOverride = {
      ...payloadState,
      targetPlayerId:
        selectedOpId === OPERATION_IDS.OP_A03 ||
        selectedOpId === OPERATION_IDS.OP_B11 ||
        selectedOpId === OPERATION_IDS.OP_B12
          ? opponentPlayerId
          : payloadState.targetPlayerId,
    };

    await submitIntent(selectedOpId, {
      count: toOptionalInteger(payloadOverride.count),
      value: toOptionalInteger(payloadOverride.value),
      cardId: payloadOverride.cardId,
      cardIds: parseCsvCardIds(payloadOverride.cardIdsText),
      orderCardIds: parseCsvCardIds(payloadOverride.orderCardIdsText),
      sourceZone: payloadOverride.sourceZone,
      targetZone: payloadOverride.targetZone,
      benchIndex: toOptionalInteger(payloadOverride.benchIndex),
      sourceBenchIndex: toOptionalInteger(payloadOverride.sourceBenchIndex),
      targetBenchIndex: toOptionalInteger(payloadOverride.targetBenchIndex),
      sourceStackKind: payloadOverride.sourceStackKind,
      targetStackKind: payloadOverride.targetStackKind,
      targetPlayerId: payloadOverride.targetPlayerId,
      condition: payloadOverride.condition,
      mode: payloadOverride.mode,
      note: payloadOverride.note,
    });
  };

  const resolveRequest = async (requestId, decision) => {
    const opId =
      decision === 'approve'
        ? INTERNAL_OPERATION_IDS.REQUEST_APPROVE
        : INTERNAL_OPERATION_IDS.REQUEST_REJECT;

    await submitIntent(opId, {
      requestId,
      action: decision,
    });
  };

  return (
    <aside className={styles.operationPanelRoot} data-zone="operation-panel">
      <button
        type="button"
        className={styles.panelToggle}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        {isOpen ? '操作パネルを閉じる' : '操作パネルを開く'}
      </button>

      {isOpen && (
        <div className={styles.operationPanelBody}>
          <p className={styles.zoneTitle}>Phase 05 操作パネル</p>

          <div className={styles.operationFieldRow}>
            <label htmlFor="operation-opid">操作</label>
            <select
              id="operation-opid"
              value={selectedOpId}
              onChange={(event) => setSelectedOpId(event.target.value)}
              className={styles.operationInput}
            >
              {Object.entries(groupedCatalog).map(([groupKey, entries]) => (
                <optgroup key={groupKey} label={`${groupKey}系`}>
                  {entries.map((entry) => (
                    <option key={entry.opId} value={entry.opId}>
                      {entry.opId} - {entry.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className={styles.operationFieldGrid}>
            <div className={styles.operationFieldRow}>
              <label htmlFor="operation-count">枚数</label>
              <input
                id="operation-count"
                type="number"
                min="0"
                value={payloadState.count}
                onChange={(event) => handlePayloadChange('count', event.target.value)}
                className={styles.operationInput}
              />
            </div>

            <div className={styles.operationFieldRow}>
              <label htmlFor="operation-value">値</label>
              <input
                id="operation-value"
                type="number"
                min="0"
                value={payloadState.value}
                onChange={(event) => handlePayloadChange('value', event.target.value)}
                className={styles.operationInput}
              />
            </div>

            <div className={styles.operationFieldRow}>
              <label htmlFor="operation-cardid">cardId</label>
              <input
                id="operation-cardid"
                type="text"
                value={payloadState.cardId}
                onChange={(event) => handlePayloadChange('cardId', event.target.value)}
                className={styles.operationInput}
                placeholder="c_player1_001"
              />
            </div>

            <div className={styles.operationFieldRow}>
              <label htmlFor="operation-cardids">cardIds</label>
              <input
                id="operation-cardids"
                type="text"
                value={payloadState.cardIdsText}
                onChange={(event) => handlePayloadChange('cardIdsText', event.target.value)}
                className={styles.operationInput}
                placeholder="c_xxx,c_yyy"
              />
            </div>

            <div className={styles.operationFieldRow}>
              <label htmlFor="operation-order-cardids">orderCardIds</label>
              <input
                id="operation-order-cardids"
                type="text"
                value={payloadState.orderCardIdsText}
                onChange={(event) => handlePayloadChange('orderCardIdsText', event.target.value)}
                className={styles.operationInput}
                placeholder="c_xxx,c_yyy"
              />
            </div>

            <div className={styles.operationFieldRow}>
              <label htmlFor="operation-source-zone">移動元</label>
              <select
                id="operation-source-zone"
                value={payloadState.sourceZone}
                onChange={(event) => handlePayloadChange('sourceZone', event.target.value)}
                className={styles.operationInput}
              >
                {SOURCE_ZONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.operationFieldRow}>
              <label htmlFor="operation-target-zone">移動先</label>
              <select
                id="operation-target-zone"
                value={payloadState.targetZone}
                onChange={(event) => handlePayloadChange('targetZone', event.target.value)}
                className={styles.operationInput}
              >
                {TARGET_ZONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.operationFieldRow}>
              <label htmlFor="operation-bench-index">benchIndex</label>
              <input
                id="operation-bench-index"
                type="number"
                min="0"
                max="4"
                value={payloadState.benchIndex}
                onChange={(event) => handlePayloadChange('benchIndex', event.target.value)}
                className={styles.operationInput}
              />
            </div>

            <div className={styles.operationFieldRow}>
              <label htmlFor="operation-source-bench-index">sourceBenchIndex</label>
              <input
                id="operation-source-bench-index"
                type="number"
                min="0"
                max="4"
                value={payloadState.sourceBenchIndex}
                onChange={(event) => handlePayloadChange('sourceBenchIndex', event.target.value)}
                className={styles.operationInput}
              />
            </div>

            <div className={styles.operationFieldRow}>
              <label htmlFor="operation-target-bench-index">targetBenchIndex</label>
              <input
                id="operation-target-bench-index"
                type="number"
                min="0"
                max="4"
                value={payloadState.targetBenchIndex}
                onChange={(event) => handlePayloadChange('targetBenchIndex', event.target.value)}
                className={styles.operationInput}
              />
            </div>

            <div className={styles.operationFieldRow}>
              <label htmlFor="operation-source-stack-kind">sourceStackKind</label>
              <select
                id="operation-source-stack-kind"
                value={payloadState.sourceStackKind}
                onChange={(event) => handlePayloadChange('sourceStackKind', event.target.value)}
                className={styles.operationInput}
              >
                <option value="active">active</option>
                <option value="bench">bench</option>
              </select>
            </div>

            <div className={styles.operationFieldRow}>
              <label htmlFor="operation-target-stack-kind">targetStackKind</label>
              <select
                id="operation-target-stack-kind"
                value={payloadState.targetStackKind}
                onChange={(event) => handlePayloadChange('targetStackKind', event.target.value)}
                className={styles.operationInput}
              >
                <option value="active">active</option>
                <option value="bench">bench</option>
              </select>
            </div>

            <div className={styles.operationFieldRow}>
              <label htmlFor="operation-target-player">対象プレイヤー</label>
              <select
                id="operation-target-player"
                value={payloadState.targetPlayerId}
                onChange={(event) => handlePayloadChange('targetPlayerId', event.target.value)}
                className={styles.operationInput}
              >
                <option value={playerId}>自分 ({playerId})</option>
                <option value={opponentPlayerId}>相手 ({opponentPlayerId})</option>
              </select>
            </div>

            <div className={styles.operationFieldRow}>
              <label htmlFor="operation-condition">状態異常</label>
              <select
                id="operation-condition"
                value={payloadState.condition}
                onChange={(event) => handlePayloadChange('condition', event.target.value)}
                className={styles.operationInput}
              >
                {CONDITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.operationFieldRow}>
              <label htmlFor="operation-mode">mode</label>
              <select
                id="operation-mode"
                value={payloadState.mode}
                onChange={(event) => handlePayloadChange('mode', event.target.value)}
                className={styles.operationInput}
              >
                {MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.operationFieldRow}>
              <label htmlFor="operation-note">補足メモ</label>
              <input
                id="operation-note"
                type="text"
                value={payloadState.note}
                onChange={(event) => handlePayloadChange('note', event.target.value)}
                className={styles.operationInput}
              />
            </div>
          </div>

          <button
            type="button"
            className={styles.operationExecuteButton}
            onClick={executeSelectedOperation}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? '実行中...'
              : `${selectedOpId} を実行 (${labelMap.get(selectedOpId) || '操作'})`}
          </button>

          {pendingRequests.length > 0 && (
            <div className={styles.operationPendingBox}>
              <p className={styles.zoneTitle}>相手承認リクエスト</p>
              {pendingRequests.map((request) => (
                <div key={request.requestId} className={styles.operationPendingItem}>
                  <div className={styles.operationPendingText}>
                    <span>{request.opId}</span>
                    <span>要求元: {request.actorPlayerId}</span>
                    <span>
                      内容: {request.requestType}
                      {request?.payload?.count ? ` / count=${request.payload.count}` : ''}
                    </span>
                  </div>
                  <div className={styles.operationPendingActions}>
                    <button
                      type="button"
                      className={styles.operationMiniButton}
                      onClick={() => resolveRequest(request.requestId, 'approve')}
                      disabled={isSubmitting}
                    >
                      承認して実行
                    </button>
                    <button
                      type="button"
                      className={`${styles.operationMiniButton} ${styles.operationMiniDanger}`.trim()}
                      onClick={() => resolveRequest(request.requestId, 'reject')}
                      disabled={isSubmitting}
                    >
                      拒否
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {resolvedRequests.length > 0 && (
            <div className={styles.operationPendingBox}>
              <p className={styles.zoneTitle}>承認済み/拒否済みリクエスト</p>
              {resolvedRequests.map((request) => (
                <div key={request.requestId} className={styles.operationPendingItem}>
                  <div className={styles.operationPendingText}>
                    <span>{request.opId}</span>
                    <span>
                      状態: {request.status}
                      {request?.resolvedByPlayerId ? ` / 実行: ${request.resolvedByPlayerId}` : ''}
                    </span>
                    <span>{formatResolvedRequestSummary(request)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};

OperationPanel.propTypes = {
  sessionId: PropTypes.string.isRequired,
  playerId: PropTypes.string.isRequired,
  sessionDoc: PropTypes.shape({
    revision: PropTypes.number,
  }).isRequired,
  privateStateDoc: PropTypes.shape({
    ownerPlayerId: PropTypes.string,
  }).isRequired,
  onMutationMessage: PropTypes.func,
};

export default OperationPanel;
