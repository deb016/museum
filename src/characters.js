import * as THREE from "three";
import {
  CHARACTER_HEIGHTS,
  COUPLE_INTERACTION_CONFIG,
  INTERACTION_CONFIG,
} from "./config.js";

const material = (color, roughness = 0.72, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra });

function box(parent, size, position, mat, name) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...position);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function sphere(parent, radius, position, mat, name, segments = 16) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, Math.max(8, segments - 4)), mat);
  mesh.position.set(...position);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, top, bottom, height, position, mat, name, segments = 14) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, segments), mat);
  mesh.position.set(...position);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function pivot(parent, name, position) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...position);
  parent.add(group);
  return group;
}

function makePlaidMaterial() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = "#c4d3e6";
  context.fillRect(0, 0, 128, 128);
  context.fillStyle = "rgba(120,150,195,.55)";
  for (let index = 0; index < 128; index += 32) {
    context.fillRect(index, 0, 14, 128);
    context.fillRect(0, index, 128, 14);
  }
  context.fillStyle = "rgba(250,245,225,.7)";
  for (let index = 16; index < 128; index += 32) {
    context.fillRect(index + 6, 0, 6, 128);
    context.fillRect(0, index + 6, 128, 6);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 });
}

function addFace(head, skin, headRadius) {
  const eyeMaterial = material(0x1a1210, 0.45);
  sphere(head, 0.018, [-0.05, 0.02, headRadius * 0.93], eyeMaterial, "eyeL", 8);
  sphere(head, 0.018, [0.05, 0.02, headRadius * 0.93], eyeMaterial, "eyeR", 8);
  box(head, [0.05, 0.012, 0.01], [0, -0.06, headRadius * 0.95], material(0xb06a5a), "mouth");
  sphere(head, 0.022, [0, -0.02, headRadius * 0.99], skin, "nose", 8);
}

function addCurlyHair(head, hair) {
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.157, 28, 18, 0, Math.PI * 2, 0, 1.3), hair);
  crown.position.set(0, 0.01, -0.008);
  crown.name = "hairCrown";
  crown.castShadow = true;
  head.add(crown);
  const back = new THREE.Mesh(
    new THREE.SphereGeometry(0.154, 28, 18, Math.PI * 0.8, Math.PI * 1.4, 0, 2.3),
    hair,
  );
  back.position.set(0, 0.005, -0.005);
  back.name = "hairBack";
  back.castShadow = true;
  head.add(back);
  for (let index = 0; index < 46; index += 1) {
    const angle = index * 2.399963229728653;
    const elevation = ((index * 37) % 101) / 101 * 1.1;
    sphere(
      head,
      0.06,
      [
        Math.cos(angle) * Math.cos(elevation) * 0.15,
        0.06 + Math.sin(elevation) * 0.13,
        Math.sin(angle) * Math.cos(elevation) * 0.15 - 0.01,
      ],
      hair,
      `curl${index}`,
      8,
    );
  }
}

function addDaveLimbs(root, materials, attachPoints) {
  const { plaid, skin, jeans, shoe, watch } = materials;
  const arms = {};
  const armJoints = {};
  const legs = {};
  const legRigs = {};
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "L" : "R";
    const shoulder = pivot(root, `shoulder${suffix}`, [side * 0.3, 1.54, 0]);
    arms[`arm${suffix}`] = shoulder;
    cylinder(shoulder, 0.085, 0.075, 0.24, [0, -0.12, 0], plaid, `upperArm${suffix}`);
    const elbow = pivot(shoulder, `elbow${suffix}`, [0, -0.24, 0]);
    cylinder(elbow, 0.065, 0.055, 0.19, [0, -0.095, 0], plaid, `sleeve${suffix}`);
    const forearm = pivot(elbow, `forearm${suffix}`, [0, -0.19, 0]);
    cylinder(forearm, 0.065, 0.055, 0.31, [0, -0.155, 0], skin, `forearmSkin${suffix}`);
    const wrist = pivot(forearm, `wrist${suffix}`, [0, -0.31, 0]);
    sphere(wrist, 0.045, [0, -0.035, 0], skin, `hand${suffix}`, 10);
    if (side > 0) cylinder(wrist, 0.07, 0.07, 0.04, [0, -0.025, 0], watch, "rightWristWatch", 12);
    armJoints[suffix] = { shoulder, elbow, forearm, wrist };
    const hip = pivot(root, `hipJoint${suffix}`, [side * 0.1, 1.0, 0]);
    legs[`leg${suffix}`] = hip;
    const thigh = cylinder(hip, 0.18, 0.14, 0.47, [0, -0.235, 0], jeans, `thigh${suffix}`);
    const knee = pivot(hip, `knee${suffix}`, [0, -0.47, 0]);
    const lowerLeg = cylinder(knee, 0.14, 0.12, 0.43, [0, -0.215, 0], jeans, `lowerLeg${suffix}`);
    const ankle = pivot(knee, `ankle${suffix}`, [0, -0.43, 0]);
    ankle.userData.baseY = ankle.position.y;
    const foot = box(ankle, [0.15, 0.08, 0.3], [0, -0.04, 0.06], shoe, `shoe${suffix}`);
    legRigs[suffix] = {
      hip,
      knee,
      ankle,
      thigh,
      lowerLeg,
      foot,
      thighLength: Math.abs(knee.position.y),
      shinLength: Math.abs(ankle.position.y),
      footBottomOffset: getFootBottomOffset(foot),
    };
  }
  return { arms, armJoints, legs, legRigs };
}

