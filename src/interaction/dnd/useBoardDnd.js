import { useCallback, useMemo, useRef, useState } from 'react';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { getCurrentUid } from '../../auth/authClient';
import { ERROR_CODES, isGameStateError } from '../../game-state/errors';
import { applyDropMutation } from './applyDropMutation';
import { DRAG_TYPES, DROP_TYPES, ZONE_KINDS } from './constants';
import { isDragBlockedBySelectors } from './dropGuards';
import { createBoardSnapshot, resolveDropIntent } from './resolveDropIntent';

function noop() {}
const HAND_TRAY_BLOCKED_SELECTORS = ['#hand-tray-panel'];

function shouldApplyHandTrayBlock(dragPayload) {
  return dragPayload?.dragType === DRAG_TYPES.CARD;
}

function getDragPayload(event) {
  return event?.active?.data?.current?.dragPayload || null;
}

function getDropPayload(event) {
  return event?.over?.data?.current?.dropPayload || null;
}

export function isHandZoneDropPayload(dropPayload) {
  return (
    dropPayload?.dropType === DROP_TYPES.ZONE &&
    dropPayload?.zoneKind === ZONE_KINDS.HAND &&
    dropPayload?.zoneId === 'player-hand'
  );
}

function createPlayerHandDropPayload(playerId) {
  if (!playerId) {
    return null;
  }

  return {
    dropType: DROP_TYPES.ZONE,
    zoneId: 'player-hand',
    targetPlayerId: playerId,
    zoneKind: ZONE_KINDS.HAND,
    benchIndex: null,
    edge: '',
  };
}

export function resolveDropPayloadForHandTray({
  dragPayload,
  dropPayload,
  isPointerInsideHandTray,
  playerId,
}) {
  if (!isPointerInsideHandTray || !shouldApplyHandTrayBlock(dragPayload)) {
    return dropPayload;
  }

  return createPlayerHandDropPayload(playerId) || dropPayload;
}

