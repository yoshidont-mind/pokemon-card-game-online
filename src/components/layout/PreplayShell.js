import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import styles from '../../css/preplayShell.module.css';
import { createFloatingCardSpecs } from '../../utils/floatingBackgroundCards';

function joinClassNames(...classNames) {
  return classNames.filter(Boolean).join(' ');
}

export default function PreplayShell({ children, modalClassName = '', cardCount = 120 }) {
  const floatingBackgroundCards = useMemo(
    () => createFloatingCardSpecs(cardCount),
    [cardCount]
  );

  return (
    <div className={styles.page}>
      <div className={styles.backgroundLayer} aria-hidden>
        {floatingBackgroundCards.map((card) => (
          <img
            key={card.key}
            src={card.imageUrl}
            alt=""
            className={styles.backgroundCard}
            style={card.style}
            loading="lazy"
            decoding="async"
          />
        ))}
        <div className={styles.backgroundFade} />
      </div>
      <main className={joinClassNames(styles.modal, modalClassName)}>{children}</main>
    </div>
  );
}

PreplayShell.propTypes = {
  children: PropTypes.node.isRequired,
  modalClassName: PropTypes.string,
  cardCount: PropTypes.number,
};
