// Settings stay device-local in one versioned record; legacy audio keys are read only during migration.
export const SETTINGS_STORAGE_KEY = "museum.settings.v1";

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

// Defaults are also the source of truth for the settings sheet. Ranges and option lists below document every user-editable value.
export const SETTINGS_DEFAULTS = deepFreeze({
  version: 1,
  controls: {
    cameraSensitivityX: 1,
    cameraSensitivityY: 1,
    joystickSensitivity: 1,
    deadzone: 0.15,
    joystickMode: "Fixed",
    runMode: "Edge-auto",
    invertY: false,
    leftHanded: false,
    showButtonLabels: false,
    buttonSize: 1,
    buttonOpacity: 0.55,
    haptics: false,
    editControls: false,
    layout: { leftX: 0, leftY: 0, rightX: 0, rightY: 0 },
  },
  // Portrait and landscape profiles apply independently and transition live; their valid ranges are in SETTINGS_RANGES.
  camera: {
    mode: "Third person",
    smoothing: 7,
    autoPullBack: true,
    portrait: { height: 2.05, distance: 5.2, fov: 48 },
    landscape: { height: 2.05, distance: 4.4, fov: 42 },
  },
  graphics: {
    preset: "Cinematic",
    bloom: true,
    filmGrain: true,
    vignette: true,
    lightShafts: true,
    dust: true,
    floorReflections: true,
    shadows: true,
    renderScale: 1,
    fpsCap: 60,
    batterySaver: false,
    fpsCounter: false,
  },
  sound: {
    masterVolume: 0.7,
    music: 1,
    effects: 1,
    ambient: 1,
    voice: 1,
    muteAll: false,
  },
  display: {
    keepScreenOn: false,
    reducedMotion: false,
    largeText: false,
    showMinimap: false,
  },
});

export const SETTINGS_RANGES = deepFreeze({
  "controls.cameraSensitivityX": { min: 0.3, max: 2.5, step: 0.1 },
  "controls.cameraSensitivityY": { min: 0.3, max: 2.5, step: 0.1 },
  "controls.joystickSensitivity": { min: 0.3, max: 2.5, step: 0.1 },
  "controls.deadzone": { min: 0, max: 0.4, step: 0.01 },
  "controls.buttonSize": { min: 0.8, max: 1.25, step: 0.05 },
  "controls.buttonOpacity": { min: 0.35, max: 0.85, step: 0.05 },
  "controls.layout.leftX": { min: -80, max: 80, step: 1 },
  "controls.layout.leftY": { min: -80, max: 80, step: 1 },
  "controls.layout.rightX": { min: -80, max: 80, step: 1 },
  "controls.layout.rightY": { min: -80, max: 80, step: 1 },
  "camera.smoothing": { min: 1, max: 15, step: 0.5 },
  "camera.portrait.height": { min: 0.8, max: 3.5, step: 0.1 },
  "camera.portrait.distance": { min: 1.5, max: 9, step: 0.1 },
  "camera.portrait.fov": { min: 30, max: 80, step: 1 },
  "camera.landscape.height": { min: 0.8, max: 3.5, step: 0.1 },
  "camera.landscape.distance": { min: 1.5, max: 9, step: 0.1 },
  "camera.landscape.fov": { min: 30, max: 80, step: 1 },
  "graphics.renderScale": { min: 0.5, max: 1, step: 0.05 },
  "sound.masterVolume": { min: 0, max: 1, step: 0.05 },
  "sound.music": { min: 0, max: 1, step: 0.05 },
  "sound.effects": { min: 0, max: 1, step: 0.05 },
  "sound.ambient": { min: 0, max: 1, step: 0.05 },
  "sound.voice": { min: 0, max: 1, step: 0.05 },
});

export const SETTINGS_OPTIONS = deepFreeze({
  "controls.joystickMode": ["Fixed", "Floating"],
  "controls.runMode": ["Edge-auto", "Hold", "Toggle"],
  "camera.mode": ["First person", "Third person"],
  "graphics.preset": ["Auto", "Low", "Medium", "High", "Cinematic"],
  "graphics.fpsCap": [30, 60],
  "controls.invertY": [false, true],
  "controls.leftHanded": [false, true],
  "controls.showButtonLabels": [false, true],
  "controls.haptics": [false, true],
  "controls.editControls": [false, true],
  "camera.autoPullBack": [false, true],
  "graphics.bloom": [false, true],
  "graphics.filmGrain": [false, true],
  "graphics.vignette": [false, true],
  "graphics.lightShafts": [false, true],
  "graphics.dust": [false, true],
  "graphics.floorReflections": [false, true],
  "graphics.shadows": [false, true],
  "graphics.batterySaver": [false, true],
  "graphics.fpsCounter": [false, true],
  "sound.muteAll": [false, true],
  "display.keepScreenOn": [false, true],
  "display.reducedMotion": [false, true],
  "display.largeText": [false, true],
  "display.showMinimap": [false, true],
});

