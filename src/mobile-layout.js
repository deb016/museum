const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function shouldBlockPortrait({ portrait = false, width = 0, height = 0, coarsePointer = false } = {}) {
  const viewportWidth = Math.max(0, Number(width) || 0);
  const viewportHeight = Math.max(0, Number(height) || 0);
  return Boolean(coarsePointer && portrait && viewportHeight > viewportWidth &&
    Math.min(viewportWidth, viewportHeight) <= 900 &&
    Math.max(viewportWidth, viewportHeight) <= 1280);
}

// Keep the corner controls in one row only when both thumb-independent HUD groups fit.
export function computeHudLayout({ width, safeArea = {}, labels = false, leftHanded = false } = {}) {
  const viewportWidth = Math.max(1, Number(width) || 1);
  const safeLeft = Math.max(0, Number(safeArea.left) || 0);
  const safeRight = Math.max(0, Number(safeArea.right) || 0);
  const buttonTarget = 56;
  const gap = 4;
  const leftGroupWidth = buttonTarget * 2 + gap;
  const quickGroupWidth = buttonTarget * 3 + gap * 2;
  const rightGroupWidth = quickGroupWidth + buttonTarget + gap;
  const centerGap = 8;
  const availableWidth = viewportWidth - safeLeft - safeRight - 36;
  const wrap = availableWidth < leftGroupWidth + rightGroupWidth + centerGap;
  return {
    width: viewportWidth,
    availableWidth,
    buttonTarget,
    leftGroupWidth,
    quickGroupWidth,
    rightGroupWidth: wrap ? quickGroupWidth : rightGroupWidth,
    centerGap,
    wrap,
    rowCount: wrap ? 2 : 1,
    rowHeight: labels ? 72 : 56,
    leftHanded: Boolean(leftHanded),
    valid: availableWidth >= (wrap
      ? leftGroupWidth + quickGroupWidth + centerGap
      : leftGroupWidth + rightGroupWidth + centerGap),
  };
}

// Calculates touch-control positions only when viewport or user layout settings change.
export function computeMobileLayout({
  width,
  height,
  safeArea = {},
  scale = 1,
  leftHanded = false,
  offsets = {},
  offsetScale = 1,
} = {}) {
  const viewportWidth = Math.max(1, Number(width) || 1);
  const viewportHeight = Math.max(1, Number(height) || 1);
  const safe = {
    top: Math.max(0, Number(safeArea.top) || 0),
    right: Math.max(0, Number(safeArea.right) || 0),
    bottom: Math.max(0, Number(safeArea.bottom) || 0),
    left: Math.max(0, Number(safeArea.left) || 0),
  };
  const uiScale = clamp(Number(scale) || 1, 0.8, 1.25);
  const joystickSize = clamp(132 * uiScale, 120, 140);
  const primarySize = Math.max(64, 68 * uiScale);
  const buttonSize = Math.max(56, 60 * uiScale);
  const marginLeft = 16 + safe.left;
  const marginRight = 16 + safe.right;
  const marginBottom = 16 + safe.bottom;
  const leftX = clamp(Number(offsets.leftX) || 0, -80, 80) * offsetScale;
  const leftY = clamp(Number(offsets.leftY) || 0, -80, 80) * offsetScale;
  const rightX = clamp(Number(offsets.rightX) || 0, -80, 80) * offsetScale;
  const rightY = clamp(Number(offsets.rightY) || 0, -80, 80) * offsetScale;
  const joystickCenterX = leftHanded
    ? viewportWidth - marginRight - joystickSize / 2 - leftX
    : marginLeft + joystickSize / 2 + leftX;
  const joystickCenterY = viewportHeight - marginBottom - joystickSize / 2 - leftY;
  const clusterSide = leftHanded ? "left" : "right";
  const primaryCenterX = leftHanded
    ? marginLeft + primarySize / 2 + rightX
    : viewportWidth - marginRight - primarySize / 2 - rightX;
  const primaryCenterY = viewportHeight - marginBottom - primarySize / 2 - rightY;
  const arcSpacing = (primarySize + buttonSize) / 2 + 16;
  const heartCenterX = primaryCenterX;
  const heartCenterY = primaryCenterY - arcSpacing;
  const runCenterX = primaryCenterX + (leftHanded ? arcSpacing : -arcSpacing);
  const runCenterY = heartCenterY;
  const controls = [
    { id: "joystick", x: joystickCenterX, y: joystickCenterY, radius: joystickSize / 2, size: joystickSize },
    { id: "primary", x: primaryCenterX, y: primaryCenterY, radius: primarySize / 2, size: primarySize },
    { id: "run", x: runCenterX, y: runCenterY, radius: buttonSize / 2, size: buttonSize },
    { id: "heart", x: heartCenterX, y: heartCenterY, radius: buttonSize / 2, size: buttonSize },
  ];
  const safeBounds = {
    left: safe.left + 16,
    top: safe.top + 16,
    right: viewportWidth - safe.right - 16,
    bottom: viewportHeight - safe.bottom - 16,
  };
  for (const control of controls) {
    control.left = control.x - control.radius;
    control.top = control.y - control.radius;
    control.right = control.x + control.radius;
    control.bottom = control.y + control.radius;
    control.insideSafeArea = control.left >= safeBounds.left - 0.01 &&
      control.top >= safeBounds.top - 0.01 &&
      control.right <= safeBounds.right + 0.01 &&
      control.bottom <= safeBounds.bottom + 0.01;
  }
  const gaps = [];
  for (let first = 0; first < controls.length; first += 1) {
    for (let second = first + 1; second < controls.length; second += 1) {
      const a = controls[first];
      const b = controls[second];
      gaps.push({
        first: a.id,
        second: b.id,
        distance: Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius,
        minimum: a.id === "joystick" ? 24 : 16,
      });
    }
  }
  const layout = {
    orientation: viewportWidth >= viewportHeight ? "landscape" : "portrait",
    width: viewportWidth,
    height: viewportHeight,
    joystickSize,
    primarySize,
    buttonSize,
    clusterSide,
    controls,
    gaps,
    safeBounds,
    valid: controls.every((control) => control.insideSafeArea) &&
      gaps.every((gap) => gap.distance >= gap.minimum - 0.01),
  };
  if (!layout.valid && offsetScale > 0) {
    return computeMobileLayout({
      width: viewportWidth,
      height: viewportHeight,
      safeArea: safe,
      scale: uiScale,
      leftHanded,
      offsets,
      offsetScale: offsetScale < 0.002 ? 0 : offsetScale / 2,
    });
  }
  return layout;
}

export function layoutCssVariables(layout) {
  const byId = Object.fromEntries(layout.controls.map((control) => [control.id, control]));
  const primary = byId.primary;
  const run = byId.run;
  const heart = byId.heart;
  const joystick = byId.joystick;
  const setX = (control) => `${control.left}px`;
  return {
    "--joystick-size": `${layout.joystickSize}px`,
    "--joystick-left": `${joystick.left}px`,
    "--joystick-bottom": `${layout.height - joystick.bottom}px`,
    "--primary-size": `${layout.primarySize}px`,
    "--primary-left": `${setX(primary)}`,
    "--primary-bottom": `${layout.height - primary.bottom}px`,
    "--run-size": `${layout.buttonSize}px`,
    "--run-left": `${setX(run)}`,
    "--run-bottom": `${layout.height - run.bottom}px`,
    "--heart-size": `${layout.buttonSize}px`,
    "--heart-left": `${setX(heart)}`,
    "--heart-bottom": `${layout.height - heart.bottom}px`,
  };
}