function createDave() {
  const root = new THREE.Group();
  root.name = "Dave Rey";
  const skin = material(0xc99a72);
  const tee = material(0xf5f5f5, 0.9);
  const plaid = makePlaidMaterial();
  const jeans = material(0x4b4d55, 0.95);
  const shoe = material(0x4a2218, 0.25);
  const watch = material(0x222222, 0.2, { metalness: 0.15 });
  const hair = material(0x15100d, 1);

  const hips = pivot(root, "hips", [0, 1.0, 0]);
  const spine = pivot(hips, "spine", [0, 0, 0]);
  box(spine, [0.4, 0.58, 0.26], [0, 0.3, 0], tee, "whiteTee");
  box(spine, [0.5, 0.5, 0.09], [0, 0.28, -0.15], plaid, "plaidShirtBack");
  box(spine, [0.14, 0.5, 0.09], [-0.18, 0.28, 0.1], plaid, "plaidShirtFrontL");
  box(spine, [0.14, 0.5, 0.09], [0.18, 0.28, 0.1], plaid, "plaidShirtFrontR");
  box(spine, [0.5, 0.08, 0.28], [0, 0.03, 0], plaid, "shirtHem");
  const neck = pivot(spine, "neck", [0, 0.66, 0]);
  cylinder(neck, 0.05, 0.05, 0.12, [0, 0.06, 0], skin, "neck", 12);
  const head = pivot(neck, "head", [0, 0.12, 0]);
  sphere(head, 0.15, [0, 0, 0], skin, "face", 20);
  addFace(head, skin, 0.15);
  addCurlyHair(head, hair);
  box(head, [0.2, 0.04, 0.05], [0, 0.2, 0.03], material(0x111111, 0.2), "sunglasses");

  const limbs = addDaveLimbs(root, { plaid, skin, jeans, shoe, watch }, null);
  const attachPoints = createAttachPoints(root, hips, spine, head, limbs, 0.035);
  root.userData = {
    attachPoints,
    ...limbs,
    seatRig: createSeatRig(hips, spine, neck, head, limbs, []),
    kind: "daveRey",
  };
  root.userData.interactionRig = createInteractionRig(root, hips, spine, neck, head, limbs, attachPoints);
  return root;
}

function addDressTier(root, name, y, topRadius, bottomRadius, height, materialToUse) {
  const tier = pivot(root, name, [0, y, 0]);
  const fabric = new THREE.Group();
  fabric.name = `${name}Fabric`;
  fabric.position.y = -height / 2;
  tier.add(fabric);
  const tierMaterial = materialToUse.clone();
  tierMaterial.side = THREE.DoubleSide;
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(topRadius, bottomRadius, height, 24, 1, true),
    tierMaterial,
  );
  shell.name = `${name}Shell`;
  shell.castShadow = true;
  shell.receiveShadow = true;
  fabric.add(shell);
  const top = new THREE.Mesh(new THREE.CircleGeometry(topRadius, 24), tierMaterial);
  top.name = `${name}ClosedTop`;
  top.position.y = height / 2;
  top.rotation.x = -Math.PI / 2;
  top.castShadow = true;
  top.receiveShadow = true;
  fabric.add(top);
  tier.userData.fabric = fabric;
  tier.userData.height = height;
  tier.userData.fadeMaterials = [tierMaterial];
  return tier;
}

const SKIRT_SEGMENTS = 32;
const SKIRT_ROWS = 36;
const KEYS_B = [
  [0, 0.148, 0.148],
  [0.15, 0.19, 0.17],
  [0.3, 0.23, 0.12],
  [0.5, 0.25, 0.088],
  [0.63, 0.26, 0.09],
  [0.72, 0.27, 0.15],
  [1, 0.3, 0.16],
];

