import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import {
  LIGHTING_CONFIG,
  MUSEUM_ARCHWAYS,
  MUSEUM_CARPETS,
  MUSEUM_CONFIG,
  MUSEUM_PROPS,
  ROOM_THEMES,
} from "../museum.config.js";
import {
  APP_CONFIG,
  CHAT_CONFIG,
  CAMERA_CONFIG,
  CHARACTER_HEIGHTS,
  COLLISION_CONFIG,
  COUPLE_INTERACTION_CONFIG,
  INTERACTION_CONFIG,
  MOVEMENT_CONFIG,
  ONLINE_CONFIG,
  PERFORMANCE_CONFIG,
  ROOM_CONFIG,
} from "./config.js";
import {
  createCharacter,
  createCharacterPair,
  createReferenceResha,
  resetCharacterPose,
} from "./characters.js";
import { distanceToCapsuleBody, moveCapsule, resolvePenetrations } from "./collision.js";
import { headingFromDirection, stepHeading } from "./movement.js";
import {
  getAvailableInteractionActions,
  getFreeSeatSlots,
  getSeatActionLabel,
  getUniqueSeatSlots,
  isSeatApproachable,
} from "./seat-actions.js";
import { applySeatedPose, getSeatHeight } from "./sitting.js";
import { readFirebaseConfig } from "./online-config.js";
import {
  applyCoupleInteraction,
  canRequestCoupleAction,
  chooseSimultaneousRequest,
  createCoupleInteraction,
  createEndingTargets,
  shouldAllowPiggyback,
} from "./couple-interactions.js";
import {
  clampRemotePosition,
  normalizeChatMessage,
  normalizeHeartsSnapshot,
  normalizePlayerState,
  normalizeRoomId,
  interpolatePlayerState,
  shouldResolveRemoteCollisions,
} from "./online-state.js";
import {
  loadSettings,
  normalizeSettings,
  resetSettings,
  saveSettings,
  SETTINGS_DEFAULTS,
} from "./settings.js";
import {
  advanceEndedTrack,
  decideJukeboxJoin,
  nextManualTrackIndex,
  nextTrackIndex,
  normalizeJukeboxState,
  playbackPosition,
} from "./jukebox-state.js";
import { computeCharacterPreviewCameraShift, computeCharacterPreviewDistance, computeCharacterPreviewZone } from "./character-preview-layout.js";
import {
  computeHudLayout,
  computeMobileLayout,
  layoutCssVariables,
  shouldBlockPortrait,
} from "./mobile-layout.js";
import { createMuseumWorld } from "./world.js";
import "./style.css";

const sceneElement = document.querySelector("#scene");
const appContainer = document.querySelector("#app");
const titleScreen = document.querySelector("#title-screen");
const titleCard = document.querySelector(".title-card");
const welcomePhase = document.querySelector("#welcome-phase");
const characterPhase = document.querySelector("#character-phase");
const enterButton = document.querySelector("#enter-button");
const startButton = document.querySelector("#start-button");
const loadingScreen = document.querySelector("#loading-screen");
const loadingMessage = document.querySelector("#loading-message");
const topCenterHud = document.querySelector("#top-center-hud");
const roomTitleCard = document.querySelector("#room-title-card");
const roomTitleKicker = document.querySelector("#room-title-kicker");
const roomTitleText = document.querySelector("#room-title-text");
const travelFade = document.querySelector("#travel-fade");
const layoutDebug = document.querySelector("#layout-debug");
const layoutCanvas = document.querySelector("#layout-canvas");
const layoutContext = layoutCanvas.getContext("2d");
const choiceButtons = [...document.querySelectorAll(".character-choice")];
const controlsHint = document.querySelector("#controls-hint");
const onlineStatus = document.querySelector("#online-status");
const partnerStatus = document.querySelector("#partner-status");
const settingsRoomCode = document.querySelector("#settings-room-code");
const guideToggle = document.querySelector("#guide-toggle");
const minimap = document.querySelector("#minimap");
const minimapCanvas = document.querySelector("#minimap-canvas");
const minimapContext = minimapCanvas.getContext("2d");
const memoriesToggle = document.querySelector("#memories-toggle");
const memoriesPanel = document.querySelector("#memory-travel");
const memoriesClose = document.querySelector("#memories-close");
const memoriesDragHandle = document.querySelector("#memories-drag-handle");
const memoriesRooms = document.querySelector("#memory-rooms");
const memoryStatus = document.querySelector("#memory-status");
const panelScrim = document.querySelector("#panel-scrim");
const musicStatus = document.querySelector("#music-status");
const musicTrackTitle = document.querySelector("#music-track-title");
const musicProgress = document.querySelector("#music-progress");
const musicProgressFill = document.querySelector("#music-progress-fill");
const musicTime = document.querySelector("#music-time");
const musicPreviousButton = document.querySelector("#music-previous");
const musicPlayButton = document.querySelector("#music-play");
const musicNextButton = document.querySelector("#music-next");
const musicShuffleButton = document.querySelector("#music-shuffle");
const musicRepeatButton = document.querySelector("#music-repeat");
const inviteCopyButton = document.querySelector("#invite-copy");
const inviteShareButton = document.querySelector("#invite-share");
const onlineRetryButton = document.querySelector("#online-retry");
const inviteFeedback = document.querySelector("#invite-feedback");
const networkDebug = document.querySelector("#network-debug");
const updateReloadButton = document.querySelector("#update-reload");
const mobileControls = document.querySelector("#mobile-controls");
const joystickZone = document.querySelector("#joystick-zone");
const joystick = document.querySelector("#joystick");
const joystickKnob = joystick.querySelector(".joystick-knob");
const runButton = document.querySelector("#run-button");
const actionCluster = document.querySelector("#action-cluster");
const hud = document.querySelector("#hud");
const heartCounter = document.querySelector("#heart-counter");
const heartDirectionHint = document.querySelector("#heart-direction-hint");
const heartDirectionArrow = heartDirectionHint.querySelector(".heart-direction-arrow");
const musicToggle = document.querySelector("#music-toggle");
const interactionButton = document.querySelector("#interaction-button");
const guestbook = document.querySelector("#guestbook");
const guestbookCloseButton = document.querySelector("#guestbook-close");
const guestbookForm = document.querySelector("#guestbook-form");
const guestbookMessage = document.querySelector("#guestbook-message");
const guestbookEntries = document.querySelector("#guestbook-entries");
const guestbookStatus = document.querySelector("#guestbook-status");
const chatToggle = document.querySelector("#chat-toggle");
const chatUnread = document.querySelector("#chat-unread");
const chatPanel = document.querySelector("#chat-panel");
const chatCloseButton = document.querySelector("#chat-close");
const chatHistory = document.querySelector("#chat-history");
const emoteButtons = document.querySelector("#chat-emote-buttons");
const chatEmojiOptions = document.querySelector("#chat-emoji-options");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatStatus = document.querySelector("#chat-status");
const emojiToggle = document.querySelector("#emoji-toggle");
const emojiPicker = document.querySelector("#emoji-picker");
const seatActions = document.querySelector("#seat-actions");
const coupleToggle = document.querySelector("#couple-toggle");
const coupleActionButton = document.querySelector("#couple-action-button");
const photoModeButton = document.querySelector("#photo-mode-button");
const photoThumbnail = document.querySelector("#photo-thumbnail");
const photoThumbnailImage = photoThumbnail.querySelector("img");
const photoStatus = document.querySelector("#photo-status");
const photoFlash = document.querySelector("#photo-flash");
const masterVolumeSlider = document.querySelector("#master-volume");
const couplePanel = document.querySelector("#couple-panel");
const couplePanelClose = document.querySelector("#couple-panel-close");
const coupleHint = document.querySelector("#couple-hint");
const coupleHoldMode = document.querySelector("#couple-hold-mode");
const coupleRequestPanel = document.querySelector("#couple-request");
const coupleRequestText = document.querySelector("#couple-request-text");
const coupleAcceptButton = document.querySelector("#couple-accept");
const coupleDeclineButton = document.querySelector("#couple-decline");
const lightingDebug = document.querySelector("#lighting-debug");
const lightingQualityControl = document.querySelector("#lighting-quality");
const lightingEffectToggles = document.querySelector("#lighting-effect-toggles");
const lightingFps = document.querySelector("#lighting-fps");
const lightingGrade = document.querySelector("#lighting-grade");
const settingsButton = document.querySelector("#settings-button");
const settingsSheet = document.querySelector("#settings-sheet");
const settingsCloseButton = document.querySelector("#settings-close");
const fullscreenButton = document.querySelector("#fullscreen-button");
const fullscreenIconPath = fullscreenButton.querySelector(".hud-icon path");
const settingsFullscreenButton = document.querySelector("#settings-fullscreen-button");
const installAppButton = document.querySelector("#install-app-button");
const installAppStatus = document.querySelector("#install-app-status");
const iosInstallHelp = document.querySelector("#ios-install-help");
const fullscreenTip = document.querySelector("#fullscreen-tip");
const fullscreenTipDismiss = document.querySelector("#fullscreen-tip-dismiss");
const orientationOverlay = document.querySelector("#orientation-overlay");
const editControlsButton = document.querySelector("#edit-controls-button");
const resetLayoutButton = document.querySelector("#reset-layout-button");
const resetCameraButton = document.querySelector("#reset-camera-button");
const resetSettingsButton = document.querySelector("#reset-settings-button");
const fpsCounter = document.querySelector("#fps-counter");
const renderDebug = document.querySelector("#render-debug");
const recommendedQuality = document.querySelector("#recommended-quality");
const coupleStopButton = document.querySelector("#couple-stop");
const coupleActionButtons = [...document.querySelectorAll(".couple-action[data-action]")];
const sitDebugControls = document.querySelector("#sit-debug-controls");
const sitDebugSlider = document.querySelector("#sit-debug-blend");
const sitDebugValue = document.querySelector("#sit-debug-value");
const speechLayer = document.querySelector("#speech-layer");
let isMobile = matchMedia("(pointer: coarse)").matches || window.innerWidth <= 760;
const reducedMotionPreference = matchMedia("(prefers-reduced-motion: reduce)");
let characterPreviewZone = null;
let characterPreviewBounds = null;
let characterPreviewViewport = null;
let characterPreviewCenterBias = { x: 0, y: 0 };
let previewSwitchTimer = 0;
let settings = loadSettings();
const params = new URLSearchParams(location.search);
const roomId = normalizeRoomId(params.get("room"), ONLINE_CONFIG.defaultRoomId);
const firebaseConfig = readFirebaseConfig(import.meta.env);
const debugCompare = params.get("debug") === "compare";
const debugSkeleton = params.get("debug") === "1";
const debugSit = params.get("debug") === "sit";
const debugPaths = params.get("debug") === "paths";
const debugLighting = params.get("debug") === "lighting";
const debugLayout = params.get("debug") === "layout";
const debugRender = params.get("debug") === "render";
let titleFlythroughActive = !debugCompare && !debugSkeleton && !debugSit && !debugPaths && !debugLighting && !debugLayout && !debugRender;
const scene = new THREE.Scene();
scene.background = new THREE.Color(ROOM_CONFIG.wallColor).multiplyScalar(0.4);
scene.fog = new THREE.FogExp2(0xe9c9b0, 0.0025);
const baseFogDensity = scene.fog.density;
const camera = new THREE.PerspectiveCamera(CAMERA_CONFIG.fov, 1, 0.15, 90);
const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
let qualityTier = getEffectiveQualityTier();
let lightingEffectState = {
  ...LIGHTING_CONFIG.effects,
  vignette: settings.graphics.vignette,
  bloom: settings.graphics.bloom,
  grain: settings.graphics.filmGrain,
  shafts: settings.graphics.lightShafts,
  dust: settings.graphics.dust,
  contactShadows: settings.graphics.shadows,
};
const renderDebugOverrides = {};
const renderDebugMaterials = new WeakMap();
const renderDebugMeshIndices = new WeakMap();
let renderDebugMeshIndex = 0;
let bloomComposer = null;
let bloomPass = null;
let bloomOutputPass = null;
const initialQuality = LIGHTING_CONFIG.qualityTiers[qualityTier] ?? LIGHTING_CONFIG.qualityTiers.Low;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, getPixelRatioCap(initialQuality)) * settings.graphics.renderScale);
renderer.domElement.setAttribute("aria-label", "3D museum scene");
renderer.domElement.style.touchAction = "none";
sceneElement.appendChild(renderer.domElement);

const ambientLight = new THREE.HemisphereLight(0xffead8, 0x78605b, ROOM_CONFIG.ambientIntensity);
scene.add(ambientLight);
const keyLight = new THREE.DirectionalLight(0xffd3aa, ROOM_CONFIG.keyLightIntensity);
const shadowLightOffset = new THREE.Vector3(...ROOM_CONFIG.keyLightPosition);
keyLight.position.copy(shadowLightOffset);
keyLight.castShadow = true;
// Keep real-time shadows focused on nearby characters; snap the target to texel steps to avoid shimmer.
keyLight.shadow.bias = -0.001;
keyLight.shadow.normalBias = 0.03;
keyLight.shadow.camera.left = -8;
keyLight.shadow.camera.right = 8;
keyLight.shadow.camera.top = 8;
keyLight.shadow.camera.bottom = -8;
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 24;
keyLight.shadow.camera.updateProjectionMatrix();
scene.add(keyLight.target);
scene.add(keyLight);

const collectedHearts = new Set();
const knownHeartIds = new Set(MUSEUM_CONFIG.hearts.map((heart) => heart.id));
try {
  localStorage.removeItem(APP_CONFIG.heartsStorageKey);
} catch (error) {
  console.warn("Could not clear previous collected museum hearts.", error);
}
const museum = createMuseumWorld(scene, { debug: debugSkeleton, debugSit, debugPaths, qualityTier, lightingEffects: lightingEffectState, collectedHearts });
if (import.meta.env?.DEV) {
  const coplanarArchitecture = museum.scanCoplanarArchitecture();
  console.info(
    `Architecture scan: ${coplanarArchitecture.length} same-facing overlapping vertical surface pairs within 5mm.`,
    coplanarArchitecture,
  );
}
museum.root.visible = titleFlythroughActive;
if (titleFlythroughActive) museum.loadRoomById("favorite-memories");
const previewPedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(1.05, 1.15, 0.12, 48),
  new THREE.MeshStandardMaterial({ color: ROOM_CONFIG.floorColor, roughness: ROOM_CONFIG.floorRoughness }),
);
previewPedestal.name = "characterPreviewPedestal";
previewPedestal.position.y = -0.06;
previewPedestal.receiveShadow = true;
previewPedestal.visible = !debugCompare && !titleFlythroughActive;
scene.add(previewPedestal);

const characterPair = createCharacterPair();
const contactShadowTexture = createContactShadowTexture();
for (const character of Object.values(characterPair)) {
  attachCharacterContactShadow(character);
  scene.add(character);
}
let selectedKind = getSavedCharacter();
let activeCharacter = characterPair[selectedKind];
let activeGroundY = 0;
let started = false;
let orientationPaused = false;
let skeletonHelpers = [];
let guestbookOpen = false;
let chatOpen = false;
let emojiPickerOpen = false;
let unreadMessages = 0;
let hasLoadedChatSnapshot = false;
let activeSeat = null;
let seatAction = null;
let sitting = false;
let sitBlend = 0;
let coupleInteraction = null;
let coupleRequest = null;
let coupleReply = null;
let coupleCommand = null;
let incomingCoupleRequest = null;
let coupleMenuOpen = false;
let coupleMissingSince = 0;
let coupleFollowerBasePose = null;
let lastCouplePose = null;
let orphanedCouple = null;
let coupleLastSafeLeaderPose = null;
let debugSitBlend = 1;
let activeEmote = null;
let activeEmoteId = "";
let activeEmoteUntil = 0;
let seatActionSignature = "";
const chatMessages = [];
const chatMessageIds = new Set();
const speechBubbles = new Map();
let blockedTime = 0;
let lastValidPosition = new THREE.Vector3(...MUSEUM_CONFIG.spawnPoints.main);
let audioContext = null;
let musicGain = null;
let musicBanks = [];
let activeMusicBank = 0;
let musicRoomId = "";
let musicMuted = settings.sound.muteAll;
let masterVolume = settings.sound.masterVolume;
let ambientElapsed = 0;
let footstepDistance = 0;
let loadingTimer = 0;
let loadingMessageIndex = 0;
let roomTitleTimer = 0;
let roomTitleFadeTimer = 0;
let roomTitleUntil = 0;
let photoCooldownUntil = 0;
let photoCaptureInProgress = false;
let photoThumbnailTimer = 0;
let photoThumbnailHideTimer = 0;
let photoObjectUrl = "";
let photoFile = null;
let photoStatusTimer = 0;
let photoFlashTimer = 0;
let objectEvent = null;
const receivedObjectEvents = new Set();
let secretUnlockAnnouncementShown = false;
let sessionElapsed = 0;
let renderedFrames = 0;
let dynamicResolutionScale = 1;
let resolutionSampleElapsed = 0;
let resolutionSampleFrames = 0;
let resolutionSampleStart = 0;
let activeRoomId = "";
let finalRoomCinematicPlayed = false;
let finalRoomCinematicElapsed = -1;
const jukeboxAudio = new Audio();
let jukeboxPlaylist = [];
let jukeboxState = null;
const jukeboxVolume = MUSEUM_CONFIG.jukebox.volume;
let jukeboxAudioTrackId = "";
let jukeboxPendingSeek = 0;
let jukeboxForceRestartAtZero = false;
let jukeboxAutoplayBlocked = false;
let jukeboxPausedForVisibility = false;
let jukeboxEntryRequested = false;
let jukeboxSyncAccumulator = 0;
let effectsGain = null;
let ambientGain = null;
let voiceGain = null;
let screenWakeLock = null;
let deferredInstallPrompt = null;
let settingsOpen = false;
let layoutDrag = null;
let runPointerId = null;
let runToggleState = false;
let joystickOrigin = null;
let floatingJoystickActive = false;
let viewportUpdateTimer = 0;
let targetFrameRate = settings.graphics.fpsCap;
let fpsSampleStart = 0;
let fpsSampleFrames = 0;
let lastObservedOnlineCount = 0;

const clock = new THREE.Clock();
const keys = new Set();
const input = new THREE.Vector2();
const velocity = new THREE.Vector3();
const cameraPosition = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();
const desiredCameraTarget = new THREE.Vector3();
const direction = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
let cameraYaw = 0;
let cameraPitch = MOVEMENT_CONFIG.cameraPitch;
let targetCameraFov = CAMERA_CONFIG.fov;
let cameraProjectionInitialized = false;
let targetHeading = 0;
let gaitPhase = 0;
let walkBlend = 0;
let runBlend = 0;
let joystickPointer = null;
let runButtonPressed = false;
let cameraPointer = null;
let previousCameraX = 0;
let previousCameraY = 0;
let lastFrame = 0;
let onlineSession = null;
let onlinePlayerId = null;
let onlinePlayerCount = 0;
let networkConnectionState = "not started";
let lastNetworkError = "";
let latestPingMs = null;
let statePublishAccumulator = 0;
let sessionSaveAccumulator = 0;
let serviceWorkerRegistration = null;
let reloadAfterServiceWorker = false;
let minimapAccumulator = 0;
const remotePlayers = new Map();
const sitDebugHelpers = [];

for (const character of Object.values(characterPair)) {
  character.visible = false;
}
activeCharacter.visible = !titleFlythroughActive;
activeCharacter.position.set(0, 0, 0);

if (debugCompare) {
  const referenceGroup = new THREE.Group();
  referenceGroup.name = "referenceModels";
  const reference = createReferenceResha();
  reference.position.set(0.8, 0, 0);
  reference.userData.reference = true;
  referenceGroup.add(reference);
  scene.add(referenceGroup);
}

if (debugSkeleton) {
  for (const character of Object.values(characterPair)) {
    const helper = createDebugRig(character);
    skeletonHelpers.push(helper);
    scene.add(helper.lines);
    createAttachPointVisuals(character);
    const scale = CHARACTER_HEIGHTS[character.userData.kind];
    const radius = COLLISION_CONFIG.capsuleRadius * scale;
    const height = COLLISION_CONFIG.capsuleHeight * scale;
    const capsule = new THREE.Group();
    capsule.name = `${character.name}-debug-capsule`;
    const material = new THREE.MeshBasicMaterial({
      color: 0xff4b55,
      wireframe: true,
      transparent: true,
      opacity: 0.72,
      depthTest: false,
    });
    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height - 2 * radius, 12, 1, true),
      material,
    );
    cylinder.position.y = height / 2;
    const capGeometry = new THREE.SphereGeometry(radius, 12, 8);
    const lowerCap = new THREE.Mesh(capGeometry, material);
    lowerCap.position.y = radius;
    const upperCap = new THREE.Mesh(capGeometry, material);
    upperCap.position.y = height - radius;
    capsule.add(cylinder, lowerCap, upperCap);
    character.add(capsule);
  }
}

if (debugSit) {
  for (const character of Object.values(characterPair)) {
    const helper = createSittingDebug(character);
    sitDebugHelpers.push(helper);
    scene.add(helper.lines);
    scene.add(helper.marker);
  }
}

function createAttachPointVisuals(character) {
  const visuals = [];
  for (const point of Object.values(character.userData.attachPoints)) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff3d72, depthTest: false }),
    );
    marker.name = `${point.name}-debug`;
    marker.renderOrder = 2;
    point.add(marker);
    visuals.push(marker);
  }
  return visuals;
}

function createDebugRig(character) {
  const names = [
    "hips", "spine", "neck", "head", "shoulderL", "elbowL", "wristL",
    "shoulderR", "elbowR", "wristR", "hipJointL", "kneeL", "ankleL",
    "hipJointR", "kneeR", "ankleR",
  ];
  const links = [
    ["hips", "spine"], ["spine", "neck"], ["neck", "head"],
    ["spine", "shoulderL"], ["shoulderL", "elbowL"], ["elbowL", "wristL"],
    ["spine", "shoulderR"], ["shoulderR", "elbowR"], ["elbowR", "wristR"],
    ["hips", "hipJointL"], ["hipJointL", "kneeL"], ["kneeL", "ankleL"],
    ["hips", "hipJointR"], ["hipJointR", "kneeR"], ["kneeR", "ankleR"],
  ];
  const joints = new Map();
  character.traverse((object) => {
    if (names.includes(object.name)) joints.set(object.name, object);
  });
  const markers = [];
  for (const [name, joint] of joints) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x33a6ff, depthTest: false }),
    );
    marker.name = `joint-debug:${name}`;
    marker.renderOrder = 2;
    joint.add(marker);
    markers.push(marker);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(links.length * 6), 3));
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0x33a6ff, depthTest: false }),
  );
  lines.name = `${character.name}-debug-skeleton`;
  lines.renderOrder = 1;
  return {
    character,
    joints,
    links: links.filter(([from, to]) => joints.has(from) && joints.has(to)),
    lines,
    markers,
    fromPosition: new THREE.Vector3(),
    toPosition: new THREE.Vector3(),
  };
}

function createSittingDebug(character) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xff4b55, depthTest: false }),
  );
  marker.name = `${character.name}-seat-attach-debug`;
  marker.renderOrder = 5;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(character.userData.seatRig.legs.length * 12), 3),
  );
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0xffe16b, depthTest: false }),
  );
  lines.name = `${character.name}-sit-limb-debug`;
  lines.renderOrder = 4;
  return {
    character,
    lines,
    marker,
    fromPosition: new THREE.Vector3(),
    toPosition: new THREE.Vector3(),
  };
}

function updateSittingDebug() {
  for (const helper of sitDebugHelpers) {
    helper.lines.visible = helper.character.visible;
    helper.marker.visible = helper.character.visible;
    if (!helper.character.visible) continue;
    const seatPoint = helper.character.userData.attachPoints.pelvis;
    seatPoint.updateWorldMatrix(true, false);
    seatPoint.getWorldPosition(helper.marker.position);
    const positions = helper.lines.geometry.attributes.position.array;
    for (const [index, leg] of helper.character.userData.seatRig.legs.entries()) {
      leg.hip.getWorldPosition(helper.fromPosition);
      positions.set(helper.fromPosition.toArray(), index * 12);
      leg.knee.getWorldPosition(helper.toPosition);
      positions.set(helper.toPosition.toArray(), index * 12 + 3);
      positions.set(helper.toPosition.toArray(), index * 12 + 6);
      leg.ankle.getWorldPosition(helper.fromPosition);
      positions.set(helper.fromPosition.toArray(), index * 12 + 9);
    }
    helper.lines.geometry.attributes.position.needsUpdate = true;
    helper.lines.geometry.computeBoundingSphere();
  }
  if (debugSit) {
    const rig = activeCharacter.userData.seatRig;
    const hips = rig.legs[0].hip.getWorldPosition(new THREE.Vector3());
    const knee = rig.legs[0].knee.getWorldPosition(new THREE.Vector3());
    networkDebug.textContent = [
      `Seat slot: ${activeSeat?.id ?? "none"}`,
      `Heading: ${activeCharacter.rotation.y.toFixed(3)} rad`,
      `Torso tilt: ${(THREE.MathUtils.radToDeg(rig.spine.rotation.x)).toFixed(1)}°`,
      `Hip: ${hips.x.toFixed(2)}, ${hips.y.toFixed(2)}, ${hips.z.toFixed(2)}`,
      `Knee: ${knee.x.toFixed(2)}, ${knee.y.toFixed(2)}, ${knee.z.toFixed(2)}`,
      `Skirt blend: ${rig.seatedSkirt?.userData.sitBlend?.toFixed(2) ?? "n/a"}`,
    ].join("\n");
  }
}

function getSavedCharacter() {
  try {
    const stored = localStorage.getItem(APP_CONFIG.characterStorageKey);
    return stored === "resha" ? "resha" : "daveRey";
  } catch (error) {
    console.warn("Could not read the saved character selection.", error);
    return "daveRey";
  }
}

function saveCharacter(kind) {
  try {
    localStorage.setItem(APP_CONFIG.characterStorageKey, kind);
  } catch (error) {
    console.warn("Could not save the character selection.", error);
  }
}

function detectInitialQualityTier() {
  const memory = navigator.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (isMobile || memory <= 4 || cores <= 4) return "Low";
  if (memory >= 8 && cores >= 8) return "High";
  return "Medium";
}

function getEffectiveQualityTier() {
  if (settings.graphics.batterySaver) return "Low";
  return settings.graphics.preset === "Auto" ? detectInitialQualityTier() : settings.graphics.preset;
}

function getPixelRatioCap(tier) {
  return isMobile
    ? Math.min(tier.pixelRatio, PERFORMANCE_CONFIG.mobilePixelRatioCap)
    : tier.pixelRatio;
}

function getMuseumRooms() {
  return [
    MUSEUM_CONFIG.architecture.atrium,
    MUSEUM_CONFIG.architecture.entranceHall,
    ...MUSEUM_CONFIG.architecture.chapters,
    ...MUSEUM_CONFIG.architecture.sideRooms,
  ];
}

function getMuseumRoomAtPosition(position) {
  const rooms = getMuseumRooms();
  return rooms.find(({ bounds }) =>
    position.x >= bounds.xMin && position.x <= bounds.xMax &&
    position.z >= bounds.zMin && position.z <= bounds.zMax,
  ) ?? rooms.reduce((nearest, room) => {
    const distance = Math.hypot(position.x - room.center[0], position.z - room.center[1]);
    return !nearest || distance < nearest.distance ? { room, distance } : nearest;
  }, null)?.room;
}

function getSurfaceAtPosition(position) {
  const room = getMuseumRooms().find(({ bounds }) =>
    position.x >= bounds.xMin && position.x <= bounds.xMax &&
    position.z >= bounds.zMin && position.z <= bounds.zMax,
  );
  const onCarpet = MUSEUM_CARPETS.some((carpet) =>
    carpet.roomId === room?.id &&
    Math.abs(position.x - carpet.position[0]) <= carpet.width / 2 &&
    Math.abs(position.z - carpet.position[2]) <= carpet.depth / 2,
  );
  return onCarpet ? "carpet" : room?.floorType ?? "wood";
}

function drawLayoutDebug() {
  if (!debugLayout || !layoutContext) return;
  const { width, height } = layoutCanvas;
  const bounds = MUSEUM_CONFIG.worldBounds;
  const padding = 28;
  const scale = Math.min(
    (width - padding * 2) / (bounds.maxX - bounds.minX),
    (height - padding * 2) / (bounds.maxZ - bounds.minZ),
  );
  const point = (x, z) => [
    padding + (x - bounds.minX) * scale,
    padding + (bounds.maxZ - z) * scale,
  ];
  layoutContext.clearRect(0, 0, width, height);
  layoutContext.font = "11px system-ui, sans-serif";
  layoutContext.textAlign = "center";
  for (const link of MUSEUM_ARCHWAYS) {
    const from = getMuseumRooms().find((room) => room.id === link.from);
    const to = getMuseumRooms().find((room) => room.id === link.to);
    if (!from || !to) continue;
    const start = point(...from.center);
    const end = point(...to.center);
    layoutContext.beginPath();
    layoutContext.setLineDash(link.kind === "open" ? [] : [5, 4]);
    layoutContext.strokeStyle = link.kind === "open" ? "#b38a4a" : "#b94e70";
    layoutContext.lineWidth = Math.max(2, link.width * scale * 0.18);
    layoutContext.moveTo(...start);
    layoutContext.lineTo(...end);
    layoutContext.stroke();
  }
  layoutContext.setLineDash([]);
  for (const room of getMuseumRooms()) {
    const topLeft = point(room.bounds.xMin, room.bounds.zMax);
    const bottomRight = point(room.bounds.xMax, room.bounds.zMin);
    const mood = ROOM_THEMES[room.id];
    layoutContext.fillStyle = `#${(mood?.wallColor ?? room.theme?.wallColor ?? 0xead8b9).toString(16).padStart(6, "0")}`;
    layoutContext.globalAlpha = 0.78;
    layoutContext.fillRect(topLeft[0], topLeft[1], bottomRight[0] - topLeft[0], bottomRight[1] - topLeft[1]);
    layoutContext.globalAlpha = 1;
    layoutContext.strokeStyle = "#705d4b";
    layoutContext.lineWidth = 1;
    layoutContext.strokeRect(topLeft[0], topLeft[1], bottomRight[0] - topLeft[0], bottomRight[1] - topLeft[1]);
    const label = room.title;
    layoutContext.fillStyle = "#30291f";
    layoutContext.fillText(label, (topLeft[0] + bottomRight[0]) / 2, (topLeft[1] + bottomRight[1]) / 2, bottomRight[0] - topLeft[0] - 4);
  }
  for (const prop of MUSEUM_PROPS) {
    const [x, , z] = prop.position;
    const location = point(x, z);
    if (prop.type === "rug") {
      layoutContext.strokeStyle = "#b38a4a";
      layoutContext.setLineDash([2, 2]);
      layoutContext.strokeRect(location[0] - prop.width * scale / 2, location[1] - prop.depth * scale / 2, prop.width * scale, prop.depth * scale);
      layoutContext.setLineDash([]);
    } else {
      layoutContext.beginPath();
      layoutContext.fillStyle = "#735866";
      layoutContext.arc(location[0], location[1], 2.2, 0, Math.PI * 2);
      layoutContext.fill();
    }
  }
  layoutContext.textAlign = "left";
  layoutContext.fillStyle = "#554433";
  layoutContext.fillText("Solid links; dashed link opens after collecting hearts", padding, height - 8);
}

