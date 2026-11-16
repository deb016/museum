import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseAvailableCharacter,
  claimCharacterSlot,
  clampRemotePosition,
  interpolatePlayerState,
  normalizeChatMessage,
  normalizeHeartsSnapshot,
  normalizePlayerMessages,
  normalizePlayerState,
  normalizeRoomId,
  shouldResolveRemoteCollisions,
} from "./online-state.js";
import { readFirebaseConfig } from "./online-config.js";

test("online mode requires the complete Firebase web configuration", () => {
  assert.equal(readFirebaseConfig({ VITE_FIREBASE_API_KEY: "key" }), null);
  assert.deepEqual(readFirebaseConfig({
    VITE_FIREBASE_API_KEY: "key",
    VITE_FIREBASE_AUTH_DOMAIN: "museum.firebaseapp.com",
    VITE_FIREBASE_DATABASE_URL: "https://museum.firebaseio.com",
    VITE_FIREBASE_PROJECT_ID: "museum",
    VITE_FIREBASE_APP_ID: "app-id",
  }), {
    apiKey: "key",
    authDomain: "museum.firebaseapp.com",
    databaseURL: "https://museum.firebaseio.com",
    projectId: "museum",
    appId: "app-id",
  });
});

test("same-character joins are serialized into opposite slots", () => {
  const firstClaim = claimCharacterSlot(null, "player-a", "uid-a", "daveRey", 100, 30000);
  const competingClaim = claimCharacterSlot(firstClaim, "player-b", "uid-b", "daveRey", 101, 30000);

  assert.equal(competingClaim, null);
  assert.equal(chooseAvailableCharacter("daveRey", new Set(["daveRey"])), "resha");
  assert.equal(chooseAvailableCharacter("daveRey", new Set(["daveRey", "resha"])), null);
});

test("a stale character slot can be reclaimed but a fresh slot cannot", () => {
  const existing = { playerId: "old-player", uid: "old-uid", character: "resha", lastSeen: 100 };

  assert.equal(claimCharacterSlot(existing, "new-player", "new-uid", "resha", 200, 50).playerId, "new-player");
  assert.equal(claimCharacterSlot(existing, "new-player", "new-uid", "resha", 120, 50), null);
});

test("remote state rejects invalid positions and clamps animation blends", () => {
  assert.equal(normalizePlayerState({ x: "bad", y: 0, z: 0, heading: 0 }), null);
  assert.deepEqual(normalizePlayerState({
    x: 1, y: 2, z: 3, heading: 4, walkBlend: 2, runBlend: -1, phase: 5, speed: 4,
  }), {
    x: 1, y: 2, z: 3, heading: 4, walkBlend: 1, runBlend: 0, phase: 5, speed: 1,
    sitBlend: 0, seatId: null, emote: null, emoteId: "", emoteUntil: 0,
    couple: null, coupleRequest: null, coupleReply: null, coupleCommand: null, objectEvent: null,
  });
});

test("object state events sync momentary interactions but reject shared jukebox state", () => {
  const state = normalizePlayerState({
    x: 1, y: 0, z: 2, heading: 0,
    objectEvent: { eventId: "evt-1", objectId: "piano-1", type: "piano", value: 3, sentAt: 10 },
  });
  assert.deepEqual(state.objectEvent, {
    eventId: "evt-1", objectId: "piano-1", type: "piano", value: 3, sentAt: 10,
  });
  assert.equal(normalizePlayerState({
    x: 1, y: 0, z: 2, heading: 0,
    objectEvent: { eventId: "evt-2", objectId: "x", type: "unsupported", sentAt: 11 },
  }).objectEvent, null);
  assert.equal(normalizePlayerState({
    x: 1, y: 0, z: 2, heading: 0,
    objectEvent: { eventId: "evt-3", objectId: "jukebox", type: "jukebox", value: 2, sentAt: 12 },
  }).objectEvent, null);
});

test("shared heart snapshots keep only known hearts with valid collector and timestamp", () => {
  const knownIds = new Set(["heart-a", "heart-b"]);
  assert.deepEqual(normalizeHeartsSnapshot({
    "heart-a": { by: "daveRey", at: 123 },
    "heart-b": { by: "resha", at: 456 },
    "heart-unknown": { by: "resha", at: 789 },
    "heart-bad-player": { by: "someone-else", at: 123 },
    "heart-bad-time": { by: "daveRey", at: "123" },
    "heart-bad-value": null,
  }, knownIds), {
    "heart-a": { by: "daveRey", at: 123 },
    "heart-b": { by: "resha", at: 456 },
  });
  assert.deepEqual(normalizeHeartsSnapshot([], knownIds), {});
});

