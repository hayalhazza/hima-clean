import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeArr(x) {
  return Array.isArray(x) ? x.filter(Boolean) : [];
}

function shieldSvg() {
  // Minimalist shield (inline SVG) — بدون ملف صورة
  return `
  <svg width="46" height="46" viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#22c55e"/>
        <stop offset="1" stop-color="#60a5fa"/>
      </linearGradient>
    </defs>
    <path d="M32 6c9 7 18 8 26 9v19c0 15-10 24-26 30C16 58 6 49 6 34V15c8-1 17-2 26-9z"
      fill="none" stroke="url(#g)" stroke-width="3" />
    <path d="M32 18v26" stroke="url(#g)" stroke-width="3" stroke-linecap="round"/>
    <path d="M22 30h20" stroke="url(#g)" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}

function buildHtml({ text, report, fontBase64 }) {
  const title = report?.title || "تقرير حِمى";
  const date = report?.date || new Date().toLocaleDateString("ar-SA");
  const score = Number(report?.score ?? 0);
  const classification = report?.classification || "—";

  const exec = safeArr(report?.executive_summary);
  const obs = safeArr(report?.observations);
  const rs = safeArr(report?.rewrite_suggestions);
  const actions = safeArr(report?.recommended_actions);
  const closing = report?.closing_note || "—";

  // تنسيق paragraph من النص/النتيجة — يحافظ على الأسطر
  const inputTextHtml = escapeHtml(text).replaceAll("\n", "<br/>");

  const execHtml = exec.length
    ? exec.map((x) => `<li>${escapeHtml(x)}</li>`).join("")
    : `<div class="muted">—</div>`;

  const obsHtml = obs.length
    ? obs
        .map((o) => {
          const area = escapeHtml(o?.area || "عام");
          const t = escapeHtml(o?.text || "");
          return `<li><span class="chip">${area}</span> <span>${t}</span></li>`;
        })
        .join("")
    : `<div class="muted">—</div>`;

  const rsHtml = rs.length
    ? rs.slice(0, 12).map((r, i) => {
        return `
        <div class="rewrite">
          <div class="rewriteHead">
            <div class="rewriteNum">${i + 1}</div>
            <div>
              <div class="rewriteTopic">${escapeHtml(r?.topic || "—")}</div>
              <div class="rewriteReason muted">${escapeHtml(r?.reason || "")}</div>
            </div>
          </div>
          <div class="rewriteGrid">
            <div class="box">
              <div class="label">قبل</div>
              <div class="val">${escapeHtml(r?.before || "—")}</div>
            </div>
            <div class="box">
              <div class="label">بعد</div>
              <div class="val">${escapeHtml(r?.after || "—")}</div>
            </div>
          </div>
        </div>`;
      }).join("")
    : `<div class="muted">—</div>`;

  const actionsHtml = actions.length
    ? actions.map((a) => `<li>${escapeHtml(a)}</li>`).join("")
    : `<div class="muted">—</div>`;

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    @font-face {
      font-family: "HimaFont";
      src: url(data:font/ttf;base64,${fontBase64}) format("truetype");
      font-weight: 400;
      font-style: normal;
    }
    :root{
      --bg:#0b1220;
      --card:#0f172a;
      --line:#e5e7eb;
      --muted:#6b7280;
      --ink:#111827;
      --chip:#eef2ff;
      --chipText:#1f2937;
      --g1:#22c55e;
      --g2:#60a5fa;
    }
    *{ box-sizing:border-box; }
    body{
      margin:0;
      font-family:"HimaFont", system-ui, -apple-system, Segoe UI, Roboto, Arial;
      color:var(--ink);
      background:#ffffff;
    }
    .page{
      padding:40px 48px 28px;
    }
    .header{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:18px;
      margin-bottom:18px;
    }
    .brand{
      display:flex;
      align-items:center;
      gap:12px;
    }
    .brandTitle{
      font-size:20px;
      font-weight:700;
      letter-spacing:0.2px;
      margin:0;
      line-height:1.2;
    }
    .brandSub{
      margin-top:4px;
      font-size:11px;
      color:var(--muted);
    }
    .meta{
      text-align:left; /* عشان يطلع يمين الصفحة بصريًا مع RTL */
      min-width:220px;
      font-size:11px;
      color:#374151;
      line-height:1.8;
      margin-top:2px;
    }
    .meta b{ color:#111827; }
    .divider{
      height:1px;
      background:#e5e7eb;
      margin:14px 0 18px;
    }
    .hero{
      display:flex;
      gap:14px;
      align-items:stretch;
      margin-bottom:18px;
    }
    .scoreCard{
      flex:1;
      border:1px solid #e5e7eb;
      border-radius:14px;
      padding:14px;
      background:#fbfdff;
    }
    .scoreTop{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      margin-bottom:6px;
    }
    .pill{
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding:6px 10px;
      border-radius:999px;
      background:#f3f4f6;
      font-size:11px;
      color:#111827;
      border:1px solid #e5e7eb;
      white-space:nowrap;
    }
    .pillDot{
      width:8px;height:8px;border-radius:50%;
      background:linear-gradient(135deg,var(--g1),var(--g2));
    }
    .scoreNum{
      font-size:26px;
      font-weight:800;
      letter-spacing:0.2px;
    }
    .scoreHint{
      font-size:11px;
      color:var(--muted);
      line-height:1.6;
    }

    h2{
      margin:0 0 10px;
      font-size:13px;
      font-weight:800;
    }
    .section{
      margin:16px 0;
      padding:14px;
      border:1px solid #e5e7eb;
      border-radius:14px;
      background:#fff;
    }
    .muted{ color:var(--muted); }
    .textBox{
      font-size:12px;
      line-height:1.9;
      color:#111827;
      white-space:normal;
    }
    ul{
      margin:0;
      padding:0 18px 0 0;
      font-size:12px;
      line-height:1.9;
    }
    li{ margin:6px 0; }
    .chip{
      display:inline-block;
      padding:2px 8px;
      border-radius:999px;
      background:var(--chip);
      color:var(--chipText);
      border:1px solid #dbeafe;
      font-size:10px;
      margin-left:6px;
      vertical-align:middle;
    }
    .rewrite{
      border:1px solid #e5e7eb;
      border-radius:14px;
      padding:12px;
      margin:10px 0;
      background:#fbfdff;
    }
    .rewriteHead{
      display:flex;
      gap:10px;
      align-items:flex-start;
      margin-bottom:10px;
    }
    .rewriteNum{
      width:26px;height:26px;border-radius:8px;
      display:flex;align-items:center;justify-content:center;
      background:linear-gradient(135deg, rgba(34,197,94,0.18), rgba(96,165,250,0.18));
      border:1px solid #d1fae5;
      font-weight:800;
      font-size:12px;
      flex:0 0 auto;
    }
    .rewriteTopic{ font-weight:800; font-size:12px; margin-top:1px; }
    .rewriteGrid{
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap:10px;
    }
    .box{
      border:1px solid #e5e7eb;
      border-radius:12px;
      padding:10px;
      background:#ffffff;
    }
    .label{
      font-size:10px;
      color:var(--muted);
      margin-bottom:6px;
      font-weight:700;
    }
    .val{
      font-size:12px;
      line-height:1.9;
      color:#111827;
      word-break:break-word;
    }
    .footer{
      margin-top:18px;
      display:flex;
      justify-content:space-between;
      align-items:center;
      font-size:10px;
      color:var(--muted);
      border-top:1px solid #e5e7eb;
      padding-top:12px;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="brand">
        ${shieldSvg()}
        <div>
          <h1 class="brandTitle">${escapeHtml(title)}</h1>
          <div class="brandSub">منصة قياس الجاهزية التنظيمية — تقرير مُولّد تلقائيًا</div>
        </div>
      </div>

      <div class="meta">
        <div><b>التاريخ:</b> ${escapeHtml(date)}</div>
        <div><b>النوع:</b> تقرير جاهزية تنظيمية</div>
        <div><b>الدرجة:</b> ${score} / 100</div>
        <div><b>التصنيف:</b> ${escapeHtml(classification)}</div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="hero">
      <div class="scoreCard">
        <div class="scoreTop">
          <div class="pill"><span class="pillDot"></span>ملخص سريع</div>
          <div class="scoreNum">${score}</div>
        </div>
        <div class="scoreHint">
          النتيجة مبنية على النص المُدخل فقط. استخدميها كبداية لتحديد الأولويات وتحسين وضوح السياسات والإجراءات.
        </div>
      </div>
    </div>

    <div class="section">
      <h2>1) النص المُدخل</h2>
      <div class="textBox">${inputTextHtml}</div>
    </div>

    <div class="section">
      <h2>2) الملخص التنفيذي</h2>
      ${exec.length ? `<ul>${execHtml}</ul>` : execHtml}
    </div>

    <div class="section">
      <h2>3) الملاحظات الرئيسية</h2>
      ${obs.length ? `<ul>${obsHtml}</ul>` : obsHtml}
    </div>

    <div class="section">
      <h2>4) اقتراحات إعادة الصياغة (قبل / بعد)</h2>
      ${rsHtml}
    </div>

    <div class="section">
      <h2>5) توصيات تنفيذية</h2>
      ${actions.length ? `<ul>${actionsHtml}</ul>` : actionsHtml}
    </div>

    <div class="section">
      <h2>6) خاتمة</h2>
      <div class="textBox">${escapeHtml(closing)}</div>
    </div>

    <div class="footer">
      <div>© حِمى — منصة قياس الجاهزية التنظيمية</div>
      <div>hima-impact.com</div>
    </div>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    // أحيانًا body يجي string
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const text = String(body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Missing text" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY in env" });

    const client = new OpenAI({ apiKey });

    const analyzeResp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: `
أنت محرك "حِمى" وتكتب تقريرًا رسميًا عربيًا تفصيليًا بناءً على النص فقط.
مهم جدًا: لا تستخدم كلمة "فجوات" إطلاقًا.
أخرج JSON فقط بهذه البنية:
{
  "title":"تقرير حِمى",
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
`.trim(),
      text: { format: { type: "json_object" } },
    });

    let report = {};
    try { report = JSON.parse(analyzeResp.output_text || "{}"); } catch { report = {}; }

    // اقرأ الخط وضمّنه Base64
    const fontPath = path.join(process.cwd(), "public", "fonts", "NotoNaskhArabic-Regular.ttf");
    const fontBuf = fs.readFileSync(fontPath);
    const fontBase64 = fontBuf.toString("base64");

    const html = buildHtml({ text, report, fontBase64 });

    // تشغيل Chromium على Vercel
    const executablePath = await chromium.executablePath();

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", right: "12mm", bottom: "14mm", left: "12mm" },
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=hima-report.pdf");
    return res.status(200).send(pdfBuffer);
  } catch (e) {
    return res.status(e?.status || 500).json({
      error: e?.message || "Server error",
      status: e?.status,
      code: e?.code,
    });
  }
}
