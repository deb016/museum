import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const screenshotRoot = path.resolve("qa-report", "screenshots");

async function capture(page, testInfo, state) {
  const directory = path.join(screenshotRoot, testInfo.project.name);
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${state}.png`), animations: "disabled" });
}

async function activate(page, testInfo, selector, options = {}) {
  const element = page.locator(selector);
  if (testInfo.project.use.hasTouch) await element.tap(options);
  else await element.click();
}

async function checkVisibleButtonTargets(page, selector) {
  return page.locator(selector).evaluateAll((buttons) => buttons
    .filter((button) => {
      const style = getComputedStyle(button);
      const box = button.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" &&
        Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
    })
    .map((button) => {
      const box = button.getBoundingClientRect();
      return {
        label: button.getAttribute("aria-label") || button.textContent.trim(),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    })
    .filter(({ width, height }) => width < 44 || height < 44));
}

async function exerciseMultitouchControls(page, testInfo) {
  if (!testInfo.project.use.hasTouch) return;
  const joystick = page.locator("#joystick");
  const joystickBox = await joystick.boundingBox();
  const runButton = page.locator("#run-button");
  const runBox = await runButton.boundingBox();
  const size = page.viewportSize();
  const joystickPoint = {
    x: joystickBox.x + joystickBox.width / 2,
    y: joystickBox.y + joystickBox.height / 2,
  };
  const lookPoint = { x: Math.round(size.width * 0.58), y: Math.round(size.height * 0.52) };
  const runPoint = { x: runBox.x + runBox.width / 2, y: runBox.y + runBox.height / 2 };
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { ...joystickPoint, id: 1 },
      { ...lookPoint, id: 2 },
      { ...runPoint, id: 3 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: joystickPoint.x + 30, y: joystickPoint.y - 20, id: 1 },
      { x: lookPoint.x + 24, y: lookPoint.y + 12, id: 2 },
      { ...runPoint, id: 3 },
    ],
  });
  await expect(joystick).toHaveClass(/active/);
  await expect(runButton).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => joystick.locator(".joystick-knob").evaluate((knob) =>
    getComputedStyle(knob).transform)).not.toBe("matrix(1, 0, 0, 1, 0, 0)");
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(joystick).not.toHaveClass(/active/);
  await expect(runButton).toHaveAttribute("aria-pressed", "false");
  await session.detach();
}

async function setGraphicsTier(page, testInfo, tier) {
  await activate(page, testInfo, "#settings-button");
  const graphics = page.locator("#settings-sheet details").filter({
    has: page.locator('[data-setting="graphics.preset"]'),
  });
  if (await graphics.getAttribute("open") === null) {
    if (testInfo.project.use.hasTouch) await graphics.locator("summary").tap();
    else await graphics.locator("summary").click();
  }
  await activate(page, testInfo, `[data-setting="graphics.preset"] button[data-value="${tier}"]`);
  await activate(page, testInfo, "#settings-close");
  await expect(page.locator("#settings-sheet")).toBeHidden();
}

async function travelToRoom(page, testInfo, label) {
  await activate(page, testInfo, "#memories-toggle");
  const roomButton = page.locator("#memory-rooms .memory-room-button")
    .filter({ hasText: label });
  await expect(roomButton).toBeVisible();
  await activate(page, testInfo, `#memory-rooms .memory-room-button[aria-label^="${label}"]`);
  await expect(page.locator("#memory-travel")).toBeHidden();
  await page.waitForTimeout(450);
}

async function sampleBuiltInFps(page, room, tier, testInfo) {
  await page.waitForTimeout(500);
  const samples = [];
  for (let index = 0; index < 2; index += 1) {
    await page.waitForTimeout(1000);
    const text = await page.locator("#fps-counter").innerText();
    const fps = Number.parseInt(text, 10);
    if (Number.isFinite(fps)) samples.push(fps);
  }
  const ordered = [...samples].sort((a, b) => a - b);
  const result = {
    device: testInfo.project.name,
    room,
    tier,
    fpsSamples: samples,
    medianFps: ordered.length
      ? Math.round((ordered[Math.floor((ordered.length - 1) / 2)] + ordered[Math.floor(ordered.length / 2)]) / 2)
      : null,
  };
  console.log(`[mobile-fps] ${JSON.stringify(result)}`);
  await capture(page, testInfo, `perf-${room.toLowerCase().replaceAll(" ", "-")}-${tier.toLowerCase()}`);
  return result;
}