function makeFloralTexture() {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    context.fillStyle = "#f4eddb";
    context.fillRect(0, 0, 256, 256);
    let seed = 0x52455348;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    for (let index = 0; index < 22; index += 1) {
      context.save();
      context.translate(random() * 256, random() * 256);
      for (let petal = 0; petal < 5; petal += 1) {
        context.rotate((Math.PI * 2) / 5);
        context.fillStyle = "rgba(143,154,98,.85)";
        context.beginPath();
        context.ellipse(0, 5, 2.6, 5.5, 0, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = "rgba(120,128,80,.9)";
      context.beginPath();
      context.arc(0, 0, 2, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 3);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let pixel = 0; pixel < size * size; pixel += 1) {
    const offset = pixel * 4;
    data[offset] = 244;
    data[offset + 1] = 237;
    data[offset + 2] = 219;
    data[offset + 3] = 255;
  }
  for (let y = 12; y < size; y += 32) {
    for (let x = 12; x < size; x += 32) {
      for (let py = -3; py <= 3; py += 1) {
        for (let px = -3; px <= 3; px += 1) {
          if (px * px + py * py > 9) continue;
          const offset = ((y + py) * size + x + px) * 4;
          data[offset] = 143;
          data[offset + 1] = 154;
          data[offset + 2] = 98;
        }
      }
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 3);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function curveA(hipY) {
  return new THREE.LineCurve3(
    new THREE.Vector3(0, 1.24 - hipY, 0),
    new THREE.Vector3(0, 0.36 - hipY, 0),
  );
}

function curveB(hipY, hemLocalY, thighLength, referenceThighLength) {
  const points = [
    [1.24, 0],
    [1.1, 0],
    [1, 0.02],
    [0.96, 0.12],
    [0.955, 0.3],
    [0.97, 0.44],
    [0.86, 0.54],
    [0.76, 0.57],
    [0.6, 0.57],
  ].map(([y, z]) => {
    const forwardZ = z <= referenceThighLength
      ? (z / referenceThighLength) * thighLength
      : thighLength + z - referenceThighLength;
    return new THREE.Vector3(0, y - hipY, forwardZ);
  });
  points[points.length - 1].y = hemLocalY;
  return new THREE.CatmullRomCurve3(points, false, "centripetal");
}

function curveStraddle(hipY) {
  return new THREE.CatmullRomCurve3(
    COUPLE_INTERACTION_CONFIG.piggyback.straddlePath.map(([y, z]) =>
      new THREE.Vector3(0, y - hipY, z)),
    false,
    "centripetal",
  );
}

function lerpKeys(keys, t) {
  for (let index = 1; index < keys.length; index += 1) {
    if (t <= keys[index][0]) {
      const start = keys[index - 1];
      const end = keys[index];
      const amount = (t - start[0]) / (end[0] - start[0]);
      return [
        start[1] + (end[1] - start[1]) * amount,
        start[2] + (end[2] - start[2]) * amount,
      ];
    }
  }
  return [keys[keys.length - 1][1], keys[keys.length - 1][2]];
}

function bulge(t) {
  return 0.035 * Math.sin(((t * 3) % 1) * Math.PI);
}

function getSeatClamp(seat, characterScale, config) {
  const floorY = seat.floorY ?? 0;
  const slot = seat.position ?? [0, floorY + config.seatHeight, 0];
  const surface = seat.surface ?? {
    position: [
      slot[0],
      slot[1],
      slot[2] - config.backrestOffsetZ - config.backrestThickness / 2 -
        config.bodyHalfDepth - config.backrestGap,
    ],
    width: config.seatWidth,
    depth: config.seatDepth,
    topY: slot[1],
  };
  const forward = seat.forward ?? [0, 0, 1];
  const yaw = Math.atan2(forward[0], forward[2]);
  const dx = surface.position[0] - slot[0];
  const dz = surface.position[2] - slot[2];
  const centerX = (Math.cos(yaw) * dx - Math.sin(yaw) * dz) / characterScale;
  const centerZ = (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / characterScale;
  const margin = (config.resha.seatClampMargin ?? 0.03) / characterScale;
  const top = (surface.topY ?? slot[1]) - floorY;
  const pelvis = top + config.resha.pelvisSeatOffset;
  return {
    minX: centerX - surface.width / (2 * characterScale) - margin,
    maxX: centerX + surface.width / (2 * characterScale) + margin,
    minZ: centerZ - surface.depth / (2 * characterScale) - margin,
    maxZ: centerZ + surface.depth / (2 * characterScale) + margin,
    minY: (top + config.resha.seatSurfaceClearance - pelvis) / characterScale,
  };
}

function ringSet(curve, radii, seatClamp = null) {
  const out = new Float32Array((SKIRT_ROWS + 1) * (SKIRT_SEGMENTS + 1) * 3);
  const side = new THREE.Vector3(1, 0, 0);
  let offset = 0;
  for (let row = 0; row <= SKIRT_ROWS; row += 1) {
    const t = row / SKIRT_ROWS;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const up = new THREE.Vector3().crossVectors(tangent, side).normalize();
    const [radiusX, radiusY] = radii(t);
    for (let segment = 0; segment <= SKIRT_SEGMENTS; segment += 1) {
      const angle = (segment / SKIRT_SEGMENTS) * Math.PI * 2;
      const x = point.x + Math.cos(angle) * radiusX;
      let y = point.y + Math.sin(angle) * radiusY * up.y;
      const z = point.z + Math.sin(angle) * radiusY * up.z;
      if (
        seatClamp &&
        x >= seatClamp.minX && x <= seatClamp.maxX &&
        z >= seatClamp.minZ && z <= seatClamp.maxZ
      ) {
        y = Math.max(y, seatClamp.minY);
      }
      out[offset++] = x;
      out[offset++] = y;
      out[offset++] = z;
    }
  }
  return out;
}

function createDefaultSeat(seatHeight, config) {
  const floorY = 0;
  const position = [0, seatHeight, 0];
  return {
    id: `default:${seatHeight}`,
    floorY,
    position,
    forward: [0, 0, 1],
    surface: {
      position: [
        0,
        seatHeight,
        -config.backrestOffsetZ - config.backrestThickness / 2 -
          config.bodyHalfDepth - config.backrestGap,
      ],
      width: config.seatWidth,
      depth: config.seatDepth,
      topY: seatHeight,
    },
  };
}

function buildSkirt(hipY, thighLength, characterScale, config) {
  const standing = ringSet(
    curveA(hipY),
    (t) => {
      const radius = 0.148 + 0.36 * t + bulge(t);
      return [radius, radius];
    },
  );
  const straddle = ringSet(
    curveStraddle(hipY),
    (t) => {
      const [radiusX, radiusY] = lerpKeys(COUPLE_INTERACTION_CONFIG.piggyback.straddleRadii, t);
      const amount = bulge(t);
      return [radiusX + amount, radiusY + amount * 0.6];
    },
  );
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(standing.length);
  const uvs = new Float32Array((SKIRT_ROWS + 1) * (SKIRT_SEGMENTS + 1) * 2);
  const indices = [];
  for (let row = 0, offset = 0; row <= SKIRT_ROWS; row += 1) {
    for (let segment = 0; segment <= SKIRT_SEGMENTS; segment += 1) {
      uvs[offset++] = segment / SKIRT_SEGMENTS;
      uvs[offset++] = row / SKIRT_ROWS;
    }
  }
  for (let row = 0; row < SKIRT_ROWS; row += 1) {
    for (let segment = 0; segment < SKIRT_SEGMENTS; segment += 1) {
      const a = row * (SKIRT_SEGMENTS + 1) + segment;
      const b = a + SKIRT_SEGMENTS + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  // Keep the standing bell, seat-clamped seated drape, and piggyback straddle on one UV-mapped fabric mesh.
  const fabric = new THREE.MeshStandardMaterial({
    map: makeFloralTexture(),
    roughness: 0.55,
    side: THREE.DoubleSide,
  });
  const skirt = new THREE.Mesh(geometry, fabric);
  skirt.name = "reshaSkirtTwoShape";
  skirt.castShadow = true;
  skirt.receiveShadow = true;

  const state = {
    A: standing,
    B: null,
    C: straddle,
    pos: positions,
    seatKey: "",
    sitBlend: 0,
  };
  const applyShape = (shape, amount) => {
    // Interpolate every vertex from shape A and weld the duplicated seam normals to prevent a shading line.
    for (let index = 0; index < state.pos.length; index += 1) {
      state.pos[index] = state.A[index] + (shape[index] - state.A[index]) * amount;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    const normals = geometry.attributes.normal;
    for (let row = 0; row <= SKIRT_ROWS; row += 1) {
      const first = row * (SKIRT_SEGMENTS + 1);
      const last = first + SKIRT_SEGMENTS;
      const x = normals.getX(first) + normals.getX(last);
      const y = normals.getY(first) + normals.getY(last);
      const z = normals.getZ(first) + normals.getZ(last);
      const length = Math.hypot(x, y, z) || 1;
      normals.setXYZ(first, x / length, y / length, z / length);
      normals.setXYZ(last, x / length, y / length, z / length);
    }
    normals.needsUpdate = true;
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
  };
  skirt.userData = state;
  skirt.userData.setStraddleBlend = (blend) => {
    const amount = THREE.MathUtils.clamp(blend, 0, 1);
    const shape = amount === 0 ? "standing" : "straddle";
    if (state.shape === shape && state.sitBlend === amount) return;
    applyShape(state.C, amount);
    state.sitBlend = amount;
    state.shape = shape;
  };
  skirt.userData.setBlend = (blend, seatData, seatHeight = config.seatHeight) => {
    const amount = THREE.MathUtils.clamp(blend, 0, 1);
    const seat = seatData ?? createDefaultSeat(seatHeight, config);
    const seatTop = (seat.surface?.topY ?? seat.position?.[1] ?? seatHeight) - (seat.floorY ?? 0);
    const pelvisY = seatTop + config.resha.pelvisSeatOffset;
    const hemLocalY = (config.resha.hemHeightAboveFloor - pelvisY) / characterScale;
    const key = [
      seat.id ?? "",
      seatTop,
      seat.floorY ?? 0,
      seat.position?.[0] ?? 0,
      seat.position?.[2] ?? 0,
      seat.forward?.[0] ?? 0,
      seat.forward?.[2] ?? 1,
      seat.surface?.position?.[0] ?? 0,
      seat.surface?.position?.[2] ?? 0,
      seat.surface?.width ?? config.seatWidth,
      seat.surface?.depth ?? config.seatDepth,
    ].join(":");
    const shape = amount === 0 ? "standing" : "sitting";
    if (state.seatKey === key && state.shape === shape && state.sitBlend === amount) return;
    if (state.seatKey !== key) {
      state.B = ringSet(
        curveB(hipY, hemLocalY, thighLength, config.resha.referenceThighLength),
        (t) => {
          const [radiusX, radiusY] = lerpKeys(KEYS_B, t);
          const amount = bulge(t);
          return [radiusX + amount, radiusY + amount * 0.6];
        },
        getSeatClamp(seat, characterScale, config),
      );
      state.seatKey = key;
    }
    applyShape(state.B, amount);
    state.sitBlend = amount;
    state.shape = shape;
  };
  skirt.userData.setBlend(0, null, config.seatHeight);
  return skirt;
}

function createReshaLimbs(root, materials, attachPoints) {
  const { skin, shoe, watch } = materials;
  const arms = {};
  const armJoints = {};
  const legs = {};
  const legRigs = {};
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "L" : "R";
    const shoulder = pivot(root, `shoulder${suffix}`, [side * 0.24, 1.55, 0]);
    arms[`arm${suffix}`] = shoulder;
    cylinder(shoulder, 0.05, 0.045, 0.25, [0, -0.125, 0], skin, `upperArm${suffix}`);
    const elbow = pivot(shoulder, `elbow${suffix}`, [0, -0.25, 0]);
    cylinder(elbow, 0.047, 0.043, 0.25, [0, -0.125, 0], skin, `lowerArm${suffix}`);
    const wrist = pivot(elbow, `wrist${suffix}`, [0, -0.25, 0]);
    armJoints[suffix] = { shoulder, elbow, forearm: null, wrist };
    sphere(wrist, 0.035, [0, -0.025, 0], skin, `hand${suffix}`, 10);
    if (side < 0) cylinder(wrist, 0.052, 0.052, 0.025, [0, -0.015, 0], watch, "leftWristWatch", 12);
    const hip = pivot(root, `hipJoint${suffix}`, [side * 0.08, 0.4, 0]);
    legs[`leg${suffix}`] = hip;
    const thigh = cylinder(hip, 0.055, 0.045, 0.2, [0, -0.1, 0], skin, `upperLeg${suffix}`);
    const knee = pivot(hip, `knee${suffix}`, [0, -0.2, 0]);
    const lowerLeg = cylinder(knee, 0.05, 0.045, 0.2, [0, -0.1, 0], skin, `lowerLeg${suffix}`);
    const ankle = pivot(knee, `ankle${suffix}`, [0, -0.2, 0]);
    ankle.userData.baseY = ankle.position.y;
    const foot = box(ankle, [0.08, 0.05, 0.22], [0, -0.025, 0.07], shoe, `pointedShoe${suffix}`);
    legRigs[suffix] = {
      hip,
      knee,
      ankle,
      thigh,
      lowerLeg,
      foot,
      thighLength: Math.abs(knee.position.y),
      shinLength: Math.abs(ankle.position.y),
      footBottomOffset: getFootBottomOffset(foot),
    };
  }
  return { arms, armJoints, legs, legRigs };
}

function addLongHair(head, hair) {
  const hairGroup = pivot(head, "hair", [0, 0, 0]);
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(0.156, 32, 20, 0, Math.PI * 2, 0, 1.2),
    hair,
  );
  crown.position.set(0, 0.005, -0.01);
  crown.name = "hairCrown";
  crown.castShadow = true;
  hairGroup.add(crown);

  const back = new THREE.Mesh(
    new THREE.SphereGeometry(0.153, 32, 20, Math.PI * 0.9, Math.PI * 1.4, 0, 2.5),
    hair,
  );
  back.position.set(0, 0, -0.005);
  back.name = "hairBack";
  back.castShadow = true;
  hairGroup.add(back);

  const longHairPivot = pivot(hairGroup, "longHairPivot", [0, 0, 0]);
  // The game torso is wider than the reference torso; taper the lower shell behind its cream side.
  const longHair = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.12, 0.7, 32, 1, true, Math.PI * 0.3, Math.PI * 1.4),
    hair,
  );
  longHair.position.set(0, -0.28, -0.05);
  longHair.name = "longHairLength";
  longHair.castShadow = true;
  longHair.receiveShadow = true;
  longHairPivot.add(longHair);

  for (const side of [-1, 1]) {
    const strand = cylinder(
      hairGroup,
      0.045,
      0.03,
      0.56,
      [side * 0.145, -0.27, 0.075],
      hair,
      `faceFrame${side}`,
      12,
    );
    strand.scale.z = 0.55;
    strand.rotation.z = side * 0.05;
    sphere(hairGroup, 0.032, [side * 0.158, -0.56, 0.082], hair, `hairTip${side}`, 10)
      .scale.set(1, 1, 0.6);
    sphere(hairGroup, 0.05, [side * 0.125, 0.035, 0.1], hair, `sideSweptHairline${side}`, 12)
      .scale.set(0.9, 0.45, 0.45);
  }
  box(hairGroup, [0.006, 0.05, 0.012], [0, 0.15, 0.06], material(0x2a211c), "centerPart")
    .rotation.x = 0.9;
  return { hairGroup, longHairPivot };
}

function createResha() {
  const root = new THREE.Group();
  root.name = "Resha";
  const skin = material(0xd9a883);
  const dress = material(0xf4efde, 0.3);
  const hair = material(0x15100d, 0.55, { side: THREE.DoubleSide });
  const shoe = material(0xe8dcc4, 0.4);
  const watch = material(0xcccccc, 0.2, { metalness: 0.55 });
  const hips = pivot(root, "hips", [0, 1, 0]);
  const spine = pivot(hips, "spine", [0, 0, 0]);

  cylinder(spine, 0.17, 0.15, 0.38, [0, 0.38, 0], dress, "dressBodice", 20);
  const neckline = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 20), dress);
  neckline.position.set(0, 0.58, 0);
  neckline.rotation.x = Math.PI / 2;
  neckline.name = "ruchedNeckline";
  spine.add(neckline);
  const seating = INTERACTION_CONFIG.seating.resha;
  const neck = pivot(spine, "neck", [0, 0.66, 0]);
  cylinder(neck, 0.05, 0.045, 0.1, [0, 0.05, 0], skin, "neckMesh", 12);
  const head = pivot(neck, "head", [0, 0.14, 0]);
  sphere(head, 0.14, [0, 0, 0], skin, "face", 20);
  addFace(head, skin, 0.14);
  const { hairGroup, longHairPivot } = addLongHair(head, hair);

  const limbs = createReshaLimbs(root, { skin, shoe, watch }, null);
  const attachPoints = createAttachPoints(root, hips, spine, head, limbs, 0.025);
  // One UV-mapped surface carries the standing bell and the forward-facing seated shape.
  const skirt = buildSkirt(
    hips.position.y,
    limbs.legRigs.L.thighLength,
    CHARACTER_HEIGHTS.resha,
    { ...INTERACTION_CONFIG.seating, resha: seating },
  );
  hips.add(skirt);
  root.scale.setScalar(CHARACTER_HEIGHTS.resha);
  root.userData = {
    attachPoints,
    skirtTiers: [],
    skirtMesh: skirt,
    ...limbs,
    seatRig: createSeatRig(
      hips,
      spine,
      neck,
      head,
      limbs,
      [],
      hairGroup,
      skirt,
    ),
    kind: "resha",
  };
  root.userData.interactionRig = createInteractionRig(
    root,
    hips,
    spine,
    neck,
    head,
    limbs,
    attachPoints,
    hairGroup,
    longHairPivot,
  );
  return root;
}

export function createReferenceResha() {
  const root = new THREE.Group();
  root.name = "Resha reference";
  const skin = material(0xd9a883);
  const dress = material(0xf4efde, 0.3);
  const hair = material(0x15100d, 0.55, { side: THREE.DoubleSide });

  cylinder(root, 0.17, 0.15, 0.38, [0, 1.38, 0], dress, "referenceBodice", 20);
  const neckline = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 20), dress);
  neckline.position.set(0, 1.58, 0);
  neckline.rotation.x = Math.PI / 2;
  root.add(neckline);
  const referenceSkirt = buildSkirt(
    0,
    INTERACTION_CONFIG.seating.resha.referenceThighLength,
    CHARACTER_HEIGHTS.resha,
    INTERACTION_CONFIG.seating,
  );
  referenceSkirt.name = "referenceSkirt";
  root.add(referenceSkirt);

  cylinder(root, 0.045, 0.05, 0.1, [0, 1.66, 0], skin, "referenceNeck", 12);
  const head = pivot(root, "referenceHead", [0, 1.8, 0]);
  sphere(head, 0.14, [0, 0, 0], skin, "referenceFace", 20);
  addFace(head, skin, 0.14);
  addLongHair(head, hair);
  for (const side of [-1, 1]) {
    const arm = pivot(root, `referenceArm${side}`, [side * 0.24, 1.55, 0]);
    cylinder(arm, 0.045, 0.05, 0.6, [0, -0.3, 0], skin, "referenceArmMesh", 12);
    if (side < 0) cylinder(arm, 0.052, 0.052, 0.025, [0, -0.52, 0], material(0xcccccc, 0.2), "referenceWatch", 12);
    const leg = pivot(root, `referenceLeg${side}`, [side * 0.08, 0.4, 0]);
    cylinder(leg, 0.045, 0.055, 0.4, [0, -0.2, 0], skin, "referenceLegMesh", 12);
    box(leg, [0.08, 0.05, 0.22], [0, -0.42, 0.07], material(0xe8dcc4, 0.4), "referenceShoe");
  }
  root.scale.setScalar(CHARACTER_HEIGHTS.resha);
  root.userData.kind = "reshaReference";
  return root;
}

