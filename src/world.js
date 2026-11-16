import * as THREE from "three";
import { FRAME_STYLES, LIGHTING_CONFIG, MUSEUM_CONFIG, ROOM_THEMES } from "../museum.config.js";
import { APP_CONFIG, INTERACTION_CONFIG, WORLD_CONFIG } from "./config.js";
import { ownsArchwayFrame } from "./archway-ownership.js";
import { computeWalkableGrid } from "./navigation.js";
import { validateAndNudgePlacements } from "./placement.js";

const makeMaterial = (color, roughness = 0.76, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const snapCentimeter = (value) => Math.round(value * 100) / 100;
const MAX_FRAME_TEXTURE_SIZE = 2048;

function prepareFrameTexture(texture) {
  const image = texture.image;
  const imageWidth = image.naturalWidth || image.videoWidth || image.width;
  const imageHeight = image.naturalHeight || image.videoHeight || image.height;
  let displayTexture = texture;
  let downsampled = false;

  if (imageWidth > MAX_FRAME_TEXTURE_SIZE || imageHeight > MAX_FRAME_TEXTURE_SIZE) {
    const scale = MAX_FRAME_TEXTURE_SIZE / Math.max(imageWidth, imageHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(imageWidth * scale));
    canvas.height = Math.max(1, Math.round(imageHeight * scale));
    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      displayTexture = new THREE.CanvasTexture(canvas);
      texture.dispose();
      downsampled = true;
    } else {
      console.warn("Could not create a safe-size museum frame texture; using the original image.");
    }
  }

  displayTexture.colorSpace = THREE.SRGBColorSpace;
  displayTexture.generateMipmaps = true;
  displayTexture.minFilter = THREE.LinearMipmapLinearFilter;
  displayTexture.magFilter = THREE.LinearFilter;
  return { texture: displayTexture, downsampled };
}

function makeHeartShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.38);
  shape.bezierCurveTo(-0.15, -0.2, -0.62, 0.12, -0.62, 0.42);
  shape.bezierCurveTo(-0.62, 0.78, -0.13, 0.88, 0, 0.52);
  shape.bezierCurveTo(0.13, 0.88, 0.62, 0.78, 0.62, 0.42);
  shape.bezierCurveTo(0.62, 0.12, 0.15, -0.2, 0, -0.38);
  return shape;
}

