import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import styles from '../css/playingField.module.css';

const HAND_TRAY_PANEL_ID = 'hand-tray-panel';

const HandTray = ({ cards = [], isOpen = false, onToggle = () => {} }) => {
  const cardCount = cards.length;
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [pinnedIndex, setPinnedIndex] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setHoveredIndex(null);
      setPinnedIndex(null);
    }
  }, [isOpen]);

  const previewIndex = useMemo(() => {
    if (hoveredIndex !== null && cards[hoveredIndex]) {
      return hoveredIndex;
    }
    if (pinnedIndex !== null && cards[pinnedIndex]) {
      return pinnedIndex;
    }
    return null;
  }, [cards, hoveredIndex, pinnedIndex]);

  function handleCardClick(index) {
    setPinnedIndex((prev) => (prev === index ? null : index));
  }

  return (
    <aside className={styles.handTrayRoot} data-zone="player-hand-tray">
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
          <div className={styles.handPreviewArea}>
            {previewIndex !== null ? (
              <img
                src={cards[previewIndex]}
                alt={`Hand Preview ${previewIndex + 1}`}
                className={styles.handCardPreviewImage}
              />
            ) : (
              <div className={styles.panelEmptyText}>カードにマウスを重ねるかクリックすると拡大表示されます</div>
            )}
          </div>
          <div className={styles.handCards}>
            {cards.length > 0 ? (
              cards.map((card, index) => (
                <button
                  key={`${card}-${index}`}
                  type="button"
                  className={`${styles.handCardButton} ${pinnedIndex === index ? styles.handCardButtonActive : ''}`}
                  aria-label={`手札 ${index + 1} を拡大表示`}
                  aria-pressed={pinnedIndex === index}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onFocus={() => setHoveredIndex(index)}
                  onBlur={() => setHoveredIndex(null)}
                  onClick={() => handleCardClick(index)}
                >
                  <img src={card} alt={`Hand Card ${index + 1}`} className={styles.handCardImage} />
                </button>
              ))
            ) : (
              <div className={styles.panelEmptyText}>手札はありません</div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};

HandTray.propTypes = {
  cards: PropTypes.arrayOf(PropTypes.string),
  isOpen: PropTypes.bool,
  onToggle: PropTypes.func,
};

export default HandTray;
