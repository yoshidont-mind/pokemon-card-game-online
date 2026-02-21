import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { createPortal } from 'react-dom';
import {
  faArrowsUpDownLeftRight,
  faEdit,
  faMinus,
  faPlus,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import Pokemon from './Pokemon';
import HandTray from './HandTray';
import ToolboxPanel from './ToolboxPanel';
import OperationPanel from './operation/OperationPanel';
import DroppableZone from './dnd/DroppableZone';
import DroppableStack from './dnd/DroppableStack';
import DraggableCard from './dnd/DraggableCard';
import DraggableToolItem from './dnd/DraggableToolItem';
import BoardDragOverlay from './dnd/BoardDragOverlay';
import '../css/boardLayout.tokens.css';
import styles from '../css/playingField.module.css';
import { getCurrentUid } from '../auth/authClient';
import { ERROR_CODES, isGameStateError } from '../game-state/errors';
import { toPlayerKey } from '../game-state/migrateV1ToV2';
import { applyPrivateStateMutation } from '../game-state/privateStateMutation';
import { applySessionMutation } from '../game-state/transactionRunner';
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
  buildStackDragPayload,
  buildStackStatusBadgeDragPayload,
  buildStackDropPayload,
  buildZoneDropPayload,
} from '../interaction/dnd/buildDragPayload';
import { STACK_KINDS, ZONE_KINDS } from '../interaction/dnd/constants';
import { useBoardDnd } from '../interaction/dnd/useBoardDnd';

const CARD_BACK_IMAGE = '/card-back.jpg';
const COIN_FRONT_IMAGE = '/coin-front.png';
const COIN_BACK_IMAGE = '/coin-back.png';
const POPUP_CARD_HOVER_SCALE = 5;
const POPUP_CARD_BASE_SHIFT = Object.freeze({
  x: 0,
  y: -40,
});
const POPUP_CARD_VIEWPORT_MARGIN_PX = 6;
const SHUFFLE_NOTICE_AUTO_DISMISS_MS = 5000;
const DECK_INSERT_NOTICE_AUTO_DISMISS_MS = 5000;
const SHUFFLE_NOTICE_MESSAGES = new Set([
  '山札がシャッフルされました。',
  '相手プレイヤーの山札がシャッフルされました。',
]);
const DECK_INSERT_NOTICE_PATTERN = /^(?:相手が)?カードを山札の(?:上|下)に戻しました。$/;
const COIN_RESULT_LABEL = Object.freeze({
  heads: 'オモテ',
  tails: 'ウラ',
});
const BENCH_SLOTS = 5;
const MUTATION_NOTICE_TONE = Object.freeze({
  SUCCESS: 'success',
  ALERT: 'alert',
});
const ALERT_MESSAGE_PATTERN = /拒否|失敗|競合|権限|不足|できません|見つかりません|不正|invalid|error|denied|not found/i;
const NOTE_MAX_LENGTH = 120;
const FLOATING_PANEL_VIEWPORT_MARGIN_PX = 8;
const DECK_PEEK_POSITION_STORAGE_KEY = 'pcgo:deck-peek-position:v1';
const OPPONENT_COUNT_FLASH_MS = 2000;
const INTERACTION_GUIDE_MARGIN_PX = 8;
const INTERACTION_GUIDE_OVERLAP_PADDING_PX = 4;
const INTERACTION_GUIDE_SCAN_STEP_PX = 8;
const EMPTY_OBJECT = Object.freeze({});
const STATUS_BADGE_DEFINITIONS = Object.freeze([
  { id: 'poison', label: 'どく', stackKey: 'poisoned' },
  { id: 'burn', label: 'やけど', stackKey: 'burned' },
  { id: 'asleep', label: 'ねむり', stackKey: 'asleep' },
  { id: 'paralyzed', label: 'マヒ', stackKey: 'paralyzed' },
  { id: 'confused', label: 'こんらん', stackKey: 'confused' },
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asFiniteNumber(value) {
  return Number.isFinite(value) ? value : null;
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

function toRevealRequestCards(cardIds, cardCatalog = {}) {
  return asArray(cardIds)
    .map((cardId, index) => ({
      cardId: cardId || `revealed-card-${index + 1}`,
      imageUrl: cardCatalog?.[cardId]?.imageUrl || null,
    }))
    .filter((entry) => Boolean(entry.cardId));
}

function toStackCards(stack, cardCatalog = {}) {
  const cardIds = asArray(stack?.cardIds).filter(Boolean);
  return [...cardIds]
    .reverse()
    .map((cardId) => ({
      cardId,
      imageUrl: cardCatalog?.[cardId]?.imageUrl || null,
    }));
}

function toZoneCards(cardRefs, cardCatalog = {}) {
  return [...asArray(cardRefs)]
    .reverse()
    .map((ref, index) => {
      const cardId = ref?.cardId || `zone-card-${index + 1}`;
      const imageUrl = resolveCardImageUrl(ref, cardCatalog);
      return {
        cardId,
        imageUrl,
      };
    })
    .filter((entry) => Boolean(entry.cardId));
}

function resolveStackFromBoard(board, stackKind, benchIndex = null) {
  if (stackKind === STACK_KINDS.ACTIVE) {
    return board?.active || null;
  }
  if (stackKind === STACK_KINDS.BENCH) {
    const slots = asArray(board?.bench);
    return slots[benchIndex] || null;
  }
  return null;
}

function countCardsInStack(board, stackKind, benchIndex = null) {
  const stack = resolveStackFromBoard(board, stackKind, benchIndex);
  return asArray(stack?.cardIds).length;
}

function resolveStackStatusBadges(stack) {
  return STATUS_BADGE_DEFINITIONS.filter((entry) => Boolean(stack?.specialConditions?.[entry.stackKey]));
}

function formatStackModalTitle({ ownerLabel, stackKind, benchIndex, cardCount }) {
  const locationLabel =
    stackKind === STACK_KINDS.ACTIVE
      ? `バトル場（${ownerLabel}）`
      : `ベンチ${Number(benchIndex) + 1}（${ownerLabel}）`;
  return `${locationLabel}を展開（${cardCount}枚）`;
}

function formatZoneModalTitle({ ownerLabel, zoneKind, cardCount }) {
  const zoneLabel = zoneKind === ZONE_KINDS.LOST ? 'ロスト' : 'トラッシュ';
  return `${zoneLabel}（${ownerLabel}）を展開（${cardCount}枚）`;
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
  countOverlayClassName = '',
}) {
  const refs = asArray(cardRefs);
  const topCardRef = refs.length > 0 ? refs[refs.length - 1] : null;
  const topCardImageUrl = resolveCardImageUrl(topCardRef, cardCatalog);

  return (
    <div className={styles.publicPilePreview}>
      {topCardImageUrl ? (
        <div className={styles.pileCardFrame}>
          <img
            src={topCardImageUrl}
            alt={`${pileLabel}上のカード`}
            className={styles.publicPileTopCard}
          />
          <CardCountOverlay count={refs.length} className={countOverlayClassName} />
        </div>
      ) : null}
    </div>
  );
}

function joinClassNames(...classNames) {
  return classNames.filter(Boolean).join(' ');
}

function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toLocalRect(rect, baseRect) {
  if (!rect || !baseRect) {
    return null;
  }
  return {
    left: rect.left - baseRect.left,
    top: rect.top - baseRect.top,
    right: rect.right - baseRect.left,
    bottom: rect.bottom - baseRect.top,
  };
}

function doRectsOverlap(a, b, padding = 0) {
  if (!a || !b) {
    return false;
  }
  return !(
    a.right <= b.left - padding ||
    a.left >= b.right + padding ||
    a.bottom <= b.top - padding ||
    a.top >= b.bottom + padding
  );
}

function resolveInteractionGuidePosition({ boardNode, guideNode }) {
  if (!boardNode || !guideNode) {
    return null;
  }

  const boardRect = boardNode.getBoundingClientRect();
  const guideRect = guideNode.getBoundingClientRect();
  if (!Number.isFinite(boardRect.width) || !Number.isFinite(boardRect.height)) {
    return null;
  }
  if (!Number.isFinite(guideRect.width) || !Number.isFinite(guideRect.height)) {
    return null;
  }

  const panelWidth = Math.max(1, guideRect.width);
  const panelHeight = Math.max(1, guideRect.height);
  const minX = INTERACTION_GUIDE_MARGIN_PX;
  const minY = INTERACTION_GUIDE_MARGIN_PX;
  const maxX = Math.max(minX, boardRect.width - panelWidth - INTERACTION_GUIDE_MARGIN_PX);
  const maxY = Math.max(minY, boardRect.height - panelHeight - INTERACTION_GUIDE_MARGIN_PX);

  let preferredX = clampValue(boardRect.width * 0.68 - panelWidth / 2, minX, maxX);
  let preferredY = clampValue(boardRect.height * 0.5 - panelHeight / 2, minY, maxY);

  const playerRevealNode = boardNode.querySelector('[data-zone="player-reveal"]');
  const playerBench4Node = boardNode.querySelector('[data-zone="player-bench-4"]');
  const playerBench5Node = boardNode.querySelector('[data-zone="player-bench-5"]');
  if (playerRevealNode && playerBench4Node && playerBench5Node) {
    const revealRect = toLocalRect(playerRevealNode.getBoundingClientRect(), boardRect);
    const bench4Rect = toLocalRect(playerBench4Node.getBoundingClientRect(), boardRect);
    const bench5Rect = toLocalRect(playerBench5Node.getBoundingClientRect(), boardRect);
    if (revealRect && bench4Rect && bench5Rect) {
      const benchCenterX =
        (bench4Rect.left + bench4Rect.right + bench5Rect.left + bench5Rect.right) / 4;
      preferredX = clampValue(benchCenterX - panelWidth / 2, minX, maxX);

      const upperBound = revealRect.bottom + INTERACTION_GUIDE_MARGIN_PX;
      const lowerBound =
        Math.min(bench4Rect.top, bench5Rect.top) - panelHeight - INTERACTION_GUIDE_MARGIN_PX;
      if (lowerBound >= upperBound) {
        preferredY = clampValue((upperBound + lowerBound) / 2, minY, maxY);
      } else {
        preferredY = clampValue(upperBound, minY, maxY);
      }
    }
  }

  const obstacleSelector = [
    `.${styles.zoneTile}`,
    `.${styles.activeZone}`,
    `.${styles.benchSlot}`,
    `.${styles.centerZone}`,
  ].join(', ');
  const obstacles = Array.from(boardNode.querySelectorAll(obstacleSelector))
    .map((node) => toLocalRect(node.getBoundingClientRect(), boardRect))
    .filter(Boolean);

  let bestCandidate = null;
  for (let y = minY; y <= maxY; y += INTERACTION_GUIDE_SCAN_STEP_PX) {
    for (let x = minX; x <= maxX; x += INTERACTION_GUIDE_SCAN_STEP_PX) {
      const candidate = {
        left: x,
        top: y,
        right: x + panelWidth,
        bottom: y + panelHeight,
      };
      const hasOverlap = obstacles.some((obstacle) =>
        doRectsOverlap(candidate, obstacle, INTERACTION_GUIDE_OVERLAP_PADDING_PX)
      );
      if (hasOverlap) {
        continue;
      }

      const score = Math.abs(x - preferredX) + Math.abs(y - preferredY);
      if (!bestCandidate || score < bestCandidate.score) {
        bestCandidate = { x, y, score };
      }
    }
  }

  if (!bestCandidate) {
    return {
      left: Math.round(preferredX),
      top: Math.round(preferredY),
    };
  }

  return {
    left: Math.round(bestCandidate.x),
    top: Math.round(bestCandidate.y),
  };
}

function clampPositiveInt(value, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  const boundedMax = Math.max(1, Number(max) || 1);
  return clampValue(Math.round(numeric), 1, boundedMax);
}

function clampFloatingPanelPosition({ x, y, width, height }) {
  if (typeof window === 'undefined') {
    return { x, y };
  }

  const maxX = Math.max(
    FLOATING_PANEL_VIEWPORT_MARGIN_PX,
    window.innerWidth - width - FLOATING_PANEL_VIEWPORT_MARGIN_PX
  );
  const maxY = Math.max(
    FLOATING_PANEL_VIEWPORT_MARGIN_PX,
    window.innerHeight - height - FLOATING_PANEL_VIEWPORT_MARGIN_PX
  );

  return {
    x: clampValue(x, FLOATING_PANEL_VIEWPORT_MARGIN_PX, maxX),
    y: clampValue(y, FLOATING_PANEL_VIEWPORT_MARGIN_PX, maxY),
  };
}

function readStoredPosition(storageKey) {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    const x = asFiniteNumber(parsed?.x);
    const y = asFiniteNumber(parsed?.y);
    if (x === null || y === null) {
      return null;
    }
    return { x, y };
  } catch (_error) {
    return null;
  }
}

function writeStoredPosition(storageKey, position) {
  if (typeof window === 'undefined' || !position) {
    return;
  }
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(position));
  } catch (_error) {
    // no-op
  }
}

function clearStoredPosition(storageKey) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.removeItem(storageKey);
  } catch (_error) {
    // no-op
  }
}

function normalizeNoteText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.slice(0, NOTE_MAX_LENGTH).trim();
}

function toSharedNotes(publicState) {
  return asArray(publicState?.sharedNotes)
    .map((note, index) => {
      const noteId =
        typeof note?.noteId === 'string' && note.noteId.trim()
          ? note.noteId.trim()
          : `shared-note-${index + 1}`;
      const text = typeof note?.text === 'string' ? note.text : '';
      return {
        noteId,
        text,
        createdBy: typeof note?.createdBy === 'string' ? note.createdBy : '',
        createdAt: typeof note?.createdAt === 'string' ? note.createdAt : '',
        updatedBy: typeof note?.updatedBy === 'string' ? note.updatedBy : '',
        updatedAt: typeof note?.updatedAt === 'string' ? note.updatedAt : '',
      };
    })
    .filter((note) => note.text.trim() !== '');
}

function normalizeMutationNoticeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function detectMutationNoticeTone(message) {
  const normalizedMessage = normalizeMutationNoticeText(message);
  if (!normalizedMessage) {
    return MUTATION_NOTICE_TONE.SUCCESS;
  }
  return ALERT_MESSAGE_PATTERN.test(normalizedMessage)
    ? MUTATION_NOTICE_TONE.ALERT
    : MUTATION_NOTICE_TONE.SUCCESS;
}

function resolvePopupCardHoverShift({
  cardRect,
  viewportWidth,
  viewportHeight,
  scale = POPUP_CARD_HOVER_SCALE,
}) {
  if (
    !cardRect ||
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight)
  ) {
    return { ...POPUP_CARD_BASE_SHIFT };
  }

  const originX = cardRect.left + cardRect.width / 2;
  const originY = cardRect.bottom;

  const scaledLeft = originX + (cardRect.left - originX) * scale;
  const scaledRight = originX + (cardRect.right - originX) * scale;
  const scaledTop = originY + (cardRect.top - originY) * scale;
  const scaledBottom = originY + (cardRect.bottom - originY) * scale;

  const minShiftX = POPUP_CARD_VIEWPORT_MARGIN_PX - scaledLeft;
  const maxShiftX = viewportWidth - POPUP_CARD_VIEWPORT_MARGIN_PX - scaledRight;
  const minShiftY = POPUP_CARD_VIEWPORT_MARGIN_PX - scaledTop;
  const maxShiftY = viewportHeight - POPUP_CARD_VIEWPORT_MARGIN_PX - scaledBottom;

  const resolvedX =
    minShiftX <= maxShiftX
      ? clampValue(POPUP_CARD_BASE_SHIFT.x, minShiftX, maxShiftX)
      : (minShiftX + maxShiftX) / 2;
  const resolvedY =
    minShiftY <= maxShiftY
      ? clampValue(POPUP_CARD_BASE_SHIFT.y, minShiftY, maxShiftY)
      : (minShiftY + maxShiftY) / 2;

  return {
    x: Math.round(resolvedX),
    y: Math.round(resolvedY),
  };
}

function resolvePopupPreviewPlacement({
  buttonRect,
  viewportWidth,
  viewportHeight,
  scale = POPUP_CARD_HOVER_SCALE,
  margin = POPUP_CARD_VIEWPORT_MARGIN_PX,
}) {
  if (
    !buttonRect ||
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight)
  ) {
    return null;
  }

  const previewWidth = buttonRect.width * scale;
  const previewHeight = buttonRect.height * scale;

  let x =
    buttonRect.left +
    (buttonRect.width - previewWidth) / 2 +
    (Number(POPUP_CARD_BASE_SHIFT.x) || 0);
  let y =
    buttonRect.bottom -
    previewHeight +
    (Number(POPUP_CARD_BASE_SHIFT.y) || 0);

  const maxX = Math.max(margin, viewportWidth - previewWidth - margin);
  const maxY = Math.max(margin, viewportHeight - previewHeight - margin);

  x = clampValue(x, margin, maxX);
  y = clampValue(y, margin, maxY);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(previewWidth),
  };
}

function resolveStackCardHoverShift({
  containerNode,
  viewportWidth,
  viewportHeight,
  scale = POPUP_CARD_HOVER_SCALE,
}) {
  if (
    !containerNode ||
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight)
  ) {
    return { ...POPUP_CARD_BASE_SHIFT };
  }

  const imageNode = containerNode.querySelector('.pokemon-image:last-child');
  const anchorRect = imageNode?.getBoundingClientRect?.() || containerNode.getBoundingClientRect();
  return resolvePopupCardHoverShift({
    cardRect: anchorRect,
    viewportWidth,
    viewportHeight,
    scale,
  });
}

function PopupHoverPreview({ preview }) {
  if (!preview || typeof document === 'undefined') {
    return null;
  }
  return createPortal(
    <div
      className={styles.popupHoverPreview}
      style={{
        left: `${preview.x}px`,
        top: `${preview.y}px`,
        width: `${preview.width}px`,
      }}
      aria-hidden
    >
      <img
        src={preview.imageUrl}
        alt={preview.alt}
        className={styles.popupHoverPreviewImage}
      />
    </div>,
    document.body
  );
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

  if (request.requestType === 'opponent-discard-selected-hand') {
    const selectedCount = Math.max(
      asArray(request?.payload?.cardIds).filter(Boolean).length,
      request?.payload?.cardId ? 1 : 0
    );
    return `指定された手札 ${selectedCount || 1} 枚をトラッシュしてよいか確認されています。`;
  }

  return '相手から操作の承認が必要です。';
}

