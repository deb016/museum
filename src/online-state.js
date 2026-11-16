import { stepHeading } from "./movement.js";
import { CHAT_CONFIG, ONLINE_CONFIG } from "./config.js";

export const CHARACTER_KINDS = Object.freeze(["daveRey", "resha"]);
const COUPLE_ACTIONS = Object.freeze([
  "hold", "hug", "kissCheek", "kissForehead", "piggyback", "slowDance", "happyDance",
]);
const COUPLE_PHASES = Object.freeze([
  "FREE", "REQUESTING", "WAITING", "ALIGNING", "ACTIVE", "ENDING",
]);

function normalizeCoupleTransform(value) {
  if (!value || typeof value !== "object") return null;
  const transform = {
    x: Number(value.x),
    y: Number(value.y),
    z: Number(value.z),
    yaw: Number(value.yaw),
  };
  if (Object.values(transform).some((number) => !Number.isFinite(number))) return null;
  if (Math.abs(transform.x) > 200 || Math.abs(transform.y) > 50 || Math.abs(transform.z) > 200) return null;
  return transform;
}

function normalizeCouplePair(value) {
  if (!value || typeof value !== "object") return null;
  const leader = normalizeCoupleTransform(value.leader);
  const follower = normalizeCoupleTransform(value.follower);
  return leader && follower ? { leader, follower } : null;
}

function normalizeCoupleInteraction(value) {
  if (!value || typeof value !== "object") return null;
  if (!COUPLE_PHASES.includes(value.phase)) return null;
  if (value.phase === "FREE") return { phase: "FREE" };
  if (!COUPLE_ACTIONS.includes(value.action)) return null;
  const center = value.center && {
    x: Number(value.center.x),
    y: Number(value.center.y),
    z: Number(value.center.z),
  };
  if (!center || Object.values(center).some((number) => !Number.isFinite(number))) return null;
  const heading = Number(value.heading);
  const startedAt = Number(value.startedAt);
  const phaseStartedAt = Number(value.phaseStartedAt);
  if (![heading, startedAt, phaseStartedAt].every(Number.isFinite)) return null;
  if (Math.abs(center.x) > 200 || Math.abs(center.y) > 50 || Math.abs(center.z) > 200) return null;
  const fromLeader = normalizeCoupleTransform(value.fromLeader);
  const fromFollower = normalizeCoupleTransform(value.fromFollower);
  const toLeader = normalizeCoupleTransform(value.toLeader);
  const toFollower = normalizeCoupleTransform(value.toFollower);
  if (!fromLeader || !fromFollower || !toLeader || !toFollower) return null;
  const endFrom = value.endFrom == null ? null : normalizeCouplePair(value.endFrom);
  const endTo = value.endTo == null ? null : normalizeCouplePair(value.endTo);
  if ((value.endFrom != null && !endFrom) || (value.endTo != null && !endTo)) return null;
  const id = (candidate) => typeof candidate === "string" && candidate.length <= 128 ? candidate : "";
  return {
    action: value.action,
    phase: value.phase,
    phaseStartedAt,
    startedAt,
    center,
    heading,
    fromLeader,
    fromFollower,
    toLeader,
    toFollower,
    endFrom,
    endTo,
    leaderId: id(value.leaderId),
    followerId: id(value.followerId),
    holdMode: value.holdMode === true,
    requestId: id(value.requestId),
  };
}

function normalizeCoupleRequest(value) {
  if (!value || typeof value !== "object" || !COUPLE_ACTIONS.includes(value.action)) return null;
  if (typeof value.requestId !== "string" || value.requestId.length > 128) return null;
  const requestedAt = Number(value.requestedAt);
  if (!Number.isFinite(requestedAt)) return null;
  const id = (candidate) => typeof candidate === "string" && candidate.length <= 128 ? candidate : "";
  return {
    requestId: value.requestId,
    action: value.action,
    requestedAt,
    leaderId: id(value.leaderId),
    targetId: id(value.targetId),
    holdMode: value.holdMode === true,
  };
}

