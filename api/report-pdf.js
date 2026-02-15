import OpenAI from "openai";
import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";

// (اختياري) لو احتجتي __dirname لاحقًا
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // بعض الأحيان Vercel ترسل body كنص
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const text = String(body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Missing text" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY in env" });
    }

    const client = new OpenAI({ apiKey });

    const analyzeResp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: `
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
`.trim(),
      text: { format: { type: "json_object" } },
    });

    let report = {};
    try {
      report = JSON.parse(analyzeResp.output_text || "{}");
    } catch {
      report = {};
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=hima-report.pdf");

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(res);

    // ✅ تحميل خط عربي من public/fonts (مناسب لـ Vercel)
    try {
      const fontPath = path.join(
        process.cwd(),
        "public",
        "fonts",
        "NotoNaskhArabic-Regular.ttf"
      );
      doc.font(fontPath);
    } catch {
      // إذا ما لقى الخط، يكمل بالخط الافتراضي
    }

    const rtl = (t, opts = {}) => doc.text(t || "", { align: "right", ...opts });

    const line = () => {
      doc.moveDown(0.6);
      doc
        .strokeColor("#E5E7EB")
        .lineWidth(1)
        .moveTo(50, doc.y)
        .lineTo(545, doc.y)
        .stroke();
      doc.moveDown(0.8);
      doc.fillColor("#111827");
    };

    doc.fillColor("#111827");
    doc.fontSize(20);
    rtl(report.title || "تقرير حِمى الرسمي");

    doc.moveDown(0.4);
    doc.fontSize(11);
    rtl(`التاريخ: ${report.date || new Date().toLocaleDateString("ar-SA")}`);
    rtl("النوع: تقرير جاهزية تنظيمية");
    doc.moveDown(0.6);

    doc.fontSize(11);
    rtl(`الدرجة: ${Number(report.score ?? 0)} / 100`);
    rtl(`التصنيف: ${report.classification || "—"}`);

    line();

    doc.fontSize(13);
    rtl("أولاً: النص المُدخل", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    rtl(text);

    line();

    doc.fontSize(13);
    rtl("ثانيًا: الملخص التنفيذي", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    (report.executive_summary || []).forEach((x) => rtl(`• ${x}`));

    line();

    doc.fontSize(13);
    rtl("ثالثًا: الملاحظات الرئيسية", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    const obs = report.observations || [];
    if (!obs.length) rtl("—");
    obs.forEach((o) => rtl(`• (${o.area || "عام"}) ${o.text || ""}`));

    line();

    doc.fontSize(13);
    rtl("رابعًا: اقتراحات إعادة الصياغة (قبل / بعد)", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    const rs = report.rewrite_suggestions || [];
    if (!rs.length) rtl("—");
    rs.slice(0, 10).forEach((r, i) => {
      rtl(`${i + 1}) الموضوع: ${r.topic || "—"}`);
      doc.moveDown(0.2);
      rtl(`قبل: ${r.before || "—"}`);
      doc.moveDown(0.2);
      rtl(`بعد: ${r.after || "—"}`);
      doc.moveDown(0.2);
      rtl(`السبب: ${r.reason || "—"}`);
      doc.moveDown(0.6);
    });

    line();

    doc.fontSize(13);
    rtl("خامسًا: توصيات تنفيذية", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    const actions = report.recommended_actions || [];
    if (!actions.length) rtl("—");
    actions.forEach((a) => rtl(`• ${a}`));

    line();

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