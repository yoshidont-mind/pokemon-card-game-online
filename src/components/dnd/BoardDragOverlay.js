import React from 'react';
import PropTypes from 'prop-types';
import { DragOverlay } from '@dnd-kit/core';
import { DRAG_TYPES } from '../../interaction/dnd/constants';
import Pokemon from '../Pokemon';
import styles from '../../css/playingField.module.css';

const STATUS_BADGE_LABEL = Object.freeze({
  poison: 'どく',
  burn: 'やけど',
  asleep: 'ねむり',
  paralyzed: 'マヒ',
  confused: 'こんらん',
});

const BoardDragOverlay = ({ activeDragPayload, cardCatalog = {} }) => {
  if (!activeDragPayload) {
    return <DragOverlay />;
  }

  if (activeDragPayload.dragType === DRAG_TYPES.CARD) {
    const imageUrl = cardCatalog?.[activeDragPayload.cardId]?.imageUrl;
    return (
      <DragOverlay>
        {imageUrl ? (
          <img src={imageUrl} alt="Dragging Card" className={styles.dragOverlayCard} />
        ) : (
          <div className={styles.dragOverlayTool}>CARD</div>
        )}
      </DragOverlay>
    );
  }

  if (activeDragPayload.dragType === DRAG_TYPES.STACK) {
    const previewCardIds = Array.isArray(activeDragPayload.previewCardIds)
      ? activeDragPayload.previewCardIds.filter(Boolean)
      : [];
    const previewImageUrls = previewCardIds
      .map((cardId) => cardCatalog?.[cardId]?.imageUrl || null)
      .filter(Boolean);
    const previewCardId = activeDragPayload.previewCardId || previewCardIds[previewCardIds.length - 1] || '';
    const imageUrl = cardCatalog?.[previewCardId]?.imageUrl;
    return (
      <DragOverlay>
        {previewImageUrls.length > 0 ? (
          <div className={styles.dragOverlayStack}>
            <Pokemon images={previewImageUrls} />
          </div>
        ) : imageUrl ? (
          <img src={imageUrl} alt="Dragging Stack" className={styles.dragOverlayCard} />
        ) : (
          <div className={styles.dragOverlayPileLabel}>スタックを移動</div>
        )}
      </DragOverlay>
    );
  }

  if (activeDragPayload.dragType === DRAG_TYPES.PILE_CARD) {
    const sourceLabel = activeDragPayload.sourceZone === 'player-prize' ? 'サイド' : '山札';
    return (
      <DragOverlay>
        <div className={styles.dragOverlayPileCard}>
          <img src="/card-back.jpg" alt="Dragging Face-down Card" className={styles.dragOverlayCard} />
          <span className={styles.dragOverlayPileLabel}>{sourceLabel}から1枚</span>
        </div>
      </DragOverlay>
    );
  }

  if (activeDragPayload.dragType === DRAG_TYPES.DAMAGE_COUNTER) {
    const toolValue = String(activeDragPayload.toolValue || '');
    return (
      <DragOverlay>
        <div
          className={`${styles.toolboxItem} ${styles.dragOverlayToolboxItem}`.trim()}
          data-tool-type="damage-counter"
          data-tool-value={toolValue}
        >
          {toolValue}
        </div>
      </DragOverlay>
    );
  }

  if (activeDragPayload.dragType === DRAG_TYPES.STATUS_BADGE) {
    const toolValue = String(activeDragPayload.toolValue || '');
    const label = STATUS_BADGE_LABEL[toolValue] || toolValue;
    return (
      <DragOverlay>
        <div
          className={`${styles.toolboxItem} ${styles.dragOverlayToolboxItem}`.trim()}
          data-tool-type="status-badge"
          data-tool-value={toolValue}
        >
          {label}
        </div>
      </DragOverlay>
    );
  }

  return <DragOverlay />;
};

BoardDragOverlay.propTypes = {
  activeDragPayload: PropTypes.shape({
    dragType: PropTypes.string,
    cardId: PropTypes.string,
    previewCardId: PropTypes.string,
    previewCardIds: PropTypes.arrayOf(PropTypes.string),
    toolValue: PropTypes.string,
    sourceZone: PropTypes.string,
  }),
  cardCatalog: PropTypes.objectOf(
    PropTypes.shape({
      imageUrl: PropTypes.string,
    })
  ),
};

export default BoardDragOverlay;
