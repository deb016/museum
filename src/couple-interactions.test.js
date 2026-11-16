import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createCharacter, resetCharacterPose, restoreSkirtShape } from "./characters.js";
import { COUPLE_INTERACTION_CONFIG } from "./config.js";
import {
  applyCoupleInteraction,
  canRequestCoupleAction,
  chooseSimultaneousRequest,
  createCoupleInteraction,
  createEndingTargets,
  interactionWeight,
  shouldAllowPiggyback,
} from "./couple-interactions.js";

globalThis.document ??= {
  createElement() {
    return {
      getContext() {
        return {
          fillRect() {},
          save() {},
          restore() {},
          translate() {},
          rotate() {},
          beginPath() {},
          ellipse() {},
          arc() {},
          fill() {},
          set fillStyle(value) { void value; },
        };
      },
    };
  },
};

function createPair() {
  const dave = createCharacter("daveRey");
  const resha = createCharacter("resha");
  dave.position.set(-0.45, 0, 0);
  resha.position.set(0.45, 0, 0);
  return { dave, resha };
}

function assertHairAttached(resha, action, weight) {
  const head = resha.userData.interactionRig.head;
  const hair = resha.userData.interactionRig.hairPivot;
  assert.equal(hair.parent, head);
  const maxDistance = 0.02;
  const distance = (position) => Math.hypot(position.x, position.y, position.z);
  for (const name of ["hairCrown", "hairBack"]) {
    const center = resha.getObjectByName(name).position.clone().add(hair.position);
    assert.ok(distance(center) <= maxDistance, `${action} ${name}, weight ${weight}`);
  }
  const longHair = resha.getObjectByName("longHairPivot");
  assert.equal(longHair.parent, hair);
  assert.ok(distance(longHair.position.clone().add(hair.position)) <= maxDistance);
}

test("interaction actions align real characters and rebuild their poses without replacing the meshes", () => {
  const now = 100000;
  for (const action of ["hold", "hug", "kissCheek", "kissForehead", "slowDance", "happyDance"]) {
    const { dave, resha } = createPair();
    const state = createCoupleInteraction(action, dave, resha);
    state.phase = "ACTIVE";
    state.startedAt = now;
    state.center.y = 0;
    dave.position.set(state.toLeader.x, state.toLeader.y, state.toLeader.z);
    dave.rotation.y = state.toLeader.yaw;
    const daveBody = dave.getObjectByName("whiteTee");
    const reshaSkirt = resha.userData.skirtMesh;

    const result = applyCoupleInteraction(state, dave, resha, now);

    assert.ok(result.weight > 0);
    assert.equal(dave.getObjectByName("whiteTee"), daveBody);
    assert.equal(resha.userData.skirtMesh, reshaSkirt);
    assert.ok(Number.isFinite(resha.position.x) && Number.isFinite(resha.position.z));
    assertHairAttached(resha, action, result.weight);
    if (["hold", "hug", "slowDance", "piggyback"].includes(action)) {
      assert.ok(result.handError < 0.02, `${action}: ${result.handError}m hand error`);
    }
    if (action === "kissCheek" || action === "kissForehead") {
      assert.ok(result.kissGap > 0.015 && result.kissGap < 0.07, `${action}: ${result.kissGap}m lip gap`);
    }
  }
});

