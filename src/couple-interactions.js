import * as THREE from "three";
import { resetCharacterPose } from "./characters.js";
import { CHARACTER_HEIGHTS, COUPLE_INTERACTION_CONFIG } from "./config.js";

export const COUPLE_ACTIONS = Object.freeze([
  "hold",
  "hug",
  "kissCheek",
  "kissForehead",
  "piggyback",
  "slowDance",
  "happyDance",
]);

export const COUPLE_PHASES = Object.freeze([
  "FREE",
  "REQUESTING",
  "WAITING",
  "ALIGNING",
  "ACTIVE",
  "ENDING",
]);

const DOWN = new THREE.Vector3(0, -1, 0);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (value, curve = "smoothstep") => {
  const t = clamp(value, 0, 1);
  if (curve === "smoothstep") return t * t * (3 - 2 * t);
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
};

function rotateOffset(yaw, x, z) {
  return [
    x * Math.cos(yaw) + z * Math.sin(yaw),
    -x * Math.sin(yaw) + z * Math.cos(yaw),
  ];
}

function angleDifference(from, to) {
  let difference = to - from;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

function transformOf(character) {
  return {
    x: character.position.x,
    y: character.position.y,
    z: character.position.z,
    yaw: character.rotation.y,
  };
}

function mixTransform(from, to, amount) {
  return {
    x: lerp(from.x, to.x, amount),
    y: lerp(from.y, to.y, amount),
    z: lerp(from.z, to.z, amount),
    yaw: from.yaw + angleDifference(from.yaw, to.yaw) * amount,
  };
}

function faceTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function pairTargets(action, center, heading, config, now, startAt) {
  const elapsed = Math.max(0, (now - startAt) / 1000);
  const targets = {};
  if (action === "hold") {
    const side = config.hold.gap / 2;
    const leaderOffset = rotateOffset(heading, side, 0);
    const followerOffset = rotateOffset(heading, -side, 0);
    targets.leader = { x: center.x + leaderOffset[0], y: center.y, z: center.z + leaderOffset[1], yaw: heading };
    targets.follower = { x: center.x + followerOffset[0], y: center.y, z: center.z + followerOffset[1], yaw: heading };
  } else if (action === "kissCheek" || action === "kissForehead") {
    const followerOffset = rotateOffset(heading, 0, config.kiss.distance);
    targets.follower = { x: center.x, y: center.y, z: center.z, yaw: heading };
    targets.leader = {
      x: center.x + followerOffset[0],
      y: center.y,
      z: center.z + followerOffset[1],
      yaw: heading + Math.PI,
    };
  } else if (action === "piggyback") {
    targets.leader = { x: center.x, y: center.y, z: center.z, yaw: heading };
  } else {
    const dance = action === "slowDance" ? config.slowDance : config.happyDance;
    let activeHeading = heading;
    if (action === "slowDance") {
      activeHeading += elapsed * (Math.PI / 2) / dance.periodSeconds;
    } else {
      activeHeading += ((elapsed % dance.periodSeconds) / dance.periodSeconds) * Math.PI * 2;
    }
    const distance = action === "slowDance" ? dance.distance : dance.distance;
    const offset = rotateOffset(activeHeading, 0, distance / 2);
    const sway = action === "slowDance"
      ? Math.sin((elapsed * dance.swayFrequency * Math.PI * 2) / dance.periodSeconds) * dance.swayAmplitude
      : Math.sin((elapsed * Math.PI * 2) / dance.periodSeconds) * dance.swayAmplitude;
    const swayOffset = rotateOffset(activeHeading, sway, 0);
    targets.leader = {
      x: center.x - offset[0] + swayOffset[0],
      y: center.y,
      z: center.z - offset[1] + swayOffset[1],
      yaw: activeHeading,
    };
    targets.follower = {
      x: center.x + offset[0] - swayOffset[0],
      y: center.y,
      z: center.z + offset[1] - swayOffset[1],
      yaw: activeHeading + Math.PI,
    };
  }
  if (action === "hug") {
    const half = config.hug.distance / 2;
    const offset = rotateOffset(heading, 0, half);
    targets.leader = { x: center.x - offset[0], y: center.y, z: center.z - offset[1], yaw: heading };
    targets.follower = { x: center.x + offset[0], y: center.y, z: center.z + offset[1], yaw: heading + Math.PI };
  }
  return targets;
}

export function createCoupleInteraction(action, leader, follower, config = COUPLE_INTERACTION_CONFIG) {
  if (!COUPLE_ACTIONS.includes(action)) throw new TypeError(`Unsupported couple interaction: ${action}`);
  const fromLeader = transformOf(leader);
  const fromFollower = transformOf(follower);
  let center;
  let heading;
  if (action === "hold") {
    center = { x: (fromLeader.x + fromFollower.x) / 2, y: fromLeader.y, z: (fromLeader.z + fromFollower.z) / 2 };
    heading = fromLeader.yaw;
  } else if (action === "piggyback") {
    center = { x: fromLeader.x, y: fromLeader.y, z: fromLeader.z };
    heading = faceTo(fromLeader, fromFollower) + Math.PI;
  } else if (action === "kissCheek" || action === "kissForehead") {
    center = { x: fromFollower.x, y: fromFollower.y, z: fromFollower.z };
    heading = faceTo(fromFollower, fromLeader);
  } else {
    center = { x: (fromLeader.x + fromFollower.x) / 2, y: fromLeader.y, z: (fromLeader.z + fromFollower.z) / 2 };
    heading = faceTo(fromLeader, fromFollower);
  }
  const interaction = {
    action,
    phase: "ALIGNING",
    phaseStartedAt: Date.now(),
    startedAt: Date.now(),
    center,
    heading,
    fromLeader,
    fromFollower,
    toLeader: null,
    toFollower: null,
    endFrom: null,
    endTo: null,
    leaderId: "",
    followerId: "",
    holdMode: false,
    requestId: "",
    poseErrors: {},
  };
  const targets = pairTargets(action, center, heading, config, interaction.startedAt, interaction.startedAt);
  interaction.toLeader = targets.leader ?? fromLeader;
  interaction.toFollower = targets.follower ?? fromFollower;
  if (action === "piggyback") {
    interaction.toLeader.yaw = heading;
    interaction.toFollower = fromFollower;
  }
  return interaction;
}

export function interactionWeight(interaction, now, config = COUPLE_INTERACTION_CONFIG) {
  if (!interaction || interaction.phase === "FREE" || interaction.phase === "REQUESTING" || interaction.phase === "WAITING") return 0;
  if (interaction.phase === "ACTIVE") return 1;
  const duration = interaction.phase === "ALIGNING" ? config.alignSeconds : config.endingSeconds;
  const elapsed = Math.max(0, (now - interaction.phaseStartedAt) / 1000);
  const amount = ease(elapsed / duration, config.transitionCurve);
  return interaction.phase === "ENDING" ? 1 - amount : amount;
}

function worldPoint(point) {
  point.updateWorldMatrix(true, false);
  return point.getWorldPosition(new THREE.Vector3());
}

function setTransform(character, pose) {
  character.position.set(pose.x, pose.y, pose.z);
  character.rotation.x = 0;
  character.rotation.y = pose.yaw;
  character.rotation.z = 0;
}

function orientArm(arm, worldDirection, origin, distance, pole) {
  const shoulderParent = arm.shoulder.parent;
  shoulderParent.updateWorldMatrix(true, false);
  const parentQuaternion = shoulderParent.getWorldQuaternion(new THREE.Quaternion());
  const localDirection = worldDirection.clone().applyQuaternion(parentQuaternion.clone().invert()).normalize();
  arm.shoulder.quaternion.setFromUnitVectors(DOWN, localDirection);
  arm.shoulder.updateWorldMatrix(true, false);
  const elbowParentQuaternion = arm.elbow.parent.getWorldQuaternion(new THREE.Quaternion());
  const lowerDirection = distance.clone().sub(origin).applyQuaternion(elbowParentQuaternion.clone().invert()).normalize();
  arm.elbow.quaternion.setFromUnitVectors(DOWN, lowerDirection);
  arm.elbow.updateWorldMatrix(true, true);
  if (arm.forearm) arm.forearm.updateWorldMatrix(true, true);
  void pole;
}

export function solveTwoBoneIK(character, arm, target, weight = 1) {
  if (weight <= 0) return Infinity;
  character.updateWorldMatrix(true, true);
  const shoulder = worldPoint(arm.shoulder);
  const endpoint = target.clone().sub(shoulder);
  const rawDistance = endpoint.length();
  const maximum = arm.upperLength + arm.lowerLength - COUPLE_INTERACTION_CONFIG.ikReachEpsilon;
  const minimum = Math.abs(arm.upperLength - arm.lowerLength) + COUPLE_INTERACTION_CONFIG.ikReachEpsilon;
  const distance = clamp(rawDistance, minimum, maximum);
  const direction = endpoint.normalize();
  const pole = shoulder.clone().sub(character.position);
  pole.y = -COUPLE_INTERACTION_CONFIG.ikPoleDrop;
  pole.addScaledVector(direction, -pole.dot(direction));
  if (pole.lengthSq() < 1e-8) pole.set(arm.side, -COUPLE_INTERACTION_CONFIG.ikPoleDrop, 0);
  pole.normalize();
  const along = (arm.upperLength ** 2 - arm.lowerLength ** 2 + distance ** 2) / (2 * distance);
  const bend = Math.sqrt(Math.max(arm.upperLength ** 2 - along ** 2, 0));
  const elbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(pole, bend);
  const hand = shoulder.clone().addScaledVector(direction, distance);
  const shoulderDirection = elbow.clone().sub(shoulder);
  const currentShoulder = arm.shoulder.quaternion.clone();
  const currentElbow = arm.elbow.quaternion.clone();
  orientArm(arm, shoulderDirection, elbow, hand, pole);
  const reachableTarget = shoulder.clone().addScaledVector(direction, distance);
  for (let iteration = 0; iteration < COUPLE_INTERACTION_CONFIG.ikIterations; iteration += 1) {
    for (const joint of [arm.elbow, arm.shoulder]) {
      character.updateWorldMatrix(true, true);
      const jointPosition = worldPoint(joint);
      const handPosition = worldPoint(arm.hand);
      const currentDirection = handPosition.sub(jointPosition);
      const targetDirection = reachableTarget.clone().sub(jointPosition);
      if (currentDirection.lengthSq() < 1e-8 || targetDirection.lengthSq() < 1e-8) continue;
      const worldDelta = new THREE.Quaternion().setFromUnitVectors(
        currentDirection.normalize(),
        targetDirection.normalize(),
      );
      const parentQuaternion = joint.parent.getWorldQuaternion(new THREE.Quaternion());
      const localDelta = parentQuaternion.clone().invert()
        .multiply(worldDelta)
        .multiply(parentQuaternion);
      joint.quaternion.premultiply(localDelta);
    }
  }
  arm.shoulder.quaternion.slerp(currentShoulder, 1 - weight);
  arm.elbow.quaternion.slerp(currentElbow, 1 - weight);
  character.updateWorldMatrix(true, true);
  return worldPoint(arm.hand).distanceTo(target);
}

function handTo(character, side, target, weight) {
  const arm = character.userData.interactionRig.arms.find((item) => item.side === side);
  if (!arm) throw new TypeError(`Character ${character.name} is missing the ${side > 0 ? "left" : "right"} arm rig.`);
  return solveTwoBoneIK(character, arm, target, weight);
}

function updatePiggyback(interaction, leader, follower, weight, mount, config) {
  const piggy = config.piggyback;
  const leaderRig = leader.userData.interactionRig;
  const followerRig = follower.userData.interactionRig;
  leaderRig.spine.rotation.x = piggy.lean * mount;
  for (const leg of leaderRig.legs) {
    leg.hip.rotation.x = piggy.carrierHipBend * mount;
    leg.knee.rotation.x = piggy.carrierKneeBend * mount;
  }
  leader.position.y = leader.position.y - Math.sin(Math.PI * mount) * piggy.crouch;
  leader.updateWorldMatrix(true, true);
  const seat = worldPoint(leaderRig.points.seat);
  const spineQuaternion = leaderRig.spine.getWorldQuaternion(new THREE.Quaternion());
  const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), leader.rotation.y);
  const ridingQuaternion = targetQuaternion.slerp(spineQuaternion, mount);
  const hipOffset = followerRig.hips.position.clone().multiplyScalar(follower.scale.x)
    .applyQuaternion(ridingQuaternion);
  const ridingPosition = seat.clone().sub(hipOffset);
  const start = interaction.phase === "ENDING"
    ? interaction.endTo.follower
    : interaction.fromFollower;
  follower.position.set(
    lerp(start.x, ridingPosition.x, mount),
    lerp(start.y, ridingPosition.y, mount) + Math.sin(Math.PI * mount) * piggy.mountArc,
    lerp(start.z, ridingPosition.z, mount),
  );
  follower.quaternion.copy(ridingQuaternion);
  for (const leg of followerRig.legs) {
    leg.hip.rotation.x = piggy.hipBend * mount;
    leg.hip.rotation.y = leg.side * piggy.legSpread * mount;
    leg.knee.rotation.x = piggy.kneeBend * mount;
  }
  if (follower.userData.skirtMesh?.userData.setStraddleBlend) {
    follower.userData.skirtMesh.userData.setStraddleBlend(mount);
  }
  followerRig.head.rotation.z = piggy.riderHeadTilt * mount;
  leader.updateWorldMatrix(true, true);
  follower.updateWorldMatrix(true, true);
  for (const leg of followerRig.legs) {
    const thigh = worldPoint(leg.hip);
    const knee = worldPoint(leg.knee);
    const target = knee.clone().lerp(thigh, piggy.thighGripFraction)
      .add(new THREE.Vector3(0, -piggy.thighGripDrop, 0));
    handTo(leader, leg.side > 0 ? 1 : -1, target, weight);
  }
  const leftChest = worldPoint(leaderRig.points.chestL);
  const rightChest = worldPoint(leaderRig.points.chestR);
  handTo(follower, 1, leftChest, weight);
  handTo(follower, -1, rightChest, weight);
  interaction.poseErrors.seat = worldPoint(followerRig.hips).distanceTo(seat);
}

