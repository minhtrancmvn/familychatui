// Real end-to-end flow in a browser, desktop, phone and a phone on its side: login, profiles with PIN, a chat with a real
// 9router reply, a code file and a Jupyter notebook, reload persistence, rename, sidebar hide/show, settings, manage-with-PIN, logout. Takes screenshots and
// reports console/page errors and horizontal overflow.
//
// Usage: npm run e2e  (needs a running server; it creates profiles and chats, so point it at a
// throwaway DATA_DIR). Env: BASE_URL (http://localhost:3000), E2E_PASSWORD (family),
// E2E_EXPECT_REPLY=0 to accept an error reply, E2E_DOCS=<folder with notes.docx and sheets.xlsx> to
// also test drag-and-drop and document attachments (needs LibreOffice on the server), E2E_IMAGE=1 to
// also make and edit two real pictures with GPT Image on the phone (uses the image quota).
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.E2E_PASSWORD ?? "family";
const EXPECT_REPLY = process.env.E2E_EXPECT_REPLY !== "0";
/** Folder with notes.docx and sheets.xlsx for the attachment steps (skipped when unset). */
const DOCS = process.env.E2E_DOCS;
const IMAGE = process.env.E2E_IMAGE === "1";
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

/**
 * Content wider than the screen. Checking the page alone isn't enough: the app scrolls inside
 * containers, so a too-wide child makes that container scroll sideways while the page looks fine.
 * Code blocks, tables, wide formulas and anything marked `data-scroll-x` scroll sideways on purpose.
 */
