import test from "node:test";
import assert from "node:assert/strict";
import { distanceToCapsuleBody, moveCapsule, resolvePenetrations } from "./collision.js";

const config = {
  substepDistance: 0.12,
  pushoutIterations: 4,
  penetrationEpsilon: 0.0001,
};
const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
const flatGround = () => 0;
const capsule = { radius: 0.3, capsuleHeight: 1.7 };

test("collectible distance measures against the full capsule height", () => {
  const position = { x: 0, y: 0, z: 0 };

  assert.equal(distanceToCapsuleBody(position, capsule.capsuleHeight, [0.5, 1.2, 0]), 0.5);
  assert.ok(Math.abs(distanceToCapsuleBody(position, capsule.capsuleHeight, [0.5, 2, 0]) - Math.hypot(0.5, 0.3)) < 1e-9);
});

test("substeps prevent crossing a thin wall at speed", () => {
  const position = { x: 0, y: 0, z: 0 };
  const wall = { name: "col_test_wall", type: "box", center: [1, 1, 0], size: [0.08, 3, 5], height: 3, solid: true };
  const result = moveCapsule(position, 4, 0, {
    ...capsule, colliders: [wall], groundHeight: flatGround, config, bounds,
  });
  assert.ok(result.substeps > 1);
  assert.ok(position.x <= 0.661);
});

test("the capsule slides along a wall instead of sticking", () => {
  const position = { x: 0.55, y: 0, z: 0 };
  const wall = { name: "col_test_wall", type: "box", center: [1, 1, 0], size: [0.2, 3, 8], height: 3, solid: true };
  moveCapsule(position, 0.2, 1.2, {
    ...capsule, colliders: [wall], groundHeight: flatGround, config, bounds,
  });
  assert.ok(position.x <= 0.6002);
  assert.ok(position.z > 0.8);
});

test("cylindrical props push a penetrating capsule outward", () => {
  const position = { x: 0, y: 0, z: 0 };
  const statue = { name: "col_test_statue", type: "cylinder", center: [0, 1, 0], radius: 0.6, height: 2, solid: true };
  const collided = resolvePenetrations(position, [statue], capsule.radius, capsule.capsuleHeight, config);
  assert.equal(collided, true);
  assert.ok(Math.hypot(position.x, position.z) >= 0.899);
});

test("movement stays on the museum's single flat floor", () => {
  const position = { x: 0, y: 0, z: -0.1 };
  moveCapsule(position, 0, 0.3, {
    ...capsule, colliders: [], groundHeight: flatGround, config, bounds,
  });
  assert.equal(position.y, 0);
  assert.ok(Math.abs(position.z - 0.2) < 1e-9);
});
