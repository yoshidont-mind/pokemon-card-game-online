import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import Pokemon from './Pokemon';
import HandTray from './HandTray';
import ToolboxPanel from './ToolboxPanel';
import OperationPanel from './operation/OperationPanel';
import DroppableZone from './dnd/DroppableZone';
import DroppableStack from './dnd/DroppableStack';
import DraggableCard from './dnd/DraggableCard';
import BoardDragOverlay from './dnd/BoardDragOverlay';
import '../css/boardLayout.tokens.css';
import styles from '../css/playingField.module.css';
import { getCurrentUid } from '../auth/authClient';
import { ERROR_CODES, isGameStateError } from '../game-state/errors';
import { toPlayerKey } from '../game-state/migrateV1ToV2';
import { applyPrivateStateMutation } from '../game-state/privateStateMutation';
import { buildOperationIntent } from '../operations/wave1/buildOperationIntent';
import {
  applyOperationMutation,
  listPendingOperationRequests,
} from '../operations/wave1/applyOperationMutation';
import { resolveOperationIntent } from '../operations/wave1/resolveOperationIntent';
import { INTERNAL_OPERATION_IDS, OPERATION_IDS } from '../operations/wave1/operationIds';
import {
  buildCardDragPayload,
  buildPileCardDragPayload,
  buildStackDropPayload,
  buildZoneDropPayload,
} from '../interaction/dnd/buildDragPayload';
import { STACK_KINDS, ZONE_KINDS } from '../interaction/dnd/constants';
import { useBoardDnd } from '../interaction/dnd/useBoardDnd';

const CARD_BACK_IMAGE = '/card-back.jpg';
const COIN_FRONT_IMAGE = '/coin-front.png';
const COIN_BACK_IMAGE = '/coin-back.png';
const COIN_RESULT_LABEL = Object.freeze({
  heads: 'オモテ',
  tails: 'ウラ',
});
const BENCH_SLOTS = 5;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveUiPrefs(privateStateDoc) {
  const source = privateStateDoc?.uiPrefs;
  return {
    handTrayOpen: Boolean(source?.handTrayOpen),
    toolboxOpen: Boolean(source?.toolboxOpen),
  };
}

function getStackImages(stack, cardCatalog) {
  return asArray(stack?.cardIds)
    .map((cardId) => cardCatalog?.[cardId]?.imageUrl || null)
    .filter(Boolean);
}

function toPokemonProps(stack, cardCatalog) {
  return {
    images: getStackImages(stack, cardCatalog),
    damage: Number(stack?.damage || 0),
    isPoisoned: Boolean(stack?.specialConditions?.poisoned),
    isBurned: Boolean(stack?.specialConditions?.burned),
    isAsleep: Boolean(stack?.specialConditions?.asleep),
    isParalyzed: Boolean(stack?.specialConditions?.paralyzed),
    isConfused: Boolean(stack?.specialConditions?.confused),
  };
}

function resolveStackId(stack, fallback) {
  if (stack?.stackId && typeof stack.stackId === 'string') {
    return stack.stackId;
  }
  return fallback;
}

function toHandCards(privateStateDoc) {
  const cardCatalog = privateStateDoc?.cardCatalog || {};
  return asArray(privateStateDoc?.zones?.hand)
    .map((ref, index) => {
      const cardId = ref?.cardId || `unknown-hand-card-${index + 1}`;
      return {
        cardId,
        imageUrl: cardCatalog?.[cardId]?.imageUrl || null,
      };
    })
    .filter((entry) => Boolean(entry.imageUrl));
}

function toRevealCards(board, cardCatalog = {}) {
  return asArray(board?.reveal)
    .map((ref, index) => {
      const cardId = ref?.cardId || `reveal-card-${index + 1}`;
      const imageUrl = ref?.imageUrl || cardCatalog?.[cardId]?.imageUrl || null;
      return {
        cardId,
        imageUrl,
      };
    })
    .filter((entry) => Boolean(entry.imageUrl));
}

function buildRenderCardCatalog(privateCardCatalog = {}, publicCardCatalog = {}) {
  const normalizedPublicCatalog = {};
  Object.entries(publicCardCatalog || {}).forEach(([cardId, imageUrl]) => {
    if (typeof imageUrl !== 'string') {
      return;
    }
    const normalizedImageUrl = imageUrl.trim();
    if (!normalizedImageUrl) {
      return;
    }
    normalizedPublicCatalog[cardId] = {
      cardId,
      imageUrl: normalizedImageUrl,
    };
  });

  return {
    ...normalizedPublicCatalog,
    ...(privateCardCatalog && typeof privateCardCatalog === 'object' ? privateCardCatalog : {}),
  };
}

function resolveCardImageUrl(cardRef, cardCatalog = {}) {
  if (typeof cardRef?.imageUrl === 'string' && cardRef.imageUrl.trim() !== '') {
    return cardRef.imageUrl;
  }
  const cardId = cardRef?.cardId;
  if (!cardId) {
    return null;
  }
  return cardCatalog?.[cardId]?.imageUrl || null;
}

function PublicPilePreview({
  cardRefs,
  cardCatalog,
  pileLabel,
}) {
  const refs = asArray(cardRefs);
  const topCardRef = refs.length > 0 ? refs[refs.length - 1] : null;
  const topCardImageUrl = resolveCardImageUrl(topCardRef, cardCatalog);

  return (
    <div className={styles.publicPilePreview}>
      {topCardImageUrl ? (
        <img
          src={topCardImageUrl}
          alt={`${pileLabel}上のカード`}
          className={styles.publicPileTopCard}
        />
      ) : null}
      <span className={styles.publicPileCount}>{refs.length} 枚</span>
    </div>
  );
}

