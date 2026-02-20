import { useCallback, useMemo, useRef, useState } from 'react';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { getCurrentUid } from '../../auth/authClient';
import { ERROR_CODES, isGameStateError } from '../../game-state/errors';
import { applyDropMutation } from './applyDropMutation';
import { DRAG_TYPES } from './constants';
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

      const isBlockedByHandTray =
        shouldApplyHandTrayBlock(activeDragPayload) &&
        isDragBlockedBySelectors(
          event,
          HAND_TRAY_BLOCKED_SELECTORS,
          dragStartPointRef.current
        );
      if (isBlockedByHandTray) {
        resetHighlights();
        return;
      }

      const dropPayload = getDropPayload(event);
      resolveAndHighlight(activeDragPayload, dropPayload);
    },
    [activeDragPayload, isInteractionLocked, resetHighlights, resolveAndHighlight]
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

      const isBlockedByHandTray =
        shouldApplyHandTrayBlock(activeDragPayload) &&
        isDragBlockedBySelectors(
          event,
          HAND_TRAY_BLOCKED_SELECTORS,
          dragStartPointRef.current
        );
      if (isBlockedByHandTray) {
        resetHighlights();
        return;
      }

      const dropPayload = getDropPayload(event);
      resolveAndHighlight(activeDragPayload, dropPayload);
    },
    [activeDragPayload, isInteractionLocked, resetHighlights, resolveAndHighlight]
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
      const dropPayload = getDropPayload(event);
      const isBlockedByHandTray =
        shouldApplyHandTrayBlock(dragPayload) &&
        isDragBlockedBySelectors(
          event,
          HAND_TRAY_BLOCKED_SELECTORS,
          dragStartPointRef.current
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
