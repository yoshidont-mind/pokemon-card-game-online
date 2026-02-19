import React from 'react';
import PropTypes from 'prop-types';
import { useDroppable } from '@dnd-kit/core';

const DroppableZone = ({
  dropId,
  dropPayload = null,
  className = '',
  activeClassName = '',
  isHighlighted = false,
  children,
  ...rest
}) => {
  const { setNodeRef } = useDroppable({
    id: dropId,
    data: {
      dropPayload,
    },
    disabled: !dropPayload,
  });

  return (
    <div
      ref={dropPayload ? setNodeRef : undefined}
      className={`${className} ${isHighlighted ? activeClassName : ''}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
};

DroppableZone.propTypes = {
  dropId: PropTypes.string.isRequired,
  dropPayload: PropTypes.shape({
    dropType: PropTypes.string,
    zoneId: PropTypes.string,
  }),
  className: PropTypes.string,
  activeClassName: PropTypes.string,
  isHighlighted: PropTypes.bool,
  children: PropTypes.node.isRequired,
};

export default DroppableZone;