function flattenSettings(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" && !Array.isArray(child)
      ? flattenSettings(child, path)
      : [[path, child]];
  });
}

export const SETTINGS_SCHEMA = deepFreeze(Object.fromEntries(
  flattenSettings(SETTINGS_DEFAULTS)
    .filter(([path]) => path !== "version")
    .map(([path, value]) => [path, {
      default: value,
      ...(SETTINGS_RANGES[path] ? { range: SETTINGS_RANGES[path] } : {}),
      ...(SETTINGS_OPTIONS[path] ? { options: SETTINGS_OPTIONS[path] } : {}),
    }]),
));

const clone = (value) => JSON.parse(JSON.stringify(value));

function mergeDefaults(source, defaults) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return clone(defaults);
  const result = {};
  for (const [key, defaultValue] of Object.entries(defaults)) {
    const value = source[key];
    result[key] = defaultValue && typeof defaultValue === "object" && !Array.isArray(defaultValue)
      ? mergeDefaults(value, defaultValue)
      : value ?? defaultValue;
  }
  return result;
}

function getPath(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function setPath(object, path, value) {
  const keys = path.split(".");
  const finalKey = keys.pop();
  const parent = keys.reduce((current, key) => current[key], object);
  parent[finalKey] = value;
}

export function normalizeSettings(value) {
  const settings = mergeDefaults(value, SETTINGS_DEFAULTS);
  settings.version = SETTINGS_DEFAULTS.version;

  for (const [path, { min, max }] of Object.entries(SETTINGS_RANGES)) {
    const current = Number(getPath(settings, path));
    setPath(settings, path, Number.isFinite(current) ? Math.min(max, Math.max(min, current)) : getPath(SETTINGS_DEFAULTS, path));
  }
  for (const [path, options] of Object.entries(SETTINGS_OPTIONS)) {
    if (!options.includes(getPath(settings, path))) setPath(settings, path, getPath(SETTINGS_DEFAULTS, path));
  }
  if (typeof settings.camera.autoPullBack !== "boolean") settings.camera.autoPullBack = true;
  for (const path of [
    "controls.invertY", "controls.leftHanded", "controls.showButtonLabels", "controls.haptics", "controls.editControls",
    "camera.autoPullBack", "graphics.bloom", "graphics.filmGrain", "graphics.vignette",
    "graphics.lightShafts", "graphics.dust", "graphics.floorReflections", "graphics.shadows",
    "graphics.batterySaver", "graphics.fpsCounter", "sound.muteAll", "display.keepScreenOn",
    "display.reducedMotion", "display.largeText", "display.showMinimap",
  ]) {
    if (typeof getPath(settings, path) !== "boolean") setPath(settings, path, getPath(SETTINGS_DEFAULTS, path));
  }
  return settings;
}

export function migrateSettings(stored, legacy = {}) {
  const source = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  const migrated = mergeDefaults(source, SETTINGS_DEFAULTS);
  if (source.version !== SETTINGS_DEFAULTS.version) {
    if (typeof legacy.muteAll === "boolean") migrated.sound.muteAll = legacy.muteAll;
    if (Number.isFinite(legacy.masterVolume)) migrated.sound.masterVolume = legacy.masterVolume;
  }
  return normalizeSettings(migrated);
}

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage;
  } catch (error) {
    console.warn("Could not access local settings storage.", error);
    return null;
  }
}

export function loadSettings(storage) {
  const target = resolveStorage(storage);
  if (!target) return clone(SETTINGS_DEFAULTS);
  let stored = null;
  try {
    const value = target.getItem(SETTINGS_STORAGE_KEY);
    stored = value === null ? null : JSON.parse(value);
  } catch (error) {
    console.warn("Could not read saved museum settings.", error);
  }

  const legacy = {};
  if (stored?.version !== SETTINGS_DEFAULTS.version) {
    try {
      const value = target.getItem("museum.musicMuted");
      if (value !== null) legacy.muteAll = value === "true";
    } catch (error) {
      console.warn("Could not read the legacy mute preference.", error);
    }
    try {
      const value = target.getItem("museum.masterVolume");
      if (value !== null) legacy.masterVolume = Number(value);
    } catch (error) {
      console.warn("Could not read the legacy volume preference.", error);
    }
  }
  const migrated = migrateSettings(stored, legacy);
  if (stored?.version !== SETTINGS_DEFAULTS.version &&
      (stored !== null || Object.keys(legacy).length > 0) &&
      saveSettings(migrated, target)) {
    try {
      target.removeItem?.("museum.musicMuted");
      target.removeItem?.("museum.masterVolume");
    } catch (error) {
      console.warn("Could not remove migrated legacy preferences.", error);
    }
  }
  return migrated;
}

export function saveSettings(settings, storage) {
  const target = resolveStorage(storage);
  if (!target) return false;
  try {
    target.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch (error) {
    console.warn("Could not save museum settings.", error);
    return false;
  }
}

export function resetSettings(storage) {
  const defaults = clone(SETTINGS_DEFAULTS);
  saveSettings(defaults, storage);
  return defaults;
}