test("touch-first museum flow fits the viewport and captures key screens", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const browserErrors = [];
  const { width: initialWidth, height: initialHeight } = testInfo.project.use.viewport;
  const initialLandscape = initialWidth >= initialHeight;
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(`console: ${message.text()} (${message.location().url})`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      browserErrors.push(`http ${response.status()}: ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    browserErrors.push(`request failed: ${request.url()} (${request.failure()?.errorText})`);
  });
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  await page.addInitScript(() => {
    localStorage.setItem("museum.settings.v1", JSON.stringify({
      version: 1,
      controls: { runMode: "Hold" },
      graphics: { preset: "Cinematic", fpsCounter: true },
      display: { showMinimap: true },
    }));
  });
  await page.goto("/");
  await expect(page.locator("#title-screen")).toBeVisible();
  await expect(page.locator("#scene canvas")).toBeVisible();
  await capture(page, testInfo, "01-title");
  if (testInfo.project.use.hasTouch && !initialLandscape) {
    await expect(page.locator("#orientation-overlay")).toBeVisible();
    await capture(page, testInfo, "13-portrait-warning");
    await page.setViewportSize({ width: initialHeight, height: initialWidth });
    await expect(page.locator("#orientation-overlay")).toBeHidden();
  } else if (!testInfo.project.use.hasTouch) {
    await expect(page.locator("#orientation-overlay")).toBeHidden();
  }

  await activate(page, testInfo, "#enter-button");
  await expect(page.locator("#character-phase")).toBeVisible();
  await capture(page, testInfo, "02-character-dave");
  await activate(page, testInfo, '.character-choice[data-character="resha"]');
  await expect(page.locator('.character-choice[data-character="resha"]')).toHaveAttribute("aria-pressed", "true");
  await capture(page, testInfo, "03-character-resha");
  await activate(page, testInfo, '.character-choice[data-character="daveRey"]');
  await expect(page.locator('.character-choice[data-character="daveRey"]')).toHaveAttribute("aria-pressed", "true");
  await activate(page, testInfo, "#start-button");
  await expect(page.locator("#loading-screen")).toBeVisible();
  await expect(page.locator("#loading-message")).not.toBeEmpty();
  await capture(page, testInfo, "04-loading");
  await expect(page.locator("#hud")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#couple-status")).toHaveCount(0);
  if (testInfo.project.use.hasTouch) await expect(page.locator("#mobile-controls")).toBeVisible();
  if (testInfo.project.use.hasTouch) await expect(page.locator("#run-button")).toBeVisible();
  else await expect(page.locator("#run-button")).toBeHidden();
  await capture(page, testInfo, "05-gameplay");
  if (testInfo.project.use.hasTouch) {
    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const seatActions = document.querySelector("#seat-actions");
      const interactionButton = document.querySelector("#interaction-button");
      const previous = {
        classes: root.className,
        seatHtml: seatActions.innerHTML,
        seatHidden: seatActions.hidden,
        interactionText: interactionButton.textContent,
        interactionHidden: interactionButton.hidden,
      };
      for (const label of ["Sit left", "Sit right"]) {
        const button = document.createElement("button");
        button.className = "seat-action";
        button.textContent = label;
        seatActions.append(button);
      }
      seatActions.hidden = false;
      root.classList.add("seat-actions-visible");
      interactionButton.hidden = false;
      interactionButton.textContent = "Open";
      const rect = (selector) => {
        const { left, top, right, bottom, width, height } =
          document.querySelector(selector).getBoundingClientRect();
        return { left, top, right, bottom, width, height };
      };
      const boxes = Object.fromEntries(
        ["#seat-actions", "#interaction-button", "#couple-action-button", "#run-button", "#joystick"]
          .map((selector) => [selector, rect(selector)]),
      );
      const overlaps = (a, b) => a.left < b.right && a.right > b.left &&
        a.top < b.bottom && a.bottom > b.top;
      const sitButtons = [...seatActions.querySelectorAll(".seat-action")].map((button) => {
        const box = button.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, width: box.width, height: box.height };
      });
      return {
        previous,
        viewport: { width: innerWidth, height: innerHeight },
        boxes,
        sitButtons,
        overlaps: Object.fromEntries(
          ["#interaction-button", "#couple-action-button", "#run-button", "#joystick"]
            .map((selector) => [selector, overlaps(boxes["#seat-actions"], boxes[selector])]),
        ),
      };
    });
    await capture(page, testInfo, "world-seat-layout");
    const { boxes, sitButtons } = layout;
    expect(boxes["#seat-actions"].left).toBeGreaterThan(layout.viewport.width * 0.7);
    expect(boxes["#seat-actions"].right).toBeGreaterThan(layout.viewport.width - 40);
    expect(boxes["#seat-actions"].bottom).toBeGreaterThan(layout.viewport.height - 40);
    expect(layout.overlaps).toEqual({
      "#interaction-button": false,
      "#couple-action-button": false,
      "#run-button": false,
      "#joystick": false,
    });
    expect(boxes["#interaction-button"].bottom).toBeLessThanOrEqual(boxes["#seat-actions"].top);
    expect(sitButtons).toHaveLength(2);
    expect(sitButtons[0].width).toBe(sitButtons[1].width);
    expect(sitButtons[0].height).toBeGreaterThanOrEqual(48);
    expect(sitButtons[1].top).toBeGreaterThanOrEqual(sitButtons[0].bottom + 7);
    await page.evaluate((previous) => {
      const root = document.documentElement;
      const seatActions = document.querySelector("#seat-actions");
      const interactionButton = document.querySelector("#interaction-button");
      root.className = previous.classes;
      seatActions.innerHTML = previous.seatHtml;
      seatActions.hidden = previous.seatHidden;
      interactionButton.textContent = previous.interactionText;
      interactionButton.hidden = previous.interactionHidden;
    }, layout.previous);
  }
  await exerciseMultitouchControls(page, testInfo);
  await capture(page, testInfo, "14-multitouch-controls");
  const performanceSession = await page.context().newCDPSession(page);
  await performanceSession.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await travelToRoom(page, testInfo, "Garden Courtyard");
  await sampleBuiltInFps(page, "Garden Courtyard", "Low", testInfo);
  await setGraphicsTier(page, testInfo, "Medium");
  await sampleBuiltInFps(page, "Garden Courtyard", "Medium", testInfo);
  await travelToRoom(page, testInfo, "Central Rotunda");
  await setGraphicsTier(page, testInfo, "Low");
  await sampleBuiltInFps(page, "Central Rotunda", "Low", testInfo);
  await setGraphicsTier(page, testInfo, "Medium");
  await sampleBuiltInFps(page, "Central Rotunda", "Medium", testInfo);
  await performanceSession.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await performanceSession.detach();

  const layoutValid = await page.locator("html").getAttribute("data-layout-valid");
  expect(layoutValid).toBe("true");
  const layoutOverlap = await page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element || element.hidden) return null;
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    };
    const overlaps = (a, b) => Boolean(a && b &&
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    const controls = ["#run-button", "#couple-action-button", "#interaction-button"]
      .map(box).filter(Boolean);
    return {
      joystickAction: overlaps(box("#joystick"), box("#couple-action-button")),
      joystickRun: overlaps(box("#joystick"), box("#run-button")),
      minimapJoystick: overlaps(box("#minimap"), box("#joystick")),
      minimapAction: controls.some((control) => overlaps(box("#minimap"), control)),
      minimapTitle: overlaps(box("#minimap"), box("#room-title-card")),
      titleJoystick: overlaps(box("#room-title-card"), box("#joystick")),
      titleAction: controls.some((control) => overlaps(box("#room-title-card"), control)),
    };
  });
  expect(layoutOverlap.joystickAction).toBe(false);
  expect(layoutOverlap.joystickRun).toBe(false);
  expect(layoutOverlap.minimapJoystick).toBe(false);
  expect(layoutOverlap.minimapAction).toBe(false);
  expect(layoutOverlap.minimapTitle).toBe(false);
  expect(layoutOverlap.titleJoystick).toBe(false);
  expect(layoutOverlap.titleAction).toBe(false);

  await activate(page, testInfo, "#settings-button");
  await expect(page.locator("#settings-sheet")).toBeVisible();
  await expect(page.locator("#photo-mode-button")).toBeHidden();
  await expect(page.locator("#minimap")).toBeHidden();
  await capture(page, testInfo, "06-settings-top");
  await page.locator(".settings-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator("#settings-close")).toBeInViewport();
  await capture(page, testInfo, "07-settings-bottom");
  const smallSettingsTargets = await checkVisibleButtonTargets(page, "#settings-sheet button");
  expect(smallSettingsTargets, `small Settings targets: ${JSON.stringify(smallSettingsTargets)}`).toEqual([]);
  await activate(page, testInfo, "#settings-close");
  await expect(page.locator("#settings-sheet")).toBeHidden();
  await expect(page.locator("#photo-mode-button")).toBeVisible();
  await activate(page, testInfo, "#photo-mode-button");
  await expect(page.locator("#photo-thumbnail")).toBeVisible({ timeout: 15_000 });
  await capture(page, testInfo, "16-photo-captured");
  if (testInfo.project.use.hasTouch) {
    await activate(page, testInfo, "#settings-button");
    await page.locator(".settings-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await activate(page, testInfo, "#edit-controls-button");
    await expect(page.locator("#settings-sheet")).toBeHidden();
    await expect(page.locator("#mobile-controls")).toHaveClass(/editing/);
    const joystickBox = await page.locator("#joystick").boundingBox();
    const joystickCenter = {
      x: joystickBox.x + joystickBox.width / 2,
      y: joystickBox.y + joystickBox.height / 2,
    };
    const layoutSession = await page.context().newCDPSession(page);
    await layoutSession.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...joystickCenter, id: 8 }],
    });
    await layoutSession.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: joystickCenter.x + 24, y: joystickCenter.y + 12, id: 8 }],
    });
    await layoutSession.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const savedLayout = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("museum.settings.v1")).controls.layout);
    expect(savedLayout.leftX).not.toBe(0);
    await layoutSession.detach();
    await activate(page, testInfo, "#settings-button");
    await page.locator(".settings-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await activate(page, testInfo, "#reset-layout-button");
    const resetLayout = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("museum.settings.v1")).controls.layout);
    expect(resetLayout).toEqual({ leftX: 0, leftY: 0, rightX: 0, rightY: 0 });
    await activate(page, testInfo, "#edit-controls-button");
    await expect(page.locator("#mobile-controls")).not.toHaveClass(/editing/);
    await activate(page, testInfo, "#settings-button");
  } else {
    await activate(page, testInfo, "#settings-button");
  }
  await activate(page, testInfo, "#chat-toggle");
  await expect(page.locator("#settings-sheet")).toBeHidden();
  await expect(page.locator("#chat-panel")).toBeVisible();
  await expect(page.locator("#fullscreen-tip")).toBeHidden();
  await expect(page.locator("#minimap")).toBeHidden();
  const smallChatTargets = await checkVisibleButtonTargets(page, "#chat-panel button");
  expect(smallChatTargets, `small Chat targets: ${JSON.stringify(smallChatTargets)}`).toEqual([]);
  await capture(page, testInfo, "08-chat");
  await activate(page, testInfo, "#chat-input");
  const chatViewport = page.viewportSize();
  await page.setViewportSize({
    width: chatViewport.width,
    height: Math.max(220, Math.min(280, chatViewport.height - 48)),
  });
  await expect(page.locator(".chat-compose")).toBeInViewport();
  await capture(page, testInfo, "08b-chat-keyboard");
  await page.setViewportSize(chatViewport);
  await page.locator("#chat-input").fill("Mobile chat check");
  await expect(page.locator(".chat-send")).toBeEnabled();
  await expect(page.locator(".chat-compose")).toBeInViewport();
  await activate(page, testInfo, ".chat-send");
  await expect(page.locator("#chat-history")).toContainText("Mobile chat check");
  await activate(page, testInfo, "#emoji-toggle");
  await capture(page, testInfo, "09-chat-emoji");
  const emote = page.locator("#chat-emote-buttons button").first();
  if (testInfo.project.use.hasTouch) await emote.tap();
  else await emote.click();
  await capture(page, testInfo, "09b-chat-emote");
  await activate(page, testInfo, "#chat-close");
  await expect(page.locator("#chat-panel")).toBeHidden();

  await activate(page, testInfo, "#memories-toggle");
  await expect(page.locator("#memory-travel")).toBeVisible();
  await capture(page, testInfo, "10-memories-rooms");
  await expect(page.locator("#memories-tab-frames, #memory-frames, #viewer")).toHaveCount(0);
  const smallMemoryTargets = await checkVisibleButtonTargets(page, "#memory-travel button");
  expect(smallMemoryTargets, `small Memories targets: ${JSON.stringify(smallMemoryTargets)}`).toEqual([]);
  await activate(page, testInfo, "#memories-close");
  await expect(page.locator("#memory-travel")).toBeHidden();
  await activate(page, testInfo, "#memories-toggle");
  await activate(page, testInfo, "#panel-scrim", { position: { x: 5, y: 5 } });
  await expect(page.locator("#memory-travel")).toBeHidden();
  if (!testInfo.project.use.hasTouch) {
    await activate(page, testInfo, "#memories-toggle");
    await page.keyboard.press("Escape");
    await expect(page.locator("#memory-travel")).toBeHidden();
  }

  await activate(page, testInfo, "#couple-toggle");
  await expect(page.locator("#couple-panel")).toBeVisible();
  await expect(page.locator("#fullscreen-tip")).toBeHidden();
  await expect(page.locator("#minimap")).toBeHidden();
  await capture(page, testInfo, "12-couple-panel");
  await page.locator("#couple-panel").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator("#couple-panel-close")).toBeInViewport();
  await capture(page, testInfo, "12b-couple-actions-bottom");
  await page.locator("#couple-panel").evaluate((element) => { element.scrollTop = 0; });
  const smallCoupleTargets = await checkVisibleButtonTargets(page, "#couple-panel button");
  expect(smallCoupleTargets, `small Couple targets: ${JSON.stringify(smallCoupleTargets)}`).toEqual([]);
  await activate(page, testInfo, "#couple-panel-close");
  await expect(page.locator("#couple-panel")).toBeHidden();

  if (testInfo.project.use.hasTouch && initialLandscape) {
    await page.setViewportSize({ width: initialHeight, height: initialWidth });
    await expect(page.locator("#orientation-overlay")).toBeVisible();
    await capture(page, testInfo, "13-portrait-warning");
    await expect(page.locator("html")).toHaveClass(/orientation-paused/);
    await page.setViewportSize({ width: initialWidth, height: initialHeight });
    await expect(page.locator("#orientation-overlay")).toBeHidden();
    await expect(page.locator("html")).not.toHaveClass(/orientation-paused/);
  }

  const hudTargets = await checkVisibleButtonTargets(page, "#hud button");
  expect(hudTargets, `small HUD targets: ${JSON.stringify(hudTargets)}`).toEqual([]);
  const mobileTargets = await checkVisibleButtonTargets(page, "#mobile-controls button");
  expect(mobileTargets, `small mobile action targets: ${JSON.stringify(mobileTargets)}`).toEqual([]);
  expect(browserErrors, "browser console errors or unhandled rejections").toEqual([]);
});
