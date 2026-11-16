import { defineConfig } from "@playwright/test";

const profiles = [
  { name: "iphone-se-landscape", viewport: { width: 667, height: 375 }, isMobile: true, hasTouch: true },
  { name: "iphone-13-14-landscape", viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
  { name: "iphone-15-pro-max-landscape", viewport: { width: 932, height: 430 }, isMobile: true, hasTouch: true },
  { name: "pixel-7-landscape", viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true },
  { name: "small-android-landscape", viewport: { width: 640, height: 360 }, isMobile: true, hasTouch: true },
  { name: "ipad-mini-landscape", viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true },
  { name: "ipad-mini-portrait", viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true },
  { name: "desktop-1280", viewport: { width: 1280, height: 720 }, isMobile: false, hasTouch: false },
];

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true,
    launchOptions: {
      channel: "chrome",
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
      ],
    },
    trace: "retain-on-failure",
  },
  projects: profiles.map(({ name, ...use }) => ({ name, use })),
  webServer: {
    command: process.platform === "win32"
      ? "npm.cmd run dev -- --host 127.0.0.1 --port 4173"
      : "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_FIREBASE_API_KEY: "",
      VITE_FIREBASE_AUTH_DOMAIN: "",
      VITE_FIREBASE_DATABASE_URL: "",
      VITE_FIREBASE_PROJECT_ID: "",
      VITE_FIREBASE_APP_ID: "",
    },
  },
});
