import OpenAI from "openai";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Vercel ممكن يرسل body كنص
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

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=hima-report.pdf");

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(res);

    // تحميل الخط (لو موجود)
    const fontPath = path.join(process.cwd(), "public", "fonts", "NotoNaskhArabic-Regular.ttf");
    if (fs.existsSync(fontPath)) {
      doc.font(fontPath);
    }

    // RTL helper (مسافات أفضل + عرض ثابت)
    const rtl = (t, opts = {}) =>
      doc.text(t || "", {
        align: "right",
        width: 480,
        lineGap: 8,
        paragraphGap: 6,
        ...opts,
      });

    const hr = () => {
      doc.moveDown(0.8);
      doc.strokeColor("#E5E7EB").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.fillColor("#111827");
      doc.moveDown(1);
    };

    // Header
    doc.fillColor("#111827");
    doc.fontSize(20);
    rtl(report.title || "التقرير الرسمي — حِمى");

    doc.moveDown(0.3);
    doc.fontSize(12);
    rtl(`التاريخ: ${report.date || new Date().toLocaleDateString("ar-SA")}`);
    rtl("النوع: تقرير جاهزية تنظيمية");
    rtl(`الدرجة: ${Number(report.score ?? 0)} / 100`);
    rtl(`التصنيف: ${report.classification || "—"}`);

    hr();

    // 1) النص المُدخل
    doc.fontSize(15);
    rtl("1) النص المُدخل", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(13);
    rtl(text);

    hr();

    // 2) الملخص التنفيذي
    doc.fontSize(15);
    rtl("2) الملخص التنفيذي", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(13);
    const exec = Array.isArray(report.executive_summary) ? report.executive_summary : [];
    if (!exec.length) rtl("—");
    exec.forEach((x) => rtl(`• ${x}`));

    hr();

    // 3) الملاحظات الرئيسية
    doc.fontSize(15);
    rtl("3) الملاحظات الرئيسية", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(13);
    const obs = Array.isArray(report.observations) ? report.observations : [];
    if (!obs.length) rtl("—");
    obs.forEach((o) => rtl(`• (${o.area || "عام"}) ${o.text || ""}`));

    hr();

    // 4) إعادة الصياغة
    doc.fontSize(15);
    rtl("4) اقتراحات إعادة الصياغة (قبل / بعد)", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(13);
    const rs = Array.isArray(report.rewrite_suggestions) ? report.rewrite_suggestions : [];
    if (!rs.length) rtl("—");
    rs.slice(0, 10).forEach((r, i) => {
      rtl(`${i + 1}) الموضوع: ${r.topic || "—"}`, { continued: false });
      rtl(`قبل: ${r.before || "—"}`);
      rtl(`بعد: ${r.after || "—"}`);
      rtl(`السبب: ${r.reason || "—"}`);
      doc.moveDown(0.6);
    });

    hr();

    // 5) توصيات تنفيذية
    doc.fontSize(15);
    rtl("5) توصيات تنفيذية", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(13);
    const actions = Array.isArray(report.recommended_actions) ? report.recommended_actions : [];
    if (!actions.length) rtl("—");
    actions.forEach((a) => rtl(`• ${a}`));

    hr();

    // 6) خاتمة
    doc.fontSize(15);
    rtl("6) خاتمة", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(13);
    rtl(report.closing_note || "—");

    doc.moveDown(1.3);
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
