import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import styles from '../css/playingField.module.css';
import DraggableCard from './dnd/DraggableCard';
import { buildCardDragPayload } from '../interaction/dnd/buildDragPayload';

const HAND_TRAY_PANEL_ID = 'hand-tray-panel';

const HandTray = ({ cards = [], isOpen = false, onToggle = () => {} }) => {
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
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [pinnedIndex, setPinnedIndex] = useState(null);
  const [previewCenterX, setPreviewCenterX] = useState(null);
  const trayRootRef = useRef(null);
  const cardButtonRefs = useRef({});

  useEffect(() => {
    if (!isOpen) {
      setHoveredIndex(null);
      setPinnedIndex(null);
      setPreviewCenterX(null);
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

  useEffect(() => {
    if (activeIndex === null || !isOpen) {
      setPreviewCenterX(null);
      return;
    }

    const trayRootNode = trayRootRef.current;
    const buttonNode = cardButtonRefs.current[activeIndex];
    if (!trayRootNode || !buttonNode) {
      return;
    }

    const trayRect = trayRootNode.getBoundingClientRect();
    const buttonRect = buttonNode.getBoundingClientRect();
    setPreviewCenterX(buttonRect.left + buttonRect.width / 2 - trayRect.left);
  }, [activeIndex, isOpen, normalizedCards]);

  function handleCardClick(index) {
    setPinnedIndex((prev) => (prev === index ? null : index));
  }

  return (
    <aside ref={trayRootRef} className={styles.handTrayRoot} data-zone="player-hand-tray">
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
              <div className={styles.handCards}>
                {normalizedCards.map((card, index) => (
                  <DraggableCard
                    key={`${card.cardId}-${index}`}
                    dragId={`hand-card-${card.cardId}-${index}`}
                    dragPayload={buildCardDragPayload({
                      cardId: card.cardId,
                      sourceZone: 'player-hand',
                    })}
                    className={styles.handCardDraggable}
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

      {isOpen && activeIndex !== null && normalizedCards[activeIndex] && previewCenterX !== null && (
        <div className={styles.handHoverPreview} style={{ left: `${previewCenterX}px` }}>
          <img
            src={normalizedCards[activeIndex].imageUrl}
            alt=""
            aria-hidden="true"
            className={styles.handHoverPreviewImage}
          />
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
};

export default HandTray;
