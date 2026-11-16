export function headingFromDirection(dirX, dirZ) {
  if (dirX === 0 && dirZ === 0) return null;
  return Math.atan2(dirX, dirZ);
}

export function stepHeading(current, target, hasInput, turnSpeed, delta) {
  if (!hasInput) return current;
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  const maxTurn = turnSpeed * delta;
  return current + Math.max(-maxTurn, Math.min(maxTurn, difference));
}