function sidewaysOverflow() {
  const vw = document.documentElement.clientWidth;
  const found = [];
  if (document.documentElement.scrollWidth > vw) found.push(`page ${document.documentElement.scrollWidth} > ${vw}`);
  for (const el of document.querySelectorAll("body *")) {
    if (!["auto", "scroll"].includes(getComputedStyle(el).overflowX) || el.scrollWidth <= el.clientWidth + 1) continue;
    if (el.closest("pre, table, .katex-display, [data-scroll-x]")) continue;
    found.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} ${el.scrollWidth} > ${el.clientWidth}`);
  }
  return found;
}

async function shot(page, name) {
  await page.waitForTimeout(300);
  for (const o of await page.evaluate(sidewaysOverflow)) overflow.push(`${name}: ${o}`);
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
  // The pad keeps this text in place (transparent) before any error, so wait for it to turn red:
  // digits typed while the wrong PIN is still being checked are ignored.
  await page.locator("p.text-danger", { hasText: "Wrong PIN, try again." }).waitFor();
  await shot(page, `${prefix}03-pin-wrong`);
  for (const d of PIN) await page.keyboard.press(d);
  await page.waitForURL(`${BASE}/`);
  step(`${prefix}: wrong PIN refused, right PIN enters the profile`);
}

/** Sends what's in the box: Enter on a computer, the Send button on a phone (where Enter adds a new line). */
async function send(page, box) {
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) {
    await page.getByRole("button", { name: "Send message" }).filter({ visible: true }).click();
  } else {
    await box.press("Enter");
  }
}

/** Types two lines with `key` between them; checks they stay in the box as two lines, unsent. */
async function newLine(page, key) {
  const box = page.getByRole("textbox", { name: "Message" }).filter({ visible: true }).first();
  const url = page.url();
  await box.fill("first line");
  await box.press(key);
  await box.pressSequentially("second line");
  const value = await box.inputValue();
  if (value !== "first line\nsecond line" || page.url() !== url) throw new Error(`${key} sent or lost the line: ${JSON.stringify(value)}`);
  await box.fill("");
  return box.getAttribute("enterkeyhint");
}

/** Sends a prompt and waits for the reply to finish. Returns the assistant text. */
async function chat(page, prefix, prompt) {
  const box = page.getByRole("textbox", { name: "Message" }).filter({ visible: true }).first();
  await box.fill(prompt);
  await send(page, box);
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

/** Waits until `count` generated pictures are on the page and have loaded. */
async function picturesLoaded(page, count) {
  await page.waitForFunction(
    (n) => {
      const imgs = [...document.querySelectorAll('img[alt^="Picture made by"]')];
      return imgs.length === n && imgs.every((img) => img.complete && img.naturalWidth > 0);
    },
    count,
    { timeout: 180_000 },
  );
}

/** GPT Image: a picture arrives and is served privately, the next message edits it, both survive a reload. */
async function pictures(page, prefix) {
  await page.goto(`${BASE}/`);
  await page.getByRole("button", { name: /^Auto/ }).filter({ visible: true }).first().click();
  await page.getByRole("menuitemradio", { name: /GPT Image/ }).click();
  const box = page.getByRole("textbox", { name: "Message" }).filter({ visible: true }).first();
  if ((await box.getAttribute("placeholder")) !== "Describe the picture you want") throw new Error("no picture prompt hint");
  await box.fill("A small orange house on a white background, flat illustration");
  await send(page, box);
  await page.waitForURL("**/chat/**");
  await page.getByText("Drawing the picture…").waitFor();
  await shot(page, `${prefix}07-drawing`);
  await picturesLoaded(page, 1);
  await shot(page, `${prefix}08-picture`);

  const src = await page.locator('img[alt^="Picture made by"]').first().getAttribute("src");
  const res = await page.request.get(`${BASE}${src}`);
  const headers = res.headers();
  if (res.status() !== 200 || headers["content-type"] !== "image/png" || !/sandbox/.test(headers["content-security-policy"] ?? "")) {
    throw new Error(`picture served as ${res.status()} ${headers["content-type"]} csp=${headers["content-security-policy"]}`);
  }
  if ((await page.request.get(`${BASE}/api/attachments/not-a-real-picture`)).status() !== 404) throw new Error("unknown picture not 404");
  const download = await page.getByRole("link", { name: "Download" }).first().getAttribute("download");
  if (!/^image-.+\.png$/.test(download ?? "")) throw new Error(`download name ${download}`);
  step(`${prefix}: GPT Image drew a picture (${(await res.body()).length} bytes, download "${download}")`);

  await box.fill("Make the house blue");
  await send(page, box);
  await picturesLoaded(page, 2);
  await shot(page, `${prefix}09-edited`);
  await page.reload();
  await picturesLoaded(page, 2);
  step(`${prefix}: the next message edited the picture; both pictures survive a reload`);
}

/**
 * Sent photos show as thumbnails (their local preview at first, the server's copy after a reload) that open in a
 * lightbox, and a formula in the reply is drawn by KaTeX instead of showing as raw LaTeX.
 */
async function photoAndMath(page, prefix) {
  await page.goto(`${BASE}/`);
  const box = page.getByRole("textbox", { name: "Message" }).filter({ visible: true }).first();
  await box.waitFor();
  const square = (color) =>
    page.evaluate((fill) => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const ctx = c.getContext("2d");
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, 64, 64);
      return c.toDataURL("image/png").split(",")[1];
    }, color);
  await page.locator('input[type="file"]').setInputFiles([
    { name: "orange.png", mimeType: "image/png", buffer: Buffer.from(await square("#ff5500"), "base64") },
    { name: "blue.png", mimeType: "image/png", buffer: Buffer.from(await square("#1d4ed8"), "base64") },
  ]);
  await box.fill(String.raw`What colours are these two pictures? Then write the area of a circle as LaTeX display math between \[ and \]. Short answer.`);
  const thumbsLoaded = () =>
    page.waitForFunction(() =>
      ["orange.png", "blue.png"].every((name) => {
        const img = document.querySelector(`a img[alt="${name}"]`);
        return img && img.complete && img.naturalWidth > 0;
      }),
    );
  await send(page, box);
  await page.waitForURL("**/chat/**");
  await thumbsLoaded();
  const done = page.getByRole("button", { name: /^(Copy|Copied)$/ }).filter({ visible: true }).last();
  await done.waitFor({ timeout: 180_000 });
  await shot(page, `${prefix}05b-photo-math`);
  const reply = page.locator(".bg-bubble-bot").last();
  const drawn = await reply.locator(".katex").count();
  const broken = await reply.locator(".katex-error").count();
  const raw = /\\\[|\\frac|\\pi/.test(await reply.innerText());
  if (EXPECT_REPLY && (!drawn || broken || raw)) throw new Error(`math not drawn: katex=${drawn} errors=${broken} raw=${raw}`);

  await page.reload();
  await thumbsLoaded();
  const thumb = page.getByRole("link", { name: "Open orange.png full size" });
  const href = await thumb.getAttribute("href");
  const res = await page.request.get(`${BASE}${href}`);
  if (res.status() !== 200 || res.headers()["content-type"] !== "image/jpeg") throw new Error(`sent photo served as ${res.status()} ${res.headers()["content-type"]}`);

  // Lightbox: opens on the tapped photo, moves with the arrow button and key, closes with Escape and the X.
  await thumb.click();
  const lightbox = page.getByRole("dialog");
  await lightbox.getByText("1 / 2").waitFor();
  await page.waitForFunction(() => {
    const img = document.querySelector('[role="dialog"] img[alt="orange.png"]');
    return img && img.complete && img.naturalWidth > 0;
  });
  await shot(page, `${prefix}05c-lightbox`);
  await lightbox.getByRole("button", { name: "Next photo" }).click();
  await lightbox.locator('img[alt="blue.png"]').waitFor();
  await page.keyboard.press("ArrowRight");
  await lightbox.locator('img[alt="orange.png"]').waitFor();
  await page.keyboard.press("Escape");
  await lightbox.waitFor({ state: "detached" });
  if (!(await thumb.evaluate((el) => el === document.activeElement))) throw new Error("focus didn't return to the thumbnail");
  await page.getByRole("link", { name: "Open blue.png full size" }).click();
  await lightbox.getByText("2 / 2").waitFor();
  await lightbox.getByRole("button", { name: "Close" }).click();
  await lightbox.waitFor({ state: "detached" });
  if (page.context().pages().length !== 1) throw new Error("a tap on a thumbnail opened a new tab");
  step(`${prefix}: sent photos show as thumbnails that open in a lightbox (arrows, Escape, X); the reply's formula is drawn (${drawn} KaTeX)`);
}

