import OpenAI from "openai";
import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";

export const config = { runtime: "nodejs" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function toArray(x) {
  return Array.isArray(x) ? x : [];
}

function safeStr(x) {
  return String(x ?? "").trim();
}

async function buildPdfBuffer({ report, text }) {
  const doc = new PDFDocument({ size: "A4", margin: 52 });

  // جمع الـ PDF في الذاكرة (Buffer)
  const chunks = [];
  doc.on("data", (d) => chunks.push(d));

  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // خط عربي (Noto Naskh) - موجود عندك في public/fonts
  const fontPath = path.join(__dirname, "..", "public", "fonts", "NotoNaskhArabic-Regular.ttf");
  try {
    doc.registerFont("arabic", fontPath);
    doc.font("arabic");
  } catch {
    // لو فشل الخط لأي سبب، نكمل بخط افتراضي بدل ما نخرب الملف
  }

  // Helpers
  const rtl = (t, opts = {}) =>
    doc.text(safeStr(t), { align: "right", ...opts });

  const sectionTitle = (t) => {
    doc.moveDown(0.9);
    doc.fillColor("#111827").fontSize(12);
    rtl(t, { underline: true });
    doc.moveDown(0.4);
    doc.fillColor("#111827").fontSize(11);
  };

  const hr = () => {
    doc.moveDown(0.6);
    doc.strokeColor("#E5E7EB").lineWidth(1).moveTo(52, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.8);
  };

  // Header
  doc.fillColor("#111827").fontSize(18);
  rtl("حِمى — التقرير الرسمي");

  doc.moveDown(0.4);
  doc.fontSize(11).fillColor("#111827");
  rtl(`التاريخ: ${safeStr(report.date) || new Date().toLocaleDateString("ar-SA")}`);
  rtl("التصنيف: تقييم جاهزية تنظيمية");
  rtl(`الدرجة: ${Number(report.score ?? 0)} / 100`);
  rtl(`الوضع: ${safeStr(report.classification) || "—"}`);

  hr();

  // 1) النص المدخل
  sectionTitle("1) النص المُدخل");
  rtl(text || "—");

  hr();

  // 2) الملخص التنفيذي
  sectionTitle("2) الملخص التنفيذي");
  const exec = toArray(report.executive_summary);
  if (!exec.length) rtl("—");
  exec.forEach((x) => rtl(`• ${safeStr(x)}`));

  hr();

  // 3) الملاحظات الرئيسية
  sectionTitle("3) الملاحظات الرئيسية");
  const obs = toArray(report.observations);
  if (!obs.length) rtl("—");
  obs.forEach((o) => {
    const area = safeStr(o?.area) || "عام";
    const txt = safeStr(o?.text);
    rtl(`• (${area}) ${txt}`);
  });

  hr();

  // 4) قبل / بعد
  sectionTitle("4) قبل / بعد (إعادة صياغة مختصرة)");
  const rs = toArray(report.rewrite_suggestions).slice(0, 8);
  if (!rs.length) rtl("—");
  rs.forEach((r, i) => {
    rtl(`${i + 1}) الموضوع: ${safeStr(r?.topic) || "—"}`);
    doc.moveDown(0.2);
    rtl(`قبل: ${safeStr(r?.before) || "—"}`);
    doc.moveDown(0.2);
    rtl(`بعد: ${safeStr(r?.after) || "—"}`);
    doc.moveDown(0.2);
    rtl(`السبب: ${safeStr(r?.reason) || "—"}`);
    doc.moveDown(0.6);
  });

  hr();

  // 5) توصيات تنفيذية
  sectionTitle("5) توصيات تنفيذية");
  const actions = toArray(report.recommended_actions);
  if (!actions.length) rtl("—");
  actions.forEach((a) => rtl(`• ${safeStr(a)}`));

  hr();

  // 6) خاتمة
  sectionTitle("6) خاتمة");
  rtl(safeStr(report.closing_note) || "—");

  doc.moveDown(1.0);
  doc.fillColor("#6B7280").fontSize(9);
  rtl("© حِمى — منصة قياس الجاهزية التنظيمية");

  doc.end();
  return await done;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Body قد يأتي كنص
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const text = safeStr(body?.text);
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

    // هنا نولّد PDF كامل أولاً (لو صار خطأ نرجع JSON وما نخرب الملف)
    const pdfBuffer = await buildPdfBuffer({ report, text });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=hima-report.pdf");
    res.setHeader("Content-Length", String(pdfBuffer.length));
    return res.status(200).send(pdfBuffer);
  } catch (e) {
    return res.status(e?.status || 500).json({
      error: e?.message || "Server error",
      status: e?.status,
      code: e?.code,
    });
  }
}
