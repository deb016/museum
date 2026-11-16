import * as THREE from "three";

export function getSeatHeight(seat, fallback = 0) {
  if (!seat) return fallback;
  const floorY = seat.floorY ?? 0;
  const topY = seat.surface?.topY ?? seat.position?.[1] ?? floorY + fallback;
  return Math.max(0, topY - floorY);
}

export function getSeatedShinLength(seatHeight, characterScale, footBottomOffset) {
  if (!(seatHeight > 0) || !(characterScale > 0) || !(footBottomOffset >= 0)) {
    throw new RangeError("Seat height, character scale, and foot offset must be valid positive measurements.");
  }
  return Math.max(0, seatHeight / characterScale - footBottomOffset);
}

function getBackrestHairTarget(seat, characterScale, config, baseZ) {
  const floorY = seat?.floorY ?? 0;
  const slot = seat?.position ?? [0, floorY + config.seatHeight, 0];
  const forward = seat?.forward ?? [0, 0, 1];
  const yaw = Math.atan2(forward[0], forward[2]);
  const backrest = seat?.backrest;
  let centerX;
  let centerZ;
  let thickness;
  if (backrest?.position) {
    const dx = backrest.position[0] - slot[0];
    const dz = backrest.position[2] - slot[2];
    centerX = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
    centerZ = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
    thickness = backrest.thickness;
  } else {
    centerX = 0;
    centerZ = -config.bodyHalfDepth - config.backrestGap - config.backrestThickness / 2;
    thickness = config.backrestThickness;
  }
  const frontFaceZ = (centerZ + (thickness ?? 0) / 2) / characterScale;
  const shellRearExtent = 0.05 + 0.15;
  return frontFaceZ + config.resha.hairBackClearance / characterScale + shellRearExtent;
}

export function applySeatedPose(character, blend, seatHeight, characterScale, config, seat = null) {
  const rig = character.userData.seatRig;
  if (!rig) throw new TypeError("Character is missing its sitting rig.");
  if (!(characterScale > 0)) throw new RangeError("Character scale must be positive.");
  const amount = THREE.MathUtils.clamp(blend, 0, 1);
  const measuredSeatHeight = getSeatHeight(seat, seatHeight);
  const resha = character.userData.kind === "resha" ? config.resha : null;
  const pelvisOffsetWorld = resha?.pelvisSeatOffset ?? 0;
  const seatedHipY = (measuredSeatHeight + pelvisOffsetWorld) / characterScale;
  const sitDY = seatedHipY - rig.baseHipsY;

  // The game moves the root to the seat slot; this is the reference SIT_DY applied at the hip pivot.
  // The entire rig and skirt share the same eased blend over the configured 0.6s.
  rig.hips.position.y = rig.baseHipsY + sitDY * amount;
  rig.spine.rotation.x = THREE.MathUtils.lerp(
    rig.baseSpineRotationX,
    resha?.spineBackLean ?? config.spineBackLean,
    amount,
  );
  rig.spine.position.z = rig.baseSpinePositionZ +
    ((resha?.spineBackrestGap ?? 0) / characterScale) * amount;
  rig.neck.rotation.x = THREE.MathUtils.lerp(
    rig.baseNeckRotationX,
    resha?.neckCounterLean ?? -config.spineBackLean,
    amount,
  );

  for (const arm of rig.arms) {
    arm.shoulder.position.y = arm.baseY + sitDY * amount -
      (resha?.armShoulderDrop ?? 0) * amount;
    arm.shoulder.position.z = arm.baseZ +
      ((resha?.spineBackrestGap ?? 0) / characterScale) * amount;
    arm.shoulder.rotation.x = THREE.MathUtils.lerp(
      arm.baseShoulderRotationX,
      resha ? -0.2 : config.armShoulderBend,
      amount,
    );
    arm.shoulder.rotation.z = THREE.MathUtils.lerp(
      arm.baseShoulderRotationZ,
      resha ? arm.side * (0.06 - 0.03 * amount) : 0,
      amount,
    );
    const elbowBend = resha
      ? -0.7
      : character.userData.kind === "resha"
        ? config.reshaElbowBend
        : config.daveElbowBend;
    arm.elbow.rotation.x = THREE.MathUtils.lerp(arm.baseElbowRotationX, elbowBend, amount);
    arm.elbow.rotation.z = THREE.MathUtils.lerp(arm.baseElbowRotationZ, 0, amount);
  }

  for (const leg of rig.legs) {
    const shinLength = getSeatedShinLength(
      measuredSeatHeight + pelvisOffsetWorld,
      characterScale,
      leg.footBottomOffset,
    );
    leg.hip.position.y = THREE.MathUtils.lerp(leg.baseHipY, seatedHipY, amount);
    leg.hip.position.z = (leg.baseHipZ ?? 0) +
      ((resha?.thighForwardOffset ?? 0) / characterScale) * amount;
    leg.hip.rotation.x = THREE.MathUtils.lerp(
      leg.baseHipRotationX,
      resha?.thighForwardAngle ?? config.legForwardAngle,
      amount,
    );
    leg.hip.rotation.y = THREE.MathUtils.lerp(
      leg.baseHipRotationY ?? 0,
      resha ? (leg.side ?? Math.sign(leg.hip.position.x)) * 0.07 : leg.baseHipRotationY ?? 0,
      amount,
    );
    leg.knee.position.y = THREE.MathUtils.lerp(leg.baseKneeY, -leg.thighLength, amount);
    leg.knee.rotation.x = THREE.MathUtils.lerp(
      leg.baseKneeRotationX,
      resha?.kneeBendAngle ?? config.kneeBendAngle,
      amount,
    );
    leg.thigh.position.y = THREE.MathUtils.lerp(leg.baseThighY, -leg.thighLength / 2, amount);
    leg.lowerLeg.position.y = THREE.MathUtils.lerp(leg.baseLowerLegY, -shinLength / 2, amount);
    leg.lowerLeg.scale.y = THREE.MathUtils.lerp(1, shinLength / leg.shinLength, amount);
    leg.ankle.position.y = THREE.MathUtils.lerp(leg.baseAnkleY, -shinLength, amount);
    leg.ankle.rotation.x = THREE.MathUtils.lerp(leg.baseAnkleRotationX, 0, amount);
    leg.foot.position.z = (leg.baseFootZ ?? 0) +
      ((resha?.shoeForwardOffset ?? 0) / characterScale) * amount;
  }

  if (rig.seatedSkirt) {
    rig.seatedSkirt.userData.setBlend(amount, seat, measuredSeatHeight);
  }

  if (resha && rig.hairPivot && rig.baseHairPosition) {
    const targetZ = getBackrestHairTarget(seat, characterScale, config, rig.baseHairPosition.z);
    rig.hairPivot.position.x = rig.baseHairPosition.x;
    rig.hairPivot.position.y = rig.baseHairPosition.y;
    rig.hairPivot.position.z = THREE.MathUtils.lerp(rig.baseHairPosition.z, targetZ, amount);
  }
}
