// engine-mock.js
export function runMockEngine(inputText) {
  const text = (inputText || "").trim();

  const findings = [];
  const add = (title, severity, status, note) =>
    findings.push({ title, severity, status, note });

  if (/قد\s+نشارك|نشارك\s+البيانات|شركائنا/.test(text)) {
    add("مشاركة البيانات بصياغة عامة", "عالي", "غير متوافق", "صياغة عامة دون تحديد الفئات/الغرض/النطاق.");
  }
  if (/طالما\s+نرى|مناسب/.test(text)) {
    add("الاحتفاظ دون مدة/معيار", "عالي", "غير متوافق", "لا توجد مدة احتفاظ أو معايير حساب واضحة.");
  }
  if (/باستخدامك|توافق\s+على\s+جميع/.test(text)) {
    add("موافقة شاملة على جميع عمليات المعالجة", "عالي", "غير متوافق", "موافقة مجملة دون أغراض مستقلة.");
  }
  if (/سياسة\s+خصوصية\s+تجريبية/.test(text)) {
    add("نقص عناصر الإحاطة الواجبة في إشعار الخصوصية", "عالي", "غير متوافق", "النص لا يذكر عناصر الإحاطة الأساسية.");
  }
  if (/رقم\s+الهوية|تاريخ\s+الميلاد/.test(text)) {
    add("الحد الأدنى من جمع البيانات غير مُبرهن", "متوسط", "جزئي", "الغرض مذكور لكن لا يثبت الحد الأدنى من النص.");
  }

  const weights = { عالي: 15, متوسط: 8, منخفض: 3 };
  const high = findings.filter(f => f.severity === "عالي").length;
  const med  = findings.filter(f => f.severity === "متوسط").length;
  const low  = findings.filter(f => f.severity === "منخفض").length;

  const deductions = (high * weights["عالي"]) + (med * weights["متوسط"]) + (low * weights["منخفض"]);
  let score = 100 - deductions;
  if (score < 0) score = 0;

  const exposure =
    score >= 80 ? "مستقر" :
    score >= 60 ? "تعرض متوسط" :
    score >= 40 ? "تعرض مرتفع" : "تعرض حرج";

  const subs = {
    "الإحاطة الواجبة": clamp(100 - (high * 22 + med * 10), 0, 100),
    "الموافقة والعدول": clamp(100 - (high * 24 + med * 10), 0, 100),
    "الاحتفاظ والإتلاف": clamp(100 - (high * 20 + med * 10), 0, 100),
  };

  return {
    score,
    classification: exposure,
    gaps: { high, mid: med, low },
    observations: findings.map(f => ({ area: "عام", text: `${f.title} — ${f.note}` })),
    suggestions: [
      {
        topic: "تحسين الصياغة",
        before: "صياغات عامة وغير محددة",
        after: "صياغات محددة تتضمن الغرض والنطاق والمدة والمسؤوليات",
        reason: "رفع الوضوح وتقليل التعرض"
      }
    ],
    details: `نتيجة المحاكاة مبنية على قواعد ثابتة داخلية. عدد مؤشرات عالي: ${high}، متوسط: ${med}، منخفض: ${low}.`,
    subs
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
