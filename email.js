import nodemailer from "nodemailer";
import { config } from "./config.js";

let transporter = null;
if (config.email.user && config.email.pass) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: config.email.user, pass: config.email.pass },
  });
} else {
  console.warn("[email] EMAIL_USER / EMAIL_PASS not set — emails are disabled.");
}

const BRAND = "#d4af37";
const wrap = (inner) => `
  <div style="background:#080c14;padding:32px 0;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#0d1320;border:1px solid #1d2740;border-radius:16px;overflow:hidden;">
      <div style="padding:24px 28px;border-bottom:1px solid #1d2740;">
        <span style="font-size:20px;font-weight:800;color:#fff;">TechStop<span style="color:${BRAND};">IPTV</span></span>
      </div>
      <div style="padding:28px;color:#c8d2e4;font-size:15px;line-height:1.6;">${inner}</div>
      <div style="padding:18px 28px;border-top:1px solid #1d2740;color:#67738c;font-size:12px;">
        This is an automated message from TechStop IPTV.
      </div>
    </div>
  </div>`;

const row = (label, value) => `
  <tr>
    <td style="padding:9px 0;color:#8899bb;font-size:13px;">${label}</td>
    <td style="padding:9px 0;color:#fff;font-size:14px;font-weight:600;text-align:right;word-break:break-all;">${value}</td>
  </tr>`;

/** Send the generated trial credentials to the customer. */
export async function sendCustomerCredentials(toEmail, name, creds) {
  if (!transporter) return false;
  const first = (name || "there").split(" ")[0];
  const html = wrap(`
    <h2 style="color:#fff;margin:0 0 6px;">🎉 Your free trial is ready, ${first}!</h2>
    <p style="margin:0 0 20px;">Your 24-hour TechStop IPTV trial has been activated. Here are your login details:</p>
    <table style="width:100%;border-collapse:collapse;background:#111a2b;border:1px solid #1d2740;border-radius:10px;padding:6px 16px;">
      ${row("Username", creds.username)}
      ${row("Password", creds.password)}
      ${row("Server URL", creds.serverUrl)}
    </table>
    <p style="margin:22px 0 6px;color:#8899bb;font-size:13px;text-transform:uppercase;letter-spacing:1px;">M3U URL</p>
    <div style="background:#111a2b;border:1px solid #1d2740;border-radius:10px;padding:12px 14px;font-size:12.5px;color:#9fb0cc;word-break:break-all;">${creds.m3uUrl}</div>
    <p style="margin:22px 0 6px;color:#8899bb;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Xtream Codes Login</p>
    <table style="width:100%;border-collapse:collapse;background:#111a2b;border:1px solid #1d2740;border-radius:10px;padding:6px 16px;">
      ${row("Server", creds.xtream.server)}
      ${row("Username", creds.xtream.username)}
      ${row("Password", creds.xtream.password)}
    </table>
    <p style="margin:24px 0 0;">Need help setting up? Reply to this email or visit our setup guides. Enjoy the show! 📺</p>
  `);

  await transporter.sendMail({
    from: `"TechStop IPTV" <${config.email.user}>`,
    to: toEmail,
    subject: "🎉 Your TechStop IPTV Free Trial Credentials",
    html,
  });
  return true;
}

/** Alert the admin that an automated trial failed (with debug screenshot). */
export async function sendAdminAlert(subject, details, screenshot) {
  if (!transporter || !config.email.admin) return false;
  const html = wrap(`
    <h2 style="color:#ff7a7a;margin:0 0 10px;">⚠️ Trial automation failed</h2>
    <p style="margin:0 0 14px;">A customer requested a trial but the bot could not create the line. Please create it manually within the hour.</p>
    <pre style="background:#111a2b;border:1px solid #1d2740;border-radius:10px;padding:14px;color:#c8d2e4;font-size:13px;white-space:pre-wrap;word-break:break-word;">${details}</pre>
    ${screenshot ? '<p style="margin:16px 0 0;color:#8899bb;font-size:13px;">A screenshot of the panel at the moment of failure is attached.</p>' : ""}
  `);

  await transporter.sendMail({
    from: `"TechStop Bot" <${config.email.user}>`,
    to: config.email.admin,
    subject: `[TechStop] ${subject}`,
    html,
    attachments: screenshot
      ? [{ filename: "failure.png", content: screenshot }]
      : [],
  });
  return true;
}
