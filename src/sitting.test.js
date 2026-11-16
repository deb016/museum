import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CHARACTER_HEIGHTS, INTERACTION_CONFIG } from "./config.js";
import { createCharacter } from "./characters.js";
import { applySeatedPose, getSeatHeight, getSeatedShinLength } from "./sitting.js";

function countIntersectingTriangles(groups, box) {
  let count = 0;
  for (const group of groups) {
    group.traverse((object) => {
      if (!object.isMesh) return;
      const positions = object.geometry.attributes.position;
      const indices = object.geometry.index;
      const vertexCount = indices?.count ?? positions.count;
      const getVertex = (index) => {
        const vertex = indices ? indices.getX(index) : index;
        const point = new THREE.Vector3().fromBufferAttribute(positions, vertex);
        const target = object.geometry.morphAttributes.position?.[0];
        const influence = object.morphTargetInfluences?.[0] ?? 0;
        if (target && influence > 0) {
          point.lerp(new THREE.Vector3().fromBufferAttribute(target, vertex), influence);
        }
        return point.applyMatrix4(object.matrixWorld);
      };
      for (let index = 0; index < vertexCount; index += 3) {
        const triangle = new THREE.Triangle(
          getVertex(index),
          getVertex(index + 1),
          getVertex(index + 2),
        );
        if (triangle.intersectsBox(box)) count += 1;
      }
    });
  }
  return count;
}

function createSittingRig(kind, scale, hipY, thighLength, shinLength, footDepth) {
  const character = new THREE.Group();
  character.scale.setScalar(scale);
  character.position.y = 4;
  const hips = new THREE.Group();
  hips.position.y = 1;
  character.add(hips);
  const seat = new THREE.Group();
  hips.add(seat);
  const spine = new THREE.Group();
  hips.add(spine);
  const neck = new THREE.Group();
  spine.add(neck);
  const hairPivot = new THREE.Group();
  neck.add(hairPivot);
  let parent = hips;
  const skirtTiers = [
    { y: 0.21, height: 0.28 },
    { y: -0.224, height: 0.3 },
    { y: -0.24, height: 0.376 },
  ].map(({ y, height }) => {
    const object = new THREE.Group();
    object.position.y = y;
    object.userData.height = height;
    parent.add(object);
    const fabric = new THREE.Group();
    fabric.position.y = -height / 2;
    object.add(fabric);
    object.userData.fabric = fabric;
    parent = object;
    return {
      object,
      basePosition: object.position.clone(),
      baseRotationX: object.rotation.x,
      baseRotationZ: object.rotation.z,
      baseScale: object.scale.clone(),
      height,
      fabric,
      baseFabricScale: fabric.scale.clone(),
    };
  });

  const legHip = new THREE.Group();
  legHip.position.y = hipY;
  character.add(legHip);
  const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, thighLength));
  thigh.position.y = -thighLength / 2;
  legHip.add(thigh);
  const knee = new THREE.Group();
  knee.position.y = -thighLength;
  legHip.add(knee);
  const lowerLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, shinLength));
  lowerLeg.position.y = -shinLength / 2;
  knee.add(lowerLeg);
  const ankle = new THREE.Group();
  ankle.position.y = -shinLength;
  knee.add(ankle);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, footDepth, 0.2));
  foot.position.y = -footDepth / 2;
  foot.geometry.computeBoundingBox();
  ankle.add(foot);

  character.userData = {
    kind,
    seatRig: {
      hips,
      baseHipsY: hips.position.y,
      spine,
      baseSpineRotationX: 0,
      baseSpinePositionZ: 0,
      neck,
      baseNeckRotationX: 0,
      hairPivot,
      baseHairPosition: hairPivot.position.clone(),
      arms: [],
      legs: [{
        hip: legHip,
        knee,
        ankle,
        thigh,
        lowerLeg,
        foot,
        thighLength,
        shinLength,
        footBottomOffset: footDepth,
        baseHipY: hipY,
        baseHipRotationX: 0,
        baseKneeY: -thighLength,
        baseKneeRotationX: 0,
        baseAnkleY: -shinLength,
        baseAnkleRotationX: 0,
        baseThighY: thigh.position.y,
        baseLowerLegY: lowerLeg.position.y,
      }],
      skirtTiers,
    },
    attachPoints: { seat, pelvis: seat },
  };
  return character;
}

