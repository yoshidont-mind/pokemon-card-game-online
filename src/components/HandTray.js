import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useDroppable } from '@dnd-kit/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsUpDownLeftRight } from '@fortawesome/free-solid-svg-icons';
import styles from '../css/playingField.module.css';
import DraggableCard from './dnd/DraggableCard';
import { buildCardDragPayload } from '../interaction/dnd/buildDragPayload';

const HAND_TRAY_PANEL_ID = 'hand-tray-panel';
const HAND_TRAY_POSITION_STORAGE_KEY = 'pcgo:hand-tray-position:v1';
const VIEWPORT_MARGIN_PX = 8;
const HAND_CARD_HOVER_SCALE = 5;
const HAND_CARD_BASE_SHIFT = Object.freeze({
  x: 0,
  y: -40,
});
const HAND_CARD_VIEWPORT_MARGIN_PX = 6;

function asFiniteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampTrayPosition({ x, y, width, height }) {
  if (typeof window === 'undefined') {
    return { x, y };
  }

  const maxX = Math.max(VIEWPORT_MARGIN_PX, window.innerWidth - width - VIEWPORT_MARGIN_PX);
  const maxY = Math.max(VIEWPORT_MARGIN_PX, window.innerHeight - height - VIEWPORT_MARGIN_PX);

  return {
    x: clampValue(x, VIEWPORT_MARGIN_PX, maxX),
    y: clampValue(y, VIEWPORT_MARGIN_PX, maxY),
  };
}

