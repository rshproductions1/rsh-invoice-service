// RSH invoice email service.
// Flow: browser POSTs {event, client, packages, addons, allEvents, recipient,
// message} + the admin's Supabase JWT. We verify the caller is an admin,
// render the exact invoice HTML → PDF via Chromium, then email it through
// Resend from invoice@<domain>. No secrets ever reach the browser.
import express from "express";
import puppeteer from "puppeteer";
import { buildInvoiceHtml } from "./invoice.js";

const {
  RESEND_API_KEY,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  ALLOWED_ORIGIN = "*",
  FROM_EMAIL = "invoice@rifatshakhawathossain.com",
  FROM_NAME = "RSH Productions",
  PORT = 3000,
} = process.env;

const app = express();
app.use(express.json({ limit: "4mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.get("/", (_req, res) => res.json({ ok: true, service: "rsh-invoice" }));

// One shared Chromium instance (relaunch if it died).
let browserPromise = null;
async function getBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b && b.connected) return b;
  }
  browserPromise = puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
  });
  return browserPromise;
}

async function verifyAdmin(token) {
  if (!token) return null;
  const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!uRes.ok) return null;
  const user = await uRes.json();
  if (!user?.id) return null;
  const pRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!pRes.ok) return null;
  const rows = await pRes.json();
  const role = rows?.[0]?.role;
  if (!role || ["photographer", "cinematographer", "editor"].includes(role)) return null;
  return user;
}

app.post("/send-invoice", async (req, res) => {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const admin = await verifyAdmin(token);
    if (!admin) return res.status(403).json({ error: "Admin access required" });

    const { event, client, packages, addons, allEvents, recipient, message, subject } = req.body || {};
    if (!event) return res.status(400).json({ error: "Missing invoice data" });
    if (!recipient || !/.+@.+\..+/.test(recipient)) return res.status(400).json({ error: "Valid recipient email required" });

    const html = buildInvoiceHtml({ event, client, packages: packages || [], addons: addons || [], allEvents: allEvents || [] });

    const browser = await getBrowser();
    const page = await browser.newPage();
    let pdf;
    try {
      await page.setContent(html, { waitUntil: "networkidle0", timeout: 40000 });
      pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    } finally {
      await page.close().catch(() => {});
    }

    const invNo = event.invoiceNo || event.eventId || "invoice";
    const safeMsg = String(message || "").trim();
    const bodyHtml = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#222;line-height:1.6">${
      safeMsg ? safeMsg.replace(/[<>&]/g, s => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[s])).replace(/\n/g, "<br>") : "Please find your invoice attached."
    }<br><br>— RSH Productions</div>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [recipient],
        subject: subject || `Invoice ${invNo} — RSH Productions`,
        html: bodyHtml,
        attachments: [{ filename: `Invoice ${invNo}.pdf`, content: Buffer.from(pdf).toString("base64") }],
      }),
    });
    if (!resendRes.ok) {
      const errText = await resendRes.text();
      return res.status(502).json({ error: "Email send failed: " + errText.slice(0, 300) });
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.listen(PORT, () => console.log(`rsh-invoice service listening on ${PORT}`));