test("joined hands meet at the waist or outside shoulder for either slow-dance leader", () => {
  const now = 150000;
  for (const action of ["hold", "slowDance"]) {
    for (const roles of [["daveRey", "resha"], ["resha", "daveRey"]]) {
      const { dave, resha } = createPair();
      const characters = { daveRey: dave, resha };
      const leader = characters[roles[0]];
      const follower = characters[roles[1]];
      const state = createCoupleInteraction(action, leader, follower);
      state.phase = "ACTIVE";
      state.startedAt = now;
      leader.position.set(state.toLeader.x, state.toLeader.y, state.toLeader.z);
      leader.rotation.y = state.toLeader.yaw;
      follower.position.set(state.toFollower.x, state.toFollower.y, state.toFollower.z);
      follower.rotation.y = state.toFollower.yaw;

      const result = applyCoupleInteraction(state, leader, follower, now);
      const leaderSide = action === "hold" ? -1 : 1;
      const followerSide = -leaderSide;
      const leaderHand = leader.userData.interactionRig.arms
        .find((arm) => arm.side === leaderSide).hand.getWorldPosition(new THREE.Vector3());
      const followerHand = follower.userData.interactionRig.arms
        .find((arm) => arm.side === followerSide).hand.getWorldPosition(new THREE.Vector3());

      assert.ok(result.handError < 0.02, `${action}, ${roles[0]} leader: ${result.handError}m`);
      assert.ok(leaderHand.distanceTo(followerHand) < 0.02, `${action}, ${roles[0]} leader`);
      if (action === "slowDance") {
        assert.ok(Math.abs(leaderHand.y - COUPLE_INTERACTION_CONFIG.slowDance.handHeight) < 0.02);
      }
    }
  }
});

test("slow-dance clasp and resting hands stay reachable through a full sway for either leader", () => {
  const start = 250000;
  const samples = 40;
  for (const roles of [["daveRey", "resha"], ["resha", "daveRey"]]) {
    const characters = Object.fromEntries(
      ["daveRey", "resha"].map((kind) => [kind, createCharacter(kind)]),
    );
    const leader = characters[roles[0]];
    const follower = characters[roles[1]];
    leader.position.set(-0.45, 0, 0);
    follower.position.set(0.45, 0, 0);
    const state = createCoupleInteraction("slowDance", leader, follower);
    state.phase = "ACTIVE";
    state.startedAt = start;
    leader.position.set(state.toLeader.x, state.toLeader.y, state.toLeader.z);
    leader.rotation.y = state.toLeader.yaw;
    follower.position.set(state.toFollower.x, state.toFollower.y, state.toFollower.z);
    follower.rotation.y = state.toFollower.yaw;

    const leaderClaspArm = leader.userData.interactionRig.arms.find((arm) => arm.side === 1);
    const followerClaspArm = follower.userData.interactionRig.arms.find((arm) => arm.side === -1);
    const leaderRestArm = leader.userData.interactionRig.arms.find((arm) => arm.side === -1);
    const followerRestArm = follower.userData.interactionRig.arms.find((arm) => arm.side === 1);
    for (let sample = 0; sample <= samples; sample += 1) {
      const now = start + (sample / samples) * COUPLE_INTERACTION_CONFIG.slowDance.periodSeconds * 1000;
      const result = applyCoupleInteraction(state, leader, follower, now);
      const midpointX = (leader.position.x + follower.position.x) / 2;
      const midpointZ = (leader.position.z + follower.position.z) / 2;
      const offsetX = COUPLE_INTERACTION_CONFIG.slowDance.handSide * Math.cos(leader.rotation.y);
      const offsetZ = -COUPLE_INTERACTION_CONFIG.slowDance.handSide * Math.sin(leader.rotation.y);
      const target = new THREE.Vector3(
        midpointX + offsetX,
        COUPLE_INTERACTION_CONFIG.slowDance.handHeight,
        midpointZ + offsetZ,
      );
      const checkReach = (character, arm, role) => {
        character.updateWorldMatrix(true, true);
        const shoulderDistance = arm.shoulder.getWorldPosition(new THREE.Vector3()).distanceTo(target);
        const reach = arm.upperLength + arm.lowerLength - COUPLE_INTERACTION_CONFIG.ikReachEpsilon;
        assert.ok(
          shoulderDistance < reach,
          `${roles[0]} leader ${role}: shoulder-to-target ${shoulderDistance.toFixed(3)}m exceeds ${reach.toFixed(3)}m reach`,
        );
        assert.ok(
          arm.hand.getWorldPosition(new THREE.Vector3()).distanceTo(target) < 0.03,
          `${roles[0]} leader ${role}: hand missed shared target`,
        );
      };
      checkReach(leader, leaderClaspArm, "leader clasp");
      checkReach(follower, followerClaspArm, "follower clasp");
      assert.ok(result.handError < 0.03, `${roles[0]} leader: ${result.handError}m hand error`);
      assert.ok(state.poseErrors.hands < 0.03, `${roles[0]} leader: poseErrors.hands=${state.poseErrors.hands}`);
      assert.ok(
        leaderRestArm.hand.getWorldPosition(new THREE.Vector3())
          .distanceTo(follower.userData.interactionRig.points.waistL.getWorldPosition(new THREE.Vector3())) < 0.03,
        `${roles[0]} leader: resting hand missed partner's waist`,
      );
      assert.ok(
        followerRestArm.hand.getWorldPosition(new THREE.Vector3())
          .distanceTo(leader.userData.interactionRig.points.shR.getWorldPosition(new THREE.Vector3())) < 0.03,
        `${roles[0]} leader: resting hand missed partner's shoulder`,
      );
    }
  }
});

