import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Missing text" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY in env" });

    const client = new OpenAI({ apiKey });

    const prompt = `
أنت محرك "حِمى" لتقييم الجاهزية التنظيمية لنص عربي.
قواعد مهمة:
- لا تضف معلومات خارج النص.
- أعطِ تقييمًا رقميًا 0-100.
- أعطِ gaps للفئات (high/mid/low) كأرقام.
- أعطِ subs للأقسام الثلاثة (0-100) بحسب قوة النص في كل محور.
- أعطِ details نص تفصيلي رسمي (بدون ذكر كلمة "فجوات" إطلاقًا).
- أعطِ suggestions كقائمة اقتراحات إعادة صياغة (قبل/بعد + سبب).

أرجع JSON فقط بهذه البنية:
{
  "score": 0-100,
  "gaps": {"high":0,"mid":0,"low":0},
  "subs": {"الإحاطة الواجبة":0-100,"الموافقة والعدول":0-100,"الاحتفاظ والإتلاف":0-100},
  "observations": [{"area":"الإحاطة الواجبة|الموافقة والعدول|الاحتفاظ والإتلاف|عام","text":"..."}],
  "suggestions": [{"topic":"...","before":"...","after":"...","reason":"..."}],
  "details": "نص تفصيلي رسمي"
}

النص:
"""${text}"""
`.trim();

    const resp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
      text: { format: { type: "json_object" } },
    });

    let parsed = {};
    try { parsed = JSON.parse(resp.output_text || "{}"); } catch { parsed = {}; }

    const score = Number(parsed?.score);
    const gaps = parsed?.gaps || parsed?.counts || {};
    const subs = parsed?.subs || {};

    const normalized = {
      score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
      gaps: {
        high: Number(gaps.high ?? 0),
        mid: Number(gaps.mid ?? gaps.med ?? 0),
        low: Number(gaps.low ?? 0),
      },
      subs: {
        "الإحاطة الواجبة": Number(subs["الإحاطة الواجبة"] ?? 0),
        "الموافقة والعدول": Number(subs["الموافقة والعدول"] ?? 0),
        "الاحتفاظ والإتلاف": Number(subs["الاحتفاظ والإتلاف"] ?? 0),
      },
      details: String(parsed?.details || ""),
      suggestions: Array.isArray(parsed?.suggestions) ? parsed.suggestions : [],
      observations: Array.isArray(parsed?.observations) ? parsed.observations : [],
    };

    return res.status(200).json(normalized);
  } catch (e) {
    return res.status(e?.status || 500).json({
      error: e?.message || "Server error",
      status: e?.status,
      code: e?.code,
    });
  }
}
