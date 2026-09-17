// EXPORT PDF (F8) — html2pdf is dynamically imported so it stays out of the
// initial bundle until the operator actually exports a dossier.
//
// html2pdf can leave its `.html2pdf__overlay` progress element behind on some
// code paths; that element intercepts pointer events and would lock the UI, so
// we always clean it up (and css also makes it pointer-events:none).

function clearOverlay() {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".html2pdf__overlay").forEach((n) => {
    try {
      n.remove();
    } catch (err) {
      /* ignore */
    }
  });
}

export async function exportElementToPdf(el, filename) {
  if (!el) throw new Error("nothing to export");
  const mod = await import("html2pdf.js");
  const html2pdf = mod.default || mod;
  const opts = {
    margin: [10, 10, 12, 10],
    filename: filename || "nirakshan-dossier.pdf",
    image: { type: "jpeg", quality: 0.95 },
    html2canvas: { scale: 2, backgroundColor: "#05080f", useCORS: true, logging: false },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"] },
  };

  const work = html2pdf().set(opts).from(el).save();
  const guard = new Promise((_, reject) => setTimeout(() => reject(new Error("export timed out")), 60000));
  try {
    return await Promise.race([work, guard]);
  } finally {
    clearOverlay();
  }
}
