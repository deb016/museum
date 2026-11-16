import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { MUSEUM_CONFIG } from "../museum.config.js";
import { createMuseumWorld } from "./world.js";
import { computeWalkableGrid, isNavigationTargetReachable } from "./navigation.js";

function getRooms() {
  return [
    MUSEUM_CONFIG.architecture.atrium,
    MUSEUM_CONFIG.architecture.entranceHall,
    ...MUSEUM_CONFIG.architecture.chapters,
    ...MUSEUM_CONFIG.architecture.sideRooms,
  ];
}

function createTargets(museum) {
  const targets = [];
  for (const room of getRooms()) {
    const spawn = MUSEUM_CONFIG.fastTravelSpawns[room.id];
    targets.push({ name: `fast-travel: ${room.title}`, position: spawn.position });
  }
  for (const frame of MUSEUM_CONFIG.frames) {
    const [x, , z] = frame.position;
    const normalX = Math.sin(frame.rotationY ?? 0);
    const normalZ = Math.cos(frame.rotationY ?? 0);
    const position = [x + normalX * 4.5, 0, z + normalZ * 4.5];
    targets.push({ name: `frame display: ${frame.id}`, position });
  }
  for (const seat of museum.seats) {
    targets.push({ name: `seat slot: ${seat.id}`, position: seat.approach });
  }
  for (const item of museum.interactables) {
    for (const [index, position] of (item.slots ?? [item.position]).entries()) {
      targets.push({ name: `object slot: ${item.id}:${index + 1}`, position });
    }
  }
  return targets;
}

test("flood fill reaches every fast-travel spawn, frame view, and seat slot after the secret reveal", () => {
  const museum = createMuseumWorld(new THREE.Scene());
  assert.equal(museum.revealSecretRoom(), true);
  for (const room of museum.rooms) assert.equal(museum.loadRoomById(room.id), true);

  const grid = computeWalkableGrid({
    bounds: MUSEUM_CONFIG.worldBounds,
    rooms: getRooms(),
    colliders: museum.colliders,
    start: MUSEUM_CONFIG.spawnPoints.main,
    cellSize: 0.4,
  });
  assert.equal(grid.startReachable, true, "spawn point must be on the walkable grid");
  const results = createTargets(museum).map(({ name, position }) => ({
    target: name,
    passed: isNavigationTargetReachable(grid, position),
  }));
  console.table(results.map((result) => ({
    status: result.passed ? "PASS" : "FAIL",
    target: result.target,
  })));
  assert.ok(
    results.every((result) => result.passed),
    `Unreachable museum targets: ${results.filter((result) => !result.passed).map((result) => result.target).join(", ")}`,
  );
});
