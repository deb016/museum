import assert from "node:assert/strict";
import test from "node:test";
import { MUSEUM_CONFIG } from "../museum.config.js";
import { ownsArchwayFrame } from "./archway-ownership.js";

test("each configured archway frame belongs to its from room only", () => {
  for (const { from, to } of MUSEUM_CONFIG.archways) {
    assert.equal(ownsArchwayFrame(from, to, MUSEUM_CONFIG.archways), true);
    assert.equal(ownsArchwayFrame(to, from, MUSEUM_CONFIG.archways), false);
  }
});