function joinClassNames(...classNames) {
  return classNames.filter(Boolean).join(' ');
}

function formatZoneLabel(zone) {
  if (zone === 'deck') {
    return '山札';
  }
  if (zone === 'hand') {
    return '手札';
  }
  if (zone === 'discard') {
    return 'トラッシュ';
  }
  if (zone === 'lost' || zone === 'lostZone') {
    return 'ロスト';
  }
  if (zone === 'prize') {
    return 'サイド';
  }
  if (zone === 'active') {
    return 'バトル場';
  }
  if (zone === 'bench') {
    return 'ベンチ';
  }
  return zone || '不明';
}

function formatPendingRequestLabel(request) {
  if (!request || typeof request !== 'object') {
    return '';
  }

  if (request.requestType === 'opponent-discard-random-hand') {
    const count = Number(request?.payload?.count || 1);
    return `手札をランダムに ${count} 枚トラッシュしてよいか確認されています。`;
  }

  if (request.requestType === 'opponent-reveal-hand') {
    return '手札を公開してよいか確認されています。';
  }

  return '相手から操作の承認が必要です。';
}

function ZoneTile({
  zone,
  title,
  children,
  dropGroup = 'zone',
  dropPayload = null,
  isHighlighted = false,
  className = '',
  valueClassName = '',
}) {
  return (
    <DroppableZone
      dropId={`zone-${zone}`}
      dropPayload={dropPayload}
      className={joinClassNames(styles.zoneTile, className)}
      activeClassName={styles.dropZoneActive}
      isHighlighted={isHighlighted}
      data-zone={zone}
      data-drop-group={dropGroup}
    >
      <p className={styles.zoneTitle}>{title}</p>
      <div className={joinClassNames(styles.zoneValue, valueClassName)}>{children}</div>
    </DroppableZone>
  );
}

function DeckPile({ count, alt }) {
  const normalizedCount = Math.max(0, Number(count) || 0);
  return (
    <div className={styles.deckPile}>
      {normalizedCount > 0 ? (
        <img src={CARD_BACK_IMAGE} alt={alt} className={styles.deckCardBack} />
      ) : null}
      <span className={styles.deckPileCount}>{normalizedCount} 枚</span>
    </div>
  );
}

function PrizeFan({ count = 0 }) {
  const normalizedCount = Math.max(0, Number(count) || 0);
  const displayCount = Math.min(6, normalizedCount);
  const rows = [];

  for (let cursor = 0; cursor < displayCount; cursor += 2) {
    const row = [];
    const firstCardIndex = cursor;
    const secondCardIndex = cursor + 1;
    row.push(firstCardIndex);
    if (secondCardIndex < displayCount) {
      row.push(secondCardIndex);
    }
    rows.push(row);
  }

  return (
    <div className={styles.prizeFan} aria-label={`サイド ${normalizedCount} 枚`}>
      <div className={styles.prizeFanRows}>
        {rows.map((row, rowIndex) => (
          <div key={`prize-row-${rowIndex + 1}`} className={styles.prizeFanRow}>
            {row.map((cardIndex, pairIndex) => (
              <img
                key={`prize-fan-${cardIndex + 1}`}
                src={CARD_BACK_IMAGE}
                alt=""
                aria-hidden
                className={joinClassNames(
                  styles.prizeFanCard,
                  pairIndex === 1 ? styles.prizeFanCardShifted : ''
                )}
              />
            ))}
          </div>
        ))}
      </div>
      <span className={styles.prizeFanCount}>{normalizedCount} 枚</span>
    </div>
  );
}

function BenchRow({
  owner,
  ownerPlayerId,
  bench,
  cardCatalog,
  allowCardDrop,
  isZoneHighlighted,
  isStackHighlighted,
}) {
  const slots = Array.from({ length: BENCH_SLOTS }, (_, index) => bench[index] || null);

  return (
    <div className={styles.benchRow} data-zone={`${owner}-bench`} data-drop-group="bench">
      {slots.map((stack, index) => {
        const zoneId = `${owner}-bench-${index + 1}`;
        const stackId = resolveStackId(stack, `s_${ownerPlayerId}_bench_${index + 1}`);
        const zoneDropPayload = allowCardDrop
          ? buildZoneDropPayload({
              zoneId,
              targetPlayerId: ownerPlayerId,
              zoneKind: ZONE_KINDS.BENCH,
              benchIndex: index,
            })
          : null;

        const stackDropPayload = buildStackDropPayload({
          zoneId,
          targetPlayerId: ownerPlayerId,
          stackKind: STACK_KINDS.BENCH,
          benchIndex: index,
        });

        return (
          <DroppableZone
            key={`${owner}-bench-${index}`}
            dropId={`zone-${zoneId}`}
            dropPayload={zoneDropPayload}
            className={styles.benchSlot}
            activeClassName={styles.dropZoneActive}
            isHighlighted={isZoneHighlighted(zoneId)}
            data-zone={zoneId}
            data-drop-group="bench-slot"
          >
            {stack ? (
              <DroppableStack
                dropId={`stack-${stackId}`}
                dropPayload={stackDropPayload}
                className={styles.stackDropSurface}
                activeClassName={styles.dropStackActive}
                isHighlighted={isStackHighlighted(zoneId)}
                data-zone={`${zoneId}-stack`}
                data-drop-group="stack"
              >
                <Pokemon {...toPokemonProps(stack, cardCatalog)} />
              </DroppableStack>
            ) : (
              <span className={styles.benchPlaceholder}>ベンチ</span>
            )}
          </DroppableZone>
        );
      })}
    </div>
  );
}