function createEventId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getCharacterLabel(kind = selectedKind) {
  return kind === "resha" ? "Resha" : "Dave Rey";
}

function saveChatHistory() {
  try {
    localStorage.setItem(`museum.chat.${roomId}`, JSON.stringify(chatMessages));
  } catch (error) {
    console.warn("Could not save chat history on this device.", error);
    chatStatus.textContent = "Chat history could not be saved on this device.";
  }
}

function renderChatHistory() {
  chatHistory.replaceChildren();
  for (const message of chatMessages) {
    const item = document.createElement("li");
    const mine = message.senderId === "local" || message.senderId === onlineSession?.playerId;
    item.className = mine ? "chat-message mine" : "chat-message";
    const sender = document.createElement("strong");
    sender.textContent = message.senderName;
    const text = document.createElement("p");
    text.textContent = message.text;
    const time = document.createElement("time");
    time.dateTime = new Date(message.sentAt).toISOString();
    time.textContent = new Date(message.sentAt).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    item.append(sender, text, time);
    chatHistory.append(item);
  }
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function updateUnreadBadge() {
  chatUnread.hidden = unreadMessages === 0;
  chatUnread.textContent = unreadMessages > 99 ? "99+" : String(unreadMessages);
  chatToggle.setAttribute("aria-label", unreadMessages ? `Chat, ${unreadMessages} unread messages` : "Chat");
}

function setSpeechBubble(speakerId, text, isEmote = false) {
  const existing = speechBubbles.get(speakerId);
  if (existing) existing.element.remove();
  const element = document.createElement("div");
  element.className = isEmote ? "speech-bubble emote" : "speech-bubble";
  element.textContent = text;
  speechLayer.append(element);
  speechBubbles.set(speakerId, {
    element,
    expiresAt: performance.now() + CHAT_CONFIG.bubbleDurationMs,
  });
}

function addChatMessage(message, { announce = true, persist = true, bubble = true } = {}) {
  const normalized = normalizeChatMessage(
    message,
    message.senderId,
    message.senderName,
  );
  if (!normalized || chatMessageIds.has(normalized.id)) return false;
  chatMessageIds.add(normalized.id);
  chatMessages.push(normalized);
  chatMessages.sort((first, second) => first.sentAt - second.sentAt);
  if (chatMessages.length > CHAT_CONFIG.maxHistory) {
    chatMessages.splice(0, chatMessages.length - CHAT_CONFIG.maxHistory);
  }
  renderChatHistory();
  if (bubble && Date.now() - normalized.sentAt < CHAT_CONFIG.bubbleDurationMs) {
    const speakerId = normalized.senderId === "local" || normalized.senderId === onlineSession?.playerId
      ? "local"
      : normalized.senderId;
    setSpeechBubble(speakerId, normalized.text);
  }
  const isMine = normalized.senderId === "local" || normalized.senderId === onlineSession?.playerId;
  if (announce && !isMine && !chatOpen) {
    unreadMessages += 1;
    updateUnreadBadge();
  }
  if (persist) saveChatHistory();
  return true;
}

function loadChatHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(`museum.chat.${roomId}`) ?? "[]");
    if (!Array.isArray(stored)) throw new TypeError("Saved chat history must be an array.");
    for (const message of stored.slice(-CHAT_CONFIG.maxHistory)) {
      const normalized = normalizeChatMessage(message, message.senderId, message.senderName);
      if (normalized) addChatMessage(normalized, { announce: false, persist: false, bubble: false });
    }
  } catch (error) {
    console.warn("Could not read chat history.", error);
    chatStatus.textContent = "Saved chat history could not be loaded.";
  }
}

function updateChatMessages(messages) {
  for (const message of messages) {
    addChatMessage(message, { announce: hasLoadedChatSnapshot });
  }
  hasLoadedChatSnapshot = true;
}

function updateSpeechBubbles() {
  for (const [speakerId, bubble] of speechBubbles) {
    if (performance.now() >= bubble.expiresAt) {
      bubble.element.remove();
      speechBubbles.delete(speakerId);
      continue;
    }
    const character = speakerId === "local"
      ? activeCharacter
      : remotePlayers.get(speakerId)?.character;
    const head = character?.getObjectByName("head");
    if (!head) {
      bubble.element.hidden = true;
      continue;
    }
    bubble.element.hidden = false;
    head.updateWorldMatrix(true, false);
    const position = head.getWorldPosition(new THREE.Vector3());
    position.y += 0.26 * CHARACTER_HEIGHTS[character.userData.kind];
    position.project(camera);
    if (position.z < -1 || position.z > 1) {
      bubble.element.hidden = true;
      continue;
    }
    bubble.element.style.left = `${(position.x * 0.5 + 0.5) * window.innerWidth}px`;
    bubble.element.style.top = `${(-position.y * 0.5 + 0.5) * window.innerHeight}px`;
  }
}

function populateChatControls() {
  chatInput.maxLength = CHAT_CONFIG.maxMessageLength;
  for (const emoji of CHAT_CONFIG.emojis) {
    const button = document.createElement("button");
    button.className = "emoji-choice";
    button.type = "button";
    button.textContent = emoji;
    button.setAttribute("aria-label", `Insert ${emoji}`);
    chatEmojiOptions.append(button);
  }
  const emoteLabels = { wave: "👋 Wave", heart: "💕 Heart", dance: "💃 Dance" };
  for (const emote of CHAT_CONFIG.emoteNames) {
    const button = document.createElement("button");
    button.className = "emote-button";
    button.type = "button";
    button.dataset.emote = emote;
    button.textContent = emoteLabels[emote] ?? emote;
    emoteButtons.append(button);
  }
}

function updateChatSendAvailability() {
  chatForm.querySelector(".chat-send").disabled = chatInput.value.trim().length === 0;
}

function openChat(focusInput = false) {
  if (settingsOpen) setSettingsOpen(false);
  chatOpen = true;
  chatPanel.hidden = false;
  document.documentElement.classList.add("chat-open");
  resetActiveInput();
  positionChatForKeyboard();
  chatToggle.setAttribute("aria-expanded", "true");
  unreadMessages = 0;
  updateUnreadBadge();
  if (focusInput) requestAnimationFrame(() => chatInput.focus({ preventScroll: true }));
}

function resetActiveInput() {
  keys.clear();
  cameraPointer = null;
  if (joystickPointer) endJoystickPointer(joystickPointer.id);
  runPointerId = null;
  runButtonPressed = false;
  runToggleState = false;
  setRunButton(false);
  velocity.set(0, 0, 0);
}

function closeChat() {
  chatOpen = false;
  chatPanel.hidden = true;
  document.documentElement.classList.remove("chat-open");
  chatInput.blur();
  resetActiveInput();
  positionChatForKeyboard();
  chatToggle.setAttribute("aria-expanded", "false");
  emojiPickerOpen = false;
  emojiPicker.hidden = true;
  emojiToggle.setAttribute("aria-expanded", "false");
  chatToggle.focus();
}

function insertEmoji(emoji) {
  const start = chatInput.selectionStart ?? chatInput.value.length;
  const end = chatInput.selectionEnd ?? start;
  chatInput.value = `${chatInput.value.slice(0, start)}${emoji}${chatInput.value.slice(end)}`;
  chatInput.focus();
  const cursor = start + emoji.length;
  chatInput.setSelectionRange(cursor, cursor);
}

async function sendChatMessage(rawText) {
  const text = rawText.trim();
  if (!text) {
    chatStatus.textContent = "Write a message before sending.";
    return false;
  }
  if (text.length > CHAT_CONFIG.maxMessageLength) {
    chatStatus.textContent = `Messages can be up to ${CHAT_CONFIG.maxMessageLength} characters.`;
    return false;
  }
  const message = { id: createEventId(), text, sentAt: Date.now() };
  if (firebaseConfig) {
    if (!onlineSession) {
      chatStatus.textContent = "Chat is not connected yet. Try again when online play connects.";
      return false;
    }
    try {
      await onlineSession.sendMessage(message);
    } catch (error) {
      console.warn("Could not send chat message.", error);
      chatStatus.textContent = error?.message ?? "Could not send the message. Please try again.";
      return false;
    }
  } else {
    chatStatus.textContent = "Solo chat · messages stay on this device.";
  }
  const senderId = onlineSession?.playerId ?? "local";
  addChatMessage({
    ...message,
    senderId,
    senderName: getCharacterLabel(),
  }, { announce: false });
  if (chatOpen) chatStatus.textContent = firebaseConfig ? "" : "Solo chat · messages stay on this device.";
  return true;
}

function startEmote(name) {
  if (!CHAT_CONFIG.emoteNames.includes(name)) return;
  activeEmote = name;
  activeEmoteId = createEventId();
  activeEmoteUntil = Date.now() + CHAT_CONFIG.emoteDurationMs;
  const icons = { wave: "👋", heart: "💕", dance: "💃" };
  setSpeechBubble("local", icons[name] ?? "✨", true);
  onlineSession?.publish(getLocalNetworkState());
  if (firebaseConfig && networkConnectionState !== "connected") {
    chatStatus.textContent = "Emote is local until the online connection returns.";
  }
}

function positionChatForKeyboard() {
  const viewport = window.visualViewport;
  const isTyping = chatOpen && document.activeElement === chatInput;
  // Map the visible viewport back to the fixed panel's layout-viewport coordinates.
  const keyboardInset = isTyping && viewport
    ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
    : 0;
  const keyboardOpen = isTyping && keyboardInset > 80;
  const root = document.documentElement;
  const previousKeyboardState = root.classList.contains("chat-keyboard-open");
  root.classList.toggle("chat-typing", isTyping);
  root.classList.toggle("chat-keyboard-open", keyboardOpen);
  const visibleHeight = viewport?.height ?? window.innerHeight;
  const viewportOffsetTop = viewport?.offsetTop ?? 0;
  const safeArea = readSafeAreaInsets();
  const landscape = window.matchMedia("(orientation: landscape)").matches;
  const panelMaxHeight = landscape
    ? Math.max(0, visibleHeight - safeArea.top - safeArea.bottom - 16)
    : Math.min(420, visibleHeight * 0.5);
  chatPanel.style.setProperty("--chat-keyboard-inset", `${keyboardOpen ? keyboardInset : 0}px`);
  chatPanel.style.setProperty("--chat-visible-height", `${visibleHeight}px`);
  chatPanel.style.setProperty("--chat-viewport-offset-top", `${viewportOffsetTop}px`);
  chatPanel.style.setProperty("--chat-panel-max-height", `${panelMaxHeight}px`);
  if (viewport && keyboardOpen) {
    root.style.setProperty("--visual-viewport-height", `${viewport.height}px`);
    root.style.setProperty("--visual-viewport-offset-top", `${viewport.offsetTop}px`);
  } else {
    root.style.removeProperty("--visual-viewport-height");
    root.style.removeProperty("--visual-viewport-offset-top");
  }
  if (previousKeyboardState !== keyboardOpen) scheduleViewportUpdate();
  updateOrientationPresentation();
  syncRoomTitleVisibility();
}

function getSetting(path) {
  return path.split(".").reduce((value, key) => value?.[key], settings);
}

function setSetting(path, value) {
  const keys = path.split(".");
  const finalKey = keys.pop();
  const parent = keys.reduce((current, key) => current[key], settings);
  parent[finalKey] = value;
}

function getOrientationName() {
  return window.matchMedia("(orientation: landscape)").matches ? "landscape" : "portrait";
}

function readSafeAreaInsets() {
  const style = getComputedStyle(document.documentElement);
  const number = (name) => Number.parseFloat(style.getPropertyValue(name)) || 0;
  return {
    top: number("--safe-top"),
    right: number("--safe-right"),
    bottom: number("--safe-bottom"),
    left: number("--safe-left"),
  };
}

function applyMobileLayout() {
  const offsets = settings.controls.layout;
  const width = sceneElement.clientWidth || window.innerWidth;
  let height = sceneElement.clientHeight || window.innerHeight;
  if (document.documentElement.classList.contains("chat-keyboard-open")) {
    // Keep virtual-keyboard resizing from making the scene look rotated to control layout.
    height = getOrientationName() === "portrait"
      ? Math.max(height, width + 1)
      : Math.min(height, width - 1);
  }
  const safeArea = readSafeAreaInsets();
  const layout = computeMobileLayout({
    width,
    height,
    safeArea,
    scale: settings.controls.buttonSize,
    leftHanded: settings.controls.leftHanded,
    offsets,
  });
  const hudLayout = computeHudLayout({
    width,
    safeArea,
    labels: settings.controls.showButtonLabels,
    leftHanded: settings.controls.leftHanded,
  });
  for (const [name, value] of Object.entries(layoutCssVariables(layout))) {
    document.documentElement.style.setProperty(name, value);
  }
  document.documentElement.dataset.layoutValid = String(layout.valid);
  document.documentElement.dataset.orientation = layout.orientation;
  document.documentElement.classList.toggle("hud-wrap-quick-buttons", hudLayout.wrap);
  document.documentElement.classList.toggle("show-hud-button-labels", settings.controls.showButtonLabels);
  hud.classList.toggle("wrap-quick-buttons", hudLayout.wrap);
  hud.classList.toggle("left-handed", hudLayout.leftHanded);
  hud.classList.toggle("show-button-labels", settings.controls.showButtonLabels);
  mobileControls.classList.toggle("editing", settings.controls.editControls);
  mobileControls.classList.toggle("run-enabled", settings.controls.runMode !== "Edge-auto");
  mobileControls.classList.toggle("left-handed", settings.controls.leftHanded);
  document.documentElement.style.setProperty("--button-opacity", `${Math.round(settings.controls.buttonOpacity * 100)}%`);
  updateRoomTitleLayout();
  return layout;
}

function scheduleViewportUpdate() {
  window.clearTimeout(viewportUpdateTimer);
  viewportUpdateTimer = window.setTimeout(() => {
    resize();
    applyMobileLayout();
    updateOrientationPresentation();
  }, 80);
}

function updateOrientationPresentation() {
  const orientation = getOrientationName();
  const landscape = orientation === "landscape";
  const width = window.innerWidth;
  const height = window.innerHeight;
  const compactTouchDevice = matchMedia("(pointer: coarse)").matches &&
    Math.min(width, height) <= 900 &&
    Math.max(width, height) <= 1280;
  const shouldPause = started && shouldBlockPortrait({
    portrait: matchMedia("(orientation: portrait)").matches,
    width,
    height,
    coarsePointer: compactTouchDevice,
  });
  document.documentElement.dataset.orientation = orientation;
  document.documentElement.classList.toggle("landscape", landscape);
  orientationOverlay.hidden = !shouldPause;
  document.documentElement.classList.toggle("orientation-paused", shouldPause);
  if (orientationPaused !== shouldPause) {
    orientationPaused = shouldPause;
    keys.clear();
    cameraPointer = null;
    if (joystickPointer) endJoystickPointer(joystickPointer.id);
    runPointerId = null;
    runToggleState = false;
    setRunButton(false);
    velocity.set(0, 0, 0);
    if (shouldPause && audioContext?.state === "running") {
      audioContext.suspend().catch((error) => console.warn("Could not pause museum audio for portrait orientation.", error));
    } else if (!shouldPause && audioContext?.state === "suspended" && !settings.sound.muteAll) {
      audioContext.resume().catch((error) => console.warn("Could not resume museum audio after rotating to landscape.", error));
    }
  }
  updateFullscreenButton();
}

function updateFullscreenButton() {
  const fullscreen = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  fullscreenIconPath.setAttribute(
    "d",
    fullscreen
      ? "M3 8h5V3M16 3v5h5M21 16h-5v5M8 21v-5H3"
      : "M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5",
  );
  fullscreenButton.setAttribute("aria-label", fullscreen ? "Exit fullscreen" : "Enter fullscreen");
  settingsFullscreenButton.textContent = fullscreen ? "Exit fullscreen" : "Fullscreen";
}

function isAppleMobileDevice() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function showFullscreenTip() {
  try {
    fullscreenTip.hidden = localStorage.getItem("museum.fullscreen-tip.dismissed.v1") === "1";
  } catch {
    fullscreenTip.hidden = false;
  }
  document.documentElement.classList.toggle("fullscreen-tip-visible", !fullscreenTip.hidden);
}

async function installMuseumApp() {
  if (!deferredInstallPrompt) return;
  try {
    await deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    installAppStatus.hidden = false;
    installAppStatus.textContent = choice.outcome === "accepted"
      ? "The museum is being installed."
      : "You can install the museum later from this menu.";
  } catch (error) {
    console.warn("Could not start the app installation prompt.", error);
    installAppStatus.hidden = false;
    installAppStatus.textContent = "The browser could not open the install prompt.";
  } finally {
    deferredInstallPrompt = null;
    installAppButton.hidden = true;
  }
}

function setSettingsOpen(open) {
  if (open) {
    if (joystickPointer) endJoystickPointer(joystickPointer.id);
    cameraPointer = null;
    runToggleState = false;
    runButtonPressed = false;
    runPointerId = null;
    setRunButton(false);
    velocity.set(0, 0, 0);
  }
  settingsOpen = open;
  document.documentElement.classList.toggle("settings-open", open);
  settingsSheet.hidden = !open;
  settingsButton.setAttribute("aria-expanded", String(open));
  syncRoomTitleVisibility();
  if (open) {
    settingsSheet.classList.add("open");
    updateSettingsForm();
    requestAnimationFrame(() => settingsCloseButton.focus());
  } else {
    settingsSheet.classList.remove("open");
    settingsButton.focus({ preventScroll: true });
  }
}

function updateSettingsForm() {
  for (const element of settingsSheet.querySelectorAll("[data-setting]")) {
    const value = getSetting(element.dataset.setting);
    if (element.classList.contains("setting-segmented")) {
      for (const button of element.querySelectorAll("button[data-value]")) {
        const selected = button.dataset.valueType === "number"
          ? Number(button.dataset.value) === value
          : button.dataset.value === String(value);
        button.setAttribute("aria-pressed", String(selected));
      }
      continue;
    }
    if (element.type === "checkbox") element.checked = Boolean(value);
    else element.value = String(value);
    updateSettingOutput(element);
  }
  editControlsButton.textContent = settings.controls.editControls ? "Finish editing controls" : "Edit controls";
  recommendedQuality.textContent = `Recommended for your phone: ${detectInitialQualityTier()}`;
  settingsRoomCode.textContent = `Room code: ${roomId}`;
  updateMusicButton();
}

function bindSettingsInputs() {
  for (const element of settingsSheet.querySelectorAll("[data-setting]")) {
    if (element.classList.contains("setting-segmented")) {
      element.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-value]");
        if (!button) return;
        const value = button.dataset.valueType === "number" ? Number(button.dataset.value) : button.dataset.value;
        setSetting(element.dataset.setting, value);
        commitSettings(element.dataset.setting);
        triggerHaptic(6);
      });
      continue;
    }
    const eventName = element.type === "range" ? "input" : "change";
    element.addEventListener(eventName, () => {
      const { setting } = element.dataset;
      const value = element.type === "checkbox"
        ? element.checked
        : element.tagName === "SELECT" && element.type === "select-one" &&
          SETTINGS_DEFAULTS.graphics.fpsCap === Number(element.value)
          ? Number(element.value)
          : element.type === "range" ? Number(element.value) : element.value;
      setSetting(setting, value);
      updateSettingOutput(element);
      commitSettings(setting);
      triggerHaptic(6);
    });
  }
}

function resetCameraSettings() {
  settings.camera = JSON.parse(JSON.stringify(SETTINGS_DEFAULTS.camera));
  commitSettings("camera.reset");
}

function resetControlLayout() {
  settings.controls.layout = JSON.parse(JSON.stringify(SETTINGS_DEFAULTS.controls.layout));
  commitSettings("controls.layout");
}

function beginLayoutControlDrag(side, event) {
  if (!settings.controls.editControls || event.button > 0) return false;
  event.preventDefault();
  event.stopPropagation();
  layoutDrag = { id: event.pointerId, side, x: event.clientX, y: event.clientY };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  return true;
}

function moveLayoutControlDrag(event) {
  if (!layoutDrag || layoutDrag.id !== event.pointerId) return false;
  const deltaX = event.clientX - layoutDrag.x;
  const deltaY = event.clientY - layoutDrag.y;
  if (layoutDrag.side === "left") {
    settings.controls.layout.leftX += settings.controls.leftHanded ? -deltaX : deltaX;
    settings.controls.layout.leftY -= deltaY;
  } else {
    settings.controls.layout.rightX += settings.controls.leftHanded ? deltaX : -deltaX;
    settings.controls.layout.rightY -= deltaY;
  }
  layoutDrag.x = event.clientX;
  layoutDrag.y = event.clientY;
  settings = normalizeSettings(settings);
  saveSettings(settings);
  applyMobileLayout();
  return true;
}

function endLayoutControlDrag(pointerId) {
  if (layoutDrag?.id !== pointerId) return;
  layoutDrag = null;
  triggerHaptic();
}

function updateSettingOutput(element) {
  const output = element.parentElement.querySelector("output");
  if (!output || element.type !== "range") return;
  const value = Number(element.value);
  const path = element.dataset.setting;
  output.value = path.includes("Volume") || path.startsWith("sound.")
    ? `${Math.round(value * 100)}%`
    : path.includes("Sensitivity") || path === "controls.buttonSize"
      ? `${value.toFixed(1)}×`
      : path.includes("renderScale") || path.includes("deadzone") || path.includes("Opacity")
        ? `${Math.round(value * 100)}%`
        : String(value);
  output.textContent = output.value;
}

function commitSettings(path) {
  settings = normalizeSettings(settings);
  saveSettings(settings);
  updateSettingsForm();
  if (path.startsWith("controls.")) {
    applyMobileLayout();
  }
  if (path.startsWith("camera.")) {
    configureCameraProjection();
  }
  if (path.startsWith("graphics.")) {
    applyLightingSettings();
  }
  if (path.startsWith("sound.")) {
    musicMuted = settings.sound.muteAll;
    masterVolume = settings.sound.masterVolume;
    updateSoundMix();
    updateJukeboxVolume();
  }
  if (path.startsWith("display.")) {
    document.documentElement.classList.toggle("reduced-motion", settings.display.reducedMotion);
    document.documentElement.classList.toggle("large-text", settings.display.largeText);
    minimap.hidden = !settings.display.showMinimap;
    if (settings.display.showMinimap) drawMinimap();
    updateOrientationPresentation();
    void updateScreenWakeLock();
  }
}

function applySettingsToRuntime() {
  settings = normalizeSettings(settings);
  settings.graphics.preset = settings.graphics.preset ?? SETTINGS_DEFAULTS.graphics.preset;
  musicMuted = settings.sound.muteAll;
  masterVolume = settings.sound.masterVolume;
  targetFrameRate = settings.graphics.fpsCap;
  document.documentElement.classList.toggle("reduced-motion", settings.display.reducedMotion);
  document.documentElement.classList.toggle("large-text", settings.display.largeText);
  updateSettingsForm();
  applyMobileLayout();
  minimap.hidden = !settings.display.showMinimap;
  applyLightingSettings();
  configureCameraProjection();
  updateSoundMix();
  updateOrientationPresentation();
  void updateScreenWakeLock();
}

function updateSoundMix() {
  if (audioContext) {
    const now = audioContext.currentTime;
    const mute = settings.sound.muteAll ? 0 : settings.sound.masterVolume;
    const synthDuck = jukeboxState?.playing && jukeboxPlaylist.length ? 0.12 : 1;
    musicGain?.gain.setTargetAtTime(mute * settings.sound.music * synthDuck, now, 0.12);
    effectsGain?.gain.setTargetAtTime(mute * settings.sound.effects, now, 0.12);
    ambientGain?.gain.setTargetAtTime(mute * settings.sound.ambient, now, 0.12);
    voiceGain?.gain.setTargetAtTime(mute * settings.sound.voice, now, 0.12);
  }
  updateJukeboxVolume();
}

async function updateScreenWakeLock() {
  if ((!started && !settings.display.keepScreenOn) || document.visibilityState !== "visible") {
    try {
      await screenWakeLock?.release();
    } catch {}
    screenWakeLock = null;
    return;
  }
  if (!navigator.wakeLock?.request || screenWakeLock) return;
  try {
    screenWakeLock = await navigator.wakeLock.request("screen");
    screenWakeLock.addEventListener("release", () => { screenWakeLock = null; }, { once: true });
  } catch {
    screenWakeLock = null;
  }
}

async function toggleFullscreen() {
  try {
    // Keep fullscreen scoped to the game; iOS Safari instead directs players to Add to Home Screen.
    const fullscreen = document.fullscreenElement || document.webkitFullscreenElement;
    if (fullscreen) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      screen.orientation?.unlock?.();
      return;
    }
    if (appContainer.requestFullscreen) await appContainer.requestFullscreen();
    else if (appContainer.webkitRequestFullscreen) appContainer.webkitRequestFullscreen();
    else {
      iosInstallHelp.hidden = !isAppleMobileDevice();
      return;
    }
    await applyOrientationLock();
  } catch (error) {
    console.warn("Could not change fullscreen mode.", error);
  }
}

async function applyOrientationLock() {
  if (!matchMedia("(pointer: coarse)").matches) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (Math.min(width, height) > 900 || Math.max(width, height) > 1280) return;
  try {
    await screen.orientation?.lock?.("landscape");
  } catch (error) {
    console.info("Landscape orientation lock is unavailable; the rotation overlay remains active.", error);
  }
}

function triggerHaptic(duration = 12) {
  if (settings.controls.haptics) navigator.vibrate?.(duration);
}

function updateMusicButton() {
  musicToggle.checked = settings.sound.muteAll;
}

function setOnlineStatus(text, kind = "ready") {
  if (kind === "partner") {
    const joined = /\bjoined\b|\bonline\b/i.test(text);
    partnerStatus.textContent = joined ? "Partner online" : "Partner offline";
    return;
  }
  onlineStatus.textContent = text;
  onlineStatus.dataset.state = kind;
  onlineRetryButton.hidden = kind !== "error";
  updatePartnerStatus();
}

function updatePartnerStatus() {
  if (!partnerStatus) return;
  const online = networkConnectionState === "connected" && remotePlayers.size > 0;
  partnerStatus.textContent = online ? "Partner online" : "Partner offline";
}

function updateNetworkDiagnostics(details = {}) {
  onlinePlayerId = details.playerId ?? onlinePlayerId;
  onlinePlayerCount = details.playerCount ?? onlinePlayerCount;
  networkConnectionState = details.connectionState ?? networkConnectionState;
  lastNetworkError = details.lastError ?? lastNetworkError;
  latestPingMs = details.pingMs ?? latestPingMs;
  updatePartnerStatus();
  if (!debugSkeleton) return;
  const playerIds = [...remotePlayers.keys()];
  if (onlinePlayerId) playerIds.unshift(onlinePlayerId);
  networkDebug.textContent = [
    `Room: ${details.roomId ?? roomId}`,
    `Player IDs: ${playerIds.join(", ") || "not assigned"}`,
    `Connection: ${networkConnectionState}`,
    `Players: ${onlinePlayerCount}`,
    `Local seat: ${activeSeat?.id ?? "none"} · pose ${sitBlend.toFixed(2)}`,
    `Local emote: ${activeEmote && Date.now() < activeEmoteUntil ? activeEmote : "none"}`,
    `Remote poses: ${[...remotePlayers].map(([id, remote]) => `${id} seat=${remote.target.seatId ?? "none"} sit=${remote.target.sitBlend.toFixed(2)} emote=${remote.target.emote ?? "none"}`).join(", ") || "none"}`,
    `Nearby seats: ${getNearbySeatGroups().map((seat) => `${seat.id}=${getSeatOccupant(seat.id) ?? "free"}`).join(", ") || "none"}`,
    `Last network error: ${lastNetworkError || "none"}`,
    `Ping: ${latestPingMs === null ? "—" : `${latestPingMs} ms`}`,
  ].join("\n");
}

function createInviteLink() {
  const url = new URL(location.href);
  url.searchParams.set("room", roomId);
  url.searchParams.delete("debug");
  return url.toString();
}

function showInviteFeedback(text) {
  inviteFeedback.textContent = text;
  window.setTimeout(() => {
    if (inviteFeedback.textContent === text) inviteFeedback.textContent = "";
  }, 3500);
}

async function copyInviteLink() {
  try {
    await navigator.clipboard.writeText(createInviteLink());
    showInviteFeedback("Invite link copied");
  } catch (error) {
    console.warn("Could not copy the invite link.", error);
    showInviteFeedback("Could not copy the link; copy it from the address bar.");
  }
}

async function shareInviteLink() {
  try {
    await navigator.share({
      title: "Meet me in Our Museum",
      text: "Join me in our museum.",
      url: createInviteLink(),
    });
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.warn("Could not share the invite link.", error);
      showInviteFeedback("Sharing failed; use Copy invite link instead.");
    }
  }
}

function saveOnlineState() {
  if (!started) return;
  try {
    sessionStorage.setItem(`${ONLINE_CONFIG.sessionStorageKey}.${roomId}`, JSON.stringify({
      x: activeCharacter.position.x,
      y: activeGroundY,
      z: activeCharacter.position.z,
      heading: activeCharacter.rotation.y,
      seatId: activeSeat?.id ?? null,
      sitBlend,
    }));
  } catch (error) {
    console.warn("Could not save the online player state for reconnect.", error);
  }
}

