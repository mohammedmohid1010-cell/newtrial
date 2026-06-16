import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config, buildCredentials } from "./config.js";
import { createTrialLine } from "./automation.js";
import { sendCustomerCredentials, sendAdminAlert } from "./email.js";
import { initStore, saveTrial, getTrials } from "./store.js";

const app = express();
app.set("trust proxy", 1); // Railway/Render sit behind a proxy — needed for real client IPs.
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

// ── Rate limit: max N trial requests per IP per 24h ──────────────
const trialLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: config.rateLimitPerDay,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "rate_limited" },
  handler: (req, res) =>
    res.status(429).json({
      status: "rate_limited",
      message: "You've reached the free-trial limit for today. Please try again tomorrow or contact us on WhatsApp.",
    }),
});

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || "");

// ── Health check ─────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true, service: "techstop-trial-bot" }));

// ── Create a free trial ──────────────────────────────────────────
app.post("/create-trial", trialLimiter, async (req, res) => {
  const { name, email, device } = req.body || {};
  const ip = req.ip;

  if (!name || !name.trim() || !isEmail(email)) {
    return res.status(400).json({
      status: "invalid",
      message: "Please provide your name and a valid email address.",
    });
  }

  try {
    const line = await createTrialLine();
    const creds = buildCredentials(line);

    // Log + email (don't let a slow email delay the customer response).
    await saveTrial({ name, email, device, status: "success", username: creds.username, ip });
    sendCustomerCredentials(email, name, creds).catch((e) =>
      console.error("[email] customer send failed:", e.message)
    );

    return res.json({ status: "success", credentials: creds });
  } catch (err) {
    console.error("[create-trial] automation failed:", err.message);

    await saveTrial({ name, email, device, status: "failed", error: err.message, ip });
    sendAdminAlert(
      "Trial automation failed",
      `Customer: ${name} <${email}>\nDevice: ${device || "—"}\nIP: ${ip}\n\nError: ${err.message}`,
      err.screenshot
    ).catch((e) => console.error("[email] admin alert failed:", e.message));

    // Friendly fallback — the customer is NOT shown a raw error.
    return res.json({
      status: "manual",
      message:
        "We're setting up your trial manually. You'll receive your credentials within 1 hour.",
    });
  }
});

// ── Admin dashboard data (password protected) ────────────────────
app.get("/trials", async (req, res) => {
  const key = req.query.key || req.get("x-admin-key");
  if (!config.adminDashboardPassword || key !== config.adminDashboardPassword) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }
  try {
    const trials = await getTrials();
    res.json({ ok: true, trials });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

await initStore();
app.listen(config.port, () => {
  console.log(`✅ TechStop Trial Bot listening on :${config.port}`);
  console.log(`   Panel: ${config.panelUrl}  ·  Trial: ${config.trialHours}h  ·  Bouquet: "${config.bouquet}"`);
});
