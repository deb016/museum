import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as THREE from "three";
import {
  FRAME_STYLES,
  LIGHTING_CONFIG,
  MUSEUM_ARCHWAYS,
  MUSEUM_CARPETS,
  MUSEUM_CONFIG,
  MUSEUM_LIGHTS,
  MUSEUM_PROPS,
  ROOM_THEMES,
} from "../museum.config.js";
import { APP_CONFIG, COLLISION_CONFIG, INTERACTION_CONFIG } from "./config.js";
import { distanceToCapsuleBody, resolvePenetrations } from "./collision.js";
import { createMuseumWorld } from "./world.js";

function getRoomConfigs() {
  return [
    MUSEUM_CONFIG.architecture.atrium,
    MUSEUM_CONFIG.architecture.entranceHall,
    ...MUSEUM_CONFIG.architecture.chapters,
    ...MUSEUM_CONFIG.architecture.sideRooms,
  ];
}

function loadAllRooms(museum) {
  museum.revealSecretRoom();
  for (const room of museum.rooms) assert.equal(museum.loadRoomById(room.id), true);
}

function frameRoomMap() {
  return new Map(getRoomConfigs().map((room) => [room.id, room]));
}

test("the museum floor plan is a connected, single-level hub with five chapter wings", () => {
  const { floorPlan, architecture } = MUSEUM_CONFIG;
  assert.ok(floorPlan.topDown.length >= 5);
  assert.ok(floorPlan.topDown.some((row) => row.includes("R")));
  const hubOpenings = Object.values(architecture.atrium.openings).flat();
  assert.equal(hubOpenings.length, 5);
  assert.equal(architecture.chapters.length, 5);
  assert.ok(getRoomConfigs().every((room) => room.floorY === 0));
  assert.ok(architecture.entranceHall.height >= 7 && architecture.entranceHall.height <= 8);

  const museum = createMuseumWorld(new THREE.Scene());
  assert.equal(museum.getGroundHeight(40, 0), 0);
  assert.equal(museum.rooms.length, 12);
});

test("all room openings fit interacting characters and main lanes stay collision-free", () => {
  const { architecture } = MUSEUM_CONFIG;
  const openings = getRoomConfigs().flatMap((room) => [
    ...Object.values(room.openings ?? {}).flat(),
    ...Object.values(room.gatedOpenings ?? {}).flat(),
  ]);
  assert.ok(architecture.doorwayWidth >= 3);
  assert.ok(architecture.doorwayHeight >= 4);
  assert.ok(openings.every((opening) => opening.width >= 3));

  const museum = createMuseumWorld(new THREE.Scene());
  loadAllRooms(museum);
  for (const lane of MUSEUM_CONFIG.lanes) {
    const [x1, z1] = lane.start;
    const [x2, z2] = lane.end;
    const length = Math.hypot(x2 - x1, z2 - z1);
    const nx = (z2 - z1) / length;
    const nz = -(x2 - x1) / length;
    for (let distance = 0.6; distance < length - 0.6; distance += 0.6) {
      for (const offset of [-1.2, -0.6, 0, 0.6, 1.2]) {
        const x = x1 + ((x2 - x1) / length) * distance + nx * offset;
        const z = z1 + ((z2 - z1) / length) * distance + nz * offset;
        const point = { x, y: 0, z };
        assert.equal(
          resolvePenetrations(
            point,
            museum.colliders,
            COLLISION_CONFIG.capsuleRadius,
            COLLISION_CONFIG.capsuleHeight,
            COLLISION_CONFIG,
          ),
          false,
          `${lane.id} has an obstruction at ${x.toFixed(1)}, ${z.toFixed(1)}`,
        );
      }
    }
  }
});

test("configured props and frames stay outside archway keep-out zones", () => {
  const insideZone = (x, z, zone) =>
    x >= zone.bounds.xMin && x <= zone.bounds.xMax &&
    z >= zone.bounds.zMin && z <= zone.bounds.zMax;
  for (const room of getRoomConfigs()) {
    for (const prop of room.props ?? []) {
      for (const zone of MUSEUM_CONFIG.keepOutZones) {
        assert.equal(insideZone(prop.position[0], prop.position[2], zone), false, `${prop.type} overlaps ${zone.id}`);
      }
    }
  }
  for (const frame of MUSEUM_CONFIG.frames) {
    for (const zone of MUSEUM_CONFIG.keepOutZones) {
      assert.equal(insideZone(frame.position[0], frame.position[2], zone), false, `${frame.id} overlaps ${zone.id}`);
    }
  }
});