for (const model of [
  { kind: "daveRey", scale: 1, hipY: 1, thigh: 0.47, shin: 0.43, foot: 0.08 },
  { kind: "resha", scale: 0.92, hipY: 0.4, thigh: 0.2, shin: 0.2, foot: 0.05 },
]) {
  test(`${model.kind} sits on the seat with vertical shins and grounded soles`, () => {
    const character = createSittingRig(
      model.kind,
      model.scale,
      model.hipY,
      model.thigh,
      model.shin,
      model.foot,
    );
    const seatHeight = INTERACTION_CONFIG.seating.seatHeight;
    applySeatedPose(character, 1, seatHeight, model.scale, INTERACTION_CONFIG.seating);
    character.updateMatrixWorld(true);

    const pelvisOffset = model.kind === "resha"
      ? INTERACTION_CONFIG.seating.resha.pelvisSeatOffset
      : 0;
    const seatPosition = character.userData.attachPoints.pelvis.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(seatPosition.y - (character.position.y + seatHeight + pelvisOffset)) <= 0.01);

    const leg = character.userData.seatRig.legs[0];
    const kneePosition = leg.knee.getWorldPosition(new THREE.Vector3());
    const anklePosition = leg.ankle.getWorldPosition(new THREE.Vector3());
    const shin = anklePosition.sub(kneePosition);
    const shinAngle = Math.acos(Math.min(1, Math.abs(shin.y) / shin.length()));
    assert.ok(shinAngle <= (5 * Math.PI) / 180);

    const sole = leg.foot.localToWorld(
      new THREE.Vector3(0, leg.foot.geometry.boundingBox.min.y, 0),
    );
    assert.ok(Math.abs(sole.y - character.position.y) <= 0.01);
    assert.ok(Math.abs(getSeatedShinLength(
      seatHeight + pelvisOffset,
      model.scale,
      model.foot,
    ) * model.scale + model.foot * model.scale - seatHeight - pelvisOffset) <= 0.001);
  });
}

test("sitting pose rejects invalid model measurements", () => {
  assert.throws(() => getSeatedShinLength(0, 1, 0.1), RangeError);
  assert.throws(() => getSeatedShinLength(0.5, 0, 0.1), RangeError);
});

