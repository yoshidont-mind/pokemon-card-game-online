import React from 'react';
import { render, screen } from '@testing-library/react';
import BoardDragOverlay from '../BoardDragOverlay';

jest.mock('@dnd-kit/core', () => ({
  DragOverlay: ({ children }) => <>{children}</>,
}));

describe('BoardDragOverlay tool item appearance', () => {
  test('damage counter drag overlay uses same toolbox styling and label', () => {
    const { container } = render(
      <BoardDragOverlay
        activeDragPayload={{
          dragType: 'damage-counter',
          toolValue: '50',
        }}
      />
    );

    const toolElement = screen.getByText('50');
    expect(toolElement).toBeInTheDocument();
    expect(toolElement.className).toContain('toolboxItem');
    expect(toolElement.className).toContain('dragOverlayToolboxItem');
    expect(toolElement).toHaveAttribute('data-tool-type', 'damage-counter');
    expect(toolElement).toHaveAttribute('data-tool-value', '50');
    expect(container.textContent).not.toContain('ダメカン 50');
  });

  test('status badge drag overlay uses same toolbox styling and label', () => {
    render(
      <BoardDragOverlay
        activeDragPayload={{
          dragType: 'status-badge',
          toolValue: 'poison',
        }}
      />
    );

    const toolElement = screen.getByText('どく');
    expect(toolElement).toBeInTheDocument();
    expect(toolElement.className).toContain('toolboxItem');
    expect(toolElement.className).toContain('dragOverlayToolboxItem');
    expect(toolElement).toHaveAttribute('data-tool-type', 'status-badge');
    expect(toolElement).toHaveAttribute('data-tool-value', 'poison');
  });
});