function restoreOnlineState() {
  try {
    const stored = sessionStorage.getItem(`${ONLINE_CONFIG.sessionStorageKey}.${roomId}`);
    if (!stored) return false;
    const state = JSON.parse(stored);
    const values = [state.x, state.y, state.z, state.heading].map(Number);
    if (values.some((value) => !Number.isFinite(value))) return false;
    const [x, y, z, heading] = values;
    const { worldBounds } = MUSEUM_CONFIG;
    const radius = COLLISION_CONFIG.capsuleRadius * CHARACTER_HEIGHTS[selectedKind];
    if (
      x < worldBounds.minX + radius || x > worldBounds.maxX - radius ||
      z < worldBounds.minZ + radius || z > worldBounds.maxZ - radius
    ) return false;
    activeCharacter.position.set(x, y, z);
    resolvePenetrations(
      activeCharacter.position,
      museum.colliders,
      radius,
      COLLISION_CONFIG.capsuleHeight * CHARACTER_HEIGHTS[selectedKind],
      COLLISION_CONFIG,
    );
    activeGroundY = museum.getGroundHeight(activeCharacter.position.x, activeCharacter.position.z, y);
    activeCharacter.position.y = activeGroundY;
    activeCharacter.rotation.y = heading;
    targetHeading = heading;
    const restoredSeat = typeof state.seatId === "string" && Number(state.sitBlend) >= 0.8
      ? museum.seats.find((seat) => seat.id === state.seatId)
      : null;
    if (restoredSeat) {
      activeSeat = restoredSeat;
      sitting = true;
      sitBlend = 1;
      activeCharacter.position.set(
        restoredSeat.position[0],
        museum.getGroundHeight(restoredSeat.position[0], restoredSeat.position[2], restoredSeat.floorY),
        restoredSeat.position[2],
      );
      activeGroundY = activeCharacter.position.y;
      applySeatedPose(
        activeCharacter,
        sitBlend,
        getSeatHeight(restoredSeat),
        CHARACTER_HEIGHTS[selectedKind],
        INTERACTION_CONFIG.seating,
        restoredSeat,
      );
    }
    return true;
  } catch (error) {
    console.warn("Could not restore the online player state.", error);
    return false;
  }
}

function getLocalNetworkState() {
  const interaction = getEffectiveCoupleInteraction();
  const pair = getCouplePair(interaction);
  const basePose = pair && !pair.localIsLeader ? coupleFollowerBasePose : null;
  return {
    x: basePose?.x ?? activeCharacter.position.x,
    y: basePose?.y ?? activeGroundY,
    z: basePose?.z ?? activeCharacter.position.z,
    heading: basePose?.heading ?? activeCharacter.rotation.y,
    walkBlend,
    runBlend,
    phase: gaitPhase,
    speed: Math.min(velocity.length() / (MOVEMENT_CONFIG.runSpeed * CHARACTER_HEIGHTS[selectedKind]), 1),
    seatId: activeSeat?.id ?? null,
    sitBlend,
    emote: activeEmote && Date.now() < activeEmoteUntil ? activeEmote : null,
    emoteId: activeEmoteId,
    emoteUntil: activeEmote && Date.now() < activeEmoteUntil ? activeEmoteUntil : 0,
    couple: coupleInteraction?.leaderId === onlinePlayerId ? coupleInteraction : null,
    coupleRequest,
    coupleReply,
    coupleCommand,
    objectEvent,
  };
}

function createContactShadowTexture() {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot((x - (size - 1) / 2) / (size / 2), (y - (size - 1) / 2) / (size / 2));
      const alpha = Math.max(0, 1 - distance) ** 2 * 180;
      const index = (y * size + x) * 4;
      data[index] = 38;
      data[index + 1] = 27;
      data[index + 2] = 34;
      data[index + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

function attachCharacterContactShadow(character) {
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.82, 0.62),
    new THREE.MeshBasicMaterial({
      map: contactShadowTexture,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  shadow.name = `${character.name}-contact-shadow`;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  shadow.renderOrder = 1;
  character.add(shadow);
  character.userData.contactShadow = shadow;
}

function getSharedNow() {
  return onlineSession?.getServerNow?.() ?? Date.now();
}

function setAssignedCharacter(kind) {
  if (!characterPair[kind] || kind === selectedKind) return;
  const position = activeCharacter.position.clone();
  const heading = activeCharacter.rotation.y;
  for (const character of Object.values(characterPair)) character.visible = false;
  selectedKind = kind;
  activeCharacter = characterPair[kind];
  activeCharacter.position.copy(position);
  activeCharacter.rotation.set(0, heading, 0);
  activeCharacter.visible = true;
  targetHeading = heading;
  activeGroundY = museum.getGroundHeight(position.x, position.z, position.y);
  activeCharacter.position.y = activeGroundY;
  lastValidPosition.copy(activeCharacter.position);
  if (activeSeat && sitBlend > 0) {
    applySeatedPose(
      activeCharacter,
      sitBlend,
      getSeatHeight(activeSeat),
      CHARACTER_HEIGHTS[selectedKind],
      INTERACTION_CONFIG.seating,
      activeSeat,
    );
  }
  for (const button of choiceButtons) {
    const selected = button.dataset.character === kind;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  saveCharacter(kind);
  updateCamera(true);
}

async function startOnlineSession() {
  if (!firebaseConfig) {
    const message = "Online unavailable · configure Firebase in .env.local";
    setOnlineStatus(message, "error");
    lastNetworkError = "Missing VITE_FIREBASE_* configuration";
    updateNetworkDiagnostics({ roomId, connectionState: "not configured", lastError: lastNetworkError });
    return;
  }
  setOnlineStatus("Connecting…", "connecting");
  try {
    if (!onlineSession) {
      const { createFirebaseSession } = await import("./firebase-session.js");
      onlineSession = createFirebaseSession({
        config: firebaseConfig,
        roomId,
        preferredCharacter: selectedKind,
        getState: getLocalNetworkState,
        onStatus: ({ text, kind }) => setOnlineStatus(text, kind),
        onPlayers: updateRemotePlayers,
        onMessages: updateChatMessages,
        onHeartsChanged: handleSharedHeartsChanged,
        onJukeboxJoin: prepareJukeboxForJoin,
        onJukeboxChanged: applyJukeboxSnapshot,
        onCharacter: setAssignedCharacter,
        onDiagnostics: updateNetworkDiagnostics,
        onError: (error) => {
          lastNetworkError = error?.code ? `${error.code}: ${error.message}` : error?.message ?? String(error);
          updateNetworkDiagnostics({ roomId, lastError: lastNetworkError });
        },
        retryBaseMs: ONLINE_CONFIG.retryBaseMs,
        retryMaxMs: ONLINE_CONFIG.retryMaxMs,
        staleAfterMs: ONLINE_CONFIG.staleAfterMs,
        heartbeatMs: ONLINE_CONFIG.heartbeatMs,
        publishRate: ONLINE_CONFIG.publishRate,
      });
    }
    onlineSession.start();
  } catch (error) {
    console.error("Could not initialize online play.", error);
    lastNetworkError = error?.message ?? String(error);
    setOnlineStatus(`Online error · ${lastNetworkError}`, "error");
    updateNetworkDiagnostics({ roomId, lastError: lastNetworkError });
  }
}

function removeRemotePlayer(id) {
  const remote = remotePlayers.get(id);
  if (!remote) return;
  const interaction = remote.target?.couple;
  if (interaction?.leaderId === id && interaction.followerId === onlinePlayerId) {
    orphanedCouple = {
      interaction,
      leader: {
        x: remote.target.x,
        y: remote.target.y,
        z: remote.target.z,
        yaw: remote.target.heading,
      },
      missingAt: getSharedNow(),
    };
  }
  scene.remove(remote.character);
  remote.character.traverse((object) => {
    object.geometry?.dispose();
    if (Array.isArray(object.material)) {
      for (const material of object.material) material.dispose();
    } else {
      object.material?.dispose();
    }
  });
  remotePlayers.delete(id);
  updatePartnerStatus();
}

function updateRemotePlayers(players) {
  const currentIds = new Set();
  for (const player of players) {
    const state = normalizePlayerState(player.state);
    if (!state || !characterPair[player.character]) continue;
    applyRemoteObjectEvent(state.objectEvent);
    currentIds.add(player.id);
    let remote = remotePlayers.get(player.id);
    let created = false;
    if (remote && remote.kind !== player.character) {
      removeRemotePlayer(player.id);
      remote = null;
    }
    if (!remote) {
      const character = createCharacter(player.character);
      character.name = `Remote ${player.id}`;
      attachCharacterContactShadow(character);
      const initialState = { ...state };
      remote = {
        id: player.id,
        character,
        kind: player.character,
        target: initialState,
        current: initialState,
        groundY: state.y,
        emoteId: "",
      };
      scene.add(character);
      remotePlayers.set(player.id, remote);
      updatePartnerStatus();
      created = true;
    }
    remote.id = player.id;
    const scale = CHARACTER_HEIGHTS[player.character];
    const radius = COLLISION_CONFIG.capsuleRadius * scale;
    const position = clampRemotePosition(
      { x: state.x, y: state.y, z: state.z },
      MUSEUM_CONFIG.worldBounds,
      radius,
    );
    museum.loadRoomsAtPosition(position);
    const remotePosition = new THREE.Vector3(position.x, position.y, position.z);
    if (shouldResolveRemoteCollisions(state)) {
      resolvePenetrations(
        remotePosition,
        museum.colliders,
        radius,
        COLLISION_CONFIG.capsuleHeight * scale,
        COLLISION_CONFIG,
      );
    }
    position.x = remotePosition.x;
    position.z = remotePosition.z;
    position.y = museum.getGroundHeight(position.x, position.z, position.y);
    remote.target = { ...state, ...position };
    if (created) {
      remote.current = { ...remote.target };
      remote.groundY = remote.target.y;
      remote.character.position.set(remote.target.x, remote.target.y, remote.target.z);
      remote.character.rotation.y = remote.target.heading;
    }
    if (
      state.emoteId &&
      state.emoteId !== remote.emoteId &&
      state.emoteUntil > Date.now()
    ) {
      const emoteIcons = { wave: "👋", heart: "💕", dance: "💃" };
      setSpeechBubble(player.id, emoteIcons[state.emote] ?? "✨", true);
    }
    remote.emoteId = state.emoteId;
  }
  for (const id of remotePlayers.keys()) {
    if (!currentIds.has(id)) removeRemotePlayer(id);
  }
  updatePartnerStatus();
  updateNetworkDiagnostics({ playerCount: Math.min(2, players.length + (onlinePlayerId ? 1 : 0)) });
}

function updateRemoteCharacters(delta) {
  const interpolationConfig = {
    positionSmoothing: ONLINE_CONFIG.remotePositionSmoothing,
    turnSpeed: ONLINE_CONFIG.remoteTurnSpeed,
  };
  for (const remote of remotePlayers.values()) {
    const next = interpolatePlayerState(remote.current, remote.target, delta, interpolationConfig);
    const radius = COLLISION_CONFIG.capsuleRadius * CHARACTER_HEIGHTS[remote.kind];
    const position = clampRemotePosition(
      { x: next.x, y: next.y, z: next.z },
      MUSEUM_CONFIG.worldBounds,
      radius,
    );
    const remotePosition = new THREE.Vector3(position.x, position.y, position.z);
    if (shouldResolveRemoteCollisions(next)) {
      resolvePenetrations(
        remotePosition,
        museum.colliders,
        radius,
        COLLISION_CONFIG.capsuleHeight * CHARACTER_HEIGHTS[remote.kind],
        COLLISION_CONFIG,
      );
    }
    next.x = remotePosition.x;
    next.z = remotePosition.z;
    next.y = museum.getGroundHeight(next.x, next.z, next.y);
    remote.current = next;
    remote.groundY = next.y;
    remote.character.position.x = next.x;
    remote.character.position.z = next.z;
    remote.character.rotation.y = next.heading;
    const remoteSeat = museum.seats.find((seat) => seat.id === next.seatId) ?? null;
    animateCharacter(
      remote.character,
      next.walkBlend,
      next.runBlend,
      next.phase,
      next.speed,
      delta,
      remote.groundY,
      next.sitBlend,
      remoteSeat
        ? getSeatHeight(remoteSeat)
        : (next.seatId || next.sitBlend > 0 ? INTERACTION_CONFIG.seating.seatHeight : 0),
      next.emote,
      next.emoteUntil,
      remoteSeat,
    );
  }
}

function getRemotePlayer() {
  return remotePlayers.values().next().value ?? null;
}

function getEffectiveCoupleInteraction() {
  if (coupleInteraction && coupleInteraction.phase !== "FREE") return coupleInteraction;
  const remote = getRemotePlayer();
  if (!remote && orphanedCouple &&
      getSharedNow() - orphanedCouple.missingAt < COUPLE_INTERACTION_CONFIG.watchdogSeconds * 1000) {
    return orphanedCouple.interaction;
  }
  const interaction = remote?.target.couple ?? remote?.current.couple;
  if (!interaction || interaction.phase === "FREE") return null;
  if (interaction.leaderId !== remote.id || interaction.followerId !== onlinePlayerId) return null;
  if (interaction.phase === "ENDING" &&
      getSharedNow() - interaction.phaseStartedAt > COUPLE_INTERACTION_CONFIG.endingSeconds * 1000 +
      COUPLE_INTERACTION_CONFIG.watchdogSeconds * 1000) return null;
  return interaction;
}

function getCouplePair(interaction = getEffectiveCoupleInteraction()) {
  if (!interaction) return null;
  const remote = getRemotePlayer();
  if (interaction.leaderId === onlinePlayerId && remote?.id === interaction.followerId) {
    return { leader: activeCharacter, follower: remote.character, localIsLeader: true };
  }
  if (interaction.followerId === onlinePlayerId && remote?.id === interaction.leaderId) {
    return { leader: remote.character, follower: activeCharacter, localIsLeader: false };
  }
  return null;
}

function updateCoupleMenu() {
  if (couplePanel.hidden) return;
  const remote = getRemotePlayer();
  const distance = remote
    ? Math.hypot(
      remote.character.position.x - activeCharacter.position.x,
      remote.character.position.z - activeCharacter.position.z,
    )
    : Infinity;
  const remotePhase = remote?.target.couple?.phase ?? "FREE";
  let hint = remote ? "Move closer to invite your partner." : "Your partner must join online first.";
  if (sitting || seatAction) hint = "Stand up before starting a couple interaction.";
  if (remote?.target.sitBlend > 0) hint = "Your partner should stand up first.";
  if (coupleInteraction || remotePhase !== "FREE") hint = "Finish your current interaction first.";
  for (const button of coupleActionButtons) {
    const action = button.dataset.action;
    const reason = !remote
      ? "Partner is not connected"
      : sitting || seatAction
        ? "Stand up first"
        : remote.target.sitBlend > 0
          ? "Partner should stand up first"
        : canRequestCoupleAction(action, selectedKind, distance, "FREE", remotePhase);
    const piggybackUnavailable = action === "piggyback" && !shouldAllowPiggyback(selectedKind);
    button.disabled = Boolean(reason) || piggybackUnavailable || Boolean(coupleRequest);
    button.title = piggybackUnavailable ? "Only Dave Rey can carry Resha" : reason;
  }
  if (selectedKind === "resha" && remote && !sitting && !coupleInteraction && remotePhase === "FREE") {
    hint = "Only Dave Rey can carry Resha.";
  }
  coupleHint.textContent = hint;
}

function openCoupleMenu() {
  closeQuickPanels();
  coupleMenuOpen = true;
  couplePanel.hidden = false;
  coupleToggle.setAttribute("aria-expanded", "true");
  updateQuickPanelScrim();
  updateCoupleMenu();
}

function closeCoupleMenu() {
  coupleMenuOpen = false;
  couplePanel.hidden = true;
  coupleToggle.setAttribute("aria-expanded", "false");
  updateQuickPanelScrim();
}

function startCoupleRequest(action) {
  const remote = getRemotePlayer();
  if (!remote || sitting || seatAction || coupleInteraction) return;
  if (remote.target.sitBlend > 0) {
    coupleHint.textContent = "Your partner should stand up first.";
    return;
  }
  const distance = Math.hypot(
    remote.character.position.x - activeCharacter.position.x,
    remote.character.position.z - activeCharacter.position.z,
  );
  const reason = canRequestCoupleAction(
    action,
    selectedKind,
    distance,
    coupleInteraction?.phase ?? "FREE",
    remote.target.couple?.phase ?? "FREE",
  );
  if (reason) {
    coupleHint.textContent = reason;
    return;
  }
  const now = getSharedNow();
  const requestId = globalThis.crypto?.randomUUID?.() ??
    `couple-${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  coupleRequest = {
    requestId,
    action,
    requestedAt: now,
    leaderId: onlinePlayerId ?? "",
    targetId: remote.id,
    holdMode: action === "hug" && coupleHoldMode.checked,
  };
  incomingCoupleRequest = null;
  closeCoupleMenu();
}

function beginCoupleEnding(interaction = coupleInteraction) {
  if (!interaction || interaction.phase === "ENDING") return;
  const pair = getCouplePair(interaction);
  if (!pair?.localIsLeader) return;
  const targets = createEndingTargets(interaction, pair.leader, pair.follower);
  targets.endTo = findFreeCoupleExit(interaction.action, targets.endTo, pair);
  interaction.endFrom = targets.endFrom;
  interaction.endTo = targets.endTo;
  interaction.phase = "ENDING";
  interaction.phaseStartedAt = getSharedNow();
}

function findFreeCoupleExit(action, desired, pair) {
  const isFree = (pose, character) => {
    const scale = CHARACTER_HEIGHTS[character.userData.kind];
    const radius = COLLISION_CONFIG.capsuleRadius * scale;
    const candidate = clampRemotePosition(
      { x: pose.x, y: pose.y, z: pose.z },
      MUSEUM_CONFIG.worldBounds,
      radius,
    );
    if (Math.hypot(candidate.x - pose.x, candidate.z - pose.z) >
        COUPLE_INTERACTION_CONFIG.collisionTolerance) return null;
    const position = new THREE.Vector3(candidate.x, candidate.y, candidate.z);
    if (resolvePenetrations(
      position,
      museum.colliders,
      radius,
      COLLISION_CONFIG.capsuleHeight * scale,
      COLLISION_CONFIG,
    )) return null;
    return {
      ...pose,
      x: position.x,
      y: museum.getGroundHeight(position.x, position.z, pose.y),
      z: position.z,
    };
  };
  const leader = isFree(desired.leader, pair.leader);
  if (action === "piggyback") {
    if (leader) {
      for (let step = 0; step < COUPLE_INTERACTION_CONFIG.exitSearchDirections; step += 1) {
        const angle = desired.leader.yaw + Math.PI +
          (step * Math.PI * 2) / COUPLE_INTERACTION_CONFIG.exitSearchDirections;
        const followerCandidate = {
          ...desired.follower,
          x: leader.x + Math.cos(angle) * COUPLE_INTERACTION_CONFIG.releaseDistance,
          z: leader.z + Math.sin(angle) * COUPLE_INTERACTION_CONFIG.releaseDistance,
        };
        const follower = isFree(followerCandidate, pair.follower);
        if (follower) return { leader, follower };
      }
    }
    return desired;
  }
  const center = {
    x: (desired.leader.x + desired.follower.x) / 2,
    y: (desired.leader.y + desired.follower.y) / 2,
    z: (desired.leader.z + desired.follower.z) / 2,
  };
  for (let shift = 0; shift <= COUPLE_INTERACTION_CONFIG.exitSearchMaxShift;
    shift += COUPLE_INTERACTION_CONFIG.exitSearchStep) {
    for (let shiftStep = 0; shiftStep < (shift ? COUPLE_INTERACTION_CONFIG.exitSearchDirections : 1); shiftStep += 1) {
      const shiftAngle = (shiftStep * Math.PI * 2) / COUPLE_INTERACTION_CONFIG.exitSearchDirections;
      const shiftedCenter = {
        x: center.x + Math.cos(shiftAngle) * shift,
        y: center.y,
        z: center.z + Math.sin(shiftAngle) * shift,
      };
      for (let step = 0; step < COUPLE_INTERACTION_CONFIG.exitSearchDirections; step += 1) {
        const angle = (step * Math.PI * 2) / COUPLE_INTERACTION_CONFIG.exitSearchDirections;
        const offsetX = Math.cos(angle) * COUPLE_INTERACTION_CONFIG.releaseDistance / 2;
        const offsetZ = Math.sin(angle) * COUPLE_INTERACTION_CONFIG.releaseDistance / 2;
        const leaderCandidate = {
          ...desired.leader,
          x: shiftedCenter.x - offsetX,
          z: shiftedCenter.z - offsetZ,
        };
        const followerCandidate = {
          ...desired.follower,
          x: shiftedCenter.x + offsetX,
          z: shiftedCenter.z + offsetZ,
        };
        const safeLeader = isFree(leaderCandidate, pair.leader);
        const safeFollower = isFree(followerCandidate, pair.follower);
        if (safeLeader && safeFollower) return { leader: safeLeader, follower: safeFollower };
      }
    }
  }
  return desired;
}

function stopCoupleInteraction() {
  const interaction = getEffectiveCoupleInteraction();
  const pair = getCouplePair(interaction);
  if (!interaction || !pair) return;
  if (interaction.action === "piggyback" && pair.localIsLeader) return;
  if (pair.localIsLeader) {
    beginCoupleEnding(interaction);
    return;
  }
  const command = interaction.action === "piggyback" ? "getDown" : "stop";
  coupleCommand = {
    requestId: interaction.requestId,
    command,
    requestedById: onlinePlayerId ?? "",
    requestedAt: getSharedNow(),
  };
}

function updateCoupleController() {
  const now = getSharedNow();
  const remote = getRemotePlayer();
  const remoteState = remote?.target;
  const remoteRequest = remoteState?.coupleRequest;

  if (coupleRequest && now - coupleRequest.requestedAt > COUPLE_INTERACTION_CONFIG.requestTimeoutSeconds * 1000) {
    coupleRequest = null;
  }

  if (coupleRequest && remoteState?.coupleReply?.requestId === coupleRequest.requestId) {
    if (remoteState.coupleReply.accepted && remote) {
      const state = createCoupleInteraction(coupleRequest.action, activeCharacter, remote.character);
      state.leaderId = onlinePlayerId ?? "";
      state.followerId = remote.id;
      state.requestId = coupleRequest.requestId;
      state.startedAt = now;
      state.phaseStartedAt = now;
      state.holdMode = coupleRequest.action === "hug" && coupleRequest.holdMode;
      const slotsSafe = [state.toLeader, state.toFollower].every((pose) => {
        const radius = COLLISION_CONFIG.capsuleRadius * CHARACTER_HEIGHTS[
          pose === state.toLeader ? selectedKind : remote.kind
        ];
        const clamped = clampRemotePosition(pose, MUSEUM_CONFIG.worldBounds, radius);
        if (Math.hypot(clamped.x - pose.x, clamped.z - pose.z) >
            COUPLE_INTERACTION_CONFIG.collisionTolerance) return false;
        const position = new THREE.Vector3(pose.x, pose.y, pose.z);
        const moved = resolvePenetrations(
          position,
          museum.colliders,
          radius,
          COLLISION_CONFIG.capsuleHeight * CHARACTER_HEIGHTS[
            pose === state.toLeader ? selectedKind : remote.kind
          ],
          COLLISION_CONFIG,
        );
        return !moved;
      });
      if (!slotsSafe) {
        coupleReply = {
          requestId: coupleRequest.requestId,
          accepted: false,
          repliedAt: now,
        };
      } else {
        coupleInteraction = state;
        coupleLastSafeLeaderPose = { ...state.fromLeader };
        coupleMissingSince = 0;
      }
    }
    coupleRequest = null;
  }

  const localAndRemoteRequest = coupleRequest && remoteRequest &&
    remoteRequest.targetId === onlinePlayerId &&
    now - remoteRequest.requestedAt <= COUPLE_INTERACTION_CONFIG.requestTimeoutSeconds * 1000;
  if (localAndRemoteRequest) {
    const winner = chooseSimultaneousRequest(coupleRequest, remoteRequest);
    if (winner !== coupleRequest) coupleRequest = null;
  }
  incomingCoupleRequest = !coupleInteraction && remoteRequest &&
    remoteRequest.targetId === onlinePlayerId &&
    remoteState?.coupleReply?.requestId !== remoteRequest.requestId &&
    coupleReply?.requestId !== remoteRequest.requestId &&
    now - remoteRequest.requestedAt <= COUPLE_INTERACTION_CONFIG.requestTimeoutSeconds * 1000 &&
    (!coupleRequest || chooseSimultaneousRequest(coupleRequest, remoteRequest) === remoteRequest)
    ? { ...remoteRequest, requesterName: remote.kind === "resha" ? "Resha" : "Dave Rey" }
    : null;

  if (coupleReply?.accepted && remoteState?.coupleReply?.requestId === coupleReply.requestId &&
      !remoteState.coupleReply.accepted) {
    coupleReply = null;
  }

  if (coupleInteraction?.leaderId === onlinePlayerId) {
    if (!remote || remote.id !== coupleInteraction.followerId) {
      coupleMissingSince ||= now;
      if (now - coupleMissingSince >= COUPLE_INTERACTION_CONFIG.watchdogSeconds * 1000) {
        coupleInteraction = null;
        coupleLastSafeLeaderPose = null;
      }
    } else {
      coupleMissingSince = 0;
      const command = remoteState?.coupleCommand;
      if (command?.requestId === coupleInteraction.requestId &&
          command.requestedById === coupleInteraction.followerId &&
          (command.command === "stop" || (command.command === "getDown" && coupleInteraction.action === "piggyback"))) {
        beginCoupleEnding(coupleInteraction);
      }
      const elapsed = (now - coupleInteraction.phaseStartedAt) / 1000;
      if (coupleInteraction.phase === "ALIGNING" && elapsed >= COUPLE_INTERACTION_CONFIG.alignSeconds) {
        coupleInteraction.phase = "ACTIVE";
        coupleInteraction.phaseStartedAt = now;
        coupleInteraction.startedAt = now;
      } else if (coupleInteraction.phase === "ACTIVE") {
        const actionDuration = coupleInteraction.action === "hug" && !coupleInteraction.holdMode
          ? COUPLE_INTERACTION_CONFIG.hug.holdSeconds
          : coupleInteraction.action === "kissCheek" || coupleInteraction.action === "kissForehead"
            ? COUPLE_INTERACTION_CONFIG.kiss.durationSeconds
            : Infinity;
        if ((now - coupleInteraction.startedAt) / 1000 >= actionDuration) {
          beginCoupleEnding(coupleInteraction);
        }
      } else if (coupleInteraction.phase === "ENDING" &&
          elapsed >= COUPLE_INTERACTION_CONFIG.endingSeconds) {
        coupleInteraction = null;
        coupleCommand = null;
        coupleLastSafeLeaderPose = null;
      }
    }
  }

  if (orphanedCouple &&
      now - orphanedCouple.missingAt >= COUPLE_INTERACTION_CONFIG.watchdogSeconds * 1000) {
    const { interaction, leader } = orphanedCouple;
    let x = activeCharacter.position.x;
    let z = activeCharacter.position.z;
    if (Math.hypot(x - leader.x, z - leader.z) < COUPLE_INTERACTION_CONFIG.releaseDistance) {
      if (interaction.action === "piggyback") {
        x = leader.x - Math.sin(leader.yaw) * COUPLE_INTERACTION_CONFIG.releaseDistance;
        z = leader.z - Math.cos(leader.yaw) * COUPLE_INTERACTION_CONFIG.releaseDistance;
      } else {
        const dx = x - leader.x;
        const dz = z - leader.z;
        const distance = Math.hypot(dx, dz) || 1;
        x = leader.x + (dx / distance) * COUPLE_INTERACTION_CONFIG.releaseDistance;
        z = leader.z + (dz / distance) * COUPLE_INTERACTION_CONFIG.releaseDistance;
      }
    }
    const position = clampRemotePosition(
      { x, y: activeGroundY, z },
      MUSEUM_CONFIG.worldBounds,
      COLLISION_CONFIG.capsuleRadius * CHARACTER_HEIGHTS[selectedKind],
    );
    const landing = new THREE.Vector3(position.x, position.y, position.z);
    resolvePenetrations(
      landing,
      museum.colliders,
      COLLISION_CONFIG.capsuleRadius * CHARACTER_HEIGHTS[selectedKind],
      COLLISION_CONFIG.capsuleHeight * CHARACTER_HEIGHTS[selectedKind],
      COLLISION_CONFIG,
    );
    activeCharacter.position.set(
      landing.x,
      museum.getGroundHeight(landing.x, landing.z, activeGroundY),
      landing.z,
    );
    activeGroundY = activeCharacter.position.y;
    activeCharacter.rotation.y = leader.yaw;
    targetHeading = leader.yaw;
    resetCharacterPose(activeCharacter);
    coupleFollowerBasePose = null;
    orphanedCouple = null;
  }

  if (incomingCoupleRequest) {
    const action = actionRequestName(incomingCoupleRequest.action);
    coupleRequestText.textContent = `${incomingCoupleRequest.requesterName} wants to ${action}.`;
    coupleRequestPanel.hidden = false;
  } else {
    coupleRequestPanel.hidden = true;
  }
  const interaction = getEffectiveCoupleInteraction();
  const pair = getCouplePair(interaction);
  const localIsLeader = pair?.localIsLeader ?? false;
  const carrying = interaction?.action === "piggyback" && localIsLeader;
  const riding = interaction?.action === "piggyback" && !localIsLeader;
  if (interaction && pair) {
    const canStop = ["hold", "hug", "slowDance", "happyDance"].includes(interaction.action);
    coupleStopButton.hidden = !canStop && !riding;
    coupleStopButton.textContent = riding ? "Get down" : "Stop / Let go";
    if (carrying) coupleStopButton.hidden = true;
  } else {
    coupleStopButton.hidden = true;
  }
  updateCoupleMenu();
}

function actionRequestName(action) {
  return {
    hold: "hold hands",
    hug: "hug",
    kissCheek: "kiss your cheek",
    kissForehead: "kiss your forehead",
    piggyback: "give you a piggyback ride",
    slowDance: "slow dance",
    happyDance: "do a happy dance",
  }[action] ?? "interact";
}

function acceptCoupleRequest(accepted) {
  if (!incomingCoupleRequest || !onlinePlayerId) return;
  const remote = getRemotePlayer();
  if (accepted && remote && !sitting && !seatAction && !(remote.target.sitBlend > 0)) {
    const distance = Math.hypot(
      remote.character.position.x - activeCharacter.position.x,
      remote.character.position.z - activeCharacter.position.z,
    );
    const reason = canRequestCoupleAction(
      incomingCoupleRequest.action,
      remote.kind,
      distance,
      remote.target.couple?.phase ?? "FREE",
      coupleInteraction?.phase ?? "FREE",
    );
    if (reason) accepted = false;
  } else if (accepted) {
    accepted = false;
  }
  coupleReply = {
    requestId: incomingCoupleRequest.requestId,
    accepted,
    repliedAt: getSharedNow(),
  };
  incomingCoupleRequest = null;
  coupleRequestPanel.hidden = true;
}

function updateCoupleFacing(delta) {
  const remote = getRemotePlayer();
  const shouldFace = (coupleRequest || incomingCoupleRequest) && remote;
  if (!shouldFace) return;
  const yaw = Math.atan2(
    remote.character.position.x - activeCharacter.position.x,
    remote.character.position.z - activeCharacter.position.z,
  );
  activeCharacter.rotation.y = stepHeading(
    activeCharacter.rotation.y,
    yaw,
    true,
    MOVEMENT_CONFIG.turnSpeed,
    delta,
  );
}

function applyCouplePoses(delta) {
  const interaction = getEffectiveCoupleInteraction();
  const pair = getCouplePair(interaction);
  if (!interaction || !pair) {
    if (lastCouplePose) {
      const { leader, follower, phase } = lastCouplePose;
      resetCharacterPose(leader);
      resetCharacterPose(follower);
      for (const remote of remotePlayers.values()) {
        if (remote.character === leader || remote.character === follower) {
          const target = remote.target;
          remote.character.position.set(target.x, target.y, target.z);
          remote.character.rotation.set(0, target.heading, 0);
          break;
        }
      }
      if (activeCharacter === follower && phase !== "ENDING" && coupleFollowerBasePose) {
        activeCharacter.position.set(
          coupleFollowerBasePose.x,
          coupleFollowerBasePose.y,
          coupleFollowerBasePose.z,
        );
        activeCharacter.rotation.set(0, coupleFollowerBasePose.heading, 0);
        activeGroundY = coupleFollowerBasePose.y;
        targetHeading = coupleFollowerBasePose.heading;
      } else if (activeCharacter === leader && phase !== "ENDING") {
        activeCharacter.position.y = activeGroundY;
      }
      lastCouplePose = null;
    }
    coupleFollowerBasePose = null;
    return;
  }
  if (!pair.localIsLeader && !coupleFollowerBasePose) {
    coupleFollowerBasePose = {
      x: activeCharacter.position.x,
      y: activeGroundY,
      z: activeCharacter.position.z,
      heading: activeCharacter.rotation.y,
    };
  }
  const result = applyCoupleInteraction(
    interaction,
    pair.leader,
    pair.follower,
    getSharedNow(),
    COUPLE_INTERACTION_CONFIG,
    (character) => rebuildInteractionBasePose(character, delta),
  );
  if (pair.localIsLeader && ["hold", "piggyback"].includes(interaction.action) &&
      interaction.phase === "ACTIVE" && !isCoupleCharacterClear(pair.follower, interaction.action)) {
    if (coupleLastSafeLeaderPose) {
      pair.leader.position.set(
        coupleLastSafeLeaderPose.x,
        coupleLastSafeLeaderPose.y,
        coupleLastSafeLeaderPose.z,
      );
      pair.leader.rotation.y = coupleLastSafeLeaderPose.yaw;
      activeGroundY = pair.leader.position.y;
      velocity.set(0, 0, 0);
      walkBlend = 0;
      runBlend = 0;
      lastValidPosition.copy(pair.leader.position);
      applyCoupleInteraction(
        interaction,
        pair.leader,
        pair.follower,
        getSharedNow(),
        COUPLE_INTERACTION_CONFIG,
        (character) => rebuildInteractionBasePose(character, delta),
      );
      if (!isCoupleCharacterClear(pair.follower, interaction.action)) beginCoupleEnding(interaction);
    } else {
      beginCoupleEnding(interaction);
    }
  } else if (pair.localIsLeader && interaction.phase === "ACTIVE") {
    coupleLastSafeLeaderPose = {
      x: pair.leader.position.x,
      y: pair.leader.position.y,
      z: pair.leader.position.z,
      yaw: pair.leader.rotation.y,
    };
  }
  lastCouplePose = { leader: pair.leader, follower: pair.follower, phase: interaction.phase };
}

function rebuildInteractionBasePose(character, delta) {
  if (character === activeCharacter) {
    animateCharacter(
      character,
      walkBlend,
      runBlend,
      gaitPhase,
      Math.min(velocity.length() / (MOVEMENT_CONFIG.runSpeed * CHARACTER_HEIGHTS[selectedKind]), 1),
      delta,
      activeGroundY,
      sitBlend,
      activeSeat ? getSeatHeight(activeSeat) : 0,
      activeEmote,
      activeEmoteUntil,
      activeSeat,
    );
    return;
  }
  const remote = [...remotePlayers.values()].find((player) => player.character === character);
  if (!remote) return;
  const state = remote.current;
  const seat = museum.seats.find((item) => item.id === state.seatId) ?? null;
  animateCharacter(
    character,
    state.walkBlend,
    state.runBlend,
    state.phase,
    state.speed,
    delta,
    remote.groundY,
    state.sitBlend,
    seat ? getSeatHeight(seat) : 0,
    state.emote,
    state.emoteUntil,
    seat,
  );
}

function isCoupleCharacterClear(character, action) {
  const scale = CHARACTER_HEIGHTS[character.userData.kind];
  const radius = COLLISION_CONFIG.capsuleRadius * scale *
    (action === "piggyback" && character.userData.kind === "daveRey"
      ? COUPLE_INTERACTION_CONFIG.piggyback.colliderMultiplier
      : 1);
  const bounds = clampRemotePosition(
    { x: character.position.x, y: character.position.y, z: character.position.z },
    MUSEUM_CONFIG.worldBounds,
    radius,
  );
  if (Math.hypot(bounds.x - character.position.x, bounds.z - character.position.z) >
      COUPLE_INTERACTION_CONFIG.collisionTolerance) return false;
  const position = character.position.clone();
  return !resolvePenetrations(
    position,
    museum.colliders,
    radius,
    COLLISION_CONFIG.capsuleHeight * scale,
    COLLISION_CONFIG,
  );
}

function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadAfterServiceWorker) location.reload();
  });
  navigator.serviceWorker.register("/sw.js")
    .then((registration) => {
      serviceWorkerRegistration = registration;
      const showUpdatePrompt = () => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          updateReloadButton.hidden = false;
        }
      };
      showUpdatePrompt();
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        installing?.addEventListener("statechange", () => {
          if (installing.state === "installed") showUpdatePrompt();
        });
      });
      const checkForUpdate = () => {
        registration.update().catch((error) => console.warn("Could not check for a museum update.", error));
      };
      checkForUpdate();
      window.setInterval(checkForUpdate, 60 * 60 * 1000);
    })
    .catch((error) => console.warn("Could not register the museum service worker.", error));
}

function requestServiceWorkerUpdate() {
  if (!serviceWorkerRegistration?.waiting) {
    showInviteFeedback("The update is not ready yet; please try again shortly.");
    return;
  }
  reloadAfterServiceWorker = true;
  serviceWorkerRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
}

function startMusic() {
  const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextConstructor) {
    console.warn("Web Audio is not available; background music cannot be played.");
    musicToggle.disabled = true;
    return;
  }
  const initializeAudio = !audioContext;
  if (initializeAudio) {
    audioContext = new AudioContextConstructor();
    musicGain = audioContext.createGain();
    musicGain.connect(audioContext.destination);
    effectsGain = audioContext.createGain();
    ambientGain = audioContext.createGain();
    voiceGain = audioContext.createGain();
    effectsGain.connect(audioContext.destination);
    ambientGain.connect(audioContext.destination);
    voiceGain.connect(audioContext.destination);
    updateSoundMix();
    musicBanks = [];
    for (let bankIndex = 0; bankIndex < 2; bankIndex += 1) {
      const bankGain = audioContext.createGain();
      bankGain.gain.value = bankIndex === 0 ? 1 : 0;
      bankGain.connect(musicGain);
      const voiceGain = audioContext.createGain();
      voiceGain.gain.value = MUSEUM_CONFIG.music.volume / MUSEUM_CONFIG.music.frequencies.length;
      voiceGain.connect(bankGain);
      const oscillators = MUSEUM_CONFIG.music.frequencies.map((frequency) => {
        const oscillator = audioContext.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        oscillator.connect(voiceGain);
        oscillator.start();
        return oscillator;
      });
      musicBanks.push({ gain: bankGain, oscillators, frequencies: [...MUSEUM_CONFIG.music.frequencies] });
    }
  }
  audioContext.resume().catch((error) => console.warn("Could not start background music.", error));
  if (initializeAudio) crossfadeMusicRoom(activeRoomId || "entrance-hall");
}

function crossfadeMusicRoom(roomId) {
  if (!audioContext || !musicBanks.length || musicRoomId === roomId) return;
  const frequencies = ROOM_THEMES[roomId]?.music ?? MUSEUM_CONFIG.music.frequencies;
  const nextIndex = 1 - activeMusicBank;
  const nextBank = musicBanks[nextIndex];
  nextBank.frequencies = [...frequencies];
  nextBank.oscillators.forEach((oscillator, voice) => {
    oscillator.frequency.setTargetAtTime(
      frequencies[voice],
      audioContext.currentTime,
      0.18,
    );
  });
  const now = audioContext.currentTime;
  const fadeSeconds = MUSEUM_CONFIG.music.crossfadeSeconds;
  const previous = musicBanks[activeMusicBank];
  previous.gain.gain.cancelScheduledValues(now);
  previous.gain.gain.setValueAtTime(previous.gain.gain.value, now);
  previous.gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
  nextBank.gain.gain.cancelScheduledValues(now);
  nextBank.gain.gain.setValueAtTime(nextBank.gain.gain.value, now);
  nextBank.gain.gain.linearRampToValueAtTime(1, now + fadeSeconds);
  activeMusicBank = nextIndex;
  musicRoomId = roomId;
}

function playAudioCue(kind) {
  if (musicMuted || !started) return;
  const isAmbient = ["chimes", "fountain", "crickets"].includes(kind);
  if (isAmbient ? settings.sound.ambient <= 0 : kind === "chat" ? settings.sound.voice <= 0 : settings.sound.effects <= 0) return;
  if (!audioContext || !musicGain) startMusic();
  if (!audioContext || !musicGain) return;
  const sounds = {
    tap: { frequency: 620, duration: 0.045, volume: 0.065, type: "sine" },
    pickup: { frequency: 880, duration: 0.24, volume: 0.12, type: "sine" },
    unlock: { frequency: 1174.66, duration: 0.7, volume: 0.09, type: "sine" },
    chat: { frequency: 540, duration: 0.09, volume: 0.045, type: "sine" },
    chimes: { frequency: 720 + Math.random() * 300, duration: 0.8, volume: 0.035, type: "sine" },
    fountain: { frequency: 190 + Math.random() * 70, duration: 1.1, volume: 0.024, type: "triangle" },
    crickets: { frequency: 1700 + Math.random() * 400, duration: 0.16, volume: 0.018, type: "sine" },
    wood: { frequency: 105, duration: 0.07, volume: 0.095, type: "triangle" },
    marble: { frequency: 680, duration: 0.045, volume: 0.065, type: "triangle" },
    carpet: { frequency: 150, duration: 0.055, volume: 0.025, type: "sine" },
    grass: { frequency: 320, duration: 0.07, volume: 0.035, type: "triangle" },
    stone: { frequency: 420, duration: 0.05, volume: 0.05, type: "triangle" },
  };
  const sound = sounds[kind];
  if (!sound) return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = sound.type;
  oscillator.frequency.value = sound.frequency;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(sound.volume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + sound.duration);
  oscillator.connect(gain);
  const destination = isAmbient ? ambientGain : kind === "chat" ? voiceGain : effectsGain;
  gain.connect(destination ?? musicGain);
  oscillator.start(now);
  oscillator.stop(now + sound.duration + 0.02);
}

function updateRoomAmbience(delta) {
  if (!started || musicMuted || settings.sound.ambient <= 0 || audioContext?.state !== "running") return;
  const ambience = ROOM_THEMES[activeRoomId]?.ambience;
  if (!ambience || !MUSEUM_CONFIG.music.ambientIntervalSeconds[ambience]) return;
  ambientElapsed += delta;
  if (ambientElapsed < MUSEUM_CONFIG.music.ambientIntervalSeconds[ambience]) return;
  ambientElapsed = 0;
  playAudioCue(ambience);
}

function initializeLightingDebug() {
  lightingDebug.hidden = !debugLighting;
  if (debugLighting) {
    window.setInterval(() => {
      lightingFps.textContent = document.visibilityState === "visible"
        ? `FPS ${renderedFrames}`
        : "FPS -- · tab hidden";
      renderedFrames = 0;
    }, 1000);
  }
  for (const [effect, label] of [
    ["colorGrade", "Warm grade"],
    ["vignette", "Vignette"],
    ["shafts", "Sun shafts"],
    ["dust", "Dust"],
    ["bloom", "Bloom"],
    ["grain", "Film grain"],
    ["depthOfField", "Soft focus"],
    ["contactShadows", "Contact shadows"],
  ]) {
    const wrapper = document.createElement("label");
    const inputElement = document.createElement("input");
    inputElement.type = "checkbox";
    inputElement.checked = lightingEffectState[effect];
    inputElement.dataset.effect = effect;
    inputElement.addEventListener("change", () => {
      renderDebugOverrides[effect] = inputElement.checked;
      applyLightingSettings();
    });
    wrapper.append(inputElement, document.createTextNode(label));
    lightingEffectToggles.append(wrapper);
  }
  for (const button of lightingQualityControl.querySelectorAll("button[data-value]")) {
    button.setAttribute("aria-pressed", String(button.dataset.value === qualityTier));
    button.addEventListener("click", () => {
      qualityTier = button.dataset.value;
      for (const option of lightingQualityControl.querySelectorAll("button[data-value]")) {
        option.setAttribute("aria-pressed", String(option === button));
      }
      applyLightingSettings();
    });
  }
  applyLightingSettings();
}

function initializeLayoutDebug() {
  layoutDebug.hidden = !debugLayout;
  drawLayoutDebug();
}

function applyRenderDebugAppearance() {
  const tintMeshes = renderDebugOverrides.tintMeshes ?? false;
  const wireframe = renderDebugOverrides.wireframe ?? false;
  museum.root.traverse((object) => {
    if (!object.isMesh) return;
    let record = renderDebugMaterials.get(object);
    if (!record) {
      record = { original: object.material, diagnostic: null };
      renderDebugMaterials.set(object, record);
    }
    if (!tintMeshes && !wireframe) {
      if (record.diagnostic) {
        for (const material of Array.isArray(record.diagnostic) ? record.diagnostic : [record.diagnostic]) {
          material.dispose();
        }
        record.diagnostic = null;
      }
      object.material = record.original;
      return;
    }
    if (record.diagnostic) {
      for (const material of Array.isArray(record.diagnostic) ? record.diagnostic : [record.diagnostic]) {
        material.dispose();
      }
    }
    let index = renderDebugMeshIndices.get(object);
    if (index === undefined) {
      index = renderDebugMeshIndex++;
      renderDebugMeshIndices.set(object, index);
    }
    const hue = (index * 0.61803398875) % 1;
    const color = new THREE.Color().setHSL(hue, 0.78, 0.56);
    const originals = Array.isArray(record.original) ? record.original : [record.original];
    const diagnostics = originals.map((original) => {
      const material = tintMeshes
        ? new THREE.MeshBasicMaterial({ color })
        : original.clone();
      material.wireframe = wireframe;
      return material;
    });
    record.diagnostic = Array.isArray(record.original) ? diagnostics : diagnostics[0];
    object.material = record.diagnostic;
  });
}

function initializeRenderDebug() {
  renderDebug.hidden = !debugRender;
  if (!debugRender) return;
  const heading = document.createElement("strong");
  heading.textContent = "Render diagnostics";
  const note = document.createElement("p");
  note.textContent = "Toggle one effect at a time while watching a wall surface.";
  renderDebug.append(heading, note);
  const toggles = [
    ["bloom", "Bloom", settings.graphics.bloom],
    ["grain", "Film grain", settings.graphics.filmGrain],
    ["vignette", "Vignette", settings.graphics.vignette],
    ["shafts", "Light shafts", settings.graphics.lightShafts],
    ["dust", "Dust", settings.graphics.dust],
    ["carpets", "Carpets", true],
    ["reflections", "Floor reflections", settings.graphics.floorReflections],
    ["shadows", "Shadows", settings.graphics.shadows],
    ["architectureCasts", "Architecture casts shadows", true],
    ["architectureReceives", "Architecture receives shadows", true],
    ["tintMeshes", "Tint every mesh", false],
    ["wireframe", "Wireframe", false],
    ["fog", "Fog", true],
  ];
  for (const [effect, label, initial] of toggles) {
    const wrapper = document.createElement("label");
    const inputElement = document.createElement("input");
    inputElement.type = "checkbox";
    inputElement.checked = initial;
    inputElement.dataset.effect = effect;
    inputElement.addEventListener("change", () => {
      renderDebugOverrides[effect] = inputElement.checked;
      if (effect === "tintMeshes" || effect === "wireframe") applyRenderDebugAppearance();
      else applyLightingSettings();
    });
    wrapper.append(document.createTextNode(label), inputElement);
    renderDebug.append(wrapper);
  }
  const qualityLabel = document.createElement("div");
  qualityLabel.className = "render-debug-quality";
  qualityLabel.append(document.createTextNode("Diagnostic tier"));
  const qualityButtons = document.createElement("div");
  qualityButtons.className = "setting-segmented";
  qualityButtons.setAttribute("role", "group");
  qualityButtons.setAttribute("aria-label", "Diagnostic tier");
  for (const quality of ["Low", "High"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.value = quality;
    button.textContent = quality;
    button.setAttribute("aria-pressed", String(quality === qualityTier));
    button.addEventListener("click", () => {
      renderDebugOverrides.quality = quality;
      for (const option of qualityButtons.querySelectorAll("button")) {
        option.setAttribute("aria-pressed", String(option === button));
      }
      applyLightingSettings();
    });
    qualityButtons.append(button);
  }
  qualityLabel.append(qualityButtons);
  renderDebug.append(qualityLabel);
  const scaleLabel = document.createElement("label");
  scaleLabel.append(document.createTextNode("Render scale"));
  const scaleInput = document.createElement("input");
  scaleInput.type = "range";
  scaleInput.min = "0.5";
  scaleInput.max = "1";
  scaleInput.step = "0.5";
  scaleInput.value = String(settings.graphics.renderScale);
  scaleInput.addEventListener("input", () => {
    renderDebugOverrides.renderScale = Number(scaleInput.value);
    applyLightingSettings();
  });
  scaleLabel.append(scaleInput);
  renderDebug.append(scaleLabel);
}

function configureBloomPipeline(enabled) {
  // Keep the post-processing render targets out of Low/off mode to limit mobile GPU and memory cost.
  if (!enabled) {
    bloomPass?.material.dispose();
    bloomOutputPass?.material.dispose();
    bloomComposer?.dispose();
    bloomComposer = null;
    bloomPass = null;
    bloomOutputPass = null;
    return;
  }
  if (!bloomComposer) {
    bloomComposer = new EffectComposer(renderer);
    bloomComposer.addPass(new RenderPass(scene, camera));
    bloomPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        varying vec2 vUv;
        vec3 brightSample(vec2 uv) {
          vec3 color = texture2D(tDiffuse, uv).rgb;
          float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
          return color * smoothstep(0.86, 1.15, luminance);
        }
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          vec2 offset = 2.5 / resolution;
          vec3 glow = brightSample(vUv) * 0.2;
          glow += brightSample(vUv + vec2(offset.x, 0.0)) * 0.1;
          glow += brightSample(vUv - vec2(offset.x, 0.0)) * 0.1;
          glow += brightSample(vUv + vec2(0.0, offset.y)) * 0.1;
          glow += brightSample(vUv - vec2(0.0, offset.y)) * 0.1;
          glow += brightSample(vUv + offset) * 0.075;
          glow += brightSample(vUv - offset) * 0.075;
          glow += brightSample(vUv + vec2(offset.x, -offset.y)) * 0.075;
          glow += brightSample(vUv + vec2(-offset.x, offset.y)) * 0.075;
          gl_FragColor = vec4(base.rgb + glow * 0.2, base.a);
        }
      `,
    });
    bloomComposer.addPass(bloomPass);
    bloomOutputPass = new OutputPass();
    bloomComposer.addPass(bloomOutputPass);
  }
  bloomPass.uniforms.resolution.value.set(renderer.domElement.width, renderer.domElement.height);
  bloomComposer.setPixelRatio(renderer.getPixelRatio());
  bloomComposer.setSize(sceneElement.clientWidth, sceneElement.clientHeight);
}

function renderSceneFrame(delta = 0) {
  if (!started) renderer.render(scene, camera);
  else if (bloomComposer) bloomComposer.render(delta);
  else renderer.render(scene, camera);
}

function applyLightingSettings() {
  qualityTier = renderDebugOverrides.quality ?? getEffectiveQualityTier();
  targetFrameRate = settings.graphics.batterySaver ? 30 : settings.graphics.fpsCap;
  const tier = LIGHTING_CONFIG.qualityTiers[qualityTier] ?? LIGHTING_CONFIG.qualityTiers.Low;
  const pixelRatioCap = getPixelRatioCap(tier);
  const requestedScale = Math.min(
    renderDebugOverrides.renderScale ?? settings.graphics.renderScale,
    settings.graphics.batterySaver ? 0.7 : 1,
  );
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap) * requestedScale * dynamicResolutionScale);
  const shadowsEnabled = renderDebugOverrides.shadows ?? settings.graphics.shadows;
  renderer.shadowMap.enabled = shadowsEnabled && (qualityTier !== "Low" || debugRender);
  keyLight.castShadow = renderer.shadowMap.enabled;
  if (debugRender) {
    museum.setArchitectureShadows(
      renderDebugOverrides.architectureCasts ?? true,
      renderDebugOverrides.architectureReceives ?? true,
    );
  }
  const shadowMapSize = qualityTier === "High" || qualityTier === "Cinematic" ? 2048 : 1024;
  if (keyLight.shadow.mapSize.x !== shadowMapSize || keyLight.shadow.mapSize.y !== shadowMapSize) {
    keyLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    keyLight.shadow.map?.dispose();
    keyLight.shadow.map = null;
  }
  lightingEffectState = {
    colorGrade: renderDebugOverrides.colorGrade ?? true,
    vignette: renderDebugOverrides.vignette ?? settings.graphics.vignette,
    contactShadows: shadowsEnabled && (qualityTier !== "Low" || debugRender),
    shafts: (renderDebugOverrides.shafts ?? settings.graphics.lightShafts) && tier.shafts,
    dust: (renderDebugOverrides.dust ?? settings.graphics.dust) && tier.dust,
    bloom: (renderDebugOverrides.bloom ?? settings.graphics.bloom) && tier.bloom,
    grain: (renderDebugOverrides.grain ?? settings.graphics.filmGrain) && tier.grain,
    depthOfField: renderDebugOverrides.depthOfField ?? tier.depthOfField,
  };
  museum.setLightingQuality(qualityTier, lightingEffectState);
  configureBloomPipeline(lightingEffectState.bloom);
  fpsCounter.hidden = !settings.graphics.fpsCounter;
  const capabilities = {
    ...lightingEffectState,
    shafts: tier.shafts,
    dust: tier.dust,
    bloom: tier.bloom,
    grain: tier.grain,
  };
  for (const inputElement of lightingEffectToggles.querySelectorAll("input[data-effect]")) {
    inputElement.disabled = !capabilities[inputElement.dataset.effect];
    if (inputElement.dataset.effect in lightingEffectState) {
      inputElement.checked = lightingEffectState[inputElement.dataset.effect];
    }
  }
  for (const character of [...Object.values(characterPair), ...[...remotePlayers.values()].map(({ character }) => character)]) {
    if (character.userData.contactShadow) {
      character.userData.contactShadow.visible = lightingEffectState.contactShadows;
    }
  }
  lightingGrade.dataset.grade = String(lightingEffectState.colorGrade);
  lightingGrade.dataset.vignette = String(lightingEffectState.vignette);
  lightingGrade.dataset.bloom = String(tier.bloom && lightingEffectState.bloom);
  lightingGrade.dataset.grain = String(tier.grain && lightingEffectState.grain);
  lightingGrade.dataset.dof = String(tier.depthOfField && lightingEffectState.depthOfField);
  museum.setVisualOptions?.({
    carpets: renderDebugOverrides.carpets ?? true,
    reflections: renderDebugOverrides.reflections ?? settings.graphics.floorReflections,
  });
  scene.fog.density = renderDebugOverrides.fog === false ? 0 : baseFogDensity;
  resize();
}