test("Resha's actual model meets seated pelvis, shin, and sole tolerances", () => {
  const scale = CHARACTER_HEIGHTS.resha;
  const seating = INTERACTION_CONFIG.seating;
  const seatHeight = seating.seatHeight;
  const character = createCharacter("resha");
  applySeatedPose(
    character,
    1,
    seatHeight,
    scale,
    INTERACTION_CONFIG.seating,
  );
  character.updateMatrixWorld(true);

  const pelvis = character.userData.attachPoints.pelvis.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(pelvis.y - (seatHeight + INTERACTION_CONFIG.seating.resha.pelvisSeatOffset)) <= 0.01);
  assert.ok(character.userData.seatRig.spine.rotation.x <= 0);
  assert.ok(character.userData.seatRig.spine.rotation.x >= -(8 * Math.PI) / 180);
  const skirtBounds = new THREE.Box3().setFromObject(character.userData.seatRig.seatedSkirt);

  const headUp = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(character.userData.seatRig.head.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(headUp.angleTo(new THREE.Vector3(0, 1, 0)) <= (1 * Math.PI) / 180);

  for (const leg of Object.values(character.userData.seatRig.legs)) {
    const knee = leg.knee.getWorldPosition(new THREE.Vector3());
    const ankle = leg.ankle.getWorldPosition(new THREE.Vector3());
    const shin = ankle.sub(knee);
    const angle = Math.acos(Math.min(1, Math.abs(shin.y) / shin.length()));
    assert.ok(angle <= (5 * Math.PI) / 180);

    const sole = leg.foot.localToWorld(
      new THREE.Vector3(0, leg.foot.geometry.boundingBox.min.y, 0),
    );
    assert.ok(Math.abs(sole.y) <= 0.01);
    const shoeBounds = new THREE.Box3().setFromObject(leg.foot);
    assert.ok(shoeBounds.max.z >= skirtBounds.max.z + 0.05);
    const seatFrontZ =
      -(
        seating.backrestOffsetZ +
        seating.backrestThickness / 2 +
        seating.bodyHalfDepth +
        seating.backrestGap
      ) + seating.seatDepth / 2;
    assert.ok(shoeBounds.min.z > seatFrontZ);
  }

  const bodice = character.getObjectByName("dressBodice");
  const backrestFront = -(INTERACTION_CONFIG.seating.bodyHalfDepth +
    INTERACTION_CONFIG.seating.backrestGap);
  const bodiceBackZ = Math.min(
    ...Array.from({ length: bodice.geometry.attributes.position.count }, (_, index) =>
      new THREE.Vector3()
        .fromBufferAttribute(bodice.geometry.attributes.position, index)
        .applyMatrix4(bodice.matrixWorld)
        .z),
  );
  assert.ok(bodiceBackZ - backrestFront >= 0.03);
  assert.ok(bodiceBackZ - backrestFront <= 0.08);

  for (const arm of character.userData.seatRig.arms) {
    const wrist = arm.wrist.getWorldPosition(new THREE.Vector3());
    assert.ok(wrist.y >= seatHeight + 0.02);
    assert.ok(wrist.y <= seatHeight + 0.18);
    assert.ok(wrist.z >= 0);
    assert.ok(wrist.z <= 0.3);
    assert.ok(Math.abs(Math.abs(arm.elbow.rotation.x) - 0.7) <= 0.01);
  }

  const { seatedSkirt } = character.userData.seatRig;
  assert.equal(seatedSkirt.visible, true);
  assert.equal(seatedSkirt.userData.sitBlend, 1);
  assert.equal(character.userData.skirtTiers.length, 0);
  assert.equal(bodice.material.color.getHex(), 0xf4efde);
  const head = character.userData.seatRig.head;
  const hair = character.getObjectByName("hair");
  assert.equal(hair.parent, head);
  assert.equal(character.getObjectByName("longHairPivot").parent, hair);
  assert.equal(character.getObjectByName("longHairLength").geometry.parameters.thetaLength, Math.PI * 1.4);
  assert.equal(character.getObjectByName("longHairLength").geometry.parameters.radiusBottom, 0.12);
  assert.notEqual(bodice.material, character.getObjectByName("longHairLength").material);
  hair.traverse((part) => {
    if (!part.isMesh || part.name === "centerPart") return;
    for (const partMaterial of Array.isArray(part.material) ? part.material : [part.material]) {
      assert.equal(partMaterial.side, THREE.DoubleSide);
    }
  });
  assert.equal(character.getObjectByName("hairCrown").parent, hair);
  assert.equal(character.getObjectByName("hairBack").parent, hair);
  assert.equal(character.getObjectByName("faceFrame-1").parent, hair);
  assert.equal(character.getObjectByName("sideSweptHairline1").parent, hair);
  assert.ok(character.getObjectByName("sideSweptHairline1").scale.y < 0.5);
  assert.equal(character.getObjectByName("centerPart").parent, hair);
  assert.equal(
    character.children.some((part) => /bun/i.test(part.name)),
    false,
  );
  assert.equal(seatedSkirt.material.side, THREE.DoubleSide);
  assert.ok(seatedSkirt.material.map?.isDataTexture || seatedSkirt.material.map?.isCanvasTexture);
  const maxZ = (array) => Math.max(...Array.from(
    { length: array.length / 3 },
    (_, index) => array[index * 3 + 2],
  ));
  const maximumSeatedZ = maxZ(seatedSkirt.userData.B) * scale;
  const maximumKneeZ = Math.max(...character.userData.seatRig.legs.map((leg) =>
    leg.knee.getWorldPosition(new THREE.Vector3()).z));
  assert.ok(maximumSeatedZ > maximumKneeZ + 0.02);
  const normalAttribute = seatedSkirt.geometry.attributes.normal;
  for (let row = 0; row <= 36; row += 1) {
    const first = row * 33;
    const last = first + 32;
    assert.ok(Math.abs(normalAttribute.getX(first) - normalAttribute.getX(last)) < 1e-6);
    assert.ok(Math.abs(normalAttribute.getY(first) - normalAttribute.getY(last)) < 1e-6);
    assert.ok(Math.abs(normalAttribute.getZ(first) - normalAttribute.getZ(last)) < 1e-6);
  }
  applySeatedPose(character, 0.5, seatHeight, scale, INTERACTION_CONFIG.seating);
  assert.equal(seatedSkirt.userData.sitBlend, 0.5);
  applySeatedPose(character, 0, seatHeight, scale, INTERACTION_CONFIG.seating);
  assert.equal(seatedSkirt.userData.sitBlend, 0);
});