test("every frame is mounted on a configured wall and leaves a valid viewing spot", () => {
  const rooms = frameRoomMap();
  for (const frame of MUSEUM_CONFIG.frames) {
    const bounds = rooms.get(frame.roomId)?.bounds;
    assert.ok(bounds, `${frame.id} has a configured room`);
    const wallDistance = Math.min(
      Math.abs(frame.position[0] - bounds.xMin),
      Math.abs(frame.position[0] - bounds.xMax),
      Math.abs(frame.position[2] - bounds.zMin),
      Math.abs(frame.position[2] - bounds.zMax),
    );
    assert.ok(wallDistance <= 0.2, `${frame.id} should hang against a wall`);
    const normalX = Math.sin(frame.rotationY ?? 0);
    const normalZ = Math.cos(frame.rotationY ?? 0);
    const viewX = frame.position[0] + normalX * 4.5;
    const viewZ = frame.position[2] + normalZ * 4.5;
    assert.ok(
      viewX >= bounds.xMin + 0.4 && viewX <= bounds.xMax - 0.4 &&
      viewZ >= bounds.zMin + 0.4 && viewZ <= bounds.zMax - 0.4,
      `${frame.id} viewing point should be inside its room`,
    );
    assert.ok(frame.height >= 1.2 && frame.height <= 4.6);
  }
});

test("wall-mounted frames remain static artwork when their rooms load", () => {
  const museum = createMuseumWorld(new THREE.Scene());
  loadAllRooms(museum);

  for (const config of MUSEUM_CONFIG.frames) {
    const frame = museum.frames.find(({ config: frameConfig }) => frameConfig.id === config.id);
    const artwork = frame?.object?.getObjectByName(`frameArtwork_${config.id}`);
    assert.ok(frame?.object, `${config.id} is rendered in its room`);
    assert.ok(artwork, `${config.id} has a visible artwork surface`);
    assert.equal(frame.artworkMaterial.type, "MeshBasicMaterial", `${config.id} is not dimmed by room lighting`);
    assert.equal(frame.artworkMaterial.side, THREE.DoubleSide, `${config.id} is visible from either side`);
    assert.ok(artwork.position.z > 0.15, `${config.id} artwork sits in front of the frame and wall`);
    assert.ok(frame.collider.solid, `${config.id} remains physically mounted`);
    assert.equal(frame.trigger, undefined, `${config.id} has no interaction trigger`);
  }
  assert.equal(museum.getFramesNear, undefined);
  assert.equal(museum.highlightFrame, undefined);
});

test("Room 2 fits portrait and landscape art on both side walls and keeps its guestbook alcove", () => {
  const room = MUSEUM_CONFIG.architecture.chapters.find((item) => item.id === "our-first-month");
  const frames = MUSEUM_CONFIG.frames.filter((frame) => frame.roomId === room.id && frame.id.startsWith("month-"));
  const sideFrames = frames.filter((frame) => frame.id !== "month-hero");
  const left = sideFrames.filter((frame) => frame.position[2] < 0);
  const right = sideFrames.filter((frame) => frame.position[2] > 0);
  assert.equal(left.length, 2);
  assert.equal(right.length, 2);
  for (const wall of [left, right]) {
    assert.ok(wall.some((frame) => frame.aspectRatio < 1));
    assert.ok(wall.some((frame) => frame.aspectRatio > 1));
  }
  const console = room.props.find((prop) => prop.type === "console");
  assert.ok(console);
  assert.deepEqual(console.position, MUSEUM_CONFIG.guestbook.position);

  const museum = createMuseumWorld(new THREE.Scene());
  const monthRoom = museum.rooms.find((item) => item.id === room.id);
  museum.loadRoomById(room.id);
  assert.equal(monthRoom.loaded, true);
  assert.equal(museum.frames.filter((frame) => frame.room.id === room.id).length, frames.length);
});