/** Analytics events pushed so far on this page (gtag-style `arguments` objects on the dataLayer). */
function trackedEvents(page) {
  return page.evaluate(() =>
    (window.dataLayer ?? []).filter((e) => e && e[0] === "event").map((e) => ({ name: e[1], params: e[2] ?? {} })),
  );
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
  const desktopHint = await newLine(page, "Shift+Enter");
  if (desktopHint !== "send") throw new Error(`desktop Return key hint ${desktopHint}`);
  // Also while the @ model list is open: Shift+Enter is a new line, not a pick.
  const box = page.getByRole("textbox", { name: "Message" }).filter({ visible: true }).first();
  await box.fill("@");
  await page.getByRole("listbox").waitFor();
  await box.press("Shift+Enter");
  if ((await box.inputValue()) !== "@\n") throw new Error(`Shift+Enter in the model list: ${JSON.stringify(await box.inputValue())}`);
  await box.fill("");
  step("d: Shift+Enter adds a new line, also with the @ model list open (Enter sends, below)");
  await chat(page, "d", "Reply with just the word: pong");
  // Analytics carry labels and numbers only: never the prompt, the reply or the profile name.
  const events = await trackedEvents(page);
  const sent = events.find((e) => e.name === "message_send");
  await page.waitForFunction(() => (window.dataLayer ?? []).some((e) => e && e[0] === "event" && e[1] === "reply_done"));
  const done = (await trackedEvents(page)).find((e) => e.name === "reply_done");
  if (!events.some((e) => e.name === "app_open") || !sent || sent.params.model !== "9r-combo" || sent.params.new_chat !== true) {
    throw new Error(`analytics: ${JSON.stringify(events)}`);
  }
  if (done.params.status !== "done" || !(done.params.duration_ms > 0) || done.params.kind !== "send") {
    throw new Error(`reply_done: ${JSON.stringify(done)}`);
  }
  const everything = JSON.stringify(await trackedEvents(page));
  if (/pong/i.test(everything) || everything.includes(NAME)) throw new Error(`analytics leaked text: ${everything}`);
  step(`d: analytics events [${events.map((e) => e.name).join(", ")}], reply took ${done.params.duration_ms} ms; no text or names`);
  // A model names the chat after its first reply; the header switches from the prompt to that title.
  const header = page.getByRole("heading", { level: 1 }).first();
  await page.waitForFunction(
    (el) => el && el.textContent && el.textContent.trim() !== "Reply with just the word: pong",
    await header.elementHandle(),
    { timeout: 30_000 },
  );
  step(`d: chat named automatically: ${JSON.stringify(await header.innerText())}`);

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

  // Put the sidebar away: the chat gets the whole width; the header offers it back, and a New chat link.
  await page.getByRole("button", { name: "Hide sidebar" }).click();
  await page.locator("#sidebar-show").waitFor();
  await page.locator("header").getByRole("link", { name: "New chat" }).waitFor();
  await page.waitForTimeout(300); // the slide
  const wide = await page.locator("main").evaluate((el) => el.getBoundingClientRect().width);
  if (wide < 1400) throw new Error(`the chat is ${wide}px wide with the sidebar put away`);
  await shot(page, "d05b-sidebar-hidden");
  await page.reload();
  // The composer takes focus once the chat loads (desktop); wait for that before using the keyboard.
  await page.waitForFunction(() => document.activeElement?.tagName === "TEXTAREA");
  await page.locator("#sidebar-show").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.activeElement?.id === "sidebar-hide");
  if (await page.locator("header").getByRole("link", { name: "New chat" }).isVisible()) {
    throw new Error("the header's New chat link stays next to the sidebar's");
  }
  step(`d: sidebar put away (chat ${Math.round(wide)}px wide), still away after a reload, back with the keyboard`);

  await page.goto(`${BASE}/settings`);
  await page.getByRole("radio", { name: "Tiếng Việt" }).first().click();
  await page.getByRole("heading", { name: "Cài đặt" }).waitFor();
  await shot(page, "d06-settings-vi");
  await page.getByRole("radio", { name: "English" }).first().click();
  await page.getByRole("heading", { name: "Settings" }).waitFor();
  step("d: language switch works and switches back");
  const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  await page.getByText(`familychatui · Version ${version}`, { exact: true }).waitFor();
  step(`d: Settings shows version ${version}`);

  // The admin's usage numbers: this run's messages show up, with the chart and the model rows.
  const usage = page.locator("section", { has: page.getByRole("heading", { name: "Family usage" }) });
  await usage.getByRole("img", { name: /^Messages per day/ }).waitFor();
  const sentTile = usage.getByText("Messages sent").locator("..");
  const count = Number((await sentTile.locator("div").nth(1).innerText()).replace(/\D/g, ""));
  if (!(count >= 1)) throw new Error(`usage shows ${count} messages`);
  await usage.getByText("Auto", { exact: true }).waitFor();
  await usage.getByRole("radio", { name: "7 days" }).click();
  await usage.getByRole("img", { name: /^Messages per day/ }).focus();
  await page.keyboard.press("ArrowLeft");
  await shot(page, "d10-usage");
  step(`d: Family usage: messages sent ${count}, daily chart, model rows, 7-day switch`);

  // A code file and a Jupyter notebook through the file picker: the notebook becomes Markdown in the
  // browser (its plot and long log left out), and the model answers from both.
  await page.goto(`${BASE}/`);
  await page.getByRole("textbox", { name: "Message" }).filter({ visible: true }).first().waitFor();
  const notebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { language_info: { name: "python" } },
    cells: [
      { cell_type: "markdown", metadata: {}, source: ["# Harvest\n", "```python\n", "load()\n", "```"] },
      {
        cell_type: "code",
        execution_count: 1,
        metadata: {},
        source: ["print(sum(range(5)))"],
        outputs: [{ output_type: "stream", name: "stdout", text: Array.from({ length: 3000 }, (_, i) => `tick ${i}\n`) }],
      },
      {
        cell_type: "code",
        execution_count: 2,
        metadata: {},
        source: "plot()",
        outputs: [{ output_type: "display_data", metadata: {}, data: { "image/png": "iVBORw0KGgo".repeat(20_000), "text/plain": "<Figure>" } }],
      },
      {
        cell_type: "code",
        execution_count: 3,
        metadata: {},
        source: ["mangoes / 0"],
        outputs: [{ output_type: "error", ename: "ZeroDivisionError", evalue: "division by zero", traceback: ["\u001b[0;31mZeroDivisionError\u001b[0m: division by zero"] }],
      },
    ],
  };
  await page.locator('input[type="file"]').setInputFiles([
    { name: "greet.py", mimeType: "text/x-python", buffer: Buffer.from('print("hello from greet")\n') },
    { name: "harvest.ipynb", mimeType: "", buffer: Buffer.from(JSON.stringify(notebook)) },
  ]);
  await page.getByText("greet.py").waitFor();
  await page.getByText("harvest.ipynb").waitFor();
  await page.getByText("Reading…").waitFor({ state: "detached", timeout: 10_000 });
  const refused = page.getByText(/Couldn't read|You can attach|too large to attach|no readable text/);
  if (await refused.count()) throw new Error(`code/notebook refused: ${await refused.first().innerText()}`);
  await shot(page, "d07a-code-attached");
  const codeReply = await chat(page, "d", "What does greet.py print, and which error does cell 3 of the notebook raise? Short answer.");
  if (EXPECT_REPLY && !(/hello from greet/i.test(codeReply) && /ZeroDivisionError/.test(codeReply))) {
    throw new Error(`code files not read: ${codeReply}`);
  }
  step("d: picked .py + .ipynb are read and answered from");

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
  if (!(await page.evaluate(() => matchMedia("(pointer: coarse)").matches))) throw new Error("phone context isn't touch-first");
  const phoneHint = await newLine(page, "Enter");
  if (phoneHint !== "enter") throw new Error(`phone Return key hint ${phoneHint}`);
  step("m: Enter adds a new line on a phone; the Send button sends (below)");
  await chat(page, "m", "What is 2 + 3? Answer with one number.");
  await photoAndMath(page, "m");
  if (IMAGE) await pictures(page, "m");
  // Settings is the densest screen (the admin sees every section); check it at phone width too.
  await page.goto(`${BASE}/settings`);
  await page.getByRole("heading", { name: "Settings" }).waitFor();
  await shot(page, "m06-settings");
  step("m: settings opened on a phone (overflow checked below)");
  await ctx.close();
}