test("Resha's sit shape and seat clamp follow each seat's top, floor, slot, and facing", () => {
  const seating = INTERACTION_CONFIG.seating;
  const scale = CHARACTER_HEIGHTS.resha;
  const character = createCharacter("resha");
  const seat = {
    id: "rotated-seat",
    floorY: 1.5,
    position: [4, 2.2, -2],
    forward: [1, 0, 0],
    surface: {
      position: [4.1, 2.2, -2],
      topY: 2.2,
      width: 0.62,
      depth: 0.58,
    },
    backrest: {
      position: [3.8, 2.5, -2],
      width: 0.62,
      height: 0.72,
      thickness: 0.16,
    },
  };
  character.position.set(4, seat.floorY, -2);
  character.rotation.y = Math.PI / 2;
  assert.ok(Math.abs(getSeatHeight(seat) - 0.7) < 1e-12);
  applySeatedPose(character, 1, 0.57, scale, seating, seat);
  character.updateMatrixWorld(true);

  const pelvis = character.userData.attachPoints.pelvis.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(pelvis.y - (seat.surface.topY + seating.resha.pelvisSeatOffset)) <= 0.01);
  const skirt = character.userData.seatRig.seatedSkirt;
  const seatedVertices = new THREE.BufferAttribute(skirt.userData.B, 3);
  let minimumHemY = Infinity;
  for (let index = 0; index < seatedVertices.count; index += 1) {
    const vertex = new THREE.Vector3().fromBufferAttribute(seatedVertices, index)
      .applyMatrix4(skirt.matrixWorld);
    minimumHemY = Math.min(minimumHemY, vertex.y);
    const insideSeat =
      Math.abs(vertex.x - seat.surface.position[0]) <= seat.surface.depth / 2 &&
      Math.abs(vertex.z - seat.surface.position[2]) <= seat.surface.width / 2;
    if (insideSeat && vertex.y < seat.surface.topY + seating.resha.seatSurfaceClearance - 0.001) {
      assert.fail("A seated skirt vertex falls below the dynamic seat clamp.");
    }
  }
  assert.ok(Math.abs(minimumHemY - (seat.floorY + seating.resha.hemHeightAboveFloor)) <= 0.01);
  assert.ok(Math.abs(character.userData.seatRig.hairPivot.position.z) > 0);
});

test("Resha's two-shape skirt returns exactly to standing after repeated sit cycles", () => {
  const model = { kind: "resha", scale: 0.92, hipY: 0.4, thigh: 0.2, shin: 0.2, foot: 0.05 };
  const character = createCharacter("resha");
  const rig = character.userData.seatRig;
  const seating = INTERACTION_CONFIG.seating;
  const standing = Array.from(rig.seatedSkirt.geometry.attributes.position.array);
  const seated = Array.from(rig.seatedSkirt.userData.B);
  const baseHairPosition = rig.baseHairPosition.toArray();
  applySeatedPose(character, 1, seating.seatHeight, model.scale, seating);
  assert.equal(rig.seatedSkirt.userData.sitBlend, 1);
  assert.notDeepEqual(seated, standing);
  assert.ok(rig.hairPivot.position.z < rig.baseHairPosition.z);

  for (let cycle = 0; cycle < 10; cycle += 1) {
    applySeatedPose(character, 1, seating.seatHeight, model.scale, seating);
    applySeatedPose(character, 0, seating.seatHeight, model.scale, seating);
    assert.equal(rig.seatedSkirt.userData.sitBlend, 0);
  }
  assert.equal(rig.seatedSkirt.userData.sitBlend, 0);
  assert.deepEqual(Array.from(rig.seatedSkirt.geometry.attributes.position.array), standing);
  assert.deepEqual(rig.hairPivot.position.toArray(), baseHairPosition);
});

