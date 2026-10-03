import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import path from "node:path";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const failures = [];
page.on("pageerror", (e) => failures.push(e.message));
const base = path.resolve("../oszap-design-preview");
await page.goto(pathToFileURL(path.join(base, "index.html")).href);
for (const [name, w, h] of [
  ["desktop", 1600, 960],
  ["notebook", 1366, 768],
  ["mobile", 390, 844],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.screenshot({ path: path.join(base, name + ".png"), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) throw new Error(name + ": horizontal overflow");
  if (name === "mobile") {
    await page.getByRole("button", { name: /Marina Oliveira/ }).click();
    await page.getByRole("button", { name: "Voltar às conversas" }).waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(base, "mobile-chat.png"), fullPage: true });
    await page.getByRole("button", { name: "Voltar às conversas" }).click();
    await page.getByRole("button", { name: /Marina Oliveira/ }).waitFor({ state: "visible" });
  }
}
await page.setViewportSize({ width: 1600, height: 960 });
await page.getByRole("button", { name: "Tema escuro" }).click();
await page.waitForTimeout(350);
await page.screenshot({ path: path.join(base, "dark.png"), fullPage: true });
await page.getByRole("button", { name: "Atenção · 3" }).click();
await page.getByRole("dialog").waitFor({ state: "visible" });
await page.screenshot({ path: path.join(base, "attention.png"), fullPage: true });
if (failures.length) throw new Error(failures.join("\n"));
console.log(
  "Preview: desktop/notebook/mobile without horizontal overflow; mobile return, dark mode, attention panel; no JS errors.",
);
await browser.close();