function normalizeCoupleReply(value) {
  if (!value || typeof value !== "object" || typeof value.requestId !== "string" ||
      value.requestId.length > 128 || typeof value.accepted !== "boolean") return null;
  const repliedAt = Number(value.repliedAt);
  if (!Number.isFinite(repliedAt)) return null;
  return { requestId: value.requestId, accepted: value.accepted, repliedAt };
}

function normalizeCoupleCommand(value) {
  if (!value || typeof value !== "object" || typeof value.requestId !== "string" ||
      value.requestId.length > 128 ||
      !["stop", "getDown"].includes(value.command) ||
      typeof value.requestedById !== "string" || value.requestedById.length > 128) return null;
  const requestedAt = Number(value.requestedAt);
  if (!Number.isFinite(requestedAt)) return null;
  return {
    requestId: value.requestId,
    command: value.command,
    requestedById: value.requestedById,
    requestedAt,
  };
}

function normalizeObjectEvent(value) {
  if (!value || typeof value !== "object") return null;
  const allowedTypes = ["piano", "wish", "guestbook"];
  if (!allowedTypes.includes(value.type)) return null;
  const eventId = typeof value.eventId === "string" && value.eventId.length <= 100 ? value.eventId : "";
  const objectId = typeof value.objectId === "string" && value.objectId.length <= 100 ? value.objectId : "";
  const sentAt = Number(value.sentAt);
  if (!eventId || !objectId || !Number.isFinite(sentAt)) return null;
  const event = { eventId, objectId, type: value.type, sentAt };
  if (value.type === "piano") {
    const index = Number(value.value);
    if (!Number.isInteger(index) || index < 0 || index > 15) return null;
    event.value = index;
  } else if (value.type === "wish" || value.type === "guestbook") {
    const text = typeof value.value === "string" ? value.value.trim() : "";
    if (!text || text.length > 120) return null;
    event.value = text;
  }
  return event;
}

export function normalizeHeartsSnapshot(value, knownIds) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const ids = knownIds instanceof Set
    ? knownIds
    : new Set(Array.isArray(knownIds) ? knownIds : []);
  const hearts = {};
  for (const [id, heart] of Object.entries(value)) {
    if (!ids.has(id) || !heart || typeof heart !== "object" || Array.isArray(heart)) continue;
    if (!["daveRey", "resha"].includes(heart.by) || !Number.isFinite(heart.at)) continue;
    hearts[id] = { by: heart.by, at: heart.at };
  }
  return hearts;
}

export function normalizeRoomId(value, fallback = "ourmuseum") {
  const roomId = typeof value === "string" ? value.trim() : "";
  return /^[a-zA-Z0-9_-]{1,48}$/.test(roomId) ? roomId : fallback;
}

export function chooseAvailableCharacter(preferredKind, occupiedKinds) {
  const preferred = CHARACTER_KINDS.includes(preferredKind) ? preferredKind : CHARACTER_KINDS[0];
  if (!occupiedKinds.has(preferred)) return preferred;
  const alternate = CHARACTER_KINDS.find((kind) => kind !== preferred);
  return occupiedKinds.has(alternate) ? null : alternate;
}

export function claimCharacterSlot(current, playerId, uid, character, now, staleAfterMs) {
  const isFresh = current && Number.isFinite(current.lastSeen) && now - current.lastSeen <= staleAfterMs;
  if (isFresh && current.playerId !== playerId) return null;
  return { playerId, uid, character, lastSeen: now };
}

export function clampRemotePosition(position, bounds, radius) {
  return {
    x: Math.max(bounds.minX + radius, Math.min(bounds.maxX - radius, position.x)),
    y: position.y,
    z: Math.max(bounds.minZ + radius, Math.min(bounds.maxZ - radius, position.z)),
  };
}

export function shouldResolveRemoteCollisions(state) {
  return !(state.seatId && state.sitBlend > 0);
}

