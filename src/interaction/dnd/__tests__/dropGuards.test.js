import {
  doesRectIntersectElement,
  getClientPointFromDragEvent,
  getClientPointFromDragEndEvent,
  isDragBlockedBySelectors,
  isPointInsideElement,
} from '../dropGuards';

describe('dropGuards', () => {
  test('extracts client point from translated active rect', () => {
    const point = getClientPointFromDragEndEvent({
      active: {
        rect: {
          current: {
            translated: {
              left: 100,
              top: 80,
              width: 40,
              height: 60,
            },
          },
        },
      },
    });

    expect(point).toEqual({ x: 120, y: 110 });
  });

  test('extracts client point from drag delta when drag start point is provided', () => {
    const point = getClientPointFromDragEvent(
      {
        delta: {
          x: 40,
          y: -20,
        },
      },
      { x: 300, y: 500 }
    );

    expect(point).toEqual({ x: 340, y: 480 });
  });

  test('isPointInsideElement returns true when coordinates are in element bounds', () => {
    const element = {
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        right: 110,
        bottom: 70,
      }),
    };

    expect(isPointInsideElement({ x: 50, y: 40 }, element)).toBe(true);
    expect(isPointInsideElement({ x: 5, y: 40 }, element)).toBe(false);
  });

  test('doesRectIntersectElement returns true only when overlap exists', () => {
    const element = {
      getBoundingClientRect: () => ({
        left: 100,
        top: 100,
        right: 200,
        bottom: 200,
      }),
    };

    expect(
      doesRectIntersectElement(
        {
          left: 150,
          top: 150,
          right: 250,
          bottom: 250,
        },
        element
      )
    ).toBe(true);

    expect(
      doesRectIntersectElement(
        {
          left: 10,
          top: 10,
          right: 90,
          bottom: 90,
        },
        element
      )
    ).toBe(false);
  });

  test('isDragBlockedBySelectors checks pointer position derived from drag start and delta', () => {
    document.body.innerHTML = '<div id="hand-tray-panel"></div>';
    const tray = document.querySelector('#hand-tray-panel');
    tray.getBoundingClientRect = () => ({
      left: 200,
      top: 200,
      right: 360,
      bottom: 320,
    });

    const blocked = isDragBlockedBySelectors(
      {
        delta: {
          x: 20,
          y: 30,
        },
      },
      ['#hand-tray-panel'],
      { x: 210, y: 210 }
    );

    const allowed = isDragBlockedBySelectors(
      {
        delta: {
          x: 20,
          y: 10,
        },
      },
      ['#hand-tray-panel'],
      { x: 20, y: 20 }
    );

    expect(blocked).toBe(true);
    expect(allowed).toBe(false);
  });
});