function createAttachPoints(root, pelvis, spine, head, limbs, handOffset) {
  root.updateMatrixWorld(true);
  const points = {};
  for (const name of [
    "handL", "handR", "chest", "back", "shoulderL", "shoulderR",
    "head", "lips", "cheekL", "cheekR", "forehead", "seat",
    "pelvis", "shL", "shR", "bkL", "bkR", "waistL", "chestL", "chestR",
  ]) {
    const point = new THREE.Group();
    point.name = `attach:${name}`;
    root.add(point);
    points[name] = point;
  }
  const bind = (name, parent, position) => {
    parent.add(points[name]);
    points[name].position.set(...position);
  };
  const leftArm = limbs.armJoints.R;
  const rightArm = limbs.armJoints.L;
  const leftShoulder = spine.worldToLocal(leftArm.shoulder.getWorldPosition(new THREE.Vector3()));
  const rightShoulder = spine.worldToLocal(rightArm.shoulder.getWorldPosition(new THREE.Vector3()));
  const hugBack = COUPLE_INTERACTION_CONFIG.hug;
  const chestHeight = root.name === "Resha" ? 0.38 : 0.3;
  bind("handL", leftArm.wrist, [0, -handOffset, 0]);
  bind("handR", rightArm.wrist, [0, -handOffset, 0]);
  bind("pelvis", pelvis, [0, 0, 0]);
  bind("seat", spine, [
    0,
    COUPLE_INTERACTION_CONFIG.piggyback.seatY,
    COUPLE_INTERACTION_CONFIG.piggyback.seatZ,
  ]);
  bind("head", head, [0, 0, 0]);
  bind("lips", head, [0, -0.06, spine.parent.name === "hips" ? 0.15 : 0.14]);
  bind("forehead", head, [0, 0.15, 0.04]);
  bind("cheekL", head, [0.095, -0.03, 0.095]);
  bind("cheekR", head, [-0.095, -0.03, 0.095]);
  bind("shL", spine, leftShoulder.toArray());
  bind("shR", spine, rightShoulder.toArray());
  bind("bkL", spine, [hugBack.backX, hugBack.backY, hugBack.backZ]);
  bind("bkR", spine, [-hugBack.backX, hugBack.backY, hugBack.backZ]);
  bind("waistL", spine, [0.19, 0.2, 0]);
  bind("chestL", spine, [0.1, chestHeight + 0.2, 0.17]);
  bind("chestR", spine, [-0.1, chestHeight + 0.2, 0.17]);
  bind("chest", spine, [0, chestHeight, 0.17]);
  bind("back", spine, [0, chestHeight, -0.2]);
  bind("shoulderL", spine, leftShoulder.toArray());
  bind("shoulderR", spine, rightShoulder.toArray());
  return points;
}

