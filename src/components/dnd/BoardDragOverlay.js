import React from 'react';
import PropTypes from 'prop-types';
import { DragOverlay } from '@dnd-kit/core';
import { DRAG_TYPES } from '../../interaction/dnd/constants';
import styles from '../../css/playingField.module.css';

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

  if (activeDragPayload.dragType === DRAG_TYPES.DAMAGE_COUNTER) {
    return (
      <DragOverlay>
        <div className={styles.dragOverlayTool}>ダメカン {activeDragPayload.toolValue}</div>
      </DragOverlay>
    );
  }

  if (activeDragPayload.dragType === DRAG_TYPES.STATUS_BADGE) {
    return (
      <DragOverlay>
        <div className={styles.dragOverlayTool}>状態異常 {activeDragPayload.toolValue}</div>
      </DragOverlay>
    );
  }

  return <DragOverlay />;
};

BoardDragOverlay.propTypes = {
  activeDragPayload: PropTypes.shape({
    dragType: PropTypes.string,
    cardId: PropTypes.string,
    toolValue: PropTypes.string,
  }),
  cardCatalog: PropTypes.objectOf(
    PropTypes.shape({
      imageUrl: PropTypes.string,
    })
  ),
};

export default BoardDragOverlay;
