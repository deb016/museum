import test from "node:test";
import assert from "node:assert/strict";
import { validateAndNudgePlacements } from "./placement.js";

test("placement validation nudges blockers but leaves non-blocking rugs on route", () => {
  const rooms = [{
    id: "gallery",
    bounds: { xMin: -10, xMax: 10, zMin: -10, zMax: 10 },
    props: [
      { type: "bench", position: [0, 0, 0] },
      { type: "rug", position: [0, 0, 0], width: 4, depth: 4 },
    ],
  }];
  const frames = [];
  const lanes = [{ id: "main", start: [-10, 0], end: [10, 0], width: 2 }];

  const report = validateAndNudgePlacements(rooms, frames, [], lanes);

  assert.equal(report.moved.length, 1);
  assert.equal(report.unresolved.length, 0);
  assert.notDeepEqual(rooms[0].props[0].position, [0, 0, 0]);
  assert.deepEqual(rooms[0].props[1].position, [0, 0, 0]);
});

test("wall-mounted frames stay on the wall when nudged away from keep-out zones", () => {
  const rooms = [{
    id: "gallery",
    bounds: { xMin: -10, xMax: 10, zMin: -10, zMax: 10 },
    props: [],
  }];
  const frames = [{
    id: "frame",
    roomId: "gallery",
    position: [-9.84, 2, 0],
  }];
  const zones = [{ id: "arch", bounds: { xMin: -10, xMax: -8, zMin: -1, zMax: 1 } }];

  const report = validateAndNudgePlacements(rooms, frames, zones, []);

  assert.equal(report.moved.length, 1);
  assert.equal(report.unresolved.length, 0);
  assert.equal(frames[0].position[0], -9.84);
  assert.ok(Math.abs(frames[0].position[2]) > 1.45);
});