test("Resha's seated skirt and back hair clear the bench seat and backrest", () => {
  const seating = INTERACTION_CONFIG.seating;
  const scale = CHARACTER_HEIGHTS.resha;
  const character = createCharacter("resha");
  const slotZ = 0;
  const benchCenterX = seating.slotSpacing / 2;
  const backrestFaceOffsetZ = seating.backrestOffsetZ + seating.backrestThickness / 2;
  const benchCenterZ = -(backrestFaceOffsetZ + seating.bodyHalfDepth + seating.backrestGap);
  const seat = {
    id: "test-bench:seat-1",
    floorY: 0,
    position: [0, seating.seatHeight, slotZ],
    forward: [0, 0, 1],
    surface: {
      position: [benchCenterX, seating.seatHeight, benchCenterZ],
      topY: seating.seatHeight,
      width: seating.seatWidth,
      depth: seating.seatDepth,
    },
    backrest: {
      position: [
        benchCenterX,
        seating.seatHeight + seating.backrestHeight / 2 - seating.backrestOverlap,
        benchCenterZ + seating.backrestOffsetZ,
      ],
      width: seating.seatWidth,
      height: seating.backrestHeight,
      thickness: seating.backrestThickness,
    },
  };
  applySeatedPose(character, 1, seating.seatHeight, scale, seating, seat);
  character.updateMatrixWorld(true);

  const bounds = {
    seat: {
      min: [
        benchCenterX - seating.seatWidth / 2,
        seating.seatHeight - seating.seatThickness,
        benchCenterZ - seating.seatDepth / 2,
      ],
      max: [
        benchCenterX + seating.seatWidth / 2,
        seating.seatHeight,
        benchCenterZ + seating.seatDepth / 2,
      ],
    },
    backrest: {
      min: [
        benchCenterX - seating.seatWidth / 2,
        seating.seatHeight - seating.backrestOverlap,
        benchCenterZ + seating.backrestOffsetZ - seating.backrestThickness / 2,
      ],
      max: [
        benchCenterX + seating.seatWidth / 2,
        seating.seatHeight + seating.backrestHeight - seating.backrestOverlap,
        benchCenterZ + seating.backrestOffsetZ + seating.backrestThickness / 2,
      ],
    },
    benchLegs: [-1, 1].map((side) => {
      const supportX = seating.seatWidth / 2 - seating.seatSupportInset;
      const supportCenterX = benchCenterX + side * supportX;
      return {
        min: [
          supportCenterX - seating.seatSupportWidth / 2,
          0,
          benchCenterZ - seating.seatSupportDepth / 2,
        ],
        max: [
          supportCenterX + seating.seatSupportWidth / 2,
          seating.seatHeight - seating.seatThickness,
          benchCenterZ + seating.seatSupportDepth / 2,
        ],
      };
    }),
  };
  const makeBox = ({ min, max }) => new THREE.Box3(
    new THREE.Vector3(...min),
    new THREE.Vector3(...max),
  );

  const fabricGroups = [character.userData.seatRig.seatedSkirt];
  assert.equal(countIntersectingTriangles(fabricGroups, makeBox(bounds.seat)), 0);
  assert.equal(countIntersectingTriangles(fabricGroups, makeBox(bounds.backrest)), 0);
  for (const legBounds of bounds.benchLegs) {
    assert.equal(countIntersectingTriangles(fabricGroups, makeBox(legBounds)), 0);
  }
  const hem = character.getObjectByName("reshaSkirtTwoShape");
  const hemGeometry = hem.geometry;
  const hemY = Array.from({ length: hem.geometry.attributes.position.count }, (_, index) =>
    new THREE.Vector3()
      .fromBufferAttribute(new THREE.BufferAttribute(hem.userData.B, 3), index)
      .applyMatrix4(hem.matrixWorld)
      .y);
  assert.ok(Math.min(...hemY) >= 0.08);
  assert.ok(Math.min(...hemY) <= 0.12);
  const hemZ = Array.from({ length: hem.geometry.attributes.position.count }, (_, index) =>
    new THREE.Vector3()
      .fromBufferAttribute(new THREE.BufferAttribute(hem.userData.B, 3), index)
      .applyMatrix4(hem.matrixWorld)
      .z);
  const kneeZ = Math.max(...character.userData.seatRig.legs.map((leg) =>
    leg.knee.getWorldPosition(new THREE.Vector3()).z));
  assert.ok(Math.max(...hemZ) > kneeZ + 0.02);
  for (const leg of character.userData.seatRig.legs) {
    const shoeBounds = new THREE.Box3().setFromObject(leg.foot);
    assert.ok(Math.min(...hemY) > shoeBounds.max.y + 0.02);
  }
  assert.equal(
    countIntersectingTriangles(
      [character.userData.seatRig.hairPivot],
      makeBox(bounds.backrest),
    ),
    0,
  );
});

test("Resha's seated skirt clears Dave's legs in the adjacent bench slot", () => {
  const seating = INTERACTION_CONFIG.seating;
  const resha = createCharacter("resha");
  const dave = createSittingRig("daveRey", 1, 1, 0.47, 0.43, 0.08);
  applySeatedPose(resha, 1, seating.seatHeight, CHARACTER_HEIGHTS.resha, seating);
  applySeatedPose(dave, 1, seating.seatHeight, CHARACTER_HEIGHTS.daveRey, seating);
  dave.position.set(seating.slotSpacing / 2 + 0.2, 0, 0);
  resha.updateMatrixWorld(true);
  dave.updateMatrixWorld(true);

  const garment = resha.userData.seatRig.seatedSkirt;
  const daveLegMeshes = dave.userData.seatRig.legs.flatMap((leg) => [
    leg.thigh,
    leg.lowerLeg,
    leg.foot,
  ]);
  for (const legMesh of daveLegMeshes) {
    const bounds = new THREE.Box3().setFromObject(legMesh);
    assert.equal(countIntersectingTriangles([garment], bounds), 0);
  }
});
