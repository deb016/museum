export const CHARACTER_PREVIEW_GAP = 24;

export function computeCharacterPreviewZone({
  width,
  height,
  safeArea = {},
  cardRect = {},
  gap = CHARACTER_PREVIEW_GAP,
} = {}) {
  const viewportWidth = Math.max(1, Number(width) || 1);
  const viewportHeight = Math.max(1, Number(height) || 1);
  const safe = {
    top: Math.max(0, Number(safeArea.top) || 0),
    right: Math.max(0, Number(safeArea.right) || 0),
    bottom: Math.max(0, Number(safeArea.bottom) || 0),
    left: Math.max(0, Number(safeArea.left) || 0),
  };
  const landscape = viewportWidth >= viewportHeight;
  const left = landscape
    ? Math.max(safe.left + gap, (Number(cardRect.right) || 0) + gap)
    : safe.left + gap;
  const right = viewportWidth - safe.right - gap;
  const top = safe.top + gap;
  const bottom = landscape
    ? viewportHeight - safe.bottom - gap
    : Math.min(viewportHeight - safe.bottom - gap, (Number(cardRect.top) || viewportHeight) - gap);
  const zone = {
    orientation: landscape ? "landscape" : "portrait",
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
  zone.centerX = (zone.left + zone.right) / 2;
  zone.centerY = (zone.top + zone.bottom) / 2;
  zone.valid = zone.width > 0 && zone.height > 0;
  return zone;
}

export function computeCharacterPreviewCameraShift({
  centerX,
  centerY,
  width,
  height,
  distance,
  fov,
} = {}) {
  const viewportWidth = Math.max(1, Number(width) || 1);
  const viewportHeight = Math.max(1, Number(height) || 1);
  const viewDistance = Math.max(0.1, Number(distance) || 0.1);
  const tanHalfFov = Math.tan((Number(fov) || 42) * Math.PI / 360);
  const ndcX = (2 * (Number(centerX) || 0)) / viewportWidth - 1;
  const ndcY = 1 - (2 * (Number(centerY) || 0)) / viewportHeight;
  return {
    horizontal: ndcX * viewDistance * tanHalfFov * (viewportWidth / viewportHeight),
    vertical: ndcY * viewDistance * tanHalfFov,
  };
}

export function computeCharacterPreviewDistance({
  zone,
  width,
  height,
  horizontalRadius,
  verticalRadius,
  fov,
  gap = CHARACTER_PREVIEW_GAP,
} = {}) {
  const viewportWidth = Math.max(1, Number(width) || 1);
  const viewportHeight = Math.max(1, Number(height) || 1);
  const tanHalfFov = Math.tan((Number(fov) || 42) * Math.PI / 360);
  const horizontalFraction = Math.max(0.05, (zone.width - gap * 2) / viewportWidth);
  const verticalFraction = Math.max(0.05, (zone.height - gap * 2) / viewportHeight);
  const horizontalViewScale = tanHalfFov * (viewportWidth / viewportHeight);
  const horizontalDistance = Math.max(0, Number(horizontalRadius) || 0) /
    (horizontalViewScale * horizontalFraction);
  const verticalSupportRadius = (Math.max(0, Number(verticalRadius) || 0) +
    Math.max(0, Number(horizontalRadius) || 0) * 0.22);
  const verticalDistance = verticalSupportRadius /
    (tanHalfFov * verticalFraction);
  return Math.max(horizontalDistance, verticalDistance) + 0.25;
}