test("all numbered memories and the video are assigned to existing media files", () => {
  const frames = MUSEUM_CONFIG.frames.filter(({ path }) => path?.startsWith("/media/memories/"));
  assert.equal(frames.length, MUSEUM_CONFIG.frames.length, "every configured frame has assigned media");
  const assetNumbers = frames.map(({ path }) => {
    assert.ok(existsSync(new URL(`../public${path}`, import.meta.url)), `${path} exists`);
    return Number(path.match(/\/(\d+)\.(?:jpg|mp4)$/)?.[1]);
  });
  assert.equal(frames.filter(({ mediaType }) => mediaType === "image").length, 22);
  assert.equal(frames.filter(({ mediaType }) => mediaType === "video").length, 1);
  assert.deepEqual(assetNumbers.sort((left, right) => left - right), Array.from({ length: 23 }, (_, index) => index + 1));
  assert.equal(new Set(frames.filter(({ mediaType }) => mediaType === "image").map(({ path }) => path)).size, 22);
  const cinema = frames.find(({ mediaType }) => mediaType === "video");
  assert.equal(cinema.id, "cinema-screen");
  assert.equal(cinema.roomId, "cinema");
  assert.equal(cinema.path, "/media/memories/23.mp4");
  assert.equal(cinema.aspectRatio, 16 / 9);
  assert.equal(cinema.height, 4.4);
  assert.ok(existsSync(new URL(`../public${cinema.posterPath}`, import.meta.url)));
  const cinemaSpawn = MUSEUM_CONFIG.fastTravelSpawns.cinema.position;
  const screenDistance = Math.hypot(
    cinemaSpawn[0] - cinema.position[0],
    cinemaSpawn[1] - cinema.position[1],
    cinemaSpawn[2] - cinema.position[2],
  );
  assert.ok(screenDistance <= INTERACTION_CONFIG.videoPlayDistance, "video plays from the Cinema Room spawn");
});

test("every table, cafe table, and console receives instanced tulips", () => {
  const museum = createMuseumWorld(new THREE.Scene());
  loadAllRooms(museum);
  let tableCount = 0;
  for (const config of [...MUSEUM_CONFIG.architecture.chapters, ...MUSEUM_CONFIG.architecture.sideRooms]) {
    const room = museum.rooms.find((item) => item.id === config.id);
    for (const [index, prop] of (config.props ?? []).entries()) {
      if (!["table", "cafeTable", "console"].includes(prop.type)) continue;
      tableCount += 1;
      const prefix = `${config.id}_${prop.type}_${index}`;
      const flowers = room.group.children.filter((object) => object.name.startsWith(`${prefix}_tulip_`));
      assert.ok(room.group.children.some((object) => object.name === `${prefix}_vase`));
      assert.ok(flowers.some((object) => object.name.endsWith("_stems_instanced") && object.count === 5));
      assert.ok(flowers.some((object) => object.name.endsWith("_leaves_instanced") && object.count === 10));
      assert.deepEqual(
        flowers.filter((object) => object.name.includes("_petals_")).map((object) => object.count),
        [6, 6, 3],
      );
    }
  }
  assert.ok(tableCount >= 4);
  assert.equal(museum.colliders.some((collider) => /vase|tulip/i.test(collider.name)), false);
});

test("configured floor surfaces use distinct procedural finishes", () => {
  const scene = new THREE.Scene();
  const museum = createMuseumWorld(scene);
  const surfaces = new Map();
  const prefixByRoom = {
    atrium: "atrium",
    "entrance-hall": "entrance",
  };
  for (const room of getRoomConfigs()) {
    const prefix = prefixByRoom[room.id] ?? `shell_${room.id}`;
    const floor = scene.getObjectByName(`${prefix}_floor`);
    assert.ok(floor?.material?.map, `${room.id} has a textured floor`);
    assert.ok(floor.material.map.image.data instanceof Uint8Array);
    surfaces.set(room.floorType, floor.material.map);
  }
  assert.deepEqual([...surfaces.keys()].sort(), ["carpet", "grass", "marble", "stone", "wood"]);
  assert.equal(new Set(surfaces.values()).size, surfaces.size);
  assert.equal(museum.rooms.length, getRoomConfigs().length);
});