function updateLighting(delta) {
  if (started) sessionElapsed += delta;
  const progress = Math.min(1, sessionElapsed / LIGHTING_CONFIG.sessionCycleSeconds);
  const duskColor = new THREE.Color(0xff9fbd);
  keyLight.color.lerpColors(new THREE.Color(0xffd3aa), duskColor, progress);
  keyLight.intensity = ROOM_CONFIG.keyLightIntensity * (1 - 0.42 * progress);
  ambientLight.intensity = ROOM_CONFIG.ambientIntensity * (1 - 0.16 * progress);
  museum.setTimeOfDay(progress);

  const room = getMuseumRoomAtPosition(activeCharacter.position);
  const theme = ROOM_THEMES[room?.id] ?? ROOM_THEMES.atrium;
  if (room?.id !== activeRoomId) {
    activeRoomId = room?.id ?? "";
    ambientElapsed = 0;
    if (!memoriesPanel.hidden) populateMemoryTargets();
    if (room) {
      showRoomTitle(room.title);
      crossfadeMusicRoom(room.id);
    }
    if (activeRoomId === "final-room" && !finalRoomCinematicPlayed) {
      finalRoomCinematicPlayed = museum.triggerFinalReveal();
      finalRoomCinematicElapsed = 0;
    }
  }
  if (finalRoomCinematicElapsed >= 0) {
    finalRoomCinematicElapsed += delta;
    if (finalRoomCinematicElapsed >= 4) finalRoomCinematicElapsed = -1;
  }
  if (renderDebugOverrides.fog === false) {
    scene.fog.density = 0;
  } else {
    const fogColor = new THREE.Color(theme.fogColor).lerp(duskColor, progress * 0.16);
    scene.fog.color.lerp(fogColor, 1 - Math.exp(-delta * 1.3));
    scene.fog.density += (theme.fogDensity - scene.fog.density) * (1 - Math.exp(-delta * 1.3));
    scene.background.lerp(fogColor.clone().multiplyScalar(0.4), 1 - Math.exp(-delta * 0.4));
  }
}

function showRoomTitle(title) {
  showHudPopup(title, "Now visiting");
}

function showHudPopup(text, kicker = "") {
  roomTitleKicker.textContent = kicker;
  roomTitleKicker.hidden = !kicker;
  roomTitleText.textContent = text;
  window.clearTimeout(roomTitleTimer);
  window.clearTimeout(roomTitleFadeTimer);
  roomTitleUntil = Date.now() + 2800;
  roomTitleCard.classList.remove("visible");
  roomTitleCard.hidden = !canShowRoomTitle();
  updateRoomTitleLayout();
  if (!roomTitleCard.hidden) {
    requestAnimationFrame(() => {
      if (canShowRoomTitle() && Date.now() < roomTitleUntil) roomTitleCard.classList.add("visible");
    });
  }
  roomTitleTimer = window.setTimeout(() => {
    roomTitleUntil = 0;
    roomTitleCard.classList.remove("visible");
    roomTitleFadeTimer = window.setTimeout(() => {
      roomTitleCard.hidden = true;
      updateRoomTitleLayout();
    }, 300);
  }, 2500);
}

function announceSecretRoomUnlocked({ delayMs = 0, playSound = true } = {}) {
  if (secretUnlockAnnouncementShown) return;
  secretUnlockAnnouncementShown = true;
  const announce = () => {
    showHudPopup("Secret Room unlocked", `All ${MUSEUM_CONFIG.hearts.length} hearts found`);
    if (!playSound) return;
    playAudioCue("tap");
    window.setTimeout(() => playAudioCue("pickup"), 130);
    window.setTimeout(() => playAudioCue("unlock"), 390);
  };
  if (delayMs > 0) window.setTimeout(announce, delayMs);
  else announce();
}

function canShowRoomTitle() {
  return started &&
    !settingsOpen &&
    memoriesPanel.hidden &&
    !document.documentElement.classList.contains("chat-keyboard-open");
}

function syncRoomTitleVisibility() {
  if (!canShowRoomTitle() || Date.now() >= roomTitleUntil) {
    roomTitleCard.classList.remove("visible");
    roomTitleCard.hidden = true;
    updateRoomTitleLayout();
    return;
  }
  const wasHidden = roomTitleCard.hidden;
  roomTitleCard.hidden = false;
  updateRoomTitleLayout();
  if (wasHidden) {
    roomTitleCard.classList.remove("visible");
    requestAnimationFrame(() => {
      if (canShowRoomTitle() && Date.now() < roomTitleUntil) roomTitleCard.classList.add("visible");
    });
  } else {
    roomTitleCard.classList.add("visible");
  }
}

function updateRoomTitleLayout() {
  const rootStyle = document.documentElement.style;
  const clearRoomTitleLayout = () => {
    topCenterHud.style.removeProperty("--top-center-hud-top");
    topCenterHud.style.removeProperty("--top-center-hud-width");
    rootStyle.removeProperty("--room-title-max-width");
  };
  if ((roomTitleCard.hidden && photoThumbnail.hidden && photoStatus.hidden) || hud.hidden) {
    clearRoomTitleLayout();
    return;
  }

  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const viewportTop = viewport?.offsetTop ?? 0;
  const safeArea = readSafeAreaInsets();
  const centerX = width / 2;
  const hudBounds = hud.getBoundingClientRect();
  const visibleTopButtons = [
    chatToggle,
    fullscreenButton,
    memoriesToggle,
    coupleToggle,
    photoModeButton,
    settingsButton,
  ].map((button) => button.getBoundingClientRect())
    .filter((bounds) =>
      bounds.width > 0 &&
      bounds.height > 0 &&
      bounds.top < hudBounds.bottom &&
      bounds.bottom > hudBounds.top,
    );
  const firstRowTop = Math.min(...visibleTopButtons.map((bounds) => bounds.top), hudBounds.top);
  const topRowButtons = visibleTopButtons.filter((bounds) => bounds.top <= firstRowTop + 2);
  let leftClearEdge = safeArea.left + 16;
  let rightClearEdge = width - safeArea.right - 16;
  let crossesCenter = false;
  const topRowsBottom = visibleTopButtons.reduce(
    (bottom, bounds) => Math.max(bottom, bounds.bottom),
    hudBounds.top,
  );
  for (const bounds of topRowButtons) {
    if (bounds.left < centerX && bounds.right > centerX) {
      crossesCenter = true;
    } else if (bounds.right <= centerX) {
      leftClearEdge = Math.max(leftClearEdge, bounds.right + 16);
    } else {
      rightClearEdge = Math.min(rightClearEdge, bounds.left - 16);
    }
  }
  const centeredGap = crossesCenter ? 0 : Math.max(0, Math.min(
    (centerX - leftClearEdge) * 2,
    (rightClearEdge - centerX) * 2,
  ));
  // Keep the readable title in the top-row gap only when it has room for a compact, unwrapped pill.
  const useTopRowGap = centeredGap >= 96;
  const safeWidth = width - safeArea.left - safeArea.right - 24;
  const maxWidth = Math.max(72, Math.min(
    width * 0.7,
    safeWidth,
    useTopRowGap ? centeredGap : safeWidth,
  ));
  const top = useTopRowGap
    ? viewportTop + safeArea.top + (viewportHeight <= 420 ? 4 : 8)
    : Math.max(viewportTop + safeArea.top + 8, topRowsBottom + 8);
  const minimapWidth = minimap.hidden ? 0 : Math.min(96, width * 0.24);
  const thumbnailWidth = photoThumbnail.hidden ? 0 : 64;
  const containerWidth = Math.max(maxWidth, minimapWidth, thumbnailWidth);
  const setIfChanged = (element, property, value) => {
    if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
  };
  setIfChanged(topCenterHud, "--top-center-hud-top", `${top}px`);
  setIfChanged(topCenterHud, "--top-center-hud-width", `${containerWidth}px`);
  setIfChanged(document.documentElement, "--room-title-max-width", `${maxWidth}px`);
}

