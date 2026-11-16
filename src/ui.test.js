import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MUSEUM_CONFIG } from "../museum.config.js";
import { CHAT_CONFIG } from "./config.js";
import { SETTINGS_DEFAULTS } from "./settings.js";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const main = await readFile(new URL("./main.js", import.meta.url), "utf8");
const css = await readFile(new URL("./style.css", import.meta.url), "utf8");

test("game UI uses no native select or option controls", () => {
  assert.doesNotMatch(html, /<\s*(?:select|option)\b/i);
  assert.doesNotMatch(main, /createElement\(\s*["'](?:select|option)["']\s*\)/i);
});

test("quick actions live beside settings and are absent from the settings sheet", () => {
  const memories = html.indexOf('id="memories-toggle"');
  const together = html.indexOf('id="couple-toggle"');
  const photo = html.indexOf('id="photo-mode-button"');
  const settings = html.indexOf('id="settings-button"');
  const settingsSheet = html.indexOf('id="settings-sheet"');
  const memoryPanel = html.indexOf('id="memory-travel"');
  assert.ok(memories >= 0 && memories < together && together < photo && photo < settings);
  assert.ok(settings < settingsSheet && settingsSheet < memoryPanel);
  assert.doesNotMatch(html.slice(settingsSheet, memoryPanel), /id="(?:memories-toggle|couple-toggle|photo-mode-button)"/);
  assert.match(html, /data-setting="controls\.showButtonLabels"/);
  assert.match(html, /data-setting="display\.showMinimap"/);
  assert.equal(SETTINGS_DEFAULTS.controls.showButtonLabels, false);
  assert.equal(SETTINGS_DEFAULTS.display.showMinimap, false);
});

test("photo frames have no viewer, selection controls, or frame fast-travel controls", () => {
  const source = `${html}\n${main}\n${css}`;
  assert.doesNotMatch(source, /viewer-(?:previous|next|close)|function openViewer|function changeViewerFrame/);
  assert.doesNotMatch(source, /memories-tab-frames|memory-frame-button|open-frame|getFramesNear|highlightFrame/);
  assert.match(html, /id="memory-rooms"/);
  assert.match(main, /museum\.update\(activeCharacter\.position, delta\)/);
});

test("couple interactions have no status pill but retain requests and stop controls", () => {
  const source = `${html}\n${main}\n${css}`;
  assert.doesNotMatch(source, /couple-status|coupleStatus/);
  assert.match(html, /id="couple-stop"/);
  assert.match(html, /id="couple-request"/);
  assert.match(html, /id="couple-accept"/);
  assert.match(html, /id="couple-decline"/);
  assert.match(main, /function acceptCoupleRequest\(accepted\)/);
  assert.match(main, /COUPLE_INTERACTION_CONFIG\.requestTimeoutSeconds/);
  assert.match(main, /coupleStopButton\.hidden = !canStop && !riding/);
});

test("renderer pixel-ratio policy applies the same mobile safety cap at startup, quality changes, and scaling", () => {
  assert.match(main, /function getPixelRatioCap\(tier\)/);
  assert.match(main, /getPixelRatioCap\(initialQuality\)/);
  assert.match(main, /const pixelRatioCap = getPixelRatioCap\(tier\)/);
  assert.equal((main.match(/getPixelRatioCap\(tier\)/g) ?? []).length, 3);
  assert.match(main, /dynamicResolutionScale = Math\.max\(/);
  assert.match(main, /const shadowMapSize = qualityTier === "High" \|\| qualityTier === "Cinematic" \? 2048 : 1024/);
});

test("all six HUD actions use inline vector icons", () => {
  const actionIds = [
    "chat-toggle",
    "fullscreen-button",
    "memories-toggle",
    "couple-toggle",
    "photo-mode-button",
    "settings-button",
  ];
  for (const id of actionIds) {
    const button = html.match(new RegExp(`<button\\b[^>]*id="${id}"[^>]*>[\\s\\S]*?<\\/button>`));
    assert.ok(button, `expected HUD action ${id}`);
    assert.match(button[0], /<svg class="hud-icon" aria-hidden="true"/);
  }
  assert.doesNotMatch(main, /fullscreenButton\.textContent\s*=/);
  assert.match(main, /fullscreenIconPath\.setAttribute\(/);
  assert.match(main, /function showObjectFeedback\(text\) \{\s*showHudPopup\(text\);\s*\}/);
  const titleRules = [...css.matchAll(/\.room-title-card\s*\{([^}]*)\}/g)];
  assert.ok(titleRules.some(([, declarations]) => /pointer-events:\s*none/.test(declarations)));
});

test("Photo mode is a one-tap scene capture with no panel", () => {
  assert.doesNotMatch(html, /id="photo-panel"|id="capture-photo-button"|Take photo<\/button>/);
  assert.match(html, /id="photo-mode-button"[^>]*aria-label="Take photo"/);
  assert.match(html, /id="photo-thumbnail"/);
  assert.match(main, /photoModeButton\.addEventListener\("click", \(\) => \{ void capturePhoto\(\); \}\)/);
  assert.match(main, /renderSceneFrame\(\)[\s\S]*photoCanvas\.toBlob/);
  assert.match(main, /"image\/jpeg", 0\.92/);
  assert.match(main, /photoCooldownUntil = now \+ 1000/);
  assert.doesNotMatch(main, /document\.body\.classList\.add\("photo-mode"\)/);
  assert.doesNotMatch(css, /body\.photo-mode|\.photo-panel/);
});

test("photo button is hidden in Settings without lift or placeholder code", () => {
  assert.match(main, /document\.documentElement\.classList\.toggle\("settings-open", open\)/);
  assert.doesNotMatch(main, /photoButtonPlaceholder|liftPhotoButtonAboveSettings|restorePhotoButtonToHud|positionPhotoButtonInSettings/);
  assert.match(css, /html\.settings-open #photo-mode-button\s*\{[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/);
  assert.match(main, /photoModeButton\.addEventListener\("click", \(\) => \{ void capturePhoto\(\); \}\)/);
});

test("chat keeps a mobile-sized composer and removes suggested messages", () => {
  const source = `${html}\n${main}\n${css}`;
  assert.equal("quickReplies" in CHAT_CONFIG, false);
  assert.doesNotMatch(source, /id="chat-quick-replies"|class="quick-reply"|data-reply|CHAT_CONFIG\.quickReplies/);
  assert.match(html, /id="chat-input" type="text" maxlength="300"[^>]*autocomplete="off" autocapitalize="sentences" enterkeyhint="send" placeholder="Type a message\.\.\."/);
  assert.match(html, /id="chat-form"[^>]*>[\s\S]*class="chat-send" aria-label="Send message" disabled[\s\S]*class="chat-send-icon"/);
  assert.ok(html.indexOf('id="chat-status"') < html.indexOf('class="chat-compose"'));
  assert.match(css, /\.chat-panel\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column/);
  assert.match(css, /\.chat-history\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1 1 0/);
  assert.match(css, /#chat-input\s*\{[^}]*min-height:\s*48px;[^}]*font-size:\s*16px/);
  assert.match(main, /function openChat\(focusInput = false\)/);
  assert.match(main, /if \(focusInput\) requestAnimationFrame/);
  assert.match(main, /function getOrientationName\(\) \{\s*return window\.matchMedia\("\(orientation: landscape\)"\)\.matches/);
  assert.match(main, /window\.visualViewport\?\.addEventListener\("scroll", positionChatForKeyboard\)/);
  assert.match(main, /if \(chatOpen\) \{\s*if \(event\.code === "Escape"\) closeChat\(\);\s*return;/);
  assert.match(css, /\.chat-open \.mobile-controls,[\s\S]*\.chat-open \.seat-actions/);
});

test("scrollable UI uses the museum palette and visible keyboard focus", () => {
  assert.match(css, /--museum-soft-gold:/);
  assert.match(css, /--museum-rose:/);
  assert.match(css, /--museum-warm-brown:/);
  assert.match(css, /\*::-webkit-scrollbar\s*\{/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-color:\s*var\(--museum-scroll-thumb\)\s*var\(--museum-scroll-track\)/);
  assert.match(css, /button:focus-visible,[\s\S]*outline:\s*2px solid var\(--museum-gold\)/);
  assert.match(css, /@media \(pointer:\s*coarse\)\s*\{[\s\S]*min-height:\s*44px/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test("compact touch devices get a blocking landscape prompt without disconnecting online play", () => {
  assert.match(html, /id="orientation-overlay"[^>]*role="alertdialog"[^>]*aria-modal="true"/);
  assert.match(html, /Rotate your phone to play/);
  assert.match(html, /This museum is best explored in landscape/);
  assert.doesNotMatch(html, /orientation-hint|Prefer landscape/);
  assert.match(main, /matchMedia\("\(orientation: portrait\)"\)\.matches/);
  assert.match(main, /window\.addEventListener\("orientationchange", updateOrientationPresentation\)/);
  assert.match(main, /if \(orientationPaused\) \{\s*event\.preventDefault\(\)/);
  assert.match(main, /if \(started\) \{\s*if \(!orientationPaused\) \{[\s\S]*?if \(onlineSession\) \{/);
  assert.match(main, /audioContext\.suspend\(\)\.catch/);
  assert.match(main, /onlineSession\.publish\(getLocalNetworkState\(\)\)/);
  assert.match(css, /\.orientation-overlay\s*\{[^}]*z-index:\s*1000/);
  assert.match(css, /@keyframes rotate-phone/);
});

test("fast-travel spawn points cover the requested room walking order", () => {
  const { architecture } = MUSEUM_CONFIG;
  const roomOrder = [
    architecture.entranceHall,
    architecture.atrium,
    ...architecture.chapters,
    ...architecture.sideRooms,
  ].map((room) => room.id);
  assert.deepEqual(roomOrder, [
    "entrance-hall",
    "atrium",
    "how-we-met",
    "our-first-month",
    "favorite-memories",
    "inside-jokes",
    "our-future",
    "cinema",
    "garden-courtyard",
    "terrace",
    "secret-room",
    "final-room",
  ]);
  assert.deepEqual(Object.keys(MUSEUM_CONFIG.fastTravelSpawns), roomOrder);
});

test("music playback controls live in Settings with no world jukebox panel", () => {
  assert.doesNotMatch(html, /id="jukebox-panel"|id="jukebox-autoplay-prompt"|id="jukebox-toast"|id="jukebox-playlist"/);
  for (const id of ["music-status", "music-track-title", "music-progress", "music-time", "music-previous", "music-play", "music-next", "music-shuffle", "music-repeat"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /<summary>Music<\/summary>[\s\S]*id="music-track-title"[\s\S]*id="music-next"/);
  assert.match(html, /Music and song volume[\s\S]*data-setting="sound\.music"/);
  assert.match(html, /Ambient effects[\s\S]*data-setting="sound\.ambient"/);
  assert.match(html, /id="music-toggle"[^>]*data-setting="sound\.muteAll"/);
  assert.doesNotMatch(main, /jukeboxPanel|jukeboxClose|openJukeboxPanel|renderJukeboxPlaylist|jukeboxAutoplayPrompt|jukeboxToast/);
  assert.doesNotMatch(css, /\.jukebox-panel|\.jukebox-autoplay-prompt|\.jukebox-toast/);
  assert.match(css, /\.music-transport\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.music-transport \.settings-action,[\s\S]*min-height:\s*48px/);
  assert.match(main, /musicNextButton\.addEventListener\("click", \(\) => skipJukeboxTrack\(1\)\)/);
  assert.match(main, /function selectJukeboxTrack\(index\)[\s\S]*?playing: true/);
  assert.match(main, /if \(settings\.sound\.muteAll\) return 0|settings\.sound\.muteAll \? 0 : 1/);
});

test("seat actions stack at the bottom-right and lift the interaction button when visible", () => {
  assert.match(css, /\.seat-actions\s*\{[^}]*position:\s*fixed;[^}]*right:\s*calc\(16px \+ var\(--safe-right\)\);[^}]*bottom:\s*calc\(16px \+ var\(--safe-bottom\)\);[^}]*flex-direction:\s*column/);
  assert.match(css, /html\.seat-actions-visible #interaction-button\s*\{[^}]*bottom:\s*calc\(var\(--primary-bottom,[^}]*\+ 112px\)/);
  assert.match(css, /html\.seat-actions-visible #couple-action-button,[\s\S]*html\.seat-actions-visible #run-button\s*\{[^}]*bottom:\s*calc\(var\(--heart-bottom, 100px\) \+ 112px\)/);
  assert.match(css, /@media \(pointer: fine\) and \(min-width: 761px\) \{[\s\S]*?\.seat-actions\s*\{\s*right:\s*24px;\s*bottom:\s*24px;/);
  assert.match(css, /html\.chat-open \.seat-actions/);
  assert.match(css, /html\.chat-open #interaction-button/);
});