test("collectible hearts have a bright hull and halo, then burst briefly on collection", () => {
  const scene = new THREE.Scene();
  const museum = createMuseumWorld(scene, { qualityTier: "Low" });
  const config = MUSEUM_CONFIG.hearts[0];
  museum.loadRoomById(config.roomId);
  const heart = museum.hearts.find((item) => item.id === config.id);
  assert.ok(heart && heart.object.visible);
  assert.equal(heart.outline.material.side, THREE.BackSide);
  assert.equal(heart.halo.material.transparent, true);
  assert.equal(heart.sparkles, null);

  const trigger = heart.collider;
  assert.equal(museum.setHeartCollected(config.id), true);
  assert.equal(heart.object.visible, false);
  assert.equal(museum.colliders.includes(trigger), false);
  assert.equal(heart.room.colliders.includes(trigger), false);
  museum.update({ x: config.position[0], y: config.position[1], z: config.position[2] }, 0.3);
  assert.ok(scene.getObjectByName(`heart-collect-burst_${config.id}`));
  museum.update({ x: config.position[0], y: config.position[1], z: config.position[2] }, 1);
  assert.equal(scene.getObjectByName(`heart-collect-burst_${config.id}`), undefined);
  assert.equal(museum.setHeartCollected(config.id), false);
});

test("every collectible heart is inside an always-reachable room", () => {
  assert.equal(MUSEUM_CONFIG.hearts.length, 5);
  assert.deepEqual(MUSEUM_CONFIG.hearts.map((heart) => heart.id), [
    "heart-atrium",
    "heart-meet",
    "heart-month",
    "heart-favorites",
    "heart-garden",
  ]);
  const rooms = new Map(getRoomConfigs().map((room) => [room.id, room]));
  for (const heart of MUSEUM_CONFIG.hearts) {
    const room = rooms.get(heart.roomId);
    assert.ok(room, `${heart.id} references a configured room`);
    const { xMin, xMax, zMin, zMax } = room.bounds;
    assert.ok(
      heart.position[0] >= xMin && heart.position[0] <= xMax &&
      heart.position[2] >= zMin && heart.position[2] <= zMax,
      `${heart.id} is inside ${room.id}`,
    );
    assert.notEqual(room.id, "secret-room", `${heart.id} is not behind the heart gate`);
    assert.notEqual(room.id, "final-room", `${heart.id} is not in the final room`);
    assert.equal(Boolean(room.hiddenUntilRevealed), false, `${heart.id} is in a revealed-by-default room`);
  }

  const museum = createMuseumWorld(new THREE.Scene());
  for (const heart of MUSEUM_CONFIG.hearts) {
    assert.equal(museum.loadRoomById(heart.roomId), true);
    const playerPosition = new THREE.Vector3(heart.position[0], 0, heart.position[2]);
    resolvePenetrations(
      playerPosition,
      museum.colliders,
      COLLISION_CONFIG.capsuleRadius,
      COLLISION_CONFIG.capsuleHeight,
      COLLISION_CONFIG,
    );
    assert.ok(
      distanceToCapsuleBody(playerPosition, COLLISION_CONFIG.capsuleHeight, heart.position) <=
        INTERACTION_CONFIG.heartCollectDistance,
      `${heart.id} has a collision-free collection position`,
    );
  }
});

