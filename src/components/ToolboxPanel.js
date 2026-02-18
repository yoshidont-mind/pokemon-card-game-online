import React from 'react';
import PropTypes from 'prop-types';
import styles from '../css/playingField.module.css';

const TOOLBOX_PANEL_ID = 'toolbox-panel';
const DAMAGE_COUNTERS = [10, 50, 100];
const STATUS_BADGES = [
  { id: 'poison', label: 'どく' },
  { id: 'burn', label: 'やけど' },
  { id: 'asleep', label: 'ねむり' },
  { id: 'paralyzed', label: 'マヒ' },
  { id: 'confused', label: 'こんらん' },
];

const ToolboxPanel = ({ isOpen = false, onToggle = () => {} }) => {
  return (
    <aside className={styles.toolboxRoot} data-zone="toolbox-panel">
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
                <button
                  key={`damage-${value}`}
                  type="button"
                  className={styles.toolboxItem}
                  data-tool-type="damage-counter"
                  data-tool-value={String(value)}
                  aria-label={`ダメカン ${value}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className={styles.zoneTitle}>状態異常</p>
            <div className={styles.toolboxGrid}>
              {STATUS_BADGES.map((badge) => (
                <button
                  key={badge.id}
                  type="button"
                  className={styles.toolboxItem}
                  data-tool-type="status-badge"
                  data-tool-value={badge.id}
                  aria-label={`状態異常 ${badge.label}`}
                >
                  {badge.label}
                </button>
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
};

export default ToolboxPanel;
