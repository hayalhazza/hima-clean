const $ = (id) => document.getElementById(id);

const txt = $("txt");
const out = $("out");
const cc = $("charCount");

const kpiScore = $("kpiScore");
const kpiHigh  = $("kpiHigh");
const kpiMid   = $("kpiMid");
const kpiLow   = $("kpiLow");

const b1 = $("b1"), b2 = $("b2"), b3 = $("b3");
const b1v = $("b1v"), b2v = $("b2v"), b3v = $("b3v");

function safeNum(n, fallback = 0){
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function setBar(el, val){
  const v = Math.max(0, Math.min(100, safeNum(val, 0)));
  el.style.width = v + "%";
}

function formatResult(data){
  const score = safeNum(data?.score, 0);
  const gaps = data?.gaps || {};
  const subs = data?.subs || {};

  const lines = [];
  lines.push(`الدرجة الإجمالية: ${score} / 100`);
  lines.push("");
  lines.push("مؤشرات الإكمال:");
  lines.push(`- High: ${safeNum(gaps.high, 0)}`);
  lines.push(`- Mid: ${safeNum(gaps.mid, 0)}`);
  lines.push(`- Low: ${safeNum(gaps.low, 0)}`);
  lines.push("");

  const details = (data?.details || "").trim();
  if (details) {
    lines.push("تفاصيل:");
    lines.push(details);
    lines.push("");
  }

  const obs = Array.isArray(data?.observations) ? data.observations : [];
  if (obs.length){
    lines.push("ملاحظات:");
    obs.slice(0, 8).forEach((o) => {
      lines.push(`• (${o.area || "عام"}) ${o.text || ""}`.trim());
    });
    lines.push("");
  }

  const sug = Array.isArray(data?.suggestions) ? data.suggestions : [];
  if (sug.length){
    lines.push("اقتراحات إعادة صياغة:");
    sug.slice(0, 8).forEach((s, i) => {
      lines.push(`${i+1}) ${s.topic || "—"}`);
      lines.push(`   قبل: ${s.before || "—"}`);
      lines.push(`   بعد: ${s.after || "—"}`);
      lines.push(`   السبب: ${s.reason || "—"}`);
      lines.push("");
    });
  }

  return lines.join("\n").trim();
}

function applyKpis(data){
  const score = safeNum(data?.score, 0);
  const gaps = data?.gaps || {};
  const subs = data?.subs || {};

  kpiScore.textContent = score;
  kpiHigh.textContent  = safeNum(gaps.high, 0);
  kpiMid.textContent   = safeNum(gaps.mid, 0);
  kpiLow.textContent   = safeNum(gaps.low, 0);

  const s1 = safeNum(subs["الإحاطة الواجبة"], 0);
  const s2 = safeNum(subs["الموافقة والعدول"], 0);
  const s3 = safeNum(subs["الاحتفاظ والإتلاف"], 0);

  setBar(b1, s1); setBar(b2, s2); setBar(b3, s3);
  b1v.textContent = s1; b2v.textContent = s2; b3v.textContent = s3;
}

async function postJson(url, body){
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(()=> "");
    throw new Error(`HTTP ${res.status}: ${t || res.statusText}`);
  }
  return res;
}

txt.addEventListener("input", () => {
  cc.textContent = (txt.value || "").length;
});

$("btnAnalyze").addEventListener("click", async () => {
  try{
    const text = (txt.value || "").trim();
    if (!text) return (out.textContent = "اكتبي نصًا أولًا.");

    out.textContent = "جارٍ التحليل...";
    const res = await postJson("/api/analyze", { text });
    const data = await res.json();

    out.textContent = formatResult(data);
    applyKpis(data);
    location.hash = "#report";
  }catch(e){
    out.textContent = "خطأ: " + (e?.message || e);
  }
});

$("btnPdf").addEventListener("click", async () => {
  try{
    const text = (txt.value || "").trim();
    if (!text) return (out.textContent = "اكتبي نصًا أولًا.");

    out.textContent = "جارٍ إنشاء تقرير PDF...";
    const res = await postJson("/api/report-pdf", { text });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hima-report.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    out.textContent = "تم تنزيل التقرير ✅";
  }catch(e){
    out.textContent = "خطأ: " + (e?.message || e);
  }
});

$("btnMock").addEventListener("click", () => {
  // نص تجريبي (بدون عبارة “نسخة تجريبية”)
  const demo = `
سياسة الخصوصية
نقوم بجمع بعض البيانات مثل الاسم ورقم الهوية وتاريخ الميلاد عند الحاجة لتقديم الخدمة.
قد نشارك البيانات مع شركائنا لأغراض تشغيلية وتحسين التجربة.
باستخدامك للخدمة فإنك توافق على جميع عمليات المعالجة.
نحتفظ بالبيانات طالما نرى ذلك مناسبًا أو وفق متطلبات النظام.
`.trim();

  txt.value = demo;
  cc.textContent = demo.length;
  out.textContent = "تم تحميل نص محاكاة. اضغطي “تحليل”.";
});
