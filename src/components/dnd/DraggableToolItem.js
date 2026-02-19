import React from 'react';
import PropTypes from 'prop-types';
import { useDraggable } from '@dnd-kit/core';

const DraggableToolItem = ({
  dragId,
  dragPayload,
  className = '',
  draggingClassName = '',
  children,
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: {
      dragPayload,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isDragging ? draggingClassName : ''}`.trim()}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
};

DraggableToolItem.propTypes = {
  dragId: PropTypes.string.isRequired,
  dragPayload: PropTypes.shape({
    dragType: PropTypes.string,
    toolValue: PropTypes.string,
  }).isRequired,
  className: PropTypes.string,
  draggingClassName: PropTypes.string,
  children: PropTypes.node.isRequired,
};

export default DraggableToolItem;