test("head hair stays attached at each alignment weight for all actions and kiss roles", () => {
  const { dave, resha } = createPair();
  const now = 700000;
  for (const action of ["hold", "hug", "kissCheek", "kissForehead", "piggyback", "slowDance", "happyDance"]) {
    const roles = action === "piggyback" ? [[dave, resha]] : [[dave, resha], [resha, dave]];
    for (const [leader, follower] of roles) {
      for (const progress of [0, 0.5, 1]) {
        dave.position.set(-0.45, 0, 0);
        dave.rotation.set(0, 0, 0);
        resha.position.set(0.45, 0, 0);
        resha.rotation.set(0, 0, 0);
        const state = createCoupleInteraction(action, leader, follower);
        state.phase = "ALIGNING";
        state.startedAt = now;
        state.phaseStartedAt = now;
        applyCoupleInteraction(
          state,
          leader,
          follower,
          now + COUPLE_INTERACTION_CONFIG.alignSeconds * progress * 1000,
        );
        assertHairAttached(resha, action, progress);
        if (["kissCheek", "kissForehead", "piggyback"].includes(action)) {
          const ending = createEndingTargets(state, leader, follower);
          state.phase = "ENDING";
          state.phaseStartedAt = now;
          state.endFrom = ending.endFrom;
          state.endTo = ending.endTo;
          for (const endingProgress of [0, 0.5, 1]) {
            applyCoupleInteraction(
              state,
              leader,
              follower,
              now + COUPLE_INTERACTION_CONFIG.endingSeconds * endingProgress * 1000,
            );
            assertHairAttached(resha, action, endingProgress);
          }
        }
        state.phase = "FREE";
        applyCoupleInteraction(state, leader, follower, now + 1);
      }
    }
  }
});

test("piggyback mounts Resha onto Dave's seat point and returns her skirt to standing", () => {
  const { dave, resha } = createPair();
  const state = createCoupleInteraction("piggyback", dave, resha);
  state.phase = "ACTIVE";
  state.startedAt = 200000;

  const result = applyCoupleInteraction(state, dave, resha, 200000);

  assert.ok(result.seatError < 0.03, `${result.seatError}m seat error`);
  assert.equal(resha.userData.skirtMesh.userData.shape, "straddle");
  state.phase = "FREE";
  applyCoupleInteraction(state, dave, resha, 200001);
  assert.equal(resha.userData.skirtMesh.userData.shape, "standing");
  assert.ok(COUPLE_INTERACTION_CONFIG.piggyback.mountArc > 0);
});