export function normalizePlayerState(value) {
  if (!value || typeof value !== "object") return null;
  const rawSitBlend = Number(value.sitBlend ?? 0);
  const rawEmoteUntil = Number(value.emoteUntil ?? 0);
  const state = {
    x: Number(value.x),
    y: Number(value.y),
    z: Number(value.z),
    heading: Number(value.heading),
    walkBlend: Number(value.walkBlend ?? 0),
    runBlend: Number(value.runBlend ?? 0),
    phase: Number(value.phase ?? 0),
    speed: Number(value.speed ?? 0),
    sitBlend: Number.isFinite(rawSitBlend) ? rawSitBlend : 0,
    seatId: typeof value.seatId === "string" && /^[a-zA-Z0-9:_-]{1,100}$/.test(value.seatId)
      ? value.seatId
      : null,
    emote: CHAT_CONFIG.emoteNames.includes(value.emote) ? value.emote : null,
    emoteId: typeof value.emoteId === "string" && value.emoteId.length <= 100 ? value.emoteId : "",
    emoteUntil: Number.isFinite(rawEmoteUntil) ? rawEmoteUntil : 0,
    couple: normalizeCoupleInteraction(value.couple),
    coupleRequest: normalizeCoupleRequest(value.coupleRequest),
    coupleReply: normalizeCoupleReply(value.coupleReply),
    coupleCommand: normalizeCoupleCommand(value.coupleCommand),
    objectEvent: normalizeObjectEvent(value.objectEvent),
  };
  if ([state.x, state.y, state.z, state.heading, state.walkBlend, state.runBlend, state.phase, state.speed]
    .some((number) => !Number.isFinite(number))) return null;
  state.walkBlend = Math.max(0, Math.min(1, state.walkBlend));
  state.runBlend = Math.max(0, Math.min(1, state.runBlend));
  state.speed = Math.max(0, Math.min(1, state.speed));
  state.sitBlend = Math.max(0, Math.min(1, state.sitBlend));
  if (!state.seatId) state.sitBlend = 0;
  return state;
}

export { normalizeObjectEvent };

export function normalizeChatMessage(value, senderId, senderName) {
  if (!value || typeof value !== "object") return null;
  const text = typeof value.text === "string" ? value.text.trim() : "";
  const id = typeof value.id === "string" && value.id.length <= 100 ? value.id : "";
  const sentAt = Number(value.sentAt);
  if (!id || !text || text.length > CHAT_CONFIG.maxMessageLength || !Number.isFinite(sentAt)) return null;
  return {
    id,
    senderId,
    senderName,
    text,
    sentAt,
  };
}

export function normalizePlayerMessages(value, senderId, senderName) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-CHAT_CONFIG.maxHistory)
    .map((message) => normalizeChatMessage(message, senderId, senderName))
    .filter(Boolean);
}

export function interpolatePlayerState(current, target, delta, config) {
  const positionBlend = 1 - Math.exp(-config.positionSmoothing * delta);
  const interpolatedSitBlend = (current.sitBlend ?? 0) +
    ((target.sitBlend ?? 0) - (current.sitBlend ?? 0)) * positionBlend;
  const sitBlend = interpolatedSitBlend < ONLINE_CONFIG.seatBlendEpsilon
    ? 0
    : interpolatedSitBlend;
  return {
    x: current.x + (target.x - current.x) * positionBlend,
    y: current.y + (target.y - current.y) * positionBlend,
    z: current.z + (target.z - current.z) * positionBlend,
    heading: stepHeading(current.heading, target.heading, true, config.turnSpeed, delta),
    walkBlend: current.walkBlend + (target.walkBlend - current.walkBlend) * positionBlend,
    runBlend: current.runBlend + (target.runBlend - current.runBlend) * positionBlend,
    phase: current.phase + (target.phase - current.phase) * positionBlend,
    speed: current.speed + (target.speed - current.speed) * positionBlend,
    sitBlend,
    seatId: target.seatId ?? (sitBlend > 0 ? (current.seatId ?? null) : null),
    emote: target.emote ?? null,
    emoteId: target.emoteId ?? "",
    emoteUntil: target.emoteUntil ?? 0,
    couple: target.couple ?? null,
    coupleRequest: target.coupleRequest ?? null,
    coupleReply: target.coupleReply ?? null,
    coupleCommand: target.coupleCommand ?? null,
  };
}