function createInteractionRig(root, hips, spine, neck, head, limbs, attachPoints, hairPivot = null, longHairPivot = null) {
  root.updateMatrixWorld(true);
  const arms = Object.values(limbs.armJoints).map((joints) => {
    const side = Math.sign(joints.shoulder.position.x);
    const hand = side > 0 ? attachPoints.handL : attachPoints.handR;
    const shoulderPosition = joints.shoulder.getWorldPosition(new THREE.Vector3());
    const elbowPosition = joints.elbow.getWorldPosition(new THREE.Vector3());
    const handPosition = hand.getWorldPosition(new THREE.Vector3());
    return {
      ...joints,
      side,
      hand,
      upperLength: shoulderPosition.distanceTo(elbowPosition),
      lowerLength: elbowPosition.distanceTo(handPosition),
    };
  });
  const legs = Object.values(limbs.legRigs).map((leg) => ({
    ...leg,
    side: Math.sign(leg.hip.position.x),
  }));
  const objects = [
    hips, spine, neck, head, hairPivot, longHairPivot,
    root.getObjectByName("eyeL"), root.getObjectByName("eyeR"),
    ...arms.flatMap(({ shoulder, elbow, forearm, wrist }) =>
      [shoulder, elbow, forearm, wrist].filter(Boolean)),
    ...legs.flatMap(({ hip, knee, ankle, thigh, lowerLeg, foot }) =>
      [hip, knee, ankle, thigh, lowerLeg, foot].filter(Boolean)),
  ];
  return {
    hips,
    spine,
    neck,
    head,
    hairPivot,
    arms,
    legs,
    points: attachPoints,
    eyes: [root.getObjectByName("eyeL"), root.getObjectByName("eyeR")].filter(Boolean),
    rest: [...new Set(objects.filter(Boolean))].map((object) => ({
      object,
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
    })),
  };
}