test("sitting and emote state is validated and interpolates without losing seat occupancy", () => {
  const state = normalizePlayerState({
    x: 1, y: 0, z: 2, heading: 0, sitBlend: 2, seatId: "room:bench:seat-1",
    emote: "wave", emoteId: "wave-1", emoteUntil: 1234,
  });
  assert.equal(state.sitBlend, 1);
  assert.equal(state.seatId, "room:bench:seat-1");
  assert.equal(state.emote, "wave");
  assert.equal(normalizePlayerState({
    x: 1, y: 0, z: 2, heading: 0, sitBlend: 1, seatId: "../other", emote: "unknown",
  }).seatId, null);
  assert.equal(normalizePlayerState({
    x: 1, y: 0, z: 2, heading: 0, sitBlend: 1, seatId: "../other", emote: "unknown",
  }).emote, null);
  assert.equal(normalizePlayerState({
    x: 1, y: 0, z: 2, heading: 0, sitBlend: 1, seatId: "../other",
  }).sitBlend, 0);
  const next = interpolatePlayerState(
    { ...state, sitBlend: 0, seatId: null },
    state,
    0.1,
    { positionSmoothing: 12, turnSpeed: 3 },
  );
  assert.equal(next.seatId, state.seatId);
  assert.ok(next.sitBlend > 0 && next.sitBlend < 1);

  const standing = { ...state, sitBlend: 0, seatId: null };
  let exiting = state;
  for (let frame = 0; frame < 100; frame += 1) {
    exiting = interpolatePlayerState(
      exiting,
      standing,
      0.1,
      { positionSmoothing: 12, turnSpeed: 3 },
    );
    if (exiting.sitBlend > 0) assert.equal(exiting.seatId, state.seatId);
  }
  assert.equal(exiting.sitBlend, 0);
  assert.equal(exiting.seatId, null);
});

test("seated remote players keep their bench slot instead of being pushed away by seat colliders", () => {
  assert.equal(shouldResolveRemoteCollisions({
    seatId: "room:bench:seat-1",
    sitBlend: 0.01,
  }), false);
  assert.equal(shouldResolveRemoteCollisions({
    seatId: "room:bench:seat-1",
    sitBlend: 0,
  }), true);
  assert.equal(shouldResolveRemoteCollisions({
    seatId: null,
    sitBlend: 0,
  }), true);
});

test("chat history normalizes messages and rejects empty or oversized content", () => {
  const senderId = "player-a";
  assert.equal(normalizeChatMessage({ id: "1", text: "  ", sentAt: 1 }, senderId, "Dave Rey"), null);
  assert.equal(normalizeChatMessage({
    id: "2", text: "x".repeat(301), sentAt: 1,
  }, senderId, "Dave Rey"), null);
  assert.equal(normalizeChatMessage({
    id: "3", text: "x".repeat(300), sentAt: 1,
  }, senderId, "Dave Rey")?.text.length, 300);
  assert.deepEqual(normalizePlayerMessages([
    { id: "4", text: " Hello 💕 ", sentAt: 4 },
    { id: "5", text: "<script>", sentAt: 5 },
  ], senderId, "Resha"), [
    { id: "4", senderId, senderName: "Resha", text: "Hello 💕", sentAt: 4 },
    { id: "5", senderId, senderName: "Resha", text: "<script>", sentAt: 5 },
  ]);
});

test("room IDs reject path separators and remote positions stay within world bounds", () => {
  assert.equal(normalizeRoomId("../other"), "ourmuseum");
  assert.equal(normalizeRoomId("shared-room_2"), "shared-room_2");
  assert.deepEqual(
    clampRemotePosition({ x: -40, y: 2, z: 80 }, { minX: -10, maxX: 10, minZ: -20, maxZ: 20 }, 0.5),
    { x: -9.5, y: 2, z: 19.5 },
  );
});

test("remote headings interpolate across the shortest angular path", () => {
  const current = {
    x: 0, y: 0, z: 0, heading: Math.PI - 0.1,
    walkBlend: 0, runBlend: 0, phase: 0, speed: 0,
  };
  const target = { ...current, heading: -Math.PI + 0.1 };
  const result = interpolatePlayerState(current, target, 0.02, {
    positionSmoothing: 12,
    turnSpeed: 3,
  });

  assert.ok(result.heading > current.heading);
  assert.ok(Math.abs(result.heading - current.heading) < 0.1);
});

test("couple state, requests, and replies are bounded and survive remote interpolation", () => {
  const pose = { x: 1, y: 0, z: 2, yaw: 0.5 };
  const interaction = {
    action: "hold",
    phase: "ACTIVE",
    phaseStartedAt: 1000,
    startedAt: 1000,
    center: { x: 0.5, y: 0, z: 1 },
    heading: 0.5,
    fromLeader: pose,
    fromFollower: pose,
    toLeader: pose,
    toFollower: pose,
    leaderId: "leader",
    followerId: "follower",
  };
  const state = normalizePlayerState({
    x: 1, y: 0, z: 2, heading: 0.5,
    couple: interaction,
    coupleRequest: {
      requestId: "request-1", action: "hug", requestedAt: 1001, leaderId: "leader", targetId: "follower",
    },
    coupleReply: { requestId: "request-1", accepted: true, repliedAt: 1002 },
    coupleCommand: { requestId: "request-1", command: "getDown", requestedById: "follower", requestedAt: 1003 },
  });
  assert.equal(state.couple.action, "hold");
  assert.equal(state.coupleRequest.targetId, "follower");
  assert.equal(state.coupleReply.accepted, true);
  assert.equal(state.coupleCommand.command, "getDown");
  assert.deepEqual(interpolatePlayerState(
    { ...state, couple: null },
    state,
    0.01,
    { positionSmoothing: 12, turnSpeed: 3 },
  ).couple, state.couple);
  assert.equal(normalizePlayerState({
    x: 1, y: 0, z: 2, heading: 0,
    couple: { ...interaction, phase: "UNKNOWN" },
  }).couple, null);
});
