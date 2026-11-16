import { COLLISION_CONFIG } from "./config.js";
import { resolvePenetrations } from "./collision.js";

export function computeWalkableGrid({ bounds, rooms, colliders, start, cellSize = 0.4 }) {
  // Flood-fill capsule-clear floor cells from spawn; collision resolution is the authority for walkability.
  const index = (value) => Math.round(value / cellSize);
  const coordinate = (value) => value * cellSize;
  const minI = index(bounds.minX);
  const maxI = index(bounds.maxX);
  const minJ = index(bounds.minZ);
  const maxJ = index(bounds.maxZ);
  const solidColliders = colliders.filter((collider) => collider.solid && collider.enabled !== false);
  const floorCells = new Set();
  const blockedCells = new Set();
  const isFree = (i, j) => {
    const key = `${i},${j}`;
    if (floorCells.has(key)) return true;
    if (blockedCells.has(key)) return false;
    const x = coordinate(i);
    const z = coordinate(j);
    if (!rooms.some(({ bounds: room }) =>
      x >= room.xMin && x <= room.xMax && z >= room.zMin && z <= room.zMax,
    )) {
      blockedCells.add(key);
      return false;
    }
    const point = { x, y: 0, z };
    const collided = resolvePenetrations(
      point,
      solidColliders,
      COLLISION_CONFIG.capsuleRadius,
      COLLISION_CONFIG.capsuleHeight,
      COLLISION_CONFIG,
    );
    if (collided || Math.hypot(point.x - x, point.z - z) > 0.001) {
      blockedCells.add(key);
      return false;
    }
    floorCells.add(key);
    return true;
  };
  const startI = index(start[0]);
  const startJ = index(start[2]);
  const startKey = `${startI},${startJ}`;
  if (!isFree(startI, startJ)) {
    return { cellSize, cells: [], reachable: new Set(), startReachable: false, index, coordinate };
  }
  const queue = [[startI, startJ]];
  const reachable = new Set([startKey]);
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const [i, j] = queue[cursor];
    for (const [di, dj] of neighbors) {
      const nextI = i + di;
      const nextJ = j + dj;
      const key = `${nextI},${nextJ}`;
      if (
        nextI < minI || nextI > maxI || nextJ < minJ || nextJ > maxJ ||
        reachable.has(key) || !isFree(nextI, nextJ)
      ) continue;
      reachable.add(key);
      queue.push([nextI, nextJ]);
    }
  }
  for (let i = minI; i <= maxI; i += 1) {
    for (let j = minJ; j <= maxJ; j += 1) isFree(i, j);
  }
  const cells = [...floorCells].map((key) => {
    const [i, j] = key.split(",").map(Number);
    return {
      x: coordinate(i),
      z: coordinate(j),
      reachable: reachable.has(key),
    };
  });
  return { cellSize, cells, reachable, startReachable: true, index, coordinate };
}

export function isNavigationTargetReachable(grid, position, tolerance = 0.35) {
  if (!grid.startReachable) return false;
  const i = grid.index(position[0]);
  const j = grid.index(position[2]);
  for (let di = -1; di <= 1; di += 1) {
    for (let dj = -1; dj <= 1; dj += 1) {
      const key = `${i + di},${j + dj}`;
      if (
        grid.reachable.has(key) &&
        Math.hypot(
          grid.coordinate(i + di) - position[0],
          grid.coordinate(j + dj) - position[2],
        ) <= tolerance
      ) return true;
    }
  }
  return false;
}
