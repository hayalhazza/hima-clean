import OpenAI from "openai";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

/* Helpers */
function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function toList(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "<div class='muted'>—</div>";
  return `<ul>${arr.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
}
function toObs(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "<div class='muted'>—</div>";
  return `
    <div class="table">
      ${arr.map(o => `
        <div class="tr">
          <div class="td area">${esc(o.area || "عام")}</div>
          <div class="td">${esc(o.text || "")}</div>
        </div>
      `).join("")}
    </div>
  `;
}
function toRewrite(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "<div class='muted'>—</div>";
  return arr.slice(0, 10).map((r, i) => `
    <div class="rewrite">
      <div class="rewriteHead">
        <div class="num">${i + 1}</div>
        <div class="topic">${esc(r.topic || "—")}</div>
      </div>
      <div class="rewriteGrid">
        <div class="box">
          <div class="label">قبل</div>
          <div class="text">${esc(r.before || "—")}</div>
        </div>
        <div class="box">
          <div class="label">بعد</div>
          <div class="text">${esc(r.after || "—")}</div>
        </div>
      </div>
      <div class="reason">
        <span class="labelInline">السبب:</span> ${esc(r.reason || "—")}
      </div>
    </div>
  `).join("");
}

/* Minimal Shield SVG */
function shieldSVG() {
  return `
  <svg class="shield" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2l7 3v6c0 5.2-3 9.8-7 11-4-1.2-7-5.8-7-11V5l7-3z"/>
    <path class="inner" d="M12 5.2l4.3 1.8v4.1c0 3.7-1.9 6.8-4.3 7.8-2.4-1-4.3-4.1-4.3-7.8V7l4.3-1.8z"/>
  </svg>`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    // Vercel أحيانًا يرسل body كنص
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const text = String(body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Missing text" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    const client = new OpenAI({ apiKey });

    const prompt = `
أنت محرك "حِمى" وتكتب تقريرًا رسميًا عربيًا تفصيليًا بناءً على النص فقط.
مهم جدًا: لا تستخدم كلمة "فجوات" إطلاقًا.
أخرج JSON فقط بهذه البنية:
{
  "title":"تقرير حِمى الرسمي",
  "date":"(تاريخ مختصر)",
  "score":0-100,
  "classification":"مستقر|تعرض متوسط|تعرض مرتفع|تعرض حرج",
  "executive_summary":["...","...","..."],
  "observations":[{"area":"...","text":"..."}],
  "rewrite_suggestions":[{"topic":"...","before":"...","after":"...","reason":"..."}],
  "recommended_actions":["...","...","..."],
  "closing_note":"..."
}

النص:
"""${text}"""
`.trim();

    const ai = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
      text: { format: { type: "json_object" } },
    });

    let report = {};
    try { report = JSON.parse(ai.output_text || "{}"); } catch { report = {}; }

    const title = report.title || "تقرير حِمى الرسمي";
    const date = report.date || new Date().toLocaleDateString("ar-SA");
    const score = Number(report.score ?? 0);
    const classification = report.classification || "—";

    const html = `
<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Arabic:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
  :root{
    --text:#0b1220;
    --muted:#475569;
    --line:#e5e7eb;
    --card:#f8fafc;
    --blue:#2563eb;
    --green:#16a34a;
  }
  *{ box-sizing:border-box; }
  body{
    margin:0;
    padding:38px 44px;
    font-family: "IBM Plex Arabic", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    color:var(--text);
    direction:rtl;
    text-align:right;
    line-height:2.05;
    background:white;
  }
  .top{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:18px;
    padding-bottom:14px;
    border-bottom:1px solid var(--line);
    margin-bottom:18px;
  }
  .brand{
    display:flex;
    align-items:center;
    gap:12px;
  }
  .brandText .name{
    font-weight:900;
    font-size:18px;
    letter-spacing:.2px;
  }
  .brandText .tag{
    color:var(--muted);
    font-weight:600;
    font-size:12px;
    margin-top:2px;
  }
  .shield{
    width:40px;height:40px;
    fill: url(#g);
  }
  .shield .inner{ fill: rgba(255,255,255,.55); }
  .meta{
    text-align:left;
    min-width:220px;
  }
  .pill{
    display:inline-flex;
    align-items:center;
    gap:8px;
    padding:8px 12px;
    border:1px solid var(--line);
    border-radius:999px;
    background:var(--card);
    font-weight:800;
    font-size:12px;
  }
  .dot{ width:10px;height:10px;border-radius:999px;background:var(--green); }
  .kv{
    margin-top:10px;
    display:flex;
    flex-direction:column;
    gap:6px;
    font-size:12px;
    color:var(--muted);
    font-weight:700;
  }
  h1{
    margin: 0 0 8px;
    font-weight:900;
    font-size:22px;
  }
  .scoreRow{
    display:flex;
    gap:10px;
    flex-wrap:wrap;
    margin-top:6px;
  }
  .kpi{
    border:1px solid var(--line);
    background:var(--card);
    border-radius:14px;
    padding:10px 12px;
    min-width: 180px;
  }
  .kpi .label{ color:var(--muted); font-weight:800; font-size:12px; }
  .kpi .value{ font-weight:900; font-size:18px; margin-top:4px; }
  .section{
    margin-top:18px;
    padding-top:14px;
    border-top:1px solid var(--line);
    break-inside: avoid;
  }
  .sectionTitle{
    font-weight:900;
    font-size:14px;
    margin:0 0 10px;
    color:#0f172a;
  }
  .box{
    border:1px solid var(--line);
    background:var(--card);
    border-radius:14px;
    padding:12px 14px;
  }
  ul{ margin: 0; padding-right: 18px; }
  li{ margin: 6px 0; }
  .muted{ color:var(--muted); font-weight:600; }

  /* observations table */
  .table{
    border:1px solid var(--line);
    border-radius:14px;
    overflow:hidden;
    background:var(--card);
  }
  .tr{
    display:grid;
    grid-template-columns: 180px 1fr;
    gap:0;
    border-top:1px solid var(--line);
  }
  .tr:first-child{ border-top:none; }
  .td{
    padding:10px 12px;
    font-size:12.5px;
    font-weight:650;
  }
  .td.area{
    background: rgba(37,99,235,.07);
    font-weight:900;
    color:#0f172a;
  }

  /* rewrite blocks */
  .rewrite{
    border:1px solid var(--line);
    background:var(--card);
    border-radius:14px;
    padding:12px 14px;
    margin: 10px 0;
    break-inside: avoid;
  }
  .rewriteHead{
    display:flex;
    align-items:center;
    gap:10px;
    margin-bottom:10px;
  }
  .num{
    width:26px;height:26px;border-radius:10px;
    display:grid;place-items:center;
    background: rgba(22,163,74,.12);
    color:#0f172a;
    font-weight:900;
    font-size:12px;
  }
  .topic{ font-weight:900; font-size:13px; }
  .rewriteGrid{
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap:10px;
  }
  .box .label{
    font-size:11px;
    font-weight:900;
    color:var(--muted);
    margin-bottom:6px;
  }
  .box .text{
    font-size:12.5px;
    font-weight:650;
  }
  .reason{
    margin-top:10px;
    font-size:12.5px;
    font-weight:650;
    color:#0f172a;
  }
  .labelInline{ color:var(--muted); font-weight:900; }

  .footer{
    margin-top:22px;
    padding-top:12px;
    border-top:1px solid var(--line);
    color:var(--muted);
    font-size:11px;
    font-weight:700;
    display:flex;
    justify-content:space-between;
    gap:12px;
  }
  .small{ font-size:10.5px; }
</style>
</head>
<body>

<!-- SVG gradient defs -->
<svg width="0" height="0" style="position:absolute">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${"#2563eb"}"/>
      <stop offset="1" stop-color="${"#16a34a"}"/>
    </linearGradient>
  </defs>
</svg>

<div class="top">
  <div class="brand">
    ${shieldSVG()}
    <div class="brandText">
      <div class="name">حِمى</div>
      <div class="tag">منصة قياس الجاهزية التنظيمية</div>
    </div>
  </div>

  <div class="meta">
    <div class="pill"><span class="dot"></span> ${esc(classification)}</div>
    <div class="kv">
      <div>التاريخ: ${esc(date)}</div>
      <div>النوع: تقرير جاهزية تنظيمية</div>
    </div>
  </div>
</div>

<h1>${esc(title)}</h1>

<div class="scoreRow">
  <div class="kpi">
    <div class="label">الدرجة</div>
    <div class="value">${Number.isFinite(score) ? score : 0} / 100</div>
  </div>
  <div class="kpi">
    <div class="label">التصنيف</div>
    <div class="value">${esc(classification)}</div>
  </div>
</div>

<div class="section">
  <div class="sectionTitle">أولًا: النص المُدخل</div>
  <div class="box">${esc(text).replaceAll("\n","<br/>")}</div>
</div>

<div class="section">
  <div class="sectionTitle">ثانيًا: الملخص التنفيذي</div>
  <div class="box">${toList(report.executive_summary)}</div>
</div>

<div class="section">
  <div class="sectionTitle">ثالثًا: الملاحظات الرئيسية</div>
  ${toObs(report.observations)}
</div>

<div class="section">
  <div class="sectionTitle">رابعًا: اقتراحات إعادة الصياغة (قبل / بعد)</div>
  ${toRewrite(report.rewrite_suggestions)}
</div>

<div class="section">
  <div class="sectionTitle">خامسًا: توصيات تنفيذية</div>
  <div class="box">${toList(report.recommended_actions)}</div>
</div>

<div class="section">
  <div class="sectionTitle">سادسًا: خاتمة</div>
  <div class="box">${esc(report.closing_note || "—")}</div>
</div>

<div class="footer">
  <div>© حِمى — منصة قياس الجاهزية التنظيمية</div>
  <div class="small">hima-impact.com</div>
</div>

</body>
</html>
`.trim();

    // Launch chromium for Vercel
    const executablePath = await chromium.executablePath();

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "36px", right: "32px", bottom: "36px", left: "32px" },
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=hima-report.pdf");
    return res.status(200).send(pdf);

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "PDF generation failed", detail: String(e?.message || e) });
  }
}
