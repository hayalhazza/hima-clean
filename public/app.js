import { runMockEngine } from "./engine-mock.js";

const $ = (id) => document.getElementById(id);

function setStatus(msg) {
  $("status").textContent = msg;
}

function pretty(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

function normalizeForUI(data) {
  // نحاول نوحّد الاختلاف بين mock و api
  const score = Number(data?.score ?? 0);
  const classification = data?.classification || data?.exposure || "—";
  const gaps = data?.gaps || data?.counts || {};
  const high = Number(gaps.high ?? 0);
  const mid  = Number(gaps.mid ?? gaps.med ?? 0);
  const low  = Number(gaps.low ?? 0);

  return { score, classification, high, mid, low, raw: data };
}

async function callAnalyze(text, useMock) {
  if (useMock) {
    return runMockEngine(text);
  }

  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Analyze failed: ${res.status} ${msg}`);
  }
  return await res.json();
}

async function downloadPdf(text, useMock) {
  if (useMock) {
    // في المحاكاة ما عندنا PDF حقيقي — نخليها رسالة واضحة
    throw new Error("تحميل PDF يعمل مع API الحقيقي فقط. أطفئي المحاكاة وجربي مرة ثانية.");
  }

  const res = await fetch("/api/report-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`PDF failed: ${res.status} ${msg}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "hima-dira-report.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function updateDashboard(ui) {
  $("score").textContent = Number.isFinite(ui.score) ? `${ui.score} / 100` : "—";
  $("classif").textContent = ui.classification || "—";
  $("gHigh").textContent = String(ui.high ?? "—");
  $("gMid").textContent = String(ui.mid ?? "—");
  $("gLow").textContent = String(ui.low ?? "—");
  $("out").textContent = pretty(ui.raw);
}

function setBusy(isBusy) {
  $("btnAnalyze").disabled = isBusy;
  $("btnPdf").disabled = isBusy;
  $("btnClear").disabled = isBusy;
}

$("btnAnalyze").addEventListener("click", async () => {
  const text = String($("text").value || "").trim();
  const useMock = $("useMock").checked;

  if (!text) {
    setStatus("اكتبي/الصقي نص أولًا");
    return;
  }

  try {
    setBusy(true);
    setStatus(useMock ? "تشغيل المحاكاة..." : "تحليل عبر API...");
    const data = await callAnalyze(text, useMock);
    const ui = normalizeForUI(data);
    updateDashboard(ui);
    setStatus("تم ✅");
  } catch (e) {
    setStatus("خطأ ❌");
    $("out").textContent = String(e?.message || e);
  } finally {
    setBusy(false);
  }
});

$("btnPdf").addEventListener("click", async () => {
  const text = String($("text").value || "").trim();
  const useMock = $("useMock").checked;

  if (!text) {
    setStatus("اكتبي/الصقي نص أولًا");
    return;
  }

  try {
    setBusy(true);
    setStatus("تجهيز PDF...");
    await downloadPdf(text, useMock);
    setStatus("تم تنزيل PDF ✅");
  } catch (e) {
    setStatus("تعذّر التنزيل");
    $("out").textContent = String(e?.message || e);
  } finally {
    setBusy(false);
  }
});

$("btnClear").addEventListener("click", () => {
  $("text").value = "";
  $("out").textContent = "—";
  $("score").textContent = "—";
  $("classif").textContent = "—";
  $("gHigh").textContent = "—";
  $("gMid").textContent = "—";
  $("gLow").textContent = "—";
  setStatus("تم المسح");
});

$("useMock").addEventListener("change", () => {
  setStatus($("useMock").checked ? "المحاكاة مفعلة" : "المحاكاة مطفّية — استخدام API");
});
