// Invoice HTML builder — a faithful port of the app's src/lib/invoice.js
// (letterhead layout, always on). KEEP IN SYNC with that file if the invoice
// design changes. Renders to a string; the server feeds it to Chromium → PDF.
import { LOGO_DATA_URI } from "./logo.js";

const CUSTOM_PKG_ID = "__custom__";

const fmtN = n => "৳" + Number(n || 0).toLocaleString("en-IN");

function formatDateDD(d) {
  if (!d) return "";
  const parts = String(d).split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Snapshot-aware (mirrors utils.getEventPackage): locked name/price/desc win.
function getEventPackage(event, packages) {
  if (event.packageId === CUSTOM_PKG_ID && event.customPackage) {
    return { id: CUSTOM_PKG_ID, name: event.customPackage.name || "Custom Package", price: Number(event.customPackage.price) || 0, desc: event.customPackage.desc || "", custom: true };
  }
  const live = (packages || []).find(p => p.id === event.packageId) || null;
  if (event.packageSnapshot) {
    return { id: event.packageId, name: event.packageSnapshot.name || (live ? live.name : ""), price: Number(event.packageSnapshot.price) || 0, desc: event.packageSnapshot.desc || "", custom: false };
  }
  return live;
}

// Per-hour aware (mirrors utils.addonPrice).
function addonPrice(addon, addonPrices, addonHours, addonRates) {
  if (!addon) return 0;
  if (addon.perHour) {
    const hrs = Number((addonHours || {})[addon.id]) || 0;
    const locked = (addonRates || {})[addon.id];
    const rate = locked != null ? Number(locked) || 0 : Number(addon.price) || 0;
    return hrs * rate;
  }
  if (addon.flexible) return Number((addonPrices || {})[addon.id]) || 0;
  return Number(addon.price) || 0;
}

export function buildInvoiceHtml({ event, client, packages = [], addons = [], allEvents = [] }) {
  const logoData = LOGO_DATA_URI;
  const groupId = event.bookingGroupId;
  const groupEvents = groupId ? (allEvents || []).filter(e => e.bookingGroupId === groupId) : [event];
  const eventsToShow = groupEvents.length > 0 ? groupEvents : [event];

  const allPayments = eventsToShow.flatMap(e => e.payments || []);
  const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0);
  const grossTotal = eventsToShow.reduce((s, e) => s + Number(e.eventSubTotal || e.totalAmount || 0), 0);
  const groupDiscount = event.discountAmount || 0;
  const netTotal = event.groupTotalAmount || (grossTotal - groupDiscount);
  const groupDue = event.groupDueAmount != null ? event.groupDueAmount : (event.dueAmount || 0);

  const eventsRowsHtml = eventsToShow.map((ev, idx) => {
    const pkg = getEventPackage(ev, packages);
    const selAddons = addons.filter(a => (ev.additionalServices || []).includes(a.id));
    const evSub = Number(ev.eventSubTotal || ev.totalAmount || 0);
    let rows = `<tr class="evt-row"><td colspan="2">
      <div class="evt-name">Event ${idx + 1} <span class="evt-name-type">${ev.eventType || "Event"}</span></div>
      <div class="evt-detail">${ev.eventId} <span class="sep">|</span> ${formatDateDD(ev.eventDate)} <span class="sep">|</span> ${ev.shift} <span class="sep">|</span> ${ev.venue}</div>
    </td></tr>`;
    rows += `<tr class="item-row"><td>${pkg ? pkg.name : "Package"}${pkg && pkg.custom ? ` <em>(custom)</em>` : ""}${pkg && pkg.desc ? `<span class="item-desc">${pkg.desc}</span>` : ""}</td><td class="r">${fmtN(pkg ? pkg.price : 0)}</td></tr>`;
    (ev.packageAdjustments || []).filter(a => Number(a.amount) !== 0).forEach(a => {
      rows += `<tr class="item-row"><td>Adjustment${a.note ? `<span class="item-desc">${a.note}</span>` : ""}</td><td class="r adj">${Number(a.amount) > 0 ? "+" : ""}${fmtN(a.amount)}</td></tr>`;
    });
    selAddons.forEach(a => {
      const note = (ev.addonNotes || {})[a.id];
      const hrsNote = a.perHour ? `${Number((ev.addonHours || {})[a.id]) || 0} hr × ${fmtN((ev.addonRates || {})[a.id] ?? a.price)}/hr` : null;
      const label = [hrsNote, note].filter(Boolean).join(" · ");
      rows += `<tr class="item-row"><td>${a.name}${label ? `<span class="item-desc">${label}</span>` : ""}</td><td class="r">${fmtN(addonPrice(a, ev.addonPrices, ev.addonHours, ev.addonRates))}</td></tr>`;
    });
    rows += `<tr class="evt-subtotal"><td>Event ${idx + 1} Sub-total</td><td class="r">${fmtN(evSub)}</td></tr>`;
    if (ev.notes && String(ev.notes).trim()) {
      rows += `<tr class="evt-note"><td colspan="2"><span class="evt-note-label">Note:</span> ${ev.notes}</td></tr>`;
    }
    return rows;
  }).join("");

  const paymentRowsHtml = allPayments.length > 0 ? allPayments.map(p =>
    `<tr><td>${formatDateDD(p.date) || "N/A"}</td><td>${p.note || "Payment"}</td><td class="r">${fmtN(Math.abs(p.amount))}${Number(p.amount) < 0 ? " (Refund)" : ""}</td></tr>`
  ).join("") : "";

  const padBoxHtml = `
    <div class="pad">
      ${logoData ? `<img class="pad-logo" src="${logoData}" alt="RSH" />` : ""}
      <div class="pad-ph">+880-1717-004459<br>+880-1623-981695</div>
      <div class="pad-ad">Address: House: 285A,<br>Road: 11, Block: A,<br>Bashundhara R/A</div>
    </div>`;
  const footAccHtml = `<div class="footacc"></div>`;

  return `<!DOCTYPE html><html><head><title>Invoice ${event.invoiceNo || event.eventId}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root { --ch:#5a5552; --chd:#3d3a38; --chl:#8a8480; --wg:#d5d0cb; --wgl:#ece8e4; --wb:#f5f3f1; --pad:#6e6b69; }
@page { size: A4; margin: 0; }
* { margin:0; padding:0; box-sizing:border-box; }
body { position:relative; font-family:'DM Sans',sans-serif; color:var(--ch); font-size:11px; line-height:1.5; width:210mm; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.sheet { width:182mm; margin:0 14mm; border-collapse:collapse; }
.head-cell, .foot-cell { padding:0; }
.head-zone { position:relative; height:72mm; display:flex; justify-content:flex-end; align-items:flex-start; }
.foot-zone { height:18mm; }
.blk { padding:0; }
.colhead td { background:var(--ch); color:#fff; padding:2mm 3mm; font-size:9px; font-weight:600; text-transform:uppercase; letter-spacing:1.5px; }
.colhead td.r { text-align:right; }
.pad { flex-shrink:0; width:43.2mm; height:66mm; background:var(--pad);
  border-radius:0 0 7mm 7mm; color:#fff; text-align:center; display:flex; flex-direction:column; align-items:center; padding:5mm 3mm; }
.pad-logo { width:84%; aspect-ratio:1; object-fit:contain; margin-bottom:2mm; mix-blend-mode:screen; }
.pad-ph { font-size:10.5px; font-weight:700; letter-spacing:.5px; line-height:1.45; }
.pad-ad { font-size:9.5px; font-weight:600; line-height:1.4; margin-top:1.5mm; }
.footacc { position:fixed; bottom:0; right:12.7mm; width:43.2mm; height:9mm; background:var(--pad); border-radius:5mm 5mm 0 0; }
.header { position:absolute; top:13mm; left:14mm; }
.inv-label { font-size:23px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:var(--chd); }
.inv-info { margin-top:3mm; }
.inv-info span { display:block; font-size:10.5px; color:var(--chl); line-height:1.7; }
.inv-info strong { color:var(--ch); font-weight:600; }
.divider { border:none; border-top:.5px solid var(--wg); margin:5mm 0; }
.names { display:flex; align-items:center; justify-content:center; margin:1mm 0; }
.cn { flex:1; }
.cn.l { text-align:right; padding-right:6mm; }
.cn.r { text-align:left; padding-left:6mm; }
.cn-label { font-size:8px; font-weight:700; letter-spacing:2.5px; color:var(--chl); text-transform:uppercase; }
.cn-name { font-size:15px; font-weight:700; color:var(--chd); }
.amp { font-family:Georgia,serif; font-style:italic; font-weight:300; color:var(--wg); font-size:20px; }
.contact { display:grid; grid-template-columns:1fr 1fr; gap:2.5mm 14mm; margin-top:7mm; }
.ci { display:flex; gap:3mm; font-size:10.5px; }
.cl { color:var(--chl); min-width:24mm; font-weight:500; }
.cv { color:var(--ch); font-weight:600; }
.inv-table { width:100%; border-collapse:collapse; margin-top:2mm; }
.inv-table thead th { background:var(--ch); color:#fff; padding:2mm 3mm; font-size:9px; font-weight:600; text-transform:uppercase; letter-spacing:1.5px; text-align:left; }
.inv-table thead th.r { text-align:right; }
.evt-row td { background:var(--wb); padding:2.4mm 3mm 1.6mm; border-top:.4mm solid var(--wg); }
.evt-name { font-size:11px; font-weight:700; color:var(--chd); text-transform:uppercase; letter-spacing:1px; }
.evt-name-type { font-weight:400; font-style:italic; text-transform:none; letter-spacing:0; color:var(--chl); margin-left:6px; }
.evt-detail { font-size:9.5px; color:var(--chl); margin-top:.5mm; }
.sep { padding:0 4px; opacity:.35; }
.item-row td { padding:1.7mm 3mm; font-size:10.5px; color:var(--ch); border-bottom:.3mm solid var(--wgl); }
.item-row td.r { text-align:right; font-weight:600; white-space:nowrap; }
.item-row td.adj { font-style:italic; }
.item-desc { display:block; font-size:8.5px; color:var(--chl); font-weight:400; margin-top:.4mm; line-height:1.35; }
.evt-subtotal td { padding:2mm 3mm; font-size:10.5px; font-weight:700; color:var(--chd); background:var(--wb); border-top:.4mm solid var(--wg); border-bottom:.6mm solid var(--wg); }
.evt-subtotal td.r { text-align:right; }
.evt-note td { padding:1.8mm 3mm 2.4mm; font-size:9.5px; color:var(--chl); font-style:italic; border-bottom:.3mm solid var(--wgl); }
.evt-note-label { font-style:normal; font-weight:700; color:var(--ch); }
.summary { margin-left:auto; width:62mm; margin-top:5mm; page-break-inside:avoid; }
.brow { display:flex; justify-content:space-between; padding:.8mm 0; font-size:10.5px; }
.brow .bl { color:var(--chl); font-weight:500; }
.brow .bv { font-weight:600; }
.bdiv { border:none; border-top:.5px solid var(--wg); margin:1mm 0; }
.bbold { border:none; border-top:.7mm solid var(--chd); margin:1.6mm 0; }
.brow.grand .bl { font-size:12px; font-weight:700; color:var(--chd); }
.brow.grand .bv { font-size:14px; font-weight:700; color:var(--chd); }
.pay { margin-top:6mm; page-break-inside:avoid; }
.pay-title { font-size:9px; font-weight:700; color:var(--chd); text-transform:uppercase; letter-spacing:1.5px; margin-bottom:2mm; }
.pay-table { width:100%; border-collapse:collapse; }
.pay-table thead th { background:var(--ch); color:#fff; padding:1.6mm 3mm; font-size:8.5px; font-weight:600; text-transform:uppercase; letter-spacing:1.2px; text-align:left; }
.pay-table thead th.r { text-align:right; }
.pay-table tbody td { padding:1.3mm 3mm; font-size:10px; border-bottom:.3mm solid var(--wgl); }
.pay-table tbody td.r { text-align:right; font-weight:600; }
.notes { margin-top:5mm; padding:2.5mm 4mm; border-left:.6mm solid var(--wg); font-size:10px; color:var(--chl); font-style:italic; page-break-inside:avoid; }
.notes strong { font-style:normal; color:var(--ch); }
.foot { text-align:center; margin-top:8mm; page-break-inside:avoid; }
.foot hr { border:none; border-top:.5px solid var(--wg); margin-bottom:3mm; }
.foot p { font-size:9.5px; color:var(--chl); font-style:italic; letter-spacing:.5px; }
</style></head><body>
<div class="header">
  <div class="inv-label">Invoice</div>
  <div class="inv-info">
    <span><strong>Invoice No:</strong> ${event.invoiceNo || event.eventId}</span>
    <span><strong>Client ID:</strong> ${event.clientId}</span>
    <span><strong>Date:</strong> ${formatDateDD(event.createdAt ? event.createdAt.split("T")[0] : "")}</span>
    ${eventsToShow.length > 1 ? `<span><strong>Events:</strong> ${eventsToShow.length}</span>` : `<span><strong>Event ID:</strong> ${event.eventId}</span>`}
  </div>
</div>
${footAccHtml}
<table class="sheet">
<thead><tr><td colspan="2" class="head-cell">
  <div class="head-zone">${padBoxHtml}</div>
</td></tr></thead>
<tfoot><tr><td colspan="2" class="foot-cell"><div class="foot-zone"></div></td></tr></tfoot>
<tbody>
  <tr><td colspan="2" class="blk">
    <div class="names">
      <div class="cn l"><div class="cn-label">Bride</div><div class="cn-name">${event.brideName || ""}</div></div>
      <div class="amp">&amp;</div>
      <div class="cn r"><div class="cn-label">Groom</div><div class="cn-name">${event.groomName || ""}</div></div>
    </div>
    <div class="contact">
      <div class="ci"><span class="cl">Phone (Bride)</span><span class="cv">${event.phone || "N/A"}</span></div>
      ${event.phone2 ? `<div class="ci"><span class="cl">Phone (Groom)</span><span class="cv">${event.phone2}</span></div>` : ""}
      ${event.email ? `<div class="ci"><span class="cl">Email</span><span class="cv">${event.email}</span></div>` : ""}
    </div>
    <hr class="divider" />
  </td></tr>
  <tr class="colhead"><td style="width:62%">Description</td><td class="r">Amount</td></tr>
  ${eventsRowsHtml}
  <tr><td colspan="2" class="blk">
    <div class="summary">
      ${eventsToShow.length > 1 ? `<div class="brow"><span class="bl">All Events Total</span><span class="bv">${fmtN(grossTotal)}</span></div>` : ""}
      ${groupDiscount > 0 ? `<div class="brow"><span class="bl">Discount${event.discount && event.discount.type === "percent" ? ` (${event.discount.value}%)` : ""}</span><span class="bv">-${fmtN(groupDiscount)}</span></div>` : ""}
      ${(eventsToShow.length > 1 || groupDiscount > 0) ? '<hr class="bdiv" />' : ""}
      <div class="brow"><span class="bl">Net Total</span><span class="bv">${fmtN(netTotal)}</span></div>
      <div class="brow"><span class="bl">Total Paid</span><span class="bv">${fmtN(totalPaid)}</span></div>
      <hr class="bbold" />
      <div class="brow grand"><span class="bl">Due Amount</span><span class="bv">${fmtN(groupDue)}</span></div>
    </div>
  </td></tr>
  ${allPayments.length > 0 ? `
  <tr><td colspan="2" class="blk">
    <div class="pay">
      <div class="pay-title">Payment History</div>
      <table class="pay-table">
        <thead><tr><th>Date</th><th>Note</th><th class="r">Amount</th></tr></thead>
        <tbody>${paymentRowsHtml}</tbody>
      </table>
    </div>
  </td></tr>` : ""}
  <tr><td colspan="2" class="blk"><div class="foot"><hr /><p>Thank you for choosing RSH Productions</p></div></td></tr>
</tbody>
</table>
</body></html>`;
}
