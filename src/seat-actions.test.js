import test from "node:test";
import assert from "node:assert/strict";
import {
  getAvailableInteractionActions,
  getFreeSeatSlots,
  getSeatActionLabel,
  getUniqueSeatSlots,
  isSeatApproachable,
} from "./seat-actions.js";

test("seat actions render one Sit target per unique free slot and none for occupied slots", () => {
  const first = { id: "bench:1", index: 1 };
  const second = { id: "bench:2", index: 2 };
  const registeredSlots = [first, first, second];
  const occupied = new Set([first.id]);

  assert.deepEqual(getUniqueSeatSlots(registeredSlots), [first, second]);
  assert.deepEqual(getFreeSeatSlots(registeredSlots, (id) => occupied.has(id)), [second]);
  assert.deepEqual(getFreeSeatSlots([first], () => false), [first]);
  assert.deepEqual(getFreeSeatSlots([first], () => true), []);
  assert.equal(getSeatActionLabel(first, 2), "Sit left");
  assert.equal(getSeatActionLabel(second, 2), "Sit right");
  assert.equal(getSeatActionLabel(first, 1), "Sit");
});

test("available actions omit photo frames while exposing other actions and free seats", () => {
  const left = { id: "bench:1", index: 1 };
  const right = { id: "bench:2", index: 2 };
  const seats = [left, right];
  const frame = { id: "frame" };
  const available = getAvailableInteractionActions({
    frame,
    seats,
    isOccupied: (id) => id === left.id,
  });
  assert.deepEqual(available.map(({ type, label }) => ({ type, label })), [
    { type: "sit", label: "Sit right" },
  ]);
  assert.deepEqual(
    getAvailableInteractionActions({ frame, seats }).map(({ type, label }) => ({ type, label })),
    [{ type: "sit", label: "Sit left" }, { type: "sit", label: "Sit right" }],
  );
  assert.deepEqual(
    getAvailableInteractionActions({ guestbook: true }).map(({ type, label }) => ({ type, label })),
    [{ type: "open", label: "Open" }],
  );
});

test("seat approach accepts configured ground-height variation and enforces radius", () => {
  const seat = { position: [1, 0.57, 2], floorY: 0 };
  assert.equal(isSeatApproachable({ x: 2.8, z: 2 }, 0.1, seat, 1.85, 0.12), true);
  assert.equal(isSeatApproachable({ x: 2.86, z: 2 }, 0, seat, 1.85, 0.12), false);
  assert.equal(isSeatApproachable({ x: 1, z: 2 }, 0.121, seat, 1.85, 0.12), false);
});
