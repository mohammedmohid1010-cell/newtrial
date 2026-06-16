import "dotenv/config";

function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required env var: ${name} (see .env.example)`);
  }
  return v.trim();
}

const stripSlash = (u) => u.replace(/\/+$/, "");

export const config = {
  // Admin panel — used by Puppeteer to log in and create the line.
  panelUrl: stripSlash(required("PANEL_URL")),
  panelUser: required("PANEL_USERNAME"),
  panelPass: required("PANEL_PASSWORD"),

  trialHours: Number(process.env.TRIAL_DURATION_HOURS || 24),
  bouquet: (process.env.DEFAULT_BOUQUET || "all channels no adults").trim(),

  // Customer-facing streaming server (the :8080-style port, NOT :2096).
  clientServerUrl: stripSlash(process.env.CLIENT_SERVER_URL || required("PANEL_URL")),

  timeoutMs: Number(process.env.AUTOMATION_TIMEOUT_MS || 30000),
  rateLimitPerDay: Number(process.env.RATE_LIMIT_PER_DAY || 3),
  port: Number(process.env.PORT || 8090),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  adminDashboardPassword: process.env.ADMIN_DASHBOARD_PASSWORD || "",

  email: {
    user: process.env.EMAIL_USER || "",
    pass: process.env.EMAIL_PASS || "",
    admin: process.env.ADMIN_EMAIL || "",
  },

  firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "",
};

// Build the customer-facing credentials block from a generated line.
export function buildCredentials({ username, password, expiresAt }) {
  const base = config.clientServerUrl;
  return {
    username,
    password,
    serverUrl: base,
    m3uUrl: `${base}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus&output=ts`,
    xtream: { server: base, username, password },
    expiresAt: expiresAt || null,
  };
}
