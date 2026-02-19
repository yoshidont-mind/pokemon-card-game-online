export function getTranslatedRectFromDragEvent(event) {
  const translatedRect = event?.active?.rect?.current?.translated;
  if (
    translatedRect &&
    Number.isFinite(translatedRect.left) &&
    Number.isFinite(translatedRect.top) &&
    Number.isFinite(translatedRect.width) &&
    Number.isFinite(translatedRect.height)
  ) {
    return {
      left: translatedRect.left,
      top: translatedRect.top,
      width: translatedRect.width,
      height: translatedRect.height,
      right: translatedRect.left + translatedRect.width,
      bottom: translatedRect.top + translatedRect.height,
    };
  }

  return null;
}

function hasFiniteCoordinates(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function getClientPointFromDragEvent(event, dragStartPoint = null) {
  if (
    hasFiniteCoordinates(dragStartPoint) &&
    Number.isFinite(event?.delta?.x) &&
    Number.isFinite(event?.delta?.y)
  ) {
    return {
      x: dragStartPoint.x + event.delta.x,
      y: dragStartPoint.y + event.delta.y,
    };
  }

  const translatedRect = getTranslatedRectFromDragEvent(event);
  if (translatedRect) {
    return {
      x: translatedRect.left + translatedRect.width / 2,
      y: translatedRect.top + translatedRect.height / 2,
    };
  }

  const pointer = event?.activatorEvent;
  if (pointer && Number.isFinite(pointer.clientX) && Number.isFinite(pointer.clientY)) {
    return {
      x: pointer.clientX,
      y: pointer.clientY,
    };
  }

  return null;
}

export function getClientPointFromDragEndEvent(event, dragStartPoint = null) {
  return getClientPointFromDragEvent(event, dragStartPoint);
}

export function isPointInsideElement(point, element) {
  if (!point || !element || typeof element.getBoundingClientRect !== 'function') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

export function doesRectIntersectElement(rect, element) {
  if (!rect || !element || typeof element.getBoundingClientRect !== 'function') {
    return false;
  }

  const elementRect = element.getBoundingClientRect();
  if (
    !Number.isFinite(elementRect.left) ||
    !Number.isFinite(elementRect.top) ||
    !Number.isFinite(elementRect.right) ||
    !Number.isFinite(elementRect.bottom)
  ) {
    return false;
  }

  return !(
    rect.right <= elementRect.left ||
    rect.left >= elementRect.right ||
    rect.bottom <= elementRect.top ||
    rect.top >= elementRect.bottom
  );
}

export function isDropBlockedBySelectors(point, selectors = []) {
  if (!point || typeof document === 'undefined') {
    return false;
  }
  return selectors.some((selector) => {
    const element = document.querySelector(selector);
    return isPointInsideElement(point, element);
  });
}

export function isDragBlockedBySelectors(event, selectors = [], dragStartPoint = null) {
  if (!selectors.length || typeof document === 'undefined') {
    return false;
  }

  const point = getClientPointFromDragEvent(event, dragStartPoint);
  return isDropBlockedBySelectors(point, selectors);
}