function setMusicMuted(muted) {
  settings.sound.muteAll = muted;
  commitSettings("sound.muteAll");
  if (muted && audioContext?.state === "running") {
    audioContext.suspend().catch((error) => console.warn("Could not mute background music.", error));
  } else if (!muted && started) {
    startMusic();
  }
}

function setMasterVolume(value) {
  masterVolume = THREE.MathUtils.clamp(Number(value), 0, 1);
  if (!Number.isFinite(masterVolume)) masterVolume = MUSEUM_CONFIG.music.masterVolume;
  settings.sound.masterVolume = masterVolume;
  commitSettings("sound.masterVolume");
}

function readGuestbookEntries() {
  try {
    const stored = JSON.parse(localStorage.getItem(MUSEUM_CONFIG.guestbook.storageKey) ?? "[]");
    if (!Array.isArray(stored)) throw new TypeError("Guestbook entries must be stored as an array.");
    return stored.filter((entry) =>
      entry &&
      typeof entry.message === "string" &&
      typeof entry.date === "string",
    );
  } catch (error) {
    console.warn("Could not read guestbook entries.", error);
    guestbookStatus.textContent = "Saved notes could not be loaded on this device.";
    return [];
  }
}

function renderGuestbookEntries() {
  guestbookEntries.replaceChildren();
  for (const entry of readGuestbookEntries()) {
    const card = document.createElement("article");
    card.className = "guestbook-entry";
    const message = document.createElement("p");
    message.textContent = entry.message;
    const date = document.createElement("time");
    date.textContent = new Date(entry.date).toLocaleString();
    date.dateTime = entry.date;
    card.append(message, date);
    guestbookEntries.append(card);
  }
}

function openGuestbook() {
  guestbookOpen = true;
  guestbook.hidden = false;
  guestbookStatus.textContent = "";
  renderGuestbookEntries();
  requestAnimationFrame(() => guestbook.classList.add("open"));
  guestbookCloseButton.focus();
}

function closeGuestbook() {
  guestbookOpen = false;
  guestbook.classList.remove("open");
  window.setTimeout(() => {
    if (!guestbookOpen) guestbook.hidden = true;
  }, INTERACTION_CONFIG.overlayCloseAnimationMs);
}

function updateHeartCounter() {
  const text = `Hearts ${collectedHearts.size} / ${MUSEUM_CONFIG.hearts.length}`;
  if (heartCounter.textContent === text) return;
  heartCounter.textContent = text;
  heartCounter.classList.remove("heart-count-pop");
  void heartCounter.offsetWidth;
  heartCounter.classList.add("heart-count-pop");
}

function updateHeartHint() {
  const nearbyHearts = museum.hearts.filter((heart) =>
    !heart.collected &&
    heart.config.roomId === activeRoomId &&
    heart.room.group.visible);
  if (!started || !nearbyHearts.length) {
    heartDirectionHint.hidden = true;
    return;
  }
  const nearest = nearbyHearts.reduce((closest, heart) => {
    const distance = Math.hypot(
      heart.config.position[0] - activeCharacter.position.x,
      heart.config.position[2] - activeCharacter.position.z,
    );
    return !closest || distance < closest.distance ? { heart, distance } : closest;
  }, null);
  const dx = nearest.heart.config.position[0] - activeCharacter.position.x;
  const dz = nearest.heart.config.position[2] - activeCharacter.position.z;
  const right = dx * Math.cos(cameraYaw) - dz * Math.sin(cameraYaw);
  const forward = -dx * Math.sin(cameraYaw) - dz * Math.cos(cameraYaw);
  const bearing = Math.atan2(right, forward);
  const margin = 30;
  const radius = Math.min(window.innerWidth, window.innerHeight) * 0.39;
  const x = THREE.MathUtils.clamp(window.innerWidth / 2 + Math.sin(bearing) * radius, margin, window.innerWidth - margin);
  const y = THREE.MathUtils.clamp(window.innerHeight / 2 - Math.cos(bearing) * radius, margin, window.innerHeight - margin);
  heartDirectionHint.hidden = false;
  heartDirectionHint.style.left = `${x}px`;
  heartDirectionHint.style.top = `${y}px`;
  heartDirectionArrow.style.transform = `rotate(${bearing}rad)`;
}

function getConfiguredRooms() {
  return [
    MUSEUM_CONFIG.architecture.entranceHall,
    MUSEUM_CONFIG.architecture.atrium,
    ...MUSEUM_CONFIG.architecture.chapters,
    ...MUSEUM_CONFIG.architecture.sideRooms,
  ];
}

function isMemoryRoomLocked(room) {
  return (room.id === "secret-room" || room.id === "final-room") && !museum.secretRevealed;
}

function memoryRoomLabel(room) {
  if (room.id === "secret-room") return "Secret Room";
  if (room.id === "final-room") return "Final Room";
  return room.title;
}

function populateMemoryTargets() {
  const rooms = getConfiguredRooms();
  memoriesRooms.replaceChildren();
  for (const room of rooms) {
    const locked = isMemoryRoomLocked(room);
    const current = room.id === activeRoomId;
    const button = document.createElement("button");
    button.className = "memory-room-button";
    button.type = "button";
    button.classList.toggle("locked", locked);
    button.classList.toggle("current", current);
    button.setAttribute("aria-label", `${memoryRoomLabel(room)}${current ? ", You are here" : ""}${locked ? ", locked" : ""}`);
    const icon = document.createElement("span");
    icon.className = "memory-room-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = locked ? "🔒" : "⌂";
    const title = document.createElement("span");
    title.className = "memory-room-name";
    title.textContent = memoryRoomLabel(room);
    button.append(icon, title);
    if (current) {
      const currentDot = document.createElement("span");
      currentDot.className = "memory-current-dot";
      currentDot.setAttribute("aria-hidden", "true");
      const currentText = document.createElement("span");
      currentText.className = "visually-hidden";
      currentText.textContent = "You are here";
      button.append(currentDot, currentText);
    }
    button.addEventListener("click", () => {
      if (locked) {
        memoryStatus.textContent = "Collect hearts to unlock.";
        return;
      }
      void travelToMemory(room.id);
    });
    memoriesRooms.append(button);
  }
}

function drawMinimap() {
  if (minimap.hidden || !minimapContext) return;
  const context = minimapContext;
  const width = minimapCanvas.width;
  const height = minimapCanvas.height;
  const padding = 8;
  const bounds = MUSEUM_CONFIG.worldBounds;
  const scale = Math.min(
    (width - padding * 2) / (bounds.maxX - bounds.minX),
    (height - padding * 2) / (bounds.maxZ - bounds.minZ),
  );
  const mapPoint = (x, z) => [
    padding + (x - bounds.minX) * scale,
    height - padding - (z - bounds.minZ) * scale,
  ];
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f4efe5";
  context.fillRect(0, 0, width, height);
  for (const room of getConfiguredRooms()) {
    const { xMin, xMax, zMin, zMax } = room.bounds;
    const [left, bottom] = mapPoint(xMin, zMin);
    const [right, top] = mapPoint(xMax, zMax);
    const hidden = Boolean(room.hiddenUntilRevealed) && !museum.secretRevealed;
    context.fillStyle = hidden ? "#827a79" : room.id === "atrium" ? "#b89460" : "#cbbba2";
    context.fillRect(left, top, right - left, bottom - top);
    context.strokeStyle = "#665843";
    context.lineWidth = 1;
    context.strokeRect(left, top, right - left, bottom - top);
    context.fillStyle = hidden ? "#f7f0e5" : "#463a2b";
    context.font = "8px system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText(hidden ? "?" : room.title, (left + right) / 2, (top + bottom) / 2 + 3, right - left - 2);
  }
  for (const lane of MUSEUM_CONFIG.lanes) {
    const [x1, z1] = mapPoint(lane.start[0], lane.start[1]);
    const [x2, z2] = mapPoint(lane.end[0], lane.end[1]);
    context.strokeStyle = "rgb(80 175 128 / 68%)";
    context.lineWidth = Math.max(2, lane.width * scale);
    context.beginPath();
    context.moveTo(x1, z1);
    context.lineTo(x2, z2);
    context.stroke();
  }
  for (const heart of museum.hearts) {
    if (heart.collected || heart.config.roomId !== activeRoomId || !heart.room.group.visible) continue;
    const [heartX, heartY] = mapPoint(heart.config.position[0], heart.config.position[2]);
    context.beginPath();
    context.fillStyle = "#d94e70";
    context.strokeStyle = "#fff7e8";
    context.lineWidth = 2;
    context.arc(heartX, heartY, 5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  const [playerX, playerY] = mapPoint(activeCharacter.position.x, activeCharacter.position.z);
  context.fillStyle = "#d94e70";
  context.beginPath();
  context.arc(playerX, playerY, 4, 0, Math.PI * 2);
  context.fill();
  for (const remote of remotePlayers.values()) {
    const [remoteX, remoteY] = mapPoint(remote.current.x, remote.current.z);
    context.fillStyle = "#3979cf";
    context.beginPath();
    context.arc(remoteX, remoteY, 4, 0, Math.PI * 2);
    context.fill();
  }
}

function updateQuickPanelScrim() {
  panelScrim.hidden = memoriesPanel.hidden && couplePanel.hidden;
  document.documentElement.classList.toggle("quick-panel-open", !panelScrim.hidden);
}

function closeQuickPanels() {
  pendingMemoryTravel = null;
  memoriesPanel.hidden = true;
  memoriesToggle.setAttribute("aria-expanded", "false");
  closeCoupleMenu();
  updateQuickPanelScrim();
  syncRoomTitleVisibility();
}

function toggleMemories() {
  if (!memoriesPanel.hidden) {
    memoriesPanel.hidden = true;
    memoriesToggle.setAttribute("aria-expanded", "false");
    updateQuickPanelScrim();
    syncRoomTitleVisibility();
    return;
  }
  closeQuickPanels();
  memoriesPanel.hidden = false;
  memoriesToggle.setAttribute("aria-expanded", "true");
  memoryStatus.textContent = "";
  populateMemoryTargets();
  updateQuickPanelScrim();
  syncRoomTitleVisibility();
}

function findNearbyFreePoint(position, room) {
  const radius = COLLISION_CONFIG.capsuleRadius * CHARACTER_HEIGHTS[selectedKind];
  const capsuleHeight = COLLISION_CONFIG.capsuleHeight * CHARACTER_HEIGHTS[selectedKind];
  const offsets = [[0, 0]];
  for (let distance = 0.5; distance <= 2; distance += 0.5) {
    for (let step = 0; step < 16; step += 1) {
      const angle = (step / 16) * Math.PI * 2;
      offsets.push([Math.cos(angle) * distance, Math.sin(angle) * distance]);
    }
  }
  for (const [offsetX, offsetZ] of offsets) {
    const candidate = new THREE.Vector3(position[0] + offsetX, 0, position[2] + offsetZ);
    if (
      candidate.x < room.bounds.xMin + radius || candidate.x > room.bounds.xMax - radius ||
      candidate.z < room.bounds.zMin + radius || candidate.z > room.bounds.zMax - radius
    ) continue;
    const beforeX = candidate.x;
    const beforeZ = candidate.z;
    const collided = resolvePenetrations(candidate, museum.colliders, radius, capsuleHeight, COLLISION_CONFIG);
    if (!collided && Math.hypot(candidate.x - beforeX, candidate.z - beforeZ) < 0.001) return candidate;
  }
  return null;
}

let pendingMemoryTravel = null;
let memoriesDragStart = null;

function resetLocalPoseForTravel() {
  if (activeSeat || seatAction || sitting) {
    resetCharacterPose(activeCharacter);
    activeSeat = null;
    seatAction = null;
    sitting = false;
    sitBlend = 0;
    seatActionSignature = "";
  }
  if (coupleMenuOpen) closeCoupleMenu();
  if (coupleRequest) {
    coupleRequest = null;
    onlineSession?.publish(getLocalNetworkState());
  }
  if (incomingCoupleRequest) acceptCoupleRequest(false);
  if (joystickPointer) endJoystickPointer(joystickPointer.id);
  cameraPointer = null;
  runPointerId = null;
  runToggleState = false;
  setRunButton(false);
  input.set(0, 0);
  velocity.set(0, 0, 0);
}

function travelToMemory(roomId) {
  if (!started) return;
  const rooms = getConfiguredRooms();
  const room = rooms.find((item) => item.id === roomId);
  if (!room || isMemoryRoomLocked(room) || !museum.loadRoomById(room.id)) {
    memoryStatus.textContent = "Collect hearts to unlock.";
    return;
  }
  resetLocalPoseForTravel();
  const interaction = getEffectiveCoupleInteraction();
  if (interaction) {
    pendingMemoryTravel = room.id;
    memoryStatus.textContent = "Finishing your interaction…";
    const pair = getCouplePair(interaction);
    if (pair?.localIsLeader) beginCoupleEnding(interaction);
    else stopCoupleInteraction();
    return;
  }

  void performMemoryTravel(room);
}

async function performMemoryTravel(room) {
  const travelSpawn = MUSEUM_CONFIG.fastTravelSpawns[room.id];
  const position = travelSpawn?.position ?? [room.center[0], 0, room.center[1]];
  const heading = travelSpawn?.heading ?? 0;
  const freePoint = findNearbyFreePoint(position, room);
  if (!freePoint) {
    memoryStatus.textContent = "No clear viewing spot is available here.";
    return;
  }
  travelFade.hidden = false;
  travelFade.classList.remove("visible");
  requestAnimationFrame(() => travelFade.classList.add("visible"));
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  activeCharacter.position.copy(freePoint);
  activeGroundY = museum.getGroundHeight(freePoint.x, freePoint.z);
  activeCharacter.position.y = activeGroundY;
  activeCharacter.rotation.y = heading;
  targetHeading = heading;
  cameraYaw = heading;
  resetLocalPoseForTravel();
  velocity.set(0, 0, 0);
  lastValidPosition.copy(activeCharacter.position);
  museum.update(activeCharacter.position, 0);
  updateCamera(true);
  onlineSession?.publish(getLocalNetworkState());
  memoryStatus.textContent = `Visiting ${memoryRoomLabel(room)}.`;
  pendingMemoryTravel = null;
  closeQuickPanels();
  travelFade.classList.remove("visible");
  window.setTimeout(() => { travelFade.hidden = true; }, 130);
}

function processPendingMemoryTravel() {
  if (!pendingMemoryTravel || getEffectiveCoupleInteraction()) return;
  const roomId = pendingMemoryTravel;
  pendingMemoryTravel = null;
  const room = getConfiguredRooms().find((item) => item.id === roomId);
  if (room && !isMemoryRoomLocked(room) && museum.loadRoomById(room.id)) {
    void performMemoryTravel(room);
  }
}

function updateInteractions() {
  if (!started || guestbookOpen) {
    interactionButton.hidden = true;
    interactionButton.dataset.interactableId = "";
    return;
  }
  if (sitting) {
    if (isMobile) {
      interactionButton.hidden = true;
      interactionButton.dataset.interactableId = "";
      return;
    }
    interactionButton.hidden = false;
    interactionButton.disabled = false;
    interactionButton.textContent = "Stand";
    interactionButton.dataset.action = "stand";
    interactionButton.dataset.interactableId = "";
    interactionButton.setAttribute("aria-label", "Stand up");
    return;
  }
  if (seatAction) {
    if (isMobile) {
      interactionButton.hidden = true;
      interactionButton.dataset.interactableId = "";
      return;
    }
    const labels = { approach: "Walking…", turn: "Turning…", sit: "Sitting…", stand: "Standing…", exit: "Stepping away…" };
    interactionButton.hidden = false;
    interactionButton.disabled = true;
    interactionButton.textContent = labels[seatAction.phase] ?? "Please wait";
    interactionButton.dataset.interactableId = "";
    return;
  }
  interactionButton.disabled = false;
  const guestbookDistance = museum.guestbookPosition.distanceTo(activeCharacter.position);
  const nearGuestbook = guestbookDistance <= INTERACTION_CONFIG.guestbookDistance;
  const interactable = !nearGuestbook ? getNearbyInteractable() : null;
  const nearbySeats = getNearbySeatGroups();
  const actions = getAvailableInteractionActions({
    guestbook: nearGuestbook,
    interactable,
    seats: nearbySeats,
    isOccupied: (seatId) => getSeatOccupant(seatId),
  });
  const openAction = actions.find((action) => action.type === "open");
  const sitAction = actions.find((action) => action.type === "sit");
  const freeSeat = sitAction?.seat ?? null;
  interactionButton.hidden = !openAction && (!freeSeat || isMobile);
  if (interactionButton.hidden) {
    interactionButton.dataset.interactableId = "";
    return;
  }
  interactionButton.dataset.interactableId = openAction && interactable ? interactable.id : "";
  if (!interactionButton.hidden) {
    interactionButton.textContent = openAction?.label ?? sitAction.label;
    interactionButton.dataset.action = openAction
      ? nearGuestbook ? "open-guestbook" : interactable.kind
      : "sit";
    interactionButton.dataset.seatId = freeSeat?.id ?? "";
    interactionButton.setAttribute(
      "aria-label",
      nearGuestbook ? "Open guestbook"
        : openAction ? `Interact: ${interactable.label}`
          : `Sit in seat ${freeSeat.index}`,
    );
  }
}

function getNearbyInteractable() {
  const facingX = Math.sin(activeCharacter.rotation.y);
  const facingZ = Math.cos(activeCharacter.rotation.y);
  return museum.interactables
    .filter((item) => {
      const room = museum.rooms.find((entry) => entry.id === item.roomId);
      if (!room?.loaded || !room.group.visible) return false;
      const dx = item.position[0] - activeCharacter.position.x;
      const dz = item.position[2] - activeCharacter.position.z;
      const distance = Math.hypot(dx, dz);
      const facing = distance > 0.001 ? (dx * facingX + dz * facingZ) / distance : 1;
      return distance <= item.range && facing >= 0.2;
    })
    .sort((a, b) =>
      Math.hypot(a.position[0] - activeCharacter.position.x, a.position[2] - activeCharacter.position.z) -
      Math.hypot(b.position[0] - activeCharacter.position.x, b.position[2] - activeCharacter.position.z),
    )[0] ?? null;
}

function getSeatOccupant(seatId) {
  if (activeSeat?.id === seatId) return "local";
  for (const [id, remote] of remotePlayers) {
    if (remote.target.seatId === seatId) return id;
  }
  return null;
}

function getNearbySeatGroups() {
  const nearby = museum.seats
    .filter((seat) =>
      seat.room.loaded &&
      seat.room.group.visible &&
      isSeatApproachable(
        activeCharacter.position,
        activeGroundY,
        seat,
        INTERACTION_CONFIG.seating.approachRadius,
        INTERACTION_CONFIG.seating.approachTolerance,
      ),
    )
    .sort((first, second) =>
      Math.hypot(activeCharacter.position.x - first.position[0], activeCharacter.position.z - first.position[2]) -
      Math.hypot(activeCharacter.position.x - second.position[0], activeCharacter.position.z - second.position[2]),
    );
  if (!nearby.length) return [];
  const seats = museum.seats.filter((seat) =>
    seat.groupId === nearby[0].groupId &&
    seat.room.loaded &&
    seat.room.group.visible,
  );
  return getUniqueSeatSlots(seats);
}

function setSeatActionsHidden(hidden) {
  seatActions.hidden = hidden;
  document.documentElement.classList.toggle("seat-actions-visible", !hidden);
}

function renderSeatActions() {
  if (!started || guestbookOpen || debugSit || getEffectiveCoupleInteraction() ||
      coupleRequest || (chatOpen && !sitting && !seatAction)) {
    setSeatActionsHidden(true);
    seatActionSignature = "";
    return;
  }
  if (seatAction) {
    const labels = {
      approach: "Walking to seat…",
      turn: "Turning…",
      sit: "Sitting…",
      stand: "Standing…",
      exit: "Stepping away…",
    };
    const signature = `action:${seatAction.phase}`;
    if (signature !== seatActionSignature) {
      seatActions.replaceChildren();
      const button = document.createElement("button");
      button.className = "seat-action";
      button.type = "button";
      button.disabled = true;
      button.textContent = labels[seatAction.phase] ?? "Please wait…";
      seatActions.append(button);
      seatActionSignature = signature;
    }
    setSeatActionsHidden(false);
    return;
  }
  if (sitting && activeSeat) {
    if (seatActionSignature !== `stand:${activeSeat.id}`) {
      seatActions.replaceChildren();
      const button = document.createElement("button");
      button.className = "seat-action";
      button.type = "button";
      button.textContent = "Stand";
      button.setAttribute("aria-label", "Stand up");
      button.addEventListener("click", beginStand);
      seatActions.append(button);
      seatActionSignature = `stand:${activeSeat.id}`;
    }
    setSeatActionsHidden(false);
    return;
  }

  const seats = getNearbySeatGroups();
  const signature = seats
    .map((seat) => `${seat.id}:${getSeatOccupant(seat.id) ?? "free"}`)
    .join("|");
  if (!seats.length) {
    setSeatActionsHidden(true);
    seatActionSignature = "";
    return;
  }
  const freeSeats = getFreeSeatSlots(seats, (seatId) => getSeatOccupant(seatId));
  if (!freeSeats.length) {
    seatActions.replaceChildren();
    setSeatActionsHidden(true);
    seatActionSignature = signature;
    return;
  }
  if (signature !== seatActionSignature) {
    seatActions.replaceChildren();
    for (const seat of freeSeats) {
      const button = document.createElement("button");
      button.className = "seat-action";
      button.type = "button";
      button.textContent = getSeatActionLabel(seat, seats.length);
      button.setAttribute("aria-label", `Sit in seat ${seat.index}`);
      button.addEventListener("click", () => beginSitting(seat));
      seatActions.append(button);
    }
    seatActionSignature = signature;
  }
  setSeatActionsHidden(false);
}

function beginSitting(seat) {
  if (seatAction || sitting || coupleRequest || getEffectiveCoupleInteraction() ||
      getSeatOccupant(seat.id)) return;
  activeSeat = seat;
  seatAction = { seat, phase: "approach", timer: 0, stallTime: 0 };
  sitBlend = 0;
  velocity.set(0, 0, 0);
  seatActionSignature = "";
}

function beginStand() {
  if (!sitting || !activeSeat || seatAction) return;
  sitting = false;
  seatAction = { seat: activeSeat, phase: "stand", timer: 0 };
  seatActionSignature = "";
  velocity.set(0, 0, 0);
}

function collectNearbyHearts() {
  for (const heart of museum.hearts) {
    if (heart.collected || !heart.room.group.visible) continue;
    const distance = distanceToCapsuleBody(
      activeCharacter.position,
      COLLISION_CONFIG.capsuleHeight * CHARACTER_HEIGHTS[selectedKind],
      heart.config.position,
    );
    if (distance > INTERACTION_CONFIG.heartCollectDistance * CHARACTER_HEIGHTS[selectedKind]) continue;
    const secretWasRevealed = museum.secretRevealed;
    if (museum.setHeartCollected(heart.id)) {
      updateHeartCounter();
      updateHeartHint();
      drawMinimap();
      playAudioCue("pickup");
      if (onlineSession) {
        void onlineSession.publishHeart(heart.id, selectedKind).catch((error) => {
          console.warn("Could not share the collected heart.", error);
        });
      }
      showHudPopup(`You found a heart 💕 (${collectedHearts.size} / ${MUSEUM_CONFIG.hearts.length})`);
      if (!secretWasRevealed && museum.secretRevealed) {
        announceSecretRoomUnlocked({ delayMs: 1000 });
      }
      if (!memoriesPanel.hidden) populateMemoryTargets();
    }
  }
}

function handleSharedHeartsChanged(value, { initial = false } = {}) {
  const hearts = normalizeHeartsSnapshot(value, knownHeartIds);
  const missingHearts = Object.entries(hearts)
    .filter(([id]) => !collectedHearts.has(id))
    .sort((first, second) => first[1].at - second[1].at);
  if (!missingHearts.length) return;

  if (initial) {
    const secretWasRevealed = museum.secretRevealed;
    for (const [id] of missingHearts) museum.setHeartCollected(id);
    updateHeartCounter();
    updateHeartHint();
    drawMinimap();
    if (!memoriesPanel.hidden) populateMemoryTargets();
    if (!secretWasRevealed && museum.secretRevealed) {
      announceSecretRoomUnlocked({ playSound: false });
    } else {
      showHudPopup(`Hearts found so far: ${collectedHearts.size} / ${MUSEUM_CONFIG.hearts.length}`);
    }
    return;
  }

  for (const [id] of missingHearts) {
    const secretWasRevealed = museum.secretRevealed;
    if (!museum.setHeartCollected(id)) continue;
    updateHeartCounter();
    updateHeartHint();
    drawMinimap();
    if (!memoriesPanel.hidden) populateMemoryTargets();
    playAudioCue("pickup");
    showHudPopup(`Your partner found a heart 💕 (${collectedHearts.size} / ${MUSEUM_CONFIG.hearts.length})`);
    if (!secretWasRevealed && museum.secretRevealed) {
      announceSecretRoomUnlocked({ delayMs: 1000 });
    }
  }
}

function selectCharacter(kind) {
  selectedKind = kind;
  activeCharacter = characterPair[kind];
  activeGroundY = 0;
  for (const [key, character] of Object.entries(characterPair)) {
    character.visible = debugCompare ? key === "resha" : key === kind;
    character.position.set(debugCompare ? (key === "resha" ? -0.8 : 0) : 0, 0, 0);
    character.rotation.set(0, 0, 0);
  }
  targetHeading = 0;
  for (const button of choiceButtons) {
    const selected = button.dataset.character === kind;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  if (!debugCompare) saveCharacter(kind);
  if (titleScreen.classList.contains("character-select-layout")) {
    updateCharacterPreviewBounds();
    centerCharacterPreview();
  } else {
    updateCamera(true);
  }
}

function updateCharacterPreviewBounds() {
  activeCharacter.updateWorldMatrix(true, true);
  previewPedestal.updateWorldMatrix(true, false);
  const bounds = new THREE.Box3().setFromObject(activeCharacter);
  bounds.expandByObject(previewPedestal);
  const center = activeCharacter.getWorldPosition(new THREE.Vector3());
  center.y = (bounds.min.y + bounds.max.y) / 2;
  const point = new THREE.Vector3();
  let horizontalRadius = previewPedestal.geometry.parameters.radiusBottom;
  activeCharacter.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const meshBounds = object.geometry.boundingBox;
    for (let corner = 0; corner < 8; corner += 1) {
      point.set(
        corner & 1 ? meshBounds.max.x : meshBounds.min.x,
        corner & 2 ? meshBounds.max.y : meshBounds.min.y,
        corner & 4 ? meshBounds.max.z : meshBounds.min.z,
      ).applyMatrix4(object.matrixWorld);
      horizontalRadius = Math.max(
        horizontalRadius,
        Math.hypot(point.x - center.x, point.z - center.z),
      );
    }
  });
  characterPreviewBounds = {
    center,
    horizontalRadius,
    verticalRadius: (bounds.max.y - bounds.min.y) / 2,
  };
}

function updateCharacterPreviewLayout() {
  const sceneRect = sceneElement.getBoundingClientRect();
  const cardRect = titleCard.getBoundingClientRect();
  const safeArea = readSafeAreaInsets();
  characterPreviewViewport = {
    width: sceneElement.clientWidth || window.visualViewport?.width || window.innerWidth,
    height: sceneElement.clientHeight || window.visualViewport?.height || window.innerHeight,
  };
  characterPreviewZone = computeCharacterPreviewZone({
    ...characterPreviewViewport,
    safeArea,
    cardRect: {
      left: cardRect.left - sceneRect.left,
      right: cardRect.right - sceneRect.left,
      top: cardRect.top - sceneRect.top,
      bottom: cardRect.bottom - sceneRect.top,
    },
  });
  updateCharacterPreviewBounds();
  centerCharacterPreview();
}

// Measure the rendered model once per layout change; this accounts for perspective skew in its visible bounds.
function centerCharacterPreview() {
  characterPreviewCenterBias = { x: 0, y: 0 };
  updateCharacterPreviewCamera();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const point = new THREE.Vector3();
  const projectMesh = (object) => {
    const positions = object.geometry?.attributes?.position;
    if (!object.isMesh || !positions) return;
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index)
        .applyMatrix4(object.matrixWorld)
        .project(camera);
      const x = (point.x + 1) * characterPreviewViewport.width / 2;
      const y = (1 - point.y) * characterPreviewViewport.height / 2;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  };
  activeCharacter.updateWorldMatrix(true, true);
  previewPedestal.updateWorldMatrix(true, false);
  activeCharacter.traverse(projectMesh);
  projectMesh(previewPedestal);
  if (!Number.isFinite(minX)) return;
  characterPreviewCenterBias = {
    x: (minX + maxX) / 2 - characterPreviewZone.centerX,
    y: (minY + maxY) / 2 - characterPreviewZone.centerY,
  };
  updateCharacterPreviewCamera();
}