test("the rotunda jukebox stays decorative and solid without a world interaction", () => {
  const jukeboxRoom = MUSEUM_CONFIG.architecture.atrium;
  const jukeboxProp = jukeboxRoom.props.find((prop) => prop.type === "jukebox");
  assert.ok(jukeboxProp);
  const insideJokesRoom = MUSEUM_CONFIG.architecture.chapters.find((room) => room.id === "inside-jokes");
  assert.equal(insideJokesRoom.props.some((prop) => prop.type === "jukebox"), false);
  assert.equal(jukeboxRoom.props.filter((prop) => prop.type === "jukebox").length, 1);
  assert.deepEqual(jukeboxProp.position, MUSEUM_CONFIG.jukebox.position);
  assert.equal(jukeboxProp.rotationY, MUSEUM_CONFIG.jukebox.rotationY);
  assert.equal(Number.isInteger(jukeboxProp.rotationY / (Math.PI / 2)), true);
  const [x, , z] = jukeboxProp.position;
  const cabinetWidth = 1.19 * 0.8;
  const cabinetDepth = 0.68;
  const halfX = (Math.abs(Math.cos(jukeboxProp.rotationY)) * cabinetWidth +
    Math.abs(Math.sin(jukeboxProp.rotationY)) * cabinetDepth) / 2;
  const halfZ = (Math.abs(Math.sin(jukeboxProp.rotationY)) * cabinetWidth +
    Math.abs(Math.cos(jukeboxProp.rotationY)) * cabinetDepth) / 2;
  assert.ok(x - halfX >= jukeboxRoom.bounds.xMin && x + halfX <= jukeboxRoom.bounds.xMax);
  assert.ok(z - halfZ >= jukeboxRoom.bounds.zMin && z + halfZ <= jukeboxRoom.bounds.zMax);
  const forward = [Math.sin(jukeboxProp.rotationY), Math.cos(jukeboxProp.rotationY)];
  const toCenter = [-x, -z];
  const facingDot = (forward[0] * toCenter[0] + forward[1] * toCenter[1]) /
    Math.hypot(...toCenter);
  assert.ok(facingDot > 0.99);

  for (const opening of MUSEUM_CONFIG.keepOutZones.filter((zone) => zone.id.startsWith("arch-hub-"))) {
    const dx = Math.max(opening.bounds.xMin - (x + halfX), (x - halfX) - opening.bounds.xMax, 0);
    const dz = Math.max(opening.bounds.zMin - (z + halfZ), (z - halfZ) - opening.bounds.zMax, 0);
    assert.ok(Math.hypot(dx, dz) >= 2, `${opening.id} has 2m clearance`);
  }
  const fountain = MUSEUM_CONFIG.architecture.fountain;
  const jukeboxFootprintRadius = Math.hypot(halfX, halfZ);
  assert.ok(Math.hypot(x - fountain.position[0], z - fountain.position[2]) >
    jukeboxFootprintRadius + fountain.radius);
  assert.ok(Math.hypot(x, z) - 7.4 > jukeboxFootprintRadius + 0.22, "lanterns remain clear");
  const wallInnerSurface = jukeboxRoom.bounds.zMax - MUSEUM_CONFIG.architecture.wallThickness;
  const backEdge = z + cabinetDepth / 2;
  assert.ok(Math.abs(wallInnerSurface - backEdge - 0.05) < 1e-8, "cabinet back is 5cm from the wall");

  const museum = createMuseumWorld(new THREE.Scene());
  assert.equal(museum.interactables.some((item) => item.roomId === "atrium" && item.kind === "jukebox"), false);
  const collider = museum.colliders.find((item) => item.name === "col_atrium_jukebox_0");
  assert.equal(collider.solid, true);
  assert.ok(Math.abs(collider.size[0] - cabinetWidth) < 1e-8);
  assert.ok(Math.abs(collider.size[1] - 2) < 1e-8);
  assert.ok(Math.abs(collider.size[2] - cabinetDepth) < 1e-8);

  const atrium = museum.rooms.find((room) => room.id === "atrium");
  const cabinet = atrium.group.getObjectByName("atrium_jukebox_0_jukebox");
  const base = cabinet.getObjectByName("atrium_jukebox_0_base-brass");
  assert.ok(Math.abs(base.position.y - base.geometry.parameters.height / 2) < 1e-8);
  const crown = cabinet.getObjectByName("atrium_jukebox_0_arched-brass-crown");
  crown.geometry.computeBoundingBox();
  const cabinetTop = crown.position.y + crown.geometry.boundingBox.max.y * crown.scale.y;
  assert.ok(cabinetTop >= 1.8 && cabinetTop <= 2);
});

test("room shells stay visible while locked secret shells remain hidden", () => {
  const museum = createMuseumWorld(new THREE.Scene());
  for (const room of museum.rooms) {
    const isLockedRoom = room.id === "secret-room" || room.id === "final-room";
    assert.equal(room.shell.visible, !isLockedRoom, `${room.id} shell visibility`);
  }
  assert.equal(museum.rooms.find((room) => room.id === "secret-room").locked, true);
  assert.equal(museum.rooms.find((room) => room.id === "final-room").locked, true);
  assert.equal(museum.loadRoomById("secret-room"), false);
  assert.equal(museum.loadRoomById("final-room"), false);

  museum.revealSecretRoom();
  for (const id of ["secret-room", "final-room"]) {
    const room = museum.rooms.find((item) => item.id === id);
    assert.equal(room.locked, false);
    assert.equal(room.shell.visible, true);
    assert.equal(museum.loadRoomById(id), true);
  }
});

