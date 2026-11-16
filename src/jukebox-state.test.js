import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPlaylist, titleFromFilename } from "../scripts/generate-playlist.mjs";
import {
  advanceEndedTrack,
  decideJukeboxJoin,
  firstTrackIndex,
  nextManualTrackIndex,
  nextTrackIndex,
  normalizeJukeboxState,
  playbackPosition,
} from "./jukebox-state.js";

test("playlist titles clean track numbers and filename separators", () => {
  assert.equal(titleFromFilename("03-Our_first-song.mp3"), "Our first song");
  assert.equal(titleFromFilename(" 12. A_Little_Moment.OGG"), "A Little Moment");
  assert.equal(titleFromFilename("Arthur Nery - Isa Lang (Lyrics).mp3"), "Arthur Nery Isa Lang (Lyrics)");
});

test("playlist generation sorts supported tracks and ignores other files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "museum-playlist-"));
  try {
    for (const filename of ["02-Later.mp3", "01_First.ogg", "cover.png", "notes.txt"]) {
      await writeFile(join(directory, filename), "");
    }
    assert.deepEqual(await buildPlaylist(directory), [
      { id: "01_First.ogg", title: "First", src: "/music/01_First.ogg" },
      { id: "02-Later.mp3", title: "Later", src: "/music/02-Later.mp3" },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("playlist generation accepts a missing or empty music folder", async () => {
  const root = await mkdtemp(join(tmpdir(), "museum-playlist-empty-"));
  const missing = join(root, "missing");
  try {
    assert.deepEqual(await buildPlaylist(missing), []);
    await mkdir(missing);
    assert.deepEqual(await buildPlaylist(missing), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("jukebox playback position uses the shared server clock and paused offset", () => {
  const playing = normalizeJukeboxState({
    index: 2, startedAt: 10_000, playing: true, pausedAt: 0, by: "resha",
  });
  assert.equal(playbackPosition(playing, 12_500), 2.5);
  assert.equal(playbackPosition({ ...playing, playing: false, pausedAt: 8.25 }, 20_000), 8.25);
  assert.equal(normalizeJukeboxState({ index: -1, startedAt: 1, playing: true }), null);
});

test("a new jukebox session ignores stale state and starts at zero", () => {
  const staleState = {
    index: 2, startedAt: 10_000, playing: true, pausedAt: 0, by: "daveRey",
  };
  const decision = decideJukeboxJoin({
    currentState: staleState,
    hasLivePartner: false,
    count: 4,
    now: 50_000,
    by: "resha",
  });
  assert.equal(decision.action, "restart");
  assert.equal(decision.state.index, 0);
  assert.equal(decision.state.startedAt, 50_000);
  assert.equal(decision.state.playing, true);
  assert.equal(decision.position, 0);
  assert.equal(decision.overwrite, true);
});

test("a live partner keeps the shared jukebox position", () => {
  const currentState = normalizeJukeboxState({
    index: 1, startedAt: 48_000, playing: true, pausedAt: 0, by: "daveRey",
  });
  const decision = decideJukeboxJoin({
    currentState,
    hasLivePartner: true,
    count: 4,
    now: 50_500,
    by: "resha",
  });
  assert.equal(decision.action, "sync");
  assert.deepEqual(decision.state, currentState);
  assert.equal(decision.position, 2.5);
  assert.equal(decision.overwrite, false);
});

test("everyJoin restarts both players and starts at the shuffled first track", () => {
  const options = { shuffle: true, seed: 345 };
  const decision = decideJukeboxJoin({
    currentState: { index: 2, startedAt: 10_000, playing: true },
    hasLivePartner: true,
    restartOnJoin: "everyJoin",
    count: 5,
    now: 50_000,
    by: "resha",
    ...options,
  });
  assert.equal(decision.action, "restart");
  assert.equal(decision.state.index, firstTrackIndex(5, options));
  assert.equal(decision.position, 0);
  assert.equal(decision.overwrite, true);
});

test("next track obeys repeat, shuffle seed, and stale ended-index checks", () => {
  assert.equal(nextTrackIndex(2, 3, { loop: "all" }), 0);
  assert.equal(nextTrackIndex(2, 3, { loop: "none" }), null);
  assert.equal(nextTrackIndex(1, 3, { loop: "one" }), 2);
  assert.equal(nextTrackIndex(0, 5, { loop: "all", shuffle: true, seed: 345 }), nextTrackIndex(0, 5, {
    loop: "all", shuffle: true, seed: 345,
  }));
  assert.notEqual(nextTrackIndex(0, 5, { loop: "all", shuffle: true, seed: 345 }), nextTrackIndex(0, 5, {
    loop: "all", shuffle: true, seed: 678,
  }));
  const state = { index: 1, startedAt: 1000, playing: true, pausedAt: 0, loop: "all", shuffle: false, seed: 1 };
  assert.equal(advanceEndedTrack(state, 0, { count: 3, now: 5000 }), null);
  assert.deepEqual(advanceEndedTrack(state, 1, { count: 3, now: 5000, by: "daveRey" }), {
    ...state, index: 2, startedAt: 5000, pausedAt: 0, playing: true, by: "daveRey", updatedAt: 5000,
  });

  test("manual Next advances and wraps even when automatic repeat is disabled", () => {
    assert.equal(nextManualTrackIndex(0, 3, { loop: "none" }), 1);
    assert.equal(nextManualTrackIndex(2, 3, { loop: "none" }), 0);
  });
});
