# TechStop Trial Bot 🤖

Automated free-trial line creator. When a customer submits the `/free-trial` form
on your website, this service logs into your Xtream UI panel with Puppeteer,
creates a 24-hour trial line, scrapes the generated username/password, emails them
to the customer, and logs the request for your admin dashboard.

> ⚠️ **This cannot run on Netlify.** Puppeteer needs a real Node server. Deploy it
> to **Railway** or **Render** (both have free tiers), then point your website at it.

---

## 1. Deploy to Railway (recommended)

1. Push this `trial-bot/` folder to a GitHub repo (or use Railway's "Deploy from
   local"). 
2. On [railway.app](https://railway.app) → **New Project → Deploy from Repo**.
3. Railway auto-detects the `Dockerfile` and builds it (the Dockerfile installs
   Chromium's system libraries for you).
4. Open the service → **Variables** tab → add every key from `.env.example`.
5. Once deployed, Railway gives you a public URL like
   `https://techstop-trial-bot.up.railway.app`. Copy it.

### Deploy to Render (alternative)
- **New → Web Service** → connect repo → Environment: **Docker** → add the same
  env vars → Deploy. Render gives you an `onrender.com` URL.

---

## 2. Connect your website

In your Next.js site's environment variables (Netlify → Site settings →
Environment variables) add:

```
NEXT_PUBLIC_TRIAL_API_URL=https://your-bot-url.up.railway.app
NEXT_PUBLIC_TRIAL_ADMIN_PASSWORD=the-same-ADMIN_DASHBOARD_PASSWORD
```

Set `CORS_ORIGIN` in the bot to your site's domain (e.g.
`https://techstopiptv.com`) for security, or `*` while testing.

---

## 3. Gmail setup (for the credential emails)

`EMAIL_PASS` must be a Gmail **App Password**, not your normal password:
1. Enable 2-Step Verification on the Gmail account.
2. Go to <https://myaccount.google.com/apppasswords>, create one, paste the
   16-character code into `EMAIL_PASS`.

---

## 4. Tuning the Puppeteer selectors

Every Xtream UI skin is different, so the selectors in
[`src/automation.js`](src/automation.js) (the `SELECTORS` block at the top) are
best-guess defaults. If a trial fails:

- The admin alert email includes a **screenshot** of the panel at the moment it
  failed.
- Check the Railway/Render **logs** for the exact error (e.g. "Bouquet not
  found", "timed out waiting for selector").
- Update the matching selector in `SELECTORS` and redeploy.

Send that screenshot + error to your developer and the selectors can be fixed in
minutes.

---

## Endpoints

| Method | Path             | Purpose                                  |
|--------|------------------|------------------------------------------|
| POST   | `/create-trial`  | Body `{ name, email, device }` → creds   |
| GET    | `/trials?key=…`  | Admin dashboard data (password protected)|
| GET    | `/health`        | Uptime check                             |

Rate limited to `RATE_LIMIT_PER_DAY` (default 3) requests per IP per 24h.
