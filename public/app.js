const $ = (id) => document.getElementById(id);

async function postJSON(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return res;
}

$("btnAnalyze").addEventListener("click", async () => {
  try {
    $("out").textContent = "جاري التحليل...";
    const text = $("text").value.trim();
    if (!text) return ($("out").textContent = "اكتبي نص أولاً.");

    const res = await postJSON("/api/analyze", { text });
    const data = await res.json();
    $("out").textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    $("out").textContent = "خطأ: " + (e?.message || e);
  }
});

$("btnPdf").addEventListener("click", async () => {
  try {
    $("out").textContent = "جاري تجهيز PDF...";
    const text = $("text").value.trim();
    if (!text) return ($("out").textContent = "اكتبي نص أولاً.");

    const res = await postJSON("/api/report-pdf", { text });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hima-report.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    $("out").textContent = "تم تنزيل التقرير ✅";
  } catch (e) {
    $("out").textContent = "خطأ: " + (e?.message || e);
  }
});
