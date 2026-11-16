import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createCharacter } from "./characters.js";
import {
  CHARACTER_PREVIEW_GAP,
  computeCharacterPreviewCameraShift,
  computeCharacterPreviewDistance,
  computeCharacterPreviewZone,
} from "./character-preview-layout.js";

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

const portraitSizes = [
  [360, 640], [360, 800], [375, 667], [390, 844], [412, 915], [430, 932],
];
const viewports = [
  ...portraitSizes,
  ...portraitSizes.map(([width, height]) => [height, width]),
];

test("preview zones stay clear of the character card and safe screen edges", () => {
  for (const [width, height] of viewports) {
    const portrait = height > width;
    const cardRect = portrait
      ? { left: 16, right: width - 16, top: height * 0.55, bottom: height - 16 }
      : { left: 24, right: 24 + Math.min(420, width * 0.45 - 48), top: 24, bottom: height - 24 };
    const zone = computeCharacterPreviewZone({
      width,
      height,
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      cardRect,
    });

    assert.equal(zone.orientation, portrait ? "portrait" : "landscape");
    assert.equal(zone.valid, true);
    assert.ok(zone.left >= CHARACTER_PREVIEW_GAP);
    assert.ok(zone.top >= CHARACTER_PREVIEW_GAP);
    assert.ok(zone.right <= width - CHARACTER_PREVIEW_GAP);
    assert.ok(zone.bottom <= height - CHARACTER_PREVIEW_GAP);
    if (portrait) assert.ok(zone.bottom + CHARACTER_PREVIEW_GAP <= cardRect.top);
    else assert.ok(zone.left >= cardRect.right + CHARACTER_PREVIEW_GAP);
  }
});

test("camera shift projects the preview center into the center of its free zone", () => {
  for (const [width, height] of viewports) {
    const portrait = height > width;
    const cardRect = portrait
      ? { left: 16, right: width - 16, top: height * 0.55, bottom: height - 16 }
      : { left: 24, right: 24 + Math.min(420, width * 0.45 - 48), top: 24, bottom: height - 24 };
    const zone = computeCharacterPreviewZone({ width, height, cardRect });
    const distance = computeCharacterPreviewDistance({
      zone,
      width,
      height,
      horizontalRadius: 1.15,
      verticalRadius: 1,
      fov: 42,
    });
    const shift = computeCharacterPreviewCameraShift({
      centerX: zone.centerX,
      centerY: zone.centerY,
      width,
      height,
      distance,
      fov: 42,
    });
    const tanHalfFov = Math.tan(42 * Math.PI / 360);
    const projectedX = width * (1 + shift.horizontal / (distance * tanHalfFov * (width / height))) / 2;
    const projectedY = height * (1 - shift.vertical / (distance * tanHalfFov)) / 2;

    assert.ok(Math.abs(projectedX - zone.centerX) <= 0.01);
    assert.ok(Math.abs(projectedY - zone.centerY) <= 0.01);
  }
});

test("both real character models and the preview platform fit the portrait and landscape zones", () => {
  for (const [width, height] of viewports) {
    const portrait = height > width;
    const cardWidth = Math.min(420, Math.max(180, width * 0.45 - 48));
    const cardRect = portrait
      ? { left: 16, right: width - 16, top: height - 12 - height * 0.45, bottom: height - 12 }
      : { left: 24, right: 24 + cardWidth, top: 24, bottom: height - 24 };
    const zone = computeCharacterPreviewZone({ width, height, cardRect });
    const scene = new THREE.Scene();
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.15, 0.12, 48),
      new THREE.MeshBasicMaterial(),
    );
    platform.position.y = -0.06;
    scene.add(platform);

    for (const kind of ["daveRey", "resha"]) {
      const character = createCharacter(kind);
      scene.add(character);
      character.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(character).expandByObject(platform);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      let horizontalRadius = 1.15;
      character.traverse((object) => {
        if (!object.isMesh || !object.geometry) return;
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        const meshBox = object.geometry.boundingBox;
        const point = new THREE.Vector3();
        for (let corner = 0; corner < 8; corner += 1) {
          point.set(
            corner & 1 ? meshBox.max.x : meshBox.min.x,
            corner & 2 ? meshBox.max.y : meshBox.min.y,
            corner & 4 ? meshBox.max.z : meshBox.min.z,
          ).applyMatrix4(object.matrixWorld);
          horizontalRadius = Math.max(horizontalRadius, Math.hypot(point.x, point.z));
        }
      });
      const fov = 42;
      const distance = computeCharacterPreviewDistance({
        zone,
        width,
        height,
        horizontalRadius,
        verticalRadius: size.y / 2,
        fov,
      });
      let bias = { x: 0, y: 0 };
      const frameCamera = () => {
        const origin = center.clone().add(new THREE.Vector3(0, distance * 0.12, distance));
        const forward = center.clone().sub(origin).normalize();
        const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
        const up = right.clone().cross(forward).normalize();
        const shift = computeCharacterPreviewCameraShift({
          centerX: zone.centerX - bias.x,
          centerY: zone.centerY - bias.y,
          width,
          height,
          distance,
          fov,
        });
        const target = center.clone()
          .addScaledVector(right, -shift.horizontal)
          .addScaledVector(up, -shift.vertical);
        const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 90);
        camera.position.copy(target).addScaledVector(forward, -distance);
        camera.lookAt(target);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();
        return camera;
      };
      const measureBounds = (camera) => {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        const point = new THREE.Vector3();
        scene.traverse((object) => {
          const positions = object.geometry?.attributes?.position;
          if (!object.isMesh || !positions) return;
          for (let index = 0; index < positions.count; index += 1) {
            point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld).project(camera);
            const x = (point.x + 1) * width / 2;
            const y = (1 - point.y) * height / 2;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        });
        return { minX, maxX, minY, maxY };
      };
      for (const rotation of [0, 0.6, 1.4]) {
        character.rotation.y = rotation;
        character.updateWorldMatrix(true, true);
        let screenBounds = measureBounds(frameCamera());
        if (rotation === 0) {
          bias = {
            x: (screenBounds.minX + screenBounds.maxX) / 2 - zone.centerX,
            y: (screenBounds.minY + screenBounds.maxY) / 2 - zone.centerY,
          };
          screenBounds = measureBounds(frameCamera());
        }
        const { minX, maxX, minY, maxY } = screenBounds;
        assert.ok(minX >= zone.left - 0.1, `${kind} left bound at ${width}x${height}: ${minX} < ${zone.left}`);
        assert.ok(maxX <= zone.right + 0.1, `${kind} right bound at ${width}x${height}: ${maxX} > ${zone.right}`);
        assert.ok(minY >= zone.top - 0.1, `${kind} top bound at ${width}x${height}: ${minY} < ${zone.top}`);
        assert.ok(maxY <= zone.bottom + 0.1, `${kind} bottom bound at ${width}x${height}: ${maxY} > ${zone.bottom}`);
        assert.ok(
          Math.abs((minX + maxX) / 2 - zone.centerX) <= 8,
          `${kind} horizontal center at ${width}x${height}: ${(minX + maxX) / 2} vs ${zone.centerX}`,
        );
        assert.ok(
          Math.abs((minY + maxY) / 2 - zone.centerY) <= 8,
          `${kind} vertical center at ${width}x${height}: ${(minY + maxY) / 2} vs ${zone.centerY}`,
        );
      }
      scene.remove(character);
    }
    scene.remove(platform);
  }
});