test("every interaction ends with a minimum separation and keeps carrier heading", () => {
  for (const action of ["hold", "hug", "kissCheek", "kissForehead", "slowDance", "happyDance", "piggyback"]) {
    const { dave, resha } = createPair();
    const state = createCoupleInteraction(action, dave, resha);
    state.phase = "ACTIVE";
    state.startedAt = 250000;
    applyCoupleInteraction(state, dave, resha, 250000);
    const targets = createEndingTargets(state, dave, resha);
    const separation = Math.hypot(
      targets.endTo.follower.x - targets.endTo.leader.x,
      targets.endTo.follower.z - targets.endTo.leader.z,
    );
    assert.ok(separation >= COUPLE_INTERACTION_CONFIG.releaseDistance - 0.001);
    if (action === "piggyback") {
      assert.equal(targets.endTo.follower.yaw, targets.endTo.leader.yaw);
    }
    state.phase = "ENDING";
    state.phaseStartedAt = 250000;
    state.endFrom = targets.endFrom;
    state.endTo = targets.endTo;
    applyCoupleInteraction(
      state,
      dave,
      resha,
      250000 + COUPLE_INTERACTION_CONFIG.endingSeconds * 1000,
    );
    assert.ok(Math.hypot(resha.position.x - dave.position.x, resha.position.z - dave.position.z) >= 0.899);
    assert.ok(Math.abs(dave.position.x - targets.endTo.leader.x) < 0.001);
    assert.ok(Math.abs(resha.position.x - targets.endTo.follower.x) < 0.001);
  }
});

test("alignment and release phases use the configured smooth transition curve", () => {
  const alignStart = 10000;
  const interaction = { phase: "ALIGNING", phaseStartedAt: alignStart };
  assert.equal(interactionWeight(interaction, alignStart), 0);
  assert.equal(interactionWeight(
    interaction,
    alignStart + COUPLE_INTERACTION_CONFIG.alignSeconds * 500,
  ), 0.5);
  assert.equal(interactionWeight(
    interaction,
    alignStart + COUPLE_INTERACTION_CONFIG.alignSeconds * 1000,
  ), 1);

  interaction.phase = "ENDING";
  interaction.phaseStartedAt = alignStart;
  assert.equal(interactionWeight(
    interaction,
    alignStart + COUPLE_INTERACTION_CONFIG.endingSeconds * 500,
  ), 0.5);
  assert.equal(interactionWeight(
    interaction,
    alignStart + COUPLE_INTERACTION_CONFIG.endingSeconds * 1000,
  ), 0);
});

test("requests enforce range, availability, Dave-only piggyback, and timestamp arbitration", () => {
  assert.equal(shouldAllowPiggyback("daveRey"), true);
  assert.equal(shouldAllowPiggyback("resha"), false);
  assert.equal(canRequestCoupleAction("piggyback", "resha", 1, "FREE", "FREE"), "Only Dave Rey can carry Resha");
  assert.equal(canRequestCoupleAction("hug", "daveRey", 2.1, "FREE", "FREE"), "Move closer");
  assert.equal(canRequestCoupleAction("hug", "daveRey", 1, "ACTIVE", "FREE"), "Partner is busy");
  const first = { requestedAt: 10, leaderId: "a" };
  const second = { requestedAt: 11, leaderId: "b" };
  assert.equal(chooseSimultaneousRequest(first, second), first);
  assert.equal(chooseSimultaneousRequest(
    { requestedAt: 10, leaderId: "b" },
    { requestedAt: 10, leaderId: "a" },
  ).leaderId, "a");
});

test("kiss CCD transforms stay finite from either real character scale", () => {
  for (const action of ["kissCheek", "kissForehead"]) {
    for (const reshaKisses of [false, true]) {
      const { dave, resha } = createPair();
      const kisser = reshaKisses ? resha : dave;
      const receiver = reshaKisses ? dave : resha;
      const state = createCoupleInteraction(action, kisser, receiver);
      state.phase = "ACTIVE";
      state.startedAt = 300000;

      const result = applyCoupleInteraction(state, kisser, receiver, 300000);
      const head = kisser.userData.interactionRig.head;
      const lips = kisser.userData.interactionRig.points.lips.getWorldPosition(new THREE.Vector3());

      assert.ok(Number.isFinite(head.rotation.x));
      assert.ok(Number.isFinite(lips.x) && Number.isFinite(lips.y) && Number.isFinite(lips.z));
      assert.ok(result.kissGap > 0.015 && result.kissGap < 0.07, `${action}, Resha kisser: ${reshaKisses}`);
      assertHairAttached(resha, action, result.weight);
    }
  }
});

