const $ = (id) => document.getElementById(id);

const setStatus = (t) => { $("status").textContent = t || ""; };

const setScore = (score, classification) => {
  const n = Number.isFinite(Number(score)) ? Number(score) : null;
  $("scoreText").textContent = n === null ? "—" : `${n}`;
  $("ringValue").textContent = n === null ? "—" : `${n}`;
  $("classText").textContent = classification || "—";
};

const toPrettyText = (data) => {
  const lines = [];
  if (data?.details) lines.push(data.details);

  if (Array.isArray(data?.suggestions) && data.suggestions.length) {
    lines.push("\nاقتراحات:");
    data.suggestions.forEach((s, i) => {
      const topic = s.topic ? ` (${s.topic})` : "";
      lines.push(`${i+1})${topic}`);
      if (s.before) lines.push(`قبل: ${s.before}`);
      if (s.after) lines.push(`بعد: ${s.after}`);
      if (s.reason) lines.push(`السبب: ${s.reason}`);
      lines.push("");
    });
  }

  if (Array.isArray(data?.observations) && data.observations.length) {
    lines.push("\nملاحظات:");
    data.observations.forEach((o) => lines.push(`• ${o.area || "عام"}: ${o.text || ""}`));
  }

  return lines.join("\n").trim() || "—";
};

async function postJSON(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const ct = res.headers.get("content-type") || "";
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = ct.includes("application/json") ? await res.json() : await res.text();
      msg = err?.error || err?.message || msg;
    } catch {}
    throw new Error(msg);
  }

  if (ct.includes("application/json")) return await res.json();
  return await res.text();
}

// Tabs
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    $("out").classList.toggle("hidden", tab !== "out");
    $("json").classList.toggle("hidden", tab !== "json");
  });
});

$("btnClear").addEventListener("click", () => {
  $("inputText").value = "";
  $("out").textContent = "";
  $("json").textContent = "";
  setScore(null, null);
  $("miniSummary").textContent = "—";
  $("miniActions").textContent = "—";
  setStatus("");
});

$("btnAnalyze").addEventListener("click", async () => {
  const text = String($("inputText").value || "").trim();
  if (!text) return setStatus("اكتبي/الصقي النص أولاً.");

  try {
    setStatus("جاري التحليل...");
    const data = await postJSON("/api/analyze", { text });

    // نتوقع شكل normalized من endpoint
    setScore(data?.score ?? "—", data?.classification ?? "—");
    $("miniSummary").textContent = Array.isArray(data?.executive_summary) ? `${data.executive_summary.length} نقاط` : "—";
    $("miniActions").textContent = Array.isArray(data?.recommended_actions) ? `${data.recommended_actions.length} توصيات` : "—";

    $("out").textContent = toPrettyText({
      details: data?.details || (Array.isArray(data?.executive_summary) ? data.executive_summary.join("\n") : ""),
      suggestions: data?.rewrite_suggestions || data?.suggestions || [],
      observations: data?.observations || [],
    });

    $("json").textContent = JSON.stringify(data, null, 2);
    setStatus("تم التحليل ✅");
  } catch (e) {
    setStatus("خطأ: " + (e?.message || e));
  }
});

$("btnPdf").addEventListener("click", async () => {
  const text = String($("inputText").value || "").trim();
  if (!text) return setStatus("اكتبي/الصقي النص أولاً.");

  try {
    setStatus("جاري إنشاء PDF...");
    const res = await fetch("/api/report-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || `HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hima-report.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus("تم تنزيل التقرير ✅");
  } catch (e) {
    setStatus("خطأ: " + (e?.message || e));
  }
});
