import React from 'react';
import PropTypes from 'prop-types';
import { useDroppable } from '@dnd-kit/core';

const DroppableStack = ({
  dropId,
  dropPayload,
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
  });

  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isHighlighted ? activeClassName : ''}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
};

DroppableStack.propTypes = {
  dropId: PropTypes.string.isRequired,
  dropPayload: PropTypes.shape({
    dropType: PropTypes.string,
    zoneId: PropTypes.string,
    stackKind: PropTypes.string,
  }).isRequired,
  className: PropTypes.string,
  activeClassName: PropTypes.string,
  isHighlighted: PropTypes.bool,
  children: PropTypes.node.isRequired,
};

export default DroppableStack;
