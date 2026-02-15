import OpenAI from "openai";
import PDFDocument from "pdfkit";
import path from "path";

function safeStr(x) {
  return (x === null || x === undefined) ? "" : String(x);
}

function normalizeReport(report) {
  return {
    date: safeStr(report?.date),
    score: Number(report?.score ?? 0),
    classification: safeStr(report?.classification),
    executive_summary: Array.isArray(report?.executive_summary) ? report.executive_summary : [],
    observations: Array.isArray(report?.observations) ? report.observations : [],
    rewrite_suggestions: Array.isArray(report?.rewrite_suggestions) ? report.rewrite_suggestions : [],
    recommended_actions: Array.isArray(report?.recommended_actions) ? report.recommended_actions : [],
    closing_note: safeStr(report?.closing_note),
  };
}

function drawShield(doc, x, y, size = 28) {
  // Minimalist shield (vector) — no image needed
  const w = size;
  const h = Math.round(size * 1.22);

  doc.save();

  // Outer shield
  doc.lineWidth(1.6);
  doc.strokeColor("#2DD4BF"); // green-ish
  doc
    .path(
      `M ${x + w/2} ${y}
       L ${x} ${y + h*0.18}
       V ${y + h*0.55}
       C ${x} ${y + h*0.88} ${x + w*0.32} ${y + h*1.02} ${x + w/2} ${y + h*1.08}
       C ${x + w*0.68} ${y + h*1.02} ${x + w} ${y + h*0.88} ${x + w} ${y + h*0.55}
       V ${y + h*0.18}
       Z`
    )
    .stroke();

  // Inner line
  doc.lineWidth(1.1);
  doc.strokeColor("#60A5FA"); // blue
  doc
    .moveTo(x + w/2, y + h*0.20)
    .lineTo(x + w/2, y + h*0.82)
    .stroke();

  // Small notch
  doc.lineWidth(1.1);
  doc.strokeColor("#60A5FA");
  doc
    .moveTo(x + w*0.33, y + h*0.42)
    .lineTo(x + w*0.67, y + h*0.42)
    .stroke();

  doc.restore();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Sometimes body comes as string on Vercel
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const text = safeStr(body?.text).trim();
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

    let reportRaw = {};
    try { reportRaw = JSON.parse(analyzeResp.output_text || "{}"); } catch { reportRaw = {}; }
    const report = normalizeReport(reportRaw);

    // PDF headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=hima-report.pdf");

    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
    doc.pipe(res);

    // Font (Arabic)
    const fontPath = path.join(process.cwd(), "public", "fonts", "NotoNaskhArabic-Regular.ttf");
    doc.registerFont("arabic", fontPath);
    doc.font("arabic");

    const pageWidth = doc.page.width;
    const margin = doc.page.margins.left;
    const contentW = pageWidth - margin - doc.page.margins.right;

    const rtl = (t, opts = {}) => {
      doc.text(safeStr(t), {
        align: "right",
        width: contentW,
        lineGap: 2,
        ...opts,
      });
    };

    const hr = () => {
      doc.moveDown(0.8);
      doc
        .strokeColor("#E5E7EB")
        .lineWidth(1)
        .moveTo(margin, doc.y)
        .lineTo(margin + contentW, doc.y)
        .stroke();
      doc.moveDown(0.9);
      doc.fillColor("#111827");
      doc.strokeColor("#111827");
    };

    const sectionTitle = (t) => {
      doc.moveDown(0.2);
      doc.fillColor("#0B1220");
      // subtle pill background
      const y = doc.y;
      const h = 22;
      doc.save();
      doc.roundedRect(margin, y - 2, contentW, h, 8).fillOpacity(0.06).fill("#60A5FA");
      doc.restore();
      doc.fillColor("#111827");
      doc.fontSize(13);
      rtl(t, { continued: false });
      doc.moveDown(0.3);
      doc.fontSize(11);
      doc.fillColor("#111827");
    };

    const bullets = (arr, max = 50) => {
      const items = (arr || []).slice(0, max);
      if (!items.length) return rtl("—");
      items.forEach((x) => rtl(`• ${safeStr(x)}`));
    };

    // ===== Header =====
    // Shield top-right
    drawShield(doc, margin + contentW - 34, 42, 26);

    doc.fillColor("#111827");
    doc.fontSize(18);
    rtl("التقرير الرسمي — حِمى");

    doc.moveDown(0.2);
    doc.fontSize(10.5);
    rtl(`التاريخ: ${report.date || new Date().toLocaleDateString("ar-SA")}`);
    rtl("النوع: تقرير جاهزية تنظيمية");
    doc.moveDown(0.2);
    rtl(`الدرجة: ${Number(report.score ?? 0)} / 100`);
    rtl(`التصنيف: ${report.classification || "—"}`);

    hr();

    // ===== Sections =====
    sectionTitle("1) المدخل النصّي");
    rtl(text);

    hr();

    sectionTitle("2) الملخص التنفيذي");
    bullets(report.executive_summary, 10);

    hr();

    sectionTitle("3) الملاحظات الرئيسية");
    const obs = report.observations || [];
    if (!obs.length) {
      rtl("—");
    } else {
      obs.slice(0, 20).forEach((o) => {
        const area = safeStr(o?.area || "عام");
        const txt = safeStr(o?.text || "");
        rtl(`• (${area}) ${txt}`);
      });
    }

    hr();

    sectionTitle("4) إعادة الصياغة المقترحة (قبل / بعد)");
    const rs = report.rewrite_suggestions || [];
    if (!rs.length) {
      rtl("—");
    } else {
      rs.slice(0, 8).forEach((r, i) => {
        rtl(`${i + 1}) الموضوع: ${safeStr(r?.topic || "—")}`);
        doc.moveDown(0.15);
        rtl(`قبل: ${safeStr(r?.before || "—")}`);
        doc.moveDown(0.15);
        rtl(`بعد: ${safeStr(r?.after || "—")}`);
        doc.moveDown(0.15);
        rtl(`السبب: ${safeStr(r?.reason || "—")}`);
        doc.moveDown(0.6);
      });
    }

    hr();

    sectionTitle("5) توصيات تنفيذية");
    bullets(report.recommended_actions, 12);

    hr();

    sectionTitle("6) خاتمة");
    rtl(report.closing_note || "—");

    // Footer
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
