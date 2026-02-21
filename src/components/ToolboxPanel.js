import React from 'react';
import PropTypes from 'prop-types';
import { useDroppable } from '@dnd-kit/core';
import styles from '../css/playingField.module.css';
import DraggableToolItem from './dnd/DraggableToolItem';
import { buildDamageCounterDragPayload, buildStatusBadgeDragPayload } from '../interaction/dnd/buildDragPayload';

const TOOLBOX_PANEL_ID = 'toolbox-panel';
const DAMAGE_COUNTERS = [10, 50, 100];
const STATUS_BADGES = [
  { id: 'poison', label: 'どく' },
  { id: 'burn', label: 'やけど' },
  { id: 'asleep', label: 'ねむり' },
  { id: 'paralyzed', label: 'マヒ' },
  { id: 'confused', label: 'こんらん' },
];

const ToolboxPanel = ({
  isOpen = false,
  onToggle = () => {},
  dropPayload = null,
  isDropHighlighted = false,
}) => {
  const { setNodeRef } = useDroppable({
    id: 'zone-toolbox-panel',
    data: {
      dropPayload,
    },
  });

  return (
    <aside
      ref={setNodeRef}
      className={`${styles.toolboxRoot} ${isDropHighlighted ? styles.toolboxRootDropActive : ''}`.trim()}
      data-zone="toolbox-panel"
      data-drop-group="toolbox"
    >
      <button
        type="button"
        className={styles.panelToggle}
        aria-expanded={isOpen}
        aria-controls={TOOLBOX_PANEL_ID}
        onClick={onToggle}
      >
        {isOpen ? '小道具を閉じる' : '小道具を開く'}
      </button>

      {isOpen && (
        <div id={TOOLBOX_PANEL_ID} className={styles.toolboxPanel}>
          <section>
            <p className={styles.zoneTitle}>ダメカン</p>
            <div className={styles.toolboxGrid}>
              {DAMAGE_COUNTERS.map((value) => (
                <DraggableToolItem
                  key={`damage-${value}`}
                  dragId={`tool-damage-${value}`}
                  dragPayload={buildDamageCounterDragPayload({ value })}
                  className={styles.toolboxDraggable}
                  draggingClassName={styles.draggingSource}
                >
                  <button
                    type="button"
                    className={styles.toolboxItem}
                    data-tool-type="damage-counter"
                    data-tool-value={String(value)}
                    aria-label={`ダメカン ${value}`}
                  >
                    {value}
                  </button>
                </DraggableToolItem>
              ))}
            </div>
          </section>

          <section>
            <p className={styles.zoneTitle}>状態異常</p>
            <div className={styles.toolboxGrid}>
              {STATUS_BADGES.map((badge) => (
                <DraggableToolItem
                  key={badge.id}
                  dragId={`tool-status-${badge.id}`}
                  dragPayload={buildStatusBadgeDragPayload({ value: badge.id })}
                  className={styles.toolboxDraggable}
                  draggingClassName={styles.draggingSource}
                >
                  <button
                    type="button"
                    className={styles.toolboxItem}
                    data-tool-type="status-badge"
                    data-tool-value={badge.id}
                    aria-label={`状態異常 ${badge.label}`}
                  >
                    {badge.label}
                  </button>
                </DraggableToolItem>
              ))}
            </div>
          </section>
        </div>
      )}
    </aside>
  );
};

ToolboxPanel.propTypes = {
  isOpen: PropTypes.bool,
  onToggle: PropTypes.func,
  dropPayload: PropTypes.shape({
    dropType: PropTypes.string,
    zoneId: PropTypes.string,
    zoneKind: PropTypes.string,
  }),
  isDropHighlighted: PropTypes.bool,
};

export default ToolboxPanel;