test("the secret wall is solid until heart unlock, then becomes a permanent open arch", () => {
  const scene = new THREE.Scene();
  const museum = createMuseumWorld(scene);
  const gate = museum.colliders.find((collider) => collider.name.includes("secret-wall-section"));
  assert.ok(gate?.solid);
  assert.equal(museum.secretRevealed, false);
  assert.equal(museum.loadRoomById("secret-room"), false);
  assert.equal(museum.revealSecretRoom(), true);
  assert.equal(museum.secretRevealed, true);
  assert.equal(museum.colliders.includes(gate), false);
  museum.update({ x: 9, y: 0, z: 30 }, 1);
  assert.equal(museum.rooms.find((room) => room.id === "secret-room").loaded, true);
  let wallSection;
  scene.traverse((object) => {
    if (object.name === "shell_inside-jokes_secret-wall-section") wallSection = object;
  });
  assert.equal(wallSection.visible, false);
});

test("the last collected heart starts the gate animation only near the doorway", () => {
  const scene = new THREE.Scene();
  const collectedHearts = new Set(MUSEUM_CONFIG.hearts.slice(0, -1).map((heart) => heart.id));
  const museum = createMuseumWorld(scene, { collectedHearts });
  const lastHeart = MUSEUM_CONFIG.hearts[MUSEUM_CONFIG.hearts.length - 1];
  const gate = museum.colliders.find((collider) => collider.name.includes("secret-wall-section"));
  assert.ok(gate?.solid);
  assert.equal(museum.loadRoomById(lastHeart.roomId), true);
  assert.equal(museum.setHeartCollected(lastHeart.id), true);
  assert.equal(museum.secretRevealed, true);
  assert.equal(museum.rooms.find((room) => room.id === "secret-room").locked, false);
  assert.equal(museum.colliders.includes(gate), true);

  for (let index = 0; index < 10; index += 1) {
    museum.update({ x: 6, y: 0, z: -48 }, 0.1);
  }
  assert.equal(museum.colliders.includes(gate), true);

  for (let index = 0; index < 40; index += 1) {
    museum.update({ x: 9, y: 0, z: 30 }, 0.1);
  }
  assert.equal(museum.colliders.includes(gate), false);
  assert.equal(scene.getObjectByName("secret-gate-unlock-effects"), undefined);
  let wallSection;
  scene.traverse((object) => {
    if (object.name === "shell_inside-jokes_secret-wall-section") wallSection = object;
  });
  assert.equal(wallSection.visible, false);
});

test("shared heart collection handles unloaded rooms and reveals the secret room", () => {
  const scene = new THREE.Scene();
  const collectedHearts = new Set();
  const museum = createMuseumWorld(scene, { collectedHearts });
  const unloadedHeart = MUSEUM_CONFIG.hearts.find((heart) =>
    !museum.rooms.find((room) => room.id === heart.roomId).loaded);
  assert.ok(unloadedHeart);
  assert.equal(museum.setHeartCollected(unloadedHeart.id), true);
  assert.equal(collectedHearts.has(unloadedHeart.id), true);

  assert.equal(museum.loadRoomById(unloadedHeart.roomId), true);
  assert.equal(museum.hearts.some((heart) => heart.id === unloadedHeart.id), false);
  assert.equal(scene.getObjectByName(`collectible_${unloadedHeart.id}`), undefined);

  const remainingHearts = MUSEUM_CONFIG.hearts.filter((heart) => heart.id !== unloadedHeart.id);
  for (const heart of remainingHearts) assert.equal(museum.setHeartCollected(heart.id), true);
  assert.equal(museum.secretRevealed, true);
  assert.equal(museum.rooms.find((room) => room.id === "secret-room").locked, false);
});