// Offset the perspective camera so the visible character-and-platform bounds land in the free-zone center.
function updateCharacterPreviewCamera() {
  if (!characterPreviewZone?.valid) return;
  if (!characterPreviewBounds) updateCharacterPreviewBounds();
  const { width, height } = characterPreviewViewport ?? {};
  if (width <= 0 || height <= 0) return;
  const distance = computeCharacterPreviewDistance({
    zone: characterPreviewZone,
    width,
    height,
    horizontalRadius: characterPreviewBounds.horizontalRadius,
    verticalRadius: characterPreviewBounds.verticalRadius,
    fov: camera.fov,
  });
  const cameraOrigin = characterPreviewBounds.center.clone().add(
    new THREE.Vector3(
      0,
      distance * 0.12,
      distance,
    ),
  );
  const forward = characterPreviewBounds.center.clone().sub(cameraOrigin).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = forward.clone().cross(worldUp).normalize();
  const up = right.clone().cross(forward).normalize();
  const shift = computeCharacterPreviewCameraShift({
    centerX: characterPreviewZone.centerX - characterPreviewCenterBias.x,
    centerY: characterPreviewZone.centerY - characterPreviewCenterBias.y,
    width,
    height,
    distance,
    fov: camera.fov,
  });
  const target = characterPreviewBounds.center.clone()
    .addScaledVector(right, -shift.horizontal)
    .addScaledVector(up, -shift.vertical);
  camera.position.copy(target).addScaledVector(forward, -distance);
  camera.up.copy(worldUp);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

function beginMuseumEntry() {
  if (started || loadingTimer) return;
  jukeboxEntryRequested = true;
  startJukeboxOnEnter();
  startButton.disabled = true;
  titleScreen.hidden = true;
  loadingScreen.hidden = false;
  loadingMessageIndex = 0;
  const messages = MUSEUM_CONFIG.music.loadingMessages;
  loadingMessage.textContent = messages[loadingMessageIndex];
  const messageInterval = window.setInterval(() => {
    loadingMessageIndex = (loadingMessageIndex + 1) % messages.length;
    loadingMessage.textContent = messages[loadingMessageIndex];
  }, 620);
  loadingTimer = window.setTimeout(() => {
    window.clearInterval(messageInterval);
    loadingTimer = 0;
    loadingScreen.hidden = true;
    startExperience();
  }, 1900);
}

function startExperience() {
  if (started) return;
  started = true;
  updateOrientationPresentation();
  showFullscreenTip();
  void updateScreenWakeLock();
  titleFlythroughActive = false;
  museum.root.visible = true;
  previewPedestal.visible = false;
  titleScreen.hidden = true;
  loadingScreen.hidden = true;
  controlsHint.hidden = false;
  controlsHint.hidden = true;
  mobileControls.hidden = !isMobile;
  hud.hidden = false;
  minimap.hidden = !settings.display.showMinimap;
  if (!minimap.hidden) drawMinimap();
  updateHeartCounter();
  updateHeartHint();
  activeCharacter.visible = true;
  const debugSeat = debugSit ? museum.seats[0] : null;
  activeCharacter.position.set(
    ...(debugSeat
      ? [debugSeat.position[0], debugSeat.floorY, debugSeat.position[2]]
      : MUSEUM_CONFIG.spawnPoints.main),
  );
  activeGroundY = museum.getGroundHeight(activeCharacter.position.x, activeCharacter.position.z);
  activeCharacter.position.y = activeGroundY;
  if (debugSeat) {
    activeSeat = debugSeat;
    sitting = true;
    sitBlend = debugSitBlend;
    targetHeading = headingFromDirection(debugSeat.forward[0], debugSeat.forward[2]);
  }
  activeCharacter.rotation.set(0, targetHeading, 0);
  if (!debugSit && !debugRender) restoreOnlineState();
  const spawnRoom = getMuseumRoomAtPosition(activeCharacter.position);
  if (spawnRoom) {
    activeRoomId = spawnRoom.id;
    showRoomTitle(spawnRoom.title);
    crossfadeMusicRoom(spawnRoom.id);
  }
  velocity.set(0, 0, 0);
  lastValidPosition.copy(activeCharacter.position);
  if (!musicMuted && !debugRender) startMusic();
  museum.update(activeCharacter.position, 0);
  updateCamera(true);
  if (!debugRender) void startOnlineSession();
}

function playCameraShutter() {
  if (!started || settings.sound.muteAll || settings.sound.effects <= 0) return;
  if (!audioContext || !effectsGain) {
    startMusic();
    return;
  }
  if (audioContext.state !== "running") {
    audioContext.resume().catch((error) => console.warn("Could not play the camera shutter.", error));
  }
  const sampleRate = audioContext.sampleRate;
  const buffer = audioContext.createBuffer(1, Math.ceil(sampleRate * 0.055), sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = (Math.random() * 2 - 1) * (1 - index / samples.length);
  }
  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  source.buffer = buffer;
  gain.gain.setValueAtTime(0.11, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.055);
  source.connect(gain);
  gain.connect(effectsGain);
  source.start();
  source.stop(audioContext.currentTime + 0.06);
}

function applyPhotoColorGrade(context, width, height) {
  if (lightingEffectState.colorGrade) {
    context.globalCompositeOperation = "soft-light";
    const warmWash = context.createLinearGradient(0, 0, width, height);
    warmWash.addColorStop(0, "rgb(255 190 139 / 7%)");
    warmWash.addColorStop(0.58, "rgb(255 190 139 / 0%)");
    context.fillStyle = warmWash;
    context.fillRect(0, 0, width, height);
  }
  context.globalCompositeOperation = "source-over";
  if (lightingEffectState.bloom) {
    const glow = context.createRadialGradient(
      width * 0.48,
      height * 0.42,
      0,
      width * 0.48,
      height * 0.42,
      Math.max(width, height) * 0.72,
    );
    glow.addColorStop(0, "rgb(255 206 151 / 10%)");
    glow.addColorStop(1, "rgb(255 206 151 / 0%)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
  }
  if (lightingEffectState.vignette) {
    const vignette = context.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.26,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.72,
    );
    vignette.addColorStop(0, "rgb(48 25 37 / 0%)");
    vignette.addColorStop(1, "rgb(48 25 37 / 19%)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
  }
  if (lightingEffectState.grain) {
    const grain = document.createElement("canvas");
    grain.width = 96;
    grain.height = 96;
    const grainContext = grain.getContext("2d");
    if (grainContext) {
      const noise = grainContext.createImageData(grain.width, grain.height);
      for (let index = 0; index < noise.data.length; index += 4) {
        const value = Math.floor(Math.random() * 256);
        noise.data[index] = value;
        noise.data[index + 1] = value;
        noise.data[index + 2] = value;
        noise.data[index + 3] = 255;
      }
      grainContext.putImageData(noise, 0, 0);
      const pattern = context.createPattern(grain, "repeat");
      if (pattern) {
        context.globalCompositeOperation = "soft-light";
        context.globalAlpha = 0.035;
        context.fillStyle = pattern;
        context.fillRect(0, 0, width, height);
        context.globalAlpha = 1;
      }
    }
    grain.width = 0;
    grain.height = 0;
  }
  context.globalCompositeOperation = "source-over";
}

async function createPhotoBlob() {
  const width = sceneElement.clientWidth;
  const height = sceneElement.clientHeight;
  if (width <= 0 || height <= 0) throw new Error("The museum view is not ready to capture.");
  const lowMemory = Number(navigator.deviceMemory) > 0 && Number(navigator.deviceMemory) <= 2;
  const resolutionCap = qualityTier === "Low" || lowMemory ? 1280 : 1920;
  const capturePixelRatio = Math.min(
    window.devicePixelRatio || 1,
    resolutionCap / Math.max(width, height),
  );
  const previousPixelRatio = renderer.getPixelRatio();
  let photoCanvas = null;
  try {
    // Temporarily render the full-resolution canvas and serialize it in the same task as the render.
    renderer.setPixelRatio(capturePixelRatio);
    renderer.setSize(width, height, false);
    if (bloomComposer) {
      bloomComposer.setPixelRatio(renderer.getPixelRatio());
      bloomComposer.setSize(width, height);
      bloomPass.uniforms.resolution.value.set(renderer.domElement.width, renderer.domElement.height);
    }
    renderSceneFrame();
    const source = renderer.domElement;
    photoCanvas = document.createElement("canvas");
    photoCanvas.width = source.width;
    photoCanvas.height = source.height;
    const context = photoCanvas.getContext("2d");
    if (!context) throw new Error("Could not create the photo image.");
    context.drawImage(source, 0, 0);
    applyPhotoColorGrade(context, photoCanvas.width, photoCanvas.height);
    return await new Promise((resolve, reject) => {
      photoCanvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser could not encode the photo."));
      }, "image/jpeg", 0.92);
    });
  } finally {
    renderer.setPixelRatio(previousPixelRatio);
    renderer.setSize(width, height, false);
    if (bloomComposer) {
      bloomComposer.setPixelRatio(previousPixelRatio);
      bloomComposer.setSize(width, height);
      bloomPass.uniforms.resolution.value.set(renderer.domElement.width, renderer.domElement.height);
    }
    if (photoCanvas) {
      photoCanvas.width = 0;
      photoCanvas.height = 0;
    }
  }
}

function createPhotoFileName(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `museum-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.jpg`;
}

function isIOSPhotoDevice() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function downloadPhoto(url, fileName) {
  const link = document.createElement("a");
  link.download = fileName;
  link.href = url;
  link.click();
}

function showPhotoThumbnail(blob, fileName) {
  window.clearTimeout(photoThumbnailTimer);
  window.clearTimeout(photoThumbnailHideTimer);
  window.clearTimeout(photoStatusTimer);
  photoStatus.hidden = true;
  if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
  photoObjectUrl = URL.createObjectURL(blob);
  try {
    photoFile = typeof File === "function"
      ? new File([blob], fileName, { type: "image/jpeg", lastModified: Date.now() })
      : null;
  } catch (error) {
    console.warn("Could not prepare the museum photo for sharing.", error);
    photoFile = null;
  }
  photoThumbnailImage.src = photoObjectUrl;
  photoThumbnail.hidden = false;
  photoThumbnail.classList.remove("visible");
  updateRoomTitleLayout();
  // The thumbnail is an isolated, tappable child of the otherwise touch-through top HUD.
  requestAnimationFrame(() => photoThumbnail.classList.add("visible"));
  photoThumbnailTimer = window.setTimeout(() => {
    photoThumbnail.classList.remove("visible");
    photoThumbnailHideTimer = window.setTimeout(() => {
      photoThumbnail.hidden = true;
      photoThumbnailImage.removeAttribute("src");
      updateRoomTitleLayout();
      if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
      photoObjectUrl = "";
      photoFile = null;
    }, 220);
  }, 3000);
}

async function shareOrOpenLatestPhoto() {
  if (!photoObjectUrl) return;
  let canSharePhoto = false;
  try {
    canSharePhoto = Boolean(photoFile && navigator.share && navigator.canShare?.({ files: [photoFile] }));
  } catch (error) {
    console.warn("The browser cannot share this museum photo.", error);
  }
  if (canSharePhoto) {
    try {
      await navigator.share({ files: [photoFile], title: "Museum photo" });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.warn("Could not share the museum photo; opening the image instead.", error);
    }
  }
  window.open(photoObjectUrl, "_blank", "noopener");
}

function showPhotoError() {
  photoStatus.textContent = "Couldn't save the photo";
  photoStatus.hidden = false;
  updateRoomTitleLayout();
  window.clearTimeout(photoStatusTimer);
  photoStatusTimer = window.setTimeout(() => {
    photoStatus.hidden = true;
    updateRoomTitleLayout();
  }, 2000);
}

async function capturePhoto() {
  const now = Date.now();
  if (!started || photoCaptureInProgress || now < photoCooldownUntil) return;
  photoCaptureInProgress = true;
  photoCooldownUntil = now + 1000;
  photoModeButton.classList.add("photo-capture-pressed");
  window.setTimeout(() => photoModeButton.classList.remove("photo-capture-pressed"), 180);
  if (!settings.display.reducedMotion && !reducedMotionPreference.matches) {
    photoFlash.classList.remove("visible");
    void photoFlash.offsetWidth;
    photoFlash.classList.add("visible");
    window.clearTimeout(photoFlashTimer);
    photoFlashTimer = window.setTimeout(() => photoFlash.classList.remove("visible"), 160);
  }
  playCameraShutter();
  if (settings.controls.haptics) triggerHaptic(18);

  try {
    const blob = await createPhotoBlob();
    const fileName = createPhotoFileName();
    showPhotoThumbnail(blob, fileName);
    const automaticDownloadAvailable = "download" in document.createElement("a");
    // iOS uses the thumbnail's user gesture for Web Share; desktop/Android download immediately.
    if (!isIOSPhotoDevice() && automaticDownloadAvailable) downloadPhoto(photoObjectUrl, fileName);
  } catch (error) {
    console.warn("Could not capture or save the museum photo.", error);
    showPhotoError();
  } finally {
    photoCaptureInProgress = false;
  }
}

function updateCamera(immediate = false, delta = 0) {
  if (debugSit) {
    cameraPosition.set(
      activeCharacter.position.x + INTERACTION_CONFIG.seating.debugSideDistance,
      activeCharacter.position.y + INTERACTION_CONFIG.seating.debugSideHeight,
      activeCharacter.position.z,
    );
    desiredCameraTarget.set(
      activeCharacter.position.x,
      activeCharacter.position.y + INTERACTION_CONFIG.seating.debugSideTargetHeight,
      activeCharacter.position.z,
    );
    camera.position.copy(cameraPosition);
    cameraTarget.copy(desiredCameraTarget);
    camera.lookAt(cameraTarget);
    return;
  }
  const interaction = getEffectiveCoupleInteraction();
  const pair = getCouplePair(interaction);
  const frameTogether = pair && ["hug", "kissCheek", "kissForehead", "slowDance"].includes(interaction.action);
  const focusX = frameTogether
    ? (pair.leader.position.x + pair.follower.position.x) / 2
    : activeCharacter.position.x;
  const focusZ = frameTogether
    ? (pair.leader.position.z + pair.follower.position.z) / 2
    : activeCharacter.position.z;
  const focusY = frameTogether
    ? (pair.leader.position.y + pair.follower.position.y) / 2
    : activeCharacter.position.y;
  const orientationSettings = settings.camera[getOrientationName()];
  targetCameraFov = orientationSettings.fov;
  const aspect = Math.max(0.1, sceneElement.clientWidth / Math.max(1, sceneElement.clientHeight));
  const portraitPullback = aspect < 0.75 ? 1 + (0.75 - aspect) * 0.5 : 1;
  const cinematicEase = finalRoomCinematicElapsed >= 0
    ? Math.sin(Math.PI * Math.min(1, finalRoomCinematicElapsed / 4)) * 0.14
    : 0;
  let distance = (frameTogether
    ? COUPLE_INTERACTION_CONFIG.cameraDistance
    : orientationSettings.distance * CHARACTER_HEIGHTS[selectedKind]) * portraitPullback * (1 + cinematicEase);
  if (!frameTogether && settings.camera.autoPullBack) {
    const nearHeroFrame = MUSEUM_CONFIG.frames.some((frame) =>
      frame.height >= 3.5 &&
      Math.hypot(activeCharacter.position.x - frame.position[0], activeCharacter.position.z - frame.position[2]) < 4.5,
    );
    if (nearHeroFrame) distance = Math.max(distance, orientationSettings.distance + 1.2);
  }
  const firstPerson = settings.camera.mode === "First person" && !frameTogether;
  if (firstPerson) distance = 0.12;
  const horizontalDistance = Math.cos(cameraPitch) * distance;
  if (firstPerson) {
    cameraPosition.set(
      focusX + Math.sin(cameraYaw) * horizontalDistance,
      focusY + orientationSettings.height * CHARACTER_HEIGHTS[selectedKind],
      focusZ + Math.cos(cameraYaw) * horizontalDistance,
    );
    desiredCameraTarget.set(
      cameraPosition.x - Math.sin(cameraYaw) * 4,
      cameraPosition.y + Math.sin(cameraPitch) * 4,
      cameraPosition.z - Math.cos(cameraYaw) * 4,
    );
  } else {
    cameraPosition.set(
      focusX + Math.sin(cameraYaw) * horizontalDistance,
      focusY + orientationSettings.height * CHARACTER_HEIGHTS[selectedKind] + Math.sin(cameraPitch) * distance,
      focusZ + Math.cos(cameraYaw) * horizontalDistance,
    );
    desiredCameraTarget.set(
      focusX,
      focusY + MOVEMENT_CONFIG.cameraLookHeight * CHARACTER_HEIGHTS[selectedKind],
      focusZ,
    );
  }
  if (immediate) {
    camera.position.copy(cameraPosition);
    cameraTarget.copy(desiredCameraTarget);
    if (camera.fov !== targetCameraFov) {
      camera.fov = targetCameraFov;
      camera.updateProjectionMatrix();
    }
  }
  else {
    const blend = 1 - Math.exp(-settings.camera.smoothing * delta);
    camera.position.lerp(cameraPosition, blend);
    cameraTarget.lerp(desiredCameraTarget, blend);
    const nextFov = THREE.MathUtils.damp(camera.fov, targetCameraFov, settings.camera.smoothing, delta);
    if (Math.abs(camera.fov - nextFov) > 0.001) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }
  }
  camera.lookAt(cameraTarget);
}

function configureCameraProjection() {
  const profile = settings.camera[getOrientationName()];
  camera.near = 0.15;
  camera.far = 90;
  targetCameraFov = profile.fov;
  if (!cameraProjectionInitialized) camera.fov = profile.fov;
  camera.updateProjectionMatrix();
  cameraProjectionInitialized = true;
}

function readKeyboardInput() {
  const x = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  const y = Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown"));
  return new THREE.Vector2(x, y);
}

function readInput() {
  if (orientationPaused) {
    input.set(0, 0);
    joystick.classList.remove("edge-running");
    return input;
  }
  const keyboard = readKeyboardInput();
  if (keyboard.lengthSq() > 0) {
    input.copy(keyboard);
  } else {
    input.set(0, 0);
    const gamepads = navigator.getGamepads?.() ?? [];
    for (const gamepad of gamepads) {
      if (!gamepad) continue;
      const x = gamepad.axes[0] ?? 0;
      const y = -(gamepad.axes[1] ?? 0);
      if (Math.hypot(x, y) > settings.controls.deadzone) {
        input.set(x, y);
        break;
      }
    }
    if (joystickPointer !== null && joystickOrigin) {
      input.set(
        ((joystickPointer.x - joystickOrigin.x) / (joystickSize() / 2)) * settings.controls.joystickSensitivity,
        (-(joystickPointer.y - joystickOrigin.y) / (joystickSize() / 2)) * settings.controls.joystickSensitivity,
      );
    }
  }
  if (input.length() < settings.controls.deadzone) input.set(0, 0);
  if (input.length() > 1) input.normalize();
  joystick.classList.toggle(
    "edge-running",
    settings.controls.runMode === "Edge-auto" && joystickPointer !== null && input.length() >= 0.88,
  );
  return input;
}

function joystickSize() {
  return joystick.getBoundingClientRect().width || 132;
}

function isRunning(moveInput) {
  if (settings.controls.runMode === "Edge-auto" && joystickPointer !== null && moveInput.length() >= 0.88) return true;
  if (settings.controls.runMode === "Toggle" ? runToggleState : runButtonPressed) return true;
  if (keys.has("ShiftLeft") || keys.has("ShiftRight")) return true;
  for (const gamepad of navigator.getGamepads?.() ?? []) {
    if (gamepad?.buttons[10]?.pressed) return true;
  }
  return false;
}

function approach(current, target, rate, delta) {
  return THREE.MathUtils.damp(current, target, rate, delta);
}

function moveSeatCharacterToward(target, delta, scale) {
  const deltaX = target[0] - activeCharacter.position.x;
  const deltaZ = target[2] - activeCharacter.position.z;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance <= INTERACTION_CONFIG.seating.approachTolerance) {
    activeCharacter.position.x = target[0];
    activeCharacter.position.z = target[2];
    activeGroundY = museum.getGroundHeight(target[0], target[2], target[1]);
    activeCharacter.position.y = activeGroundY;
    velocity.set(0, 0, 0);
    return 0;
  }
  direction.set(deltaX / distance, 0, deltaZ / distance);
  targetHeading = headingFromDirection(direction.x, direction.z);
  activeCharacter.rotation.y = stepHeading(
    activeCharacter.rotation.y,
    targetHeading,
    true,
    MOVEMENT_CONFIG.turnSpeed,
    delta,
  );
  const speed = MOVEMENT_CONFIG.walkSpeed * scale * 0.75;
  const targetVelocityX = direction.x * speed;
  const targetVelocityZ = direction.z * speed;
  velocity.x = approach(velocity.x, targetVelocityX, MOVEMENT_CONFIG.acceleration, delta);
  velocity.z = approach(velocity.z, targetVelocityZ, MOVEMENT_CONFIG.acceleration, delta);
  moveCapsule(
    activeCharacter.position,
    velocity.x * delta,
    velocity.z * delta,
    {
      colliders: museum.colliders,
      groundHeight: museum.getGroundHeight,
      radius: COLLISION_CONFIG.capsuleRadius * scale,
      capsuleHeight: COLLISION_CONFIG.capsuleHeight * scale,
      config: COLLISION_CONFIG,
      bounds: MUSEUM_CONFIG.worldBounds,
    },
  );
  activeGroundY = activeCharacter.position.y;
  activeCharacter.position.y = activeGroundY;
  return Math.hypot(target[0] - activeCharacter.position.x, target[2] - activeCharacter.position.z);
}

function updateSeatAction(delta) {
  if (!seatAction) return false;
  const seat = seatAction.seat;
  const seatConfig = INTERACTION_CONFIG.seating;
  const scale = CHARACTER_HEIGHTS[selectedKind];
  const seatHeading = headingFromDirection(seat.forward[0], seat.forward[2]);
  walkBlend = approach(walkBlend, seatAction.phase === "approach" || seatAction.phase === "exit" ? 1 : 0, MOVEMENT_CONFIG.blendSpeed, delta);
  runBlend = approach(runBlend, 0, MOVEMENT_CONFIG.blendSpeed, delta);

  if (seatAction.phase === "approach" || seatAction.phase === "exit") {
    const target = seat.approach;
    const previousDistance = Math.hypot(
      target[0] - activeCharacter.position.x,
      target[2] - activeCharacter.position.z,
    );
    const remaining = moveSeatCharacterToward(target, delta, scale);
    if (seatAction.phase === "approach" && remaining >= previousDistance - 0.001) {
      seatAction.stallTime += delta;
    } else {
      seatAction.stallTime = 0;
    }
    if (seatAction.stallTime >= seatConfig.approachTimeoutSeconds) {
      activeSeat = null;
      seatAction = null;
      velocity.set(0, 0, 0);
      showInviteFeedback("Could not reach that seat · move closer and try again");
      seatActionSignature = "";
      return true;
    }
    if (remaining === 0) {
      velocity.set(0, 0, 0);
      if (seatAction.phase === "approach") {
        seatAction.phase = "turn";
      } else {
        activeCharacter.rotation.y = seatHeading;
        targetHeading = seatHeading;
        activeSeat = null;
        seatAction = null;
        sitting = false;
        sitBlend = 0;
        lastValidPosition.copy(activeCharacter.position);
        blockedTime = 0;
      }
      seatActionSignature = "";
    }
  } else if (seatAction.phase === "turn") {
    velocity.set(0, 0, 0);
    targetHeading = seatHeading;
    activeCharacter.rotation.y = stepHeading(
      activeCharacter.rotation.y,
      targetHeading,
      true,
      MOVEMENT_CONFIG.turnSpeed,
      delta,
    );
    const turnError = Math.atan2(
      Math.sin(targetHeading - activeCharacter.rotation.y),
      Math.cos(targetHeading - activeCharacter.rotation.y),
    );
    if (Math.abs(turnError) <= seatConfig.turnTolerance) {
      seatAction.phase = "sit";
      seatAction.timer = 0;
      seatAction.startX = activeCharacter.position.x;
      seatAction.startZ = activeCharacter.position.z;
      seatActionSignature = "";
    }
  } else if (seatAction.phase === "sit") {
    velocity.set(0, 0, 0);
    seatAction.timer += delta;
    const sitDuration = selectedKind === "resha"
      ? seatConfig.skirtBlendDurationSeconds
      : seatConfig.sitDurationSeconds;
    const progress = THREE.MathUtils.clamp(seatAction.timer / sitDuration, 0, 1);
    sitBlend = THREE.MathUtils.smoothstep(progress, 0, 1);
    activeCharacter.position.x = THREE.MathUtils.lerp(seatAction.startX, seat.position[0], sitBlend);
    activeCharacter.position.z = THREE.MathUtils.lerp(seatAction.startZ, seat.position[2], sitBlend);
    activeGroundY = museum.getGroundHeight(seat.position[0], seat.position[2], seat.floorY);
    activeCharacter.position.y = activeGroundY;
    activeCharacter.rotation.y = seatHeading;
    targetHeading = seatHeading;
    if (progress >= 1) {
      sitting = true;
      sitBlend = 1;
      seatAction = null;
      seatActionSignature = "";
    }
  } else if (seatAction.phase === "stand") {
    velocity.set(0, 0, 0);
    seatAction.timer += delta;
    const standDuration = selectedKind === "resha"
      ? Math.max(seatConfig.standDurationSeconds, seatConfig.skirtBlendDurationSeconds)
      : seatConfig.standDurationSeconds;
    const progress = THREE.MathUtils.clamp(seatAction.timer / standDuration, 0, 1);
    sitBlend = 1 - THREE.MathUtils.smoothstep(progress, 0, 1);
    if (progress >= 1) {
      sitBlend = 0;
      seatAction.phase = "exit";
      seatAction.timer = 0;
      seatAction.stallTime = 0;
      seatActionSignature = "";
    }
  }

  if (seatAction?.phase === "approach" || seatAction?.phase === "exit") {
    const speed = velocity.length();
    gaitPhase += delta * MOVEMENT_CONFIG.gaitFrequency * Math.min(speed / (MOVEMENT_CONFIG.walkSpeed * scale), 1.75);
  }
  activeCharacter.position.y = activeGroundY;
  animateCharacter(
    activeCharacter,
    walkBlend,
    runBlend,
    gaitPhase,
    Math.min(velocity.length() / (MOVEMENT_CONFIG.runSpeed * scale), 1),
    delta,
    activeGroundY,
    sitBlend,
    activeSeat ? getSeatHeight(activeSeat) : 0,
    activeEmote,
    activeEmoteUntil,
    activeSeat,
  );
  return true;
}

function updateMovement(delta) {
  const linkedInteraction = getEffectiveCoupleInteraction();
  const localIsLeader = linkedInteraction?.leaderId === onlinePlayerId;
  const canLeadMovement = localIsLeader && getRemotePlayer()?.id === linkedInteraction.followerId &&
    linkedInteraction.phase === "ACTIVE" &&
    ["hold", "piggyback"].includes(linkedInteraction.action);
  if (linkedInteraction && !canLeadMovement) {
    velocity.set(0, 0, 0);
    walkBlend = approach(walkBlend, 0, MOVEMENT_CONFIG.blendSpeed, delta);
    runBlend = approach(runBlend, 0, MOVEMENT_CONFIG.blendSpeed, delta);
    if (!localIsLeader) activeCharacter.position.y = activeGroundY;
    animateCharacter(
      activeCharacter,
      walkBlend,
      runBlend,
      gaitPhase,
      0,
      delta,
      activeGroundY,
      sitBlend,
      activeSeat ? getSeatHeight(activeSeat) : 0,
      activeEmote,
      activeEmoteUntil,
      activeSeat,
    );
    return;
  }
  if (updateSeatAction(delta)) return;
  if (sitting) {
    velocity.set(0, 0, 0);
    walkBlend = approach(walkBlend, 0, MOVEMENT_CONFIG.blendSpeed, delta);
    runBlend = approach(runBlend, 0, MOVEMENT_CONFIG.blendSpeed, delta);
    activeCharacter.position.y = activeGroundY;
    animateCharacter(
      activeCharacter,
      walkBlend,
      runBlend,
      gaitPhase,
      0,
      delta,
      activeGroundY,
      sitBlend,
      activeSeat ? getSeatHeight(activeSeat) : 0,
      activeEmote,
      activeEmoteUntil,
      activeSeat,
    );
    return;
  }
  const moveInput = readInput();
  const hasInput = moveInput.length() > 0;
  cameraForward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
  cameraRight.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
  direction.set(0, 0, 0);
  if (hasInput) {
    direction.addScaledVector(cameraRight, moveInput.x);
    direction.addScaledVector(cameraForward, moveInput.y);
    direction.normalize();
    targetHeading = headingFromDirection(direction.x, direction.z);
  }

  const carrying = linkedInteraction?.action === "piggyback" && localIsLeader;
  const running = hasInput && isRunning(moveInput) && !carrying;
  const characterScale = CHARACTER_HEIGHTS[selectedKind];
  const walkSpeed = MOVEMENT_CONFIG.walkSpeed * characterScale;
  const runSpeed = MOVEMENT_CONFIG.runSpeed * characterScale;
  const speed = carrying
    ? walkSpeed * COUPLE_INTERACTION_CONFIG.piggyback.speedMultiplier
    : running ? runSpeed : walkSpeed;
  const targetVelocity = hasInput ? direction.multiplyScalar(speed) : direction.set(0, 0, 0);
  velocity.x = approach(velocity.x, targetVelocity.x, MOVEMENT_CONFIG.acceleration, delta);
  velocity.z = approach(velocity.z, targetVelocity.z, MOVEMENT_CONFIG.acceleration, delta);
  const previousPosition = activeCharacter.position.clone();
  const collisionResult = moveCapsule(
    activeCharacter.position,
    velocity.x * delta,
    velocity.z * delta,
    {
      colliders: museum.colliders,
      groundHeight: museum.getGroundHeight,
      radius: COLLISION_CONFIG.capsuleRadius * characterScale *
        (carrying ? COUPLE_INTERACTION_CONFIG.piggyback.colliderMultiplier : 1),
      capsuleHeight: COLLISION_CONFIG.capsuleHeight * characterScale,
      config: COLLISION_CONFIG,
      bounds: MUSEUM_CONFIG.worldBounds,
    },
  );
  const requestedDistance = Math.hypot(velocity.x * delta, velocity.z * delta);
  const actualDistance = Math.hypot(
    activeCharacter.position.x - previousPosition.x,
    activeCharacter.position.z - previousPosition.z,
  );
  if (hasInput && actualDistance > 0.02) {
    footstepDistance += actualDistance;
    const stepLength = running ? 0.92 : 0.78;
    if (footstepDistance >= stepLength) {
      footstepDistance %= stepLength;
      playAudioCue(getSurfaceAtPosition(activeCharacter.position));
    }
  } else if (!hasInput) {
    footstepDistance = 0;
  }
  if (collisionResult.collided && requestedDistance > 0.02 && actualDistance < requestedDistance * 0.25) {
    blockedTime += delta;
  } else {
    blockedTime = 0;
  }
  if (blockedTime >= COLLISION_CONFIG.stuckPushoutSeconds) {
    resolvePenetrations(
      activeCharacter.position,
      museum.colliders,
      COLLISION_CONFIG.capsuleRadius * characterScale,
      COLLISION_CONFIG.capsuleHeight * characterScale,
      COLLISION_CONFIG,
    );
    activeCharacter.position.y = museum.getGroundHeight(activeCharacter.position.x, activeCharacter.position.z);
  }
  if (blockedTime >= COLLISION_CONFIG.stuckTeleportSeconds) {
    activeCharacter.position.copy(lastValidPosition);
    blockedTime = 0;
    velocity.set(0, 0, 0);
  } else if (actualDistance > 0.01 || !hasInput) {
    lastValidPosition.copy(activeCharacter.position);
  }
  if (activeCharacter.position.y < COLLISION_CONFIG.fallResetY) {
    activeCharacter.position.copy(lastValidPosition);
    activeCharacter.position.y = museum.getGroundHeight(activeCharacter.position.x, activeCharacter.position.z);
    velocity.set(0, 0, 0);
    blockedTime = 0;
  }
  activeGroundY = activeCharacter.position.y;

  activeCharacter.rotation.y = stepHeading(
    activeCharacter.rotation.y,
    targetHeading,
    hasInput,
    MOVEMENT_CONFIG.turnSpeed,
    delta,
  );

  const normalizedSpeed = Math.min(velocity.length() / runSpeed, 1);
  walkBlend = approach(walkBlend, hasInput ? 1 : 0, MOVEMENT_CONFIG.blendSpeed, delta);
  runBlend = approach(runBlend, running ? 1 : 0, MOVEMENT_CONFIG.blendSpeed, delta);
  const frequency = MOVEMENT_CONFIG.gaitFrequency * (1 + (MOVEMENT_CONFIG.runGaitMultiplier - 1) * runBlend);
  gaitPhase += delta * frequency * (hasInput ? Math.min(velocity.length() / walkSpeed, 1.75) : 0);
  animateCharacter(
    activeCharacter,
    walkBlend,
    runBlend,
    gaitPhase,
    normalizedSpeed,
    delta,
    activeGroundY,
    sitBlend,
    activeSeat ? getSeatHeight(activeSeat) : 0,
    activeEmote,
    activeEmoteUntil,
    activeSeat,
  );
}