function solveKissHead(interaction, kisser, receiver, action, weight, config, correctPosition) {
  const kisserRig = kisser.userData.interactionRig;
  const receiverRig = receiver.userData.interactionRig;
  const forehead = action === "kissForehead";
  const kissConfig = config.kiss;
  if (forehead && receiver.userData.kind === "daveRey") {
    receiverRig.spine.rotation.x = kissConfig.receiverBow * weight;
    receiverRig.head.rotation.x = kissConfig.receiverHeadBow * weight;
  }
  receiverRig.head.rotation.z = kissConfig.receiverHeadTilt * weight;
  for (const eye of receiverRig.eyes) eye.scale.y = lerp(1, kissConfig.eyeCloseScale, weight);
  if (forehead && kisser.userData.kind === "resha") {
    kisser.position.y += kissConfig.toeRise * CHARACTER_HEIGHTS.resha * weight;
  }
  kisser.updateWorldMatrix(true, true);
  receiver.updateWorldMatrix(true, true);
  const target = worldPoint(forehead ? receiverRig.points.forehead : receiverRig.points.cheekL);
  const jaw = kisserRig.points.lips;
  const joints = [
    {
      joint: kisserRig.head,
      min: kissConfig.headLimitMin,
      max: kissConfig.headLimitMax,
      weight: kissConfig.headWeight,
    },
    {
      joint: kisserRig.spine,
      min: kissConfig.spineLimitMin,
      max: kissConfig.spineLimitMax,
      weight: kissConfig.spineWeight,
    },
  ];
  for (let iteration = 0; iteration < config.ikIterations; iteration += 1) {
    for (const { joint, min, max, weight: jointWeight } of joints) {
      kisser.updateWorldMatrix(true, true);
      const jointPosition = worldPoint(joint);
      const lips = worldPoint(jaw);
      const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(joint.getWorldQuaternion(new THREE.Quaternion())).normalize();
      const towardTarget = target.clone().sub(lips).normalize();
      const goal = target.clone().addScaledVector(towardTarget, -kissConfig.gap);
      const first = lips.sub(jointPosition);
      const second = goal.sub(jointPosition);
      first.addScaledVector(axis, -first.dot(axis));
      second.addScaledVector(axis, -second.dot(axis));
      if (first.lengthSq() < 1e-8 || second.lengthSq() < 1e-8) continue;
      first.normalize();
      second.normalize();
      const angle = Math.atan2(axis.dot(new THREE.Vector3().crossVectors(first, second)), first.dot(second));
      joint.rotation.x = clamp(joint.rotation.x + angle * jointWeight, min, max);
    }
  }
  kisser.updateWorldMatrix(true, true);
  const lips = worldPoint(jaw);
  const kissDirection = target.clone().sub(lips).normalize();
  const desiredLips = target.clone().addScaledVector(kissDirection, -kissConfig.gap);
  if (correctPosition) {
    const correction = desiredLips.sub(lips);
    const parentQuaternion = kisser.parent?.getWorldQuaternion(new THREE.Quaternion());
    if (parentQuaternion) correction.applyQuaternion(parentQuaternion.invert());
    kisser.position.add(correction);
  }
  kisser.updateWorldMatrix(true, true);
  const gap = worldPoint(jaw).distanceTo(target);
  interaction.poseErrors.kissGap = gap;
  kisserRig.spine.rotation.x *= weight;
  kisserRig.head.rotation.x *= weight;
}

