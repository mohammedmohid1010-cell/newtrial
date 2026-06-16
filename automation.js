import puppeteer from "puppeteer";
import { config } from "./config.js";

/*
 ============================================================================
  ⚙️  SELECTORS — THE ONLY PART YOU SHOULD NEED TO TUNE
 ----------------------------------------------------------------------------
  Every Xtream UI panel skin lays its pages out slightly differently, so the
  CSS selectors below are best-guess defaults for a standard Xtream UI admin.
  If the bot fails, it saves a screenshot + page HTML (see server logs / the
  admin alert email) — send those to your developer and update these values.
 ============================================================================
*/
const SELECTORS = {
  // ── Login page ──
  loginUsername: 'input[name="username"], #username',
  loginPassword: 'input[name="password"], #password',
  loginButton: 'button[type="submit"], input[type="submit"], #login-btn',
  // Something that ONLY exists once logged in (used to confirm login worked):
  loggedInMarker: 'a[href*="logout"], .navbar, #wrapper',

  // ── Add-line page ──
  // URL of the "create line" form (relative to PANEL_URL). Common ones:
  //   /lines/create   /addline   /line/add   /users/create
  addLinePath: "/lines/create",
  // The bouquet multi-select (or list of checkboxes). Default = a <select>.
  bouquetSelect: 'select[name="bouquets[]"], select#bouquets',
  // Expiry date input (text/datetime). Many panels use #exp_date.
  expiryInput: '#exp_date, input[name="exp_date"]',
  // Optional "trial" checkbox — if your panel has one for trials.
  trialCheckbox: '#is_trial, input[name="is_trial"]',
  // The submit/create button on the add-line form.
  createButton: 'button[type="submit"], #submit, input[value="Create"]',

  // ── Result screen — where the generated creds appear ──
  // After creating, the panel shows the new username + password. Point these
  // at the elements that contain them (or a row in the lines table).
  resultUsername: '#new-username, .generated-username, td.username',
  resultPassword: '#new-password, .generated-password, td.password',
};

// Race a promise against a timeout so a slow panel can never hang the request.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// Pick a date string `trialHours` from now, formatted YYYY-MM-DD HH:mm:ss
// (the format most Xtream UI panels expect). Adjust if yours differs.
function trialExpiryString() {
  const d = new Date(Date.now() + config.trialHours * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function captureDebug(page) {
  try {
    const screenshot = await page.screenshot({ fullPage: true });
    const html = await page.content();
    return { screenshot, html };
  } catch {
    return { screenshot: null, html: null };
  }
}

/**
 * Runs the full create-trial flow. Resolves with { username, password,
 * expiresAt }. On any failure throws an Error with `.screenshot` (Buffer)
 * and `.html` attached so the caller can email a debug snapshot.
 */
export async function createTrialLine() {
  const expiresAt = new Date(Date.now() + config.trialHours * 60 * 60 * 1000).toISOString();

  const run = async () => {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    let page;
    try {
      page = await browser.newPage();
      page.setDefaultNavigationTimeout(config.timeoutMs);
      page.setDefaultTimeout(config.timeoutMs);
      await page.setViewport({ width: 1366, height: 900 });

      // 1) LOGIN ----------------------------------------------------------
      await page.goto(config.panelUrl, { waitUntil: "networkidle2" });
      await page.waitForSelector(SELECTORS.loginUsername);
      await page.type(SELECTORS.loginUsername, config.panelUser, { delay: 20 });
      await page.type(SELECTORS.loginPassword, config.panelPass, { delay: 20 });
      await Promise.all([
        page.click(SELECTORS.loginButton),
        page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}),
      ]);
      await page.waitForSelector(SELECTORS.loggedInMarker, { timeout: config.timeoutMs });

      // 2) OPEN THE ADD-LINE FORM -----------------------------------------
      await page.goto(config.panelUrl + SELECTORS.addLinePath, { waitUntil: "networkidle2" });

      // 3) BOUQUET — match the option whose text includes DEFAULT_BOUQUET --
      const bouquetSelected = await page.evaluate(
        (sel, wanted) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          const want = wanted.toLowerCase();
          let matched = false;
          for (const opt of el.options) {
            if (opt.textContent.trim().toLowerCase().includes(want)) {
              opt.selected = true;
              matched = true;
            }
          }
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return matched;
        },
        SELECTORS.bouquetSelect,
        config.bouquet
      );
      if (!bouquetSelected) {
        throw new Error(`Bouquet "${config.bouquet}" not found in the bouquet list.`);
      }

      // 4) EXPIRY — 24h from now (leave username/password blank to auto-gen)
      const expStr = trialExpiryString();
      await page.evaluate(
        (sel, val) => {
          const el = document.querySelector(sel);
          if (el) {
            el.value = val;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        },
        SELECTORS.expiryInput,
        expStr
      );

      // Optional trial checkbox, if the panel has one.
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el && !el.checked) el.click();
      }, SELECTORS.trialCheckbox);

      // 5) CREATE ---------------------------------------------------------
      await Promise.all([
        page.click(SELECTORS.createButton),
        page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}),
      ]);

      // 6) SCRAPE GENERATED CREDENTIALS -----------------------------------
      await page.waitForSelector(SELECTORS.resultUsername, { timeout: config.timeoutMs });
      const username = (
        await page.$eval(SELECTORS.resultUsername, (el) => el.value || el.textContent || "")
      ).trim();
      const password = (
        await page.$eval(SELECTORS.resultPassword, (el) => el.value || el.textContent || "")
      ).trim();

      if (!username || !password) {
        throw new Error("Created the line but could not read the generated username/password.");
      }

      await browser.close();
      return { username, password, expiresAt };
    } catch (err) {
      // Attach a debug snapshot so we can fix selectors without guessing.
      if (page) {
        const dbg = await captureDebug(page);
        err.screenshot = dbg.screenshot;
        err.html = dbg.html;
      }
      await browser.close().catch(() => {});
      throw err;
    }
  };

  return withTimeout(run(), config.timeoutMs + 5000, "Trial automation");
}