function animateCharacter(
  character,
  blend,
  run,
  phase,
  speed,
  delta,
  groundY = 0,
  seatedBlend = 0,
  seatHeight = 0,
  emote = null,
  emoteUntil = 0,
  seatData = null,
) {
  resetCharacterPose(character, { restoreSkirt: false, rootY: groundY });
  if (debugSit && character === activeCharacter) {
    seatedBlend = debugSitBlend;
    seatData = activeSeat ?? museum.seats[0] ?? null;
    seatHeight = getSeatHeight(seatData, INTERACTION_CONFIG.seating.seatHeight);
  }
  const { legs, arms, armJoints, skirtTiers } = character.userData;
  const rig = character.userData.interactionRig;
  const idlePhase = performance.now() / 1000;
  const idleBlend = 1 - blend;
  const hairPivot = character.userData.seatRig?.hairPivot;
  if (hairPivot) {
    const hairConfig = INTERACTION_CONFIG.seating.resha;
    const sway = THREE.MathUtils.clamp(blend * (1 + run * 0.2), 0, 1.2);
    hairPivot.rotation.x = approach(
      hairPivot.rotation.x,
      THREE.MathUtils.clamp(Math.sin(phase * 0.5) * hairConfig.hairSwayX * sway, -0.05, 0.05),
      MOVEMENT_CONFIG.blendSpeed,
      delta,
    );
    hairPivot.rotation.z = approach(
      hairPivot.rotation.z,
      THREE.MathUtils.clamp(Math.sin(phase) * hairConfig.hairSwayZ * sway, -0.06, 0.06),
      MOVEMENT_CONFIG.blendSpeed,
      delta,
    );
  }
  for (const arm of Object.values(arms)) arm.rotation.z = 0;
  for (const joint of Object.values(armJoints)) {
    joint.elbow.rotation.z = approach(joint.elbow.rotation.z, 0, MOVEMENT_CONFIG.blendSpeed, delta);
  }
  if (seatedBlend > 0 || seatHeight > 0) {
    applySeatedPose(
      character,
      seatedBlend,
      seatHeight,
      CHARACTER_HEIGHTS[character.userData.kind],
      INTERACTION_CONFIG.seating,
      seatData,
    );
  }
  if (rig) {
    rig.spine.position.y += Math.sin(idlePhase * MOVEMENT_CONFIG.idleBreathFrequency) *
      MOVEMENT_CONFIG.idleBreathAmplitude * idleBlend;
    rig.spine.rotation.z += Math.sin(idlePhase * 0.72) *
      MOVEMENT_CONFIG.torsoSway * idleBlend;
    rig.hips.position.x += Math.sin(idlePhase * 0.64) *
      MOVEMENT_CONFIG.idleWeightShift * idleBlend;
    rig.head.rotation.y += Math.sin(idlePhase * 0.31) *
      MOVEMENT_CONFIG.idleHeadTurn * idleBlend;
    rig.head.rotation.x += Math.sin(idlePhase * MOVEMENT_CONFIG.idleBreathFrequency) *
      0.012 * idleBlend;
    const blinkPhase = idlePhase % 4.3;
    const blink = Math.max(0, 1 - Math.abs(blinkPhase - 0.14) / 0.11);
    for (const eye of rig.eyes) eye.scale.y *= 1 - blink * 0.92;
  }
  if (seatedBlend > 0) {
    character.position.y = groundY;
    character.rotation.x = 0;
    applyEmotePose(character, emote, emoteUntil, delta);
    return;
  }
  const swing = Math.sin(phase) * MOVEMENT_CONFIG.legSwing * blend;
  const armSwing = Math.sin(phase + Math.PI) * MOVEMENT_CONFIG.armSwing * blend;
  for (const [key, leg] of Object.entries(legs)) {
    const side = key.endsWith("L") ? -1 : 1;
    const legSwing = swing * side;
    leg.rotation.x = approach(leg.rotation.x, legSwing, MOVEMENT_CONFIG.blendSpeed, delta);
    leg.rotation.y = Math.sin(phase + (side < 0 ? 0 : Math.PI)) *
      MOVEMENT_CONFIG.hipTwist * blend * (1 + run * 0.4);
    const knee = leg.children.find((child) => child.name.startsWith("knee"));
    if (knee) {
      const kneeBend = Math.max(0, Math.sin(phase + (side < 0 ? 0 : Math.PI))) * (0.34 + 0.36 * run) * blend;
      knee.rotation.x = approach(knee.rotation.x, kneeBend, MOVEMENT_CONFIG.blendSpeed, delta);
      const ankle = knee.children.find((child) => child.name.startsWith("ankle"));
      if (ankle) {
        const footAngle = -legSwing * 0.45 - kneeBend * 0.4;
        ankle.rotation.x = approach(ankle.rotation.x, footAngle, MOVEMENT_CONFIG.blendSpeed, delta);
        const swingLift = Math.max(
          0,
          (Math.sin(phase + (side < 0 ? 0 : Math.PI)) - MOVEMENT_CONFIG.footPlantThreshold) /
            (1 - MOVEMENT_CONFIG.footPlantThreshold),
        );
        ankle.position.y = approach(
          ankle.position.y,
          ankle.userData.baseY + swingLift * MOVEMENT_CONFIG.footLift * blend,
          MOVEMENT_CONFIG.blendSpeed,
          delta,
        );
      }
    }
  }
  for (const [key, arm] of Object.entries(arms)) {
    const side = key.endsWith("L") ? -1 : 1;
    const idleSway = Math.sin(idlePhase * 0.82 + (side < 0 ? 0 : Math.PI)) *
      MOVEMENT_CONFIG.idleArmSway * idleBlend;
    arm.rotation.x = approach(arm.rotation.x, armSwing * side + idleSway, MOVEMENT_CONFIG.blendSpeed, delta);
    const elbow = armJoints[key.endsWith("L") ? "L" : "R"]?.elbow;
    if (elbow) {
      elbow.rotation.z = approach(
        elbow.rotation.z,
        Math.max(0, Math.sin(phase + (side < 0 ? 0 : Math.PI))) *
          MOVEMENT_CONFIG.runElbowBend * run * blend,
        MOVEMENT_CONFIG.blendSpeed,
        delta,
      );
    }
  }
  character.position.y = approach(
    character.position.y,
    groundY + (blend > 0.05
      ? Math.abs(Math.sin(phase * 2)) * MOVEMENT_CONFIG.bodyBob * speed
      : Math.sin(idlePhase * MOVEMENT_CONFIG.idleBreathFrequency) *
        MOVEMENT_CONFIG.idleBreathAmplitude * idleBlend),
    MOVEMENT_CONFIG.blendSpeed,
    delta,
  );
  character.rotation.x = approach(
    character.rotation.x,
    Math.min(speed, 1) * MOVEMENT_CONFIG.bodyLean * blend + run * 0.08,
    MOVEMENT_CONFIG.blendSpeed,
    delta,
  );
  for (const [index, tier] of (skirtTiers ?? []).entries()) {
    tier.rotation.z = approach(tier.rotation.z, Math.sin(phase + index * 0.6) * 0.04 * blend, MOVEMENT_CONFIG.blendSpeed, delta);
  }
  character.rotation.z = approach(
    character.rotation.z,
    Math.sin(phase) * MOVEMENT_CONFIG.torsoSway * blend,
    MOVEMENT_CONFIG.blendSpeed,
    delta,
  );
  applyEmotePose(character, emote, emoteUntil, delta);
}

function applyEmotePose(character, emote, emoteUntil, delta) {
  if (!emote || Date.now() >= emoteUntil) {
    character.rotation.z = approach(character.rotation.z, 0, MOVEMENT_CONFIG.blendSpeed, delta);
    return;
  }
  const { arms, armJoints } = character.userData;
  const duration = CHAT_CONFIG.emoteDurationMs;
  const elapsed = Math.max(0, duration - (emoteUntil - Date.now())) / duration;
  const anticipation = Math.min(1, elapsed / MOVEMENT_CONFIG.emoteAnticipationFraction);
  const release = Math.min(1, (1 - elapsed) / MOVEMENT_CONFIG.emoteAnticipationFraction);
  const envelope = Math.min(anticipation, release);
  const clock = audioContext?.state === "running" ? audioContext.currentTime : performance.now() / 1000;
  if (emote === "wave") {
    const wave = Math.sin(elapsed * Math.PI * 8) * 0.2;
    arms.armR.rotation.z = approach(arms.armR.rotation.z, (2.12 + wave) * envelope, 12, delta);
    armJoints.R.elbow.rotation.z = approach(armJoints.R.elbow.rotation.z, 0.55 * envelope, 12, delta);
    character.rotation.z = approach(character.rotation.z, -0.035 * envelope, 8, delta);
  } else if (emote === "heart") {
    const lift = -0.85 * envelope;
    arms.armL.rotation.x = approach(arms.armL.rotation.x, lift, 10, delta);
    arms.armR.rotation.x = approach(arms.armR.rotation.x, lift, 10, delta);
    arms.armL.rotation.z = approach(arms.armL.rotation.z, -0.72 * envelope, 10, delta);
    arms.armR.rotation.z = approach(arms.armR.rotation.z, 0.72 * envelope, 10, delta);
    character.rotation.x = approach(character.rotation.x, -0.045 * envelope, 8, delta);
  } else if (emote === "dance") {
    const sway = Math.sin((clock * Math.PI * 2) / MOVEMENT_CONFIG.danceBeatSeconds);
    const pulse = Math.sin((clock * Math.PI * 4) / MOVEMENT_CONFIG.danceBeatSeconds);
    arms.armL.rotation.z = approach(arms.armL.rotation.z, (-0.82 + sway * 0.34) * envelope, 10, delta);
    arms.armR.rotation.z = approach(arms.armR.rotation.z, (0.82 - sway * 0.34) * envelope, 10, delta);
    arms.armL.rotation.x = approach(arms.armL.rotation.x, pulse * 0.2 * envelope, 10, delta);
    arms.armR.rotation.x = approach(arms.armR.rotation.x, -pulse * 0.2 * envelope, 10, delta);
    character.rotation.z = approach(character.rotation.z, sway * 0.14 * envelope, 8, delta);
    character.rotation.x = approach(character.rotation.x, pulse * 0.035 * envelope, 8, delta);
  }
}

function updateDebug() {
  for (let index = 0; index < skeletonHelpers.length; index += 1) {
    const helper = skeletonHelpers[index];
    helper.lines.visible = helper.character.visible;
    const positions = helper.lines.geometry.attributes.position.array;
    for (let linkIndex = 0; linkIndex < helper.links.length; linkIndex += 1) {
      const [fromName, toName] = helper.links[linkIndex];
      helper.joints.get(fromName).getWorldPosition(helper.fromPosition);
      positions.set(helper.fromPosition.toArray(), linkIndex * 6);
      helper.joints.get(toName).getWorldPosition(helper.toPosition);
      positions.set(helper.toPosition.toArray(), linkIndex * 6 + 3);
    }
    helper.lines.geometry.attributes.position.needsUpdate = true;
    helper.lines.geometry.computeBoundingSphere();
  }
}

function onPointerDown(event) {
  if (orientationPaused || !started || settingsOpen || chatOpen ||
      event.target.closest("#settings-sheet, #chat-panel, .overlay, #guestbook")) return;
  if (isMobile) {
    const activeSide = settings.controls.leftHanded ? "right" : "left";
    const onActiveThumbSide = activeSide === "left"
      ? event.clientX < window.innerWidth * 0.48
      : event.clientX > window.innerWidth * 0.52;
    if (onActiveThumbSide && settings.controls.joystickMode === "Floating" &&
        event.clientY >= window.innerHeight * 0.6) {
      beginJoystickPointer(event, true);
      return;
    }
    if (onActiveThumbSide) return;
  }
  cameraPointer = event.pointerId;
  previousCameraX = event.clientX;
  previousCameraY = event.clientY;
  renderer.domElement.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (orientationPaused || chatOpen) return;
  if (moveLayoutControlDrag(event)) return;
  if (joystickPointer?.id === event.pointerId) {
    moveJoystickPointer(event);
  }
  if (cameraPointer === event.pointerId) {
    const deltaX = event.clientX - previousCameraX;
    const deltaY = event.clientY - previousCameraY;
    cameraYaw -= deltaX * APP_CONFIG.cameraSensitivity * settings.controls.cameraSensitivityX;
    const invert = settings.controls.invertY ? -1 : 1;
    cameraPitch = THREE.MathUtils.clamp(
      cameraPitch + deltaY * APP_CONFIG.cameraSensitivity * settings.controls.cameraSensitivityY * invert,
      MOVEMENT_CONFIG.cameraMinPitch,
      MOVEMENT_CONFIG.cameraMaxPitch,
    );
    previousCameraX = event.clientX;
    previousCameraY = event.clientY;
  }
}

function onPointerUp(event) {
  endLayoutControlDrag(event.pointerId);
  if (cameraPointer === event.pointerId) cameraPointer = null;
  if (joystickPointer?.id === event.pointerId) {
    endJoystickPointer(event.pointerId);
  }
}

function beginJoystickPointer(event, floating = false) {
  if (!started || settingsOpen || chatOpen || joystickPointer !== null) return;
  if (settings.controls.editControls) {
    beginLayoutControlDrag("left", event);
    return;
  }
  if (!floating && settings.controls.joystickMode === "Fixed" &&
      !event.target.closest("#joystick")) return;
  joystickPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  floatingJoystickActive = floating || settings.controls.joystickMode === "Floating";
  if (floatingJoystickActive) {
    positionFloatingJoystick(event.clientX, event.clientY);
    joystickOrigin = { x: event.clientX, y: event.clientY };
    renderer.domElement.setPointerCapture?.(event.pointerId);
  } else {
    const bounds = joystick.getBoundingClientRect();
    joystickOrigin = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    joystick.setPointerCapture(event.pointerId);
  }
  joystick.classList.add("active");
  triggerHaptic(8);
}

function moveJoystickPointer(event) {
  if (!joystickPointer || !joystickOrigin) return;
  const radius = joystickSize() / 2;
  const dx = event.clientX - joystickOrigin.x;
  const dy = event.clientY - joystickOrigin.y;
  const length = Math.hypot(dx, dy);
  const scale = length > radius ? radius / length : 1;
  joystickPointer.x = joystickOrigin.x + dx * scale;
  joystickPointer.y = joystickOrigin.y + dy * scale;
  const knobX = dx * scale;
  const knobY = dy * scale;
  joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
}

function positionFloatingJoystick(x, y) {
  const size = joystickSize();
  const safe = readSafeAreaInsets();
  const left = THREE.MathUtils.clamp(x - size / 2, safe.left + 16, window.innerWidth - safe.right - size - 16);
  const top = THREE.MathUtils.clamp(y - size / 2, safe.top + 16, window.innerHeight - safe.bottom - size - 16);
  joystick.style.left = `${left}px`;
  joystick.style.bottom = `${window.innerHeight - top - size}px`;
}

function endJoystickPointer(pointerId) {
  if (joystickPointer?.id !== pointerId) return;
  joystickPointer = null;
  joystickOrigin = null;
  floatingJoystickActive = false;
  joystick.classList.remove("active", "edge-running");
  joystickKnob.style.transform = "translate(-50%, -50%)";
  joystick.style.left = "";
  joystick.style.bottom = "";
}

function openNearestInteraction(interactableId = "") {
  if (!sitting && !seatAction && interactableId) {
    const clickedInteractable = museum.interactables.find((item) => item.id === interactableId);
    if (clickedInteractable) {
      interactWithObject(clickedInteractable);
      return;
    }
  }
  if (sitting) {
    beginStand();
  } else if (seatAction) {
    return;
  } else if (
    museum.guestbookPosition.distanceTo(activeCharacter.position) <= INTERACTION_CONFIG.guestbookDistance
  ) {
    openGuestbook();
  } else {
    const interactable = getNearbyInteractable();
    if (interactable) {
      interactWithObject(interactable);
    } else {
      const seats = getNearbySeatGroups();
      const freeSeat = getFreeSeatSlots(seats, (seatId) => getSeatOccupant(seatId))[0];
      if (freeSeat) beginSitting(freeSeat);
    }
  }
}

function publishObjectEvent(type, objectId, value) {
  objectEvent = {
    eventId: `${onlinePlayerId ?? "local"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    objectId,
    type,
    sentAt: getSharedNow(),
  };
  if (value !== undefined) objectEvent.value = value;
  onlineSession?.publish(getLocalNetworkState());
}

function applyRemoteObjectEvent(event) {
  if (!event || receivedObjectEvents.has(event.eventId)) return;
  receivedObjectEvents.add(event.eventId);
  if (receivedObjectEvents.size > 200) receivedObjectEvents.delete(receivedObjectEvents.values().next().value);
  if (event.type === "piano") {
    playPianoNote(event.value);
  } else if (event.type === "wish" || event.type === "guestbook") {
    const storageKey = event.type === "wish" ? "museum.wishes" : MUSEUM_CONFIG.guestbook.storageKey;
    try {
      const entries = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      entries.unshift(event.type === "wish"
        ? { note: event.value, savedAt: new Date(event.sentAt).toISOString() }
        : { message: event.value, date: new Date(event.sentAt).toISOString() });
      localStorage.setItem(storageKey, JSON.stringify(entries.slice(0, 40)));
      showObjectFeedback(event.type === "wish" ? "A shared wish was made" : "A guestbook note was added");
    } catch (error) {
      console.warn("Could not save the shared fountain wish.", error);
    }
  }
}

function showObjectFeedback(text) {
  showHudPopup(text);
}

function playPianoNote(index) {
  if (!audioContext || !musicGain) startMusic();
  if (!audioContext || !musicGain) return;
  audioContext.resume().catch((error) => console.warn("Could not resume audio for the piano.", error));
  const frequencies = [261.63, 293.66, 329.63, 349.23, 392, 440, 493.88, 523.25];
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;
  oscillator.type = "sine";
  oscillator.frequency.value = frequencies[index % frequencies.length];
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  oscillator.connect(gain);
  gain.connect(effectsGain ?? musicGain ?? audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.45);
}

function formatTrackTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function setMusicStatus(message) {
  musicStatus.textContent = message;
  musicStatus.hidden = !message;
}

function updateMusicControls() {
  const track = jukeboxPlaylist[jukeboxState?.index ?? -1];
  musicTrackTitle.textContent = track?.title ?? "No song selected";
  musicPlayButton.textContent = jukeboxState?.playing ? "Pause" : "Play";
  musicPlayButton.setAttribute("aria-label", jukeboxState?.playing ? "Pause" : "Play");
  musicPlayButton.disabled = !jukeboxPlaylist.length;
  musicPreviousButton.disabled = !jukeboxPlaylist.length;
  musicNextButton.disabled = !jukeboxPlaylist.length;
  musicShuffleButton.disabled = !jukeboxPlaylist.length;
  musicRepeatButton.disabled = !jukeboxPlaylist.length;
  musicShuffleButton.textContent = jukeboxState?.shuffle ? "Shuffle on" : "Shuffle off";
  musicShuffleButton.setAttribute("aria-pressed", String(Boolean(jukeboxState?.shuffle)));
  const loop = jukeboxState?.loop ?? MUSEUM_CONFIG.jukebox.loop;
  musicRepeatButton.textContent = `Repeat ${loop}`;
  musicRepeatButton.setAttribute("aria-pressed", String(loop !== "none"));
  updateMusicProgress();
}

function updateMusicProgress() {
  const duration = Number.isFinite(jukeboxAudio.duration) ? jukeboxAudio.duration : 0;
  const currentTime = Number.isFinite(jukeboxAudio.currentTime) ? jukeboxAudio.currentTime : 0;
  const ratio = duration > 0 ? THREE.MathUtils.clamp(currentTime / duration, 0, 1) : 0;
  musicProgressFill.style.width = `${ratio * 100}%`;
  musicProgress.setAttribute("aria-valuemax", String(Math.max(1, Math.round(duration))));
  musicProgress.setAttribute("aria-valuenow", String(Math.round(currentTime)));
  musicTime.textContent = `${formatTrackTime(currentTime)} / ${formatTrackTime(duration)}`;
}

function updateJukeboxVolume() {
  const position = MUSEUM_CONFIG.jukebox.position;
  const distance = Math.hypot(activeCharacter.position.x - position[0], activeCharacter.position.z - position[2]);
  const { nearDistance, farDistance, farVolumeFloor } = MUSEUM_CONFIG.jukebox;
  const progress = THREE.MathUtils.clamp((distance - nearDistance) / (farDistance - nearDistance), 0, 1);
  const distanceFactor = 1 - progress * (1 - farVolumeFloor);
  const mute = settings.sound.muteAll ? 0 : 1;
  jukeboxAudio.volume = THREE.MathUtils.clamp(
    mute * settings.sound.masterVolume * settings.sound.music * jukeboxVolume * distanceFactor,
    0,
    1,
  );
}

function makeInitialJukeboxState() {
  const now = getSharedNow();
  const decision = decideJukeboxJoin({
    currentState: null,
    hasLivePartner: false,
    restartOnJoin: MUSEUM_CONFIG.jukebox.restartOnJoin,
    count: Math.max(1, jukeboxPlaylist.length),
    now,
    by: selectedKind,
    shuffle: MUSEUM_CONFIG.jukebox.shuffle,
    loop: MUSEUM_CONFIG.jukebox.loop,
    seed: now >>> 0,
  });
  if (!decision) return null;
  return {
    ...decision.state,
    playing: Boolean(MUSEUM_CONFIG.jukebox.autoplay && jukeboxPlaylist.length),
  };
}

function prepareJukeboxForJoin({ hasLivePartner, currentState }) {
  const now = getSharedNow();
  const decision = decideJukeboxJoin({
    currentState,
    hasLivePartner,
    restartOnJoin: MUSEUM_CONFIG.jukebox.restartOnJoin,
    count: Math.max(1, jukeboxPlaylist.length),
    now,
    by: selectedKind,
    shuffle: MUSEUM_CONFIG.jukebox.shuffle,
    loop: MUSEUM_CONFIG.jukebox.loop,
    seed: now >>> 0,
  });
  if (!decision) return null;
  if (decision.action === "restart") {
    jukeboxState = decision.state;
    applyJukeboxSnapshot(jukeboxState, { restart: true });
  } else {
    jukeboxForceRestartAtZero = false;
    jukeboxAutoplayBlocked = false;
    applyJukeboxSnapshot(decision.state, { sync: true });
  }
  return decision;
}

function tryStartJukeboxAudio() {
  if (!jukeboxPlaylist.length || !jukeboxState?.playing || !jukeboxAudio.src) return;
  if (jukeboxForceRestartAtZero) {
    jukeboxPendingSeek = 0;
    if (jukeboxAudio.readyState >= 1) jukeboxAudio.currentTime = 0;
  }
  jukeboxAudio.play().then(() => {
    jukeboxAutoplayBlocked = false;
    jukeboxForceRestartAtZero = false;
    setMusicStatus("");
  }).catch((error) => {
    if (error?.name === "NotAllowedError") {
      jukeboxAutoplayBlocked = true;
      setMusicStatus("Tap Play or another control to allow music playback.");
      return;
    }
    console.warn("Could not play the jukebox track.", error);
    setMusicStatus("This audio file could not be played.");
  });
}

function retryJukeboxOnGesture() {
  if (!jukeboxAutoplayBlocked) return;
  if (jukeboxForceRestartAtZero && jukeboxAutoplayBlocked && jukeboxState?.playing) {
    const now = getSharedNow();
    jukeboxState = normalizeJukeboxState({
      ...jukeboxState,
      startedAt: now,
      pausedAt: 0,
      playing: true,
      updatedAt: now,
    });
    jukeboxPendingSeek = 0;
    if (jukeboxAudio.readyState >= 1) jukeboxAudio.currentTime = 0;
    if (onlineSession && jukeboxState) {
      onlineSession.publishJukebox(jukeboxState).catch((error) => {
        console.warn("Could not sync the restarted jukebox track.", error);
      });
    }
  }
  tryStartJukeboxAudio();
}

function applyJukeboxSnapshot(value, { restart = false, sync = false } = {}) {
  if (value === null || value === undefined) {
    if (!jukeboxPlaylist.length || !onlineSession) return;
    const initialState = jukeboxState ?? makeInitialJukeboxState();
    jukeboxState = initialState;
    onlineSession.ensureJukeboxState(initialState).catch((error) => {
      console.warn("Could not initialize shared jukebox playback.", error);
    });
    applyJukeboxSnapshot(initialState);
    return;
  }
  const next = normalizeJukeboxState(value);
  if (!next) {
    console.warn("Ignoring an invalid shared jukebox state.");
    return;
  }
  const previous = jukeboxState;
  const index = jukeboxPlaylist.length ? next.index % jukeboxPlaylist.length : next.index;
  const state = { ...next, index };
  const position = playbackPosition(state, getSharedNow());
  const restartedTrack = Boolean(previous && state.playing &&
    previous.startedAt !== state.startedAt && position < 1.5);
  if (restart) {
    jukeboxForceRestartAtZero = true;
    jukeboxAutoplayBlocked = false;
  } else if (sync || (state.by && state.by !== selectedKind)) {
    jukeboxForceRestartAtZero = false;
    jukeboxAutoplayBlocked = false;
  }
  jukeboxState = state;
  const track = jukeboxPlaylist[index];
  museum.setJukeboxPlaying(Boolean(track && state.playing));

  if (!jukeboxPlaylist.length || !track) {
    jukeboxAudio.pause();
    updateMusicControls();
    updateSoundMix();
    return;
  }
  const changedTrack = !previous || previous.index !== state.index;

  jukeboxPendingSeek = restart ? 0 : position;
  if ((restart || sync || restartedTrack) && jukeboxAudio.readyState >= 1) {
    jukeboxAudio.currentTime = jukeboxPendingSeek;
  }
  if (jukeboxAudioTrackId !== track.id || changedTrack) {
    jukeboxAudioTrackId = track.id;
    jukeboxAudio.src = track.src;
    jukeboxAudio.load();
    if (state.playing) tryStartJukeboxAudio();
  } else if (state.playing) {
    if (jukeboxAudio.readyState >= 1 &&
        jukeboxPendingSeek < jukeboxAudio.duration - 0.3 &&
        Math.abs(jukeboxAudio.currentTime - jukeboxPendingSeek) > 1.5) {
      jukeboxAudio.currentTime = Math.min(jukeboxPendingSeek, Math.max(0, jukeboxAudio.duration - 0.25));
    }
    tryStartJukeboxAudio();
  } else {
    jukeboxAudio.pause();
    if (jukeboxAudio.readyState >= 1 &&
        Math.abs(jukeboxAudio.currentTime - jukeboxPendingSeek) > 0.35) {
      jukeboxAudio.currentTime = jukeboxPendingSeek;
    }
  }
  updateSoundMix();
  updateMusicControls();
}

function commitJukeboxState(next) {
  const state = normalizeJukeboxState({
    ...next,
    by: selectedKind,
    updatedAt: getSharedNow(),
  });
  if (!state || !jukeboxPlaylist.length) return;
  jukeboxState = state;
  applyJukeboxSnapshot(state);
  if (onlineSession) {
    onlineSession.publishJukebox(state).catch((error) => {
      console.warn("Could not update shared jukebox playback.", error);
      setMusicStatus("Playback could not sync. Check the Firebase jukebox rule.");
    });
  }
}

function startJukeboxOnEnter() {
  if (!jukeboxPlaylist.length) return;
  const state = makeInitialJukeboxState();
  if (!state) return;
  jukeboxState = state;
  jukeboxForceRestartAtZero = true;
  jukeboxAutoplayBlocked = false;
  applyJukeboxSnapshot(state, { restart: true });
  if (state.playing) tryStartJukeboxAudio();
}

function selectJukeboxTrack(index) {
  if (!Number.isInteger(index) || index < 0 || index >= jukeboxPlaylist.length) return;
  const now = getSharedNow();
  commitJukeboxState({
    ...(jukeboxState ?? makeInitialJukeboxState()),
    index,
    startedAt: now,
    pausedAt: 0,
    playing: true,
  });
}

function toggleJukeboxPlayback() {
  if (!jukeboxPlaylist.length) return;
  const now = getSharedNow();
  const current = jukeboxState ?? makeInitialJukeboxState();
  const position = playbackPosition(current, now);
  const playing = !current.playing;
  commitJukeboxState({
    ...current,
    playing,
    pausedAt: playing ? 0 : position,
    startedAt: playing ? now - position * 1000 : current.startedAt,
  });
}

function skipJukeboxTrack(direction) {
  if (!jukeboxPlaylist.length) return;
  const current = jukeboxState ?? makeInitialJukeboxState();
  const index = direction > 0
    ? nextManualTrackIndex(current.index, jukeboxPlaylist.length, current)
    : nextTrackIndex(current.index, jukeboxPlaylist.length, { ...current, direction });
  if (index === null) {
    if (direction > 0) commitJukeboxState({ ...current, playing: false, pausedAt: 0 });
    return;
  }
  selectJukeboxTrack(index);
}

function toggleJukeboxShuffle() {
  if (!jukeboxPlaylist.length) return;
  const current = jukeboxState ?? makeInitialJukeboxState();
  commitJukeboxState({
    ...current,
    shuffle: !current.shuffle,
    seed: current.shuffle ? current.seed : ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0),
  });
}

function cycleJukeboxLoop() {
  if (!jukeboxPlaylist.length) return;
  const current = jukeboxState ?? makeInitialJukeboxState();
  const loop = current.loop === "all" ? "one" : current.loop === "one" ? "none" : "all";
  commitJukeboxState({ ...current, loop });
}

function updateJukeboxPlayback() {
  updateJukeboxVolume();
  if (!jukeboxState || !jukeboxPlaylist.length) {
    updateMusicProgress();
    return;
  }
  const position = playbackPosition(jukeboxState, getSharedNow());
  if (jukeboxState.playing) {
    if (jukeboxAudio.readyState >= 1 &&
        position < jukeboxAudio.duration - 0.3 &&
        Math.abs(jukeboxAudio.currentTime - position) > 1.5) {
      jukeboxAudio.currentTime = Math.min(position, Math.max(0, jukeboxAudio.duration - 0.25));
    }
    if (jukeboxAudio.paused) tryStartJukeboxAudio();
  } else if (!jukeboxAudio.paused) {
    jukeboxAudio.pause();
  }
  updateMusicProgress();
}

async function loadJukeboxPlaylist() {
  try {
    const response = await fetch(`/music/playlist.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Playlist request failed with HTTP ${response.status}.`);
    const entries = await response.json();
    if (!Array.isArray(entries)) throw new TypeError("The music playlist must be an array.");
    jukeboxPlaylist = entries.filter((entry) =>
      entry && typeof entry.id === "string" && typeof entry.title === "string" &&
      typeof entry.src === "string" && entry.src.startsWith("/music/") && !entry.src.includes(".."),
    ).slice(0, 1000);
    setMusicStatus(jukeboxPlaylist.length ? "" : "No songs yet. Add files to public/music.");
    updateMusicControls();
    if (jukeboxEntryRequested && jukeboxPlaylist.length && !jukeboxState) {
      startJukeboxOnEnter();
    } else if (jukeboxState && jukeboxPlaylist.length) {
      applyJukeboxSnapshot(jukeboxState);
    }
  } catch (error) {
    console.warn("Could not load the music playlist.", error);
    jukeboxPlaylist = [];
    setMusicStatus("Could not load the music playlist.");
    updateMusicControls();
  }
}

function interactWithObject(target) {
  if (target.kind === "piano") {
    const note = Math.floor(Math.random() * 8);
    playPianoNote(note);
    publishObjectEvent("piano", target.id, note);
    showObjectFeedback("♪ Piano");
  } else if (target.kind === "photoBooth") {
    const savedCameraPosition = camera.position.clone();
    const savedCameraTarget = cameraTarget.clone();
    const savedCameraFar = camera.far;
    try {
      const partner = remotePlayers.values().next().value?.character;
      if (partner) {
        const midpoint = activeCharacter.position.clone().add(partner.position).multiplyScalar(0.5);
        const separation = activeCharacter.position.distanceTo(partner.position);
        const viewDirection = new THREE.Vector3(
          camera.position.x - midpoint.x,
          0,
          camera.position.z - midpoint.z,
        );
        if (viewDirection.lengthSq() < 1e-4) viewDirection.set(0, 0, 1);
        viewDirection.normalize();
        const framingDistance = Math.max(
          4,
          separation / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.8),
        );
        camera.position.set(
          midpoint.x + viewDirection.x * framingDistance,
          midpoint.y + Math.max(2.5, separation * 0.35),
          midpoint.z + viewDirection.z * framingDistance,
        );
        cameraTarget.set(midpoint.x, midpoint.y + 1.1, midpoint.z);
        camera.far = Math.max(savedCameraFar, framingDistance + separation + 10);
        camera.updateProjectionMatrix();
        camera.lookAt(cameraTarget);
        renderSceneFrame();
      }
      const link = document.createElement("a");
      link.download = `our-museum-photo-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = renderer.domElement.toDataURL("image/png");
      link.click();
      showObjectFeedback("Photo saved");
    } catch (error) {
      console.warn("Could not save the photo booth screenshot.", error);
      showObjectFeedback("Photo unavailable");
    } finally {
      camera.position.copy(savedCameraPosition);
      cameraTarget.copy(savedCameraTarget);
      camera.far = savedCameraFar;
      camera.updateProjectionMatrix();
      camera.lookAt(cameraTarget);
    }
  } else if (target.kind === "fountain") {
    const note = window.prompt("Make a wish (saved on this device):");
    if (note?.trim()) {
      try {
        const wishes = JSON.parse(localStorage.getItem("museum.wishes") ?? "[]");
        wishes.unshift({ note: note.trim().slice(0, 120), savedAt: new Date().toISOString() });
        localStorage.setItem("museum.wishes", JSON.stringify(wishes.slice(0, 40)));
        publishObjectEvent("wish", target.id, note.trim().slice(0, 120));
        showObjectFeedback("Wish saved");
      } catch (error) {
        console.warn("Could not save the fountain wish.", error);
        showObjectFeedback("Wish could not be saved");
      }
    }
  } else if (target.kind === "memoryOrb") {
    showObjectFeedback(target.message);
  } else if (target.kind === "telescope") {
    target.object.rotation.x = THREE.MathUtils.clamp(target.object.rotation.x - 0.08, -0.32, 0.16);
    showObjectFeedback("A little closer to the stars");
  }
}

