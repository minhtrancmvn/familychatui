// Real end-to-end flow in a browser, desktop and phone: login, profiles with PIN, a chat with a real
// 9router reply, reload persistence, rename, settings, manage-with-PIN, logout. Takes screenshots and
// reports console/page errors and horizontal overflow.
//
// Usage: npm run e2e  (needs a running server; it creates profiles and chats, so point it at a
// throwaway DATA_DIR). Env: BASE_URL (http://localhost:3000), E2E_PASSWORD (family),
// E2E_EXPECT_REPLY=0 to accept an error reply, E2E_DOCS=<folder with notes.docx and sheets.xlsx> to
// also test drag-and-drop and document attachments (needs LibreOffice on the server).
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.E2E_PASSWORD ?? "family";
const EXPECT_REPLY = process.env.E2E_EXPECT_REPLY !== "0";
/** Folder with notes.docx and sheets.xlsx for the attachment steps (skipped when unset). */
const DOCS = process.env.E2E_DOCS;
const OUT = process.argv[2] ?? "shots";
const TAG = Date.now().toString(36).slice(-4);
const NAME = `E2E ${TAG}`;
const PIN = "2468";
mkdirSync(OUT, { recursive: true });

const problems = [];
const overflow = [];
const steps = [];

function watch(page, label) {
  // Each flow types one wrong password (401) and one wrong PIN (403) on purpose; Chrome logs those
  // answers as failed resource loads. Anything beyond one of each is a real problem.
  const expected = { 401: 1, 403: 1 };
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const status = /status of (401|403)/.exec(m.text())?.[1];
    if (status && expected[status] > 0) {
      expected[status] -= 1;
      return;
    }
    problems.push(`[${label}] console.error: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => problems.push(`[${label}] pageerror: ${String(e).slice(0, 300)}`));
}

async function shot(page, name) {
  await page.waitForTimeout(300);
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (o.sw > o.cw) overflow.push(`${name}: scrollWidth ${o.sw} > ${o.cw}`);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

function step(label) {
  steps.push(label);
  console.log(`  ✓ ${label}`);
}

async function login(page, prefix) {
  await page.goto(`${BASE}/login`);
  await page.locator("#family-password").fill("definitely-wrong");
  await page.locator('form button[type="submit"]').click();
  await page.getByRole("alert").waitFor();
  await shot(page, `${prefix}01-login-wrong`);
  await page.locator("#family-password").fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL("**/profiles");
  step(`${prefix}: wrong password refused, right password unlocks`);
}

async function enterProfile(page, prefix) {
  await page.getByRole("button", { name: `${NAME} (PIN required)` }).click();
  await page.getByRole("dialog").waitFor();
  for (const d of "1111") await page.keyboard.press(d);
  await page.getByText("Wrong PIN, try again.").waitFor();
  await shot(page, `${prefix}03-pin-wrong`);
  for (const d of PIN) await page.keyboard.press(d);
  await page.waitForURL(`${BASE}/`);
  step(`${prefix}: wrong PIN refused, right PIN enters the profile`);
}

/** Sends a prompt and waits for the reply to finish. Returns the assistant text. */
async function chat(page, prefix, prompt) {
  const box = page.getByRole("textbox", { name: "Message" }).filter({ visible: true }).first();
  await box.fill(prompt);
  await box.press("Enter");
  await page.waitForURL("**/chat/**");
  const done = page.getByRole("button", { name: /^(Copy|Copied)$/ }).filter({ visible: true }).last();
  await done.waitFor({ timeout: 180_000 });
  const failed = await page.getByText("Something went wrong. Try again.").count();
  const bubbles = page.locator(".bg-bubble-bot");
  const reply = (await bubbles.last().innerText()).trim();
  await shot(page, `${prefix}05-reply`);
  if (EXPECT_REPLY && (failed || !reply)) throw new Error(`reply failed: ${reply.slice(0, 300)}`);
  step(`${prefix}: reply ${failed ? "FAILED (allowed)" : "arrived"}: ${JSON.stringify(reply.slice(0, 80))}`);
  return reply;
}

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const page = await ctx.newPage();
  watch(page, "desktop");

  await login(page, "d");
  await page.getByRole("button", { name: "Add profile" }).first().click();
  await page.locator("#profile-name").fill(NAME);
  await page.getByRole("switch", { name: "Require PIN" }).click();
  await page.getByRole("textbox", { name: "Profile PIN" }).fill(PIN);
  await shot(page, "d02-add-profile");
  await page.getByRole("button", { name: "Save profile" }).click();
  await page.getByRole("button", { name: `${NAME} (PIN required)` }).waitFor();
  step("d: profile with PIN created");

  await enterProfile(page, "d");
  await shot(page, "d04-home");
  await chat(page, "d", "Reply with just the word: pong");

  const url = page.url();
  await page.reload();
  await page.locator(".bg-bubble-user", { hasText: "Reply with just the word: pong" }).waitFor();
  step("d: chat survives a reload (stored on the server)");

  await page.getByRole("button", { name: "Chat options" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Chat title" }).fill(`Renamed ${TAG}`);
  await page.getByRole("button", { name: "Save name" }).click();
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByRole("heading", { name: `Renamed ${TAG}` }).waitFor();
  step("d: rename persists");

  await page.goto(`${BASE}/settings`);
  await page.getByRole("radio", { name: "Tiếng Việt" }).first().click();
  await page.getByRole("heading", { name: "Cài đặt" }).waitFor();
  await shot(page, "d06-settings-vi");
  await page.getByRole("radio", { name: "English" }).first().click();
  await page.getByRole("heading", { name: "Settings" }).waitFor();
  step("d: language switch works and switches back");

  if (DOCS) {
    // Drag a Word file onto the page: overlay shows, the server reads it, the model answers from it.
    await page.goto(`${BASE}/`);
    await page.getByRole("textbox", { name: "Message" }).filter({ visible: true }).first().waitFor();
    const b64 = readFileSync(path.join(DOCS, "notes.docx")).toString("base64");
    const drag = (types) =>
      page.evaluate(
        ({ b64, types }) => {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const dt = new DataTransfer();
          dt.items.add(new File([bytes], "trip-notes.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
          for (const type of types) document.body.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
        },
        { b64, types },
      );
    await drag(["dragenter", "dragover"]);
    await page.getByText("Drop files to attach").waitFor();
    await shot(page, "d08-drop-overlay");
    await drag(["drop"]);
    await page.getByText("trip-notes.docx").waitFor();
    await page.getByText("Reading…").waitFor({ state: "detached", timeout: 60_000 });
    // And a spreadsheet through the file picker.
    await page.locator('input[type="file"]').setInputFiles(path.join(DOCS, "sheets.xlsx"));
    await page.getByText("sheets.xlsx").waitFor();
    await page.getByText("Reading…").waitFor({ state: "detached", timeout: 60_000 });
    if (await page.getByText(/Couldn't read/).count()) {
      throw new Error("the server couldn't read the documents (is LibreOffice installed where the server runs?)");
    }
    await shot(page, "d09-documents-attached");
    const reply = await chat(page, "d", "Which hotel is in the Word file, and what does Rice cost in the spreadsheet? Short answer.");
    if (EXPECT_REPLY && !(/palace/i.test(reply) && /120[.,]?000/.test(reply))) throw new Error(`documents not read: ${reply}`);
    step("d: drag-and-drop .docx + picked .xlsx are read and answered from");
  }

  await page.goto(url);
  await page.getByRole("button", { name: /Switch profile/ }).first().click();
  await page.waitForURL("**/profiles");
  await page.getByRole("button", { name: "Manage profiles" }).click();
  await page.getByRole("button", { name: `Edit ${NAME}` }).click();
  await page.getByRole("dialog").waitFor();
  for (const d of PIN) await page.keyboard.press(d);
  await page.getByRole("heading", { name: "Edit profile" }).waitFor();
  await shot(page, "d07-edit-after-pin");
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  step("d: editing a locked profile asks for its PIN first");

  await page.getByRole("button", { name: "Log out of this device" }).click();
  await page.waitForURL("**/login");
  step("d: log out returns to the login screen");
  await ctx.close();
}

async function phone(browser) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "en-US" });
  const page = await ctx.newPage();
  watch(page, "phone");
  await login(page, "m");
  await shot(page, "m02-profiles");
  await enterProfile(page, "m");
  await shot(page, "m04-home");
  await chat(page, "m", "What is 2 + 3? Answer with one number.");
  await ctx.close();
}

const browser = await chromium.launch();
try {
  console.log(`E2E against ${BASE} (profile "${NAME}")`);
  await desktop(browser);
  await phone(browser);
} finally {
  await browser.close();
}

console.log(`\n${steps.length} steps passed`);
console.log(problems.length ? `Console/page errors:\n${problems.join("\n")}` : "No console or page errors");
console.log(overflow.length ? `Horizontal overflow:\n${overflow.join("\n")}` : "No horizontal overflow");
if (problems.length || overflow.length) process.exit(1);
