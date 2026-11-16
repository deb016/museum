import test from "node:test";
import assert from "node:assert/strict";
import { headingFromDirection, stepHeading } from "./movement.js";

test("forward movement faces local +Z", () => {
  assert.equal(headingFromDirection(0, 1), 0);
  assert.equal(headingFromDirection(0, -1), Math.PI);
});

test("heading is unchanged when movement input stops", () => {
  const stopped = stepHeading(1.2, -2, false, 13.5, 1 / 60);
  assert.equal(stopped, 1.2);
});

test("heading turns across the angular boundary by the shortest path", () => {
  const current = (350 * Math.PI) / 180;
  const target = (10 * Math.PI) / 180;
  const next = stepHeading(current, target, true, 1, 1);
  assert.ok(next > current);
  assert.ok(Math.abs(next - current - (20 * Math.PI) / 180) < 1e-12);
});