function applyActionPose(interaction, leader, follower, weight, clock, config, mount) {
  const action = interaction.action;
  const leaderRig = leader.userData.interactionRig;
  const followerRig = follower.userData.interactionRig;
  leader.updateWorldMatrix(true, true);
  follower.updateWorldMatrix(true, true);
  if (action === "hold") {
    const meeting = new THREE.Vector3(interaction.center.x, 0, interaction.center.z);
    const leaderShoulder = worldPoint(leaderRig.points.shR);
    const followerShoulder = worldPoint(followerRig.points.shL);
    meeting.y = (leaderShoulder.y + followerShoulder.y) / 2 - config.hold.handDrop;
    const handSwing = rotateOffset(
      leader.rotation.y,
      0,
      Math.sin(clock * config.hold.handSwingFrequency) * config.hold.handSwingAmplitude,
    );
    meeting.x += handSwing[0];
    meeting.z += handSwing[1];
    const leaderError = handTo(leader, -1, meeting, weight);
    const followerError = handTo(follower, 1, meeting, weight);
    interaction.poseErrors.hands = Math.max(leaderError, followerError);
    for (const arm of leaderRig.arms) {
      if (arm.side > 0) {
        arm.shoulder.rotation.x = Math.sin(clock * config.hold.freeArmSwingFrequency) *
          config.hold.freeArmSwing * weight;
      }
    }
    for (const arm of followerRig.arms) {
      if (arm.side < 0) {
        arm.shoulder.rotation.x = -Math.sin(clock * config.hold.freeArmSwingFrequency) *
          config.hold.freeArmSwing * weight;
      }
    }
  } else if (action === "hug") {
    for (const [index, character] of [leader, follower].entries()) {
      const rig = character.userData.interactionRig;
      rig.spine.rotation.x = config.hug.lean * weight;
      rig.head.rotation.z = (index ? -1 : 1) * config.hug.headTilt * weight;
      rig.spine.position.y += Math.sin(clock * config.hug.swayFrequency) *
        config.hug.swayAmplitude * character.scale.y * weight;
    }
    leader.updateWorldMatrix(true, true);
    follower.updateWorldMatrix(true, true);
    const leaderRight = worldPoint(followerRig.points.bkR);
    const leaderLeft = worldPoint(followerRig.points.bkL);
    const followerRight = worldPoint(leaderRig.points.bkR);
    const followerLeft = worldPoint(leaderRig.points.bkL);
    const errors = [
      handTo(leader, -1, leaderRight, weight),
      handTo(leader, 1, leaderLeft, weight),
      handTo(follower, -1, followerRight, weight),
      handTo(follower, 1, followerLeft, weight),
    ];
    interaction.poseErrors.hands = Math.max(...errors);
  } else if (action === "kissCheek" || action === "kissForehead") {
    solveKissHead(interaction, leader, follower, action, weight, config, interaction.phase !== "ENDING");
    leader.updateWorldMatrix(true, true);
    follower.updateWorldMatrix(true, true);
    const leftShoulder = worldPoint(followerRig.points.shL);
    const rightShoulder = worldPoint(followerRig.points.shR);
    const errors = [
      handTo(leader, 1, leftShoulder, config.kiss.shoulderReachWeight * weight),
      handTo(leader, -1, rightShoulder, config.kiss.shoulderReachWeight * weight),
    ];
    interaction.poseErrors.hands = Math.max(...errors);
  } else if (action === "piggyback") {
    updatePiggyback(interaction, leader, follower, weight, mount, config);
  } else if (action === "slowDance") {
    const phase = (clock * Math.PI * 2) / config.slowDance.periodSeconds;
    for (const character of [leader, follower]) {
      const rig = character.userData.interactionRig;
      rig.spine.rotation.x = config.slowDance.lean * weight;
      rig.spine.rotation.z = Math.sin(phase) * config.slowDance.swayRoll * weight;
    }
    leader.updateWorldMatrix(true, true);
    follower.updateWorldMatrix(true, true);
    const handTarget = new THREE.Vector3(
      (leader.position.x + follower.position.x) / 2,
      config.slowDance.handHeight,
      (leader.position.z + follower.position.z) / 2,
    );
    const offset = rotateOffset(leader.rotation.y, config.slowDance.handSide, 0);
    handTarget.x += offset[0];
    handTarget.z += offset[1];
    const errors = [
      handTo(leader, 1, handTarget, weight),
      handTo(follower, -1, handTarget, weight),
      handTo(leader, -1, worldPoint(followerRig.points.waistL), weight),
      handTo(follower, 1, worldPoint(leaderRig.points.shR), weight),
    ];
    interaction.poseErrors.hands = Math.max(...errors);
  } else if (action === "happyDance") {
    const phase = (clock * Math.PI * 2) / config.happyDance.periodSeconds;
    for (const character of [leader, follower]) {
      const rig = character.userData.interactionRig;
      const up = Math.max(0, Math.sin(phase)) * weight;
      for (const arm of rig.arms) {
        arm.shoulder.rotation.z = arm.side * (config.happyDance.armBase + config.happyDance.armRaise * up);
      }
      for (const leg of rig.legs) {
        leg.hip.rotation.x = Math.sin(phase * 2 + (leg.side > 0 ? 0 : Math.PI)) *
          config.happyDance.legBounce * weight;
      }
      character.position.y += Math.abs(Math.sin(phase)) * config.happyDance.bodyBob * character.scale.y * weight;
      rig.spine.rotation.z = Math.sin(phase) * config.happyDance.bodyRoll * weight;
    }
  }
}