test("ten piggyback cycles restore the standing skirt, every rig transform, and root height", () => {
  const { dave, resha } = createPair();
  const skirt = resha.userData.skirtMesh;
  const standingPositions = skirt.geometry.attributes.position.array.slice();
  const eyes = resha.userData.interactionRig.eyes.map((eye) => eye.scale.clone());
  const restTransforms = [dave, resha].map((character) => character.userData.interactionRig.rest
    .map(({ object, position, quaternion, scale }) => ({
      object,
      position: position.toArray(),
      quaternion: quaternion.toArray(),
      scale: scale.toArray(),
    })));
  let now = 400000;

  for (let cycle = 0; cycle < 10; cycle += 1) {
    const state = createCoupleInteraction("piggyback", dave, resha);
    state.phase = "ACTIVE";
    state.startedAt = now;
    applyCoupleInteraction(state, dave, resha, now);
    const ending = createEndingTargets(state, dave, resha);
    state.phase = "ENDING";
    state.phaseStartedAt = now;
    state.endFrom = ending.endFrom;
    state.endTo = ending.endTo;
    applyCoupleInteraction(state, dave, resha, now + COUPLE_INTERACTION_CONFIG.endingSeconds * 1000);
    state.phase = "FREE";
    applyCoupleInteraction(state, dave, resha, now + COUPLE_INTERACTION_CONFIG.endingSeconds * 1000 + 1);
    assert.ok(Math.hypot(
      resha.position.x - ending.endTo.follower.x,
      resha.position.z - ending.endTo.follower.z,
    ) < 0.001);
    now += 1000;

    assert.equal(skirt.userData.shape, "standing");
    assert.deepEqual(skirt.geometry.attributes.position.array, standingPositions);
    assert.deepEqual(resha.userData.interactionRig.eyes.map((eye) => eye.scale), eyes);
    assert.equal(dave.position.y, ending.endTo.leader.y);
    assert.equal(resha.position.y, ending.endTo.follower.y);
    assert.equal(dave.rotation.x, 0);
    assert.equal(dave.rotation.z, 0);
    assert.equal(resha.rotation.x, 0);
    assert.equal(resha.rotation.z, 0);
    for (const [index, character] of [dave, resha].entries()) {
      const actual = character.userData.interactionRig.rest.map(({ object }) => ({
        object,
        position: object.position.toArray(),
        quaternion: object.quaternion.toArray(),
        scale: object.scale.toArray(),
      }));
      assert.deepEqual(actual, restTransforms[index]);
    }
  }
});

test("cancelling a piggyback mid-mount restores the standing pose and both root heights", () => {
  const { dave, resha } = createPair();
  dave.position.y = 0.15;
  resha.position.y = 0.05;
  const state = createCoupleInteraction("piggyback", dave, resha);
  state.phase = "ACTIVE";
  state.startedAt = 500000;
  applyCoupleInteraction(state, dave, resha, 500000);
  assert.equal(resha.userData.skirtMesh.userData.shape, "straddle");

  state.phase = "FREE";
  applyCoupleInteraction(state, dave, resha, 500001);

  assert.equal(resha.userData.skirtMesh.userData.shape, "standing");
  assert.equal(dave.position.y, state.fromLeader.y);
  assert.equal(resha.position.y, state.fromFollower.y);
  assert.equal(dave.rotation.x, 0);
  assert.equal(dave.rotation.z, 0);
  assert.equal(resha.rotation.x, 0);
  assert.equal(resha.rotation.z, 0);
  for (const character of [dave, resha]) {
    for (const { object, position, quaternion, scale } of character.userData.interactionRig.rest) {
      assert.deepEqual(object.position.toArray(), position.toArray());
      assert.deepEqual(object.quaternion.toArray(), quaternion.toArray());
      assert.deepEqual(object.scale.toArray(), scale.toArray());
    }
  }
});

test("restoring an already-standing skirt does not rewrite its vertices", () => {
  const resha = createCharacter("resha");
  const skirt = resha.userData.skirtMesh;
  const version = skirt.geometry.attributes.position.version;
  restoreSkirtShape(resha);
  assert.equal(skirt.geometry.attributes.position.version, version);
});
