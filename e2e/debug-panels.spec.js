import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("layout, lighting, render, and paths debug modes remain available", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "Debug panel screenshots are captured once at desktop size.");
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [debug, selector, name] of [
    ["layout", "#layout-debug", "layout"],
    ["lighting", "#lighting-debug", "lighting"],
    ["render", "#render-debug", "render"],
    ["paths", "#hud", "paths"],
  ]) {
    await page.goto(`/?debug=${debug}`);
    await expect(page.locator(selector)).toBeVisible();
    const directory = path.resolve("qa-report", "screenshots", "desktop-1280");
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, `debug-${name}.png`), animations: "disabled" });
  }
  expect(errors).toEqual([]);
});