export function applyCoupleInteraction(
  interaction,
  leader,
  follower,
  now,
  config = COUPLE_INTERACTION_CONFIG,
  rebuildBasePose = null,
) {
  if (interaction?.phase === "FREE" && interaction.action && interaction.fromLeader && interaction.fromFollower) {
    const release = interaction.endTo ?? {
      leader: interaction.fromLeader,
      follower: interaction.fromFollower,
    };
    setTransform(leader, release.leader);
    setTransform(follower, release.follower);
  }
  if (!interaction || interaction.phase === "FREE" || interaction.phase === "REQUESTING" || interaction.phase === "WAITING") {
    resetCharacterPose(leader);
    resetCharacterPose(follower);
    return { weight: 0, phase: "FREE" };
  }
  const weight = interactionWeight(interaction, now, config);
  resetCharacterPose(leader, { restoreSkirt: false });
  resetCharacterPose(follower, { restoreSkirt: false });
  rebuildBasePose?.(leader);
  rebuildBasePose?.(follower);
  interaction.poseErrors = {};
  let leaderPose;
  let followerPose;
  let mount = 1;
  const elapsed = Math.max(0, (now - interaction.startedAt) / 1000);
  if (interaction.phase === "ALIGNING") {
    const progress = ease(
      (now - interaction.phaseStartedAt) / (config.alignSeconds * 1000),
      config.transitionCurve,
    );
    leaderPose = mixTransform(interaction.fromLeader, interaction.toLeader, progress);
    followerPose = mixTransform(interaction.fromFollower, interaction.toFollower, progress);
    mount = progress;
  } else if (interaction.phase === "ENDING") {
    const progress = ease(
      (now - interaction.phaseStartedAt) / (config.endingSeconds * 1000),
      config.transitionCurve,
    );
    leaderPose = mixTransform(interaction.endFrom.leader, interaction.endTo.leader, progress);
    followerPose = mixTransform(interaction.endFrom.follower, interaction.endTo.follower, progress);
    mount = weight;
  } else {
    const leaderPoseNow = transformOf(leader);
    const targets = pairTargets(
      interaction.action,
      interaction.center,
      interaction.heading,
      config,
      now,
      interaction.startedAt,
    );
    leaderPose = interaction.action === "hold"
      ? leaderPoseNow
      : interaction.action === "piggyback"
        ? { ...leaderPoseNow, y: interaction.center.y }
      : targets.leader;
    followerPose = targets.follower ?? interaction.fromFollower;
    if (interaction.action === "hold") {
      const offset = rotateOffset(leaderPose.yaw, -config.hold.gap, 0);
      followerPose = { x: leaderPose.x + offset[0], y: leaderPose.y, z: leaderPose.z + offset[1], yaw: leaderPose.yaw };
    }
  }
  setTransform(leader, leaderPose);
  if (interaction.action !== "piggyback") setTransform(follower, followerPose);
  const clock = elapsed;
  applyActionPose(interaction, leader, follower, weight, clock, config, mount);
  leader.updateWorldMatrix(true, true);
  follower.updateWorldMatrix(true, true);
  return {
    weight,
    phase: interaction.phase,
    handError: interaction.poseErrors.hands ?? 0,
    kissGap: interaction.poseErrors.kissGap ?? null,
    seatError: interaction.poseErrors.seat ?? null,
  };
}