export function useBoardDnd({
  sessionId,
  playerId,
  sessionDoc,
  isInteractionLocked = false,
  onMutationMessage = noop,
}) {
  const [activeDragPayload, setActiveDragPayload] = useState(null);
  const [highlightedZoneId, setHighlightedZoneId] = useState(null);
  const [highlightedStackZoneId, setHighlightedStackZoneId] = useState(null);
  const [isMutating, setIsMutating] = useState(false);
  const dragStartPointRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    })
  );

  const boardSnapshot = useMemo(() => createBoardSnapshot(sessionDoc), [sessionDoc]);

  const resetHighlights = useCallback(() => {
    setHighlightedZoneId(null);
    setHighlightedStackZoneId(null);
  }, []);

  const resolveAndHighlight = useCallback(
    (dragPayload, dropPayload) => {
      const intent = resolveDropIntent({
        dragPayload,
        dropPayload,
        boardSnapshot,
        actorPlayerId: playerId,
      });

      if (!intent.accepted || !intent.highlightTarget) {
        resetHighlights();
        return intent;
      }

      if (intent.highlightTarget.type === 'zone') {
        setHighlightedZoneId(intent.highlightTarget.zoneId);
        setHighlightedStackZoneId(null);
        return intent;
      }

      setHighlightedZoneId(null);
      setHighlightedStackZoneId(intent.highlightTarget.zoneId);
      return intent;
    },
    [boardSnapshot, playerId, resetHighlights]
  );

  const resolveDropStateFromEvent = useCallback(
    (event, dragPayload) => {
      const pointerInsideHandTray =
        shouldApplyHandTrayBlock(dragPayload) &&
        isDragBlockedBySelectors(
          event,
          HAND_TRAY_BLOCKED_SELECTORS,
          dragStartPointRef.current
        );

      const dropPayload = resolveDropPayloadForHandTray({
        dragPayload,
        dropPayload: getDropPayload(event),
        isPointerInsideHandTray: pointerInsideHandTray,
        playerId,
      });

      return {
        dropPayload,
        isBlockedByHandTray: pointerInsideHandTray && !isHandZoneDropPayload(dropPayload),
      };
    },
    [playerId]
  );

  const handleDragStart = useCallback((event) => {
    if (isInteractionLocked) {
      setActiveDragPayload(null);
      resetHighlights();
      return;
    }
    const dragPayload = getDragPayload(event);
    if (
      Number.isFinite(event?.activatorEvent?.clientX) &&
      Number.isFinite(event?.activatorEvent?.clientY)
    ) {
      dragStartPointRef.current = {
        x: event.activatorEvent.clientX,
        y: event.activatorEvent.clientY,
      };
    } else {
      dragStartPointRef.current = null;
    }
    onMutationMessage('');
    setActiveDragPayload(dragPayload);
  }, [isInteractionLocked, onMutationMessage, resetHighlights]);

  const handleDragOver = useCallback(
    (event) => {
      if (isInteractionLocked) {
        resetHighlights();
        return;
      }
      if (!activeDragPayload) {
        resetHighlights();
        return;
      }

      const { dropPayload, isBlockedByHandTray } = resolveDropStateFromEvent(
        event,
        activeDragPayload
      );
      if (isBlockedByHandTray) {
        resetHighlights();
        return;
      }
      resolveAndHighlight(activeDragPayload, dropPayload);
    },
    [
      activeDragPayload,
      isInteractionLocked,
      resetHighlights,
      resolveAndHighlight,
      resolveDropStateFromEvent,
    ]
  );

  const handleDragMove = useCallback(
    (event) => {
      if (isInteractionLocked) {
        resetHighlights();
        return;
      }
      if (!activeDragPayload) {
        resetHighlights();
        return;
      }

      const { dropPayload, isBlockedByHandTray } = resolveDropStateFromEvent(
        event,
        activeDragPayload
      );
      if (isBlockedByHandTray) {
        resetHighlights();
        return;
      }
      resolveAndHighlight(activeDragPayload, dropPayload);
    },
    [
      activeDragPayload,
      isInteractionLocked,
      resetHighlights,
      resolveAndHighlight,
      resolveDropStateFromEvent,
    ]
  );

  const handleDragCancel = useCallback(() => {
    dragStartPointRef.current = null;
    setActiveDragPayload(null);
    resetHighlights();
  }, [resetHighlights]);

  const handleDragEnd = useCallback(
    async (event) => {
      if (isInteractionLocked) {
        dragStartPointRef.current = null;
        setActiveDragPayload(null);
        resetHighlights();
        return;
      }
      const dragPayload = activeDragPayload || getDragPayload(event);
      const { dropPayload, isBlockedByHandTray } = resolveDropStateFromEvent(
        event,
        dragPayload
      );

      if (isBlockedByHandTray) {
        dragStartPointRef.current = null;
        setActiveDragPayload(null);
        resetHighlights();
        onMutationMessage('');
        return;
      }

      const intent = resolveAndHighlight(dragPayload, dropPayload);

      dragStartPointRef.current = null;
      setActiveDragPayload(null);
      resetHighlights();

      if (!intent.accepted || isMutating) {
        return;
      }

      const actorUid = getCurrentUid();
      if (!actorUid) {
        onMutationMessage('認証情報を取得できませんでした。ページを再読み込みしてください。');
        return;
      }

      if (!sessionId || !playerId) {
        onMutationMessage('セッション情報が不足しているため操作を確定できません。');
        return;
      }

      setIsMutating(true);
      try {
        await applyDropMutation({
          sessionId,
          playerId,
          actorUid,
          expectedRevision: Number.isFinite(sessionDoc?.revision) ? sessionDoc.revision : 0,
          intent,
        });
        onMutationMessage('');
      } catch (error) {
        if (isGameStateError(error, ERROR_CODES.REVISION_CONFLICT)) {
          onMutationMessage('他端末の更新と競合しました。最新状態に更新後、もう一度操作してください。');
        } else if (isGameStateError(error, ERROR_CODES.PERMISSION_DENIED)) {
          onMutationMessage('書き込み権限がありません。セッション参加状態を確認してください。');
        } else {
          onMutationMessage('操作の確定に失敗しました。再試行してください。');
        }
      } finally {
        setIsMutating(false);
      }
    },
    [
      activeDragPayload,
      isMutating,
      isInteractionLocked,
      onMutationMessage,
      playerId,
      resetHighlights,
      resolveAndHighlight,
      resolveDropStateFromEvent,
      sessionDoc?.revision,
      sessionId,
    ]
  );

  const isZoneHighlighted = useCallback(
    (zoneId) => highlightedZoneId === zoneId,
    [highlightedZoneId]
  );

  const isStackHighlighted = useCallback(
    (zoneId) => highlightedStackZoneId === zoneId,
    [highlightedStackZoneId]
  );

  return {
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
  };
}
