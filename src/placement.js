const PROP_CLEARANCE = {
  bench: 0.9,
  cafeTable: 0.8,
  console: 0.7,
  jukebox: 0.65,
  picnic: 0.9,
  plant: 0.45,
  pond: 1.5,
  statue: 0.55,
  swing: 1.2,
  table: 0.7,
  telescope: 0.5,
};

const NON_BLOCKING_PROPS = new Set([
  "balloons",
  "blossoms",
  "fireflies",
  "lanterns",
  "petals",
  "rug",
  "stringLights",
  "wallLights",
]);

function distanceToSegment(x, z, [x1, z1], [x2, z2]) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / lengthSquared));
  return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
}

function conflicts(position, radius, zones, lanes, checkLanes) {
  const [x, , z] = position;
  if (zones.some(({ bounds }) =>
    x + radius >= bounds.xMin && x - radius <= bounds.xMax &&
    z + radius >= bounds.zMin && z - radius <= bounds.zMax,
  )) return true;
  return checkLanes && lanes.some((lane) =>
    distanceToSegment(x, z, lane.start, lane.end) < lane.width / 2 + radius,
  );
}

function findNearbyPosition(item, room, zones, lanes, isFrame) {
  const radius = isFrame ? 0.45 : (PROP_CLEARANCE[item.type] ?? 0.35);
  const checkLanes = isFrame || !NON_BLOCKING_PROPS.has(item.type);
  const { bounds } = room;
  const [x, y, z] = item.position;
  const candidates = [];
  const maxRadius = Math.max(bounds.xMax - bounds.xMin, bounds.zMax - bounds.zMin);

  if (isFrame) {
    const distances = [
      [Math.abs(x - bounds.xMin), "west"],
      [Math.abs(x - bounds.xMax), "east"],
      [Math.abs(z - bounds.zMin), "north"],
      [Math.abs(z - bounds.zMax), "south"],
    ].sort((a, b) => a[0] - b[0]);
    const wall = distances[0][1];
    const isHorizontal = wall === "north" || wall === "south";
    const edge = wall === "west" || wall === "east" ? x : z;
    const low = isHorizontal ? bounds.xMin : bounds.zMin;
    const high = isHorizontal ? bounds.xMax : bounds.zMax;
    for (let along = low + 0.8; along <= high - 0.8; along += 0.5) {
      candidates.push(isHorizontal
        ? [along, y, edge]
        : [edge, y, along]);
    }
  } else {
    for (let r = 0.5; r <= maxRadius; r += 0.5) {
      for (let step = 0; step < 16; step += 1) {
        const angle = (step / 16) * Math.PI * 2;
        const cx = x + Math.cos(angle) * r;
        const cz = z + Math.sin(angle) * r;
        if (
          cx >= bounds.xMin + radius && cx <= bounds.xMax - radius &&
          cz >= bounds.zMin + radius && cz <= bounds.zMax - radius
        ) candidates.push([cx, y, cz]);
      }
    }
  }

  candidates.sort((a, b) =>
    Math.hypot(a[0] - x, a[2] - z) - Math.hypot(b[0] - x, b[2] - z),
  );
  return candidates.find((candidate) =>
    !conflicts(candidate, radius, zones, lanes, checkLanes),
  ) ?? null;
}

export function validateAndNudgePlacements(rooms, frames, keepOutZones, lanes) {
  const moved = [];
  const unresolved = [];

  const validate = (item, room, isFrame = false, label = item.id ?? item.type) => {
    const radius = isFrame ? 0.45 : (PROP_CLEARANCE[item.type] ?? 0.35);
    const checkLanes = isFrame || !NON_BLOCKING_PROPS.has(item.type);
    if (!conflicts(item.position, radius, keepOutZones, lanes, checkLanes)) return;

    const from = [...item.position];
    const nextPosition = findNearbyPosition(item, room, keepOutZones, lanes, isFrame);
    if (!nextPosition) {
      unresolved.push({ id: label, roomId: room.id });
      return;
    }
    item.position = nextPosition;
    moved.push({ id: label, roomId: room.id, from, to: [...nextPosition] });
  };

  for (const room of rooms) {
    for (const [index, prop] of (room.props ?? []).entries()) {
      validate(prop, room, false, `${room.id}:${prop.type}:${index}`);
    }
  }
  for (const frame of frames) {
    const room = rooms.find(({ id }) => id === frame.roomId);
    if (room) validate(frame, room, true);
    else unresolved.push({ id: frame.id, roomId: frame.roomId });
  }
  return { moved, unresolved };
}
