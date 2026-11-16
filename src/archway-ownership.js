export function ownsArchwayFrame(roomId, neighborRoomId, archways) {
  const archway = archways.find(({ from, to }) =>
    (from === roomId && to === neighborRoomId) ||
    (from === neighborRoomId && to === roomId));
  if (archway) return archway.from === roomId;

  return roomId.localeCompare(neighborRoomId) < 0;
}
