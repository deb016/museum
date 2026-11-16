function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function distanceToCapsuleBody(position, capsuleHeight, point) {
  const verticalGap = Math.max(position.y - point[1], 0, point[1] - (position.y + capsuleHeight));
  return Math.hypot(position.x - point[0], position.z - point[2], verticalGap);
}

function isVerticallyOverlapping(position, capsuleHeight, collider) {
  const bottom = collider.center[1] - collider.height / 2;
  const top = collider.center[1] + collider.height / 2;
  return position.y < top && position.y + capsuleHeight > bottom;
}

function pushFromBox(position, radius, collider, epsilon) {
  const [centerX, , centerZ] = collider.center;
  const [width, , depth] = collider.size;
  const minX = centerX - width / 2;
  const maxX = centerX + width / 2;
  const minZ = centerZ - depth / 2;
  const maxZ = centerZ + depth / 2;
  const nearestX = clamp(position.x, minX, maxX);
  const nearestZ = clamp(position.z, minZ, maxZ);
  let dx = position.x - nearestX;
  let dz = position.z - nearestZ;
  const distance = Math.hypot(dx, dz);
  if (distance >= radius) return false;
  if (distance > epsilon) {
    const push = radius - distance + epsilon;
    position.x += (dx / distance) * push;
    position.z += (dz / distance) * push;
    return true;
  }

  const exits = [
    { distance: position.x - minX + radius, x: -1, z: 0 },
    { distance: maxX - position.x + radius, x: 1, z: 0 },
    { distance: position.z - minZ + radius, x: 0, z: -1 },
    { distance: maxZ - position.z + radius, x: 0, z: 1 },
  ];
  exits.sort((a, b) => a.distance - b.distance);
  const exit = exits[0];
  position.x += exit.x * (exit.distance + epsilon);
  position.z += exit.z * (exit.distance + epsilon);
  return true;
}

function pushFromCylinder(position, radius, collider, epsilon) {
  let dx = position.x - collider.center[0];
  let dz = position.z - collider.center[2];
  let distance = Math.hypot(dx, dz);
  const combinedRadius = radius + collider.radius;
  if (distance >= combinedRadius) return false;
  if (distance <= epsilon) {
    dx = 1;
    dz = 0;
    distance = 1;
  }
  const push = combinedRadius - distance + epsilon;
  position.x += (dx / distance) * push;
  position.z += (dz / distance) * push;
  return true;
}

export function resolvePenetrations(position, colliders, radius, capsuleHeight, config) {
  let collided = false;
  for (let iteration = 0; iteration < config.pushoutIterations; iteration += 1) {
    let pushed = false;
    for (const collider of colliders) {
      if (!collider.solid || collider.enabled === false) continue;
      if (!isVerticallyOverlapping(position, capsuleHeight, collider)) continue;
      const didPush = collider.type === "cylinder"
        ? pushFromCylinder(position, radius, collider, config.penetrationEpsilon)
        : pushFromBox(position, radius, collider, config.penetrationEpsilon);
      pushed ||= didPush;
    }
    collided ||= pushed;
    if (!pushed) break;
  }
  return collided;
}

export function moveCapsule(position, moveX, moveZ, options) {
  const { colliders, groundHeight, radius, capsuleHeight, config, bounds } = options;
  const distance = Math.hypot(moveX, moveZ);
  const steps = Math.max(1, Math.ceil(distance / config.substepDistance));
  const stepX = moveX / steps;
  const stepZ = moveZ / steps;
  let collided = false;

  for (let index = 0; index < steps; index += 1) {
    const previousX = position.x;
    const previousZ = position.z;
    const nextX = clamp(previousX + stepX, bounds.minX + radius, bounds.maxX - radius);
    const nextZ = clamp(previousZ + stepZ, bounds.minZ + radius, bounds.maxZ - radius);
    position.x = nextX;
    position.z = nextZ;
    position.y = groundHeight(nextX, nextZ, position.y);

    collided = resolvePenetrations(position, colliders, radius, capsuleHeight, config) || collided;
    position.x = clamp(position.x, bounds.minX + radius, bounds.maxX - radius);
    position.z = clamp(position.z, bounds.minZ + radius, bounds.maxZ - radius);
    position.y = groundHeight(position.x, position.z, position.y);
  }
  return { collided, substeps: steps };
}