// Soft additive shaft, floor pool, and instanced dust approximate baked sunlight without extra lights.
function addRoomLighting(parent, config, prefix, roomLighting, decorAnimations) {
  const mood = ROOM_THEMES[config.id];
  if (!mood) return;
  const { bounds, floorY, height } = config;
  const centerX = (bounds.xMin + bounds.xMax) / 2;
  const centerZ = (bounds.zMin + bounds.zMax) / 2;
  const group = new THREE.Group();
  group.name = `${prefix}_lighting-effects`;
  const shaft = new THREE.Mesh(
    new THREE.ConeGeometry(Math.min(3.2, (bounds.xMax - bounds.xMin) * 0.22), Math.max(1, height - 1), 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: mood.lightColor,
      transparent: true,
      opacity: 0.035 * mood.lightIntensity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  shaft.name = `${prefix}_light-shaft`;
  shaft.position.set(centerX, floorY + height / 2, centerZ);
  group.add(shaft);

  const floorPool = new THREE.Mesh(
    new THREE.CircleGeometry(Math.min(2.6, (bounds.xMax - bounds.xMin) * 0.2), 24),
    new THREE.MeshBasicMaterial({
      color: mood.lightColor,
      transparent: true,
      opacity: 0.09 * mood.lightIntensity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  floorPool.name = `${prefix}_light-pool`;
  floorPool.rotation.x = -Math.PI / 2;
  floorPool.position.set(centerX, floorY + 0.012, centerZ);
  group.add(floorPool);

  const dustCount = 10;
  const dust = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.018, 4, 3),
    new THREE.MeshBasicMaterial({ color: mood.lightColor, transparent: true, opacity: 0.28 }),
    dustCount,
  );
  dust.name = `${prefix}_light-dust`;
  const matrix = new THREE.Matrix4();
  const dustPositions = [];
  for (let index = 0; index < dustCount; index += 1) {
    const x = centerX + Math.sin(index * 17.3) * Math.min(1.8, (bounds.xMax - bounds.xMin) * 0.14);
    const y = floorY + 0.8 + (index % 5) * (height - 1.6) / 5;
    const z = centerZ + Math.cos(index * 11.7) * Math.min(1.8, (bounds.zMax - bounds.zMin) * 0.14);
    dustPositions.push([x, y, z]);
    matrix.makeTranslation(x, y, z);
    dust.setMatrixAt(index, matrix);
  }
  group.add(dust);
  parent.add(group);
  roomLighting.push({ group, shaft, floorPool, dust, mood, centerX, centerZ, floorY, height });
  decorAnimations.push({ type: "dust", mesh: dust, positions: dustPositions, time: 0 });
}

function colliderRecord(name, type, center, size, extra = {}) {
  return {
    name: name.startsWith("col_") || name.startsWith("trigger_") ? name : `col_${name}`,
    type,
    center: [...center],
    size: size ? [...size] : undefined,
    height: size?.[1] ?? extra.height,
    solid: extra.solid !== false,
    ...extra,
  };
}

function createFloorTexture(surface = "wood") {
  const width = 256;
  const height = 256;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const noise = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const random = (noise - Math.floor(noise)) * 2 - 1;
      let red;
      let green;
      let blue;
      if (surface === "wood") {
        const row = Math.floor(y / 64);
        const staggeredX = (x + (row % 2) * 32) % 128;
        const board = Math.floor(staggeredX / 64);
        const grain = Math.sin((x + row * 17) * 0.21) * 5 + Math.sin((x + row * 9) * 0.055) * 7;
        const seam = y % 64 < 2 || staggeredX % 64 < 2;
        red = 139 + ((row * 13 + board * 7) % 17) + grain - (seam ? 34 : 0);
        green = red - 31;
        blue = red - 58;
      } else if (surface === "marble") {
        const vein = Math.abs(Math.sin(y * 0.055 + Math.sin(x * 0.025) * 2.4 + Math.sin(x * 0.13) * 0.25));
        const shade = 224 + random * 8 - (vein < 0.045 ? 36 : 0);
        red = shade;
        green = shade - 4;
        blue = shade - 12;
      } else if (surface === "carpet") {
        const weave = ((x % 4 === 0) ? 5 : 0) + ((y % 4 === 0) ? 4 : 0);
        red = 135 + random * 9 - weave;
        green = 104 + random * 8 - weave;
        blue = 112 + random * 8 - weave;
      } else if (surface === "grass") {
        const fleck = Math.sin(x * 0.18 + Math.sin(y * 0.08) * 2) * 5 + random * 7;
        red = 129 + fleck;
        green = 157 + fleck;
        blue = 111 + fleck * 0.6;
      } else {
        const seam = x % 64 < 2 || y % 64 < 2;
        const shade = 175 + random * 13 - (seam ? 28 : 0);
        red = shade;
        green = shade - 4;
        blue = shade - 10;
      }
      const index = (y * width + x) * 4;
      data[index] = Math.max(0, Math.min(255, red));
      data[index + 1] = Math.max(0, Math.min(255, green));
      data[index + 2] = Math.max(0, Math.min(255, blue));
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createPictureWashTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const horizontal = Math.max(0, 1 - Math.abs(x / (size - 1) - 0.5) * 1.8);
      const vertical = Math.max(0, 1 - Math.abs(y / (size - 1) - 0.25) * 1.6);
      const alpha = Math.round(horizontal * vertical * 180);
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 222;
      data[index + 2] = 164;
      data[index + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createMuseumWorld(scene, {
  debug = false,
  debugSit = false,
  debugPaths = false,
  qualityTier = "Low",
  lightingEffects = { ...LIGHTING_CONFIG.effects },
  collectedHearts = new Set(),
} = {}) {
  const placementRooms = [
    MUSEUM_CONFIG.architecture.atrium,
    MUSEUM_CONFIG.architecture.entranceHall,
    ...MUSEUM_CONFIG.architecture.chapters,
    ...MUSEUM_CONFIG.architecture.sideRooms,
  ];
  if (import.meta.env?.DEV) {
    const placementReport = validateAndNudgePlacements(
      placementRooms,
      MUSEUM_CONFIG.frames,
      MUSEUM_CONFIG.keepOutZones,
      MUSEUM_CONFIG.lanes,
    );
    if (placementReport.moved.length) {
      console.info("Museum placement validator moved items:", placementReport.moved);
    }
    if (placementReport.unresolved.length) {
      console.warn("Museum placement validator could not clear items:", placementReport.unresolved);
    }
  }

  const colliders = [];
  const frames = [];
  const hearts = [];
  const interactables = [];
  const rooms = [];
  const seats = [];
  const decorAnimations = [];
  const roomLighting = [];
  const frameLights = [];
  const skylightPanels = [];
  const heartBursts = [];
  const carpetObjects = [];
  const architectureMeshes = [];
  const architectureShadowSettings = { casts: false, receives: false };
  const reflectionObjects = [];
  const shellGroups = new Map();
  let frameTextureLoader = null;
  const animationMatrix = new THREE.Matrix4();
  const animationQuaternion = new THREE.Quaternion();
  const animationScale = new THREE.Vector3();
  const animationPosition = new THREE.Vector3();
  const animationEuler = new THREE.Euler();
  let finalRevealStarted = false;
  let secretGate = null;
  let secretRevealed = MUSEUM_CONFIG.hearts.every((heart) => collectedHearts.has(heart.id));
  const worldRoot = new THREE.Group();
  worldRoot.name = "museumWorld";
  worldRoot.visible = false;
  scene.add(worldRoot);
  const debugGroup = new THREE.Group();
  debugGroup.name = "collisionDebug";
  debugGroup.visible = debug || debugPaths;
  worldRoot.add(debugGroup);
  const seatDebugGroup = new THREE.Group();
  seatDebugGroup.name = "seatDebug";
  seatDebugGroup.visible = debugSit;
  worldRoot.add(seatDebugGroup);

  const trimMaterial = makeMaterial(WORLD_CONFIG.architecture.trimColor, 0.62);
  const floorTextures = Object.fromEntries(
    ["wood", "marble", "carpet", "grass", "stone"].map((surface) => {
      const texture = createFloorTexture(surface);
      texture.repeat.set(
        WORLD_CONFIG.gallery.floorTextureRepeatX,
        WORLD_CONFIG.gallery.floorTextureRepeatY,
      );
      return [surface, texture];
    }),
  );
  const wallTexture = (() => {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const noise = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const shade = 252 + Math.round(((noise - Math.floor(noise)) * 2 - 1) * 3);
        const index = (y * size + x) * 4;
        data[index] = data[index + 1] = data[index + 2] = shade;
        data[index + 3] = 255;
      }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 1);
    texture.needsUpdate = true;
    return texture;
  })();
  const wallMaterial = makeMaterial(WORLD_CONFIG.architecture.wallColor, 0.94, { map: wallTexture });
  const pictureWashMaterial = new THREE.MeshBasicMaterial({
    map: createPictureWashTexture(),
    color: 0xffe2ad,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const floorMaterial = makeMaterial(0xffffff, 0.76, { map: floorTextures.wood });
  const aoSize = 32;
  const aoData = new Uint8Array(aoSize * aoSize * 4);
  for (let y = 0; y < aoSize; y += 1) {
    for (let x = 0; x < aoSize; x += 1) {
      const distance = Math.hypot((x - 15.5) / 16, (y - 15.5) / 16);
      const index = (y * aoSize + x) * 4;
      aoData[index] = aoData[index + 1] = aoData[index + 2] = 24;
      aoData[index + 3] = Math.round(Math.max(0, 1 - distance) ** 2 * 120);
    }
  }
  const aoTexture = new THREE.DataTexture(aoData, aoSize, aoSize, THREE.RGBAFormat);
  aoTexture.needsUpdate = true;
  const woodMaterial = makeMaterial(WORLD_CONFIG.architecture.woodColor, 0.5);
  const brassMaterial = makeMaterial(WORLD_CONFIG.architecture.brassColor, 0.3, { metalness: 0.58 });
  const stoneMaterial = makeMaterial(WORLD_CONFIG.architecture.stoneColor, 0.82);
  const upholsteryMaterial = makeMaterial(WORLD_CONFIG.architecture.upholsteryColor, 0.94);
  const vaseMaterial = makeMaterial(0xd8c4a8, 0.28);
  const stemMaterial = makeMaterial(0x4f7650, 0.82);
  const tulipMaterials = [
    makeMaterial(0xc95f77, 0.54),
    makeMaterial(0xe4aa52, 0.54),
    makeMaterial(0xd9899d, 0.54),
  ];

  function addCollider(record) {
    colliders.push(record);
    if (debug) {
      const debugMaterial = new THREE.MeshBasicMaterial({
        color: record.solid ? 0x31c46c : 0x329dff,
        wireframe: true,
        transparent: true,
        opacity: 0.78,
        depthTest: false,
      });
      const geometry = record.type === "cylinder"
        ? new THREE.CylinderGeometry(record.radius, record.radius, record.height, 12, 1, true)
        : new THREE.BoxGeometry(...record.size);
      record.debugMesh = new THREE.Mesh(geometry, debugMaterial);
      record.debugMesh.name = `${record.name}_debug`;
      record.debugMesh.position.set(...record.center);
      record.debugMesh.renderOrder = 3;
      debugGroup.add(record.debugMesh);
    }
    return record;
  }

  function addBox(parent, name, size, position, mat, colliderOptions = null) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (colliderOptions) {
      addCollider(colliderRecord(
        colliderOptions.name ?? name,
        "box",
        position,
        size,
        { solid: colliderOptions.solid !== false, trigger: colliderOptions.trigger ?? false },
      ));
    }
    return mesh;
  }

  function addCylinder(parent, name, radiusTop, radiusBottom, height, position, mat, collider = null, segments = 20) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), mat);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (collider) {
      addCollider(colliderRecord(
        collider.name ?? name,
        "cylinder",
        position,
        undefined,
        {
          radius: collider.radius,
          height: collider.height ?? height,
          solid: collider.solid !== false,
          trigger: collider.trigger ?? false,
        },
      ));
    }
    return mesh;
  }

  function addFloor(parent, name, bounds, y, mat = floorMaterial) {
    const floor = addBox(
      parent,
      name,
      [bounds.xMax - bounds.xMin, 0.3, bounds.zMax - bounds.zMin],
      [(bounds.xMin + bounds.xMax) / 2, y - 0.15, (bounds.zMin + bounds.zMax) / 2],
      mat,
    );
    floor.castShadow = false;
    floor.receiveShadow = true;
    floor.userData.shadowReceiver = true;
    return floor;
  }

  function addFakeAO(parent, name, x, z, width, depth, y = 0.008) {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24),
      new THREE.MeshBasicMaterial({ map: aoTexture, transparent: true, depthWrite: false }),
    );
    shadow.name = `${name}_ambient-occlusion`;
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, y, z);
    shadow.scale.set(width / 2, depth / 2, 1);
    shadow.renderOrder = 0;
    parent.add(shadow);
  }

  function isVisibleInScene(object) {
    for (let current = object; current; current = current.parent) {
      if (!current.visible) return false;
    }
    return true;
  }

  function addWallSegment(parent, axis, fixed, start, end, floorY, height, name, material = wallMaterial) {
    start = snapCentimeter(start);
    end = snapCentimeter(end);
    fixed = snapCentimeter(fixed);
    floorY = snapCentimeter(floorY);
    height = snapCentimeter(height);
    const length = end - start;
    if (length <= 0.01) return;
    const position = axis === "x"
      ? [(start + end) / 2, floorY + height / 2, fixed]
      : [fixed, floorY + height / 2, (start + end) / 2];
    const size = axis === "x"
      ? [length, height, MUSEUM_CONFIG.architecture.wallThickness]
      : [MUSEUM_CONFIG.architecture.wallThickness, height, length];
    // Snap the vertices via the endpoints; rounding this center would move them off the 1cm grid.
    markArchitectureMesh(addBox(parent, name, size, position, material, { name }), parent, false);
  }

  function markArchitectureMesh(mesh, parent, snapPosition = true) {
    mesh.userData.architecture = true;
    mesh.userData.roomId = parent.userData.roomId ?? parent.name;
    if (snapPosition) {
      mesh.position.set(
        snapCentimeter(mesh.position.x),
        snapCentimeter(mesh.position.y),
        snapCentimeter(mesh.position.z),
      );
    }
    // Static architecture uses baked lighting and fake AO, not real-time shadow maps.
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    architectureMeshes.push(mesh);
    return mesh;
  }

  function addArch(parent, axis, fixed, center, floorY, width, wallHeight, name, ownership, material, side, planeOffset) {
    const openingHeight = Math.min(MUSEUM_CONFIG.architecture.doorwayHeight, wallHeight);
    if (ownership.frameOwner) {
      const postWidth = 0.28;
      // Jamb and arch depths stand 3-5cm proud of the shared wall.
      const jambDepth = MUSEUM_CONFIG.architecture.wallThickness * 2 + 0.08;
      const capitalDepth = MUSEUM_CONFIG.architecture.wallThickness * 2 + 0.1;
      const frameFixed = fixed - (ownership.neighbor ? planeOffset : 0);
      const postPositions = axis === "x"
        ? [[center - width / 2 - postWidth / 2, floorY + openingHeight / 2, frameFixed], [center + width / 2 + postWidth / 2, floorY + openingHeight / 2, frameFixed]]
        : [[frameFixed, floorY + openingHeight / 2, center - width / 2 - postWidth / 2], [frameFixed, floorY + openingHeight / 2, center + width / 2 + postWidth / 2]];
      for (const [index, position] of postPositions.entries()) {
        const size = axis === "x" ? [postWidth, openingHeight, jambDepth] : [jambDepth, openingHeight, postWidth];
        markArchitectureMesh(
          addBox(parent, `${name}_jamb_${index}`, size, position, trimMaterial, { name: `${name}_jamb_${index}` }),
          parent,
        );
        markArchitectureMesh(
          addBox(
            parent,
            `${name}_capital_${index}`,
            axis === "x" ? [postWidth * 1.4, 0.16, capitalDepth] : [capitalDepth, 0.16, postWidth * 1.4],
            [position[0], floorY + openingHeight, position[2]],
            brassMaterial,
          ),
          parent,
        );
      }
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(width / 2, 0.12, 8, 24, Math.PI),
        trimMaterial,
      );
      arch.name = `${name}_curve`;
      arch.position.set(axis === "x" ? center : frameFixed, floorY + openingHeight, axis === "x" ? frameFixed : center);
      arch.scale.z = jambDepth / 0.24;
      if (axis === "z") arch.rotation.y = Math.PI / 2;
      parent.add(markArchitectureMesh(arch, parent));

      const headerHeight = wallHeight - openingHeight;
      if (headerHeight > 0) {
        const sharedWallDepth = MUSEUM_CONFIG.architecture.wallThickness * (ownership.neighbor ? 2 : 1);
        const headerFixed = fixed - (ownership.neighbor ? planeOffset : 0);
        const size = axis === "x"
          ? [width, headerHeight, sharedWallDepth]
          : [sharedWallDepth, headerHeight, width];
        const position = axis === "x"
          ? [center, floorY + openingHeight + headerHeight / 2, headerFixed]
          : [headerFixed, floorY + openingHeight + headerHeight / 2, center];
        const neighborColor = ownership.neighbor
          ? ROOM_THEMES[ownership.neighbor.id]?.wallColor ?? ownership.neighbor.theme?.wallColor
          : null;
        const neighborMaterial = neighborColor ? makeMaterial(neighborColor, 0.9) : material;
        const headerMaterials = [material, material, material, material, material, material];
        if (ownership.neighbor) {
          if (axis === "x") {
            headerMaterials[4] = side === "north" ? material : neighborMaterial;
            headerMaterials[5] = side === "south" ? material : neighborMaterial;
          } else {
            headerMaterials[0] = side === "east" ? material : neighborMaterial;
            headerMaterials[1] = side === "west" ? material : neighborMaterial;
          }
        }
        markArchitectureMesh(
          addBox(parent, `${name}_header`, size, position, headerMaterials, { name: `${name}_header` }),
          parent,
        );
      }
    }
  }

  function getSharedWallOffset(config, side) {
    const bounds = config.bounds;
    const sharesPlane = placementRooms.some((other) => {
      if (other === config) return false;
      const overlapX = Math.min(bounds.xMax, other.bounds.xMax) - Math.max(bounds.xMin, other.bounds.xMin);
      const overlapZ = Math.min(bounds.zMax, other.bounds.zMax) - Math.max(bounds.zMin, other.bounds.zMin);
      if (side === "north") return Math.abs(bounds.zMin - other.bounds.zMax) < 0.001 && overlapX > 0;
      if (side === "south") return Math.abs(bounds.zMax - other.bounds.zMin) < 0.001 && overlapX > 0;
      if (side === "west") return Math.abs(bounds.xMin - other.bounds.xMax) < 0.001 && overlapZ > 0;
      return Math.abs(bounds.xMax - other.bounds.xMin) < 0.001 && overlapZ > 0;
    });
    if (!sharesPlane) return 0;
    const halfWallThickness = MUSEUM_CONFIG.architecture.wallThickness / 2;
    return side === "north" || side === "west" ? halfWallThickness : -halfWallThickness;
  }

  function getConfiguredOpenings(room, side) {
    const configured = room.gatedOpenings?.[side] ?? room.openings?.[side];
    return configured ? (Array.isArray(configured) ? configured : [configured]) : [];
  }

  function getNeighborRoomForOpening(config, side, opening) {
    const sideInfo = {
      north: { edge: "zMin", neighborEdge: "zMax", opposite: "south", min: "xMin", max: "xMax" },
      east: { edge: "xMax", neighborEdge: "xMin", opposite: "west", min: "zMin", max: "zMax" },
      south: { edge: "zMax", neighborEdge: "zMin", opposite: "north", min: "xMin", max: "xMax" },
      west: { edge: "xMin", neighborEdge: "xMax", opposite: "east", min: "zMin", max: "zMax" },
    }[side];
    return placementRooms.find((other) => {
      if (other === config || Math.abs(config.bounds[sideInfo.edge] - other.bounds[sideInfo.neighborEdge]) > 0.001) return false;
      const overlapStart = Math.max(config.bounds[sideInfo.min], other.bounds[sideInfo.min]);
      const overlapEnd = Math.min(config.bounds[sideInfo.max], other.bounds[sideInfo.max]);
      if (opening.center - opening.width / 2 < overlapStart || opening.center + opening.width / 2 > overlapEnd) return false;
      return getConfiguredOpenings(other, sideInfo.opposite).some((otherOpening) =>
        Math.abs(otherOpening.center - opening.center) <= 0.001 &&
        Math.abs(otherOpening.width - opening.width) <= 0.001);
    });
  }

  function getArchOwnership(config, side, opening) {
    const neighbor = getNeighborRoomForOpening(config, side, opening);
    return {
      neighbor,
      frameOwner: !neighbor || ownsArchwayFrame(config.id, neighbor.id, MUSEUM_CONFIG.archways),
    };
  }

  // Shared wall halves meet at the room boundary; the configured from-room owns the single doorway frame.
  function buildWall(parent, bounds, side, floorY, height, opening = null, prefix = "wall", material = wallMaterial, planeOffset = 0, ownsFrame = () => true) {
    const isHorizontal = side === "north" || side === "south";
    const axis = isHorizontal ? "x" : "z";
    const fixed = (side === "north" ? bounds.zMin : side === "south" ? bounds.zMax : side === "west" ? bounds.xMin : bounds.xMax) + planeOffset;
    const cornerOverlap = 0.02;
    const start = (isHorizontal ? bounds.xMin : bounds.zMin) + cornerOverlap;
    const end = (isHorizontal ? bounds.xMax : bounds.zMax) - cornerOverlap;
    const openings = opening ? (Array.isArray(opening) ? opening : [opening]) : [];
    if (!openings.length) {
      addWallSegment(parent, axis, fixed, start, end, floorY, height, `${prefix}_${side}`, material);
      return;
    }
    let segmentStart = start;
    for (const [index, item] of openings.slice().sort((a, b) => a.center - b.center).entries()) {
      const leftEnd = item.center - item.width / 2;
      const rightStart = item.center + item.width / 2;
      const seamInset = 0.01;
      addWallSegment(parent, axis, fixed, segmentStart, leftEnd - seamInset, floorY, height, `${prefix}_${side}_${index}_a`, material);
      addArch(
        parent,
        axis,
        fixed,
        item.center,
        floorY,
        item.width,
        height,
        `${prefix}_${side}_${index}_arch`,
        ownsFrame(item),
        material,
        side,
        planeOffset,
      );
      segmentStart = rightStart + seamInset;
    }
    addWallSegment(parent, axis, fixed, segmentStart, end, floorY, height, `${prefix}_${side}_end`, material);
  }

  // Build a room shell from its configured bounds, leaving each declared archway open.
  function createEnclosure(parent, config, prefix, omittedWalls = []) {
    parent.userData.roomId = config.id;
    const { bounds, floorY, height, openings = {} } = config;
    const theme = config.theme ?? {};
    const floorType = config.floorType ?? "wood";
    const surfaceRoughness = {
      wood: 0.62,
      marble: 0.3,
      carpet: 0.98,
      grass: 0.96,
      stone: 0.78,
    }[floorType] ?? 0.76;
    const roomFloorMaterial = makeMaterial(theme.floorColor ?? 0xffffff, surfaceRoughness, {
      map: floorTextures[floorType] ?? floorTextures.wood,
      metalness: floorType === "marble" ? 0.08 : 0,
    });
    const roomWallColor = ROOM_THEMES[config.id]?.wallColor ?? theme.wallColor;
    const roomWallMaterial = roomWallColor
      ? makeMaterial(roomWallColor, 0.94, { map: wallTexture })
      : wallMaterial;
    addFloor(parent, `${prefix}_floor`, bounds, floorY, roomFloorMaterial);
    for (const side of ["north", "east", "south", "west"]) {
      if (omittedWalls.includes(side)) continue;
      const gatedOpening = config.gatedOpenings?.[side];
      const planeOffset = getSharedWallOffset(config, side);
      buildWall(
        parent,
        bounds,
        side,
        floorY,
        height,
        gatedOpening ?? openings[side],
        prefix,
        roomWallMaterial,
        planeOffset,
        (opening) => getArchOwnership(config, side, opening),
      );
      addWallMoulding(parent, bounds, side, floorY, height, gatedOpening ?? openings[side], `${prefix}_moulding_${side}`, planeOffset);
      if (gatedOpening) addSecretWallSection(parent, bounds, side, floorY, height, gatedOpening, prefix, roomWallMaterial, planeOffset);
    }
    if (theme.mirroredFloor) {
      const mirror = new THREE.Mesh(
        new THREE.PlaneGeometry(bounds.xMax - bounds.xMin - 0.2, bounds.zMax - bounds.zMin - 0.2),
        new THREE.MeshStandardMaterial({ color: 0xbfc2c3, metalness: 0.72, roughness: 0.22, transparent: true, opacity: 0.28 }),
      );
      mirror.name = `${prefix}_mirrored-floor`;
      mirror.rotation.x = -Math.PI / 2;
      mirror.position.set((bounds.xMin + bounds.xMax) / 2, floorY + 0.006, (bounds.zMin + bounds.zMax) / 2);
      parent.add(mirror);
      reflectionObjects.push(mirror);
    }
    if (config.shape === "rotunda") addStarDome(parent, bounds, floorY + height);
    else if (theme.starCeiling || theme.glassCeiling) addStarCeiling(parent, bounds, floorY + height, `${prefix}_stars`, theme.glassCeiling);
    else addSkylight(parent, bounds, floorY + height, `${prefix}_skylight`);
    addRoomLighting(parent, config, prefix, roomLighting, decorAnimations);
  }

  function addSecretWallSection(parent, bounds, side, floorY, height, opening, prefix, material, planeOffset = 0) {
    const horizontal = side === "north" || side === "south";
    const fixed = (side === "north" ? bounds.zMin : side === "south" ? bounds.zMax :
      side === "west" ? bounds.xMin : bounds.xMax) + planeOffset;
    const axis = horizontal ? "x" : "z";
    const openingHeight = Math.min(MUSEUM_CONFIG.architecture.doorwayHeight, height);
    const size = horizontal
      ? [opening.width, openingHeight, MUSEUM_CONFIG.architecture.wallThickness]
      : [MUSEUM_CONFIG.architecture.wallThickness, openingHeight, opening.width];
    const position = horizontal
      ? [opening.center, floorY + openingHeight / 2, fixed]
      : [fixed, floorY + openingHeight / 2, opening.center];
    const wallMaterialForGate = material.clone();
    wallMaterialForGate.transparent = true;
    wallMaterialForGate.opacity = 1;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), wallMaterialForGate);
    mesh.name = `${prefix}_secret-wall-section`;
    mesh.position.set(...position);
    markArchitectureMesh(mesh, parent);
    parent.add(mesh);
    const collider = addCollider(colliderRecord(
      `${prefix}_secret-wall-section`,
      "box",
      position,
      size,
      { solid: true },
    ));
    secretGate = {
      mesh,
      collider,
      material: wallMaterialForGate,
      horizontal,
      basePosition: mesh.position.clone(),
      revealed: false,
      pending: false,
      revealing: false,
      revealedAt: 0,
      effects: null,
      colliderRemoved: false,
    };
  }

  function addStarDome(parent, bounds, y) {
    const radius = Math.max(bounds.xMax - bounds.xMin, bounds.zMax - bounds.zMin) * 0.52;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x34304c, side: THREE.BackSide, transparent: true, opacity: 0.92 }),
    );
    dome.name = "rotunda-starry-dome";
    dome.position.set(0, y, 0);
    parent.add(dome);
    const starMaterial = new THREE.MeshBasicMaterial({ color: 0xffe6bf });
    const stars = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 5, 4), starMaterial, 42);
    stars.name = "rotunda-dome-stars";
    const matrix = new THREE.Matrix4();
    let index = 0;
    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 6; column += 1) {
        const x = -8 + column * 3.2;
        const z = -8 + row * 2.6;
        const domeY = Math.sqrt(Math.max(0, radius * radius - x * x - z * z));
        matrix.makeTranslation(x, y + domeY - 0.12, z);
        stars.setMatrixAt(index++, matrix);
      }
    }
    parent.add(stars);
    decorAnimations.push({ type: "dome", material: dome.material, phase: 0 });
  }

  function addStarCeiling(parent, bounds, y, name, glass = false) {
    addSkylight(parent, bounds, y, name);
    const starGeometry = new THREE.SphereGeometry(0.045, 5, 4);
    const starMaterial = new THREE.MeshBasicMaterial({ color: glass ? 0xf6e9ff : 0xe7d9ff });
    const stars = new THREE.InstancedMesh(starGeometry, starMaterial, 32);
    stars.name = `${name}_starfield`;
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < 32; index += 1) {
      const x = bounds.xMin + 1 + ((index * 7) % Math.floor((bounds.xMax - bounds.xMin - 2)));
      const z = bounds.zMin + 1 + ((index * 11) % Math.floor((bounds.zMax - bounds.zMin - 2)));
      matrix.makeTranslation(x, y - 0.12, z);
      stars.setMatrixAt(index, matrix);
    }
    parent.add(stars);
  }

  function addWallMoulding(parent, bounds, side, floorY, height, opening, prefix, planeOffset = 0) {
    const horizontal = side === "north" || side === "south";
    const cornerInset = 0.02;
    const axisStart = (horizontal ? bounds.xMin : bounds.zMin) + cornerInset;
    const axisEnd = (horizontal ? bounds.xMax : bounds.zMax) - cornerInset;
    const fixed = (side === "north" ? bounds.zMin : side === "south" ? bounds.zMax :
      side === "west" ? bounds.xMin : bounds.xMax) + planeOffset;
    const inward = side === "north" || side === "west" ? 1 : -1;
    const thickness = WORLD_CONFIG.gallery.railHeight;
    const depth = 0.12;
    const railOffset = MUSEUM_CONFIG.architecture.wallThickness / 2 - depth / 2 + 0.02;
    const panelDepth = 0.02;
    const panelOffset = MUSEUM_CONFIG.architecture.wallThickness / 2;
    const openings = opening ? (Array.isArray(opening) ? opening : [opening]) : [];
    const spans = [];
    let spanStart = axisStart;
    for (const item of openings.slice().sort((a, b) => a.center - b.center)) {
      spans.push([spanStart, item.center - item.width / 2]);
      spanStart = item.center + item.width / 2;
    }
    spans.push([spanStart, axisEnd]);
    const addDetailBox = (name, width, tall, thick, axisPosition, y, inset = railOffset, snapPosition = true) => {
      const position = horizontal
        ? [axisPosition, y, fixed + inward * inset]
        : [fixed + inward * inset, y, axisPosition];
      const size = horizontal ? [width, tall, thick] : [thick, tall, width];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), trimMaterial);
      mesh.name = name;
      mesh.position.set(...position);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      markArchitectureMesh(mesh, parent, snapPosition);
      parent.add(mesh);
    };
    for (const [start, end] of spans) {
      const length = end - start;
      if (length <= 0.2) continue;
      const center = (start + end) / 2;
      const railInset = Math.min(0.04, length * 0.25);
      const railLength = length - railInset * 2;
      for (const [index, y, railHeight] of [
        [0, floorY + WORLD_CONFIG.gallery.baseboardHeight / 2, WORLD_CONFIG.gallery.baseboardHeight],
        [1, floorY + WORLD_CONFIG.gallery.panelLowerRail, thickness],
        [2, floorY + WORLD_CONFIG.gallery.panelUpperRail, thickness],
        [3, floorY + height - 0.12, 0.24],
      ]) {
        addDetailBox(`${prefix}_rail_${index}`, railLength, railHeight, depth, center, y, railOffset, false);
      }
      const spacing = WORLD_CONFIG.gallery.pilasterSpacing;
      for (let position = start + 0.2; position < end - 0.1; position += spacing) {
        for (const sideOffset of [-1, 1]) {
          addDetailBox(
            `${prefix}_panel_${position.toFixed(2)}_${sideOffset}`,
            WORLD_CONFIG.gallery.pilasterWidth,
            WORLD_CONFIG.gallery.panelUpperRail - WORLD_CONFIG.gallery.panelLowerRail,
            panelDepth,
            position + sideOffset * WORLD_CONFIG.gallery.pilasterWidth * 0.7,
            floorY + (WORLD_CONFIG.gallery.panelLowerRail + WORLD_CONFIG.gallery.panelUpperRail) / 2,
            panelOffset,
          );
        }
      }
    }
  }

  function addSkylight(parent, bounds, y, name) {
    const width = Math.min(bounds.xMax - bounds.xMin - 1.2, 12);
    const depth = Math.min(bounds.zMax - bounds.zMin - 1.2, 12);
    const centerX = (bounds.xMin + bounds.xMax) / 2;
    const centerZ = (bounds.zMin + bounds.zMax) / 2;
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.06, depth),
      new THREE.MeshBasicMaterial({
        color: WORLD_CONFIG.architecture.skylightColor,
        transparent: true,
        opacity: WORLD_CONFIG.gallery.skylightOpacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    glass.name = `${name}_glass`;
    glass.position.set(centerX, y - 0.06, centerZ);
    glass.renderOrder = 1;
    parent.add(glass);
    if (name.includes("final-room")) {
      skylightPanels.push({ mesh: glass, startY: glass.position.y, startOpacity: glass.material.opacity });
    }
    const beamMaterial = makeMaterial(WORLD_CONFIG.architecture.trimColor, 0.42, { metalness: 0.12 });
    const beamHeight = 0.09;
    for (let index = 0; index <= 2; index += 1) {
      const x = centerX - width / 2 + (width * index) / 2;
      const z = centerZ - depth / 2 + (depth * index) / 2;
      for (const [axis, position] of [["x", x], ["z", z]]) {
        const beam = new THREE.Mesh(
          new THREE.BoxGeometry(
            axis === "x" ? 0.055 : width,
            beamHeight,
            axis === "x" ? depth : 0.055,
          ),
          beamMaterial,
        );
        beam.name = `${name}_beam_${axis}_${index}`;
        beam.position.set(axis === "x" ? position : centerX, y - beamHeight / 2, axis === "z" ? position : centerZ);
        beam.castShadow = false;
        beam.receiveShadow = false;
        parent.add(beam);
      }

    }
  }

  const atriumRoot = new THREE.Group();
  atriumRoot.name = "grandAtrium";
  atriumRoot.visible = true;
  shellGroups.set(MUSEUM_CONFIG.architecture.atrium.id, atriumRoot);
  worldRoot.add(atriumRoot);
  createEnclosure(atriumRoot, MUSEUM_CONFIG.architecture.atrium, "atrium");

  for (const roomConfig of [...MUSEUM_CONFIG.architecture.chapters, ...MUSEUM_CONFIG.architecture.sideRooms]) {
    const shell = new THREE.Group();
    shell.name = `room_${roomConfig.id}`;
    shell.visible = !roomConfig.hiddenUntilRevealed || secretRevealed;
    shellGroups.set(roomConfig.id, shell);
    worldRoot.add(shell);
    createEnclosure(shell, roomConfig, `shell_${roomConfig.id}`);
  }

  const entry = MUSEUM_CONFIG.architecture.entranceHall;
  const entryRoot = new THREE.Group();
  entryRoot.name = "grandEntranceHall";
  entryRoot.visible = true;
  shellGroups.set(entry.id, entryRoot);
  worldRoot.add(entryRoot);
  createEnclosure(entryRoot, entry, "entrance");
  createEntranceFeatures(entryRoot, entry);

  createAtriumFeatures();

  function createEntranceFeatures(parent, config) {
    const [centerX, centerZ] = config.center;
    for (const [index, [x, z]] of MUSEUM_CONFIG.architecture.columns.entries()) {
      markArchitectureMesh(addCylinder(
        parent,
        `entrance_column_${index}`,
        0.3,
        0.38,
        config.height - 0.25,
        [x, (config.height - 0.25) / 2, z],
        stoneMaterial,
        { name: `col_entrance_column_${index}`, radius: 0.4, height: config.height - 0.25 },
        16,
      ), parent);
      markArchitectureMesh(
        addCylinder(parent, `entrance_column_cap_${index}`, 0.5, 0.5, 0.2, [x, config.height - 0.15, z], trimMaterial),
        parent,
      );
    }
    const chandelier = new THREE.Mesh(
      new THREE.ExtrudeGeometry(makeHeartShape(), { depth: 0.2, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.05, bevelThickness: 0.04 }),
      makeMaterial(0xf0b6c1, 0.28, { emissive: 0x9b344c, emissiveIntensity: 0.5 }),
    );
    chandelier.name = "entrance-heart-chandelier";
    chandelier.position.set(centerX, config.height - 1.1, centerZ);
    parent.add(chandelier);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 0.75),
      new THREE.MeshBasicMaterial({ map: createNameplateTexture("Happy 1st Monthsary", ""), toneMapped: false }),
    );
    sign.name = "monthsary-entrance-sign";
    sign.position.set(0, 5.2, config.bounds.zMax - 0.18);
    sign.rotation.y = Math.PI;
    parent.add(sign);
  }

  function createAtriumFeatures() {
    const fountain = MUSEUM_CONFIG.architecture.fountain;
    const [x, , z] = fountain.position;
    addCylinder(
      atriumRoot,
      "heart_fountain_basin",
      fountain.radius,
      fountain.radius * 1.08,
      fountain.height,
      [x, fountain.height / 2, z],
      stoneMaterial,
      { name: "col_heart_fountain", radius: fountain.radius, height: fountain.height },
      48,
    );
    addCylinder(
      atriumRoot,
      "fountain_water",
      fountain.radius * 0.78,
      fountain.radius * 0.78,
      0.04,
      [x, fountain.height + 0.02, z],
      makeMaterial(WORLD_CONFIG.architecture.waterColor, 0.22, { metalness: 0.2 }),
    );
    const heartMaterial = makeMaterial(WORLD_CONFIG.architecture.heartColor, 0.28, {
      emissive: WORLD_CONFIG.architecture.heartColor,
      emissiveIntensity: 0.38,
      metalness: 0.16,
    });
    const heart = new THREE.Mesh(
      new THREE.ExtrudeGeometry(makeHeartShape(), { depth: 0.32, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.06, bevelThickness: 0.05 }),
      heartMaterial,
    );
    heart.name = "glowingHeartSculpture";
    heart.position.set(x, fountain.height + 0.9, z);
    heart.scale.set(1.3, 1.3, 1.3);
    heart.castShadow = true;
    atriumRoot.add(heart);
    const fountainTrigger = addCollider(colliderRecord(
      "trigger_wishing-fountain",
      "cylinder",
      [x, 0, z + fountain.radius + 0.9],
      undefined,
      { radius: 1.15, height: 2, solid: false, trigger: true },
    ));
    interactables.push({
      id: "wishing-fountain",
      kind: "fountain",
      label: "Make a wish",
      position: [x, 0, z + fountain.radius + 0.9],
      range: 1.6,
      roomId: "atrium",
      trigger: fountainTrigger,
    });
    const medallion = new THREE.Mesh(
      new THREE.CircleGeometry(4.4, 48),
      makeMaterial(0xb78d50, 0.3, { metalness: 0.62 }),
    );
    medallion.name = "rotunda-floor-medallion";
    medallion.rotation.x = -Math.PI / 2;
    medallion.position.y = 0.012;
    atriumRoot.add(medallion);
    const innerMedallion = new THREE.Mesh(
      new THREE.RingGeometry(1.9, 3.5, 48),
      makeMaterial(0xe4c883, 0.24, { metalness: 0.68 }),
    );
    innerMedallion.name = "rotunda-medallion-ring";
    innerMedallion.rotation.x = -Math.PI / 2;
    innerMedallion.position.y = 0.02;
    atriumRoot.add(innerMedallion);
    const lanterns = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      makeMaterial(0xffcf88, 0.25, { emissive: 0xc48137, emissiveIntensity: 0.75 }),
      10,
    );
    lanterns.name = "rotunda-floating-lanterns";
    const matrix = new THREE.Matrix4();
    const lanternPositions = [];
    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2;
      const position = [Math.cos(angle) * 7.4, 3.2 + (index % 3) * 0.65, Math.sin(angle) * 7.4];
      lanternPositions.push(position);
      matrix.makeTranslation(...position);
      lanterns.setMatrixAt(index, matrix);
    }
    atriumRoot.add(lanterns);
    decorAnimations.push({ type: "lanterns", mesh: lanterns, positions: lanternPositions, time: 0 });
  }

  // Register configured room content lazily so distant props and their colliders stay unloaded.
  function createConfiguredRoom(config, parent) {
    const room = {
      id: config.id,
      title: config.title,
      center: config.center,
      floorY: config.floorY,
      loadRadius: config.loadRadius,
      loaded: false,
      locked: Boolean(config.hiddenUntilRevealed) && !secretRevealed,
      group: new THREE.Group(),
      shell: shellGroups.get(config.id),
      config,
      colliders: [],
    };
    room.group.name = `content_${config.id}`;
    room.group.visible = false;
    (parent ?? worldRoot).add(room.group);
    rooms.push(room);
    const props = [...(config.props ?? [])];
    if (config.id === "entrance-hall" && config.runner) {
      props.push({
        type: "rug",
        position: [config.runner.x, config.floorY, config.runner.z],
        width: config.runner.width,
        depth: config.runner.depth,
      });
    }
    for (const [propIndex, prop] of props.entries()) {
      const startIndex = colliders.length;
      createProp(room.group, prop, `${config.id}_${prop.type}_${propIndex}`, room);
      const roomPropColliders = colliders.slice(startIndex);
      for (const collider of roomPropColliders) collider.enabled = false;
      room.colliders.push(...roomPropColliders);
    }
    registerRoomFrames(room);
    if (!room.locked && config.id === "atrium") loadRoom(room);
    return room;
  }

  function registerInteractable(room, details, triggerPosition = details.position) {
    const trigger = addCollider(colliderRecord(
      `trigger_interactable_${details.id}`,
      "cylinder",
      triggerPosition,
      undefined,
      { radius: 1.15, height: 2, solid: false, trigger: true },
    ));
    room.colliders.push(trigger);
    const record = { ...details, roomId: room.id, trigger };
    interactables.push(record);
    return record;
  }

  createConfiguredRoom(MUSEUM_CONFIG.architecture.atrium, atriumRoot);
  createConfiguredRoom(entry, entryRoot);
  for (const chapter of MUSEUM_CONFIG.architecture.chapters) createConfiguredRoom(chapter);
  for (const room of MUSEUM_CONFIG.architecture.sideRooms) createConfiguredRoom(room);

  if (secretRevealed) revealSecretRoom();

  const guideRoute = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(
      MUSEUM_CONFIG.architecture.guideRoute.flatMap((point, index, list) =>
        index < list.length - 1
          ? [new THREE.Vector3(point[0], 0.045, point[1]), new THREE.Vector3(list[index + 1][0], 0.045, list[index + 1][1])]
          : [],
      ),
    ),
    new THREE.LineBasicMaterial({ color: 0x7de2a5, transparent: true, opacity: 0.9 }),
  );
  guideRoute.name = "museum-guide-route";
  guideRoute.visible = false;
  worldRoot.add(guideRoute);

  let pathGrid = null;
  if (debugPaths) {
    revealSecretRoom();
    for (const room of rooms) {
      room.locked = false;
      loadRoomById(room.id);
    }
    pathGrid = computeWalkableGrid({
      bounds: MUSEUM_CONFIG.worldBounds,
      rooms: [
        MUSEUM_CONFIG.architecture.atrium,
        MUSEUM_CONFIG.architecture.entranceHall,
        ...MUSEUM_CONFIG.architecture.chapters,
        ...MUSEUM_CONFIG.architecture.sideRooms,
      ],
      colliders,
      start: MUSEUM_CONFIG.spawnPoints.main,
      cellSize: 0.8,
    });
    addPathDebugOverlay(pathGrid);
  }

  function addPathDebugOverlay(grid) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    const cells = new THREE.InstancedMesh(
      new THREE.BoxGeometry(grid.cellSize * 0.82, 0.025, grid.cellSize * 0.82),
      material,
      grid.cells.length,
    );
    cells.name = "path-debug-walkable-grid";
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    for (const [index, cell] of grid.cells.entries()) {
      position.set(cell.x, 0.045, cell.z);
      matrix.compose(position, quaternion, scale);
      cells.setMatrixAt(index, matrix);
      cells.setColorAt(index, new THREE.Color(cell.reachable ? 0x4ab978 : 0xe84149));
    }
    cells.instanceMatrix.needsUpdate = true;
    cells.renderOrder = 4;
    debugGroup.add(cells);

    for (const zone of MUSEUM_CONFIG.keepOutZones) {
      const { xMin, xMax, zMin, zMax } = zone.bounds;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(xMax - xMin, 0.035, zMax - zMin),
        new THREE.MeshBasicMaterial({ color: 0xffc857, transparent: true, opacity: 0.4, depthWrite: false }),
      );
      mesh.name = `path-debug-keepout:${zone.id}`;
      mesh.position.set((xMin + xMax) / 2, 0.075, (zMin + zMax) / 2);
      mesh.renderOrder = 5;
      debugGroup.add(mesh);
    }
    for (const lane of MUSEUM_CONFIG.lanes) {
      const [x1, z1] = lane.start;
      const [x2, z2] = lane.end;
      const length = Math.hypot(x2 - x1, z2 - z1);
      const px = ((z2 - z1) / length) * lane.width / 2;
      const pz = (-(x2 - x1) / length) * lane.width / 2;
      const outline = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x1 + px, 0.08, z1 + pz),
          new THREE.Vector3(x2 + px, 0.08, z2 + pz),
          new THREE.Vector3(x2 - px, 0.08, z2 - pz),
          new THREE.Vector3(x1 - px, 0.08, z1 - pz),
        ]),
        new THREE.LineBasicMaterial({ color: 0x43c9ed, depthTest: false }),
      );
      outline.name = `path-debug-lane:${lane.id}`;
      outline.renderOrder = 6;
      debugGroup.add(outline);
    }
    console.info(`Path debug grid: ${grid.reachable.size}/${grid.cells.length} reachable cells.`);
  }

  function registerRoomFrames(room) {
    for (const frameConfig of MUSEUM_CONFIG.frames.filter((frame) => frame.roomId === room.id)) {
      const frame = {
        config: frameConfig,
        room,
        object: null,
        video: null,
        videoTexture: null,
        videoRequested: false,
        videoFailed: false,
        fullResolutionRequested: false,
        thumbnailPath: "",
        textureDownsampled: false,
        artworkMaterial: null,
      };
      room.frames ??= [];
      room.frames.push(frame);
      frames.push(frame);
    }
  }

  function addSeatSlots(parent, room, prefix, x, floorY, z, count, seatWidth, seatDepth, backrestOffsetZ) {
    const config = INTERACTION_CONFIG.seating;
    const seatTop = floorY + config.seatHeight;
    const backrestPosition = [
      x,
      seatTop + config.backrestHeight / 2 - config.backrestOverlap,
      z + backrestOffsetZ,
    ];
    const backrestFaceZ = z + backrestOffsetZ + config.backrestThickness / 2;
    const slotZ = backrestFaceZ + config.bodyHalfDepth + config.backrestGap;
    for (let index = 0; index < count; index += 1) {
      const offsetX = count === 1 ? 0 : (index - (count - 1) / 2) * config.slotSpacing;
      const slotPosition = [x + offsetX, floorY + config.seatHeight, slotZ];
      const approach = [slotPosition[0], floorY, slotZ + config.approachDistance];
      const seat = {
        id: `${prefix}:seat-${index + 1}`,
        groupId: prefix,
        index: index + 1,
        room,
        position: slotPosition,
        forward: [0, 0, 1],
        approach,
        floorY,
        seatHeight: config.seatHeight,
        width: count === 1 ? seatWidth : config.slotSpacing,
        depth: seatDepth,
        surface: {
          position: [x, seatTop, z],
          topY: seatTop,
          width: seatWidth,
          depth: seatDepth,
        },
        backrest: {
          position: backrestPosition,
          width: seatWidth,
          height: config.backrestHeight,
          thickness: config.backrestThickness,
        },
      };
      seats.push(seat);
      if (debugSit) {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.075, 12, 8),
          new THREE.MeshBasicMaterial({ color: 0x37a7ff, depthTest: false }),
        );
        marker.name = `seat-slot-debug:${seat.id}`;
        marker.position.set(...slotPosition);
        marker.renderOrder = 4;
        seatDebugGroup.add(marker);
        const direction = new THREE.Vector3(...seat.forward);
        const arrow = new THREE.ArrowHelper(
          direction,
          new THREE.Vector3(...slotPosition),
          0.55,
          0xffc857,
          0.16,
          0.1,
        );
        arrow.name = `seat-forward-debug:${seat.id}`;
        seatDebugGroup.add(arrow);
        const approachMarker = new THREE.Mesh(
          new THREE.SphereGeometry(0.055, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0x55d88a, depthTest: false }),
        );
        approachMarker.name = `seat-approach-debug:${seat.id}`;
        approachMarker.position.set(...approach);
        approachMarker.renderOrder = 4;
        seatDebugGroup.add(approachMarker);
      }
    }
  }

  function addTableArrangement(parent, prefix, x, floorY, z) {
    const tableTopY = floorY + 0.86;
    const vase = new THREE.Mesh(
      new THREE.LatheGeometry([
        new THREE.Vector2(0.055, 0),
        new THREE.Vector2(0.12, 0.03),
        new THREE.Vector2(0.15, 0.12),
        new THREE.Vector2(0.11, 0.23),
        new THREE.Vector2(0.075, 0.29),
        new THREE.Vector2(0.08, 0.31),
      ], 16),
      vaseMaterial,
    );
    vase.name = `${prefix}_vase`;
    vase.position.set(x, tableTopY, z);
    parent.add(vase);

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const flowers = Array.from({ length: 5 }, (_, index) => ({
      x: x + (index - 2) * 0.06,
      y: tableTopY + 0.59,
      z: z + (index % 2 ? 0.025 : -0.025),
      colorIndex: index % tulipMaterials.length,
    }));
    const stemInstances = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.012, 0.018, 0.42, 6),
      stemMaterial,
      flowers.length,
    );
    stemInstances.name = `${prefix}_tulip_stems_instanced`;
    for (const [index, flower] of flowers.entries()) {
      quaternion.setFromEuler(new THREE.Euler(0, 0, (index - 2) * 0.025));
      matrix.compose(
        new THREE.Vector3(flower.x, tableTopY + 0.38, flower.z),
        quaternion,
        new THREE.Vector3(1, 1, 1),
      );
      stemInstances.setMatrixAt(index, matrix);
    }
    stemInstances.instanceMatrix.needsUpdate = true;
    parent.add(stemInstances);

    const leafInstances = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), stemMaterial, flowers.length * 2);
    leafInstances.name = `${prefix}_tulip_leaves_instanced`;
    let leafIndex = 0;
    for (const flower of flowers) {
      for (const side of [-1, 1]) {
        quaternion.setFromEuler(new THREE.Euler(0, 0, side * 0.8));
        matrix.compose(
          new THREE.Vector3(flower.x + side * 0.04, tableTopY + 0.25, flower.z),
          quaternion,
          new THREE.Vector3(0.065, 0.022, 0.024),
        );
        leafInstances.setMatrixAt(leafIndex++, matrix);
      }
    }
    leafInstances.instanceMatrix.needsUpdate = true;
    parent.add(leafInstances);

    for (const [colorIndex, colorMaterial] of tulipMaterials.entries()) {
      const flowerIndices = flowers
        .map((flower, index) => flower.colorIndex === colorIndex ? index : -1)
        .filter((index) => index >= 0);
      const petals = new THREE.InstancedMesh(
        new THREE.SphereGeometry(0.052, 6, 4),
        colorMaterial,
        flowerIndices.length * 3,
      );
      petals.name = `${prefix}_tulip_petals_${colorIndex}_instanced`;
      let petalIndex = 0;
      for (const flowerIndex of flowerIndices) {
        const flower = flowers[flowerIndex];
        for (let petal = 0; petal < 3; petal += 1) {
          const angle = (petal * Math.PI * 2) / 3;
          matrix.compose(
            new THREE.Vector3(
              flower.x + Math.cos(angle) * 0.026,
              flower.y,
              flower.z + Math.sin(angle) * 0.026,
            ),
            new THREE.Quaternion(),
            new THREE.Vector3(0.78, 1.18, 0.78),
          );
          petals.setMatrixAt(petalIndex++, matrix);
        }
      }
      petals.instanceMatrix.needsUpdate = true;
      parent.add(petals);
      const meshAnimation = decorAnimations.find((animation) =>
        animation.type === "flowers" && animation.prefix === prefix);
      if (meshAnimation) meshAnimation.petalMeshes.push({ mesh: petals, flowerIndices });
      else decorAnimations.push({
        type: "flowers",
        prefix,
        positions: flowers,
        stems: stemInstances,
        leaves: leafInstances,
        petalMeshes: [{ mesh: petals, flowerIndices }],
        time: 0,
      });
    }
  }

  function createProp(parent, prop, prefix, room) {
    const [x, floorY, z] = prop.position;
    if (prop.type === "bench") {
      const config = INTERACTION_CONFIG.seating;
      addFakeAO(parent, prefix, x, z, config.seatWidth + 0.25, config.seatDepth + 0.22, floorY + 0.006);
      const baseThickness = config.seatThickness * 0.55;
      addBox(
        parent,
        `${prefix}_seat_base`,
        [config.seatWidth, baseThickness, config.seatDepth],
        [x, floorY + config.seatHeight - 0.1 - baseThickness / 2, z],
        woodMaterial,
        {
        name: `col_${prefix}`,
        },
      );
      addBox(
        parent,
        `${prefix}_seat_cushion`,
        [config.seatWidth - 0.06, 0.1, config.seatDepth - 0.06],
        [x, floorY + config.seatHeight - 0.05, z],
        upholsteryMaterial,
      );
      addBox(
        parent,
        `${prefix}_back_frame`,
        [config.seatWidth, config.backrestHeight, config.backrestThickness],
        [
          x,
          floorY + config.seatHeight + config.backrestHeight / 2 - config.backrestOverlap,
          z + config.backrestOffsetZ,
        ],
        woodMaterial,
        { name: `col_${prefix}_back` },
      );
      addBox(
        parent,
        `${prefix}_back_cushion`,
        [config.seatWidth - 0.12, config.backrestHeight - 0.1, 0.08],
        [
          x,
          floorY + config.seatHeight + (config.backrestHeight - 0.1) / 2 - config.backrestOverlap,
          z + config.backrestOffsetZ + config.backrestThickness / 2 + 0.01,
        ],
        upholsteryMaterial,
      );
      for (const side of [-1, 1]) {
        const supportX = config.seatWidth / 2 - config.seatSupportInset;
        addBox(
          parent,
          `${prefix}_leg_${side}`,
          [config.seatSupportWidth, config.seatHeight - config.seatThickness, config.seatSupportDepth],
          [x + side * supportX, floorY + (config.seatHeight - config.seatThickness) / 2, z],
          brassMaterial,
        );
        addBox(
          parent,
          `${prefix}_arm_${side}`,
          [0.14, 0.34, config.seatDepth],
          [x + side * (config.seatWidth / 2 - 0.07), floorY + config.seatHeight + 0.12, z],
          woodMaterial,
        );
        addBox(
          parent,
          `${prefix}_arm_cushion_${side}`,
          [0.12, 0.08, config.seatDepth - 0.04],
          [x + side * (config.seatWidth / 2 - 0.07), floorY + config.seatHeight + 0.33, z],
          upholsteryMaterial,
        );
      }
      addSeatSlots(parent, room, prefix, x, floorY, z, 2, config.seatWidth, config.seatDepth, config.backrestOffsetZ);
    } else if (prop.type === "chair") {
      const config = INTERACTION_CONFIG.seating;
      addBox(
        parent,
        `${prefix}_seat`,
        [config.chairWidth, config.seatThickness, config.chairDepth],
        [x, floorY + config.seatHeight - config.seatThickness / 2, z],
        woodMaterial,
        { name: `col_${prefix}` },
      );
      addBox(
        parent,
        `${prefix}_back`,
        [config.chairWidth, config.backrestHeight, config.backrestThickness],
        [
          x,
          floorY + config.seatHeight + config.backrestHeight / 2 - config.backrestOverlap,
          z + config.backrestOffsetZ,
        ],
        woodMaterial,
        { name: `col_${prefix}_back` },
      );
      for (const [side, forward] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        addBox(
          parent,
          `${prefix}_leg_${side}_${forward}`,
          [config.seatSupportWidth, config.seatHeight - config.seatThickness, config.seatSupportWidth],
          [
            x + side * (config.chairWidth / 2 - config.seatSupportWidth),
            floorY + (config.seatHeight - config.seatThickness) / 2,
            z + forward * (config.chairDepth / 2 - config.seatSupportWidth),
          ],
          brassMaterial,
        );
      }
      addSeatSlots(parent, room, prefix, x, floorY, z, 1, config.chairWidth, config.chairDepth, config.backrestOffsetZ);
    } else if (["table", "cafeTable", "console"].includes(prop.type)) {
      const isConsole = prop.type === "console";
      const tableWidth = isConsole ? 1.65 : prop.type === "cafeTable" ? 1.05 : 1.35;
      const tableDepth = isConsole ? 0.72 : prop.type === "cafeTable" ? 1.05 : 0.9;
      addFakeAO(parent, prefix, x, z, tableWidth + 0.3, tableDepth + 0.3, floorY + 0.006);
      addBox(parent, `${prefix}_top`, [tableWidth, 0.16, tableDepth], [x, floorY + 0.78, z], woodMaterial, {
        name: `col_${prefix}`,
      });
      addTableArrangement(parent, prefix, x, floorY, z);
      for (const offsetX of [-1, 1]) {
        for (const offsetZ of [-1, 1]) {
          addBox(
            parent,
            `${prefix}_leg_${offsetX}_${offsetZ}`,
            [0.1, 0.72, 0.1],
            [x + offsetX * (tableWidth / 2 - 0.12), floorY + 0.36, z + offsetZ * (tableDepth / 2 - 0.12)],
            brassMaterial,
          );
        }
      }
      if (isConsole) {
        addBox(parent, `${prefix}_guestbook_book`, [0.48, 0.09, 0.36], [x, floorY + 0.91, z], makeMaterial(0x7d3b3e, 0.62), {
          name: `col_${prefix}_guestbook`,
        });
      }
    } else if (prop.type === "plant") {
      addCylinder(parent, `${prefix}_pot`, 0.38, 0.3, 0.52, [x, floorY + 0.26, z], makeMaterial(0x9b8064), {
        name: `col_${prefix}`,
        radius: 0.4,
        height: 0.56,
      });
      addCylinder(parent, `${prefix}_leaves`, 0.58, 0.2, 1.3, [x, floorY + 1.1, z], makeMaterial(WORLD_CONFIG.architecture.plantColor, 0.86));
      for (const side of [-1, 1]) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.1, 7), makeMaterial(WORLD_CONFIG.architecture.plantColor, 0.86));
        leaf.name = `${prefix}_leaf_${side}`;
        leaf.position.set(x + side * 0.28, floorY + 1.4, z);
        leaf.rotation.z = side * 0.35;
        parent.add(leaf);
      }
    } else if (prop.type === "rug" || prop.type === "picnic") {
      const width = prop.width ?? 2.4;
      const depth = prop.depth ?? 4.2;
      const rug = new THREE.Mesh(
        new THREE.BoxGeometry(width, WORLD_CONFIG.gallery.rugHeight, depth),
        makeMaterial(WORLD_CONFIG.architecture.rugColor, 0.98),
      );
      rug.name = `${prefix}_rug`;
      rug.position.set(x, floorY + WORLD_CONFIG.gallery.rugHeight / 2, z);
      rug.receiveShadow = true;
      rug.userData.shadowReceiver = true;
      parent.add(rug);
      carpetObjects.push(rug);
      const edge = 0.035;
      const borderMaterial = makeMaterial(WORLD_CONFIG.architecture.rugBorderColor, 0.75, { metalness: 0.12 });
      for (const side of [-1, 1]) {
        const longBorder = new THREE.Mesh(
          new THREE.BoxGeometry(edge, 0.002, depth - 0.08),
          borderMaterial,
        );
        longBorder.position.set(x + side * (width / 2 - 0.06), floorY + WORLD_CONFIG.gallery.rugHeight + 0.001, z);
        parent.add(longBorder);
        carpetObjects.push(longBorder);
        const endBorder = new THREE.Mesh(
          new THREE.BoxGeometry(width - 0.08, 0.002, edge),
          borderMaterial,
        );
        endBorder.position.set(x, floorY + WORLD_CONFIG.gallery.rugHeight + 0.001, z + side * (depth / 2 - 0.06));
        parent.add(endBorder);
        carpetObjects.push(endBorder);
      }
      if (prop.type === "picnic") {
        addBox(parent, `${prefix}_basket`, [0.52, 0.38, 0.42], [x + 1.2, floorY + 0.19, z + 0.3], woodMaterial, {
          name: `col_${prefix}_basket`,
        });
      }
    } else if (prop.type === "pond") {
      const pond = addCylinder(
        parent,
        `${prefix}_pond-edge`,
        1.3,
        1.3,
        0.28,
        [x, floorY + 0.14, z],
        stoneMaterial,
        { name: `col_${prefix}_pond`, radius: 1.3, height: 0.28 },
        24,
      );
      pond.material = makeMaterial(0x7b8e82, 0.82);
      addCylinder(
        parent,
        `${prefix}_pond-water`,
        1.08,
        1.08,
        0.035,
        [x, floorY + 0.29, z],
        makeMaterial(0x80b8ba, 0.2, { metalness: 0.22, transparent: true, opacity: 0.76 }),
        null,
        24,
      );
    } else if (prop.type === "telescope") {
      const telescopeTube = addCylinder(parent, `${prefix}_telescope-tube`, 0.12, 0.15, 1.05, [x, floorY + 1.75, z], brassMaterial, {
        name: `col_${prefix}_tube`,
        radius: 0.16,
        height: 1.05,
      }, 10);
      const legs = [[-0.42, -0.32], [0.42, -0.32], [0, 0.45]];
      for (const [index, [dx, dz]] of legs.entries()) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.35, 6), woodMaterial);
        leg.name = `${prefix}_tripod-leg_${index}`;
        leg.position.set(x + dx / 2, floorY + 0.68, z + dz / 2);
        leg.rotation.z = dx * 0.4;
        leg.castShadow = true;
        parent.add(leg);
        addCollider(colliderRecord(
          `${prefix}_tripod-leg_${index}`,
          "cylinder",
          [x + dx, floorY + 0.68, z + dz],
          undefined,
          { radius: 0.07, height: 1.25, solid: true },
        ));
      }
      registerInteractable(room, {
        id: prefix,
        kind: "telescope",
        label: "Look through telescope",
        position: [x, floorY, z + 1.05],
        range: 1.7,
        object: telescopeTube,
      });
    } else if (prop.type === "jukebox") {
      const rotationY = prop.rotationY ?? 0;
      const jukebox = new THREE.Group();
      jukebox.name = `${prefix}_jukebox`;
      jukebox.position.set(x, floorY, z);
      jukebox.rotation.y = rotationY;
      jukebox.scale.x = 0.8;
      parent.add(jukebox);
      const wood = makeMaterial(0x633842, 0.42, { metalness: 0.12 });
      const rose = makeMaterial(0x995567, 0.36, { metalness: 0.22 });
      const brass = makeMaterial(0xd0a75c, 0.28, { metalness: 0.72 });
      const grille = makeMaterial(0x38252c, 0.52, { metalness: 0.25 });
      const glass = new THREE.MeshPhysicalMaterial({
        color: 0xf6d9cd,
        roughness: 0.16,
        metalness: 0.12,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      });
      const tubeMaterial = makeMaterial(0xffd49a, 0.24, {
        emissive: 0xff9f68,
        emissiveIntensity: 1.1,
      });
      const addPart = (name, geometry, material, position, rotation = [0, 0, 0]) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `${prefix}_${name}`;
        mesh.position.set(...position);
        mesh.rotation.set(...rotation);
        jukebox.add(mesh);
        return mesh;
      };
      addPart("body", new THREE.BoxGeometry(1.12, 1.68, 0.62), wood, [0, 0.86, 0])
        .userData.architecture = false;
      addPart("base-brass", new THREE.BoxGeometry(1.18, 0.1, 0.68), brass, [0, 0.05, 0]);
      addPart("lower-front", new THREE.BoxGeometry(1.02, 0.72, 0.055), rose, [0, 0.69, 0.326]);
      const grilleCenter = addPart("speaker-grille", new THREE.BoxGeometry(0.74, 0.42, 0.035), grille, [0, 0.69, 0.36]);
      grilleCenter.material = grille;
      for (let line = 0; line < 7; line += 1) {
        addPart(`speaker-line-${line}`, new THREE.BoxGeometry(0.68, 0.018, 0.018), brass, [0, 0.52 + line * 0.056, 0.384]);
      }
      const archShape = new THREE.Shape();
      archShape.moveTo(-0.57, 0);
      archShape.lineTo(-0.57, 0.6);
      archShape.bezierCurveTo(-0.57, 1.35, 0.57, 1.35, 0.57, 0.6);
      archShape.lineTo(0.57, 0);
      archShape.closePath();
      const arch = new THREE.Mesh(
        new THREE.ExtrudeGeometry(archShape, {
          depth: 0.6,
          bevelEnabled: true,
          bevelSegments: 2,
          bevelSize: 0.025,
          bevelThickness: 0.025,
        }),
        brass,
      );
      arch.name = `${prefix}_arched-brass-crown`;
      arch.position.set(0, 1.35, -0.3);
      arch.scale.y = 0.5;
      jukebox.add(arch);
      const crownInset = new THREE.Mesh(
        new THREE.ShapeGeometry(archShape),
        rose,
      );
      crownInset.name = `${prefix}_crown-inset`;
      crownInset.position.set(0, 1.35, 0.315);
      crownInset.scale.y = 0.5;
      jukebox.add(crownInset);
      const record = addPart(
        "vinyl",
        new THREE.CylinderGeometry(0.34, 0.34, 0.035, 24),
        grille,
        [0, 1.6, 0.36],
        [Math.PI / 2, 0, 0],
      );
      const recordLabel = addPart(
        "vinyl-label",
        new THREE.CylinderGeometry(0.09, 0.09, 0.04, 16),
        brass,
        [0, 1.6, 0.39],
        [Math.PI / 2, 0, 0],
      );
      const glassPanel = addPart(
        "vinyl-glass",
        new THREE.PlaneGeometry(0.82, 0.82),
        glass,
        [0, 1.6, 0.402],
      );
      glassPanel.renderOrder = 2;
      const tubeCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.45, 1.27, 0.38),
        new THREE.Vector3(-0.45, 1.65, 0.38),
        new THREE.Vector3(0, 1.93, 0.38),
        new THREE.Vector3(0.45, 1.65, 0.38),
        new THREE.Vector3(0.45, 1.27, 0.38),
      ]);
      const lightTube = addPart("glowing-arch-light", new THREE.TubeGeometry(tubeCurve, 24, 0.035, 6, false), tubeMaterial, [0, 0, 0]);
      const equalizerBars = [];
      for (let index = 0; index < 5; index += 1) {
        equalizerBars.push(addPart(
          `equalizer-${index}`,
          new THREE.BoxGeometry(0.055, 0.2, 0.04),
          tubeMaterial,
          [-0.28 + index * 0.14, 1.14, 0.4],
        ));
      }
      const floatingHearts = [];
      const heartGeometry = new THREE.ShapeGeometry(makeHeartShape());
      const particleMaterial = new THREE.MeshBasicMaterial({
        color: 0xffb3bc,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      for (let index = 0; index < 3; index += 1) {
        const particle = addPart(`music-heart-${index}`, heartGeometry, particleMaterial, [0, 1.9, 0.42]);
        particle.scale.setScalar(0.11);
        floatingHearts.push(particle);
      }
      const cabinetWidth = 1.19 * 0.8;
      const cabinetDepth = 0.68;
      const bounds = {
        width: Math.abs(Math.cos(rotationY)) * cabinetWidth + Math.abs(Math.sin(rotationY)) * cabinetDepth,
        depth: Math.abs(Math.sin(rotationY)) * cabinetWidth + Math.abs(Math.cos(rotationY)) * cabinetDepth,
      };
      addCollider(colliderRecord(
        `col_${prefix}`,
        "box",
        [x, floorY + 1, z],
        [bounds.width, 2, bounds.depth],
      ));
      decorAnimations.push({
        type: "jukebox",
        mesh: jukebox,
        record,
        recordLabel,
        lightTube,
        equalizerBars,
        floatingHearts,
        time: 0,
        playing: false,
      });
    } else if (prop.type === "piano") {
      addBox(parent, `${prefix}_body`, [2.4, 0.8, 0.92], [x, floorY + 0.48, z], woodMaterial, {
        name: `col_${prefix}`,
      });
      addBox(parent, `${prefix}_keyboard`, [1.7, 0.08, 0.34], [x, floorY + 0.9, z + 0.18], makeMaterial(0xf4eee2, 0.45), {
        name: `col_${prefix}_keys`,
      });
      addBox(parent, `${prefix}_lid`, [2.3, 0.08, 0.5], [x, floorY + 0.94, z - 0.23], brassMaterial);
      registerInteractable(room, {
        id: prefix,
        kind: "piano",
        label: "Play piano",
        position: [x, floorY, z + 1],
        slots: [[x - 0.48, floorY, z + 1], [x + 0.48, floorY, z + 1]],
        range: 1.7,
      });
    } else if (prop.type === "photoBooth") {
      addBox(parent, `${prefix}_back`, [1.6, 2.4, 0.16], [x, floorY + 1.2, z - 0.5], makeMaterial(0x8e5364, 0.72), {
        name: `col_${prefix}_back`,
      });
      for (const side of [-1, 1]) {
        addBox(parent, `${prefix}_side_${side}`, [0.14, 2.4, 1.1], [x + side * 0.73, floorY + 1.2, z], brassMaterial, {
          name: `col_${prefix}_side_${side}`,
        });
      }
      addBox(parent, `${prefix}_canopy`, [1.7, 0.14, 1.15], [x, floorY + 2.38, z], makeMaterial(0xead6c0, 0.72));
      registerInteractable(room, {
        id: prefix,
        kind: "photoBooth",
        label: "Take a photo",
        position: [x, floorY, z + 0.9],
        slots: [[x - 0.48, floorY, z + 0.9], [x + 0.48, floorY, z + 0.9]],
        range: 1.7,
      });
    } else if (prop.type === "memoryOrb") {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 12, 8),
        makeMaterial(0xffc9dc, 0.22, { emissive: 0x9b3b69, emissiveIntensity: 0.65, transparent: true, opacity: 0.82 }),
      );
      orb.name = `${prefix}_memory-orb`;
      orb.position.set(x, floorY + 1.35, z);
      parent.add(orb);
      registerInteractable(room, {
        id: prefix,
        kind: "memoryOrb",
        label: "Remember this",
        message: prop.message ?? "A little moment, kept close.",
        position: [x, floorY, z + 0.9],
        range: 1.6,
      }, [x, floorY + 1.35, z]);
    } else if (prop.type === "swing") {
      for (const side of [-1, 1]) {
        addCylinder(parent, `${prefix}_post_${side}`, 0.1, 0.12, 2.7, [x + side * 1.15, floorY + 1.35, z], woodMaterial, {
          name: `col_${prefix}_post_${side}`,
          radius: 0.15,
          height: 2.7,
        }, 8);
      }
      addBox(parent, `${prefix}_top`, [2.55, 0.14, 0.16], [x, floorY + 2.65, z], woodMaterial);
      for (const side of [-1, 1]) {
        addBox(parent, `${prefix}_chain_${side}`, [0.035, 1.7, 0.035], [x + side * 0.42, floorY + 1.73, z], brassMaterial);
      }
      const swingSeatY = INTERACTION_CONFIG.seating.seatHeight;
      addBox(parent, `${prefix}_seat`, [1.05, 0.12, 0.42], [x, floorY + swingSeatY - 0.06, z], woodMaterial, {
        name: `col_${prefix}_seat`,
      });
      for (const side of [-1, 1]) {
        const chain = parent.getObjectByName(`${prefix}_chain_${side}`);
        if (chain) {
          chain.scale.y = (2.65 - swingSeatY) / 1.7;
          chain.position.y = floorY + (2.65 + swingSeatY) / 2;
        }
      }
      addSeatSlots(parent, room, prefix, x, floorY, z, 2, 1.05, 0.42, 0);
    } else if (["blossoms", "balloons", "fireflies", "lanterns", "petals", "stringLights", "wallLights"].includes(prop.type)) {
      const count = prop.type === "stringLights" ? 18 : prop.type === "petals" ? 28 : prop.type === "blossoms" ? 18 : 10;
      const colors = {
        blossoms: 0xe9aebe,
        balloons: 0xef788a,
        fireflies: 0xd8f19a,
        lanterns: 0xffc87a,
        petals: 0xf0b1c2,
        stringLights: 0xffd18a,
        wallLights: 0xffd49a,
      };
      const bulbs = new THREE.InstancedMesh(
        new THREE.SphereGeometry(prop.type === "stringLights" ? 0.09 : 0.13, 6, 4),
        makeMaterial(colors[prop.type], 0.38, { emissive: colors[prop.type], emissiveIntensity: prop.type === "blossoms" ? 0.05 : 0.35 }),
        count,
      );
      bulbs.name = `${prefix}_${prop.type}_instanced`;
      const matrix = new THREE.Matrix4();
      const positions = [];
      for (let index = 0; index < count; index += 1) {
        let px = x;
        let py = floorY + 2.8;
        let pz = z;
        if (prop.type === "stringLights") {
          px = x - 8 + index * 16 / (count - 1);
          py = floorY + 5.7 - Math.sin((index / (count - 1)) * Math.PI) * 0.8;
        } else if (prop.type === "blossoms") {
          px = x + Math.cos(index * 2.4) * (1.2 + (index % 3) * 0.25);
          py = floorY + 3.8 + (index % 4) * 0.48;
          pz = z + Math.sin(index * 2.4) * 1.2;
        } else if (prop.type === "balloons") {
          px = x + ((index % 4) - 1.5) * 0.32;
          py = floorY + 2.2 + (index % 3) * 0.45;
          pz = z + Math.floor(index / 4) * 0.28;
        } else {
          px = x + Math.cos(index * 2.4) * (0.6 + (index % 2) * 0.35);
          py = floorY + 1.8 + (index % 4) * 0.48;
          pz = z + Math.sin(index * 2.4) * (0.6 + (index % 2) * 0.35);
        }
        positions.push([px, py, pz]);
        const scale = prop.type === "stringLights" ? 1 : 0.7 + (index % 3) * 0.15;
        matrix.compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
        bulbs.setMatrixAt(index, matrix);
      }
      bulbs.instanceMatrix.needsUpdate = true;
      parent.add(bulbs);
      if (["fireflies", "lanterns", "petals"].includes(prop.type)) {
        decorAnimations.push({ type: prop.type, mesh: bulbs, positions, time: 0 });
      }
    } else {
      addCylinder(parent, `${prefix}_plinth`, 0.38, 0.48, 1.4, [x, floorY + 0.7, z], brassMaterial, {
        name: `col_${prefix}`,
        radius: 0.48,
        height: 1.4,
      });
      addCylinder(parent, `${prefix}_statue`, 0.28, 0.3, 0.68, [x, floorY + 1.72, z], stoneMaterial);
    }
  }

  function loadRoom(room) {
    if (room.loaded || room.locked) return;
    room.loaded = true;
    room.group.visible = true;
    if (room.shell) room.shell.visible = true;
    for (const frame of room.frames ?? []) createFrame(frame);
    for (const heartConfig of MUSEUM_CONFIG.hearts.filter((heart) => heart.roomId === room.id)) {
      createCollectibleHeart(room, heartConfig);
    }
    // Keep dynamic shadow casting limited to characters; floors and carpets are the only room receivers.
    for (const section of [room.shell, room.group]) {
      section?.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = false;
        if (object.userData.architecture) {
          object.castShadow = architectureShadowSettings.casts;
          object.receiveShadow = architectureShadowSettings.receives;
        } else {
          object.receiveShadow = Boolean(object.userData.shadowReceiver);
        }
      });
    }
  }

  function loadRoomById(roomId) {
    const room = rooms.find((item) => item.id === roomId);
    if (!room || room.locked) return false;
    loadRoom(room);
    room.group.visible = true;
    if (room.shell) room.shell.visible = true;
    for (const collider of room.colliders) collider.enabled = true;
    return true;
  }

  function loadRoomsAtPosition(position) {
    let loaded = false;
    for (const room of rooms) {
      if (room.locked) continue;
      const bounds = room.config.bounds;
      if (
        position.x >= bounds.xMin && position.x <= bounds.xMax &&
        position.z >= bounds.zMin && position.z <= bounds.zMax
      ) loaded = loadRoomById(room.id) || loaded;
    }
    return loaded;
  }

  function createFrame(frame) {
    if (frame.object) return;
    const data = frame.config;
    const height = data.height ?? APP_CONFIG.frameHeight;
    const width = height * (data.aspectRatio ?? 4 / 3);
    const border = THREE.MathUtils.clamp(
      height * APP_CONFIG.frameBorderRatio,
      APP_CONFIG.frameMinBorder,
      APP_CONFIG.frameMaxBorder,
    );
    const style = FRAME_STYLES[data.style] ?? FRAME_STYLES.gold;
    const frameMaterial = makeMaterial(style.color, style.roughness, {
      metalness: style.metalness,
      emissive: style.emissive,
      emissiveIntensity: 0.06,
    });
    const insetMaterial = makeMaterial(0xe4c176, 0.24, { metalness: 0.7 });
    const frameGroup = new THREE.Group();
    frameGroup.name = `frame_${data.id}`;
    frameGroup.position.set(...data.position);
    frameGroup.rotation.y = data.rotationY ?? 0;
    frame.room.group.add(frameGroup);

    const outerWidth = width + border * 2;
    const outerHeight = height + border * 2;
    const frameBase = new THREE.Mesh(new THREE.BoxGeometry(outerWidth, outerHeight, 0.13), frameMaterial);
    frameBase.name = `frameBase_${data.id}`;
    frameBase.castShadow = true;
    frameGroup.add(frameBase);
    const artworkMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });
    const artworkGeometry = new THREE.PlaneGeometry(width, height);
    const artwork = new THREE.Mesh(artworkGeometry, artworkMaterial);
    artwork.name = `frameArtwork_${data.id}`;
    artwork.position.set(0, 0, 0.18);
    artwork.renderOrder = 1;
    frameGroup.add(artwork);
    if (data.pictureLight !== false && data.sizeClass === "hero") {
      const wash = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 1.08, height * 1.08),
        pictureWashMaterial,
      );
      wash.name = `framePictureWash_${data.id}`;
      wash.position.set(0, 0, 0.077);
      wash.renderOrder = 2;
      frameGroup.add(wash);
    }
    for (const side of [-1, 1]) {
      const verticalRail = new THREE.Mesh(
        new THREE.BoxGeometry(border, height + border * 2, 0.1),
        frameMaterial,
      );
      verticalRail.position.set(side * (width / 2 + border / 2), 0, 0.105);
      verticalRail.castShadow = true;
      frameGroup.add(verticalRail);
      const horizontalRail = new THREE.Mesh(
        new THREE.BoxGeometry(width, border, 0.1),
        frameMaterial,
      );
      horizontalRail.position.set(0, side * (height / 2 + border / 2), 0.105);
      horizontalRail.castShadow = true;
      frameGroup.add(horizontalRail);
      const insetVertical = new THREE.Mesh(
        new THREE.BoxGeometry(border * 0.18, height, 0.025),
        insetMaterial,
      );
      insetVertical.position.set(side * (width / 2 + border * 0.38), 0, 0.164);
      frameGroup.add(insetVertical);
      const insetHorizontal = new THREE.Mesh(
        new THREE.BoxGeometry(width, border * 0.18, 0.025),
        insetMaterial,
      );
      insetHorizontal.position.set(0, side * (height / 2 + border * 0.38), 0.164);
      frameGroup.add(insetHorizontal);
    }
    const cornerGeometry = new THREE.SphereGeometry(border * 0.18, 8, 6);
    for (const sideX of [-1, 1]) {
      for (const sideY of [-1, 1]) {
        const ornament = new THREE.Mesh(cornerGeometry, insetMaterial);
        ornament.name = `frameCorner_${data.id}_${sideX}_${sideY}`;
        ornament.position.set(
          sideX * (width / 2 + border * 0.5),
          sideY * (height / 2 + border * 0.5),
          0.17,
        );
        frameGroup.add(ornament);
      }
    }
    const plaqueWidth = Math.min(1.35, Math.max(0.72, width * 0.34));
    const plaqueHeight = 0.2;
    const plaqueY = -outerHeight / 2 - 0.16;
    const plaqueMaterial = makeMaterial(WORLD_CONFIG.architecture.picturePlaqueColor, 0.42, {
      metalness: 0.2,
    });
    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(plaqueWidth, plaqueHeight, 0.06),
      plaqueMaterial,
    );
    plaque.name = `frameNameplate_${data.id}`;
    plaque.position.set(0, plaqueY, 0.1);
    frameGroup.add(plaque);
    const plaqueTexture = createNameplateTexture(data.caption, data.date);
    if (plaqueTexture) {
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(plaqueWidth * 0.9, plaqueHeight * 0.72),
        new THREE.MeshBasicMaterial({ map: plaqueTexture, transparent: true, toneMapped: false }),
      );
      label.name = `frameNameplateText_${data.id}`;
      label.position.set(0, plaqueY, 0.132);
      frameGroup.add(label);
    }
    if (data.pictureLight !== false) {
      const lightBody = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(width * 0.48, 1.8), 0.055, 0.12),
        makeMaterial(WORLD_CONFIG.architecture.pictureLightColor, 0.28, {
          emissive: WORLD_CONFIG.architecture.pictureLightColor,
          emissiveIntensity: 1.1,
          metalness: 0.42,
        }),
      );
      lightBody.name = `framePictureLight_${data.id}`;
      lightBody.position.set(0, outerHeight / 2 + 0.08, 0.2);
      frameGroup.add(lightBody);
      frameLights.push(lightBody.material);
    }
    frame.object = frameGroup;
    frame.thumbnailPath = data.thumbnailPath ?? data.posterPath ?? data.path;
    frame.artworkMaterial = artworkMaterial;
    if (typeof document !== "undefined") {
      frameTextureLoader ??= new THREE.TextureLoader();
      frameTextureLoader.load(
        frame.thumbnailPath,
        (texture) => {
          const prepared = prepareFrameTexture(texture);
          frame.textureDownsampled = prepared.downsampled;
          artworkMaterial.map = prepared.texture;
          artworkMaterial.needsUpdate = true;
        },
        undefined,
        (error) => console.warn(`Could not load museum frame thumbnail: ${frame.thumbnailPath}`, error),
      );
    }

    if (data.mediaType === "video" && typeof document !== "undefined") {
      const video = document.createElement("video");
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "none";
      video.crossOrigin = "anonymous";
      video.addEventListener("loadeddata", () => {
        frame.videoTexture = new THREE.VideoTexture(video);
        frame.videoTexture.colorSpace = THREE.SRGBColorSpace;
        artworkMaterial.map = frame.videoTexture;
        artworkMaterial.needsUpdate = true;
      }, { once: true });
      video.addEventListener("error", () => {
        frame.videoFailed = true;
        console.warn(`Could not load museum video: ${data.path}`, video.error);
      }, { once: true });
      frame.video = video;
    }

    const frameDepth = 0.24;
    const frameCollisionSize = Math.abs(Math.sin(data.rotationY ?? 0)) > 0.5
      ? [frameDepth, outerHeight, outerWidth]
      : [outerWidth, outerHeight, frameDepth];
    frame.collider = addCollider(colliderRecord(
      `col_frame_${data.id}`,
      "box",
      [
        data.position[0] - Math.sin(data.rotationY ?? 0) * 0.08,
        data.position[1],
        data.position[2] - Math.cos(data.rotationY ?? 0) * 0.08,
      ],
      frameCollisionSize,
      { solid: true, height: outerHeight },
    ));
    frame.room.colliders.push(frame.collider);
  }

  function createNameplateTexture(caption, date) {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = `#${WORLD_CONFIG.architecture.picturePlaqueColor.toString(16).padStart(6, "0")}`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#d0ad66";
    context.lineWidth = 5;
    context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    context.fillStyle = "#f4e3bf";
    context.font = "600 34px Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(caption ?? "A memory"), canvas.width / 2, 38, canvas.width - 24);
    context.fillStyle = "#d8c49f";
    context.font = "24px Georgia, serif";
    context.fillText(String(date ?? ""), canvas.width / 2, 72, canvas.width - 24);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function createCollectibleHeart(room, heartConfig) {
    if (collectedHearts.has(heartConfig.id)) return;
    const geometry = new THREE.ExtrudeGeometry(makeHeartShape(), {
      depth: 0.12,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.025,
      bevelThickness: 0.02,
    });
    const heartGroup = new THREE.Group();
    heartGroup.name = `collectible_${heartConfig.id}`;
    heartGroup.position.set(...heartConfig.position);
    heartGroup.scale.setScalar(0.34);
    heartGroup.rotation.y = Math.PI / 6;
    const heart = new THREE.Mesh(
      geometry,
      makeMaterial(WORLD_CONFIG.collectibleHeartColor, 0.28, {
        emissive: WORLD_CONFIG.collectibleHeartEmissive,
        emissiveIntensity: 0.8,
      }),
    );
    heart.name = `collectibleHeart_${heartConfig.id}`;
    heart.renderOrder = 4;
    heart.castShadow = true;
    heartGroup.add(heart);
    const outline = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0xfff1b7,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.96,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    outline.name = `collectibleOutline_${heartConfig.id}`;
    outline.position.z = -0.02;
    outline.scale.setScalar(1.2);
    outline.renderOrder = 3;
    heartGroup.add(outline);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.73, 0.82, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffd979,
        transparent: true,
        opacity: 0.52,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    halo.name = `collectibleHalo_${heartConfig.id}`;
    halo.position.z = -0.08;
    halo.renderOrder = 2;
    heartGroup.add(halo);
    const sparkleCount = LIGHTING_CONFIG.qualityTiers[qualityTier]?.dust ? 8 : 0;
    const sparkles = sparkleCount
      ? new THREE.InstancedMesh(
        new THREE.OctahedronGeometry(0.055, 0),
        new THREE.MeshBasicMaterial({ color: 0xfff1c1, transparent: true, opacity: 0.92, toneMapped: false }),
        sparkleCount,
      )
      : null;
    if (sparkles) {
      sparkles.name = `collectibleSparkles_${heartConfig.id}`;
      sparkles.visible = Boolean(lightingEffects.dust);
      heartGroup.add(sparkles);
    }
    room.group.add(heartGroup);
    const record = {
      id: heartConfig.id,
      room,
      config: heartConfig,
      object: heartGroup,
      heart,
      outline,
      halo,
      sparkles,
      collected: false,
    };
    record.collider = addCollider(colliderRecord(
      `trigger_${heartConfig.id}`,
      "cylinder",
      heartConfig.position,
      undefined,
      { radius: 0.8, height: 1.6, solid: false, trigger: true },
    ));
    room.colliders.push(record.collider);
    hearts.push(record);
  }

  function setHeartCollected(id) {
    const heartConfig = MUSEUM_CONFIG.hearts.find((item) => item.id === id);
    if (!heartConfig || collectedHearts.has(id)) return false;
    collectedHearts.add(id);
    const heart = hearts.find((item) => item.id === id);
    if (heart) {
      createHeartBurst(heart);
      heart.collected = true;
      heart.object.visible = false;
      if (heart.collider) {
        heart.collider.enabled = false;
        const colliderIndex = colliders.indexOf(heart.collider);
        if (colliderIndex >= 0) colliders.splice(colliderIndex, 1);
        const roomColliderIndex = heart.room.colliders.indexOf(heart.collider);
        if (roomColliderIndex >= 0) heart.room.colliders.splice(roomColliderIndex, 1);
        if (heart.collider.debugMesh) {
          debugGroup.remove(heart.collider.debugMesh);
          heart.collider.debugMesh.geometry.dispose();
          heart.collider.debugMesh.material.dispose();
        }
      }
    }
    if (MUSEUM_CONFIG.hearts.every((item) => collectedHearts.has(item.id))) {
      revealSecretRoom(true);
    }
    return true;
  }

  function createHeartBurst(heart) {
    const group = new THREE.Group();
    group.name = `heart-collect-burst_${heart.id}`;
    group.position.set(...heart.config.position);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.34, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffd77e,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    ring.name = `heart-collect-ring_${heart.id}`;
    group.add(ring);
    const count = qualityTier === "Low" ? 6 : 16;
    const particles = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.045, 0),
      new THREE.MeshBasicMaterial({
        color: 0xffe6a3,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        toneMapped: false,
      }),
      count,
    );
    particles.name = `heart-collect-particles_${heart.id}`;
    group.add(particles);
    heart.room.group.add(group);
    heartBursts.push({
      group,
      ring,
      particles,
      elapsed: 0,
      duration: 0.78,
      velocities: Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2;
        const elevation = 0.45 + (index % 3) * 0.2;
        return [Math.cos(angle) * 0.92, elevation, Math.sin(angle) * 0.92];
      }),
    });
  }

  function removeSecretGateCollider() {
    if (!secretGate || secretGate.colliderRemoved) return;
    const colliderIndex = colliders.indexOf(secretGate.collider);
    if (colliderIndex >= 0) colliders.splice(colliderIndex, 1);
    if (secretGate.collider.debugMesh) {
      debugGroup.remove(secretGate.collider.debugMesh);
      secretGate.collider.debugMesh.geometry.dispose();
      secretGate.collider.debugMesh.material.dispose();
    }
    secretGate.colliderRemoved = true;
  }

  function disposeSecretGateResources() {
    if (!secretGate) return;
    const geometries = new Set();
    const materials = new Set();
    const lights = [];
    if (secretGate.effects) {
      secretGate.effects.group.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (Array.isArray(object.material)) {
          for (const material of object.material) materials.add(material);
        } else if (object.material) {
          materials.add(object.material);
        }
        if (object.isLight) lights.push(object);
      });
      secretGate.effects.group.removeFromParent();
      secretGate.effects = null;
    }
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const light of lights) {
      light.removeFromParent();
      light.dispose?.();
    }
    secretGate.mesh.geometry.dispose();
    secretGate.material.dispose();
  }

  function finishSecretRoomReveal() {
    removeSecretGateCollider();
    secretGate.mesh.visible = false;
    secretGate.pending = false;
    secretGate.revealing = false;
    secretGate.material.opacity = 0;
    secretGate.mesh.position.copy(secretGate.basePosition);
    disposeSecretGateResources();
  }

  function startSecretGateAnimation(position) {
    const gate = secretGate;
    gate.pending = false;
    gate.revealing = true;
    gate.revealedAt = 0;
    gate.mesh.position.copy(gate.basePosition);
    gate.material.transparent = true;
    gate.material.depthWrite = true;
    gate.material.opacity = 1;
    gate.material.emissive?.set(0xff4f93);
    gate.material.emissiveIntensity = 0;
    const playerSide = gate.horizontal
      ? position.z - gate.basePosition.z
      : position.x - gate.basePosition.x;
    const burstDirection = Math.sign(playerSide) || 1;

    const group = new THREE.Group();
    group.name = "secret-gate-unlock-effects";
    group.position.copy(gate.basePosition);
    const normalOffset = (gate.collider.size?.[gate.horizontal ? 2 : 0] ?? 0.28) / 2 + 0.04;
    if (gate.horizontal) group.position.z += burstDirection * normalOffset;
    else group.position.x += burstDirection * normalOffset;
    group.rotation.y = gate.horizontal ? 0 : Math.PI / 2;
    const ringMaterials = [
      new THREE.MeshBasicMaterial({
        color: 0xff75b9,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      }),
      new THREE.MeshBasicMaterial({
        color: 0xffb0d6,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      }),
    ];
    const rings = ringMaterials.map((material, index) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 40), material);
      ring.name = `secret-gate-charge-ring-${index + 1}`;
      ring.position.y = index * 0.12;
      ring.scale.setScalar(0.12);
      group.add(ring);
      return ring;
    });
    const light = new THREE.PointLight(0xff65a8, 0, 9, 2);
    light.name = "secret-gate-unlock-light";
    light.position.y = 0.25;
    group.add(light);

    const heartGeometry = new THREE.ExtrudeGeometry(makeHeartShape(), {
      depth: 0.08,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.035,
      bevelThickness: 0.025,
    });
    heartGeometry.translate(0, -0.25, 0);
    const heartMaterial = new THREE.MeshStandardMaterial({
      color: 0xff79ad,
      emissive: 0xe93678,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const hearts = Array.from({ length: 28 }, (_, index) => {
      const heart = new THREE.Mesh(heartGeometry, heartMaterial);
      heart.name = `secret-gate-burst-heart-${index + 1}`;
      heart.visible = false;
      heart.scale.setScalar(0.16 + (index % 3) * 0.015);
      heart.userData.origin = new THREE.Vector3(
        (Math.random() - 0.5) * 0.38,
        (Math.random() - 0.5) * 0.3,
        0,
      );
      heart.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2.6,
        1.2 + Math.random() * 2.5,
        burstDirection * (1.8 + Math.random() * 2.4),
      );
      heart.userData.spin = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 7,
      );
      heart.userData.initialScale = heart.scale.x;
      group.add(heart);
      return heart;
    });
    gate.mesh.parent.add(group);
    gate.effects = { group, rings, ringMaterials, light, hearts, heartMaterial };
  }

  function updateSecretGateAnimation(delta) {
    const gate = secretGate;
    const effects = gate.effects;
    gate.revealedAt += delta;
    const elapsed = gate.revealedAt;
    const charge = THREE.MathUtils.clamp(elapsed, 0, 1);
    gate.material.emissiveIntensity = 2.2 * charge;
    const shake = Math.sin(elapsed * 58) * 0.025 * (1 - charge);
    gate.mesh.position.copy(gate.basePosition);
    if (gate.horizontal) gate.mesh.position.z += shake;
    else gate.mesh.position.x += shake;
    effects.light.intensity = 4 * Math.sin(Math.PI * charge);
    effects.rings[0].scale.setScalar(0.12 + charge * 2.15);
    effects.ringMaterials[0].opacity = 0.72 * (1 - charge);
    const secondRingProgress = THREE.MathUtils.clamp((charge - 0.18) / 0.82, 0, 1);
    effects.rings[1].scale.setScalar(0.12 + secondRingProgress * 2.15);
    effects.ringMaterials[1].opacity = 0.58 * (1 - secondRingProgress);

    if (elapsed >= 0.5) {
      const burstProgress = THREE.MathUtils.clamp((elapsed - 0.5) / 2.1, 0, 1);
      effects.heartMaterial.opacity = 1 - burstProgress;
      for (const heart of effects.hearts) {
        heart.visible = burstProgress < 1;
        if (!heart.visible) continue;
        const age = elapsed - 0.5;
        heart.position.copy(heart.userData.origin)
          .addScaledVector(heart.userData.velocity, age);
        heart.position.y -= 1.7 * age * age;
        heart.rotation.x = heart.userData.spin.x * age;
        heart.rotation.y = heart.userData.spin.y * age;
        heart.rotation.z = heart.userData.spin.z * age;
        heart.scale.setScalar(heart.userData.initialScale * (1 - burstProgress));
      }
    }

    if (elapsed >= 1) {
      removeSecretGateCollider();
      const openProgress = THREE.MathUtils.clamp((elapsed - 1) / 1.5, 0, 1);
      const easedOpen = openProgress * openProgress * (3 - 2 * openProgress);
      gate.mesh.position.copy(gate.basePosition);
      gate.mesh.position.y += Math.min(gate.collider.size?.[1] ?? 4.2, 4.2) * easedOpen;
      gate.material.depthWrite = false;
      gate.material.opacity = 1 - THREE.MathUtils.clamp((openProgress - 0.65) / 0.35, 0, 1);
    }

    if (elapsed >= 3.2) finishSecretRoomReveal();
  }

  function revealSecretRoom(animated = false) {
    if (!secretGate || secretGate.revealed) return false;
    secretRevealed = true;
    secretGate.revealed = true;
    for (const room of rooms) {
      if (!room.config.hiddenUntilRevealed) continue;
      room.locked = false;
      if (room.shell) room.shell.visible = true;
    }
    if (animated) {
      secretGate.pending = true;
    } else {
      finishSecretRoomReveal();
    }
    return true;
  }

  function update(position, delta) {
    const setRoomCollidersEnabled = (room, enabled) => {
      for (const collider of room.colliders ?? []) collider.enabled = enabled;
    };
    if (secretRevealed && secretGate && !secretGate.revealed) revealSecretRoom();
    if (secretGate?.pending) {
      const distance = Math.hypot(
        position.x - secretGate.basePosition.x,
        position.y - secretGate.basePosition.y,
        position.z - secretGate.basePosition.z,
      );
      if (distance <= 12) startSecretGateAnimation(position);
    }
    if (secretGate?.revealing) {
      updateSecretGateAnimation(delta);
    }
    for (const panel of skylightPanels) {
      if (!panel.revealing) continue;
      panel.elapsed += delta;
      const progress = THREE.MathUtils.clamp(panel.elapsed / 1.8, 0, 1);
      panel.mesh.position.y = panel.startY + progress * 2.2;
      panel.mesh.material.opacity = panel.startOpacity * (1 - progress);
      if (progress === 1) panel.mesh.visible = false;
    }
    const playerRoomIds = new Set(
      rooms
        .filter(({ config }) => {
          const { xMin, xMax, zMin, zMax } = config.bounds;
          return position.x >= xMin - 1.5 && position.x <= xMax + 1.5 &&
            position.z >= zMin - 1.5 && position.z <= zMax + 1.5;
        })
        .map((room) => room.id),
    );
    const doorwayNeighborIds = new Set();
    for (const archway of MUSEUM_CONFIG.archways) {
      if (playerRoomIds.has(archway.from)) doorwayNeighborIds.add(archway.to);
      if (playerRoomIds.has(archway.to)) doorwayNeighborIds.add(archway.from);
    }
    for (const room of rooms) {
      if (room.locked) continue;
      const dx = position.x - room.center[0];
      const dz = position.z - room.center[1];
      const dy = position.y - room.floorY;
      const distance = Math.hypot(dx, dz, dy * 0.45);
      const connectedThroughDoorway = doorwayNeighborIds.has(room.id);
      if (!room.loaded && (connectedThroughDoorway || distance <= room.loadRadius)) {
        loadRoom(room);
        setRoomCollidersEnabled(room, true);
      }
      else if (
        room.loaded &&
        !connectedThroughDoorway &&
        distance > room.loadRadius + INTERACTION_CONFIG.roomUnloadPadding
      ) {
        room.group.visible = false;
        setRoomCollidersEnabled(room, false);
        for (const frame of room.frames ?? []) frame.video?.pause();
      } else if (room.loaded) {
        room.group.visible = true;
        if (room.shell) room.shell.visible = true;
        setRoomCollidersEnabled(room, true);
      }
    }

    for (const room of rooms) {
      if (!room.loaded || !room.group.visible) continue;
      for (const frame of room.frames ?? []) {
        if (
          frame.config.mediaType === "image" &&
          (frame.config.path !== frame.thumbnailPath || frame.textureDownsampled) &&
          !frame.fullResolutionRequested &&
          frameTextureLoader
        ) {
          const imageDistance = Math.hypot(
            position.x - frame.config.position[0],
            position.y - frame.config.position[1],
            position.z - frame.config.position[2],
          );
          if (imageDistance <= INTERACTION_CONFIG.mediaFullResolutionDistance) {
            frame.fullResolutionRequested = true;
            frameTextureLoader.load(
              frame.config.path,
              (texture) => {
                const prepared = prepareFrameTexture(texture);
                frame.artworkMaterial.map?.dispose();
                frame.textureDownsampled = prepared.downsampled;
                frame.artworkMaterial.map = prepared.texture;
                frame.artworkMaterial.needsUpdate = true;
              },
              undefined,
              (error) => console.warn(`Could not load full museum frame media: ${frame.config.path}`, error),
            );
          }
        }
        if (!frame.video) continue;
        const distance = Math.hypot(
          position.x - frame.config.position[0],
          position.y - frame.config.position[1],
          position.z - frame.config.position[2],
        );
        if (distance <= INTERACTION_CONFIG.videoPlayDistance) {
          if (!frame.videoRequested) {
            frame.video.src = frame.config.path;
            frame.video.load();
            frame.videoRequested = true;
          }
          if (frame.video.paused && !frame.videoFailed) {
            frame.video.play().catch((error) => console.warn(`Could not play museum video: ${frame.config.path}`, error));
          }
        } else if (!frame.video.paused) {
          frame.video.pause();
        }
      }
    }

    for (const heart of hearts) {
      if (!heart.collected && heart.room.group.visible) {
        heart.object.rotation.y += delta * 0.5;
        const time = performance.now() * 0.0015 + heart.config.position[0];
        heart.object.position.y = heart.config.position[1] + Math.sin(time) * 0.08;
        const pulse = 1 + Math.sin(time * 1.3) * 0.045;
        heart.object.scale.setScalar(0.34 * pulse);
        heart.halo.material.opacity = 0.4 + (Math.sin(time * 1.3) + 1) * 0.12;
        if (heart.sparkles?.visible) {
          for (let index = 0; index < heart.sparkles.count; index += 1) {
            const angle = time * 0.5 + (index / heart.sparkles.count) * Math.PI * 2;
            const radius = 0.84 + Math.sin(time * 1.8 + index) * 0.06;
            animationMatrix.compose(
              animationPosition.set(
                Math.cos(angle) * radius,
                Math.sin(time * 1.2 + index * 1.7) * 0.92,
                Math.sin(angle) * radius,
              ),
              animationQuaternion,
              animationScale.setScalar(0.45 + (Math.sin(time * 2 + index) + 1) * 0.25),
            );
            heart.sparkles.setMatrixAt(index, animationMatrix);
          }
          heart.sparkles.instanceMatrix.needsUpdate = true;
        }
      }
    }
    for (let index = heartBursts.length - 1; index >= 0; index -= 1) {
      const burst = heartBursts[index];
      burst.elapsed += delta;
      const progress = THREE.MathUtils.clamp(burst.elapsed / burst.duration, 0, 1);
      burst.ring.scale.setScalar(1 + progress * 2.8);
      burst.ring.material.opacity = 0.9 * (1 - progress);
      for (const [particle, [vx, vy, vz]] of burst.velocities.entries()) {
        animationMatrix.compose(
          animationPosition.set(vx * progress, vy * progress - progress * progress * 0.55, vz * progress),
          animationQuaternion,
          animationScale.setScalar(Math.max(0.01, 1 - progress)),
        );
        burst.particles.setMatrixAt(particle, animationMatrix);
      }
      burst.particles.material.opacity = 1 - progress;
      burst.particles.instanceMatrix.needsUpdate = true;
      if (progress < 1) continue;
      burst.group.parent?.remove(burst.group);
      burst.ring.geometry.dispose();
      burst.ring.material.dispose();
      burst.particles.geometry.dispose();
      burst.particles.material.dispose();
      heartBursts.splice(index, 1);
    }
    for (const effect of roomLighting) {
      if (effect.shaft.visible && isVisibleInScene(effect.group)) effect.shaft.rotation.y += delta * 0.018;
    }
    for (const animation of decorAnimations) {
      if (animation.type !== "dome" && !isVisibleInScene(animation.mesh ?? animation.stems)) continue;
      if (qualityTier === "Low" && animation.type === "flowers") continue;
      animation.time += delta;
      if (animation.type === "dome") {
        animation.material.color.setHSL(0.69 + Math.sin(animation.time * 0.035) * 0.04, 0.38, 0.18);
        continue;
      }
      if (animation.type === "jukebox") {
        const pulse = animation.playing ? 0.9 + (Math.sin(animation.time * 2.4) + 1) * 0.15 : 0.24;
        animation.lightTube.material.emissiveIntensity = pulse;
        animation.record.rotation.z += delta * (animation.playing ? 0.82 : 0.03);
        animation.recordLabel.rotation.z = animation.record.rotation.z;
        animation.equalizerBars.forEach((bar, index) => {
          const height = animation.playing
            ? 0.11 + (Math.sin(animation.time * 8 + index * 1.7) + 1) * 0.11
            : 0.055;
          bar.scale.y = height / 0.2;
          bar.position.y = 1.14 + height / 2;
          bar.material.emissiveIntensity = animation.playing ? 0.95 : 0.2;
        });
        animation.floatingHearts.forEach((heart, index) => {
          const phase = animation.time * 1.2 + index * 2.1;
          heart.visible = animation.playing && Math.sin(phase) > -0.75;
          heart.position.set(
            Math.sin(phase * 0.7) * 0.34,
            1.9 + ((phase % (Math.PI * 2)) / (Math.PI * 2)) * 0.35,
            0.42,
          );
          heart.rotation.z = Math.sin(phase) * 0.28;
        });
        continue;
      }
      if (animation.type === "flowers") {
        for (const [index, flower] of animation.positions.entries()) {
          const sway = Math.sin(animation.time * 0.9 + index * 0.8) * 0.035;
          animationQuaternion.setFromEuler(animationEuler.set(0, 0, sway));
          animationMatrix.compose(
            animationPosition.set(flower.x, flower.y - 0.21, flower.z),
            animationQuaternion,
            animationScale.set(1, 1, 1),
          );
          animation.stems.setMatrixAt(index, animationMatrix);
          for (const side of [-1, 1]) {
            animationQuaternion.setFromEuler(animationEuler.set(0, 0, side * 0.8 + sway));
            animationMatrix.compose(
              animationPosition.set(flower.x + side * 0.04, flower.y - 0.34, flower.z),
              animationQuaternion,
              animationScale.set(0.065, 0.022, 0.024),
            );
            animation.leaves.setMatrixAt(index * 2 + (side > 0 ? 1 : 0), animationMatrix);
          }
        }
        animation.stems.instanceMatrix.needsUpdate = true;
        animation.leaves.instanceMatrix.needsUpdate = true;
        for (const { mesh, flowerIndices } of animation.petalMeshes) {
          let instance = 0;
          for (const flowerIndex of flowerIndices) {
            const flower = animation.positions[flowerIndex];
            const sway = Math.sin(animation.time * 0.9 + flowerIndex * 0.8) * 0.035;
            animationQuaternion.setFromEuler(animationEuler.set(0, 0, sway));
            for (let petal = 0; petal < 3; petal += 1) {
              const angle = (petal * Math.PI * 2) / 3;
              animationPosition.set(
                flower.x + Math.cos(angle) * 0.026,
                flower.y,
                flower.z + Math.sin(angle) * 0.026,
              );
              animationMatrix.compose(
                animationPosition,
                animationQuaternion,
                animationScale.set(0.78, 1.18, 0.78),
              );
              mesh.setMatrixAt(instance++, animationMatrix);
            }
          }
          mesh.instanceMatrix.needsUpdate = true;
        }
        continue;
      }
      for (let index = 0; index < animation.positions.length; index += 1) {
        const [x, y, z] = animation.positions[index];
        const phase = animation.time * (animation.type === "petals" ? 0.7 : 1.1) + index * 0.8;
        if (animation.type === "dust") {
          animationMatrix.makeTranslation(x + Math.sin(phase * 0.4) * 0.12, y + Math.sin(phase) * 0.06, z + Math.cos(phase * 0.35) * 0.12);
          animation.mesh.setMatrixAt(index, animationMatrix);
          continue;
        }
        const bob = animation.type === "petals" ? Math.sin(phase) * 0.18 : Math.sin(phase) * 0.12;
        const drift = animation.type === "petals" ? Math.sin(phase * 0.6) * 0.2 : 0;
        const size = animation.type === "fireflies" ? 0.55 + (Math.sin(phase) + 1) * 0.28 : 1;
        animationMatrix.compose(
          animationPosition.set(x + drift, y + bob, z),
          animationQuaternion,
          animationScale.setScalar(size),
        );
        animation.mesh.setMatrixAt(index, animationMatrix);
      }
      animation.mesh.instanceMatrix.needsUpdate = true;
    }

    if (debug) {
      for (const collider of colliders) {
        if (collider.debugMesh) collider.debugMesh.position.set(...collider.center);
      }
    }
  }

  function getGroundHeight() {
    return MUSEUM_CONFIG.architecture.atrium.floorY;
  }

  function setJukeboxPlaying(playing) {
    for (const animation of decorAnimations) {
      if (animation.type === "jukebox") animation.playing = Boolean(playing);
    }
  }

  function scanCoplanarArchitecture({ includeHorizontalCaps = false } = {}) {
    worldRoot.updateMatrixWorld(true);
    const candidates = architectureMeshes
      .filter((mesh) => mesh.geometry?.type === "BoxGeometry")
      .map((mesh) => ({ mesh, bounds: new THREE.Box3().setFromObject(mesh) }));
    const meshesByRoom = new Map();
    for (const { mesh } of candidates) {
      const roomMeshes = meshesByRoom.get(mesh.userData.roomId) ?? [];
      roomMeshes.push(mesh);
      meshesByRoom.set(mesh.userData.roomId, roomMeshes);
    }
    const raycaster = new THREE.Raycaster();
    const point = new THREE.Vector3();
    const normalVector = new THREE.Vector3();
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const hasVisibleCoplanarFaces = (a, b, normal, face, tangent, firstOverlap, secondOverlap, plane) => {
      point.set(0, 0, 0);
      point[normal] = plane;
      point[tangent[0]] = firstOverlap.center;
      point[tangent[1]] = secondOverlap.center;
      normalVector.set(0, 0, 0);
      normalVector[normal] = face === "min" ? -1 : 1;
      origin.copy(point).addScaledVector(normalVector, 0.02);
      direction.copy(normalVector).negate();
      raycaster.set(origin, direction);
      raycaster.near = 0.001;
      raycaster.far = 0.05;
      const testMeshes = [...new Set([
        ...(meshesByRoom.get(a.mesh.userData.roomId) ?? []),
        ...(meshesByRoom.get(b.mesh.userData.roomId) ?? []),
      ])];
      const hits = raycaster.intersectObjects(testMeshes, false);
      if (!hits.length) return false;
      const nearest = hits[0].distance;
      const coincidentHits = hits
        .filter((hit) => Math.abs(hit.distance - nearest) <= 0.005)
        .map((hit) => hit.object);
      return coincidentHits.includes(a.mesh) && coincidentHits.includes(b.mesh);
    };
    const overlaps = [];
    const axes = [
      { normal: "x", tangent: ["y", "z"] },
      { normal: "z", tangent: ["x", "y"] },
    ];
    // The default scan targets player-visible wall and trim faces; horizontal caps are optional.
    if (includeHorizontalCaps) axes.splice(1, 0, { normal: "y", tangent: ["x", "z"] });
    for (let first = 0; first < candidates.length; first += 1) {
      const a = candidates[first];
      for (let second = first + 1; second < candidates.length; second += 1) {
        const b = candidates[second];
        let overlap = null;
        for (const { normal, tangent } of axes) {
          for (const face of ["min", "max"]) {
            const aFace = a.bounds[face][normal];
            const bFace = b.bounds[face][normal];
            const planeGap = Math.abs(aFace - bFace);
            const firstTangentOverlap = Math.min(a.bounds.max[tangent[0]], b.bounds.max[tangent[0]]) -
              Math.max(a.bounds.min[tangent[0]], b.bounds.min[tangent[0]]);
            const secondTangentOverlap = Math.min(a.bounds.max[tangent[1]], b.bounds.max[tangent[1]]) -
              Math.max(a.bounds.min[tangent[1]], b.bounds.min[tangent[1]]);
            if (planeGap <= 0.005 && firstTangentOverlap > 0.005 && secondTangentOverlap > 0.005) {
              const firstOverlap = {
                center: (Math.min(a.bounds.max[tangent[0]], b.bounds.max[tangent[0]]) +
                  Math.max(a.bounds.min[tangent[0]], b.bounds.min[tangent[0]])) / 2,
              };
              const secondOverlap = {
                center: (Math.min(a.bounds.max[tangent[1]], b.bounds.max[tangent[1]]) +
                  Math.max(a.bounds.min[tangent[1]], b.bounds.min[tangent[1]])) / 2,
              };
              if (!hasVisibleCoplanarFaces(a, b, normal, face, tangent, firstOverlap, secondOverlap, (aFace + bFace) / 2)) {
                continue;
              }
              overlap = {
                axis: normal,
                normalSign: face === "min" ? -1 : 1,
                planeGap: Number(planeGap.toFixed(4)),
                overlap: [Number(firstTangentOverlap.toFixed(3)), Number(secondTangentOverlap.toFixed(3))],
              };
            }
            if (overlap) break;
          }
          if (overlap) break;
        }
        if (overlap) {
          overlaps.push({
            roomA: a.mesh.userData.roomId,
            meshA: a.mesh.name,
            roomB: b.mesh.userData.roomId,
            meshB: b.mesh.name,
            ...overlap,
          });
        }
      }
    }
    return overlaps;
  }

  return {
    colliders,
    frames,
    hearts,
    rooms,
    seats,
    pathGrid,
    seatDebugGroup,
    debugGroup,
    interactables,
    root: worldRoot,
    guestbookPosition: new THREE.Vector3(...MUSEUM_CONFIG.guestbook.position),
    get secretRevealed() {
      return secretRevealed;
    },
    getGroundHeight,
    setJukeboxPlaying,
    loadRoomById,
    loadRoomsAtPosition,
    scanCoplanarArchitecture,
    revealSecretRoom,
    setGuidePathVisible(visible) {
      guideRoute.visible = Boolean(visible);
    },
    setHeartCollected,
    triggerFinalReveal() {
      if (finalRevealStarted) return false;
      finalRevealStarted = true;
      for (const panel of skylightPanels) {
        panel.elapsed = 0;
        panel.revealing = true;
      }
      return true;
    },
    setLightingQuality(tier, effects = lightingEffects) {
      const quality = LIGHTING_CONFIG.qualityTiers[tier] ?? LIGHTING_CONFIG.qualityTiers.Low;
      qualityTier = tier in LIGHTING_CONFIG.qualityTiers ? tier : "Low";
      lightingEffects = { ...effects };
      for (const effect of roomLighting) {
        effect.shaft.visible = Boolean(quality.shafts && lightingEffects.shafts);
        effect.floorPool.visible = Boolean(quality.shafts && lightingEffects.shafts);
        effect.dust.visible = Boolean(quality.dust && lightingEffects.dust);
      }
      for (const heart of hearts) {
        if (heart.sparkles) heart.sparkles.visible = Boolean(quality.dust && lightingEffects.dust);
      }
    },
    setArchitectureShadows(casts, receives) {
      for (const mesh of architectureMeshes) {
        mesh.castShadow = Boolean(casts);
        mesh.receiveShadow = Boolean(receives);
      }
    },
    setVisualOptions({ carpets = true, reflections = true } = {}) {
      for (const object of carpetObjects) object.visible = Boolean(carpets);
      for (const object of reflectionObjects) object.visible = Boolean(reflections);
    },
    setTimeOfDay(progress) {
      const dusk = THREE.MathUtils.clamp(progress, 0, 1);
      for (const effect of roomLighting) {
        effect.shaft.material.opacity = (0.035 * effect.mood.lightIntensity) * (1 - dusk * 0.48);
        effect.floorPool.material.opacity = (0.09 * effect.mood.lightIntensity) * (1 - dusk * 0.5);
        effect.shaft.material.color.setHex(effect.mood.lightColor);
        effect.floorPool.material.color.setHex(effect.mood.lightColor);
      }
      for (const material of frameLights) {
        material.emissiveIntensity = 0.45 + dusk * 1.1;
      }
    },
    update,
  };
}