const PlayingField = ({ sessionId, playerId, sessionDoc, privateStateDoc }) => {
  const ownerPlayerId = toPlayerKey(playerId);
  const opponentPlayerId = ownerPlayerId === 'player1' ? 'player2' : 'player1';

  const persistedUiPrefs = resolveUiPrefs(privateStateDoc);

  const [isHandOpen, setIsHandOpen] = useState(persistedUiPrefs.handTrayOpen);
  const [isToolboxOpen, setIsToolboxOpen] = useState(persistedUiPrefs.toolboxOpen);
  const [mutationMessage, setMutationMessage] = useState('');
  const [isCoinSubmitting, setIsCoinSubmitting] = useState(false);
  const [isQuickActionSubmitting, setIsQuickActionSubmitting] = useState(false);
  const [isCoinAnimating, setIsCoinAnimating] = useState(false);

  useEffect(() => {
    setIsHandOpen(persistedUiPrefs.handTrayOpen);
    setIsToolboxOpen(persistedUiPrefs.toolboxOpen);
  }, [persistedUiPrefs.handTrayOpen, persistedUiPrefs.toolboxOpen]);

  const persistUiPrefs = useCallback(
    async (nextPartialPrefs) => {
      const actorUid = getCurrentUid();
      if (!sessionId || !ownerPlayerId || !actorUid) {
        return;
      }

      try {
        await applyPrivateStateMutation({
          sessionId,
          playerId: ownerPlayerId,
          actorUid,
          mutate: ({ privateStateDoc: draftPrivateStateDoc }) => {
            const currentPrefs =
              draftPrivateStateDoc?.uiPrefs && typeof draftPrivateStateDoc.uiPrefs === 'object'
                ? draftPrivateStateDoc.uiPrefs
                : {};

            draftPrivateStateDoc.uiPrefs = {
              handTrayOpen: Boolean(
                nextPartialPrefs?.handTrayOpen ?? currentPrefs.handTrayOpen
              ),
              toolboxOpen: Boolean(
                nextPartialPrefs?.toolboxOpen ?? currentPrefs.toolboxOpen
              ),
            };

            return { privateStateDoc: draftPrivateStateDoc };
          },
        });
      } catch (error) {
        if (isGameStateError(error, ERROR_CODES.PERMISSION_DENIED)) {
          setMutationMessage('表示設定の保存権限がありません。参加状態を確認してください。');
          return;
        }
        setMutationMessage('表示設定の保存に失敗しました。再試行してください。');
      }
    },
    [ownerPlayerId, sessionId]
  );

  const handleHandToggle = useCallback(() => {
    setIsHandOpen((prev) => {
      const next = !prev;
      void persistUiPrefs({ handTrayOpen: next });
      return next;
    });
  }, [persistUiPrefs]);

  const handleToolboxToggle = useCallback(() => {
    setIsToolboxOpen((prev) => {
      const next = !prev;
      void persistUiPrefs({ toolboxOpen: next });
      return next;
    });
  }, [persistUiPrefs]);

  const publicPlayers = sessionDoc?.publicState?.players || {};
  const turnContext = sessionDoc?.publicState?.turnContext || {};
  const playerBoard = publicPlayers?.[ownerPlayerId]?.board || {};
  const opponentBoard = publicPlayers?.[opponentPlayerId]?.board || {};
  const playerCounters = publicPlayers?.[ownerPlayerId]?.counters || {};
  const opponentCounters = publicPlayers?.[opponentPlayerId]?.counters || {};

  const playerDeckRefs = asArray(privateStateDoc?.zones?.deck);
  const playerCatalog = privateStateDoc?.cardCatalog;
  const publicCardCatalog = sessionDoc?.publicState?.publicCardCatalog;
  const normalizedPlayerCatalog = useMemo(
    () => (playerCatalog && typeof playerCatalog === 'object' ? playerCatalog : {}),
    [playerCatalog]
  );
  const normalizedPublicCardCatalog = useMemo(
    () =>
      publicCardCatalog && typeof publicCardCatalog === 'object'
        ? publicCardCatalog
        : {},
    [publicCardCatalog]
  );
  const renderCardCatalog = useMemo(
    () => buildRenderCardCatalog(normalizedPlayerCatalog, normalizedPublicCardCatalog),
    [normalizedPlayerCatalog, normalizedPublicCardCatalog]
  );

  const playerHandCards = toHandCards(privateStateDoc);
  const playerDeckCount = Number(playerCounters.deckCount ?? playerDeckRefs.length);
  const playerPrizeCount = asArray(playerBoard?.prize).length;
  const opponentDeckCount = Number(opponentCounters.deckCount ?? 0);
  const opponentHandCount = Number(opponentCounters.handCount ?? 0);
  const opponentPrizeCount = asArray(opponentBoard?.prize).length;
  const playerRevealCards = toRevealCards(playerBoard, renderCardCatalog);
  const opponentRevealCards = toRevealCards(opponentBoard, renderCardCatalog);
  const pendingApprovalRequests = useMemo(
    () => listPendingOperationRequests(sessionDoc, ownerPlayerId),
    [ownerPlayerId, sessionDoc]
  );
  const blockingRequest = pendingApprovalRequests[0] || null;
  const hasBlockingRequest = Boolean(blockingRequest);
  const playerMarkers = asArray(playerBoard?.markers).slice(-5).reverse();

  const playerActive = playerBoard?.active;
  const opponentActive = opponentBoard?.active;
  const playerBench = asArray(playerBoard?.bench);
  const opponentBench = asArray(opponentBoard?.bench);
  const playerDiscardRefs = asArray(playerBoard?.discard);
  const playerLostRefs = asArray(playerBoard?.lostZone);
  const opponentDiscardRefs = asArray(opponentBoard?.discard);
  const opponentLostRefs = asArray(opponentBoard?.lostZone);
  const lastCoinResult = turnContext?.lastCoinResult;
  const lastCoinAt = turnContext?.lastCoinAt || null;
  const coinImageSrc = lastCoinResult === 'tails' ? COIN_BACK_IMAGE : COIN_FRONT_IMAGE;
  const coinResultLabel = COIN_RESULT_LABEL[lastCoinResult] || '未実行';
  const coinImageClassName = joinClassNames(
    styles.coinButtonImage,
    lastCoinResult === 'tails' ? styles.coinButtonImageBack : styles.coinButtonImageFront
  );

  const playerActiveZoneId = 'player-active';
  const opponentActiveZoneId = 'opponent-active';

  const playerActiveDropPayload = buildZoneDropPayload({
    zoneId: playerActiveZoneId,
    targetPlayerId: ownerPlayerId,
    zoneKind: ZONE_KINDS.ACTIVE,
  });

  const playerHandDropPayload = buildZoneDropPayload({
    zoneId: 'player-hand',
    targetPlayerId: ownerPlayerId,
    zoneKind: ZONE_KINDS.HAND,
  });

  const playerDiscardDropPayload = buildZoneDropPayload({
    zoneId: 'player-discard',
    targetPlayerId: ownerPlayerId,
    zoneKind: ZONE_KINDS.DISCARD,
  });

  const playerLostDropPayload = buildZoneDropPayload({
    zoneId: 'player-lost',
    targetPlayerId: ownerPlayerId,
    zoneKind: ZONE_KINDS.LOST,
  });

  const playerPrizeDropPayload = buildZoneDropPayload({
    zoneId: 'player-prize',
    targetPlayerId: ownerPlayerId,
    zoneKind: ZONE_KINDS.PRIZE,
  });

  const playerRevealDropPayload = buildZoneDropPayload({
    zoneId: 'player-reveal',
    targetPlayerId: ownerPlayerId,
    zoneKind: ZONE_KINDS.REVEAL,
  });

  const playerStadiumDropPayload = buildZoneDropPayload({
    zoneId: 'center-stadium',
    targetPlayerId: ownerPlayerId,
    zoneKind: ZONE_KINDS.STADIUM,
  });

  const playerActiveStackDropPayload = buildStackDropPayload({
    zoneId: playerActiveZoneId,
    targetPlayerId: ownerPlayerId,
    stackKind: STACK_KINDS.ACTIVE,
  });

  const opponentActiveStackDropPayload = buildStackDropPayload({
    zoneId: opponentActiveZoneId,
    targetPlayerId: opponentPlayerId,
    stackKind: STACK_KINDS.ACTIVE,
  });

  const {
    sensors,
    activeDragPayload,
    isMutating,
    isZoneHighlighted,
    isStackHighlighted,
    handleDragStart,
    handleDragMove,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  } = useBoardDnd({
    sessionId,
    playerId: ownerPlayerId,
    sessionDoc,
    isInteractionLocked: hasBlockingRequest,
    onMutationMessage: setMutationMessage,
  });

  const isDraggingPileCard = activeDragPayload?.dragType === 'pile-card';
  const isDraggingFromPlayerDeck = isDraggingPileCard && activeDragPayload?.sourceZone === 'player-deck';
  const isDraggingFromPlayerPrize =
    isDraggingPileCard && activeDragPayload?.sourceZone === 'player-prize';
  const displayPlayerDeckCount = Math.max(0, playerDeckCount - (isDraggingFromPlayerDeck ? 1 : 0));
  const displayPlayerPrizeCount = Math.max(0, playerPrizeCount - (isDraggingFromPlayerPrize ? 1 : 0));
  const turnNumber = Number.isInteger(turnContext?.turnNumber) ? turnContext.turnNumber : null;
  const currentTurnPlayerId = turnContext?.currentPlayer;
  const currentTurnOwnerLabel =
    currentTurnPlayerId === ownerPlayerId
      ? '自分'
      : currentTurnPlayerId === opponentPlayerId
        ? '相手'
        : '未設定';
  const goodsUsedCount = Number.isInteger(turnContext?.goodsUsedCount)
    ? turnContext.goodsUsedCount
    : 0;
  const supportUsed = Boolean(turnContext?.supportUsed);
  const lastRandomSelection = turnContext?.lastRandomSelection || null;
  const randomSelectionCardCount = asArray(lastRandomSelection?.cardIds).length;

  useEffect(() => {
    if (!lastCoinAt) {
      return undefined;
    }
    setIsCoinAnimating(true);
    const timerId = window.setTimeout(() => {
      setIsCoinAnimating(false);
    }, 700);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [lastCoinAt]);

  const handleCoinToss = useCallback(async () => {
    if (!sessionId || !ownerPlayerId || isCoinSubmitting || isMutating) {
      return;
    }

    const actorUid = getCurrentUid();
    if (!actorUid) {
      setMutationMessage('認証情報を取得できませんでした。ページを再読み込みしてください。');
      return;
    }

    const intentDraft = buildOperationIntent({
      opId: OPERATION_IDS.OP_A01,
      actorPlayerId: ownerPlayerId,
      payload: {},
    });

    const resolvedIntent = resolveOperationIntent({
      intent: intentDraft,
      sessionDoc,
      privateStateDoc,
      actorPlayerId: ownerPlayerId,
    });

    if (!resolvedIntent?.accepted) {
      setMutationMessage(
        resolvedIntent?.message || 'コイントスを実行できませんでした。状態を確認してください。'
      );
      return;
    }

    setIsCoinSubmitting(true);
    try {
      await applyOperationMutation({
        sessionId,
        playerId: ownerPlayerId,
        actorUid,
        expectedRevision: Number.isFinite(sessionDoc?.revision) ? sessionDoc.revision : 0,
        intent: resolvedIntent,
      });
      setMutationMessage('');
    } catch (error) {
      if (isGameStateError(error, ERROR_CODES.REVISION_CONFLICT)) {
        setMutationMessage('他端末の更新と競合しました。最新状態で再実行してください。');
      } else if (isGameStateError(error, ERROR_CODES.PERMISSION_DENIED)) {
        setMutationMessage('操作権限がありません。セッション参加状態を確認してください。');
      } else {
        setMutationMessage('操作の確定に失敗しました。再試行してください。');
      }
    } finally {
      setIsCoinSubmitting(false);
    }
  }, [isCoinSubmitting, isMutating, ownerPlayerId, privateStateDoc, sessionDoc, sessionId]);

  const executeQuickOperation = useCallback(
    async ({ opId, payload = {}, invalidMessage, successMessage }) => {
      if (
        !sessionId ||
        !ownerPlayerId ||
        isMutating ||
        isCoinSubmitting ||
        isQuickActionSubmitting
      ) {
        return;
      }

      const actorUid = getCurrentUid();
      if (!actorUid) {
        setMutationMessage('認証情報を取得できませんでした。ページを再読み込みしてください。');
        return;
      }

      const intentDraft = buildOperationIntent({
        opId,
        actorPlayerId: ownerPlayerId,
        payload,
      });

      const resolvedIntent = resolveOperationIntent({
        intent: intentDraft,
        sessionDoc,
        privateStateDoc,
        actorPlayerId: ownerPlayerId,
      });

      if (!resolvedIntent?.accepted) {
        setMutationMessage(
          resolvedIntent?.message || invalidMessage || '操作を実行できませんでした。状態を確認してください。'
        );
        return;
      }

      setIsQuickActionSubmitting(true);
      try {
        await applyOperationMutation({
          sessionId,
          playerId: ownerPlayerId,
          actorUid,
          expectedRevision: Number.isFinite(sessionDoc?.revision) ? sessionDoc.revision : 0,
          intent: resolvedIntent,
        });
        setMutationMessage(successMessage || '');
      } catch (error) {
        if (isGameStateError(error, ERROR_CODES.REVISION_CONFLICT)) {
          setMutationMessage('他端末の更新と競合しました。最新状態で再実行してください。');
        } else if (isGameStateError(error, ERROR_CODES.PERMISSION_DENIED)) {
          setMutationMessage('操作権限がありません。セッション参加状態を確認してください。');
        } else {
          setMutationMessage('操作の確定に失敗しました。再試行してください。');
        }
      } finally {
        setIsQuickActionSubmitting(false);
      }
    },
    [
      isCoinSubmitting,
      isMutating,
      isQuickActionSubmitting,
      ownerPlayerId,
      privateStateDoc,
      sessionDoc,
      sessionId,
    ]
  );

  const handleDeckDrawOne = useCallback(() => {
    void executeQuickOperation({
      opId: OPERATION_IDS.OP_B03,
      payload: { count: 1 },
      invalidMessage: 'ドローを実行できませんでした。状態を確認してください。',
      successMessage: '山札から1枚引きました。',
    });
  }, [executeQuickOperation]);

  const handleDeckShuffle = useCallback(() => {
    void executeQuickOperation({
      opId: OPERATION_IDS.OP_B01,
      payload: {},
      invalidMessage: '山札シャッフルを実行できませんでした。状態を確認してください。',
      successMessage: '山札をシャッフルしました。',
    });
  }, [executeQuickOperation]);

  const handlePrizeTakeOne = useCallback(() => {
    void executeQuickOperation({
      opId: OPERATION_IDS.OP_D01,
      payload: {
        mode: 'take',
        count: 1,
      },
      invalidMessage: 'サイド取得を実行できませんでした。状態を確認してください。',
      successMessage: 'サイドから1枚取りました。',
    });
  }, [executeQuickOperation]);

  const handleApproveBlockingRequest = useCallback(() => {
    if (!blockingRequest?.requestId) {
      return;
    }
    void executeQuickOperation({
      opId: INTERNAL_OPERATION_IDS.REQUEST_APPROVE,
      payload: {
        requestId: blockingRequest.requestId,
        action: 'approve',
      },
      invalidMessage: '承認処理を実行できませんでした。状態を確認してください。',
      successMessage: 'リクエストを承認して実行しました。',
    });
  }, [blockingRequest, executeQuickOperation]);

  const handleRejectBlockingRequest = useCallback(() => {
    if (!blockingRequest?.requestId) {
      return;
    }
    void executeQuickOperation({
      opId: INTERNAL_OPERATION_IDS.REQUEST_REJECT,
      payload: {
        requestId: blockingRequest.requestId,
        action: 'reject',
      },
      invalidMessage: '拒否処理を実行できませんでした。状態を確認してください。',
      successMessage: 'リクエストを拒否しました。',
    });
  }, [blockingRequest, executeQuickOperation]);

  const isQuickActionLocked =
    isMutating || isCoinSubmitting || isQuickActionSubmitting || hasBlockingRequest;
  const canDrawFromDeck = playerDeckCount > 0 && !isQuickActionLocked;
  const canShuffleDeck = playerDeckCount > 1 && !isQuickActionLocked;
  const canTakePrize = playerPrizeCount > 0 && !isQuickActionLocked;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={`container mt-4 ${styles.boardRoot}`}>
        <div className={styles.statusBar}>
          状態: {sessionDoc?.status || 'waiting'} / Rev: {sessionDoc?.revision ?? 0}
          {isMutating ? ' / 更新中...' : ''}
        </div>
        {mutationMessage && <div className={styles.mutationBanner}>{mutationMessage}</div>}
        <div className={styles.turnInfoPanel} data-zone="turn-info-panel">
          <p className={styles.turnInfoTitle}>ターン情報</p>
          <div className={styles.turnInfoList}>
            <span>ターン: {turnNumber ?? '-'}</span>
            <span>現在手番: {currentTurnOwnerLabel}</span>
            <span>サポート使用: {supportUsed ? '済み' : '未使用'}</span>
            <span>グッズ使用回数: {goodsUsedCount}</span>
            {lastRandomSelection ? (
              <span>
                直近ランダム選択: {formatZoneLabel(lastRandomSelection?.zone)} から{' '}
                {randomSelectionCardCount} 枚
              </span>
            ) : null}
          </div>
          <p className={styles.turnInfoTitle}>継続効果メモ（自分）</p>
          {playerMarkers.length > 0 ? (
            <ul className={styles.turnInfoMarkers}>
              {playerMarkers.map((marker, index) => (
                <li key={marker?.markerId || marker?.createdAt || `marker-${index + 1}`}>
                  {marker?.label || 'メモ'}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.turnInfoEmpty}>なし</p>
          )}
        </div>
        <div className={styles.opponentHandCountFixed} data-zone="opponent-hand-count-fixed">
          <span
            className={styles.handCountPill}
            data-zone="opponent-hand-count-pill"
            aria-label={`相手手札（${opponentHandCount}枚）`}
          >
            相手手札（{opponentHandCount}枚）
          </span>
        </div>

        <section className={styles.opponentArea} data-zone="opponent-area" data-drop-group="area">
          <div className={styles.sideColumn}>
            <ZoneTile zone="opponent-lost" title="ロスト（相手）">
              <PublicPilePreview
                cardRefs={opponentLostRefs}
                cardCatalog={renderCardCatalog}
                pileLabel="ロスト（相手）"
              />
            </ZoneTile>
            <ZoneTile zone="opponent-discard" title="トラッシュ（相手）">
              <PublicPilePreview
                cardRefs={opponentDiscardRefs}
                cardCatalog={renderCardCatalog}
                pileLabel="トラッシュ（相手）"
              />
            </ZoneTile>
            <ZoneTile zone="opponent-deck" title="山札（相手）">
              <DeckPile count={opponentDeckCount} alt="Opponent Deck" />
            </ZoneTile>
          </div>

          <div className={styles.mainColumn}>
            <BenchRow
              owner="opponent"
              ownerPlayerId={opponentPlayerId}
              bench={opponentBench}
              cardCatalog={renderCardCatalog}
              allowCardDrop={false}
              isZoneHighlighted={isZoneHighlighted}
              isStackHighlighted={isStackHighlighted}
            />
            <div className={`${styles.activeRow} ${styles.battleLineRow}`.trim()}>
              <div className={styles.battleLineRevealOpponent}>
                <ZoneTile
                  zone="opponent-reveal"
                  title="公開エリア（相手）"
                  className={styles.revealZoneTile}
                  valueClassName={styles.revealZoneValue}
                >
                  {opponentRevealCards.length > 0 ? (
                    <div className={styles.revealCards}>
                      {opponentRevealCards.map((card, index) => (
                        <img
                          key={`opponent-reveal-${card.cardId}-${index}`}
                          src={card.imageUrl}
                          alt={`公開カード（相手）${index + 1}`}
                          className={styles.revealCardImage}
                        />
                      ))}
                    </div>
                  ) : (
                    <span className={styles.zoneValueMuted}>なし</span>
                  )}
                </ZoneTile>
              </div>
              <DroppableZone
                dropId={`zone-${opponentActiveZoneId}`}
                dropPayload={null}
                className={`${styles.activeZone} ${styles.battleLineActive}`.trim()}
                activeClassName={styles.dropZoneActive}
                isHighlighted={isZoneHighlighted(opponentActiveZoneId)}
                data-zone={opponentActiveZoneId}
                data-drop-group="active"
              >
                {opponentActive ? (
                  <DroppableStack
                    dropId={`stack-${resolveStackId(opponentActive, `s_${opponentPlayerId}_active`)}`}
                    dropPayload={opponentActiveStackDropPayload}
                    className={styles.stackDropSurface}
                    activeClassName={styles.dropStackActive}
                    isHighlighted={isStackHighlighted(opponentActiveZoneId)}
                    data-zone={`${opponentActiveZoneId}-stack`}
                    data-drop-group="stack"
                  >
                    <Pokemon {...toPokemonProps(opponentActive, renderCardCatalog)} />
                  </DroppableStack>
                ) : (
                  <span className={styles.activePlaceholder}>バトルポケモン（相手）</span>
                )}
              </DroppableZone>
            </div>
          </div>

          <div className={styles.sideColumn}>
            <ZoneTile
              zone="opponent-prize"
              title="サイド（相手）"
              className={styles.prizeZoneTile}
              valueClassName={styles.prizeZoneValue}
            >
              <PrizeFan count={opponentPrizeCount} />
            </ZoneTile>
          </div>
        </section>

        <section className={styles.centerArea}>
          <div className={styles.centerAreaInner}>
            <DroppableZone
              dropId="zone-center-stadium"
              dropPayload={playerStadiumDropPayload}
              className={styles.centerZone}
              activeClassName={styles.dropZoneActive}
              isHighlighted={isZoneHighlighted('center-stadium')}
              data-zone="center-stadium"
              data-drop-group="stadium"
            >
              <p className={styles.zoneTitle}>スタジアム</p>
              <span className={styles.zoneValueMuted}>
                {sessionDoc?.publicState?.stadium ? '場に出ている' : 'なし'}
              </span>
            </DroppableZone>
            <div className={styles.coinWidget} data-zone="coin-widget">
              <p className={styles.coinWidgetTitle}>コイン</p>
              <button
                type="button"
                className={`${styles.coinButton} ${isCoinAnimating ? styles.coinButtonAnimating : ''}`.trim()}
                onClick={handleCoinToss}
                disabled={isCoinSubmitting || isMutating}
                aria-label="コイントスを実行"
              >
                <img src={coinImageSrc} alt={`コイン(${coinResultLabel})`} className={coinImageClassName} />
              </button>
              <span className={styles.coinWidgetResult}>結果: {coinResultLabel}</span>
            </div>
          </div>
        </section>

        <section className={styles.playerArea} data-zone="player-area" data-drop-group="area">
          <div className={styles.sideColumn}>
            <ZoneTile
              zone="player-prize"
              title="サイド（自分）"
              dropPayload={playerPrizeDropPayload}
              isHighlighted={isZoneHighlighted('player-prize')}
              className={styles.prizeZoneTile}
              valueClassName={styles.prizeZoneValue}
            >
              <div className={styles.zoneWithActions}>
                {playerPrizeCount > 0 ? (
                  <DraggableCard
                    dragId={`pile-player-prize-${ownerPlayerId}`}
                    dragPayload={buildPileCardDragPayload({
                      sourceZone: 'player-prize',
                      availableCount: playerPrizeCount,
                    })}
                    className={styles.pileCardDraggable}
                  >
                    <PrizeFan count={displayPlayerPrizeCount} />
                  </DraggableCard>
                ) : (
                  <PrizeFan count={displayPlayerPrizeCount} />
                )}
                <div className={styles.zoneQuickActions}>
                  <button
                    type="button"
                    className={styles.zoneQuickActionButton}
                    onClick={handlePrizeTakeOne}
                    disabled={!canTakePrize}
                    aria-label="サイドから1枚取る"
                  >
                    1枚取る
                  </button>
                </div>
              </div>
            </ZoneTile>
          </div>

          <div className={styles.mainColumn}>
            <div className={`${styles.activeRow} ${styles.battleLineRow}`.trim()}>
              <DroppableZone
                dropId={`zone-${playerActiveZoneId}`}
                dropPayload={playerActiveDropPayload}
                className={`${styles.activeZone} ${styles.battleLineActive}`.trim()}
                activeClassName={styles.dropZoneActive}
                isHighlighted={isZoneHighlighted(playerActiveZoneId)}
                data-zone={playerActiveZoneId}
                data-drop-group="active"
              >
                {playerActive ? (
                  <DroppableStack
                    dropId={`stack-${resolveStackId(playerActive, `s_${ownerPlayerId}_active`)}`}
                    dropPayload={playerActiveStackDropPayload}
                    className={styles.stackDropSurface}
                    activeClassName={styles.dropStackActive}
                    isHighlighted={isStackHighlighted(playerActiveZoneId)}
                    data-zone={`${playerActiveZoneId}-stack`}
                    data-drop-group="stack"
                  >
                    <Pokemon {...toPokemonProps(playerActive, normalizedPlayerCatalog)} />
                  </DroppableStack>
                ) : (
                  <span className={styles.activePlaceholder}>バトルポケモン（自分）</span>
                )}
              </DroppableZone>
              <div className={styles.battleLineRevealPlayer}>
                <ZoneTile
                  zone="player-reveal"
                  title="公開エリア（自分）"
                  dropPayload={playerRevealDropPayload}
                  isHighlighted={isZoneHighlighted('player-reveal')}
                  className={styles.revealZoneTile}
                  valueClassName={styles.revealZoneValue}
                >
                  {playerRevealCards.length > 0 ? (
                    <div className={styles.revealCards}>
                      {playerRevealCards.map((card, index) => (
                        <DraggableCard
                          key={`player-reveal-${card.cardId}-${index}`}
                          dragId={`player-reveal-card-${card.cardId}-${index}`}
                          dragPayload={buildCardDragPayload({
                            cardId: card.cardId,
                            sourceZone: 'player-reveal',
                          })}
                          className={styles.revealCardDraggable}
                          draggingClassName={styles.draggingSource}
                        >
                          <img
                            src={card.imageUrl}
                            alt={`公開カード（自分）${index + 1}`}
                            className={styles.revealCardImage}
                          />
                        </DraggableCard>
                      ))}
                    </div>
                  ) : (
                    <span className={styles.zoneValueMuted}>ここに置く</span>
                  )}
                </ZoneTile>
              </div>
            </div>
            <BenchRow
              owner="player"
              ownerPlayerId={ownerPlayerId}
              bench={playerBench}
              cardCatalog={renderCardCatalog}
              allowCardDrop
              isZoneHighlighted={isZoneHighlighted}
              isStackHighlighted={isStackHighlighted}
            />
          </div>

          <div className={styles.sideColumn}>
            <ZoneTile zone="player-deck" title="山札（自分）">
              <div className={styles.zoneWithActions}>
                {playerDeckCount > 0 ? (
                  <DraggableCard
                    dragId={`pile-player-deck-${ownerPlayerId}`}
                    dragPayload={buildPileCardDragPayload({
                      sourceZone: 'player-deck',
                      availableCount: playerDeckCount,
                    })}
                    className={styles.pileCardDraggable}
                  >
                    <DeckPile count={displayPlayerDeckCount} alt="Player Deck" />
                  </DraggableCard>
                ) : (
                  <DeckPile count={displayPlayerDeckCount} alt="Player Deck" />
                )}
                <div className={styles.zoneQuickActions}>
                  <button
                    type="button"
                    className={styles.zoneQuickActionButton}
                    onClick={handleDeckDrawOne}
                    disabled={!canDrawFromDeck}
                    aria-label="山札から1枚引く"
                  >
                    1枚引く
                  </button>
                  <button
                    type="button"
                    className={styles.zoneQuickActionButton}
                    onClick={handleDeckShuffle}
                    disabled={!canShuffleDeck}
                    aria-label="山札をシャッフルする"
                  >
                    シャッフル
                  </button>
                </div>
              </div>
            </ZoneTile>
            <ZoneTile
              zone="player-discard"
              title="トラッシュ（自分）"
              dropPayload={playerDiscardDropPayload}
              isHighlighted={isZoneHighlighted('player-discard')}
            >
              <PublicPilePreview
                cardRefs={playerDiscardRefs}
                cardCatalog={renderCardCatalog}
                pileLabel="トラッシュ（自分）"
              />
            </ZoneTile>
            <ZoneTile
              zone="player-lost"
              title="ロスト（自分）"
              dropPayload={playerLostDropPayload}
              isHighlighted={isZoneHighlighted('player-lost')}
            >
              <PublicPilePreview
                cardRefs={playerLostRefs}
                cardCatalog={renderCardCatalog}
                pileLabel="ロスト（自分）"
              />
            </ZoneTile>
          </div>
        </section>

        <HandTray
          cards={playerHandCards}
          isOpen={isHandOpen}
          onToggle={handleHandToggle}
          dropPayload={playerHandDropPayload}
          isDropHighlighted={isZoneHighlighted('player-hand')}
        />
        <ToolboxPanel isOpen={isToolboxOpen} onToggle={handleToolboxToggle} />
        <OperationPanel
          sessionId={sessionId}
          playerId={ownerPlayerId}
          sessionDoc={sessionDoc}
          privateStateDoc={privateStateDoc}
          onMutationMessage={setMutationMessage}
        />
      </div>
      {hasBlockingRequest ? (
        <div className={styles.requestBlockingOverlay} role="dialog" aria-modal="true">
          <div className={styles.requestBlockingCard}>
            <p className={styles.requestBlockingTitle}>相手から確認依頼があります</p>
            <p className={styles.requestBlockingMeta}>依頼元: {blockingRequest?.actorPlayerId}</p>
            <p className={styles.requestBlockingText}>{formatPendingRequestLabel(blockingRequest)}</p>
            {pendingApprovalRequests.length > 1 ? (
              <p className={styles.requestBlockingMeta}>
                保留中: {pendingApprovalRequests.length} 件（先頭から処理されます）
              </p>
            ) : null}
            <div className={styles.requestBlockingActions}>
              <button
                type="button"
                className={styles.requestApproveButton}
                onClick={handleApproveBlockingRequest}
                disabled={isQuickActionSubmitting || isMutating}
              >
                承認して実行
              </button>
              <button
                type="button"
                className={styles.requestRejectButton}
                onClick={handleRejectBlockingRequest}
                disabled={isQuickActionSubmitting || isMutating}
              >
                拒否
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <BoardDragOverlay activeDragPayload={activeDragPayload} cardCatalog={normalizedPlayerCatalog} />
    </DndContext>
  );
};

export default PlayingField;
