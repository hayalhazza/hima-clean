import OpenAI from "openai";
import PDFDocument from "pdfkit";
import path from "path";
import reshape from "arabic-persian-reshaper";
import bidiFactory from "bidi-js";

const bidi = bidiFactory();

function fixArabic(input) {
  const s = String(input ?? "");
  // 1) تشكيل الحروف العربية (connected forms)
  const shaped = reshape(s);
  // 2) ترتيب RTL/LTR الصحيح (خصوصاً مع الأرقام/الإنجليزي)
  return bidi.fromString(shaped).toString();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // body قد يصل كنص في Vercel
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
  "title":"التقرير الرسمي — حِمى",
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

    // إعداد الاستجابة PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=hima-report.pdf");

    const doc = new PDFDocument({ size: "A4", margin: 50, autoFirstPage: true });
    doc.pipe(res);

    // خط عربي من داخل المشروع
    const fontPath = path.join(process.cwd(), "public", "fonts", "NotoNaskhArabic-Regular.ttf");
    doc.registerFont("AR", fontPath);
    doc.font("AR");

    // دالة كتابة RTL بشكل مضبوط
    const rtl = (t, opts = {}) => {
      doc.text(fixArabic(t), {
        align: "right",
        lineGap: 4,
        width: 495, // A4 width minus margins تقريباً
        ...opts,
      });
    };

    const sectionLine = () => {
      doc.moveDown(0.6);
      doc.strokeColor("#E5E7EB").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.8);
      doc.fillColor("#111827");
    };

    // ===== العنوان =====
    doc.fillColor("#111827");
    doc.fontSize(20);
    rtl(report.title || "التقرير الرسمي — حِمى");

    doc.moveDown(0.4);
    doc.fontSize(11);
    rtl(`التاريخ: ${report.date || new Date().toLocaleDateString("ar-SA")}`);
    rtl("النوع: تقرير جاهزية تنظيمية");
    doc.moveDown(0.6);

    doc.fontSize(11);
    rtl(`الدرجة: ${Number(report.score ?? 0)} / 100`);
    rtl(`التصنيف: ${report.classification || "—"}`);

    sectionLine();

    // ===== النص المدخل =====
    doc.fontSize(13);
    rtl("أولاً: النص المُدخل", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    rtl(text);

    sectionLine();

    // ===== الملخص التنفيذي =====
    doc.fontSize(13);
    rtl("ثانيًا: الملخص التنفيذي", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    const exec = Array.isArray(report.executive_summary) ? report.executive_summary : [];
    if (!exec.length) rtl("—");
    exec.forEach((x) => rtl(`• ${x}`));

    sectionLine();

    // ===== الملاحظات =====
    doc.fontSize(13);
    rtl("ثالثًا: الملاحظات الرئيسية", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    const obs = Array.isArray(report.observations) ? report.observations : [];
    if (!obs.length) rtl("—");
    obs.forEach((o) => rtl(`• (${o?.area || "عام"}) ${o?.text || ""}`));

    sectionLine();

    // ===== إعادة الصياغة =====
    doc.fontSize(13);
    rtl("رابعًا: اقتراحات إعادة الصياغة (قبل / بعد)", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    const rs = Array.isArray(report.rewrite_suggestions) ? report.rewrite_suggestions : [];
    if (!rs.length) rtl("—");
    rs.slice(0, 10).forEach((r, i) => {
      rtl(`${i + 1}) الموضوع: ${r?.topic || "—"}`);
      doc.moveDown(0.2);
      rtl(`قبل: ${r?.before || "—"}`);
      doc.moveDown(0.2);
      rtl(`بعد: ${r?.after || "—"}`);
      doc.moveDown(0.2);
      rtl(`السبب: ${r?.reason || "—"}`);
      doc.moveDown(0.6);
    });

    sectionLine();

    // ===== التوصيات =====
    doc.fontSize(13);
    rtl("خامسًا: توصيات تنفيذية", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    const actions = Array.isArray(report.recommended_actions) ? report.recommended_actions : [];
    if (!actions.length) rtl("—");
    actions.forEach((a) => rtl(`• ${a}`));

    sectionLine();

    // ===== الخاتمة =====
    doc.fontSize(13);
    rtl("سادسًا: خاتمة", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    rtl(report.closing_note || "—");

    doc.moveDown(1.2);
    doc.fillColor("#6B7280");
    doc.fontSize(9);
    rtl("© حِمى — منصة قياس الجاهزية التنظيمية");

    doc.end();
  } catch (e) {
    return res.status(e?.status || 500).json({
      error: e?.message || "Server error",
      status: e?.status,
      code: e?.code,
    });
  }
}
