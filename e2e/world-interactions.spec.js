import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const screenshotRoot = path.resolve("qa-report", "screenshots");

async function tap(page, testInfo, selector) {
  const element = page.locator(selector);
  if (testInfo.project.use.hasTouch) await element.tap();
  else await element.click();
}

async function capture(page, testInfo, name) {
  const directory = path.join(screenshotRoot, testInfo.project.name);
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${name}.png`), animations: "disabled" });
}

test("touch players can sit on a bench and stand again", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-13-14-landscape", "Run the bench flow on the 844x390 touch profile.");
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    localStorage.setItem("museum.settings.v1", JSON.stringify({
      version: 1,
      graphics: { preset: "Low", fpsCounter: false },
      display: { showMinimap: false },
    }));
  });
  await page.goto("/");
  await tap(page, testInfo, "#enter-button");
  await tap(page, testInfo, '.character-choice[data-character="resha"]');
  await tap(page, testInfo, "#start-button");
  await expect(page.locator("#hud")).toBeVisible({ timeout: 20_000 });

  await tap(page, testInfo, "#memories-toggle");
  await tap(page, testInfo, '#memory-rooms .memory-room-button[aria-label^="How We Met"]');
  await expect(page.locator("#memory-travel")).toBeHidden();
  await page.waitForTimeout(500);

  const seatActions = page.locator("#seat-actions");
  const joystick = page.locator("#joystick");
  const session = await page.context().newCDPSession(page);
  for (let attempt = 0; attempt < 30 && !(await seatActions.isVisible()); attempt += 1) {
    const box = await joystick.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const id = 80 + attempt;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id }],
    });
    await expect(joystick).toHaveClass(/active/);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x - 20, y: y + 64, id }],
    });
    await expect.poll(() => joystick.locator(".joystick-knob").evaluate((knob) =>
      getComputedStyle(knob).transform)).not.toBe("matrix(1, 0, 0, 1, 0, 0)");
    await page.waitForTimeout(300);
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(100);
  }
  await session.detach();
  await expect(seatActions).toBeVisible();
  await capture(page, testInfo, "world-seat-actions");
  const sitButton = seatActions.getByRole("button", { name: /Sit/ }).first();
  await expect(sitButton).toBeVisible();
  const sitTarget = await sitButton.boundingBox();
  expect(sitTarget.width).toBeGreaterThanOrEqual(48);
  expect(sitTarget.height).toBeGreaterThanOrEqual(48);
  await sitButton.tap();
  await expect(seatActions.getByRole("button", { name: "Stand up" })).toBeVisible({ timeout: 20_000 });
  await capture(page, testInfo, "world-seat-stand");
  await seatActions.getByRole("button", { name: "Stand up" }).tap();
  await expect(seatActions.getByRole("button", { name: /Sit/ }).first()).toBeVisible({ timeout: 20_000 });
});

test("photo frames are static and the Cinema Room plays the assigned video", async ({ page }, testInfo) => {
  test.skip(
    !["iphone-se-landscape", "desktop-1280"].includes(testInfo.project.name),
    "Gallery verification runs on one phone and one desktop profile.",
  );
  test.setTimeout(180_000);
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${message.text()} (${message.location().url})`);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
  });
  await page.addInitScript(() => {
    localStorage.setItem("museum.settings.v1", JSON.stringify({
      version: 1,
      graphics: { preset: "Low", fpsCounter: false },
      display: { showMinimap: false },
    }));
    window.__cinemaVideoPlaying = false;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (this.src.includes("/media/memories/23.mp4")) {
        this.addEventListener("playing", () => { window.__cinemaVideoPlaying = true; }, { once: true });
      }
      return play.apply(this, args);
    };
  });
  await page.goto("/");
  await tap(page, testInfo, "#enter-button");
  await tap(page, testInfo, "#start-button");
  await expect(page.locator("#hud")).toBeVisible({ timeout: 20_000 });

  expect(await page.locator("#viewer, #viewer-previous, #viewer-next, #memory-frames, #memories-tab-frames").count()).toBe(0);
  await tap(page, testInfo, "#memories-toggle");
  await expect(page.locator("#memory-rooms .memory-room-button")).toHaveCount(12);
  await expect(page.locator("#memory-travel")).not.toContainText("Frames");
  await tap(page, testInfo, '#memory-rooms .memory-room-button[aria-label^="Cinema Room"]');
  await expect(page.locator("#memory-travel")).toBeHidden();
  const videoMetadata = await page.evaluate(async () => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    video.src = "/media/memories/23.mp4";
    video.load();
    await new Promise((resolve, reject) => {
      video.addEventListener("loadedmetadata", resolve, { once: true });
      video.addEventListener("error", () => reject(new Error("Cinema video metadata failed to load.")), { once: true });
    });
    return { width: video.videoWidth, height: video.videoHeight };
  });
  expect(videoMetadata.width / videoMetadata.height).toBeCloseTo(16 / 9, 2);
  await expect.poll(() => page.evaluate(() => window.__cinemaVideoPlaying)).toBe(true);
  await page.waitForTimeout(1500);
  await capture(page, testInfo, "cinema-room-video");
  await expect(page.locator("#viewer")).toHaveCount(0);
  expect(errors).toEqual([]);
});