export function restoreSkirtShape(character) {
  const skirt = character.userData.skirtMesh;
  if (!skirt?.userData.setStraddleBlend ||
      (skirt.userData.shape === "standing" && skirt.userData.sitBlend === 0)) return;
  skirt.userData.setStraddleBlend(0);
}

export function resetCharacterPose(character, { restoreSkirt = true, rootY } = {}) {
  const rig = character.userData.interactionRig;
  if (!rig) return;
  character.rotation.x = 0;
  character.rotation.z = 0;
  if (Number.isFinite(rootY)) character.position.y = rootY;
  if (restoreSkirt) restoreSkirtShape(character);
  for (const rest of rig.rest) {
    rest.object.position.copy(rest.position);
    rest.object.quaternion.copy(rest.quaternion);
    rest.object.scale.copy(rest.scale);
  }
}

function createSeatRig(hips, spine, neck, head, limbs, skirtTiers, hairPivot = null, seatedSkirt = null) {
  return {
    hips,
    baseHipsY: hips.position.y,
    spine,
    baseSpineRotationX: spine.rotation.x,
    baseSpinePositionZ: spine.position.z,
    neck,
    baseNeckRotationX: neck.rotation.x,
    head,
    hairPivot,
    seatedSkirt,
    baseHairPosition: hairPivot?.position?.clone() ?? null,
    arms: Object.values(limbs.armJoints).map(({ shoulder, elbow, wrist }) => ({
      shoulder,
      elbow,
      wrist,
      side: Math.sign(shoulder.position.x),
      baseY: shoulder.position.y,
      baseZ: shoulder.position.z,
      baseShoulderRotationX: shoulder.rotation.x,
      baseShoulderRotationZ: shoulder.rotation.z,
      baseElbowRotationX: elbow.rotation.x,
      baseElbowRotationZ: elbow.rotation.z,
    })),
    legs: Object.values(limbs.legRigs).map((leg) => ({
      ...leg,
      side: Math.sign(leg.hip.position.x),
      baseHipY: leg.hip.position.y,
      baseHipZ: leg.hip.position.z,
      baseHipRotationX: leg.hip.rotation.x,
      baseHipRotationY: leg.hip.rotation.y,
      baseKneeY: leg.knee.position.y,
      baseKneeRotationX: leg.knee.rotation.x,
      baseAnkleY: leg.ankle.position.y,
      baseAnkleRotationX: leg.ankle.rotation.x,
      baseFootZ: leg.foot.position.z,
      baseThighY: leg.thigh.position.y,
      baseLowerLegY: leg.lowerLeg.position.y,
    })),
    skirtTiers: skirtTiers.map((tier) => ({
      object: tier,
      basePosition: tier.position.clone(),
      baseRotationX: tier.rotation.x,
      baseRotationZ: tier.rotation.z,
      baseScale: tier.scale.clone(),
      height: tier.userData.height,
      fabric: tier.userData.fabric,
      baseFabricScale: tier.userData.fabric.scale.clone(),
      fadeMaterials: tier.userData.fadeMaterials,
    })),
  };
}

function getFootBottomOffset(foot) {
  foot.geometry.computeBoundingBox();
  return -(foot.position.y + foot.geometry.boundingBox.min.y);
}

export function createCharacter(kind) {
  return kind === "resha" ? createResha() : createDave();
}

export function createCharacterPair() {
  return {
    daveRey: createDave(),
    resha: createResha(),
  };
}