function resolveMutationNoticeTimeoutMs(message) {
  if (typeof message !== 'string' || message.trim() === '') {
    return null;
  }
  if (SHUFFLE_NOTICE_MESSAGES.has(message)) {
    return SHUFFLE_NOTICE_AUTO_DISMISS_MS;
  }
  if (DECK_INSERT_NOTICE_PATTERN.test(message)) {
    return DECK_INSERT_NOTICE_AUTO_DISMISS_MS;
  }
  return null;
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

function DeckPile({ count, alt, onActivate = null, countOverlayClassName = '' }) {
  const normalizedCount = Math.max(0, Number(count) || 0);
  const isInteractive = typeof onActivate === 'function' && normalizedCount > 0;
  const handleKeyDown = (event) => {
    if (!isInteractive) {
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    onActivate();
  };
  return (
    <div
      className={joinClassNames(styles.deckPile, isInteractive ? styles.deckPileInteractive : '')}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={isInteractive ? '山札を閲覧する' : undefined}
      onClick={isInteractive ? onActivate : undefined}
      onKeyDown={handleKeyDown}
    >
      {normalizedCount > 0 ? (
        <div className={styles.pileCardFrame}>
          <img src={CARD_BACK_IMAGE} alt={alt} className={styles.deckCardBack} />
          <CardCountOverlay count={normalizedCount} className={countOverlayClassName} />
        </div>
      ) : null}
    </div>
  );
}

function CardCountOverlay({ count, className = '' }) {
  const normalizedCount = Math.max(0, Number(count) || 0);
  if (normalizedCount <= 0) {
    return null;
  }

  return (
    <span className={joinClassNames(styles.pileCountOverlay, className)}>
      {normalizedCount} 枚
    </span>
  );
}

function PrizeFan({ count = 0, countOverlayClassName = '' }) {
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
      <CardCountOverlay
        count={normalizedCount}
        className={joinClassNames(styles.prizeFanCountOverlay, countOverlayClassName)}
      />
    </div>
  );
}

function BenchRow({
  owner,
  ownerPlayerId,
  bench,
  cardCatalog,
  allowCardDrop,
  shouldShowStackInsertTargets,
  isDraggingStackSwapCandidate,
  isZoneHighlighted,
  isStackHighlighted,
  isStackModalForZone,
  onToggleStackCards,
  onOpenStackAdjustPopover,
}) {
  const slots = Array.from({ length: BENCH_SLOTS }, (_, index) => bench[index] || null);
  const isOpponentRow = owner === 'opponent';
  const singleHoverSurfaceRefs = useRef({});
  const [singleHoverIndex, setSingleHoverIndex] = useState(null);
  const [singleHoverShift, setSingleHoverShift] = useState(() => ({
    ...POPUP_CARD_BASE_SHIFT,
  }));

  const clearSingleHover = useCallback(() => {
    setSingleHoverIndex(null);
    setSingleHoverShift((previous) => {
      if (
        previous.x === POPUP_CARD_BASE_SHIFT.x &&
        previous.y === POPUP_CARD_BASE_SHIFT.y
      ) {
        return previous;
      }
      return { ...POPUP_CARD_BASE_SHIFT };
    });
  }, []);

  const activateSingleHover = useCallback(
    (index, containerNode) => {
      if (!isOpponentRow || typeof window === 'undefined' || !containerNode) {
        clearSingleHover();
        return;
      }
      const next = resolveStackCardHoverShift({
        containerNode,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      setSingleHoverIndex(index);
      setSingleHoverShift((previous) => {
        if (previous.x === next.x && previous.y === next.y) {
          return previous;
        }
        return next;
      });
    },
    [clearSingleHover, isOpponentRow]
  );

  useEffect(() => {
    if (singleHoverIndex === null) {
      return;
    }
    const activeStack = slots[singleHoverIndex];
    if (asArray(activeStack?.cardIds).length !== 1) {
      clearSingleHover();
    }
  }, [clearSingleHover, singleHoverIndex, slots]);

  useEffect(() => {
    if (!isOpponentRow && singleHoverIndex !== null) {
      clearSingleHover();
    }
  }, [clearSingleHover, isOpponentRow, singleHoverIndex]);

  useEffect(() => {
    if (!isOpponentRow || singleHoverIndex === null || typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => {
      const node = singleHoverSurfaceRefs.current[singleHoverIndex];
      if (!node) {
        return;
      }
      const next = resolveStackCardHoverShift({
        containerNode: node,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      setSingleHoverShift((previous) => {
        if (previous.x === next.x && previous.y === next.y) {
          return previous;
        }
        return next;
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpponentRow, singleHoverIndex]);

  return (
    <div className={styles.benchRow} data-zone={`${owner}-bench`} data-drop-group="bench">
      {slots.map((stack, index) => {
        const zoneId = `${owner}-bench-${index + 1}`;
        const stackId = resolveStackId(stack, `s_${ownerPlayerId}_bench_${index + 1}`);
        const zoneDropPayload = allowCardDrop && (!stack || isDraggingStackSwapCandidate)
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
        const stackInsertBottomZoneId = `${zoneId}-insert-bottom`;
        const stackInsertTopZoneId = `${zoneId}-insert-top`;
        const stackInsertBottomDropPayload = allowCardDrop
          ? buildZoneDropPayload({
              zoneId: stackInsertBottomZoneId,
              targetPlayerId: ownerPlayerId,
              zoneKind: ZONE_KINDS.BENCH,
              benchIndex: index,
              edge: 'bottom',
            })
          : null;
        const stackInsertTopDropPayload = allowCardDrop
          ? buildZoneDropPayload({
              zoneId: stackInsertTopZoneId,
              targetPlayerId: ownerPlayerId,
              zoneKind: ZONE_KINDS.BENCH,
              benchIndex: index,
              edge: 'top',
            })
          : null;
        const cardCount = asArray(stack?.cardIds).length;
        const canExpandStack = cardCount > 1;
        const shouldUseViewportAwareHover = isOpponentRow && cardCount === 1;
        const isSingleHoverActive = shouldUseViewportAwareHover && singleHoverIndex === index;
        const hoverableClassName = cardCount === 1 ? styles.stackDropSurfaceHoverable : '';
        const ownerLabel = owner === 'player' ? '自分' : '相手';
        const canDragSingleCard = allowCardDrop && cardCount === 1;
        const singleCardId = canDragSingleCard ? asArray(stack?.cardIds)[0] : null;
        const canDragStackGroup = allowCardDrop && cardCount > 1;
        const topCardId = cardCount > 0 ? asArray(stack?.cardIds)[cardCount - 1] : '';
        const stackGroupDragPayload = canDragStackGroup
          ? buildStackDragPayload({
              sourceZone: 'player-stack',
              sourceStackKind: STACK_KINDS.BENCH,
              sourceBenchIndex: index,
              previewCardId: topCardId,
              previewCardIds: asArray(stack?.cardIds),
            })
          : null;
        const isStackExpanded = canExpandStack
          ? isStackModalForZone({
              ownerPlayerId,
              stackKind: STACK_KINDS.BENCH,
              benchIndex: index,
            })
          : false;
        const stackToggleAriaLabel = isStackExpanded
          ? `${ownerLabel}ベンチ${index + 1}の展開を閉じる`
          : `${ownerLabel}ベンチ${index + 1}を展開`;

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
                <div
                  ref={(node) => {
                    if (!shouldUseViewportAwareHover) {
                      delete singleHoverSurfaceRefs.current[index];
                      return;
                    }
                    if (node) {
                      singleHoverSurfaceRefs.current[index] = node;
                    } else {
                      delete singleHoverSurfaceRefs.current[index];
                    }
                  }}
                  className={joinClassNames(styles.stackDropSurfaceInner, hoverableClassName)}
                  style={
                    isSingleHoverActive
                      ? {
                          '--stack-hover-shift-x': `${singleHoverShift.x}px`,
                          '--stack-hover-shift-y': `${singleHoverShift.y}px`,
                        }
                      : undefined
                  }
                  role={canExpandStack ? 'button' : undefined}
                  tabIndex={canExpandStack ? 0 : undefined}
                  aria-label={canExpandStack ? stackToggleAriaLabel : undefined}
                  onMouseEnter={(event) => {
                    if (!shouldUseViewportAwareHover) {
                      return;
                    }
                    activateSingleHover(index, event.currentTarget);
                  }}
                  onMouseLeave={() => {
                    if (!shouldUseViewportAwareHover) {
                      return;
                    }
                    clearSingleHover();
                  }}
                  onClick={(event) => {
                    if (!canExpandStack) {
                      return;
                    }
                    if (event.target instanceof Element && event.target.closest('button')) {
                      return;
                    }
                    onToggleStackCards({
                      ownerPlayerId,
                      ownerLabel,
                      stackKind: STACK_KINDS.BENCH,
                      benchIndex: index,
                      sourceZoneId: `${zoneId}-stack`,
                    });
                  }}
                  onKeyDown={(event) => {
                    if (!canExpandStack) {
                      return;
                    }
                    if (event.key !== 'Enter' && event.key !== ' ') {
                      return;
                    }
                    event.preventDefault();
                    onToggleStackCards({
                      ownerPlayerId,
                      ownerLabel,
                      stackKind: STACK_KINDS.BENCH,
                      benchIndex: index,
                      sourceZoneId: `${zoneId}-stack`,
                    });
                  }}
                  onDoubleClick={(event) => {
                    if (typeof onOpenStackAdjustPopover !== 'function') {
                      return;
                    }
                    if (event.target instanceof Element && event.target.closest('button')) {
                      return;
                    }
                    onOpenStackAdjustPopover({
                      targetPlayerId: ownerPlayerId,
                      stackKind: STACK_KINDS.BENCH,
                      benchIndex: index,
                      anchorRect: event.currentTarget.getBoundingClientRect(),
                    });
                  }}
                >
                  {allowCardDrop && shouldShowStackInsertTargets ? (
                    <div className={styles.stackInsertTargets}>
                      <DroppableZone
                        dropId={`zone-${stackInsertTopZoneId}`}
                        dropPayload={stackInsertTopDropPayload}
                        className={joinClassNames(
                          styles.stackInsertTarget,
                          styles.stackInsertTargetTop
                        )}
                        activeClassName={styles.stackInsertTargetTopActive}
                        isHighlighted={isZoneHighlighted(stackInsertTopZoneId)}
                      >
                        <span className={styles.deckInsertLabel}>上に重ねる</span>
                      </DroppableZone>
                      <DroppableZone
                        dropId={`zone-${stackInsertBottomZoneId}`}
                        dropPayload={stackInsertBottomDropPayload}
                        className={joinClassNames(
                          styles.stackInsertTarget,
                          styles.stackInsertTargetBottom
                        )}
                        activeClassName={styles.stackInsertTargetBottomActive}
                        isHighlighted={isZoneHighlighted(stackInsertBottomZoneId)}
                      >
                        <span className={styles.deckInsertLabel}>下に重ねる</span>
                      </DroppableZone>
                    </div>
                  ) : null}
                  {canDragSingleCard && singleCardId ? (
                    <DraggableCard
                      dragId={`stack-single-${stackId}-${singleCardId}`}
                      dragPayload={buildCardDragPayload({
                        cardId: singleCardId,
                        sourceZone: 'player-stack',
                        sourceStackKind: STACK_KINDS.BENCH,
                        sourceBenchIndex: index,
                      })}
                      className={joinClassNames(styles.stackSingleCardDraggable, hoverableClassName)}
                      draggingClassName={styles.draggingSource}
                    >
                      <div className={styles.stackSingleCardButton}>
                        <Pokemon {...toPokemonProps(stack, cardCatalog)} />
                      </div>
                    </DraggableCard>
                  ) : canDragStackGroup && stackGroupDragPayload ? (
                    <DraggableCard
                      dragId={`stack-group-${stackId}`}
                      dragPayload={stackGroupDragPayload}
                      className={styles.stackGroupDraggable}
                      draggingClassName={styles.draggingSource}
                    >
                      <Pokemon {...toPokemonProps(stack, cardCatalog)} />
                    </DraggableCard>
                  ) : (
                    <Pokemon {...toPokemonProps(stack, cardCatalog)} />
                  )}
                </div>
              </DroppableStack>
            ) : (
              <span className={styles.benchPlaceholder}>ベンチ{index + 1}</span>
            )}
          </DroppableZone>
        );
      })}
    </div>
  );
}

function DeckPeekModal({
  cards,
  onClose,
  onRevealOneMore,
  canRevealOneMore,
}) {
  const normalizedCards = asArray(cards).filter((entry) => Boolean(entry?.cardId));
  const deckPeekColumnCount = Math.max(1, Math.min(10, normalizedCards.length || 1));
  const [activeIndex, setActiveIndex] = useState(null);
  const [hoverPreview, setHoverPreview] = useState(null);
  const [modalPosition, setModalPosition] = useState(() => readStoredPosition(DECK_PEEK_POSITION_STORAGE_KEY));
  const [isModalDragging, setIsModalDragging] = useState(false);
  const cardButtonRefs = useRef({});
  const modalRootRef = useRef(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const dragSizeRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    if (!normalizedCards[activeIndex]) {
      setActiveIndex(null);
      setHoverPreview(null);
    }
  }, [activeIndex, normalizedCards]);

  const updateHoverPreviewForIndex = useCallback((index) => {
    if (index === null || typeof window === 'undefined') {
      setHoverPreview(null);
      return;
    }

    const buttonNode = cardButtonRefs.current[index];
    const card = normalizedCards[index];
    if (!buttonNode) {
      setHoverPreview(null);
      return;
    }
    if (!card?.imageUrl) {
      setHoverPreview(null);
      return;
    }

    const placement = resolvePopupPreviewPlacement({
      buttonRect: buttonNode.getBoundingClientRect(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scale: POPUP_CARD_HOVER_SCALE,
    });
    if (!placement) {
      setHoverPreview(null);
      return;
    }
    setHoverPreview({
      key: `${card.cardId || 'deck-peek'}-${index}`,
      imageUrl: card.imageUrl,
      alt: `山札閲覧カード ${index + 1}`,
      x: placement.x,
      y: placement.y,
      width: placement.width,
    });
  }, [normalizedCards]);

  const activatePopupCard = useCallback((index, node) => {
    setActiveIndex(index);
    if (!node || typeof window === 'undefined') {
      setHoverPreview(null);
      return;
    }
    const card = normalizedCards[index];
    if (!card?.imageUrl) {
      setHoverPreview(null);
      return;
    }
    const placement = resolvePopupPreviewPlacement({
      buttonRect: node.getBoundingClientRect(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scale: POPUP_CARD_HOVER_SCALE,
    });
    if (!placement) {
      setHoverPreview(null);
      return;
    }
    setHoverPreview({
      key: `${card.cardId || 'deck-peek'}-${index}`,
      imageUrl: card.imageUrl,
      alt: `山札閲覧カード ${index + 1}`,
      x: placement.x,
      y: placement.y,
      width: placement.width,
    });
  }, [normalizedCards]);

  const deactivatePopupCard = useCallback((index) => {
    setActiveIndex((previous) => (previous === index ? null : previous));
    setHoverPreview((previous) => {
      if (!previous) {
        return previous;
      }
      return previous.key.endsWith(`-${index}`) ? null : previous;
    });
  }, []);

  useEffect(() => {
    if (activeIndex === null) {
      setHoverPreview(null);
      return;
    }
    updateHoverPreviewForIndex(activeIndex);
  }, [activeIndex, modalPosition, normalizedCards, updateHoverPreviewForIndex]);

  useEffect(() => {
    if (typeof window === 'undefined' || activeIndex === null) {
      return undefined;
    }

    const handleResize = () => {
      updateHoverPreviewForIndex(activeIndex);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeIndex, updateHoverPreviewForIndex]);

  useEffect(() => {
    if (!modalPosition) {
      return;
    }
    writeStoredPosition(DECK_PEEK_POSITION_STORAGE_KEY, modalPosition);
  }, [modalPosition]);

  useEffect(() => {
    if (!modalPosition || typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => {
      const rootNode = modalRootRef.current;
      if (!rootNode) {
        return;
      }
      const rect = rootNode.getBoundingClientRect();
      const next = clampFloatingPanelPosition({
        x: modalPosition.x,
        y: modalPosition.y,
        width: rect.width,
        height: rect.height,
      });
      if (next.x !== modalPosition.x || next.y !== modalPosition.y) {
        setModalPosition(next);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [modalPosition]);

  useEffect(() => {
    if (!isModalDragging || typeof window === 'undefined') {
      return undefined;
    }

    const handlePointerMove = (event) => {
      const next = clampFloatingPanelPosition({
        x: event.clientX - dragOffsetRef.current.x,
        y: event.clientY - dragOffsetRef.current.y,
        width: dragSizeRef.current.width,
        height: dragSizeRef.current.height,
      });
      setModalPosition((previous) => {
        if (previous && previous.x === next.x && previous.y === next.y) {
          return previous;
        }
        return next;
      });
    };

    const stopDragging = () => {
      setIsModalDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [isModalDragging]);

  function handleModalDragStart(event) {
    if (event.button !== 0 || event.isPrimary === false) {
      return;
    }
    const rootNode = modalRootRef.current;
    if (!rootNode) {
      return;
    }

    const rect = rootNode.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    dragSizeRef.current = {
      width: rect.width,
      height: rect.height,
    };

    const initialPosition = {
      x: rect.left,
      y: rect.top,
    };
    setModalPosition((previous) => previous || initialPosition);
    setIsModalDragging(true);
    event.preventDefault();
  }

  function handleModalPositionReset() {
    setModalPosition(null);
    setIsModalDragging(false);
    clearStoredPosition(DECK_PEEK_POSITION_STORAGE_KEY);
  }

  const deckPeekRootStyle = useMemo(() => {
    if (!modalPosition) {
      return undefined;
    }
    return {
      left: `${modalPosition.x}px`,
      top: `${modalPosition.y}px`,
      bottom: 'auto',
      transform: 'none',
    };
  }, [modalPosition]);

  return (
    <aside
      ref={modalRootRef}
      className={styles.deckPeekRoot}
      data-zone="deck-peek-root"
      aria-label="山札閲覧モーダル"
      style={deckPeekRootStyle}
    >
      <div className={styles.deckPeekToolbar}>
        <button
          type="button"
          className={joinClassNames(
            styles.deckPeekToolbarButton,
            styles.deckPeekHandle,
            isModalDragging ? styles.deckPeekHandleActive : ''
          )}
          onPointerDown={handleModalDragStart}
          aria-label="山札閲覧モーダルをドラッグして移動"
          title="山札閲覧モーダルを移動"
        >
          <FontAwesomeIcon icon={faArrowsUpDownLeftRight} />
        </button>
        {modalPosition ? (
          <button
            type="button"
            className={styles.deckPeekToolbarButton}
            onClick={handleModalPositionReset}
          >
            位置をリセット
          </button>
        ) : null}
        <button
          type="button"
          className={styles.deckPeekToolbarButton}
          onClick={onRevealOneMore}
          disabled={!canRevealOneMore}
        >
          もう一枚閲覧
        </button>
        <button
          type="button"
          className={styles.deckPeekToolbarButton}
          onClick={onClose}
        >
          山札に戻す
        </button>
      </div>
      <div
        className={styles.deckPeekCard}
        style={{ '--deck-peek-columns': String(deckPeekColumnCount) }}
      >
        <p className={styles.requestBlockingTitle}>山札を閲覧中（{normalizedCards.length}枚）</p>
        <div className={styles.deckPeekCards} data-zone="deck-peek-cards-grid">
          {normalizedCards.length > 0 ? (
            normalizedCards.map((card, index) => {
              const isActive = activeIndex === index;
              return (
                <DraggableCard
                  key={`deck-peek-card-${card.cardId}-${index}`}
                  dragId={`deck-peek-card-${card.cardId}-${index}`}
                  dragPayload={buildCardDragPayload({
                    cardId: card.cardId,
                    sourceZone: 'player-deck-peek',
                  })}
                  className={joinClassNames(
                    styles.revealCardDraggable,
                    styles.popupCardItem,
                    isActive ? styles.popupCardItemActive : ''
                  )}
                  draggingClassName={styles.draggingSource}
                >
                  {card.imageUrl ? (
                    <button
                      ref={(node) => {
                        if (node) {
                          cardButtonRefs.current[index] = node;
                        } else {
                          delete cardButtonRefs.current[index];
                        }
                      }}
                      type="button"
                      className={joinClassNames(
                        styles.popupCardButton,
                        styles.modalPopupCardButton,
                        isActive ? styles.popupCardButtonActive : ''
                      )}
                      aria-label={`山札閲覧カード ${index + 1} を拡大表示`}
                      onMouseEnter={(event) => activatePopupCard(index, event.currentTarget)}
                      onMouseLeave={() => deactivatePopupCard(index)}
                      onFocus={(event) => activatePopupCard(index, event.currentTarget)}
                      onBlur={() => deactivatePopupCard(index)}
                    >
                      <img
                        src={card.imageUrl}
                        alt={`山札閲覧カード ${index + 1}`}
                        className={joinClassNames(styles.revealCardImage, styles.popupCardImage)}
                      />
                    </button>
                  ) : (
                    <div className={styles.opponentRevealCardFallback}>{card.cardId}</div>
                  )}
                </DraggableCard>
              );
            })
          ) : (
            <p className={styles.requestBlockingMeta}>閲覧中のカードはありません。</p>
          )}
        </div>
      </div>
      <PopupHoverPreview preview={hoverPreview} />
    </aside>
  );
}

function StackCardsModal({
  title,
  cards,
  onClose,
  allowCardDrag = false,
  dragSourceZone = 'player-stack',
  sourceStackKind = STACK_KINDS.ACTIVE,
  sourceBenchIndex = null,
  initialAnchorRect = null,
  modalAriaLabel = 'スタック展開モーダル',
  modalDataZone = 'stack-cards-root',
}) {
  const normalizedCards = asArray(cards).filter((entry) => Boolean(entry?.cardId));
  const columnCount = Math.max(1, Math.min(10, normalizedCards.length || 1));
  const [activeIndex, setActiveIndex] = useState(null);
  const [hoverPreview, setHoverPreview] = useState(null);
  const [modalPosition, setModalPosition] = useState(null);
  const [isModalDragging, setIsModalDragging] = useState(false);
  const cardButtonRefs = useRef({});
  const modalRootRef = useRef(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const dragSizeRef = useRef({ width: 0, height: 0 });
  const hasManuallyMovedRef = useRef(false);

  useEffect(() => {
    if (!normalizedCards[activeIndex]) {
      setActiveIndex(null);
      setHoverPreview(null);
    }
  }, [activeIndex, normalizedCards]);

  const updateHoverPreviewForIndex = useCallback((index) => {
    if (index === null || typeof window === 'undefined') {
      setHoverPreview(null);
      return;
    }

    const buttonNode = cardButtonRefs.current[index];
    const card = normalizedCards[index];
    if (!buttonNode) {
      setHoverPreview(null);
      return;
    }
    if (!card?.imageUrl) {
      setHoverPreview(null);
      return;
    }

    const placement = resolvePopupPreviewPlacement({
      buttonRect: buttonNode.getBoundingClientRect(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scale: POPUP_CARD_HOVER_SCALE,
    });
    if (!placement) {
      setHoverPreview(null);
      return;
    }
    setHoverPreview({
      key: `${card.cardId || 'stack-card'}-${index}`,
      imageUrl: card.imageUrl,
      alt: `展開カード ${index + 1}`,
      x: placement.x,
      y: placement.y,
      width: placement.width,
    });
  }, [normalizedCards]);

  const activatePopupCard = useCallback((index, node) => {
    setActiveIndex(index);
    if (!node || typeof window === 'undefined') {
      setHoverPreview(null);
      return;
    }
    const card = normalizedCards[index];
    if (!card?.imageUrl) {
      setHoverPreview(null);
      return;
    }
    const placement = resolvePopupPreviewPlacement({
      buttonRect: node.getBoundingClientRect(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scale: POPUP_CARD_HOVER_SCALE,
    });
    if (!placement) {
      setHoverPreview(null);
      return;
    }
    setHoverPreview({
      key: `${card.cardId || 'stack-card'}-${index}`,
      imageUrl: card.imageUrl,
      alt: `展開カード ${index + 1}`,
      x: placement.x,
      y: placement.y,
      width: placement.width,
    });
  }, [normalizedCards]);

  const deactivatePopupCard = useCallback((index) => {
    setActiveIndex((previous) => (previous === index ? null : previous));
    setHoverPreview((previous) => {
      if (!previous) {
        return previous;
      }
      return previous.key.endsWith(`-${index}`) ? null : previous;
    });
  }, []);

  useEffect(() => {
    if (activeIndex === null) {
      setHoverPreview(null);
      return;
    }
    updateHoverPreviewForIndex(activeIndex);
  }, [activeIndex, modalPosition, normalizedCards, updateHoverPreviewForIndex]);

  useEffect(() => {
    if (typeof window === 'undefined' || activeIndex === null) {
      return undefined;
    }

    const handleResize = () => {
      updateHoverPreviewForIndex(activeIndex);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeIndex, updateHoverPreviewForIndex]);

  const resolveAnchoredPosition = useCallback(() => {
    if (!initialAnchorRect || typeof window === 'undefined') {
      return null;
    }
    const rootNode = modalRootRef.current;
    if (!rootNode) {
      return null;
    }
    const rect = rootNode.getBoundingClientRect();
    const overlapOffset = clampValue(initialAnchorRect.height * 0.55, 42, 108);
    const desired = {
      x: initialAnchorRect.left + (initialAnchorRect.width - rect.width) / 2,
      y: initialAnchorRect.top - rect.height + overlapOffset,
    };
    return clampFloatingPanelPosition({
      x: desired.x,
      y: desired.y,
      width: rect.width,
      height: rect.height,
    });
  }, [initialAnchorRect]);

  useEffect(() => {
    if (typeof window === 'undefined' || hasManuallyMovedRef.current) {
      return undefined;
    }
    const frameId = window.requestAnimationFrame(() => {
      const anchoredPosition = resolveAnchoredPosition();
      if (!anchoredPosition) {
        return;
      }
      setModalPosition((previous) => {
        if (previous && previous.x === anchoredPosition.x && previous.y === anchoredPosition.y) {
          return previous;
        }
        return anchoredPosition;
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [normalizedCards.length, resolveAnchoredPosition]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => {
      const rootNode = modalRootRef.current;
      if (!rootNode) {
        return;
      }
      if (!hasManuallyMovedRef.current) {
        const anchoredPosition = resolveAnchoredPosition();
        if (anchoredPosition) {
          setModalPosition((previous) => {
            if (previous && previous.x === anchoredPosition.x && previous.y === anchoredPosition.y) {
              return previous;
            }
            return anchoredPosition;
          });
          return;
        }
      }
      if (!modalPosition) {
        return;
      }
      const rect = rootNode.getBoundingClientRect();
      const next = clampFloatingPanelPosition({
        x: modalPosition.x,
        y: modalPosition.y,
        width: rect.width,
        height: rect.height,
      });
      if (next.x !== modalPosition.x || next.y !== modalPosition.y) {
        setModalPosition(next);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [modalPosition, resolveAnchoredPosition]);

  useEffect(() => {
    if (!isModalDragging || typeof window === 'undefined') {
      return undefined;
    }

    const handlePointerMove = (event) => {
      const next = clampFloatingPanelPosition({
        x: event.clientX - dragOffsetRef.current.x,
        y: event.clientY - dragOffsetRef.current.y,
        width: dragSizeRef.current.width,
        height: dragSizeRef.current.height,
      });
      setModalPosition((previous) => {
        if (previous && previous.x === next.x && previous.y === next.y) {
          return previous;
        }
        return next;
      });
    };

    const stopDragging = () => {
      setIsModalDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [isModalDragging]);

  function handleModalDragStart(event) {
    if (event.button !== 0 || event.isPrimary === false) {
      return;
    }
    const rootNode = modalRootRef.current;
    if (!rootNode) {
      return;
    }

    const rect = rootNode.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    dragSizeRef.current = {
      width: rect.width,
      height: rect.height,
    };

    const initialPosition = {
      x: rect.left,
      y: rect.top,
    };
    hasManuallyMovedRef.current = true;
    setModalPosition((previous) => previous || initialPosition);
    setIsModalDragging(true);
    event.preventDefault();
  }

  function handleModalPositionReset() {
    setIsModalDragging(false);
    hasManuallyMovedRef.current = false;
    const anchoredPosition = resolveAnchoredPosition();
    if (anchoredPosition) {
      setModalPosition(anchoredPosition);
      return;
    }
    setModalPosition(null);
  }

  const modalRootStyle = useMemo(() => {
    if (!modalPosition) {
      return undefined;
    }
    return {
      left: `${modalPosition.x}px`,
      top: `${modalPosition.y}px`,
      bottom: 'auto',
      transform: 'none',
    };
  }, [modalPosition]);

  return (
    <aside
      ref={modalRootRef}
      className={styles.deckPeekRoot}
      data-zone={modalDataZone}
      aria-label={modalAriaLabel}
      style={modalRootStyle}
    >
      <div className={styles.deckPeekToolbar}>
        <button
          type="button"
          className={joinClassNames(
            styles.deckPeekToolbarButton,
            styles.deckPeekHandle,
            isModalDragging ? styles.deckPeekHandleActive : ''
          )}
          onPointerDown={handleModalDragStart}
          aria-label="スタック展開モーダルをドラッグして移動"
          title="スタック展開モーダルを移動"
        >
          <FontAwesomeIcon icon={faArrowsUpDownLeftRight} />
        </button>
        {modalPosition ? (
          <button
            type="button"
            className={styles.deckPeekToolbarButton}
            onClick={handleModalPositionReset}
          >
            位置をリセット
          </button>
        ) : null}
        <button
          type="button"
          className={styles.deckPeekToolbarButton}
          onClick={onClose}
        >
          閉じる
        </button>
      </div>
      <div
        className={styles.deckPeekCard}
        style={{ '--deck-peek-columns': String(columnCount) }}
      >
        <p className={styles.requestBlockingTitle}>{title}</p>
        <div className={styles.deckPeekCards} data-zone="stack-cards-grid">
          {normalizedCards.length > 0 ? (
            normalizedCards.map((card, index) => {
              const isActive = activeIndex === index;
              const cardButton = (
                <button
                  ref={(node) => {
                    if (node) {
                      cardButtonRefs.current[index] = node;
                    } else {
                      delete cardButtonRefs.current[index];
                    }
                  }}
                  type="button"
                  className={joinClassNames(
                    styles.popupCardButton,
                    styles.modalPopupCardButton,
                    isActive ? styles.popupCardButtonActive : ''
                  )}
                  aria-label={`展開カード ${index + 1} を拡大表示`}
                  onMouseEnter={(event) => activatePopupCard(index, event.currentTarget)}
                  onMouseLeave={() => deactivatePopupCard(index)}
                  onFocus={(event) => activatePopupCard(index, event.currentTarget)}
                  onBlur={() => deactivatePopupCard(index)}
                >
                  {card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt={`展開カード ${index + 1}`}
                      className={joinClassNames(styles.revealCardImage, styles.popupCardImage)}
                    />
                  ) : (
                    <div className={styles.opponentRevealCardFallback}>{card.cardId}</div>
                  )}
                </button>
              );

              if (!allowCardDrag) {
                return (
                  <div
                    key={`stack-card-${card.cardId}-${index}`}
                    className={joinClassNames(
                      styles.revealCardDraggable,
                      styles.popupCardItem,
                      isActive ? styles.popupCardItemActive : ''
                    )}
                  >
                    {cardButton}
                  </div>
                );
              }

              return (
                <DraggableCard
                  key={`stack-card-${card.cardId}-${index}`}
                  dragId={`stack-card-${card.cardId}-${index}`}
                  dragPayload={
                    dragSourceZone === 'player-stack'
                      ? buildCardDragPayload({
                          cardId: card.cardId,
                          sourceZone: 'player-stack',
                          sourceStackKind,
                          sourceBenchIndex:
                            sourceStackKind === STACK_KINDS.BENCH ? sourceBenchIndex : null,
                        })
                      : buildCardDragPayload({
                          cardId: card.cardId,
                          sourceZone: dragSourceZone,
                        })
                  }
                  className={joinClassNames(
                    styles.revealCardDraggable,
                    styles.popupCardItem,
                    isActive ? styles.popupCardItemActive : ''
                  )}
                  draggingClassName={styles.draggingSource}
                >
                  {cardButton}
                </DraggableCard>
              );
            })
          ) : (
            <p className={styles.requestBlockingMeta}>展開中のカードはありません。</p>
          )}
        </div>
      </div>
      <PopupHoverPreview preview={hoverPreview} />
    </aside>
  );
}

function StackAdjustPopover({
  isOpen = false,
  anchorRect = null,
  targetPlayerId = '',
  stackKind = STACK_KINDS.ACTIVE,
  benchIndex = null,
  damage = 0,
  statusBadges = [],
  isLocked = false,
  onAdjustDamage = () => {},
  onClose = () => {},
}) {
  const popoverStyle = useMemo(() => {
    if (!anchorRect || typeof window === 'undefined') {
      return undefined;
    }
    const estimatedWidth = 256;
    const estimatedHeight = 170;
    const preferred = clampFloatingPanelPosition({
      x: anchorRect.right + 10,
      y: anchorRect.top - 6,
      width: estimatedWidth,
      height: estimatedHeight,
    });
    return {
      left: `${preferred.x}px`,
      top: `${preferred.y}px`,
    };
  }, [anchorRect]);

  if (!isOpen) {
    return null;
  }

  return (
    <aside
      className={styles.stackAdjustPopover}
      style={popoverStyle}
      data-zone="stack-adjust-popover"
      role="dialog"
      aria-modal="false"
      aria-label="ダメージと状態異常を調整"
    >
      <span className={styles.stackAdjustPopoverArrow} aria-hidden="true" />
      <p className={styles.stackAdjustPopoverTitle}>ダメージ / 状態異常</p>
      <div className={styles.stackAdjustDamageRow}>
        <button
          type="button"
          className={styles.stackAdjustDamageButton}
          onClick={() => onAdjustDamage(-10)}
          disabled={isLocked}
          aria-label="ダメージを10減らす"
        >
          <FontAwesomeIcon icon={faMinus} />
        </button>
        <span className={styles.stackAdjustDamageValue}>{Number(damage || 0)}</span>
        <button
          type="button"
          className={styles.stackAdjustDamageButton}
          onClick={() => onAdjustDamage(10)}
          disabled={isLocked}
          aria-label="ダメージを10増やす"
        >
          <FontAwesomeIcon icon={faPlus} />
        </button>
      </div>
      <div className={styles.stackAdjustStatusRow}>
        {statusBadges.length > 0 ? (
          statusBadges.map((badge) => (
            <DraggableToolItem
              key={`stack-status-${targetPlayerId}-${stackKind}-${benchIndex ?? 'active'}-${badge.id}`}
              dragId={`stack-status-${targetPlayerId}-${stackKind}-${benchIndex ?? 'active'}-${badge.id}`}
              dragPayload={buildStackStatusBadgeDragPayload({
                value: badge.id,
                sourcePlayerId: targetPlayerId,
                sourceStackKind: stackKind,
                sourceBenchIndex: stackKind === STACK_KINDS.BENCH ? benchIndex : null,
              })}
              className={styles.toolboxDraggable}
              draggingClassName={styles.draggingSource}
            >
              <button
                type="button"
                className={styles.toolboxItem}
                data-tool-type="status-badge"
                data-tool-value={badge.id}
                aria-label={`状態異常 ${badge.label} を小道具BOXへ戻す`}
                disabled={isLocked}
              >
                {badge.label}
              </button>
            </DraggableToolItem>
          ))
        ) : (
          <span className={styles.zoneValueMuted}>状態異常なし</span>
        )}
      </div>
      <p className={styles.stackAdjustHint}>状態異常バッヂを小道具BOXへドラッグすると回復します。</p>
      <button
        type="button"
        className={styles.stackAdjustCloseButton}
        onClick={onClose}
      >
        閉じる
      </button>
    </aside>
  );
}

const PlayingField = ({ sessionId, playerId, sessionDoc, privateStateDoc }) => {
  const ownerPlayerId = toPlayerKey(playerId);
  const opponentPlayerId = ownerPlayerId === 'player1' ? 'player2' : 'player1';

  const persistedUiPrefs = resolveUiPrefs(privateStateDoc);

  const [isHandOpen, setIsHandOpen] = useState(persistedUiPrefs.handTrayOpen);
  const [isToolboxOpen, setIsToolboxOpen] = useState(persistedUiPrefs.toolboxOpen);
  const [mutationNotice, setMutationNotice] = useState({
    text: '',
    tone: MUTATION_NOTICE_TONE.SUCCESS,
  });
  const [isCoinSubmitting, setIsCoinSubmitting] = useState(false);
  const [isQuickActionSubmitting, setIsQuickActionSubmitting] = useState(false);
  const [isNoteSubmitting, setIsNoteSubmitting] = useState(false);
  const [isCoinAnimating, setIsCoinAnimating] = useState(false);
  const [isOpponentHandMenuOpen, setIsOpponentHandMenuOpen] = useState(false);
  const [isRandomDiscardConfigOpen, setIsRandomDiscardConfigOpen] = useState(false);
  const [randomDiscardCount, setRandomDiscardCount] = useState(1);
  const [isDeckPeekConfigOpen, setIsDeckPeekConfigOpen] = useState(false);
  const [deckPeekCount, setDeckPeekCount] = useState(1);
  const [isDeckPeekSelectAll, setIsDeckPeekSelectAll] = useState(false);
  const [isDeckPeekOpen, setIsDeckPeekOpen] = useState(false);
  const [sharedNoteDraft, setSharedNoteDraft] = useState('');
  const [editingSharedNoteId, setEditingSharedNoteId] = useState('');
  const [editingSharedNoteDraft, setEditingSharedNoteDraft] = useState('');
  const [opponentHandRevealState, setOpponentHandRevealState] = useState({
    requestId: '',
    cardIds: [],
  });
  const [opponentRevealActiveIndex, setOpponentRevealActiveIndex] = useState(null);
  const [opponentRevealSelectedCardIds, setOpponentRevealSelectedCardIds] = useState([]);
  const [opponentRevealActiveShift, setOpponentRevealActiveShift] = useState(() => ({
    ...POPUP_CARD_BASE_SHIFT,
  }));
  const [opponentBoardRevealActiveIndex, setOpponentBoardRevealActiveIndex] = useState(null);
  const [opponentBoardRevealActiveShift, setOpponentBoardRevealActiveShift] = useState(() => ({
    ...POPUP_CARD_BASE_SHIFT,
  }));
  const [isOpponentActiveSingleHovering, setIsOpponentActiveSingleHovering] = useState(false);
  const [opponentActiveSingleHoverShift, setOpponentActiveSingleHoverShift] = useState(() => ({
    ...POPUP_CARD_BASE_SHIFT,
  }));
  const [opponentCountFlash, setOpponentCountFlash] = useState({
    lost: false,
    discard: false,
    deck: false,
    prize: false,
  });
  const [stackModalState, setStackModalState] = useState({
    ownerPlayerId: '',
    ownerLabel: '',
    stackKind: STACK_KINDS.ACTIVE,
    benchIndex: null,
    anchorRect: null,
    isOpen: false,
  });
  const [pileModalState, setPileModalState] = useState({
    ownerPlayerId: '',
    ownerLabel: '',
    zoneKind: ZONE_KINDS.DISCARD,
    anchorRect: null,
    isOpen: false,
  });
  const [stackAdjustPopoverState, setStackAdjustPopoverState] = useState({
    targetPlayerId: '',
    stackKind: STACK_KINDS.ACTIVE,
    benchIndex: null,
    anchorRect: null,
    isOpen: false,
  });
  const handledRevealRequestIdsRef = useRef(new Set());
  const hasInitializedHandledRevealRef = useRef(false);
  const handledRandomDiscardRequestIdsRef = useRef(new Set());
  const hasInitializedHandledRandomDiscardRef = useRef(false);
  const handledSelectedDiscardRequestIdsRef = useRef(new Set());
  const hasInitializedHandledSelectedDiscardRef = useRef(false);
  const handledDeckShuffleEventAtRef = useRef('');
  const hasInitializedDeckShuffleEventRef = useRef(false);
  const handledDeckInsertEventAtRef = useRef('');
  const hasInitializedDeckInsertEventRef = useRef(false);
  const opponentRevealButtonRefs = useRef({});
  const opponentBoardRevealRefs = useRef({});
  const opponentActiveHoverSurfaceRef = useRef(null);
  const opponentCountPrevRef = useRef({
    lost: null,
    discard: null,
    deck: null,
    prize: null,
  });
  const opponentCountFlashTimeoutsRef = useRef({
    lost: null,
    discard: null,
    deck: null,
    prize: null,
  });
  const boardRootRef = useRef(null);
  const interactionGuideRef = useRef(null);
  const [interactionGuidePosition, setInteractionGuidePosition] = useState({
    left: 0,
    top: 0,
    isReady: false,
  });

  const clearMutationNotice = useCallback(() => {
    setMutationNotice((previous) => {
      if (!previous?.text) {
        return previous;
      }
      return {
        text: '',
        tone: MUTATION_NOTICE_TONE.SUCCESS,
      };
    });
  }, []);

  const pushMutationNotice = useCallback(
    (message, preferredTone = null) => {
      const normalizedMessage = normalizeMutationNoticeText(message);
      if (!normalizedMessage) {
        clearMutationNotice();
        return;
      }
      const tone =
        preferredTone === MUTATION_NOTICE_TONE.ALERT
          ? MUTATION_NOTICE_TONE.ALERT
          : preferredTone === MUTATION_NOTICE_TONE.SUCCESS
            ? MUTATION_NOTICE_TONE.SUCCESS
            : detectMutationNoticeTone(normalizedMessage);

      setMutationNotice({
        text: normalizedMessage,
        tone,
      });
    },
    [clearMutationNotice]
  );

  const pushAlertNotice = useCallback(
    (message) => {
      pushMutationNotice(message, MUTATION_NOTICE_TONE.ALERT);
    },
    [pushMutationNotice]
  );

  const pushSuccessNotice = useCallback(
    (message) => {
      pushMutationNotice(message, MUTATION_NOTICE_TONE.SUCCESS);
    },
    [pushMutationNotice]
  );

  useEffect(() => {
    const timeoutMs = resolveMutationNoticeTimeoutMs(mutationNotice.text);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return undefined;
    }
    if (typeof window === 'undefined') {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => {
      clearMutationNotice();
    }, timeoutMs);
    return () => window.clearTimeout(timeoutId);
  }, [clearMutationNotice, mutationNotice.text]);

  const handleExternalMutationMessage = useCallback(
    (message) => {
      pushMutationNotice(message);
    },
    [pushMutationNotice]
  );

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
          pushAlertNotice('表示設定の保存権限がありません。参加状態を確認してください。');
          return;
        }
        pushAlertNotice('表示設定の保存に失敗しました。再試行してください。');
      }
    },
    [ownerPlayerId, pushAlertNotice, sessionId]
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
  const playerBoard = publicPlayers?.[ownerPlayerId]?.board || EMPTY_OBJECT;
  const opponentBoard = publicPlayers?.[opponentPlayerId]?.board || EMPTY_OBJECT;
  const playerCounters = publicPlayers?.[ownerPlayerId]?.counters || EMPTY_OBJECT;
  const opponentCounters = publicPlayers?.[opponentPlayerId]?.counters || EMPTY_OBJECT;

  const playerDeckRefs = asArray(privateStateDoc?.zones?.deck);
  const playerDeckPeekRefs = asArray(privateStateDoc?.zones?.deckPeek);
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
  const stadiumState = sessionDoc?.publicState?.stadium || null;
  const stadiumCardId = typeof stadiumState?.cardId === 'string' ? stadiumState.cardId : '';
  const stadiumOwnerPlayerId =
    stadiumState?.ownerPlayerId === 'player1' || stadiumState?.ownerPlayerId === 'player2'
      ? stadiumState.ownerPlayerId
      : null;
  const stadiumOwnerLabel =
    stadiumOwnerPlayerId === ownerPlayerId
      ? '自分'
      : stadiumOwnerPlayerId === opponentPlayerId
      ? '相手'
      : '';
  const stadiumCardImageUrl =
    (typeof stadiumState?.imageUrl === 'string' && stadiumState.imageUrl.trim() !== ''
      ? stadiumState.imageUrl
      : null) ||
    (stadiumCardId ? renderCardCatalog?.[stadiumCardId]?.imageUrl || null : null);
  const canDragStadiumCard = Boolean(stadiumCardId) && stadiumOwnerPlayerId === ownerPlayerId;
  const stadiumCardDragPayload = canDragStadiumCard
    ? buildCardDragPayload({
        cardId: stadiumCardId,
        sourceZone: 'player-stadium',
      })
    : null;
  const sharedNotes = toSharedNotes(sessionDoc?.publicState);
  const operationRequests = asArray(sessionDoc?.publicState?.operationRequests);
  const playerRevealCards = toRevealCards(playerBoard, renderCardCatalog);
  const opponentRevealCards = toRevealCards(opponentBoard, renderCardCatalog);
  const opponentHandRevealCards = useMemo(
    () => toRevealRequestCards(opponentHandRevealState.cardIds, renderCardCatalog),
    [opponentHandRevealState.cardIds, renderCardCatalog]
  );
  const selectedOpponentRevealCardIds = useMemo(() => {
    if (!opponentRevealSelectedCardIds.length) {
      return [];
    }
    const availableCardIdSet = new Set(opponentHandRevealCards.map((entry) => entry.cardId).filter(Boolean));
    return opponentRevealSelectedCardIds.filter((cardId) => availableCardIdSet.has(cardId));
  }, [opponentHandRevealCards, opponentRevealSelectedCardIds]);
  const selectedOpponentRevealCardCount = selectedOpponentRevealCardIds.length;
  const opponentRevealColumnCount = Math.max(1, Math.min(10, opponentHandRevealCards.length || 1));
  const pendingApprovalRequests = useMemo(
    () => listPendingOperationRequests(sessionDoc, ownerPlayerId),
    [ownerPlayerId, sessionDoc]
  );
  const blockingRequest = pendingApprovalRequests[0] || null;
  const blockingRequestCardIds = useMemo(() => {
    const payloadCardIds = asArray(blockingRequest?.payload?.cardIds)
      .map((cardId) => (typeof cardId === 'string' ? cardId.trim() : ''))
      .filter(Boolean);
    const singleCardId =
      typeof blockingRequest?.payload?.cardId === 'string' ? blockingRequest.payload.cardId.trim() : '';
    const merged = payloadCardIds.length > 0 ? payloadCardIds : singleCardId ? [singleCardId] : [];
    return Array.from(new Set(merged));
  }, [blockingRequest]);
  const blockingRequestCardImageUrls = useMemo(
    () =>
      blockingRequestCardIds
        .map((cardId) => renderCardCatalog?.[cardId]?.imageUrl || null)
        .filter(Boolean),
    [blockingRequestCardIds, renderCardCatalog]
  );
  const hasBlockingRequest = Boolean(blockingRequest);
  const isOpponentHandRevealOpen = Boolean(opponentHandRevealState.requestId);
  const isUiInteractionBlocked =
    hasBlockingRequest ||
    isOpponentHandRevealOpen ||
    isRandomDiscardConfigOpen ||
    isDeckPeekConfigOpen;

  const updateInteractionGuidePosition = useCallback(() => {
    const boardNode = boardRootRef.current;
    const guideNode = interactionGuideRef.current;
    const nextPosition = resolveInteractionGuidePosition({
      boardNode,
      guideNode,
    });
    if (!nextPosition) {
      return;
    }
    setInteractionGuidePosition((previous) => {
      if (
        previous.isReady &&
        previous.left === nextPosition.left &&
        previous.top === nextPosition.top
      ) {
        return previous;
      }
      return {
        left: nextPosition.left,
        top: nextPosition.top,
        isReady: true,
      };
    });
  }, []);

  useLayoutEffect(() => {
    updateInteractionGuidePosition();
    if (typeof window === 'undefined') {
      return undefined;
    }
    const frameId = window.requestAnimationFrame(updateInteractionGuidePosition);
    const handleResize = () => {
      updateInteractionGuidePosition();
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [
    updateInteractionGuidePosition,
    sessionDoc?.revision,
    isHandOpen,
    isToolboxOpen,
  ]);

  const playerActive = playerBoard?.active;
  const opponentActive = opponentBoard?.active;
  const playerBench = asArray(playerBoard?.bench);
  const opponentBench = asArray(opponentBoard?.bench);
  const playerDiscardRefs = asArray(playerBoard?.discard);
  const playerLostRefs = asArray(playerBoard?.lostZone);
  const opponentDiscardRefs = asArray(opponentBoard?.discard);
  const opponentLostRefs = asArray(opponentBoard?.lostZone);
  const opponentDiscardCount = opponentDiscardRefs.length;
  const opponentLostCount = opponentLostRefs.length;
  const lastCoinResult = turnContext?.lastCoinResult;
  const lastCoinAt = turnContext?.lastCoinAt || null;
  const lastDeckShuffleEvent = turnContext?.lastDeckShuffleEvent || null;
  const lastDeckInsertEvent = turnContext?.lastDeckInsertEvent || null;
  const coinImageSrc = lastCoinResult === 'tails' ? COIN_BACK_IMAGE : COIN_FRONT_IMAGE;
  const coinResultLabel = COIN_RESULT_LABEL[lastCoinResult] || '未実行';
  const coinImageClassName = joinClassNames(
    styles.coinButtonImage,
    lastCoinResult === 'tails' ? styles.coinButtonImageBack : styles.coinButtonImageFront
  );

  const playerActiveZoneId = 'player-active';
  const opponentActiveZoneId = 'opponent-active';

  useEffect(() => {
    const zoneCountEntries = [
      ['lost', opponentLostCount],
      ['discard', opponentDiscardCount],
      ['deck', opponentDeckCount],
      ['prize', opponentPrizeCount],
    ];

    zoneCountEntries.forEach(([zoneKey, nextCount]) => {
      const previousCount = opponentCountPrevRef.current[zoneKey];
      opponentCountPrevRef.current[zoneKey] = nextCount;
      if (previousCount === null || previousCount === nextCount) {
        return;
      }

      setOpponentCountFlash((previous) => ({
        ...previous,
        [zoneKey]: true,
      }));

      const existingTimeoutId = opponentCountFlashTimeoutsRef.current[zoneKey];
      if (existingTimeoutId) {
        window.clearTimeout(existingTimeoutId);
      }
      opponentCountFlashTimeoutsRef.current[zoneKey] = window.setTimeout(() => {
        setOpponentCountFlash((previous) => ({
          ...previous,
          [zoneKey]: false,
        }));
        opponentCountFlashTimeoutsRef.current[zoneKey] = null;
      }, OPPONENT_COUNT_FLASH_MS);
    });
  }, [opponentDeckCount, opponentDiscardCount, opponentLostCount, opponentPrizeCount]);

  useEffect(() => {
    return () => {
      Object.values(opponentCountFlashTimeoutsRef.current).forEach((timeoutId) => {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      });
    };
  }, []);

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

  const playerDeckBottomDropPayload = buildZoneDropPayload({
    zoneId: 'player-deck-insert-bottom',
    targetPlayerId: ownerPlayerId,
    zoneKind: ZONE_KINDS.DECK,
    edge: 'bottom',
  });

  const playerDeckTopDropPayload = buildZoneDropPayload({
    zoneId: 'player-deck-insert-top',
    targetPlayerId: ownerPlayerId,
    zoneKind: ZONE_KINDS.DECK,
    edge: 'top',
  });

  const playerStadiumDropPayload = stadiumCardId
    ? null
    : buildZoneDropPayload({
        zoneId: 'center-stadium',
        targetPlayerId: ownerPlayerId,
        zoneKind: ZONE_KINDS.STADIUM,
      });

  const toolboxDropPayload = buildZoneDropPayload({
    zoneId: 'toolbox-panel',
    targetPlayerId: ownerPlayerId,
    zoneKind: ZONE_KINDS.TOOLBOX,
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
    isInteractionLocked: isUiInteractionBlocked,
    onMutationMessage: handleExternalMutationMessage,
  });

  const isDraggingPileCard = activeDragPayload?.dragType === 'pile-card';
  const isDraggingFromPlayerDeck = isDraggingPileCard && activeDragPayload?.sourceZone === 'player-deck';
  const isDraggingFromPlayerPrize =
    isDraggingPileCard && activeDragPayload?.sourceZone === 'player-prize';
  const displayPlayerDeckCount = Math.max(0, playerDeckCount - (isDraggingFromPlayerDeck ? 1 : 0));
  const displayPlayerPrizeCount = Math.max(0, playerPrizeCount - (isDraggingFromPlayerPrize ? 1 : 0));
  const deckPeekCards = useMemo(() => {
    return playerDeckPeekRefs
      .map((ref, index) => {
        const cardId = ref?.cardId;
        if (!cardId) {
          return null;
        }
        return {
          cardId,
          imageUrl: normalizedPlayerCatalog?.[cardId]?.imageUrl || renderCardCatalog?.[cardId]?.imageUrl || null,
          index,
        };
      })
      .filter(Boolean);
  }, [normalizedPlayerCatalog, playerDeckPeekRefs, renderCardCatalog]);

  const handleOpenStackCards = useCallback(
    ({
      ownerPlayerId: targetOwnerPlayerId,
      ownerLabel,
      stackKind,
      benchIndex = null,
      sourceZoneId = '',
    }) => {
      setPileModalState((previous) => ({
        ...previous,
        isOpen: false,
      }));
      setStackAdjustPopoverState((previous) => ({
        ...previous,
        isOpen: false,
      }));
      let anchorRect = null;
      if (typeof document !== 'undefined' && sourceZoneId) {
        const anchorNode = document.querySelector(`[data-zone="${sourceZoneId}"]`);
        if (anchorNode && typeof anchorNode.getBoundingClientRect === 'function') {
          const rect = anchorNode.getBoundingClientRect();
          anchorRect = {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          };
        }
      }
      setStackModalState({
        ownerPlayerId: targetOwnerPlayerId,
        ownerLabel: ownerLabel || '',
        stackKind: stackKind === STACK_KINDS.BENCH ? STACK_KINDS.BENCH : STACK_KINDS.ACTIVE,
        benchIndex:
          stackKind === STACK_KINDS.BENCH ? Number(benchIndex) : null,
        anchorRect,
        isOpen: true,
      });
    },
    []
  );

  const handleCloseStackCards = useCallback(() => {
    setStackModalState((previous) => ({
      ...previous,
      isOpen: false,
    }));
  }, []);

  const isStackModalForZone = useCallback(
    ({ ownerPlayerId: targetOwnerPlayerId, stackKind, benchIndex = null }) => {
      if (!stackModalState.isOpen) {
        return false;
      }
      if (stackModalState.ownerPlayerId !== targetOwnerPlayerId) {
        return false;
      }
      const normalizedStackKind =
        stackKind === STACK_KINDS.BENCH ? STACK_KINDS.BENCH : STACK_KINDS.ACTIVE;
      if (stackModalState.stackKind !== normalizedStackKind) {
        return false;
      }
      if (normalizedStackKind === STACK_KINDS.BENCH) {
        return Number(stackModalState.benchIndex) === Number(benchIndex);
      }
      return true;
    },
    [
      stackModalState.benchIndex,
      stackModalState.isOpen,
      stackModalState.ownerPlayerId,
      stackModalState.stackKind,
    ]
  );

  const handleToggleStackCards = useCallback(
    (params) => {
      if (
        isStackModalForZone({
          ownerPlayerId: params?.ownerPlayerId,
          stackKind: params?.stackKind,
          benchIndex: params?.benchIndex ?? null,
        })
      ) {
        handleCloseStackCards();
        return;
      }
      handleOpenStackCards(params);
    },
    [handleCloseStackCards, handleOpenStackCards, isStackModalForZone]
  );

  const handleOpenPileCards = useCallback(
    ({
      ownerPlayerId: targetOwnerPlayerId,
      ownerLabel,
      zoneKind,
      sourceZoneId = '',
    }) => {
      if (zoneKind !== ZONE_KINDS.DISCARD && zoneKind !== ZONE_KINDS.LOST) {
        return;
      }
      setStackModalState((previous) => ({
        ...previous,
        isOpen: false,
      }));
      setStackAdjustPopoverState((previous) => ({
        ...previous,
        isOpen: false,
      }));
      let anchorRect = null;
      if (typeof document !== 'undefined' && sourceZoneId) {
        const anchorNode = document.querySelector(`[data-zone="${sourceZoneId}"]`);
        if (anchorNode && typeof anchorNode.getBoundingClientRect === 'function') {
          const rect = anchorNode.getBoundingClientRect();
          anchorRect = {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          };
        }
      }
      setPileModalState({
        ownerPlayerId: targetOwnerPlayerId,
        ownerLabel: ownerLabel || '',
        zoneKind,
        anchorRect,
        isOpen: true,
      });
    },
    []
  );

  const handleClosePileCards = useCallback(() => {
    setPileModalState((previous) => ({
      ...previous,
      isOpen: false,
    }));
  }, []);

  const isPileModalForZone = useCallback(
    ({ ownerPlayerId: targetOwnerPlayerId, zoneKind }) => {
      if (!pileModalState.isOpen) {
        return false;
      }
      if (pileModalState.ownerPlayerId !== targetOwnerPlayerId) {
        return false;
      }
      return pileModalState.zoneKind === zoneKind;
    },
    [pileModalState.isOpen, pileModalState.ownerPlayerId, pileModalState.zoneKind]
  );

  const handleTogglePileCards = useCallback(
    (params) => {
      if (
        isPileModalForZone({
          ownerPlayerId: params?.ownerPlayerId,
          zoneKind: params?.zoneKind,
        })
      ) {
        handleClosePileCards();
        return;
      }
      handleOpenPileCards(params);
    },
    [handleClosePileCards, handleOpenPileCards, isPileModalForZone]
  );

  const handleOpenStackAdjustPopover = useCallback(
    ({ targetPlayerId, stackKind, benchIndex = null, anchorRect = null }) => {
      if (targetPlayerId !== 'player1' && targetPlayerId !== 'player2') {
        return;
      }
      setStackModalState((previous) => ({
        ...previous,
        isOpen: false,
      }));
      setPileModalState((previous) => ({
        ...previous,
        isOpen: false,
      }));
      setStackAdjustPopoverState({
        targetPlayerId,
        stackKind: stackKind === STACK_KINDS.BENCH ? STACK_KINDS.BENCH : STACK_KINDS.ACTIVE,
        benchIndex: stackKind === STACK_KINDS.BENCH ? Number(benchIndex) : null,
        anchorRect,
        isOpen: true,
      });
    },
    []
  );

  const handleCloseStackAdjustPopover = useCallback(() => {
    setStackAdjustPopoverState((previous) => ({
      ...previous,
      isOpen: false,
    }));
  }, []);

  const stackModalBoard = useMemo(() => {
    if (stackModalState.ownerPlayerId === ownerPlayerId) {
      return playerBoard;
    }
    if (stackModalState.ownerPlayerId === opponentPlayerId) {
      return opponentBoard;
    }
    return null;
  }, [opponentBoard, opponentPlayerId, ownerPlayerId, playerBoard, stackModalState.ownerPlayerId]);

  const stackModalStack = useMemo(
    () =>
      resolveStackFromBoard(
        stackModalBoard,
        stackModalState.stackKind,
        stackModalState.stackKind === STACK_KINDS.BENCH ? stackModalState.benchIndex : null
      ),
    [stackModalBoard, stackModalState.benchIndex, stackModalState.stackKind]
  );

  const stackModalCards = useMemo(
    () => toStackCards(stackModalStack, renderCardCatalog),
    [renderCardCatalog, stackModalStack]
  );

  const isStackModalOpen =
    stackModalState.isOpen &&
    Boolean(stackModalStack) &&
    stackModalCards.length > 0;

  const stackModalAllowsDrag = stackModalState.ownerPlayerId === ownerPlayerId;

  const stackModalTitle = useMemo(
    () =>
      formatStackModalTitle({
        ownerLabel: stackModalState.ownerLabel || '不明',
        stackKind: stackModalState.stackKind,
        benchIndex: stackModalState.benchIndex,
        cardCount: stackModalCards.length,
      }),
    [
      stackModalCards.length,
      stackModalState.benchIndex,
      stackModalState.ownerLabel,
      stackModalState.stackKind,
    ]
  );

  const pileModalBoard = useMemo(() => {
    if (pileModalState.ownerPlayerId === ownerPlayerId) {
      return playerBoard;
    }
    if (pileModalState.ownerPlayerId === opponentPlayerId) {
      return opponentBoard;
    }
    return null;
  }, [opponentBoard, opponentPlayerId, ownerPlayerId, pileModalState.ownerPlayerId, playerBoard]);

  const pileModalRefs = useMemo(() => {
    if (pileModalState.zoneKind === ZONE_KINDS.LOST) {
      return asArray(pileModalBoard?.lostZone);
    }
    return asArray(pileModalBoard?.discard);
  }, [pileModalBoard, pileModalState.zoneKind]);

  const pileModalCards = useMemo(
    () => toZoneCards(pileModalRefs, renderCardCatalog),
    [pileModalRefs, renderCardCatalog]
  );

  const isPileModalOpen =
    pileModalState.isOpen &&
    (pileModalState.zoneKind === ZONE_KINDS.DISCARD || pileModalState.zoneKind === ZONE_KINDS.LOST) &&
    pileModalCards.length > 0;

  const pileModalAllowsDrag = pileModalState.ownerPlayerId === ownerPlayerId;
  const pileModalDragSourceZone =
    pileModalState.zoneKind === ZONE_KINDS.LOST ? 'player-lost' : 'player-discard';
  const pileModalTitle = useMemo(
    () =>
      formatZoneModalTitle({
        ownerLabel: pileModalState.ownerLabel || '不明',
        zoneKind: pileModalState.zoneKind,
        cardCount: pileModalCards.length,
      }),
    [pileModalCards.length, pileModalState.ownerLabel, pileModalState.zoneKind]
  );

  const stackAdjustPopoverBoard = useMemo(() => {
    if (stackAdjustPopoverState.targetPlayerId === ownerPlayerId) {
      return playerBoard;
    }
    if (stackAdjustPopoverState.targetPlayerId === opponentPlayerId) {
      return opponentBoard;
    }
    return null;
  }, [
    opponentBoard,
    opponentPlayerId,
    ownerPlayerId,
    playerBoard,
    stackAdjustPopoverState.targetPlayerId,
  ]);

  const stackAdjustPopoverStack = useMemo(
    () =>
      resolveStackFromBoard(
        stackAdjustPopoverBoard,
        stackAdjustPopoverState.stackKind,
        stackAdjustPopoverState.stackKind === STACK_KINDS.BENCH
          ? stackAdjustPopoverState.benchIndex
          : null
      ),
    [stackAdjustPopoverBoard, stackAdjustPopoverState.benchIndex, stackAdjustPopoverState.stackKind]
  );

  const stackAdjustPopoverStatusBadges = useMemo(
    () => resolveStackStatusBadges(stackAdjustPopoverStack),
    [stackAdjustPopoverStack]
  );

  const stackAdjustPopoverDamage = Number(stackAdjustPopoverStack?.damage || 0);
  const isStackAdjustPopoverOpen =
    stackAdjustPopoverState.isOpen &&
    Boolean(stackAdjustPopoverStack) &&
    countCardsInStack(
      stackAdjustPopoverBoard,
      stackAdjustPopoverState.stackKind,
      stackAdjustPopoverState.stackKind === STACK_KINDS.BENCH ? stackAdjustPopoverState.benchIndex : null
    ) > 0;

  useEffect(() => {
    if (stackModalState.isOpen && (!stackModalStack || stackModalCards.length <= 0)) {
      setStackModalState((previous) => ({
        ...previous,
        isOpen: false,
      }));
    }
  }, [stackModalCards.length, stackModalStack, stackModalState.isOpen]);

  useEffect(() => {
    if (pileModalState.isOpen && pileModalCards.length <= 0) {
      setPileModalState((previous) => ({
        ...previous,
        isOpen: false,
      }));
    }
  }, [pileModalCards.length, pileModalState.isOpen]);

  useEffect(() => {
    if (stackAdjustPopoverState.isOpen && !isStackAdjustPopoverOpen) {
      setStackAdjustPopoverState((previous) => ({
        ...previous,
        isOpen: false,
      }));
    }
  }, [isStackAdjustPopoverOpen, stackAdjustPopoverState.isOpen]);

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

  useEffect(() => {
    if (isUiInteractionBlocked) {
      setIsOpponentHandMenuOpen(false);
    }
  }, [isUiInteractionBlocked]);

  useEffect(() => {
    if (hasBlockingRequest && isRandomDiscardConfigOpen) {
      setIsRandomDiscardConfigOpen(false);
    }
  }, [hasBlockingRequest, isRandomDiscardConfigOpen]);

  useEffect(() => {
    if (hasBlockingRequest && isDeckPeekConfigOpen) {
      setIsDeckPeekConfigOpen(false);
    }
  }, [hasBlockingRequest, isDeckPeekConfigOpen]);

  useEffect(() => {
    const maxCount = Math.max(1, opponentHandCount || 1);
    setRandomDiscardCount((previous) => clampPositiveInt(previous, maxCount));
  }, [opponentHandCount]);

  useEffect(() => {
    const maxCount = Math.max(1, playerDeckCount || 1);
    setDeckPeekCount((previous) => clampPositiveInt(previous, maxCount));
  }, [playerDeckCount]);

  useEffect(() => {
    if (deckPeekCards.length > 0 && !isDeckPeekOpen) {
      setIsDeckPeekOpen(true);
      return;
    }
    if (deckPeekCards.length === 0 && isDeckPeekOpen) {
      setIsDeckPeekOpen(false);
    }
  }, [deckPeekCards.length, isDeckPeekOpen]);

  useEffect(() => {
    handledRevealRequestIdsRef.current = new Set();
    hasInitializedHandledRevealRef.current = false;
    handledRandomDiscardRequestIdsRef.current = new Set();
    hasInitializedHandledRandomDiscardRef.current = false;
    handledSelectedDiscardRequestIdsRef.current = new Set();
    hasInitializedHandledSelectedDiscardRef.current = false;
    setOpponentHandRevealState({
      requestId: '',
      cardIds: [],
    });
    setIsRandomDiscardConfigOpen(false);
    setRandomDiscardCount(1);
    setIsDeckPeekConfigOpen(false);
    setDeckPeekCount(1);
    setIsDeckPeekOpen(false);
    setSharedNoteDraft('');
    setEditingSharedNoteId('');
    setEditingSharedNoteDraft('');
    setOpponentRevealSelectedCardIds([]);
    setStackModalState({
      ownerPlayerId: '',
      ownerLabel: '',
      stackKind: STACK_KINDS.ACTIVE,
      benchIndex: null,
      anchorRect: null,
      isOpen: false,
    });
    setPileModalState({
      ownerPlayerId: '',
      ownerLabel: '',
      zoneKind: ZONE_KINDS.DISCARD,
      anchorRect: null,
      isOpen: false,
    });
    handledDeckShuffleEventAtRef.current = '';
    hasInitializedDeckShuffleEventRef.current = false;
    handledDeckInsertEventAtRef.current = '';
    hasInitializedDeckInsertEventRef.current = false;
  }, [ownerPlayerId]);

  useEffect(() => {
    if (!isOpponentHandRevealOpen) {
      setOpponentRevealActiveIndex(null);
      setOpponentRevealSelectedCardIds([]);
      setOpponentRevealActiveShift((previous) => {
        if (
          previous.x === POPUP_CARD_BASE_SHIFT.x &&
          previous.y === POPUP_CARD_BASE_SHIFT.y
        ) {
          return previous;
        }
        return { ...POPUP_CARD_BASE_SHIFT };
      });
    }
  }, [isOpponentHandRevealOpen]);

  useEffect(() => {
    setOpponentRevealSelectedCardIds((previous) => {
      if (!previous.length) {
        return previous;
      }
      const availableCardIdSet = new Set(opponentHandRevealCards.map((entry) => entry.cardId).filter(Boolean));
      const next = previous.filter((cardId) => availableCardIdSet.has(cardId));
      if (next.length === previous.length) {
        return previous;
      }
      return next;
    });
  }, [opponentHandRevealCards]);

  const recalcOpponentRevealCardShift = useCallback(() => {
    if (
      !isOpponentHandRevealOpen ||
      opponentRevealActiveIndex === null ||
      typeof window === 'undefined'
    ) {
      setOpponentRevealActiveShift((previous) => {
        if (
          previous.x === POPUP_CARD_BASE_SHIFT.x &&
          previous.y === POPUP_CARD_BASE_SHIFT.y
        ) {
          return previous;
        }
        return { ...POPUP_CARD_BASE_SHIFT };
      });
      return;
    }

    const buttonNode = opponentRevealButtonRefs.current[opponentRevealActiveIndex];
    if (!buttonNode) {
      return;
    }

    const next = resolvePopupCardHoverShift({
      cardRect: buttonNode.getBoundingClientRect(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scale: POPUP_CARD_HOVER_SCALE,
    });

    setOpponentRevealActiveShift((previous) => {
      if (previous.x === next.x && previous.y === next.y) {
        return previous;
      }
      return next;
    });
  }, [isOpponentHandRevealOpen, opponentRevealActiveIndex]);

  useEffect(() => {
    recalcOpponentRevealCardShift();
  }, [recalcOpponentRevealCardShift]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isOpponentHandRevealOpen) {
      return undefined;
    }

    const handleResize = () => {
      recalcOpponentRevealCardShift();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpponentHandRevealOpen, recalcOpponentRevealCardShift]);

  const clearOpponentBoardRevealHover = useCallback(() => {
    setOpponentBoardRevealActiveIndex(null);
    setOpponentBoardRevealActiveShift((previous) => {
      if (
        previous.x === POPUP_CARD_BASE_SHIFT.x &&
        previous.y === POPUP_CARD_BASE_SHIFT.y
      ) {
        return previous;
      }
      return { ...POPUP_CARD_BASE_SHIFT };
    });
  }, []);

  const recalcOpponentBoardRevealCardShift = useCallback(() => {
    if (opponentBoardRevealActiveIndex === null || typeof window === 'undefined') {
      setOpponentBoardRevealActiveShift((previous) => {
        if (
          previous.x === POPUP_CARD_BASE_SHIFT.x &&
          previous.y === POPUP_CARD_BASE_SHIFT.y
        ) {
          return previous;
        }
        return { ...POPUP_CARD_BASE_SHIFT };
      });
      return;
    }

    const cardNode = opponentBoardRevealRefs.current[opponentBoardRevealActiveIndex];
    if (!cardNode) {
      return;
    }
    const next = resolvePopupCardHoverShift({
      cardRect: cardNode.getBoundingClientRect(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scale: POPUP_CARD_HOVER_SCALE,
    });
    setOpponentBoardRevealActiveShift((previous) => {
      if (previous.x === next.x && previous.y === next.y) {
        return previous;
      }
      return next;
    });
  }, [opponentBoardRevealActiveIndex]);

  useEffect(() => {
    if (!opponentRevealCards[opponentBoardRevealActiveIndex]) {
      clearOpponentBoardRevealHover();
    }
  }, [clearOpponentBoardRevealHover, opponentBoardRevealActiveIndex, opponentRevealCards]);

  useEffect(() => {
    recalcOpponentBoardRevealCardShift();
  }, [opponentBoardRevealActiveIndex, opponentRevealCards, recalcOpponentBoardRevealCardShift]);

  useEffect(() => {
    if (typeof window === 'undefined' || opponentBoardRevealActiveIndex === null) {
      return undefined;
    }

    const handleResize = () => {
      recalcOpponentBoardRevealCardShift();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [opponentBoardRevealActiveIndex, recalcOpponentBoardRevealCardShift]);

  const clearOpponentActiveSingleHover = useCallback(() => {
    setIsOpponentActiveSingleHovering(false);
    setOpponentActiveSingleHoverShift((previous) => {
      if (
        previous.x === POPUP_CARD_BASE_SHIFT.x &&
        previous.y === POPUP_CARD_BASE_SHIFT.y
      ) {
        return previous;
      }
      return { ...POPUP_CARD_BASE_SHIFT };
    });
  }, []);

  const activateOpponentActiveSingleHover = useCallback(
    (containerNode) => {
      if (!containerNode || typeof window === 'undefined') {
        clearOpponentActiveSingleHover();
        return;
      }
      const activeCardCount = asArray(opponentActive?.cardIds).length;
      if (activeCardCount !== 1) {
        clearOpponentActiveSingleHover();
        return;
      }
      opponentActiveHoverSurfaceRef.current = containerNode;
      setIsOpponentActiveSingleHovering(true);
      const next = resolveStackCardHoverShift({
        containerNode,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      setOpponentActiveSingleHoverShift((previous) => {
        if (previous.x === next.x && previous.y === next.y) {
          return previous;
        }
        return next;
      });
    },
    [clearOpponentActiveSingleHover, opponentActive]
  );

  useEffect(() => {
    if (asArray(opponentActive?.cardIds).length !== 1) {
      clearOpponentActiveSingleHover();
    }
  }, [clearOpponentActiveSingleHover, opponentActive]);

  useEffect(() => {
    if (!isOpponentActiveSingleHovering || typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => {
      const node = opponentActiveHoverSurfaceRef.current;
      if (!node) {
        return;
      }
      const next = resolveStackCardHoverShift({
        containerNode: node,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      setOpponentActiveSingleHoverShift((previous) => {
        if (previous.x === next.x && previous.y === next.y) {
          return previous;
        }
        return next;
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpponentActiveSingleHovering]);

  useEffect(() => {
    const revealRequestsForActor = operationRequests.filter(
      (request) =>
        request?.requestType === 'opponent-reveal-hand' &&
        request?.actorPlayerId === ownerPlayerId
    );

    if (!hasInitializedHandledRevealRef.current) {
      revealRequestsForActor
        .filter((request) => request?.status && request.status !== 'pending')
        .forEach((request) => {
          if (request?.requestId) {
            handledRevealRequestIdsRef.current.add(request.requestId);
          }
        });
      hasInitializedHandledRevealRef.current = true;
      return;
    }

    revealRequestsForActor.forEach((request) => {
      if (!request?.requestId || request.status === 'pending') {
        return;
      }
      if (handledRevealRequestIdsRef.current.has(request.requestId)) {
        return;
      }
      handledRevealRequestIdsRef.current.add(request.requestId);

      if (request.status === 'rejected') {
        pushAlertNotice('相手が手札公開リクエストを拒否しました。');
        return;
      }

      const revealedCardIds = asArray(request?.result?.revealedCardIds).filter(Boolean);
      setOpponentHandRevealState({
        requestId: request.requestId,
        cardIds: revealedCardIds,
      });
      clearMutationNotice();
    });
  }, [clearMutationNotice, operationRequests, ownerPlayerId, pushAlertNotice]);

  useEffect(() => {
    const randomDiscardRequestsForActor = operationRequests.filter(
      (request) =>
        request?.requestType === 'opponent-discard-random-hand' &&
        request?.actorPlayerId === ownerPlayerId
    );

    if (!hasInitializedHandledRandomDiscardRef.current) {
      randomDiscardRequestsForActor
        .filter((request) => request?.status && request.status !== 'pending')
        .forEach((request) => {
          if (request?.requestId) {
            handledRandomDiscardRequestIdsRef.current.add(request.requestId);
          }
        });
      hasInitializedHandledRandomDiscardRef.current = true;
      return;
    }

    randomDiscardRequestsForActor.forEach((request) => {
      if (!request?.requestId || request.status === 'pending') {
        return;
      }
      if (handledRandomDiscardRequestIdsRef.current.has(request.requestId)) {
        return;
      }
      handledRandomDiscardRequestIdsRef.current.add(request.requestId);

      if (request.status === 'rejected') {
        pushAlertNotice('相手が手札ランダム破壊リクエストを拒否しました。');
        return;
      }

      const discardedCount = Math.max(
        Number(request?.result?.discardedCount || 0),
        asArray(request?.result?.discardedCardIds).filter(Boolean).length
      );
      if (discardedCount > 1) {
        pushSuccessNotice(`相手手札からランダムに${discardedCount}枚トラッシュしました。`);
      } else {
        pushSuccessNotice('相手手札からランダムに1枚トラッシュしました。');
      }
    });
  }, [operationRequests, ownerPlayerId, pushAlertNotice, pushSuccessNotice]);

  useEffect(() => {
    const selectedDiscardRequestsForActor = operationRequests.filter(
      (request) =>
        request?.requestType === 'opponent-discard-selected-hand' &&
        request?.actorPlayerId === ownerPlayerId
    );

    if (!hasInitializedHandledSelectedDiscardRef.current) {
      selectedDiscardRequestsForActor
        .filter((request) => request?.status && request.status !== 'pending')
        .forEach((request) => {
          if (request?.requestId) {
            handledSelectedDiscardRequestIdsRef.current.add(request.requestId);
          }
        });
      hasInitializedHandledSelectedDiscardRef.current = true;
      return;
    }

    selectedDiscardRequestsForActor.forEach((request) => {
      if (!request?.requestId || request.status === 'pending') {
        return;
      }
      if (handledSelectedDiscardRequestIdsRef.current.has(request.requestId)) {
        return;
      }
      handledSelectedDiscardRequestIdsRef.current.add(request.requestId);

      if (request.status === 'rejected') {
        pushAlertNotice('相手がカード破壊リクエストを拒否しました。');
        return;
      }

      const discardedCount = Math.max(
        asArray(request?.result?.discardedCardIds).filter(Boolean).length,
        Number(request?.result?.discardedCount || 0)
      );
      if (discardedCount > 1) {
        pushSuccessNotice(`相手手札の指定カードを${discardedCount}枚トラッシュしました。`);
      } else {
        pushSuccessNotice('相手手札の指定カードをトラッシュしました。');
      }
    });
  }, [operationRequests, ownerPlayerId, pushAlertNotice, pushSuccessNotice]);

  useEffect(() => {
    const eventAt = typeof lastDeckShuffleEvent?.at === 'string' ? lastDeckShuffleEvent.at : '';
    if (!hasInitializedDeckShuffleEventRef.current) {
      handledDeckShuffleEventAtRef.current = eventAt;
      hasInitializedDeckShuffleEventRef.current = true;
      return;
    }
    if (!eventAt || handledDeckShuffleEventAtRef.current === eventAt) {
      return;
    }
    handledDeckShuffleEventAtRef.current = eventAt;

    if (lastDeckShuffleEvent?.byPlayerId === ownerPlayerId) {
      pushSuccessNotice('山札がシャッフルされました。');
      return;
    }
    pushSuccessNotice('相手プレイヤーの山札がシャッフルされました。');
  }, [lastDeckShuffleEvent, ownerPlayerId, pushSuccessNotice]);

  useEffect(() => {
    const eventAt = typeof lastDeckInsertEvent?.at === 'string' ? lastDeckInsertEvent.at : '';
    if (!hasInitializedDeckInsertEventRef.current) {
      handledDeckInsertEventAtRef.current = eventAt;
      hasInitializedDeckInsertEventRef.current = true;
      return;
    }
    if (!eventAt || handledDeckInsertEventAtRef.current === eventAt) {
      return;
    }
    handledDeckInsertEventAtRef.current = eventAt;

    const position = lastDeckInsertEvent?.position === 'top' ? '上' : '下';
    if (lastDeckInsertEvent?.byPlayerId === ownerPlayerId) {
      pushSuccessNotice(`カードを山札の${position}に戻しました。`);
      return;
    }
    pushSuccessNotice(`相手がカードを山札の${position}に戻しました。`);
  }, [lastDeckInsertEvent, ownerPlayerId, pushSuccessNotice]);

  const handleCoinToss = useCallback(async () => {
    if (!sessionId || !ownerPlayerId || isCoinSubmitting || isMutating) {
      return;
    }

    const actorUid = getCurrentUid();
    if (!actorUid) {
      pushAlertNotice('認証情報を取得できませんでした。ページを再読み込みしてください。');
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
      pushAlertNotice(
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
      clearMutationNotice();
    } catch (error) {
      if (isGameStateError(error, ERROR_CODES.REVISION_CONFLICT)) {
        pushAlertNotice('他端末の更新と競合しました。最新状態で再実行してください。');
      } else if (isGameStateError(error, ERROR_CODES.PERMISSION_DENIED)) {
        pushAlertNotice('操作権限がありません。セッション参加状態を確認してください。');
      } else {
        pushAlertNotice('操作の確定に失敗しました。再試行してください。');
      }
    } finally {
      setIsCoinSubmitting(false);
    }
  }, [
    clearMutationNotice,
    isCoinSubmitting,
    isMutating,
    ownerPlayerId,
    privateStateDoc,
    pushAlertNotice,
    sessionDoc,
    sessionId,
  ]);

  const executeQuickOperation = useCallback(
    async ({ opId, payload = {}, invalidMessage, successMessage }) => {
      if (
        !sessionId ||
        !ownerPlayerId ||
        isMutating ||
        isCoinSubmitting ||
        isQuickActionSubmitting
      ) {
        return false;
      }

      const actorUid = getCurrentUid();
      if (!actorUid) {
        pushAlertNotice('認証情報を取得できませんでした。ページを再読み込みしてください。');
        return false;
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
        pushAlertNotice(
          resolvedIntent?.message || invalidMessage || '操作を実行できませんでした。状態を確認してください。'
        );
        return false;
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
        if (successMessage) {
          pushSuccessNotice(successMessage);
        } else {
          clearMutationNotice();
        }
        return true;
      } catch (error) {
        if (isGameStateError(error, ERROR_CODES.REVISION_CONFLICT)) {
          pushAlertNotice('他端末の更新と競合しました。最新状態で再実行してください。');
        } else if (isGameStateError(error, ERROR_CODES.PERMISSION_DENIED)) {
          pushAlertNotice('操作権限がありません。セッション参加状態を確認してください。');
        } else {
          pushAlertNotice('操作の確定に失敗しました。再試行してください。');
        }
        return false;
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
      clearMutationNotice,
      pushAlertNotice,
      pushSuccessNotice,
      sessionDoc,
      sessionId,
    ]
  );

  const executeSessionMutation = useCallback(
    async ({ mutate, invalidMessage, successMessage }) => {
      if (!sessionId || !ownerPlayerId) {
        pushAlertNotice('セッション情報が不足しているため操作を確定できません。');
        return false;
      }
      if (isMutating || isCoinSubmitting || isQuickActionSubmitting) {
        return false;
      }

      const actorUid = getCurrentUid();
      if (!actorUid) {
        pushAlertNotice('認証情報を取得できませんでした。ページを再読み込みしてください。');
        return false;
      }

      setIsNoteSubmitting(true);
      try {
        await applySessionMutation({
          sessionId,
          playerId: ownerPlayerId,
          actorUid,
          expectedRevision: Number.isFinite(sessionDoc?.revision) ? sessionDoc.revision : 0,
          mutate,
        });
        if (successMessage) {
          pushSuccessNotice(successMessage);
        } else {
          clearMutationNotice();
        }
        return true;
      } catch (error) {
        if (isGameStateError(error, ERROR_CODES.REVISION_CONFLICT)) {
          pushAlertNotice('他端末の更新と競合しました。最新状態で再実行してください。');
        } else if (isGameStateError(error, ERROR_CODES.PERMISSION_DENIED)) {
          pushAlertNotice('操作権限がありません。セッション参加状態を確認してください。');
        } else {
          pushAlertNotice(invalidMessage || '操作の確定に失敗しました。再試行してください。');
        }
        return false;
      } finally {
        setIsNoteSubmitting(false);
      }
    },
    [
      clearMutationNotice,
      isCoinSubmitting,
      isMutating,
      isQuickActionSubmitting,
      ownerPlayerId,
      pushAlertNotice,
      pushSuccessNotice,
      sessionDoc?.revision,
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

  const handleAdjustStackDamage = useCallback(
    (delta) => {
      const numericDelta = Number(delta);
      if (!Number.isFinite(numericDelta) || numericDelta === 0) {
        return;
      }
      if (!isStackAdjustPopoverOpen) {
        return;
      }

      void executeSessionMutation({
        mutate: ({ sessionDoc: nextSessionDoc }) => {
          const board = nextSessionDoc?.publicState?.players?.[stackAdjustPopoverState.targetPlayerId]?.board;
          const targetStack = resolveStackFromBoard(
            board,
            stackAdjustPopoverState.stackKind,
            stackAdjustPopoverState.stackKind === STACK_KINDS.BENCH
              ? stackAdjustPopoverState.benchIndex
              : null
          );
          if (!targetStack) {
            return;
          }
          const currentDamage = Number(targetStack.damage || 0);
          targetStack.damage = currentDamage + numericDelta;
        },
        invalidMessage: 'ダメージ調整に失敗しました。再試行してください。',
      });
    },
    [
      executeSessionMutation,
      isStackAdjustPopoverOpen,
      stackAdjustPopoverState.benchIndex,
      stackAdjustPopoverState.stackKind,
      stackAdjustPopoverState.targetPlayerId,
    ]
  );

  const handleDeckShuffle = useCallback(() => {
    void executeQuickOperation({
      opId: OPERATION_IDS.OP_B01,
      payload: {},
      invalidMessage: '山札シャッフルを実行できませんでした。状態を確認してください。',
    });
  }, [executeQuickOperation]);

  const handleOpenDeckPeekConfig = useCallback(() => {
    if (playerDeckCount <= 0 || isMutating || isCoinSubmitting || isQuickActionSubmitting) {
      return;
    }
    setIsDeckPeekSelectAll(false);
    setDeckPeekCount(clampPositiveInt(1, Math.max(1, playerDeckCount || 1)));
    setIsDeckPeekConfigOpen(true);
  }, [isCoinSubmitting, isMutating, isQuickActionSubmitting, playerDeckCount]);

  const handleCloseDeckPeekConfig = useCallback(() => {
    setIsDeckPeekSelectAll(false);
    setIsDeckPeekConfigOpen(false);
  }, []);

  const handleDecrementDeckPeekCount = useCallback(() => {
    setDeckPeekCount((previous) =>
      clampPositiveInt(previous - 1, Math.max(1, playerDeckCount || 1))
    );
  }, [playerDeckCount]);

  const handleIncrementDeckPeekCount = useCallback(() => {
    setDeckPeekCount((previous) =>
      clampPositiveInt(previous + 1, Math.max(1, playerDeckCount || 1))
    );
  }, [playerDeckCount]);

  const handleToggleDeckPeekSelectAll = useCallback(
    (event) => {
      const checked = Boolean(event?.target?.checked);
      setIsDeckPeekSelectAll(checked);
      if (checked) {
        setDeckPeekCount(Math.max(1, playerDeckCount || 1));
      } else {
        setDeckPeekCount((previous) =>
          clampPositiveInt(previous, Math.max(1, playerDeckCount || 1))
        );
      }
    },
    [playerDeckCount]
  );

  const handleConfirmDeckPeek = useCallback(async () => {
    const clampedCount = clampPositiveInt(deckPeekCount, Math.max(1, playerDeckCount || 1));
    const succeeded = await executeQuickOperation({
      opId: OPERATION_IDS.OP_A04,
      payload: {
        count: clampedCount,
        note: 'deck-peek-open',
      },
      invalidMessage: '山札閲覧を開始できませんでした。状態を確認してください。',
    });
    if (!succeeded) {
      return;
    }

    setIsDeckPeekOpen(true);
    setIsDeckPeekSelectAll(false);
    setIsDeckPeekConfigOpen(false);
  }, [deckPeekCount, executeQuickOperation, playerDeckCount]);

  const handleCloseDeckPeekModal = useCallback(() => {
    void executeSessionMutation({
      invalidMessage: '山札閲覧モーダルを閉じる処理に失敗しました。再試行してください。',
      mutate: ({ sessionDoc, privateStateDoc, now }) => {
        const deck = asArray(privateStateDoc?.zones?.deck);
        const deckPeek = asArray(privateStateDoc?.zones?.deckPeek);
        if (deckPeek.length > 0) {
          const returningToDeck = deckPeek
            .map((ref) => ref?.cardId)
            .filter(Boolean)
            .map((cardId) => ({
              cardId,
              orientation: 'vertical',
              isFaceDown: true,
              visibility: 'ownerOnly',
            }));
          privateStateDoc.zones.deck = [...returningToDeck, ...deck];
        }
        privateStateDoc.zones.deckPeek = [];

        const counters = sessionDoc?.publicState?.players?.[ownerPlayerId]?.counters;
        if (counters && typeof counters === 'object') {
          counters.deckCount = asArray(privateStateDoc?.zones?.deck).length;
        }

        if (!sessionDoc.publicState.turnContext || typeof sessionDoc.publicState.turnContext !== 'object') {
          sessionDoc.publicState.turnContext = {};
        }
        sessionDoc.publicState.turnContext.deckPeekState = {
          byPlayerId: ownerPlayerId,
          isOpen: false,
          count: 0,
          updatedAt: now,
        };

        return {
          sessionDoc,
          privateStateDoc,
        };
      },
    });
    setIsDeckPeekOpen(false);
  }, [executeSessionMutation, ownerPlayerId]);

  const handleRevealOneMoreDeckCard = useCallback(() => {
    if (!isDeckPeekOpen || playerDeckCount <= 0) {
      return;
    }

    void executeSessionMutation({
      invalidMessage: '山札を追加で閲覧できませんでした。再試行してください。',
      mutate: ({ sessionDoc, privateStateDoc, now }) => {
        const deck = asArray(privateStateDoc?.zones?.deck);
        const deckPeek = asArray(privateStateDoc?.zones?.deckPeek);
        const [nextCardRef] = deck.splice(0, 1);
        if (!nextCardRef?.cardId) {
          return {
            sessionDoc,
            privateStateDoc,
          };
        }

        deckPeek.push({
          cardId: nextCardRef.cardId,
          orientation: 'vertical',
          isFaceDown: false,
          visibility: 'ownerOnly',
        });
        privateStateDoc.zones.deck = deck;
        privateStateDoc.zones.deckPeek = deckPeek;

        const counters = sessionDoc?.publicState?.players?.[ownerPlayerId]?.counters;
        if (counters && typeof counters === 'object') {
          counters.deckCount = deck.length;
        }

        if (!sessionDoc.publicState.turnContext || typeof sessionDoc.publicState.turnContext !== 'object') {
          sessionDoc.publicState.turnContext = {};
        }
        sessionDoc.publicState.turnContext.deckPeekState = {
          byPlayerId: ownerPlayerId,
          isOpen: deckPeek.length > 0,
          count: deckPeek.length,
          updatedAt: now,
        };

        return {
          sessionDoc,
          privateStateDoc,
        };
      },
    });
  }, [executeSessionMutation, isDeckPeekOpen, ownerPlayerId, playerDeckCount]);

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

  const handleToggleOpponentHandMenu = useCallback(() => {
    if (isUiInteractionBlocked || isMutating || isQuickActionSubmitting || isCoinSubmitting) {
      return;
    }
    setIsOpponentHandMenuOpen((prev) => !prev);
  }, [isCoinSubmitting, isMutating, isQuickActionSubmitting, isUiInteractionBlocked]);

  const handleRequestOpponentHandReveal = useCallback(() => {
    setIsOpponentHandMenuOpen(false);
    void executeQuickOperation({
      opId: OPERATION_IDS.OP_A03,
      payload: {
        targetPlayerId: opponentPlayerId,
      },
      invalidMessage: '手札公開リクエストを送信できませんでした。状態を確認してください。',
      successMessage: '手札公開リクエストを送信しました。',
    });
  }, [executeQuickOperation, opponentPlayerId]);

  const handleOpenRandomDiscardConfig = useCallback(() => {
    setIsOpponentHandMenuOpen(false);
    setRandomDiscardCount(clampPositiveInt(1, Math.max(1, opponentHandCount || 1)));
    setIsRandomDiscardConfigOpen(true);
  }, [opponentHandCount]);

  const handleCloseRandomDiscardConfig = useCallback(() => {
    setIsRandomDiscardConfigOpen(false);
  }, []);

  const handleDecrementRandomDiscardCount = useCallback(() => {
    setRandomDiscardCount((previous) =>
      clampPositiveInt(previous - 1, Math.max(1, opponentHandCount || 1))
    );
  }, [opponentHandCount]);

  const handleIncrementRandomDiscardCount = useCallback(() => {
    setRandomDiscardCount((previous) =>
      clampPositiveInt(previous + 1, Math.max(1, opponentHandCount || 1))
    );
  }, [opponentHandCount]);

  const handleConfirmRandomDiscardRequest = useCallback(async () => {
    const clampedCount = clampPositiveInt(randomDiscardCount, Math.max(1, opponentHandCount || 1));
    const succeeded = await executeQuickOperation({
      opId: OPERATION_IDS.OP_B11,
      payload: {
        targetPlayerId: opponentPlayerId,
        count: clampedCount,
      },
      invalidMessage: '手札ランダム破壊リクエストを送信できませんでした。状態を確認してください。',
      successMessage:
        clampedCount > 1
          ? `手札ランダム破壊リクエスト（${clampedCount}枚）を送信しました。`
          : '手札ランダム破壊リクエスト（1枚）を送信しました。',
    });
    if (!succeeded) {
      return;
    }
    setIsRandomDiscardConfigOpen(false);
  }, [executeQuickOperation, opponentHandCount, opponentPlayerId, randomDiscardCount]);

  const handleCloseOpponentHandReveal = useCallback(() => {
    setOpponentHandRevealState({
      requestId: '',
      cardIds: [],
    });
    setOpponentRevealSelectedCardIds([]);
  }, []);

  const handleRequestOpponentSelectedCardDiscard = useCallback(async () => {
    if (!selectedOpponentRevealCardIds.length) {
      pushAlertNotice('破壊対象のカードを選択してください。');
      return;
    }

    const succeeded = await executeQuickOperation({
      opId: OPERATION_IDS.OP_B12,
      payload: {
        targetPlayerId: opponentPlayerId,
        cardIds: selectedOpponentRevealCardIds,
      },
      invalidMessage: 'カード破壊リクエストを送信できませんでした。状態を確認してください。',
      successMessage:
        selectedOpponentRevealCardIds.length > 1
          ? `${selectedOpponentRevealCardIds.length}枚のカード破壊リクエストを送信しました。`
          : 'カード破壊リクエストを送信しました。',
    });

    if (!succeeded) {
      return;
    }

    setOpponentHandRevealState({
      requestId: '',
      cardIds: [],
    });
    setOpponentRevealSelectedCardIds([]);
  }, [executeQuickOperation, opponentPlayerId, pushAlertNotice, selectedOpponentRevealCardIds]);

  const handleApproveBlockingRequest = useCallback(() => {
    if (!blockingRequest?.requestId) {
      return;
    }
    const randomDiscardCountFromRequest = clampPositiveInt(
      blockingRequest?.payload?.count,
      Math.max(1, opponentHandCount || 1)
    );
    const selectedDiscardCount = Math.max(
      asArray(blockingRequest?.payload?.cardIds).filter(Boolean).length,
      blockingRequest?.payload?.cardId ? 1 : 0
    );
    const successMessage =
      blockingRequest?.requestType === 'opponent-discard-random-hand'
        ? randomDiscardCountFromRequest > 1
          ? `自分の手札からランダムに${randomDiscardCountFromRequest}枚トラッシュしました。`
          : '自分の手札からランダムに1枚トラッシュしました。'
        : blockingRequest?.requestType === 'opponent-discard-selected-hand'
          ? selectedDiscardCount > 1
            ? `自分の手札から指定された${selectedDiscardCount}枚をトラッシュしました。`
            : '自分の手札から指定された1枚をトラッシュしました。'
          : 'リクエストを承認して実行しました。';
    void executeQuickOperation({
      opId: INTERNAL_OPERATION_IDS.REQUEST_APPROVE,
      payload: {
        requestId: blockingRequest.requestId,
        action: 'approve',
      },
      invalidMessage: '承認処理を実行できませんでした。状態を確認してください。',
      successMessage,
    });
  }, [blockingRequest, executeQuickOperation, opponentHandCount]);

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

  const handleShareNote = useCallback(async () => {
    const noteText = normalizeNoteText(sharedNoteDraft);
    if (!noteText) {
      pushAlertNotice('共有するノート内容を入力してください。');
      return;
    }

    const succeeded = await executeSessionMutation({
      invalidMessage: 'ノート共有に失敗しました。再試行してください。',
      successMessage: 'ノートを共有しました。',
      mutate: ({ sessionDoc, now }) => {
        const currentNotes = asArray(sessionDoc?.publicState?.sharedNotes);
        const nextNotes = [
          ...currentNotes,
          {
            noteId: `note_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
            text: noteText,
            createdBy: ownerPlayerId,
            createdAt: now,
            updatedBy: ownerPlayerId,
            updatedAt: now,
          },
        ];
        sessionDoc.publicState.sharedNotes = nextNotes;
        return { sessionDoc };
      },
    });

    if (succeeded) {
      setSharedNoteDraft('');
    }
  }, [executeSessionMutation, ownerPlayerId, pushAlertNotice, sharedNoteDraft]);

  const handleStartEditingSharedNote = useCallback((noteId, text) => {
    setEditingSharedNoteId(noteId);
    setEditingSharedNoteDraft(text || '');
  }, []);

  const handleCancelEditingSharedNote = useCallback(() => {
    setEditingSharedNoteId('');
    setEditingSharedNoteDraft('');
  }, []);

  const handleSaveEditingSharedNote = useCallback(async () => {
    if (!editingSharedNoteId) {
      return;
    }
    const noteText = normalizeNoteText(editingSharedNoteDraft);
    if (!noteText) {
      pushAlertNotice('ノート内容を入力してください。');
      return;
    }

    const succeeded = await executeSessionMutation({
      invalidMessage: 'ノート更新に失敗しました。再試行してください。',
      successMessage: 'ノートを更新しました。',
      mutate: ({ sessionDoc, now }) => {
        const currentNotes = asArray(sessionDoc?.publicState?.sharedNotes);
        const nextNotes = currentNotes.map((note) => {
          if (note?.noteId !== editingSharedNoteId) {
            return note;
          }
          return {
            ...note,
            text: noteText,
            updatedBy: ownerPlayerId,
            updatedAt: now,
          };
        });
        sessionDoc.publicState.sharedNotes = nextNotes;
        return { sessionDoc };
      },
    });

    if (succeeded) {
      setEditingSharedNoteId('');
      setEditingSharedNoteDraft('');
    }
  }, [
    editingSharedNoteDraft,
    editingSharedNoteId,
    executeSessionMutation,
    ownerPlayerId,
    pushAlertNotice,
  ]);

  const handleDeleteSharedNote = useCallback(async (noteId) => {
    if (!noteId) {
      return;
    }
    const succeeded = await executeSessionMutation({
      invalidMessage: 'ノート削除に失敗しました。再試行してください。',
      successMessage: 'ノートを削除しました。',
      mutate: ({ sessionDoc }) => {
        const currentNotes = asArray(sessionDoc?.publicState?.sharedNotes);
        sessionDoc.publicState.sharedNotes = currentNotes.filter((note) => note?.noteId !== noteId);
        return { sessionDoc };
      },
    });
    if (succeeded && editingSharedNoteId === noteId) {
      setEditingSharedNoteId('');
      setEditingSharedNoteDraft('');
    }
  }, [editingSharedNoteId, executeSessionMutation]);

  const isQuickActionLocked =
    isMutating ||
    isCoinSubmitting ||
    isQuickActionSubmitting ||
    isUiInteractionBlocked ||
    isDeckPeekOpen;
  const isRandomDiscardAdjustDisabled =
    isQuickActionSubmitting || isMutating || isCoinSubmitting || opponentHandCount <= 1;
  const isRandomDiscardSubmitDisabled =
    isQuickActionSubmitting || isMutating || isCoinSubmitting || opponentHandCount <= 0;
  const randomDiscardMaxCount = Math.max(1, opponentHandCount || 1);
  const displayRandomDiscardCount = clampPositiveInt(randomDiscardCount, randomDiscardMaxCount);
  const isDeckPeekAdjustDisabled =
    isQuickActionSubmitting || isMutating || isCoinSubmitting || playerDeckCount <= 1;
  const isDeckPeekSubmitDisabled =
    isQuickActionSubmitting || isMutating || isCoinSubmitting || playerDeckCount <= 0;
  const deckPeekMaxCount = Math.max(1, playerDeckCount || 1);
  const displayDeckPeekCount = isDeckPeekSelectAll
    ? deckPeekMaxCount
    : clampPositiveInt(deckPeekCount, deckPeekMaxCount);
  const isDeckPeekStepDisabled = isDeckPeekAdjustDisabled || isDeckPeekSelectAll;
  const canRevealOneMoreDeckCard = isDeckPeekOpen && playerDeckCount > 0;
  const opponentDeckPeekState = turnContext?.deckPeekState;
  const opponentDeckPeekCount =
    opponentDeckPeekState &&
    opponentDeckPeekState.isOpen &&
    opponentDeckPeekState.byPlayerId === opponentPlayerId
      ? Math.max(0, Number(opponentDeckPeekState.count) || 0)
      : 0;
  const isDraggingCard = activeDragPayload?.dragType === 'card';
  const isDraggingStack = activeDragPayload?.dragType === 'stack';
  const isDraggingCardFromPlayerStack =
    isDraggingCard && activeDragPayload?.sourceZone === 'player-stack';
  const draggingSourceStackKind =
    activeDragPayload?.sourceStackKind === STACK_KINDS.BENCH ? STACK_KINDS.BENCH : STACK_KINDS.ACTIVE;
  const draggingSourceBenchIndex =
    draggingSourceStackKind === STACK_KINDS.BENCH
      ? Number(activeDragPayload?.sourceBenchIndex)
      : null;
  const draggingSourceStackCardCount = isDraggingCardFromPlayerStack
    ? countCardsInStack(playerBoard, draggingSourceStackKind, draggingSourceBenchIndex)
    : 0;
  const isDraggingSingleStackCardForSwap =
    isDraggingCardFromPlayerStack && draggingSourceStackCardCount === 1;
  const isDraggingStackSwapCandidate = isDraggingStack || isDraggingSingleStackCardForSwap;
  const shouldShowStackInsertTargets = isDraggingCard && !isDraggingStackSwapCandidate;
  const playerActiveCardIds = asArray(playerActive?.cardIds);
  const playerActiveCardCount = playerActiveCardIds.length;
  const opponentActiveCardCount = asArray(opponentActive?.cardIds).length;
  const canDragPlayerActiveSingleCard = playerActiveCardCount === 1;
  const canDragPlayerActiveStackGroup = playerActiveCardCount > 1;
  const playerActiveStackDragPayload = canDragPlayerActiveStackGroup
    ? buildStackDragPayload({
        sourceZone: 'player-stack',
        sourceStackKind: STACK_KINDS.ACTIVE,
        previewCardId: playerActiveCardIds[playerActiveCardCount - 1] || '',
        previewCardIds: playerActiveCardIds,
      })
    : null;
  const isOpponentActiveStackExpanded = isStackModalForZone({
    ownerPlayerId: opponentPlayerId,
    stackKind: STACK_KINDS.ACTIVE,
  });
  const isPlayerActiveStackExpanded = isStackModalForZone({
    ownerPlayerId,
    stackKind: STACK_KINDS.ACTIVE,
  });
  const canShareNote = Boolean(normalizeNoteText(sharedNoteDraft));
  const canDrawFromDeck = playerDeckCount > 0 && !isQuickActionLocked;
  const canShuffleDeck = playerDeckCount > 1 && !isQuickActionLocked;
  const canTakePrize = playerPrizeCount > 0 && !isQuickActionLocked;
  const interactionGuideStyle = interactionGuidePosition.isReady
    ? {
        left: `${interactionGuidePosition.left}px`,
        top: `${interactionGuidePosition.top}px`,
        visibility: 'visible',
      }
    : {
        visibility: 'hidden',
      };

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
      <div ref={boardRootRef} className={`container mt-4 ${styles.boardRoot}`}>
        {mutationNotice.text ? (
          <div
            className={joinClassNames(
              styles.mutationBanner,
              mutationNotice.tone === MUTATION_NOTICE_TONE.ALERT
                ? styles.mutationBannerAlert
                : styles.mutationBannerSuccess
            )}
          >
            {mutationNotice.text}
          </div>
        ) : null}
        {opponentDeckPeekCount > 0 ? (
          <div className={styles.deckPeekLiveBanner}>
            相手が山札を閲覧中（{opponentDeckPeekCount}枚）
          </div>
        ) : null}
        <div className={styles.opponentHandCountFixed} data-zone="opponent-hand-count-fixed">
          <div className={styles.opponentHandControl}>
            <button
              type="button"
              className={styles.handCountPill}
              data-zone="opponent-hand-count-pill"
              aria-label={`相手手札（${opponentHandCount}枚）`}
              aria-haspopup="menu"
              aria-expanded={isOpponentHandMenuOpen}
              onClick={handleToggleOpponentHandMenu}
              disabled={isQuickActionLocked}
            >
              相手手札（{opponentHandCount}枚）
            </button>
            {isOpponentHandMenuOpen ? (
              <div className={styles.opponentHandMenu} role="menu" aria-label="相手手札アクション">
                <button
                  type="button"
                  className={styles.opponentHandMenuButton}
                  onClick={handleRequestOpponentHandReveal}
                  disabled={isQuickActionLocked}
                >
                  手札の公開を要求
                </button>
                <button
                  type="button"
                  className={styles.opponentHandMenuButton}
                  onClick={handleOpenRandomDiscardConfig}
                  disabled={isQuickActionLocked}
                >
                  手札のランダム破壊を要求
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <section className={styles.opponentArea} data-zone="opponent-area" data-drop-group="area">
          <div className={styles.sideColumn}>
            <ZoneTile zone="opponent-lost" title="ロスト（相手）">
              <button
                type="button"
                className={styles.zonePreviewButton}
                onClick={() =>
                  handleTogglePileCards({
                    ownerPlayerId: opponentPlayerId,
                    ownerLabel: '相手',
                    zoneKind: ZONE_KINDS.LOST,
                    sourceZoneId: 'opponent-lost',
                  })
                }
                disabled={opponentLostRefs.length <= 0}
                aria-label="相手ロストを展開"
              >
                <PublicPilePreview
                  cardRefs={opponentLostRefs}
                  cardCatalog={renderCardCatalog}
                  pileLabel="ロスト（相手）"
                  countOverlayClassName={
                    opponentCountFlash.lost ? styles.pileCountOverlayAlert : ''
                  }
                />
              </button>
            </ZoneTile>
            <ZoneTile zone="opponent-discard" title="トラッシュ（相手）">
              <button
                type="button"
                className={styles.zonePreviewButton}
                onClick={() =>
                  handleTogglePileCards({
                    ownerPlayerId: opponentPlayerId,
                    ownerLabel: '相手',
                    zoneKind: ZONE_KINDS.DISCARD,
                    sourceZoneId: 'opponent-discard',
                  })
                }
                disabled={opponentDiscardRefs.length <= 0}
                aria-label="相手トラッシュを展開"
              >
                <PublicPilePreview
                  cardRefs={opponentDiscardRefs}
                  cardCatalog={renderCardCatalog}
                  pileLabel="トラッシュ（相手）"
                  countOverlayClassName={
                    opponentCountFlash.discard ? styles.pileCountOverlayAlert : ''
                  }
                />
              </button>
            </ZoneTile>
            <ZoneTile zone="opponent-deck" title="山札（相手）">
              <DeckPile
                count={opponentDeckCount}
                alt="Opponent Deck"
                countOverlayClassName={opponentCountFlash.deck ? styles.pileCountOverlayAlert : ''}
              />
            </ZoneTile>
          </div>

          <div className={styles.mainColumn}>
            <BenchRow
              owner="opponent"
              ownerPlayerId={opponentPlayerId}
              bench={opponentBench}
              cardCatalog={renderCardCatalog}
              allowCardDrop={false}
              shouldShowStackInsertTargets={shouldShowStackInsertTargets}
              isDraggingStackSwapCandidate={isDraggingStackSwapCandidate}
              isZoneHighlighted={isZoneHighlighted}
              isStackHighlighted={isStackHighlighted}
              isStackModalForZone={isStackModalForZone}
              onToggleStackCards={handleToggleStackCards}
              onOpenStackAdjustPopover={handleOpenStackAdjustPopover}
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
                      {opponentRevealCards.map((card, index) => {
                        const isActive = opponentBoardRevealActiveIndex === index;
                        return (
                          <div
                            key={`opponent-reveal-${card.cardId}-${index}`}
                            ref={(node) => {
                              if (node) {
                                opponentBoardRevealRefs.current[index] = node;
                              } else {
                                delete opponentBoardRevealRefs.current[index];
                              }
                            }}
                            className={joinClassNames(
                              styles.revealCardItem,
                              isActive ? styles.revealCardItemActive : ''
                            )}
                            style={
                              isActive
                                ? {
                                    '--reveal-card-shift-x': `${opponentBoardRevealActiveShift.x}px`,
                                    '--reveal-card-shift-y': `${opponentBoardRevealActiveShift.y}px`,
                                  }
                                : undefined
                            }
                            tabIndex={0}
                            aria-label={`公開カード（相手）${index + 1}を拡大表示`}
                            onMouseEnter={() => setOpponentBoardRevealActiveIndex(index)}
                            onMouseLeave={() => {
                              setOpponentBoardRevealActiveIndex((previous) =>
                                previous === index ? null : previous
                              );
                            }}
                            onFocus={() => setOpponentBoardRevealActiveIndex(index)}
                            onBlur={() => {
                              setOpponentBoardRevealActiveIndex((previous) =>
                                previous === index ? null : previous
                              );
                            }}
                          >
                            <img
                              src={card.imageUrl}
                              alt={`公開カード（相手）${index + 1}`}
                              className={styles.revealCardImage}
                            />
                          </div>
                        );
                      })}
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
                    <div
                      ref={(node) => {
                        if (opponentActiveCardCount === 1) {
                          opponentActiveHoverSurfaceRef.current = node;
                        } else {
                          opponentActiveHoverSurfaceRef.current = null;
                        }
                      }}
                      className={joinClassNames(
                        styles.stackDropSurfaceInner,
                        opponentActiveCardCount === 1 ? styles.stackDropSurfaceHoverable : ''
                      )}
                      style={
                        opponentActiveCardCount === 1
                          ? {
                              '--stack-hover-shift-x': `${opponentActiveSingleHoverShift.x}px`,
                              '--stack-hover-shift-y': `${opponentActiveSingleHoverShift.y}px`,
                            }
                          : undefined
                      }
                      role={opponentActiveCardCount > 1 ? 'button' : undefined}
                      tabIndex={opponentActiveCardCount > 1 ? 0 : undefined}
                      aria-label={
                        opponentActiveCardCount > 1
                          ? (isOpponentActiveStackExpanded
                            ? '相手バトル場の展開を閉じる'
                            : '相手バトル場を展開')
                          : undefined
                      }
                      onMouseEnter={(event) => {
                        if (opponentActiveCardCount !== 1) {
                          return;
                        }
                        activateOpponentActiveSingleHover(event.currentTarget);
                      }}
                      onMouseLeave={() => {
                        if (opponentActiveCardCount !== 1) {
                          return;
                        }
                        clearOpponentActiveSingleHover();
                      }}
                      onClick={(event) => {
                        if (opponentActiveCardCount <= 1) {
                          return;
                        }
                        if (event.target instanceof Element && event.target.closest('button')) {
                          return;
                        }
                        handleToggleStackCards({
                          ownerPlayerId: opponentPlayerId,
                          ownerLabel: '相手',
                          stackKind: STACK_KINDS.ACTIVE,
                          sourceZoneId: `${opponentActiveZoneId}-stack`,
                        });
                      }}
                      onKeyDown={(event) => {
                        if (opponentActiveCardCount <= 1) {
                          return;
                        }
                        if (event.key !== 'Enter' && event.key !== ' ') {
                          return;
                        }
                        event.preventDefault();
                        handleToggleStackCards({
                          ownerPlayerId: opponentPlayerId,
                          ownerLabel: '相手',
                          stackKind: STACK_KINDS.ACTIVE,
                          sourceZoneId: `${opponentActiveZoneId}-stack`,
                        });
                      }}
                      onDoubleClick={(event) => {
                        if (event.target instanceof Element && event.target.closest('button')) {
                          return;
                        }
                        handleOpenStackAdjustPopover({
                          targetPlayerId: opponentPlayerId,
                          stackKind: STACK_KINDS.ACTIVE,
                          benchIndex: null,
                          anchorRect: event.currentTarget.getBoundingClientRect(),
                        });
                      }}
                    >
                      <Pokemon {...toPokemonProps(opponentActive, renderCardCatalog)} />
                    </div>
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
              <PrizeFan
                count={opponentPrizeCount}
                countOverlayClassName={opponentCountFlash.prize ? styles.pileCountOverlayAlert : ''}
              />
            </ZoneTile>
          </div>
        </section>

        <div className={styles.areaDivider} aria-hidden />

        <section className={styles.playerArea} data-zone="player-area" data-drop-group="area">
          <div className={styles.sideColumn}>
            <ZoneTile
              zone="player-prize"
              title="サイド（自分）"
              dropPayload={playerPrizeDropPayload}
              isHighlighted={isZoneHighlighted('player-prize')}
              className={joinClassNames(styles.prizeZoneTile, styles.playerPrizeZoneTile)}
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
            <div className={`${styles.activeRow} ${styles.battleLineRow} ${styles.battleLineRowWithAux}`.trim()}>
              <div className={styles.playerBattleAux}>
                <div className={styles.stadiumCoinRow}>
                  <DroppableZone
                    dropId="zone-center-stadium"
                    dropPayload={playerStadiumDropPayload}
                    className={joinClassNames(styles.centerZone, styles.inlineStadiumZone)}
                    activeClassName={styles.dropZoneActive}
                    isHighlighted={isZoneHighlighted('center-stadium')}
                    data-zone="center-stadium"
                    data-drop-group="stadium"
                  >
                    <p className={styles.zoneTitle}>スタジアム</p>
                    {stadiumCardId && stadiumCardImageUrl ? (
                      canDragStadiumCard ? (
                        <DraggableCard
                          dragId={`stadium-card-${stadiumCardId}`}
                          dragPayload={stadiumCardDragPayload}
                          className={styles.stadiumCardDraggable}
                          draggingClassName={styles.draggingSource}
                        >
                          <img
                            src={stadiumCardImageUrl}
                            alt="場に出ているスタジアムカード"
                            className={styles.stadiumCardImage}
                          />
                        </DraggableCard>
                      ) : (
                        <img
                          src={stadiumCardImageUrl}
                          alt="場に出ているスタジアムカード"
                          className={styles.stadiumCardImage}
                        />
                      )
                    ) : (
                      <span className={styles.zoneValueMuted}>なし</span>
                    )}
                    {stadiumCardId && stadiumOwnerLabel ? (
                      <span className={styles.stadiumOwnerLabel}>{stadiumOwnerLabel}が配置</span>
                    ) : null}
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
              </div>
              <DroppableZone
                dropId={`zone-${playerActiveZoneId}`}
                dropPayload={
                  playerActive
                    ? isDraggingStackSwapCandidate
                      ? playerActiveDropPayload
                      : null
                    : playerActiveDropPayload
                }
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
                    <div
                      className={joinClassNames(
                        styles.stackDropSurfaceInner,
                        playerActiveCardCount === 1 ? styles.stackDropSurfaceHoverable : ''
                      )}
                      role={playerActiveCardCount > 1 ? 'button' : undefined}
                      tabIndex={playerActiveCardCount > 1 ? 0 : undefined}
                      aria-label={
                        playerActiveCardCount > 1
                          ? (isPlayerActiveStackExpanded
                            ? '自分バトル場の展開を閉じる'
                            : '自分バトル場を展開')
                          : undefined
                      }
                      onClick={(event) => {
                        if (playerActiveCardCount <= 1) {
                          return;
                        }
                        if (event.target instanceof Element && event.target.closest('button')) {
                          return;
                        }
                        handleToggleStackCards({
                          ownerPlayerId,
                          ownerLabel: '自分',
                          stackKind: STACK_KINDS.ACTIVE,
                          sourceZoneId: `${playerActiveZoneId}-stack`,
                        });
                      }}
                      onKeyDown={(event) => {
                        if (playerActiveCardCount <= 1) {
                          return;
                        }
                        if (event.key !== 'Enter' && event.key !== ' ') {
                          return;
                        }
                        event.preventDefault();
                        handleToggleStackCards({
                          ownerPlayerId,
                          ownerLabel: '自分',
                          stackKind: STACK_KINDS.ACTIVE,
                          sourceZoneId: `${playerActiveZoneId}-stack`,
                        });
                      }}
                      onDoubleClick={(event) => {
                        if (event.target instanceof Element && event.target.closest('button')) {
                          return;
                        }
                        handleOpenStackAdjustPopover({
                          targetPlayerId: ownerPlayerId,
                          stackKind: STACK_KINDS.ACTIVE,
                          benchIndex: null,
                          anchorRect: event.currentTarget.getBoundingClientRect(),
                        });
                      }}
                    >
                      {shouldShowStackInsertTargets ? (
                        <div className={styles.stackInsertTargets}>
                          <DroppableZone
                            dropId="zone-player-active-insert-top"
                            dropPayload={buildZoneDropPayload({
                              zoneId: 'player-active-insert-top',
                              targetPlayerId: ownerPlayerId,
                              zoneKind: ZONE_KINDS.ACTIVE,
                              edge: 'top',
                            })}
                            className={joinClassNames(
                              styles.stackInsertTarget,
                              styles.stackInsertTargetTop
                            )}
                            activeClassName={styles.stackInsertTargetTopActive}
                            isHighlighted={isZoneHighlighted('player-active-insert-top')}
                          >
                            <span className={styles.deckInsertLabel}>上に重ねる</span>
                          </DroppableZone>
                          <DroppableZone
                            dropId="zone-player-active-insert-bottom"
                            dropPayload={buildZoneDropPayload({
                              zoneId: 'player-active-insert-bottom',
                              targetPlayerId: ownerPlayerId,
                              zoneKind: ZONE_KINDS.ACTIVE,
                              edge: 'bottom',
                            })}
                            className={joinClassNames(
                              styles.stackInsertTarget,
                              styles.stackInsertTargetBottom
                            )}
                            activeClassName={styles.stackInsertTargetBottomActive}
                            isHighlighted={isZoneHighlighted('player-active-insert-bottom')}
                          >
                            <span className={styles.deckInsertLabel}>下に重ねる</span>
                          </DroppableZone>
                        </div>
                      ) : null}
                      {canDragPlayerActiveSingleCard ? (
                        <DraggableCard
                          dragId={`stack-single-player-active-${playerActiveCardIds[0]}`}
                          dragPayload={buildCardDragPayload({
                            cardId: playerActiveCardIds[0],
                            sourceZone: 'player-stack',
                            sourceStackKind: STACK_KINDS.ACTIVE,
                          })}
                          className={joinClassNames(
                            styles.stackSingleCardDraggable,
                            styles.stackDropSurfaceHoverable
                          )}
                          draggingClassName={styles.draggingSource}
                        >
                          <div className={styles.stackSingleCardButton}>
                            <Pokemon {...toPokemonProps(playerActive, normalizedPlayerCatalog)} />
                          </div>
                        </DraggableCard>
                      ) : canDragPlayerActiveStackGroup && playerActiveStackDragPayload ? (
                        <DraggableCard
                          dragId={`stack-group-player-active-${resolveStackId(playerActive, `s_${ownerPlayerId}_active`)}`}
                          dragPayload={playerActiveStackDragPayload}
                          className={styles.stackGroupDraggable}
                          draggingClassName={styles.draggingSource}
                        >
                          <Pokemon {...toPokemonProps(playerActive, normalizedPlayerCatalog)} />
                        </DraggableCard>
                      ) : (
                        <Pokemon {...toPokemonProps(playerActive, normalizedPlayerCatalog)} />
                      )}
                    </div>
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
              shouldShowStackInsertTargets={shouldShowStackInsertTargets}
              isDraggingStackSwapCandidate={isDraggingStackSwapCandidate}
              isZoneHighlighted={isZoneHighlighted}
              isStackHighlighted={isStackHighlighted}
              isStackModalForZone={isStackModalForZone}
              onToggleStackCards={handleToggleStackCards}
              onOpenStackAdjustPopover={handleOpenStackAdjustPopover}
            />
          </div>

          <div className={styles.sideColumn}>
            <ZoneTile zone="player-deck" title="山札（自分）">
              <div className={styles.deckZoneBody}>
                <div className={styles.deckPileTarget}>
                  {playerDeckCount > 0 ? (
                    <DraggableCard
                      dragId={`pile-player-deck-${ownerPlayerId}`}
                      dragPayload={buildPileCardDragPayload({
                        sourceZone: 'player-deck',
                        availableCount: playerDeckCount,
                      })}
                      className={styles.pileCardDraggable}
                    >
                      <DeckPile
                        count={displayPlayerDeckCount}
                        alt="Player Deck"
                        onActivate={!isQuickActionLocked ? handleOpenDeckPeekConfig : null}
                      />
                    </DraggableCard>
                  ) : (
                    <DeckPile count={displayPlayerDeckCount} alt="Player Deck" />
                  )}
                  {isDraggingCard ? (
                    <div className={styles.deckInsertTargets}>
                      <DroppableZone
                        dropId="zone-player-deck-insert-top"
                        dropPayload={playerDeckTopDropPayload}
                        className={joinClassNames(
                          styles.deckInsertTarget,
                          styles.deckInsertTargetTop
                        )}
                        activeClassName={styles.deckInsertTargetTopActive}
                        isHighlighted={isZoneHighlighted('player-deck-insert-top')}
                      >
                        <span className={styles.deckInsertLabel}>上に戻す</span>
                      </DroppableZone>
                      <DroppableZone
                        dropId="zone-player-deck-insert-bottom"
                        dropPayload={playerDeckBottomDropPayload}
                        className={joinClassNames(
                          styles.deckInsertTarget,
                          styles.deckInsertTargetBottom
                        )}
                        activeClassName={styles.deckInsertTargetBottomActive}
                        isHighlighted={isZoneHighlighted('player-deck-insert-bottom')}
                      >
                        <span className={styles.deckInsertLabel}>下に戻す</span>
                      </DroppableZone>
                    </div>
                  ) : null}
                </div>
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
              <button
                type="button"
                className={styles.zonePreviewButton}
                onClick={() =>
                  handleTogglePileCards({
                    ownerPlayerId,
                    ownerLabel: '自分',
                    zoneKind: ZONE_KINDS.DISCARD,
                    sourceZoneId: 'player-discard',
                  })
                }
                disabled={playerDiscardRefs.length <= 0}
                aria-label="自分トラッシュを展開"
              >
                <PublicPilePreview
                  cardRefs={playerDiscardRefs}
                  cardCatalog={renderCardCatalog}
                  pileLabel="トラッシュ（自分）"
                />
              </button>
            </ZoneTile>
            <ZoneTile
              zone="player-lost"
              title="ロスト（自分）"
              dropPayload={playerLostDropPayload}
              isHighlighted={isZoneHighlighted('player-lost')}
            >
              <button
                type="button"
                className={styles.zonePreviewButton}
                onClick={() =>
                  handleTogglePileCards({
                    ownerPlayerId,
                    ownerLabel: '自分',
                    zoneKind: ZONE_KINDS.LOST,
                    sourceZoneId: 'player-lost',
                  })
                }
                disabled={playerLostRefs.length <= 0}
                aria-label="自分ロストを展開"
              >
                <PublicPilePreview
                  cardRefs={playerLostRefs}
                  cardCatalog={renderCardCatalog}
                  pileLabel="ロスト（自分）"
                />
              </button>
            </ZoneTile>
          </div>
        </section>

        <aside
          ref={interactionGuideRef}
          className={styles.interactionGuide}
          style={interactionGuideStyle}
          aria-label="操作ヒント"
        >
          <p className={styles.interactionGuideTitle}>操作ヒント</p>
          <p className={styles.interactionGuideLine}>山札: クリックで閲覧</p>
          <p className={styles.interactionGuideLine}>トラッシュ/ロスト: クリックで展開・閉じる</p>
          <p className={styles.interactionGuideLine}>ベンチ/バトル場: クリックで展開、ダブルクリックで回復</p>
          <p className={styles.interactionGuideLine}>相手手札: クリックで公開/ランダム破壊を要求</p>
        </aside>

        <HandTray
          cards={playerHandCards}
          isOpen={isHandOpen}
          onToggle={handleHandToggle}
          dropPayload={playerHandDropPayload}
          isDropHighlighted={isZoneHighlighted('player-hand')}
        />
        <ToolboxPanel
          isOpen={isToolboxOpen}
          onToggle={handleToolboxToggle}
          dropPayload={toolboxDropPayload}
          isDropHighlighted={isZoneHighlighted('toolbox-panel')}
        />
        <OperationPanel
          sessionId={sessionId}
          playerId={ownerPlayerId}
          sessionDoc={sessionDoc}
          privateStateDoc={privateStateDoc}
          onMutationMessage={handleExternalMutationMessage}
        />
        <aside className={styles.sharedNotesRoot} data-zone="shared-notes-panel">
          <div className={styles.sharedNotesList}>
            {sharedNotes.length > 0 ? (
              sharedNotes.map((note) => {
                const isEditing = editingSharedNoteId === note.noteId;
                return (
                  <article
                    key={note.noteId}
                    className={styles.sharedNoteItem}
                    data-zone={`shared-note-${note.noteId}`}
                  >
                    {isEditing ? (
                      <div className={styles.sharedNoteEditor}>
                        <textarea
                          className={styles.sharedNoteTextarea}
                          rows={5}
                          maxLength={NOTE_MAX_LENGTH}
                          value={editingSharedNoteDraft}
                          onChange={(event) => setEditingSharedNoteDraft(event.target.value)}
                          placeholder="ノートを編集"
                          aria-label="共有ノート編集入力"
                        />
                        <div className={styles.sharedNoteActions}>
                          <button
                            type="button"
                            className={styles.sharedNoteActionButton}
                            onClick={handleSaveEditingSharedNote}
                            disabled={isNoteSubmitting}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            className={styles.sharedNoteActionButton}
                            onClick={handleCancelEditingSharedNote}
                            disabled={isNoteSubmitting}
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className={styles.sharedNoteText}>{note.text}</p>
                        <div className={styles.sharedNoteMetaRow}>
                          <span className={styles.sharedNoteMeta}>
                            {note.updatedBy || note.createdBy || 'unknown'}
                          </span>
                          <div className={styles.sharedNoteIconActions}>
                            <button
                              type="button"
                              className={styles.sharedNoteIconButton}
                              onClick={() => handleStartEditingSharedNote(note.noteId, note.text)}
                              disabled={isNoteSubmitting}
                              aria-label="ノートを編集"
                            >
                              <FontAwesomeIcon icon={faEdit} />
                            </button>
                            <button
                              type="button"
                              className={styles.sharedNoteIconButton}
                              onClick={() => handleDeleteSharedNote(note.noteId)}
                              disabled={isNoteSubmitting}
                              aria-label="ノートを削除"
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </article>
                );
              })
            ) : (
              <p className={styles.panelEmptyText}>共有ノートはありません。</p>
            )}
          </div>
          <div className={styles.sharedNotesComposer}>
            <textarea
              className={styles.sharedNoteTextarea}
              rows={5}
              maxLength={NOTE_MAX_LENGTH}
              value={sharedNoteDraft}
              onChange={(event) => setSharedNoteDraft(event.target.value)}
              placeholder="共有ノートを入力"
              aria-label="共有ノート入力"
            />
            <button
              type="button"
              className={styles.sharedNoteShareButton}
              onClick={handleShareNote}
              disabled={!canShareNote || isNoteSubmitting}
            >
              共有する
            </button>
          </div>
        </aside>
      </div>
      {isDeckPeekOpen ? (
        <DeckPeekModal
          cards={deckPeekCards}
          onClose={handleCloseDeckPeekModal}
          onRevealOneMore={handleRevealOneMoreDeckCard}
          canRevealOneMore={canRevealOneMoreDeckCard}
        />
      ) : null}
      {isStackModalOpen ? (
        <StackCardsModal
          title={stackModalTitle}
          cards={stackModalCards}
          onClose={handleCloseStackCards}
          allowCardDrag={stackModalAllowsDrag}
          sourceStackKind={stackModalState.stackKind}
          sourceBenchIndex={stackModalState.benchIndex}
          initialAnchorRect={stackModalState.anchorRect}
        />
      ) : null}
      {isPileModalOpen ? (
        <StackCardsModal
          title={pileModalTitle}
          cards={pileModalCards}
          onClose={handleClosePileCards}
          allowCardDrag={pileModalAllowsDrag}
          dragSourceZone={pileModalDragSourceZone}
          initialAnchorRect={pileModalState.anchorRect}
          modalAriaLabel="ゾーン展開モーダル"
          modalDataZone="zone-cards-root"
        />
      ) : null}
      {isStackAdjustPopoverOpen ? (
        <StackAdjustPopover
          isOpen={isStackAdjustPopoverOpen}
          anchorRect={stackAdjustPopoverState.anchorRect}
          targetPlayerId={stackAdjustPopoverState.targetPlayerId}
          stackKind={stackAdjustPopoverState.stackKind}
          benchIndex={stackAdjustPopoverState.benchIndex}
          damage={stackAdjustPopoverDamage}
          statusBadges={stackAdjustPopoverStatusBadges}
          isLocked={isUiInteractionBlocked || isMutating}
          onAdjustDamage={handleAdjustStackDamage}
          onClose={handleCloseStackAdjustPopover}
        />
      ) : null}
      {!hasBlockingRequest && isOpponentHandRevealOpen ? (
        <div className={styles.requestBlockingOverlay} role="dialog" aria-modal="true">
          <div
            className={styles.opponentRevealCard}
            style={{ '--opponent-reveal-columns': String(opponentRevealColumnCount) }}
          >
            <p className={styles.requestBlockingTitle}>
              相手の手札（{opponentHandRevealCards.length}枚）
            </p>
            <div className={styles.opponentRevealCards}>
              {opponentHandRevealCards.length > 0 ? (
                opponentHandRevealCards.map((card, index) => {
                  const isActive = opponentRevealActiveIndex === index;
                  const isSelected = selectedOpponentRevealCardIds.includes(card.cardId);

                  if (card.imageUrl) {
                    return (
                      <div
                        key={`${opponentHandRevealState.requestId}-${card.cardId}-${index}`}
                        className={joinClassNames(
                          styles.popupCardItem,
                          isActive ? styles.popupCardItemActive : ''
                        )}
                      >
                        <button
                          ref={(node) => {
                            if (node) {
                              opponentRevealButtonRefs.current[index] = node;
                            } else {
                              delete opponentRevealButtonRefs.current[index];
                            }
                          }}
                          type="button"
                          className={joinClassNames(
                            styles.popupCardButton,
                            isActive ? styles.popupCardButtonActive : '',
                            isSelected ? styles.popupCardButtonSelected : ''
                          )}
                          style={
                            isActive
                              ? {
                                  '--popup-card-shift-x': `${opponentRevealActiveShift.x}px`,
                                  '--popup-card-shift-y': `${opponentRevealActiveShift.y}px`,
                                  '--popup-card-scale': String(POPUP_CARD_HOVER_SCALE),
                                }
                              : undefined
                          }
                          aria-label={`公開手札 ${index + 1} を拡大表示`}
                          onMouseEnter={() => setOpponentRevealActiveIndex(index)}
                          onMouseLeave={() => setOpponentRevealActiveIndex(null)}
                          onFocus={() => setOpponentRevealActiveIndex(index)}
                          onBlur={() => setOpponentRevealActiveIndex(null)}
                          onDoubleClick={() =>
                            setOpponentRevealSelectedCardIds((previous) => {
                              const targetCardId = card.cardId;
                              if (!targetCardId) {
                                return previous;
                              }
                              if (previous.includes(targetCardId)) {
                                return previous.filter((entry) => entry !== targetCardId);
                              }
                              return [...previous, targetCardId];
                            })
                          }
                        >
                          <img
                            src={card.imageUrl}
                            alt={`公開手札 ${index + 1}`}
                            className={joinClassNames(
                              styles.opponentRevealCardImage,
                              styles.popupCardImage
                            )}
                          />
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`${opponentHandRevealState.requestId}-${card.cardId}-${index}`}
                      className={styles.opponentRevealCardFallback}
                    >
                      {card.cardId}
                    </div>
                  );
                })
              ) : (
                <p className={styles.requestBlockingMeta}>公開カードはありません。</p>
              )}
            </div>
            <p className={styles.requestBlockingMeta}>
              破壊したいカードをダブルクリックして選択できます。
            </p>
            <div className={styles.requestBlockingActions}>
              <button
                type="button"
                className={styles.requestRejectButton}
                onClick={handleRequestOpponentSelectedCardDiscard}
                disabled={
                  selectedOpponentRevealCardCount === 0 ||
                  isQuickActionSubmitting ||
                  isMutating ||
                  isCoinSubmitting
                }
              >
                選択されたカードの破壊を要求
              </button>
              <button
                type="button"
                className={styles.requestApproveButton}
                onClick={handleCloseOpponentHandReveal}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {!hasBlockingRequest && isRandomDiscardConfigOpen ? (
        <div className={styles.requestBlockingOverlay} role="dialog" aria-modal="true">
          <div className={styles.randomDiscardConfigCard}>
            <p className={styles.requestBlockingTitle}>手札のランダム破壊を要求</p>
            <p className={styles.requestBlockingMeta}>
              枚数を選択してください（相手手札: {opponentHandCount}枚）
            </p>
            <div className={styles.randomDiscardCountRow}>
              <button
                type="button"
                className={styles.randomDiscardStepButton}
                onClick={handleDecrementRandomDiscardCount}
                disabled={isRandomDiscardAdjustDisabled || displayRandomDiscardCount <= 1}
                aria-label="要求枚数を1枚減らす"
              >
                -
              </button>
              <span className={styles.randomDiscardCountValue}>{displayRandomDiscardCount} 枚</span>
              <button
                type="button"
                className={styles.randomDiscardStepButton}
                onClick={handleIncrementRandomDiscardCount}
                disabled={
                  isRandomDiscardAdjustDisabled || displayRandomDiscardCount >= randomDiscardMaxCount
                }
                aria-label="要求枚数を1枚増やす"
              >
                +
              </button>
            </div>
            <p className={styles.randomDiscardHint}>
              {opponentHandCount <= 0 ? '相手手札が0枚のため要求できません。' : '相手の承認後に実行されます。'}
            </p>
            <div className={styles.requestBlockingActions}>
              <button
                type="button"
                className={styles.requestApproveButton}
                onClick={handleConfirmRandomDiscardRequest}
                disabled={isRandomDiscardSubmitDisabled}
              >
                枚数を確定
              </button>
              <button
                type="button"
                className={styles.requestRejectButton}
                onClick={handleCloseRandomDiscardConfig}
                disabled={isQuickActionSubmitting || isMutating || isCoinSubmitting}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {!hasBlockingRequest && isDeckPeekConfigOpen ? (
        <div className={styles.requestBlockingOverlay} role="dialog" aria-modal="true">
          <div className={styles.randomDiscardConfigCard}>
            <p className={styles.requestBlockingTitle}>山札を閲覧</p>
            <p className={styles.requestBlockingMeta}>
              枚数を選択してください（山札: {playerDeckCount}枚）
            </p>
            <div className={styles.randomDiscardCountRow}>
              <button
                type="button"
                className={styles.randomDiscardStepButton}
                onClick={handleDecrementDeckPeekCount}
                disabled={isDeckPeekStepDisabled || displayDeckPeekCount <= 1}
                aria-label="閲覧枚数を1枚減らす"
              >
                -
              </button>
              <span className={styles.randomDiscardCountValue}>{displayDeckPeekCount} 枚</span>
              <button
                type="button"
                className={styles.randomDiscardStepButton}
                onClick={handleIncrementDeckPeekCount}
                disabled={isDeckPeekStepDisabled || displayDeckPeekCount >= deckPeekMaxCount}
                aria-label="閲覧枚数を1枚増やす"
              >
                +
              </button>
            </div>
            <label className={styles.deckPeekSelectAllRow}>
              <input
                type="checkbox"
                className={styles.deckPeekSelectAllCheckbox}
                checked={isDeckPeekSelectAll}
                onChange={handleToggleDeckPeekSelectAll}
                disabled={isQuickActionSubmitting || isMutating || isCoinSubmitting || playerDeckCount <= 0}
                aria-label="閲覧枚数を全て選択"
              />
              全て（{deckPeekMaxCount}枚）
            </label>
            <p className={styles.randomDiscardHint}>
              {playerDeckCount <= 0 ? '山札が0枚のため閲覧できません。' : '枚数確定後に山札モーダルが開きます。'}
            </p>
            <div className={styles.requestBlockingActions}>
              <button
                type="button"
                className={styles.requestApproveButton}
                onClick={handleConfirmDeckPeek}
                disabled={isDeckPeekSubmitDisabled}
              >
                枚数を確定
              </button>
              <button
                type="button"
                className={styles.requestRejectButton}
                onClick={handleCloseDeckPeekConfig}
                disabled={isQuickActionSubmitting || isMutating || isCoinSubmitting}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
            {blockingRequest?.requestType === 'opponent-discard-selected-hand' ? (
              <div className={styles.requestBlockingSelectedCards}>
                {blockingRequestCardImageUrls.length > 0 ? (
                  blockingRequestCardImageUrls.map((imageUrl, index) => (
                    <img
                      key={`request-card-${index + 1}`}
                      src={imageUrl}
                      alt={`相手が破壊を要求しているカード ${index + 1}`}
                      className={styles.requestBlockingSelectedCardImage}
                    />
                  ))
                ) : (
                  <p className={styles.requestBlockingMeta}>
                    対象カード: {blockingRequestCardIds.length > 0 ? `${blockingRequestCardIds.length}枚` : '不明'}
                  </p>
                )}
              </div>
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
