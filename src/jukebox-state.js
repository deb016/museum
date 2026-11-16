export function normalizeJukeboxState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const index = Number(value.index);
  const startedAt = Number(value.startedAt);
  const pausedAt = Number(value.pausedAt ?? 0);
  const updatedAt = Number(value.updatedAt ?? 0);
  if (!Number.isInteger(index) || index < 0 || index >= 1000 ||
      !Number.isFinite(startedAt) || !Number.isFinite(pausedAt) ||
      typeof value.playing !== "boolean") return null;
  return {
    index,
    startedAt,
    playing: value.playing,
    pausedAt: Math.max(0, pausedAt),
    by: ["daveRey", "resha"].includes(value.by) ? value.by : "",
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    shuffle: value.shuffle === true,
    loop: ["all", "one", "none"].includes(value.loop) ? value.loop : "all",
    seed: Number.isInteger(value.seed) ? value.seed : 1,
  };
}

export function playbackPosition(state, serverNow) {
  if (!state || !Number.isFinite(serverNow)) return 0;
  return state.playing
    ? Math.max(0, (serverNow - state.startedAt) / 1000)
    : Math.max(0, Number(state.pausedAt) || 0);
}

function seededShuffleOrder(count, seed) {
  const order = Array.from({ length: count }, (_, index) => index);
  let state = (Number(seed) >>> 0) || 1;
  for (let index = count - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}

export function firstTrackIndex(count, { shuffle = false, seed = 1 } = {}) {
  if (!Number.isInteger(count) || count < 1) return null;
  return shuffle ? seededShuffleOrder(count, seed)[0] : 0;
}

export function decideJukeboxJoin({
  currentState,
  hasLivePartner = false,
  restartOnJoin = "firstPlayer",
  count,
  now,
  by = "",
  shuffle = false,
  loop = "all",
  seed = 1,
} = {}) {
  if (!["firstPlayer", "everyJoin"].includes(restartOnJoin) ||
      !Number.isFinite(now) || !Number.isInteger(count) || count < 1) return null;
  const current = normalizeJukeboxState(currentState);
  if (restartOnJoin === "firstPlayer" && hasLivePartner && current) {
    return {
      action: "sync",
      state: current,
      position: playbackPosition(current, now),
      overwrite: false,
    };
  }
  const index = firstTrackIndex(count, { shuffle, seed });
  const state = normalizeJukeboxState({
    index,
    startedAt: now,
    playing: true,
    pausedAt: 0,
    by,
    updatedAt: now,
    shuffle,
    loop,
    seed,
  });
  return {
    action: "restart",
    state,
    position: 0,
    overwrite: restartOnJoin === "everyJoin" || !hasLivePartner || currentState != null,
  };
}

export function nextTrackIndex(index, count, { loop = "all", shuffle = false, seed = 1, direction = 1 } = {}) {
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1 ||
      !["all", "one", "none"].includes(loop) || ![-1, 1].includes(direction)) return null;
  const order = shuffle ? seededShuffleOrder(count, seed) : Array.from({ length: count }, (_, item) => item);
  const position = order.indexOf(index);
  if (position < 0) return null;
  const nextPosition = position + direction;
  if (nextPosition < 0) return loop === "all" ? order[count - 1] : order[0];
  if (nextPosition >= count) return loop === "all" ? order[0] : null;
  return order[nextPosition];
}

export function nextManualTrackIndex(index, count, options = {}) {
  return nextTrackIndex(index, count, { ...options, loop: "all", direction: 1 });
}

export function advanceEndedTrack(current, endedIndex, { count, now, by } = {}) {
  if (!current?.playing || current.index !== endedIndex || !Number.isInteger(count) ||
      count < 1 || !Number.isFinite(now)) return null;
  const index = current.loop === "one"
    ? current.index
    : nextTrackIndex(current.index, count, current);
  if (index === null) {
    return {
      ...current,
      playing: false,
      pausedAt: 0,
      by: by ?? current.by,
      updatedAt: now,
    };
  }
  return {
    ...current,
    index,
    startedAt: now,
    playing: true,
    pausedAt: 0,
    by: by ?? current.by,
    updatedAt: now,
  };
}