export function createEndingTargets(interaction, leader, follower, config = COUPLE_INTERACTION_CONFIG) {
  const fromLeader = transformOf(leader);
  const fromFollower = transformOf(follower);
  const dx = fromFollower.x - fromLeader.x;
  const dz = fromFollower.z - fromLeader.z;
  const distance = Math.hypot(dx, dz) || 1;
  const midpoint = {
    x: (fromLeader.x + fromFollower.x) / 2,
    z: (fromLeader.z + fromFollower.z) / 2,
  };
  const half = Math.max(distance, config.releaseDistance) / 2;
  const ux = dx / distance;
  const uz = dz / distance;
  const exitX = config.piggyback.exitOffsetXRatio;
  const exitZ = config.piggyback.exitOffsetZRatio;
  const exitScale = config.releaseDistance / Math.hypot(exitX, exitZ);
  const separation = interaction.action === "piggyback"
    ? rotateOffset(fromLeader.yaw, exitX * exitScale, exitZ * exitScale)
    : null;
  const endTo = interaction.action === "piggyback"
    ? {
      leader: fromLeader,
      follower: {
        x: fromLeader.x + separation[0],
        y: fromLeader.y,
        z: fromLeader.z + separation[1],
        yaw: fromLeader.yaw,
      },
    }
    : {
      leader: { ...fromLeader, x: midpoint.x - ux * half, z: midpoint.z - uz * half },
      follower: { ...fromFollower, x: midpoint.x + ux * half, z: midpoint.z + uz * half },
    };
  return { endFrom: { leader: fromLeader, follower: fromFollower }, endTo };
}

export function chooseSimultaneousRequest(localRequest, remoteRequest) {
  if (!localRequest) return remoteRequest ?? null;
  if (!remoteRequest) return localRequest;
  if (localRequest.requestedAt !== remoteRequest.requestedAt) {
    return localRequest.requestedAt < remoteRequest.requestedAt ? localRequest : remoteRequest;
  }
  return String(localRequest.leaderId).localeCompare(String(remoteRequest.leaderId)) <= 0
    ? localRequest
    : remoteRequest;
}

export function shouldAllowPiggyback(requesterKind) {
  return requesterKind === "daveRey";
}

export function canRequestCoupleAction(action, requesterKind, distance, leaderPhase, partnerPhase, config = COUPLE_INTERACTION_CONFIG) {
  if (!COUPLE_ACTIONS.includes(action)) return "Unavailable";
  if (leaderPhase !== "FREE" || partnerPhase !== "FREE") return "Partner is busy";
  if (action === "piggyback" && !shouldAllowPiggyback(requesterKind)) return "Only Dave Rey can carry Resha";
  if (distance > config.requestDistance) return "Move closer";
  return "";
}
