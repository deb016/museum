import assert from "node:assert/strict";
import test from "node:test";
import {
  computeHudLayout,
  computeMobileLayout,
  layoutCssVariables,
  shouldBlockPortrait,
} from "./mobile-layout.js";

const portrait = [[360, 640], [360, 800], [375, 667], [390, 844], [412, 915], [430, 932]];

test("portrait blocking is limited to compact touch devices actually in portrait", () => {
  for (const [width, height] of portrait) {
    assert.equal(shouldBlockPortrait({ portrait: true, width, height, coarsePointer: true }), true);
    assert.equal(shouldBlockPortrait({ portrait: false, width, height, coarsePointer: true }), false);
    assert.equal(shouldBlockPortrait({ portrait: true, width, height, coarsePointer: false }), false);
  }
  assert.equal(shouldBlockPortrait({ portrait: true, width: 744, height: 1133, coarsePointer: true }), true);
  assert.equal(shouldBlockPortrait({ portrait: true, width: 1024, height: 1366, coarsePointer: true }), false);
  assert.equal(shouldBlockPortrait({ portrait: true, width: 600, height: 900, coarsePointer: true }), true);
  assert.equal(shouldBlockPortrait({ portrait: true, width: 640, height: 900, coarsePointer: false }), false);
});

test("thumb controls stay in safe areas and keep required spacing in both orientations", () => {
  const sizes = [...portrait, ...portrait.map(([width, height]) => [height, width])];
  for (const [width, height] of sizes) {
    for (const leftHanded of [false, true]) {
      const layout = computeMobileLayout({
        width,
        height,
        safeArea: { top: 24, right: 12, bottom: 20, left: 8 },
        leftHanded,
      });
      assert.equal(layout.valid, true, `${width}x${height}, leftHanded=${leftHanded}`);
      assert.ok(layout.joystickSize >= 120 && layout.joystickSize <= 140);
      assert.ok(layout.primarySize >= 64);
      assert.ok(layout.buttonSize >= 56);
      assert.ok(layout.gaps.every((gap) => gap.distance >= gap.minimum - 0.01));
      for (const control of layout.controls) assert.equal(control.insideSafeArea, true);
      const variables = layoutCssVariables(layout);
      assert.equal(Number.parseFloat(variables["--joystick-left"]), layout.controls.find(({ id }) => id === "joystick").left);
      assert.equal(Number.parseFloat(variables["--primary-left"]), layout.controls.find(({ id }) => id === "primary").left);
      assert.equal(Number.parseFloat(variables["--heart-left"]), layout.controls.find(({ id }) => id === "heart").left);
      assert.equal(Number.parseFloat(variables["--run-left"]), layout.controls.find(({ id }) => id === "run").left);
    }
  }
});

test("invalid saved offsets are reduced until all controls fit without overlap", () => {
  const layout = computeMobileLayout({
    width: 360,
    height: 640,
    safeArea: { top: 24, right: 12, bottom: 20, left: 8 },
    offsets: { leftX: 80, leftY: -80, rightX: -80, rightY: -80 },
  });
  assert.equal(layout.valid, true);
});

test("quick HUD buttons wrap only when their safe-area-adjusted hit targets need the space", () => {
  const sizes = [...portrait, ...portrait.map(([width, height]) => [height, width])];
  for (const [width, height] of sizes) {
    const layout = computeHudLayout({
      width,
      safeArea: { left: 8, right: 12 },
      labels: true,
    });
    assert.equal(layout.valid, true, `${width}x${height}`);
    assert.equal(layout.buttonTarget, 56);
    assert.equal(layout.rowHeight, 72);
    assert.equal(layout.wrap, layout.availableWidth < 360);
  }
});
