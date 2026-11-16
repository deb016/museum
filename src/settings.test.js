import assert from "node:assert/strict";
import test from "node:test";
import {
  loadSettings,
  migrateSettings,
  normalizeSettings,
  resetSettings,
  saveSettings,
  SETTINGS_DEFAULTS,
  SETTINGS_SCHEMA,
  SETTINGS_STORAGE_KEY,
} from "./settings.js";
import { LIGHTING_CONFIG } from "../museum.config.js";
import { PERFORMANCE_CONFIG } from "./config.js";

test("new visitors get the complete Cinematic preset within the mobile safety cap", () => {
  const settings = loadSettings({ getItem: () => null });
  const tier = LIGHTING_CONFIG.qualityTiers.Cinematic;
  assert.equal(settings.graphics.preset, "Cinematic");
  for (const effect of ["bloom", "filmGrain", "vignette", "lightShafts", "dust", "floorReflections", "shadows"]) {
    assert.equal(settings.graphics[effect], true, effect);
  }
  for (const effect of ["shafts", "dust", "bloom", "grain", "depthOfField"]) {
    assert.equal(tier[effect], true, effect);
  }
  assert.equal(LIGHTING_CONFIG.effects.contactShadows, true);
  assert.equal(tier.pixelRatio, 2);
  assert.equal(PERFORMANCE_CONFIG.mobilePixelRatioCap, tier.pixelRatio);
});

test("settings use one versioned key, fill defaults, and clamp saved values", () => {
  const values = new Map([[SETTINGS_STORAGE_KEY, JSON.stringify({
    version: 1,
    controls: { deadzone: 4, runMode: "invalid" },
    graphics: { renderScale: 0.1 },
  })]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const settings = loadSettings(storage);
  assert.equal(settings.controls.deadzone, 0.4);
  assert.equal(settings.controls.runMode, SETTINGS_DEFAULTS.controls.runMode);
  assert.equal(settings.graphics.renderScale, 0.5);
  assert.equal(settings.camera.portrait.fov, SETTINGS_DEFAULTS.camera.portrait.fov);
  assert.equal(settings.display.showMinimap, false);
  assert.equal(settings.controls.showButtonLabels, false);
  settings.display.showMinimap = true;
  settings.controls.showButtonLabels = true;
  settings.sound.masterVolume = 0.25;
  assert.equal(saveSettings(settings, storage), true);
  assert.deepEqual([...values.keys()], [SETTINGS_STORAGE_KEY]);
  assert.equal(JSON.parse(values.get(SETTINGS_STORAGE_KEY)).sound.masterVolume, 0.25);
  assert.equal(JSON.parse(values.get(SETTINGS_STORAGE_KEY)).display.showMinimap, true);
  assert.equal(JSON.parse(values.get(SETTINGS_STORAGE_KEY)).controls.showButtonLabels, true);
});

test("migration carries the prior master volume and mute values into the settings object", () => {
  const migrated = migrateSettings(null, { muteAll: true, masterVolume: 0.42 });
  assert.equal(migrated.version, 1);
  assert.equal(migrated.sound.muteAll, true);
  assert.equal(migrated.sound.masterVolume, 0.42);
});

test("legacy local preferences migrate into the sole versioned storage key", () => {
  const values = new Map([
    ["museum.musicMuted", "true"],
    ["museum.masterVolume", "0.42"],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const settings = loadSettings(storage);
  assert.equal(settings.sound.muteAll, true);
  assert.equal(settings.sound.masterVolume, 0.42);
  assert.deepEqual([...values.keys()], [SETTINGS_STORAGE_KEY]);
});

test("settings schema documents a default and a range or option list for every setting", () => {
  const visit = (value, prefix = "") => {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (child && typeof child === "object" && !Array.isArray(child)) {
        visit(child, path);
        continue;
      }
      if (path === "version") continue;
      const definition = SETTINGS_SCHEMA[path];
      assert.equal(definition.default, child, path);
      assert.ok(definition.range || definition.options, path);
    }
  };
  visit(SETTINGS_DEFAULTS);
});

test("storage errors keep defaults and fail writes explicitly", () => {
  const storage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  const settings = loadSettings(storage);
  assert.deepEqual(settings, normalizeSettings(SETTINGS_DEFAULTS));
  assert.equal(saveSettings(settings, storage), false);
  assert.deepEqual(resetSettings(storage), normalizeSettings(SETTINGS_DEFAULTS));
});
