export function getUniqueSeatSlots(seats) {
  return [...new Map(seats.map((seat) => [seat.id, seat])).values()];
}

export function getFreeSeatSlots(seats, isOccupied) {
  return getUniqueSeatSlots(seats).filter((seat) => !isOccupied(seat.id));
}

export function getSeatActionLabel(seat, seatCount) {
  if (seatCount < 2) return "Sit";
  if (seatCount === 2) return seat.index === 1 ? "Sit left" : "Sit right";
  return `Sit in seat ${seat.index}`;
}

export function getAvailableInteractionActions({
  guestbook = false,
  interactable = null,
  seats = [],
  isOccupied = () => false,
} = {}) {
  const actions = [];
  if (guestbook || interactable) {
    actions.push({
      type: "open",
      label: guestbook || interactable.kind === "jukebox" ? "Open" : "Interact",
    });
  }
  for (const seat of getFreeSeatSlots(seats, isOccupied)) {
    actions.push({
      type: "sit",
      label: getSeatActionLabel(seat, seats.length),
      seat,
    });
  }
  return actions;
}

export function isSeatApproachable(position, groundY, seat, approachRadius, floorTolerance) {
  return Math.abs(groundY - seat.floorY) <= floorTolerance &&
    Math.hypot(position.x - seat.position[0], position.z - seat.position[2]) <= approachRadius;
}