/** A phone on its side is still a phone: the drawer, 44px tap targets, and row actions without a hover. */
async function landscape(browser) {
  const ctx = await browser.newContext({ ...devices["iPhone 15 Pro Max landscape"], locale: "en-US" });
  const page = await ctx.newPage();
  watch(page, "landscape");
  // A phone that used the app before 0.8.0 saved "Enter sends" (the old default); it switches to new lines.
  // Wait for the page's own session load first: it saves device settings and would overwrite the seed.
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.evaluate(() =>
    localStorage.setItem("familychatui-device", JSON.stringify({ state: { settings: { theme: "dark", enterToSend: true } }, version: 2 })),
  );
  await login(page, "l");
  await enterProfile(page, "l");
  const menu = page.locator("#drawer-open");
  await menu.waitFor();
  if (await page.locator("#sidebar-hide").isVisible()) throw new Error("desktop sidebar on a phone on its side");
  const tap = await menu.boundingBox();
  if (tap.height < 44) throw new Error(`menu button is ${tap.height}px tall`);
  await shot(page, "l04-home");

  await menu.click();
  const drawer = page.getByRole("complementary", { name: "Menu" });
  const options = drawer.getByRole("button", { name: `Options for Renamed ${TAG}` });
  await options.waitFor();
  const shown = await options.evaluate((el) => getComputedStyle(el).opacity);
  if (shown !== "1") throw new Error(`chat options wait for a hover (opacity ${shown})`);
  // Short screen: the drawer's top scrolls away with the chats instead of squeezing the list.
  const list = drawer.getByRole("navigation", { name: "Chats" });
  const scroll = await list.evaluate((el) => `${getComputedStyle(el).overflowY}/${getComputedStyle(el.parentElement).overflowY}`);
  if (scroll !== "visible/auto") throw new Error(`drawer scrolling on a short screen: ${scroll}`);
  await list.evaluate((el) => el.parentElement.scrollTo(0, el.parentElement.scrollHeight));
  await shot(page, "l05-drawer");
  await drawer.getByRole("link", { name: `Renamed ${TAG}` }).click();
  await page.getByRole("heading", { name: `Renamed ${TAG}` }).waitFor();
  await shot(page, "l06-chat");
  // Like any phone, the message box doesn't take focus by itself (the keyboard would cover the chat).
  if (await page.evaluate(() => document.activeElement?.tagName === "TEXTAREA")) throw new Error("composer took focus");

  await menu.click();
  await drawer.getByRole("button", { name: "Close menu" }).click();
  await page.waitForFunction(() => document.activeElement?.id === "drawer-open");
  step("l: phone on its side: drawer that scrolls as a whole, 44px buttons, row actions shown, no keyboard pop-up, Close menu returns focus");

  await page.goto(`${BASE}/settings`);
  const enterSends = await page.getByRole("switch", { name: "Press Enter to send" }).getAttribute("aria-checked");
  if (enterSends !== "false") throw new Error(`old phone setting not moved to new lines (aria-checked ${enterSends})`);
  // The rest of what that phone saved survives the move (without a migration it would all be dropped).
  const dark = await page.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked");
  if (dark !== "true") throw new Error(`old phone lost its dark theme (aria-checked ${dark})`);
  step("l: a phone's old saved 'Enter sends' became 'Enter adds a new line'; its dark theme stayed");
  await ctx.close();
}

const browser = await chromium.launch();
try {
  console.log(`E2E against ${BASE} (profile "${NAME}")`);
  await desktop(browser);
  await phone(browser);
  await landscape(browser);
} finally {
  await browser.close();
}

console.log(`\n${steps.length} steps passed`);
console.log(problems.length ? `Console/page errors:\n${problems.join("\n")}` : "No console or page errors");
console.log(overflow.length ? `Horizontal overflow:\n${overflow.join("\n")}` : "No horizontal overflow");
if (problems.length || overflow.length) process.exit(1);