function readStoredTrayPosition() {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(HAND_TRAY_POSITION_STORAGE_KEY);
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

function writeStoredTrayPosition(position) {
  if (typeof window === 'undefined' || !position) {
    return;
  }
  try {
    window.localStorage.setItem(HAND_TRAY_POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch (_error) {
    // no-op
  }
}

function clearStoredTrayPosition() {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.removeItem(HAND_TRAY_POSITION_STORAGE_KEY);
  } catch (_error) {
    // no-op
  }
}

function resolveHandCardHoverShift({ buttonRect, viewportWidth, viewportHeight }) {
  if (!buttonRect || !Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)) {
    return { ...HAND_CARD_BASE_SHIFT };
  }

  const originX = buttonRect.left + buttonRect.width / 2;
  const originY = buttonRect.bottom;

  const scaledLeft = originX + (buttonRect.left - originX) * HAND_CARD_HOVER_SCALE;
  const scaledRight = originX + (buttonRect.right - originX) * HAND_CARD_HOVER_SCALE;
  const scaledTop = originY + (buttonRect.top - originY) * HAND_CARD_HOVER_SCALE;
  const scaledBottom = originY + (buttonRect.bottom - originY) * HAND_CARD_HOVER_SCALE;

  const minShiftX = HAND_CARD_VIEWPORT_MARGIN_PX - scaledLeft;
  const maxShiftX = viewportWidth - HAND_CARD_VIEWPORT_MARGIN_PX - scaledRight;
  const minShiftY = HAND_CARD_VIEWPORT_MARGIN_PX - scaledTop;
  const maxShiftY = viewportHeight - HAND_CARD_VIEWPORT_MARGIN_PX - scaledBottom;

  const resolvedX =
    minShiftX <= maxShiftX
      ? clampValue(HAND_CARD_BASE_SHIFT.x, minShiftX, maxShiftX)
      : (minShiftX + maxShiftX) / 2;
  const resolvedY =
    minShiftY <= maxShiftY
      ? clampValue(HAND_CARD_BASE_SHIFT.y, minShiftY, maxShiftY)
      : (minShiftY + maxShiftY) / 2;

  return {
    x: Math.round(resolvedX),
    y: Math.round(resolvedY),
  };
}

const HandTray = ({
  cards = [],
  isOpen = false,
  onToggle = () => {},
  dropPayload = null,
  isDropHighlighted = false,
}) => {
  const normalizedCards = useMemo(
    () =>
      cards
        .map((entry, index) => {
          if (typeof entry === 'string') {
            return {
              cardId: `legacy-card-${index + 1}`,
              imageUrl: entry,
            };
          }

          if (!entry || typeof entry !== 'object') {
            return null;
          }

          return {
            cardId: entry.cardId || `legacy-card-${index + 1}`,
            imageUrl: entry.imageUrl || null,
          };
        })
        .filter((entry) => Boolean(entry?.imageUrl)),
    [cards]
  );

  const cardCount = normalizedCards.length;
  const handColumnCount = Math.max(1, Math.min(10, cardCount));
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [pinnedIndex, setPinnedIndex] = useState(null);
  const [activeCardShift, setActiveCardShift] = useState(() => ({ ...HAND_CARD_BASE_SHIFT }));
  const [trayPosition, setTrayPosition] = useState(() => readStoredTrayPosition());
  const [isTrayDragging, setIsTrayDragging] = useState(false);
  const trayRootRef = useRef(null);
  const cardButtonRefs = useRef({});
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const dragSizeRef = useRef({ width: 0, height: 0 });
  const { setNodeRef: setHandDropRef } = useDroppable({
    id: 'zone-player-hand',
    data: {
      dropPayload,
    },
    disabled: !dropPayload,
  });

  const setTrayNodeRef = useCallback(
    (node) => {
      trayRootRef.current = node;
      if (dropPayload) {
        setHandDropRef(node);
      }
    },
    [dropPayload, setHandDropRef]
  );

  useEffect(() => {
    if (!isOpen) {
      setHoveredIndex(null);
      setPinnedIndex(null);
    }
  }, [isOpen]);

  const activeIndex = useMemo(() => {
    if (hoveredIndex !== null && normalizedCards[hoveredIndex]) {
      return hoveredIndex;
    }
    if (pinnedIndex !== null && normalizedCards[pinnedIndex]) {
      return pinnedIndex;
    }
    return null;
  }, [normalizedCards, hoveredIndex, pinnedIndex]);

  const recalcActiveCardShift = useCallback(() => {
    if (!isOpen || activeIndex === null || typeof window === 'undefined') {
      setActiveCardShift((previous) => {
        if (
          previous.x === HAND_CARD_BASE_SHIFT.x &&
          previous.y === HAND_CARD_BASE_SHIFT.y
        ) {
          return previous;
        }
        return { ...HAND_CARD_BASE_SHIFT };
      });
      return;
    }

    const buttonNode = cardButtonRefs.current[activeIndex];
    if (!buttonNode) {
      setActiveCardShift((previous) => {
        if (
          previous.x === HAND_CARD_BASE_SHIFT.x &&
          previous.y === HAND_CARD_BASE_SHIFT.y
        ) {
          return previous;
        }
        return { ...HAND_CARD_BASE_SHIFT };
      });
      return;
    }

    const next = resolveHandCardHoverShift({
      buttonRect: buttonNode.getBoundingClientRect(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });

    setActiveCardShift((previous) => {
      if (previous.x === next.x && previous.y === next.y) {
        return previous;
      }
      return next;
    });
  }, [activeIndex, isOpen]);

  useEffect(() => {
    recalcActiveCardShift();
  }, [recalcActiveCardShift, trayPosition]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isOpen || activeIndex === null) {
      return undefined;
    }

    const handleResize = () => {
      recalcActiveCardShift();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeIndex, isOpen, recalcActiveCardShift]);

  useEffect(() => {
    if (!trayPosition) {
      return;
    }
    writeStoredTrayPosition(trayPosition);
  }, [trayPosition]);

  useEffect(() => {
    if (!trayPosition || typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => {
      const trayRootNode = trayRootRef.current;
      if (!trayRootNode) {
        return;
      }
      const rect = trayRootNode.getBoundingClientRect();
      const next = clampTrayPosition({
        x: trayPosition.x,
        y: trayPosition.y,
        width: rect.width,
        height: rect.height,
      });
      if (next.x !== trayPosition.x || next.y !== trayPosition.y) {
        setTrayPosition(next);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [trayPosition]);

  useEffect(() => {
    if (!isTrayDragging || typeof window === 'undefined') {
      return undefined;
    }

    const handlePointerMove = (event) => {
      const next = clampTrayPosition({
        x: event.clientX - dragOffsetRef.current.x,
        y: event.clientY - dragOffsetRef.current.y,
        width: dragSizeRef.current.width,
        height: dragSizeRef.current.height,
      });
      setTrayPosition((previous) => {
        if (previous && previous.x === next.x && previous.y === next.y) {
          return previous;
        }
        return next;
      });
    };

    const stopDragging = () => {
      setIsTrayDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [isTrayDragging]);

  function handleCardClick(index) {
    setPinnedIndex((prev) => (prev === index ? null : index));
  }

  function handleTrayDragStart(event) {
    if (event.button !== 0 || event.isPrimary === false) {
      return;
    }
    const trayRootNode = trayRootRef.current;
    if (!trayRootNode) {
      return;
    }

    const rect = trayRootNode.getBoundingClientRect();
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
    setTrayPosition((prev) => prev || initialPosition);
    setIsTrayDragging(true);
    event.preventDefault();
  }

  function handleTrayPositionReset() {
    setTrayPosition(null);
    setIsTrayDragging(false);
    clearStoredTrayPosition();
  }

  const trayRootStyle = useMemo(() => {
    if (!trayPosition) {
      return undefined;
    }
    return {
      left: `${trayPosition.x}px`,
      top: `${trayPosition.y}px`,
      bottom: 'auto',
      transform: 'none',
    };
  }, [trayPosition]);

  const handCardsStyle = useMemo(
    () => ({
      '--hand-columns': String(handColumnCount),
    }),
    [handColumnCount]
  );

  return (
    <aside
      ref={setTrayNodeRef}
      className={`${styles.handTrayRoot} ${isDropHighlighted ? styles.handTrayDropActive : ''}`.trim()}
      data-zone="player-hand"
      data-drop-group="hand"
      style={trayRootStyle}
    >
      <div className={styles.handTrayToolbar}>
        <button
          type="button"
          className={`${styles.handTrayHandle} ${isTrayDragging ? styles.handTrayHandleActive : ''}`.trim()}
          onPointerDown={handleTrayDragStart}
          aria-label="手札エリアをドラッグして移動"
          title="手札エリアを移動"
        >
          <FontAwesomeIcon icon={faArrowsUpDownLeftRight} />
        </button>
        {trayPosition && (
          <button
            type="button"
            className={styles.handTrayResetButton}
            onClick={handleTrayPositionReset}
          >
            位置をリセット
          </button>
        )}
      </div>
      <button
        type="button"
        className={styles.panelToggle}
        aria-expanded={isOpen}
        aria-controls={HAND_TRAY_PANEL_ID}
        onClick={onToggle}
      >
        {isOpen ? '手札を閉じる' : '手札を開く'}（{cardCount}枚）
      </button>

      {isOpen && (
        <div id={HAND_TRAY_PANEL_ID} className={styles.handTrayPanel}>
          {normalizedCards.length > 0 ? (
            <div className={styles.handCardsScroller}>
              <div
                className={styles.handCards}
                style={handCardsStyle}
                data-zone="player-hand-cards-grid"
              >
                {normalizedCards.map((card, index) => (
                  <DraggableCard
                    key={`${card.cardId}-${index}`}
                    dragId={`hand-card-${card.cardId}-${index}`}
                    dragPayload={buildCardDragPayload({
                      cardId: card.cardId,
                      sourceZone: 'player-hand',
                    })}
                    className={`${styles.handCardDraggable} ${
                      activeIndex === index ? styles.handCardDraggableActive : ''
                    }`.trim()}
                    draggingClassName={styles.draggingSource}
                  >
                    <button
                      ref={(node) => {
                        if (node) {
                          cardButtonRefs.current[index] = node;
                        } else {
                          delete cardButtonRefs.current[index];
                        }
                      }}
                      type="button"
                      className={`${styles.handCardButton} ${
                        activeIndex === index ? styles.handCardButtonActive : ''
                      }`}
                      style={
                        activeIndex === index
                          ? {
                              '--hand-card-shift-x': `${activeCardShift.x}px`,
                              '--hand-card-shift-y': `${activeCardShift.y}px`,
                            }
                          : undefined
                      }
                      aria-label={`手札 ${index + 1} を拡大表示`}
                      aria-pressed={pinnedIndex === index}
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      onFocus={() => setHoveredIndex(index)}
                      onBlur={() => setHoveredIndex(null)}
                      onClick={() => handleCardClick(index)}
                    >
                      <img src={card.imageUrl} alt={`Hand Card ${index + 1}`} className={styles.handCardImage} />
                    </button>
                  </DraggableCard>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.panelEmptyText}>手札はありません</div>
          )}
        </div>
      )}
    </aside>
  );
};

HandTray.propTypes = {
  cards: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({
        cardId: PropTypes.string,
        imageUrl: PropTypes.string,
      }),
    ])
  ),
  isOpen: PropTypes.bool,
  onToggle: PropTypes.func,
  dropPayload: PropTypes.shape({
    dropType: PropTypes.string,
    zoneId: PropTypes.string,
  }),
  isDropHighlighted: PropTypes.bool,
};

export default HandTray;