test("saved completion opens the secret gate instantly", () => {
  const scene = new THREE.Scene();
  const collectedHearts = new Set(MUSEUM_CONFIG.hearts.map((heart) => heart.id));
  const museum = createMuseumWorld(scene, { collectedHearts });
  assert.equal(museum.secretRevealed, true);
  assert.equal(museum.colliders.some((collider) => collider.name.includes("secret-wall-section")), false);
  assert.equal(scene.getObjectByName("secret-gate-unlock-effects"), undefined);
  let wallSection;
  scene.traverse((object) => {
    if (object.name === "shell_inside-jokes_secret-wall-section") wallSection = object;
  });
  assert.equal(wallSection.visible, false);
  for (const id of ["secret-room", "final-room"]) {
    assert.equal(museum.rooms.find((room) => room.id === id).shell.visible, true);
  }
});

test("the scene contains no doors, stairs, balconies, or upper-floor structures", () => {
  const scene = new THREE.Scene();
  const museum = createMuseumWorld(scene);
  loadAllRooms(museum);
  const names = [];
  scene.traverse((object) => names.push(object.name));
  assert.ok(names.every((name) => !/(door|stair|balcony|mezzanine|second.?floor)/i.test(name)));
  assert.ok(museum.colliders.every((collider) => !/(door|stair|balcony|mezzanine)/i.test(collider.name)));
});

test("the guide route, minimap rooms, and travel destinations cover the whole museum", () => {
  assert.equal(MUSEUM_CONFIG.architecture.guideRoute.length >= 8, true);
  const roomIds = new Set(getRoomConfigs().map((room) => room.id));
  for (const frame of MUSEUM_CONFIG.frames) assert.ok(roomIds.has(frame.roomId));
  assert.ok(MUSEUM_CONFIG.hearts.every((heart) => roomIds.has(heart.roomId)));
  assert.ok(MUSEUM_CONFIG.frames.some((frame) => frame.id === "cinema-screen"));
  assert.ok(MUSEUM_CONFIG.frames.some((frame) => frame.roomId === "final-room"));
  assert.equal(INTERACTION_CONFIG.seating.seatHeight > 0, true);
  assert.equal(APP_CONFIG.frameHeight > 0, true);
});

test("room, archway, frame, prop, carpet, and light catalogs are complete and referentially valid", () => {
  const roomIds = new Set(getRoomConfigs().map((room) => room.id));
  assert.ok(MUSEUM_ARCHWAYS.length >= 10);
  for (const link of MUSEUM_ARCHWAYS) {
    assert.ok(roomIds.has(link.from) && roomIds.has(link.to), `${link.id} references configured rooms`);
    assert.ok(link.width >= 3.2);
  }
  for (const frame of MUSEUM_CONFIG.frames) {
    assert.ok(frame.sizeClass);
    assert.ok(FRAME_STYLES[frame.style]);
    assert.ok(frame.aspectRatio > 0 && frame.height * frame.aspectRatio > 0);
  }
  assert.ok(MUSEUM_PROPS.length > MUSEUM_CARPETS.length);
  assert.ok(MUSEUM_CARPETS.every((carpet) => carpet.type === "rug" && carpet.width > 0 && carpet.depth > 0));
  assert.ok(MUSEUM_LIGHTS.length >= roomIds.size);
  for (const room of getRoomConfigs()) {
    assert.ok(["wood", "marble", "carpet", "grass", "stone"].includes(room.floorType), `${room.id} needs a footstep surface`);
    assert.equal(ROOM_THEMES[room.id].music.length, 4, `${room.id} needs a music layer`);
    assert.ok(["chimes", "fountain", "crickets"].includes(ROOM_THEMES[room.id].ambience));
  }
});

test("distance visibility culls distant room shells and retains nearby room content", () => {
  const scene = new THREE.Scene();
  const museum = createMuseumWorld(scene);
  museum.root.visible = true;
  loadAllRooms(museum);
  museum.update({ x: -23, y: 0, z: 0 }, 0);
  let nearbyVisible = false;
  let distantShellVisible = false;
  let distantContentVisible = true;
  scene.traverse((object) => {
    if (object.name === "room_how-we-met") nearbyVisible = object.visible;
    if (object.name === "room_final-room") distantShellVisible = object.visible;
    if (object.name === "content_final-room") distantContentVisible = object.visible;
  });
  assert.equal(nearbyVisible, true);
  assert.equal(distantShellVisible, true);
  assert.equal(distantContentVisible, false);
});