function setRunButton(pressed) {
  if (settings.controls.runMode === "Toggle") {
    if (pressed) runToggleState = !runToggleState;
  } else {
    runButtonPressed = pressed;
  }
  const active = settings.controls.runMode === "Toggle" ? runToggleState : runButtonPressed;
  runButton.classList.toggle("pressed", active);
  runButton.setAttribute("aria-pressed", String(active));
  if (pressed) triggerHaptic();
}

function resize() {
  const width = sceneElement.clientWidth;
  const height = sceneElement.clientHeight;
  if (width <= 0 || height <= 0) return;
  isMobile = matchMedia("(pointer: coarse)").matches || window.innerWidth <= 760;
  if (started) mobileControls.hidden = !isMobile;
  renderer.setSize(width, height);
  if (bloomComposer) {
    bloomComposer.setPixelRatio(renderer.getPixelRatio());
    bloomComposer.setSize(width, height);
    bloomPass.uniforms.resolution.value.set(renderer.domElement.width, renderer.domElement.height);
  }
  camera.aspect = width / height;
  configureCameraProjection();
  applyMobileLayout();
  if (!started) {
    if (titleScreen.classList.contains("character-select-layout")) {
      updateCharacterPreviewLayout();
    } else if (debugCompare) {
      camera.position.set(0, 2.7, 7.5);
      camera.lookAt(0, 1, 0);
    } else if (width / height < 0.8) {
      camera.position.set(0, CAMERA_CONFIG.previewHeight, CAMERA_CONFIG.mobilePreviewDistance);
      camera.lookAt(0, CAMERA_CONFIG.mobilePreviewLookHeight, 0);
    } else {
      camera.position.set(CAMERA_CONFIG.previewOffsetX, CAMERA_CONFIG.previewHeight, CAMERA_CONFIG.previewDistance);
      camera.lookAt(CAMERA_CONFIG.previewOffsetX, CAMERA_CONFIG.previewLookHeight, 0);
    }
  }
}

function updateDynamicResolution(time) {
  if (!started || !isMobile || document.visibilityState !== "visible") return;
  if (!resolutionSampleStart) resolutionSampleStart = time;
  resolutionSampleFrames += 1;
  const elapsed = (time - resolutionSampleStart) / 1000;
  if (elapsed < PERFORMANCE_CONFIG.resolutionSampleSeconds) return;
  const measuredFps = resolutionSampleFrames / elapsed;
  if (measuredFps < PERFORMANCE_CONFIG.lowFpsThreshold) {
    dynamicResolutionScale = Math.max(
      PERFORMANCE_CONFIG.minimumResolutionScale,
      dynamicResolutionScale - PERFORMANCE_CONFIG.dynamicResolutionStepDown,
    );
  } else if (measuredFps < PERFORMANCE_CONFIG.minimumFps) {
    dynamicResolutionScale = Math.max(
      PERFORMANCE_CONFIG.minimumResolutionScale,
      dynamicResolutionScale - PERFORMANCE_CONFIG.dynamicResolutionStepDown / 2,
    );
  } else if (measuredFps > PERFORMANCE_CONFIG.recoverFpsThreshold) {
    dynamicResolutionScale = Math.min(1, dynamicResolutionScale + PERFORMANCE_CONFIG.dynamicResolutionStepUp);
  }
  const tier = LIGHTING_CONFIG.qualityTiers[qualityTier] ?? LIGHTING_CONFIG.qualityTiers.Low;
  const pixelRatioCap = getPixelRatioCap(tier);
  const requestedScale = Math.min(
    renderDebugOverrides.renderScale ?? settings.graphics.renderScale,
    settings.graphics.batterySaver ? 0.7 : 1,
  );
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap) * requestedScale * dynamicResolutionScale);
  renderer.setSize(sceneElement.clientWidth, sceneElement.clientHeight);
  resolutionSampleStart = time;
  resolutionSampleFrames = 0;
}

for (const button of choiceButtons) {
  button.addEventListener("click", () => {
    if (button.dataset.character !== selectedKind) {
      window.clearTimeout(previewSwitchTimer);
      sceneElement.classList.remove("preview-switch");
      void sceneElement.offsetWidth;
      sceneElement.classList.add("preview-switch");
      previewSwitchTimer = window.setTimeout(() => {
        sceneElement.classList.remove("preview-switch");
      }, 240);
    }
    selectCharacter(button.dataset.character);
  });
}
enterButton.addEventListener("click", () => {
  titleFlythroughActive = false;
  museum.root.visible = false;
  previewPedestal.visible = true;
  activeCharacter.visible = true;
  welcomePhase.hidden = true;
  characterPhase.hidden = false;
  titleScreen.classList.add("character-select-layout");
  resize();
  selectCharacter(selectedKind);
  startMusic();
});
startButton.addEventListener("click", () => {
  void applyOrientationLock();
  beginMuseumEntry();
});
photoModeButton.addEventListener("click", () => { void capturePhoto(); });
photoThumbnail.addEventListener("click", (event) => {
  event.stopPropagation();
  void shareOrOpenLatestPhoto();
});
settingsButton.addEventListener("click", () => setSettingsOpen(!settingsOpen));
settingsCloseButton.addEventListener("click", () => setSettingsOpen(false));
fullscreenButton.addEventListener("click", () => { void toggleFullscreen(); });
settingsFullscreenButton.addEventListener("click", () => { void toggleFullscreen(); });
installAppButton.addEventListener("click", () => { void installMuseumApp(); });
fullscreenTipDismiss.addEventListener("click", () => {
  fullscreenTip.hidden = true;
  document.documentElement.classList.remove("fullscreen-tip-visible");
  try {
    localStorage.setItem("museum.fullscreen-tip.dismissed.v1", "1");
  } catch (error) {
    console.warn("Could not save the fullscreen tip preference.", error);
  }
});
const onFullscreenChange = () => {
  updateFullscreenButton();
  scheduleViewportUpdate();
};
document.addEventListener("fullscreenchange", onFullscreenChange);
document.addEventListener("webkitfullscreenchange", onFullscreenChange);
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installAppButton.hidden = false;
  installAppStatus.hidden = true;
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  installAppButton.hidden = true;
  installAppStatus.hidden = false;
  installAppStatus.textContent = "The museum app is installed.";
});
iosInstallHelp.hidden = !isAppleMobileDevice();
editControlsButton.addEventListener("click", () => {
  setSetting("controls.editControls", !settings.controls.editControls);
  commitSettings("controls.editControls");
  setSettingsOpen(false);
});
resetLayoutButton.addEventListener("click", resetControlLayout);
resetCameraButton.addEventListener("click", resetCameraSettings);
resetSettingsButton.addEventListener("click", () => {
  settings = resetSettings();
  applySettingsToRuntime();
});
bindSettingsInputs();
document.addEventListener("pointerdown", (event) => {
  if (started && event.target instanceof Element && event.target.closest("button")) {
    playAudioCue("tap");
    if (audioContext?.state === "suspended" && !settings.sound.muteAll) {
      audioContext.resume().catch((error) => console.warn("Could not resume museum audio after visibility changed.", error));
    }
  }
}, { capture: true });
inviteCopyButton.addEventListener("click", copyInviteLink);
inviteShareButton.hidden = typeof navigator.share !== "function";
inviteShareButton.addEventListener("click", shareInviteLink);
onlineRetryButton.addEventListener("click", () => {
  if (!started) {
    beginMuseumEntry();
  } else if (onlineSession) {
    void onlineSession.retry();
  } else {
    void startOnlineSession();
  }
});
updateReloadButton.addEventListener("click", requestServiceWorkerUpdate);
interactionButton.addEventListener("click", () => {
  openNearestInteraction(interactionButton.dataset.interactableId);
  triggerHaptic();
});
guideToggle.addEventListener("click", () => {
  const enabled = guideToggle.getAttribute("aria-pressed") !== "true";
  guideToggle.setAttribute("aria-pressed", String(enabled));
  museum.setGuidePathVisible(enabled);
});
memoriesToggle.addEventListener("click", toggleMemories);
memoriesClose.addEventListener("click", closeQuickPanels);
panelScrim.addEventListener("click", closeQuickPanels);
musicPreviousButton.addEventListener("click", () => skipJukeboxTrack(-1));
musicPlayButton.addEventListener("click", toggleJukeboxPlayback);
musicNextButton.addEventListener("click", () => skipJukeboxTrack(1));
musicShuffleButton.addEventListener("click", toggleJukeboxShuffle);
musicRepeatButton.addEventListener("click", cycleJukeboxLoop);
jukeboxAudio.addEventListener("loadedmetadata", () => {
  if (jukeboxAudio.readyState < 1) return;
  jukeboxPendingSeek = jukeboxForceRestartAtZero
    ? 0
    : jukeboxState
      ? playbackPosition(jukeboxState, getSharedNow())
      : jukeboxPendingSeek;
  const durationLimit = Number.isFinite(jukeboxAudio.duration)
    ? Math.max(0, jukeboxAudio.duration - 0.25)
    : jukeboxPendingSeek;
  jukeboxAudio.currentTime = Math.min(jukeboxPendingSeek, durationLimit);
  updateMusicProgress();
  if (jukeboxState?.playing) tryStartJukeboxAudio();
});
jukeboxAudio.addEventListener("timeupdate", updateMusicProgress);
window.addEventListener("pointerdown", retryJukeboxOnGesture, { passive: true });
window.addEventListener("keydown", retryJukeboxOnGesture);
window.addEventListener("touchstart", retryJukeboxOnGesture, { passive: true });
jukeboxAudio.addEventListener("error", () => {
  if (!jukeboxPlaylist.length) return;
  console.warn(`Could not load jukebox audio: ${jukeboxAudio.currentSrc}`);
  setMusicStatus("This audio file could not be loaded.");
});
jukeboxAudio.addEventListener("ended", () => {
  if (!jukeboxState || !jukeboxPlaylist.length) return;
  const endedIndex = jukeboxState.index;
  const next = advanceEndedTrack(jukeboxState, endedIndex, {
    count: jukeboxPlaylist.length,
    now: getSharedNow(),
    by: selectedKind,
  });
  if (!next) return;
  if (onlineSession) {
    onlineSession.advanceJukebox(endedIndex, next).catch((error) => {
      console.warn("Could not advance the shared jukebox track.", error);
    });
  } else {
    commitJukeboxState(next);
  }
});
memoriesDragHandle.addEventListener("pointerdown", (event) => {
  if (memoriesPanel.hidden || event.target.closest("button")) return;
  memoriesDragStart = { id: event.pointerId, y: event.clientY };
  memoriesDragHandle.setPointerCapture(event.pointerId);
});
memoriesDragHandle.addEventListener("pointerup", (event) => {
  if (memoriesDragStart?.id !== event.pointerId) return;
  const draggedDown = event.clientY - memoriesDragStart.y > 50;
  memoriesDragStart = null;
  if (draggedDown) closeQuickPanels();
});
memoriesDragHandle.addEventListener("pointercancel", (event) => {
  if (memoriesDragStart?.id === event.pointerId) memoriesDragStart = null;
});
coupleToggle.addEventListener("click", () => coupleMenuOpen ? closeCoupleMenu() : openCoupleMenu());
coupleActionButton.addEventListener("click", () => coupleMenuOpen ? closeCoupleMenu() : openCoupleMenu());
couplePanelClose.addEventListener("click", closeQuickPanels);
coupleActionButtons.forEach((button) => {
  button.addEventListener("click", () => startCoupleRequest(button.dataset.action));
});
coupleAcceptButton.addEventListener("click", () => acceptCoupleRequest(true));
coupleDeclineButton.addEventListener("click", () => acceptCoupleRequest(false));
coupleStopButton.addEventListener("click", stopCoupleInteraction);
sitDebugSlider.addEventListener("input", () => {
  debugSitBlend = Number(sitDebugSlider.value);
  sitDebugValue.value = debugSitBlend.toFixed(2);
  sitDebugValue.textContent = debugSitBlend.toFixed(2);
});
chatToggle.addEventListener("click", (event) => {
  if (chatOpen) closeChat();
  else openChat(chatUnread.contains(event.target));
});
chatCloseButton.addEventListener("click", closeChat);
chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value;
  void sendChatMessage(text).then((sent) => {
    if (sent) {
      chatInput.value = "";
      updateChatSendAvailability();
      chatInput.focus();
      playAudioCue("chat");
    }
  });
});
chatInput.addEventListener("input", updateChatSendAvailability);
emoteButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-emote]");
  if (!button) return;
  startEmote(button.dataset.emote);
  emojiPickerOpen = false;
  emojiPicker.hidden = true;
  emojiToggle.setAttribute("aria-expanded", "false");
  chatInput.focus({ preventScroll: true });
});
emojiToggle.addEventListener("click", () => {
  emojiPickerOpen = !emojiPickerOpen;
  emojiPicker.hidden = !emojiPickerOpen;
  emojiToggle.setAttribute("aria-expanded", String(emojiPickerOpen));
});
emojiPicker.addEventListener("click", (event) => {
  const button = event.target.closest(".emoji-choice");
  if (button) insertEmoji(button.textContent);
});
guestbookCloseButton.addEventListener("click", closeGuestbook);
guestbook.addEventListener("click", (event) => {
  if (event.target === guestbook) closeGuestbook();
});
guestbookForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = guestbookMessage.value.trim();
  if (!message) {
    guestbookStatus.textContent = "Please write a note before adding it.";
    return;
  }
  const entries = readGuestbookEntries();
  entries.unshift({ message, date: new Date().toISOString() });
  try {
    localStorage.setItem(
      MUSEUM_CONFIG.guestbook.storageKey,
      JSON.stringify(entries.slice(0, INTERACTION_CONFIG.guestbookStorageLimit)),
    );
  } catch (error) {
    console.warn("Could not save the guestbook note.", error);
    guestbookStatus.textContent = "This note could not be saved on this device.";
    return;
  }
  guestbookMessage.value = "";
  guestbookStatus.textContent = "Your note has been added.";
  publishObjectEvent("guestbook", "guestbook", message.slice(0, 120));
  renderGuestbookEntries();
});
document.addEventListener("pointerdown", (event) => {
  if (!chatOpen || !(event.target instanceof Node)) return;
  if (chatPanel.contains(event.target) || chatToggle.contains(event.target)) return;
  closeChat();
});
window.addEventListener("keydown", (event) => {
  if (orientationPaused) {
    event.preventDefault();
    return;
  }
  if (chatOpen) {
    if (event.code === "Escape") closeChat();
    return;
  }
  if (event.code === "Escape") {
    if (settingsOpen) setSettingsOpen(false);
    else if (!memoriesPanel.hidden || !couplePanel.hidden) closeQuickPanels();
    else if (guestbookOpen) closeGuestbook();
    else if (chatOpen) closeChat();
    else if (emojiPickerOpen) {
      emojiPickerOpen = false;
      emojiPicker.hidden = true;
      emojiToggle.setAttribute("aria-expanded", "false");
    }
  }
  if (event.target instanceof HTMLElement && event.target.matches("input, textarea, [contenteditable='true']")) return;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  keys.add(event.code);
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});
window.addEventListener("blur", () => {
  keys.clear();
  cameraPointer = null;
  if (joystickPointer) endJoystickPointer(joystickPointer.id);
  if (runPointerId !== null) {
    runPointerId = null;
  }
  runToggleState = false;
  setRunButton(false);
});
renderer.domElement.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", onPointerUp);
window.addEventListener("resize", scheduleViewportUpdate);
window.addEventListener("orientationchange", scheduleViewportUpdate);
window.addEventListener("resize", updateOrientationPresentation);
window.addEventListener("orientationchange", updateOrientationPresentation);
window.addEventListener("resize", drawLayoutDebug);
window.addEventListener("resize", positionChatForKeyboard);
window.visualViewport?.addEventListener("resize", scheduleViewportUpdate);
window.visualViewport?.addEventListener("resize", positionChatForKeyboard);
window.visualViewport?.addEventListener("scroll", scheduleViewportUpdate);
window.visualViewport?.addEventListener("scroll", positionChatForKeyboard);
chatInput.addEventListener("focus", positionChatForKeyboard);
chatInput.addEventListener("blur", positionChatForKeyboard);
runButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (orientationPaused || settings.controls.editControls) return;
  runPointerId = event.pointerId;
  runButton.setPointerCapture(event.pointerId);
  setRunButton(true);
});
const releaseRunPointer = (event) => {
  if (runPointerId !== event.pointerId) return;
  runPointerId = null;
  setRunButton(false);
};
runButton.addEventListener("pointerup", releaseRunPointer);
runButton.addEventListener("pointercancel", releaseRunPointer);
runButton.addEventListener("lostpointercapture", releaseRunPointer);
joystick.addEventListener("pointerdown", (event) => beginJoystickPointer(event));
actionCluster.addEventListener("pointerdown", (event) => beginLayoutControlDrag("right", event));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    resetActiveInput();
    if (audioContext?.state === "running") {
      audioContext.suspend().catch((error) => console.warn("Could not pause museum audio while hidden.", error));
    }
    if (!jukeboxAudio.paused) {
      jukeboxAudio.pause();
      jukeboxPausedForVisibility = true;
    }
    return;
  }
  if (!orientationPaused && !settings.sound.muteAll && audioContext?.state === "suspended") {
    audioContext.resume().catch((error) => console.warn("Could not resume museum audio after visibility changed.", error));
  }
  if (jukeboxPausedForVisibility) {
    jukeboxPausedForVisibility = false;
    if (jukeboxState?.playing) {
      applyJukeboxSnapshot(jukeboxState, { sync: true });
    }
  }
  void updateScreenWakeLock();
});
document.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("pagehide", saveOnlineState);
populateChatControls();
loadChatHistory();
void loadJukeboxPlaylist();
updateUnreadBadge();
updateMusicButton();
initializeLayoutDebug();
initializeRenderDebug();
applySettingsToRuntime();
updateHeartCounter();
networkDebug.hidden = !debugSkeleton && !debugSit;
sitDebugControls.hidden = !debugSit;
sitDebugSlider.value = String(debugSitBlend);
sitDebugValue.value = debugSitBlend.toFixed(2);
sitDebugValue.textContent = debugSitBlend.toFixed(2);
if (firebaseConfig) {
  setOnlineStatus("Ready to connect · enter the museum", "ready");
} else {
  setOnlineStatus("Solo ready · configure Firebase for online play", "ready");
}
updateNetworkDiagnostics({ roomId, connectionState: "not started", playerCount: 0 });

function render(time) {
  requestAnimationFrame(render);
  if (document.visibilityState === "hidden") {
    clock.getDelta();
    return;
  }
  const delta = Math.min(clock.getDelta(), APP_CONFIG.maxDeltaTime);
  if (started) {
    if (!orientationPaused) {
      updateLighting(delta);
      updateRoomAmbience(delta);
      updateCoupleController();
      updateMovement(delta);
      updateCoupleFacing(delta);
      museum.update(activeCharacter.position, delta);
      for (const remote of remotePlayers.values()) museum.loadRoomsAtPosition(remote.target);
      updateRemoteCharacters(delta);
      applyCouplePoses(delta);
      processPendingMemoryTravel();
      collectNearbyHearts();
      updateInteractions();
      renderSeatActions();
      updateCamera(false, delta);
      updateShadowCamera();
      updateDebug();
      updateSittingDebug();
      updateSpeechBubbles();
      minimapAccumulator += delta;
      if (minimapAccumulator >= 0.25) {
        minimapAccumulator = 0;
        drawMinimap();
        updateHeartHint();
      }
    }
    if (onlineSession) {
      statePublishAccumulator += delta;
      sessionSaveAccumulator += delta;
      if (statePublishAccumulator >= 1 / ONLINE_CONFIG.publishRate) {
        statePublishAccumulator %= 1 / ONLINE_CONFIG.publishRate;
        onlineSession.publish(getLocalNetworkState());
      }
      if (sessionSaveAccumulator >= 1) {
        sessionSaveAccumulator %= 1;
        saveOnlineState();
      }
    }
    jukeboxSyncAccumulator += delta;
    if (jukeboxSyncAccumulator >= 0.25) {
      jukeboxSyncAccumulator %= 0.25;
      updateJukeboxPlayback();
    }
  } else {
    if (titleFlythroughActive) {
      const progress = (Math.sin(time * 0.00007) + 1) / 2;
      const z = 31 - progress * 16;
      camera.position.set(-9, 2.8 + Math.sin(time * 0.00012) * 0.1, z);
      camera.lookAt(-9, 2.35, z - 5.5);
    } else if (titleScreen.classList.contains("character-select-layout")) {
      if (!reducedMotionPreference.matches) {
        activeCharacter.rotation.y += CAMERA_CONFIG.previewRotationSpeed * delta;
      }
      updateCharacterPreviewCamera();
    } else {
      if (debugCompare) activeCharacter.rotation.y = 0;
      else activeCharacter.rotation.y += CAMERA_CONFIG.previewRotationSpeed * delta;
      if (!debugCompare && !debugSkeleton && !debugSit && !debugPaths && !debugLighting && !debugLayout) {
        const orbit = time * 0.00008;
        const distance = isMobile ? CAMERA_CONFIG.mobilePreviewDistance : CAMERA_CONFIG.previewDistance + 0.6;
        camera.position.set(
          Math.sin(orbit) * distance,
          CAMERA_CONFIG.previewHeight + Math.sin(orbit * 0.5) * 0.14,
          Math.cos(orbit) * distance,
        );
        camera.lookAt(0, CAMERA_CONFIG.previewLookHeight, 0);
      }
    }
    if (debugSkeleton) updateDebug();
  }
  if (time - lastFrame < 1000 / targetFrameRate) return;
  lastFrame = time;
  renderSceneFrame(delta);
  renderedFrames += 1;
  if (!fpsSampleStart) fpsSampleStart = time;
  fpsSampleFrames += 1;
  if (time - fpsSampleStart >= 1000) {
    fpsCounter.textContent = `${Math.round(fpsSampleFrames * 1000 / (time - fpsSampleStart))} FPS`;
    fpsSampleFrames = 0;
    fpsSampleStart = time;
  }
  updateDynamicResolution(time);
}

const shadowCenter = new THREE.Vector3();
const shadowGridUp = new THREE.Vector3(0, 1, 0);
const shadowCameraZ = new THREE.Vector3();
const shadowCameraRight = new THREE.Vector3();
const shadowCameraUp = new THREE.Vector3();
const lastSnappedShadowCenter = new THREE.Vector3(Infinity, Infinity, Infinity);

function updateShadowCamera() {
  shadowCenter.copy(activeCharacter.position);
  let nearbyPlayerCount = 1;
  for (const remote of remotePlayers.values()) {
    if (remote.character.position.distanceTo(activeCharacter.position) > 12) continue;
    shadowCenter.add(remote.character.position);
    nearbyPlayerCount += 1;
  }
  shadowCenter.divideScalar(nearbyPlayerCount);
  shadowCenter.y += 1;

  shadowCameraZ.copy(shadowLightOffset).normalize();
  shadowCameraRight.crossVectors(shadowGridUp, shadowCameraZ).normalize();
  shadowCameraUp.crossVectors(shadowCameraZ, shadowCameraRight).normalize();
  const texelSize = 16 / keyLight.shadow.mapSize.x;
  const rightOffset = Math.round(shadowCenter.dot(shadowCameraRight) / texelSize) * texelSize -
    shadowCenter.dot(shadowCameraRight);
  const upOffset = Math.round(shadowCenter.dot(shadowCameraUp) / texelSize) * texelSize -
    shadowCenter.dot(shadowCameraUp);
  shadowCenter.addScaledVector(shadowCameraRight, rightOffset).addScaledVector(shadowCameraUp, upOffset);
  if (shadowCenter.distanceToSquared(lastSnappedShadowCenter) < 1e-8) return;

  keyLight.target.position.copy(shadowCenter);
  keyLight.position.copy(shadowCenter).add(shadowLightOffset);
  keyLight.target.updateMatrixWorld(true);
  keyLight.updateMatrixWorld(true);
  lastSnappedShadowCenter.copy(shadowCenter);
}

selectCharacter(debugCompare || debugSit ? "resha" : selectedKind);
if (debugCompare) titleScreen.hidden = true;
initializeLightingDebug();
if (debugSkeleton || debugSit || debugPaths || debugLighting || debugRender) {
  startExperience();
}
resize();
requestAnimationFrame(render);
registerServiceWorker();