test("rooms connected by a doorway stay visible even beyond their load radius", () => {
  const museum = createMuseumWorld(new THREE.Scene());
  museum.root.visible = true;
  museum.update({ x: -23, y: 0, z: 9 }, 0);
  const cinema = museum.rooms.find((room) => room.id === "cinema");
  assert.ok(cinema.loaded);
  assert.equal(cinema.group.visible, true);

  museum.update({ x: 9, y: 0, z: 30 }, 0);
  const secretRoom = museum.rooms.find((room) => room.id === "secret-room");
  assert.equal(secretRoom.locked, true);
  assert.equal(secretRoom.loaded, false);

  museum.update({ x: -100, y: 0, z: 0 }, 0);
  assert.equal(cinema.group.visible, false);
  assert.equal(cinema.shell.visible, true);
});

test("lighting quality tiers toggle shafts and dust without adding real-time room lights", () => {
  const scene = new THREE.Scene();
  const museum = createMuseumWorld(scene);
  let realTimeLights = 0;
  scene.traverse((object) => {
    if (object.isLight) realTimeLights += 1;
  });
  assert.equal(realTimeLights, 0);

  museum.setLightingQuality("Low", { ...LIGHTING_CONFIG.effects, dust: false });
  let shaftVisible = false;
  let dustVisible = true;
  scene.traverse((object) => {
    if (object.name === "shell_how-we-met_light-shaft") shaftVisible = object.visible;
    if (object.name === "shell_how-we-met_light-dust") dustVisible = object.visible;
  });
  assert.equal(shaftVisible, false);
  assert.equal(dustVisible, false);

  museum.setLightingQuality("High", LIGHTING_CONFIG.effects);
  scene.traverse((object) => {
    if (object.name === "shell_how-we-met_light-shaft") shaftVisible = object.visible;
    if (object.name === "shell_how-we-met_light-dust") dustVisible = object.visible;
  });
  assert.equal(shaftVisible, true);
  assert.equal(dustVisible, true);
  for (const room of getRoomConfigs()) {
    const mood = ROOM_THEMES[room.id];
    assert.ok(mood && Number.isFinite(mood.lightIntensity) && Number.isFinite(mood.fogDensity));
  }
  museum.loadRoomById("how-we-met");
  let pictureLight;
  let pictureWash;
  scene.traverse((object) => {
    if (object.name === "framePictureLight_meet-hero") pictureLight = object.material;
    if (object.name === "framePictureWash_meet-hero") pictureWash = object;
  });
  assert.ok(pictureLight);
  assert.ok(pictureWash);
  museum.setTimeOfDay(0);
  const goldenHourIntensity = pictureLight.emissiveIntensity;
  museum.setTimeOfDay(1);
  assert.ok(pictureLight.emissiveIntensity > goldenHourIntensity);
});

test("interactive objects have non-blocking triggers, standing slots, and swing seats", () => {
  const museum = createMuseumWorld(new THREE.Scene());
  loadAllRooms(museum);
  const kinds = new Set(museum.interactables.map((item) => item.kind));
  for (const kind of ["fountain", "piano", "photoBooth", "memoryOrb", "telescope"]) {
    assert.ok(kinds.has(kind), `missing ${kind} interaction`);
  }
  for (const item of museum.interactables) {
    assert.ok(item.slots?.length || item.position.length === 3, `${item.id} needs a standing slot`);
    assert.equal(item.trigger.solid, false, `${item.id} trigger must not block movement`);
  }
  assert.ok(museum.seats.some((seat) => seat.groupId.includes("swing")), "swing uses seat slots");
  assert.ok(museum.colliders.some((collider) => collider.name.includes("piano")));
  assert.ok(museum.colliders.some((collider) => collider.name.includes("photoBooth")));
});

test("final skylight reveal is one-shot and its panel clears after the opening animation", () => {
  const scene = new THREE.Scene();
  const museum = createMuseumWorld(scene);
  let skylight;
  scene.traverse((object) => {
    if (object.name === "shell_final-room_stars_glass") skylight = object;
  });
  assert.ok(skylight?.visible);
  assert.equal(museum.triggerFinalReveal(), true);
  assert.equal(museum.triggerFinalReveal(), false);
  museum.update({ x: 9, y: 0, z: 61 }, 2);
  assert.equal(skylight.visible, false);
});
